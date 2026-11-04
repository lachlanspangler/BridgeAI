/**
 * Music bed synthesized in code (no samples, no licences). An original, generic pop-explainer bed: a four-chord
 * loop, soft detuned pad, round bass, a plucked arpeggio, light kick + hats at faster paces, and a final
 * tonic chord that rings over the end card. Deterministic per seed. Kept simple and low in the mix: music is
 * extraneous load (EXPLAINER_CRAFT §10), so it supports energy and never competes with the voice.
 */
import { Rng } from '../rng.ts';
import {
  addInto,
  addMono,
  decay,
  envelope,
  highpass,
  lowpass,
  midiHz,
  noise,
  osc,
  SR,
  stereo,
  stereoDelay,
  type Stereo,
} from './dsp.ts';

export type Pace = 'sprint' | 'brisk' | 'steady' | 'deep';

export interface MusicOptions {
  seconds: number;
  pace: Pace;
  seed: number;
  sampleRate?: number;
}

const BPM: Record<Pace, number> = { sprint: 116, brisk: 104, steady: 92, deep: 86 };

// Progressions (scale degrees as semitone offsets from the key root, chord tones relative to the chord root)
const PROGRESSIONS: number[][] = [
  [0, 7, 9, 5], // I V vi IV
  [9, 5, 0, 7], // vi IV I V
  [0, 5, 9, 7], // I IV vi V
  [0, 9, 5, 7], // I vi IV V
];
const KEYS = [57, 60, 62, 55, 53]; // A3 C4 D4 G3 F3 (MIDI) — the key root

function chordTones(root: number, degree: number): number[] {
  const minor = degree === 9 || degree === 2 || degree === 4;
  const base = root + degree;
  return minor ? [base, base + 3, base + 7, base + 10] : [base, base + 4, base + 7, base + 11];
}

export function synthMusic(opts: MusicOptions): Stereo {
  const sr = opts.sampleRate ?? SR;
  const rng = new Rng(opts.seed ^ 0x5eed);
  const bpm = BPM[opts.pace];
  const spb = 60 / bpm;
  const bar = spb * 4;
  const key = KEYS[rng.int(KEYS.length)]! - 12;
  const prog = PROGRESSIONS[rng.int(PROGRESSIONS.length)]!;
  const out = stereo(opts.seconds + 2.5, sr);
  const totalBars = Math.ceil(opts.seconds / bar);
  const energetic = opts.pace === 'sprint' || opts.pace === 'brisk';
  const arpPattern = [0, 2, 1, 3, 2, 1, 3, 2].map((x) => (rng.next() < 0.15 ? (x + 1) % 4 : x));

  for (let b = 0; b < totalBars; b++) {
    const t0 = b * bar;
    const degree = prog[b % prog.length]!;
    const tones = chordTones(key, degree);
    const intro = b === 0;
    const lastBar = b === totalBars - 1;
    // pad: two detuned triangles per chord tone, slow attack, low-passed
    for (const [k, m] of tones.entries()) {
      const len = Math.round((bar + 0.6) * sr);
      const sig = osc(len, sr, midiHz(m + 12), 'tri', rng.next());
      addInto(sig, osc(len, sr, midiHz(m + 12) * 1.004, 'saw', rng.next()), 0.25);
      lowpass(sig, sr, 1400);
      const env = envelope(len, sr, 0.35, 0.4, 0.8, 0.6);
      for (let i = 0; i < len; i++) sig[i] = sig[i]! * env[i]!;
      addMono(out, sig, t0, 0.05, k % 2 ? 0.35 : -0.35);
    }
    if (!intro) {
      // bass: root on beats 1 and 3 (+ an eighth pickup at faster paces)
      const hits = energetic ? [0, 2, 3.5] : [0, 2];
      for (const h of hits) {
        const len = Math.round(spb * (h === 3.5 ? 0.45 : 1.6) * sr);
        const f = midiHz(tones[0]! - 12);
        const sig = osc(len, sr, f, 'sine');
        addInto(sig, osc(len, sr, f * 2, 'tri'), 0.18);
        const env = envelope(len, sr, 0.008, 0.25, 0.55, 0.12);
        for (let i = 0; i < len; i++) sig[i] = Math.tanh(sig[i]! * env[i]! * 1.6);
        addMono(out, sig, t0 + h * spb, 0.2, 0);
      }
      // arpeggio: plucked sines in eighths
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        if (!energetic && i % 2 === 1 && rng.next() < 0.5) continue;
        const m = tones[arpPattern[i]!]! + 24;
        const len = Math.round(0.42 * sr);
        const sig = osc(len, sr, midiHz(m), 'tri');
        addInto(sig, osc(len, sr, midiHz(m) * 2, 'sine'), 0.3);
        const env = decay(len, sr, 0.11);
        for (let j = 0; j < len; j++) sig[j] = sig[j]! * env[j]!;
        lowpass(sig, sr, 3200);
        addMono(out, sig, t0 + (i * spb) / 2, 0.06, i % 2 ? 0.45 : -0.45);
      }
      if (energetic && !lastBar) {
        // kick on 1 and 3, hats on the off-beats
        for (const h of [0, 2]) {
          const len = Math.round(0.28 * sr);
          const sig = osc(len, sr, (i) => 45 + 110 * Math.exp(-i / (0.03 * sr)), 'sine');
          const env = decay(len, sr, 0.09);
          for (let j = 0; j < len; j++) sig[j] = sig[j]! * env[j]!;
          addMono(out, sig, t0 + h * spb, 0.22, 0);
        }
        for (let h = 0; h < 4; h++) {
          const len = Math.round(0.06 * sr);
          const sig = highpass(noise(len, 7000 + b * 13 + h), sr, 7000);
          const env = decay(len, sr, 0.015);
          for (let j = 0; j < len; j++) sig[j] = sig[j]! * env[j]!;
          addMono(out, sig, t0 + (h + 0.5) * spb, 0.05, 0.2);
        }
      }
    }
  }
  // final tonic chord ringing out over the end card
  const endT = totalBars * bar;
  for (const [k, m] of chordTones(key, 0).entries()) {
    const len = Math.round(2.4 * sr);
    const sig = osc(len, sr, midiHz(m + 12), 'tri');
    const env = decay(len, sr, 0.9, 0.01);
    for (let i = 0; i < len; i++) sig[i] = sig[i]! * env[i]!;
    addMono(out, sig, Math.min(endT, opts.seconds) - 0.05, 0.07, k % 2 ? 0.3 : -0.3);
  }
  stereoDelay(out, spb * 0.75, 0.3, 0.22);
  // trim to the requested length with a short fade-out
  const n = Math.round(opts.seconds * sr);
  const fade = Math.round(0.8 * sr);
  const res: Stereo = { l: out.l.slice(0, n), r: out.r.slice(0, n), sampleRate: sr };
  for (let i = 0; i < fade && i < n; i++) {
    const g = i / fade;
    res.l[n - 1 - i] = res.l[n - 1 - i]! * g;
    res.r[n - 1 - i] = res.r[n - 1 - i]! * g;
  }
  // fade in
  const fin = Math.round(0.25 * sr);
  for (let i = 0; i < fin && i < n; i++) {
    res.l[i] = res.l[i]! * (i / fin);
    res.r[i] = res.r[i]! * (i / fin);
  }
  return res;
}
