# Status

## 2026-11-04: end of build (v0.1, local-first)

**State:** `main` is committed with a clean tree. Nothing is pushed. `make check` is green (158 tests). No servers or eval processes are left running. The free path works end to end with zero keys.

### Stop criteria
| Criterion | Result |
|---|---|
| A 10-page paper at 20 s on the free path | ✓ Mistral 7B (arXiv PDF): `docs/media/mistral-7b-paper-20s.mp4` |
| Every length works | ✓ 20 s, 1 min, 3 min (193 s), 5 min (285.5 s; 143 s render with parallel workers), custom |
| PDFs, images, projects all work | ✓ all three kinds are in the eval set, plus text and links |
| BYOK: Anthropic, OpenAI, OpenRouter OAuth | ✓ wired and contract-tested against stubbed providers; **no real key on this machine, so never run live** |
| 20 s video covers the top idea in every case, zero unsupported claims | ✓ 18/18 at 20 s and 18/18 at 60 s, 0 unsupported (see "Evals" below for how the final report was produced) |
| Design critic grades A | **✗ not met.** Best grades: scene library B; videos C+ / C / C− / D+ (below) |
| Learner, code and security reviewers signed off | ✓ code (15 bugs fixed) and security (H1–L9 fixed, M4 accepted in ADR 0006): `docs/reviews/2026-11-03-*.md`. Learner ratings are in the design reviews |
| `make check` green, samples in docs/media | ✓ |

### Design grade (honest)
Three rounds of a fresh design critic and a cold-viewer learner (`docs/reviews/2026-11-04-*.md`):

| Video | R1 | R2 | R3 |
|---|---|---|---|
| Mistral 7B paper, 20 s | C+ | C+ | C+ |
| Carbon-cycle image, 20 s | D− | C− | C− |
| Attention paper | D | D+ | C |
| Nano ID project, 1 min | – | D+ | D+ |
| Scene library | B− | B | B |

**Not A.** The renderer is ahead of the planner: the scene library draws compare cards, number bars, attention arcs and figure zooms well, but a 4B local model under a strict fact-checker writes thin hooks and restating takeaways and rarely asks for the good scenes. The learner rated the paper and project videos memorability 4/5 and clarity 3/5. The BYOK path (Claude, GPT or Gemini through the same prompts and gate) is the expected route to A. It has not been rendered here because there are no keys.

### Evals (`docs/EVALS.md`, method in `evals/README.md`)
- **18 cases:** 8 text, 4 PDF, 3 project, 3 image sets.
- **Last complete live run** on the code before the final two wording fixes: 20 s k1 18/18, 60 s k1 18/18, 0 unsupported, timing within ±10 % at 17/18 for both lengths.
- **Two fixes after that run:**
  - garbled lines are never voiced
  - "We"/"Our" at sentence start becomes third person
- **Smoke eval on the final code:** carbon, attention and double-ML at 20 s. 3/3 k1, 0 unsupported, all within ±10 %.
- **How the final report was produced:** the full rerun hung (see below) and was stopped. `docs/EVALS.md` was regenerated with `--rescore` from the saved scripts, which also re-runs the understanding questions. Rows come from a mix of the final code and the run before it.
- **Answer keys:** three were widened after authoring, for equivalent wording only. They are disclosed in `evals/README.md`.
- **What the metrics missed:** reading every 20 s script by hand found a unit error ("10,000-ton" for gigatons), a diagram label voiced as a sentence, and duplicate lines, all while the metrics read 0 unsupported. All are fixed and have tests. **Keep reading scripts. The checks only know what they check.**

### Hang fixed
The last full eval stalled with 0 % CPU. The local model's `session.prompt` (grammar-constrained) never settled, and nothing had a timeout. Now:
- each local model call times out (4 min) and a fresh context is loaded
- each job times out (30 min)
- each eval run times out (12 min)

The caller is always released. `tests/node/timeout.test.ts` covers it. Env overrides: `BRIDGE_LLM_TIMEOUT_MS`, `BRIDGE_JOB_TIMEOUT_MS`, `BRIDGE_EVAL_RUN_TIMEOUT_MS`.

### What's built
- **Inputs:**
  - pasted text or Markdown
  - PDF papers: pdfjs text, columns, headings, captions, figures cropped from pages
  - image sets, read with OCR and word boxes
  - projects: folder, .zip, GitHub URL or README
  - links: arXiv, any PDF, GitHub, web articles
- **The AI:**
  - Ranks the key ideas, each backed by a verified quote.
  - Writes a script sized to the length.
  - Runs a faithfulness gate. It checks numbers and units, names, overstatements, citation repair and a judge.
  - Makes sure every video has a definition beat and a main-idea beat. Both are protected from later length-fit drops.
  - Fits the length to the real recorded audio.
  - Engines: local Qwen3.5-4B, or your own key (Anthropic, OpenAI, Gemini, OpenRouter), with an extractive floor that needs no model.
- **Video:** 13 animated scene types:
  - title, statement with icons
  - big number, bullets, bars, flow, compare
  - quote, typing code, paper figure with an OCR-guided zoom, file tree
  - attention tokens, takeaway

  Also: transitions, a progress bar, chapters, burned-in captions with the spoken word lit, and an end card.
- **Sound:** Kokoro-82M voice (local), a synthesized music bed ducked under the voice, synthesized SFX, a −14 LUFS master.
- **Outputs:** mp4 (with a soft subtitle track), VTT/SRT, a timestamped script with page/line references, a source map and a thumbnail.
- **App** at http://127.0.0.1:7411, flow: create → key-ideas review (pin or drop) → length → live progress → watch with "where this comes from" → library → settings (keys, OpenRouter sign-in, doctor).
- **Security:**
  - binds to 127.0.0.1 only
  - Host allowlist, same-origin writes, CSP, body limits
  - SSRF guard checked at connect time
  - keys in the OS keychain (else a 0600 file), redacted everywhere
  - provider fetches pinned to the provider's own host

### How to run it
```bash
make setup     # once: npm install, Playwright browser, models after a disk check
make dev       # http://127.0.0.1:7411
make video IN=path/or/url LEN=20
make doctor    # what's missing and how to fix it
make check     # typecheck, lint, format, all tests
make evals     # the eval set → docs/EVALS.md (about 70 min for 20 s + 60 s)
```

### Samples (`docs/media`)
All four were rendered on the final code with 0 unsupported claims. Durations: 21.4 s, 63.5 s, 18.6 s, 63.4 s. Each has a 720p mp4, a contact sheet, the script and a source map:
- `mistral-7b-paper-20s`
- `attention-paper-60s`
- `carbon-cycle-image-20s`
- `nanoid-project-60s`

Known flaws, visible in these samples:
- **Nano ID 1 min:** says "21 symbols / bigger alphabet" three times, and voices a sponsor line from the README. The first render also voiced the README's table of contents; that's filtered now and was re-rendered.
- **Mistral's compare card:** generic labels ("faster speed" / "slower speed").

These are 4B-planner limits of the kind the design critic graded.

### Needs from you
- **Keys (optional):** nothing needs a key. To try BYOK, add a key in Settings or run `echo <key> | npx tsx src/cli/main.ts keys set anthropic`. For OpenRouter, click "Sign in with OpenRouter". A real-key run of the evals is the next quality step.
- **Hugging Face sign-in** (I-051, blocked): needs an OAuth client id from huggingface.co/settings/applications.
- **Git identity:** commits use `Lachlan Spangler <lachlanspangler@users.noreply.github.com>` (repo-local). Change it with `git config user.email …` if you like.
- **Scratch files:** `/tmp/bridgepdf`, `/tmp/bridgerepo`, `/tmp/bimg` and `/tmp/bridgecheck` were left by the eval-set agent (my sandbox couldn't delete them). They're safe to remove.
- **Outside this project:** something rewrites `~/.claude/rules/amazon-builder-context-do-not-delete.md` every few minutes (same size, new mtime). I never touched it.

### The path to a free public website (not built)
1. **Static front end.** `web/dist` is already a static build and can go on any static host.
2. **Where the work runs:**
   - **Cheapest:** the site talks to Bridge running on the visitor's own machine (`npx bridge-explainer`).
   - **Better:** an in-browser pipeline. The scene code already runs on a browser canvas, WebCodecs can encode the mp4, and Kokoro has a WebGPU/WASM build. The script would be BYOK straight from the browser, or a small WebGPU model.
   - **Hosted render queue:** costs money and needs abuse controls, so only with a sponsor.
3. **Security before exposure:**
   - real auth
   - rate limits and quotas
   - upload scanning
   - sandboxed ingestion with a network allowlist
   - expiring storage, abuse reporting

   Keys stay in the browser, or go through OpenRouter OAuth.
4. **Legal:** terms, a takedown process, and model licence notices (Qwen and Kokoro are Apache-2.0).

### What's next
1. **BYOK eval run with a real key:** the expected path to A-grade scripts.
2. **Script critique pass** (I-018 plain words, I-079 self-consistency for the top idea).
3. **I-080:** prefer the paper's own figure near the cited caption.
4. **I-028:** kinetic typography from the word timings.
5. **I-004:** a content-addressed stage cache.

See `npm run ideas -- next`.
