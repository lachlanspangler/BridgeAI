/**
 * Localhost hardening (ADR 0006): the server binds 127.0.0.1 only; every request must carry an allowlisted Host
 * header (defeats DNS rebinding); state-changing requests must come from our own origin (Origin or
 * Sec-Fetch-Site), and cross-site requests are refused outright (CSRF). No CORS headers are ever sent.
 */
import type { MiddlewareHandler } from 'hono';

export function allowedHosts(port: number): Set<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

export function guard(port: number): MiddlewareHandler {
  const hosts = allowedHosts(port);
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  return async (c, next) => {
    const host = c.req.header('host') ?? '';
    if (!hosts.has(host)) return c.text('Forbidden host', 403);
    const site = c.req.header('sec-fetch-site');
    if (site === 'cross-site') return c.text('Cross-site requests are not allowed', 403);
    const method = c.req.method;
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const origin = c.req.header('origin');
      if (origin ? !origins.has(origin) : site !== undefined && site !== 'same-origin' && site !== 'none') return c.text('Forbidden origin', 403);
    }
    if (method === 'OPTIONS') return c.body(null, 204);
    await next();
    c.header('x-content-type-options', 'nosniff');
    c.header('referrer-policy', 'no-referrer');
    c.header('x-frame-options', 'DENY');
    c.header('cross-origin-resource-policy', 'same-origin');
    c.header(
      'content-security-policy',
      "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
  };
}
