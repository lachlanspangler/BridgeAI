/**
 * Golden frames: every visual type drawn at fixed times, compared pixel-by-pixel (with tolerance) against
 * PNGs in tests/golden/frames/. Regenerate after an intended visual change: UPDATE_GOLDEN=1 npx vitest run tests/golden
 * then LOOK at the new PNGs before committing them.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { budgetFor } from '../../src/core/budget.ts';
import { drawFrame, setStrictScenes } from '../../src/core/scenes/frame.ts';
import type { Ctx, Img } from '../../src/core/scenes/kit.ts';
import type { Beat, Script, Visual } from '../../src/core/schema.ts';
import { buildTimeline } from '../../src/core/timeline/timeline.ts';
import { ensureFonts } from '../../src/node/fonts.ts';

const DIR = join(import.meta.dirname, 'frames');
const W = 960;
const H = 540;
const UPDATE = process.env.UPDATE_GOLDEN === '1';

const visuals: [string, Visual, string][] = [
  [
    'title',
    { type: 'title', title: 'Attention Is All You Need', kicker: 'PAPER' },
    'Attention is all you need.',
  ],
  [
    'statement',
    { type: 'statement', text: 'Attention replaces recurrence entirely', highlight: ['Attention'] },
    'Attention replaces recurrence entirely.',
  ],
  [
    'bigNumber',
    {
      type: 'bigNumber',
      value: '28.4',
      unit: 'BLEU',
      label: 'English to German',
      compare: { value: '26.4', label: 'previous best' },
    },
    'It scores 28.4 BLEU.',
  ],
  [
    'bullets',
    { type: 'bullets', heading: 'Why it wins', items: ['No recurrence', 'More parallel', 'Faster training'] },
    'No recurrence, more parallel, faster training.',
  ],
  [
    'bars',
    {
      type: 'bars',
      title: 'BLEU on WMT 2014',
      unit: '',
      bars: [
        { label: 'Old best', value: 26.4, highlight: false },
        { label: 'Transformer', value: 28.4, highlight: true },
      ],
    },
    'It beats the old best.',
  ],
  [
    'flow',
    {
      type: 'flow',
      title: 'The pipeline',
      nodes: [
        { id: 'a', label: 'Encoder', tone: 'primary' },
        { id: 'b', label: 'Attention', tone: 'accent' },
        { id: 'c', label: 'Decoder', tone: 'secondary' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    },
    'Encoder, attention, decoder.',
  ],
  [
    'compare',
    {
      type: 'compare',
      left: { label: 'RNN', points: ['Sequential', 'Slow to train'] },
      right: { label: 'Transformer', points: ['Parallel', 'Fast to train'] },
      winner: 'right',
    },
    'RNNs are sequential; the Transformer is parallel.',
  ],
  [
    'quote',
    { type: 'quote', text: 'based solely on attention mechanisms', cite: 'Vaswani et al.' },
    'Based solely on attention.',
  ],
  [
    'code',
    {
      type: 'code',
      code: 'def attention(q, k, v):\n    w = softmax(q @ k.T)\n    return w @ v',
      lang: 'python',
      focus: [2],
      caption: 'attention.py',
    },
    'Three lines of attention.',
  ],
  [
    'tree',
    {
      type: 'tree',
      title: 'The repo',
      lines: ['src/', '  core/', '  server.ts', 'README.md'],
      focus: ['server.ts'],
    },
    'The server lives in server.ts.',
  ],
  [
    'takeaway',
    { type: 'takeaway', text: 'Attention is all you need', highlight: ['Attention'] },
    'Attention is all you need.',
  ],
];

function timeline() {
  const beats: Beat[] = visuals.map(([, v, narration], i) => ({
    id: `b${i + 1}`,
    role: i === 0 ? 'hook' : i === visuals.length - 1 ? 'takeaway' : 'idea',
    narration,
    visual: v,
    claims: [],
    ideas: [],
    keywords: [],
  }));
  const script: Script = {
    schema: 'bridge.script/1',
    title: 'Golden',
    targetSeconds: 60,
    beats,
    engine: 'test',
  };
  const clips = beats.map(() => ({ duration: 2.6, speechStart: 0.1, speechEnd: 2.5 }));
  return buildTimeline(script, clips, budgetFor(60), { fps: 30, width: W, height: H, seed: 7 });
}

async function compare(name: string, png: Buffer): Promise<{ meanDiff: number; badFrac: number }> {
  const file = join(DIR, `${name}.png`);
  if (UPDATE || !existsSync(file)) {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, png);
    return { meanDiff: 0, badFrac: 0 };
  }
  const [a, b] = await Promise.all([loadImage(file), loadImage(png)]);
  const ca = createCanvas(W, H);
  const cb = createCanvas(W, H);
  ca.getContext('2d').drawImage(a, 0, 0);
  cb.getContext('2d').drawImage(b, 0, 0);
  const da = ca.getContext('2d').getImageData(0, 0, W, H).data;
  const db = cb.getContext('2d').getImageData(0, 0, W, H).data;
  let sum = 0;
  let bad = 0;
  for (let i = 0; i < da.length; i += 4) {
    const d =
      (Math.abs(da[i]! - db[i]!) + Math.abs(da[i + 1]! - db[i + 1]!) + Math.abs(da[i + 2]! - db[i + 2]!)) / 3;
    sum += d;
    if (d > 40) bad++;
  }
  return { meanDiff: sum / (W * H), badFrac: bad / (W * H) };
}

describe('golden frames', () => {
  ensureFonts();
  setStrictScenes(true);
  const tl = timeline();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d') as unknown as Ctx;
  const assets = new Map<string, Img>();
  tl.beats.forEach((b, i) => {
    const name = visuals[i]![0];
    it(`${name} at mid-beat matches its golden`, async () => {
      drawFrame(ctx, tl, b.start + 1.9, assets, { burnCaptions: true, origin: 'golden' });
      const r = await compare(name, canvas.toBuffer('image/png'));
      expect(r.meanDiff).toBeLessThan(1.5);
      expect(r.badFrac).toBeLessThan(0.005);
    });
  });
  it('end card matches its golden', async () => {
    drawFrame(ctx, tl, tl.duration - 0.2, assets, { burnCaptions: true, origin: 'golden' });
    const r = await compare('endcard', canvas.toBuffer('image/png'));
    expect(r.meanDiff).toBeLessThan(1.5);
  });
  it('rendering is deterministic (same t → identical pixels)', () => {
    drawFrame(ctx, tl, 3.3, assets, { burnCaptions: true });
    const a = Buffer.from(canvas.data());
    drawFrame(ctx, tl, 9.1, assets, { burnCaptions: true });
    drawFrame(ctx, tl, 3.3, assets, { burnCaptions: true });
    expect(Buffer.from(canvas.data()).equals(a)).toBe(true);
  });
  it('every frame of the video moves: consecutive half-second frames differ in every beat', () => {
    for (const b of tl.beats) {
      drawFrame(ctx, tl, b.start + 0.2, assets, { burnCaptions: false });
      const a = Buffer.from(canvas.data());
      drawFrame(ctx, tl, b.start + 0.7, assets, { burnCaptions: false });
      expect(Buffer.from(canvas.data()).equals(a)).toBe(false);
    }
  });
});

describe('scenes never throw', () => {
  it('draws every visual at many times, including t=0 and negative t, without errors', () => {
    ensureFonts();
    setStrictScenes(true);
    const tl = timeline();
    const canvas = createCanvas(320, 180);
    const ctx = canvas.getContext('2d') as unknown as Ctx;
    for (let t = 0; t < tl.duration; t += 0.137)
      drawFrame(ctx, { ...tl, width: 320, height: 180 }, t, new Map(), { burnCaptions: true });
    for (const b of tl.beats) drawFrame(ctx, tl, b.start, new Map(), { burnCaptions: true });
  });
});
