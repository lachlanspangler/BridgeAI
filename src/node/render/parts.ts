/**
 * Parallel rendering for long videos: the frame range is split into N chunks, each drawn and encoded
 * (video only) by its own worker thread, then joined losslessly with ffmpeg's concat demuxer and muxed with
 * the audio and subtitles. Same encoder settings per chunk, so the joined stream is seamless.
 */
import { createCanvas } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import type { Asset, Timeline } from '../../core/schema.ts';
import { drawFrame, type FrameOptions } from '../../core/scenes/frame.ts';
import type { Ctx } from '../../core/scenes/kit.ts';
import { ensureFonts } from '../fonts.ts';
import { requireFfmpeg } from '../ffmpeg.ts';
import { loadAssets } from './render.ts';

export interface PartJob {
  tl: Timeline;
  from: number;
  to: number;
  out: string;
  jobDir: string;
  assets: Asset[];
  frame: FrameOptions;
  preset: string;
  crf: number;
}

/** Draw frames [from, to) and encode them to `out` (H.264 only). Reports progress per 15 frames. */
export async function encodeRange(j: PartJob, onFrame: (n: number) => void = () => {}): Promise<void> {
  ensureFonts();
  const ff = requireFfmpeg();
  const imgs = await loadAssets(j.jobDir, j.assets);
  const { width: W, height: H, fps } = j.tl;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as Ctx;
  const p = spawn(
    ff.ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${W}x${H}`,
      '-r',
      String(fps),
      '-i',
      '-',
      '-c:v',
      'libx264',
      '-preset',
      j.preset,
      '-crf',
      String(j.crf),
      '-tune',
      'animation',
      '-pix_fmt',
      'yuv420p',
      '-g',
      String(fps * 2),
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      j.out,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let err = '';
  p.stderr.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
  const closed = new Promise<number>((r, x) => (p.on('error', x), p.on('close', (c) => r(c ?? -1))));
  for (let f = j.from; f < j.to; f++) {
    drawFrame(ctx, j.tl, f / fps, imgs, j.frame);
    if (!p.stdin.write(canvas.data())) await new Promise<void>((r) => p.stdin.once('drain', () => r()));
    if ((f - j.from) % 15 === 0) onFrame(f - j.from);
  }
  p.stdin.end();
  const code = await closed;
  if (code !== 0) throw new Error(`ffmpeg (part) exited ${code}: ${err.trim()}`);
}

export function workerCount(totalFrames: number): number {
  const env = Number(process.env.BRIDGE_RENDER_WORKERS);
  if (Number.isFinite(env) && env >= 1) return Math.floor(env);
  if (totalFrames < 1200) return 1; // < 40 s: not worth the start-up cost
  return Math.max(1, Math.min(4, Math.floor(availableParallelism() / 3)));
}

/** Render all parts in parallel worker threads; returns the part files in order. */
export async function renderParts(
  base: Omit<PartJob, 'from' | 'to' | 'out'>,
  total: number,
  n: number,
  tmp: string,
  onProgress: (done: number) => void,
  signal?: AbortSignal,
): Promise<string[]> {
  const size = Math.ceil(total / n);
  const done = new Array<number>(n).fill(0);
  const outs: string[] = [];
  const runs = Array.from({ length: n }, (_, k) => {
    const from = k * size;
    const to = Math.min(total, from + size);
    const out = join(tmp, `part-${String(k).padStart(2, '0')}.mp4`);
    outs.push(out);
    return new Promise<void>((resolve, reject) => {
      const w = new Worker(new URL('./worker-boot.mjs', import.meta.url), {
        workerData: { ...base, from, to, out, __entry: import.meta.url },
      });
      const stop = () => void w.terminate();
      signal?.addEventListener('abort', stop);
      w.on('message', (m: { frames?: number; done?: boolean; error?: string }) => {
        if (m.error) reject(new Error(m.error));
        if (m.frames !== undefined) {
          done[k] = m.frames;
          onProgress(done.reduce((a, b) => a + b, 0));
        }
        if (m.done) resolve();
      });
      w.on('error', reject);
      w.on('exit', (c) => {
        signal?.removeEventListener('abort', stop);
        if (c !== 0) reject(new Error(signal?.aborted ? 'render cancelled' : `render worker exited ${c}`));
      });
    });
  });
  await Promise.all(runs);
  return outs;
}

if (!isMainThread && parentPort && (workerData as PartJob | undefined)?.out) {
  const j = workerData as PartJob;
  encodeRange(j, (n) => parentPort!.postMessage({ frames: n }))
    .then(() => parentPort!.postMessage({ frames: j.to - j.from, done: true }))
    .catch((e: unknown) => parentPort!.postMessage({ error: e instanceof Error ? e.message : String(e) }));
}
