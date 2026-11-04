/**
 * The visual library: one draw function per Visual type. A scene is a pure function of time within its beat.
 * Every scene moves within 0.5 s of its start and keeps a slow "alive" drift so no frame is static.
 * Sync: highlights and builds key off the word timings of the narration (when a keyword is said, it lights up).
 */
import type { Visual, WordTiming } from '../schema.ts';
import { MOTION, SAFE, TYPE, withAlpha, type Theme } from '../design/tokens.ts';
import {
  arrow,
  check,
  clamp01,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  fitFont,
  font,
  layoutWords,
  lerp,
  lineWidths,
  panel,
  pill,
  prog,
  roundRect,
  wrap,
  type Ctx,
  type Img,
} from './kit.ts';
import { drawIcon, iconFor, ICONS } from './icons.ts';

export interface SceneProps {
  ctx: Ctx;
  W: number;
  H: number;
  /** Seconds since the beat started (can be negative during the incoming transition). */
  t: number;
  /** Beat duration in seconds. */
  dur: number;
  /** Narration window within the beat (seconds from beat start). */
  voice: { start: number; end: number };
  /** Word timings relative to beat start. */
  words: WordTiming[];
  theme: Theme;
  assets: Map<string, Img>;
  seed: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function contentBox(W: number, H: number): Box {
  const x = W * SAFE.x;
  const y = H * SAFE.top;
  return { x, y, w: W - 2 * x, h: H * (1 - SAFE.top - SAFE.bottom) };
}

const normW = (w: string): string =>
  w
    .toLowerCase()
    .replace(/[^a-z0-9%.]/g, '')
    .replace(/\.$/, '');

/** When (beat-relative seconds) is this phrase first spoken? Falls back to `fallback`. */
export function spokenAt(words: WordTiming[], phrase: string, fallback: number): number {
  const p = phrase.split(/\s+/).map(normW).filter(Boolean);
  if (!p.length) return fallback;
  for (let i = 0; i + p.length <= words.length; i++) {
    let ok = true;
    for (let k = 0; k < p.length; k++) {
      const a = normW(words[i + k]!.word);
      const b = p[k]!;
      if (!(
        a === b ||
        a.replace(/s$/, '') === b.replace(/s$/, '') ||
        (b.length > 4 && a.startsWith(b.slice(0, -1)))
      )) {
        ok = false;
        break;
      }
    }
    if (ok) return words[i]!.start;
  }
  return fallback;
}

/** Fraction of the narration spoken at time t (0..1). */
const spoken = (p: SceneProps): number =>
  clamp01((p.t - p.voice.start) / Math.max(0.1, p.voice.end - p.voice.start));

const S = (p: SceneProps): number => p.H / 1080;

// ───────────── rich text with highlighter swipes ─────────────
function richText(
  p: SceneProps,
  text: string,
  highlights: string[],
  box: Box,
  opts: {
    maxPx: number;
    minPx: number;
    maxLines: number;
    weight: number;
    family?: 'display' | 'sans';
    align?: 'left' | 'center';
    enterAt?: number;
    tone?: string;
  },
): { bottom: number } {
  const { ctx } = p;
  const fam = opts.family ?? 'display';
  const fit = fitFont(ctx, text, box.w, opts.maxLines, opts.maxPx, opts.minPx, opts.weight, fam);
  ctx.font = font(fit.px, opts.weight, fam);
  const lh = fit.px * 1.14;
  const ws = layoutWords(ctx, text, box.w, lh, highlights);
  const widths = lineWidths(ws);
  const nLines = (ws[ws.length - 1]?.line ?? 0) + 1;
  const top = box.y + (box.h - nLines * lh) / 2;
  const enterAt = opts.enterAt ?? 0;
  const hlColor = opts.tone ?? p.theme.tone.accent;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  for (const w of ws) {
    const lineOff = opts.align === 'center' ? (box.w - widths[w.line]!) / 2 : 0;
    const x = box.x + lineOff + w.x;
    const y = top + w.y + fit.px;
    const e = easeOutCubic(prog(p.t, enterAt + w.index * MOTION.stagger * 0.6, MOTION.enter));
    if (e <= 0) continue;
    // highlighter swipe behind keywords, timed to when the word is spoken
    if (w.highlight) {
      const at = spokenAt(p.words, w.text, enterAt + 0.4 + w.index * 0.05);
      const sw = easeInOutCubic(prog(p.t, at - 0.05, 0.35));
      if (sw > 0) {
        ctx.save();
        ctx.fillStyle = withAlpha(hlColor, 0.92);
        const pad = fit.px * 0.08;
        ctx.beginPath();
        // slightly skewed marker stroke
        const hx = x - pad;
        const hy = y - fit.px * 0.82;
        const hw = (w.w + pad * 2) * sw;
        const hh = fit.px * 1.0;
        ctx.moveTo(hx + 4, hy + 6);
        ctx.lineTo(hx + hw, hy);
        ctx.lineTo(hx + hw - 4, hy + hh);
        ctx.lineTo(hx, hy + hh - 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = sw > 0.5 ? p.theme.onTone.accent : p.theme.ink;
    } else ctx.fillStyle = p.theme.ink;
    ctx.save();
    ctx.globalAlpha *= e;
    ctx.fillText(w.text, x, y + (1 - e) * fit.px * 0.5);
    ctx.restore();
  }
  return { bottom: top + nLines * lh };
}

// ───────────── scenes ─────────────

function title(p: SceneProps, v: Extract<Visual, { type: 'title' }>): void {
  const { ctx, W, H } = p;
  const s = S(p);
  const b = contentBox(W, H);
  if (v.kicker) {
    const e = easeOutBack(prog(p.t, 0, MOTION.pop));
    pill(
      ctx,
      v.kicker,
      W / 2,
      b.y + b.h * 0.22,
      TYPE.kicker * s,
      p.theme.tone.primary,
      p.theme.onTone.primary,
      clamp01(e),
    );
  }
  const r = richText(
    p,
    v.title,
    [],
    { x: b.x + b.w * 0.05, y: b.y + b.h * 0.28, w: b.w * 0.9, h: b.h * 0.44 },
    {
      maxPx: TYPE.display * s,
      minPx: TYPE.title * s,
      maxLines: 3,
      weight: 700,
      align: 'center',
      enterAt: 0.1,
    },
  );
  // animated underline bar in three tones
  const u = easeInOutCubic(prog(p.t, 0.35, 0.7));
  const uw = W * 0.28 * u;
  const tones = [p.theme.tone.accent, p.theme.tone.secondary, p.theme.tone.primary];
  tones.forEach((c, i) => {
    ctx.fillStyle = c;
    roundRect(ctx, W / 2 - uw / 2 + (i * uw) / 3, r.bottom + 30 * s, uw / 3 - 6 * s, 12 * s, 6 * s);
    ctx.fill();
  });
  if (v.subtitle) {
    ctx.save();
    ctx.globalAlpha = easeOutCubic(prog(p.t, 0.5, 0.5));
    ctx.font = font(TYPE.body * 0.8 * s, 600, 'sans');
    ctx.fillStyle = p.theme.muted;
    ctx.textAlign = 'center';
    ctx.fillText(v.subtitle, W / 2, r.bottom + 110 * s);
    ctx.restore();
  }
  orbiters(p, W / 2, b.y + b.h * 0.5, b.w * 0.48);
}

/** Small orbiting shapes around a centre: decoration that signals "alive" without competing with text. */
function orbiters(p: SceneProps, cx: number, cy: number, r: number): void {
  const { ctx } = p;
  const s = S(p);
  const tones = [p.theme.tone.accent, p.theme.tone.primary, p.theme.tone.secondary, p.theme.tone.positive];
  const appear = easeOutCubic(prog(p.t, 0.2, 0.8));
  tones.forEach((c, i) => {
    const a = p.t * 0.35 + (i * Math.PI) / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.42;
    ctx.save();
    ctx.globalAlpha = 0.55 * appear;
    ctx.fillStyle = c;
    ctx.beginPath();
    if (i % 2) ctx.arc(x, y, 12 * s, 0, Math.PI * 2);
    else roundRect(ctx, x - 11 * s, y - 11 * s, 22 * s, 22 * s, 5 * s);
    ctx.fill();
    ctx.restore();
  });
}

/** A glowing icon disc: tone-filled circle, icon stroked on, a slow orbit ring. */
function iconDisc(
  p: SceneProps,
  name: string,
  cx: number,
  cy: number,
  r: number,
  tone: string,
  enterAt = 0,
): void {
  const { ctx } = p;
  const e = easeOutBack(prog(p.t, enterAt, MOTION.pop + 0.1));
  if (e <= 0) return;
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.6);
  g.addColorStop(0, withAlpha(tone, 0.35 * clamp01(e)));
  g.addColorStop(1, withAlpha(tone, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r * 1.7, cy - r * 1.7, r * 3.4, r * 3.4);
  ctx.beginPath();
  ctx.arc(cx, cy, r * e, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(tone, 0.18);
  ctx.fill();
  ctx.lineWidth = r * 0.04;
  ctx.strokeStyle = tone;
  ctx.stroke();
  // orbit ring with a dot
  const a = p.t * 0.9;
  ctx.strokeStyle = withAlpha(tone, 0.35);
  ctx.lineWidth = r * 0.02;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.22 * e, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = tone;
  ctx.beginPath();
  ctx.arc(cx + Math.cos(a) * r * 1.22 * e, cy + Math.sin(a) * r * 1.22 * e, r * 0.07, 0, Math.PI * 2);
  ctx.fill();
  drawIcon(ctx, name, cx, cy + Math.sin(p.t * 1.6) * r * 0.03, r * 1.05, tone, prog(p.t, enterAt + 0.1, 0.5));
  ctx.restore();
}

function statement(p: SceneProps, v: Extract<Visual, { type: 'statement' }>): void {
  const { W, H } = p;
  const s = S(p);
  const b = contentBox(W, H);
  const icon = v.icon && v.icon in ICONS ? v.icon : iconFor(`${v.highlight.join(' ')} ${v.text}`);
  const r = Math.min(b.h * 0.3, 210 * s);
  iconDisc(p, icon, b.x + r * 1.35, b.y + b.h / 2, r, p.theme.tone.primary, 0);
  richText(
    p,
    v.text,
    v.highlight,
    { x: b.x + r * 3.1, y: b.y, w: b.w - r * 3.1, h: b.h },
    {
      maxPx: TYPE.headline * s,
      minPx: TYPE.body * s,
      maxLines: 4,
      weight: 700,
      enterAt: 0.12,
    },
  );
}

/** Parse a displayed number for count-up: keeps decimals and thousands separators. */
export function countUp(value: string, k: number): string {
  const m = value.match(/^([^\d]*)([\d,]*\.?\d+)(.*)$/);
  if (!m) return value;
  const raw = m[2]!.replace(/,/g, '');
  const target = Number(raw);
  if (!Number.isFinite(target)) return value;
  const decimals = (raw.split('.')[1] ?? '').length;
  const cur = target * easeOutCubic(k);
  let str = cur.toFixed(decimals);
  if (m[2]!.includes(','))
    str = Number(str).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  return `${m[1]}${str}${m[3]}`;
}

function bigNumber(p: SceneProps, v: Extract<Visual, { type: 'bigNumber' }>): void {
  const { ctx, W, H } = p;
  const s = S(p);
  const b = contentBox(W, H);
  const at = spokenAt(p.words, v.value, 0.15);
  const k = prog(p.t, Math.max(0.05, Math.min(at - 0.5, 0.4)), 0.75);
  const pop = easeOutBack(prog(p.t, 0, MOTION.pop));
  const cx = v.compare ? b.x + b.w * 0.34 : W / 2;
  const cy = b.y + b.h * 0.5;
  // glow disc
  ctx.save();
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 380 * s);
  rg.addColorStop(0, withAlpha(p.theme.tone.accent, 0.28 * pop));
  rg.addColorStop(1, withAlpha(p.theme.tone.accent, 0));
  ctx.fillStyle = rg;
  ctx.fillRect(cx - 400 * s, cy - 400 * s, 800 * s, 800 * s);
  ctx.restore();
  const shown = countUp(v.value, k);
  const fit = fitFont(
    ctx,
    v.value + (v.unit ? ` ${v.unit}` : ''),
    (v.compare ? b.w * 0.6 : b.w) * 0.92,
    1,
    TYPE.number * s,
    90 * s,
    700,
    'display',
  );
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(lerp(0.6, 1, pop), lerp(0.6, 1, pop));
  ctx.font = font(fit.px, 700, 'display');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = p.theme.tone.accent;
  const unitPx = fit.px * 0.42;
  const numW = ctx.measureText(v.value).width;
  ctx.font = font(unitPx, 700, 'display');
  const unitW = v.unit ? ctx.measureText(` ${v.unit}`).width : 0;
  ctx.font = font(fit.px, 700, 'display');
  ctx.textAlign = 'left';
  ctx.fillText(shown, -(numW + unitW) / 2, 0);
  if (v.unit) {
    ctx.font = font(unitPx, 700, 'display');
    ctx.fillStyle = p.theme.ink;
    ctx.fillText(` ${v.unit}`, -(numW + unitW) / 2 + numW, fit.px * 0.12);
  }
  ctx.restore();
  // label
  ctx.save();
  ctx.globalAlpha = easeOutCubic(prog(p.t, 0.35, 0.5));
  const lw = (v.compare ? b.w * 0.6 : b.w) * 0.9;
  const lf = fitFont(ctx, v.label, lw, 2, TYPE.body * s, TYPE.small * s, 600, 'sans');
  ctx.font = font(lf.px, 600, 'sans');
  ctx.fillStyle = p.theme.muted;
  ctx.textAlign = 'center';
  lf.lines.forEach((l, i) => ctx.fillText(l, cx, cy + fit.px * 0.62 + i * lf.px * 1.2 + 30 * s));
  ctx.restore();
  if (v.compare) {
    // two bars: the number vs the comparison
    const a = Number(v.value.replace(/[^\d.]/g, ''));
    const c = Number(v.compare.value.replace(/[^\d.]/g, ''));
    const max = Math.max(a, c) || 1;
    const bx = b.x + b.w * 0.7;
    const bw = 110 * s;
    const base = b.y + b.h * 0.82;
    const hMax = b.h * 0.6;
    const g = easeOutCubic(prog(p.t, 0.5, 0.9));
    [
      { val: c, label: v.compare.label, color: p.theme.tone.neutral, x: bx },
      { val: a, label: 'this', color: p.theme.tone.accent, x: bx + bw * 1.6 },
    ].forEach((bar) => {
      const h = (bar.val / max) * hMax * g;
      ctx.fillStyle = bar.color;
      roundRect(ctx, bar.x, base - h, bw, h, 12 * s);
      ctx.fill();
      ctx.font = font(TYPE.small * 0.8 * s, 600, 'sans');
      ctx.fillStyle = p.theme.muted;
      ctx.textAlign = 'center';
      wrap(ctx, bar.label, bw * 1.5).forEach((l, i) =>
        ctx.fillText(l, bar.x + bw / 2, base + 40 * s + i * 36 * s),
      );
    });
  }
}

function bullets(p: SceneProps, v: Extract<Visual, { type: 'bullets' }>): void {
  const { ctx, W, H } = p;
  const s = S(p);
  const b = contentBox(W, H);
  let y = b.y + 20 * s;
  if (v.heading) {
    ctx.save();
    ctx.globalAlpha = easeOutCubic(prog(p.t, 0, MOTION.enter));
    const f = fitFont(ctx, v.heading, b.w, 1, TYPE.title * s, TYPE.body * s, 700, 'display');
    ctx.font = font(f.px, 700, 'display');
    ctx.fillStyle = p.theme.ink;
    ctx.fillText(f.lines[0] ?? '', b.x, y + f.px);
    y += f.px * 1.6;
    ctx.restore();
  }
  const n = v.items.length;
  const rowH = Math.min(190 * s, (b.y + b.h - y) / n);
  y += Math.max(0, (b.y + b.h - y - rowH * n) / 2);
  const tones = [
    p.theme.tone.primary,
    p.theme.tone.accent,
    p.theme.tone.secondary,
    p.theme.tone.positive,
    p.theme.tone.negative,
  ];
  v.items.forEach((item, i) => {
    // reveal each item as the narration reaches it (or when its first word is said)
    const firstWord = item.split(/\s+/)[0] ?? '';
    const evenAt = p.voice.start + (i / n) * (p.voice.end - p.voice.start) * 0.9;
    const at = Math.min(evenAt, spokenAt(p.words, firstWord, evenAt));
    const e = easeOutBack(prog(p.t, i === 0 ? Math.min(at, 0.15) : at - 0.15, MOTION.pop));
    if (e <= 0) return;
    const cy = y + rowH * i + rowH / 2;
    ctx.save();
    ctx.globalAlpha = clamp01(e);
    ctx.translate((1 - clamp01(e)) * -60 * s, 0);
    ctx.fillStyle = tones[i % tones.length]!;
    ctx.beginPath();
    ctx.arc(b.x + 46 * s, cy, 44 * s * clamp01(e), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.theme.onTone.accent;
    ctx.font = font(46 * s, 800, 'sans');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), b.x + 46 * s, cy + 2 * s);
    const f = fitFont(ctx, item, b.w - 150 * s, 2, TYPE.title * s, TYPE.small * s, 700, 'display');
    ctx.font = font(f.px, 700, 'display');
    ctx.fillStyle = p.theme.ink;
    ctx.textAlign = 'left';
    const lh = f.px * 1.12;
    f.lines.forEach((l, k) =>
      ctx.fillText(l, b.x + 130 * s, cy + (k - (f.lines.length - 1) / 2) * lh + f.px * 0.05),
    );
    ctx.restore();
  });
}

function bars(p: SceneProps, v: Extract<Visual, { type: 'bars' }>): void {
  const { ctx, W, H } = p;
  const s = S(p);
  const b = contentBox(W, H);
  ctx.save();
  ctx.globalAlpha = easeOutCubic(prog(p.t, 0, MOTION.enter));
  const tf = fitFont(ctx, v.title, b.w, 1, TYPE.title * s, TYPE.body * s, 700, 'display');
  ctx.font = font(tf.px, 700, 'display');
  ctx.fillStyle = p.theme.ink;
  ctx.fillText(tf.lines[0] ?? '', b.x, b.y + tf.px);
  ctx.restore();
  const top = b.y + tf.px * 1.8;
  const base = b.y + b.h - 70 * s;
  const n = v.bars.length;
  const gapW = b.w / n;
  const bw = Math.min(200 * s, gapW * 0.62);
  const max = Math.max(...v.bars.map((x) => x.value)) || 1;
  // axis
  ctx.strokeStyle = p.theme.faint;
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(b.x, base);
  ctx.lineTo(b.x + b.w * easeOutCubic(prog(p.t, 0, 0.6)), base);
  ctx.stroke();
  v.bars.forEach((bar, i) => {
    const g = easeOutCubic(prog(p.t, 0.25 + i * 0.16, 0.9));
    const h = ((base - top - 60 * s) * bar.value) / max;
    const x = b.x + gapW * i + (gapW - bw) / 2;
    const color = bar.highlight ? p.theme.tone.accent : p.theme.tone.primary;
    ctx.save();
    ctx.globalAlpha = bar.highlight ? 1 : 0.8;
    ctx.fillStyle = color;
    roundRect(ctx, x, base - h * g, bw, h * g, 14 * s);
    ctx.fill();
    ctx.restore();
    ctx.font = font(TYPE.small * s, 700, 'display');
    ctx.fillStyle = bar.highlight ? p.theme.tone.accent : p.theme.ink;
    ctx.textAlign = 'center';
    if (g > 0.05)
      ctx.fillText(
        countUp(fmtNum(bar.value), g) + (v.unit ? ` ${v.unit}` : ''),
        x + bw / 2,
        base - h * g - 18 * s,
      );
    ctx.font = font(TYPE.small * 0.75 * s, 600, 'sans');
    ctx.fillStyle = p.theme.muted;
    wrap(ctx, bar.label, gapW * 0.95)
      .slice(0, 2)
      .forEach((l, k) => ctx.fillText(l, x + bw / 2, base + 42 * s + k * 34 * s));
  });
}

const fmtNum = (x: number): string => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100));

function flow(p: SceneProps, v: Extract<Visual, { type: 'flow' }>): void {
  const { ctx, W, H } = p;
  const s = S(p);
  const b = contentBox(W, H);
  let top = b.y;
  if (v.title) {
    ctx.save();
    ctx.globalAlpha = easeOutCubic(prog(p.t, 0, MOTION.enter));
    const tf = fitFont(ctx, v.title, b.w, 1, TYPE.title * s, TYPE.body * s, 700, 'display');
    ctx.font = font(tf.px, 700, 'display');
    ctx.fillStyle = p.theme.ink;
    ctx.textAlign = 'center';
    ctx.fillText(tf.lines[0] ?? '', W / 2, b.y + tf.px);
    ctx.restore();
    top += tf.px * 1.6;
  }
  const n = v.nodes.length;
  const cols = n <= 4 ? n : Math.ceil(n / 2);
  const rows = n <= 4 ? 1 : 2;
  const cellW = b.w / cols;
  const areaH = b.y + b.h - top;
  const cellH = areaH / rows;
  const nw = Math.min(380 * s, cellW * 0.78);
  const nh = Math.min(170 * s, cellH * 0.6);
  const pos = new Map<string, { x: number; y: number; at: number }>();
  const span = Math.max(0.6, p.voice.end - p.voice.start);
  v.nodes.forEach((node, i) => {
    const r = Math.floor(i / cols);
    const cIdx = r % 2 === 1 ? cols - 1 - (i % cols) : i % cols; // snake layout for 2 rows
    const x = b.x + cellW * cIdx + cellW / 2;
    const y = top + cellH * r + cellH / 2;
    const evenAt = p.voice.start + (i / n) * span * 0.85;
    const at = Math.min(evenAt, spokenAt(p.words, node.label.split(/\s+/)[0] ?? '', evenAt));
    pos.set(node.id, { x, y, at: i === 0 ? Math.min(at, 0.1) : at - 0.1 });
  });
  for (const e of v.edges) {
    const a = pos.get(e.from);
    const c = pos.get(e.to);
    if (!a || !c) continue;
    const start = Math.max(a.at, c.at - 0.35);
    const k = easeInOutCubic(prog(p.t, start, 0.45));
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const padA = Math.abs(ux) > Math.abs(uy) ? nw / 2 + 14 * s : nh / 2 + 14 * s;
    arrow(
      ctx,
      a.x + ux * padA,
      a.y + uy * padA,
      c.x - ux * padA,
      c.y - uy * padA,
      k,
      withAlpha(p.theme.ink, 0.75),
      6 * s,
    );
    if (e.label && k > 0.6) {
      ctx.font = font(30 * s, 600, 'sans');
      ctx.fillStyle = p.theme.muted;
      ctx.textAlign = 'center';
      ctx.fillText(e.label, (a.x + c.x) / 2, (a.y + c.y) / 2 - 22 * s);
    }
  }
  v.nodes.forEach((node) => {
    const q = pos.get(node.id)!;
    const e = easeOutBack(prog(p.t, q.at, MOTION.pop));
    if (e <= 0) return;
    const color = p.theme.tone[node.tone];
    ctx.save();
    ctx.translate(q.x, q.y + Math.sin(p.t * 1.2 + q.x) * 3 * s);
    ctx.scale(e, e);
    ctx.shadowColor = withAlpha(color, 0.5);
    ctx.shadowBlur = 30 * s;
    roundRect(ctx, -nw / 2, -nh / 2, nw, nh, 26 * s);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    const f = fitFont(ctx, node.label, nw - 40 * s, 2, 50 * s, 28 * s, 800, 'sans');
    ctx.font = font(f.px, 800, 'sans');
    ctx.fillStyle = p.theme.onTone[node.tone];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    f.lines.forEach((l, k) => ctx.fillText(l, 0, (k - (f.lines.length - 1) / 2) * f.px * 1.1));
    ctx.restore();
  });
}

function compare(p: SceneProps, v: Extract<Visual, { type: 'compare' }>): void {
  const { ctx, W, H } = p;
  const s = S(p);
  const b = contentBox(W, H);
  const cw = b.w * 0.46;
  const sides = [
    { side: v.left, x: b.x, tone: 'secondary' as const, at: 0 },
    {
      side: v.right,
      x: b.x + b.w - cw,
      tone: 'primary' as const,
      at: Math.max(
        0.25,
        spokenAt(
          p.words,
          v.right.label.split(/\s+/)[0] ?? '',
          p.voice.start + (p.voice.end - p.voice.start) * 0.45,
        ) - 0.2,
      ),
    },
  ];
  sides.forEach(({ side, x, tone, at }, si) => {
    const e = easeOutCubic(prog(p.t, at, MOTION.enter));
    if (e <= 0) return;
    const win = (v.winner === 'left' && si === 0) || (v.winner === 'right' && si === 1);
    ctx.save();
    ctx.globalAlpha = e;
    ctx.translate(0, (1 - e) * 50 * s);
    panel(ctx, x, b.y, cw, b.h, 34 * s, p.theme, win ? withAlpha(p.theme.tone[tone], 0.16) : undefined);
    ctx.fillStyle = p.theme.tone[tone];
    roundRect(ctx, x, b.y, cw, 16 * s, 8 * s);
    ctx.fill();
    const f = fitFont(ctx, side.label, cw - 80 * s, 1, TYPE.title * s, TYPE.body * s, 700, 'display');
    ctx.font = font(f.px, 700, 'display');
    ctx.fillStyle = p.theme.tone[tone];
    ctx.fillText(f.lines[0] ?? '', x + 40 * s, b.y + 50 * s + f.px);
    let y = b.y + 120 * s + f.px * 1.6;
    side.points.forEach((pt, k) => {
      const pe = easeOutCubic(prog(p.t, at + 0.25 + k * 0.25, 0.4));
      ctx.globalAlpha = e * pe;
      const pf = fitFont(ctx, pt, cw - 130 * s, 2, 60 * s, 36 * s, 600, 'sans');
      ctx.font = font(pf.px, 600, 'sans');
      ctx.fillStyle = p.theme.ink;
      pf.lines.forEach((l, li) => ctx.fillText(l, x + 90 * s, y + li * pf.px * 1.18));
      ctx.fillStyle = p.theme.tone[tone];
      ctx.beginPath();
      ctx.arc(x + 58 * s, y - pf.px * 0.32, 13 * s, 0, Math.PI * 2);
      ctx.fill();
      y += pf.lines.length * pf.px * 1.18 + 40 * s;
    });
    if (win) {
      const ce = prog(p.t, at + 0.9, 0.5);
      ctx.globalAlpha = e;
      ctx.fillStyle = p.theme.tone.positive;
      ctx.beginPath();
      ctx.arc(x + cw - 70 * s, b.y + 80 * s, 40 * s * easeOutBack(ce), 0, Math.PI * 2);
      ctx.fill();
      check(ctx, x + cw - 70 * s, b.y + 80 * s, 36 * s, p.theme.onTone.positive, ce);
    }
    ctx.restore();
  });
  // "vs" badge
  const ve = easeOutBack(prog(p.t, 0.3, MOTION.pop));
  ctx.save();
  ctx.translate(W / 2, b.y + b.h / 2);
  ctx.scale(ve, ve);
  ctx.fillStyle = p.theme.tone.accent;
  ctx.beginPath();
  ctx.arc(0, 0, 54 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = font(44 * s, 800, 'sans');
  ctx.fillStyle = p.theme.onTone.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('vs', 0, 2 * s);
  ctx.restore();
}

function quote(p: SceneProps, v: Extract<Visual, { type: 'quote' }>): void {
  const { ctx, W, H } = p;
  const s = S(p);
  const b = contentBox(W, H);
  ctx.save();
  ctx.globalAlpha = easeOutCubic(prog(p.t, 0, 0.4));
  ctx.font = font(320 * s, 700, 'display');
  ctx.fillStyle = withAlpha(p.theme.tone.secondary, 0.5);
  ctx.fillText('“', b.x - 20 * s, b.y + 250 * s);
  ctx.restore();
  const r = richText(
    p,
    v.text,
    [],
    { x: b.x + 120 * s, y: b.y, w: b.w - 160 * s, h: b.h * 0.85 },
    {
      maxPx: TYPE.title * s,
      minPx: TYPE.small * s,
      maxLines: 5,
      weight: 500,
      family: 'display',
      enterAt: 0.1,
    },
  );
  if (v.cite) {
    ctx.save();
    ctx.globalAlpha = easeOutCubic(prog(p.t, 0.6, 0.5));
    ctx.font = font(TYPE.small * s, 600, 'sans');
    ctx.fillStyle = p.theme.tone.secondary;
    ctx.fillText(`— ${v.cite}`, b.x + 120 * s, Math.min(b.y + b.h, r.bottom + 70 * s));
    ctx.restore();
  }
}

// ── code ──
const KW =
  /^(const|let|var|function|return|if|else|for|while|import|from|export|class|def|async|await|new|try|catch|throw|in|of|type|interface|public|private|static|fn|pub|use|mod|struct|impl|match|package|func|go|defer|with|as|lambda|yield|None|True|False|null|true|false|undefined|this|self)$/;

export interface Tok {
  text: string;
  kind: 'kw' | 'str' | 'num' | 'com' | 'fn' | 'type' | 'ink';
}
export function tokenize(line: string): Tok[] {
  const out: Tok[] = [];
  const re =
    /(\/\/.*|#.*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\w\s])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[1]) out.push({ text: m[1], kind: 'com' });
    else if (m[2]) out.push({ text: m[2], kind: 'str' });
    else if (m[3]) out.push({ text: m[3], kind: 'num' });
    else if (m[4]) {
      const rest = line.slice(re.lastIndex);
      const kind = KW.test(m[4]) ? 'kw' : /^\s*\(/.test(rest) ? 'fn' : /^[A-Z]/.test(m[4]) ? 'type' : 'ink';
      out.push({ text: m[4], kind });
    } else out.push({ text: m[5] ?? m[6] ?? '', kind: 'ink' });
  }
  return out;
}

function code(p: SceneProps, v: Extract<Visual, { type: 'code' }>): void {
  const { ctx, W, H } = p;
  const s = S(p);
  const b = contentBox(W, H);
  const lines = v.code.replace(/\t/g, '  ').split('\n').slice(0, 14);
  const longest = Math.max(...lines.map((l) => l.length), 20);
  const px = Math.max(
    28 * s,
    Math.min(64 * s, (b.w - 120 * s) / (longest * 0.62), (b.h - 140 * s) / (lines.length * 1.5)),
  );
  const lh = px * 1.5;
  const winW = Math.min(b.w, longest * px * 0.62 + 140 * s);
  const winH = Math.min(b.h, lines.length * lh + 130 * s);
  const x = W / 2 - winW / 2;
  const y = b.y + (b.h - winH) / 2;
  const e = easeOutCubic(prog(p.t, 0, MOTION.enter));
  ctx.save();
  ctx.globalAlpha = e;
  ctx.translate(0, (1 - e) * 40 * s);
  panel(ctx, x, y, winW, winH, 26 * s, p.theme, p.theme.code.bg);
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x + 40 * s + i * 34 * s, y + 38 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();
  });
  if (v.caption) {
    ctx.font = font(26 * s, 600, 'sans');
    ctx.fillStyle = p.theme.faint;
    ctx.textAlign = 'center';
    ctx.fillText(v.caption, x + winW / 2, y + 46 * s);
    ctx.textAlign = 'left';
  }
  // typing: characters per second scaled so typing ends by 60% of the narration
  const total = lines.reduce((n, l) => n + l.length + 1, 0);
  const typeEnd = Math.max(0.8, p.voice.start + (p.voice.end - p.voice.start) * 0.6);
  const shown = Math.floor(total * clamp01(p.t / typeEnd));
  let budget = shown;
  ctx.font = font(px, 500, 'mono');
  const colors = {
    kw: p.theme.code.keyword,
    str: p.theme.code.string,
    num: p.theme.code.number,
    com: p.theme.code.comment,
    fn: p.theme.code.fn,
    type: p.theme.code.type,
    ink: p.theme.code.ink,
  };
  lines.forEach((line, i) => {
    const ly = y + 100 * s + i * lh;
    const focused = v.focus.includes(i + 1);
    if (focused) {
      const fe = easeInOutCubic(prog(p.t, typeEnd, 0.5));
      ctx.fillStyle = withAlpha(p.theme.tone.accent, 0.16 * fe);
      ctx.fillRect(x + 12 * s, ly - px * 0.95, (winW - 24 * s) * fe, lh);
      ctx.fillStyle = withAlpha(p.theme.tone.accent, fe);
      ctx.fillRect(x + 12 * s, ly - px * 0.95, 6 * s, lh);
    }
    ctx.fillStyle = p.theme.faint;
    ctx.fillText(String(i + 1).padStart(2, ' '), x + 26 * s, ly);
    let cx = x + 26 * s + px * 0.62 * 3.5;
    for (const tk of tokenize(line)) {
      if (budget <= 0) break;
      const txt = tk.text.slice(0, budget);
      budget -= txt.length;
      ctx.fillStyle = colors[tk.kind];
      ctx.fillText(txt, cx, ly);
      cx += ctx.measureText(txt).width;
    }
    budget -= 1;
    // caret
    if (budget < 0 && budget > -2 && Math.floor(p.t * 2.5) % 2 === 0) {
      ctx.fillStyle = p.theme.tone.accent;
      ctx.fillRect(cx + 2, ly - px * 0.8, px * 0.5, px);
    }
  });
  ctx.restore();
}

function figure(p: SceneProps, v: Extract<Visual, { type: 'figure' }>): void {
  const { ctx, W, H } = p;
  const s = S(p);
  const b = contentBox(W, H);
  const img = p.assets.get(v.assetId);
  const capH = v.caption ? 110 * s : 0;
  const maxW = b.w * 0.92;
  const maxH = b.h - capH;
  const e = easeOutCubic(prog(p.t, 0, MOTION.enter));
  if (!img) {
    statement(p, { type: 'statement', text: v.caption ?? 'Figure', highlight: [] });
    return;
  }
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = W / 2 - w / 2;
  const y = b.y + (maxH - h) / 2;
  ctx.save();
  ctx.globalAlpha = e;
  ctx.translate(0, (1 - e) * 40 * s);
  // white card so paper figures (often black-on-white) stay legible on the dark theme
  panel(ctx, x - 24 * s, y - 24 * s, w + 48 * s, h + 48 * s, 24 * s, p.theme, '#FFFFFF');
  ctx.save();
  roundRect(ctx, x, y, w, h, 10 * s);
  ctx.clip();
  // Ken Burns: slow zoom toward the focus region (or centre)
  // no focus given: a slow tour (zoom in on the top half, then glide to the bottom half) so long beats keep moving
  const k = easeInOutCubic(prog(p.t, 0.4, Math.max(1.5, p.dur - 0.6)));
  const f = v.focus ?? [0.2, lerp(0.15, 0.55, k), 0.6, 0.3];
  const z = v.focus ? lerp(1, 1.35, k) : lerp(1, 1.22, Math.min(1, k * 2.5));
  const fx = x + (f[0] + f[2] / 2) * w;
  const fy = y + (f[1] + f[3] / 2) * h;
  ctx.translate(fx, fy);
  ctx.scale(z, z);
  ctx.translate(-fx, -fy);
  ctx.drawImage(img.image, x, y, w, h);
  if (v.focus) {
    const he = easeInOutCubic(prog(p.t, 0.8, 0.5));
    ctx.strokeStyle = withAlpha(p.theme.tone.accent, he);
    ctx.lineWidth = (8 * s) / z;
    roundRect(ctx, x + f[0] * w, y + f[1] * h, f[2] * w, f[3] * h, 12 * s);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
  if (v.caption) {
    ctx.save();
    ctx.globalAlpha = easeOutCubic(prog(p.t, 0.4, 0.5));
    const cf = fitFont(ctx, v.caption, b.w, 1, TYPE.body * s, TYPE.caption * s, 700, 'display');
    ctx.font = font(cf.px, 700, 'display');
    ctx.fillStyle = p.theme.ink;
    ctx.textAlign = 'center';
    ctx.fillText(cf.lines[0] ?? '', W / 2, b.y + b.h - 20 * s);
    ctx.restore();
  }
}

function tree(p: SceneProps, v: Extract<Visual, { type: 'tree' }>): void {
  const { ctx, W, H } = p;
  const s = S(p);
  const b = contentBox(W, H);
  let top = b.y;
  if (v.title) {
    const tf = fitFont(ctx, v.title, b.w, 1, TYPE.title * s, TYPE.body * s, 700, 'display');
    ctx.save();
    ctx.globalAlpha = easeOutCubic(prog(p.t, 0, MOTION.enter));
    ctx.font = font(tf.px, 700, 'display');
    ctx.fillStyle = p.theme.ink;
    ctx.fillText(tf.lines[0] ?? '', b.x, b.y + tf.px);
    ctx.restore();
    top += tf.px * 1.6;
  }
  const lh = Math.min(96 * s, (b.y + b.h - top) / v.lines.length);
  const px = lh * 0.62;
  v.lines.forEach((line, i) => {
    const e = easeOutCubic(prog(p.t, 0.1 + i * 0.08, 0.35));
    if (e <= 0) return;
    const depth = (line.match(/^\s*/)?.[0].length ?? 0) / 2;
    const name = line.trim();
    const isDir = name.endsWith('/');
    const focused = v.focus.some((f) => name.replace(/\/$/, '') === f.replace(/\/$/, ''));
    const y = top + i * lh + lh * 0.7;
    const x = b.x + 30 * s + depth * 56 * s;
    ctx.save();
    ctx.globalAlpha = e;
    if (focused) {
      const fe = easeInOutCubic(
        prog(p.t, spokenAt(p.words, name.replace(/\/$/, '').split(/[./]/)[0] ?? '', 0.8 + i * 0.1), 0.4),
      );
      ctx.fillStyle = withAlpha(p.theme.tone.accent, 0.2 * fe);
      roundRect(
        ctx,
        x - 16 * s,
        y - lh * 0.72,
        Math.max(200 * s, name.length * px * 0.65 + 80 * s),
        lh * 0.95,
        12 * s,
      );
      ctx.fill();
    }
    ctx.fillStyle = isDir ? p.theme.tone.primary : p.theme.tone.secondary;
    roundRect(ctx, x, y - px * 0.75, px * 0.8, px * 0.8, 5 * s);
    ctx.fill();
    ctx.font = font(px, focused ? 700 : 500, 'mono');
    ctx.fillStyle = focused ? p.theme.tone.accent : p.theme.ink;
    ctx.fillText(name, x + px * 1.3, y);
    ctx.restore();
  });
}

function takeaway(p: SceneProps, v: Extract<Visual, { type: 'takeaway' }>): void {
  const { ctx, W, H } = p;
  const s = S(p);
  const b = contentBox(W, H);
  // expanding rings
  for (let i = 0; i < 3; i++) {
    const k = prog(p.t, 0.1 + i * 0.25, 1.6);
    if (k <= 0 || k >= 1) continue;
    ctx.strokeStyle = withAlpha(
      [p.theme.tone.accent, p.theme.tone.primary, p.theme.tone.secondary][i]!,
      (1 - k) * 0.5,
    );
    ctx.lineWidth = 6 * s;
    ctx.beginPath();
    ctx.arc(W / 2, b.y + b.h / 2, lerp(100, 700, easeOutCubic(k)) * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  pill(
    ctx,
    'The takeaway',
    W / 2,
    b.y + 40 * s,
    TYPE.kicker * s,
    p.theme.tone.accent,
    p.theme.onTone.accent,
    clamp01(easeOutBack(prog(p.t, 0, MOTION.pop))),
  );
  richText(
    p,
    v.text,
    v.highlight,
    { x: b.x + b.w * 0.04, y: b.y + 90 * s, w: b.w * 0.92, h: b.h - 90 * s },
    {
      maxPx: TYPE.headline * s,
      minPx: TYPE.body * s,
      maxLines: 4,
      weight: 700,
      align: 'center',
      enterAt: 0.15,
    },
  );
}

export function drawVisual(p: SceneProps, v: Visual): void {
  switch (v.type) {
    case 'title':
      return title(p, v);
    case 'statement':
      return statement(p, v);
    case 'bigNumber':
      return bigNumber(p, v);
    case 'bullets':
      return bullets(p, v);
    case 'bars':
      return bars(p, v);
    case 'flow':
      return flow(p, v);
    case 'compare':
      return compare(p, v);
    case 'quote':
      return quote(p, v);
    case 'code':
      return code(p, v);
    case 'figure':
      return figure(p, v);
    case 'tree':
      return tree(p, v);
    case 'takeaway':
      return takeaway(p, v);
  }
}

/** Ease helper for scene progress, exported for the frame compositor. */
export { spoken };
