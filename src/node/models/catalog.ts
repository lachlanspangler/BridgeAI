/**
 * Local model catalog and the disk guard. All local models together stay ≤ 8 GB (hard rule); every download
 * checks free disk first and refuses if it would leave < 4 GB free.
 */
import { existsSync, readdirSync, statSync, statfsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadConfig } from '../config.ts';
import { paths } from '../paths.ts';

export interface ModelSpec {
  id: string;
  kind: 'llm' | 'tts' | 'stt';
  label: string;
  url: string;
  file: string;
  bytes: number;
  licence: string;
  sha256?: string;
}

/** Default local LLM (MODELS.md): Qwen3.5-4B Q4_K_M, Apache-2.0, 2.74 GB. Low-RAM fallback: Qwen3.5-2B. */
export const LLM_MODELS: ModelSpec[] = [
  {
    id: 'qwen3.5-4b-q4_k_m',
    kind: 'llm',
    label: 'Qwen3.5 4B (Q4_K_M)',
    url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf',
    file: 'Qwen3.5-4B-Q4_K_M.gguf',
    bytes: 2_740_937_888,
    licence: 'Apache-2.0',
  },
  {
    id: 'qwen3.5-2b-q4_k_m',
    kind: 'llm',
    label: 'Qwen3.5 2B (Q4_K_M, low RAM)',
    url: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf',
    file: 'Qwen3.5-2B-Q4_K_M.gguf',
    bytes: 1_280_835_840,
    licence: 'Apache-2.0',
  },
];

export const MODEL_BUDGET_BYTES = 8 * 1024 ** 3;
export const MIN_FREE_AFTER_BYTES = 4 * 1024 ** 3;

export function freeDiskBytes(dir = paths.home()): number {
  try {
    const s = statfsSync(existsSync(dir) ? dir : process.cwd());
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return NaN;
  }
}

function dirBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) n += dirBytes(p);
    else if (e.isFile()) n += statSync(p).size;
  }
  return n;
}

/** Bytes used by models Bridge owns (in ~/.bridge/models) plus linked files outside it. */
export function modelBytes(): { owned: number; linked: number } {
  const cfg = loadConfig();
  const linked =
    cfg.llm.path && existsSync(cfg.llm.path) && !cfg.llm.path.startsWith(paths.models())
      ? statSync(cfg.llm.path).size
      : 0;
  return { owned: dirBytes(paths.models()), linked };
}

export function canDownload(bytes: number): { ok: boolean; reason?: string } {
  const free = freeDiskBytes();
  const used = modelBytes().owned;
  if (used + bytes > MODEL_BUDGET_BYTES)
    return {
      ok: false,
      reason: `would exceed the ${MODEL_BUDGET_BYTES / 1024 ** 3} GB model budget (${(used / 1024 ** 3).toFixed(1)} GB used)`,
    };
  if (Number.isFinite(free) && free - bytes < MIN_FREE_AFTER_BYTES)
    return {
      ok: false,
      reason: `only ${(free / 1024 ** 3).toFixed(1)} GB free; need ${((bytes + MIN_FREE_AFTER_BYTES) / 1024 ** 3).toFixed(1)} GB`,
    };
  return { ok: true };
}

/** Find the local LLM: BRIDGE_LLM_GGUF, then config (`bridge models link`), then ~/.bridge/models/llm/*.gguf. */
export function findLocalLlm(): { path: string; id: string } | null {
  const env = process.env.BRIDGE_LLM_GGUF;
  if (env && existsSync(env)) return { path: env, id: idFor(env) };
  const cfg = loadConfig();
  if (cfg.llm.path && existsSync(cfg.llm.path))
    return { path: cfg.llm.path, id: cfg.llm.id ?? idFor(cfg.llm.path) };
  const dir = paths.llm();
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter((f) => f.endsWith('.gguf'));
    const pref = LLM_MODELS.map((m) => m.file).find((f) => files.includes(f)) ?? files[0];
    if (pref) return { path: join(dir, pref), id: idFor(pref) };
  }
  return null;
}

const idFor = (p: string) => basename(p, '.gguf').toLowerCase();
