# Bridge research: language models, providers, sign-in and key storage

Status: research input for ADRs. Written 2026-11-03.

Evidence labels:

- **[verified]**: I opened the source this session. The URL is given.
- **[verified npm]**: `npm view … --registry=https://registry.npmjs.org/` on 2026-11-03.
- **[recalled]**: prior knowledge, not re-checked.
- **[unverified]**: a lead only.
- **[estimate]**: my arithmetic or reasoning.

---

## 1. The job the model does

1. **Read** a source: a pasted text, a 10-page paper (about 8–12k tokens), or a project README plus a file tree.
2. **Extract** the key ideas, each with the source segments that support it.
3. **Write a script** that fits a word budget, for example 20 s ≈ 50 words and 3 min ≈ 450 words at ~150 wpm **[estimate]**. The script is split into beats, each with a visual intent and the citation ids it relies on.
4. **Output strict JSON** matching Bridge's zod schema.
5. **Stay faithful.** No invented numbers or names. Bridge's faithfulness gate checks this, but a model that follows instructions well reduces rewrites.

What matters most locally: instruction following and JSON reliability, faithful summarisation, a usable context of ≥ 16k tokens, and speed of prompt processing (prefill) on CPU laptops. Raw reasoning benchmarks matter less.

---

## 2. Local open models (≤ ~5 GB quantized)

### 2.1 Candidates

| Model | Released | Params | Licence | Context | Q4_K_M size | Notes |
|---|---|---|---|---|---|---|
| **Qwen3.5-4B** | Feb 2026 **[verified]** | "4B" (Safetensors metadata says 5B, which includes the vision encoder) **[verified]** | **Apache-2.0** **[verified]** | **262,144** native, ~1M with YaRN **[verified]** | **2.74 GB** (unsloth); Q5_K_M 3.14 GB, Q8_0 4.48 GB, UD-Q4_K_XL 2.91 GB **[verified]** (https://huggingface.co/unsloth/Qwen3.5-4B-GGUF) | Thinking on by default, switch off with `enable_thinking: False`. **Multimodal (vision)**. MMLU-Pro 79.1, IFEval 89.8, GPQA-D 76.2, OmniDocBench1.5 86.2 **[verified]** (https://huggingface.co/Qwen/Qwen3.5-4B). Already on this machine (2.7 GB). |
| Qwen3.5-2B / 0.8B | 2026-02-28 **[verified]** | 2B / 0.8B | Apache-2.0 **[recalled, same family]** | Long | ~1.3 GB / ~0.6 GB **[estimate]** | Low-end fallback and a fast "draft" model. |
| Qwen3.5-9B | 2026-02-27 **[verified]** | 9B | Apache-2.0 | Long | ~5.5–6 GB **[estimate]** | Above the 5 GB target. "Quality mode" on 32 GB+ machines only. |
| **Gemma 4 E4B-it** | 2026-03-02 **[verified]** | 4.5B effective / 8B with embeddings **[verified]** | **Apache-2.0** (a change from Gemma 3's custom terms) **[verified]** (https://huggingface.co/google/gemma-4-E4B-it) | 128K **[verified]** | ~4–5 GB **[estimate; the 8B total counts]** | Text + image + audio (≤ 30 s) + video in. MMLU-Pro 69.4, GPQA-D 58.6, MRCR-8-needle-128K 25.4 **[verified]**. No IFEval reported. |
| Gemma 4 E2B-it | 2026-03-02 **[verified]** | ~2B effective | Apache-2.0 **[verified family]** | 128K **[recalled]** | ~2.5–3 GB **[estimate]** | Low-end alternative. |
| Gemma 4 12B / 26B-A4B | 2026-03/05 **[verified]** | 12B; 26B MoE (4B active) | Apache-2.0 | 128K+ | 7–16 GB | Too big for the budget. |
| LiquidAI LFM3-1.7B | Oct 2026 **[verified]** | 1.7B | "lfm1.0" licence **[verified]**; the LFM Open License has a revenue threshold (~$10M) **[recalled]** | ? | **1.1 GB** Q4_K_M **[verified]** | Needs llama.cpp ≥ b11960 **[verified]**. Licence is not OSI. Trending. |
| NVIDIA Nemotron-3.5-Bolt-E4B | Oct 2026 (GGUF) **[verified]** | "E4B" | NVIDIA open model licence **[unverified]** | ? | ? | Trending. Evaluate later. |
| Ministral 3 3B (2512) | Nov 2025 **[verified]** | 3B | Apache-2.0 **[recalled]** | 128–256K **[recalled]** | ~2 GB | Mistral has published no newer small chat models on HF since **[verified]**. |
| Phi-4-mini-instruct | Feb 2025 **[recalled]** | 3.8B | MIT **[recalled]** | 128K | ~2.4 GB | Good at reasoning, weaker writing style. Superseded. |
| Llama 3.2 3B | Sep 2024 **[recalled]** | 3.2B | Llama 3.2 Community (custom, AUP) **[recalled]** | 128K | ~2 GB | Dated and the licence is not open. Skip. |
| SmolLM3-3B | Jul 2025 **[recalled]** | 3B | Apache-2.0 **[recalled]** | 64K (128K YaRN) **[recalled]** | ~1.9 GB | Fully open training recipe. Weaker than Qwen3.5-4B. |
| IBM Granite 4.x Micro/Tiny | Oct 2025 onward **[recalled]** | 3B / 7B-A1B hybrid | Apache-2.0 **[recalled]** | 128K | 2–4 GB | Strong instruction following and enterprise tone. Hybrid Mamba needs a recent llama.cpp. |

The HF trending GGUF list of 2026-11-03 is dominated by LFM3 (1.7B/2B), Qwen3.5-9B fine-tunes and Nemotron-3.5-Bolt-E4B **[verified]** (https://huggingface.co/api/models?search=GGUF&sort=trendingScore). There is no Qwen3.6 or Qwen4 small model on the Qwen HF org as of today **[verified]**.

### 2.2 Quality vs size: the shortlist

- **Qwen3.5-4B** leads the ≤ 5 GB class on published numbers: MMLU-Pro 79.1 vs Gemma 4 E4B 69.4; GPQA-D 76.2 vs 58.6 **[verified, model cards]**. It also has the longest native context and the smallest file of the two. The benchmarks are vendor-reported, so Bridge's own eval set (`evals/`) must decide.
- **Gemma 4 E4B** is the natural second opinion. It is Apache-2.0, has native vision and audio, and Google models tend to write fluent, plain English **[recalled]**. Its size (8B total parameters) makes the file larger.
- **Qwen3.5-2B** is the fallback for 8 GB-RAM laptops.

### 2.3 Speed

Rules of thumb **[recalled + estimate]**:

| Machine | Qwen3.5-4B Q4_K_M prefill | Decode | 10k-token paper → 600-token script |
|---|---|---|---|
| M4 Pro, Metal (node-llama-cpp `mac-arm64-metal`) | ~800–2,000 tok/s | ~50–90 tok/s | ~6–13 s prefill + ~7–12 s decode ≈ **15–25 s** |
| M1/M2 base, Metal | ~300–700 tok/s | ~25–40 tok/s | ≈ 30–55 s |
| 4-core x86 laptop, CPU only (AVX2) | ~40–120 tok/s | ~6–12 tok/s | 80–250 s prefill + 50–100 s decode ≈ **2–6 min** |
| Same laptop with Vulkan iGPU (`win-x64-vulkan` / `linux-x64-vulkan`) | ~150–400 tok/s | ~10–20 tok/s | ≈ 1–2 min |

Implications:

- **Prefill dominates on CPU-only laptops.** Bridge should not feed a whole paper to the local model in one prompt on slow machines. Use the extractive core (`src/core/analyze`, TextRank) to select the top ~3–5k tokens of segments first. Then (a) ask the LLM to plan ideas from those segments and (b) write the script. Each segment keeps its id for citations.
- **Turn thinking off** (`enable_thinking: False`) for planning and writing. With thinking on, the model writes thousands of hidden tokens before answering, which costs minutes on CPU **[recalled behaviour of Qwen3 hybrid thinking]**. Unsloth's recommended non-thinking sampling: temperature 0.7, top_p 0.8, top_k 20, presence_penalty 1.5 **[verified]**. For JSON with a grammar, use a lower temperature (0.3–0.5) **[recalled practice]**.
- **KV cache:** an 8k-token context on a 4B model takes a few hundred MB, which is fine. Do not set 262k context on a 16 GB laptop. Cap it at 16k or 32k **[recalled]**.
- **Architecture check.** Qwen3.5 may use a hybrid attention design that needs a recent llama.cpp **[unverified]**. Before committing, confirm that `node-llama-cpp@3.22.2`'s bundled llama.cpp loads `Qwen3.5-4B-Q4_K_M.gguf`. The sibling project or `npx node-llama-cpp inspect gguf` can show this.

### 2.4 Structured JSON output

- **node-llama-cpp:** `llama.createGrammarForJsonSchema(schema)` turns a JSON schema into a GBNF grammar, and `session.prompt(text, {grammar})` constrains decoding. Then `grammar.parse(res)`. Only a **subset** of JSON Schema is supported (see the `GbnfJsonSchema` type): `object`, `array`, `enum`, `oneOf`, `const`, string/number types. Some features are excluded on purpose because they cause hallucinations. The docs advise explaining constraints in the prompt, using self-explanatory keys, and setting `maxTokens`, because some grammars may not stop. **Grammar and function calling can't be combined in one prompt** **[verified]** (https://node-llama-cpp.withcat.ai/guide/grammar).
- **Bridge practice:**
  - Generate the JSON schema from the zod schema (`zod-to-json-schema`), stripping unsupported keywords such as `minLength` and `pattern`.
  - Validate with zod afterwards and repair once.
  - Keep strings short: beats of at most N words, enforced in the prompt and checked afterwards.
  - Use stable key names that tell the model what to write (`"narrationText"`, `"citedSegmentIds"`).
- **llama-server:** `response_format: {type: "json_schema", …}` / `json_schema` on `/v1/chat/completions` **[recalled]**.
- **Ollama:** `format: <json schema>` structured outputs **[recalled]**.
- **Providers:** Anthropic structured outputs / tool-use schemas, OpenAI `response_format: json_schema` (strict), Gemini `responseSchema`, OpenRouter passes `response_format` through to models that support it **[recalled]**.

---

## 3. Local runtimes

| Runtime | How Bridge would use it | Install story | JSON constraint | Verdict |
|---|---|---|---|---|
| **node-llama-cpp 3.22.2** (MIT) | In-process from Node | `npm i`. Prebuilt packages: `mac-arm64-metal` (18.7 MB), `mac-x64`, `linux-x64`/`arm64`/`armv7l`/`riscv64`, `win-x64`/`arm64`, `*-cuda`, `*-cuda-ext`, `*-vulkan` **[verified npm]**. `engines: node >= 20.0.0` **[verified npm]**. Falls back to downloading llama.cpp and building with cmake. `NODE_LLAMA_CPP_SKIP_DOWNLOAD=true` disables that **[verified]** (https://github.com/withcatai/node-llama-cpp) | JSON-schema → GBNF **[verified]** | **Use as default.** |
| llama.cpp `llama-server` (MIT) | HTTP on localhost, OpenAI-compatible | `brew install llama.cpp` (present on this machine), or release zips for Windows/Linux **[recalled]** | `json_schema`, GBNF | Optional "external runtime" adapter. Useful for vision (`--mmproj`) if node-llama-cpp lacks it. |
| Ollama (MIT) | HTTP on `127.0.0.1:11434` | Separate installer **[recalled]** | `format` schema **[recalled]** | Adapter: if the user already has Ollama, use their models. |
| LM Studio | HTTP (OpenAI-compatible) | Proprietary free app **[recalled]** | JSON schema **[recalled]** | Adapter via the generic OpenAI-compatible client. |
| MLX / mlx-lm | Python, macOS only | pip **[recalled]** | Outlines-style | Reject (Python, Mac only). |
| WebLLM (Apache-2.0) | In the browser via WebGPU | Model in MLC format, cached in the browser **[recalled]** | JSON mode / grammar **[recalled]** | Maybe later for a browser-only demo. Not for the Node renderer. |

**Generic OpenAI-compatible adapter:** one client covers llama-server, Ollama (`/v1`), LM Studio, OpenRouter and HF router. Base URL plus optional key. Localhost targets are allowed without a key.

---

## 4. Optional local vision and OCR

| Need | Option | Size | Licence | Runtime |
|---|---|---|---|---|
| Describe a chart, diagram or photo | **Qwen3.5-4B itself** (vision encoder built in) **[verified multimodal]** + its `mmproj` GGUF | +~0.6–1 GB mmproj **[estimate]**; the unsloth page I fetched did not list it **[verified absence]** | Apache-2.0 | llama.cpp `llama-server --mmproj` / `llama-mtmd-cli`. node-llama-cpp's multimodal support is **[unverified]**, so check before relying on it. |
| | Gemma 4 E4B (image + audio in) **[verified]** | 4–5 GB | Apache-2.0 | llama.cpp with mmproj **[unverified]** |
| | SmolVLM-256M/500M, Moondream 2, Florence-2 | 0.2–2 GB | Apache-2.0 / MIT **[recalled]** | `@huggingface/transformers` 4.3.2 (Apache-2.0) in Node via onnxruntime-node **[verified npm version]** |
| OCR of screenshots and scanned PDFs | **tesseract.js 7.0.0** | ~1.4 MB package + ~10–20 MB per language traineddata **[verified npm size; recalled data size]** | Apache-2.0 **[verified npm]** | Pure WASM, all platforms |

Recommendation: tesseract.js for text in images (always on, cheap). Vision captioning only when the user opts in to download the mmproj. Reuse Qwen3.5-4B so the image path adds under 1 GB rather than a second model. Fall back to transformers.js Florence-2 or SmolVLM if node-llama-cpp can't load mmproj.

**Disk budget check:** Qwen3.5-4B Q4_K_M 2.74 GB + mmproj ~0.7 GB + Kokoro fp32 0.33 GB + whisper base.en ~0.15 GB + tesseract eng ~0.02 GB ≈ **3.9 GB**, well under 8 GB **[estimate]**. Adding Gemma 4 E4B as an alternative brings it to ≈ 8.5 GB, so offer one local LLM at a time.

---

## 5. Provider models (bring your own key), November 2026

### 5.1 Anthropic

Verified at https://platform.claude.com/docs/en/docs/about-claude/models/overview **[verified]**. All current models have 1M context and 128K max output.

| Model | API id | Price per 1M input / output |
|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | $10 / $50 |
| Claude Opus 5.5 | `claude-opus-5-5` | $4 / $20 |
| **Claude Sonnet 5.5** | `claude-sonnet-5-5` | **$2 / $10** |
| **Claude Haiku 5.5** | `claude-haiku-5-5` | **from $0.10 / from $0.50** |

Batch is −50%. Cache reads cost 5–10% of the input price **[verified]**.

**Bridge defaults:**

- Planning and script: `claude-sonnet-5-5`.
- Cheap mode, faithfulness checks and extraction: `claude-haiku-5-5`.
- Cost of a 10-page paper (12k in, 2k out): Sonnet ≈ $0.044, Haiku ≈ $0.002 **[estimate]**.

### 5.2 OpenAI

Verified at https://developers.openai.com/api/docs/pricing, standard tier per 1M tokens **[verified]**:

| Model | Input / output |
|---|---|
| `gpt-6-astra` | $10 / $50 |
| `gpt-6.1-sol` | $2 / $10 |
| `gpt-6.1-terra` | $1 / $5 |
| `gpt-6-luna` | $0.10 / $0.50 |
| `gpt-5.6-luna` | $0.20 / $1.20 |
| `gpt-5-mini` | $0.25 / $2.00 |
| `gpt-5-nano` | $0.05 / $0.40 |

**Bridge defaults:** `gpt-6.1-terra` (quality per dollar) for scripts and `gpt-6-luna` for cheap mode. Verify JSON-schema strict-mode support for these ids at integration time **[unverified]**.

### 5.3 Google Gemini

Verified at https://aistudio.google.com/docs/pricing, standard tier per 1M tokens **[verified]**:

| Model | Free tier | Input / output | Notes |
|---|---|---|---|
| `gemini-3.8-flash` | Yes | $0.75 / $3.75 | Doubles to $1.50 / $7.50 from 2027-01-01 |
| `gemini-3.5-flash-lite` | Yes | $0.30 / $2.50 | |
| `gemini-3.1-flash-lite` | Yes | $0.25 / $1.50 | |
| `gemini-3.1-pro-preview` | No | $2 / $12 (≤ 200k) | |

Gemini 2.5 Pro and 2.5 Flash are marked deprecated **[verified]**.

**Bridge defaults:** `gemini-3.8-flash` for quality and `gemini-3.5-flash-lite` for cheap mode. The **free tier makes Gemini the best "first key" to recommend to users** (rate-limited, and free-tier data may be used to improve Google products **[recalled]**; say so in the UI).

### 5.4 OpenRouter

- One key, many models. Model ids look like `anthropic/claude-sonnet-5.5`, `google/gemini-3.8-flash`, `qwen/qwen3.5-…` **[unverified exact slugs; fetch `GET /api/v1/models` at runtime]**.
- **Free models** (`:free` suffix) are limited to **20 requests per minute**. The daily cap is **50 requests per day if the account has bought fewer than 10 credits, 1,000 per day with ≥ 10 credits** **[verified]** (https://openrouter.ai/docs/api-reference/limits). Bridge makes ~3–6 LLM calls per video, so a free account allows roughly 8–15 videos per day **[estimate]**.
- `GET /api/v1/key` returns `limit`, `limit_remaining`, `usage`, `usage_daily`/`weekly`/`monthly`, `is_free_tier` and `free_model_daily_requests {used, limit, remaining}`. Use it to show the user their balance **[verified]**.
- **Bridge default:** let the user pick from a curated list fetched at runtime. Defaults are the Sonnet or Gemini Flash equivalents, plus a "free model" option.

---

## 6. Sign-in ("link your account") research

### 6.1 OpenRouter OAuth PKCE: real, documented, works for local apps

All of the following is **[verified]** at https://openrouter.ai/docs/use-cases/oauth-pkce.

1. **Authorise:** redirect the browser to
   `https://openrouter.ai/auth?callback_url=<url>&code_challenge=<b64url(sha256(verifier))>&code_challenge_method=S256&state=<random>`.
   - Optional parameters: `key_label` (prefills the key's name), `workspace_id`, `required_workspace_id` (locks the key to a workspace and overrides `workspace_id`), `state` (returned unchanged for CSRF protection).
   - `code_challenge` is "optional but recommended". Methods are `S256`, `plain`, or none.
2. **Callback:** OpenRouter redirects to `callback_url?code=…` (plus `state`).
   - **Localhost is allowed on any port**; the example is `http://localhost:51423/callback`.
   - Localhost apps get a title from host:port and don't appear in the marketplace or rankings.
   - For attribution, a public URL (project site or GitHub repo) is recommended.
   - **Headless mode:** omit `callback_url` and the code is shown on screen for the user to paste. A `code_challenge` is *required* in that mode.
3. **Exchange:** `POST https://openrouter.ai/api/v1/auth/keys` with JSON `{code, code_verifier, code_challenge_method}` returns `{ key }`.
   - The code is single-use and **expires 10 minutes** after issue.
   - Errors: 400 for a mismatched method, 403 for a bad code or verifier, 403 for an expired code, 405 unless the request is a POST over HTTPS.
4. **The result is an ordinary OpenRouter API key.** No expiry or spending-limit parameters are documented for the flow **[verified absence]**. The user can view, limit and revoke it in their OpenRouter settings. Bridge stores it exactly like a pasted key.
5. **Bridge implementation:**
   - Callback URL: `http://localhost:7411/oauth/openrouter/callback`. The server's Host allowlist must then include `localhost:7411` as well as `127.0.0.1:7411`. Whether OpenRouter accepts `127.0.0.1` as the host is **[unverified]**; `localhost` is documented.
   - Generate a 64-byte verifier and the `state` on the server, held in memory for at most 10 minutes. Check `state` on callback, exchange, then store the key in the keychain.
   - Set `key_label=Bridge (<hostname>)`.
   - Offer headless mode for a CLI-only `bridge keys login openrouter`.

### 6.2 Hugging Face, "Sign in with HF": real OAuth/OIDC, PKCE public clients

All **[verified]** at https://huggingface.co/docs/hub/oauth.

- Create an OAuth app in HF settings. **Public apps with no client secret** are supported for "native apps, CLIs", authenticating with the client id plus PKCE (authorisation-code or device-code flow).
- **Loopback redirect rule (RFC 8252):** for `http://localhost`, `http://127.0.0.1` or `http://[::1]`, **any port is accepted** as long as the rest matches a registered URI, e.g. register `http://localhost/callback`. Hosts are matched individually, so register both localhost and 127.0.0.1.
- **Device code flow:** `POST https://huggingface.co/oauth/device`, then `POST https://huggingface.co/oauth/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code`.
- Authorise URL: `https://huggingface.co/oauth/authorize?client_id=…&redirect_uri=…&scope=openid%20profile&state=…`.
- **Scope `inference-api`:** "Make inference requests to Inference Providers on behalf of the user."
- **Credits:** **free users get no monthly credits** (they must buy credits). **PRO users get $2.00 per month**. Team/Enterprise get $2.00 per seat. Routed requests are billed at provider cost with no markup **[verified]** (https://huggingface.co/docs/inference-providers/pricing). The router is OpenAI-compatible at `https://router.huggingface.co/v1` **[verified]**.
- **Verdict:** a genuine "link your account" option and licence-friendly for an open-source app (no secret to ship). It only gives free inference to PRO users or users with purchased credits. It is a nice second sign-in after OpenRouter, and it can also authenticate model downloads for gated repos (`gated-repos` scope).

### 6.3 Google (Gemini API via OAuth): possible, impractical for v1

- Requires a **Google Cloud project** with the Generative Language API enabled, an OAuth consent screen (External, with test users), and an OAuth client of type **"Desktop app"**. Scopes used in the guide: `cloud-platform` and `generative-language.retriever`. The guide calls the setup "appropriate for a testing environment"; production apps need Google's verification review **[verified]** (https://aistudio.google.com/docs/oauth).
- The curl example sends `x-goog-user-project`, which implies billing goes to a GCP project rather than a simple per-user AI Studio key **[verified header; billing implication recalled]**.
- For an open-source app, Bridge would have to own a verified Google OAuth client. Sensitive or restricted scopes like `cloud-platform` trigger a heavy verification process, and every user would need a GCP project **[recalled]**.
- **Verdict:** no. Link to AI Studio "Get API key" (free tier) and let the user paste the key.

### 6.4 OpenAI: no third-party OAuth for API access

- OpenAI exposes no public OAuth flow that lets third-party apps obtain API credentials billed to the user **[recalled]**.
- "Sign in with ChatGPT" exists for OpenAI's own Codex CLI and for apps inside ChatGPT, not for third-party apps calling the API **[recalled / unverified for late 2026]**.
- **Verdict:** paste a key (suggest a project key with a spending limit).

### 6.5 Anthropic: explicitly not allowed

- **"Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users … developers may not collect, store, or intermediate Claude.ai credentials or session tokens."** Developers "should use API key authentication through Claude Console" **[verified]** (https://code.claude.com/docs/en/legal-and-compliance).
- The Consumer Terms also bar access "through automated or non-human means … unless you use an Anthropic API key" **[verified]** (https://www.anthropic.com/legal/consumer-terms).
- **Verdict:** API key only. Never read Claude Code's stored OAuth tokens. Users with only a Claude subscription can use Claude models through OpenRouter (pay-as-you-go) instead.

### 6.6 ElevenLabs: API key only

- Authentication is the `xi-api-key` header, plus single-use tokens for client-side use of specific endpoints. Keys support **scope restriction, credit quotas and IP allowlists** **[verified]** (https://elevenlabs.io/docs/api-reference/authentication). No OAuth was documented on that page.
- **Verdict:** paste a key. The UI should suggest a TTS-only key with a credit quota.

### 6.7 GitHub Models: gone

- "GitHub Models was **fully retired as of July 30, 2026**": playground, catalogue, inference API and BYOK are "no longer available to any customer" **[verified]** (https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models).
- **Verdict:** drop it from the plan.

### 6.8 Summary

| Provider | Real user OAuth usable by a local third-party app? | Bridge path |
|---|---|---|
| **OpenRouter** | **Yes**: PKCE, localhost any port, returns an API key | "Sign in with OpenRouter" (primary) |
| **Hugging Face** | **Yes**: OIDC + PKCE public client, loopback any port, device flow, `inference-api` scope | Optional "Sign in with HF". Free credits only for PRO ($2/month) |
| Google Gemini | Technically yes, but needs a verified GCP OAuth client + GCP project | Paste AI Studio key |
| OpenAI | No | Paste key |
| Anthropic | **Prohibited** for subscription OAuth | Paste API key |
| ElevenLabs | No (scoped keys instead) | Paste a scoped key |
| GitHub Models | Retired 2026-07-30 | n/a |

---

## 7. Storing keys on the user's machine

### 7.1 Libraries

| Option | Status | Notes |
|---|---|---|
| **`@napi-rs/keyring` 2.1.2** | MIT, modified 2026-10-19 **[verified npm]** | Prebuilt for darwin x64/arm64, linux x64/arm64 (gnu+musl), armv7, riscv64, win32 x64/ia32/arm64, freebsd x64 **[verified npm]**. API: `new Entry(service, account)` with `setPassword`/`getPassword`/`deletePassword`, `AsyncEntry`, `Entry.withTarget`. Described as "100% compatible node-keytar alternative" **[verified]** (https://github.com/Brooooooklyn/keyring-node). Linux: tries **Secret Service** (gnome-keyring, KWallet, KeePassXC) first and **falls back to kernel keyutils**, which "will not persist across reboots". Pin with `{ linux: { store: 'secret-service' } }` to throw instead of falling back **[verified]**. Linux binaries statically link libdbus (AFL-2.1 OR GPL-2.0-or-later) **[verified]**. |
| `keytar` 7.9.0 | **Archived 2022-12-15**, read-only **[verified]** (https://github.com/atom/node-keytar) | Needs libsecret dev headers to build on Linux **[verified]**. Reject. |
| 0600 file `~/.bridge/secrets/<provider>.json` | n/a | POSIX: create the directory 0700 and the file 0600 with `O_EXCL`, then fsync and rename. Windows: `chmod` is meaningless; the file under `%USERPROFILE%` inherits user-only ACLs by default **[recalled]**. Optionally encrypt with DPAPI (needs a native module or a PowerShell call) **[recalled]**. |

### 7.2 Recommended policy

1. **Try the keychain first:** macOS Keychain, Windows Credential Manager, Linux Secret Service.
   - On Linux, **pin `store: 'secret-service'`** so a missing service throws instead of silently storing in non-persistent keyutils, which would "lose" keys after a reboot.
   - Service name `bridge`, account `<provider>`.
2. **On failure** (headless Linux, WSL, containers), fall back to the **0600 file**. Tell the user once: "Saved to ~/.bridge/secrets (file permissions 0600) because no system keychain was available."
3. **Never** write keys to job files, logs, crash reports, SSE events or API responses. Responses show only `sk-…abcd` (mask all but the last 4 characters).
4. Redact any string matching known key patterns in the logger (`sk-`, `sk-ant-`, `sk-or-`, `AIza`, `hf_`, ElevenLabs 32-hex keys) as defence in depth.
5. Outbound requests attach a key only when the request host matches that provider's allowlisted host: `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`, `api.elevenlabs.io`, `openrouter.ai`, `router.huggingface.co`.

This matches CLAUDE.md rule 2 and the tentative choice.

### 7.3 Localhost server threats and mitigations

Threats to a server on `127.0.0.1:7411` that holds keys **[recalled]**:

- **DNS rebinding:** a malicious site resolves `evil.example` to 127.0.0.1, so the victim's browser sends same-origin requests to Bridge with `Host: evil.example:7411`. Similar bugs have hit local dev servers and LLM runtimes.
- **CSRF:** cross-site form posts or `fetch` with `mode: no-cors` reach Bridge's endpoints, for example to start renders, change settings, or trigger an OAuth exchange.
- **Other local processes** can always reach 127.0.0.1. This is out of scope, but don't make it easy.

Mitigations (all cheap; implement in `src/server` middleware):

1. **Bind to `127.0.0.1` only.** Never `0.0.0.0` or `::`.
2. **Host header allowlist:** exactly `127.0.0.1:7411` and `localhost:7411` (plus 7412 in dev). Reject anything else with 421/403. This alone defeats DNS rebinding, because the rebinding page's Host is the attacker's name **[recalled]**.
3. **Origin check:** for every non-GET request, and for any request carrying an `Origin` header, require Origin ∈ {`http://127.0.0.1:7411`, `http://localhost:7411`}. Also reject `Sec-Fetch-Site: cross-site` **[recalled]**.
4. **Per-session token:** at startup, generate a random 32-byte token. Inject it into the served HTML (meta tag) or set it as an `HttpOnly; SameSite=Strict` cookie. Require it as an `X-Bridge-Token` header on all API calls. A custom header forces a CORS preflight, which Bridge never approves. The CLI reads the token from `~/.bridge/session` (0600).
5. **No CORS headers at all.** No `Access-Control-Allow-Origin`.
6. **Content-Type enforcement:** JSON endpoints accept only `application/json`, which blocks simple-request CSRF.
7. **Keys are write-only through the API:** `PUT /api/keys/:provider` accepts a key; `GET` returns `{present: true, masked: "…abcd"}` only.
8. **OAuth callback:** validate `state` (constant-time compare), single use, 10-minute expiry. The callback route is the one GET that triggers a side effect, and it is guarded by `state`.
9. **SSE/WebSocket:** same Host, Origin and token checks. Browsers send Origin on WebSocket upgrades **[recalled]**.
10. Chrome's Private/Local Network Access protections (permission prompts for public sites reaching localhost) help, but don't rely on them **[recalled; rollout details unverified]**.

---

## 8. Recommendations

1. **Local LLM: Qwen3.5-4B Q4_K_M (2.74 GB, Apache-2.0, 262k context, vision-capable) via node-llama-cpp 3.22.x**, thinking off, JSON-schema grammar, context capped at 16–32k.
   - Low-RAM fallback: **Qwen3.5-2B**.
   - A/B candidate on the eval set: **Gemma 4 E4B** (Apache-2.0).
   - Pre-select segments extractively so the local prompt stays ≤ ~5k tokens on CPU-only machines.
2. **Verify on day 1** that node-llama-cpp 3.22.2's bundled llama.cpp loads the Qwen3.5 GGUF. If it doesn't, pin a newer node-llama-cpp or use the `llama-server` adapter.
3. **Runtime adapters:** in-process node-llama-cpp (default) + a generic OpenAI-compatible client (llama-server, Ollama, LM Studio, OpenRouter, HF router).
4. **Vision and OCR:** tesseract.js always. Optional Qwen3.5-4B mmproj (llama-server if node-llama-cpp can't do vision) or a transformers.js small VLM.
5. **Provider defaults:**

   | Provider | Default | Cheap |
   |---|---|---|
   | Anthropic | `claude-sonnet-5-5` | `claude-haiku-5-5` |
   | OpenAI | `gpt-6.1-terra` | `gpt-6-luna` |
   | Gemini | `gemini-3.8-flash` | `gemini-3.5-flash-lite` (free tier; watch the 2027-01-01 price doubling) |
   | OpenRouter | runtime-fetched list | "free models" toggle (20 rpm, 50 or 1,000/day) |

6. **Sign-in:**
   - **OpenRouter PKCE** as the main "link your account" path.
   - **HF OAuth** as an optional second path (public client, any loopback port).
   - Everyone else uses pasted keys.
   - **Never** use Claude subscription OAuth (prohibited).
   - Drop GitHub Models (retired).
7. **Key storage:** `@napi-rs/keyring` with Linux pinned to Secret Service. 0600 file fallback in `~/.bridge/secrets`. keytar is archived.
8. **Localhost hardening:** 127.0.0.1 bind, Host allowlist, Origin and Sec-Fetch-Site checks, per-session token header, no CORS, write-only keys.

None of the tentative choices is contradicted. Flags:

- (a) Confirm Qwen3.5 GGUF support in node-llama-cpp's bundled llama.cpp.
- (b) Pin `secret-service` on Linux, or keys silently go to non-persistent keyutils.
- (c) The OpenRouter callback must use `localhost`, so allowlist `localhost:7411` in the Host check.
- (d) Turn Qwen thinking mode off, or CPU laptops will take minutes per script.

---

## 9. Draft ADRs

```
# ADR-00Z: Local script model = Qwen3.5-4B (Q4_K_M) in-process via node-llama-cpp

Status: Proposed — Date: 2026-11-03

## Context
The zero-key path needs a local model that summarises 8–12k-token sources faithfully and
emits schema-valid JSON scripts, within a ≤ 5 GB model budget, on Mac/Windows/Linux, with
npm-only install. Qwen3.5-4B (Feb 2026, Apache-2.0, 262k ctx, vision) reports MMLU-Pro 79.1 /
IFEval 89.8; Gemma 4 E4B (Apache-2.0) 69.4 MMLU-Pro and is ~8B total params. node-llama-cpp
3.22 (MIT, node ≥ 20) ships prebuilt Metal/CUDA/Vulkan/CPU binaries for 14 targets and
constrains output with JSON-schema→GBNF grammars.

## Decision
- Default local model: Qwen3.5-4B-Q4_K_M.gguf (2.74 GB), reusing an existing local copy by
  path when present; fallback Qwen3.5-2B for < 12 GB RAM; Gemma 4 E4B as an eval-time A/B.
- Runtime: node-llama-cpp in-process; thinking disabled; temperature 0.3–0.5 with grammar;
  context capped at 16k (32k on ≥ 32 GB RAM).
- Two-stage generation on extractively pre-selected segments (≤ ~5k tokens on CPU-only).
- Generic OpenAI-compatible adapter for llama-server / Ollama / LM Studio.
- Output validated by zod; one repair attempt; then faithfulness gate.

## Consequences
+ Fully offline, Apache/MIT licences, single 2.7 GB file; same model can do vision via mmproj.
− CPU-only laptops take ~2–6 min per script; mitigated by segment pre-selection and 2B fallback.
− Must verify llama.cpp support for the Qwen3.5 architecture in node-llama-cpp's bundled build.
```

```
# ADR-00W: Provider sign-in and key storage

Status: Proposed — Date: 2026-11-03

## Context
Users bring their own keys for Anthropic, OpenAI, Google, ElevenLabs, OpenRouter. Only
OpenRouter (OAuth PKCE, localhost callback any port, returns a normal API key) and Hugging Face
(OIDC + PKCE public client, loopback any port, inference-api scope) offer real third-party
sign-in. Anthropic prohibits third-party use of Claude.ai/subscription OAuth. Google's Gemini
OAuth needs a verified GCP OAuth client and a GCP project. GitHub Models retired 2026-07-30.
keytar is archived (2022-12-15); @napi-rs/keyring (MIT) is maintained with 12 prebuilt targets,
but on Linux silently falls back to non-persistent keyutils unless pinned.

## Decision
- "Sign in with OpenRouter" via PKCE S256, callback http://localhost:7411/oauth/openrouter/callback,
  state + verifier held in memory ≤ 10 min, key_label "Bridge (<host>)"; headless code-paste mode
  for the CLI. Optional "Sign in with Hugging Face" (public client, PKCE, scopes openid profile
  inference-api).
- All other providers: paste a key (UI links to the provider's key page and suggests scoped /
  quota-limited keys).
- Storage: @napi-rs/keyring (service "bridge", account = provider); Linux pinned to
  secret-service; on failure, ~/.bridge/secrets/<provider> (dir 0700, file 0600, atomic write).
- Keys are write-only via the API, masked in responses, redacted in logs, sent only to the
  provider's allowlisted host.
- Server: bind 127.0.0.1:7411; Host allowlist {127.0.0.1:7411, localhost:7411}; Origin and
  Sec-Fetch-Site checks; per-session X-Bridge-Token; no CORS; JSON-only bodies.

## Consequences
+ One-click account linking for the most flexible provider; no secrets shipped in the repo.
+ DNS-rebinding and CSRF closed by Host/Origin/token checks.
− Users of Anthropic/OpenAI/Google/ElevenLabs must still paste keys.
− Linux users without a keyring get a file-based store (documented, 0600).
```

---

## Sources opened this session

- https://huggingface.co/Qwen/Qwen3.5-4B · https://huggingface.co/unsloth/Qwen3.5-4B-GGUF
- https://huggingface.co/api/models?author=Qwen&search=Qwen3.5 · …author=google&search=gemma · …author=mistralai · …search=GGUF&sort=trendingScore
- https://huggingface.co/google/gemma-4-E4B-it · https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF
- https://node-llama-cpp.withcat.ai/guide/grammar · https://github.com/withcatai/node-llama-cpp
- https://platform.claude.com/docs/en/docs/about-claude/models/overview
- https://developers.openai.com/api/docs/pricing · https://aistudio.google.com/docs/pricing
- https://openrouter.ai/docs/use-cases/oauth-pkce · https://openrouter.ai/docs/api-reference/limits
- https://huggingface.co/docs/hub/oauth · https://huggingface.co/docs/inference-providers/pricing
- https://aistudio.google.com/docs/oauth
- https://code.claude.com/docs/en/legal-and-compliance · https://www.anthropic.com/legal/consumer-terms
- https://elevenlabs.io/docs/api-reference/authentication
- https://docs.github.com/en/github-models/use-github-models/prototyping-with-ai-models
- https://github.com/atom/node-keytar · https://github.com/Brooooooklyn/keyring-node
- npm metadata: node-llama-cpp (+ optional binaries), @napi-rs/keyring, keytar, tesseract.js, @huggingface/transformers
