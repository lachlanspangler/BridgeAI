# CLAUDE.md: Bridge

**Bridge** turns a paper, a project, images or pasted text into a short, super visual, colourful explainer
video with a voiceover, music, sound effects and captions. The viewer picks the length (20 s, 1 min, 3 min,
5 min or custom) and the length sets the budget: 20 s = the single most important idea or two, fast.
It's a teaching tool: a bridge between AI intellect and human understanding. Free, local-first, and it
works with **zero keys** on any Mac, Windows or Linux laptop.

**It is a faithfulness product first and a video product second. A wrong claim is worse than a missing one.**

## Start every session like this
1. `make doctor` (models, disk, ffmpeg, keys, ports). Anything ✗ comes first.
2. Read the top of `docs/STATUS.md` and the last ~3 entries of `docs/DIARY.md` (append-only, newest at the bottom).
3. `npm run ideas -- next` for the highest-scoring open ideas.
4. Run the loop in `docs/WORKFLOW.md`. Never stop to ask what you can decide: pick the sensible default, write
   why in the diary, keep going. Only the owner can supply provider keys and accounts: stub them, list them
   in STATUS.md under "Needs from you", move on.

## Hard rules (non-negotiable)
1. **Nothing touches Amazon.** No Bedrock, no builder-mcp tools, no Amazon credentials, AWS profiles, internal
   sites or internal packages. Public npm only: `.npmrc` pins `https://registry.npmjs.org/` (this machine's
   default registry is internal; never remove the pin). Commits use the repo-local noreply identity.
2. **Bring your own key.** Anthropic, OpenAI, Google, ElevenLabs, OpenRouter (incl. OAuth PKCE sign-in).
   Keys live only on the user's machine (OS keychain, else a 0600 file in `~/.bridge/secrets`), are never
   logged, never in git, never in job files or API responses (masked only), and are sent only to their own
   provider's host. `tests/keys/` enforces this.
3. **The free path works with zero keys:** local open model (or the extractive floor) for the script, Kokoro
   (or the system voice) for narration, music and SFX synthesized in code, visuals drawn by code. AI-generated
   images are optional and only on a provider key.
4. **Local first.** The server binds to `127.0.0.1` only, never `0.0.0.0`. Host-header allowlist + Origin
   check on every request (DNS-rebinding/CSRF). No public exposure in this version.
5. **Confidentiality note** on the input screen: don't paste confidential work content into this version.
6. **Disk:** check free space before any model download (`src/node/models/`), keep all models ≤ 8 GB total,
   prefer small models, delete temp renders (`jobs/*/tmp`) after every render.
7. **Faithful.** Every narrated claim cites source segments; numbers and names must appear in the source;
   the faithfulness gate drops or rewrites unsupported beats. Never say what the source doesn't support.
8. **Pure core.** `src/core/**` has no Node built-ins, no `Math.random`/`Date.now` (ESLint-enforced). It runs
   in the browser preview and in the Node renderer identically.
9. **Verify for real.** After any visual/audio change: render a real video, extract stills (`make frames`),
   look at them, check the waveform and the whisper transcript, screenshot the app. Write what you saw in the diary.
10. **Small commits**, one logical change, idea id in the message (`I-012: …`). Never push.
11. **Big decisions get an ADR** in `docs/adr/NNNN-title.md`. Inclusive language (allowlist/denylist,
    primary/replica). "They" for unnamed people.
12. **Shared laptop.** Ports: server **7411**, web dev **7412**, e2e **7413**. Never use 5173, 5317, 5517,
    8081, 8091. Never kill other projects' servers or simulators. One render or model download at a time.
    At most 2 parallel agents.

## Layout
```
src/core/        PURE: schema (zod contract), budget (length → words/beats/ideas), text (sentences, numbers,
                 textrank), analyze (extractive ranking, idea parsing), script (planner, prompts, timing fit),
                 faith (claim checks), design (tokens/palette), scenes (visual library on Canvas 2D),
                 timeline, captions (chunking, VTT/SRT), audio (synth music + SFX, mixer, WAV), rng
src/node/        ingest (text, pdf, images, project/zip/github), llm (router, local node-llama-cpp, providers),
                 tts (kokoro, system, openai, elevenlabs), render (canvas → ffmpeg), keys (keystore,
                 redaction), models (download + disk guard), jobs (queue), doctor, paths
src/server/      Hono app on 127.0.0.1:7411 (API + built web app), security middleware, SSE progress
src/cli/         `bridge` CLI: make, doctor, models, keys, eval, frames
web/             Vite + React app (input → analyze → length → render → watch/download, source map)
evals/           15+ public sources with hand-written key points + questions; harness → docs/EVALS.md
tests/           unit · ingest · golden frames · audio · keys (leak) · server · e2e (Playwright)
docs/            WORKFLOW STATUS DIARY IDEAS ideas_ledger.json EVALS FUTURE_INTERNAL adr/ research/ media/
```

## Commands
| | |
|---|---|
| `make setup` | one command: npm deps, Playwright Chromium, fonts check, local models within the disk budget |
| `make check` | typecheck + lint + format + unit/golden/audio/keys/server tests + ideas ledger sync |
| `make doctor` | models, disk, ffmpeg, keys, ports: says exactly what's missing and how to fix it |
| `make dev` | the app at http://127.0.0.1:7411 |
| `make video IN=… LEN=20` | CLI render of any input to `artifacts/videos/` |
| `make frames VIDEO=…` | extract stills + contact sheet + waveform + transcript for review |
| `make evals` | run the eval set → `docs/EVALS.md` |
| `make e2e` | Playwright drives the real app end to end |
| `npm run ideas -- next/add/set/reject` | the ideas ledger |

Node ≥ 20.19 (machine has 20.20). Vite 7 / Vitest 3 / pdfjs-dist 4 because newer majors need Node 22.
