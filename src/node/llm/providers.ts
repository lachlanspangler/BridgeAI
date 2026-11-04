/**
 * Bring-your-own-key LLM providers. Each returns structured JSON for a schema using the provider's native
 * mechanism (Anthropic tool use, OpenAI/OpenRouter strict json_schema, Gemini responseSchema), then the
 * result is validated by Bridge's own parsers. Default models from docs/research/MODELS.md.
 */
import { toOpenAiSchema, type JsonSchema } from '../../core/llm/schemas.ts';
import { getKey, type ProviderId } from '../keys/keystore.ts';
import { providerFetch } from './http.ts';
import { LlmError, type JsonRequest, type LlmProvider } from './types.ts';

export const DEFAULT_MODELS: Record<'anthropic' | 'openai' | 'gemini' | 'openrouter', string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-6.1-terra',
  gemini: 'gemini-3.8-flash',
  openrouter: 'openrouter/auto',
};

function parseJson(text: string, p: string): unknown {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/, '')
    .replace(/```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new LlmError(`${p} returned non-JSON output`, p, true);
  }
}

export class AnthropicLlm implements LlmProvider {
  readonly id = 'anthropic';
  readonly locality = 'cloud' as const;
  constructor(
    private readonly key: string,
    readonly model = DEFAULT_MODELS.anthropic,
  ) {}
  async json<T>(req: JsonRequest): Promise<T> {
    const res = await providerFetch('anthropic', this.key, 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: req.signal,
      body: JSON.stringify({
        model: this.model,
        max_tokens: Math.max(1024, req.maxTokens ?? 4096),
        temperature: req.temperature ?? 0.3,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
        tools: [
          {
            name: req.name,
            description: `Return the ${req.name} as structured data.`,
            input_schema: req.schema,
          },
        ],
        tool_choice: { type: 'tool', name: req.name },
      }),
    });
    const j = (await res.json()) as { content?: { type: string; input?: unknown; text?: string }[] };
    const tool = j.content?.find((c) => c.type === 'tool_use');
    if (tool?.input) return tool.input as T;
    const text = j.content?.find((c) => c.type === 'text')?.text;
    if (text) return parseJson(text, this.id) as T;
    throw new LlmError('anthropic returned no tool output', this.id, true);
  }
}

/** OpenAI and OpenRouter share the Chat Completions shape. */
export class OpenAiCompatibleLlm implements LlmProvider {
  readonly locality = 'cloud' as const;
  constructor(
    readonly id: 'openai' | 'openrouter',
    private readonly key: string,
    readonly model: string,
  ) {}
  async json<T>(req: JsonRequest): Promise<T> {
    const url =
      this.id === 'openai'
        ? 'https://api.openai.com/v1/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions';
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.id === 'openrouter') {
      headers['http-referer'] = 'https://github.com/lachlanspangler/bridge';
      headers['x-title'] = 'Bridge';
    }
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      temperature: req.temperature ?? 0.3,
      max_completion_tokens: req.maxTokens ?? 4096,
      response_format: {
        type: 'json_schema',
        json_schema: { name: req.name, strict: true, schema: toOpenAiSchema(req.schema) },
      },
    };
    const res = await providerFetch(this.id, this.key, url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: req.signal,
    });
    const j = (await res.json()) as {
      choices?: { message?: { content?: string | null; refusal?: string | null } }[];
    };
    const msg = j.choices?.[0]?.message;
    if (msg?.refusal) throw new LlmError(`${this.id} refused: ${msg.refusal}`, this.id);
    if (!msg?.content) throw new LlmError(`${this.id} returned an empty message`, this.id, true);
    return parseJson(msg.content, this.id) as T;
  }
}

/** Gemini's responseSchema is an OpenAPI subset: no additionalProperties/const/oneOf. */
export function toGeminiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== 'object') return s;
  const o = s as JsonSchema;
  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'additionalProperties' || k === 'description') continue;
    if (k === 'const') {
      out.enum = [v];
      continue;
    }
    if (k === 'oneOf') {
      out.anyOf = toGeminiSchema(v);
      continue;
    }
    out[k] = toGeminiSchema(v);
  }
  return out;
}

export class GeminiLlm implements LlmProvider {
  readonly id = 'gemini';
  readonly locality = 'cloud' as const;
  constructor(
    private readonly key: string,
    readonly model = DEFAULT_MODELS.gemini,
  ) {}
  async json<T>(req: JsonRequest): Promise<T> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const res = await providerFetch('gemini', this.key, url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: req.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: {
          temperature: req.temperature ?? 0.3,
          maxOutputTokens: req.maxTokens ?? 4096,
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(req.schema),
        },
      }),
    });
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
    if (!text) throw new LlmError('gemini returned no text', this.id, true);
    return parseJson(text, this.id) as T;
  }
}

/** Build a configured provider from the keystore (or null if there's no key). `id` may be "openrouter:model/slug". */
export async function providerFromKeys(spec: string): Promise<LlmProvider | null> {
  const [id, ...rest] = spec.split(':');
  const model = rest.join(':') || undefined;
  if (!id || !['anthropic', 'openai', 'gemini', 'openrouter'].includes(id)) return null;
  const key = await getKey(id as ProviderId);
  if (!key) return null;
  switch (id) {
    case 'anthropic':
      return new AnthropicLlm(key, model);
    case 'openai':
      return new OpenAiCompatibleLlm('openai', key, model ?? DEFAULT_MODELS.openai);
    case 'openrouter':
      return new OpenAiCompatibleLlm('openrouter', key, model ?? DEFAULT_MODELS.openrouter);
    case 'gemini':
      return new GeminiLlm(key, model);
  }
  return null;
}
