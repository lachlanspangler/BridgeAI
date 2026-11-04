/**
 * Pick engines for a render. "auto" = the free local path: local LLM if a model is present, else the
 * extractive floor; Kokoro if available, else the system voice. A provider id picks that BYOK provider.
 */
import { aiEngines, extractiveEngines, type AiLog } from './engines.ts';
import { LocalLlm } from './llm/local.ts';
import type { LlmProvider } from './llm/types.ts';
import { findLocalLlm } from './models/catalog.ts';
import type { Engines } from './pipeline.ts';
import { KokoroTts } from './tts/kokoro.ts';
import { SystemTts } from './tts/system.ts';
import type { TtsEngine } from './tts/types.ts';

let local: LocalLlm | null = null;

export function localLlm(): LocalLlm | null {
  const m = findLocalLlm();
  if (!m) return null;
  if (!local || local.model !== m.id) local = new LocalLlm({ modelPath: m.path, modelId: m.id });
  return local;
}

export type ProviderFactory = (id: string) => Promise<LlmProvider | null>;
export type TtsFactory = (id: string) => Promise<TtsEngine | null>;

export async function pickTts(id: string, cloud?: TtsFactory): Promise<TtsEngine> {
  if (id !== 'auto' && id !== 'kokoro' && id !== 'system' && cloud) {
    const t = await cloud(id);
    if (t) return t;
  }
  if (id === 'system') return new SystemTts();
  const k = new KokoroTts();
  if (await k.available()) return k;
  return new SystemTts();
}

export async function pickEngines(opts: {
  llm: string;
  tts: string;
  log?: AiLog;
  providers?: ProviderFactory;
  voices?: TtsFactory;
}): Promise<{ engines: Engines; label: string }> {
  const tts = await pickTts(opts.tts, opts.voices);
  if (opts.llm === 'extractive') return { engines: extractiveEngines(tts), label: 'extractive' };
  if (opts.llm === 'auto' || opts.llm === 'local') {
    const l = localLlm();
    if (l) return { engines: aiEngines(l, tts, opts.log), label: `local:${l.model}` };
    if (opts.llm === 'local')
      throw new Error(
        'no local model found: run `make models` (downloads Qwen3.5-4B, 2.7 GB) or `bridge models link <file.gguf>`',
      );
    return { engines: extractiveEngines(tts), label: 'extractive' };
  }
  const p = opts.providers ? await opts.providers(opts.llm) : null;
  if (!p)
    throw new Error(
      `provider "${opts.llm}" is not configured: add a key in Settings or run \`bridge keys set ${opts.llm}\``,
    );
  return { engines: aiEngines(p, tts, opts.log), label: `${p.id}:${p.model}` };
}
