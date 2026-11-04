/**
 * Script + measured voice durations → Timeline: when each beat starts and ends, when each word is said,
 * caption cues, and sound-effect cues. Pure; the renderer and the audio mixer both read the same timeline,
 * which is what keeps picture, voice, captions and SFX in sync.
 */
import type { Budget } from '../budget.ts';
import type { Cue, Script, SfxKind, TimedBeat, Timeline, WordTiming } from '../schema.ts';
import { syllables } from '../text/text.ts';

export interface VoiceClip {
  /** Total clip length in seconds (including leading/trailing silence). */
  duration: number;
  /** Speech onset/offset inside the clip (seconds), measured from the audio. */
  speechStart: number;
  speechEnd: number;
  /** Word timings inside the clip if the TTS engine or an aligner provided them. */
  words?: WordTiming[];
}

/** Spread words over [start, end] proportional to syllables, with extra weight for punctuation pauses. */
export function estimateWordTimings(text: string, start: number, end: number): WordTiming[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const weights = tokens.map((w) => {
    const syl = Math.max(1, syllables(w));
    return { w, syl, pause: /[.!?]$/.test(w) ? 1.6 : /[,;:—]$/.test(w) ? 0.8 : 0 };
  });
  const total = weights.reduce((n, x) => n + x.syl + x.pause, 0) - (weights[weights.length - 1]?.pause ?? 0);
  const span = Math.max(0.05, end - start);
  let t = start;
  return weights.map((x, i) => {
    const d = (x.syl / total) * span;
    const out = { word: x.w, start: round3(t), end: round3(t + d) };
    t += d + (i < weights.length - 1 ? (x.pause / total) * span : 0);
    return out;
  });
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export const MIN_BEAT = 2.5;

export function buildTimeline(
  script: Script,
  clips: VoiceClip[],
  budget: Budget,
  opts: { fps: number; width: number; height: number; seed: number; extraHold?: number },
): Timeline {
  if (clips.length !== script.beats.length)
    throw new Error(`need one voice clip per beat (${clips.length} ≠ ${script.beats.length})`);
  const beats: TimedBeat[] = [];
  let t = 0;
  script.beats.forEach((beat, i) => {
    const clip = clips[i]!;
    const lead = i === 0 ? budget.leadIn : 0.12; // a visual-only moment before the voice
    const voiceOffset = lead;
    const hold = (beat.role === 'takeaway' ? 0.6 : budget.gap) + (opts.extraHold ?? 0);
    const dur = Math.max(MIN_BEAT, lead + clip.duration + hold);
    const words = (clip.words ?? estimateWordTimings(beat.narration, clip.speechStart, clip.speechEnd)).map(
      (w) => ({
        word: w.word,
        start: round3(w.start + voiceOffset),
        end: round3(w.end + voiceOffset),
      }),
    );
    beats.push({
      beat,
      start: round3(t),
      end: round3(t + dur),
      voiceOffset,
      voiceDuration: clip.duration,
      words,
    });
    t += dur;
  });
  const duration = round3(t + budget.tail);
  return {
    schema: 'bridge.timeline/1',
    fps: opts.fps,
    width: opts.width,
    height: opts.height,
    duration,
    beats,
    captions: captionCues(beats),
    sfx: sfxCues(beats, duration),
    seed: opts.seed,
    title: script.title,
  };
}

/** Absolute word timings across the whole video. */
export function absoluteWords(beats: TimedBeat[]): WordTiming[] {
  return beats.flatMap((b) =>
    b.words.map((w) => ({ word: w.word, start: round3(b.start + w.start), end: round3(b.start + w.end) })),
  );
}

/**
 * Caption cues (EXPLAINER_CRAFT rules 15–16): one line, ≤ 32 characters, ≤ 5 words, break at punctuation,
 * never spanning two beats.
 */
export function captionCues(beats: TimedBeat[], maxChars = 32, maxWords = 5): Cue[] {
  const cues: Cue[] = [];
  for (const b of beats) {
    let cur: WordTiming[] = [];
    const first = cues.length;
    const flush = () => {
      if (!cur.length) return;
      // a lone word ("8x.") joins the previous cue of the same beat if it still fits on one line
      const prev = cues.length > first ? cues[cues.length - 1] : undefined;
      if (
        cur.length === 1 &&
        prev &&
        !/[.!?]$/.test(prev.text) &&
        `${prev.text} ${cur[0]!.word}`.length <= maxChars + 4 &&
        prev.text.split(' ').length < maxWords + 1
      ) {
        prev.text = `${prev.text} ${cur[0]!.word}`;
        prev.end = round3(b.start + cur[0]!.end);
        cur = [];
        return;
      }
      cues.push({
        start: round3(b.start + cur[0]!.start),
        end: round3(b.start + cur[cur.length - 1]!.end),
        text: cur.map((w) => w.word).join(' '),
      });
      cur = [];
    };
    for (const w of b.words) {
      const text = [...cur, w].map((x) => x.word).join(' ');
      if (cur.length && (text.length > maxChars || cur.length >= maxWords)) flush();
      cur.push(w);
      if (/[.!?;:]$/.test(w.word) || (/,$/.test(w.word) && cur.length >= 3)) flush();
    }
    flush();
  }
  // extend each cue a little toward the next one (less flicker), never overlapping
  for (let i = 0; i < cues.length; i++) {
    const next = cues[i + 1];
    const c = cues[i]!;
    const limit = next ? next.start - 0.02 : Infinity;
    const want = next ? c.end + 0.35 : c.end + 0.5;
    // at least 0.3 s on screen, but never past the next cue (cueAt relies on non-overlap)
    c.end = round3(Math.min(Math.max(want, c.start + 0.3), limit));
    if (c.end <= c.start) c.end = round3(Math.min(c.start + 0.05, limit > c.start ? limit : c.start + 0.05));
  }
  return cues;
}

/** SFX cues (rule 39): only on signalled events, ≤ 1 per 2 s, synced to the visual. */
export function sfxCues(beats: TimedBeat[], duration: number): Timeline['sfx'] {
  const raw: { t: number; kind: SfxKind; gain: number; prio: number }[] = [];
  beats.forEach((b, i) => {
    const v = b.beat.visual;
    if (i > 0)
      raw.push({
        t: b.start,
        kind: b.beat.role === 'takeaway' ? 'impact' : 'whoosh',
        gain: 0.8,
        prio: b.beat.role === 'takeaway' ? 3 : 1,
      });
    if (v.type === 'bigNumber') raw.push({ t: b.start + 0.45, kind: 'pop', gain: 0.9, prio: 2 });
    if (v.type === 'title' && i === 0) raw.push({ t: 0.05, kind: 'chime', gain: 0.7, prio: 2 });
    if (b.beat.role === 'takeaway' && i > 0)
      raw.push({ t: Math.max(0, b.start - 1.2), kind: 'riser', gain: 0.6, prio: 0 });
  });
  raw.push({ t: Math.max(0, duration - 1.4), kind: 'chime', gain: 0.6, prio: 2 });
  raw.sort((a, b) => a.t - b.t);
  const kept: typeof raw = [];
  for (const x of raw) {
    const last = kept[kept.length - 1];
    if (last && x.t - last.t < 2 && x.kind !== 'riser' && last.kind !== 'riser') {
      if (x.prio > last.prio) kept[kept.length - 1] = x; // keep the higher-priority cue
      continue;
    }
    kept.push(x);
  }
  const out: Timeline['sfx'] = kept.map((x) => ({ t: round3(x.t), kind: x.kind, gain: x.gain }));
  return out;
}

/** Which beat is on screen at time t (index), or -1 for the end card. */
export function beatAt(tl: Timeline, t: number): number {
  for (let i = 0; i < tl.beats.length; i++) if (t < tl.beats[i]!.end) return i;
  return -1;
}
