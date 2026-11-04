/**
 * The `bridge` CLI.
 *   bridge make <file|url|-> [--len 20] [--voice af_heart] [--engine auto|extractive|local|<provider>] [--out dir]
 *   bridge doctor            environment, models, disk, ffmpeg, keys, ports
 *   bridge models [pull|link <path>|list]
 *   bridge keys [list|set <provider>|remove <provider>]
 */
import { mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { RenderSettings } from '../core/schema.ts';
import { ingestText } from '../core/ingest/text.ts';
import { runPipeline, type Progress } from '../node/pipeline.ts';
import { KokoroTts } from '../node/tts/kokoro.ts';
import { SystemTts } from '../node/tts/system.ts';
import { paths } from '../node/paths.ts';

function flag(args: string[], k: string, d?: string): string | undefined {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
}

async function make(args: string[]): Promise<void> {
  const input = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  if (!input) throw new Error('usage: bridge make <file> [--len 20]');
  const seconds = Number(flag(args, 'len', '20'));
  const text = input === '-' ? readFileSync(0, 'utf8') : readFileSync(input, 'utf8');
  const src = ingestText(text, input === '-' ? 'pasted text' : basename(input));
  const settings = RenderSettings.parse({ seconds, voice: flag(args, 'voice', 'af_heart'), seed: Number(flag(args, 'seed', '7')) });
  const kokoro = new KokoroTts();
  const tts = (await kokoro.available()) ? kokoro : new SystemTts();
  const id = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${seconds}s`;
  const jobDir = join(paths.jobs(), id);
  let last = '';
  const res = await runPipeline(src, settings, { tts }, jobDir, (p: Progress) => {
    const line = `${p.stage.padEnd(8)} ${p.message}`;
    if (line !== last && (p.stage !== 'render' || p.progress === 0 || p.progress >= 1 || Math.round(p.progress * 100) % 25 === 0)) {
      process.stdout.write(`${line}\n`);
      last = line;
    }
  });
  const outDir = resolve(flag(args, 'out', 'artifacts/videos')!);
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${id}.mp4`);
  copyFileSync(res.video, out);
  console.log(`\n✓ ${out}`);
  console.log(`  target ${res.durations.target}s · actual ${res.durations.actual.toFixed(1)}s · ${res.durations.withinTolerance ? 'within ±10%' : 'OUTSIDE ±10%'}`);
  console.log(`  engines: ${res.engines.analyze} → ${res.engines.script} → ${res.engines.tts} · unsupported claims: ${res.faith.unsupported}`);
  console.log(`  job: ${jobDir}`);
  console.log(`  timings: ${Object.entries(res.timings).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join(' · ')}`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'make':
      return make(rest);
    default:
      console.log('usage: bridge make <file> [--len 20] | doctor | models | keys');
  }
}

main().catch((e: unknown) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
