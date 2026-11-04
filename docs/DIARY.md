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

## 2026-11-03 21:30: Night 1, the whole pipeline exists
**Did:**
- **Core (pure):** zod contract, length budgets (from EXPLAINER_CRAFT rule 1–5), text utils, extractive floor (TextRank + structure priors + clause-aware trimming), faithfulness checks + gate, timeline, captions (≤ 5 words, ≤ 32 chars), 12 scene types + 26 code-drawn icons, frame compositor (wipes, progress bar, burned captions with the spoken word lit, end card), music + SFX synth, BS.1770 loudness, mixer with sidechain ducking.
- **Node:** Kokoro + system + OpenAI/ElevenLabs voices; Qwen3.5-4B via node-llama-cpp with grammar-constrained JSON; Anthropic/OpenAI/OpenRouter/Gemini providers behind a host-pinned fetch; keystore (keychain → 0600 file) + redaction; OpenRouter PKCE; PDF ingestion with figure cropping; images (OCR); projects (folder/zip/GitHub); links (arXiv, PDFs, GitHub, articles, SSRF-guarded); job queue (one render at a time); doctor; model download with the disk guard.
- **App:** Hono on 127.0.0.1:7411 with Host/Origin guards; React app (create → ideas review → length → progress → watch with source map → library → settings).
- **Docs:** 6 research docs (2 agents), BUILD_AN_AI, FUTURE_INTERNAL, ADRs 0001–0008; eval set of 18 cases (agent) and the harness.

**Broke / fixed:**
- pdfjs `render()` hung silently: pdfjs bundles its own `@napi-rs/canvas` 0.1 and mixing it with our 1.x context never resolves. Fixed by rendering with pdfjs's own canvas factory.
- A 0 thought budget on Qwen3.5 swallowed the first `{` of every JSON answer → every model call fell back to extractive. Fixed with `QwenChatWrapper({ thoughts: 'discourage', variation: '3.5' })`.
- `easeOutBack(0)` returned −4e-15 → `arc()` threw on a negative radius → would have killed a render. Golden tests caught it; scenes are now also wrapped so one bad layer can't kill a video.
- "No sequences left" on the 3rd local call: a fresh `getSequence()` per call leaked. One sequence, cleared per call.
- The gate rejected good hooks because Title Case labels ("Only") looked like names; screen text now only checks acronyms/model names.

**Decided (and why):**
- Kokoro despite LachedInAI's rejection: that was about real-time latency; offline RTF 0.26 is what matters here.
- −14 LUFS, deep music duck (the research docs disagreed; the voice carries the teaching).
- Small models cite the wrong paragraph for true claims → citation repair before checks (never makes a false claim pass).
- Small models embellish ("than ever before", "every time") → an overstatement check (absolutes must be in the source).
- No session token on the localhost API: loopback + Host allowlist + same-origin writes is the right bar; minting a secret would be inventing auth (ADR 0006).

**Verified:**
- 20 s from the 15-page Transformer PDF: 21.3 s, 0 unsupported, the paper's Figure 1 cropped and toured; whisper transcript = 100 % of the script.
- 1 min from the PDF: 60.0 s exactly, 0 unsupported; contact sheet showed repetitive takeaways (fixed: one takeaway, de-duplicated beats) and monotonous statement layouts (fixed: 3 layouts rotating tones).
- The server listens on `127.0.0.1:7411` only (lsof); forged Host → 403; cross-origin PUT → 403.
- `make check` green: 104 tests.

**Next:** 3/5-minute videos, run the evals, a design pass, then the review agents.
**Ideas:** 47 marked done; I-078…I-085 added; I-051 blocked (HF client id).
