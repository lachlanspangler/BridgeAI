/**
 * Renderer: Timeline → mp4. Draws every frame with the pure compositor on @napi-rs/canvas, pipes raw RGBA into
 * ffmpeg (H.264 yuv420p, CRF 20, -tune animation, AAC 160k 48 kHz, +faststart) together with the mixed audio
 * and an optional soft subtitle track (mov_text). ADR 0002.
 */
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Asset, Timeline } from '../../core/schema.ts';
import { drawFrame, type FrameOptions } from '../../core/scenes/frame.ts';
import type { Ctx, Img } from '../../core/scenes/kit.ts';
import { ensureFonts } from '../fonts.ts';
import { requireFfmpeg, runFfmpeg } from '../ffmpeg.ts';

export interface RenderOptions extends FrameOptions {
  out: string;
  audioWav: string;
  /** SRT file to embed as a soft subtitle track. */
  srt?: string;
  jobDir: string;
  assets: Asset[];
  preset?: 'ultrafast' | 'veryfast' | 'fast' | 'medium';
  crf?: number;
  onProgress?: (frame: number, total: number) => void;
  signal?: AbortSignal;
}

export async function loadAssets(jobDir: string, assets: Asset[]): Promise<Map<string, Img>> {
  const out = new Map<string, Img>();
  for (const a of assets) {
    try {
      const img: Image = await loadImage(resolve(jobDir, a.path));
      out.set(a.id, { image: img as unknown as CanvasImageSource, width: img.width, height: img.height });
    } catch {
      /* a missing asset renders as a statement fallback */
    }
  }
  return out;
}

export async function renderVideo(
  tl: Timeline,
  opts: RenderOptions,
): Promise<{ frames: number; ms: number }> {
  ensureFonts();
  const ff = requireFfmpeg();
  const totalFrames = Math.ceil(tl.duration * tl.fps);
  const { workerCount } = await import('./parts.ts');
  const n = workerCount(totalFrames);
  if (n > 1) return renderParallel(tl, opts, totalFrames, n);
  const assets = await loadAssets(opts.jobDir, opts.assets);
  const W = tl.width;
  const H = tl.height;
  const total = totalFrames;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as Ctx;
  const args = [
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
    String(tl.fps),
    '-i',
    '-',
    '-i',
    opts.audioWav,
  ];
  if (opts.srt) args.push('-i', opts.srt);
  args.push('-map', '0:v', '-map', '1:a');
  if (opts.srt) args.push('-map', '2:s', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng');
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    opts.preset ?? 'fast',
    '-crf',
    String(opts.crf ?? 20),
    '-tune',
    'animation',
    '-pix_fmt',
    'yuv420p',
    '-g',
    String(tl.fps * 2),
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    '-t',
    tl.duration.toFixed(3),
    opts.out,
  );
  const t0 = performance.now();
  const p = spawn(ff.ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-4000)));
  const closed = new Promise<number>((resolve, reject) => {
    p.on('error', reject);
    p.on('close', (code) => resolve(code ?? -1));
  });
  try {
    for (let f = 0; f < total; f++) {
      if (opts.signal?.aborted) throw new Error('render cancelled');
      drawFrame(ctx, tl, f / tl.fps, assets, opts);
      const buf = canvas.data();
      if (!p.stdin.write(buf)) await new Promise<void>((r) => p.stdin.once('drain', () => r()));
      if (f % 15 === 0) opts.onProgress?.(f, total);
    }
  } finally {
    p.stdin.end();
  }
  const code = await closed;
  if (code !== 0) throw new Error(`ffmpeg exited ${code}: ${err.trim()}`);
  opts.onProgress?.(total, total);
  return { frames: total, ms: Math.round(performance.now() - t0) };
}

/** Render one still (PNG bytes) at time t, for golden tests, thumbnails and previews. */
export async function renderStill(
  tl: Timeline,
  t: number,
  jobDir: string,
  assets: Asset[],
  opts: FrameOptions,
): Promise<Buffer> {
  ensureFonts();
  const imgs = await loadAssets(jobDir, assets);
  const canvas = createCanvas(tl.width, tl.height);
  drawFrame(canvas.getContext('2d') as unknown as Ctx, tl, t, imgs, opts);
  return canvas.toBuffer('image/png');
}

/** Long videos: parallel parts, then a lossless concat muxed with audio (+ subtitles). */
async function renderParallel(
  tl: Timeline,
  opts: RenderOptions,
  total: number,
  n: number,
): Promise<{ frames: number; ms: number }> {
  const t0 = performance.now();
  const { renderParts } = await import('./parts.ts');
  const tmp = join(opts.jobDir, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const frame: FrameOptions = {
    burnCaptions: opts.burnCaptions,
    origin: opts.origin,
    engine: opts.engine,
    kicker: opts.kicker,
  };
  const parts = await renderParts(
    {
      tl,
      jobDir: opts.jobDir,
      assets: opts.assets,
      frame,
      preset: opts.preset ?? 'fast',
      crf: opts.crf ?? 20,
    },
    total,
    n,
    tmp,
    (done) => opts.onProgress?.(Math.min(done, total - 1), total),
    opts.signal,
  );
  const list = join(tmp, 'parts.txt');
  writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  const args = ['-f', 'concat', '-safe', '0', '-i', list, '-i', opts.audioWav];
  if (opts.srt) args.push('-i', opts.srt);
  args.push('-map', '0:v', '-map', '1:a');
  if (opts.srt) args.push('-map', '2:s', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng');
  args.push(
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    '-t',
    tl.duration.toFixed(3),
    opts.out,
  );
  await runFfmpeg(args);
  opts.onProgress?.(total, total);
  return { frames: total, ms: Math.round(performance.now() - t0) };
}
