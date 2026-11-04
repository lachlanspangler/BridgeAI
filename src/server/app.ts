/**
 * Bridge's local HTTP API + the built web app. Created by `createApp` so tests can drive it without a socket.
 * Bound to 127.0.0.1 by src/server/main.ts. See ADR 0006 for the localhost threat model.
 */
import { Hono, type Context } from 'hono';
import { stream } from 'hono/streaming';
import { appendFileSync, createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { bodyLimit } from 'hono/body-limit';
import { Readable } from 'node:stream';
import { budgetFor, describeBudget, PRESETS } from '../core/budget.ts';
import { EngineSpec, RenderSettings, Source, type Analysis } from '../core/schema.ts';
import { runDoctor } from '../node/doctor.ts';
import { ingestInput, MAX_UPLOAD_BYTES, type InputFile } from '../node/ingest/index.ts';
import { JobQueue, jobDir, newId, sourceDir, ID_RE, type JobRecord } from '../node/jobs/queue.ts';
import { isProvider, keyStatus, removeKey, setKey, keystoreBackend } from '../node/keys/keystore.ts';
import { finishOpenRouter, startOpenRouter } from '../node/keys/oauth.ts';
import { redact } from '../node/keys/redact.ts';
import { providerFromKeys } from '../node/llm/providers.ts';
import { findLocalLlm } from '../node/models/catalog.ts';
import { runPipeline } from '../node/pipeline.ts';
import { pickEngines } from '../node/select.ts';
import { cloudTts } from '../node/tts/cloud.ts';
import { KokoroTts } from '../node/tts/kokoro.ts';
import { guard } from './security.ts';

export interface AppOptions {
  port: number;
  webDist?: string;
  /** Override the pipeline runner (tests). */
  runner?: ConstructorParameters<typeof JobQueue>[0];
}

const FILES: Record<string, string> = {
  'video.mp4': 'video/mp4',
  'captions.vtt': 'text/vtt; charset=utf-8',
  'captions.srt': 'application/x-subrip; charset=utf-8',
  'script.md': 'text/markdown; charset=utf-8',
  'script.json': 'application/json',
  'sourcemap.json': 'application/json',
  'analysis.json': 'application/json',
  'faith.json': 'application/json',
  'timeline.json': 'application/json',
  'source.json': 'application/json',
  'thumb.png': 'image/png',
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

function summary(src: Source) {
  return {
    title: src.title,
    kind: src.kind,
    origin: src.origin,
    words: src.stats.words,
    pages: src.stats.pages,
    files: src.stats.files,
    segments: src.segments.length,
    figures: src.assets.filter((a) => a.kind !== 'page').length,
    warnings: src.warnings,
  };
}

/** Cached analysis per engine; the engine id is hashed so it can never become a path. */
const analysisFile = (srcId: string, llm: string, seconds: number) =>
  join(
    sourceDir(srcId),
    // keyed by engine AND by how many ideas the length needs (a 20 s idea list is too short for 5 min)
    `analysis-${createHash('sha256')
      .update(`${llm}|${budgetFor(seconds).ideas.max}`)
      .digest('hex')
      .slice(0, 16)}.json`,
  );

function loadSource(id: string): Source | null {
  const f = join(sourceDir(id), 'source.json');
  return existsSync(f) ? Source.parse(JSON.parse(readFileSync(f, 'utf8'))) : null;
}

export function createApp(opts: AppOptions) {
  const app = new Hono();
  app.use('*', guard(opts.port));
  // body limits apply while streaming, not after buffering (chunked uploads have no content-length)
  const tooBig = (c: Context) =>
    c.json({ error: `upload too large (limit ${MAX_UPLOAD_BYTES / 1e6} MB)` }, 413);
  app.use('/api/sources', bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 1_000_000, onError: tooBig }));
  app.use('/api/*', async (c, next) =>
    c.req.path === '/api/sources' ? next() : bodyLimit({ maxSize: 256 * 1024, onError: tooBig })(c, next),
  );
  // never leak internals (or a key inside an error) to stderr or the client
  app.onError((e, c) => {
    console.error(redact(String((e as Error)?.stack ?? e)));
    return c.json({ error: 'internal error' }, 500);
  });

  const defaultRunner: ConstructorParameters<typeof JobQueue>[0] = async (job, onProgress, signal) => {
    const src = loadSource(job.sourceId);
    if (!src) throw new Error('source not found');
    const logFile = join(jobDir(job.id), 'log.txt');
    const log = (e: { stage: string; message: string; ms?: number }) =>
      appendFileSync(
        logFile,
        redact(`${new Date().toISOString()} ${e.stage}: ${e.message}${e.ms ? ` (${e.ms} ms)` : ''}\n`),
      );
    const { engines } = await pickEngines({
      llm: job.settings.llm,
      tts: job.settings.tts,
      providers: providerFromKeys,
      voices: cloudTts,
      log,
    });
    // reuse the reviewed idea list if the user looked at it (pins/drops apply on top)
    const cached = analysisFile(job.sourceId, job.settings.llm, job.settings.seconds);
    if (existsSync(cached)) {
      const a = JSON.parse(readFileSync(cached, 'utf8')) as Analysis;
      engines.analyze = async () => a;
    }
    // assets live with the source; the renderer reads them relative to the job dir via symlink-free copy paths
    const dir = jobDir(job.id);
    const withAssets = {
      ...src,
      assets: src.assets.map((a) => ({ ...a, path: resolve(sourceDir(job.sourceId), a.path) })),
    };
    return runPipeline(withAssets, job.settings, engines, dir, onProgress, signal);
  };
  const queue = new JobQueue(opts.runner ?? defaultRunner);

  // ───── status ─────
  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/status', async (c) => {
    const [checks, keys, backend] = await Promise.all([runDoctor({}), keyStatus(), keystoreBackend()]);
    const llm = findLocalLlm();
    return c.json({
      checks,
      keys,
      keystore: backend,
      local: { llm: llm?.id ?? null },
      voices: new KokoroTts().voices(),
      presets: Object.entries(PRESETS).map(([k, s]) => ({
        id: k,
        ...budgetFor(s),
        describe: describeBudget(budgetFor(s)),
      })),
    });
  });

  app.get('/api/budget', (c) => {
    const s = Number(c.req.query('seconds'));
    if (!Number.isFinite(s) || s < 10 || s > 900) return c.json({ error: 'seconds must be 10–900' }, 400);
    const b = budgetFor(s);
    return c.json({ ...b, describe: describeBudget(b) });
  });

  // ───── sources ─────
  app.post('/api/sources', async (c) => {
    const len = Number(c.req.header('content-length') ?? 0);
    if (len > MAX_UPLOAD_BYTES + 1_000_000)
      return c.json({ error: `upload too large (limit ${MAX_UPLOAD_BYTES / 1e6} MB)` }, 413);
    const id = newId('s');
    const dir = sourceDir(id);
    try {
      const ct = c.req.header('content-type') ?? '';
      let input: { text?: string; url?: string; title?: string; files?: InputFile[] };
      if (ct.startsWith('multipart/form-data')) {
        const form = await c.req.formData();
        const files: InputFile[] = [];
        for (const v of form.getAll('files')) {
          if (typeof v === 'string') continue;
          files.push({
            name: (v as File & { webkitRelativePath?: string }).name,
            data: new Uint8Array(await v.arrayBuffer()),
          });
        }
        const paths = form.getAll('paths').map(String);
        paths.forEach((p, i) => {
          if (files[i] && p) files[i]!.name = p;
        });
        input = {
          text: String(form.get('text') ?? ''),
          url: String(form.get('url') ?? ''),
          title: String(form.get('title') ?? '') || undefined,
          files,
        };
      } else {
        const j = (await c.req.json()) as { text?: string; url?: string; title?: string };
        input = { text: j.text, url: j.url, title: j.title };
      }
      const src = Source.parse(await ingestInput(input, dir, AbortSignal.timeout(120_000)));
      writeFileSync(join(dir, 'source.json'), JSON.stringify(src));
      return c.json({ id, source: summary(src) });
    } catch (e) {
      return c.json({ error: redact(e instanceof Error ? e.message : String(e)) }, 400);
    }
  });

  app.get('/api/sources/:id', (c) => {
    const id = c.req.param('id');
    if (!ID_RE.test(id)) return c.json({ error: 'bad id' }, 400);
    const src = loadSource(id);
    return src
      ? c.json({ id, source: summary(src), segments: src.segments })
      : c.json({ error: 'not found' }, 404);
  });

  /** The ideas-review step: rank the key ideas (cached per engine) so the user can pin/drop before rendering. */
  app.post('/api/sources/:id/ideas', async (c) => {
    const id = c.req.param('id');
    if (!ID_RE.test(id)) return c.json({ error: 'bad id' }, 400);
    const src = loadSource(id);
    if (!src) return c.json({ error: 'not found' }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { seconds?: number; llm?: string };
    const spec = EngineSpec.safeParse(body.llm ?? 'auto');
    if (!spec.success) return c.json({ error: 'bad engine id' }, 400);
    const llm = spec.data;
    const seconds = Math.max(10, Math.min(900, Number(body.seconds) || 60));
    const cached = analysisFile(id, llm, seconds);
    if (existsSync(cached)) return c.json(JSON.parse(readFileSync(cached, 'utf8')));
    try {
      const { engines } = await pickEngines({ llm, tts: 'system', providers: providerFromKeys });
      const a = await engines.analyze!(src, budgetFor(seconds));
      writeFileSync(cached, JSON.stringify(a));
      return c.json(a);
    } catch (e) {
      return c.json({ error: redact(e instanceof Error ? e.message : String(e)) }, 400);
    }
  });

  app.get('/api/sources/:id/assets/:asset', (c) => {
    const id = c.req.param('id');
    const asset = c.req.param('asset');
    if (!ID_RE.test(id) || !/^a\d+$/.test(asset)) return c.json({ error: 'bad id' }, 400);
    const src = loadSource(id);
    const a = src?.assets.find((x) => x.id === asset);
    if (!a) return c.json({ error: 'not found' }, 404);
    const file = resolve(sourceDir(id), a.path);
    if (!file.startsWith(sourceDir(id) + sep)) return c.json({ error: 'bad path' }, 400);
    return new Response(readFileSync(file), {
      headers: { 'content-type': a.path.endsWith('.jpg') ? 'image/jpeg' : 'image/png' },
    });
  });

  // ───── jobs ─────
  app.post('/api/jobs', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { sourceId?: string; settings?: unknown } | null;
    if (!body?.sourceId || !ID_RE.test(body.sourceId)) return c.json({ error: 'sourceId required' }, 400);
    const src = loadSource(body.sourceId);
    if (!src) return c.json({ error: 'source not found' }, 404);
    const parsed = RenderSettings.safeParse(body.settings ?? {});
    if (!parsed.success)
      return c.json(
        {
          error: `bad settings: ${parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`,
        },
        400,
      );
    const job = queue.enqueue({
      sourceId: body.sourceId,
      title: src.title,
      kind: src.kind,
      settings: parsed.data,
    });
    return c.json(job, 201);
  });

  app.get('/api/jobs', (c) => c.json(queue.list()));

  app.get('/api/jobs/:id', (c) => {
    const id = c.req.param('id');
    const j = ID_RE.test(id) ? queue.get(id) : undefined;
    return j ? c.json(j) : c.json({ error: 'not found' }, 404);
  });

  app.get('/api/jobs/:id/events', (c) => {
    const id = c.req.param('id');
    const j = ID_RE.test(id) ? queue.get(id) : undefined;
    if (!j) return c.json({ error: 'not found' }, 404);
    c.header('content-type', 'text/event-stream');
    c.header('cache-control', 'no-cache');
    return stream(c, async (s) => {
      let done = false;
      const send = (x: JobRecord) => void s.write(`data: ${JSON.stringify(x)}\n\n`);
      send(j);
      if (['done', 'failed', 'cancelled'].includes(j.state)) return;
      await new Promise<void>((resolveP) => {
        const off = queue.subscribe(id, (x) => {
          send(x);
          if (!done && ['done', 'failed', 'cancelled'].includes(x.state)) {
            done = true;
            off();
            resolveP();
          }
        });
        s.onAbort(() => {
          off();
          resolveP();
        });
      });
    });
  });

  app.post('/api/jobs/:id/cancel', (c) => {
    const id = c.req.param('id');
    return ID_RE.test(id) && queue.cancel(id) ? c.json({ ok: true }) : c.json({ error: 'not found' }, 404);
  });

  app.delete('/api/jobs/:id', (c) => {
    const id = c.req.param('id');
    return ID_RE.test(id) && queue.remove(id)
      ? c.json({ ok: true })
      : c.json({ error: 'cannot delete' }, 400);
  });

  app.get('/api/jobs/:id/files/:name', (c) => {
    const id = c.req.param('id');
    const name = c.req.param('name');
    if (!ID_RE.test(id) || !FILES[name]) return c.json({ error: 'not found' }, 404);
    const file = join(jobDir(id), name);
    if (!existsSync(file)) return c.json({ error: 'not found' }, 404);
    const size = statSync(file).size;
    const headers: Record<string, string> = { 'content-type': FILES[name]!, 'accept-ranges': 'bytes' };
    if (c.req.query('download'))
      headers['content-disposition'] = `attachment; filename="bridge-${id}-${name}"`;
    const range = c.req.header('range')?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && name === 'video.mp4') {
      let start: number;
      let end: number;
      if (!range[1]) {
        const n = Number(range[2]);
        if (!n) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
        start = Math.max(0, size - n);
        end = size - 1;
      } else {
        start = Number(range[1]);
        end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      }
      if (start >= size || start > end)
        return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
      return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, {
        status: 206,
        headers: {
          ...headers,
          'content-range': `bytes ${start}-${end}/${size}`,
          'content-length': String(end - start + 1),
        },
      });
    }
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: { ...headers, 'content-length': String(size) },
    });
  });

  // ───── keys (masked only, never returned) ─────
  app.get('/api/keys', async (c) => c.json({ keys: await keyStatus(), backend: await keystoreBackend() }));

  app.put('/api/keys/:provider', async (c) => {
    const p = c.req.param('provider');
    if (!isProvider(p)) return c.json({ error: 'unknown provider' }, 400);
    const body = (await c.req.json().catch(() => ({}))) as { key?: unknown };
    if (typeof body.key !== 'string') return c.json({ error: 'key required' }, 400);
    try {
      await setKey(p, body.key);
      return c.json({ ok: true, keys: await keyStatus() });
    } catch (e) {
      return c.json({ error: redact(e instanceof Error ? e.message : String(e)) }, 400);
    }
  });

  app.delete('/api/keys/:provider', async (c) => {
    const p = c.req.param('provider');
    if (!isProvider(p)) return c.json({ error: 'unknown provider' }, 400);
    await removeKey(p);
    return c.json({ ok: true, keys: await keyStatus() });
  });

  app.post('/api/keys/:provider/test', async (c) => {
    const p = c.req.param('provider');
    if (!isProvider(p) || p === 'elevenlabs') return c.json({ error: 'unknown provider' }, 400);
    try {
      const llm = await providerFromKeys(p);
      if (!llm) return c.json({ ok: false, error: 'no key' });
      const r = await llm.json<{ ok: string }>({
        system: 'Answer in JSON.',
        user: 'Reply with ok = "yes".',
        schema: {
          type: 'object',
          properties: { ok: { type: 'string' } },
          required: ['ok'],
          additionalProperties: false,
        },
        name: 'ping',
        maxTokens: 50,
      });
      return c.json({ ok: r.ok === 'yes' || !!r.ok, model: llm.model });
    } catch (e) {
      return c.json({ ok: false, error: redact(e instanceof Error ? e.message : String(e)) });
    }
  });

  // ───── OpenRouter "link your account" (PKCE) ─────
  app.post('/api/oauth/openrouter/start', (c) => c.json(startOpenRouter(opts.port)));

  app.get('/oauth/openrouter/callback', async (c) => {
    const code = c.req.query('code') ?? '';
    const state = c.req.query('state') ?? '';
    let msg = 'Linked! Your OpenRouter key is stored on this computer only.';
    let ok = true;
    try {
      await finishOpenRouter(code, state);
    } catch (e) {
      ok = false;
      msg = redact(e instanceof Error ? e.message : String(e));
    }
    const esc = msg.replace(
      /[&<>"]/g,
      (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!,
    );
    return c.html(
      `<!doctype html><meta charset="utf-8"><title>Bridge</title><body style="font-family:system-ui;background:#0B0D21;color:#F7F5FF;display:grid;place-items:center;height:100vh"><div><h1>${ok ? '✓' : '✗'} OpenRouter</h1><p>${esc}</p><p><a style="color:#FFC93C" href="/#/settings">Back to Bridge</a></p></div>`,
    );
  });

  // ───── the web app ─────
  const dist = opts.webDist;
  app.get('*', (c) => {
    if (!dist || !existsSync(dist))
      return c.text('Web app not built: run `make web` (or use `make dev`).', 404);
    let rel: string;
    try {
      rel = decodeURIComponent(new URL(c.req.url).pathname).replace(/^\/+/, '');
    } catch {
      return c.text('bad path', 400);
    }
    const root = resolve(dist) + sep;
    let file = resolve(dist, rel || 'index.html');
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory())
      file = join(dist, 'index.html');
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    return new Response(readFileSync(file), {
      headers: {
        'content-type': type,
        'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
      },
    });
  });

  return { app, queue };
}
