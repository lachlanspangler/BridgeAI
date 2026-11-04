/**
 * Prompts for Bridge's AI. Written for small local models first (Qwen3.5-4B): short rules, concrete limits,
 * one worked example, ids everywhere. The same prompts drive cloud models. See docs/research/BUILD_AN_AI.md.
 */
import type { Budget } from '../budget.ts';
import type { Analysis, Level, Segment, Source } from '../schema.ts';
import { scoreCandidates, candidates } from '../analyze/extractive.ts';
import { wordCount } from '../text/text.ts';

export interface Prompt {
  system: string;
  user: string;
}

const SYSTEM_ANALYST =
  'You are the analyst inside Bridge, a tool that turns papers, projects and notes into short explainer videos for learners. ' +
  'You find the ideas that matter most and you never add a fact the source does not state. Answer in JSON only.';

const SYSTEM_WRITER =
  'You are the scriptwriter inside Bridge. You write very direct, plain-English narration for short, colourful explainer videos, ' +
  'in the style of the best explainers (Fireship, Kurzgesagt, 3Blue1Brown): one idea per beat, concrete before abstract, ' +
  'no filler, no greetings, no hype. Every fact you say must come from the evidence you are given. Answer in JSON only.';

const SYSTEM_JUDGE =
  'You are a strict fact-checker. You decide whether a claim is fully supported by a source excerpt. ' +
  'A claim is supported only if every fact in it (numbers, names, comparisons, causes) is stated or directly implied by the excerpt. Answer in JSON only.';

/** Rough token estimate (≈ 0.75 words per token for English). */
export const tokensOf = (s: string): number => Math.ceil(wordCount(s) / 0.75) + 4;

const KIND_TAG: Partial<Record<Segment['kind'], string>> = {
  abstract: 'abstract',
  caption: 'caption',
  heading: 'heading',
  title: 'title',
  code: 'code',
  list: 'list',
  table: 'table',
  meta: 'meta',
};

export function renderSegment(s: Segment, maxWords = 220): string {
  const where = s.loc.page ? ` p${s.loc.page}` : s.loc.file ? ` ${s.loc.file}` : '';
  const tag = KIND_TAG[s.kind] ? ` (${KIND_TAG[s.kind]}${where})` : where ? ` (${where.trim()})` : '';
  const words = s.text.split(/\s+/);
  const text = words.length > maxWords ? `${words.slice(0, maxWords).join(' ')} …` : s.text;
  return `[${s.id}]${tag} ${s.kind === 'code' ? `\n${text}\n` : text}`;
}

/**
 * Pick the segments worth sending to the model within a token budget: title, abstract and headings always;
 * then the highest-ranked paragraphs (extractive score), kept in reading order.
 */
export function selectSegments(src: Source, tokenBudget: number): Segment[] {
  const must = src.segments.filter((s) => s.kind === 'title' || s.kind === 'abstract');
  const scored = scoreCandidates(src, candidates(src));
  const segScore = new Map<string, number>();
  for (const c of scored) segScore.set(c.segmentId, Math.max(segScore.get(c.segmentId) ?? 0, c.score));
  const rest = src.segments
    .filter((s) => !must.includes(s) && s.kind !== 'heading' && s.kind !== 'figure')
    .map((s) => ({
      s,
      score:
        (segScore.get(s.id) ?? 0) +
        (s.kind === 'caption' ? 0.3 : 0) +
        (s.kind === 'code' || s.kind === 'meta' ? 0.5 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const chosen = new Set<Segment>(must);
  let used = must.reduce((n, s) => n + tokensOf(s.text), 0);
  for (const { s } of rest) {
    const t = Math.min(tokensOf(s.text), 320);
    if (used + t > tokenBudget) continue;
    chosen.add(s);
    used += t;
  }
  return src.segments.filter((s) => chosen.has(s));
}

const LEVEL_TEXT: Record<Level, string> = {
  newcomer:
    'a smart newcomer (a new engineer or student): define any jargon in five words or fewer the first time',
  practitioner: 'a practitioner in the field: skip basic definitions',
  expert: 'an expert: be precise and dense, skip all basics',
};

export function analyzePrompt(src: Source, segments: Segment[], maxIdeas: number): Prompt {
  const figures = src.assets.filter((a) => a.kind !== 'page');
  const figText = figures.length
    ? `\nFigures you may attach to an idea:\n${figures.map((a) => `[${a.id}] ${a.caption ?? 'image'}${a.ocr ? ` (text in image: ${a.ocr.slice(0, 120)})` : ''}`).join('\n')}\n`
    : '';
  return {
    system: SYSTEM_ANALYST,
    user: `SOURCE (${src.kind}): "${src.title}"

${segments.map((s) => renderSegment(s)).join('\n')}
${figText}
TASK: find the ${maxIdeas} most important ideas in this source for a learner, most important first.
- statement: one plain sentence (≤ 20 words) in simple words. It must be true according to the source.
- importance: 5 = the main point the source exists to make; 4 = a key result or the core method; 3 = useful support; 1–2 = detail.
- evidence: 1–2 items. segmentId must be one of the [ids] above. quote must be copied exactly from that segment (≤ 25 words).
- numbers: the numbers in your quotes that matter, copied exactly with units (e.g. "28.4 BLEU"). [] if none.
- terms: 1–3 key words or names, copied from the source.
- figure: the [id] of a figure that shows this idea, or "none".
- gist: one sentence saying what the whole source is about.
Prefer what the source itself stresses (title, abstract, conclusion, "we propose", "the key idea"). Skip related work and references.`,
  };
}

export interface ScriptContext {
  budget: Budget;
  level: Level;
  /** Ideas in rank order, with the text of their evidence segments. */
  analysis: Analysis;
}

const VISUAL_GUIDE = `Visual types (pick the one that SHOWS the idea; vary them; every beat gets exactly one):
- title: the hook card. title ≤ 7 words.
- statement: one short line on screen (3–7 words) that makes sense alone, with 1–2 highlighted key words. Use sparingly; prefer a visual that shows the fact.
- bigNumber: one important number from the source, huge. value = the number exactly as in the source; label ≤ 7 words; compareValue/compareLabel = a second number from the source to compare with, else "".
- bullets: 2–4 short items (≤ 5 words each) that build one by one.
- bars: a bar chart of 2–6 numbers that ALL appear in the source (e.g. scores of models). highlight the main one.
- flow: 2–5 boxes with arrows, for a process, pipeline or architecture. node labels ≤ 3 words.
- compare: two sides (old vs new, before vs after) with ≤ 3 short points each; winner if the source says which is better.
- quote: a short exact quote from the source.
- code: show a code segment (by its id) typing itself; focusLines = the 1–3 lines that matter.
- figure: show a figure from the source (by its id) with a ≤ 7-word caption.
- tree: show the project's file tree; focus = 1–3 files or folders that matter.
- takeaway: the final card: the one sentence to remember (≤ 10 words).`;

export function scriptPrompt(src: Source, ctx: ScriptContext): Prompt {
  const b = ctx.budget;
  const ideas = ctx.analysis.ideas.slice(0, Math.max(b.ideas.max + 2, 3));
  const segIds = new Set(ideas.flatMap((i) => i.evidence.map((e) => e.segmentId)));
  const evidence = src.segments.filter((s) => segIds.has(s.id));
  const codeSegs = src.segments.filter((s) => s.kind === 'code').slice(0, 4);
  const tree = src.segments.find((s) => s.kind === 'meta' && s.text.startsWith('FILE TREE'));
  const figs = src.assets.filter((a) => a.kind !== 'page');
  const ideaBeats = Math.max(1, b.beats.max - 2);
  const nIdeas = b.ideas.min === b.ideas.max ? `${b.ideas.min}` : `${b.ideas.min}–${b.ideas.max}`;
  const shape =
    b.seconds <= 30
      ? `Exactly ${b.beats.min}–${b.beats.max} beats: 1 hook, ${b.beats.min - 2}–${b.beats.max - 2} beats on the single most important idea (its key evidence, ideally a number), 1 takeaway. Cover only idea i1${b.ideas.max > 1 ? ' (and i2 only if it directly supports i1)' : ''}.`
      : `${b.beats.min}–${b.beats.max} beats: 1 hook, then ${nIdeas} ideas in rank order with 2–${Math.max(2, Math.round(ideaBeats / Math.max(1, b.ideas.max)))} beats each (claim → evidence/example), then 1 takeaway.${b.seconds >= 150 ? ' After the hook, one beat that says what the video will cover.' : ''}`;
  return {
    system: SYSTEM_WRITER,
    user: `SOURCE: "${src.title}" (${src.kind})
GIST: ${ctx.analysis.gist}

KEY IDEAS (most important first):
${ideas.map((i) => `${i.id} [importance ${Math.round(i.importance * 5)}] ${i.statement}  (evidence: ${i.evidence.map((e) => e.segmentId).join(', ')}${i.numbers.length ? `; numbers: ${i.numbers.join(', ')}` : ''}${i.assets.length ? `; figure: ${i.assets.join(', ')}` : ''})`).join('\n')}

EVIDENCE (the only facts you may use):
${evidence.map((s) => renderSegment(s, 160)).join('\n')}
${codeSegs.length ? `\nCODE SEGMENTS:\n${codeSegs.map((s) => renderSegment(s, 120)).join('\n')}` : ''}${tree ? `\nPROJECT TREE [${tree.id}]:\n${tree.text.slice(0, 900)}` : ''}${figs.length ? `\nFIGURES:\n${figs.map((a) => `[${a.id}] ${a.caption ?? 'image'}`).join('\n')}` : ''}

WRITE A ${b.seconds}-SECOND VIDEO SCRIPT for ${LEVEL_TEXT[ctx.level]}.
LENGTH: about ${b.words} spoken words in total (${b.wordsPerSecond} words per second). Each beat's narration: ${Math.round((b.wordsPerBeat.min + b.wordsPerBeat.max) / 2)}–${b.wordsPerBeat.max} words (count them; short beats make the video too short).
SHAPE: ${shape}
RULES:
1. Hook (first beat): start with the most surprising or useful FACT FROM THE EVIDENCE (it is fact-checked like every other beat), a sharp question, or the result first. No "hi", no "in this video", no "today". Visual: the one that SHOWS the hook fact (compare, bigNumber, flow…); use "title" only if nothing else fits.
2. One idea per beat. Short sentences (≤ 15 words). Active voice. Talk to the viewer ("you").
3. Use ONLY facts in EVIDENCE. Copy numbers exactly (you may round to 2 significant figures). Never invent numbers, names, comparisons or causes. No hype or absolutes the source doesn't use ("ever", "always", "every time", "revolutionary").
4. Every beat has claims: the facts it says, each with the [segment ids] that support them. Use kind "framing" only for a sentence with no facts (like "Here's the trick."). Mark an analogy as kind "analogy".
5. Concrete before abstract: show the specific example or number, then the general idea.
6. Every number gets a comparison or a meaning from the source ("over 2 BLEU better than the best before").
7. keywords: 1–3 words from the narration to highlight on screen when they are said.
8. Exactly ONE takeaway: the last beat, role "takeaway", visual "takeaway": the one thing to remember, ≤ 12 words. Never repeat a point you already made.

${VISUAL_GUIDE}

EXAMPLE of one good beat (different source):
{"role":"evidence","narration":"It needs 90% less memory than the old method, so it fits on a single GPU.","visual":{"type":"bigNumber","value":"90%","unit":"","label":"less memory","compareValue":"","compareLabel":""},"claims":[{"text":"It needs 90% less memory than the old method","support":["s7"],"kind":"fact"},{"text":"so it fits on a single GPU","support":["s7"],"kind":"fact"}],"keywords":["90%","single GPU"]}`,
  };
}

export function judgePrompt(claim: string, support: string, context?: string): Prompt {
  return {
    system: SYSTEM_JUDGE,
    user: `SOURCE EXCERPT:\n"""\n${support.slice(0, 3500)}\n"""\n\n${context && context !== claim ? `The claim comes from this narration line: "${context}"\n` : ''}CLAIM: "${claim}"\n\nIs every fact in the claim supported by the excerpt? Paraphrase, simpler words, rounding, and a plain general description of a specific fact in the excerpt are fine; so is everyday wording for the same idea ("loops" for recurrence). Added numbers, names, comparisons or causes that the excerpt does not state are not. Answer "supported" or "not_supported".`,
  };
}

export function tightenPrompt(narration: string, maxWords: number, support: string): Prompt {
  return {
    system: SYSTEM_WRITER,
    user: `Shorten this narration to at most ${maxWords} words. Keep the most important fact and its number if it has one. Do not add anything that isn't in the narration or the source.\n\nSOURCE:\n${support.slice(0, 1500)}\n\nNARRATION: "${narration}"`,
  };
}

export function rewritePrompt(narration: string, problem: string, support: string, maxWords: number): Prompt {
  return {
    system: SYSTEM_WRITER,
    user: `This narration was rejected by the fact-checker: ${problem}\nRewrite it in ≤ ${maxWords} plain words using ONLY facts from the source below. If the source cannot support it, say the closest true thing the source does say.\n\nSOURCE:\n${support.slice(0, 1500)}\n\nNARRATION: "${narration}"`,
  };
}

/** For long videos: write the beats for one idea (a "section") so a small model stays focused. */
export function sectionPrompt(
  src: Source,
  ctx: ScriptContext,
  ideaIndex: number,
  nBeats: number,
  previous: string,
): Prompt {
  const b = ctx.budget;
  const idea = ctx.analysis.ideas[ideaIndex]!;
  const segIds = new Set(idea.evidence.map((e) => e.segmentId));
  // neighbours of the evidence give context (same section)
  const evidence = src.segments.filter((s) => segIds.has(s.id));
  const codeSegs =
    idea.kind === 'code' || src.kind === 'project'
      ? src.segments.filter((s) => s.kind === 'code').slice(0, 3)
      : [];
  const figs = src.assets.filter((a) => idea.assets.includes(a.id));
  const isFirst = ideaIndex === 0;
  return {
    system: SYSTEM_WRITER,
    user: `SOURCE: "${src.title}" (${src.kind})
GIST: ${ctx.analysis.gist}
This is part ${ideaIndex + 1} of a ${b.seconds}-second explainer for ${LEVEL_TEXT[ctx.level]}.
${previous ? `The previous beat said: "${previous}"\n` : ''}
IDEA ${idea.id}: ${idea.statement}${idea.numbers.length ? ` (numbers: ${idea.numbers.join(', ')})` : ''}

EVIDENCE (the only facts you may use):
${evidence.map((s) => renderSegment(s, 200)).join('\n')}
${codeSegs.length ? `\nCODE SEGMENTS:\n${codeSegs.map((s) => renderSegment(s, 120)).join('\n')}` : ''}${figs.length ? `\nFIGURES:\n${figs.map((a) => `[${a.id}] ${a.caption ?? 'image'}`).join('\n')}` : ''}

WRITE EXACTLY ${nBeats} BEATS that teach this idea: ${nBeats >= 3 ? 'state it plainly → show the evidence (a number, figure, diagram or code) → an example or what it means for the viewer' : 'state it → show the evidence'}.
Each beat's narration: ${Math.round((b.wordsPerBeat.min + b.wordsPerBeat.max) / 2)}–${b.wordsPerBeat.max} words (count them; short beats make the video too short). ${isFirst ? '' : 'Start with a short transition from the previous beat. '}Use role "idea" for the first beat, then "evidence" or "example".
RULES: one idea per beat; short sentences; talk to the viewer; ONLY facts in EVIDENCE; copy numbers exactly; every beat lists its claims with supporting [segment ids]; keywords = 1–3 words from the narration; vary the visuals and pick the one that SHOWS the fact. Do not write a hook or a takeaway.

${VISUAL_GUIDE}`,
  };
}

export function bookendPrompt(
  src: Source,
  ctx: ScriptContext,
  kind: 'opening' | 'takeaway',
  covered: string[],
): Prompt {
  const b = ctx.budget;
  const top = ctx.analysis.ideas.slice(0, 3);
  const segIds = new Set(top.flatMap((i) => i.evidence.map((e) => e.segmentId)));
  const evidence = src.segments.filter((s) => segIds.has(s.id));
  const task =
    kind === 'opening'
      ? `WRITE ${b.seconds >= 150 ? '2 BEATS' : '1 BEAT'}: (1) the hook, role "hook", visual "title": the most surprising or useful fact or a sharp question, ${b.wordsPerBeat.min}–${b.wordsPerBeat.max} words, no greeting, no "in this video".${b.seconds >= 150 ? ` (2) role "context", visual "bullets": one sentence saying what the viewer will learn, listing: ${covered.join('; ')}.` : ''}`
      : `WRITE 1 BEAT: role "takeaway", visual "takeaway": the single thing to remember from the whole video, ≤ 12 words, that answers the hook.`;
  return {
    system: SYSTEM_WRITER,
    user: `SOURCE: "${src.title}" (${src.kind})
GIST: ${ctx.analysis.gist}
VIDEO: ${b.seconds} seconds for ${LEVEL_TEXT[ctx.level]}. It covers, in order: ${covered.join('; ')}.

KEY IDEAS:
${top.map((i) => `${i.id} ${i.statement}`).join('\n')}

EVIDENCE (the only facts you may use):
${evidence.map((s) => renderSegment(s, 160)).join('\n')}

${task}
Use ONLY facts in EVIDENCE; list claims with supporting [segment ids] (use kind "framing" only for a sentence with no facts); keywords = 1–3 words from the narration.

${VISUAL_GUIDE}`,
  };
}

export function expandPrompt(narration: string, targetWords: number, support: string): Prompt {
  return {
    system: SYSTEM_WRITER,
    user: `This narration is too short for its slot. Rewrite it to about ${targetWords} words by adding ONE more concrete detail, number or consequence that the SOURCE states (or a plain-words explanation of a term). Keep it direct, spoken, one idea. Never add anything the source doesn't say.\n\nSOURCE:\n${support.slice(0, 1800)}\n\nNARRATION: "${narration}"`,
  };
}
