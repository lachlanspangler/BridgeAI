/**
 * Deterministic faithfulness checks. Cheap, exact, and aimed at the most damaging hallucinations:
 *  - numbers: every number said or shown must appear in the cited source segments;
 *  - names: every proper noun / acronym said must appear in the source;
 *  - overlap: a fact claim must share enough content words with its support (else it goes to the judge);
 *  - citations: every fact claim cites at least one real segment.
 * The LLM judge (src/node/llm/judge.ts) decides paraphrases that fail only the overlap check.
 */
import type { Beat, ClaimVerdict, Script, Source, Visual } from '../schema.ts';
import {
  contentWords,
  coverage,
  initialCandidates,
  numbers,
  numberTokens,
  numberWords,
  properNouns,
  stem,
} from '../text/text.ts';

export interface CheckOptions {
  /** Minimum content-word overlap for a claim to pass without the judge. */
  minOverlap?: number;
  /** Send every claim that contains a number to the judge (set when a judge exists). */
  judgeNumbers?: boolean;
}

export interface BeatCheck {
  beatId: string;
  verdicts: ClaimVerdict[];
  /** Claims that failed only the overlap test (paraphrase?) and should go to the judge. */
  needsJudge: { claim: string; support: string; context: string }[];
  ok: boolean;
}

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

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (hay: string, w: string) =>
  new RegExp(`(?<![A-Za-z0-9])${esc(w)}(?![A-Za-z0-9])`, 'i').test(hay);

/** Number words that carry quantity claims ("ten times"), excluding everyday "one". */
const QUANTITY_WORDS =
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|billion|twice|double|triple|half)\b/gi;

export function missingNumbers(claim: string, support: string): string[] {
  const have = numberSet(support);
  const supTokens = numberTokens(support);
  const out: string[] = [];
  for (const t of numberTokens(claim)) {
    const f = Number(t.n);
    const valueOk = have.has(t.n) || have.has(String(f));
    // a magnitude in the claim (7B, 10×, 41%) must match a magnitude on the same number in the source
    const magOk =
      !t.mag ||
      supTokens.some(
        (x) => (x.n === t.n || Number(x.n) === f) && (x.mag === t.mag || (t.mag === '%' && x.mag === '')),
      );
    if (valueOk && magOk) continue;
    // single digits used as counts must appear as a standalone number, not inside "1990"
    if (/^\d$/.test(t.n) && hasWord(support, t.n) && magOk) continue;
    out.push(t.raw);
  }
  // spelled-out quantities ("ten times better") must be in the source as words or digits
  for (const m of claim.match(QUANTITY_WORDS) ?? []) {
    const d = numberWords(m)[0];
    if (hasWord(support, m) || (d && (have.has(d) || hasWord(support, d)))) continue;
    out.push(m);
  }
  return [...new Set(out)];
}

export function missingNames(claim: string, haystack: string): string[] {
  const missing = (n: string) =>
    !hasWord(haystack, n) && !hasWord(haystack, n.replace(/(['’]s|s)$/, '')) && !hasWord(haystack, `${n}s`);
  return [
    ...new Set([
      ...properNouns(claim).filter(missing),
      ...initialCandidates(claim, haystack).filter(missing),
    ]),
  ];
}

/** Names that occur mid-sentence (hard evidence of a name) vs only sentence-initially (judge decides). */
export function missingMidNames(claim: string, haystack: string): string[] {
  return properNouns(claim).filter(
    (n) =>
      !hasWord(haystack, n) && !hasWord(haystack, n.replace(/(['’]s|s)$/, '')) && !hasWord(haystack, `${n}s`),
  );
}

/** Hype and absolutes that small models add ("than ever before", "every time"). Allowed only if the source says them. */
const ABSOLUTES =
  /\b(than ever( before)?|every time|always|never|revolutioni[sz]\w*|game[- ]chang\w*|perfect(ly)?|guarantee[sd]?|completely|totally|unbeatable|the best ever|forever|instantly|flawless(ly)?|magic(al)?|smash(ing|es)? (old )?records?|blow(s)? away|crush(es|ing)?)\b/gi;

export function missingAbsolutes(claim: string, support: string): string[] {
  return [...new Set((claim.match(ABSOLUTES) ?? []).map((m) => m.toLowerCase()))].filter(
    (m) => !hasWord(support, m),
  );
}

/** Acronyms and model-style names (BLEU, GPT-4, Qwen3) missing from the haystack. */
export function missingAcronyms(text: string, haystack: string): string[] {
  return properNouns(text).filter(
    (n) => (/^[A-Z][A-Z0-9-]+$/.test(n) || /\d/.test(n)) && !hasWord(haystack, n),
  );
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

/** The hook may say how long the video is; that's not a claim about the source. */
const stripLength = (t: string) =>
  t.replace(
    /\b(in|under)\s+(twenty|thirty|ten|fifteen|sixty|ninety|one|two|three|four|five|six|seven|eight|nine|\d+)\s+(seconds?|minutes?)\b/gi,
    '',
  );

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
      // framing must carry no numbers and no names that aren't in the source ("in twenty seconds" is about the video)
      const t = stripLength(c.text);
      const nums = missingNumbers(t, everything);
      const names = missingNames(t, everything);
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
    const hype = missingAbsolutes(c.text, sup);
    if (hype.length) {
      verdicts.push({
        beatId: beat.id,
        claim: c.text,
        verdict: 'unsupported',
        by: 'names',
        reason: `overstates: "${hype.join('", "')}" is not in the source`,
      });
      continue;
    }
    const names = missingMidNames(c.text, `${sup}\n${src.title}`);
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
    // a capitalised first word unknown to the source may be a name ("Microsoft ran…"): the judge decides
    const maybe = initialCandidates(c.text, `${sup}\n${src.title}`);
    if (maybe.length) {
      needsJudge.push({ claim: c.text, support: sup, context: beat.narration });
      verdicts.push({
        beatId: beat.id,
        claim: c.text,
        verdict: 'unsupported',
        by: 'overlap',
        reason: `possible name not in the source: ${maybe.join(', ')} (needs judge)`,
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
    // numbers are where small models mislead most ("9 new each year" when 9 is emissions and 4 is net): a claim
    // with a number always goes to the judge (when one is available; without a judge, overlap decides)
    if (ov >= minOverlap && numbers(c.text).length && opts.judgeNumbers) {
      needsJudge.push({ claim: c.text, support: sup, context: beat.narration });
      verdicts.push({
        beatId: beat.id,
        claim: c.text,
        verdict: 'unsupported',
        by: 'overlap',
        reason: 'number claim (needs judge)',
      });
      continue;
    }
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
      const hype = missingAbsolutes(text, everything);
      if (hype.length) {
        verdicts.push({
          beatId: beat.id,
          claim: text,
          verdict: 'unsupported',
          by: 'names',
          reason: `${what === 'screen' ? 'screen' : 'narration'} overstates: "${hype.join('", "')}"`,
        });
        continue;
      }
      const nums = missingNumbers(text, hay);
      // on-screen labels are often Title Case, so only acronyms / model names count as names there
      const names =
        what === 'screen'
          ? missingAcronyms(text, `${hay}\n${src.title}`)
          : missingMidNames(text, `${hay}\n${src.title}`);
      if (what === 'narration' && !nums.length && !names.length) {
        // what is SAID must be covered, not only what the model listed as claims
        const claimed = new Set(beat.claims.flatMap((c) => contentWords(c.text).map(stem)));
        const extra = contentWords(text)
          .map(stem)
          .filter((w) => !claimed.has(w));
        const supWords = new Set(contentWords(hay).map(stem));
        const uncovered = extra.filter((w) => !supWords.has(w));
        const maybe = initialCandidates(text, `${hay}\n${src.title}`);
        if ((extra.length >= 2 && uncovered.length / extra.length > 0.5) || maybe.length) {
          needsJudge.push({ claim: text, support: hay, context: text });
          verdicts.push({
            beatId: beat.id,
            claim: text,
            verdict: 'unsupported',
            by: 'overlap',
            reason: maybe.length
              ? `possible name ${maybe.join(', ')} (needs judge)`
              : 'narration says more than its claims (needs judge)',
          });
          continue;
        }
      }
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
    for (const [what, text0] of [
      ['narration', beat.narration],
      ...visualStrings(beat.visual).map((x) => ['screen', x] as const),
    ] as const) {
      const text = stripLength(text0);
      const nums = missingNumbers(text, everything);
      const names = what === 'screen' ? missingAcronyms(text, everything) : missingNames(text, everything);
      const hype = missingAbsolutes(text, everything);
      if (hype.length) {
        verdicts.push({
          beatId: beat.id,
          claim: text,
          verdict: 'unsupported',
          by: 'names',
          reason: `hook overstates: "${hype.join('", "')}"`,
        });
        continue;
      }
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
