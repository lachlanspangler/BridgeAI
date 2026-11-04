/**
 * Review a rendered video the way a person would: stills at regular times + a labelled contact sheet, a
 * waveform image, loudness stats, and a whisper transcript (if whisper-cli is installed) compared against
 * the script. Output: artifacts/frames/<name>/
 *   npx tsx scripts/frames.ts <video.mp4> [--every 1.0] [--at 0.5,2,4] [--job <jobDir>]
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { coverage } from '../src/core/text/text.ts';
import { probeDuration, requireFfmpeg } from '../src/node/ffmpeg.ts';

const args = process.argv.slice(2);
const flag = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const video = args[0];
if (!video || !existsSync(video)) throw new Error('usage: frames.ts <video.mp4>');
const ff = requireFfmpeg().ffmpeg;
const name = basename(video, '.mp4');
const out = join('artifacts/frames', name);
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) rmSync(join(out, f), { force: true, recursive: true });
const dur = probeDuration(video);
const every = Number(flag('every') ?? (dur <= 25 ? 1 : dur <= 70 ? 3 : 10));
const times = flag('at')
  ? flag('at')!.split(',').map(Number)
  : Array.from({ length: Math.floor(dur / every) }, (_, i) => 0.5 + i * every).filter((t) => t < dur);

for (const t of times) {
  spawnSync(ff, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    t.toFixed(2),
    '-i',
    video,
    '-frames:v',
    '1',
    join(out, `t${String(Math.round(t * 1000)).padStart(6, '0')}.png`),
  ]);
}

// contact sheet
const files = readdirSync(out)
  .filter((f) => /^t\d+\.png$/.test(f))
  .sort();
const ims = await Promise.all(files.map((f) => loadImage(join(out, f))));
const cols = Math.min(5, ims.length);
const w = 384;
const h = 216;
const rows = Math.ceil(ims.length / cols);
const sheet = createCanvas(cols * w, 30 + rows * (h + 20));
const sc = sheet.getContext('2d');
sc.fillStyle = '#fff';
sc.fillRect(0, 0, sheet.width, sheet.height);
sc.fillStyle = '#000';
sc.font = '16px sans-serif';
sc.fillText(`${name} · ${dur.toFixed(1)} s`, 8, 20);
ims.forEach((im, i) => {
  const x = (i % cols) * w;
  const y = 30 + Math.floor(i / cols) * (h + 20);
  sc.fillStyle = '#555';
  sc.fillText(`${(Number(files[i]!.slice(1, 7)) / 1000).toFixed(1)} s`, x + 4, y + 15);
  sc.drawImage(im, x, y + 18, w - 4, h - 4);
});
writeFileSync(join(out, 'contact.jpg'), sheet.toBuffer('image/jpeg', 80));

// waveform + loudness
spawnSync(ff, [
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  '-i',
  video,
  '-filter_complex',
  'aformat=channel_layouts=mono,showwavespic=s=1600x240:colors=0x4CC9F0',
  '-frames:v',
  '1',
  join(out, 'waveform.png'),
]);
const ln = spawnSync(ff, ['-hide_banner', '-i', video, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {
  encoding: 'utf8',
});
const summary = ln.stderr.split('Summary:')[1] ?? '';
const I = summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1];
const peak = summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1];
const stats = [`duration ${dur.toFixed(2)} s`, `integrated ${I} LUFS`, `true peak ${peak} dBFS`];

// transcript (optional: whisper-cli + a ggml model)
const model = [
  process.env.BRIDGE_WHISPER_MODEL,
  join(homedir(), '.bridge/models/whisper/ggml-base.en.bin'),
  join(homedir(), 'Library/Application Support/LachedInAI/models/ggml-base.en.bin'),
].find((p) => p && existsSync(p));
const hasWhisper = spawnSync('whisper-cli', ['--help'], { stdio: 'ignore' }).status === 0;
if (model && hasWhisper) {
  const wav = join(out, 'audio16k.wav');
  spawnSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-ar', '16000', '-ac', '1', wav]);
  const r = spawnSync('whisper-cli', ['-m', model, '-f', wav, '-nt', '-np'], { encoding: 'utf8' });
  const transcript = r.stdout.replace(/\s+/g, ' ').trim();
  writeFileSync(join(out, 'transcript.txt'), transcript + '\n');
  rmSync(wav, { force: true });
  const job = flag('job');
  if (job && existsSync(join(job, 'script.json'))) {
    const script = JSON.parse(readFileSync(join(job, 'script.json'), 'utf8')) as {
      beats: { narration: string }[];
    };
    const said = script.beats.map((b) => b.narration).join(' ');
    stats.push(
      `transcript covers ${(coverage(said, transcript) * 100).toFixed(0)}% of the script's content words`,
    );
  }
} else stats.push('transcript: skipped (needs whisper-cli and a ggml model; see make doctor)');
writeFileSync(join(out, 'stats.txt'), stats.join('\n') + '\n');
console.log(`${out}\n  ${stats.join('\n  ')}\n  ${files.length} stills, contact.jpg, waveform.png`);
