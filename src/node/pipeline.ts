/**
 * The pipeline: Source → analyze → script → faithfulness gate → voice (+ length fit) → timeline → mix → render.
 * Each stage writes its artifact into the job directory, so the app can show it and a re-render can reuse it.
 * Engines are injected (extractive floor, local LLM, BYOK provider) so the same flow serves every path.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { budgetFor, type Budget } from '../core/budget.ts';
import { analyzeExtractive } from '../core/analyze/extractive.ts';
import { toSrt, toVtt } from '../core/captions/captions.ts';
import { checkBeat, checkScript } from '../core/faith/check.ts';
import { gate, judgeKey, markVerified } from '../core/faith/gate.ts';
import { autoHighlight, ensureFigure, focusFor } from '../core/llm/parse.ts';
import { repairCitations } from '../core/faith/repair.ts';
import { encodeWav, mix, speechBounds } from '../core/audio/mix.ts';
import type {
  Analysis,
  Beat,
  FaithReport,
  RenderSettings,
  Script,
  Source,
  Timeline,
} from '../core/schema.ts';
import {
  composeExtractive,
  screenPhrase,
  scriptWords,
  sourceBeat,
  trimSentence,
  VERB,
  thirdPerson,
  whatIsIt,
} from '../core/script/extractive.ts';
import { contentWords, coverage, stem, wordCount } from '../core/text/text.ts';
import { buildTimeline, type VoiceClip } from '../core/timeline/timeline.ts';
import { renderStill, renderVideo } from './render/render.ts';
import type { Clip, TtsEngine } from './tts/types.ts';
import { buildSourceMap, scriptMarkdown } from './outputs.ts';

export type Stage =
  'ingest' | 'analyze' | 'script' | 'faith' | 'voice' | 'timeline' | 'audio' | 'render' | 'done';

export interface Progress {
  stage: Stage;
  /** 0..1 within the stage. */
  progress: number;
  message: string;
}

export interface Engines {
  /** Source → ranked ideas. Defaults to the extractive floor. */
  analyze?: (src: Source, budget: Budget, signal?: AbortSignal) => Promise<Analysis>;
  /** Ideas → beat script. Defaults to the extractive writer. */
  script?: (
    src: Source,
    analysis: Analysis,
    budget: Budget,
    settings: RenderSettings,
    signal?: AbortSignal,
  ) => Promise<Script>;
  /** Entailment judge for paraphrased claims: true if `support` entails `claim`. */
  judge?: (claim: string, support: string, signal?: AbortSignal, context?: string) => Promise<boolean>;
  /** Shorten a beat's narration to at most n words without adding facts (LLM); default trims extractively. */
  tighten?: (beat: Beat, maxWords: number, signal?: AbortSignal) => Promise<string>;
  /** Lengthen a beat's narration with one more sourced detail (LLM). The result is re-checked by the gate. */
  expand?: (beat: Beat, targetWords: number, support: string, signal?: AbortSignal) => Promise<string | null>;
  tts: TtsEngine;
}

export interface RunResult {
  jobDir: string;
  video: string;
  timeline: Timeline;
  script: Script;
  analysis: Analysis;
  faith: FaithReport;
  durations: { target: number; actual: number; withinTolerance: boolean; note?: string };
  timings: Record<string, number>;
  engines: { analyze: string; script: string; tts: string };
}

const write = (dir: string, name: string, data: unknown) =>
  writeFileSync(join(dir, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));

export async function runPipeline(
  src: Source,
  settings: RenderSettings,
  engines: Engines,
  jobDir: string,
  onProgress: (p: Progress) => void = () => {},
  signal?: AbortSignal,
  opts: { render?: boolean } = {},
): Promise<RunResult> {
  mkdirSync(jobDir, { recursive: true });
  const tmp = join(jobDir, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const timings: Record<string, number> = {};
  const lap = async <T>(name: string, f: () => Promise<T>): Promise<T> => {
    const t0 = performance.now();
    try {
      return await f();
    } finally {
      timings[name] = Math.round(performance.now() - t0);
    }
  };
  const budget = budgetFor(settings.seconds);
  write(jobDir, 'source.json', src);

  // 1. analyze
  onProgress({ stage: 'analyze', progress: 0, message: 'Finding the key ideas' });
  let analysis = await lap('analyze', async () =>
    engines.analyze ? engines.analyze(src, budget, signal) : analyzeExtractive(src),
  );
  if (settings.drop.length || settings.pin.length) {
    const pinned = analysis.ideas.filter((i) => settings.pin.includes(i.id));
    const rest = analysis.ideas.filter((i) => !settings.pin.includes(i.id) && !settings.drop.includes(i.id));
    analysis = { ...analysis, ideas: [...pinned, ...rest] };
  }
  write(jobDir, 'analysis.json', analysis);

  // 2. script
  onProgress({ stage: 'script', progress: 0, message: `Writing a ${settings.seconds}-second script` });
  let script = await lap('script', async () =>
    engines.script
      ? engines.script(src, analysis, budget, settings, signal)
      : composeExtractive(src, analysis, budget),
  );

  // 3. faithfulness gate
  onProgress({ stage: 'faith', progress: 0, message: 'Checking every claim against the source' });
  const faith = await lap('faith', async () => {
    script = repairCitations(script, src).script;
    const checks = checkScript(script, src, { judgeNumbers: !!engines.judge });
    const judged = new Map<string, boolean>();
    if (engines.judge) {
      for (const c of checks)
        for (const j of c.needsJudge)
          judged.set(judgeKey(c.beatId, j.claim), await engines.judge(j.claim, j.support, signal, j.context));
    }
    // fallback takeaway: the top idea's verbatim evidence quote (source words, not model words), and only if it checks out
    const top = analysis.ideas[0];
    const quote = top?.evidence.find((e) => e.quote)?.quote;
    let fallback: Beat | undefined;
    if (top && quote) {
      const said = trimSentence(quote, 14, top.terms);
      const cand: Beat = {
        id: 'bx',
        role: 'takeaway',
        narration: said,
        visual: {
          type: 'takeaway',
          text: trimSentence(quote, 12, top.terms).replace(/\.$/, ''),
          highlight: top.terms.slice(0, 1),
        },
        claims: [{ text: said, support: top.evidence.map((e) => e.segmentId), kind: 'fact' }],
        ideas: [top.id],
        keywords: [],
      };
      // must be a real sentence (a verb), not a list fragment like "Fossil fuels, cement, and land-use change 9"
      if (VERB.test(said) && checkBeat(cand, src).ok) fallback = markVerified(cand);
    }
    const g = gate(script, checks, judged, fallback);
    script = g.script;
    return g.report;
  });
  // 3a. refill: if the gate left the script thin, add beats in the source's own words for ideas not yet covered
  if (script.beats.length < budget.beats.min || scriptWords(script) < budget.words * 0.6) {
    const covered = new Set(script.beats.flatMap((b) => b.claims.flatMap((c) => c.support)));
    const pool = [
      ...analysis.ideas.slice(0, Math.max(budget.ideas.max + 5, 6)),
      ...analyzeExtractive(src, 10).ideas.map((x, k) => ({ ...x, id: `e${k + 1}` })),
    ];
    for (const idea of pool) {
      if (scriptWords(script) >= budget.words * 0.85 || script.beats.length >= budget.beats.max) break;
      if (idea.evidence.every((e) => covered.has(e.segmentId)) && script.beats.length >= budget.beats.min)
        continue;
      let nb = sourceBeat(idea, src, budget, `b${script.beats.length + 1}`);
      // each figure appears once per video
      const nbv = nb?.visual;
      if (
        nb &&
        nbv?.type === 'figure' &&
        script.beats.some((b) => b.visual.type === 'figure' && b.visual.assetId === nbv.assetId)
      )
        nb = {
          ...nb,
          visual: {
            type: 'statement',
            text: trimSentence(nb.narration, 8).replace(/[.!?]$/, ''),
            highlight: nb.keywords.slice(0, 2),
          },
        };
      const echo = (t: string) => {
        const A = new Set(contentWords(t).map(stem));
        return script.beats.some((b) => {
          const B = new Set(contentWords(b.narration).map(stem));
          let n = 0;
          for (const w of A) if (B.has(w)) n++;
          return n / Math.max(1, Math.min(A.size, B.size)) > 0.5;
        });
      };
      if (!nb || echo(nb.narration) || !checkBeat(nb, src).ok) continue;
      const t = script.beats.findIndex((b) => b.role === 'takeaway');
      const pos = t < 0 ? script.beats.length : Math.max(1, t);
      script = {
        ...script,
        beats: [...script.beats.slice(0, pos), nb, ...script.beats.slice(pos)].map((b, i) => ({
          ...b,
          id: `b${i + 1}`,
        })),
      };
      idea.evidence.forEach((e) => covered.add(e.segmentId));
      faith.actions.push({
        beatId: `b${pos + 1}`,
        action: 'rewritten',
        reason: "refill: added in the source's own words after the gate dropped beats",
      });
    }
  }
  // real pictures survive the gate: the final script still shows a source figure/image when it has one
  {
    const beats = [...script.beats];
    ensureFigure(beats, src);
    // and point at the labelled part the narration names (OCR word boxes)
    beats.forEach((b, i) => {
      if (b.visual.type !== 'figure' || b.visual.focus) return;
      const vis = b.visual;
      const a = src.assets.find((x) => x.id === vis.assetId);
      const f = a?.words ? focusFor(b.narration, a.words) : undefined;
      if (f) beats[i] = { ...b, visual: { ...vis, focus: f } };
    });
    script = { ...script, beats };
  }
  // 3b. length fit by content: add a sourced detail to a beat (re-checked by the same gate rules)
  const seg = new Map(src.segments.map((x) => [x.id, x.text]));
  const expandBeat = async (i: number, target: number): Promise<boolean> => {
    if (!engines.expand) return false;
    const b = script.beats[i]!;
    const support = [...new Set(b.claims.flatMap((c) => c.support))];
    if (!support.length) return false;
    const evidence = support.map((id) => seg.get(id) ?? '').join('\n');
    const text = await engines.expand(b, target, evidence, signal);
    if (!text) return false;
    // it must add something new, not restate the beat ("by over 2 BLEU … by more than 2 points")
    const said = new Set(script.beats.flatMap((x) => contentWords(x.narration).map(stem)));
    const fresh = new Set(
      contentWords(text)
        .map(stem)
        .filter((w) => !said.has(w)),
    );
    if (fresh.size < 2) return false;
    // …and must not turn into a restatement of another beat (an expanded beat 2 that repeats the hook)
    const mineBag = new Set(contentWords(text).map(stem));
    const echoes = script.beats.some((o, j) => {
      if (j === i) return false;
      const ob = new Set(contentWords(o.narration).map(stem));
      let n = 0;
      for (const w of mineBag) if (ob.has(w)) n++;
      return n / Math.max(1, Math.min(mineBag.size, ob.size)) > 0.6;
    });
    if (echoes) return false;
    const otherNums = new Set<string>(
      script.beats.filter((_, j) => j !== i).flatMap((o) => o.narration.match(/\d+(?:\.\d+)?/g) ?? []),
    );
    const own: string[] = b.narration.match(/\d+(?:\.\d+)?/g) ?? [];
    const newNums = (text.match(/\d+(?:\.\d+)?/g) ?? []).filter((x) => !own.includes(x));
    if (newNums.some((x) => otherNums.has(x))) return false;
    const cand: Beat = { ...b, narration: text, claims: [{ text, support, kind: 'fact' }] };
    const c = checkBeat(cand, src);
    let ok = c.ok;
    if (!ok && engines.judge && c.verdicts.every((v) => v.verdict !== 'unsupported' || v.by === 'overlap'))
      ok = await engines.judge(text, evidence, signal);
    if (!ok) return false;
    script.beats[i] = cand;
    faith.actions.push({
      beatId: b.id,
      action: 'rewritten',
      reason: 'expanded with a sourced detail (re-checked)',
    });
    faith.verdicts.push({ beatId: b.id, claim: text, verdict: 'supported', by: c.ok ? 'overlap' : 'judge' });
    return true;
  };
  const expandable = () =>
    script.beats
      .map((b, i) => ({ b, i }))
      .filter(
        ({ b }) =>
          b.role !== 'hook' && b.role !== 'takeaway' && wordCount(b.narration) < budget.wordsPerBeat.max + 4,
      )
      .sort((x, y) => wordCount(x.b.narration) - wordCount(y.b.narration));
  if (engines.expand && scriptWords(script) < budget.words * 0.9) {
    const order = expandable();
    for (const { b, i } of order) {
      const deficit = budget.words - scriptWords(script);
      if (deficit < budget.words * 0.06) break;
      await expandBeat(
        i,
        Math.min(
          budget.wordsPerBeat.max + 4,
          wordCount(b.narration) + Math.ceil(deficit / Math.max(1, order.length)) + 4,
        ),
      );
    }
    onProgress({
      stage: 'faith',
      progress: 1,
      message: `Script is ${scriptWords(script)} words (target ${budget.words})`,
    });
  }
  // 3c. no repeats, run LAST (after refill and expansion): a beat that restates an earlier one is dropped
  const dedupe = () => {
    const bag = (t: string) => new Set(contentWords(t).map(stem));
    const keep: Beat[] = [];
    for (const b of script.beats) {
      const mine = bag(b.narration);
      const dup =
        b.role !== 'hook' &&
        b.role !== 'takeaway' &&
        keep.some((k) => {
          const o = bag(k.narration);
          let n = 0;
          for (const w of mine) if (o.has(w)) n++;
          const r = n / Math.max(1, Math.min(mine.size, o.size));
          // the same headline number said again ("28.4" three times) counts as a repeat at lower overlap
          const sig = (t: string) => new Set((t.match(/\d+(?:\.\d+)?/g) ?? []).filter((x) => x.length >= 2));
          const shared = [...sig(b.narration)].some((x) => sig(k.narration).has(x));
          return r > 0.6 || (shared && r > 0.2);
        });
      if (dup)
        faith.actions.push({ beatId: `x-dup-${b.id}`, action: 'dropped', reason: 'repeats an earlier beat' });
      else keep.push(b);
    }
    script = { ...script, beats: keep.map((b, i) => ({ ...b, id: `b${i + 1}` })) };
  };
  dedupe();
  // 3c''. the video always says what the subject IS, in the source's own words (the definition sentence)
  {
    const def = whatIsIt(src);
    const said = script.beats.map((b) => b.narration).join(' ');
    if (def && coverage(def.text, said) < 0.5) {
      const text = thirdPerson(trimSentence(def.text, budget.wordsPerBeat.max + 6));
      const nb: Beat = {
        id: 'bd',
        role: 'idea',
        narration: text,
        visual: { type: 'statement', text: screenPhrase(text, 7), highlight: [] },
        claims: [{ text, support: [def.segmentId], kind: 'fact' }],
        ideas: [],
        keywords: [],
      };
      if (VERB.test(text) && checkBeat(nb, src).ok) {
        const pos = script.beats[0]?.role === 'hook' ? 1 : 0;
        script = {
          ...script,
          beats: [...script.beats.slice(0, pos), nb, ...script.beats.slice(pos)].map((b, i) => ({
            ...b,
            id: `b${i + 1}`,
          })),
        };
        faith.actions.push({
          beatId: `b${pos + 1}`,
          action: 'rewritten',
          reason: "added the source's own definition of its subject",
        });
        if (scriptWords(script) > budget.words * 1.15) {
          const weakest = script.beats
            .map((b, i) => ({ b, i }))
            .filter(({ b, i }) => i > pos && b.role !== 'takeaway')
            .pop();
          if (weakest)
            script = {
              ...script,
              beats: script.beats
                .filter((_, i) => i !== weakest.i)
                .map((b, i) => ({ ...b, id: `b${i + 1}` })),
            };
        }
      }
    }
  }
  // 3c'. the single most important idea is ALWAYS in the video (k1 at every length); short videos also end on it
  const top = analysis.ideas[0];
  if (top) {
    const topSegs = new Set(top.evidence.map((e) => e.segmentId));
    const topTerms = top.terms.map((t) => t.toLowerCase());
    const says = (b: Beat) =>
      b.claims.some((c) => c.support.some((id) => topSegs.has(id))) &&
      (topTerms.length === 0 || topTerms.some((t) => b.narration.toLowerCase().includes(t)));
    if (!script.beats.some((b) => b.role !== 'takeaway' && says(b))) {
      const text = trimSentence(top.statement, budget.wordsPerBeat.max + 4, top.terms);
      const nb: Beat = {
        id: 'bt',
        role: 'idea',
        narration: text,
        visual: { type: 'statement', text: screenPhrase(text, 7), highlight: top.terms.slice(0, 1) },
        claims: [{ text, support: [...topSegs], kind: 'fact' }],
        ideas: [top.id],
        keywords: top.terms.slice(0, 2),
      };
      const c = checkBeat(nb, src);
      let ok = c.ok;
      if (!ok && engines.judge && c.verdicts.every((v) => v.verdict !== 'unsupported' || v.by === 'overlap'))
        ok = await engines.judge(
          text,
          top.evidence.map((e) => seg.get(e.segmentId) ?? '').join('\n'),
          signal,
          text,
        );
      const alt = ok ? nb : sourceBeat(top, src, budget, 'bt');
      const use = ok ? nb : alt && checkBeat(alt, src).ok ? alt : null;
      if (use) {
        const pos = script.beats[0]?.role === 'hook' ? 1 : 0;
        script = {
          ...script,
          beats: [...script.beats.slice(0, pos), use, ...script.beats.slice(pos)].map((b, i) => ({
            ...b,
            id: `b${i + 1}`,
          })),
        };
        faith.actions.push({
          beatId: `b${pos + 1}`,
          action: 'rewritten',
          reason: "added the source's main idea (it was missing)",
        });
        // keep the length: drop the weakest idea beat if we're now over budget
        if (scriptWords(script) > budget.words * 1.15) {
          const weakest = script.beats
            .map((b, i) => ({ b, i }))
            .filter(({ b, i }) => i > pos && b.role !== 'takeaway')
            .pop();
          if (weakest)
            script = {
              ...script,
              beats: script.beats
                .filter((_, i) => i !== weakest.i)
                .map((b, i) => ({ ...b, id: `b${i + 1}` })),
            };
        }
      }
    }
  }
  // 3d. the takeaway must be a sentence that says something new-ish (not a label, not the hook again) and
  //     carry one focal word (design review r3); candidates come from the ranked ideas and pass the same checks
  {
    const ti = script.beats.findIndex((b) => b.role === 'takeaway');
    if (ti >= 0) {
      const bag = (t: string) => new Set(contentWords(t).map(stem));
      const sim = (a: string, b: string) => {
        const A = bag(a);
        const B = bag(b);
        let n = 0;
        for (const w of A) if (B.has(w)) n++;
        return n / Math.max(1, Math.min(A.size, B.size));
      };
      const others = script.beats.filter((_, j) => j !== ti);
      const ok = (t: string) => VERB.test(t) && others.every((o) => sim(t, o.narration) <= 0.6);
      let take = script.beats[ti]!;
      if (!ok(take.narration)) {
        for (const idea of analysis.ideas.slice(0, 5)) {
          const text = trimSentence(idea.statement, 14, idea.terms);
          if (!ok(text)) continue;
          const cand: Beat = {
            ...take,
            narration: text,
            claims: [{ text, support: idea.evidence.map((e) => e.segmentId), kind: 'fact' }],
            visual: { type: 'takeaway', text: screenPhrase(text, 12), highlight: [] },
          };
          const c = checkBeat(cand, src);
          let pass = c.ok;
          if (
            !pass &&
            engines.judge &&
            c.verdicts.every((v) => v.verdict !== 'unsupported' || v.by === 'overlap')
          )
            pass = await engines.judge(
              text,
              idea.evidence.map((e) => seg.get(e.segmentId) ?? '').join('\n'),
              signal,
              text,
            );
          if (pass) {
            take = cand;
            faith.actions.push({
              beatId: take.id,
              action: 'rewritten',
              reason: 'takeaway replaced: it repeated another beat or was not a sentence (re-checked)',
            });
            break;
          }
        }
      }
      if (take.visual.type === 'takeaway' && !take.visual.highlight.length)
        take = { ...take, visual: { ...take.visual, highlight: autoHighlight(take.visual.text, src) } };
      script.beats[ti] = take;
      // still a restatement and nothing better passed: keep the takeaway, drop the beat it repeats
      if (!others.every((o) => sim(take.narration, o.narration) <= 0.6)) {
        const dupI = script.beats.findIndex(
          (o, j) => j !== ti && o.role !== 'hook' && sim(take.narration, o.narration) > 0.6,
        );
        if (dupI >= 0 && script.beats.length > 3) {
          faith.actions.push({
            beatId: `x-dup-${script.beats[dupI]!.id}`,
            action: 'dropped',
            reason: 'the takeaway says the same thing',
          });
          script = {
            ...script,
            beats: script.beats.filter((_, j) => j !== dupI).map((b, i) => ({ ...b, id: `b${i + 1}` })),
          };
        }
      }
    }
  }
  write(jobDir, 'faith.json', faith);

  // 4. voice + fit to length (±10%)
  const voice = settings.voice || engines.tts.defaultVoice();
  let speed = budget.voiceSpeed;
  const clips: Clip[] = [];
  const synth = async (i: number) => {
    clips[i] = await engines.tts.synthesize(script.beats[i]!.narration, { voice, speed });
  };
  const voiceClips = (): VoiceClip[] =>
    clips.map((c) => {
      const b = speechBounds(c.samples, c.sampleRate);
      return {
        duration: c.samples.length / c.sampleRate,
        speechStart: b.start,
        speechEnd: b.end,
        words: c.words,
      };
    });
  const tlOpts = { fps: settings.fps, width: settings.width, height: settings.height, seed: settings.seed };
  let timeline!: Timeline;
  await lap('voice', async () => {
    for (let i = 0; i < script.beats.length; i++) {
      if (signal?.aborted) throw new Error('cancelled');
      onProgress({
        stage: 'voice',
        progress: i / script.beats.length,
        message: `Recording the voiceover (${i + 1}/${script.beats.length})`,
      });
      await synth(i);
    }
    const target = settings.seconds;
    let extraHold = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      extraHold = 0;
      timeline = buildTimeline(script, voiceClips(), budget, tlOpts);
      const d = timeline.duration;
      if (d <= target * 1.08 && d >= target * 0.92) break;
      if (d > target * 1.08) {
        const over = d / target;
        // too long: first drop the least important idea beat (never hook/takeaway), then speed up a little
        const droppable = script.beats
          .map((b, i) => ({ b, i }))
          .filter(({ b }) => b.role !== 'hook' && b.role !== 'takeaway');
        if (over > 1.12 && droppable.length > 1) {
          const victim = droppable[droppable.length - 1]!;
          faith.actions.push({
            beatId: `x-fit-${victim.b.id}`,
            action: 'dropped',
            reason: 'length fit: least important idea beat',
          });
          script = {
            ...script,
            beats: script.beats.filter((_, i) => i !== victim.i).map((b, i) => ({ ...b, id: `b${i + 1}` })),
          };
          clips.splice(victim.i, 1);
          continue;
        }
        if (engines.tighten && over > 1.08) {
          // shorten the longest idea beat
          const longest = droppable.sort((a, b) => b.b.narration.length - a.b.narration.length)[0];
          if (longest) {
            const words = longest.b.narration.split(/\s+/).length;
            const narration = await engines.tighten(longest.b, Math.max(5, Math.floor(words / over)), signal);
            // a shortened line is a new line: it goes through the same checks before it is voiced
            const support = [...new Set(longest.b.claims.flatMap((c) => c.support))];
            const cand: Beat = {
              ...longest.b,
              narration,
              claims: [{ text: narration, support, kind: 'fact' }],
            };
            const chk = checkBeat(cand, src);
            let ok = narration !== longest.b.narration && chk.ok;
            if (
              !ok &&
              narration !== longest.b.narration &&
              engines.judge &&
              chk.verdicts.every((v) => v.verdict !== 'unsupported' || v.by === 'overlap')
            )
              ok = await engines.judge(
                narration,
                support.map((id) => seg.get(id) ?? '').join('\n'),
                signal,
                narration,
              );
            if (ok) {
              script.beats[longest.i] = cand;
              faith.actions.push({
                beatId: longest.b.id,
                action: 'rewritten',
                reason: 'tightened to fit the length (re-checked)',
              });
              await synth(longest.i);
              continue;
            }
          }
        }
        if (speed < 1.18) {
          speed = Math.min(1.18, speed * Math.min(1.12, over));
          for (let i = 0; i < script.beats.length; i++) await synth(i);
          continue;
        }
        break;
      } else {
        // too short: first add sourced content to the shortest beat (and re-voice it), then breathing room, then slow down
        const short = expandable()[0];
        if (
          short &&
          (await expandBeat(
            short.i,
            wordCount(short.b.narration) + Math.ceil(((target - d) * budget.wordsPerSecond) / 2) + 3,
          ))
        ) {
          await synth(short.i);
          continue;
        }
        const missing = target - d;
        const per = Math.min(1.1, missing / Math.max(1, script.beats.length));
        timeline = buildTimeline(script, voiceClips(), budget, { ...tlOpts, extraHold: per });
        extraHold = per;
        if (timeline.duration >= target * 0.92 || speed <= 0.92) break;
        speed = Math.max(0.92, speed * 0.95);
        for (let i = 0; i < script.beats.length; i++) await synth(i);
      }
    }
    // always rebuild from the FINAL script and clips (the last attempt may have changed either)
    if (clips.length !== script.beats.length) throw new Error('internal: voice clips out of sync with beats');
    timeline = buildTimeline(script, voiceClips(), budget, { ...tlOpts, extraHold });
  });
  // honest about thin sources: we don't pad with filler, we say so
  const shortNote = () =>
    timeline.duration < settings.seconds * 0.9
      ? `Your source supports about ${Math.round(timeline.duration)} s of faithful narration; Bridge won't pad it with filler.`
      : undefined;
  write(jobDir, 'script.json', script);
  write(jobDir, 'timeline.json', timeline);
  write(jobDir, 'captions.vtt', toVtt(timeline.captions));
  write(jobDir, 'captions.srt', toSrt(timeline.captions));
  write(jobDir, 'script.md', scriptMarkdown(script, timeline, src));
  write(jobDir, 'sourcemap.json', buildSourceMap(script, timeline, src, faith));

  if (opts.render === false) {
    rmSync(tmp, { recursive: true, force: true });
    return {
      jobDir,
      video: '',
      timeline,
      script,
      analysis,
      faith,
      durations: {
        target: settings.seconds,
        actual: timeline.duration,
        withinTolerance: Math.abs(timeline.duration - settings.seconds) <= settings.seconds * 0.1,
        note: shortNote(),
      },
      timings,
      engines: { analyze: analysis.engine, script: script.engine, tts: engines.tts.id },
    };
  }
  // 5. audio
  onProgress({ stage: 'audio', progress: 0, message: 'Mixing voice, music and sound effects' });
  const audioWav = join(tmp, 'mix.wav');
  const audioStats = await lap('audio', async () => {
    const rate = clips[0]?.sampleRate ?? 24000;
    const m = mix({
      timeline,
      voice: clips.map((c) => c.samples),
      voiceRate: rate,
      pace: budget.pace,
      music: settings.music,
      effects: settings.sfx,
    });
    writeFileSync(audioWav, encodeWav([m.master.l, m.master.r], m.master.sampleRate));
    return { lufs: Math.round(m.lufs * 10) / 10, peakDb: Math.round(m.peakDb * 10) / 10 };
  });

  // 6. render
  const video = join(jobDir, 'video.mp4');
  await lap('render', async () => {
    await renderVideo(timeline, {
      out: video,
      audioWav,
      srt:
        settings.captions === 'track' || settings.captions === 'both'
          ? join(jobDir, 'captions.srt')
          : undefined,
      burnCaptions: settings.captions === 'burned' || settings.captions === 'both',
      jobDir,
      assets: src.assets,
      origin: src.origin,
      engine: analysis.engine,
      kicker:
        src.kind === 'pdf'
          ? 'Paper'
          : src.kind === 'project'
            ? 'Project'
            : src.kind === 'images'
              ? 'Images'
              : 'Explained',
      signal,
      onProgress: (f, total) =>
        onProgress({ stage: 'render', progress: f / total, message: `Drawing frames (${f}/${total})` }),
    });
  });
  // a poster frame for the player and the library (mid second beat: past the title, visuals in)
  try {
    const b = timeline.beats[1] ?? timeline.beats[0]!;
    const png = await renderStill(timeline, Math.min(b.end - 0.2, b.start + 1.8), jobDir, src.assets, {
      burnCaptions: false,
      origin: src.origin,
    });
    writeFileSync(join(jobDir, 'thumb.png'), png);
  } catch {
    /* a missing poster is cosmetic */
  }
  // temp renders never linger (disk rule)
  rmSync(tmp, { recursive: true, force: true });
  const result: RunResult = {
    jobDir,
    video,
    timeline,
    script,
    analysis,
    faith,
    durations: {
      target: settings.seconds,
      actual: timeline.duration,
      withinTolerance: Math.abs(timeline.duration - settings.seconds) <= settings.seconds * 0.1,
      note: shortNote(),
    },
    timings,
    engines: { analyze: analysis.engine, script: script.engine, tts: engines.tts.id },
  };
  write(jobDir, 'result.json', {
    ...result,
    timeline: undefined,
    script: undefined,
    analysis: undefined,
    faith: undefined,
    audio: audioStats,
    voiceSpeed: speed,
  });
  onProgress({ stage: 'done', progress: 1, message: 'Done' });
  return result;
}
