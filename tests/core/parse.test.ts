import { describe, expect, it } from 'vitest';
import { mergeAnalyses, parseAnalysis, parseScript, quoteFound, toVisual } from '../../src/core/llm/parse.ts';
import { analysisSchema, scriptSchema, toOpenAiSchema } from '../../src/core/llm/schemas.ts';
import { attention } from './fixtures.ts';

const src = attention();
const abs = src.segments.find((s) => s.kind === 'abstract')!.id;

describe('model output parsing', () => {
  it('verifies quotes (exact or near-verbatim) and drops ideas with fake evidence', () => {
    expect(quoteFound('based solely on attention mechanisms', src.segments[1]!.text)).toBe(true);
    expect(quoteFound('uses quantum computers', src.segments[1]!.text)).toBe(false);
    const { analysis, dropped } = parseAnalysis(
      {
        gist: 'g',
        ideas: [
          {
            statement: 'Real',
            kind: 'method',
            importance: 5,
            evidence: [{ segmentId: abs, quote: 'the Transformer, based solely on attention mechanisms' }],
            numbers: ['28.4 BLEU', '99 BLEU'],
            terms: ['Transformer', 'Quantum'],
            figure: 'none',
          },
          {
            statement: 'Fake',
            kind: 'claim',
            importance: 4,
            evidence: [{ segmentId: abs, quote: 'trained on the moon' }],
            numbers: [],
            terms: [],
            figure: 'none',
          },
          {
            statement: 'Bad id',
            kind: 'claim',
            importance: 4,
            evidence: [{ segmentId: 's999', quote: 'x' }],
            numbers: [],
            terms: [],
            figure: 'none',
          },
        ],
      },
      src,
      'test',
    );
    expect(analysis.ideas.map((i) => i.statement)).toEqual(['Real']);
    expect(analysis.ideas[0]!.numbers).toEqual(['28.4 BLEU']);
    expect(analysis.ideas[0]!.terms).toEqual(['Transformer']);
    expect(dropped.length).toBe(2);
  });
  it('merges duplicate ideas across chunks', () => {
    const a = parseAnalysis(
      {
        gist: 'g',
        ideas: [
          {
            statement: 'The Transformer uses only attention',
            kind: 'method',
            importance: 5,
            evidence: [{ segmentId: abs, quote: 'based solely on attention mechanisms' }],
            numbers: [],
            terms: [],
            figure: 'none',
          },
        ],
      },
      src,
      't',
    ).analysis;
    const b = parseAnalysis(
      {
        gist: 'g',
        ideas: [
          {
            statement: 'The Transformer uses attention only',
            kind: 'method',
            importance: 4,
            evidence: [{ segmentId: abs, quote: 'dispensing with recurrence and convolutions entirely' }],
            numbers: [],
            terms: [],
            figure: 'none',
          },
        ],
      },
      src,
      't',
    ).analysis;
    const m = mergeAnalyses([a, b], 't');
    expect(m.ideas.length).toBe(1);
  });
  it('repairs impossible visuals into safe ones', () => {
    expect(
      toVisual(
        { type: 'bigNumber', value: '99.9', unit: '', label: 'x', compareValue: '', compareLabel: '' },
        src,
        'n',
        ['k'],
      ).type,
    ).toBe('statement');
    expect(
      toVisual(
        {
          type: 'bigNumber',
          value: '28.4',
          unit: 'BLEU',
          label: 'En→De',
          compareValue: '',
          compareLabel: '',
        },
        src,
        'n',
        [],
      ).type,
    ).toBe('bigNumber');
    expect(toVisual({ type: 'figure', assetId: 'a9', caption: '' }, src, 'n', []).type).toBe('statement');
    expect(toVisual({ type: 'quote', text: 'made up words' }, src, 'n', []).type).toBe('statement');
    expect(
      toVisual(
        { type: 'statement', text: 'over 2', highlight: [] },
        src,
        'It beats the best by over 2 BLEU.',
        [],
      ).type,
    ).toBe('statement');
    const f = toVisual(
      {
        type: 'flow',
        title: '',
        nodes: [
          { id: 'a', label: 'Encoder' },
          { id: 'b', label: 'Decoder' },
        ],
        edges: [],
      },
      src,
      'n',
      [],
    );
    expect(f.type === 'flow' && f.edges.length).toBe(1);
  });
  it('script shape: hook first, takeaway last, real title, citations filtered', () => {
    const s = parseScript(
      {
        title: 'Attention Replaces Everything Forever',
        beats: [
          {
            role: 'idea',
            narration: 'The Transformer uses only attention.',
            visual: { type: 'statement', text: 'Only attention', highlight: [] },
            claims: [{ text: 'uses only attention', support: [abs, 's999'], kind: 'fact' }],
            keywords: ['attention', 'nope'],
          },
          {
            role: 'evidence',
            narration: 'It scores 28.4 BLEU.',
            visual: {
              type: 'bigNumber',
              value: '28.4',
              unit: 'BLEU',
              label: 'En-De',
              compareValue: '',
              compareLabel: '',
            },
            claims: [],
            keywords: [],
          },
        ],
      },
      src,
      20,
      'test',
    );
    expect(s.title).toBe(src.title);
    expect(s.beats[0]!.role).toBe('hook');
    expect(s.beats[1]!.role).toBe('takeaway');
    expect(s.beats[1]!.visual.type).toBe('takeaway');
    expect(s.beats[0]!.claims[0]!.support).toEqual([abs]);
    expect(s.beats[0]!.keywords).toEqual(['attention']);
    // a beat with no claims gets its narration as a fact claim (so the gate checks it)
    expect(s.beats[1]!.claims[0]!.text).toBe('It scores 28.4 BLEU.');
  });
  it('schemas constrain citations to real ids; OpenAI variant uses anyOf', () => {
    const a = JSON.stringify(analysisSchema(['s1', 's2'], [], 3));
    expect(a).toContain('"enum":["s1","s2"]');
    const sc = JSON.stringify(toOpenAiSchema(scriptSchema(src, 5)));
    expect(sc).toContain('anyOf');
    expect(sc).not.toContain('oneOf');
  });
});

describe('script de-duplication', () => {
  it('keeps one takeaway and drops repeated beats', () => {
    const b = (role: string, narration: string) => ({
      role,
      narration,
      visual: { type: 'statement', text: narration, highlight: [] },
      claims: [{ text: narration, support: [abs], kind: 'fact' }],
      keywords: [],
    });
    const s = parseScript(
      {
        title: 't',
        beats: [
          b('hook', 'The Transformer uses only attention.'),
          b('idea', 'It trains in 3.5 days on eight GPUs.'),
          b('takeaway', 'Attention alone replaces recurrence.'),
          b('takeaway', 'Attention alone replaces recurrence for speed.'),
          b('takeaway', 'The Transformer proves attention is all you need.'),
        ],
      },
      src,
      60,
      'test',
    );
    expect(s.beats.filter((x) => x.role === 'takeaway').length).toBe(1);
    expect(s.beats[s.beats.length - 1]!.role).toBe('takeaway');
    expect(s.beats.length).toBeLessThanOrEqual(4);
  });
});
