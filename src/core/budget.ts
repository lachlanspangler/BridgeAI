/**
 * Length → budget. The chosen length is a hard time budget: it decides the speaking rate, how many ideas fit,
 * how many beats there are and how long each beat may be. Numbers come from docs/research/EXPLAINER_CRAFT.md
 * (audiobooks 150–160 wpm, BBC news 168 wpm; hard cap 2.9 w/s so full captions stay ≤ 17–20 chars/s),
 * checked against Kokoro's measured rate (af_heart ≈ 2.65 words/s at speed 1.05 including sentence pauses).
 */

export interface Budget {
  seconds: number;
  /** Narration words per second at this length. */
  wordsPerSecond: number;
  /** Seconds of the video that carry narration (total minus intro/outro/gaps). */
  speechSeconds: number;
  /** Target narration words for the whole script. */
  words: number;
  ideas: { min: number; max: number };
  beats: { min: number; max: number };
  /** Narration words per beat. */
  wordsPerBeat: { min: number; max: number };
  /** Max on-screen words per beat (signaling, not redundancy). */
  maxScreenWords: number;
  /** Silent lead-in before the first word and tail after the last (end card). */
  leadIn: number;
  tail: number;
  /** Gap between beats. */
  gap: number;
  pace: 'sprint' | 'brisk' | 'steady' | 'deep';
  /** TTS speed multiplier to start from. */
  voiceSpeed: number;
}

interface Anchor {
  s: number;
  wps: number;
  ideas: [number, number];
  beats: [number, number];
  wpb: [number, number];
  screen: number;
  leadIn: number;
  tail: number;
  gap: number;
  pace: Budget['pace'];
  speed: number;
}

/** Calibrated anchors; custom lengths interpolate between them on a log-time scale. */
export const ANCHORS: readonly Anchor[] = [
  // EXPLAINER_CRAFT.md §12 rules 1–5: 2.6/2.5/2.4/2.3 w/s, 40–50 / 125–145 / 380–420 / 620–680 words,
  // 1 / 2–3 / 4–6 / 6–9 ideas, beats 3–5 s (20 s), 4–6 s (1 min), 4–8 s (3–5 min).
  {
    s: 15,
    wps: 2.6,
    ideas: [1, 1],
    beats: [3, 4],
    wpb: [5, 14],
    screen: 7,
    leadIn: 0.3,
    tail: 2.2,
    gap: 0.12,
    pace: 'sprint',
    speed: 1.0,
  },
  {
    s: 20,
    wps: 2.6,
    ideas: [1, 2],
    beats: [4, 5],
    wpb: [5, 14],
    screen: 7,
    leadIn: 0.3,
    tail: 2.5,
    gap: 0.15,
    pace: 'sprint',
    speed: 1.0,
  },
  {
    s: 60,
    wps: 2.5,
    ideas: [2, 3],
    beats: [9, 13],
    wpb: [7, 16],
    screen: 7,
    leadIn: 0.4,
    tail: 2.8,
    gap: 0.25,
    pace: 'brisk',
    speed: 1.0,
  },
  {
    s: 180,
    wps: 2.4,
    ideas: [4, 6],
    beats: [24, 36],
    wpb: [8, 18],
    screen: 7,
    leadIn: 0.5,
    tail: 3.0,
    gap: 0.3,
    pace: 'steady',
    speed: 0.97,
  },
  {
    s: 300,
    wps: 2.3,
    ideas: [6, 9],
    beats: [38, 56],
    wpb: [8, 18],
    screen: 7,
    leadIn: 0.5,
    tail: 3.0,
    gap: 0.3,
    pace: 'deep',
    speed: 0.95,
  },
  {
    s: 600,
    wps: 2.3,
    ideas: [9, 14],
    beats: [70, 110],
    wpb: [8, 18],
    screen: 7,
    leadIn: 0.5,
    tail: 3.0,
    gap: 0.3,
    pace: 'deep',
    speed: 0.95,
  },
];

export const PRESETS = { '20s': 20, '1m': 60, '3m': 180, '5m': 300 } as const;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function budgetFor(seconds: number): Budget {
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`invalid length: ${seconds}`);
  const s = Math.max(10, Math.min(900, seconds));
  let lo = ANCHORS[0]!;
  let hi = ANCHORS[ANCHORS.length - 1]!;
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    if (s >= ANCHORS[i]!.s && s <= ANCHORS[i + 1]!.s) {
      lo = ANCHORS[i]!;
      hi = ANCHORS[i + 1]!;
      break;
    }
  }
  if (s < ANCHORS[0]!.s) hi = lo;
  if (s > ANCHORS[ANCHORS.length - 1]!.s) lo = hi;
  const t = lo === hi ? 0 : (Math.log(s) - Math.log(lo.s)) / (Math.log(hi.s) - Math.log(lo.s));
  const L = (f: (a: Anchor) => number): number => lerp(f(lo), f(hi), t);
  const beatsMin = Math.round(L((a) => a.beats[0]));
  const beatsMax = Math.max(beatsMin, Math.round(L((a) => a.beats[1])));
  const leadIn = L((a) => a.leadIn);
  const tail = L((a) => a.tail);
  const gap = L((a) => a.gap);
  // gaps between beats are silent; estimate with the midpoint beat count
  const beatsMid = (beatsMin + beatsMax) / 2;
  const speechSeconds = Math.max(4, s - leadIn - tail - gap * Math.max(0, beatsMid - 1));
  const wps = L((a) => a.wps);
  return {
    seconds: s,
    wordsPerSecond: round2(wps),
    speechSeconds: round2(speechSeconds),
    words: Math.round(speechSeconds * wps),
    ideas: { min: Math.round(L((a) => a.ideas[0])), max: Math.round(L((a) => a.ideas[1])) },
    beats: { min: beatsMin, max: beatsMax },
    wordsPerBeat: { min: Math.round(L((a) => a.wpb[0])), max: Math.round(L((a) => a.wpb[1])) },
    maxScreenWords: Math.round(L((a) => a.screen)),
    leadIn: round2(leadIn),
    tail: round2(tail),
    gap: round2(gap),
    pace: t < 0.5 ? lo.pace : hi.pace,
    voiceSpeed: round2(L((a) => a.speed)),
  };
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Rough duration of narration text at a budget's rate (before real TTS). */
export function estimateSeconds(words: number, b: Budget): number {
  return words / b.wordsPerSecond;
}

/** Is a measured duration within the ±10% promise? */
export function withinTolerance(actual: number, target: number, tol = 0.1): boolean {
  return Math.abs(actual - target) <= target * tol;
}

export function describeBudget(b: Budget): string {
  const ideas = b.ideas.min === b.ideas.max ? `${b.ideas.min}` : `${b.ideas.min}–${b.ideas.max}`;
  return `${ideas} key idea${b.ideas.max > 1 ? 's' : ''}, about ${b.words} spoken words, ${b.pace} pace`;
}
