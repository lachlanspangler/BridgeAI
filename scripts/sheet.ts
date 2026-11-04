/** Contact sheet of all PNGs in a folder: npx tsx scripts/sheet.ts <dir> <out.jpg> [cols] */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [dir, out, colsArg] = process.argv.slice(2);
const files = readdirSync(dir!)
  .filter((f) => f.endsWith('.png'))
  .sort();
const cols = Number(colsArg ?? 4);
const w = 480,
  h = 270;
const sheet = createCanvas(cols * w, Math.ceil(files.length / cols) * (h + 20));
const c = sheet.getContext('2d');
c.fillStyle = '#fff';
c.fillRect(0, 0, sheet.width, sheet.height);
for (const [i, f] of files.entries()) {
  const im = await loadImage(join(dir!, f));
  const x = (i % cols) * w,
    y = Math.floor(i / cols) * (h + 20);
  c.fillStyle = '#222';
  c.font = '15px sans-serif';
  c.fillText(f, x + 4, y + 15);
  c.drawImage(im, x, y + 18, w - 4, h - 4);
}
writeFileSync(out!, sheet.toBuffer('image/jpeg', 82));
console.log(out);
