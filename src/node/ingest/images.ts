/**
 * Image sets → Source. Each image becomes a figure asset (re-encoded to PNG, ≤ 2400 px) with a caption from the
 * user's note or the file name. Text inside images (slides, screenshots, diagrams) is read with OCR
 * (tesseract.js, local; the 10 MB English model downloads once into ~/.bridge/models/tesseract).
 * BRIDGE_OCR=off skips OCR (tests, offline).
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Asset, Segment, Source } from '../../core/schema.ts';
import { wordCount } from '../../core/text/text.ts';
import { paths } from '../paths.ts';
import type { InputFile } from './index.ts';

const MAX_SIDE = 2400;
const MAX_IMAGES = 24;
const MAX_PIXELS = 50_000_000;

/** Width/height from the PNG / JPEG / GIF / WebP header, without decoding the bitmap (memory-bomb guard). */
export function imageSize(d: Uint8Array): { w: number; h: number } | null {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  if (d.length > 24 && d[0] === 0x89 && d[1] === 0x50) return { w: v.getUint32(16), h: v.getUint32(20) };
  if (d.length > 10 && d[0] === 0x47 && d[1] === 0x49)
    return { w: v.getUint16(6, true), h: v.getUint16(8, true) };
  if (d.length > 30 && d[0] === 0x52 && d[8] === 0x57) {
    const tag = String.fromCharCode(d[12]!, d[13]!, d[14]!, d[15]!);
    if (tag === 'VP8X')
      return {
        w: 1 + (d[24]! | (d[25]! << 8) | (d[26]! << 16)),
        h: 1 + (d[27]! | (d[28]! << 8) | (d[29]! << 16)),
      };
    if (tag === 'VP8 ') return { w: v.getUint16(26, true) & 0x3fff, h: v.getUint16(28, true) & 0x3fff };
    if (tag === 'VP8L') {
      const b = v.getUint32(21, true);
      return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) };
    }
  }
  if (d[0] === 0xff && d[1] === 0xd8) {
    let i = 2;
    while (i + 9 < d.length) {
      if (d[i] !== 0xff) return null;
      const marker = d[i + 1]!;
      const len = v.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { w: v.getUint16(i + 7), h: v.getUint16(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

export async function ocr(png: Buffer): Promise<string> {
  if (process.env.BRIDGE_OCR === 'off') return '';
  try {
    const { createWorker } = await import('tesseract.js');
    const dir = join(paths.models(), 'tesseract');
    mkdirSync(dir, { recursive: true });
    const worker = await createWorker('eng', 1, { cachePath: dir, logger: () => {} });
    try {
      const r = await worker.recognize(png);
      return r.data.text
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .trim();
    } finally {
      await worker.terminate();
    }
  } catch {
    return '';
  }
}

const prettyName = (n: string) =>
  n
    .split('/')
    .pop()!
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

export async function ingestImages(files: InputFile[], dir: string, notes?: string): Promise<Source> {
  mkdirSync(join(dir, 'assets'), { recursive: true });
  const segs: Segment[] = [];
  const assets: Asset[] = [];
  const warnings: string[] = [];
  const noteLines = (notes ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (files.length > MAX_IMAGES)
    warnings.push(`only the first ${MAX_IMAGES} of ${files.length} images were used`);
  if (noteLines.length) segs.push({ id: 's1', kind: 'abstract', text: noteLines.join(' '), loc: {} });
  for (const [i, f] of files.slice(0, MAX_IMAGES).entries()) {
    const dims = imageSize(f.data);
    if (dims && dims.w * dims.h > MAX_PIXELS) {
      warnings.push(`${f.name}: too large (${dims.w}×${dims.h}); resize it below 50 megapixels`);
      continue;
    }
    let img;
    try {
      img = await loadImage(Buffer.from(f.data));
    } catch {
      warnings.push(`${f.name}: not a readable image`);
      continue;
    }
    const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const w = Math.round(img.width * k);
    const h = Math.round(img.height * k);
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const png = c.toBuffer('image/png');
    const aid = `a${assets.length + 1}`;
    const rel = join('assets', `${aid}.png`);
    writeFileSync(join(dir, rel), png);
    const text = await ocr(png);
    const caption = prettyName(f.name);
    assets.push({
      id: aid,
      kind: 'image',
      path: rel,
      width: w,
      height: h,
      caption,
      ocr: text || undefined,
      loc: { file: f.name },
    });
    segs.push({
      id: `s${segs.length + 1}`,
      kind: 'figure',
      text: `Image ${i + 1}: ${caption}`,
      assetId: aid,
      loc: { file: f.name },
    });
    if (wordCount(text) >= 3)
      segs.push({
        id: `s${segs.length + 1}`,
        kind: 'caption',
        text: `Text in image ${i + 1} (${caption}): ${text.replace(/\n/g, ' ')}`,
        assetId: aid,
        loc: { file: f.name },
      });
  }
  if (!assets.length) throw new Error('none of the files could be read as images');
  if (!segs.some((s) => s.kind === 'caption') && !noteLines.length)
    warnings.push(
      'no text was found in the images: add a short note about them so the script has facts to work with',
    );
  const title =
    noteLines[0] && wordCount(noteLines[0]) <= 12
      ? noteLines[0]
      : assets.length === 1
        ? assets[0]!.caption!.charAt(0).toUpperCase() + assets[0]!.caption!.slice(1)
        : `${assets.length} images`;
  return {
    schema: 'bridge.source/1',
    kind: 'images',
    title,
    origin: files.length === 1 ? files[0]!.name : `${files.length} images`,
    segments: segs,
    assets,
    warnings,
    stats: { words: segs.reduce((n, s) => n + wordCount(s.text), 0), files: assets.length },
  };
}
