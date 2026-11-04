import { describe, expect, it } from 'vitest';
import { budgetFor, withinTolerance, PRESETS } from '../../src/core/budget.ts';

describe('budget', () => {
  it('matches the EXPLAINER_CRAFT word budgets per preset (±10%)', () => {
    const want: Record<string, [number, number]> = {
      '20s': [40, 50],
      '1m': [125, 145],
      '3m': [380, 420],
      '5m': [620, 680],
    };
    for (const [k, s] of Object.entries(PRESETS)) {
      const b = budgetFor(s);
      const [lo, hi] = want[k]!;
      expect(b.words, k).toBeGreaterThanOrEqual(lo * 0.9);
      expect(b.words, k).toBeLessThanOrEqual(hi * 1.1);
    }
  });
  it('never exceeds the 2.9 words/s hard cap', () => {
    for (let s = 10; s <= 900; s += 7) expect(budgetFor(s).wordsPerSecond).toBeLessThanOrEqual(2.9);
  });
  it('20 s means one or two ideas; longer means more', () => {
    expect(budgetFor(20).ideas).toEqual({ min: 1, max: 2 });
    expect(budgetFor(60).ideas.max).toBeGreaterThan(budgetFor(20).ideas.max);
    expect(budgetFor(300).ideas.max).toBeGreaterThan(budgetFor(180).ideas.max);
  });
  it('is monotonic in words and beats for custom lengths', () => {
    let prev = budgetFor(10);
    for (let s = 11; s <= 600; s++) {
      const b = budgetFor(s);
      expect(b.words).toBeGreaterThanOrEqual(prev.words);
      expect(b.beats.max).toBeGreaterThanOrEqual(prev.beats.max);
      prev = b;
    }
  });
  it('rejects nonsense lengths', () => {
    expect(() => budgetFor(0)).toThrow();
    expect(() => budgetFor(Number.NaN)).toThrow();
  });
  it('tolerance is ±10%', () => {
    expect(withinTolerance(21.9, 20)).toBe(true);
    expect(withinTolerance(22.1, 20)).toBe(false);
    expect(withinTolerance(18.1, 20)).toBe(true);
  });
});
