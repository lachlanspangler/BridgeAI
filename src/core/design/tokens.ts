/**
 * The Bridge design system: one palette, one type scale, one motion vocabulary, shared by the web app (CSS
 * variables are generated from this file) and every video frame. Rules (docs/research/EXPLAINER_CRAFT.md):
 * five semantic colours + neutrals; a colour always means the same thing; on-screen text ≥ 4.5:1 contrast;
 * colour is never the only signal (positive/negative also get ✓/✗ glyphs).
 */
import type { Tone } from '../schema.ts';

export interface Theme {
  name: string;
  bg: [string, string, string];
  glow: string[];
  ink: string;
  muted: string;
  faint: string;
  panel: string;
  panelEdge: string;
  tone: Record<Tone, string>;
  /** Text colour to put on top of a tone fill. */
  onTone: Record<Tone, string>;
  caption: { bg: string; ink: string; active: string };
  code: { bg: string; keyword: string; string: string; number: string; comment: string; fn: string; ink: string; type: string };
}

export const NIGHT: Theme = {
  name: 'night',
  bg: ['#0B0D21', '#151338', '#24124A'],
  glow: ['#4CC9F0', '#F72585', '#FFC93C', '#7B61FF', '#2EC4B6'],
  ink: '#F7F5FF',
  muted: '#B9B6DA',
  faint: '#6E6A9E',
  panel: 'rgba(255,255,255,0.06)',
  panelEdge: 'rgba(255,255,255,0.14)',
  tone: {
    accent: '#FFC93C', // the one thing to look at: key words, the number, the takeaway
    primary: '#4CC9F0', // concepts, main nodes, our method
    secondary: '#B388FF', // supporting concepts, the "other" side
    positive: '#2EC4B6', // better / gains (+ ✓)
    negative: '#FF6B6B', // worse / problems (+ ✗)
    neutral: '#8F8BB8',
  },
  onTone: {
    accent: '#1A1440',
    primary: '#071A2B',
    secondary: '#160B33',
    positive: '#04201D',
    negative: '#2A0707',
    neutral: '#0B0D21',
  },
  caption: { bg: 'rgba(8,8,24,0.72)', ink: '#F7F5FF', active: '#FFC93C' },
  code: {
    bg: '#0E1030',
    keyword: '#FF7AC6',
    string: '#9EF0A9',
    number: '#FFC93C',
    comment: '#6E6A9E',
    fn: '#4CC9F0',
    ink: '#E8E6FF',
    type: '#B388FF',
  },
};

export const FONTS = {
  display: 'Bridge Display', // Space Grotesk 700 (OFL)
  sans: 'Bridge Sans', // Inter 400/600/800 (OFL)
  mono: 'Bridge Mono', // JetBrains Mono 500/700 (OFL)
} as const;

/** Font files (from @fontsource, OFL) → family + weight. Both the renderer and the web app register these. */
export const FONT_FILES: { family: string; weight: number; file: string }[] = [
  { family: FONTS.display, weight: 700, file: 'space-grotesk/files/space-grotesk-latin-700-normal.woff2' },
  { family: FONTS.display, weight: 500, file: 'space-grotesk/files/space-grotesk-latin-500-normal.woff2' },
  { family: FONTS.sans, weight: 400, file: 'inter/files/inter-latin-400-normal.woff2' },
  { family: FONTS.sans, weight: 600, file: 'inter/files/inter-latin-600-normal.woff2' },
  { family: FONTS.sans, weight: 800, file: 'inter/files/inter-latin-800-normal.woff2' },
  { family: FONTS.mono, weight: 500, file: 'jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2' },
  { family: FONTS.mono, weight: 700, file: 'jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2' },
];

/** Type scale in px at 1080p (scaled by height/1080). Minimum on-screen size is `caption`. */
export const TYPE = {
  kicker: 30,
  caption: 42,
  small: 40,
  body: 58,
  title: 84,
  headline: 104,
  display: 132,
  number: 300,
} as const;

/** Motion tokens (seconds). */
export const MOTION = {
  enter: 0.5,
  exit: 0.3,
  stagger: 0.09,
  transition: 0.35,
  pop: 0.38,
} as const;

/** Layout safe area (fraction of width/height) so captions and the progress bar never collide with content. */
export const SAFE = { x: 0.07, top: 0.11, bottom: 0.2 } as const;

// ── contrast helpers (WCAG 2.x) ──
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

export function withAlpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

/** CSS custom properties for the web app, generated from the same tokens. */
export function cssVariables(t: Theme = NIGHT): string {
  const lines = [
    `--bg0:${t.bg[0]}`,
    `--bg1:${t.bg[1]}`,
    `--bg2:${t.bg[2]}`,
    `--ink:${t.ink}`,
    `--muted:${t.muted}`,
    `--faint:${t.faint}`,
    `--panel:${t.panel}`,
    `--panel-edge:${t.panelEdge}`,
    ...Object.entries(t.tone).map(([k, v]) => `--${k}:${v}`),
    ...Object.entries(t.onTone).map(([k, v]) => `--on-${k}:${v}`),
    `--font-display:'${FONTS.display}',system-ui,sans-serif`,
    `--font-sans:'${FONTS.sans}',system-ui,sans-serif`,
    `--font-mono:'${FONTS.mono}',ui-monospace,monospace`,
  ];
  return `:root{${lines.join(';')}}`;
}
