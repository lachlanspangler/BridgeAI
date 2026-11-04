/**
 * Mixer: voice clips placed on the timeline + music bed (ducked under the voice) + SFX → one stereo master,
 * normalised to −14 LUFS integrated with a −2 dBFS sample-peak ceiling (so the AAC encode stays ≤ −1 dBTP; rule 38).
 * Also: ITU-R BS.1770 integrated loudness (K-weighting, 400 ms blocks, absolute and relative gates).
 */
import type { Timeline } from '../schema.ts';
import { addMono, dbToGain, followEnvelope, peak, scale, SR, stereo, type Stereo } from './dsp.ts';
import { synthMusic, type Pace } from './music.ts';
import { sfx } from './sfx.ts';

export interface MixInput {
  timeline: Timeline;
  /** One mono voice clip per beat (Float32 at `voiceRate`), aligned with timeline.beats. */
  voice: Float32Array[];
  voiceRate: number;
  pace: Pace;
  music: boolean;
  effects: boolean;
  targetLufs?: number;
}

export interface MixResult {
  master: Stereo;
  lufs: number;
  peakDb: number;
  /** Designed voice-vs-music level difference while speaking (dB): the duck depth applied, not a measurement. */
  duckDb: number;
}

/** Linear resample (voice is 24 kHz from Kokoro; master is 44.1 kHz). */
export function resample(sig: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return sig;
  const n = Math.round((sig.length * to) / from);
  const out = new Float32Array(n);
  const ratio = from / to;
  for (let i = 0; i < n; i++) {
    const x = i * ratio;
    const j = Math.floor(x);
    const f = x - j;
    out[i] = (sig[j] ?? 0) * (1 - f) + (sig[j + 1] ?? sig[j] ?? 0) * f;
  }
  return out;
}

export function mix(input: MixInput): MixResult {
  const { timeline: tl } = input;
  const sr = SR;
  const voice = stereo(tl.duration, sr);
  const voiceMono = new Float32Array(voice.l.length);
  tl.beats.forEach((b, i) => {
    const clip = input.voice[i];
    if (!clip) return;
    const sig = resample(clip, input.voiceRate, sr);
    addMono(voice, sig, b.start + b.voiceOffset, 1, 0);
    const start = Math.round((b.start + b.voiceOffset) * sr);
    for (let k = 0; k < sig.length && start + k < voiceMono.length; k++) voiceMono[start + k]! += sig[k]!;
  });
  const master = stereo(tl.duration, sr);
  // voice first (normalise the voice to a reference peak so ducking math is stable)
  const vPeak = peak(voice) || 1;
  const vGain = 0.7 / vPeak;
  for (let i = 0; i < master.l.length; i++) {
    master.l[i] = voice.l[i]! * vGain;
    master.r[i] = voice.r[i]! * vGain;
  }
  let duckDb = Infinity;
  if (input.music) {
    const music = synthMusic({ seconds: tl.duration, pace: input.pace, seed: tl.seed, sampleRate: sr });
    const env = followEnvelope(voiceMono, sr, 0.04, 0.45);
    let envMax = 0;
    for (const e of env) envMax = Math.max(envMax, e);
    // music sits ~20 dB under the voice while speaking, rises ~9 dB in the gaps
    const speaking = dbToGain(-21);
    const gaps = dbToGain(-12);
    const mPeak = peak(music) || 1;
    for (let i = 0; i < master.l.length; i++) {
      const k = envMax > 0 ? Math.min(1, (env[i]! / envMax) * 4) : 0;
      const g = (gaps + (speaking - gaps) * k) * (0.7 / mPeak);
      master.l[i]! += (music.l[i] ?? 0) * g;
      master.r[i]! += (music.r[i] ?? 0) * g;
    }
    duckDb = -20 * Math.log10(speaking / 1);
  }
  if (input.effects) {
    for (const cue of tl.sfx) {
      const sig = sfx(cue.kind, Math.round(cue.t * 1000) + tl.seed, sr);
      addMono(master, sig, cue.t, 0.22 * cue.gain, cue.kind === 'whoosh' ? 0.25 : 0);
    }
  }
  // loudness normalise, then limit
  const target = input.targetLufs ?? -14;
  const lufs0 = integratedLufs(master);
  if (Number.isFinite(lufs0)) scale(master, dbToGain(target - lufs0));
  limit(master, dbToGain(-3.1)); // AAC adds ~1 dB of inter-sample overshoot: aim for ≤ −1.5 dBTP after encode
  const lufs = integratedLufs(master);
  return { master, lufs, peakDb: 20 * Math.log10(peak(master) || 1e-9), duckDb };
}

/** Feed-forward peak limiter with 5 ms lookahead and 80 ms release. */
export function limit(buf: Stereo, ceiling: number): void {
  const sr = buf.sampleRate;
  const look = Math.round(0.005 * sr);
  const rel = Math.exp(-1 / (0.08 * sr));
  const n = buf.l.length;
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(buf.l[i]!), Math.abs(buf.r[i]!));
    need[i] = p > ceiling ? ceiling / p : 1;
  }
  // min over the lookahead window, then smooth release
  let g = 1;
  for (let i = 0; i < n; i++) {
    let m = 1;
    for (let k = 0; k <= look && i + k < n; k += 4) m = Math.min(m, need[i + k]!);
    g = m < g ? m : rel * g + (1 - rel) * m;
    buf.l[i] = buf.l[i]! * g;
    buf.r[i] = buf.r[i]! * g;
  }
  // hard safety clip
  for (let i = 0; i < n; i++) {
    buf.l[i] = Math.max(-ceiling, Math.min(ceiling, buf.l[i]!));
    buf.r[i] = Math.max(-ceiling, Math.min(ceiling, buf.r[i]!));
  }
}

// ── ITU-R BS.1770-4 integrated loudness ──
function biquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i]! + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i]!;
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

function kWeight(x: Float32Array, sr: number): Float32Array {
  // pre-filter (high shelf) and RLB high-pass, coefficients derived for arbitrary sample rate
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / sr);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const s1 = biquad(
    x,
    (Vh + (Vb * K) / Q + K * K) / a0,
    (2 * (K * K - Vh)) / a0,
    (Vh - (Vb * K) / Q + K * K) / a0,
    (2 * (K * K - 1)) / a0,
    (1 - K / Q + K * K) / a0,
  );
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / sr);
  a0 = 1 + K / Q + K * K;
  return biquad(s1, 1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
}

export function integratedLufs(buf: Stereo): number {
  const sr = buf.sampleRate;
  const l = kWeight(buf.l, sr);
  const r = kWeight(buf.r, sr);
  const block = Math.round(0.4 * sr);
  const hop = Math.round(0.1 * sr);
  const powers: number[] = [];
  for (let s = 0; s + block <= l.length; s += hop) {
    let sum = 0;
    for (let i = s; i < s + block; i++) sum += l[i]! * l[i]! + r[i]! * r[i]!;
    powers.push(sum / block);
  }
  const lk = (p: number) => -0.691 + 10 * Math.log10(p);
  const abs = powers.filter((p) => lk(p) > -70);
  if (!abs.length) return -Infinity;
  const meanAbs = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = lk(meanAbs) - 10;
  const gated = abs.filter((p) => lk(p) > rel);
  const mean = gated.reduce((a, b) => a + b, 0) / Math.max(1, gated.length);
  return lk(mean);
}

/** 16-bit PCM WAV bytes (stereo or mono). */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const n = channels[0]!.length;
  const ch = channels.length;
  const data = new Uint8Array(44 + n * ch * 2);
  const v = new DataView(data.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i]!));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return data;
}

/** Decode a 16-bit PCM (or float32) WAV into mono Float32. */
export function decodeWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 12;
  let fmt = { ch: 1, sr: 44100, bits: 16, format: 1 };
  while (o + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.slice(o, o + 4));
    const size = v.getUint32(o + 4, true);
    if (id === 'fmt ')
      fmt = {
        format: v.getUint16(o + 8, true),
        ch: v.getUint16(o + 10, true),
        sr: v.getUint32(o + 12, true),
        bits: v.getUint16(o + 22, true),
      };
    if (id === 'data') {
      const bps = fmt.bits / 8;
      const frames = Math.floor(size / (bps * fmt.ch));
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let acc = 0;
        for (let c = 0; c < fmt.ch; c++) {
          const p = o + 8 + (i * fmt.ch + c) * bps;
          acc += fmt.bits === 16 ? v.getInt16(p, true) / 32768 : fmt.format === 3 ? v.getFloat32(p, true) : 0;
        }
        out[i] = acc / fmt.ch;
      }
      return { samples: out, sampleRate: fmt.sr };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error('no data chunk in WAV');
}

/** Speech onset/offset (seconds) by energy threshold (for timing word estimates and trimming). */
export function speechBounds(
  sig: Float32Array,
  sr: number,
  thresholdDb = -40,
): { start: number; end: number } {
  const win = Math.round(0.01 * sr);
  let max = 0;
  for (const x of sig) max = Math.max(max, Math.abs(x));
  const thr = max * dbToGain(thresholdDb + 20);
  let start = 0;
  let end = sig.length;
  for (let i = 0; i < sig.length; i += win) {
    let m = 0;
    for (let k = i; k < Math.min(sig.length, i + win); k++) m = Math.max(m, Math.abs(sig[k]!));
    if (m > thr) {
      start = i;
      break;
    }
  }
  for (let i = sig.length - win; i > 0; i -= win) {
    let m = 0;
    for (let k = i; k < Math.min(sig.length, i + win); k++) m = Math.max(m, Math.abs(sig[k]!));
    if (m > thr) {
      end = i + win;
      break;
    }
  }
  return { start: start / sr, end: Math.max(start + win, end) / sr };
}
