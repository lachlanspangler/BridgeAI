# ADR-0001: One TypeScript codebase, Node 20.19+, public npm only

**Status:** accepted · 2026-11-03

## Decision
- **TypeScript everywhere**, one package: a pure core (`src/core`, runs in Node *and* the browser), Node adapters (`src/node`), a Hono server (`src/server`), a Vite + React app (`web/`).
- **Node ≥ 20.19**, because this laptop has 20.20 and the sibling projects pin the same. That forces Vite 7, Vitest 3, pdfjs-dist 4 and TypeScript 5.9.
- **Public npm only.** `.npmrc` pins `registry.npmjs.org` (this machine's default registry is Amazon-internal). No Python for users.
- **One command:** `make setup` = `npm install` + Playwright Chromium + model pull (disk-checked) + doctor.

## Why
- Users install Bridge with npm on any Mac, Windows or Linux machine. Every native piece we use (`@napi-rs/canvas`, `node-llama-cpp`, `onnxruntime-node`, `@napi-rs/keyring`) ships prebuilt binaries for all three.
- A pure core shared by the renderer and the web preview means one definition of every scene, budget and check.

## Consequences
- Heavy deps: ~600 MB of node_modules (onnxruntime 208 MB, transformers.js, llama.cpp binaries). Acceptable for a local app; documented in STATUS.
