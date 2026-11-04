import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestText } from '../../src/core/ingest/text.ts';
import { budgetFor } from '../../src/core/budget.ts';
import { analyzeExtractive } from '../../src/core/analyze/extractive.ts';
import { composeExtractive } from '../../src/core/script/extractive.ts';
import { buildTimeline } from '../../src/core/timeline/timeline.ts';

export const ROOT = join(import.meta.dirname, '..', '..');
export const attention = () =>
  ingestText(
    readFileSync(join(ROOT, 'evals/sources/attention-abstract.txt'), 'utf8'),
    'attention-abstract.txt',
  );

export function sampleTimeline(len = 20) {
  const src = attention();
  const b = budgetFor(len);
  const script = composeExtractive(src, analyzeExtractive(src), b);
  const clips = script.beats.map((beat) => {
    const d = beat.narration.split(/\s+/).length / 2.6 + 0.3;
    return { duration: d, speechStart: 0.1, speechEnd: d - 0.15 };
  });
  return {
    src,
    script,
    tl: buildTimeline(script, clips, b, { fps: 30, width: 1920, height: 1080, seed: 7 }),
  };
}
