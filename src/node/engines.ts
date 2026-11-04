/**
 * Bridge's AI: the analysis, scriptwriting, judging and tightening stages on top of any LlmProvider.
 * Every stage falls back to the extractive floor if the model fails, so a video always gets made.
 */
import type { Budget } from '../core/budget.ts';
import { analyzeExtractive, candidates, scoreCandidates } from '../core/analyze/extractive.ts';
import { analysisSchema, judgeSchema, scriptSchema, tightenSchema } from '../core/llm/schemas.ts';
import {
  analyzePrompt,
  bookendPrompt,
  judgePrompt,
  scriptPrompt,
  sectionPrompt,
  selectSegments,
  tightenPrompt,
  tokensOf,
  type ScriptContext,
} from '../core/llm/prompts.ts';
import { mergeAnalyses, parseAnalysis, parseScript } from '../core/llm/parse.ts';
import type { Analysis, Beat, RenderSettings, Script, Source } from '../core/schema.ts';
import { composeExtractive } from '../core/script/extractive.ts';
import { numbers, wordCount } from '../core/text/text.ts';
import type { Engines } from './pipeline.ts';
import type { LlmProvider } from './llm/types.ts';
import type { TtsEngine } from './tts/types.ts';

export interface AiLog {
  (event: { stage: string; message: string; ms?: number }): void;
}

const CHUNK_TOKENS = 3200;

function chunkSegments(src: Source): Source['segments'][] {
  const eligible = src.segments.filter((s) => s.kind !== 'heading' && s.kind !== 'figure');
  const chunks: Source['segments'][] = [];
  let cur: Source['segments'] = [];
  let used = 0;
  for (const s of eligible) {
    const t = Math.min(tokensOf(s.text), 400);
    if (used + t > CHUNK_TOKENS && cur.length) {
      chunks.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(s);
    used += t;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

/** Blend model importance with the structural prior of the evidence segments (stabilises small models). */
function blend(analysis: Analysis, src: Source): Analysis {
  const scored = scoreCandidates(src, candidates(src));
  const seg = new Map<string, number>();
  for (const c of scored) seg.set(c.segmentId, Math.max(seg.get(c.segmentId) ?? 0, c.score));
  const max = Math.max(1e-9, ...seg.values());
  const ideas = analysis.ideas
    .map((i) => {
      const prior = Math.max(0, ...i.evidence.map((e) => (seg.get(e.segmentId) ?? 0) / max));
      return { ...i, importance: Math.round((0.75 * i.importance + 0.25 * prior) * 1000) / 1000 };
    })
    .sort((a, b) => b.importance - a.importance)
    .map((i, k) => ({ ...i, id: `i${k + 1}` }));
  return { ...analysis, ideas };
}

export function aiEngines(llm: LlmProvider, tts: TtsEngine, log: AiLog = () => {}): Engines {
  const engine = `${llm.id}:${llm.model}`;
  const timed = async <T>(stage: string, msg: string, f: () => Promise<T>): Promise<T> => {
    const t0 = performance.now();
    const r = await f();
    log({ stage, message: msg, ms: Math.round(performance.now() - t0) });
    return r;
  };

  const analyze = async (src: Source, budget: Budget, signal?: AbortSignal): Promise<Analysis> => {
    const maxIdeas = Math.min(10, Math.max(4, budget.ideas.max + 2));
    const total = src.segments.reduce((n, s) => n + Math.min(tokensOf(s.text), 400), 0);
    try {
      let parts: Analysis[];
      if (total <= CHUNK_TOKENS * 1.3 || budget.seconds <= 75) {
        // one call over the most relevant segments
        const segs =
          total <= CHUNK_TOKENS * 1.3
            ? src.segments.filter((s) => s.kind !== 'figure')
            : selectSegments(src, CHUNK_TOKENS * 1.2);
        const p = analyzePrompt(src, segs, maxIdeas);
        const raw = await timed('analyze', `1 call, ${segs.length} segments`, () =>
          llm.json({
            ...p,
            schema: analysisSchema(
              segs.map((s) => s.id),
              src.assets.filter((a) => a.kind !== 'page').map((a) => a.id),
              maxIdeas,
            ),
            name: 'analysis',
            maxTokens: 1800,
            temperature: 0.2,
            signal,
          }),
        );
        const { analysis, dropped } = parseAnalysis(raw, src, engine);
        if (dropped.length)
          log({ stage: 'analyze', message: `dropped ${dropped.length} ideas with unverifiable evidence` });
        parts = [analysis];
      } else {
        const chunks = chunkSegments(src);
        parts = [];
        for (const [k, segs] of chunks.entries()) {
          const p = analyzePrompt(src, segs, 5);
          const raw = await timed('analyze', `chunk ${k + 1}/${chunks.length}`, () =>
            llm.json({
              ...p,
              schema: analysisSchema(
                segs.map((s) => s.id),
                src.assets.filter((a) => a.kind !== 'page').map((a) => a.id),
                5,
              ),
              name: 'analysis',
              maxTokens: 1400,
              temperature: 0.2,
              signal,
            }),
          );
          parts.push(parseAnalysis(raw, src, engine).analysis);
        }
      }
      const merged = parts.length === 1 ? parts[0]! : mergeAnalyses(parts, engine);
      if (!merged.ideas.length) throw new Error('no ideas');
      return blend(merged, src);
    } catch (e) {
      if (signal?.aborted) throw e;
      log({
        stage: 'analyze',
        message: `model failed (${(e as Error).message}); using the extractive floor`,
      });
      return analyzeExtractive(src);
    }
  };

  const script = async (
    src: Source,
    analysis: Analysis,
    budget: Budget,
    settings: RenderSettings,
    signal?: AbortSignal,
  ): Promise<Script> => {
    const ctx: ScriptContext = { budget, level: settings.level, analysis };
    try {
      if (budget.seconds <= 90 || analysis.ideas.length < 2) {
        const p = scriptPrompt(src, ctx);
        const raw = await timed('script', `1 call, ${budget.beats.max} beats max`, () =>
          llm.json({
            ...p,
            schema: scriptSchema(src, budget.beats.max + 1),
            name: 'script',
            maxTokens: 300 + budget.beats.max * 170,
            temperature: 0.4,
            signal,
          }),
        );
        return tagIdeas(parseScript(raw, src, budget.seconds, engine), analysis);
      }
      // long video: opening → one section per idea → takeaway
      const nIdeas = Math.min(analysis.ideas.length, budget.ideas.max);
      const ideas = analysis.ideas.slice(0, nIdeas);
      const opening = budget.seconds >= 150 ? 2 : 1;
      const ideaBeats = Math.max(nIdeas, Math.round((budget.beats.min + budget.beats.max) / 2) - opening - 1);
      const weights = ideas.map((i) => 0.5 + i.importance);
      const wsum = weights.reduce((a, b) => a + b, 0);
      const alloc = weights.map((w) => Math.max(2, Math.min(6, Math.round((w / wsum) * ideaBeats))));
      const covered = ideas.map((i) => i.statement.replace(/\.$/, ''));
      const raw0 = await timed('script', 'opening', () => {
        const p = bookendPrompt(src, ctx, 'opening', covered);
        return llm.json({
          ...p,
          schema: scriptSchema(src, opening),
          name: 'opening',
          maxTokens: 260 * opening + 200,
          temperature: 0.5,
          signal,
        });
      });
      const beats: unknown[] = [...((raw0 as { beats?: unknown[] }).beats ?? []).slice(0, opening)];
      let previous = '';
      for (const [k, n] of alloc.entries()) {
        const p = sectionPrompt(src, ctx, k, n, previous);
        const raw = await timed('script', `section ${k + 1}/${alloc.length} (${n} beats)`, () =>
          llm.json({
            ...p,
            schema: scriptSchema(src, n),
            name: 'section',
            maxTokens: 200 + n * 190,
            temperature: 0.4,
            signal,
          }),
        );
        const bs = ((raw as { beats?: { narration?: string; role?: string }[] }).beats ?? [])
          .slice(0, n)
          .map((b) => ({
            ...b,
            role: b.role === 'hook' || b.role === 'takeaway' ? 'idea' : b.role,
            _idea: ideas[k]!.id,
          }));
        beats.push(...bs);
        previous = bs[bs.length - 1]?.narration ?? previous;
      }
      const rawT = await timed('script', 'takeaway', () => {
        const p = bookendPrompt(src, ctx, 'takeaway', covered);
        return llm.json({
          ...p,
          schema: scriptSchema(src, 1),
          name: 'takeaway',
          maxTokens: 400,
          temperature: 0.4,
          signal,
        });
      });
      beats.push(...((rawT as { beats?: unknown[] }).beats ?? []).slice(0, 1));
      return tagIdeas(
        parseScript({ title: (raw0 as { title?: string }).title, beats }, src, budget.seconds, engine),
        analysis,
      );
    } catch (e) {
      if (signal?.aborted) throw e;
      log({
        stage: 'script',
        message: `model failed (${(e as Error).message}); using the extractive writer`,
      });
      return composeExtractive(src, analysis, budget);
    }
  };

  const judge = async (claim: string, support: string, signal?: AbortSignal): Promise<boolean> => {
    try {
      const p = judgePrompt(claim, support);
      const r = await llm.json<{ verdict: string }>({
        ...p,
        schema: judgeSchema(),
        name: 'judge',
        maxTokens: 120,
        temperature: 0,
        signal,
      });
      return r.verdict === 'supported';
    } catch {
      return false; // fail closed: unsupported
    }
  };

  const tighten = async (beat: Beat, maxWords: number, signal?: AbortSignal): Promise<string> => {
    try {
      const p = tightenPrompt(beat.narration, maxWords, beat.claims.map((c) => c.text).join(' '));
      const r = await llm.json<{ narration: string }>({
        ...p,
        schema: tightenSchema(),
        name: 'tighten',
        maxTokens: 200,
        temperature: 0.2,
        signal,
      });
      const out = r.narration.trim();
      // accept only if shorter and it adds no number the original didn't have
      const orig = new Set(numbers(beat.narration));
      if (out && wordCount(out) <= maxWords + 2 && numbers(out).every((n) => orig.has(n))) return out;
    } catch {
      /* fall through */
    }
    return (
      beat.narration
        .split(/\s+/)
        .slice(0, maxWords)
        .join(' ')
        .replace(/[,;:]$/, '') + '.'
    );
  };

  return { analyze, script, judge, tighten, tts };
}

/** Attach idea ids to beats by evidence overlap (for coverage evals and the source map). */
function tagIdeas(s: Script, a: Analysis): Script {
  return {
    ...s,
    beats: s.beats.map((b) => {
      const segs = new Set(b.claims.flatMap((c) => c.support));
      const ideas = a.ideas.filter((i) => i.evidence.some((e) => segs.has(e.segmentId))).map((i) => i.id);
      return { ...b, ideas: ideas.slice(0, 2) };
    }),
  };
}

/** The extractive floor as Engines (no model). */
export function extractiveEngines(tts: TtsEngine): Engines {
  return {
    tts,
    analyze: async (src) => analyzeExtractive(src),
    script: async (src, analysis, budget) => composeExtractive(src, analysis, budget),
  };
}
