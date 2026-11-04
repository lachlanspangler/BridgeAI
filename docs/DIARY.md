# Bridge diary

Append-only, chronological: the newest entry is at the bottom. Format in `docs/WORKFLOW.md`.

## 2026-11-03 19:40: Day 0, bootstrap and spikes
**Did:** Read GameCred, GetOffTheCouch, LachedInAI, Lagooner Beach (Game) and MasterDoc for shape and reusable
parts. `git init` (no remote). Pinned the public npm registry in `.npmrc`. Launched two research agents
(explainer craft + landscape; video/voice/models stack). Spiked the three riskiest pieces.

**Decided (and why):**
- **Repo-local git identity** `Lachlan Spangler <lachlanspangler@users.noreply.github.com>`: the global
  identity is an amazon.com address and the brief says nothing in this project is linked to Amazon. Change it
  with `git config user.email …` if you want a different address.
- **`.npmrc` pins registry.npmjs.org**: this machine's default npm registry is Amazon-internal
  (`npmpm.corp.amazon.com`). Public npm only.
- **Node 20 constraints:** pdfjs-dist 4.10 (5+ needs Node 22), Vitest 3 (5 needs Node 22), Vite 7,
  TypeScript 5.9 (same pins as the sibling projects).
- **Ports** 7411 (server), 7412 (web dev), 7413 (e2e). Other projects own 5173/5317/5517/5617/8081/8091.

**Verified (spikes, `scripts/spike/`):**
- **Renderer:** `@napi-rs/canvas` drawing 1080p frames (gradients, woff2 fonts from @fontsource) piped as raw
  RGBA into `ffmpeg -c:v libx264 -preset veryfast`: **56 fps** on this M4 Pro. A 20 s video = 600 frames ≈ 11 s.
  woff2 fonts load fine (no TTF conversion needed). Looked at the still: crisp text, smooth gradient.
- **Local LLM:** `node-llama-cpp` 3.22 in-process with the Qwen3.5-4B Q4_K_M GGUF already on this laptop
  (LachedInAI's models folder, 2.7 GB, so no download) and a JSON-schema grammar: valid JSON every time,
  ~25 tok/s while other sessions load the machine. 60 MB of node_modules incl. the Metal binary.
- **Local TTS:** `kokoro-js` 1.2.1, fp32, `af_heart` / `am_michael`: **RTF 0.26** (7.2 s of audio in 1.9 s)
  after a 12 s load; 321 MB of weights in `~/.bridge/models/hf`. whisper base.en transcribed both voices
  verbatim. LachedInAI rejected Kokoro for *real-time* interviews (first-audio latency); Bridge renders offline,
  so throughput matters, and RTF 0.26 is plenty.
- **Disk:** 72 GB free right now (the brief says ~14 GB; I'm keeping the 8 GB model budget anyway).

**Next:** workflow docs, the zod contract, then the thin vertical slice (abstract → 20 s mp4, free path).
**Ideas:** I-001…I-077 seeded (incl. 9 rejected with reasons).
