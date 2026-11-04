import { describe, expect, it } from 'vitest';
import {
  cleanForSpeech,
  coverage,
  numbers,
  properNouns,
  sentences,
  syllables,
  words,
} from '../../src/core/text/text.ts';

describe('text', () => {
  it('splits sentences without breaking decimals, abbreviations or initials', () => {
    const s = sentences(
      'We get 28.4 BLEU, e.g. on WMT. This is fig. 3 of Vaswani et al. in 2017. J. Smith agrees! Does it scale? Yes.',
    );
    expect(s).toEqual([
      'We get 28.4 BLEU, e.g. on WMT.',
      'This is fig. 3 of Vaswani et al. in 2017.',
      'J. Smith agrees!',
      'Does it scale?',
      'Yes.',
    ]);
  });
  it('extracts numbers in canonical form', () => {
    expect(numbers('28.4 BLEU, 3,000 steps, 41% and −2 points, 1e-4 lr')).toEqual([
      '28.4',
      '3000',
      '41',
      '-2',
      '1e-4',
    ]);
  });
  it('keeps numbers and hyphenated words as one word', () => {
    expect(words("It's 28.4 state-of-the-art")).toEqual(["It's", '28.4', 'state-of-the-art']);
  });
  it('finds proper nouns and acronyms, not sentence-initial words', () => {
    const p = properNouns('The model beats GPT-4 on BLEU. Results from Google are better.');
    expect(p).toContain('GPT-4');
    expect(p).toContain('BLEU');
    expect(p).toContain('Google');
    expect(p).not.toContain('The');
    expect(p).not.toContain('Results');
  });
  it('cleans citations and figure references for speech', () => {
    expect(cleanForSpeech('It works [12, 13] (see Figure 2) well (Smith et al., 2020).')).toBe(
      'It works well.',
    );
  });
  it('syllables are plausible', () => {
    expect(syllables('attention')).toBe(3);
    expect(syllables('the')).toBe(1);
    expect(syllables('transformer')).toBeGreaterThanOrEqual(3);
  });
  it('coverage measures content-word overlap', () => {
    expect(coverage('the transformer uses attention', 'Transformers rely on attention only')).toBeGreaterThan(
      0.6,
    );
    expect(coverage('cats chase mice', 'the transformer uses attention')).toBe(0);
  });
});

describe('number ranges', () => {
  it('reads "1951-1980" as two years, not 1951 and -1980', async () => {
    const { numbers } = await import('../../src/core/text/text.ts');
    expect(numbers('base period 1951-1980, and -0.5 °C')).toEqual(
      expect.arrayContaining(['1951', '1980', '-0.5']),
    );
    expect(numbers('base period 1951-1980')).not.toContain('-1980');
  });
});
