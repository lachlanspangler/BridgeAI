/**
 * Citation repair: small models often cite the wrong segment for a true claim. Before checking, any fact claim
 * whose cited text covers it poorly gets the best-matching segments of the source added to its support
 * (by content-word coverage + shared numbers). This never makes a false claim pass: the claim must still
 * clear the number/name checks and the overlap check or the judge against the (now right) evidence.
 */
import type { Script, Source } from '../schema.ts';
import { coverage, numbers } from '../text/text.ts';

export function findSupport(claim: string, src: Source, k = 2): { id: string; score: number }[] {
  const nums = new Set(numbers(claim));
  return src.segments
    .filter((s) => s.kind !== 'heading' && s.kind !== 'title' && s.kind !== 'meta')
    .map((s) => {
      const segNums = new Set(numbers(s.text));
      const shared = [...nums].filter((n) => segNums.has(n)).length;
      return { id: s.id, score: coverage(claim, s.text) + (nums.size ? 0.5 * (shared / nums.size) : 0) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function repairCitations(script: Script, src: Source, threshold = 0.5): { script: Script; repaired: number } {
  const text = new Map(src.segments.map((s) => [s.id, s.text]));
  let repaired = 0;
  const beats = script.beats.map((b) => ({
    ...b,
    claims: b.claims.map((c) => {
      if (c.kind !== 'fact') return c;
      const cited = c.support.map((id) => text.get(id) ?? '').join('\n');
      const now = cited ? coverage(c.text, cited) : 0;
      const nums = numbers(c.text);
      const numsMissing = nums.some((n) => !numbers(cited).includes(n));
      if (now >= threshold && !numsMissing) return c;
      const best = findSupport(c.text, src).filter((x) => x.score > now && !c.support.includes(x.id));
      if (!best.length) return c;
      repaired++;
      return { ...c, support: [...c.support, ...best.map((x) => x.id)].slice(0, 4) };
    }),
  }));
  return { script: { ...script, beats }, repaired };
}
