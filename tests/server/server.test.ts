import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

process.env.BRIDGE_HOME = mkdtempSync(join(tmpdir(), 'bridge-server-'));
process.env.BRIDGE_KEYSTORE = 'file';
const { createApp } = await import('../../src/server/app.ts');
const { allowedHosts } = await import('../../src/server/security.ts');

const PORT = 7498;
const fakeRunner = async (
  job: { id: string },
  onProgress: (p: { stage: 'render'; progress: number; message: string }) => void,
) => {
  onProgress({ stage: 'render', progress: 0.5, message: 'half' });
  return {
    jobDir: '',
    video: '',
    timeline: {} as never,
    script: { beats: [1, 2, 3] } as never,
    analysis: {} as never,
    faith: { unsupported: 0, verdicts: [], actions: [] },
    durations: { target: 20, actual: 19.8, withinTolerance: true },
    timings: {},
    engines: { analyze: 'x', script: 'x', tts: 'x' },
    _id: job.id,
  };
};
const { app, queue } = createApp({ port: PORT, runner: fakeRunner as never });
const H = {
  host: `127.0.0.1:${PORT}`,
  origin: `http://127.0.0.1:${PORT}`,
  'content-type': 'application/json',
};
const req = (path: string, init: RequestInit = {}, headers: Record<string, string> = H) =>
  app.request(`http://127.0.0.1:${PORT}${path}`, { ...init, headers });

describe('localhost security', () => {
  it('allows only loopback host headers (DNS rebinding)', async () => {
    expect([...allowedHosts(PORT)]).toEqual([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
    expect((await req('/api/health')).status).toBe(200);
    expect((await req('/api/health', {}, { host: `localhost:${PORT}` })).status).toBe(200);
    expect((await req('/api/health', {}, { host: 'evil.com' })).status).toBe(403);
    expect((await req('/api/health', {}, { host: `attacker.com:${PORT}` })).status).toBe(403);
    expect((await req('/api/health', {}, { host: `0.0.0.0:${PORT}` })).status).toBe(403);
  });
  it('blocks cross-site and foreign-origin state changes (CSRF)', async () => {
    const body = JSON.stringify({ text: 'hello world this is text' });
    expect(
      (await req('/api/sources', { method: 'POST', body }, { ...H, origin: 'https://evil.com' })).status,
    ).toBe(403);
    expect(
      (
        await req(
          '/api/sources',
          { method: 'POST', body },
          { host: H.host, 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' },
        )
      ).status,
    ).toBe(403);
    expect((await req('/api/health', {}, { host: H.host, 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    // a same-site browser request without Origin is refused for writes; tools (no fetch metadata) are allowed
    expect(
      (
        await req(
          '/api/sources',
          { method: 'POST', body },
          { host: H.host, 'sec-fetch-site': 'same-site', 'content-type': 'application/json' },
        )
      ).status,
    ).toBe(403);
  });
  it('sends no CORS headers and sets a strict CSP', async () => {
    const r = await req('/api/health');
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
    expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('rejects bad ids and unknown files (no path traversal)', async () => {
    expect((await req('/api/jobs/..%2F..%2Fetc')).status).toBe(404);
    expect((await req('/api/jobs/j_abcdef123/files/..%2Fsecrets%2Fkeys.json')).status).toBe(404);
    expect((await req('/api/jobs/j_abcdef123/files/keys.json')).status).toBe(404);
    expect((await req('/api/sources/../../x')).status).toBe(404);
  });
  it('the server entrypoint binds 127.0.0.1 and refuses other hosts', async () => {
    const { HOST, start } = await import('../../src/server/main.ts');
    expect(HOST).toBe('127.0.0.1');
    process.env.BRIDGE_HOST = '0.0.0.0';
    expect(() => start(7497)).toThrow(/127\.0\.0\.1/);
    delete process.env.BRIDGE_HOST;
  });
});

describe('flow', () => {
  it('text → source → job → done, with progress and validation', async () => {
    const s = await (
      await req('/api/sources', {
        method: 'POST',
        body: JSON.stringify({
          text: '# Title\n\nThis is a test paragraph about something important. It has facts.',
        }),
      })
    ).json();
    expect(s.id).toMatch(/^s_/);
    expect(s.source.title).toBe('Title');
    const bad = await req('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ sourceId: s.id, settings: { seconds: 5 } }),
    });
    expect(bad.status).toBe(400);
    const j = await (
      await req('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ sourceId: s.id, settings: { seconds: 20 } }),
      })
    ).json();
    await queue.idle();
    const done = await (await req(`/api/jobs/${j.id}`)).json();
    expect(done.state).toBe('done');
    expect(done.result.beats).toBe(3);
    const list = await (await req('/api/jobs')).json();
    expect(list.some((x: { id: string }) => x.id === j.id)).toBe(true);
    expect((await req(`/api/jobs/${j.id}`, { method: 'DELETE' })).status).toBe(200);
  });
  it('empty input is a friendly 400', async () => {
    const r = await req('/api/sources', { method: 'POST', body: JSON.stringify({ text: '' }) });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/nothing to explain/);
  });
  it('budget endpoint', async () => {
    const b = await (await req('/api/budget?seconds=60')).json();
    expect(b.words).toBeGreaterThan(100);
    expect((await req('/api/budget?seconds=2')).status).toBe(400);
  });
  it('one render at a time', async () => {
    const s = await (
      await req('/api/sources', {
        method: 'POST',
        body: JSON.stringify({ text: 'Some text that is long enough to explain here.' }),
      })
    ).json();
    const a = await (
      await req('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ sourceId: s.id, settings: { seconds: 20 } }),
      })
    ).json();
    const b = await (
      await req('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({ sourceId: s.id, settings: { seconds: 20 } }),
      })
    ).json();
    const states = [queue.get(a.id)!.state, queue.get(b.id)!.state];
    expect(states.filter((x) => x === 'running').length).toBeLessThanOrEqual(1);
    await queue.idle();
  });
});
