import { describe, expect, it } from 'vitest';
import { analyzeExtractive, textRank } from '../../src/core/analyze/extractive.ts';
import { budgetFor } from '../../src/core/budget.ts';
import { checkScript } from '../../src/core/faith/check.ts';
import { Analysis, Script } from '../../src/core/schema.ts';
import { composeExtractive, scriptWords, trimSentence } from '../../src/core/script/extractive.ts';
import { attention } from './fixtures.ts';

describe('extractive analysis', () => {
  const src = attention();
  const a = Analysis.parse(analyzeExtractive(src));
  it('ranks the core contribution first', () => {
    expect(a.ideas[0]!.statement).toMatch(/Transformer/);
    expect(a.ideas[0]!.importance).toBe(1);
  });
  it('every idea is a sentence of the source with evidence', () => {
    for (const i of a.ideas) {
      const seg = src.segments.find((s) => s.id === i.evidence[0]!.segmentId)!;
      expect(seg.text.replace(/\s+/g, ' ')).toContain(i.statement.replace(/\.$/, '').slice(0, 40));
    }
  });
  it('is deterministic', () => {
    expect(analyzeExtractive(src)).toEqual(analyzeExtractive(src));
  });
  it('textRank scores central sentences higher', () => {
    const r = textRank([
      'cats chase mice in the house',
      'cats and mice live in the house',
      'stock markets fell today',
    ]);
    expect(r[2]).toBeLessThan(r[0]!);
  });
});

describe('extractive script', () => {
  const src = attention();
  const a = analyzeExtractive(src);
  for (const len of [20, 60, 180]) {
    it(`${len}s: valid shape, within the word budget, zero unsupported claims`, () => {
      const b = budgetFor(len);
      const s = Script.parse(composeExtractive(src, a, b));
      expect(s.beats[0]!.role).toBe('hook');
      expect(s.beats[s.beats.length - 1]!.role).toBe('takeaway');
      expect(s.beats.length).toBeLessThanOrEqual(b.beats.max);
      expect(scriptWords(s)).toBeLessThanOrEqual(b.words * 1.1);
      const bad = checkScript(s, src)
        .flatMap((c) => c.verdicts)
        .filter((v) => v.verdict === 'unsupported');
      expect(bad).toEqual([]);
    });
  }
  it('trimSentence keeps a verb and drops leading prepositional clauses', () => {
    const t = trimSentence(
      'On the WMT 2014 English-to-French translation task, our model establishes a new single-model state-of-the-art BLEU score of 41.8 after training for 3.5 days on eight GPUs.',
      16,
    );
    expect(t).toMatch(/establishes/);
    expect(t.split(' ').length).toBeLessThanOrEqual(16);
  });
});

describe('garbled text filter', () => {
  it('drops glued words, math fragments and keeps prose', async () => {
    const { garbled } = await import('../../src/core/analyze/extractive.ts');
    expect(garbled('TheLawwillneverbe perfect but its application')).toBe(true);
    expect(garbled('of continuous representations z = (z , ..., z ). Given z')).toBe(true);
    expect(garbled('The Transformer is based solely on attention mechanisms.')).toBe(false);
    // chart axis text spliced into a PDF sentence (vLLM paper)
    expect(
      garbled(
        'we propose PagedAttention, an attention al- 0.4k gorithm inspired by virtual memory and pag0 10 20 30 40 ing',
      ),
    ).toBe(true);
    expect(garbled('It reaches 28.4 BLEU on WMT 2014 English-to-German.')).toBe(false);
    // a diagram label read as a sentence
    expect(garbled('Fossil fuels, cement, and land-use change 9.')).toBe(true);
    expect(garbled('Emissions rose to 9.')).toBe(false);
    expect(garbled('The model was released in 2023.')).toBe(false);
  });
});

describe('whatIsIt', () => {
  it("finds the source's own definition sentence", async () => {
    const { whatIsIt } = await import('../../src/core/script/extractive.ts');
    expect(whatIsIt(attention())!.text).toMatch(
      /We propose a new simple network architecture, the Transformer/,
    );
  });
  it('falls back to the topic sentence that names a descriptive title', async () => {
    const { whatIsIt } = await import('../../src/core/script/extractive.ts');
    const src = {
      ...attention(),
      title: 'Tackling Climate Change with Machine Learning',
      segments: [
        {
          id: 's1',
          kind: 'paragraph' as const,
          text: 'Climate change is one of the greatest challenges facing humanity, and machine learning experts may wonder how they can help.',
        },
      ],
    };
    expect(whatIsIt(src as never)!.text).toMatch(/^Climate change is one of/);
    expect(whatIsIt({ ...src, title: '3 images' } as never)).toBeNull();
  });
});

describe('thirdPerson', () => {
  it('names the authors once, then says they', async () => {
    const { thirdPerson } = await import('../../src/core/script/extractive.ts');
    expect(thirdPerson('and we, as experts, may wonder how we can help.')).toBe(
      'and the authors, as experts, may wonder how they can help.',
    );
    expect(thirdPerson('We describe our method.')).toBe('The authors describe their method.');
  });
});
