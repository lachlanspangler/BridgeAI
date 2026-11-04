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
  expandPrompt,
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
    const assetIds = src.assets.filter((a) => a.kind !== 'page').map((a) => a.id);
    try {
      const parts: Analysis[] = [];
      const single = total <= CHUNK_TOKENS * 1.3 || budget.seconds <= 75;
      const chunks = single
        ? [
            total <= CHUNK_TOKENS * 1.3
              ? src.segments.filter((s) => s.kind !== 'figure')
              : selectSegments(src, CHUNK_TOKENS * 1.2),
          ]
        : chunkSegments(src);
      const per = single ? maxIdeas : 5;
      for (const [k, segs] of chunks.entries()) {
        const p = analyzePrompt(src, segs, per);
        // JSON is token-hungry: leave room so the answer is never truncated (truncation = invalid JSON)
        const call = (attempt: number) =>
          timed(
            'analyze',
            single
              ? `1 call, ${segs.length} segments${attempt ? ' (retry)' : ''}`
              : `chunk ${k + 1}/${chunks.length}${attempt ? ' (retry)' : ''}`,
            () =>
              llm.json({
                ...p,
                schema: analysisSchema(
                  segs.map((s) => s.id),
                  assetIds,
                  per,
                ),
                name: 'analysis',
                maxTokens: 600 + 380 * per,
                temperature: attempt ? 0.1 : 0.2,
                signal,
              }),
          );
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const { analysis, dropped } = parseAnalysis(await call(attempt), src, engine);
            if (dropped.length)
              log({
                stage: 'analyze',
                message: `dropped ${dropped.length} ideas with unverifiable evidence`,
              });
            parts.push(analysis);
            break;
          } catch (e) {
            if (signal?.aborted) throw e;
            log({
              stage: 'analyze',
              message: `${single ? 'call' : `chunk ${k + 1}`} attempt ${attempt + 1} failed: ${(e as Error).message}`,
            });
          }
        }
      }
      if (!parts.length) throw new Error('every analysis call failed');
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

  /** One model call with a retry; returns null instead of throwing (callers fall back per part). */
  const tryJson = async (label: string, req: Parameters<LlmProvider['json']>[0]): Promise<unknown | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await timed('script', `${label}${attempt ? ' (retry)' : ''}`, () =>
          llm.json({ ...req, temperature: attempt ? 0.2 : req.temperature }),
        );
      } catch (e) {
        if (req.signal?.aborted) throw e;
        log({ stage: 'script', message: `${label} attempt ${attempt + 1} failed: ${(e as Error).message}` });
      }
    }
    return null;
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
        const raw = await tryJson(`1 call, ${budget.beats.max} beats max`, {
          ...p,
          schema: scriptSchema(src, budget.beats.max + 1),
          name: 'script',
          maxTokens: 600 + budget.beats.max * 260,
          temperature: 0.4,
          signal,
        });
        if (!raw) throw new Error('no script');
        return tagIdeas(parseScript(raw, src, budget.seconds, engine), analysis);
      }
      // long video: opening → one section per idea → takeaway; a failed part falls back on its own
      const nIdeas = Math.min(analysis.ideas.length, budget.ideas.max);
      const ideas = analysis.ideas.slice(0, nIdeas);
      const opening = budget.seconds >= 150 ? 2 : 1;
      const ideaBeats = Math.max(nIdeas, Math.round((budget.beats.min + budget.beats.max) / 2) - opening - 1);
      const weights = ideas.map((i) => 0.5 + i.importance);
      const wsum = weights.reduce((a, b) => a + b, 0);
      const alloc = weights.map((w) => Math.max(2, Math.min(6, Math.round((w / wsum) * ideaBeats))));
      const covered = ideas.map((i) => i.statement.replace(/\.$/, ''));
      const raw0 = (await tryJson('opening', {
        ...bookendPrompt(src, ctx, 'opening', covered),
        schema: scriptSchema(src, opening),
        name: 'opening',
        maxTokens: 400 * opening + 400,
        temperature: 0.5,
        signal,
      })) as { title?: string; beats?: unknown[] } | null;
      const beats: unknown[] = [...(raw0?.beats ?? []).slice(0, opening)];
      let previous = '';
      for (const [k, n] of alloc.entries()) {
        const raw = (await tryJson(`section ${k + 1}/${alloc.length} (${n} beats)`, {
          ...sectionPrompt(src, ctx, k, n, previous),
          schema: scriptSchema(src, n),
          name: 'section',
          maxTokens: 400 + n * 300,
          temperature: 0.4,
          signal,
        })) as { beats?: { narration?: string; role?: string }[] } | null;
        let bs: unknown[] = (raw?.beats ?? [])
          .slice(0, n)
          .map((b) => ({ ...b, role: b.role === 'hook' || b.role === 'takeaway' ? 'idea' : b.role }));
        if (!bs.length) {
          // this section failed twice: say the idea's own statement, cited to its evidence (gate-checked)
          const i = ideas[k]!;
          bs = [
            {
              role: 'idea',
              narration: i.statement,
              visual: { type: 'statement', text: i.statement, highlight: i.terms.slice(0, 2) },
              claims: [{ text: i.statement, support: i.evidence.map((e) => e.segmentId), kind: 'fact' }],
              keywords: i.terms.slice(0, 2),
            },
          ];
        }
        beats.push(...bs);
        previous = (bs[bs.length - 1] as { narration?: string }).narration ?? previous;
      }
      const rawT = (await tryJson('takeaway', {
        ...bookendPrompt(src, ctx, 'takeaway', covered),
        schema: scriptSchema(src, 1),
        name: 'takeaway',
        maxTokens: 700,
        temperature: 0.4,
        signal,
      })) as { beats?: unknown[] } | null;
      if (rawT?.beats?.length) beats.push(rawT.beats[0]);
      else {
        const top = ideas[0]!;
        beats.push({
          role: 'takeaway',
          narration: top.statement,
          visual: { type: 'takeaway', text: top.statement, highlight: top.terms.slice(0, 1) },
          claims: [{ text: top.statement, support: top.evidence.map((e) => e.segmentId), kind: 'fact' }],
          keywords: [],
        });
      }
      return tagIdeas(parseScript({ title: raw0?.title, beats }, src, budget.seconds, engine), analysis);
    } catch (e) {
      if (signal?.aborted) throw e;
      log({
        stage: 'script',
        message: `model failed (${(e as Error).message}); using the extractive writer`,
      });
      return composeExtractive(src, analysis, budget);
    }
  };

  const judge = async (
    claim: string,
    support: string,
    signal?: AbortSignal,
    context?: string,
  ): Promise<boolean> => {
    try {
      const p = judgePrompt(claim, support, context);
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

  const expand = async (
    beat: Beat,
    targetWords: number,
    support: string,
    signal?: AbortSignal,
  ): Promise<string | null> => {
    try {
      const p = expandPrompt(beat.narration, targetWords, support);
      const r = await llm.json<{ narration: string }>({
        ...p,
        schema: tightenSchema(),
        name: 'expand',
        maxTokens: 260,
        temperature: 0.3,
        signal,
      });
      const out = r.narration.trim();
      return out && wordCount(out) > wordCount(beat.narration) ? out : null;
    } catch {
      return null;
    }
  };

  return { analyze, script, judge, tighten, expand, tts };
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
