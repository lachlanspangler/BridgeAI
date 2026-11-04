# Bridge

**Paste a paper, a project, images or notes. Get a short, super visual, colourful explainer video** with a voiceover, music, sound effects and captions. You pick the length: 20 seconds gets you the single most important idea; 5 minutes gets you the whole story. Every claim in the video is traced back to where it came from in your source.

Free and local: it works with **zero keys** (a local open model, a local voice, music and visuals made in code). Bring your own key (Anthropic, OpenAI, Google Gemini, OpenRouter with one-click sign-in, ElevenLabs) for better scripts or voices.

> This version is for public material and your own notes. Don't paste confidential work content into it.

## Quick start

Needs Node 20.19+ and ffmpeg (macOS `brew install ffmpeg` · Windows `winget install Gyan.FFmpeg` · Linux `sudo apt install ffmpeg`).

```bash
make setup     # npm install + browser for tests + local models (Qwen3.5-4B 2.7 GB, Kokoro 0.3 GB), disk-checked
make dev       # open http://127.0.0.1:7411
```

Or from the command line:

```bash
make video IN=evals/sources/attention-abstract.txt LEN=20
npx tsx src/cli/main.ts make https://arxiv.org/abs/1706.03762 --len 60
npx tsx src/cli/main.ts make ./some-project-folder --len 180
make doctor    # says exactly what's missing and how to fix it
```

No GPU needed. On an Apple M4 Pro a 20-second video takes about 2 minutes end to end on the free path (most of it is the local model thinking).

## What you get
- `video.mp4` (1080p H.264, AAC, soft subtitles), with captions also burned in
- `captions.vtt` / `.srt`, `script.md` with timestamps and page/line references
- `sourcemap.json`: every narrated claim → the source segments that support it (page, lines, file)
- the app shows the script next to the video; click a line to see its source

## How it works
ingest → key ideas (ranked, with verified quotes) → a script sized to your length → a **faithfulness gate** (numbers, names, overstatements and claims checked against the source; unsupported beats are dropped) → voice per beat → length fit on the real audio (±10 %) → animated scenes drawn in code → mixed audio (music ducked under the voice, SFX on transitions, −14 LUFS) → mp4. See `docs/research/BUILD_AN_AI.md` and `docs/adr/`.

## Privacy and security
- The server listens on **127.0.0.1 only** and refuses requests from other sites (Host allowlist, same-origin writes, no CORS).
- Keys live in your OS keychain (or an owner-only file), are never shown again, never logged, and only ever sent to their own provider.

## For contributors
Start with `CLAUDE.md` and `docs/WORKFLOW.md`. `make check` runs everything CI runs. Status and next steps: `docs/STATUS.md`. Ideas: `docs/IDEAS.md`. Evals: `docs/EVALS.md`.

## Licences
Bridge: MIT. Fonts: Inter, Space Grotesk, JetBrains Mono (OFL). Models (downloaded, not bundled): Qwen3.5 (Apache-2.0), Kokoro-82M (Apache-2.0). ffmpeg is used as a separate program. Eval sources: see `evals/sources/LICENSES.md`.
