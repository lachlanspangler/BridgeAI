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
        ? assets[0]!.caption!
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
