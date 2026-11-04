/**
 * The ideas ledger: docs/ideas_ledger.json is the source of truth; docs/IDEAS.md is generated from it.
 *   npm run ideas -- next [n]                       highest-score open ideas
 *   npm run ideas -- add "<title>" --area a --value 4 --effort 2 [--confidence 0.7] [--why "…"]
 *   npm run ideas -- set I-012 doing|done|open|blocked|parked [--note "…"]
 *   npm run ideas -- reject I-012 --why "…"
 *   npm run ideas -- render | check                 regenerate IDEAS.md | fail if it's stale
 * Score = value × confidence ÷ effort (value, effort 1–5).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(ROOT, 'docs/ideas_ledger.json');
const MD = join(ROOT, 'docs/IDEAS.md');

export type Status = 'open' | 'doing' | 'done' | 'blocked' | 'parked' | 'rejected';
export interface Idea {
  id: string;
  title: string;
  area: string;
  value: number;
  effort: number;
  confidence: number;
  status: Status;
  why: string;
  created: string;
  updated: string;
  notes: string[];
}
export interface Ledger {
  version: 1;
  ideas: Idea[];
}

export const score = (i: Idea): number => Math.round(((i.value * i.confidence) / i.effort) * 100) / 100;

export function render(l: Ledger): string {
  const areas = [...new Set(l.ideas.map((i) => i.area))].sort();
  const counts = (s: Status) => l.ideas.filter((i) => i.status === s).length;
  const out: string[] = [
    '# Ideas',
    '',
    '_Generated from `docs/ideas_ledger.json` by `npm run ideas -- render`. Do not edit by hand._',
    '',
    `Score = value × confidence ÷ effort. ${l.ideas.length} ideas: ${counts('done')} done, ${counts('doing')} doing, ` +
      `${counts('open')} open, ${counts('blocked')} blocked, ${counts('parked')} parked, ${counts('rejected')} rejected.`,
    '',
  ];
  for (const a of areas) {
    out.push(`## ${a}`, '', '| ID | Idea | V | E | C | Score | Status | Why / notes |', '|---|---|---|---|---|---|---|---|');
    for (const i of l.ideas.filter((x) => x.area === a)) {
      const why = [i.why, ...i.notes].filter(Boolean).join(' — ').replace(/\|/g, '/').replace(/\n/g, ' ');
      out.push(
        `| ${i.id} | ${i.title.replace(/\|/g, '/')} | ${i.value} | ${i.effort} | ${i.confidence} | ${score(i)} | ${i.status} | ${why} |`,
      );
    }
    out.push('');
  }
  return out.join('\n');
}

function load(): Ledger {
  return JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
}
function save(l: Ledger): void {
  writeFileSync(LEDGER, JSON.stringify(l, null, 1) + '\n');
  writeFileSync(MD, render(l));
}
const today = (): string => new Date().toISOString().slice(0, 10);
function flag(args: string[], k: string): string | undefined {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(argv: string[]): void {
  const [cmd, ...rest] = argv;
  const l = load();
  switch (cmd) {
    case 'next': {
      const n = Number(rest[0] ?? 8);
      const open = l.ideas.filter((i) => i.status === 'open' || i.status === 'doing');
      open.sort((a, b) => score(b) - score(a));
      for (const i of open.slice(0, n)) console.log(`${i.id}  ${score(i).toFixed(2)}  [${i.area}] ${i.title} (${i.status})`);
      return;
    }
    case 'add': {
      const title = rest[0];
      if (!title) throw new Error('title required');
      const max = Math.max(0, ...l.ideas.map((i) => Number(i.id.slice(2))));
      const idea: Idea = {
        id: `I-${String(max + 1).padStart(3, '0')}`,
        title,
        area: flag(rest, 'area') ?? 'misc',
        value: Number(flag(rest, 'value') ?? 3),
        effort: Number(flag(rest, 'effort') ?? 3),
        confidence: Number(flag(rest, 'confidence') ?? 0.7),
        status: (flag(rest, 'status') as Status) ?? 'open',
        why: flag(rest, 'why') ?? '',
        created: today(),
        updated: today(),
        notes: [],
      };
      l.ideas.push(idea);
      save(l);
      console.log(idea.id);
      return;
    }
    case 'set':
    case 'reject': {
      const id = rest[0];
      const idea = l.ideas.find((i) => i.id === id);
      if (!idea) throw new Error(`unknown idea ${id}`);
      idea.status = cmd === 'reject' ? 'rejected' : (rest[1] as Status);
      const note = flag(rest, 'note') ?? flag(rest, 'why');
      if (note) idea.notes.push(`${today()} ${note}`);
      idea.updated = today();
      save(l);
      return;
    }
    case 'render':
      save(l);
      return;
    case 'check': {
      const want = render(l);
      const have = readFileSync(MD, 'utf8');
      const ids = l.ideas.map((i) => i.id);
      if (new Set(ids).size !== ids.length) throw new Error('duplicate idea ids');
      if (want !== have) {
        console.error('docs/IDEAS.md is stale: run `npm run ideas -- render`');
        process.exit(1);
      }
      console.log(`ideas ledger ok (${l.ideas.length} ideas)`);
      return;
    }
    default:
      console.log('usage: next | add | set | reject | render | check');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
