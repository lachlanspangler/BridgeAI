/**
 * The only way a provider key leaves this process: `providerFetch` pins each provider to its own HTTPS host,
 * attaches the key header itself, retries 429/5xx with backoff, times out, and redacts every error message.
 */
import type { ProviderId } from '../keys/keystore.ts';
import { redact } from '../keys/redact.ts';
import { LlmError } from './types.ts';

export const HOSTS: Record<ProviderId, string[]> = {
  anthropic: ['api.anthropic.com'],
  openai: ['api.openai.com'],
  gemini: ['generativelanguage.googleapis.com'],
  openrouter: ['openrouter.ai'],
  elevenlabs: ['api.elevenlabs.io'],
};

export function authHeaders(p: ProviderId, key: string): Record<string, string> {
  switch (p) {
    case 'anthropic':
      return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    case 'gemini':
      return { 'x-goog-api-key': key };
    case 'elevenlabs':
      return { 'xi-api-key': key };
    default:
      return { authorization: `Bearer ${key}` };
  }
}

export function assertHost(p: ProviderId, url: string): void {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !HOSTS[p].includes(u.hostname))
    throw new LlmError(`refusing to send a ${p} key to ${u.protocol}//${u.hostname}`, p);
}

/** Test seam: replace the network. */
export let fetchImpl: typeof fetch = (...a) => fetch(...a);
export const setFetch = (f: typeof fetch): void => {
  fetchImpl = f;
};

export async function providerFetch(
  p: ProviderId,
  key: string,
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  assertHost(p, url);
  const retries = init.retries ?? 2;
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), init.timeoutMs ?? 120_000);
    const onAbort = () => ac.abort();
    init.signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetchImpl(url, {
        ...init,
        signal: ac.signal,
        redirect: 'error',
        headers: { ...(init.headers as Record<string, string>), ...(key ? authHeaders(p, key) : {}) },
      });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
        continue;
      }
      if (!res.ok) {
        const body = redact((await res.text()).slice(0, 400));
        throw new LlmError(`${p} HTTP ${res.status}: ${body}`, p, res.status === 429 || res.status >= 500);
      }
      return res;
    } catch (e) {
      last = e;
      if (init.signal?.aborted || e instanceof LlmError)
        throw e instanceof Error ? new LlmError(redact(e.message), p) : e;
      if (attempt >= retries) break;
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', onAbort);
    }
  }
  throw new LlmError(
    redact(`${p} request failed: ${last instanceof Error ? last.message : String(last)}`),
    p,
    true,
  );
}
