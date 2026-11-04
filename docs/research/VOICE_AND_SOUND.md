# Bridge research: voice, music and sound

Status: research input for an ADR. Written 2026-11-03.

Evidence labels:

- **[verified]**: I opened the source this session. The URL is given.
- **[verified npm]**: from `npm view … --registry=https://registry.npmjs.org/` on 2026-11-03.
- **[measured-sibling]**: numbers the owner measured in a sibling project on this M4 Pro.
- **[recalled]**: from prior knowledge, not re-checked.
- **[unverified]**: a lead only.
- **[estimate]**: my own arithmetic.

---

## 1. Requirements

- **Narration** for 20 s to 5 min of video. That is about 50–750 words at roughly 150 words per minute **[estimate]**.
- **Offline batch, not realtime.** A render can wait 1–3 minutes for TTS on a modest laptop.
- **Zero-key path:** local, free, no Python, installs from public npm. Combined with the LLM, all models must stay under 8 GB, so TTS should be ≤ 400 MB.
- **Bring-your-own-key path:** OpenAI, ElevenLabs and Google voices.
- **Word-level timings** for karaoke captions and for syncing visuals to words.
- **Music bed and SFX synthesized in code.** Deterministic, no sample files, licence-clean.
- **Loudness** suited to online video.

---

## 2. Local TTS engines

### 2.1 Kokoro-82M (recommended)

- **Model:** 82M parameters, Apache-2.0 weights. v1.0 was released 2025-01-27 with 8 languages and 54 voices. It was trained only "on permissive/non-copyrighted audio data and IPA phoneme labels" **[verified]** (https://huggingface.co/hexgrad/Kokoro-82M).
- **Voices (English):** 20 American and 8 British voices are listed for kokoro-js **[verified]** (https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX). The author grades them (https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) **[verified]**:
  - `af_heart` **A**
  - `af_bella` **A-**
  - `af_nicole` B-
  - `bf_emma` B- (best British voice)
  - `am_michael`, `am_fenrir`, `am_puck` C+ (best male voices)
  - `am_adam` F+ (avoid)
- **Blind-test standing:** on the Artificial Analysis TTS arena, Kokoro 82M v1.0 is ranked **63rd with Elo 1061** among 103 models (20 open-weight). Leaders are Eleven v4 at 1334 and Gemini 3.8 Flash TTS at 1282 **[verified]** (https://artificialanalysis.ai/text-to-speech/leaderboard). That is "clearly good, clearly not frontier". For its size nothing open beats it on CPU, as far as I can tell this session.
- **ONNX sizes by dtype** **[verified]** (https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX):

  | dtype | file | MB |
  |---|---|---|
  | fp32 | model.onnx | 326 |
  | fp16 | model_fp16.onnx | 163 |
  | q8 ("quantized") | model_quantized.onnx | 92.4 |
  | q8f16 | model_q8f16.onnx | 86 |
  | uint8 | model_uint8.onnx | 177 |
  | q4 | model_q4.onnx | 305 |
  | q4f16 | model_q4f16.onnx | 154 |

  Voice style vectors are about 0.5 MB each **[recalled]**.

  The page doesn't say which file kokoro-js's `q8` maps to. Transformers.js maps `q8` to `model_quantized.onnx` **[recalled]**.

#### Three ways to run Kokoro from Node

| Runtime | Install | Speed | Timestamps | Notes |
|---|---|---|---|---|
| **kokoro-js 1.2.1** (Apache-2.0) | `npm i kokoro-js`. Depends on `@huggingface/transformers ^3.5.1` and `phonemizer ^1.2.1` (Apache-2.0 wrapper around eSpeak NG compiled to WASM) **[verified npm]**. `onnxruntime-node` alone is **307 MB unpacked** **[verified npm]**, so total node_modules is about 408 MB **[measured-sibling]**. | fp32 RTF 0.43–1.9 after a 25 s load. q8 is *slower* (RTF 2.5–3.7) on M4 Pro CPU **[measured-sibling]**. | **None.** The stream yields `{text, phonemes, audio}` per chunk, with no word times **[verified]** (https://github.com/hexgrad/kokoro/tree/main/kokoro.js) | Devices: `cpu` (Node), `wasm`, `webgpu` (browser) **[verified]**. Last publish 2025-05-03 **[verified npm]**, pinned to Transformers.js v3 while v4.3.2 is current **[verified npm]**. Low maintenance. |
| **sherpa-onnx-node 2.0.1** (Apache-2.0) | `npm i sherpa-onnx-node`. Prebuilt optional packages for win x64/ia32/arm64, linux x64/arm64, darwin x64/arm64 **[verified npm]**. darwin-arm64 package is **34 MB unpacked** **[verified npm]**. Bundles its own onnxruntime and espeak-ng data **[recalled]**. | Native C++ onnxruntime. Raspberry Pi 4 RTF for kokoro v1.0 is 3.2–7.6 across 1–4 threads **[verified]** (https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html). On an M4 Pro, expect well under 0.3 **[estimate]**. | None from the model. sherpa returns samples only **[recalled]**. | Supports kokoro-en-v0_19 (11 speakers), kokoro-multi-lang-v1_0 (53 speakers, model 310 MB + voices 26 MB) and **v1_1 (103 speakers, has an int8 build)** **[verified]**. Very actively released (modified 2026-10-26) **[verified npm]**. Also does ASR (whisper, sense-voice) and VAD in the same package **[verified npm description]**. |
| **kokoro-onnx** (Python, MIT) | pip | Fast | Has "phoneme durations"-based timing in some forks **[unverified]** | Python, which breaks the install rule. Reject. |

**Key point for the tentative choice.** kokoro-js works and sounds right, but sherpa-onnx-node cuts the TTS install by about 10× (≈34 MB vs ≈408 MB). It is maintained much more actively, uses native onnxruntime (likely faster on x86 laptops), and gives access to Kokoro v1.1's 103 speakers and int8 model. The cost: its JS API is lower level (you pass the model, voices and tokens paths and get Float32 samples), and the Kokoro model files come from k2-fsa's GitHub release tarballs rather than the HF repo **[recalled]**. **Recommendation: build behind a `TtsEngine` interface. Ship kokoro-js first, since it was measured on this machine, and spike sherpa-onnx-node in the first week.** If sherpa is faster and smaller on Windows and Linux CI, make it the default.

**dtype choice for kokoro-js:** **fp32 (326 MB)** as default on Apple Silicon, based on the sibling measurement. On x86 with AVX2/VNNI, dynamic-int8 `q8` (92 MB) is often faster than fp32 in onnxruntime **[recalled]**. Run a 3-sentence micro-benchmark on first use and cache the faster dtype per machine. If disk is tight, offer `q8` as "small download".

**Voice default:** `af_heart` (grade A). Offer `bf_emma` (British), `am_michael` and `am_fenrir` (male, C+). Hide D/F voices.

**Quirks to handle:**

- Split narration per sentence or beat. That gives natural pauses, lets us retry a single beat, and caps memory.
- Normalise numbers, units and acronyms in our own text layer before phonemising. espeak-ng reads "3.5×" and "GPT-4o" oddly **[recalled]**.
- Kokoro's `speed` parameter (0.5–2.0) can fine-tune duration, which helps fit timing **[recalled]**.

### 2.2 Piper

- **Original `rhasspy/piper`** (MIT) was archived in 2025 and development moved to **OHF-Voice/piper1-gpl** **[recalled]**.
- **piper1-gpl is GPL-3.0** **[verified]** (https://github.com/OHF-Voice/piper1-gpl). Install is `pip install piper-tts`. There is a C/C++ API (`libpiper`) and a Java (JNI) binding but **no npm/JS binding**. It embeds espeak-ng. The Open Home Foundation says it is "looking for maintainers" **[verified]**.
- **Quality:** below Kokoro. Voice-model licences vary per dataset, and some are non-commercial **[recalled]**.
- sherpa-onnx can run the older MIT-era Piper VITS ONNX voices **[recalled]**. Voices of 20–60 MB, very fast. This is a possible "ultra-light" fallback.
- **Verdict:** not the default. Optional low-end fallback through sherpa-onnx, after checking each voice's licence.

### 2.3 Kitten TTS

- Code Apache-2.0. **Model weights under a separate "Stellon Labs Community License"** for KittenTTS 2 **[verified]** (https://github.com/KittenML/KittenTTS).
- Lightweight ONNX models: **nano** 15M (56 MB fp32 / 25 MB int8), **micro** 40M (41 MB), **mini** 80M (80 MB). The flagship KittenTTS 2 has 1.7B parameters (492–954 MB) with 115 voices and cloning **[verified]**.
- Python-first, no JS examples **[verified]**. Quality claims ("SOTA") are self-reported **[verified]**.
- **Verdict:** interesting for tiny devices. The non-standard model licence needs reading first. Not chosen.

### 2.4 Supertonic (Supertone)

- 66M parameters. Sample code MIT, **model OpenRAIL-M** (use-based restrictions, but commercial use allowed) **[verified]** (https://huggingface.co/Supertone/supertonic).
- Very fast: RTF 0.012–0.015 on an M4 Pro CPU with ONNX at 2 steps **[verified]**, so roughly 70–80× faster than realtime.
- Runs in ONNX Runtime, with a **Node.js example** in its repo and onnxruntime-web support **[verified]**. English **[verified tag]**.
- Quality relative to Kokoro: not on the arena page I captured **[verified absence]**.
- **Verdict: the strongest alternative to watch.** Worth an A/B listening test against Kokoro. OpenRAIL-M needs a licence note in the README (users must accept the use restrictions).

### 2.5 Larger expressive open models (GPU-oriented)

| Model | Size | Licence | CPU viable? | Notes |
|---|---|---|---|---|
| Chatterbox (Resemble) | ~0.5B | MIT **[recalled]** | Slow (RTF > 1 on CPU) **[recalled]** | Arena **#83, Elo 1022** (Chatterbox HD hosted: #41, 1108) **[verified]**. Has watermarking. |
| F5-TTS | ~0.3B | Code MIT, **weights CC-BY-NC** **[recalled]** | Slow | Non-commercial weights, so reject. |
| Orpheus 3B | 3B (Llama-based) | Llama licence **[recalled]** | Needs GGUF/llama.cpp + SNAC decoder; ~1× realtime on M-series **[recalled]** | Heavy; emotion tags. |
| Dia (Nari Labs) 1.6B | 1.6B | Apache-2.0 **[recalled]** | GPU | Dialogue-focused. |
| Sesame CSM-1B | 1B | Apache-2.0 **[recalled]** | GPU | Conversational; needs Llama tokenizer access **[recalled]**. |
| MeloTTS | ~50M | MIT **[recalled]** | Yes | Python only. Quality below Kokoro. |
| StyleTTS2 | ~100M | MIT code; weights carry a disclosure clause **[recalled]** | Yes | Kokoro is a StyleTTS2 derivative **[recalled]**. |
| XTTS-v2 (Coqui) | ~0.5B | **CPML, non-commercial** **[recalled]** | Slow | Coqui shut down in 2024 **[recalled]**. Reject. |
| Parler-TTS | 0.9–2.2B | Apache-2.0 **[recalled]** | Slow | Text-described voices. |
| OuteTTS 0.3–1.0 | 0.5–1B | Apache-2.0 / CC-BY-NC by version **[recalled]** | llama.cpp GGUF | Per-version licence varies. |
| Spark-TTS 0.5B | 0.5B | **CC-BY-NC-SA** **[recalled]** | GPU | Reject. |
| NeuTTS Air | 0.7B (0.5B Qwen backbone) | Apache-2.0 (gated download) **[verified]** (https://huggingface.co/neuphonic/neutts-air) | "Real-time on CPU" claim, GGUF Q4/Q8 builds **[verified]** | Every output carries a **Perth watermark** **[verified]**. Cloning from 3 s. Python stack. |
| VibeVoice 1.5B (Microsoft) | 1.5B | MIT **[recalled]**, but Microsoft pulled/restricted the repo in 2025 over misuse **[recalled]** | GPU | Arena **#89, Elo 953** **[verified]**. |
| Voxtral-4B-TTS-2603 (Mistral) | ~4B | **CC BY-NC 4.0** **[verified]** (https://huggingface.co/mistralai/Voxtral-4B-TTS-2603) | Needs a ≥16 GB GPU with vLLM-Omni **[verified]** | Reject (non-commercial, GPU). |
| Fish Audio Drama 3 / Breeze TTS 2 / Ming-3.0-tts | larger | open weights per the arena **[verified]**, licences **[unverified]** | Probably GPU | The top open entries (#6, #13, #22) **[verified]**. Re-check for a future "high quality local" tier. |

**Verdict:** none of these is CPU-practical and npm-installable today. Bridge's zero-key path stays with an ~80M-class model.

### 2.6 System TTS (always-available floor)

| OS | Mechanism | How to call from Node | Quality |
|---|---|---|---|
| macOS | `say -v <voice> -o out.aiff --data-format=LEI16@24000 "text"`. AVSpeechSynthesizer "Premium"/"Enhanced" and "Personal Voice" are better **[recalled]** | `child_process.spawn('say', …)` | Premium voices are decent. Compact voices are robotic. |
| Windows | SAPI 5 via PowerShell `System.Speech.Synthesis.SpeechSynthesizer.SetOutputToWaveFile()`. OneCore / "Natural" voices are mostly reachable only through `Windows.Media.SpeechSynthesis` (WinRT), which can be scripted via PowerShell **[recalled]** | `powershell -NoProfile -Command …` | SAPI voices dated. Natural voices good but not always exposed. |
| Linux | `espeak-ng -w out.wav` (GPL-3.0, separate process) or `spd-say` **[recalled]** | spawn | Robotic. |

System TTS supports SSML-like rate control and, on macOS/Windows, word-boundary events in their native APIs. The CLI wrappers do not expose them **[recalled]**. Use system TTS only when Kokoro isn't downloaded yet.

### 2.7 Local TTS comparison summary

| Engine | Quality (blind tests) | CPU speed | Size | Licence | npm install |
|---|---|---|---|---|---|
| **Kokoro v1.0 (kokoro-js)** | Arena Elo 1061 (#63/103) **[verified]** | RTF 0.43–1.9 fp32 on M4 Pro **[measured-sibling]** | 92–326 MB model + ~408 MB deps | Apache-2.0 | Yes, pure npm |
| **Kokoro v1.0/1.1 (sherpa-onnx-node)** | Same model | Native ORT, likely faster **[estimate]** | 310 MB fp32 (or int8 v1.1) + ~34 MB native | Apache-2.0 | Yes, prebuilt |
| Supertonic | Not on arena page | RTF ≈ 0.013 on M4 Pro **[verified]** | small (66M params) | OpenRAIL-M | ORT + Node example |
| Kitten nano/micro/mini | Not ranked | Fast | 25–80 MB | Custom community licence | Python-first |
| Piper (VITS) | Below Kokoro **[recalled]** | Very fast | 20–60 MB/voice | piper1 GPL-3.0; voices vary | via sherpa |
| System voices | Varies | Instant | 0 | OS | spawn |

---

## 3. Provider voices (bring your own key)

### 3.1 OpenAI

- **Prices** **[verified]** (https://developers.openai.com/api/docs/pricing):
  - `gpt-4o-mini-tts`: **$0.60 per 1M text input tokens, $12.00 per 1M audio output tokens**.
  - `tts-1`: **$15.00 per 1M characters**.
  - `tts-1-hd`: **$30.00 per 1M characters**.
- **Per-minute estimate:** OpenAI has quoted about $0.015 per minute for gpt-4o-mini-tts **[recalled]**. A 3-minute narration of ~2,700 characters costs about $0.04 on `tts-1` **[estimate]**.
- **Voices:** alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse, plus newer additions. `gpt-4o-mini-tts` accepts an `instructions` field for tone ("warm, upbeat teacher") **[recalled]**.
- **Formats:** mp3, opus, aac, flac, wav, pcm (24 kHz) **[recalled]**.
- **No word timestamps.** Align afterwards (section 4).

### 3.2 ElevenLabs

- **Prices (API)** **[verified]** (https://elevenlabs.io/pricing/api):
  - Flash/Turbo: **$0.04 per 1K characters**, about $0.04 per minute.
  - Multilingual v2: **$0.08 per 1K characters**.
  - Eleven v3: **$0.08 per 1K characters**.
  - The page also has a Free plan, but I couldn't confirm its commercial-use terms.
- **Arena:** Eleven v4 is #1 (Elo 1334), v4 Turbo #2, v3 #23 (1187) **[verified]**. Check `GET /v1/models` for current ids such as `eleven_v4` **[unverified id]**.
- **Timestamps:** `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps` returns `audio_base64` plus `alignment` and `normalized_alignment` objects, each with `characters`, `character_start_times_seconds` and `character_end_times_seconds` **[verified]** (https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps). Default model `eleven_multilingual_v2`.
- **Output formats** include mp3 (22.05–44.1 kHz), opus, pcm and wav at 8–48 kHz. 44.1 kHz PCM/WAV requires the Pro tier **[verified]**. Use `mp3_44100_128` or `pcm_24000`.
- **Auth:** `xi-api-key` header. Keys can be scope-restricted, credit-quota-limited and IP-allowlisted **[verified]** (https://elevenlabs.io/docs/api-reference/authentication). Recommend users create a key restricted to TTS with a quota.

### 3.3 Google

- **Gemini TTS (AI Studio / Gemini API)** **[verified]** (https://aistudio.google.com/docs/pricing), per 1M tokens, standard tier:
  - `gemini-3.8-flash-tts`: $0.50 text in, $9.00 audio out, free tier available. **Prices double from 2027-01-01.**
  - `gemini-3.8-flash-lite-tts`: $0.50 in, $6.00 out, free tier.
  - `gemini-3.1-flash-tts-preview`: $1.00 / $20.00.
  - `gemini-2.5-flash-preview-tts`: $0.50 / $10.00, free tier.
  - `gemini-2.5-pro-preview-tts`: $1.00 / $20.00, no free tier.
- **Arena:** Gemini 3.8 Flash TTS is #5 (Elo 1282), the best value among top-tier voices; Flash-Lite TTS is #10 (1254) **[verified]**.
- **The free tier is notable:** a user with only a free Gemini key gets near-frontier narration. Gemini TTS output is 24 kHz PCM and takes natural-language style prompts and multi-speaker setups **[recalled]**. No word timestamps **[recalled]**.
- **Google Cloud Text-to-Speech** (Chirp 3 HD, Neural2, WaveNet) is priced per character (Chirp 3 HD about $30 per 1M characters) and needs a GCP project and service account. SSML `<mark>` gives timepoints on some voices **[recalled]**. Too heavy for BYOK, so skip.

### 3.4 Provider recommendation

| Provider | Default model | Why |
|---|---|---|
| Gemini key | `gemini-3.8-flash-lite-tts` (or `-flash-tts`) | Free tier, top-10 arena quality |
| OpenAI key | `gpt-4o-mini-tts` + `instructions` | Cheap, controllable tone |
| ElevenLabs key | Flash/Turbo (cheap) or v3/v4 (best) via `/with-timestamps` | Best quality and native alignment |

---

## 4. Word-level timing for captions

Bridge needs, for each narrated word, `startMs` and `endMs`, plus a link from each word to its beat and source citation.

| Method | Accuracy | Cost | Notes |
|---|---|---|---|
| **Provider alignment** (ElevenLabs `/with-timestamps`) | Exact for its own audio | Free with the call | Character times → group into words by our tokeniser **[verified fields]**. |
| **Forced alignment with whisper.cpp** (already on this machine: `ggml-base.en`) | ±30–80 ms typical **[recalled]** | ~1–3 s per minute of audio on M4 **[estimate]** | CLI flags: `-ml N` (max segment length in characters), `-sow` (split on word), `-ojf` (full JSON with token detail), `-owts` (karaoke script), `-dtw MODEL` ("compute token-level timestamps") **[verified]** (https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/README.md). `-ml 1 -sow -ojf` yields roughly per-word segments **[recalled]**. This is *transcription*, so we then **align its words to our known script** with a Needleman-Wunsch or difflib-style alignment, keeping our spelling and inheriting whisper's times. |
| **sherpa-onnx ASR in-process** | Similar | No external binary | Same package as sherpa TTS. Whisper/Zipformer models with timestamps **[recalled]**. |
| **Proportional estimate** | ±150–300 ms drift within a sentence **[estimate]** | Free, instant | Per sentence: measure the real WAV duration, trim leading and trailing silence with an energy threshold, then split the duration over words in proportion to syllable count (vowel-group heuristic) + punctuation pause weights (comma 0.15 s, period 0.3 s) **[recalled technique]**. |
| **Kokoro phoneme durations** | Exact | Free | The Kokoro model predicts per-phoneme durations internally. The Python `kokoro` package exposes token timestamps **[recalled]**, but kokoro-js does not **[verified]**. Getting them in JS means running the ONNX graph ourselves and reading the duration output, if the exported graph exposes it **[unverified]**. Worth a spike: exact timings with no ASR. |

**Recommended pipeline:**

1. Synthesise per sentence. Sentence boundaries are then exact, because each WAV's start offset is known.
2. Inside each sentence, use the best available source: provider alignment, else Kokoro durations (if the spike works), else proportional syllables.
3. When whisper.cpp is available, run it on the final narration as a **verification pass**: align it to the script, refine word times, and report the word error rate. A high WER means the TTS mispronounced something, which is a faithfulness signal for numbers and names.

Proportional timing inside one sentence is visually fine for 2–4-word caption chunks. Karaoke-style per-word highlight benefits from whisper refinement.

---

## 5. Music bed and SFX synthesized in code

### 5.1 Why code-only

- **Licence-clean:** no third-party samples, attribution or Content ID claims. YouTube Content ID can flag even "royalty-free" library tracks **[recalled]**.
- **Deterministic:** seeded by project id, so the same input always produces the same audio, which golden audio tests (hash or spectral fingerprint) can lock.
- **Adaptive:** the music follows the timeline. Builds into scene changes, risers land on reveals, and the length fits any duration exactly.
- **Tiny:** no assets to download.

### 5.2 Design: a small deterministic DSP engine in TypeScript (`src/core/audio`)

Render offline at 48 kHz, Float32, stereo. Write the WAV, then mix.

**Primitives:**

- Oscillators: sine, saw/square/triangle with PolyBLEP anti-aliasing, noise (seeded xorshift), wavetable.
- Envelopes: ADSR, exponential decay.
- Filters: biquad (LP/HP/BP/peaking/shelf, RBJ cookbook formulas), one-pole smoothing, state-variable filter for sweeps.
- Effects: soft-clip saturation (`tanh`), Schroeder/Freeverb-style reverb (comb + all-pass), ping-pong delay, stereo widener (Haas, a few ms).
- All randomness comes from `src/core/rng`, never `Math.random`. That is a CLAUDE.md rule.

**Instruments:**

| Element | Recipe |
|---|---|
| **Pad** | 3–4 detuned saws (±7 cents) → LP filter with a slow LFO on cutoff (0.05–0.2 Hz) → long attack and release → reverb. Chords from a mood table, e.g. I–V–vi–IV in a major key for "bright", i–VI–III–VII for "serious". |
| **Bass** | Sine plus a little saturated triangle on chord roots. Half or whole notes. LP at 400 Hz. |
| **Pluck / arp** | Karplus-Strong string, or a saw with a fast filter-envelope decay. 8th or 16th arpeggios at 90–120 BPM. Velocity humanised from the seeded RNG. |
| **Soft kick/pulse (optional)** | Sine with a pitch envelope from 120 to 45 Hz over 80 ms. Kept quiet. Explainers need pulse, not EDM. |
| **Riser** | Noise → BP filter swept up over 1–4 s + rising pitched saw → volume ramp. Ends exactly at a scene cut. |
| **Whoosh** | Noise burst 250–600 ms, BP sweep (e.g. 400→4000→800 Hz), stereo pan sweep, fast attack and slow release. |
| **Click / tick** | 2–5 ms filtered noise or a 3 kHz sine blip. For counters and list items. |
| **Pop** | Sine with a fast downward pitch envelope (900→300 Hz in 40 ms) + short noise transient. For elements appearing. |
| **Impact / hit** | Low sine thump (60 Hz, 300 ms decay) + noise crack + short reverb. For key reveals. |
| **Shimmer / sparkle** | High sine partials with random onsets and a tail through delay. For "insight" moments. |

**Arrangement driven by the timeline:**

- BPM is chosen so that beat boundaries fall near scene boundaries. Snap scene starts to the nearest beat when it moves them less than 120 ms.
- Sections: intro (pad only) → body (pad + bass + arp) → peak at the key idea (add a pulse) → outro (resolve to the tonic, 2 s tail).
- SFX events come from scene animations (`appear` → pop, `transition` → whoosh, `reveal` → impact). A **density limiter** allows at most 1 SFX per 400 ms and no SFX within 150 ms of a stressed narrated word.
- For 20 s videos: a short motif, a fast riser into the payoff, and an ending sting.

### 5.3 Mixing, ducking and loudness

**Ducking or sidechain under the voice:**

- Compute the voice envelope: RMS over 20 ms windows, then attack 10 ms and release 250–400 ms.
- Apply a gain reduction to the music bus of **−8 to −12 dB while the voice is active**. Use look-ahead of about 50 ms, which is free offline, so the duck starts just before speech.
- Also carve a static dip of about −3 dB at 2–4 kHz in the music bus (voice presence band) using a peaking EQ.
- SFX get a lighter duck (−3 dB) so they stay audible but never mask words.
- This is easy offline because we know exactly where speech is, from per-sentence WAV offsets **[recalled technique]**.

**Loudness targets:**

- Streaming and social platforms normalise playback to about **−14 LUFS integrated** (YouTube, Spotify), with Apple at −16 LUFS **[recalled]**. YouTube's upload page I opened doesn't mention loudness **[verified absence]** (https://support.google.com/youtube/answer/1722171).
- Podcast and spoken-word practice targets **−16 LUFS** (stereo) with **true peak ≤ −1 dBTP** **[recalled; AES TD1004 and Apple podcast guidance]**. EBU R128 broadcast is −23 LUFS **[recalled]**.
- **Bridge target: −16 LUFS integrated, true peak ≤ −1.0 dBTP, loudness range under ~8 LU.** −16 suits voice-led content, plays well on laptops and phones, and YouTube won't turn it up, which is fine because voice clarity matters more than loudness parity. Offer "−14 (louder, social)" as an option.
- **Relative levels:**
  - Voice is the anchor (about −16 LUFS short-term while speaking).
  - Music bed under voice about **−18 to −24 dB below voice** after ducking, i.e. background. Between voice phrases it can rise to about −12 dB below.
  - Music-only intro and outro can sit about −6 dB below speech level.
  - SFX peaks about −6 to −10 dB below voice peaks.
  - These follow common broadcast and podcast mixing guidance **[recalled]**.
- **Implementation:**
  - Option A: run our own ITU-R BS.1770 meter in TypeScript (K-weighting filter + 400 ms gated blocks, about 150 lines) and our own true-peak limiter (4× oversampling + look-ahead limiter). Pure and testable.
  - Option B: ffmpeg `loudnorm` two-pass (`I=-16:TP=-1:LRA=11`, first pass prints the measured values, second pass applies them linearly) **[recalled]**.
  - Choose A for core determinism and use B as a cross-check in tests (the two should agree within ±0.5 LU).

### 5.4 Alternatives considered: sample libraries

| Source | Licence | Problem for Bridge |
|---|---|---|
| Freesound.org | Per-sound: CC0, CC-BY, CC-BY-NC **[recalled]** | Mixed licences need per-file tracking. Attribution obligations. API key needed to download. |
| Pixabay Music/SFX | Pixabay Content License: free commercial use, no attribution, but **can't redistribute as standalone files** and some tracks are Content-ID registered **[recalled]** | Shipping them inside an open-source repo is close to "redistribution". Content ID claims on users' uploads. |
| YouTube Audio Library | Usable in YouTube videos; terms are platform-oriented **[recalled]** | Not redistributable. |
| Kenney / OpenGameArt CC0 packs | CC0 **[recalled]** | Fine legally, but adds assets, and the game-style sounds don't match. |
| AI music (Suno, Udio, MusicGen, Stable Audio Open) | Varies: MusicGen weights CC-BY-NC, Stable Audio Open has a community licence **[recalled]** | Non-commercial or restricted weights, GPU-heavy, nondeterministic. Reject for v1. |

**Verdict: reject sample libraries for v1.** Code synthesis is enough for explainer beds and UI-style SFX, which are simple timbres. Later, allow a **user-supplied** music file (the user is responsible for its licence), with the same ducking applied.

---

## 6. End-to-end audio pipeline

```
script beats ─► text normaliser ─► TTS per sentence (Kokoro / provider) ─► sentence WAVs + offsets
                                                                    │
                     word timings (provider | kokoro durations | syllables) ◄──┤
                                                                    ▼
timeline (scene times snapped to beats) ─► music synth ─► SFX synth ─► mixer (duck, EQ, bus gains)
                                                                    ▼
                                         BS.1770 meter → gain → true-peak limiter → mix.wav (48k)
                                                                    ▼
                                          ffmpeg mux (AAC 160k) ; whisper.cpp verify pass (optional)
```

Resample TTS output to 48 kHz (Kokoro and Gemini produce 24 kHz) with a windowed-sinc resampler in core, or use ffmpeg's `aresample=48000:resampler=soxr` if soxr is in the build **[recalled]**.

---

## 7. Recommendation

1. **Local narration: Kokoro-82M v1.0**, voice **`af_heart`** (A grade). Alternates: `af_bella`, `bf_emma`, `am_michael`/`am_fenrir`.
2. **Runtime: start with kokoro-js 1.2.1 at fp32 (326 MB).** It has been measured on this M4 Pro (RTF 0.43–1.9). Benchmark on first run and pick `q8` (92 MB) where it is faster (likely x86).
3. **Spike sherpa-onnx-node in week 1** (34 MB native vs ~408 MB of kokoro-js deps, actively maintained, Kokoro v1.1 int8 with 103 speakers). If it matches quality and is at least as fast, make it the default engine.
4. **Spike Supertonic** (66M, RTF ≈ 0.013 on M4 Pro, OpenRAIL-M) as a possible fast-and-small alternative, with a blind A/B against Kokoro.
5. **Floor:** system TTS (`say`, PowerShell SAPI, `espeak-ng`).
6. **Providers:**
   - Gemini key → `gemini-3.8-flash-lite-tts` or `-flash-tts` (free tier, arena top 10).
   - OpenAI key → `gpt-4o-mini-tts`.
   - ElevenLabs key → `/with-timestamps` with Flash (cheap) or v3/v4 (best).
7. **Timings:** per-sentence synthesis + provider alignment, Kokoro durations or syllable-proportional estimates. whisper.cpp refinement and verification when available.
8. **Music and SFX:** deterministic TypeScript DSP in `src/core/audio`. Duck music −8 to −12 dB under the voice. Final mix −16 LUFS integrated, ≤ −1 dBTP.
9. **No sample libraries** in v1. Allow user-supplied music later.

**Against the tentative choice (Kokoro via kokoro-js):** the choice holds for model and voice. Two flags on the runtime:

- (a) kokoro-js has had no release since 2025-05 and is pinned to Transformers.js v3, while sherpa-onnx-node is actively maintained and about 10× smaller to install.
- (b) kokoro-js gives no word timestamps, so timing must come from elsewhere.

---

## 8. Draft ADR

```
# ADR-00Y: Narration with Kokoro-82M locally, provider voices by key, code-synthesised music & SFX

Status: Proposed
Date: 2026-11-03

## Context
Bridge needs offline, free, npm-installable narration of 20 s–5 min scripts with word-level
timing for captions, plus a music bed and SFX that are licence-clean and deterministic.
Kokoro-82M (Apache-2.0, 82M params) is the best CPU-friendly open TTS available via npm;
it ranks #63 of 103 (Elo 1061) on the Artificial Analysis arena — below hosted frontier
voices (ElevenLabs v4 1334, Gemini 3.8 Flash TTS 1282) but far above system voices.
kokoro-js was measured on an M4 Pro at fp32 RTF 0.43–1.9 (q8 slower, 2.5–3.7), ~408 MB of
deps. sherpa-onnx-node (Apache-2.0) runs the same model with ~34 MB native binaries.
Piper's maintained fork is GPL-3.0 and pip-only; F5, XTTS, Spark, Voxtral-TTS weights are
non-commercial; Chatterbox/Orpheus/Dia/CSM/VibeVoice need GPUs for practical speed.

## Decision
- TtsEngine interface with implementations: kokoro-js (default v1), sherpa-onnx (spike →
  default if better), system (say / SAPI / espeak-ng), openai, elevenlabs, gemini.
- Local default: Kokoro v1.0, voice af_heart; dtype fp32 on Apple Silicon, auto-benchmarked
  fp32 vs q8 on first run elsewhere; model files counted in the 8 GB budget (≤ 326 MB).
- Synthesize per sentence; word timings from provider alignment (ElevenLabs with-timestamps)
  → Kokoro durations (if exposed) → syllable-proportional estimate; refined and verified by
  whisper.cpp when present.
- Music and SFX are synthesized by a deterministic TypeScript DSP engine in src/core/audio
  (seeded RNG), arranged from the timeline; no bundled samples.
- Mix: music ducked 8–12 dB under voice with 50 ms look-ahead; master to −16 LUFS
  integrated, true peak ≤ −1 dBTP (option: −14 LUFS); 48 kHz.
- Provider defaults: gemini-3.8-flash-lite-tts, gpt-4o-mini-tts, ElevenLabs Flash/v3 via
  /with-timestamps.

## Consequences
+ Zero-key path is fully offline and licence-clean; same input → same audio bytes.
+ Provider keys upgrade quality without changing the pipeline.
− Local voice quality is good, not frontier; English-first.
− kokoro-js is lightly maintained and heavy (~408 MB); mitigated by the sherpa-onnx spike.
− We own a DSP engine and a loudness meter (est. 1–1.5k LOC); ffmpeg loudnorm used as a
  test oracle.

## Revisit if
- An open TTS ≥ Elo 1150 runs at RTF < 1 on a 4-core CPU via npm.
- Users need non-English narration beyond Kokoro's 8 languages.
```

---

## Sources opened this session

- https://huggingface.co/hexgrad/Kokoro-82M and /blob/main/VOICES.md
- https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- https://github.com/hexgrad/kokoro/tree/main/kokoro.js
- https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html
- https://github.com/OHF-Voice/piper1-gpl
- https://github.com/KittenML/KittenTTS
- https://huggingface.co/Supertone/supertonic
- https://huggingface.co/neuphonic/neutts-air
- https://huggingface.co/mistralai/Voxtral-4B-TTS-2603
- https://artificialanalysis.ai/text-to-speech/leaderboard
- https://developers.openai.com/api/docs/pricing
- https://elevenlabs.io/pricing/api
- https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
- https://elevenlabs.io/docs/api-reference/authentication
- https://aistudio.google.com/docs/pricing
- https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/README.md
- https://support.google.com/youtube/answer/1722171
- npm metadata: kokoro-js, phonemizer, sherpa-onnx-node (+ darwin-arm64), onnxruntime-node, @huggingface/transformers
- Not retrievable: TTS Arena V2 leaderboard (https://huggingface.co/spaces/TTS-AGI/TTS-Arena-V2), which renders dynamically
