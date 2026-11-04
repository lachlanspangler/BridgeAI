# Bridge research: video rendering stack

Status: research input for an ADR. Written 2026-11-03.

Evidence labels:

- **[verified]**: I opened the source in this research session. The URL is given.
- **[recalled]**: from prior knowledge, not re-checked this session.
- **[unverified]**: plausible but not confirmed. Treat as a lead.
- **[estimate]**: my own arithmetic or reasoning from the numbers cited next to it.

npm facts come from `npm view <pkg> --registry=https://registry.npmjs.org/`, run on 2026-11-03, and are labelled **[verified npm]**.

---

## 1. What Bridge needs from a renderer

Bridge renders short explainers (20 s to 5 min, 1080p, mp4) entirely from code: shapes, diagrams, charts, kinetic typography, highlighted code, captions, and an imported image now and then. No stock footage. The renderer has to:

1. **Install with one command** on macOS, Windows and Linux from public npm. No Python, no LaTeX, no system packages, no compiler.
2. **Render headless from Node.** A 3-minute video is 5,400 frames at 30 fps, so it must render without a visible browser and without an editor UI.
3. **Be fast on a modest laptop.** Target: render a 1-minute video in under about 1 minute on the M4 Pro and in under about 5 minutes on a 4-core x86 laptop with no GPU.
4. **Be deterministic**, so golden-frame tests can lock the visual output.
5. **Render text well**: shaping, kerning, emoji, bundled fonts, and CJK as a stretch goal.
6. **Share scene code with a live browser preview**, so the web UI can scrub the same timeline the exporter renders.
7. **Have a licence that works for a free public project** that anyone, including companies of any size, can self-host.

---

## 2. Options

### 2.1 Remotion

- **What it is:** React components rendered to frames by headless Chromium, then encoded by a bundled ffmpeg through a Rust "compositor". Current version is 4.0.540, published 2026-11-02 **[verified npm]**. `@remotion/renderer` pulls in platform-specific `@remotion/compositor-*` packages for darwin x64/arm64, linux x64/arm64 (gnu and musl) and win32-x64 **[verified npm]**. The darwin-arm64 compositor alone is 18 MB unpacked **[verified npm]**. Remotion also downloads a Chrome Headless Shell on first render **[recalled]**.
- **Licence. This is the deciding factor.** The npm licence field reads `SEE LICENSE IN LICENSE.md` **[verified npm]**. The licence file grants free use to "an individual", to for-profit organisations with "up to 3 employees", to non-profits, and during evaluation. Every other organisation needs a Company License **[verified]** (https://github.com/remotion-dev/remotion/blob/main/LICENSE.md). The FAQ says Remotion "is source-available software, but it is not open source software" and that the free tier covers "an organization or team of individuals with up to 3 people" **[verified]** (https://www.remotion.dev/docs/license/faq). Paid tiers: "Remotion for Creators" costs $25/month per seat. "Remotion for Automators" costs $0.01 per render with a $100/month minimum, and explicitly covers "prompt-to-video apps". Enterprise starts at $500/month **[verified]** (https://www.remotion.pro/license). The licence file also says "In Remotion 5.0, the license will slightly change" **[verified]**. `@remotion/renderer` depends on `@remotion/licensing` **[verified npm]**, so licence checking or telemetry is built in.
- **What this means for Bridge:**
  - Bridge could not be MIT/Apache in spirit. A 50-person company that installs Bridge and renders videos is "an organisation" using Remotion, so it would owe Remotion fees. The project would have to warn every user about this.
  - A free public website that renders videos for visitors is exactly the "prompt-to-video" Automators case. Above 3 people it would cost at least $100/month **[verified]**.
  - Forks, and people who self-host, inherit the same obligation. Bridge cannot relicense Remotion.
  - The 5.0 change adds uncertainty about future terms.
- **Quality ceiling:** very high. You get the full CSS/SVG/WebGL/HTML layout engine, Chrome-quality text, and a large ecosystem.
- **Speed:** each frame is a full Chromium page render plus screenshot. The performance docs give no fps figures. They say to tune `--concurrency` with `npx remotion benchmark`, and warn that canvas, WebGL, gradients and `filter: blur()` need a GPU and render slowly without one **[verified]** (https://www.remotion.dev/docs/performance). Community figures for 1080p30 on laptops are roughly 10–40 fps with concurrency **[recalled]**.
- **Determinism:** good on a pinned Chrome build. It varies across GPUs and OSes **[recalled]**.
- **Preview sharing:** excellent (`@remotion/player`).
- **Verdict: reject.** The licence conflicts with "free for everyone, including companies".

### 2.2 Motion Canvas

- **What it is:** a TypeScript generator-based animation library drawing on Canvas 2D, with a Vite-based editor. MIT licence **[verified]** (https://github.com/motion-canvas/motion-canvas). `@motion-canvas/core` is at 3.17.2, last modified 2025-02-16 **[verified npm]**. That means no npm release for about 20 months.
- **Headless rendering:** the docs describe rendering only from the editor. You press `RENDER`, the browser plays the animation, and each frame is saved as PNG/JPEG/WebP into `/output`. ffmpeg is a separate step **[verified]** (https://motioncanvas.io/docs/rendering). There is no documented Node or CLI renderer. Community plugins drive the editor through Puppeteer **[recalled]**.
- **Quality:** very good for diagram-style explainers. The tweening, signals and layout primitives were designed for exactly this kind of video.
- **Verdict:** excellent ideas to borrow (generator timelines, signals, `all()`/`sequence()` combinators). It is not a fit as a dependency because there is no first-class headless export and releases have stalled.

### 2.3 Revideo

- **What it is:** an MIT fork of Motion Canvas that adds `renderVideo()` for headless rendering, a React player, and a render endpoint. It "runs anywhere Node and a headless browser run" **[verified]** (https://github.com/redotvideo/revideo). `@revideo/renderer` 0.11.0 was last modified 2026-07-10. It depends on `puppeteer ^25.3.0`, `vite ^8.1.2` and `@revideo/ffmpeg` **[verified npm]**.
- **2026 status:** `docs.re.video` now 301-redirects to `midrender.com/revideo/docs`, which is branded Midrender with a "Get started" link to app.midrender.com and a pricing page **[verified]** (https://midrender.com/revideo/docs). The open-source library seems to have become the base of a commercial product. I found no deprecation notice. The GitHub repo has about 4.2k stars, 56 open issues and 7 open PRs **[verified]**.
- **Speed:** Puppeteer plus Chromium per frame, so it is in the same class as Remotion. Revideo has claimed faster export through WebCodecs and parallel workers **[unverified]**.
- **Install footprint:** Puppeteer downloads Chromium (about 150–300 MB per platform) **[recalled]**. That works against the one-command, small-disk goal.
- **Verdict:** a licence-clean alternative to Remotion if we ever need a browser layout engine. Commercial drift and Chromium weight make it a fallback, not the base.

### 2.4 Manim / ManimCE

- **What it is:** a Python animation engine (3Blue1Brown style). MIT licence **[recalled]**.
- **Dependencies:** Python 3, Cairo/Pango, ffmpeg, and a LaTeX distribution (often 1–4 GB) for `Tex`/`MathTex` **[recalled]**.
- **Speed:** the Cairo renderer is slow at 1080p, often a few fps for complex scenes. The OpenGL renderer is faster but less stable **[recalled]**.
- **Quality:** outstanding for maths, and very recognisable.
- **Verdict: reject.** Python and LaTeX break the install rule. We can borrow the visual vocabulary (Transform, Write, Create, LaggedStart) and do maths typesetting with a JS library (KaTeX/MathJax to SVG paths) **[recalled]**.

### 2.5 Custom renderer: `@napi-rs/canvas` (Skia) piping raw RGBA into ffmpeg

- **What it is:** Bridge owns a small scene graph and timeline written in TypeScript. Each frame is drawn with the standard Canvas 2D API on a Skia-backed `@napi-rs/canvas`. Raw pixels are written to `ffmpeg -f rawvideo -pix_fmt rgba -s 1920x1080 -r 30 -i -` through stdin.
- **Package facts:** `@napi-rs/canvas` 1.1.0, MIT, last modified 2026-10-30, `engines: node >= 10` **[verified npm]**. Prebuilt binaries for darwin x64/arm64, linux x64/arm64 (gnu and musl), linux armv7 and riscv64, win32 x64/arm64, and android-arm64 **[verified npm]**. Per-platform binary size is about 30 MB (darwin-arm64 29.8 MB, win32-x64 39.8 MB unpacked) **[verified npm]**. No node-gyp, Cairo or system libraries are needed. The README notes glibc >= 2.18 on Linux **[verified]** (https://github.com/Brooooooklyn/canvas).
- **Features:** Path2D with PathKit operations (`op`, `simplify`, `stroke`), `GlobalFonts.registerFromPath()` to register bundled font files, PNG/JPEG/WebP encode, and **Lottie loading/seek/render to a canvas** **[verified]** (README). It also offers `getImageData`/`data()` raw pixel access, gradients, filters, `ctx.filter` blur, and canvas-level `letterSpacing` **[recalled]**.
- **Speed [estimate]:**
  - Skia's CPU rasteriser handles a typical explainer frame (gradient background, 20–100 paths, a few text runs, one blurred glow) in roughly 3–15 ms at 1080p on an M-series core **[recalled order of magnitude]**.
  - Each 1080p RGBA frame is 8.3 MB. Copying it into the ffmpeg pipe at 30–60 frames per second means 250–500 MB/s, which the pipe sustains easily on a laptop **[estimate]**.
  - libx264 `preset medium` on flat synthetic graphics at 1080p runs at about 60–150 fps on an M4 Pro and about 15–40 fps on a 4-core x86 laptop **[recalled order of magnitude]**.
  - Overall expectation: 30–80 fps on the M4 Pro, which is faster than realtime, and 8–25 fps on modest laptops. A 1-minute video (1,800 frames) would take 25–60 s on the M4 Pro and 1.5–4 min on a modest machine. This must be benchmarked in the first spike.
  - Drawing and encoding run in parallel: ffmpeg is a separate process, and frames can be drawn in `worker_threads` by splitting the timeline into chunks that are concatenated afterwards.
- **Determinism:** Skia CPU raster gives the same output across runs on the same build and platform **[recalled]**. Across OSes, anti-aliasing and font hinting can differ by a few low-order bits, and system fonts differ completely. Mitigations:
  1. Always register bundled fonts (Inter, JetBrains Mono, Noto Emoji or Twemoji as images). Never rely on system fonts.
  2. Seed all randomness from the project id.
  3. Compare golden frames with a tolerance, for example `pixelmatch` with threshold 0.1 and at most 0.5% differing pixels, per platform in CI.
  4. Golden-test the PNG frames, not the mp4 bytes.
- **Text quality:** Skia's text shaping is good for Latin, including kerning and ligatures. Complex scripts and font fallback are weaker than a browser **[recalled]**. Bridge needs auto-fit, wrapping and per-word highlighting, so the layout code is ours either way.
- **Preview sharing:** strong. The same scene functions take a `CanvasRenderingContext2D` and a time `t`. In the browser they draw into a `<canvas>` driven by `requestAnimationFrame`. In Node they draw into `@napi-rs/canvas`. The constraint is to use only APIs both sides implement and to load fonts on both sides (`FontFace` in the browser, `GlobalFonts` in Node).
- **Cost:** we write the scene graph, easing, layout and text-fit code, about 2–4k lines for a strong v1 **[estimate]**. In return there are no licence strings attached and we have full control.
- **Verdict: recommended.**

### 2.6 `skia-canvas`

- `skia-canvas` 4.0.0, MIT, modified 2026-10-14, `engines: node >= 18` **[verified npm]**. It downloads its native binary at install time (dependencies include `follow-redirects` and `https-proxy-agent`) **[verified npm]**. That is less robust behind proxies than napi-rs's optionalDependencies model.
- Strengths: GPU (Metal/Vulkan) rendering, multi-page export, and a native video/frame API in recent versions **[recalled / unverified for v4]**. Text features are richer (font variants, `textWrap`) **[recalled]**.
- **Verdict:** a credible backup. Keep the drawing code behind a thin `Surface` interface so we can swap. Prefer `@napi-rs/canvas` because it ships binaries through npm optionalDependencies and has broader platform coverage.

### 2.7 Headless Chromium plus canvas/WebCodecs (Puppeteer/Playwright)

- Run our own scene code in a headless page. Encode with `VideoEncoder` (WebCodecs) or stream frames out to ffmpeg.
- Benefits: the same engine as the preview, CSS layout, and best-in-class text.
- Costs: about 150–300 MB browser download, slower per-frame transfer between processes, and WebCodecs H.264 support that depends on the platform (Linux Chromium builds often lack a proprietary H.264 encoder) **[recalled]**.
- **Verdict:** a possible later "high-fidelity HTML scene" mode. Not the default.

### 2.8 Lottie

- `lottie-web` 5.13.0, MIT, 25 MB unpacked **[verified npm]**. Lottie is an animation format (from After Effects via Bodymovin), not an authoring tool.
- `@napi-rs/canvas` can render Lottie headless **[verified]**, so Bridge can use Lottie files as **assets** (animated icons) inside its own renderer.
- **Verdict:** a useful asset format. Ship a small curated set of LottieFiles icons only if their licence allows (the free-animation licence on lottiefiles.com is permissive, but check it per asset **[unverified]**), or draw icons in code.

### 2.9 FFmpeg filter-graph only

- Build the whole video from `drawtext`, `overlay`, `xfade`, `geq` and `color` filters.
- Fast and dependency-light, but `drawtext` needs fontconfig/freetype in the build. Animated layout via expressions is painful and the visual ceiling is low (slideshow quality) **[recalled]**.
- **Verdict:** use ffmpeg for encoding and audio mixing only, not for visuals.

### 2.10 editly

- MIT, 0.14.2, last modified 2025-01-19 **[verified npm]**. JSON-described edits with layer types `title`, `subtitle`, `canvas`, `fabric`, `gl` and others. It needs ffmpeg and ffprobe on PATH. The README warns about headless-gl build steps on Linux and native rebuilds (`--build-from-source`), and says "This project is maintained by me alone" **[verified]** (https://github.com/mifi/editly).
- **Verdict: reject.** It brings native-build pain (gl, canvas) and slideshow-level visuals.

### 2.11 Etro

- `etro` 0.14.1, **GPL-3.0**, modified 2026-08-12 **[verified npm]**. A browser-first TypeScript video-editing framework.
- **Verdict: reject.** A GPL library linked into our bundle would force GPL on Bridge, and it is browser-centric.

### 2.12 Theatre.js

- `@theatre/core` 0.7.2, Apache-2.0, last modified 2024-05-19 **[verified npm]**. A keyframe and sequence editor for web animation, with no video export of its own.
- **Verdict:** not a renderer. Its sequence model is a design reference only. It looks dormant.

### 2.13 Newcomers in 2025–2026

I could not run a web search this session. These are leads only:

- **Midrender** (commercial successor around Revideo) **[verified that the redirect exists, details unverified]**.
- **Diffusion Studio Core**: a WebCodecs-based browser video engine **[unverified licence and status]**.
- **Twick, Hyperframes and other "HTML to video for AI agents" libraries** that appeared alongside agentic video tools **[unverified]**.
- **Remotion's AI/agent features.** Remotion's pricing page mentions "AI agents and Remotion Studio" under Creators **[verified]** (https://www.remotion.pro/license). The licence issue stays the same.

None of these change the recommendation. Re-check them before v1.

### 2.14 Summary table

| Option | Quality ceiling | Speed at 1080p30 (laptop) | Determinism | Install | Licence | Text | Shared preview |
|---|---|---|---|---|---|---|---|
| Remotion | Very high | ~10–40 fps [recalled] | Good on pinned Chrome | Chromium + ~18 MB compositor | **Source-available; paid above 3 people** [verified] | Excellent | Excellent |
| Motion Canvas | High | Editor only [verified] | Good | Vite + browser | MIT | Good | Excellent |
| Revideo | High | Chromium class | Good | Puppeteer + Chromium | MIT, commercial drift | Good | Good |
| Manim CE | Very high (maths) | Slow [recalled] | Good | Python + LaTeX | MIT | Good | None |
| **@napi-rs/canvas → ffmpeg** | High (2D) | **~30–80 fps M4, ~8–25 modest [estimate]** | **Excellent (same platform)** | **~30 MB prebuilt, no build** | **MIT** | Good (Latin) | **Same code in browser canvas** |
| skia-canvas → ffmpeg | High | Similar or faster (GPU) | Good | Downloads binary at install | MIT | Very good | Same |
| Chromium + WebCodecs | Very high | ~15–40 fps [estimate] | Good | ~150–300 MB | BSD (Chromium) | Excellent | Same |
| Lottie | Asset only | n/a | n/a | Small | MIT | n/a | n/a |
| FFmpeg filters | Low | Very fast | Excellent | ffmpeg only | LGPL/GPL | Poor | None |
| editly | Low–medium | Medium | OK | Native gl/canvas builds | MIT | OK | None |
| Etro | Medium | Browser | OK | Browser | **GPL-3.0** | OK | Yes |
| Theatre.js | n/a | n/a | n/a | Small | Apache-2.0 | n/a | Editor |

---

## 3. Renderer architecture sketch (for the chosen option)

```
ScriptPlan (JSON from LLM) ──► Storyboard compiler ──► Timeline (scenes, tracks, keyframes, captions)
                                                          │
             ┌────────────────────────────────────────────┴───────────────────────┐
             ▼                                                                    ▼
   Browser preview: <canvas> + rAF                         Exporter: N worker_threads × @napi-rs/canvas
   drawFrame(ctx, t)  (same module)                        drawFrame(ctx, t) → RGBA → ffmpeg stdin (per chunk)
                                                                    │
                                              concat chunks + mux narration/music WAV → mp4 (+ .srt/.vtt)
```

- **Pure function per frame:** `drawFrame(ctx, timeline, t)` reads no global state. This makes frames random-access, chunk-parallel and golden-testable.
- **Chunked parallel render:** split the frames into K chunks, where K = physical cores − 1, capped at 6. Each worker runs its own ffmpeg with the same settings and closed GOPs, writing `chunk_i.mp4`. Join them with the concat demuxer (`-f concat -c copy`). Mux audio in a final pass. This avoids one serial encoder becoming the bottleneck **[recalled technique]**.
- **Back-pressure:** respect `stdin.write()` returning false and wait for `drain`. Otherwise memory explodes at 8.3 MB per frame.
- **Colour:** draw in sRGB. Tell ffmpeg the input is full-range RGB and tag the output BT.709 limited range: `-vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" -color_primaries bt709 -color_trc bt709 -colorspace bt709`. Without this, saturated brand colours shift slightly after the YUV conversion **[recalled]**.
- **Fonts:** bundle OFL fonts (Inter, Space Grotesk, JetBrains Mono, Noto Sans subsets). Bridge then has no system-font dependency, and the same files load in the preview with `FontFace`.

---

## 4. ffmpeg distribution

### 4.1 Options

| Source | Licence of binary | Size | Platforms | Notes |
|---|---|---|---|---|
| **System ffmpeg** (Homebrew, apt, winget/choco) | Usually GPL (has libx264) | 0 for us | Wherever the user has it | This machine: ffmpeg 8.1.2 Homebrew, `--enable-gpl --enable-libx264 --enable-videotoolbox` **[verified locally]** |
| **`ffmpeg-static`** 5.3.0 | **GPL-3.0-or-later** **[verified npm]** | darwin-arm64 binary 18.4 MB gzipped / 43.5 MB unpacked **[verified]** (https://github.com/eugeneware/ffmpeg-static/releases) | macOS x64/arm64, Linux x86/x64/armhf/arm64, Windows x86/x64; ffmpeg **6.1.1** **[verified]** (https://github.com/eugeneware/ffmpeg-static) | `install` script downloads the binary from GitHub releases at `npm install` **[verified npm: scripts.install = node install.js; deps include https-proxy-agent]** |
| `@ffmpeg-installer/ffmpeg` 1.1.0 | LGPL-2.1 label **[verified npm]** | ~? | Several | Last modified 2022-06-12 **[verified npm]**. Stale, so reject. |
| Remotion's bundled ffmpeg | Inside Remotion's packages | ~18 MB compositor | 7 targets | Tied to the Remotion licence. Reject. |
| ffmpeg.wasm | LGPL/GPL builds | ~30 MB wasm | Anywhere | 5–20× slower than native **[recalled]**. Reject for export. |

Binary sources used by `ffmpeg-static`: gyan.dev (Windows x64), johnvansickle.com (Linux), evermeet.cx (macOS Intel), osxexperts.net (Apple Silicon) **[verified]** (https://github.com/eugeneware/ffmpeg-static).

### 4.2 Licence implications

- FFmpeg itself is LGPL-2.1+. Building with `--enable-gpl` or GPL libraries such as libx264 makes "GPL apply to all of FFmpeg" **[verified]** (https://ffmpeg.org/legal.html).
- Bridge runs ffmpeg as a **separate process** over pipes. It does not link it. The FSF GPL FAQ treats invoking a separate program through pipes and the command line as "mere aggregation" in normal cases, so Bridge can stay MIT/Apache **[recalled]**.
- When `ffmpeg-static` fetches the binary at install time, Bridge's repo and npm tarball never contain GPL code. The user downloads it from the ffmpeg-static release. If we ever **ship** a GPL ffmpeg inside an installer (Electron, a zip download), we must give recipients the corresponding source or a written offer, the configure line and the licence text **[recalled GPL obligations]**.
- An LGPL-only build (no libx264) would have to use `h264_videotoolbox` (macOS), `h264_mf` (Windows Media Foundation) or OpenH264 for H.264. Quality per bit and availability vary. It is not worth the complexity for v1 **[recalled]**.
- Patents: FFmpeg's legal page says patent status is unknown and depends on jurisdiction **[verified]**. H.264 encoding for free end-user software has historically not been a practical problem, but it is worth noting **[recalled]**.

### 4.3 Recommended resolution order

1. `BRIDGE_FFMPEG` env var, or the path in Bridge config.
2. `ffmpeg` on PATH, if `ffmpeg -version` reports ≥ 6.0 and `-encoders` lists `libx264` and `aac`.
3. `ffmpeg-static`, declared as an **optionalDependency** so a failed download (proxy, offline) does not fail `npm install`.
4. Otherwise show a friendly doctor message with per-OS install commands.

`bridge doctor` prints which ffmpeg was chosen, its version, and whether it is a GPL build.

---

## 5. Encoding settings

### 5.1 Video

Recommended default for Bridge content (flat colours, sharp text, gradients):

```
ffmpeg -y \
  -f rawvideo -pix_fmt rgba -s 1920x1080 -r 30 -i pipe:0 \
  -i mix.wav \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset medium -crf 20 -tune animation \
  -profile:v high -level:v 4.1 -g 60 -keyint_min 60 -sc_threshold 0 -bf 2 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -c:a aac -b:a 160k -ar 48000 -ac 2 \
  -movflags +faststart \
  -shortest out.mp4
```

Why each setting:

- **H.264 High profile, yuv420p, 4:2:0.** This is the widest-compatibility combination: QuickTime, Windows Photos, every browser, iOS, Android, Slack, WhatsApp. yuv444p or 10-bit output fails in QuickTime and many players **[recalled]**. YouTube's upload guidance asks for H.264 progressive, High Profile, 2 consecutive B-frames, closed GOP of half the frame rate, CABAC, 4:2:0 chroma, an MP4 with the moov atom at the front, AAC-LC at 48 kHz stereo, and about 8 Mbps for 1080p at 24–30 fps **[verified]** (https://support.google.com/youtube/answer/1722171).
- **CRF.** x264's CRF scale runs 0–51 with a default of 23. Around 18 is "visually lossless", and each ±6 roughly halves or doubles the bitrate **[recalled; the FFmpeg wiki was unreachable this session]**. Flat synthetic graphics compress extremely well, so CRF 18–20 gives small files. Expected size for 1080p30 explainers at CRF 20: about 1–4 Mbps, so 8–30 MB per minute **[estimate]**. Offer quality presets: "Small" (CRF 24), "Standard" (CRF 20), "Crisp" (CRF 17).
- **`-tune animation`** raises deblocking and reference frames for flat-shaded content **[recalled]**.
- **`-preset medium`** is a good default. `slow` saves about 5–10% size at roughly 2× encode time. `veryfast` suits drafts **[recalled]**.
- **GOP 60 at 30 fps (2 s), closed, no scene-cut keyframes.** Predictable seeking, safe chunk concatenation, and a match for YouTube's guidance (YouTube asks for half the frame rate, but 1–2 s is fine for local playback).
- **`-movflags +faststart`** moves the moov atom to the front so the file plays progressively in browsers and messaging apps **[recalled; also implied by the YouTube guidance above]**.
- **Draft mode:** 720p, `-preset veryfast -crf 26`, for quick previews.
- **Hardware encoders** (`h264_videotoolbox`, `h264_nvenc`, `h264_qsv`, `h264_amf`) are much faster but worse at equal bitrate and differ by platform. Offer them as opt-in "fast export" only **[recalled]**.

### 5.2 Audio

- AAC-LC at 160 kbps stereo, 48 kHz, which YouTube recommends **[verified]**. 128 kbps is fine for voice-plus-music beds **[recalled]**.
- Mix and loudness-normalise in our own code or in an ffmpeg `loudnorm` two-pass before muxing. See VOICE_AND_SOUND.md.

### 5.3 Captions

| Approach | Pros | Cons |
|---|---|---|
| **Burned-in, drawn by our renderer** | Always visible (social autoplay is often muted), full styling (karaoke word highlight, brand colours), no player support needed | Cannot be turned off or translated; must avoid covering visuals |
| **Soft subtitles, `mov_text` track in MP4** (`-c:s mov_text`, `-metadata:s:s:0 language=eng`) | Toggleable, accessible, tiny | QuickTime, VLC and most desktop players show them. **Browsers ignore embedded mp4 text tracks**; social sites usually ignore them **[recalled]** |
| **Sidecar `.srt` / `.vtt`** | Upload to YouTube, LinkedIn and Vimeo; use with `<track>` on the web | Separate file |

Recommendation:

- Draw captions in-frame by default with word-level highlighting (style "pop"), with a toggle to switch it off.
- Always also emit `video.srt` and `video.vtt`.
- Optionally mux a `mov_text` track (off by default; the mp4 must still play everywhere).
- Do **not** use ffmpeg's `subtitles`/`ass` filter for burn-in. It requires libass and fontconfig in the ffmpeg build (ffmpeg-static's builds vary) and duplicates styling we already control **[recalled]**.

---

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| We underestimate the cost of owning a renderer | Keep scope 2D. Port proven ideas (Motion Canvas easing and sequencing, Manim transforms). Ship 8–12 scene templates instead of a general engine. |
| Skia text shaping falls short for some scripts | Bundle Noto fonts per script. Fallback chain in `GlobalFonts`. Test Arabic/Devanagari/CJK golden frames before claiming support. |
| A native module fails on an exotic platform | `@napi-rs/canvas` covers 11 targets **[verified npm]**. Add an `npm doctor` check. Keep a `skia-canvas` adapter as plan B. |
| `ffmpeg-static` download blocked | optionalDependency plus system-ffmpeg detection plus a clear doctor message. |
| Speed lower than estimated on a 4-core laptop | Chunk-parallel workers, draft mode at 720p and `veryfast`, cache static layers (backgrounds) as pre-rendered images, avoid per-frame blur. |
| Browser preview and export drift apart | One `drawFrame` module. CI renders the same frames in Node and in headless Chromium (Playwright, dev-only) and compares them with tolerance. |

---

## 7. Recommendation

1. **Renderer:** a custom 2D scene engine in TypeScript drawing with the Canvas 2D API. Export uses `@napi-rs/canvas` (MIT, prebuilt Skia binaries for 11 targets) piping raw RGBA frames to ffmpeg, with chunk-parallel workers. The browser preview uses the same `drawFrame` module on an HTML `<canvas>`.
2. **Do not use Remotion.** Its licence requires paid company licences for organisations above 3 people and for prompt-to-video apps, and Bridge cannot pass on a free licence.
3. **Keep a `Surface` adapter** so `skia-canvas` or a headless-Chromium mode can be added later.
4. **ffmpeg:** system first, `ffmpeg-static` (GPL-3.0, fetched at install, not vendored) as an optional fallback, run as a separate process.
5. **Encoding:** H.264 High, yuv420p, CRF 20, `-tune animation`, `preset medium`, 2 s closed GOP, BT.709 tags, AAC-LC 160k at 48 kHz, `+faststart`.
6. **Captions:** burned-in, styled by our renderer, plus sidecar SRT/VTT, plus optional `mov_text`.

This matches the tentative choice (custom `@napi-rs/canvas` → ffmpeg). Nothing found contradicts it. The one caveat: render speed is an estimate, so a benchmark spike is the first task.

---

## 8. Draft ADR

```
# ADR-00X: Code-drawn 2D renderer on @napi-rs/canvas, encoded by external ffmpeg

Status: Proposed
Date: 2026-11-03

## Context
Bridge turns documents into 1080p explainer videos drawn entirely by code. It must install
with one npm command on macOS, Windows and Linux, run headless, render faster than ~5x
realtime-equivalent budget on modest laptops, be deterministic for golden tests, share scene
code with a live browser preview, and remain free for anyone, including companies, to use and
self-host.

Remotion meets the quality bar, but its licence is source-available: organisations above
3 people and "prompt-to-video" automators need a paid Company License ($25/seat/month or
$0.01/render, $100/month minimum), and terms will change in Remotion 5.0. Motion Canvas (MIT)
renders only from its editor; Revideo (MIT) is drifting into a commercial product (Midrender)
and needs Puppeteer/Chromium. Manim requires Python and LaTeX. editly needs native gl builds;
Etro is GPL-3.0.

## Decision
- Build a small TypeScript scene/timeline engine. Each frame is a pure function
  drawFrame(ctx, timeline, t) written against the standard Canvas 2D API.
- Export: @napi-rs/canvas (MIT, Skia, prebuilt via optionalDependencies) renders RGBA frames
  that are streamed to ffmpeg stdin. Frames are rendered in K worker_threads chunks, each with
  its own ffmpeg; chunks are concatenated and muxed with audio.
- Preview: the same drawFrame module draws into an HTML <canvas> in the web UI.
- Fonts are bundled (OFL) and registered on both sides; no system fonts.
- ffmpeg resolution: BRIDGE_FFMPEG → PATH (≥6.0 with libx264+aac) → ffmpeg-static
  (optionalDependency, GPL-3.0, downloaded at install) → doctor message. ffmpeg is always a
  separate process; Bridge never links it.
- Output: H.264 High, yuv420p, CRF 20, -tune animation, preset medium, 2 s closed GOP,
  BT.709 tagged, AAC-LC 160 kb/s 48 kHz stereo, +faststart.
- Captions: burned in by our renderer (toggle), plus sidecar .srt/.vtt, optional mov_text.

## Consequences
+ MIT-compatible end to end; no per-render fees for anyone.
+ ~30 MB native footprint instead of a ~150–300 MB browser.
+ Deterministic frames enable golden-frame tests (tolerance-based across OSes).
+ One codebase for preview and export.
− We own the scene engine, layout and text fitting (est. 2–4k LOC for v1).
− Skia text shaping is weaker than a browser for complex scripts; must test before claiming.
− Render speed is estimated (30–80 fps M4 Pro, 8–25 fps modest laptop) and must be confirmed
  by a benchmark spike before this ADR is accepted.

## Revisit if
- The benchmark spike shows <10 fps at 1080p on a 4-core x86 laptop with chunking.
- We need HTML/CSS layout (e.g. rendering web pages); then add a headless-Chromium Surface.
```

---

## Sources opened this session

- https://github.com/remotion-dev/remotion/blob/main/LICENSE.md
- https://www.remotion.pro/license
- https://www.remotion.dev/docs/license/faq
- https://www.remotion.dev/docs/performance
- https://github.com/motion-canvas/motion-canvas
- https://motioncanvas.io/docs/rendering
- https://github.com/redotvideo/revideo
- https://midrender.com/revideo/docs (redirect target of docs.re.video)
- https://github.com/Brooooooklyn/canvas
- https://github.com/eugeneware/ffmpeg-static and /releases
- https://ffmpeg.org/legal.html
- https://github.com/mifi/editly
- https://support.google.com/youtube/answer/1722171
- npm registry metadata for remotion, @remotion/renderer, @revideo/renderer, @motion-canvas/core, @napi-rs/canvas, skia-canvas, ffmpeg-static, @ffmpeg-installer/ffmpeg, editly, etro, @theatre/core, lottie-web
- Unreachable this session: https://trac.ffmpeg.org/wiki/Encode/H.264 (connection refused)
