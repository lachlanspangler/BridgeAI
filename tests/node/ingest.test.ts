import { createCanvas } from '@napi-rs/canvas';
import { zipSync, strToU8 } from 'fflate';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { Source } from '../../src/core/schema.ts';
import { ingestInput, safeName } from '../../src/node/ingest/index.ts';
import { ingestPdf } from '../../src/node/ingest/pdf.ts';
import { htmlToMarkdown, isPrivateAddress, resolveSpecial } from '../../src/node/ingest/url.ts';

process.env.BRIDGE_OCR = 'off';
const tmp = () => mkdtempSync(join(tmpdir(), 'bridge-ingest-'));

/** A small synthetic "paper": title, abstract, sections, a figure with a caption, references. */
export async function makePaperPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const W = 612;
  const H = 792;
  const para = (page: ReturnType<typeof doc.addPage>, text: string, y: number, size = 10): number => {
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
      if (font.widthOfTextAtSize(`${line} ${w}`, size) > W - 144) {
        page.drawText(line, { x: 72, y, size, font });
        y -= size * 1.3;
        line = w;
      } else line = line ? `${line} ${w}` : w;
    }
    page.drawText(line, { x: 72, y, size, font });
    return y - size * 2;
  };
  const p1 = doc.addPage([W, H]);
  p1.drawText('Tiny Models Explain Big Ideas', { x: 140, y: 700, size: 22, font: bold });
  p1.drawText('Abstract', { x: 72, y: 650, size: 12, font: bold });
  let y = para(
    p1,
    'We propose Bridgenet, a small model that turns papers into short videos. Bridgenet reaches 87.5 percent accuracy on our benchmark while using 4 GB of memory. It is faster than prior systems.',
    630,
  );
  p1.drawText('1 Introduction', { x: 72, y, size: 12, font: bold });
  y = para(
    p1,
    'Explaining research is hard because papers are long and dense. Readers need the main idea first and the details later, which is what our method provides for every input.',
    y - 18,
  );
  const p2 = doc.addPage([W, H]);
  // a vector "figure": boxes and an arrow
  p2.drawRectangle({ x: 120, y: 520, width: 120, height: 80, color: rgb(0.3, 0.6, 0.9) });
  p2.drawRectangle({ x: 360, y: 520, width: 120, height: 80, color: rgb(0.9, 0.7, 0.2) });
  p2.drawLine({ start: { x: 240, y: 560 }, end: { x: 360, y: 560 }, thickness: 4 });
  p2.drawText('Figure 1: The Bridgenet pipeline turns a paper into a video.', {
    x: 150,
    y: 490,
    size: 10,
    font,
  });
  y = para(
    p2,
    'The pipeline has two stages. The first stage ranks ideas and the second writes a script that fits the chosen length exactly.',
    440,
  );
  p2.drawText('References', { x: 72, y, size: 12, font: bold });
  para(p2, '[1] A. Author. Some cited work that should not be explained. 2020.', y - 18);
  return doc.save();
}

describe('pdf ingestion', () => {
  it('finds the title, abstract, sections, a cropped figure, and skips references', async () => {
    const dir = tmp();
    const src = Source.parse(await ingestPdf(await makePaperPdf(), 'tiny.pdf', dir));
    expect(src.title).toBe('Tiny Models Explain Big Ideas');
    expect(src.stats.pages).toBe(2);
    const abs = src.segments.find((s) => s.kind === 'abstract')!;
    expect(abs.text).toMatch(/^We propose Bridgenet/);
    expect(abs.loc.page).toBe(1);
    expect(src.segments.some((s) => s.kind === 'heading' && /Introduction/.test(s.text))).toBe(true);
    expect(src.segments.find((s) => s.kind === 'caption')!.text).toMatch(/^Figure 1/);
    expect(src.assets.length).toBe(1);
    expect(src.assets[0]!.width).toBeGreaterThan(200);
    expect(src.segments.some((s) => /cited work/.test(s.text))).toBe(false);
  });
});

describe('project ingestion', () => {
  it('reads README, manifest, tree, languages and entry points from a zip (with a top folder)', async () => {
    const zip = zipSync({
      'repo-main/README.md': strToU8(
        '# Tiny CLI\n\nTiny CLI turns text into slugs. It has no dependencies.\n',
      ),
      'repo-main/package.json': strToU8(
        JSON.stringify({
          name: 'tiny-cli',
          description: 'Slugs',
          dependencies: { kleur: '1' },
          scripts: { test: 'x' },
        }),
      ),
      'repo-main/src/index.ts': strToU8(
        '// header\nexport function slug(s: string) {\n  return s.toLowerCase();\n}\n',
      ),
      'repo-main/node_modules/x/index.js': strToU8('ignored'),
      'repo-main/logo.png': new Uint8Array([1, 2, 3]),
    });
    const src = Source.parse(await ingestInput({ files: [{ name: 'repo.zip', data: zip }] }, tmp()));
    expect(src.kind).toBe('project');
    expect(src.title).toBe('Tiny CLI');
    const kinds = src.segments.map((s) => s.kind);
    expect(kinds).toContain('code');
    expect(kinds).toContain('meta');
    expect(src.segments.find((s) => s.kind === 'meta')!.text).toMatch(/^FILE TREE\n/);
    expect(src.segments.some((s) => /depends on kleur/.test(s.text))).toBe(true);
    const code = src.segments.find((s) => s.kind === 'code' && s.loc.file === 'src/index.ts')!;
    expect(code.text.startsWith('export function slug')).toBe(true);
    expect(code.loc.lines![0]).toBe(2);
    expect(src.segments.some((s) => /ignored/.test(s.text))).toBe(false);
  });
  it('safeName strips traversal', () => {
    expect(safeName('../../etc/passwd')).toBe('etc/passwd');
    expect(safeName('a\\..\\b')).toBe('a/b');
  });
  it('refuses zip bombs', async () => {
    const big = new Uint8Array(210 * 1024 * 1024);
    const zip = zipSync({ 'a.txt': big }, { level: 9 });
    await expect(ingestInput({ files: [{ name: 'bomb.zip', data: zip }] }, tmp())).rejects.toThrow(/200 MB/);
  }, 60_000);
});

describe('images ingestion', () => {
  it('makes one figure asset per image with captions from file names and the note as the abstract', async () => {
    const c = createCanvas(320, 200);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 320, 200);
    ctx.fillStyle = '#000';
    ctx.fillText('Water cycle', 20, 40);
    const png = c.toBuffer('image/png');
    const src = Source.parse(
      await ingestInput(
        {
          files: [
            { name: 'water-cycle_diagram.png', data: png },
            { name: 'rain.png', data: png },
          ],
          text: 'Two diagrams of the water cycle.',
        },
        tmp(),
      ),
    );
    expect(src.kind).toBe('images');
    expect(src.assets.map((a) => a.caption)).toEqual(['water cycle diagram', 'rain']);
    expect(src.segments[0]!.kind).toBe('abstract');
  });
  it('rejects non-images gracefully', async () => {
    await expect(
      ingestInput({ files: [{ name: 'x.png', data: new Uint8Array([1, 2, 3]) }] }, tmp()),
    ).rejects.toThrow(/images/);
  });
});

describe('links', () => {
  it('maps arXiv and GitHub links to their raw content', () => {
    expect(resolveSpecial(new URL('https://arxiv.org/abs/1706.03762')).url).toBe(
      'https://arxiv.org/pdf/1706.03762',
    );
    expect(resolveSpecial(new URL('https://arxiv.org/pdf/1706.03762v7')).kind).toBe('pdf');
    expect(resolveSpecial(new URL('https://github.com/sindresorhus/slugify')).url).toBe(
      'https://codeload.github.com/sindresorhus/slugify/zip/HEAD',
    );
    expect(resolveSpecial(new URL('https://example.com/a/paper.pdf')).kind).toBe('pdf');
  });
  it('refuses private and loopback addresses (SSRF)', async () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.4',
      '172.20.1.1',
      '169.254.169.254',
      '::1',
      'fd00::1',
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '140.82.112.3']) expect(isPrivateAddress(ip)).toBe(false);
    await expect(ingestInput({ url: 'http://127.0.0.1:7411/api/keys' }, tmp())).rejects.toThrow(
      /private or local/,
    );
    await expect(ingestInput({ url: 'file:///etc/passwd' }, tmp())).rejects.toThrow(/http/);
  });
  it('turns article HTML into headings and paragraphs, dropping scripts and nav', () => {
    const { title, text } = htmlToMarkdown(
      '<html><head><title>T</title><script>evil()</script></head><body><nav>menu</nav><article><h1>Big</h1><p>One &amp; two.</p><ul><li>a</li></ul></article></body></html>',
    );
    expect(title).toBe('T');
    expect(text).toContain('# Big');
    expect(text).toContain('One & two.');
    expect(text).not.toContain('evil');
    expect(text).not.toContain('menu');
  });
});
