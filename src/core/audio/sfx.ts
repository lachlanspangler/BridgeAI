/** Sound effects synthesized in code: whoosh, pop, tick, riser, impact, click, chime. Each < 300 ms except riser/chime. */
import type { SfxKind } from '../schema.ts';
import { addInto, bandpass, decay, envelope, highpass, lowpass, noise, osc, SR } from './dsp.ts';

export function sfx(kind: SfxKind, seed = 1, sr = SR): Float32Array {
  switch (kind) {
    case 'whoosh': {
      const n = Math.round(0.38 * sr);
      const sig = noise(n, seed);
      bandpass(sig, sr, (i) => 300 + 3200 * Math.sin((Math.PI * i) / n), 1.4);
      const env = envelope(n, sr, 0.16, 0.05, 0.9, 0.16);
      for (let i = 0; i < n; i++) sig[i] = sig[i]! * env[i]! * 2.2;
      return sig;
    }
    case 'pop': {
      const n = Math.round(0.14 * sr);
      const sig = osc(n, sr, (i) => 280 + 700 * Math.exp(-i / (0.012 * sr)), 'sine');
      const env = decay(n, sr, 0.035, 0.001);
      for (let i = 0; i < n; i++) sig[i] = sig[i]! * env[i]!;
      return sig;
    }
    case 'tick': {
      const n = Math.round(0.03 * sr);
      const sig = highpass(noise(n, seed + 3), sr, 3000);
      const env = decay(n, sr, 0.006);
      for (let i = 0; i < n; i++) sig[i] = sig[i]! * env[i]!;
      addInto(sig, osc(n, sr, 2200, 'sine'), 0.3);
      return sig;
    }
    case 'click': {
      const n = Math.round(0.02 * sr);
      const sig = osc(n, sr, 1500, 'sine');
      const env = decay(n, sr, 0.004);
      for (let i = 0; i < n; i++) sig[i] = sig[i]! * env[i]!;
      return sig;
    }
    case 'riser': {
      const n = Math.round(1.2 * sr);
      const sig = noise(n, seed + 9);
      bandpass(sig, sr, (i) => 400 + 5000 * (i / n) ** 2, 2);
      const tone = osc(n, sr, (i) => 220 + 660 * (i / n) ** 1.5, 'sine');
      addInto(sig, tone, 0.25);
      for (let i = 0; i < n; i++) sig[i] = sig[i]! * (i / n) ** 2 * 0.9;
      return sig;
    }
    case 'impact': {
      const n = Math.round(0.5 * sr);
      const sig = osc(n, sr, (i) => 48 + 70 * Math.exp(-i / (0.04 * sr)), 'sine');
      const env = decay(n, sr, 0.16, 0.002);
      for (let i = 0; i < n; i++) sig[i] = Math.tanh(sig[i]! * env[i]! * 1.8);
      const burst = lowpass(noise(n, seed + 21), sr, 1800);
      const be = decay(n, sr, 0.04);
      for (let i = 0; i < n; i++) sig[i]! += burst[i]! * be[i]! * 0.5;
      return sig;
    }
    case 'chime': {
      const n = Math.round(1.1 * sr);
      const sig = new Float32Array(n);
      for (const [f, g, tau] of [
        [1046.5, 0.5, 0.5],
        [1568, 0.3, 0.35],
        [2637, 0.12, 0.2],
        [1318.5, 0.25, 0.6],
      ] as const) {
        const o = osc(n, sr, f, 'sine');
        const e = decay(n, sr, tau, 0.003);
        for (let i = 0; i < n; i++) sig[i]! += o[i]! * e[i]! * g;
      }
      return sig;
    }
  }
}
