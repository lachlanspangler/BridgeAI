/**
 * Review 2026-11-03 (correctness): proof tests for ways an unsupported claim passes the faithfulness checks.
 * Every test here asserts the CORRECT behaviour, so a failing test is a live bug.
 */
import { describe, expect, it } from 'vitest';
import { ingestText } from '../../src/core/ingest/text.ts';
import {
  checkBeat,
  checkScript,
  missingAbsolutes,
  missingNames,
  missingNumbers,
} from '../../src/core/faith/check.ts';
import { gate } from '../../src/core/faith/gate.ts';
import type { Beat, Script } from '../../src/core/schema.ts';

const src = ingestText(
  'Sleep study\n\nSleep improves memory in adults.\n\nThe trial enrolled 120 adults over two years.\n\nNaps of twenty minutes helped recall.',
  'x.txt',
);
// s1 title, s2 abstract, s3 "120 adults", s4 naps

const beat = (over: Partial<Beat>): Beat => ({
  id: 'b1',
  role: 'idea',
  narration: '',
  visual: { type: 'statement', text: 'Sleep helps memory', highlight: [] },
  claims: [],
  ideas: [],
  keywords: [],
  ...over,
});

describe('numbers', () => {
  it('spelled-out quantities in a claim are checked (rule 7)', () => {
    expect(missingNumbers('Sleep makes memory ten times better.', 'Sleep improves memory in adults.')).not.toEqual([]);
  });
  it('magnitude suffixes are not discarded (7B is not 7M)', () => {
    expect(missingNumbers('a 7B parameter model', 'a 7M parameter model')).not.toEqual([]);
  });
  it('a single digit does not pass just because it occurs inside a year', () => {
    expect(missingNumbers('errors fell by 9 points', 'In 1990 the method was introduced.')).not.toEqual([]);
  });
});

describe('names', () => {
  it('a sentence-initial invented name is caught', () => {
    expect(missingNames('Microsoft ran this trial.', 'The trial enrolled 120 adults.')).toEqual(['Microsoft']);
  });
  it('a short acronym is not "found" as a substring of an ordinary word', () => {
    expect(missingNames('Researchers at MIT agree.', 'We submit results within the limit.')).toEqual(['MIT']);
  });
});

describe('absolutes', () => {
  it('"perfect" is not licensed by "imperfect"', () => {
    expect(missingAbsolutes('The method is perfect.', 'An imperfect method.')).toEqual(['perfect']);
  });
});

describe('checkBeat coverage', () => {
  it('narration beyond the cited fact claim is checked, not only its numbers/names', () => {
    const b = beat({
      narration: 'Sleep improves memory in adults, and it also cures depression.',
      claims: [{ text: 'Sleep improves memory in adults', support: ['s2'], kind: 'fact' }],
    });
    expect(checkBeat(b, src).ok).toBe(false);
  });
  it('a framing-only hook may not overclaim with absolutes', () => {
    const b = beat({
      role: 'hook',
      narration: 'Sleep always fixes memory, guaranteed.',
      visual: { type: 'title', title: 'Sleep study' },
      claims: [{ text: 'Sleep always fixes memory, guaranteed.', support: [], kind: 'framing' }],
    });
    expect(checkBeat(b, src).ok).toBe(false);
  });
});

describe('gate', () => {
  it('never keeps a beat it judged unsupported, and never reports 0 unsupported when it does', () => {
    const script: Script = {
      schema: 'bridge.script/1',
      title: 'Sleep study',
      targetSeconds: 20,
      engine: 'test',
      beats: [
        beat({
          id: 'b1',
          narration: 'The trial enrolled 900 adults.',
          claims: [{ text: 'The trial enrolled 900 adults.', support: ['s3'], kind: 'fact' }],
        }),
      ],
    };
    const g = gate(script, checkScript(script, src));
    const said = g.script.beats.map((b) => b.narration).join(' ');
    // either the false beat is gone, or it is counted
    expect(said.includes('900') ? g.report.unsupported : 1).toBeGreaterThan(0);
    expect(said).not.toContain('900');
  });
  it('report beat ids refer to the beats of the returned script', () => {
    const ok = (id: string, text: string, seg: string): Beat =>
      beat({ id, narration: text, claims: [{ text, support: [seg], kind: 'fact' }] });
    const script: Script = {
      schema: 'bridge.script/1',
      title: 'Sleep study',
      targetSeconds: 20,
      engine: 'test',
      beats: [
        ok('b1', 'Sleep improves memory in adults.', 's2'),
        ok('b2', 'The trial enrolled 900 adults.', 's3'), // dropped
        ok('b3', 'Naps of twenty minutes helped recall.', 's4'),
      ],
    };
    const g = gate(script, checkScript(script, src));
    const naps = g.script.beats.find((b) => b.narration.startsWith('Naps'))!;
    const action = g.report.actions.find((a) => a.beatId === naps.id)!;
    expect(action.action).toBe('kept'); // today: 'dropped' (stale pre-renumber id b2)
  });
});
