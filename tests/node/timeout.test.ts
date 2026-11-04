import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

process.env.BRIDGE_HOME = mkdtempSync(join(tmpdir(), 'bridge-timeout-'));
const { withTimeout, TimeoutError } = await import('../../src/node/timeout.ts');
const { JobQueue } = await import('../../src/node/jobs/queue.ts');
const { RenderSettings } = await import('../../src/core/schema.ts');

const never = () => new Promise<never>(() => {}); // ignores its signal, like a stuck native decode

describe('timeouts: nothing can hang silently', () => {
  it('releases the caller and aborts the signal when work never settles', async () => {
    let aborted = false;
    const p = withTimeout(
      (signal) => {
        signal.addEventListener('abort', () => (aborted = true));
        return never();
      },
      50,
      'stuck call',
    );
    await expect(p).rejects.toBeInstanceOf(TimeoutError);
    await expect(p).rejects.toThrow(/stuck call timed out/);
    expect(aborted).toBe(true);
  });

  it('passes results and errors through untouched, and follows an outer abort', async () => {
    await expect(withTimeout(async () => 42, 1000, 'x')).resolves.toBe(42);
    await expect(withTimeout(async () => Promise.reject(new Error('boom')), 1000, 'x')).rejects.toThrow(
      'boom',
    );
    const outer = new AbortController();
    let seen = false;
    const p = withTimeout(
      (s) =>
        new Promise((_, rej) =>
          s.addEventListener('abort', () => {
            seen = true;
            rej(new Error('cancelled'));
          }),
        ),
      5000,
      'x',
      outer.signal,
    );
    outer.abort();
    await expect(p).rejects.toThrow('cancelled');
    expect(seen).toBe(true);
  });

  it('a job whose runner never settles fails with a timeout, and the next job still runs', async () => {
    let calls = 0;
    const q = new JobQueue(async () => {
      calls++;
      if (calls === 1) return never();
      throw new Error('second job ran');
    }, 80);
    const base = {
      sourceId: 's',
      title: 't',
      kind: 'text' as const,
      settings: RenderSettings.parse({ seconds: 20 }),
    };
    const a = q.enqueue(base);
    const b = q.enqueue(base);
    await q.idle();
    expect(q.get(a.id)!.state).toBe('failed');
    expect(q.get(a.id)!.error).toMatch(/timed out/);
    expect(q.get(b.id)!.error).toMatch(/second job ran/);
  });
});
