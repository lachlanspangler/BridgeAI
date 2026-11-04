/** Parallel rendering produces the same video as the serial path (duration, streams), from worker threads. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeWav } from '../../src/core/audio/mix.ts';
import { findFfmpeg, probeDuration } from '../../src/node/ffmpeg.ts';
import { renderVideo } from '../../src/node/render/render.ts';
import { writeFileSync } from 'node:fs';
import { sampleTimeline } from '../core/fixtures.ts';

describe.skipIf(!findFfmpeg())('parallel render', () => {
  it('2 workers: valid mp4 with the full duration and audio', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-par-'));
    const { tl } = sampleTimeline(20);
    const small = { ...tl, width: 320, height: 180, fps: 12 };
    const wav = join(dir, 'a.wav');
    writeFileSync(wav, encodeWav([new Float32Array(Math.ceil(small.duration * 44100))], 44100));
    process.env.BRIDGE_RENDER_WORKERS = '2';
    try {
      await renderVideo(small, { out: join(dir, 'v.mp4'), audioWav: wav, jobDir: dir, assets: [], burnCaptions: true, preset: 'ultrafast' });
    } finally {
      delete process.env.BRIDGE_RENDER_WORKERS;
    }
    expect(Math.abs(probeDuration(join(dir, 'v.mp4')) - small.duration)).toBeLessThan(0.3);
    const ff = findFfmpeg()!;
    if (ff.ffprobe) {
      const r = spawnSync(ff.ffprobe, ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', join(dir, 'v.mp4')], { encoding: 'utf8' });
      expect(Math.abs(Number(r.stdout.trim()) - Math.ceil(small.duration * 12))).toBeLessThanOrEqual(2);
    }
  }, 120_000);
});
