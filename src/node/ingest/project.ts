/**
 * Projects → Source: a folder upload, a zip, or a GitHub repo. We read the README (as prose), manifests
 * (package.json, pyproject.toml, Cargo.toml, go.mod, …), the file tree, language mix and the key source files
 * (entry points), each as a traceable segment with file + line numbers. Code is never executed.
 */
import { unzipSync } from 'fflate';
import { ingestText } from '../../core/ingest/text.ts';
import type { Segment, Source } from '../../core/schema.ts';
import { wordCount } from '../../core/text/text.ts';
import { safeName, type InputFile } from './index.ts';

const IGNORE =
  /(^|\/)(node_modules|\.git|\.hg|\.svn|dist|build|out|target|vendor|\.venv|venv|__pycache__|\.next|\.cache|coverage|\.idea|\.vscode|\.DS_Store)(\/|$)/;
const LOCK =
  /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|uv\.lock|go\.sum|composer\.lock|Gemfile\.lock)$/;
const BINARY =
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|jar|exe|dll|so|dylib|bin|woff2?|ttf|otf|mp[34]|mov|wav|onnx|gguf|pt|pth|safetensors|db|sqlite)$/i;
const LANGS: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  py: 'Python',
  rs: 'Rust',
  go: 'Go',
  java: 'Java',
  kt: 'Kotlin',
  swift: 'Swift',
  rb: 'Ruby',
  php: 'PHP',
  cs: 'C#',
  cpp: 'C++',
  cc: 'C++',
  c: 'C',
  h: 'C',
  hpp: 'C++',
  scala: 'Scala',
  sh: 'Shell',
  css: 'CSS',
  scss: 'CSS',
  html: 'HTML',
  vue: 'Vue',
  svelte: 'Svelte',
  sql: 'SQL',
  dart: 'Dart',
  ex: 'Elixir',
  lua: 'Lua',
  r: 'R',
  jl: 'Julia',
  zig: 'Zig',
};
const MANIFESTS =
  /(^|\/)(package\.json|pyproject\.toml|setup\.py|Cargo\.toml|go\.mod|pom\.xml|build\.gradle(\.kts)?|Gemfile|composer\.json|requirements\.txt|deno\.json|Makefile|Dockerfile)$/;
const ENTRY =
  /(^|\/)(main|index|app|server|cli|lib|mod|__main__|program|handler)\.(ts|tsx|js|mjs|py|rs|go|java|kt|swift|rb)$/;
const MAX_FILE = 200_000;
const MAX_UNZIPPED = 200 * 1024 * 1024;

export function ingestZip(data: Uint8Array, name: string, dir: string): Source {
  let total = 0;
  let count = 0;
  const files = unzipSync(data, {
    filter: (f) => {
      count++;
      if (count > 20_000) throw new Error('that zip has too many files');
      total += f.originalSize;
      if (total > MAX_UNZIPPED) throw new Error('that zip unpacks to more than 200 MB');
      const n = safeName(f.name);
      return !!n && !IGNORE.test(n) && !BINARY.test(n) && !LOCK.test(n) && f.originalSize <= MAX_FILE;
    },
  });
  const list: InputFile[] = Object.entries(files)
    .filter(([n]) => !n.endsWith('/'))
    .map(([n, d]) => ({ name: safeName(n), data: d }));
  // strip a single top-level folder ("repo-main/")
  const tops = new Set(list.map((f) => f.name.split('/')[0]));
  const root = tops.size === 1 && list.every((f) => f.name.includes('/')) ? [...tops][0]! : '';
  const stripped = root ? list.map((f) => ({ ...f, name: f.name.slice(root.length + 1) })) : list;
  return ingestProjectFiles(stripped, root || name.replace(/\.zip$/i, ''), dir);
}

function treeLines(names: string[], maxLines = 14): string[] {
  // top-level entries, then one level below for the biggest folders
  const top = new Map<string, number>();
  for (const n of names) {
    const [a, b] = n.split('/');
    const key = b !== undefined ? `${a}/` : a!;
    top.set(key, (top.get(key) ?? 0) + 1);
  }
  const entries = [...top.entries()].sort(
    (x, y) => Number(y[0].endsWith('/')) - Number(x[0].endsWith('/')) || y[1] - x[1],
  );
  const out: string[] = [];
  for (const [k] of entries) {
    if (out.length >= maxLines) break;
    out.push(k);
    if (k.endsWith('/') && out.length < maxLines - 2) {
      const kids = [
        ...new Set(
          names
            .filter((n) => n.startsWith(k))
            .map((n) => n.slice(k.length).split('/')[0]! + (n.slice(k.length).includes('/') ? '/' : '')),
        ),
      ].slice(0, 3);
      for (const c of kids) if (out.length < maxLines) out.push(`  ${c}`);
    }
  }
  return out;
}

function summarizeManifest(name: string, text: string): string {
  if (name.endsWith('package.json')) {
    try {
      const j = JSON.parse(text) as {
        name?: string;
        description?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        bin?: unknown;
      };
      const deps = Object.keys(j.dependencies ?? {}).slice(0, 12);
      const scripts = Object.keys(j.scripts ?? {}).slice(0, 8);
      return [
        `${name}: the package is named "${j.name ?? '?'}".`,
        j.description ? `Its description: ${j.description}.` : '',
        deps.length ? `It depends on ${deps.join(', ')}.` : 'It has no runtime dependencies.',
        scripts.length ? `Its scripts are: ${scripts.join(', ')}.` : '',
        j.bin ? 'It installs a command-line tool.' : '',
      ]
        .filter(Boolean)
        .join(' ');
    } catch {
      return `${name} (unreadable JSON)`;
    }
  }
  const head = text.split('\n').slice(0, 30).join('\n');
  return `${name}:\n${head}`;
}

export function ingestProjectFiles(files: InputFile[], title: string, _dir: string): Source {
  const dec = new TextDecoder();
  const usable = files.filter(
    (f) => !IGNORE.test(f.name) && !BINARY.test(f.name) && !LOCK.test(f.name) && f.data.length <= MAX_FILE,
  );
  const names = usable.map((f) => f.name).sort();
  const segs: Segment[] = [];
  const push = (s: Omit<Segment, 'id'>) => segs.push({ ...s, id: `s${segs.length + 1}` } as Segment);
  const warnings: string[] = [];
  if (!usable.length) throw new Error('no readable source files in that project');

  // README first (prose the model can cite)
  const readme = usable
    .filter((f) => /^readme(\.(md|markdown|txt|rst))?$/i.test(f.name.split('/').pop()!))
    .sort((a, b) => a.name.split('/').length - b.name.split('/').length)[0];
  let projTitle = title;
  if (readme) {
    const r = ingestText(dec.decode(readme.data), readme.name);
    if (r.title && r.title !== 'Untitled' && wordCount(r.title) <= 10) projTitle = r.title;
    for (const s of r.segments) push({ ...s, loc: { ...s.loc, file: readme.name } });
  } else warnings.push('no README found: the video will be built from the code and manifests only');

  // languages
  const langCount = new Map<string, number>();
  for (const n of names) {
    const l = LANGS[n.split('.').pop()!.toLowerCase()];
    if (l) langCount.set(l, (langCount.get(l) ?? 0) + 1);
  }
  const totalCode = [...langCount.values()].reduce((a, b) => a + b, 0);
  if (totalCode) {
    const parts = [...langCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([l, n]) => `${l} ${Math.round((n / totalCode) * 100)}% (${n} files)`);
    push({
      kind: 'paragraph',
      text: `The project has ${names.length} files. Languages: ${parts.join(', ')}.`,
      loc: { file: '(file tree)', section: ['Project facts'] },
    });
  }
  // file tree (as a meta segment the tree visual can show)
  push({ kind: 'meta', text: `FILE TREE\n${treeLines(names).join('\n')}`, loc: { file: '(file tree)' } });

  // manifests
  for (const f of usable.filter((x) => MANIFESTS.test(x.name) && x.name.split('/').length <= 2).slice(0, 4)) {
    push({
      kind: 'paragraph',
      text: summarizeManifest(f.name, dec.decode(f.data)),
      loc: {
        file: f.name,
        lines: [1, Math.min(30, dec.decode(f.data).split('\n').length)],
        section: ['Manifests'],
      },
    });
  }

  // key source files: entry points first, then the shallowest code files
  const code = usable.filter(
    (f) =>
      LANGS[f.name.split('.').pop()!.toLowerCase()] &&
      !/\.(css|scss|html)$/.test(f.name) &&
      !/(test|spec)\./.test(f.name),
  );
  const ranked = [...code].sort(
    (a, b) =>
      Number(ENTRY.test(b.name)) - Number(ENTRY.test(a.name)) ||
      a.name.split('/').length - b.name.split('/').length ||
      b.data.length - a.data.length,
  );
  for (const f of ranked.slice(0, 6)) {
    const lines = dec.decode(f.data).split('\n');
    // skip leading license headers / imports to the first interesting line
    let start = lines.findIndex((l) =>
      /^\s*(export |def |class |func |fn |pub |async |function |const |app\.|@)/.test(l),
    );
    if (start < 0) start = 0;
    const end = Math.min(lines.length, start + 14);
    push({
      kind: 'code',
      text: lines.slice(start, end).join('\n'),
      lang: f.name.split('.').pop(),
      loc: { file: f.name, lines: [start + 1, end] },
    });
  }
  const words = segs.reduce((n, s) => n + wordCount(s.text), 0);
  return {
    schema: 'bridge.source/1',
    kind: 'project',
    title: projTitle,
    origin: title,
    segments: segs,
    assets: [],
    warnings,
    stats: { words, files: names.length },
  };
}
