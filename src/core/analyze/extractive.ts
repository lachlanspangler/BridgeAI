/**
 * The extractive floor: ranks the source's own sentences into key ideas with no model at all.
 * Faithful by construction (every idea is a sentence from the source), instant, deterministic. It is the
 * fallback when no LLM is available and the baseline the LLM path must beat in the evals.
 *
 * Score = TextRank centrality (content-word overlap graph) × structure prior (title/abstract/conclusion,
 * cue phrases like "we propose", numbers with units) × length fit.
 */
import type { Analysis, Idea, IdeaKind, Segment, Source } from '../schema.ts';
import { cleanForSpeech, contentWords, numbers, properNouns, sentences, stem, wordCount } from '../text/text.ts';

export interface Candidate {
  segmentId: string;
  text: string;
  /** Index of the sentence across the document (reading order). */
  order: number;
  kind: Segment['kind'];
  section: string;
  score: number;
}

const CUE_STRONG =
  /\b(we (propose|present|introduce|show|find|demonstrate|develop)|this (paper|work|project|library|tool) (proposes|presents|introduces|shows|is|lets|provides)|our (main |key )?(contribution|result|finding|approach|method|model)s?|in this (paper|work)|achiev(es|ed|ing)|outperform|state[- ]of[- ]the[- ]art|for the first time|key (idea|insight)|we conclude|the main)/i;
const CUE_CORE = /\b(we (propose|introduce|present)|this (paper|work) (proposes|introduces|presents)|is a (new|novel)|main (idea|contribution))\b/i;
const CUE_WEAK = /\b(significant(ly)?|improv(e|es|ed|ement)|reduc(e|es|ed|tion)|faster|better|novel|simple|enables?|allows?|so that|because)\b/i;
const CUE_BAD =
  /\b(acknowledg|copyright|licen[cs]e|arxiv|preprint|correspond(ing|ence)|e-?mail|https?:|doi|table \d|figure \d|appendix|et al\b|ibid|section \d|see \w+ \d)/i;
const SECTION_GOOD = /abstract|introduction|conclusion|summary|overview|discussion|results?|readme|about|features/i;
const SECTION_BAD = /related work|references|bibliography|acknowledg|appendix|license|contributing|changelog|install/i;

export function candidates(src: Source): Candidate[] {
  const out: Candidate[] = [];
  let order = 0;
  for (const seg of src.segments) {
    if (!['abstract', 'paragraph', 'list', 'caption', 'title'].includes(seg.kind)) continue;
    const section = (seg.loc.section ?? []).join(' / ');
    for (const raw of seg.kind === 'title' ? [seg.text] : sentences(seg.text)) {
      const text = cleanForSpeech(raw);
      const n = wordCount(text);
      if (seg.kind !== 'title' && (n < 6 || n > 60)) continue;
      out.push({ segmentId: seg.id, text, order: order++, kind: seg.kind, section, score: 0 });
    }
  }
  return out;
}

/** TextRank over sentences: PageRank on a content-word overlap graph. */
export function textRank(texts: string[], iterations = 40, d = 0.85): number[] {
  const n = texts.length;
  if (n === 0) return [];
  const bags = texts.map((t) => new Set(contentWords(t).map(stem)));
  const w: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = bags[i]!;
      const b = bags[j]!;
      if (a.size < 2 || b.size < 2) continue;
      let common = 0;
      for (const x of a) if (b.has(x)) common++;
      if (!common) continue;
      const sim = common / (Math.log(a.size + 1) + Math.log(b.size + 1));
      w[i]![j] = sim;
      w[j]![i] = sim;
    }
  }
  const outSum = w.map((row) => row.reduce((s, x) => s + x, 0));
  let r = new Array<number>(n).fill(1 / n);
  for (let it = 0; it < iterations; it++) {
    const next = new Array<number>(n).fill((1 - d) / n);
    for (let j = 0; j < n; j++) {
      if (!outSum[j]) continue;
      for (let i = 0; i < n; i++) {
        const wji = w[j]![i]!;
        if (wji) next[i]! += (d * r[j]! * wji) / outSum[j]!;
      }
    }
    r = next;
  }
  const max = Math.max(...r);
  return r.map((x) => (max > 0 ? x / max : 0));
}

export function classify(text: string): IdeaKind {
  if (/\b(we (propose|present|introduce|develop)|architecture|consists of|composed of|layers?|module|pipeline)\b/i.test(text))
    return /architecture|layers?|module|consists|composed/i.test(text) ? 'architecture' : 'method';
  if (numbers(text).length && /\b(achiev|improv|outperform|reduc|accuracy|score|faster|times|%|percent|bleu|f1)\b/i.test(text))
    return 'number';
  if (/\b(results?|show|find|demonstrate|outperform|achiev)\b/i.test(text)) return 'result';
  if (/\b(problem|challenge|limitation|difficult|bottleneck|however|but)\b/i.test(text)) return 'problem';
  if (/\b(is a|is an|refers to|defined as|means)\b/i.test(text)) return 'definition';
  return 'claim';
}

export function scoreCandidates(src: Source, cands: Candidate[]): Candidate[] {
  const tr = textRank(cands.map((c) => c.text));
  const titleWords = new Set(contentWords(src.title).map(stem));
  const total = Math.max(1, cands.length);
  return cands.map((c, i) => {
    let prior = 1;
    if (c.kind === 'abstract') prior *= 1.6;
    if (c.kind === 'caption') prior *= 0.7;
    if (c.kind === 'title') prior *= 0.2; // titles are used for the hook, rarely as an idea
    if (SECTION_GOOD.test(c.section)) prior *= 1.25;
    if (SECTION_BAD.test(c.section)) prior *= 0.25;
    if (CUE_STRONG.test(c.text)) prior *= 1.6;
    if (CUE_CORE.test(c.text)) prior *= 1.6;
    if (CUE_WEAK.test(c.text)) prior *= 1.15;
    if (CUE_BAD.test(c.text)) prior *= 0.3;
    if (numbers(c.text).length) prior *= 1.2;
    // early sentences matter more (inverted pyramid), gently
    prior *= 1 + 0.35 * (1 - c.order / total);
    const tw = contentWords(c.text).map(stem);
    const titleHits = tw.filter((w) => titleWords.has(w)).length;
    prior *= 1 + Math.min(0.6, titleHits * 0.2);
    const n = wordCount(c.text);
    const lengthFit = n < 10 ? 0.75 : n > 40 ? 0.7 : 1;
    return { ...c, score: (0.35 + tr[i]!) * prior * lengthFit };
  });
}

/** Pick top ideas with redundancy control (MMR-style). */
export function selectDiverse(cands: Candidate[], k: number, lambda = 0.7): Candidate[] {
  const pool = [...cands].sort((a, b) => b.score - a.score).slice(0, 60);
  const chosen: Candidate[] = [];
  const bag = (t: string) => new Set(contentWords(t).map(stem));
  const bags = new Map(pool.map((c) => [c, bag(c.text)]));
  const maxScore = pool[0]?.score ?? 1;
  while (chosen.length < k && pool.length) {
    let best = -Infinity;
    let bestIdx = 0;
    pool.forEach((c, idx) => {
      const b = bags.get(c)!;
      let sim = 0;
      for (const ch of chosen) {
        const o = bags.get(ch)!;
        let common = 0;
        for (const x of b) if (o.has(x)) common++;
        sim = Math.max(sim, common / Math.max(1, Math.min(b.size, o.size)));
      }
      const mmr = lambda * (c.score / maxScore) - (1 - lambda) * sim;
      if (mmr > best) {
        best = mmr;
        bestIdx = idx;
      }
    });
    chosen.push(pool.splice(bestIdx, 1)[0]!);
  }
  return chosen;
}

export function keyTerms(text: string, docFreq: Map<string, number>, k = 3): string[] {
  const names = properNouns(text).filter((w) => w.length > 2);
  const cws = contentWords(text);
  const scored = [...new Set(cws)]
    .map((w) => ({ w, s: (docFreq.get(stem(w)) ?? 1) * Math.min(1.5, w.length / 6) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.w);
  return [...new Set([...names, ...scored])].slice(0, k);
}

export function analyzeExtractive(src: Source, maxIdeas = 12): Analysis {
  const scored = scoreCandidates(src, candidates(src)).filter((c) => c.kind !== 'title');
  const picked = selectDiverse(scored, maxIdeas);
  const df = new Map<string, number>();
  for (const c of scored) for (const w of new Set(contentWords(c.text).map(stem))) df.set(w, (df.get(w) ?? 0) + 1);
  const top = picked[0]?.score ?? 1;
  const ideas: Idea[] = picked.map((c, i) => ({
    id: `i${i + 1}`,
    statement: c.text,
    kind: classify(c.text),
    importance: Math.round((c.score / top) * 1000) / 1000,
    evidence: [{ segmentId: c.segmentId, quote: c.text }],
    numbers: rawNumbers(c.text),
    terms: keyTerms(c.text, df),
    assets: [],
  }));
  return { schema: 'bridge.analysis/1', gist: picked[0]?.text ?? src.title, ideas, engine: 'extractive' };
}

/** Numbers as they appear (with units), for on-screen display. */
export function rawNumbers(text: string): string[] {
  const m =
    text.match(/(?<![A-Za-z\d.])\d[\d,]*(?:\.\d+)?\s?(?:%|×|x(?=\s)|percent|BLEU|ms|s\b|GB|MB|B\b|M\b|K\b|k\b|times)?/g) ?? [];
  return [...new Set(m.map((s) => s.trim()))].filter((s) => !/^(19|20)\d\d$/.test(s) || /\D/.test(s));
}
