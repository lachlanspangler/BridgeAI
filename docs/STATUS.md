# Status

## 2026-11-03: end of night 1 (draft, updated at the end of the session)

**State:** `main` is committed, nothing is pushed. `make check` is green. The free path works end to end with zero keys.

### What's built
- **Inputs:** pasted text/Markdown, PDF papers (pdfjs text + layout + figures cropped from pages), image sets (OCR), projects (folder upload, .zip, GitHub URL, README), links (arXiv, any PDF, GitHub, web articles).
- **The AI:** key ideas ranked with verified quotes → a script sized to the chosen length → a faithfulness gate (numbers, names, overstatements, citation repair, judge) → length fit on real audio. Local Qwen3.5-4B (grammar-constrained JSON) or your own key (Anthropic, OpenAI, Gemini, OpenRouter), with an extractive floor that needs no model.
- **Video:** 12 animated scene types (title, statement with code-drawn icons, big number with count-up and comparison, bullets, bar chart, flow diagram, compare, quote, typing code, paper figure with a zoom tour, file tree, takeaway), transition wipes, a progress bar, chapter chips for long videos, burned-in captions with the spoken word lit, an end card.
- **Sound:** Kokoro-82M voice (local), a synthesized music bed ducked under the voice, synthesized SFX on transitions/numbers, −14 LUFS master.
- **Outputs:** mp4 (1080p, soft subtitle track), VTT/SRT, a script with timestamps and page/line references, and a source map, all shown in the app.
- **App:** http://127.0.0.1:7411: create → (optional) key-ideas review with pin/drop → length (20 s / 1 min / 3 min / 5 min / custom) → live progress → watch with the script and "where this comes from" → library → settings (keys, OpenRouter sign-in, the doctor).

### How to run it
```bash
make setup     # once (npm install, Playwright browser, models after a disk check)
make dev       # http://127.0.0.1:7411
make video IN=path/or/url LEN=20
make doctor    # what's missing and how to fix it
make check     # typecheck, lint, format, all tests
make evals     # the eval set → docs/EVALS.md
```

### Needs from you
- **Keys (optional):** none of this needs a key. To try the BYOK path, add a key in Settings, or `echo <key> | npx tsx src/cli/main.ts keys set anthropic`. OpenRouter: click "Sign in with OpenRouter".
- **Hugging Face sign-in** (idea I-051, blocked): needs an OAuth app client id you register at huggingface.co/settings/applications.
- **Git identity:** commits use `Lachlan Spangler <lachlanspangler@users.noreply.github.com>` (repo-local) so nothing ties back to the amazon.com address. Change it with `git config user.email …` if you prefer.
- **Scratch files:** the eval-set agent left read-only scratch copies in `/tmp/bridgepdf`, `/tmp/bridgerepo`, `/tmp/bimg`, `/tmp/bridgecheck` (my sandbox couldn't delete them). Safe to remove.

### The path to a free public website (not built)
1. **Split the static front end from the renderer.** The web app is already a static build (`web/dist`). Host it on any static host.
2. **Where the work runs.** The free, zero-cost option: the website talks to Bridge running on the visitor's own machine (`npx bridge-explainer`), so nobody pays for compute. Better UX: an in-browser renderer. The scene code already runs on a browser canvas; WebCodecs can encode mp4 in the browser; Kokoro has a WebGPU/WASM build (kokoro-js); the script model would be BYOK (from the browser straight to the provider, CORS permitting) or a small WebGPU model. A hosted render queue costs money and needs abuse controls; only add one with a sponsor.
3. **Security before exposure:** real user auth (not the localhost guard), per-user rate limits and quotas, upload scanning, a job sandbox (no network from ingestion workers beyond an allowlist), storage with expiry, and abuse reporting. Keys stay in the user's browser (never on our server) or go through OpenRouter OAuth.
4. **Legal:** terms, a takedown process for uploaded material, and model licence notices (Qwen and Kokoro are Apache-2.0).

### What's next
See `docs/IDEAS.md` (`npm run ideas -- next`). Top: two-pass script critique, the model bake-off on EVALS, a live canvas preview in the browser, parallel rendering for 5-minute videos.
