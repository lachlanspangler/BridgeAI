# ADR-0004: Free path = Qwen3.5-4B in-process; BYOK providers behind one interface; an extractive floor

**Status:** accepted · 2026-11-03 · research: `docs/research/MODELS.md`, `docs/research/BUILD_AN_AI.md`

## Decision
- **Local model:** Qwen3.5-4B Q4_K_M GGUF (2.74 GB, Apache-2.0) run in-process by `node-llama-cpp` (prebuilt llama.cpp for Metal/CUDA/Vulkan/CPU). Output is constrained by a GBNF grammar compiled from our JSON schemas, so it always parses, and segment ids are enums, so citations always point at real segments. Thinking is discouraged through the Qwen chat template (a 0 thought budget swallowed the first JSON token).
- **Providers:** Anthropic (tool use), OpenAI and OpenRouter (strict `json_schema`), Gemini (`responseSchema`). Defaults: `claude-sonnet-5-5`, `gpt-6.1-terra`, `gemini-3.8-flash`, `openrouter/auto`; any model id can be chosen (`openrouter:anthropic/claude-sonnet-5.5`).
- **Floor:** an extractive pipeline (TextRank + structure priors + clause-aware trimming) that needs no model and is faithful by construction. Every model stage falls back to it, so a video is always made.
- `auto` = the free local path. A provider is used only when the user picks it.

## Why
- Zero keys must still give a good video. Qwen3.5-4B writes clearly better scripts than the floor (see EVALS), fits in the 8 GB budget and runs at ~25 tok/s on this laptop.
- `node-llama-cpp` means no separate server and no extra install step.
- On this machine the GGUF already exists (LachedInAI); `bridge models link` points to it instead of downloading 2.7 GB again.
