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
  // the glow palette rotates per beat; the switch happens under the transition wipe
  const current = tl.beats.findIndex((b) => t < b.end);
  background(ctx, W, H, t, tl.seed, theme, current < 0 ? tl.beats.length : current);
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
  if (t < last.end) chapterChip(ctx, tl, t, theme);
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
  // one quiet progress bar: segmented by chapter in long videos, continuous otherwise (colour carries no meaning here)
  const ch = chapters(tl);
  const segs = ch.length
    ? ch.map((c, i) => ({ start: i === 0 ? 0 : c.start, end: ch[i + 1]?.start ?? total }))
    : [{ start: 0, end: total }];
  for (const g of segs) {
    const a = x0 + ((x1 - x0) * g.start) / total;
    const c = x0 + ((x1 - x0) * g.end) / total - (segs.length > 1 ? 8 * s : 0);
    ctx.fillStyle = withAlpha(theme.ink, 0.14);
    roundRect(ctx, a, y, c - a, 6 * s, 3 * s);
    ctx.fill();
    const k = clamp01((t - g.start) / (g.end - g.start));
    if (k > 0) {
      ctx.fillStyle = withAlpha(theme.ink, 0.8);
      roundRect(ctx, a, y, (c - a) * k, 6 * s, 3 * s);
      ctx.fill();
    }
  }
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
    // yellow is reserved for the beat's focal element; the spoken word is full white with an underline
    ctx.fillStyle = active || past ? theme.caption.ink : withAlpha(theme.caption.ink, 0.6);
    ctx.fillText(w, x, y + h / 2 + px * 0.36);
    if (active) ctx.fillRect(x, y + h / 2 + px * 0.5, widths[i]!, 3 * s);
    x += widths[i]! + space;
  });
  ctx.restore();
}

/** Chapters for long videos (≥ 150 s): each "idea" beat starts one; named from its first keyword or words. */
export function chapters(tl: Timeline): { start: number; n: number; of: number; name: string }[] {
  if (tl.duration < 150) return [];
  const starts = tl.beats.filter((b) => b.beat.role === 'idea');
  if (starts.length < 3) return [];
  const nameOf = (b: (typeof starts)[number]) => {
    const v = b.beat.visual as { title?: string; heading?: string };
    const raw =
      v.title ?? v.heading ?? b.beat.keywords[0] ?? b.beat.narration.split(/\s+/).slice(0, 3).join(' ');
    const t = raw
      .replace(/[.,;:!?]+$/, '')
      .split(/\s+/)
      .slice(0, 4)
      .join(' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  return starts.map((b, i) => ({ start: b.start, n: i + 1, of: starts.length, name: nameOf(b) }));
}

function chapterChip(ctx: Ctx, tl: Timeline, t: number, theme: Theme): void {
  const ch = chapters(tl).find((c) => t >= c.start && t < c.start + 2.6);
  if (!ch) return;
  const s = tl.height / 1080;
  const k = easeOutCubic(prog(t, ch.start + 0.1, 0.35)) * (1 - prog(t, ch.start + 2.2, 0.4));
  // below the progress bar, named: "2 · Multi-head attention"
  pill(
    ctx,
    `${ch.n} · ${ch.name}`,
    tl.width / 2,
    92 * s,
    32 * s,
    theme.tone.secondary,
    theme.onTone.secondary,
    k,
  );
}

/** When the hook isn't a title card: a pill naming the source for the first seconds (no logo intro, rule 7). */
function sourceTag(ctx: Ctx, tl: Timeline, t: number, theme: Theme, opts: FrameOptions): void {
  const k = prog(t, 0.05, 0.4) * (1 - prog(t, 2.8, 0.4));
  if (k <= 0) return;
  const s = tl.height / 1080;
  const kind = opts.kicker && opts.kicker !== 'Images' ? `${opts.kicker} · ` : '';
  pill(
    ctx,
    `${kind}${tl.title}`.slice(0, 64),
    tl.width / 2,
    92 * s,
    32 * s,
    theme.tone.primary,
    theme.onTone.primary,
    easeOutCubic(k),
  );
}

/** "https://arxiv.org/abs/2310.06825" → "arXiv 2310.06825"; GitHub → "github.com/owner/repo". */
export function prettyOrigin(o: string): string {
  const ax = o.match(/arxiv\.org\/(?:abs|pdf)\/([\w.]+?)(?:v\d+)?(?:\.pdf)?$/i);
  if (ax) return `arXiv ${ax[1]}`;
  const gh = o.match(/github\.com\/([\w.-]+\/[\w.-]+)/i);
  if (gh) return `github.com/${gh[1]}`;
  return o.replace(/^https?:\/\//, '').slice(0, 60);
}

function endCard(ctx: Ctx, tl: Timeline, t: number, theme: Theme, opts: FrameOptions): void {
  const W = tl.width;
  const H = tl.height;
  const s = H / 1080;
  const e = easeOutCubic(prog(t, 0, 0.5));
  ctx.save();
  ctx.globalAlpha = e;
  ctx.textAlign = 'center';
  // the takeaway again (what to remember), then the title and the source
  const last = tl.beats[tl.beats.length - 1]?.beat;
  const take = last?.visual.type === 'takeaway' ? last.visual.text : '';
  let y = H * 0.3;
  pill(
    ctx,
    'Made with Bridge',
    W / 2,
    y,
    30 * s,
    theme.tone.primary,
    theme.onTone.primary,
    clamp01(easeOutBack(prog(t, 0.15, 0.4))),
  );
  y += 90 * s;
  if (take) {
    const tf = fitFont(ctx, take, W * 0.8, 2, 64 * s, 44 * s, 700, 'display');
    ctx.font = font(tf.px, 700, 'display');
    ctx.fillStyle = theme.ink;
    tf.lines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * tf.px * 1.15));
    y += tf.lines.length * tf.px * 1.15 + 50 * s;
  }
  const f = fitFont(ctx, tl.title, W * 0.8, 1, 44 * s, 34 * s, 600, 'sans');
  ctx.font = font(f.px, 600, 'sans');
  ctx.fillStyle = theme.muted;
  ctx.fillText(f.lines[0] ?? '', W / 2, y);
  y += 56 * s;
  ctx.font = font(34 * s, 600, 'sans');
  if (opts.origin) ctx.fillText(`Source: ${prettyOrigin(opts.origin)}`, W / 2, y);
  ctx.font = font(32 * s, 500, 'sans');
  ctx.fillStyle = theme.muted;
  ctx.fillText('Every claim is traced to the source: see the source map.', W / 2, y + 56 * s);
  ctx.restore();
}
