/**
 * Drawing kit shared by every scene: easing, text layout (wrap, fit, rich text with highlighter swipes),
 * shapes, and the ambient background. Everything is a pure function of time, so any frame can be drawn in
 * any order (golden-frame tests, scrubbing in the browser preview).
 */
import { FONTS, NIGHT, withAlpha, type Theme } from '../design/tokens.ts';
import { Rng } from '../rng.ts';

export type Ctx = CanvasRenderingContext2D;

export interface Img {
  image: CanvasImageSource;
  width: number;
  height: number;
}

// ───────────── easing ─────────────
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOutCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;
export const easeInCubic = (t: number): number => clamp01(t) ** 3;
export const easeInOutCubic = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const easeOutBack = (t: number, s = 1.7): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const x = t - 1;
  return 1 + (s + 1) * x * x * x + s * x * x;
};
export const easeOutElastic = (t: number): number => {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  return 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};
/** Progress of an animation that starts at `start` and lasts `dur` (seconds), at time t. */
export const prog = (t: number, start: number, dur: number): number =>
  clamp01((t - start) / Math.max(1e-6, dur));

// ───────────── fonts ─────────────
export type Family = 'display' | 'sans' | 'mono';
export const font = (px: number, weight: number, family: Family = 'sans'): string =>
  `${weight} ${Math.round(px)}px "${FONTS[family]}"`;

// ───────────── text layout ─────────────
export function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest font size (≤ max, ≥ min) at which text wraps into ≤ maxLines lines within maxWidth. */
export function fitFont(
  ctx: Ctx,
  text: string,
  maxWidth: number,
  maxLines: number,
  maxPx: number,
  minPx: number,
  weight: number,
  family: Family = 'sans',
): { px: number; lines: string[] } {
  for (let px = maxPx; px >= minPx; px -= 4) {
    ctx.font = font(px, weight, family);
    const lines = wrap(ctx, text, maxWidth);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length <= maxLines && widest <= maxWidth) return { px, lines };
  }
  // never drop words silently: shrink a little further, then keep every line (an extra line beats a lie)
  for (let px = minPx - 2; px >= minPx * 0.75; px -= 2) {
    ctx.font = font(px, weight, family);
    const lines = wrap(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { px, lines };
  }
  const px = Math.round(minPx * 0.75);
  ctx.font = font(px, weight, family);
  return { px, lines: wrap(ctx, text, maxWidth) };
}

const norm = (w: string): string =>
  w
    .toLowerCase()
    .replace(/[^a-z0-9%.-]/g, '')
    .replace(/\.$/, '');

export interface RichWord {
  text: string;
  x: number;
  y: number;
  w: number;
  line: number;
  index: number;
  highlight: boolean;
}

/** Lay out words with wrapping; mark the ones that match any highlight phrase (multi-word supported). */
export function layoutWords(
  ctx: Ctx,
  text: string,
  maxWidth: number,
  lineHeight: number,
  highlights: string[],
): RichWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  const hl = new Set<number>();
  const normWords = words.map(norm);
  for (const phrase of highlights) {
    const p = phrase.split(/\s+/).map(norm).filter(Boolean);
    if (!p.length) continue;
    for (let i = 0; i + p.length <= normWords.length; i++) {
      if (
        p.every(
          (pw, k) => normWords[i + k] === pw || normWords[i + k]!.replace(/s$/, '') === pw.replace(/s$/, ''),
        )
      ) {
        for (let k = 0; k < p.length; k++) hl.add(i + k);
      }
    }
  }
  const space = ctx.measureText(' ').width;
  const out: RichWord[] = [];
  let x = 0;
  let line = 0;
  words.forEach((w, i) => {
    const ww = ctx.measureText(w).width;
    if (x > 0 && x + ww > maxWidth) {
      x = 0;
      line++;
    }
    out.push({ text: w, x, y: line * lineHeight, w: ww, line, index: i, highlight: hl.has(i) });
    x += ww + space;
  });
  return out;
}

/** Width of each line in a word layout (for centring). */
export function lineWidths(ws: RichWord[]): number[] {
  const widths: number[] = [];
  for (const w of ws) widths[w.line] = Math.max(widths[w.line] ?? 0, w.x + w.w);
  return widths;
}

// ───────────── shapes ─────────────
export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function panel(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  theme: Theme,
  fill?: string,
): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill ?? theme.panel;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = theme.panelEdge;
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function pill(
  ctx: Ctx,
  text: string,
  cx: number,
  cy: number,
  px: number,
  fill: string,
  ink: string,
  alpha = 1,
): number {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = font(px, 800, 'sans');
  const spaced = text.toUpperCase().split('').join(' ');
  const w = ctx.measureText(spaced).width + px * 1.4;
  const h = px * 1.9;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(spaced, cx, cy + px * 0.04);
  ctx.restore();
  return w;
}

export function arrow(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  p: number,
  color: string,
  width: number,
): void {
  if (p <= 0) return;
  const x = lerp(x1, x2, p);
  const y = lerp(y1, y2, p);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x, y);
  ctx.stroke();
  if (p > 0.15) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const s = width * 3.2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * s * 0.4, y + Math.sin(a) * s * 0.4);
    ctx.lineTo(x - Math.cos(a - 0.5) * s, y - Math.sin(a - 0.5) * s);
    ctx.lineTo(x - Math.cos(a + 0.5) * s, y - Math.sin(a + 0.5) * s);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function check(ctx: Ctx, cx: number, cy: number, r: number, color: string, p: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const pts: [number, number][] = [
    [cx - r * 0.5, cy],
    [cx - r * 0.12, cy + r * 0.38],
    [cx + r * 0.55, cy - r * 0.4],
  ];
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  const e = clamp01(p);
  if (e < 0.4) {
    const k = e / 0.4;
    ctx.lineTo(lerp(pts[0]![0], pts[1]![0], k), lerp(pts[0]![1], pts[1]![1], k));
  } else {
    ctx.lineTo(pts[1]![0], pts[1]![1]);
    const k = (e - 0.4) / 0.6;
    ctx.lineTo(lerp(pts[1]![0], pts[2]![0], k), lerp(pts[1]![1], pts[2]![1], k));
  }
  ctx.stroke();
  ctx.restore();
}

// ───────────── background ─────────────
/** Ambient background: deep gradient, three slow glowing blobs in palette colours, a faint dot grid. */
export function background(
  ctx: Ctx,
  W: number,
  H: number,
  t: number,
  seed: number,
  theme: Theme = NIGHT,
  mood = 0,
): void {
  const g = ctx.createLinearGradient(0, 0, W * 0.6, H * 1.2);
  g.addColorStop(0, theme.bg[0]);
  g.addColorStop(0.55, theme.bg[1]);
  g.addColorStop(1, theme.bg[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const rng = new Rng(seed);
  const colors = [...theme.glow];
  // rotate palette by mood so different beats tint differently, smoothly
  for (let i = 0; i < 3; i++) {
    const c = colors[(i + Math.floor(mood)) % colors.length]!;
    const bx = rng.range(0.1, 0.9) * W + Math.sin(t * 0.13 + i * 2.1) * W * 0.08;
    const by = rng.range(0.1, 0.9) * H + Math.cos(t * 0.11 + i * 1.7) * H * 0.1;
    const r = rng.range(0.35, 0.55) * W;
    const rg = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    rg.addColorStop(0, withAlpha(c, 0.16));
    rg.addColorStop(1, withAlpha(c, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
  // dot grid, drifting slowly
  const step = Math.round(H / 18);
  const off = (t * 6) % step;
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  for (let y = -step + off; y < H + step; y += step) {
    for (let x = -step + off * 0.5; x < W + step; x += step) {
      ctx.fillRect(x, y, 2, 2);
    }
  }
  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}
