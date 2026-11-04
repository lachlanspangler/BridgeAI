/**
 * The `bridge` CLI.
 *   bridge make <file|url|-> [--len 20] [--voice af_heart] [--engine auto|extractive|local|<provider>] [--out dir]
 *   bridge doctor            environment, models, disk, ffmpeg, keys, ports
 *   bridge models [pull|link <path>|list]
 *   bridge keys [list|set <provider>|remove <provider>]
 */
import { mkdirSync, readFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { ingestInput, type InputFile } from '../node/ingest/index.ts';
import { basename, join, resolve } from 'node:path';
import { RenderSettings } from '../core/schema.ts';
import { ingestText } from '../core/ingest/text.ts';
import { runPipeline, type Progress } from '../node/pipeline.ts';
import { pickEngines } from '../node/select.ts';
import { redact } from '../node/keys/redact.ts';
import { loadConfig, saveConfig } from '../node/config.ts';
import { existsSync } from 'node:fs';
import { paths } from '../node/paths.ts';

function flag(args: string[], k: string, d?: string): string | undefined {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
}

function readTree(root: string, rel = ''): InputFile[] {
  const out: InputFile[] = [];
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    if (/^(node_modules|\.git|dist|build|\.venv)$/.test(e.name)) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...readTree(root, r));
    else if (e.isFile() && statSync(join(root, r)).size < 200_000)
      out.push({ name: `${basename(root)}/${r}`, data: readFileSync(join(root, r)) });
    if (out.length > 3000) break;
  }
  return out;
}

async function make(args: string[]): Promise<void> {
  const input = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
  if (!input) throw new Error('usage: bridge make <file> [--len 20]');
  const seconds = Number(flag(args, 'len', '20'));
  const id0 = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${seconds}s`;
  const srcDir = join(paths.home(), 'sources', `cli-${id0}`);
  let src;
  if (input === '-') src = ingestText(readFileSync(0, 'utf8'), 'pasted text');
  else if (/^https?:\/\//.test(input)) src = await ingestInput({ url: input }, srcDir);
  else if (statSync(input).isDirectory()) src = await ingestInput({ files: readTree(input) }, srcDir);
  else src = await ingestInput({ files: [{ name: basename(input), data: readFileSync(input) }] }, srcDir);
  src = { ...src, assets: src.assets.map((a) => ({ ...a, path: resolve(srcDir, a.path) })) };
  console.log(
    `source   ${src.kind} · "${src.title}" · ${src.stats.words} words · ${src.segments.length} segments · ${src.assets.length} figures${src.warnings.length ? ` · ${src.warnings.join('; ')}` : ''}`,
  );
  const settings = RenderSettings.parse({
    seconds,
    voice: flag(args, 'voice', 'af_heart'),
    seed: Number(flag(args, 'seed', '7')),
  });
  const { engines, label } = await pickEngines({
    llm: flag(args, 'engine', 'auto')!,
    tts: flag(args, 'tts', 'auto')!,
    log: (e) =>
      console.log(`         · ${e.stage}: ${e.message}${e.ms ? ` (${(e.ms / 1000).toFixed(1)}s)` : ''}`),
  });
  console.log(`engine   ${label} · voice ${engines.tts.id}`);
  const id = id0;
  const jobDir = join(paths.jobs(), id);
  let last = '';
  const res = await runPipeline(src, settings, engines, jobDir, (p: Progress) => {
    const line = `${p.stage.padEnd(8)} ${p.message}`;
    if (
      line !== last &&
      (p.stage !== 'render' || p.progress === 0 || p.progress >= 1 || Math.round(p.progress * 100) % 25 === 0)
    ) {
      process.stdout.write(`${line}\n`);
      last = line;
    }
  });
  const outDir = resolve(flag(args, 'out', 'artifacts/videos')!);
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${id}.mp4`);
  copyFileSync(res.video, out);
  console.log(`\n✓ ${out}`);
  console.log(
    `  target ${res.durations.target}s · actual ${res.durations.actual.toFixed(1)}s · ${res.durations.withinTolerance ? 'within ±10%' : 'OUTSIDE ±10%'}`,
  );
  console.log(
    `  engines: ${res.engines.analyze} → ${res.engines.script} → ${res.engines.tts} · unsupported claims: ${res.faith.unsupported}`,
  );
  console.log(`  job: ${jobDir}`);
  console.log(
    `  timings: ${Object.entries(res.timings)
      .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`)
      .join(' · ')}`,
  );
}

async function models(args: string[]): Promise<void> {
  const [sub, p] = args;
  if (sub === 'link') {
    if (!p || !existsSync(p) || !p.endsWith('.gguf'))
      throw new Error('usage: bridge models link <file.gguf>');
    const c = loadConfig();
    c.llm = { path: resolve(p) };
    saveConfig(c);
    console.log(`✓ linked ${resolve(p)} (no copy, no download)`);
    return;
  }
  const { findLocalLlm, LLM_MODELS } = await import('../node/models/catalog.ts');
  if (sub === 'pull') {
    // one download at a time: the LLM (unless one is already present/linked), then warm Kokoro
    if (!findLocalLlm()) {
      const { downloadModel } = await import('../node/models/download.ts');
      const spec = LLM_MODELS.find((m) => m.id === p) ?? LLM_MODELS[0]!;
      let last = -1;
      const dest = await downloadModel(spec, (d, t) => {
        const pct = Math.floor((d / t) * 100);
        if (pct !== last && pct % 5 === 0) process.stdout.write(`  ${spec.label}: ${pct}%\n`);
        last = pct;
      });
      console.log(`✓ ${dest}`);
    } else console.log(`✓ local model present: ${findLocalLlm()!.id}`);
    const { KokoroTts } = await import('../node/tts/kokoro.ts');
    const k = new KokoroTts();
    await k.synthesize('Ready.', {});
    console.log('✓ Kokoro voice ready');
    return;
  }
  console.log(JSON.stringify({ llm: findLocalLlm() }, null, 2));
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'make':
      return make(rest);
    case 'models':
      return models(rest);
    case 'keys': {
      const { keyStatus, setKey, removeKey, isProvider } = await import('../node/keys/keystore.ts');
      const [sub, prov] = rest;
      if ((sub === 'set' || sub === 'remove') && (!prov || !isProvider(prov)))
        throw new Error('usage: bridge keys set|remove <anthropic|openai|gemini|openrouter|elevenlabs>');
      if (sub === 'set') {
        // read the key from stdin so it never lands in shell history or argv
        const key = readFileSync(0, 'utf8').trim();
        await setKey(prov as never, key);
        console.log(`✓ ${prov} key saved`);
        return;
      }
      if (sub === 'remove') {
        await removeKey(prov as never);
        console.log(`✓ ${prov} key removed`);
        return;
      }
      for (const k of await keyStatus())
        console.log(
          `${k.present ? '✓' : '·'} ${k.provider.padEnd(11)} ${k.present ? `${k.masked} (${k.source})` : 'not set'}`,
        );
      return;
    }
    case 'doctor':
    case 'heal': {
      const { runDoctor, formatChecks } = await import('../node/doctor.ts');
      const cs = await runDoctor({ heal: cmd === 'heal' });
      console.log(formatChecks(cs));
      if (cs.some((c) => c.level === 'fail')) process.exitCode = 1;
      return;
    }
    default:
      console.log('usage: bridge make <file> [--len 20] | doctor | models | keys');
  }
}

main().catch((e: unknown) => {
  console.error(`✗ ${redact(e instanceof Error ? e.message : String(e))}`);
  process.exit(1);
});
