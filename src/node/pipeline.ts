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
import { checkScript } from '../core/faith/check.ts';
import { gate } from '../core/faith/gate.ts';
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
import { composeExtractive, trimSentence } from '../core/script/extractive.ts';
import { buildTimeline, type VoiceClip } from '../core/timeline/timeline.ts';
import { renderVideo } from './render/render.ts';
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
  judge?: (claim: string, support: string, signal?: AbortSignal) => Promise<boolean>;
  /** Shorten a beat's narration to at most n words without adding facts (LLM); default trims extractively. */
  tighten?: (beat: Beat, maxWords: number, signal?: AbortSignal) => Promise<string>;
  tts: TtsEngine;
}

export interface RunResult {
  jobDir: string;
  video: string;
  timeline: Timeline;
  script: Script;
  analysis: Analysis;
  faith: FaithReport;
  durations: { target: number; actual: number; withinTolerance: boolean };
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
    const checks = checkScript(script, src);
    const judged = new Map<string, boolean>();
    if (engines.judge) {
      for (const c of checks)
        for (const j of c.needsJudge) judged.set(j.claim, await engines.judge(j.claim, j.support, signal));
    }
    const top = analysis.ideas[0];
    const fallback: Beat | undefined = top
      ? {
          id: 'bx',
          role: 'takeaway',
          narration: trimSentence(top.statement, 14),
          visual: {
            type: 'takeaway',
            text: trimSentence(top.statement, budget.maxScreenWords).replace(/\.$/, ''),
            highlight: top.terms.slice(0, 1),
          },
          claims: [
            {
              text: trimSentence(top.statement, 14),
              support: top.evidence.map((e) => e.segmentId),
              kind: 'fact',
            },
          ],
          ideas: [top.id],
          keywords: [],
        }
      : undefined;
    const g = gate(script, checks, judged, fallback);
    script = g.script;
    return g.report;
  });
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
    for (let attempt = 0; attempt < 5; attempt++) {
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
            script.beats[longest.i] = { ...longest.b, narration };
            await synth(longest.i);
            continue;
          }
        }
        if (speed < 1.18) {
          speed = Math.min(1.18, speed * Math.min(1.12, over));
          for (let i = 0; i < script.beats.length; i++) await synth(i);
          continue;
        }
        break;
      } else {
        // too short: add breathing room (≤ 0.8 s per beat), then slow the voice slightly
        const missing = target - d;
        const per = Math.min(0.8, missing / Math.max(1, script.beats.length));
        timeline = buildTimeline(script, voiceClips(), budget, { ...tlOpts, extraHold: per });
        if (timeline.duration >= target * 0.92 || speed <= 0.92) break;
        speed = Math.max(0.92, speed * 0.95);
        for (let i = 0; i < script.beats.length; i++) await synth(i);
      }
    }
  });
  write(jobDir, 'script.json', script);
  write(jobDir, 'timeline.json', timeline);
  write(jobDir, 'captions.vtt', toVtt(timeline.captions));
  write(jobDir, 'captions.srt', toSrt(timeline.captions));
  write(jobDir, 'script.md', scriptMarkdown(script, timeline, src));
  write(jobDir, 'sourcemap.json', buildSourceMap(script, timeline, src, faith));

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
