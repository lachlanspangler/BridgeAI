/** Review 2026-11-03 (correctness): caption/timeline edge cases. Asserts the CORRECT behaviour. */
import { describe, expect, it } from 'vitest';
import { captionCues } from '../../src/core/timeline/timeline.ts';
import { cueAt } from '../../src/core/captions/captions.ts';
import type { TimedBeat } from '../../src/core/schema.ts';

const tb = (words: { word: string; start: number; end: number }[]): TimedBeat => ({
  beat: {
    id: 'b1',
    role: 'idea',
    narration: words.map((w) => w.word).join(' '),
    visual: { type: 'statement', text: 'x y z', highlight: [] },
    claims: [],
    ideas: [],
    keywords: [],
  },
  start: 0,
  end: 3,
  voiceOffset: 0,
  voiceDuration: 3,
  words,
});

describe('captionCues', () => {
  it('cues never overlap (the 0.3 s minimum must not push a cue past the next start)', () => {
    const cues = captionCues([
      tb([
        { word: 'Yes.', start: 0.1, end: 0.2 },
        { word: 'No.', start: 0.25, end: 0.35 },
        { word: 'Maybe.', start: 0.4, end: 0.6 },
      ]),
    ]);
    for (let i = 1; i < cues.length; i++) expect(cues[i - 1]!.end).toBeLessThanOrEqual(cues[i]!.start);
    // and the binary search finds the cue that is actually being said
    expect(cueAt(cues, 0.3)?.text).toBe('No.');
  });
});
