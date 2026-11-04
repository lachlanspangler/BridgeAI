# Design critic + learner, rounds 2 and 3 (2026-11-04)

Fresh agents each round; they get frames, transcripts and scripts, never my conclusions.

## Grades
| Video | R1 | R2 | R3 |
|---|---|---|---|
| Mistral 7B paper, 20 s | C+ | C+ | C+ |
| Carbon-cycle image, 20 s | D− | C− | C− |
| Attention paper (5 min in R1; 1 min after) | D | D+ | **C** |
| ai/nanoid project, 1 min | – | D+ | D+ |
| Scene library | B− | B | B |

Learner (cold viewer) ratings went from clarity 2–3 / visual help 2 (R1) to clarity 3 / memorability 4 on the paper and project videos (R3). "D (Nano ID) worked best for learning: a clear fast / safe / compact / portable structure… its flaws are mostly fixable rendering and sync bugs, not a missing idea."

**The critic's R3 summary:** "the scene library is ahead of the planner": the renderer draws compare cards, number bars, attention tokens and highlighted words well, but a 4B model rarely asks for them. The R3 fixes therefore moved decisions from the model into deterministic post-processing.

## R2 fixes (commit "design critic round 2 fixes")
The no-repeat pass runs last and counts repeated headline numbers. Expansions can't reuse another beat's number. Source-worded beats must be sentences. Statements show keywords, not the narrated sentence. Icons appear only when they are the noun. Text never silently drops words. Wrapping is balanced. Big-number bars are labelled by subject, with no misleading count-ups. Figure callouts appear only for numbers the figure shows. Figures are matched on distinctive terms. The highlighter is joined and faded in. Yellow is reserved. The end card is centred. Captions aren't duplicated on the takeaway. The prompt has routing rules.

## R3 fixes (commits "learner round 3…", "design critic round 3…", "refill…")
- **Numbers:** a statement whose narration states a source number becomes a big number. Its label is what the number counts, taken from the narration. Decimals and suffixed values never count up.
- **Text:** on-screen text is built from whole clauses, never a word-count cut. The takeaway quality gate requires a sentence that doesn't repeat another beat, re-checked, with one focal word. Statements get an automatic highlight.
- **Visuals:**
  - Token chips must be a real phrase from the source.
  - OCR word boxes point an image's zoom/dim/outline at the label being narrated.
  - Flow nodes are all in by mid-beat.
  - Source beats speak in the third person ("the authors").
  - The refill never echoes an existing beat.
  - Hooks name the subject.

## Honest status
Not at A. What holds the grades down is mostly script quality from a 4B local model under a strict fact-checker: thin hooks after the gate rejects an overclaim, takeaways that restate, mechanisms not explained. The BYOK path (Claude, GPT or Gemini through the same prompts and gate) is the expected route to A-grade scripts. It is wired and contract-tested but unrendered here, because there are no keys on this machine (see STATUS → Needs from you).
