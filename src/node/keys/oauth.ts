/**
 * "Link your account": OpenRouter OAuth PKCE (S256). The browser goes to openrouter.ai/auth with our localhost
 * callback; OpenRouter redirects back with a one-time code; we exchange code + verifier for a user-controlled
 * API key and store it in the keystore. Verifiers live in memory for 10 minutes, keyed by an unguessable state.
 * Docs: https://openrouter.ai/docs/use-cases/oauth-pkce
 */
import { createHash, randomBytes } from 'node:crypto';
import { setKey } from './keystore.ts';
import { providerFetch } from '../llm/http.ts';

const pending = new Map<string, { verifier: string; at: number }>();
const TTL = 10 * 60_000;

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48));
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) };
}

export function startOpenRouter(port: number, now = Date.now()): { url: string; state: string } {
  for (const [k, v] of pending) if (now - v.at > TTL) pending.delete(k);
  // bounded: keep only the newest few sign-in attempts
  while (pending.size >= 20) pending.delete(pending.keys().next().value!);
  const { verifier, challenge } = pkcePair();
  const state = b64url(randomBytes(18));
  pending.set(state, { verifier, at: now });
  // OpenRouter documents localhost callbacks; the state rides in the callback URL so we can find the verifier
  const callback = `http://localhost:${port}/oauth/openrouter/callback?state=${state}`;
  const url = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(callback)}&code_challenge=${challenge}&code_challenge_method=S256`;
  return { url, state };
}

export async function finishOpenRouter(code: string, state: string, now = Date.now()): Promise<void> {
  const p = pending.get(state);
  pending.delete(state);
  if (!p || now - p.at > TTL) throw new Error('this sign-in link expired; start again from Settings');
  if (!/^[A-Za-z0-9_-]{8,512}$/.test(code)) throw new Error('invalid code');
  // the exchange itself needs no key: send an empty bearer to the pinned host
  const res = await providerFetch('openrouter', '', 'https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: p.verifier, code_challenge_method: 'S256' }),
    retries: 0,
  });
  const j = (await res.json()) as { key?: string };
  if (!j.key) throw new Error('OpenRouter did not return a key');
  await setKey('openrouter', j.key);
}

/** For tests. */
export const _pending = pending;
