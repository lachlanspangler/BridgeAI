/**
 * Deterministic faithfulness checks. Cheap, exact, and aimed at the most damaging hallucinations:
 *  - numbers: every number said or shown must appear in the cited source segments;
 *  - names: every proper noun / acronym said must appear in the source;
 *  - overlap: a fact claim must share enough content words with its support (else it goes to the judge);
 *  - citations: every fact claim cites at least one real segment.
 * The LLM judge (src/node/llm/judge.ts) decides paraphrases that fail only the overlap check.
 */
import type { Beat, ClaimVerdict, Script, Source, Visual } from '../schema.ts';
import { coverage, normNumber, numbers, numberWords, properNouns } from '../text/text.ts';

export interface CheckOptions {
  /** Minimum content-word overlap for a claim to pass without the judge. */
  minOverlap?: number;
}

export interface BeatCheck {
  beatId: string;
  verdicts: ClaimVerdict[];
  /** Claims that failed only the overlap test (paraphrase?) and should go to the judge. */
  needsJudge: { claim: string; support: string; context: string }[];
  ok: boolean;
}

const lower = (s: string) => s.toLowerCase();

function sourceText(src: Source, ids: string[]): string {
  const set = new Set(ids);
  return src.segments
    .filter((s) => set.has(s.id))
    .map((s) => s.text)
    .join('\n');
}

function allText(src: Source): string {
  return [
    src.title,
    ...src.segments.map((s) => s.text),
    ...src.assets.map((a) => `${a.caption ?? ''} ${a.ocr ?? ''}`),
  ].join('\n');
}

/** Numbers present in a text, normalised, plus forms like "28.4" from "28.40" and "3000" from "3,000". */
function numberSet(text: string): Set<string> {
  const set = new Set<string>();
  for (const n of numbers(text)) {
    set.add(n);
    const f = Number(n);
    if (Number.isFinite(f)) {
      set.add(String(f));
      // allow rounding to 2 significant figures in narration (rule 37)
      set.add(String(Number(f.toPrecision(2))));
      set.add(String(Math.round(f)));
      if (Math.abs(f) < 1) set.add(String(Math.round(f * 100))); // 0.41 ↔ 41%
      if (Math.abs(f) >= 1 && Math.abs(f) <= 100) set.add(String(f / 100));
    }
  }
  for (const w of numberWords(text)) set.add(w);
  return set;
}

export function missingNumbers(claim: string, support: string): string[] {
  const have = numberSet(support);
  const out: string[] = [];
  for (const raw of numbers(claim)) {
    const n = normNumber(raw);
    const f = Number(n);
    if (have.has(n) || have.has(String(f))) continue;
    // years and single digits used as list counts ("two ideas") are allowed if present anywhere in support words
    if (/^\d$/.test(n) && support.includes(n)) continue;
    out.push(raw);
  }
  return out;
}

export function missingNames(claim: string, haystack: string): string[] {
  const hay = lower(haystack);
  return properNouns(claim).filter((n) => {
    const w = lower(n);
    if (hay.includes(w)) return false;
    // tolerate plural/possessive forms
    if (hay.includes(w.replace(/s$/, ''))) return false;
    return true;
  });
}

/** Acronyms and model-style names (BLEU, GPT-4, Qwen3) missing from the haystack. */
export function missingAcronyms(text: string, haystack: string): string[] {
  const hay = haystack.toLowerCase();
  return properNouns(text).filter((n) => (/^[A-Z][A-Z0-9-]+$/.test(n) || /\d/.test(n)) && !hay.includes(n.toLowerCase()));
}

/** Strings shown on screen by a visual (to check them like narration). */
export function visualStrings(v: Visual): string[] {
  switch (v.type) {
    case 'title':
      return [v.title, v.subtitle ?? ''];
    case 'statement':
      return [v.text];
    case 'bigNumber':
      return [
        `${v.value} ${v.unit ?? ''}`,
        v.label,
        v.compare ? `${v.compare.value} ${v.compare.label}` : '',
      ];
    case 'bullets':
      return [v.heading ?? '', ...v.items];
    case 'bars':
      return [v.title, ...v.bars.map((b) => `${b.label} ${b.value}`)];
    case 'flow':
      return [v.title ?? '', ...v.nodes.map((n) => n.label), ...v.edges.map((e) => e.label ?? '')];
    case 'compare':
      return [v.left.label, ...v.left.points, v.right.label, ...v.right.points];
    case 'quote':
      return [v.text];
    case 'code':
      return [v.caption ?? ''];
    case 'figure':
      return [v.caption ?? ''];
    case 'tree':
      return [v.title ?? ''];
    case 'takeaway':
      return [v.text];
  }
}

export function checkBeat(beat: Beat, src: Source, opts: CheckOptions = {}): BeatCheck {
  const minOverlap = opts.minOverlap ?? 0.5;
  const everything = allText(src);
  const verdicts: ClaimVerdict[] = [];
  const needsJudge: BeatCheck['needsJudge'] = [];
  const cited = [...new Set(beat.claims.flatMap((c) => c.support))].filter((id) =>
    src.segments.some((s) => s.id === id),
  );
  const beatSupport = cited.length ? sourceText(src, cited) : '';
  const isFraming = beat.role === 'hook' && beat.claims.every((c) => c.kind === 'framing');

  for (const c of beat.claims) {
    if (c.kind === 'framing') {
      // framing must carry no numbers and no names that aren't in the source
      const nums = missingNumbers(c.text, everything);
      const names = missingNames(c.text, everything);
      if (nums.length || names.length) {
        verdicts.push({
          beatId: beat.id,
          claim: c.text,
          verdict: 'unsupported',
          by: nums.length ? 'numbers' : 'names',
          reason: `framing mentions ${[...nums, ...names].join(', ')} not in the source`,
        });
      } else verdicts.push({ beatId: beat.id, claim: c.text, verdict: 'framing', by: 'framing' });
      continue;
    }
    const ids = c.support.filter((id) => src.segments.some((s) => s.id === id));
    if (!ids.length) {
      verdicts.push({
        beatId: beat.id,
        claim: c.text,
        verdict: 'unsupported',
        by: 'overlap',
        reason: 'cites no real source segment',
      });
      continue;
    }
    const sup = sourceText(src, ids);
    const nums = missingNumbers(c.text, sup);
    if (nums.length) {
      verdicts.push({
        beatId: beat.id,
        claim: c.text,
        verdict: 'unsupported',
        by: 'numbers',
        reason: `numbers not in cited source: ${nums.join(', ')}`,
      });
      continue;
    }
    const names = missingNames(c.text, `${sup}\n${src.title}`);
    if (names.length) {
      verdicts.push({
        beatId: beat.id,
        claim: c.text,
        verdict: 'unsupported',
        by: 'names',
        reason: `names not in cited source: ${names.join(', ')}`,
      });
      continue;
    }
    if (c.kind === 'analogy') {
      verdicts.push({
        beatId: beat.id,
        claim: c.text,
        verdict: 'framing',
        by: 'framing',
        reason: 'analogy (not presented as a source claim)',
      });
      continue;
    }
    const ov = coverage(c.text, sup);
    if (ov >= minOverlap)
      verdicts.push({ beatId: beat.id, claim: c.text, verdict: 'supported', by: 'overlap' });
    else {
      needsJudge.push({ claim: c.text, support: sup, context: beat.narration });
      verdicts.push({
        beatId: beat.id,
        claim: c.text,
        verdict: 'unsupported',
        by: 'overlap',
        reason: `low overlap ${ov.toFixed(2)} (needs judge)`,
      });
    }
  }

  // the narration as a whole and the on-screen text: no number or name may appear that the beat's sources lack
  if (!isFraming) {
    const hay = beatSupport || everything;
    for (const [what, text] of [
      ['narration', beat.narration],
      ...visualStrings(beat.visual).map((s) => ['screen', s] as const),
    ] as const) {
      if (!text) continue;
      const nums = missingNumbers(text, hay);
      // on-screen labels are often Title Case, so only acronyms / model names count as names there
      const names = what === 'screen' ? missingAcronyms(text, `${hay}\n${src.title}`) : missingNames(text, `${hay}\n${src.title}`);
      if (nums.length || names.length) {
        verdicts.push({
          beatId: beat.id,
          claim: text,
          verdict: 'unsupported',
          by: nums.length ? 'numbers' : 'names',
          reason: `${what} has ${[...nums, ...names].join(', ')} not in the cited source`,
        });
      }
    }
  } else {
    for (const [what, text] of [['narration', beat.narration], ...visualStrings(beat.visual).map((x) => ['screen', x] as const)] as const) {
      const nums = missingNumbers(text, everything);
      const names = what === 'screen' ? missingAcronyms(text, everything) : missingNames(text, everything);
      if (nums.length || names.length)
        verdicts.push({
          beatId: beat.id,
          claim: text,
          verdict: 'unsupported',
          by: nums.length ? 'numbers' : 'names',
          reason: `${what === 'screen' ? 'screen' : 'hook'} has ${[...nums, ...names].join(', ')} not in the source`,
        });
    }
  }
  return { beatId: beat.id, verdicts, needsJudge, ok: verdicts.every((v) => v.verdict !== 'unsupported') };
}

export function checkScript(script: Script, src: Source, opts: CheckOptions = {}): BeatCheck[] {
  return script.beats.map((b) => checkBeat(b, src, opts));
}
