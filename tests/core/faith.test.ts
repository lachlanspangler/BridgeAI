import { describe, expect, it } from 'vitest';
import { checkBeat, missingNames, missingNumbers } from '../../src/core/faith/check.ts';
import { gate } from '../../src/core/faith/gate.ts';
import type { Beat, Script } from '../../src/core/schema.ts';
import { attention } from './fixtures.ts';

const src = attention();
const abs = src.segments.find((s) => s.kind === 'abstract')!.id;
const beat = (narration: string, support = [abs], extra: Partial<Beat> = {}): Beat => ({
  id: 'b2',
  role: 'idea',
  narration,
  visual: { type: 'statement', text: 'x y z', highlight: [] },
  claims: [{ text: narration, support, kind: 'fact' }],
  ideas: [],
  keywords: [],
  ...extra,
});

describe('faithfulness checks', () => {
  it('numbers must appear in the cited source (with rounding allowed)', () => {
    expect(missingNumbers('It scores 28.4 BLEU', 'achieves 28.4 BLEU')).toEqual([]);
    expect(missingNumbers('It scores 28 BLEU', 'achieves 28.4 BLEU')).toEqual([]);
    expect(missingNumbers('It scores 31.2 BLEU', 'achieves 28.4 BLEU')).toEqual(['31.2']);
  });
  it('names must appear in the source', () => {
    expect(missingNames('The model beats Google Translate', 'the model beats prior work')).toContain(
      'Google',
    );
    expect(missingNames('It uses the Transformer', 'the Transformer, based solely on attention')).toEqual([]);
  });
  it('passes a faithful paraphrase with high overlap', () => {
    expect(checkBeat(beat('The Transformer is based solely on attention mechanisms.'), src).ok).toBe(true);
  });
  it('rejects an invented number', () => {
    const c = checkBeat(beat('The Transformer trains in 1.5 days on eight GPUs.'), src);
    expect(c.ok).toBe(false);
    expect(c.verdicts.some((v) => v.by === 'numbers')).toBe(true);
  });
  it('rejects an invented name', () => {
    expect(checkBeat(beat('The Transformer was built at OpenAI.'), src).ok).toBe(false);
  });
  it('rejects a claim citing a segment that does not exist', () => {
    expect(checkBeat(beat('The Transformer is based solely on attention.', ['s999']), src).ok).toBe(false);
  });
  it('rejects an invented number shown on screen even if the narration is fine', () => {
    const b = beat('The Transformer is based solely on attention mechanisms.', [abs], {
      visual: { type: 'bigNumber', value: '99', label: 'BLEU' },
    });
    expect(checkBeat(b, src).ok).toBe(false);
  });
  it('sends low-overlap paraphrases to the judge', () => {
    const c = checkBeat(beat('You can teach it faster with many chips at once.'), src);
    expect(c.needsJudge.length).toBe(1);
  });
  it('gate drops unsupported idea beats, keeps supported ones, counts zero remaining', () => {
    const script: Script = {
      schema: 'bridge.script/1',
      title: 't',
      targetSeconds: 20,
      engine: 'test',
      beats: [
        {
          ...beat('Here is the big idea.', []),
          id: 'b1',
          role: 'hook',
          claims: [{ text: 'Here is the big idea.', support: [], kind: 'framing' }],
        },
        beat('The Transformer is based solely on attention mechanisms.'),
        { ...beat('It trains in 1.5 days.'), id: 'b3' },
      ],
    };
    const checks = script.beats.map((b) => checkBeat(b, src));
    const g = gate(script, checks);
    expect(g.script.beats.length).toBe(2);
    expect(g.report.actions.find((a) => a.beatId === 'b3')!.action).toBe('dropped');
    expect(g.report.unsupported).toBe(0);
  });
  it('judge rulings can rescue a paraphrase', () => {
    const b = beat('You can teach it faster with many chips at once.');
    const script: Script = {
      schema: 'bridge.script/1',
      title: 't',
      targetSeconds: 20,
      engine: 'test',
      beats: [b],
    };
    const g = gate(script, [checkBeat(b, src)], new Map([[b.narration, true]]));
    expect(g.script.beats.length).toBe(1);
    expect(g.report.verdicts.some((v) => v.by === 'judge' && v.verdict === 'supported')).toBe(true);
  });
});
