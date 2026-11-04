/**
 * PDF papers → Source. pdfjs gives positioned text runs; we rebuild lines and blocks, detect two-column
 * layouts, headings (by font size / numbering), the title (largest text on page 1), the abstract, figure and
 * table captions, and the references section (deprioritised). Figures are cropped from rendered pages:
 * the region above each "Figure N" caption up to the previous text block (works for raster AND vector figures).
 * Every segment keeps its page and bounding box for the source map.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Asset, Segment, Source } from '../../core/schema.ts';
import { wordCount } from '../../core/text/text.ts';

interface Run {
  str: string;
  x: number;
  y: number; // top-left origin, PDF points
  w: number;
  h: number; // font size
  font: string;
}

interface Line {
  text: string;
  x: number;
  y: number;
  x1: number;
  size: number;
  bold: boolean;
}

interface Block {
  lines: Line[];
  x: number;
  y: number;
  x1: number;
  y1: number;
  size: number;
  page: number;
  col: number;
}

interface CanvasLike {
  width: number;
  height: number;
  toBuffer(mime: 'image/png'): Buffer;
}
interface Ctx2d {
  fillStyle: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(
    img: CanvasLike,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
}
interface CanvasFactory {
  create(w: number, h: number): { canvas: CanvasLike; context: Ctx2d };
  destroy(c: { canvas: CanvasLike; context: Ctx2d }): void;
}

const MAX_PAGES = 40;
const FIG_SCALE = 2.2;

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

async function loadPdfJs(): Promise<PdfJs> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Node: the "fake worker" loads this module in-process; without it getDocument never settles
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const require = createRequire(import.meta.url);
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
    ).href;
  }
  return pdfjs;
}

function toLines(runs: Run[]): Line[] {
  const sorted = [...runs].filter((r) => r.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: { runs: Run[]; y: number; size: number }[] = [];
  for (const r of sorted) {
    const l = lines.find(
      (x) =>
        Math.abs(x.y - r.y) < Math.max(2, r.h * 0.45) && r.x >= Math.min(...x.runs.map((q) => q.x)) - 400,
    );
    if (l) l.runs.push(r);
    else lines.push({ runs: [r], y: r.y, size: r.h });
  }
  return lines.map((l) => {
    const rs = l.runs.sort((a, b) => a.x - b.x);
    let text = '';
    let lastEnd = -Infinity;
    for (const r of rs) {
      const gap = r.x - lastEnd;
      text += (text && gap > r.h * 0.15 && !text.endsWith(' ') && !r.str.startsWith(' ') ? ' ' : '') + r.str;
      lastEnd = r.x + r.w;
    }
    const sizes = rs.map((r) => r.h).sort((a, b) => a - b);
    return {
      text: text.replace(/\s+/g, ' ').trim(),
      x: rs[0]!.x,
      x1: Math.max(...rs.map((r) => r.x + r.w)),
      y: l.y,
      size: sizes[Math.floor(sizes.length / 2)]!,
      bold: rs.every((r) => /bold|black|heavy|semibold|\.B\b|-B\b|CMBX/i.test(r.font)),
    };
  });
}

/** Split a page's lines into columns when the page is clearly two-column. */
function columns(lines: Line[], pageW: number): Line[][] {
  const mid = pageW / 2;
  const left = lines.filter((l) => l.x1 < mid + 10);
  const right = lines.filter((l) => l.x > mid - 10);
  const spanning = lines.filter((l) => l.x < mid - 10 && l.x1 > mid + 10);
  if (left.length > 8 && right.length > 8 && spanning.length < (left.length + right.length) * 0.35) {
    // spanning lines (title, wide figures' captions) go first if above the columns, else with the left column
    const top = Math.min(...[...left, ...right].map((l) => l.y));
    const above = spanning.filter((l) => l.y < top);
    const rest = spanning.filter((l) => l.y >= top);
    return [above, [...left, ...rest].sort((a, b) => a.y - b.y), right];
  }
  return [lines];
}

function toBlocks(lines: Line[], page: number, col: number, bodySize: number): Block[] {
  const blocks: Block[] = [];
  let cur: Block | null = null;
  for (const l of lines) {
    const gap = cur ? l.y - cur.y1 : Infinity;
    const sizeJump = cur ? Math.abs(l.size - cur.size) > 1.2 : true;
    const startsCaption = /^(fig(ure)?\.?|table)\s*\d+[.:]/i.test(l.text);
    const looksHeading = isHeadingLine(l, bodySize);
    if (
      !cur ||
      gap > l.size * 1.1 ||
      sizeJump ||
      startsCaption ||
      looksHeading ||
      (cur && isHeadingLine(cur.lines[cur.lines.length - 1]!, bodySize))
    ) {
      cur = { lines: [l], x: l.x, y: l.y, x1: l.x1, y1: l.y + l.size, size: l.size, page, col };
      blocks.push(cur);
    } else {
      cur.lines.push(l);
      cur.x = Math.min(cur.x, l.x);
      cur.x1 = Math.max(cur.x1, l.x1);
      cur.y1 = l.y + l.size;
    }
  }
  return blocks;
}

function isHeadingLine(l: Line, body: number): boolean {
  const t = l.text;
  if (wordCount(t) > 12 || t.length < 3) return false;
  if (/^(\d+(\.\d+)*\.?|[IVX]+\.|[A-Z]\.)\s+[A-Z]/.test(t) && !/[.:]$/.test(t)) return true;
  if (
    /^(abstract|introduction|conclusions?|references|related work|background|method(s|ology)?|results|discussion|experiments?|acknowledg(e)?ments?|appendix)\b/i.test(
      t,
    ) &&
    wordCount(t) <= 4
  )
    return true;
  return l.size > body * 1.18 || (l.bold && wordCount(t) <= 8 && !/[.,;]$/.test(t));
}

function joinLines(lines: Line[]): string {
  let out = '';
  for (const l of lines) {
    if (out.endsWith('-') && /^[a-z]/.test(l.text)) out = out.slice(0, -1) + l.text;
    else out += (out ? ' ' : '') + l.text;
  }
  return out.replace(/\s+/g, ' ').trim();
}

export async function ingestPdf(data: Uint8Array, name: string, dir: string): Promise<Source> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const pages = Math.min(doc.numPages, MAX_PAGES);
  const warnings: string[] = [];
  if (doc.numPages > MAX_PAGES)
    warnings.push(`only the first ${MAX_PAGES} of ${doc.numPages} pages were read`);
  const allBlocks: Block[] = [];
  const pageSizes: { w: number; h: number }[] = [];
  const allSizes: number[] = [];
  const perPage: { lines: Line[]; w: number; h: number }[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    pageSizes.push({ w: vp.width, h: vp.height });
    const tc = await page.getTextContent();
    const runs: Run[] = [];
    for (const it of tc.items as {
      str: string;
      transform: number[];
      width: number;
      height: number;
      fontName: string;
    }[]) {
      if (!it.str) continue;
      const [a, b, , , e, f] = it.transform as [number, number, number, number, number, number];
      if (Math.abs(b) > Math.abs(a) * 0.05) continue; // rotated text (arXiv side stamp, axis labels)
      const size = Math.hypot(a, b) || it.height;
      runs.push({
        str: it.str,
        x: e,
        y: vp.height - f - size,
        w: it.width,
        h: size,
        font:
          (tc.styles as Record<string, { fontFamily?: string }>)[it.fontName]?.fontFamily + ' ' + it.fontName,
      });
    }
    if (!runs.length) warnings.push(`page ${p} has no text layer (scanned?)`);
    const lines = toLines(runs);
    for (const l of lines)
      for (let k = 0; k < Math.min(40, wordCount(l.text)); k++) allSizes.push(Math.round(l.size * 2) / 2);
    perPage.push({ lines, w: vp.width, h: vp.height });
  }
  // body font size = the mode
  const counts = new Map<number, number>();
  for (const s of allSizes) counts.set(s, (counts.get(s) ?? 0) + 1);
  const body = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
  const margins: { x0: number; x1: number; twoCol: boolean }[] = [];
  perPage.forEach((pg) => {
    const prose = pg.lines.filter((l) => wordCount(l.text) > 8);
    margins.push({
      x0: Math.min(pg.w * 0.12, ...prose.map((l) => l.x)),
      x1: Math.max(pg.w * 0.88, ...prose.map((l) => l.x1)),
      twoCol: columns(pg.lines, pg.w).length > 1,
    });
  });
  perPage.forEach((pg, i) => {
    // drop running headers/footers and page numbers
    const lines = pg.lines.filter(
      (l) => !(/^\d{1,3}$/.test(l.text) || (l.y < pg.h * 0.05 && l.size <= body) || l.y > pg.h * 0.95),
    );
    columns(lines, pg.w).forEach((colLines, c) => allBlocks.push(...toBlocks(colLines, i + 1, c, body)));
  });

  // title: largest text on page 1, in the top 40%
  const p1 = allBlocks.filter((b) => b.page === 1 && b.y < pageSizes[0]!.h * 0.4);
  const titleBlock = [...p1].sort((a, b) => b.size - a.size)[0];
  let title =
    titleBlock && titleBlock.size > body * 1.3 ? joinLines(titleBlock.lines) : name.replace(/\.pdf$/i, '');
  if (wordCount(title) > 25) title = title.split(/\s+/).slice(0, 25).join(' ');

  const segs: Segment[] = [];
  const section: string[] = [];
  let inRefs = false;
  let abstractNext = false;
  const captions: { seg: Segment; block: Block }[] = [];
  for (const b of allBlocks) {
    const text = joinLines(b.lines);
    if (!text || (b === titleBlock && text === title)) {
      if (b === titleBlock)
        segs.push({
          id: `s${segs.length + 1}`,
          kind: 'title',
          text: title,
          loc: { page: b.page, bbox: [b.x, b.y, b.x1 - b.x, b.y1 - b.y] },
        });
      continue;
    }
    const bbox: [number, number, number, number] = [
      round(b.x),
      round(b.y),
      round(b.x1 - b.x),
      round(b.y1 - b.y),
    ];
    const id = `s${segs.length + 1}`;
    if (b.lines.length <= 2 && isHeadingLine(b.lines[0]!, body)) {
      if (/^abstract$/i.test(text.trim())) {
        abstractNext = true;
        continue;
      }
      inRefs = /^(\d+\.?\s*)?(references|bibliography)\b/i.test(text);
      section.splice(0, section.length, text.slice(0, 80));
      segs.push({ id, kind: 'heading', text, loc: { page: b.page, bbox, section: [...section] } });
      continue;
    }
    if (inRefs) continue; // references are not explained (they are cited, not claims)
    if (/^(fig(ure)?\.?|table)\s*\d+[.:]/i.test(text)) {
      const seg: Segment = {
        id,
        kind: 'caption',
        text,
        loc: { page: b.page, bbox, section: section.length ? [...section] : undefined },
      };
      segs.push(seg);
      if (/^fig/i.test(text)) captions.push({ seg, block: b });
      continue;
    }
    const isAbstract = abstractNext || /^abstract[\s.:—-]/i.test(text);
    if (wordCount(text) < 4 && !isAbstract) continue; // stray fragments (axis labels, equation bits)
    segs.push({
      id,
      kind: isAbstract ? 'abstract' : 'paragraph',
      text: isAbstract ? text.replace(/^abstract[\s.:—-]*/i, '') : text,
      loc: {
        page: b.page,
        bbox,
        section: section.length ? [...section] : isAbstract ? ['Abstract'] : undefined,
      },
    });
    abstractNext = false;
  }

  // figures: crop the region above each figure caption
  const assets: Asset[] = [];
  mkdirSync(join(dir, 'assets'), { recursive: true });
  for (const { seg, block } of captions.slice(0, 12)) {
    try {
      const pg = pageSizes[block.page - 1]!;
      const colBlocks = allBlocks.filter((x) => x.page === block.page && x !== block && x.y1 <= block.y + 1);
      const m = margins[block.page - 1]!;
      const wide = !m.twoCol || block.x1 - block.x > pg.w * 0.55;
      const left = wide ? Math.max(0, m.x0 - 14) : Math.max(0, block.col === 2 ? pg.w / 2 - 6 : m.x0 - 14);
      const right = wide
        ? Math.min(pg.w, m.x1 + 14)
        : Math.min(pg.w, block.col === 2 ? m.x1 + 14 : pg.w / 2 + 6);
      const above = colBlocks.filter((x) => x.x1 > left && x.x < right && wordCount(joinLines(x.lines)) > 12);
      const top = Math.max(pg.h * 0.05, ...above.map((x) => x.y1 + 4));
      const bottom = block.y - 2;
      if (bottom - top < pg.h * 0.08) continue;
      const page = await doc.getPage(block.page);
      const vp = page.getViewport({ scale: FIG_SCALE });
      // render with pdfjs's own canvas factory (its bundled @napi-rs/canvas); mixing canvas builds hangs render()
      const factory = (doc as unknown as { canvasFactory: CanvasFactory }).canvasFactory;
      const full = factory.create(Math.ceil(vp.width), Math.ceil(vp.height));
      full.context.fillStyle = '#fff';
      full.context.fillRect(0, 0, full.canvas.width, full.canvas.height);
      await page.render({ canvasContext: full.context, viewport: vp } as never).promise;
      const sx = Math.floor(left * FIG_SCALE);
      const sy = Math.floor(top * FIG_SCALE);
      const sw = Math.ceil((right - left) * FIG_SCALE);
      const sh = Math.ceil((bottom - top) * FIG_SCALE);
      const crop = factory.create(sw, sh);
      crop.context.drawImage(full.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      factory.destroy(full);
      if (isBlank(crop.context.getImageData(0, 0, sw, sh).data)) {
        factory.destroy(crop);
        continue;
      }
      // trim white borders (keep a small pad) so the figure fills its card
      const t = trimBox(crop.context.getImageData(0, 0, sw, sh).data, sw, sh);
      const trimmed = factory.create(t.w, t.h);
      trimmed.context.fillStyle = '#fff';
      trimmed.context.fillRect(0, 0, t.w, t.h);
      trimmed.context.drawImage(crop.canvas, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
      const png = trimmed.canvas.toBuffer('image/png');
      factory.destroy(crop);
      factory.destroy(trimmed);
      const aid = `a${assets.length + 1}`;
      const rel = join('assets', `${aid}.png`);
      writeFileSync(join(dir, rel), png);
      const caption = seg.text.replace(/\s+/g, ' ').slice(0, 300);
      assets.push({
        id: aid,
        kind: 'figure',
        path: rel,
        width: t.w,
        height: t.h,
        caption,
        loc: { page: block.page, bbox: [round(left), round(top), round(right - left), round(bottom - top)] },
      });
      const fseg: Segment = {
        id: `s${segs.length + 1}`,
        kind: 'figure',
        text: caption,
        assetId: aid,
        loc: { page: block.page },
      };
      segs.push(fseg);
      seg.assetId = aid;
    } catch (e) {
      warnings.push(`could not crop a figure on page ${block.page}: ${(e as Error).message}`);
    }
  }
  // merge paragraph fragments split by sub/superscripts or column/page breaks mid-sentence
  const merged: Segment[] = [];
  for (const sg of segs) {
    const prev = merged[merged.length - 1];
    const joinable =
      prev && (prev.kind === 'paragraph' || prev.kind === 'abstract') && sg.kind === 'paragraph';
    if (
      joinable &&
      (!/[.!?:"”)]$/.test(prev.text) || /^[a-z(]/.test(sg.text)) &&
      wordCount(prev.text) < 400
    ) {
      prev.text = prev.text.endsWith('-') ? prev.text.slice(0, -1) + sg.text : `${prev.text} ${sg.text}`;
      continue;
    }
    merged.push(sg);
  }
  segs.splice(0, segs.length, ...merged.map((sg, i) => ({ ...sg, id: `s${i + 1}` })));
  if (!segs.some((s) => s.kind === 'abstract')) {
    const first = segs.find((s) => s.kind === 'paragraph' && s.loc.page === 1 && wordCount(s.text) > 40);
    if (first) first.kind = 'abstract';
  }
  await doc.destroy();
  const words = segs.reduce((n, s) => n + wordCount(s.text), 0);
  if (words < 30)
    warnings.push('very little text was found: is this a scanned PDF? (OCR for scans is not supported yet)');
  return {
    schema: 'bridge.source/1',
    kind: 'pdf',
    title,
    origin: name,
    segments: segs,
    assets,
    warnings,
    stats: { words, pages: doc.numPages },
  };
}

const round = (x: number) => Math.round(x * 10) / 10;

function isBlank(d: Uint8ClampedArray): boolean {
  let dark = 0;
  for (let i = 0; i < d.length; i += 16) if (d[i]! < 230 || d[i + 1]! < 230 || d[i + 2]! < 230) dark++;
  return dark / (d.length / 16) < 0.01;
}

function trimBox(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  pad = 14,
): { x: number; y: number; w: number; h: number } {
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      if (d[i]! < 235 || d[i + 1]! < 235 || d[i + 2]! < 235) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) return { x: 0, y: 0, w, h };
  const x = Math.max(0, x0 - pad);
  const y = Math.max(0, y0 - pad);
  return { x, y, w: Math.min(w, x1 + pad) - x, h: Math.min(h, y1 + pad) - y };
}
