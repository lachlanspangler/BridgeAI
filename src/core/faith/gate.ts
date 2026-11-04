/**
 * The faithfulness gate: turn per-beat checks (+ judge rulings) into a FaithReport and a script with every
 * unsupported beat removed. Hooks and takeaways that fail are replaced by safe framing / a source sentence
 * rather than removed, so the video keeps its shape.
 */
import type { Beat, ClaimVerdict, FaithReport, Script } from '../schema.ts';
import type { BeatCheck } from './check.ts';
import { trimSentence } from '../script/extractive.ts';

export interface GateResult {
  script: Script;
  report: FaithReport;
}

/** `judged`: claim text → supported? (from the LLM judge) for claims that failed only on overlap. */
export function gate(
  script: Script,
  checks: BeatCheck[],
  judged: Map<string, boolean> = new Map(),
  fallbackTakeaway?: Beat,
): GateResult {
  const verdicts: ClaimVerdict[] = [];
  const actions: FaithReport['actions'] = [];
  const kept: Beat[] = [];
  script.beats.forEach((beat, i) => {
    const c = checks[i]!;
    const vs = c.verdicts.map((v) => {
      if (v.verdict === 'unsupported' && v.by === 'overlap' && judged.has(v.claim)) {
        return judged.get(v.claim)
          ? { ...v, verdict: 'supported' as const, by: 'judge' as const, reason: 'judge: entailed' }
          : { ...v, by: 'judge' as const, reason: 'judge: not entailed' };
      }
      return v;
    });
    const bad = vs.filter((v) => v.verdict === 'unsupported');
    verdicts.push(...vs);
    const screenOnly = bad.length > 0 && bad.every((v) => v.reason?.startsWith('screen'));
    if (!bad.length) {
      kept.push(beat);
      actions.push({ beatId: beat.id, action: 'kept', reason: 'all claims supported' });
    } else if (screenOnly) {
      // the words are fine but the picture said something unsupported: show the narration's own words instead
      const words = trimSentence(beat.narration, beat.role === 'takeaway' ? 12 : 9).replace(/[.!?]$/, '');
      const visual: Beat['visual'] =
        beat.role === 'takeaway'
          ? { type: 'takeaway', text: words, highlight: beat.keywords.slice(0, 1) }
          : { type: 'statement', text: words, highlight: beat.keywords.slice(0, 2) };
      kept.push({ ...beat, visual });
      actions.push({
        beatId: beat.id,
        action: 'rewritten',
        reason: `visual replaced: ${bad[0]!.reason ?? ''}`,
      });
    } else if (beat.role === 'hook') {
      const line = `${titleOf(script)}: here's the big idea.`;
      kept.push({
        ...beat,
        narration: line,
        visual: { type: 'title', title: titleOf(script), kicker: 'EXPLAINED' },
        claims: [{ text: line, support: [], kind: 'framing' }],
        keywords: [],
      });
      actions.push({
        beatId: beat.id,
        action: 'rewritten',
        reason: `hook: ${bad[0]!.reason ?? 'unsupported'}`,
      });
    } else if (beat.role === 'takeaway' && fallbackTakeaway) {
      kept.push({ ...fallbackTakeaway, id: beat.id });
      actions.push({
        beatId: beat.id,
        action: 'rewritten',
        reason: `takeaway replaced with a source sentence: ${bad[0]!.reason ?? ''}`,
      });
    } else {
      actions.push({
        beatId: beat.id,
        action: 'dropped',
        reason: bad.map((b) => b.reason ?? b.by).join('; '),
      });
    }
  });
  const renum = kept.map((b, i) => ({ ...b, id: `b${i + 1}` }));
  // count only what survives in the final script (dropped beats are no longer said)
  const finalIds = new Set(kept.map((b) => b.id));
  const unsupported = verdicts.filter(
    (v) =>
      v.verdict === 'unsupported' &&
      finalIds.has(v.beatId) &&
      !actions.some((a) => a.beatId === v.beatId && a.action === 'rewritten'),
  ).length;
  return {
    script: { ...script, beats: renum.length ? renum : script.beats.slice(0, 1) },
    report: { verdicts, unsupported, actions },
  };
}

/** A short spoken form of the title (before a colon, ≤ 8 words). */
function titleOf(s: Script): string {
  return s.title.split(/[:—–]/)[0]!.split(/\s+/).slice(0, 8).join(' ').trim() || 'This';
}
