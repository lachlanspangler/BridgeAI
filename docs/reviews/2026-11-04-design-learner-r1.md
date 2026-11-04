# Design critic + learner review, round 1 (2026-11-04)

**Design critic (fresh agent) grades:** Mistral 7B 20 s **C+** · Attention 5 min **D** · carbon-cycle image 20 s **D−** · scene library **B−**.
**Learner (fresh agent, never saw the sources):** Mistral 20 s: clarity 3, visual help 2, memorability 4: "the takeaway sticks; the diagram is never explained". Attention 5 min: clarity 2: "reads like shuffled excerpts": repetition, an off-topic line from a figure's example sentence, jargon never defined, flows that contradict the words.

## What changed (commits after this review)
| Finding | Fix |
|---|---|
| Figures cropped by a blind pan, blurry close-ups, the same figure 9× under the wrong narration | Whole figure on its card, ≤ 2× native scale, drift ≤ 1.04× unless a focus is given; "Figure N" source tag on the card edge instead of a competing caption; the beat's number pops as a callout when spoken; each figure once, ≤ 1 per 45 s; narration citing "Figure N" may only show Figure N |
| Garbled PDF figure text ("TheLawwillneverbe") narrated as a finding; "In this section…" sentences | Garbled-text and meta-sentence filters in candidate extraction |
| Repetition ("3.5 days" twice, the same claim 5–6×) | Global no-repeat pass; sections are told what was already said; dedupe within scripts |
| Jargon undefined | Sections must define a technical term in ≤ 6 plain words on first use |
| Order: results before mechanism | Long videos teach in an arc: problem → definition → method/architecture → results |
| Flow "Head 5 → Head 6" under "parallel" | Flows only for sequences; "parallel" narration draws no arrows; prompt says use bullets for parallel things |
| Empty compare side, placeholder cards, static 5 s | Both sides must have content; cards sized to content; the right card arrives by 0.6 s; neutral vs badge |
| 9 GtC/y vs 800 GtC on one axis; "this" label; invisible bar | Comparisons beyond 20:1 are dropped; bars labelled with their own labels and values; ≥ 6 px |
| Yellow everywhere | Yellow reserved for the focal element: the spoken caption word is white + underline; vs badge neutral; pills primary |
| Rainbow 37-segment progress bar; unnamed "PART 3 OF 7" over the bar | One quiet bar segmented by chapter; named chapter chip below it |
| Lone "Need" line, title underline slivers, tiny header/footer text, raw URL end card | Balanced centred wrapping; underline after the title lands; header removed; end card restates the takeaway, ≥ 32 px text, "arXiv 2310.06825" style source, held ≥ 2.5 s |
| Lone caption words ("8x.") | Merged with the previous cue when it fits |
| True peak −0.7 dBTP | Limiter ceiling −2.6 dBFS (≤ −1.5 dBTP after AAC) |
| No way to draw the core idea of attention | New `tokens` scene: word chips with curved links weighted by strength |
| No figure golden | Figure and tokens golden frames added |
