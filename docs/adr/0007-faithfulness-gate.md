# ADR-0007: Every narrated claim passes a faithfulness gate before it is voiced

**Status:** accepted · 2026-11-03

## Decision
Between script and voice, every beat goes through:
1. **Citation repair:** a fact claim that covers its cited text poorly gets the best-matching source segments added (coverage + shared numbers). Small models often cite the wrong paragraph for a true claim.
2. **Deterministic checks** (`src/core/faith/check.ts`): every number said or shown must appear in the cited segments (2-significant-figure rounding allowed); every proper noun in narration and every acronym on screen must appear in the source; fact claims need ≥ 50 % content-word overlap with their support, otherwise:
3. **Judge:** the model decides entailment of the claim against its evidence, given the narration line as context. Fails closed.
4. **Gate** (`gate.ts`): unsupported idea beats are **dropped**; a failing hook becomes a title-card framing line; a failing takeaway becomes the top idea's own sentence; a beat whose words pass but whose picture doesn't gets a visual built from its own words. Every decision lands in `faith.json` and the source map.
5. **Expansions and tightenings are re-checked** with the same checks.

## Why
"A wrong claim is worse than a missing one." Deterministic checks catch the most dangerous hallucinations (numbers, names) for free; the judge handles paraphrase. Dropping is safer than rewriting blind.

## Consequences
- Some true but loosely worded beats get dropped; the length-fit loop then pads or expands. Visible in EVALS as coverage, not as unsupported claims.
