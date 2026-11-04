/**
 * The faithfulness gate: turn per-beat checks (+ judge rulings) into a FaithReport and a script in which every
 * beat is supported. Unsupported idea beats are dropped; a failing hook becomes framing on a title card; a
 * failing takeaway is replaced only by something already verified; a beat whose words pass but whose picture
 * doesn't gets a picture made of its own words. Report beat ids always refer to the returned script
 * (dropped beats are reported as `x-<old id>`).
 */
import type { Beat, ClaimVerdict, FaithReport, Script } from '../schema.ts';
import type { BeatCheck } from './check.ts';
import { trimSentence } from '../script/extractive.ts';

export interface GateResult {
  script: Script;
  report: FaithReport;
}

/** Beats the caller has already run through checkBeat successfully (e.g. a fallback takeaway). */
const verified = new WeakSet<Beat>();
export const markVerified = (b: Beat): Beat => (verified.add(b), b);

/** Judge rulings are keyed per beat so the same words with different citations aren't conflated. */
export const judgeKey = (beatId: string, claim: string): string => `${beatId}\u0000${claim}`;

type Outcome =
  | { beat: Beat; oldId: string; action: 'kept' | 'rewritten'; reason: string }
  | { oldId: string; action: 'dropped'; reason: string };

/** A short spoken form of the title (before a colon, ≤ 8 words). */
function titleOf(s: Script): string {
  return s.title.split(/[:—–]/)[0]!.split(/\s+/).slice(0, 8).join(' ').trim() || 'This';
}

function framingHook(script: Script, base?: Beat): Beat {
  const line = `${titleOf(script)}: here's the big idea.`;
  return {
    id: base?.id ?? 'b1',
    role: 'hook',
    narration: line,
    visual: { type: 'title', title: titleOf(script), kicker: 'EXPLAINED' },
    claims: [{ text: line, support: [], kind: 'framing' }],
    ideas: [],
    keywords: [],
  };
}

export function gate(
  script: Script,
  checks: BeatCheck[],
  judged: Map<string, boolean> = new Map(),
  fallbackTakeaway?: Beat,
): GateResult {
  const verdicts: ClaimVerdict[] = [];
  const outcomes: Outcome[] = [];
  script.beats.forEach((beat, i) => {
    const c = checks[i]!;
    const vs = c.verdicts.map((v) => {
      const k = judgeKey(beat.id, v.claim);
      const ruling = judged.has(k) ? judged.get(k) : judged.get(v.claim);
      if (v.verdict === 'unsupported' && v.by === 'overlap' && ruling !== undefined) {
        return ruling
          ? { ...v, verdict: 'supported' as const, by: 'judge' as const, reason: 'judge: entailed' }
          : { ...v, by: 'judge' as const, reason: 'judge: not entailed' };
      }
      return v;
    });
    verdicts.push(...vs);
    const bad = vs.filter((v) => v.verdict === 'unsupported');
    if (!bad.length)
      return void outcomes.push({ beat, oldId: beat.id, action: 'kept', reason: 'all claims supported' });
    if (bad.every((v) => v.reason?.startsWith('screen'))) {
      // the words are fine but the picture said something unsupported: show the narration's own words
      const words = trimSentence(beat.narration, beat.role === 'takeaway' ? 12 : 9).replace(/[.!?]$/, '');
      const visual: Beat['visual'] =
        beat.role === 'takeaway'
          ? { type: 'takeaway', text: words, highlight: beat.keywords.slice(0, 1) }
          : { type: 'statement', text: words, highlight: beat.keywords.slice(0, 2) };
      return void outcomes.push({
        beat: { ...beat, visual },
        oldId: beat.id,
        action: 'rewritten',
        reason: `visual replaced: ${bad[0]!.reason ?? ''}`,
      });
    }
    if (beat.role === 'hook')
      return void outcomes.push({
        beat: framingHook(script, beat),
        oldId: beat.id,
        action: 'rewritten',
        reason: `hook: ${bad[0]!.reason ?? 'unsupported'}`,
      });
    if (beat.role === 'takeaway') {
      if (fallbackTakeaway && verified.has(fallbackTakeaway))
        return void outcomes.push({
          beat: { ...fallbackTakeaway, id: beat.id },
          oldId: beat.id,
          action: 'rewritten',
          reason: `takeaway replaced with a verified source sentence: ${bad[0]!.reason ?? ''}`,
        });
      // otherwise restate the strongest beat we already kept (it passed every check)
      const prior = outcomes.find(
        (o): o is Extract<Outcome, { beat: Beat }> =>
          'beat' in o && o.beat.role !== 'hook' && o.action === 'kept',
      );
      if (prior) {
        const t = prior.beat;
        return void outcomes.push({
          beat: {
            ...t,
            id: beat.id,
            role: 'takeaway',
            visual: {
              type: 'takeaway',
              text: trimSentence(t.narration, 12).replace(/[.!?]$/, ''),
              highlight: t.keywords.slice(0, 1),
            },
          },
          oldId: beat.id,
          action: 'rewritten',
          reason: `takeaway restates a verified beat: ${bad[0]!.reason ?? ''}`,
        });
      }
    }
    outcomes.push({ oldId: beat.id, action: 'dropped', reason: bad.map((b) => b.reason ?? b.by).join('; ') });
  });

  let kept = outcomes.filter((o): o is Extract<Outcome, { beat: Beat }> => 'beat' in o);
  if (!kept.length) {
    // nothing survived: a framing card, never a beat we judged unsupported
    kept = [
      {
        beat: framingHook(script),
        oldId: '(none)',
        action: 'rewritten',
        reason: 'every beat was unsupported; framing only',
      },
    ];
  }
  const map = new Map<string, string>();
  kept.forEach((o, i) => map.set(o.oldId, `b${i + 1}`));
  const idOf = (old: string) => map.get(old) ?? `x-${old}`;
  const beats = kept.map((o, i) => ({ ...o.beat, id: `b${i + 1}` }));
  const actions: FaithReport['actions'] = outcomes.map((o) => ({
    beatId: idOf(o.oldId),
    action: o.action,
    reason: o.reason,
  }));
  if (kept[0]!.oldId === '(none)')
    actions.push({ beatId: 'b1', action: 'rewritten', reason: kept[0]!.reason });
  const rewrittenOld = new Set(kept.filter((o) => o.action === 'rewritten').map((o) => o.oldId));
  const remapped = verdicts.map((v) => ({ ...v, beatId: idOf(v.beatId) }));
  // unsupported = verdicts on beats that are still said as written (should be 0 by construction)
  const unsupported = verdicts.filter(
    (v) => v.verdict === 'unsupported' && map.has(v.beatId) && !rewrittenOld.has(v.beatId),
  ).length;
  return { script: { ...script, beats }, report: { verdicts: remapped, unsupported, actions } };
}
