/**
 * Keys never leak: not to logs, job files, API responses, error messages, or any host but their provider's.
 */
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HOME = mkdtempSync(join(tmpdir(), 'bridge-keys-'));
process.env.BRIDGE_HOME = HOME;
process.env.BRIDGE_KEYSTORE = 'file';
for (const k of [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'ELEVENLABS_API_KEY',
])
  delete process.env[k];

const { getKey, keyStatus, removeKey, resetKeystore, setKey, validateKeyShape } =
  await import('../../src/node/keys/keystore.ts');
const { mask, redact, redactDeep } = await import('../../src/node/keys/redact.ts');
const { assertHost, providerFetch, setFetch } = await import('../../src/node/llm/http.ts');
const { AnthropicLlm, OpenAiCompatibleLlm, GeminiLlm } = await import('../../src/node/llm/providers.ts');
const { createApp } = await import('../../src/server/app.ts');

const SECRET = 'sk-ant-api03-THISISATESTKEYdonotuse0123456789abcdef';
const OR = 'sk-or-v1-0123456789abcdef0123456789abcdef0123456789';

function allFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? allFiles(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe('keystore', () => {
  beforeAll(() => resetKeystore());
  it('stores, masks, reads and removes a key; the file is owner-only', async () => {
    await setKey('anthropic', SECRET);
    expect(await getKey('anthropic')).toBe(SECRET);
    const st = (await keyStatus()).find((k) => k.provider === 'anthropic')!;
    expect(st.present).toBe(true);
    expect(st.masked).not.toContain(SECRET.slice(10, 30));
    expect(st.source).toBe('file');
    const f = join(HOME, 'secrets', 'keys.json');
    if (process.platform !== 'win32') {
      expect(statSync(f).mode & 0o777).toBe(0o600);
      expect(statSync(join(HOME, 'secrets')).mode & 0o777).toBe(0o700);
    }
    await removeKey('anthropic');
    expect(await getKey('anthropic')).toBeNull();
  });
  it('rejects malformed keys', () => {
    expect(validateKeyShape('anthropic', 'hello')).toBeTruthy();
    expect(validateKeyShape('openai', 'sk-abc def ghi jkl mno pqr stu')).toBeTruthy();
    expect(validateKeyShape('openrouter', OR)).toBeNull();
  });
  it('env vars win over the store', async () => {
    process.env.OPENAI_API_KEY = 'sk-proj-envkey0123456789abcdefghij';
    expect(await getKey('openai')).toBe('sk-proj-envkey0123456789abcdefghij');
    delete process.env.OPENAI_API_KEY;
  });
});

describe('redaction', () => {
  it('redacts registered secrets and known key shapes anywhere', async () => {
    await setKey('anthropic', SECRET);
    await getKey('anthropic');
    expect(redact(`oops ${SECRET} happened`)).not.toContain(SECRET);
    expect(redact('Authorization: Bearer sk-proj-abcdefghijklmnop0123456789')).not.toContain(
      'abcdefghijklmnop',
    );
    expect(redact('x-api-key=sk-ant-zzzzzzzzzzzzzzzzzzzz')).not.toContain('zzzzzzzz');
    expect(redact('key AIzaSyA0123456789abcdefghijklmnopq')).not.toContain('AIzaSy');
    expect(JSON.stringify(redactDeep({ nested: { k: SECRET } }))).not.toContain(SECRET);
    expect(mask(SECRET)).toMatch(/^sk-.*…cdef$/);
  });
});

describe('host pinning', () => {
  it('refuses to send a key to any host but its provider over https', () => {
    expect(() => assertHost('anthropic', 'https://api.anthropic.com/v1/messages')).not.toThrow();
    expect(() => assertHost('anthropic', 'https://evil.example.com/v1/messages')).toThrow();
    expect(() => assertHost('openai', 'http://api.openai.com/v1/chat/completions')).toThrow();
    expect(() => assertHost('openrouter', 'https://api.openai.com/v1/x')).toThrow();
  });
  it('providers put the key only in the auth header, and errors are redacted', async () => {
    const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
    setFetch((async (url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
      // echo the key back in an error body to prove redaction
      return new Response(`bad key ${SECRET}`, { status: 401 });
    }) as unknown as typeof fetch);
    const llm = new AnthropicLlm(SECRET);
    const err = await llm
      .json({
        system: 's',
        user: 'u',
        schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
        name: 'x',
      })
      .catch((e: Error) => e);
    expect(String((err as Error).message)).not.toContain(SECRET);
    expect(seen[0]!.url.startsWith('https://api.anthropic.com/')).toBe(true);
    expect(seen[0]!.headers['x-api-key']).toBe(SECRET);
    expect(seen[0]!.body).not.toContain(SECRET);
    for (const p of [
      new OpenAiCompatibleLlm('openai', 'sk-proj-abcdefghijklmnopqrstuv', 'm'),
      new OpenAiCompatibleLlm('openrouter', OR, 'm'),
      new GeminiLlm('AIzaSyA0123456789abcdefghijklmnopq'),
    ]) {
      await p
        .json({
          system: 's',
          user: 'u',
          schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
          name: 'x',
        })
        .catch(() => {});
    }
    expect(seen.map((s) => new URL(s.url).hostname)).toEqual([
      'api.anthropic.com',
      'api.openai.com',
      'openrouter.ai',
      'generativelanguage.googleapis.com',
    ]);
    for (const s of seen) expect(s.url).not.toMatch(/key=|sk-/); // never in the URL
  });
  it('providerFetch never follows redirects (a redirect could carry the header elsewhere)', async () => {
    let redirect: RequestRedirect | undefined;
    setFetch((async (_u: string, init: RequestInit) => {
      redirect = init.redirect;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch);
    await providerFetch('openai', 'sk-proj-abcdefghijklmnopqrstuv', 'https://api.openai.com/v1/models');
    expect(redirect).toBe('error');
  });
});

describe('API never returns or logs keys', () => {
  const PORT = 7499;
  const { app } = createApp({
    port: PORT,
    runner: async () => {
      throw new Error(`boom ${SECRET}`);
    },
  });
  const req = (path: string, init: RequestInit = {}) =>
    app.request(`http://127.0.0.1:${PORT}${path}`, {
      ...init,
      headers: {
        host: `127.0.0.1:${PORT}`,
        origin: `http://127.0.0.1:${PORT}`,
        'content-type': 'application/json',
        ...(init.headers as Record<string, string>),
      },
    });
  afterAll(() => setFetch(fetch));
  it('PUT stores, GET masks, nothing echoes the key', async () => {
    const put = await req('/api/keys/openrouter', { method: 'PUT', body: JSON.stringify({ key: OR }) });
    const putText = await put.text();
    expect(put.status).toBe(200);
    expect(putText).not.toContain(OR);
    const get = await (await req('/api/keys')).text();
    expect(get).not.toContain(OR);
    expect(get).toContain('…');
    const status = await (await req('/api/status')).text();
    expect(status).not.toContain(OR);
  });
  it('a failing job never writes the key into job files', async () => {
    const src = await (
      await req('/api/sources', {
        method: 'POST',
        body: JSON.stringify({ text: 'A short note about attention in neural networks. It is useful.' }),
      })
    ).json();
    const job = await (
      await req('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ sourceId: src.id, settings: { seconds: 20 } }),
      })
    ).json();
    for (let i = 0; i < 50; i++) {
      const j = await (await req(`/api/jobs/${job.id}`)).json();
      if (j.state === 'failed') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const j = await (await req(`/api/jobs/${job.id}`)).text();
    expect(j).toContain('failed');
    expect(j).not.toContain(SECRET);
    for (const f of allFiles(HOME)) {
      if (f.includes(`${join('secrets', 'keys.json')}`)) continue;
      const t = readFileSync(f, 'latin1');
      expect(t.includes(SECRET), f).toBe(false);
      expect(t.includes(OR), f).toBe(false);
    }
  });
});
