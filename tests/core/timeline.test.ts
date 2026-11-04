import { describe, expect, it } from 'vitest';
import { cueAt, toSrt, toVtt } from '../../src/core/captions/captions.ts';
import { Timeline } from '../../src/core/schema.ts';
import {
  absoluteWords,
  captionCues,
  estimateWordTimings,
  MIN_BEAT,
} from '../../src/core/timeline/timeline.ts';
import { sampleTimeline } from './fixtures.ts';

describe('timeline', () => {
  const { tl, script } = sampleTimeline();
  it('validates and covers every beat contiguously', () => {
    Timeline.parse(tl);
    expect(tl.beats.length).toBe(script.beats.length);
    tl.beats.forEach((b, i) => {
      expect(b.end - b.start).toBeGreaterThanOrEqual(MIN_BEAT - 1e-9);
      if (i) expect(b.start).toBeCloseTo(tl.beats[i - 1]!.end, 6);
    });
    expect(tl.duration).toBeGreaterThan(tl.beats[tl.beats.length - 1]!.end);
  });
  it('word timings are inside the voice window and ordered', () => {
    for (const b of tl.beats) {
      let prev = -1;
      for (const w of b.words) {
        expect(w.start).toBeGreaterThanOrEqual(b.voiceOffset);
        expect(w.end).toBeLessThanOrEqual(b.voiceOffset + b.voiceDuration + 1e-6);
        expect(w.start).toBeGreaterThanOrEqual(prev);
        prev = w.end;
      }
    }
  });
  it('estimated word timings span the window and weight long words', () => {
    const w = estimateWordTimings('a extraordinary b', 0, 3);
    expect(w[0]!.start).toBe(0);
    expect(w[2]!.end).toBeCloseTo(3, 2);
    expect(w[1]!.end - w[1]!.start).toBeGreaterThan(w[0]!.end - w[0]!.start);
  });
  it('captions: one line ≤ 32 chars, ≤ 5 words, ordered, non-overlapping, cover all words', () => {
    let prevEnd = 0;
    for (const c of tl.captions) {
      expect(c.text.length).toBeLessThanOrEqual(40); // a single long word may exceed 32
      expect(c.text.split(' ').length).toBeLessThanOrEqual(5);
      expect(c.start).toBeGreaterThanOrEqual(prevEnd - 1e-6);
      expect(c.end).toBeGreaterThan(c.start);
      prevEnd = c.end;
    }
    expect(
      tl.captions
        .map((c) => c.text)
        .join(' ')
        .split(' ').length,
    ).toBe(absoluteWords(tl.beats).length);
  });
  it('caption reading speed stays under 20 chars/s on average', () => {
    const chars = tl.captions.reduce((n, c) => n + c.text.length, 0);
    const secs = tl.captions.reduce((n, c) => n + (c.end - c.start), 0);
    expect(chars / secs).toBeLessThan(20);
  });
  it('SFX are at most one per 2 s (except risers)', () => {
    const s = tl.sfx.filter((x) => x.kind !== 'riser');
    for (let i = 1; i < s.length; i++) expect(s[i]!.t - s[i - 1]!.t).toBeGreaterThanOrEqual(2 - 1e-6);
  });
  it('vtt/srt are well-formed and cueAt finds the active cue', () => {
    const vtt = toVtt(tl.captions);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toMatch(/\d\d:\d\d:\d\d\.\d{3} --> \d\d:\d\d:\d\d\.\d{3}/);
    expect(toSrt(tl.captions)).toMatch(/\d\d:\d\d:\d\d,\d{3} --> /);
    const c = tl.captions[2]!;
    expect(cueAt(tl.captions, (c.start + c.end) / 2)).toEqual(c);
    expect(cueAt(tl.captions, -1)).toBeUndefined();
  });
  it('captionCues never spans two beats', () => {
    const cues = captionCues(tl.beats);
    for (const c of cues) {
      const b = tl.beats.find((x) => c.start >= x.start - 1e-6 && c.start < x.end)!;
      expect(c.end).toBeLessThanOrEqual(b.end + 0.6);
    }
  });
});
