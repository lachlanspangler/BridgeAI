# ADR-0006: Loopback only, Host allowlist, same-origin writes, no CORS

**Status:** accepted · 2026-11-03

## Threat model
One person runs Bridge on their own laptop. The server holds their provider keys (in the keychain) and can spend money on their behalf. Attackers: a web page in the same browser (CSRF, DNS rebinding), other machines on the network, malicious inputs (zip bombs, path traversal, SSRF via links).

## Decision
- **Bind `127.0.0.1` only.** `src/server/main.ts` hard-codes it and throws if `BRIDGE_HOST` is anything else. Vite dev also binds 127.0.0.1.
- **Host header allowlist** (`127.0.0.1:PORT`, `localhost:PORT`) on every request: defeats DNS rebinding.
- **Writes must be same-origin:** `Origin` must be ours, or (no Origin) `Sec-Fetch-Site` must be same-origin/none. Any `Sec-Fetch-Site: cross-site` request is refused, even GETs. No CORS headers, ever.
- **The one expected cross-site request** is OpenRouter's top-level redirect back to `GET /oauth/openrouter/callback` (`Sec-Fetch-Mode: navigate`); it is exempt from the cross-site rule and protected by the single-use state.
- **No session token.** A loopback-only, single-user app with host + origin checks doesn't need one, and minting our own secret would be inventing auth. If Bridge ever listens beyond loopback (the public website), it gets real auth first (see STATUS → public path).
- **Headers:** strict CSP (`default-src 'self'`, `frame-ancestors 'none'`), nosniff, no-referrer, DENY framing.
- **Inputs:** ids are regex-validated before any path use; only an allowlist of job files is served; uploads ≤ 80 MB; zips ≤ 200 MB unpacked and ≤ 20 000 entries; names are stripped of `..`; links must be public http(s) and must not resolve to private, loopback or link-local addresses (checked again after redirects).

## Accepted risk
Local non-browser clients (no Origin, no fetch metadata) are trusted. On a single-user laptop a same-user process can already read `~/.bridge` and the keychain prompts the user; `~/.bridge` is 0700 so other OS users can't read uploads or the key file. On shared multi-user machines another OS user could still call the API on 127.0.0.1; documented in STATUS. (Security review M4, 2026-11-03.)

## Verified
`lsof` shows `TCP 127.0.0.1:7411 (LISTEN)`. `tests/server/` covers forged hosts, cross-site writes, CORS absence, traversal and the bind guard.
