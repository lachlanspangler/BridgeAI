/** End to end on the real renderer and mixer, with a fake LLM and a fake voice (fast, deterministic, offline). */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { osc } from '../../src/core/audio/dsp.ts';
import { RenderSettings } from '../../src/core/schema.ts';
import { aiEngines, extractiveEngines } from '../../src/node/engines.ts';
import { findFfmpeg } from '../../src/node/ffmpeg.ts';
import type { JsonRequest, LlmProvider } from '../../src/node/llm/types.ts';
import { runPipeline } from '../../src/node/pipeline.ts';
import type { TtsEngine } from '../../src/node/tts/types.ts';
import { attention } from '../core/fixtures.ts';

/** A "voice" that speaks at 2.6 words/s as a buzzing tone. */
const fakeTts: TtsEngine = {
  id: 'fake',
  locality: 'local',
  available: async () => true,
  voices: () => [{ id: 'x', label: 'x' }],
  defaultVoice: () => 'x',
  synthesize: async (text, o) => {
    const secs = text.split(/\s+/).length / (2.6 * (o.speed ?? 1)) + 0.2;
    const s = osc(Math.round(secs * 24000), 24000, 160, 'saw');
    for (let i = 0; i < s.length; i++) s[i] = s[i]! * 0.3;
    return { samples: s, sampleRate: 24000 };
  },
};

class FakeLlm implements LlmProvider {
  readonly id = 'fake';
  readonly model = 'fake-1';
  readonly locality = 'local' as const;
  calls: string[] = [];
  constructor(private readonly abs: string) {}
  async json<T>(req: JsonRequest): Promise<T> {
    this.calls.push(req.name);
    if (req.name === 'analysis')
      return {
        gist: 'A new architecture.',
        ideas: [
          {
            statement: 'The Transformer uses only attention.',
            kind: 'method',
            importance: 5,
            evidence: [{ segmentId: this.abs, quote: 'based solely on attention mechanisms' }],
            numbers: [],
            terms: ['Transformer'],
            figure: 'none',
          },
        ],
      } as T;
    if (req.name === 'script')
      return {
        title: 'x',
        beats: [
          {
            role: 'hook',
            narration: 'What if a model needed only attention?',
            visual: { type: 'title', title: 'x', subtitle: '' },
            claims: [{ text: 'What if a model needed only attention?', support: [], kind: 'framing' }],
            keywords: [],
          },
          {
            role: 'idea',
            narration: 'The Transformer drops recurrence and convolutions entirely and uses attention alone.',
            visual: {
              type: 'compare',
              leftLabel: 'Before',
              leftPoints: ['Recurrence'],
              rightLabel: 'Transformer',
              rightPoints: ['Attention only'],
              winner: 'none',
            },
            claims: [
              {
                text: 'The Transformer drops recurrence and convolutions entirely and uses attention alone',
                support: [this.abs],
                kind: 'fact',
              },
            ],
            keywords: ['attention'],
          },
          {
            role: 'evidence',
            narration: 'It reaches 28.4 BLEU on English to German, over 2 BLEU better than before.',
            visual: {
              type: 'bigNumber',
              value: '28.4',
              unit: 'BLEU',
              label: 'English to German',
              compareValue: '',
              compareLabel: '',
            },
            claims: [
              {
                text: 'It reaches 28.4 BLEU on English to German, over 2 BLEU better than before',
                support: [this.abs],
                kind: 'fact',
              },
            ],
            keywords: ['28.4'],
          },
          {
            role: 'evidence',
            narration: 'It was built by aliens in 1999.',
            visual: { type: 'statement', text: 'Aliens built it', highlight: [] },
            claims: [{ text: 'It was built by aliens in 1999', support: [this.abs], kind: 'fact' }],
            keywords: [],
          },
          {
            role: 'takeaway',
            narration: 'Attention alone is enough.',
            visual: { type: 'takeaway', text: 'Attention alone is enough', highlight: ['Attention'] },
            claims: [{ text: 'Attention alone is enough', support: [this.abs], kind: 'fact' }],
            keywords: [],
          },
        ],
      } as T;
    if (req.name === 'judge')
      return { verdict: /aliens/i.test(req.user) ? 'not_supported' : 'supported', reason: '' } as T;
    if (req.name === 'expand') return { narration: req.user.match(/NARRATION: "(.*)"/)?.[1] ?? '' } as T;
    return { narration: 'short' } as T;
  }
}

const hasFfmpeg = !!findFfmpeg();

describe.skipIf(!hasFfmpeg)('pipeline end to end', () => {
  it('fake LLM: drops the invented beat, fits 20 s ±10%, writes every output, valid mp4 with audio + subtitles', async () => {
    const src = attention();
    const llm = new FakeLlm(src.segments.find((s) => s.kind === 'abstract')!.id);
    const dir = mkdtempSync(join(tmpdir(), 'bridge-e2e-'));
    const settings = RenderSettings.parse({ seconds: 20, width: 640, height: 360, fps: 15 });
    const r = await runPipeline(src, settings, aiEngines(llm, fakeTts), dir);
    expect(r.faith.actions.find((a) => a.action === 'dropped')).toBeTruthy();
    expect(r.script.beats.some((b) => /aliens/i.test(b.narration))).toBe(false);
    expect(r.faith.unsupported).toBe(0);
    expect(r.durations.withinTolerance).toBe(true);
    for (const f of [
      'video.mp4',
      'captions.vtt',
      'captions.srt',
      'script.md',
      'sourcemap.json',
      'timeline.json',
      'faith.json',
      'analysis.json',
      'source.json',
    ])
      expect(existsSync(join(dir, f)), f).toBe(true);
    expect(existsSync(join(dir, 'tmp'))).toBe(false); // temp renders cleaned up
    const ff = findFfmpeg()!;
    const probe = spawnSync(
      ff.ffprobe ?? 'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type,codec_name,width,height,pix_fmt',
        '-of',
        'json',
        join(dir, 'video.mp4'),
      ],
      { encoding: 'utf8' },
    );
    if (probe.status === 0) {
      const streams = (
        JSON.parse(probe.stdout) as {
          streams: { codec_type: string; codec_name: string; pix_fmt?: string; width?: number }[];
        }
      ).streams;
      expect(streams.find((s) => s.codec_type === 'video')).toMatchObject({
        codec_name: 'h264',
        pix_fmt: 'yuv420p',
        width: 640,
      });
      expect(streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe('aac');
      expect(streams.find((s) => s.codec_type === 'subtitle')?.codec_name).toBe('mov_text');
    }
    const map = JSON.parse(readFileSync(join(dir, 'sourcemap.json'), 'utf8'));
    expect(map.entries.length).toBe(r.script.beats.length);
    expect(statSync(join(dir, 'video.mp4')).size).toBeGreaterThan(20_000);
  }, 120_000);

  it('extractive floor works with no model at all', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-e2e-'));
    const r = await runPipeline(
      attention(),
      RenderSettings.parse({ seconds: 20, width: 480, height: 270, fps: 12, music: false }),
      extractiveEngines(fakeTts),
      dir,
    );
    expect(r.engines.script).toBe('extractive');
    expect(r.faith.unsupported).toBe(0);
    expect(existsSync(r.video)).toBe(true);
  }, 120_000);

  it('a model that throws falls back to the extractive floor (a video always gets made)', async () => {
    const broken: LlmProvider = {
      id: 'broken',
      model: 'x',
      locality: 'local',
      json: async () => {
        throw new Error('model exploded');
      },
    };
    const dir = mkdtempSync(join(tmpdir(), 'bridge-e2e-'));
    const r = await runPipeline(
      attention(),
      RenderSettings.parse({ seconds: 20, width: 480, height: 270, fps: 12 }),
      aiEngines(broken, fakeTts),
      dir,
    );
    expect(r.engines.analyze).toBe('extractive');
    expect(existsSync(r.video)).toBe(true);
  }, 120_000);
});
