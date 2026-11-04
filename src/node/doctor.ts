/**
 * `bridge doctor`: checks everything Bridge needs and says exactly what's missing and how to fix it.
 * Self-healing where it is safe (creates folders, removes stale temp renders); never downloads without asking.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { findFfmpeg } from './ffmpeg.ts';
import { registerFonts } from './fonts.ts';
import {
  canDownload,
  findLocalLlm,
  freeDiskBytes,
  LLM_MODELS,
  MODEL_BUDGET_BYTES,
  modelBytes,
} from './models/catalog.ts';
import { ensureDir, paths } from './paths.ts';
import { kokoroDownloaded } from './tts/kokoro.ts';
import { SystemTts } from './tts/system.ts';

export type Level = 'ok' | 'warn' | 'fail';
export interface Check {
  name: string;
  level: Level;
  detail: string;
  fix?: string;
}

const GB = 1024 ** 3;

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}

export async function runDoctor(
  opts: { heal?: boolean; keyStatus?: () => Promise<{ provider: string; present: boolean }[]> } = {},
): Promise<Check[]> {
  const out: Check[] = [];
  const [major, minor] = process.versions.node.split('.').map(Number) as [number, number];
  out.push(
    major > 20 || (major === 20 && minor >= 19)
      ? { name: 'node', level: 'ok', detail: `Node ${process.versions.node}` }
      : {
          name: 'node',
          level: 'fail',
          detail: `Node ${process.versions.node} is too old`,
          fix: 'install Node 20.19+ (https://nodejs.org) or `nvm install 22`',
        },
  );

  ensureDir(paths.home());
  const free = freeDiskBytes();
  out.push(
    free > 6 * GB
      ? { name: 'disk', level: 'ok', detail: `${(free / GB).toFixed(1)} GB free` }
      : {
          name: 'disk',
          level: free > 2 * GB ? 'warn' : 'fail',
          detail: `only ${(free / GB).toFixed(1)} GB free`,
          fix: 'free some space; Bridge needs ~3.5 GB for the local models and ~0.5 GB per render while rendering',
        },
  );

  const ff = findFfmpeg();
  out.push(
    ff
      ? { name: 'ffmpeg', level: 'ok', detail: `${ff.version} (${ff.source})` }
      : {
          name: 'ffmpeg',
          level: 'fail',
          detail: 'not found',
          fix: 'macOS: `brew install ffmpeg` · Windows: `winget install Gyan.FFmpeg` · Linux: `sudo apt install ffmpeg` · or `npm install ffmpeg-static`',
        },
  );

  const fonts = registerFonts();
  const badFonts = fonts.filter((f) => !f.ok);
  out.push(
    badFonts.length
      ? {
          name: 'fonts',
          level: 'fail',
          detail: `missing: ${badFonts.map((f) => f.family).join(', ')}`,
          fix: 'run `npm install` (fonts come from @fontsource)',
        }
      : { name: 'fonts', level: 'ok', detail: `${fonts.length} font files` },
  );

  const llm = findLocalLlm();
  const spec = LLM_MODELS[0]!;
  const dl = canDownload(spec.bytes);
  out.push(
    llm
      ? {
          name: 'local model',
          level: 'ok',
          detail: `${llm.id} (${(statSync(llm.path).size / GB).toFixed(2)} GB)`,
        }
      : {
          name: 'local model',
          level: 'warn',
          detail: 'none: videos use the extractive floor (works, but plainer scripts)',
          fix: dl.ok
            ? `\`make models\` downloads ${spec.label} (${(spec.bytes / GB).toFixed(1)} GB, ${spec.licence}) · or \`npx tsx src/cli/main.ts models link <file.gguf>\``
            : `can't download: ${dl.reason}`,
        },
  );
  out.push(
    kokoroDownloaded()
      ? { name: 'voice', level: 'ok', detail: 'Kokoro-82M (local)' }
      : {
          name: 'voice',
          level: 'warn',
          detail: 'Kokoro not downloaded yet (first render fetches ~330 MB)',
          fix: '`make models` fetches it now',
        },
  );
  const sys = await new SystemTts().available();
  out.push({
    name: 'system voice',
    level: sys ? 'ok' : 'warn',
    detail: sys ? 'available as a fallback' : 'none (install espeak-ng on Linux)',
  });

  const used = modelBytes();
  out.push({
    name: 'model budget',
    level: used.owned > MODEL_BUDGET_BYTES ? 'fail' : 'ok',
    detail: `${(used.owned / GB).toFixed(2)} GB in ~/.bridge/models${used.linked ? ` + ${(used.linked / GB).toFixed(2)} GB linked` : ''} (budget ${MODEL_BUDGET_BYTES / GB} GB)`,
  });

  // stale temp renders (disk rule): heal by deleting them
  const jobs = paths.jobs();
  let stale = 0;
  if (existsSync(jobs)) {
    for (const j of readdirSync(jobs)) {
      const tmp = join(jobs, j, 'tmp');
      if (existsSync(tmp) && Date.now() - statSync(tmp).mtimeMs > 30 * 60_000) {
        stale++;
        if (opts.heal) rmSync(tmp, { recursive: true, force: true });
      }
    }
  }
  out.push(
    stale
      ? {
          name: 'temp renders',
          level: opts.heal ? 'ok' : 'warn',
          detail: `${stale} stale temp folder(s)${opts.heal ? ' removed' : ''}`,
          fix: opts.heal ? undefined : '`make heal` removes them',
        }
      : { name: 'temp renders', level: 'ok', detail: 'none' },
  );

  for (const port of [7411]) {
    const freeP = await portFree(port);
    out.push({
      name: `port ${port}`,
      level: freeP ? 'ok' : 'warn',
      detail: freeP ? 'free' : 'in use (is Bridge already running?)',
      fix: freeP ? undefined : `set BRIDGE_PORT to another port, or stop the process on ${port}`,
    });
  }

  if (opts.keyStatus) {
    const ks = await opts.keyStatus();
    const have = ks.filter((k) => k.present).map((k) => k.provider);
    out.push({
      name: 'keys',
      level: 'ok',
      detail: have.length ? `configured: ${have.join(', ')}` : 'none (optional: the free path needs no keys)',
    });
  }
  return out;
}

export function formatChecks(cs: Check[]): string {
  const icon = { ok: '✓', warn: '!', fail: '✗' };
  return cs
    .map((c) => `${icon[c.level]} ${c.name.padEnd(14)} ${c.detail}${c.fix ? `\n  → ${c.fix}` : ''}`)
    .join('\n');
}
