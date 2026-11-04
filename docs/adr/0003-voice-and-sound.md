# ADR-0003: Kokoro-82M voice locally; music and SFX synthesized in code

**Status:** accepted · 2026-11-03 · research: `docs/research/VOICE_AND_SOUND.md`

## Decision
- **Narration:** Kokoro-82M v1.0 (Apache-2.0) via `kokoro-js`, fp32, default voice `af_heart` (the author's only A-grade English voice). Weights (~326 MB) download once into `~/.bridge/models/hf`. One clip per beat, so beat timing is exact.
- **Fallbacks:** system voice (`say` / SAPI / espeak-ng). **BYOK:** OpenAI TTS, ElevenLabs `/with-timestamps` (exact word timings).
- **Word timings:** provider timestamps when available, else syllable-weighted estimates inside the measured speech window of each clip.
- **Music & SFX:** deterministic TypeScript DSP (`src/core/audio`): four-chord pad, round bass, plucked arpeggio, light kick/hat at fast paces, a final tonic chord; whoosh, pop, tick, riser, impact, click, chime. No samples, no licences.
- **Mix:** music ~21 dB under the voice while speaking, ~12 dB in gaps (sidechain envelope), SFX only on signalled events (≤ 1 per 2 s); master normalised to **−14 LUFS** integrated (BS.1770), peak ≤ −1.2 dBFS.

## Why
- Measured on this laptop: Kokoro fp32 **RTF 0.26** (4× faster than real time); whisper base.en transcribed it verbatim. LachedInAI rejected kokoro-js for *real-time* first-audio latency; Bridge renders offline, so throughput is what matters.
- Loudness: the two research docs disagreed (−14 vs −16 LUFS; 18–24 vs 8–12 dB ducking). We chose −14 LUFS (where YouTube and most players normalise, so nothing gets turned *up* and clipped) and a deep duck because the voice carries the teaching; music is extraneous load.

## Revisit
- `sherpa-onnx-node` runs the same Kokoro model in ~34 MB of native code instead of ~408 MB of node_modules (idea I-078).
