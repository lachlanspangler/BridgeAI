/**
 * Model downloads with the disk guard: checks free space and the 8 GB budget first, downloads to a .part file
 * with HTTP Range resume, then renames. Public URLs only (Hugging Face); no credentials are ever sent.
 */
import { createWriteStream, existsSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ensureDir, paths } from '../paths.ts';
import { canDownload, LLM_MODELS, type ModelSpec } from './catalog.ts';

export async function downloadModel(
  spec: ModelSpec,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<string> {
  const dir = ensureDir(paths.llm());
  const dest = join(dir, spec.file);
  if (existsSync(dest) && statSync(dest).size === spec.bytes) return dest;
  const part = `${dest}.part`;
  const have = existsSync(part) ? statSync(part).size : 0;
  const guard = canDownload(spec.bytes - have);
  if (!guard.ok) throw new Error(`not downloading ${spec.label}: ${guard.reason}`);
  const res = await fetch(spec.url, { headers: have ? { range: `bytes=${have}-` } : {}, redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
  const resumed = res.status === 206;
  const total = spec.bytes;
  let done = resumed ? have : 0;
  const body = Readable.fromWeb(res.body as never);
  body.on('data', (c: Buffer) => {
    done += c.length;
    onProgress(done, total);
  });
  await pipeline(body, createWriteStream(part, { flags: resumed ? 'a' : 'w' }));
  const size = statSync(part).size;
  if (size !== spec.bytes)
    throw new Error(`download incomplete (${size} of ${spec.bytes} bytes); run it again to resume`);
  renameSync(part, dest);
  return dest;
}

export const defaultLlm = (): ModelSpec => LLM_MODELS[0]!;
