/**
 * Fast visual iteration: re-draw stills from a job's timeline.json with the CURRENT scene code (no model, no
 * TTS, no encode). Writes artifacts/stills/<job>/tNNNNNN.png + contact.jpg.
 *   npx tsx scripts/stills.ts <jobDir> [--every 1] [--at 1.2,3.4]
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Source, Timeline } from '../src/core/schema.ts';
import { renderStill } from '../src/node/render/render.ts';

const args = process.argv.slice(2);
const job = args[0]!;
const flag = (k: string) => (args.indexOf(`--${k}`) >= 0 ? args[args.indexOf(`--${k}`) + 1] : undefined);
const tl = JSON.parse(readFileSync(join(job, 'timeline.json'), 'utf8')) as Timeline;
const src = JSON.parse(readFileSync(join(job, 'source.json'), 'utf8')) as Source;
const every = Number(flag('every') ?? 1);
const times = flag('at') ? flag('at')!.split(',').map(Number) : Array.from({ length: Math.floor(tl.duration / every) }, (_, i) => 0.5 + i * every).filter((t) => t < tl.duration);
const out = join('artifacts/stills', basename(job));
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) rmSync(join(out, f));
const kicker = src.kind === 'pdf' ? 'Paper' : src.kind === 'project' ? 'Project' : 'Explained';
for (const t of times) writeFileSync(join(out, `t${String(Math.round(t * 1000)).padStart(6, '0')}.png`), await renderStill(tl, t, job, src.assets, { burnCaptions: true, origin: src.origin, kicker }));
const files = readdirSync(out).filter((f) => f.endsWith('.png')).sort();
const cols = Math.min(5, files.length);
const w = 384, h = 216;
const sheet = createCanvas(cols * w, Math.ceil(files.length / cols) * (h + 18));
const c = sheet.getContext('2d');
c.fillStyle = '#fff';
c.fillRect(0, 0, sheet.width, sheet.height);
for (const [i, f] of files.entries()) {
  const im = await loadImage(join(out, f));
  const x = (i % cols) * w, y = Math.floor(i / cols) * (h + 18);
  c.fillStyle = '#333';
  c.font = '14px sans-serif';
  c.fillText(`${(Number(f.slice(1, 7)) / 1000).toFixed(1)} s`, x + 4, y + 13);
  c.drawImage(im, x, y + 16, w - 4, h - 4);
}
writeFileSync(join(out, 'contact.jpg'), sheet.toBuffer('image/jpeg', 80));
console.log(`${out} (${files.length} stills)`);
