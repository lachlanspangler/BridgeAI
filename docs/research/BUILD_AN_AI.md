# Building "an AI that's really good at this"

Status: plan + first steps done, 2026-11-03. Companion to `MODELS.md` (which models), `EXPLAINER_CRAFT.md` (what good looks like) and ADRs 0004, 0007, 0008.

## 1. What "really good at this" means here

Bridge's AI has one job: turn a source into a script a learner understands in the time they chose, **without saying anything the source doesn't support**. That breaks into five skills, each measurable:

| Skill | What good looks like | How we measure it |
|---|---|---|
| **Find what matters** | The idea the source exists to make is ranked first; the next ones are the key method/result, not related work | `k1` and `coverage@k` against hand-written key points (`evals/cases/*.yaml`) |
| **Stay faithful** | Every number, name and claim is in the source; nothing is embellished | `unsupported` after the gate (must be 0) + an independent re-check |
| **Teach** | Plain words, concrete before abstract, one idea per beat, a hook, one takeaway | `understanding`: a fresh model sees only the narration + on-screen text and answers the case's questions |
| **Fit the clock** | 20 s means ~45 words and one idea; 5 min means ~650 words and 6–9 ideas | duration within ±10 % on real audio |
| **Show, don't tell** | Each beat picks the visual that shows its fact (number → big number, process → flow, before/after → compare, the paper's own figure) | design-critic grade; visual-type mix per video |

## 2. The pipeline (what is built)

```
source ─► ingest ─► segments with ids + page/line/bbox + figures
        ─► ANALYZE   map-reduce over chunks (≤ 3.2k tokens) → ideas {statement, kind, importance,
                     evidence[{segmentId, quote}], numbers, terms, figure}; quotes verified against the
                     segment; importance blended 75/25 with a structural prior (abstract, "we propose", …)
        ─► SCRIPT    ≤ 90 s: one call with the whole budget; longer: opening → one section per idea → takeaway
                     (keeps a 4B model focused). JSON schema = beats {role, narration, visual(oneOf 12 types),
                     claims[{text, support[segment ids], kind}], keywords}
        ─► FAITH     citation repair → deterministic checks → judge → gate (drop / rewrite) (ADR 0007)
        ─► FIT       expand (sourced, re-checked) if short → voice per beat → measured timeline → drop /
                     tighten / speed if long, pad / slow if short (ADR 0008)
        ─► RENDER    timeline → frames + mixed audio + captions + source map
```

Design choices that make a *small* model good:
1. **Constrained decoding.** Grammars from JSON schemas: output always parses, citations are enums of real segment ids, visuals are a closed `oneOf`. The model can't cite `s999` or invent a visual type.
2. **Small, focused prompts.** Each call does one thing (rank ideas, write one section, judge one claim, shorten one line). A 4B model fails on "do everything at once" and succeeds on narrow tasks.
3. **Evidence in, evidence out.** The script prompt shows only the evidence segments for the chosen ideas, with ids. The model is told "the only facts you may use". Then the gate checks.
4. **Deterministic first.** Numbers, names, word counts, durations and coverage are computed, never asked of the model (same rule as LachedInAI).
5. **A floor.** If anything fails, the extractive path still makes a faithful video. Quality degrades; the product never breaks.
6. **Repair, don't trust.** Visual repair (a big number that isn't in the source becomes a statement), citation repair, title repair (the hook card shows the real title), clause-aware trimming for on-screen text.

## 3. The eval set (what is built)

`evals/cases/*.yaml`: 16+ public sources (arXiv abstracts, Wikipedia leads, arXiv PDFs by URL, small GitHub repos, public-domain image sets), each with 4–8 **hand-written, ranked key points** (with lenient keyword rules) and 3–5 **questions**. `make evals` runs every case at 20 s and 1 min (more with `--lengths`), and writes `docs/EVALS.md`. It is the gate for prompt/model changes: a change that lowers `k1` or raises `unsupported` is reverted.

## 4. Is fine-tuning a small open model worth it? (plan)

**Not yet.** The order of operations:
1. **Prompt + pipeline first** (done/ongoing). Most failures so far are fixable without training: wrong citations (fixed by repair), short scripts (fixed by expand), weak hooks (rejected by the gate → fallback). EVALS tells us what's left.
2. **Collect great examples as a by-product.** Every render already saves `source.json`, `analysis.json`, `script.json`, `faith.json`. When a BYOK frontier model (Claude/GPT/Gemini) writes a script that passes the gate with zero drops and scores well on understanding, that `(evidence, budget) → script` pair is a training example. Target ~2–5k pairs across lengths and source kinds. Only public sources; record licences.
3. **Distil into the local model** once there is a measured gap: LoRA on Qwen3.5-4B (or the 2B for low-RAM machines) for the two narrow tasks where it loses most (likely section writing and hook writing). Train with MLX-LM on Apple Silicon or Unsloth on a rented GPU; export GGUF Q4_K_M; ship as an optional ~60 MB adapter (llama.cpp loads LoRA adapters) so the base model stays shared and the 8 GB budget holds.
4. **Accept only on evals:** the adapter must raise understanding and coverage without increasing unsupported claims, on held-out cases.

Why wait: a fine-tune locks in today's prompt format and today's failure modes; data from the gate is better data; and the frontier BYOK path already gives users who want the best quality a way to get it.

## 5. First steps done
- Grammar-constrained local model (node-llama-cpp + Qwen3.5-4B), five structured tasks, all with fallbacks.
- The faithfulness gate with deterministic checks, citation repair, judge and re-checked rewrites.
- Length fitting on real audio.
- The eval harness and hand-written eval set.
- Every job saves the full chain of artifacts, so example collection for distillation is free from now on.

## 6. Next experiments (ideas ledger)
- Two-pass script: draft → critique against EXPLAINER_CRAFT rules (hook, concreteness, one number per beat) → rewrite (I-079).
- Self-consistency for ranking: 3 samples at temperature 0.7, vote k1 (I-080).
- Use the paper's own figure whenever a key idea cites a segment near a figure caption (I-081).
- Compare Qwen3.5-4B vs Gemma 4 E4B vs Qwen3.5-2B on EVALS (I-082).
