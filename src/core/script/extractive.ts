/**
 * Extractive script writer (no model). Turns ranked ideas into beats that fit the length budget:
 *   hook (title card) → one beat per idea (statement / big number / figure) → takeaway.
 * Narration is the source's own sentences, lightly trimmed (citations, parentheticals, lead-ins), so every
 * factual claim is supported by construction. The LLM writer produces better prose; this is the floor.
 */
import type { Budget } from '../budget.ts';
import type { Analysis, Beat, Idea, Script, Source, Visual } from '../schema.ts';
import { analyzeExtractive, garbled, rawNumbers } from '../analyze/extractive.ts';
import {
  clampWords,
  cleanForSpeech,
  sentences,
  contentWords,
  coverage,
  sentenceCase,
  wordCount,
} from '../text/text.ts';

const LEADINS =
  /^(in this (paper|work|article|post|project),?\s*|here,?\s*|overall,?\s*|in summary,?\s*|to summarize,?\s*|finally,?\s*|moreover,?\s*|furthermore,?\s*|additionally,?\s*|in addition,?\s*|specifically,?\s*|notably,?\s*)/i;

export const VERB =
  /\b(is|are|was|were|be|has|have|had|can|could|will|would|does|do|did|makes?|made|lets?|uses?|used|achiev\w*|establish\w*|shows?|showed|propos\w*|improv\w*|reduc\w*|outperform\w*|enabl\w*|allows?|requir\w*|provid\w*|generaliz\w*|connect\w*|introduc\w*|present\w*|finds?|found|runs?|takes?|learns?|trains?|predicts?|leads?|builds?|works?|relies|rel(y|ies) on|depends?|replac\w*|combin\w*|turns?|gives?|creates?|helps?|supports?|keeps?|scales?|beats?|cuts?|needs?|means?|dispens\w*|based|contains?|consists?|offers?|converts?|formats?|generates?|measures?|times|benchmarks?)\b/i;
const PREP_LEAD = /^(on|in|for|with|at|by|using|after|from|across|under|over|during|to|via|when|while|as)\b/i;

/** Make a source sentence speakable and shorter without changing what it claims. */
export function trimSentence(s: string, maxWords: number, terms: string[] = []): string {
  let t = cleanForSpeech(s).replace(LEADINS, '');
  t = t.replace(/\s*\([^)]{0,80}\)/g, ''); // parentheticals
  t = sentenceCase(t);
  if (wordCount(t) <= maxWords) return ensurePeriod(tidyEnd(t));
  // choose the best contiguous run of clauses: must contain a verb, fit the budget, cover key terms
  const parts = t.split(/(?<=[,;:])\s+|\s+(?=which |while |whereas |including |such as )/);
  const low = terms.map((x) => x.toLowerCase());
  let best = '';
  let bestScore = -Infinity;
  for (let i = 0; i < parts.length; i++) {
    for (let j = i; j < parts.length; j++) {
      const run = parts
        .slice(i, j + 1)
        .join(' ')
        .replace(/[,;:]$/, '');
      const n = wordCount(run);
      if (n > maxWords) break;
      if (n < Math.min(5, maxWords)) continue;
      const hasVerb = VERB.test(run);
      const startsWithPrep = PREP_LEAD.test(run);
      const hits = low.filter((x) => run.toLowerCase().includes(x)).length;
      const score =
        (hasVerb ? 10 : 0) - (startsWithPrep && j === i ? 4 : 0) + hits * 2 + n * 0.15 - (i > 0 ? 0.5 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = run;
      }
    }
  }
  if (best && VERB.test(best))
    return ensurePeriod(tidyEnd(sentenceCase(best.replace(/^(and|but|so|which|while)\s+/i, ''))));
  return ensurePeriod(tidyEnd(clampWords(t, maxWords).replace(/…$/, '')));
}

/** Never end on a dangling word ("…with different", "…and", "…much"): cut back to the last content word. */
export function tidyEnd(t: string): string {
  const DANGLE =
    /\s+(and|or|but|the|a|an|of|to|with|by|for|in|on|at|from|than|as|that|which|is|are|was|were|be|more|much|less|different|very|its|their|our|this|these|can|could|will|would|should|may|might|must|over|under|about|into|not|also|so|it|they|we|you|just|only|between|across|through|among|via|per|like|such|eg|etc|including)[,;:]?$/i;
  let out = t.replace(/[,;:\s]+$/, '');
  for (let i = 0; i < 6 && DANGLE.test(out); i++) out = out.replace(DANGLE, '').replace(/[,;:\s]+$/, '');
  return out;
}

const ensurePeriod = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

/** A short on-screen headline (≤ n words) from a sentence: the clause with the most key terms. */
export function headline(sentence: string, terms: string[], n: number): string {
  const t = cleanForSpeech(sentence)
    .replace(LEADINS, '')
    .replace(/^we (propose|present|introduce|show that|find that)\s+/i, '');
  const clauses = t.split(/[,;:]\s+|\s+(?:which|that|while|because)\s+/).filter((c) => wordCount(c) >= 2);
  const low = terms.map((x) => x.toLowerCase());
  let best = clauses[0] ?? t;
  let bestHits = -1;
  for (const c of clauses) {
    const hits = low.filter((x) => c.toLowerCase().includes(x)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = c;
    }
  }
  return sentenceCase(clampWords(best.replace(/[.!?]$/, ''), n).replace(/…$/, ''));
}

const SPOKEN_LENGTH: Record<number, string> = {
  20: 'twenty seconds',
  60: 'one minute',
  180: 'three minutes',
  300: 'five minutes',
};

function hookBeat(src: Source, budget: Budget): Beat {
  const short = clampWords(src.title.replace(/[:.].*$/, ''), 8).replace(/…$/, '');
  const len = SPOKEN_LENGTH[budget.seconds];
  return {
    id: 'b1',
    role: 'hook',
    narration: len ? `${short}, in ${len}.` : `${short}, explained.`,
    visual: {
      type: 'title',
      title: short,
      kicker: src.kind === 'project' ? 'PROJECT' : src.kind === 'pdf' ? 'PAPER' : 'EXPLAINED',
    },
    claims: [{ text: short, support: [], kind: 'framing' }],
    ideas: [],
    keywords: [],
  };
}

function ideaVisual(idea: Idea, src: Source, budget: Budget): Visual {
  const fig = idea.assets[0] ? src.assets.find((a) => a.id === idea.assets[0]) : undefined;
  if (fig)
    return {
      type: 'figure',
      assetId: fig.id,
      caption: fig.caption ? fig.caption.split(/\s+/).slice(0, 12).join(' ') : undefined,
    };
  const nums = rawNumbers(idea.statement).filter((x) => /\d/.test(x) && !/^\d$/.test(x));
  if (nums.length && (idea.kind === 'number' || idea.kind === 'result')) {
    const m = nums[0]!.match(/^([\d.,]+)\s*(.*)$/);
    return {
      type: 'bigNumber',
      value: m?.[1] ?? nums[0]!,
      unit: m?.[2] || undefined,
      label: headline(idea.statement.replace(nums[0]!, ''), idea.terms, budget.maxScreenWords),
    };
  }
  return {
    type: 'statement',
    text: headline(idea.statement, idea.terms, budget.maxScreenWords),
    highlight: idea.terms.slice(0, 2),
  };
}

/** A paper's "we/our" read aloud by a narrator becomes "the authors/their" (same claim, right voice). */
export function thirdPerson(t: string): string {
  // the first "we" names the authors; later ones become "they" ("…and we wonder how we can help" →
  // "…and the authors wonder how they can help")
  let named = false;
  return t
    .replace(/\b([Ww]e)\b/g, (_m, w: string) => {
      const first = !named;
      named = true;
      return first ? (w === 'We' ? 'The authors' : 'the authors') : w === 'We' ? 'They' : 'they';
    })
    .replace(/^Our\b/, 'Their')
    .replace(/\bour\b/g, 'their')
    .replace(/\bus\b/g, 'them');
}

/** One faithful beat for an idea, in the source's own words (its verbatim evidence quote, trimmed). */
export function sourceBeat(idea: Idea, src: Source, budget: Budget, id: string): Beat | null {
  const quote = idea.evidence.find((e) => e.quote)?.quote ?? idea.statement;
  const narration = thirdPerson(trimSentence(quote, budget.wordsPerBeat.max + 2, idea.terms));
  if (wordCount(narration) < 4 || !VERB.test(narration)) return null; // a real sentence, not a fragment
  return {
    id,
    role: 'evidence',
    narration,
    visual: ideaVisual({ ...idea, statement: quote }, src, budget),
    claims: [{ text: narration, support: idea.evidence.map((e) => e.segmentId), kind: 'fact' }],
    ideas: [idea.id],
    keywords: idea.terms.slice(0, 3),
  };
}

export function composeExtractive(src: Source, analysis: Analysis, budget: Budget): Script {
  const beats: Beat[] = [hookBeat(src, budget)];
  const hookWords = wordCount(beats[0]!.narration);
  const takeawayWords = Math.min(12, Math.round(budget.words * 0.18));
  let remaining = budget.words - hookWords - takeawayWords;
  const maxIdeaBeats = Math.max(1, budget.beats.max - 2);
  // long videos need more beats than there are top ideas: top up with the source's own ranked sentences
  let ideas = analysis.ideas.slice(0, Math.max(budget.ideas.max, 1));
  if (ideas.length < maxIdeaBeats) {
    const extra = analyzeExtractive(src, maxIdeaBeats + 4).ideas.filter(
      (x) => !ideas.some((i) => i.evidence[0]?.quote === x.evidence[0]?.quote || i.statement === x.statement),
    );
    ideas = [...ideas, ...extra.map((x, k) => ({ ...x, id: `x${k + 1}` }))].slice(0, maxIdeaBeats);
  }
  for (const idea of ideas) {
    if (beats.length - 1 >= maxIdeaBeats || remaining < budget.wordsPerBeat.min) break;
    const cap = Math.min(budget.wordsPerBeat.max, remaining);
    const narration = trimSentence(idea.statement, cap, idea.terms);
    const n = wordCount(narration);
    if (n < 4) continue;
    remaining -= n;
    beats.push({
      id: `b${beats.length + 1}`,
      role:
        beats.length === 1 ? 'idea' : idea.kind === 'number' || idea.kind === 'result' ? 'evidence' : 'idea',
      narration,
      visual: ideaVisual(idea, src, budget),
      claims: [{ text: narration, support: idea.evidence.map((e) => e.segmentId), kind: 'fact' }],
      ideas: [idea.id],
      keywords: idea.terms.slice(0, 3),
    });
  }
  // takeaway: the top idea again, shorter, as the single thing to remember
  const top = analysis.ideas[0];
  if (top) {
    let said = trimSentence(top.statement, Math.max(6, takeawayWords), top.terms);
    if (beats.some((b) => b.narration === said))
      said = trimSentence(
        top.statement,
        Math.max(5, Math.min(takeawayWords, wordCount(said) - 3)),
        top.terms,
      );
    beats.push({
      id: `b${beats.length + 1}`,
      role: 'takeaway',
      narration: said,
      visual: {
        type: 'takeaway',
        text: headline(top.statement, top.terms, budget.maxScreenWords),
        highlight: top.terms.slice(0, 1),
      },
      claims: [{ text: said, support: top.evidence.map((e) => e.segmentId), kind: 'fact' }],
      ideas: [top.id],
      keywords: top.terms.slice(0, 2),
    });
  }
  return {
    schema: 'bridge.script/1',
    title: src.title,
    targetSeconds: budget.seconds,
    beats,
    engine: 'extractive',
  };
}

/** Total narration words in a script. */
export const scriptWords = (s: Script): number => s.beats.reduce((n, b) => n + wordCount(b.narration), 0);

/** Distinct content words, used to sanity check on-screen text. */
export const distinctTerms = (s: string): number => new Set(contentWords(s)).size;

/**
 * On-screen text from whole clauses, never a word-count cut: the first sentence/clause that fits n words and
 * still says something (has a verb or a number), tidied so it never ends on a dangling word.
 */
export function screenPhrase(text: string, n: number): string {
  const t = cleanForSpeech(text).replace(/[.!?]$/, '');
  if (wordCount(t) <= n) return tidyEnd(t);
  const parts = t.split(/(?<=[.!?])\s+/);
  for (const sen of parts)
    if (wordCount(sen) <= n && wordCount(sen) >= 2) return tidyEnd(sen.replace(/[.!?]$/, ''));
  const clauses = t.split(/[,;:—]\s+|\s+(?=(?:which|while|because|so that|making|but)\s)/);
  const good = clauses.find((c) => wordCount(c) <= n && wordCount(c) >= 2 && (VERB.test(c) || /\d/.test(c)));
  if (good) return tidyEnd(good);
  const first = clauses.find((c) => wordCount(c) <= n && wordCount(c) >= 2);
  return tidyEnd(first ?? t.split(/\s+/).slice(0, n).join(' '));
}

/** What a number counts, from the narration: "126 random bits versus 122" → "random bits". */
export function numberLabel(narration: string, value: string): string | null {
  const v = value.replace(/[^\d.]/g, '');
  if (!v) return null;
  const re = new RegExp(
    `${v.replace('.', '\\.')}\\s*(?:%|x|×)?\\s+([A-Za-z][A-Za-z-]*(?:\\s+[A-Za-z][A-Za-z-]*){0,3})`,
  );
  const m = narration.match(re);
  if (!m) return null;
  const ws = m[1]!.split(/\s+/);
  const stop = ws.findIndex((w) =>
    /^(versus|vs|than|and|or|but|on|in|after|for|to|with|while|which|that|by|is|are|was|were|just)$/i.test(w),
  );
  const label = (stop < 0 ? ws : ws.slice(0, stop)).join(' ');
  return label.length >= 3 ? label : null;
}

/**
 * The source's own "what is it" sentence: the first sentence of the abstract / README lead / note that defines
 * or introduces the subject ("X is a…", "We introduce X…", "This package contains…"). Faithful by construction.
 */
/** "This modest package contains …" → "humanize is a package that contains …": the video says the name. */
export function namedSubject(t: string, subject: string): string {
  if (!subject || /^\d+ (images|files)$/i.test(subject)) return t;
  const m = t.match(
    /^This (?:modest |small |tiny |simple )?(package|library|tool|project|module|crate|app)\s+(is|contains|provides|lets|helps|introduces|offers)\b\s*/i,
  );
  if (!m) return t;
  const rest = t.slice(m[0].length);
  return m[2]!.toLowerCase() === 'is'
    ? `${subject} is ${rest}`
    : `${subject} is a ${m[1]!.toLowerCase()} that ${m[2]!.toLowerCase()} ${rest}`;
}

export function whatIsIt(src: Source): { text: string; segmentId: string } | null {
  const lead = src.segments.filter((s) => s.kind === 'abstract' || s.kind === 'paragraph').slice(0, 4);
  const titleWords = new Set(contentWords(src.title).map((w) => w.toLowerCase()));
  const subject = src.title.split(/[:—–]/)[0]!.trim();
  const mentionsSubject = (t: string) => contentWords(t).some((w) => titleWords.has(w.toLowerCase()));
  const INTRO =
    /\b(we (introduce|propose|present)|this (modest )?(package|library|tool|project|paper|work) (contains|provides|is|lets|helps|introduces))\b/i;
  const DEF = /\b(is an?|are an?|is the|refers to|(contains|provides) (various|a|an))\b/i;
  // a project's tagline ("A command-line benchmarking tool.") reads as "<name> is a command-line benchmarking tool."
  if (src.kind === 'project') {
    for (const seg of lead.slice(0, 3)) {
      const first = cleanForSpeech(sentences(seg.text)[0] ?? '').replace(/[.!]$/, '');
      if (
        /^(A|An)\s+[A-Za-z-]+/.test(first) &&
        wordCount(first) <= 14 &&
        !VERB.test(first) &&
        !garbled(first)
      )
        return {
          text: `${subject} is ${first.charAt(0).toLowerCase()}${first.slice(1)}.`,
          segmentId: seg.id,
        };
    }
  }
  for (const seg of lead) {
    for (const sen of sentences(seg.text)) {
      const t = cleanForSpeech(sen);
      if (wordCount(t) < 6 || wordCount(t) > 45 || garbled(t)) continue;
      if (INTRO.test(t) || (DEF.test(t) && mentionsSubject(t)))
        return { text: namedSubject(t, subject), segmentId: seg.id };
    }
  }
  // no definition sentence: the earliest lead sentence that names most of a descriptive title is the topic
  // sentence ("Tackling Climate Change with Machine Learning" -> "Climate change is one of the greatest ...")
  if (contentWords(src.title).length >= 3 && !/^\d+ (images|files)$/i.test(src.title.trim())) {
    for (const seg of lead) {
      for (const sen of sentences(seg.text)) {
        const t = cleanForSpeech(sen);
        if (wordCount(t) < 6 || wordCount(t) > 45 || garbled(t) || !VERB.test(t)) continue;
        if (coverage(src.title, t) >= 0.6) return { text: t, segmentId: seg.id };
      }
    }
  }
  return null;
}
