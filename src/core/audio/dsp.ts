/** Small DSP toolkit: oscillators, envelopes, filters, a stereo buffer type. Pure TypeScript, deterministic. */

export const SR = 44100;

export interface Stereo {
  l: Float32Array;
  r: Float32Array;
  sampleRate: number;
}

export function stereo(seconds: number, sampleRate = SR): Stereo {
  const n = Math.max(1, Math.ceil(seconds * sampleRate));
  return { l: new Float32Array(n), r: new Float32Array(n), sampleRate };
}

export const midiHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);
export const dbToGain = (db: number): number => 10 ** (db / 20);
export const gainToDb = (g: number): number => 20 * Math.log10(Math.max(1e-12, g));

/** Add a mono signal into a stereo buffer at time t with gain and pan (-1..1, equal power). */
export function addMono(out: Stereo, sig: Float32Array, t: number, gain = 1, pan = 0): void {
  const start = Math.round(t * out.sampleRate);
  const a = ((pan + 1) * Math.PI) / 4;
  const gl = Math.cos(a) * gain * Math.SQRT2;
  const gr = Math.sin(a) * gain * Math.SQRT2;
  const n = out.l.length;
  for (let i = 0; i < sig.length; i++) {
    const j = start + i;
    if (j < 0) continue;
    if (j >= n) break;
    out.l[j]! += sig[i]! * gl;
    out.r[j]! += sig[i]! * gr;
  }
}

/** Deterministic white noise (LCG). */
export function noise(n: number, seed: number): Float32Array {
  const out = new Float32Array(n);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s / 2147483648 - 1;
  }
  return out;
}

/** ADSR-ish envelope (attack, decay to sustain, release at the end), length n samples. */
export function envelope(n: number, sr: number, a: number, d: number, sus: number, r: number): Float32Array {
  const out = new Float32Array(n);
  const A = Math.max(1, Math.round(a * sr));
  const D = Math.max(1, Math.round(d * sr));
  const R = Math.max(1, Math.round(r * sr));
  for (let i = 0; i < n; i++) {
    let v: number;
    if (i < A) v = i / A;
    else if (i < A + D) v = 1 - (1 - sus) * ((i - A) / D);
    else v = sus;
    const fromEnd = n - i;
    if (fromEnd < R) v *= fromEnd / R;
    out[i] = v;
  }
  return out;
}

/** Exponential decay envelope. */
export function decay(n: number, sr: number, tau: number, attack = 0.002): Float32Array {
  const out = new Float32Array(n);
  const A = Math.max(1, Math.round(attack * sr));
  for (let i = 0; i < n; i++) out[i] = (i < A ? i / A : 1) * Math.exp(-i / sr / tau);
  return out;
}

/** One-pole low-pass, in place. cutoff may vary per sample via a function. */
export function lowpass(sig: Float32Array, sr: number, cutoff: number | ((i: number) => number)): Float32Array {
  let y = 0;
  for (let i = 0; i < sig.length; i++) {
    const fc = typeof cutoff === 'number' ? cutoff : cutoff(i);
    const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
    y += a * (sig[i]! - y);
    sig[i] = y;
  }
  return sig;
}

/** One-pole high-pass, in place. */
export function highpass(sig: Float32Array, sr: number, cutoff: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * cutoff) / sr);
  let prevX = 0;
  let y = 0;
  for (let i = 0; i < sig.length; i++) {
    const x = sig[i]!;
    y = a * (y + x - prevX);
    prevX = x;
    sig[i] = y;
  }
  return sig;
}

/** State-variable band-pass with a per-sample centre frequency. */
export function bandpass(sig: Float32Array, sr: number, fc: (i: number) => number, q = 1.2): Float32Array {
  let low = 0;
  let band = 0;
  for (let i = 0; i < sig.length; i++) {
    const f = 2 * Math.sin((Math.PI * Math.min(fc(i), sr / 6)) / sr);
    const high = sig[i]! - low - band / q;
    band += f * high;
    low += f * band;
    sig[i] = band;
  }
  return sig;
}

/** Oscillator with phase accumulation (handles pitch sweeps). shape: sine | tri | saw | square. */
export function osc(n: number, sr: number, hz: number | ((i: number) => number), shape: 'sine' | 'tri' | 'saw' | 'square' = 'sine', phase0 = 0): Float32Array {
  const out = new Float32Array(n);
  let ph = phase0;
  for (let i = 0; i < n; i++) {
    const f = typeof hz === 'number' ? hz : hz(i);
    ph += f / sr;
    ph -= Math.floor(ph);
    let v: number;
    switch (shape) {
      case 'sine':
        v = Math.sin(2 * Math.PI * ph);
        break;
      case 'tri':
        v = 4 * Math.abs(ph - 0.5) - 1;
        break;
      case 'saw':
        v = 2 * ph - 1;
        break;
      case 'square':
        v = ph < 0.5 ? 1 : -1;
        break;
    }
    out[i] = v;
  }
  return out;
}

export function mulInPlace(a: Float32Array, b: Float32Array, gain = 1): Float32Array {
  for (let i = 0; i < a.length; i++) a[i] = a[i]! * (b[i] ?? 0) * gain;
  return a;
}

export function addInto(a: Float32Array, b: Float32Array, gain = 1): Float32Array {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) a[i]! += b[i]! * gain;
  return a;
}

/** Soft saturation. */
export const softClip = (x: number): number => Math.tanh(x);

/** Simple stereo feedback delay ("space"), in place. */
export function stereoDelay(buf: Stereo, time: number, feedback: number, wet: number, damp = 3000): void {
  const d = Math.round(time * buf.sampleRate);
  const d2 = Math.round(time * 1.37 * buf.sampleRate);
  const a = 1 - Math.exp((-2 * Math.PI * damp) / buf.sampleRate);
  const lineL = new Float32Array(buf.l.length);
  const lineR = new Float32Array(buf.r.length);
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < buf.l.length; i++) {
    const inL = buf.l[i]! + (i >= d ? lineR[i - d]! * feedback : 0);
    const inR = buf.r[i]! + (i >= d2 ? lineL[i - d2]! * feedback : 0);
    lpL += a * (inL - lpL);
    lpR += a * (inR - lpR);
    lineL[i] = lpL;
    lineR[i] = lpR;
    buf.l[i]! += (i >= d ? lineL[i - d]! : 0) * wet;
    buf.r[i]! += (i >= d2 ? lineR[i - d2]! : 0) * wet;
  }
}

export function peak(buf: Stereo): number {
  let p = 0;
  for (let i = 0; i < buf.l.length; i++) p = Math.max(p, Math.abs(buf.l[i]!), Math.abs(buf.r[i]!));
  return p;
}

export function scale(buf: Stereo, g: number): void {
  for (let i = 0; i < buf.l.length; i++) {
    buf.l[i] = buf.l[i]! * g;
    buf.r[i] = buf.r[i]! * g;
  }
}

/** Mono RMS envelope with attack/release smoothing (for ducking). */
export function followEnvelope(sig: Float32Array, sr: number, attack = 0.03, release = 0.35): Float32Array {
  const out = new Float32Array(sig.length);
  const aa = Math.exp(-1 / (attack * sr));
  const ar = Math.exp(-1 / (release * sr));
  let e = 0;
  for (let i = 0; i < sig.length; i++) {
    const x = Math.abs(sig[i]!);
    e = x > e ? aa * e + (1 - aa) * x : ar * e + (1 - ar) * x;
    out[i] = e;
  }
  return out;
}
