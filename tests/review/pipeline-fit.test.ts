/**
 * Review 2026-11-03 (correctness): the voice length-fit loop. Offline: fake TTS, fake script/tighten engines,
 * render:false (no ffmpeg, no model). Each test asserts the CORRECT behaviour; a failure is a live bug.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestText } from '../../src/core/ingest/text.ts';
import { checkBeat } from '../../src/core/faith/check.ts';
import { RenderSettings, type Beat, type Script } from '../../src/core/schema.ts';
import { aiEngines } from '../../src/node/engines.ts';
import type { JsonRequest, LlmProvider } from '../../src/node/llm/types.ts';
import { runPipeline, type Engines } from '../../src/node/pipeline.ts';
import type { TtsEngine } from '../../src/node/tts/types.ts';

const paras = Array.from(
  { length: 10 },
  (_, i) => `Finding number ${i + 1} shows that careful sleep schedules improve memory recall in adults.`,
);
const src = ingestText(`Sleep study\n\n${paras.join('\n\n')}`, 'x.txt');
const segs = src.segments.filter((s) => s.kind !== 'title');

/** A slow voice: words / (wps * speed) seconds of constant tone. */
const slowTts = (wps: number): TtsEngine => ({
  id: 'fake',
  locality: 'local',
  available: async () => true,
  voices: () => [{ id: 'x', label: 'x' }],
  defaultVoice: () => 'x',
  synthesize: async (text, o) => {
    const secs = text.split(/\s+/).length / (wps * (o.speed ?? 1)) + 0.2;
    const s = new Float32Array(Math.round(secs * 24000)).fill(0.3);
    return { samples: s, sampleRate: 24000 };
  },
});

const mkBeat = (i: number, role: Beat['role']): Beat => {
  const s = segs[i]!;
  return {
    id: `b${i + 1}`,
    role,
    narration: s.text,
    visual: { type: 'statement', text: 'Sleep helps memory', highlight: [] },
    claims: [{ text: s.text, support: [s.id], kind: 'fact' }],
    ideas: [],
    keywords: [],
  };
};

const scriptOf = (n: number): Script => ({
  schema: 'bridge.script/1',
  title: 'Sleep study',
  targetSeconds: 20,
  engine: 'test',
  beats: Array.from({ length: n }, (_, i) => mkBeat(i, i === 0 ? 'hook' : i === n - 1 ? 'takeaway' : 'idea')),
});

const settings = RenderSettings.parse({ seconds: 20, width: 320, height: 180, fps: 12, music: false });

describe('length fit', () => {
  it('the timeline always matches the final script (no stale timeline after the last fit attempt)', async () => {
    // 10 beats at ~1 word/s is far too long every attempt, so all 5 attempts drop a beat;
    // the 5th drop happens after the 5th buildTimeline and is never rebuilt.
    const engines: Engines = { tts: slowTts(1), script: async () => scriptOf(10) };
    const dir = mkdtempSync(join(tmpdir(), 'bridge-review-'));
    const r = await runPipeline(src, settings, engines, dir, () => {}, undefined, { render: false });
    expect(r.timeline.beats.length).toBe(r.script.beats.length);
    r.timeline.beats.forEach((tb, i) => expect(tb.beat.narration).toBe(r.script.beats[i]!.narration));
  });

  it('a tightened narration is re-checked by the faithfulness gate before it is voiced', async () => {
    // hook + 1 idea + takeaway: only one droppable beat, so the loop goes straight to tighten
    const engines: Engines = {
      tts: slowTts(1.9),
      script: async () => scriptOf(3),
      tighten: async () => 'Microsoft proved sleep cures 90% of memory loss.',
    };
    const dir = mkdtempSync(join(tmpdir(), 'bridge-review-'));
    const r = await runPipeline(src, settings, engines, dir, () => {}, undefined, { render: false });
    for (const b of r.script.beats) expect(checkBeat(b, src).ok, b.narration).toBe(true);
    const map = JSON.parse(readFileSync(join(dir, 'sourcemap.json'), 'utf8')) as {
      entries: { narration: string; claims: { text: string }[] }[];
    };
    // the source map's claims must describe what is actually said
    for (const e of map.entries)
      expect(e.claims.map((c) => c.text).join(' ')).toContain(e.narration.slice(0, 12));
  });
});

class TightenLlm implements LlmProvider {
  readonly id = 'fake';
  readonly model = 'fake-1';
  readonly locality = 'local' as const;
  async json<T>(_req: JsonRequest): Promise<T> {
    return { narration: 'Google showed sleep improves memory.' } as T;
  }
}

describe('aiEngines.tighten', () => {
  it('rejects a shortened line that introduces a name the original did not have', async () => {
    const e = aiEngines(new TightenLlm(), slowTts(2.6));
    const b = mkBeat(1, 'idea');
    const out = await e.tighten!(b, 8);
    expect(out).not.toContain('Google');
  });
});
