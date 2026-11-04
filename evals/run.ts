/**
 * The eval harness. For every case × length: ingest → analyze → script → faith gate → voice + length fit
 * (no render by default; --render to also make the mp4), then score:
 *   faithfulness   unsupported claims left in the final script (must be 0), re-checked independently
 *   coverage       hand-written key points covered by the narration; top idea (k1) must be covered at every length
 *   understanding  a fresh model sees ONLY the narration + on-screen text and answers the case's questions
 *   timing         duration within ±10 % of the target
 * Writes evals/results/latest.json and docs/EVALS.md.
 *   npx tsx evals/run.ts [--engine auto|extractive|local|anthropic|…] [--lengths 20,60] [--cases a,b] [--render]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { budgetFor } from '../src/core/budget.ts';
import { checkScript, visualStrings } from '../src/core/faith/check.ts';
import { RenderSettings, type Script, type Source } from '../src/core/schema.ts';
import { contentWords, coverage, stem } from '../src/core/text/text.ts';
import { ingestInput, type Input } from '../src/node/ingest/index.ts';
import { providerFromKeys } from '../src/node/llm/providers.ts';
import type { LlmProvider } from '../src/node/llm/types.ts';
import { paths } from '../src/node/paths.ts';
import { runPipeline } from '../src/node/pipeline.ts';
import { localLlm, pickEngines } from '../src/node/select.ts';

interface Case {
  id: string;
  kind: Source['kind'];
  title: string;
  source: { file?: string; url?: string; files?: string[]; note?: string };
  licence: string;
  key_points: { id: string; text: string; any: string[][] }[];
  questions: { q: string; a: string; key: string }[];
}

const ROOT = join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (k: string, d?: string) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const engine = flag('engine', 'auto')!;
const lengths = flag('lengths', '20,60')!.split(',').map(Number);
const only = flag('cases')?.split(',');
const render = args.includes('--render');
const rescore = args.includes('--rescore');

/** Re-score a previous run from its saved artifacts (no model calls for the script). */
function savedRun(dir: string, seconds: number) {
  const read = <T>(f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as T;
  const script = read<Script>('script.json');
  const faith = read<{ unsupported: number; actions: { action: string }[] }>('faith.json');
  const tl = read<{ duration: number }>('timeline.json');
  return {
    script,
    faith,
    durations: {
      target: seconds,
      actual: tl.duration,
      withinTolerance: Math.abs(tl.duration - seconds) <= seconds * 0.1,
    },
    engines: { analyze: script.engine, script: script.engine, tts: 'saved' },
  };
}

export function loadCases(): Case[] {
  const dir = join(ROOT, 'evals/cases');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => parseYaml(readFileSync(join(dir, f), 'utf8')) as Case);
}

/** A key point is covered if, for every inner group, at least one alternative appears in the text. */
export function covered(kp: Case['key_points'][number], text: string): boolean {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9.%+-]+/g, ' ')} `;
  return kp.any.every((group) =>
    group.some((alt) => t.includes(` ${alt.toLowerCase()}`) || t.includes(alt.toLowerCase())),
  );
}

export function screenText(script: Script): string {
  return script.beats
    .flatMap((b) => visualStrings(b.visual))
    .filter(Boolean)
    .join(' · ');
}

async function inputFor(c: Case): Promise<Input> {
  if (c.source.url) return { url: c.source.url };
  if (c.source.file) {
    const p = join(ROOT, c.source.file);
    return { files: [{ name: c.source.file.split('/').pop()!, data: readFileSync(p) }] };
  }
  if (c.source.files)
    return {
      files: c.source.files.map((f) => ({ name: f.split('/').pop()!, data: readFileSync(join(ROOT, f)) })),
      text: c.source.note,
    };
  throw new Error(`case ${c.id} has no source`);
}

/** Only questions about key points that fit this length count (a 20 s video can't answer k4). */
export function questionsFor(c: Case, seconds: number): Case['questions'] {
  const k = Math.max(1, budgetFor(seconds).ideas.max);
  const keys = new Set(c.key_points.slice(0, k).map((x) => x.id));
  const qs = c.questions.filter((q) => keys.has(q.key));
  return qs.length ? qs : c.questions.slice(0, 1);
}

async function understanding(
  llm: LlmProvider | null,
  c0: Case,
  script: Script,
  seconds: number,
): Promise<{ correct: number; total: number; answers: string[] }> {
  if (!llm) return { correct: 0, total: 0, answers: [] };
  const c = { ...c0, questions: questionsFor(c0, seconds) };
  const narration = script.beats.map((b) => b.narration).join(' ');
  const screen = screenText(script);
  const r = await llm.json<{ answers: string[] }>({
    system:
      'You just watched a short explainer video. Answer ONLY from what the video said or showed. If the video did not cover it, answer "not covered". Short answers. JSON only.',
    user: `VIDEO NARRATION:\n${narration}\n\nON-SCREEN TEXT:\n${screen}\n\nQUESTIONS:\n${c.questions.map((q, i) => `${i + 1}. ${q.q}`).join('\n')}`,
    schema: {
      type: 'object',
      properties: {
        answers: {
          type: 'array',
          items: { type: 'string' },
          minItems: c.questions.length,
          maxItems: c.questions.length,
        },
      },
      required: ['answers'],
      additionalProperties: false,
    },
    name: 'answers',
    maxTokens: 600,
    temperature: 0,
  });
  let correct = 0;
  for (const [i, q] of c.questions.entries()) {
    const a = r.answers[i] ?? '';
    if (/not covered/i.test(a)) continue;
    const exp = contentWords(q.a).map(stem);
    const got = new Set(contentWords(a).map(stem));
    const overlap = exp.length ? exp.filter((w) => got.has(w)).length / exp.length : 0;
    const nums = q.a.match(/\d+(\.\d+)?/g) ?? [];
    const numsOk = nums.every((n) => a.includes(n));
    if ((overlap >= 0.5 && numsOk) || coverage(q.a, a) >= 0.6 || (nums.length > 0 && numsOk)) correct++;
    else {
      const g = await llm.json<{ same: boolean }>({
        system: 'You grade quiz answers. JSON only.',
        user: `QUESTION: ${q.q}\nEXPECTED: ${q.a}\nGIVEN: ${a}\nIs the given answer essentially correct? The core fact must match; paraphrase, abbreviations (GtC = gigatons of carbon), missing units and small omissions are fine. A wrong number or a different fact is not.`,
        schema: {
          type: 'object',
          properties: { same: { type: 'boolean' } },
          required: ['same'],
          additionalProperties: false,
        },
        name: 'grade',
        maxTokens: 30,
        temperature: 0,
      });
      if (g.same) correct++;
    }
  }
  return { correct, total: c.questions.length, answers: r.answers };
}

interface Row {
  case: string;
  kind: string;
  seconds: number;
  engine: string;
  actual: number;
  inTolerance: boolean;
  beats: number;
  unsupported: number;
  recheckUnsupported: number;
  dropped: number;
  k1: boolean;
  coverage: number;
  coveredIds: string[];
  understanding: string;
  understandingFrac: number;
  error?: string;
}

async function main(): Promise<void> {
  const cases = loadCases().filter((c) => !only || only.includes(c.id));
  if (!cases.length) throw new Error('no eval cases in evals/cases');
  const judge =
    engine === 'auto' || engine === 'local' || engine === 'extractive'
      ? localLlm()
      : await providerFromKeys(engine);
  const { engines, label } = await pickEngines({ llm: engine, tts: 'auto', providers: providerFromKeys });
  console.log(
    `evals: ${cases.length} cases × ${lengths.join('/')} s · engine ${label} · understanding judge ${judge ? `${judge.id}:${judge.model}` : 'none'}`,
  );
  const rows: Row[] = [];
  for (const c of cases) {
    let src: Source;
    const srcDir = join(paths.home(), 'evals', c.id);
    try {
      src = await ingestInput(await inputFor(c), srcDir);
      src = { ...src, assets: src.assets.map((a) => ({ ...a, path: join(srcDir, a.path) })) };
    } catch (e) {
      for (const s of lengths)
        rows.push({
          case: c.id,
          kind: c.kind,
          seconds: s,
          engine: label,
          actual: 0,
          inTolerance: false,
          beats: 0,
          unsupported: 0,
          recheckUnsupported: 0,
          dropped: 0,
          k1: false,
          coverage: 0,
          coveredIds: [],
          understanding: '-',
          understandingFrac: 0,
          error: `ingest: ${(e as Error).message}`,
        });
      continue;
    }
    for (const s of lengths) {
      const t0 = performance.now();
      try {
        const dir = join(paths.home(), 'evals', c.id, `run-${s}`);
        const r =
          rescore && existsSync(join(dir, 'script.json'))
            ? savedRun(dir, s)
            : await runPipeline(
                src,
                RenderSettings.parse({ seconds: s, width: 1280, height: 720 }),
                engines,
                dir,
                () => {},
                undefined,
                { render },
              );
        const narration = r.script.beats.map((b) => b.narration).join(' ');
        const said = `${narration} ${screenText(r.script)}`;
        const k = budgetFor(s).ideas.max;
        const top = c.key_points.slice(0, Math.max(1, k));
        const cov = top.filter((kp) => covered(kp, said));
        const recheck = checkScript(r.script, src)
          .flatMap((x) => x.verdicts)
          .filter((v) => v.verdict === 'unsupported' && v.by !== 'overlap').length;
        const u = await understanding(judge, c, r.script, s);
        if (args.includes('--verbose'))
          questionsFor(c, s).forEach((q, i) =>
            console.log(`      Q: ${q.q}\n      expected: ${q.a}\n      got: ${u.answers[i]}`),
          );
        rows.push({
          case: c.id,
          kind: c.kind,
          seconds: s,
          engine: r.engines.script,
          actual: Math.round(r.durations.actual * 10) / 10,
          inTolerance: r.durations.withinTolerance,
          beats: r.script.beats.length,
          unsupported: r.faith.unsupported,
          recheckUnsupported: recheck,
          dropped: r.faith.actions.filter((a) => a.action === 'dropped').length,
          k1: covered(c.key_points[0]!, said),
          coverage: Math.round((cov.length / top.length) * 100) / 100,
          coveredIds: cov.map((x) => x.id),
          understanding: u.total ? `${u.correct}/${u.total}` : '-',
          understandingFrac: u.total ? u.correct / u.total : 0,
        });
        console.log(
          `  ${c.id} ${s}s: ${r.durations.actual.toFixed(1)} s · unsupported ${r.faith.unsupported}/${recheck} · k1 ${rows.at(-1)!.k1 ? '✓' : '✗'} · coverage ${rows.at(-1)!.coverage} · understanding ${rows.at(-1)!.understanding} · ${((performance.now() - t0) / 1000).toFixed(0)} s`,
        );
      } catch (e) {
        rows.push({
          case: c.id,
          kind: c.kind,
          seconds: s,
          engine: label,
          actual: 0,
          inTolerance: false,
          beats: 0,
          unsupported: 0,
          recheckUnsupported: 0,
          dropped: 0,
          k1: false,
          coverage: 0,
          coveredIds: [],
          understanding: '-',
          understandingFrac: 0,
          error: (e as Error).message,
        });
        console.log(`  ${c.id} ${s}s: ERROR ${(e as Error).message}`);
      }
    }
  }
  mkdirSync(join(ROOT, 'evals/results'), { recursive: true });
  const stamp = new Date().toISOString();
  writeFileSync(
    join(ROOT, 'evals/results/latest.json'),
    JSON.stringify({ stamp, engine: label, lengths, rows }, null, 2),
  );
  writeFileSync(join(ROOT, 'docs/EVALS.md'), report(stamp, label, rows));
  console.log('wrote docs/EVALS.md');
}

function report(stamp: string, label: string, rows: Row[]): string {
  const ok = rows.filter((r) => !r.error);
  const by = (s: number) => ok.filter((r) => r.seconds === s);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const lines = [
    '# Evals',
    '',
    `_Generated by \`make evals\` (evals/run.ts) on ${stamp.slice(0, 16).replace('T', ' ')} UTC · engine **${label}** · ${new Set(rows.map((r) => r.case)).size} cases._`,
    '',
    "Metrics: **unsupported** = claims left in the final script that the faithfulness gate could not support (target 0); **recheck** = an independent deterministic re-check of the final script (numbers/names, target 0); **k1** = the source's single most important idea is in the video (target: every case, every length); **coverage** = hand-written key points covered, out of the number of ideas that fit the length; **understanding** = a fresh model that only sees the narration and on-screen text answers the case's questions; **timing** = within ±10 % of the chosen length.",
    '',
    '## Summary',
    '',
    '| length | runs | unsupported (total) | recheck | k1 covered | mean coverage | understanding | timing ±10% |',
    '|---|---|---|---|---|---|---|---|',
    ...[...new Set(ok.map((r) => r.seconds))]
      .sort((a, b) => a - b)
      .map((s) => {
        const rs = by(s);
        const mean = (f: (r: Row) => number) => rs.reduce((n, r) => n + f(r), 0) / Math.max(1, rs.length);
        return `| ${s} s | ${rs.length} | ${rs.reduce((n, r) => n + r.unsupported, 0)} | ${rs.reduce((n, r) => n + r.recheckUnsupported, 0)} | ${rs.filter((r) => r.k1).length}/${rs.length} | ${pct(mean((r) => r.coverage))} | ${pct(mean((r) => r.understandingFrac))} | ${rs.filter((r) => r.inTolerance).length}/${rs.length} |`;
      }),
    '',
    '## Per case',
    '',
    '| case | kind | length | actual | beats | unsupported | recheck | dropped | k1 | coverage | understanding | note |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.case} | ${r.kind} | ${r.seconds} s | ${r.actual} s${r.inTolerance ? '' : ' ⚠'} | ${r.beats} | ${r.unsupported} | ${r.recheckUnsupported} | ${r.dropped} | ${r.k1 ? '✓' : '✗'} | ${pct(r.coverage)} (${r.coveredIds.join(' ') || '–'}) | ${r.understanding} | ${r.error ? `ERROR: ${r.error.slice(0, 80)}` : ''} |`,
    ),
    '',
  ];
  return lines.join('\n');
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
