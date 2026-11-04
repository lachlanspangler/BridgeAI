/** BYOK provider contracts against recorded response shapes (no network, no real keys). */
import { afterAll, describe, expect, it } from 'vitest';
import { setFetch } from '../../src/node/llm/http.ts';
import {
  AnthropicLlm,
  GeminiLlm,
  OpenAiCompatibleLlm,
  toGeminiSchema,
} from '../../src/node/llm/providers.ts';
import { ElevenLabsTts, wordsFromChars } from '../../src/node/tts/cloud.ts';
import { scriptSchema } from '../../src/core/llm/schemas.ts';
import { attention } from '../core/fixtures.ts';

const k = (p: string) => [p, 'x'.repeat(40)].join('');
const schema = {
  type: 'object',
  properties: { ok: { type: 'string' } },
  required: ['ok'],
  additionalProperties: false,
};
let last: { url: string; body: Record<string, unknown> } | null = null;
const respond = (body: unknown) =>
  setFetch((async (url: string, init: RequestInit) => {
    last = { url, body: JSON.parse(String(init.body)) as Record<string, unknown> };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch);
afterAll(() => setFetch(fetch));

describe('provider contracts', () => {
  it('Anthropic: forces the tool and reads tool_use input', async () => {
    respond({ content: [{ type: 'tool_use', name: 'x', input: { ok: 'yes' } }] });
    const r = await new AnthropicLlm(k('sk-ant-')).json<{ ok: string }>({
      system: 's',
      user: 'u',
      schema,
      name: 'x',
    });
    expect(r.ok).toBe('yes');
    expect(last!.body.tool_choice).toEqual({ type: 'tool', name: 'x' });
    expect(last!.body.model).toBe('claude-sonnet-5-5');
  });
  it('OpenAI: strict json_schema with anyOf; parses message content', async () => {
    respond({ choices: [{ message: { content: '{"ok":"yes"}' } }] });
    const r = await new OpenAiCompatibleLlm('openai', k('sk-proj-'), 'gpt-6.1-terra').json<{ ok: string }>({
      system: 's',
      user: 'u',
      schema: scriptSchema(attention(), 3),
      name: 'script',
    });
    expect(r.ok).toBe('yes');
    const rf = last!.body.response_format as { json_schema: { strict: boolean; schema: unknown } };
    expect(rf.json_schema.strict).toBe(true);
    expect(JSON.stringify(rf.json_schema.schema)).not.toContain('oneOf');
  });
  it('OpenRouter: same shape, its own host, attribution headers', async () => {
    respond({ choices: [{ message: { content: '```json\n{"ok":"yes"}\n```' } }] });
    const r = await new OpenAiCompatibleLlm('openrouter', k('sk-or-v1-'), 'openrouter/auto').json<{
      ok: string;
    }>({ system: 's', user: 'u', schema, name: 'x' });
    expect(r.ok).toBe('yes');
    expect(last!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
  });
  it('OpenAI refusals surface as errors', async () => {
    respond({ choices: [{ message: { content: null, refusal: 'no' } }] });
    await expect(
      new OpenAiCompatibleLlm('openai', k('sk-proj-'), 'm').json({
        system: 's',
        user: 'u',
        schema,
        name: 'x',
      }),
    ).rejects.toThrow(/refused/);
  });
  it('Gemini: responseSchema without additionalProperties/const/oneOf; reads candidate text', async () => {
    respond({ candidates: [{ content: { parts: [{ text: '{"ok":"yes"}' }] } }] });
    const r = await new GeminiLlm('AIza' + 'x'.repeat(35)).json<{ ok: string }>({
      system: 's',
      user: 'u',
      schema: scriptSchema(attention(), 3),
      name: 'x',
    });
    expect(r.ok).toBe('yes');
    const gs = JSON.stringify((last!.body.generationConfig as { responseSchema: unknown }).responseSchema);
    expect(gs).not.toMatch(/additionalProperties|"const"|oneOf/);
    expect(JSON.stringify(toGeminiSchema({ const: 'a' }))).toBe('{"enum":["a"]}');
  });
  it('ElevenLabs: PCM + character alignment → word timings', async () => {
    const pcm = Buffer.alloc(4800);
    respond({
      audio_base64: pcm.toString('base64'),
      alignment: {
        characters: [...'hi you'],
        character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
        character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
      },
    });
    const c = await new ElevenLabsTts(k('sk_')).synthesize('hi you', {});
    expect(c.sampleRate).toBe(24000);
    expect(c.samples.length).toBe(2400);
    expect(c.words).toEqual([
      { word: 'hi', start: 0, end: 0.2 },
      { word: 'you', start: 0.3, end: 0.6 },
    ]);
    expect(wordsFromChars([], [], [])).toEqual([]);
  });
});
