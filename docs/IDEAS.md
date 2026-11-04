# Ideas

_Generated from `docs/ideas_ledger.json` by `npm run ideas -- render`. Do not edit by hand._

Score = value × confidence ÷ effort. 77 ideas: 0 done, 0 doing, 65 open, 0 blocked, 4 parked, 8 rejected.

## accessibility

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-069 | Captions burned in + soft subtitle track + VTT/SRT downloads | 5 | 2 | 0.9 | 2.25 | open | Accessibility and silent viewing |
| I-070 | Colour-blind-safe palette, contrast ≥ 4.5:1 for all on-screen text | 4 | 1 | 0.8 | 3.2 | open | Colour is never the only signal |
| I-071 | Audio description track | 2 | 4 | 0.3 | 0.15 | parked | Interesting, low priority |

## analysis

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-012 | Extractive floor: TextRank + position/abstract/number heuristics, zero model | 5 | 2 | 0.9 | 2.25 | open | Works instantly with no download; faithful by construction; deterministic tests |
| I-013 | LLM key-idea extraction with segment citations and verbatim evidence quotes, verified against the source | 5 | 3 | 0.8 | 1.33 | open | Traceability: every idea maps back to where it came from |
| I-014 | Map-reduce over long sources (chunk → ideas → merge/dedupe → rank) to fit a 4B model’s context | 5 | 3 | 0.7 | 1.17 | open | 10-page papers are ~10k tokens |
| I-015 | Importance ranking that blends model scores with structure (title, abstract, conclusion, repetition, has-number) | 4 | 2 | 0.7 | 1.4 | open | Stabilises a small model’s noisy rankings |

## app

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-053 | Input screen: paste / PDF / images / project / URL, with the confidentiality note | 5 | 2 | 0.9 | 2.25 | open | Hard rule |
| I-054 | Ideas review step: show ranked key ideas with sources; user can pin/drop before rendering | 4 | 2 | 0.7 | 1.4 | open | Human in the loop for teaching |
| I-055 | Length picker 20 s / 1 min / 3 min / 5 min / custom with a preview of how many ideas fit | 5 | 1 | 0.9 | 4.5 | open | Core promise made visible |
| I-056 | Watch page: player, captions toggle, script with timestamps, source map, downloads (mp4, vtt, script, sourcemap) | 5 | 2 | 0.8 | 2 | open | Output requirements |
| I-057 | Script editor: edit a beat’s words and re-render only audio+frames | 4 | 3 | 0.6 | 0.8 | open | Fix what the AI got wrong |
| I-058 | Library of past videos | 3 | 2 | 0.7 | 1.05 | open | Find old videos |
| I-059 | Electron desktop wrapper | 2 | 4 | 0.5 | 0.25 | rejected | A localhost web app already works on every OS; Electron adds 150 MB and signing |

## audio

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-035 | Music bed synthesized in code: pads, bass, plucks; mood + tempo per length; deterministic per seed | 5 | 3 | 0.8 | 1.33 | open | No samples, no licences, works offline |
| I-036 | SFX synthesized: whoosh on transitions, pop on keyword, tick on number count-up, soft riser into the takeaway | 4 | 2 | 0.8 | 1.6 | open | Sound on transitions is in the brief |
| I-037 | Sidechain ducking of music under the voice + loudness normalisation to −16 LUFS / −1 dBTP | 5 | 2 | 0.8 | 2 | open | Voice must always be clear |
| I-038 | CC0 sample libraries for music | 2 | 2 | 0.5 | 0.5 | rejected | Licence tracking and download size; code synthesis is good enough and fully offline |

## byok

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-048 | Keystore: OS keychain (@napi-rs/keyring) with a 0600-file fallback; masked reads only | 5 | 2 | 0.9 | 2.25 | open | Keys never leave the machine except to their provider |
| I-049 | OpenRouter OAuth PKCE “link your account” on a 127.0.0.1 callback | 5 | 2 | 0.8 | 2 | open | The brief asks for account linking |
| I-050 | Provider clients: Anthropic, OpenAI, Google Gemini, OpenRouter, ElevenLabs with host pinning | 5 | 3 | 0.8 | 1.33 | open | Keys are sent only to their own host |
| I-051 | Hugging Face OAuth sign-in (needs an OAuth app client id) | 3 | 2 | 0.5 | 0.75 | open | Real OAuth with free inference credits; blocked on a client id from the owner |
| I-052 | Cost estimate before a BYOK render | 3 | 2 | 0.6 | 0.9 | open | No surprise bills |

## distribution

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-067 | Public website path: static front end + per-user BYOK in the browser, render on the user’s machine or a queue (FUTURE) | 4 | 4 | 0.5 | 0.5 | parked | Documented in STATUS; not this version |
| I-068 | Docker image for one-command self-hosting | 2 | 2 | 0.6 | 0.6 | parked | Later; npm is enough now |

## evals

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-060 | Eval set: 15+ public sources with hand-written key points + questions | 5 | 3 | 0.8 | 1.33 | open | Stop criterion |
| I-061 | Metrics: faithfulness (0 unsupported), coverage for length, understanding (fresh model answers from script + on-screen text) | 5 | 3 | 0.7 | 1.17 | open | Stop criterion |
| I-062 | Regression gate: evals must not drop when prompts/models change | 4 | 2 | 0.7 | 1.4 | open | Same rule as LachedInAI |

## faith

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-021 | Deterministic claim checks: every number, name and quoted term in narration must appear in the cited segments | 5 | 2 | 0.9 | 2.25 | open | Cheap, exact, catches the most dangerous hallucinations |
| I-022 | Entailment judge per claim (local model or BYOK), drop/rewrite unsupported beats | 5 | 3 | 0.7 | 1.17 | open | Zero unsupported claims is a stop criterion |
| I-023 | Source map output: claim → segment → page/line, shown in the app next to the video | 5 | 2 | 0.8 | 2 | open | Trust: users can check every sentence |

## infra

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-063 | make setup / check / doctor / dev / video / frames / evals / e2e | 5 | 2 | 0.9 | 2.25 | open | One-command everything |
| I-064 | Doctor: disk, models, ffmpeg (system or ffmpeg-static), fonts, keys, ports, node version, with exact fix commands | 5 | 2 | 0.9 | 2.25 | open | Self-healing checks |
| I-065 | Temp-render cleanup + artifact retention | 4 | 1 | 0.9 | 3.6 | open | Disk rule |
| I-066 | GitHub Actions CI (lint/test on mac/win/linux) | 3 | 2 | 0.6 | 0.9 | open | Proves cross-platform; owner pushes |

## ingest

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-005 | PDF ingestion with pdfjs: text with page/position, headings, captions, reading order (2-column) | 5 | 3 | 0.8 | 1.33 | open | Papers are the flagship input |
| I-006 | Figure cropping from PDFs: embedded raster images via operator list + caption-anchored region crops for vector figures | 5 | 4 | 0.6 | 0.75 | open | Real figures from the paper are the most trusted visual |
| I-007 | Images input: OCR (tesseract.js) for text in screenshots/slides, captions from the user, optional vision model | 4 | 3 | 0.6 | 0.8 | open | Image sets must work with zero keys |
| I-008 | Projects: folder, zip, GitHub URL (codeload tarball), README; file tree + manifests + entry points + key code | 5 | 3 | 0.7 | 1.17 | open | “Explain this repo in 60 s” is a killer use for new engineers |
| I-009 | arXiv URL → fetch the PDF directly (public) | 4 | 1 | 0.8 | 3.2 | open | Most papers users want are on arXiv |
| I-010 | Web article URL → readability extraction | 3 | 2 | 0.6 | 0.9 | open | Blogs and docs pages; careful with robots/ToS |
| I-011 | Table extraction from PDFs → chart data | 4 | 4 | 0.4 | 0.4 | open | Charts that build from the paper’s own numbers |

## learning

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-072 | Quiz card at the end (one retrieval question) for 1 min+ | 3 | 2 | 0.5 | 0.75 | open | Retrieval practice from MasterDoc research; optional so it doesn’t eat the budget |
| I-073 | “Explain like I’m new” vs “expert” level toggle | 4 | 2 | 0.6 | 1.2 | open | Same source, different audiences |
| I-074 | Chapters for 3–5 min videos | 3 | 1 | 0.7 | 2.1 | open | Navigation |
| I-075 | Talking-head avatar presenter | 1 | 4 | 0.6 | 0.15 | rejected | Uncanny, costly, distracts from the content (coherence principle) |
| I-076 | Background stock footage | 1 | 3 | 0.7 | 0.23 | rejected | Decorative, licence-heavy, not tied to the source |

## models

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-044 | Local LLM via node-llama-cpp (in-process, prebuilt mac/win/linux) with JSON-schema grammars | 5 | 2 | 0.8 | 2 | open | One command on any machine; structured output that never fails to parse |
| I-045 | Model manager: download with free-disk check, size budget (≤8 GB), checksum, resume, link an existing GGUF | 5 | 2 | 0.8 | 2 | open | Hard rule on disk |
| I-046 | Model router: per task (analyze, script, judge) with fallback chain local → BYOK → extractive floor | 5 | 2 | 0.8 | 2 | open | Reuse LachedInAI’s ModelRouter idea |
| I-047 | Fine-tune a small open model (LoRA) on great script examples | 4 | 5 | 0.4 | 0.32 | parked | Only after the eval set shows where the 4B model loses; plan in BUILD_AN_AI.md |

## pipeline

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-001 | Thin vertical slice: abstract → 20 s mp4 on the free path (extractive script, Kokoro, synth music, captions) | 5 | 3 | 0.9 | 1.5 | open | Proves every layer end to end before widening |
| I-002 | Versioned zod schema as the single contract (Source → Segments → Ideas → Script → Timeline → Render) | 5 | 2 | 0.9 | 2.25 | open | Every layer validates against one schema; the web app shares the types |
| I-003 | Job queue: one render at a time, resumable stages, cached artifacts per stage | 4 | 2 | 0.8 | 1.6 | open | Rule: one render at a time; re-rendering after a script edit skips analysis |
| I-004 | Content-addressed stage cache (hash of input + settings + model id) | 4 | 2 | 0.7 | 1.4 | open | Fast re-renders; deterministic tests |
| I-077 | Cloud rendering farm | 1 | 5 | 0.5 | 0.1 | rejected | Contradicts local-first and free |

## script

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-016 | Length budget: words/s per mode, beats and ideas per length, ±10% fit loop | 5 | 2 | 0.9 | 2.25 | open | The core promise: you click 20 s, you get 20 s |
| I-017 | Beat-structured script: hook → ideas (one per beat) → takeaway, each beat with a typed visual | 5 | 3 | 0.8 | 1.33 | open | One idea per beat; visuals chosen from a fixed library the renderer can draw |
| I-018 | Plain-words pass: reading-level and jargon checks; define a term the first time it is said | 4 | 2 | 0.7 | 1.4 | open | Teaching first |
| I-019 | Duration fit after TTS: measure real audio, then tighten text or nudge voice speed (0.9–1.15×) to land within ±10% | 5 | 2 | 0.8 | 2 | open | Word-count estimates drift; real audio is ground truth |
| I-020 | Analogy beat (“it’s like…”) only when the model marks it as an analogy, not a claim | 3 | 2 | 0.5 | 0.75 | open | Analogies help understanding but must not be presented as source claims |

## visuals

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-024 | Design system: 1 background family, 5 semantic colours + neutrals, type scale, motion tokens, shared by app and video | 5 | 2 | 0.9 | 2.25 | open | Consistency is what makes it look designed |
| I-025 | Scene library v1: title, keyword highlight, big number, bullet build, bar chart, flow diagram, quote, code typing, figure, takeaway | 5 | 4 | 0.8 | 1 | open | Every beat has motion |
| I-026 | Golden-frame tests for every scene at fixed t (pixel diff with tolerance) | 5 | 2 | 0.8 | 2 | open | Renderer regressions caught by CI |
| I-027 | Live browser preview drawing the same scenes on a <canvas> before the mp4 renders | 4 | 3 | 0.7 | 0.93 | open | Instant feedback; the core is pure so it runs in both |
| I-028 | Kinetic typography: the spoken keyword pops in sync with the voice (word timings) | 5 | 3 | 0.7 | 1.17 | open | Dual coding + signaling |
| I-029 | Ken Burns + highlight box on cropped paper figures | 4 | 2 | 0.7 | 1.4 | open | Draws the eye to the part of the figure that matters |
| I-030 | Animated diagrams from model-emitted graph JSON (nodes/edges, auto-layout) | 5 | 4 | 0.6 | 0.75 | open | Architectures and pipelines are the heart of papers and projects |
| I-031 | Code that types itself with syntax colours and a highlight sweep on the key line | 4 | 3 | 0.7 | 0.93 | open | Projects input |
| I-032 | Optional AI-generated images on a provider key (OpenAI images), never on the free path | 2 | 3 | 0.5 | 0.33 | open | Hard rule: optional only |
| I-033 | Particle/confetti background textures | 1 | 2 | 0.5 | 0.25 | rejected | Decoration without meaning violates the coherence principle; adds render cost |
| I-034 | 3D scenes (three.js) for architecture explainers | 2 | 5 | 0.3 | 0.12 | rejected | Huge cost, weak teaching gain over clean 2D; revisit never |

## voice

| ID | Idea | V | E | C | Score | Status | Why / notes |
|---|---|---|---|---|---|---|---|
| I-039 | Kokoro-82M local narration (kokoro-js fp32, RTF ~0.26 on M4 Pro) with a voice picker | 5 | 2 | 0.9 | 2.25 | open | Measured: whisper transcribed it verbatim |
| I-040 | System voice fallback (say / SAPI / espeak-ng) when Kokoro is not downloaded | 4 | 2 | 0.7 | 1.4 | open | Never fail to produce audio |
| I-041 | Word timings: proportional by syllables per sentence, refined by whisper alignment when available | 4 | 3 | 0.6 | 0.8 | open | Captions and keyword pops must be in sync |
| I-042 | ElevenLabs + OpenAI TTS voices on BYOK | 4 | 2 | 0.8 | 1.6 | open | Better voices for those who have keys |
| I-043 | Voice cloning of the user | 1 | 3 | 0.5 | 0.17 | rejected | Consent/abuse risk and not needed for teaching |
