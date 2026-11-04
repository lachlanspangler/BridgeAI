/**
 * Regression tests for the 2026-11-03 security review (docs/reviews/2026-11-03-security.md). Written by the
 * reviewer as proofs of the vulnerable behaviour, then flipped to assert the fixes.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const HOME = mkdtempSync(join(tmpdir(), 'bridge-sec-'));
process.env.BRIDGE_HOME = HOME;
process.env.BRIDGE_KEYSTORE = 'file';
process.env.BRIDGE_OCR = 'off';
for (const k of [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'ELEVENLABS_API_KEY',
])
  delete process.env[k];

// a sibling of web/dist whose name starts with "dist" (e.g. dist-old, dist.bak)
const WEB = mkdtempSync(join(tmpdir(), 'bridge-web-'));
mkdirSync(join(WEB, 'dist'));
writeFileSync(join(WEB, 'dist', 'index.html'), '<!doctype html>INDEX');
mkdirSync(join(WEB, 'dist-private'));
writeFileSync(join(WEB, 'dist-private', 'secret.json'), '{"leak":true}');

const { createApp } = await import('../../src/server/app.ts');
const { setKey, resetKeystore } = await import('../../src/node/keys/keystore.ts');
const { redactDeep, redact } = await import('../../src/node/keys/redact.ts');
const { isPrivateAddress, assertPublicUrl } = await import('../../src/node/ingest/url.ts');

const PORT = 7497;
const { app } = createApp({ port: PORT, webDist: join(WEB, 'dist'), runner: (async () => ({})) as never });
const H = {
  host: `127.0.0.1:${PORT}`,
  origin: `http://127.0.0.1:${PORT}`,
  'content-type': 'application/json',
};
const req = (path: string, init: RequestInit = {}, headers: Record<string, string> = H) =>
  app.request(`http://127.0.0.1:${PORT}${path}`, { ...init, headers });
const fake = (a: string, b: string) => [a, b].join('');
const SECRET = fake('sk-ant-', 'api03-THISISATESTKEYdonotuse0123456789abcdef');

describe('F1: engine ids can never become paths', () => {
  it('rejects a traversal engine id and never returns the key file', async () => {
    resetKeystore();
    await setKey('anthropic', SECRET);
    const s = await req('/api/sources', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello world. This is a short text about cats and dogs.' }),
    });
    const { id } = (await s.json()) as { id: string };
    const r = await req(`/api/sources/${id}/ideas`, {
      method: 'POST',
      body: JSON.stringify({ llm: '/../../../secrets/keys' }),
    });
    const body = await r.text();
    expect(r.status).toBe(400);
    expect(body).not.toContain(SECRET);
    const j = await req('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ sourceId: id, settings: { seconds: 20, llm: '/../../../secrets/keys' } }),
    });
    expect(j.status).toBe(400);
  });
});

describe('F2: SSRF guard bypasses (no DNS needed: IP literals)', () => {
  it('IPv4-mapped IPv6 (dotted or hex), all of fe80::/10, NAT64 and CGNAT are refused', async () => {
    expect(new URL('http://[::ffff:127.0.0.1]/').hostname).toBe('[::ffff:7f00:1]');
    await expect(assertPublicUrl('http://[::ffff:127.0.0.1]:7411/api/health')).rejects.toThrow(/private/);
    await expect(assertPublicUrl('http://[::ffff:169.254.169.254]/latest/meta-data/')).rejects.toThrow(
      /private/,
    );
    await expect(assertPublicUrl('http://[::ffff:192.168.1.1]/')).rejects.toThrow(/private/);
    for (const ip of [
      '::ffff:172.16.0.1',
      '::ffff:169.254.169.254',
      'febf::1',
      '64:ff9b::7f00:1',
      '100.64.1.1',
      '198.18.0.1',
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '2606:4700:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it('decimal / octal / hex IPv4 forms are normalised by WHATWG URL and ARE caught (solid)', async () => {
    for (const u of [
      'http://2130706433/',
      'http://0177.0.0.1/',
      'http://0x7f.1/',
      'http://127.1/',
      'http://[::1]/',
      'http://0/',
    ])
      await expect(assertPublicUrl(u)).rejects.toThrow(/private/);
  });
});

describe('F3: the OAuth callback works as a cross-site top-level navigation (and nothing else does)', () => {
  it('a top-level redirect back from openrouter.ai reaches the callback; a bad state is refused there', async () => {
    const r = await req(
      '/oauth/openrouter/callback?code=abcdefgh&state=x',
      {},
      {
        host: `localhost:${PORT}`,
        'sec-fetch-site': 'cross-site',
        'sec-fetch-mode': 'navigate',
      },
    );
    expect(r.status).toBe(200);
    expect(await r.text()).toMatch(/expired/);
    const fetchMode = await req(
      '/oauth/openrouter/callback?code=abcdefgh&state=x',
      {},
      { host: H.host, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors' },
    );
    expect(fetchMode.status).toBe(403);
    const start = await req('/api/oauth/openrouter/start', {}, { host: H.host });
    expect(await start.text()).not.toContain('openrouter.ai/auth'); // start is POST-only now (GET falls through to the app)
  });
});

describe('F4: the static handler stays inside web/dist', () => {
  it('an encoded ../ to a sibling folder falls back to index.html; bad encodings are a 400', async () => {
    const r = await req('/..%2fdist-private%2fsecret.json', {}, { host: H.host });
    expect(await r.text()).not.toContain('leak');
    expect((await req('/%E0%A4%A', {}, { host: H.host })).status).toBe(400);
  });
});

describe('F5 (accepted, ADR 0006): non-browser local clients without fetch metadata are allowed', () => {
  it('a local tool (no Origin, no Sec-Fetch-*) can PUT a key, as designed for a loopback single-user app', async () => {
    const r = await req(
      '/api/keys/openai',
      {
        method: 'PUT',
        body: JSON.stringify({ key: fake('sk-', 'proj-AAAAAAAAAAAAAAAAAAAAAAAA') }),
      },
      { host: H.host, 'content-type': 'application/json' },
    );
    expect(r.status).toBe(200);
  });
});

describe('F6: redactDeep always produces valid JSON', () => {
  it('a title containing x-api-key=a"b round-trips (redacted)', () => {
    const out = redactDeep({ title: 'x-api-key=a"b' });
    expect(out.title).toContain('[redacted]');
  });
  it('POST /api/jobs with such a source title is accepted', async () => {
    const s = await req('/api/sources', {
      method: 'POST',
      body: JSON.stringify({ text: 'Some text about things here.', title: 'x-api-key=a"b' }),
    });
    const { id } = (await s.json()) as { id: string };
    const r = await req('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ sourceId: id, settings: { seconds: 30 } }),
    });
    expect(r.status).toBe(201);
  });
});

describe('F7: Range suffix requests', () => {
  it('bytes=-10 returns the last 10 bytes', async () => {
    const id = 'j_test000001';
    mkdirSync(join(HOME, 'jobs', id), { recursive: true });
    writeFileSync(join(HOME, 'jobs', id, 'video.mp4'), Buffer.alloc(1000, 1));
    const r = await req(`/api/jobs/${id}/files/video.mp4`, {}, { host: H.host, range: 'bytes=-10' });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 990-999/1000');
  });
});

describe('F8: upload limits apply while streaming', () => {
  it('a streamed 81 MB body with no content-length is cut off with a 413', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const boundary = 'xBOUNDx';
    const head = new TextEncoder().encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\n`,
    );
    const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(head);
      },
      pull(c) {
        if (sent >= 81) {
          c.enqueue(tail);
          c.close();
          return;
        }
        sent++;
        c.enqueue(chunk);
      },
    });
    const r = await app.request(`http://127.0.0.1:${PORT}/api/sources`, {
      method: 'POST',
      body,
      duplex: 'half',
      headers: { host: H.host, 'content-type': `multipart/form-data; boundary=${boundary}` },
    } as RequestInit);
    expect(r.status).toBe(413);
  });
});

describe('L7: redaction patterns', () => {
  it('catches ElevenLabs keys and JSON-style auth headers, and leaves ordinary words alone', () => {
    expect(redact(`key ${fake('sk_', 'a'.repeat(40))}`)).not.toContain('aaaaaaaa');
    expect(redact('{"authorization":"Bearer abcdefghijklmnop1234"}')).not.toContain('abcdefghijklmnop');
    expect(redact('a risk-assessment-framework-document')).toBe('a risk-assessment-framework-document');
  });
});
