import { describe, expect, it } from 'vitest';
import { contrast, NIGHT } from '../../src/core/design/tokens.ts';

describe('design tokens', () => {
  it('all text colours reach WCAG 4.5:1 on every background stop', () => {
    for (const bg of NIGHT.bg) {
      expect(contrast(NIGHT.ink, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(NIGHT.muted, bg)).toBeGreaterThanOrEqual(4.5);
      for (const [k, c] of Object.entries(NIGHT.tone))
        if (k !== 'neutral') expect(contrast(c, bg), k).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('text on tone fills reaches 4.5:1', () => {
    for (const k of Object.keys(NIGHT.tone) as (keyof typeof NIGHT.tone)[])
      expect(contrast(NIGHT.onTone[k], NIGHT.tone[k]), k).toBeGreaterThanOrEqual(4.5);
  });
  it('five semantic colours plus neutrals', () => {
    expect(Object.keys(NIGHT.tone).filter((k) => k !== 'neutral').length).toBe(5);
  });
});
