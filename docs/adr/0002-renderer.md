# ADR-0002: Our own Canvas 2D renderer piped into ffmpeg

**Status:** accepted · 2026-11-03 · research: `docs/research/VIDEO_STACK.md`

## Decision
Scenes are pure functions `draw(ctx, t)` on the standard Canvas 2D API. In Node they draw on `@napi-rs/canvas` (Skia, MIT); each frame's raw RGBA goes into `ffmpeg` stdin → H.264 High, yuv420p, CRF 20, `-tune animation`, AAC 160 k 48 kHz, `+faststart`, plus a `mov_text` soft subtitle track. Captions are also burned in by our compositor. ffmpeg comes from the system, else the optional `ffmpeg-static`.

## Why not the others
- **Remotion:** free only for individuals and companies ≤ 3 people; "prompt-to-video apps" are named in the paid tier. Bad fit for a free tool others may self-host at work.
- **Motion Canvas / Revideo:** headless rendering is either editor-bound or now commercial (Midrender).
- **Manim:** Python + LaTeX + Cairo install pain; slow; no browser preview.
- **Headless Chromium:** works, but heavier and slower than Skia directly, and harder to make deterministic.

## Evidence
- Spike: **56 fps** at 1080p on the M4 Pro (`scripts/spike/canvas-ffmpeg.mjs`); a 20 s video renders in ~25 s including encode.
- Deterministic: golden-frame tests (`tests/golden`) and a "same t → identical pixels" test.

## Consequences
- We own typography, layout and motion. That is more code, but it is exactly the control a design system needs.
- The same scene code can draw a live `<canvas>` preview in the browser (idea I-027).
