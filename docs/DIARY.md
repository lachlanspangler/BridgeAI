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

## 2026-11-04 04:15: Reviews, and making the gate honest
**Did:** Security review (agent): 1 high, 5 medium, 9 low; all fixed except M4 (local non-browser clients are trusted), which is accepted and documented in ADR 0006. Code review (agent): 15 correctness bugs with proof tests, 8 of them ways an unsupported claim could reach a video. All fixed; the proof tests are now regression tests (`tests/review`, `tests/security`). Playwright e2e for the whole browser flow. Provider contract tests. Long videos: 3 min = 193 s on the local model; the sectioned writer now retries and falls back per part.

**Broke / learned:**
- The faith gate was weaker than it looked: spelled-out numbers, magnitude suffixes (7B vs 7M), sentence-initial invented names, narration beyond the listed claims, and an unchecked fallback takeaway could all get through. It is now strict by default, and the judge handles the soft cases.
- Every model claim that contains a number now goes to the judge, even when overlap is high. A video said "Atmosphere holds 800 gigatons; 9 new each year", where 9 was emissions and the net was 4: the numbers were real, the claim was wrong.
- The image-set video never showed the image (the model picked drawn visuals). Sources with figures now always show one.
- Small models reuse ids (three flow nodes all called "s1" stacked on one spot). Ids are positional now.
- Prettier reformatting between my scripted edits made several `str.replace` patches silently miss. Every edit now asserts its anchor exists.

**Decided (and why):**
- **Thin sources get honest short videos.** A 175-word abstract at 1 min becomes ~40–50 s with a note saying so, not padding. Faithfulness beats the clock; the ±10 % promise holds whenever the source has enough material.
- Evals: understanding is scored only on questions about the key points that fit the chosen length.

**Next:** finish EVALS (running), 5-minute render, design-critic and learner reviews on fresh samples, then a final eval run on the final code.

## 2026-11-04 08:40: Three review rounds, and moving decisions out of the model
**Did:**
- 5-minute video works: 285.5 s for a 300 s target, 0 unsupported. Parallel worker rendering (4 workers): 143 s to render 5 minutes.
- Three rounds of fresh design-critic and learner reviews on new samples. Grades and fixes are in `docs/reviews/2026-11-04-*.md`.
- Attention went D → D+ → C. Carbon went D− → C− → C−. The library went B− → B. The learner now rates the paper and project videos memorability 4 and says Nano ID's fast / safe / compact / portable structure "works".
- New `tokens` scene: word chips with weighted attention arcs.
- OCR word boxes now point image zooms at the narrated label.
- Large set of post-processing upgrades (see the review docs).

**Learned:**
- The renderer outran the planner. A 4B model rarely asks for the good scenes and writes sentence-as-visual by default, so the biggest wins came from deterministic post-processing: number → big-number upgrade, clause-based screen text, a takeaway gate, figure matching on distinctive terms. That makes the system more model-agnostic too.
- Every content rewrite (expand, tighten, refill, fallback takeaway) needs both the faith checks *and* the no-repeat check, or it either invents or echoes. The pipeline now runs the no-repeat pass last.
- Count-up animations are a faithfulness bug in disguise: a still caught mid-count shows a number the source never said.
- Something outside this project rewrites `~/.claude/rules/amazon-builder-context-do-not-delete.md` every few minutes (mtime changes, same size). I never touch it; noted for the owner.

**Decided:**
- Stopped iterating at C/C+ on the free path and froze the code for the final eval run. The rest of the gap to A is script quality from a small local model. The BYOK path uses the same prompts and gate with a frontier model, and it can't be rendered here without keys.

**Next:** final EVALS, samples into docs/media, STATUS, shut down, clean tree.

## 2026-11-04 16:30: Closing the last 20-second misses (and two faithfulness holes they exposed)
**Did:**
- Final eval runs on frozen code, read case by case. Each 20 s miss had a real cause, not noise:
  - **Attention:** the beat that said "Transformer" was dropped by the length fit after the name check had passed. Beats that carry the subject's name, the definition or the main idea are now marked core, so the fit loop can't drop them.
  - **Plates / attention:** the main-idea check passed on *citing* the right segment. It now needs the words said (≥60 % of the idea's content words when the model gave no terms).
  - **Climate:** no definition sentence existed. New fallback: the earliest lead sentence that names most of a descriptive title.
  - **Global temperature:** `numbers()` read "1951-1980" as 1951 and −1980, so a correct line was rejected.
  - **Carbon:** the narration said "the 10,000-ton fossil reserve" but the source's unit is gigatons. The number check didn't look at units. A unit attached to a number must now be one the source uses.
  - **Carbon:** a takeaway read "Fossil fuels, cement, and land-use change 9.", a diagram label taken as a sentence. Now filtered as garbled.
  - **vLLM:** a PDF sentence with chart ticks spliced in ("al- 0.4k gorithm … pag0 10 20 30 40 ing") reached the narration. Tick runs and broken-word-then-number are now garbled.
- Narration is always third person. "We" is named "the authors" once, then "they". Quotes are untouched.
- Short videos whose idea beats are all core drop a title card or takeaway before overrunning. 20 s timing went from 12/18 to 18/18 within ±10 %.
- Disclosed the three widened answer keys in `evals/README.md`.

**Learned:**
- The unit bug matters most: the eval reported 0 unsupported while a video said "ton" for "gigaton". The deterministic checks only know what they check. Reading every 20 s script by hand found it; the metric didn't.
- A protection added in one pass (the name rule) can be undone by a later pass (length fit). Protections have to travel with the beat (the `core` tag), not be checked once.

**Next:** the final eval on this code, samples into docs/media, STATUS, clean tree.

## 2026-11-04 16:10: Hang, timeouts, wrap-up
**Did:**
- The full eval before the last two wording fixes met the stop criterion: 20 s and 60 s k1 18/18, 0 unsupported.
- Reading the 18 scripts by hand still found problems:
  - a duplicate line (LIGO)
  - big numbers the narration never says ("1", "50 %")
  - "our universe" turned into "their universe"
  - a sentence cut mid-phrase ("…observation of a binary.")
  - a subject-less fragment with a math symbol ("…smaller than hC.")
  - a diagram label voiced as a sentence
  - "We"/"Our" at sentence start left in the first person

  All fixed in a final polish pass, with tests.
- The next full run hung: 0 % CPU, model loaded, a grammar-constrained `session.prompt` that never settled. The owner stopped it.
- Added `withTimeout`: a local model call gets 4 min and then a fresh context, a job gets 30 min, an eval run gets 12 min. The caller is always released. There's a test with a runner that never settles.
- Smoke eval on the final code: 3/3 k1 at 20 s, 0 unsupported.

**Mistake:** I ran `git checkout` on the uncommitted `docs/EVALS.md`, which threw away the report from the 18/18 run. The hung run had already overwritten some saved artifacts. I regenerated the report with `--rescore` from the saved scripts and said so in STATUS. **Lesson:** commit eval reports the moment a run finishes.

**Decided:** stopped at design grade C+/B (library). The gap to A is script quality on the 4B model; the next step is a BYOK run.
