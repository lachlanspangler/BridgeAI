import { describe, expect, it } from 'vitest';
import {
  decodeWav,
  encodeWav,
  integratedLufs,
  mix,
  resample,
  speechBounds,
} from '../../src/core/audio/mix.ts';
import { osc, peak, SR, stereo } from '../../src/core/audio/dsp.ts';
import { synthMusic } from '../../src/core/audio/music.ts';
import { sfx } from '../../src/core/audio/sfx.ts';
import { sampleTimeline } from './fixtures.ts';

describe('audio', () => {
  it('BS.1770: a full-scale 1 kHz sine (both channels) measures about 0 LUFS (+3 for stereo)', () => {
    const s = stereo(3);
    const x = osc(s.l.length, SR, 997, 'sine');
    s.l.set(x);
    s.r.set(x);
    // −3.01 LUFS for one channel; two channels sum power → ≈ 0 LUFS
    expect(integratedLufs(s)).toBeCloseTo(0, 0);
  });
  it('music is deterministic per seed and differs across seeds', () => {
    const a = synthMusic({ seconds: 3, pace: 'brisk', seed: 1 });
    const b = synthMusic({ seconds: 3, pace: 'brisk', seed: 1 });
    const c = synthMusic({ seconds: 3, pace: 'brisk', seed: 2 });
    expect(Array.from(a.l.slice(20000, 20100))).toEqual(Array.from(b.l.slice(20000, 20100)));
    expect(Array.from(a.l.slice(20000, 20100))).not.toEqual(Array.from(c.l.slice(20000, 20100)));
    expect(a.l.length).toBe(3 * SR);
  });
  it('every SFX is short, finite and audible', () => {
    for (const k of ['whoosh', 'pop', 'tick', 'click', 'impact', 'chime', 'riser'] as const) {
      const x = sfx(k);
      expect(x.every(Number.isFinite), k).toBe(true);
      expect(Math.max(...x.map(Math.abs)), k).toBeGreaterThan(0.05);
      expect(x.length / SR, k).toBeLessThanOrEqual(k === 'riser' || k === 'chime' ? 1.3 : 0.55);
    }
  });
  it('mix lands at −14 LUFS ±1, peak ≤ −1 dBFS, and ducks music under voice', () => {
    const { tl } = sampleTimeline();
    const voice = tl.beats.map((b) => {
      const n = Math.round(b.voiceDuration * 24000);
      const v = osc(n, 24000, 180, 'saw');
      for (let i = 0; i < n; i++) v[i] = v[i]! * 0.3 * (Math.sin(i / 900) > 0 ? 1 : 0.2);
      return v;
    });
    const m = mix({ timeline: tl, voice, voiceRate: 24000, pace: 'sprint', music: true, effects: true });
    expect(m.lufs).toBeGreaterThan(-15);
    expect(m.lufs).toBeLessThan(-13);
    expect(m.peakDb).toBeLessThanOrEqual(-1);
    expect(m.duckDb).toBeGreaterThanOrEqual(15);
    expect(m.master.l.length).toBe(Math.ceil(tl.duration * SR));
  });
  it('WAV round-trips', () => {
    const x = osc(1000, 24000, 440, 'sine');
    const back = decodeWav(encodeWav([x], 24000));
    expect(back.sampleRate).toBe(24000);
    expect(back.samples[100]).toBeCloseTo(x[100]!, 3);
  });
  it('resample keeps duration and speechBounds finds the voiced region', () => {
    const x = new Float32Array(24000);
    for (let i = 6000; i < 18000; i++) x[i] = Math.sin(i / 5) * 0.5;
    expect(resample(x, 24000, 44100).length).toBe(44100);
    const b = speechBounds(x, 24000);
    expect(b.start).toBeCloseTo(0.25, 1);
    expect(b.end).toBeCloseTo(0.75, 1);
  });
  it('peak helper', () => {
    const s = stereo(0.01);
    s.r[3] = -0.7;
    expect(peak(s)).toBeCloseTo(0.7);
  });
});
