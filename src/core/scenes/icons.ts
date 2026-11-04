/**
 * A small vector icon set drawn in code (no assets, no licences), and a keyword → icon matcher. Icons give
 * statement and takeaway beats a concrete picture (dual coding) without needing image generation.
 * Each icon draws in a unit box [-1, 1]² with strokes; `p` (0..1) animates the stroke on.
 */
import type { Ctx } from './kit.ts';

type Draw = (ctx: Ctx) => void;

const line = (ctx: Ctx, pts: [number, number][]) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
};
const circle = (ctx: Ctx, x: number, y: number, r: number, fill = false) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) ctx.fill();
  else ctx.stroke();
};
const rect = (ctx: Ctx, x: number, y: number, w: number, h: number, r = 0.12) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.stroke();
};

export const ICONS: Record<string, Draw> = {
  bolt: (c) =>
    line(c, [
      [0.15, -0.9],
      [-0.45, 0.1],
      [0.05, 0.1],
      [-0.15, 0.9],
      [0.45, -0.15],
      [-0.05, -0.15],
      [0.15, -0.9],
    ]),
  clock: (c) => {
    circle(c, 0, 0, 0.82);
    line(c, [
      [0, -0.5],
      [0, 0],
      [0.38, 0.22],
    ]);
  },
  chart: (c) => {
    line(c, [
      [-0.8, -0.8],
      [-0.8, 0.8],
      [0.85, 0.8],
    ]);
    rect(c, -0.55, 0.15, 0.3, 0.55, 0.05);
    rect(c, -0.1, -0.2, 0.3, 0.9, 0.05);
    rect(c, 0.35, -0.6, 0.3, 1.3, 0.05);
  },
  trendUp: (c) => {
    line(c, [
      [-0.85, 0.6],
      [-0.3, 0.05],
      [0.1, 0.35],
      [0.8, -0.5],
    ]);
    line(c, [
      [0.35, -0.55],
      [0.8, -0.5],
      [0.75, -0.05],
    ]);
  },
  brain: (c) => {
    c.beginPath();
    c.ellipse(-0.3, -0.1, 0.45, 0.6, 0, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.ellipse(0.3, -0.1, 0.45, 0.6, 0, 0, Math.PI * 2);
    c.stroke();
    line(c, [
      [0, -0.6],
      [0, 0.6],
    ]);
    line(c, [
      [-0.1, 0.55],
      [-0.1, 0.85],
    ]);
  },
  network: (c) => {
    const pts: [number, number][] = [
      [-0.7, -0.5],
      [0.7, -0.5],
      [0, 0.0],
      [-0.6, 0.65],
      [0.6, 0.65],
    ];
    for (const [a, b] of [
      [0, 2],
      [1, 2],
      [2, 3],
      [2, 4],
      [0, 1],
      [3, 4],
    ] as const)
      line(c, [pts[a]!, pts[b]!]);
    for (const [x, y] of pts) circle(c, x, y, 0.17, true);
  },
  gear: (c) => {
    circle(c, 0, 0, 0.32);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      line(c, [
        [Math.cos(a) * 0.55, Math.sin(a) * 0.55],
        [Math.cos(a) * 0.85, Math.sin(a) * 0.85],
      ]);
    }
    circle(c, 0, 0, 0.6);
  },
  chip: (c) => {
    rect(c, -0.5, -0.5, 1, 1, 0.1);
    rect(c, -0.22, -0.22, 0.44, 0.44, 0.04);
    for (const k of [-0.25, 0, 0.25]) {
      line(c, [
        [k, -0.5],
        [k, -0.8],
      ]);
      line(c, [
        [k, 0.5],
        [k, 0.8],
      ]);
      line(c, [
        [-0.5, k],
        [-0.8, k],
      ]);
      line(c, [
        [0.5, k],
        [0.8, k],
      ]);
    }
  },
  code: (c) => {
    line(c, [
      [-0.35, -0.5],
      [-0.8, 0],
      [-0.35, 0.5],
    ]);
    line(c, [
      [0.35, -0.5],
      [0.8, 0],
      [0.35, 0.5],
    ]);
    line(c, [
      [0.15, -0.7],
      [-0.15, 0.7],
    ]);
  },
  doc: (c) => {
    line(c, [
      [-0.55, -0.85],
      [0.25, -0.85],
      [0.6, -0.5],
      [0.6, 0.85],
      [-0.55, 0.85],
      [-0.55, -0.85],
    ]);
    for (const y of [-0.25, 0.1, 0.45])
      line(c, [
        [-0.3, y],
        [0.35, y],
      ]);
  },
  search: (c) => {
    circle(c, -0.15, -0.15, 0.5);
    line(c, [
      [0.22, 0.22],
      [0.75, 0.75],
    ]);
  },
  bulb: (c) => {
    c.beginPath();
    c.arc(0, -0.2, 0.55, Math.PI * 0.8, Math.PI * 2.2);
    c.lineTo(0.22, 0.5);
    c.lineTo(-0.22, 0.5);
    c.closePath();
    c.stroke();
    line(c, [
      [-0.2, 0.72],
      [0.2, 0.72],
    ]);
  },
  target: (c) => {
    circle(c, 0, 0, 0.8);
    circle(c, 0, 0, 0.5);
    circle(c, 0, 0, 0.18, true);
  },
  layers: (c) => {
    for (const y of [-0.45, 0, 0.45])
      line(c, [
        [-0.8, y],
        [0, y - 0.3],
        [0.8, y],
        [0, y + 0.3],
        [-0.8, y],
      ]);
  },
  eye: (c) => {
    c.beginPath();
    c.moveTo(-0.9, 0);
    c.quadraticCurveTo(0, -0.8, 0.9, 0);
    c.quadraticCurveTo(0, 0.8, -0.9, 0);
    c.stroke();
    circle(c, 0, 0, 0.25, true);
  },
  globe: (c) => {
    circle(c, 0, 0, 0.82);
    c.beginPath();
    c.ellipse(0, 0, 0.35, 0.82, 0, 0, Math.PI * 2);
    c.stroke();
    line(c, [
      [-0.82, 0],
      [0.82, 0],
    ]);
  },
  lock: (c) => {
    rect(c, -0.55, -0.05, 1.1, 0.85, 0.12);
    c.beginPath();
    c.arc(0, -0.15, 0.38, Math.PI, 0);
    c.stroke();
  },
  people: (c) => {
    circle(c, -0.35, -0.35, 0.22);
    circle(c, 0.35, -0.35, 0.22);
    c.beginPath();
    c.arc(-0.35, 0.45, 0.4, Math.PI, 0);
    c.stroke();
    c.beginPath();
    c.arc(0.35, 0.45, 0.4, Math.PI, 0);
    c.stroke();
  },
  database: (c) => {
    c.beginPath();
    c.ellipse(0, -0.55, 0.65, 0.22, 0, 0, Math.PI * 2);
    c.stroke();
    line(c, [
      [-0.65, -0.55],
      [-0.65, 0.55],
    ]);
    line(c, [
      [0.65, -0.55],
      [0.65, 0.55],
    ]);
    c.beginPath();
    c.ellipse(0, 0.55, 0.65, 0.22, 0, 0, Math.PI);
    c.stroke();
    c.beginPath();
    c.ellipse(0, 0, 0.65, 0.22, 0, 0, Math.PI);
    c.stroke();
  },
  translate: (c) => {
    rect(c, -0.85, -0.7, 0.9, 0.8, 0.1);
    rect(c, -0.05, -0.1, 0.9, 0.8, 0.1);
    line(c, [
      [-0.6, -0.45],
      [-0.25, -0.45],
    ]);
    line(c, [
      [0.2, 0.15],
      [0.6, 0.15],
    ]);
  },
  rocket: (c) => {
    c.beginPath();
    c.moveTo(0, -0.9);
    c.quadraticCurveTo(0.45, -0.4, 0.3, 0.4);
    c.lineTo(-0.3, 0.4);
    c.quadraticCurveTo(-0.45, -0.4, 0, -0.9);
    c.stroke();
    circle(c, 0, -0.25, 0.12);
    line(c, [
      [-0.3, 0.2],
      [-0.55, 0.6],
      [-0.25, 0.5],
    ]);
    line(c, [
      [0.3, 0.2],
      [0.55, 0.6],
      [0.25, 0.5],
    ]);
    line(c, [
      [0, 0.5],
      [0, 0.85],
    ]);
  },
  warning: (c) => {
    line(c, [
      [0, -0.8],
      [0.85, 0.7],
      [-0.85, 0.7],
      [0, -0.8],
    ]);
    line(c, [
      [0, -0.25],
      [0, 0.25],
    ]);
    circle(c, 0, 0.45, 0.06, true);
  },
  check: (c) =>
    line(c, [
      [-0.6, 0.05],
      [-0.15, 0.5],
      [0.65, -0.45],
    ]),
  scale: (c) => {
    line(c, [
      [0, -0.8],
      [0, 0.75],
    ]);
    line(c, [
      [-0.7, -0.5],
      [0.7, -0.5],
    ]);
    line(c, [
      [-0.4, 0.75],
      [0.4, 0.75],
    ]);
    c.beginPath();
    c.arc(-0.7, -0.15, 0.25, 0, Math.PI);
    c.stroke();
    c.beginPath();
    c.arc(0.7, -0.15, 0.25, 0, Math.PI);
    c.stroke();
  },
  puzzle: (c) => {
    rect(c, -0.7, -0.7, 1.4, 1.4, 0.15);
    circle(c, 0, -0.7, 0.2);
    circle(c, 0.7, 0, 0.2);
  },
  money: (c) => {
    circle(c, 0, 0, 0.82);
    c.font = '700 1.1px sans-serif';
    line(c, [
      [0.25, -0.35],
      [-0.2, -0.35],
      [-0.3, -0.15],
      [0.25, 0.1],
      [0.3, 0.3],
      [-0.25, 0.35],
    ]);
    line(c, [
      [0, -0.55],
      [0, 0.55],
    ]);
  },
};

/** keyword patterns → icon (first match wins). */
const RULES: [RegExp, keyof typeof ICONS][] = [
  [/\b(fast|faster|speed|quick|latency|parallel|instant)\w*/i, 'bolt'],
  [/\b(time|hours?|days?|minutes?|seconds?|train(ing|s)?)\b/i, 'clock'],
  [/\b(score|accuracy|bleu|benchmark|metric|results?|performance)\b/i, 'chart'],
  [/\b(improv|better|outperform|beats?|gain|increase|grow)\w*/i, 'trendUp'],
  [/\b(attention|focus|look|see|vision|image)\w*/i, 'eye'],
  [/\b(neural|network|graph|nodes?|connect)\w*/i, 'network'],
  [/\b(model|learn|ai|intelligen|think|reason)\w*/i, 'brain'],
  [/\b(gpus?|cpus?|hardware|chip|compute)\b/i, 'chip'],
  [/\b(code|function|api|library|repo|program|script)\w*/i, 'code'],
  [/\b(paper|document|text|read|write|article)\w*/i, 'doc'],
  [/\b(search|find|query|retriev)\w*/i, 'search'],
  [/\b(idea|insight|key|simple|trick)\w*/i, 'bulb'],
  [/\b(goal|target|precise|exact|task)\w*/i, 'target'],
  [/\b(layers?|stack|architecture|levels?)\b/i, 'layers'],
  [/\b(world|global|language|international)\w*/i, 'globe'],
  [/\b(translat)\w*/i, 'translate'],
  [/\b(secur|privacy|private|safe|lock|key)\w*/i, 'lock'],
  [/\b(people|users?|humans?|team|community)\b/i, 'people'],
  [/\b(data|database|storage|memory|cache)\w*/i, 'database'],
  [/\b(launch|deploy|ship|scale|start)\w*/i, 'rocket'],
  [/\b(problem|risk|fail|error|bug|limit|slow)\w*/i, 'warning'],
  [/\b(cost|price|cheap|money|dollar|budget)\w*/i, 'money'],
  [/\b(compar|versus|vs|trade-?off|balance)\w*/i, 'scale'],
  [/\b(config|setting|engine|system|tool)\w*/i, 'gear'],
];

export function iconFor(text: string): keyof typeof ICONS {
  for (const [re, icon] of RULES) if (re.test(text)) return icon;
  return 'bulb';
}

export function drawIcon(
  ctx: Ctx,
  name: string,
  cx: number,
  cy: number,
  size: number,
  color: string,
  p = 1,
): void {
  const draw = ICONS[name] ?? ICONS.bulb!;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 2, size / 2);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 0.12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha *= Math.max(0, Math.min(1, p * 1.4));
  const k = 0.6 + 0.4 * Math.min(1, p);
  ctx.scale(k, k);
  draw(ctx);
  ctx.restore();
}
