/** Find ffmpeg/ffprobe: BRIDGE_FFMPEG, then the system PATH, then the optional `ffmpeg-static` npm binary. */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

export interface FfmpegInfo {
  ffmpeg: string;
  ffprobe: string | null;
  version: string;
  source: 'env' | 'system' | 'ffmpeg-static';
}

let cached: FfmpegInfo | null | undefined;

function versionOf(bin: string): string | null {
  try {
    const r = spawnSync(bin, ['-version'], { encoding: 'utf8', timeout: 10_000 });
    if (r.status !== 0) return null;
    return (r.stdout.split('\n')[0] ?? '').replace(/^ffmpeg version\s*/, '').split(' ')[0] ?? 'unknown';
  } catch {
    return null;
  }
}

export function findFfmpeg(): FfmpegInfo | null {
  if (cached !== undefined) return cached;
  const env = process.env.BRIDGE_FFMPEG;
  if (env) {
    const v = versionOf(env);
    if (v) return (cached = { ffmpeg: env, ffprobe: process.env.BRIDGE_FFPROBE ?? null, version: v, source: 'env' });
  }
  const sys = versionOf('ffmpeg');
  if (sys) return (cached = { ffmpeg: 'ffmpeg', ffprobe: versionOf('ffprobe') ? 'ffprobe' : null, version: sys, source: 'system' });
  try {
    const require = createRequire(import.meta.url);
    const p = require('ffmpeg-static') as string | null;
    if (p) {
      const v = versionOf(p);
      if (v) return (cached = { ffmpeg: p, ffprobe: null, version: v, source: 'ffmpeg-static' });
    }
  } catch {
    /* optional dependency not installed */
  }
  return (cached = null);
}

export function requireFfmpeg(): FfmpegInfo {
  const f = findFfmpeg();
  if (!f) throw new Error('ffmpeg not found. Install it (macOS: brew install ffmpeg · Windows: winget install ffmpeg · Linux: apt install ffmpeg) or run `npm install ffmpeg-static`. Then `make doctor`.');
  return f;
}

/** Run ffmpeg with args; resolves on exit 0, rejects with stderr tail otherwise. */
export function runFfmpeg(args: string[], opts: { input?: Buffer } = {}): Promise<void> {
  const f = requireFfmpeg();
  return new Promise((resolve, reject) => {
    const p = spawn(f.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d: Buffer) => (err = (err + d.toString()).slice(-4000)));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.trim()}`))));
    if (opts.input) p.stdin.end(opts.input);
    else p.stdin.end();
  });
}

/** Duration of a media file in seconds (ffprobe, else ffmpeg's stderr). */
export function probeDuration(file: string): number {
  const f = requireFfmpeg();
  if (f.ffprobe) {
    const r = spawnSync(f.ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
    const d = Number(r.stdout.trim());
    if (Number.isFinite(d)) return d;
  }
  const r = spawnSync(f.ffmpeg, ['-i', file], { encoding: 'utf8' });
  const m = r.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
}
