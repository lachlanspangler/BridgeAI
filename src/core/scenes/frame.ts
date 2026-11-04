/**
 * Frame compositor: draws the whole picture at time t from the timeline. Layers, back to front:
 * ambient background → outgoing/incoming beat scenes → transition wipe → chrome (progress bar, title tag)
 * → burned-in captions (current word highlighted) → end card. Same code draws mp4 frames in Node and the
 * live preview in the browser.
 */
import type { Timeline, TimedBeat } from '../schema.ts';
import { cueAt } from '../captions/captions.ts';
import { NIGHT, SAFE, TYPE, withAlpha, type Theme } from '../design/tokens.ts';
import { absoluteWords } from '../timeline/timeline.ts';
import {
  background,
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  fitFont,
  font,
  lerp,
  pill,
  prog,
  roundRect,
  type Ctx,
  type Img,
} from './kit.ts';
import { drawVisual, type SceneProps } from './library.ts';

export interface FrameOptions {
  burnCaptions: boolean;
  theme?: Theme;
  /** Text for the end card's source line, e.g. "arxiv.org/abs/1706.03762". */
  origin?: string;
  /** Engine label for the end card. */
  engine?: string;
  /** Kicker for the source tag ("Paper", "Project"). */
  kicker?: string;
}

const EXIT = 0.28;

/** Tests set this so scene bugs fail loudly instead of being skipped. */
export let strictScenes = false;
export const setStrictScenes = (v: boolean): void => {
  strictScenes = v;
};
const WIPE = 0.42;

const BEAT_TONES = ['primary', 'accent', 'secondary', 'positive'] as const;

export function drawFrame(
  ctx: Ctx,
  tl: Timeline,
  t: number,
  assets: Map<string, Img>,
  opts: FrameOptions,
): void {
  const theme = opts.theme ?? NIGHT;
  const W = tl.width;
  const H = tl.height;
  const s = H / 1080;
  ctx.save();
  background(ctx, W, H, t, tl.seed, theme);
  const last = tl.beats[tl.beats.length - 1]!;
  // beats on screen: the current one, plus the previous one while it exits
  for (let i = 0; i < tl.beats.length; i++) {
    const b = tl.beats[i]!;
    const visibleUntil = i === tl.beats.length - 1 ? b.end + 0.0 : b.end;
    if (t < b.start || t >= visibleUntil + (i === tl.beats.length - 1 ? 0 : 0)) continue;
    const exitP = i === tl.beats.length - 1 ? 0 : prog(t, b.end - EXIT, EXIT);
    drawBeat(ctx, tl, b, t, assets, theme, exitP);
  }
  // transition wipe across each beat boundary
  for (let i = 1; i < tl.beats.length; i++) {
    const tb = tl.beats[i]!.start;
    if (Math.abs(t - tb) < WIPE / 2)
      wipe(ctx, W, H, (t - tb + WIPE / 2) / WIPE, theme.tone[BEAT_TONES[i % BEAT_TONES.length]!]);
  }
  if (t >= last.end) endCard(ctx, tl, t - last.end, theme, opts);
  else chrome(ctx, tl, t, theme);
  if (tl.beats[0] && tl.beats[0].beat.visual.type !== 'title') sourceTag(ctx, tl, t, theme, opts);
  if (opts.burnCaptions && t < last.end) captions(ctx, tl, t, theme, s);
  ctx.restore();
}

function drawBeat(
  ctx: Ctx,
  tl: Timeline,
  b: TimedBeat,
  t: number,
  assets: Map<string, Img>,
  theme: Theme,
  exitP: number,
): void {
  const local = t - b.start;
  const p: SceneProps = {
    ctx,
    W: tl.width,
    H: tl.height,
    t: local,
    dur: b.end - b.start,
    voice: { start: b.voiceOffset, end: b.voiceOffset + b.voiceDuration },
    words: b.words,
    theme,
    assets,
    seed: tl.seed,
    variant: tl.beats.indexOf(b),
  };
  ctx.save();
  if (exitP > 0) {
    const e = easeInCubic(exitP);
    ctx.globalAlpha = 1 - e;
    ctx.translate(-e * tl.width * 0.04, 0);
  }
  try {
    drawVisual(p, b.beat.visual);
  } catch (e) {
    // a broken scene must never kill a render: skip the layer (tests run strict and rethrow)
    if (strictScenes) throw e;
  }
  ctx.restore();
}

/** A diagonal colour band sweeping left → right (matches the whoosh). */
function wipe(ctx: Ctx, W: number, H: number, k: number, color: string): void {
  const x = lerp(-W * 0.5, W * 1.5, easeInOutCubic(clamp01(k)));
  const bw = W * 0.18;
  ctx.save();
  ctx.globalAlpha = 0.85 * Math.sin(Math.PI * clamp01(k));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - bw, 0);
  ctx.lineTo(x + bw * 0.4, 0);
  ctx.lineTo(x - bw * 0.2, H);
  ctx.lineTo(x - bw * 1.6, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Progress bar (one segment per beat) and a small title tag. */
function chrome(ctx: Ctx, tl: Timeline, t: number, theme: Theme): void {
  const W = tl.width;
  const s = tl.height / 1080;
  const total = tl.beats[tl.beats.length - 1]!.end;
  const x0 = W * SAFE.x;
  const x1 = W * (1 - SAFE.x);
  const y = 46 * s;
  const fade = easeOutCubic(prog(t, 0.1, 0.5));
  ctx.save();
  ctx.globalAlpha = fade;
  tl.beats.forEach((b, i) => {
    const a = x0 + ((x1 - x0) * b.start) / total;
    const c = x0 + ((x1 - x0) * b.end) / total - 6 * s;
    ctx.fillStyle = withAlpha(theme.ink, 0.14);
    roundRect(ctx, a, y, c - a, 8 * s, 4 * s);
    ctx.fill();
    const k = clamp01((t - b.start) / (b.end - b.start));
    if (k > 0) {
      ctx.fillStyle = theme.tone[BEAT_TONES[i % BEAT_TONES.length]!];
      roundRect(ctx, a, y, (c - a) * k, 8 * s, 4 * s);
      ctx.fill();
    }
  });
  ctx.font = font(24 * s, 700, 'sans');
  ctx.fillStyle = theme.faint;
  ctx.textAlign = 'left';
  ctx.fillText('BRIDGE', x0, y + 48 * s);
  ctx.textAlign = 'right';
  const f = fitFont(ctx, tl.title, W * 0.5, 1, 24 * s, 18 * s, 600, 'sans');
  ctx.font = font(f.px, 600, 'sans');
  ctx.fillText(f.lines[0] ?? '', x1, y + 48 * s);
  ctx.restore();
}

let wordCache: { tl: Timeline; words: ReturnType<typeof absoluteWords> } | null = null;

function captions(ctx: Ctx, tl: Timeline, t: number, theme: Theme, s: number): void {
  const cue = cueAt(tl.captions, t);
  if (!cue) return;
  if (!wordCache || wordCache.tl !== tl) wordCache = { tl, words: absoluteWords(tl.beats) };
  const W = tl.width;
  const H = tl.height;
  const px = TYPE.caption * s;
  ctx.save();
  ctx.font = font(px, 600, 'sans');
  const words = cue.text.split(/\s+/);
  const space = ctx.measureText(' ').width;
  const widths = words.map((w) => ctx.measureText(w).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  const padX = 34 * s;
  const h = px * 1.75;
  const y = H * (1 - SAFE.bottom * 0.5) - h / 2;
  const appear = easeOutCubic(prog(t, cue.start, 0.12));
  ctx.globalAlpha = appear;
  roundRect(ctx, W / 2 - total / 2 - padX, y, total + padX * 2, h, h / 2);
  ctx.fillStyle = theme.caption.bg;
  ctx.fill();
  // which word is being said now?
  const said = wordCache.words.filter((w) => w.start >= cue.start - 0.01 && w.end <= cue.end + 0.6);
  let x = W / 2 - total / 2;
  words.forEach((w, i) => {
    const wt = said[i];
    const active = wt ? t >= wt.start && t < wt.end + 0.05 : false;
    const past = wt ? t >= wt.end : false;
    ctx.fillStyle = active
      ? theme.caption.active
      : past
        ? theme.caption.ink
        : withAlpha(theme.caption.ink, 0.72);
    ctx.fillText(w, x, y + h / 2 + px * 0.36);
    x += widths[i]! + space;
  });
  ctx.restore();
}

/** When the hook isn't a title card: a pill naming the source for the first seconds (no logo intro, rule 7). */
function sourceTag(ctx: Ctx, tl: Timeline, t: number, theme: Theme, opts: FrameOptions): void {
  const k = prog(t, 0.05, 0.4) * (1 - prog(t, 2.8, 0.4));
  if (k <= 0) return;
  const s = tl.height / 1080;
  const label = `${opts.kicker ?? 'Explained'} · ${tl.title}`.slice(0, 64);
  pill(
    ctx,
    label,
    tl.width / 2,
    tl.height * SAFE.top + 4 * s,
    TYPE.kicker * 0.85 * s,
    theme.tone.primary,
    theme.onTone.primary,
    easeOutCubic(k),
  );
}

function endCard(ctx: Ctx, tl: Timeline, t: number, theme: Theme, opts: FrameOptions): void {
  const W = tl.width;
  const H = tl.height;
  const s = H / 1080;
  const e = easeOutCubic(prog(t, 0, 0.5));
  ctx.save();
  ctx.globalAlpha = e;
  const f = fitFont(ctx, tl.title, W * 0.8, 2, TYPE.title * s, TYPE.body * s, 700, 'display');
  ctx.font = font(f.px, 700, 'display');
  ctx.fillStyle = theme.ink;
  ctx.textAlign = 'center';
  f.lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.4 + i * f.px * 1.15));
  const pe = easeOutBack(prog(t, 0.15, 0.4));
  pill(
    ctx,
    'Made with Bridge',
    W / 2,
    H * 0.4 - f.px * 1.1,
    TYPE.kicker * s,
    theme.tone.accent,
    theme.onTone.accent,
    clamp01(pe),
  );
  ctx.font = font(TYPE.small * 0.85 * s, 600, 'sans');
  ctx.fillStyle = theme.muted;
  const below = H * 0.4 + f.lines.length * f.px * 1.15 + 40 * s;
  if (opts.origin) ctx.fillText(`Source: ${opts.origin}`, W / 2, below);
  ctx.font = font(TYPE.small * 0.7 * s, 500, 'sans');
  ctx.fillStyle = theme.faint;
  ctx.fillText('Every claim is traced to the source: see the source map.', W / 2, below + 56 * s);
  ctx.restore();
}
