# Workflow: the loop

Bridge is built and kept alive by one loop. Humans and agents run the same steps, and every step leaves a
written trail. (Shape copied from GameCred and GetOffTheCouch; the diary is append-only, newest at the bottom.)

```
 ┌──► 0 TRIAGE ─► 1 PICK ─► 2 PLAN ─► 3 BUILD ─► 4 TEST ─► 5 VERIFY ─► 6 RECORD ─► 7 IDEATE ─┐
 └────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Step | What you do | Command / file | Done when |
|---|---|---|---|
| **0 Triage** | Health first. A ✗ in the doctor, a red `make check`, or an eval regression beats any feature. | `make doctor`, `make check` | Every ✗ is fixed or has an open idea saying why it can't be yet |
| **1 Pick** | Highest-score open idea (value × confidence ÷ effort). Skip ideas `blocked` on the owner. | `npm run ideas -- next` | `npm run ideas -- set I-NNN doing` |
| **2 Plan** | 3–6 lines: the smallest change that delivers it, the test that proves it, the video/screen you'll look at. Big or hard-to-reverse decisions get an ADR. | diary draft, `docs/adr/` | You can name the test and the frame you'll check |
| **3 Build** | Keep the layers apart: ingest → analyze → script → faith → timeline → scenes/audio → render. Pure logic goes in `src/core`. | code | — |
| **4 Test** | Unit tests for logic, golden frames for scenes, audio tests for sync/loudness, leak tests for keys. Fix root causes. | `make check` | Green |
| **5 Verify for real** | Render a real video. `make frames` → look at the contact sheet and stills, read the whisper transcript, look at the waveform. For UI: Playwright screenshot of the real app. For model/prompt changes: `make evals`. | `make video`, `make frames`, `make evals` | You saw it working. Write what you saw |
| **6 Record** | Diary entry (append at the bottom), idea → done, STATUS.md if the state changed, commit with the idea id. | `docs/DIARY.md`, `npm run ideas -- set I-NNN done --note …` | Committed |
| **7 Ideate** | Add **at least 3** ideas (features, visual types, prompt tricks, eval cases, polish). Reject bad ones with a reason. | `npm run ideas -- add …` | Ledger grew |

Then back to 0. Never wait for the owner. If something only they can give (a provider key, an account, a
client id) blocks an idea: set it `blocked`, list it in STATUS.md under **Needs from you**, stub it so
everything else works, take the next idea.

## Two-strike rule
If the same check fails twice after a fix, stop patching. Open an idea with the failure output, write it in
the diary, and take a different idea.

## Milestone reviews (fresh agents, never anchored on my opinion)
Give them the artifacts, not my conclusions.
| Reviewer | Gets | Returns |
|---|---|---|
| **Design critic** | contact sheets + stills + the mp4 path, `docs/research/EXPLAINER_CRAFT.md` rules | a letter grade per video and the 5 biggest fixes. Iterate to **A** |
| **Learner** | the video only (frames + transcript), no source | what they understood, what confused them; we score it against the hand-written key points |
| **Code reviewer** | the diff/tree | correctness bugs, test gaps |
| **Security reviewer** | `src/node/keys`, `src/server`, provider clients | key leaks, localhost attack surface, fixes |

Findings land as ideas; fixes land as commits that cite the review in `docs/reviews/`.

## Verification recipes
- **A video:** `make video IN=evals/sources/attention-abstract.txt LEN=20` → `make frames VIDEO=artifacts/videos/<id>.mp4`
  → open `artifacts/frames/<id>/contact.jpg`, a few stills, `waveform.png`, and `transcript.txt`.
  Check: every beat moves, text is readable, colours match the palette, captions match the voice, music
  ducks under speech, duration within ±10% of the target.
- **The app:** `make dev`, then `npx tsx scripts/shoot.ts` (Playwright screenshots → `artifacts/ux/`).
- **Faithfulness:** the source map (`<job>/sourcemap.json`) links every claim to segments; `make evals`
  measures unsupported claims (must be 0) and key-point coverage.

## Diary conventions
`docs/DIARY.md` is append-only and chronological (newest at the bottom).
```
## 2026-11-03 21:10: <title>
**Did:** …  **Broke:** …  **Decided (and why):** …  **Verified:** what I saw/heard  **Next:** …  **Ideas:** I-012 done; I-046 added
```
