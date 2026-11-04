# ADR-0005: Keys stay on the machine; OpenRouter OAuth PKCE is "link your account"

**Status:** accepted · 2026-11-03

## Decision
- **Storage:** OS keychain via `@napi-rs/keyring` (macOS Keychain, Windows Credential Manager, Linux Secret Service), else `~/.bridge/secrets/keys.json` (dir 0700, file 0600, atomic writes). `BRIDGE_KEYSTORE=file` forces the file. Env vars (`ANTHROPIC_API_KEY`, …) win, for CI.
- **Never leaves except to its provider:** `providerFetch` pins each provider to its HTTPS host, adds the auth header itself, refuses redirects, and redacts errors. Keys are never in URLs, request bodies, logs, job files or API responses (masked `sk-ant…cdef` only).
- **Redaction:** every key the store hands out is registered with `redact()`; known key shapes are scrubbed even if unregistered. Job records and logs pass through it.
- **"Link your account":** OpenRouter's OAuth PKCE (S256). `GET /api/oauth/openrouter/start` → `openrouter.ai/auth?callback_url=http://localhost:7411/oauth/openrouter/callback?state=…` → code → `POST /api/v1/auth/keys` with the verifier → a user-controlled key, stored like any other. Verifiers live in memory for 10 minutes keyed by an unguessable state.
- **Other OAuth:** Hugging Face has real PKCE but needs a registered client id (blocked on the owner; idea I-051). Google needs a verified GCP OAuth client (not practical). OpenAI, ElevenLabs: no third-party OAuth. Anthropic forbids third-party use of subscription login.

## Tests
`tests/keys/`: 0600 file, masking, env precedence, shape validation, redaction, host pinning for all four providers, no redirects, a failing job that never writes the key anywhere under BRIDGE_HOME.
