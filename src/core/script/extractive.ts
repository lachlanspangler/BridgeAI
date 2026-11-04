/**
 * Extractive script writer (no model). Turns ranked ideas into beats that fit the length budget:
 *   hook (title card) → one beat per idea (statement / big number / figure) → takeaway.
 * Narration is the source's own sentences, lightly trimmed (citations, parentheticals, lead-ins), so every
 * factual claim is supported by construction. The LLM writer produces better prose; this is the floor.
 */
import type { Budget } from '../budget.ts';
import type { Analysis, Beat, Idea, Script, Source, Visual } from '../schema.ts';
import { rawNumbers } from '../analyze/extractive.ts';
import { clampWords, cleanForSpeech, contentWords, sentenceCase, wordCount } from '../text/text.ts';

const LEADINS =
  /^(in this (paper|work|article|post|project),?\s*|here,?\s*|overall,?\s*|in summary,?\s*|to summarize,?\s*|finally,?\s*|moreover,?\s*|furthermore,?\s*|additionally,?\s*|in addition,?\s*|specifically,?\s*|notably,?\s*)/i;

/** Make a source sentence speakable and shorter without changing what it claims. */
export function trimSentence(s: string, maxWords: number): string {
  let t = cleanForSpeech(s).replace(LEADINS, '');
  t = t.replace(/\s*\([^)]{0,80}\)/g, ''); // parentheticals
  t = sentenceCase(t);
  if (wordCount(t) <= maxWords) return ensurePeriod(t);
  // cut at the last clause boundary that keeps us under the limit
  const parts = t.split(/(?<=[,;:])\s+|\s+(?=which |while |whereas |including |such as )/);
  let acc = '';
  for (const p of parts) {
    const next = acc ? `${acc} ${p}` : p;
    if (wordCount(next) > maxWords) break;
    acc = next;
  }
  if (acc && wordCount(acc) >= Math.min(6, maxWords)) return ensurePeriod(acc.replace(/[,;:]$/, ''));
  return ensurePeriod(clampWords(t, maxWords).replace(/…$/, ''));
}

const ensurePeriod = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

/** A short on-screen headline (≤ n words) from a sentence: the clause with the most key terms. */
export function headline(sentence: string, terms: string[], n: number): string {
  const t = cleanForSpeech(sentence).replace(LEADINS, '').replace(/^we (propose|present|introduce|show that|find that)\s+/i, '');
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

const SPOKEN_LENGTH: Record<number, string> = { 20: 'twenty seconds', 60: 'one minute', 180: 'three minutes', 300: 'five minutes' };

function hookBeat(src: Source, budget: Budget): Beat {
  const short = clampWords(src.title.replace(/[:.].*$/, ''), 8).replace(/…$/, '');
  const len = SPOKEN_LENGTH[budget.seconds];
  return {
    id: 'b1',
    role: 'hook',
    narration: len ? `${short}, in ${len}.` : `${short}, explained.`,
    visual: { type: 'title', title: short, kicker: src.kind === 'project' ? 'PROJECT' : src.kind === 'pdf' ? 'PAPER' : 'EXPLAINED' },
    claims: [{ text: short, support: [], kind: 'framing' }],
    ideas: [],
    keywords: [],
  };
}

function ideaVisual(idea: Idea, src: Source, budget: Budget): Visual {
  const fig = idea.assets[0] ? src.assets.find((a) => a.id === idea.assets[0]) : undefined;
  if (fig) return { type: 'figure', assetId: fig.id, caption: headline(idea.statement, idea.terms, budget.maxScreenWords) };
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

export function composeExtractive(src: Source, analysis: Analysis, budget: Budget): Script {
  const beats: Beat[] = [hookBeat(src, budget)];
  const hookWords = wordCount(beats[0]!.narration);
  const takeawayWords = Math.min(12, Math.round(budget.words * 0.18));
  let remaining = budget.words - hookWords - takeawayWords;
  const maxIdeaBeats = Math.max(1, budget.beats.max - 2);
  const ideas = analysis.ideas.slice(0, Math.max(budget.ideas.max, 1));
  for (const idea of ideas) {
    if (beats.length - 1 >= maxIdeaBeats || remaining < budget.wordsPerBeat.min) break;
    const cap = Math.min(budget.wordsPerBeat.max, remaining);
    const narration = trimSentence(idea.statement, cap);
    const n = wordCount(narration);
    if (n < 4) continue;
    remaining -= n;
    beats.push({
      id: `b${beats.length + 1}`,
      role: beats.length === 1 ? 'idea' : idea.kind === 'number' || idea.kind === 'result' ? 'evidence' : 'idea',
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
    const said = trimSentence(top.statement, Math.max(6, takeawayWords));
    beats.push({
      id: `b${beats.length + 1}`,
      role: 'takeaway',
      narration: beats.length > 2 ? said : `Remember this: ${said.charAt(0).toLowerCase()}${said.slice(1)}`,
      visual: { type: 'takeaway', text: headline(top.statement, top.terms, budget.maxScreenWords), highlight: top.terms.slice(0, 1) },
      claims: [{ text: said, support: top.evidence.map((e) => e.segmentId), kind: 'fact' }],
      ideas: [top.id],
      keywords: top.terms.slice(0, 2),
    });
  }
  return { schema: 'bridge.script/1', title: src.title, targetSeconds: budget.seconds, beats, engine: 'extractive' };
}

/** Total narration words in a script. */
export const scriptWords = (s: Script): number => s.beats.reduce((n, b) => n + wordCount(b.narration), 0);

/** Distinct content words, used to sanity check on-screen text. */
export const distinctTerms = (s: string): number => new Set(contentWords(s)).size;
