# ADR-0008: The chosen length is a hard budget, fitted to ±10 % on real audio

**Status:** accepted · 2026-11-03

## Decision
`budgetFor(seconds)` (`src/core/budget.ts`) interpolates calibrated anchors (EXPLAINER_CRAFT rules 1–5):

| length | words/s | words | ideas | beats |
|---|---|---|---|---|
| 20 s | 2.6 | ~45 | 1–2 | 4–5 |
| 1 min | 2.5 | ~135 | 2–3 | 9–13 |
| 3 min | 2.4 | ~400 | 4–6 | 24–36 |
| 5 min | 2.3 | ~650 | 6–9 | 38–56 |

Fit loop: (1) before voicing, a script under 85 % of the word budget gets sourced details added (re-checked); (2) after voicing each beat, the timeline is built from **measured** clip durations; too long → drop the lowest-ranked idea beat, then tighten, then speed the voice up to 1.18×; too short → add breathing room (≤ 0.8 s per beat), then slow the voice to 0.92×. Hard cap 2.9 words/s.

## Why
Word-count estimates drift; real audio is ground truth. Users asked for exact length control, and none of the competitors offer it (LANDSCAPE.md).
