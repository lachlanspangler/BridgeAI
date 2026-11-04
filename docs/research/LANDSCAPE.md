# Landscape: existing tools and the gap Bridge fills

Status: research note, written 2026-11-03. Public web only.

## How to read this file

- **[verified]**: I opened the page in this session and it says so. URL given.
- **[recalled]**: prior knowledge, not re-checked this session.
- **[unverified]**: plausible but not sourced.

Prices change monthly. Every price below is as seen on 2026-11-03 or marked otherwise. Before quoting a price publicly, re-open the page.

Column meanings used in the summaries:

- **Input**: what you can give it.
- **Output**: what comes out.
- **Length control**: can you ask for an exact duration?
- **Faithfulness**: does it cite sources or check claims against the input?
- **Price / free tier**.
- **Local / offline**: can it run on your laptop without the internet?
- **Open source**.
- **AV**: voice, music, captions.

---

## 1. Google NotebookLM, now "Gemini Notebook"

**Biggest surprise of this research:** notebooklm.google now redirects (301) to notebook.google, titled "Gemini Notebook". [verified] https://notebook.google/ . The help centre still lives under support.google.com/notebooklm but calls the product Gemini Notebook. [verified]

### Video Overviews

- Launched 29 July 2025 as "narrated slides", English first. The AI "pulls in images, diagrams, quotes and numbers from your documents" and you can steer focus, learning goals and audience. [verified] https://blog.google/technology/google-labs/notebooklm-video-overviews-studio-upgrades/
- Current state (Nov 2026) [verified] https://support.google.com/notebooklm/answer/16454555 :
  - Three formats: **Cinematic** (storytelling, English only, 18+), **Explainer** (structured, comprehensive), **Short** (about 60 seconds).
  - Visual styles: Classic, Whiteboard, Watercolor, Retro Print, Heritage, Paper-craft, Kawaii, Anime, auto, or a custom described style. Styles don't apply to Cinematic or Short.
  - Steering prompt, language choice, and "producer notes" you can review before rendering (co-creating with producer notes is Google AI Ultra only).
  - Generation "can take more than 30 minutes".
  - The help page does not say whether videos cite their sources.
- Length control: three format presets. No exact duration (no "give me 20 s" or "give me 3 min"). [verified, same page]

### Audio Overviews

- Formats: Deep Dive (two hosts, default), Brief (single speaker, under 2 min), Critique, Debate. Length: Shorter, Default, Longer (Longer is English only). 80+ languages. Interactive mode lets you interrupt the hosts by voice (English only). [verified] https://support.google.com/notebooklm/answer/16212820

### Limits and price

- Free "Standard" tier: 100 notebooks, 50 sources per notebook. Plus 200/100, Pro 500/300, Ultra 500/500–600. Daily overview quotas exist but are on a separate page. [verified] https://support.google.com/notebooklm/answer/16213268

### Summary

| Input | Output | Length control | Faithfulness | Price | Local | OSS | AV |
|---|---|---|---|---|---|---|---|
| PDFs, Docs, Slides, URLs, YouTube, text, audio [recalled] | Narrated slide/illustrated video; podcast audio | Presets (Short ≈ 60 s, Explainer, Cinematic); no exact duration | Chat answers cite sources [recalled]; videos: not stated | Free tier + paid Google AI plans | No (cloud) | No | Voice yes; music: [unverified]; captions: [unverified] |

**What it does well:** it is the closest competitor and it is free. It grounds on your sources, makes visuals that draw on your figures, handles many languages, and now has a ~60 s mode.

**What it lacks for Bridge's use case:** no exact length; no visible per-claim source map in the video; cloud only (you must upload your paper to Google); not open; 30+ min waits; no code/software-project mode; not reproducible.

---

## 2. Avatar and template "AI video" platforms

These tools target marketing, corporate training and social. They mostly turn a script, a URL or a slide deck into a video with a talking avatar or stock footage. None is built around faithfulness to a technical source.

### Synthesia

- Free Basic: 10 min/month of video, 9 AI avatars, watermark, 1 editor. Starter $19/mo ($9 first month; $14/mo yearly), ~12 min/mo extra. Pro $89/mo ($49 first month; $59/mo yearly), ~60 min/mo. 140+ languages and voices. [verified] https://www.synthesia.io/pricing
- Inputs: script, and document/URL/PPT via its AI assistant [recalled].
- Output: avatar presenter videos for training. Length follows the script. Captions yes [recalled]. Music library [recalled].
- Local: no. OSS: no. Citations: no [recalled].

### HeyGen

- Free: 3 videos/month, ≤ 1 min each, watermarked, 30+ languages. Creator $29/mo ($24 yearly), 600 credits, videos ≤ 30 min, 1080p. Pro $49/mo, 4K. Business $149/mo, ≤ 60 min. [verified] https://www.heygen.com/pricing
- Strength: the most realistic avatars and lip-synced translation. [recalled]
- Inputs: script, photo, URL, PDF via "Video Agent" [recalled]. Local: no. OSS: no. Citations: no.

### Pictory

- 14-day trial: 3 videos, 10 min, 720p, watermark. Starter $25/mo yearly ($29 monthly), 30 min/mo; Professional $35/$59; Teams $119/$199. Script, URL, blog and PPTX input; PDF and Doc-to-video in the Create menu. Auto subtitles with .srt/.vtt export; 5,000–15,000 music tracks; ElevenLabs voices. Max script/URL video length 30 min (5 min on trial). [verified] https://pictory.ai/pricing
- Visuals: stock footage matched to sentences. [recalled] Local: no. OSS: no.

### InVideo AI

- Starter $10/seat/mo yearly (400 credits), Plus $30 (2,000 credits), Max $250 (8,000 credits). Credits don't roll over and costs "may change at any time without notice". Generative video via Seedance models. [verified] https://invideo.io/pricing
- Input: a prompt; it writes the script and assembles stock or generated clips, voice, music and subtitles. [recalled] Local: no. OSS: no.

### Lumen5

- Pricing page did not render for me. [unverified for numbers] Known as blog-post-to-video with stock footage and text overlays; free tier with watermark and 720p. [recalled]

### Descript

- Free: 1 media hour/month, 100 one-time AI credits, 720p with watermark, unlimited dynamic captions. Hobbyist $16/$24, Creator $24/$35, Business $50/$65. AI co-editor "Underlord"; 25+ stock AI voices (60+ on Business), voice clones. [verified] https://www.descript.com/pricing
- It is an editor (edit video by editing the transcript), not a generator from a paper. Best-in-class captions and text-based editing. Local: desktop app, but cloud features. OSS: no.

### Fliki

- Free: 3 credits/month, 5 min export, 720p, watermark, 300 voices, 80+ languages. Standard 15 min exports at 1080p; Premium 40 min, API access. Inputs: idea, script, blog post, PPT (no PDF listed). The page contradicts itself on some numbers. [verified] https://fliki.ai/pricing
- Strength: very large voice library. Local: no. OSS: no.

### Steve AI (Animaker)

- Plans from about $10/mo yearly; the page shows two inconsistent price sets and both Steve AI and Animaker plan names. Free tier: 5 voice-overs, 5 AI video credits, 10 AI image credits; resolution and watermark not stated for free. Paid: 720p (Basic) to 4K (Enterprise). Animated characters and avatars. [verified] https://app.steve.ai/pricing
- Local: no. OSS: no.

### Visla

- Free, Pro, Business, Enterprise; prices not shown on the page. Inputs on all plans include idea, script, URL, audio, PDF and PPT. Free plan carries a watermark; exports 16:9, 9:16, 1:1. [verified] https://www.visla.us/pricing
- Local: no. OSS: no.

### Elai

- Free: 1 min/month. Creator $29/mo ($23 yearly), 15 min. Team $125/mo, 50 min. Extra minutes $2. PPTX-to-video; 75+ (or "100+", inconsistent) languages. [verified] https://elai.io/pricing
- Avatar presenter style. Local: no. OSS: no.

### Colossyan

- Free Starter: 20 min/month (NEO), video length ≤ 20 min, 1080p, watermark. Professional $59/mo yearly. PDF, Word and PPT to video; interactive videos, branching, quizzes; SCORM export on paid plans; 120+ languages. [verified] https://www.colossyan.com/pricing
- Strength: built for L&D. Quizzes and SCORM are things Bridge's teaching angle should learn from. Local: no. OSS: no.

### Vyond

- Starter $58/mo yearly ($99 monthly), Professional $100 ($199), Enterprise $137, Agency $167. Vyond Go makes a video from a prompt, document, PDF, PPT, TXT or URL (800 credits per generation). Max length 25–90 min by plan. 1080p MP4 export. Free trial length not stated. [verified] https://www.vyond.com/pricing/
- Strength: a big library of animated characters and scenes. Local: no. OSS: no.

### Canva (video editor, Magic Media, AI video)

- Pricing page returned 403 to my fetch. [unverified for numbers]
- Canva has a full video editor, Magic Media text-to-image/video, and a Veo-based short clip generator on paid plans. [recalled] Huge template and font library; Brand Kit for consistent colours. Local: no. OSS: no.

---

## 3. Generative video models

These make photoreal or stylised clips from a prompt. They are not explainers. They cannot reliably draw a correct chart, render legible text, or show a real figure from your paper. They can make a nice B-roll shot.

### OpenAI Sora

- Sora 2 launched 30 Sept 2025 with a social iOS app; all videos watermarked. [verified] https://en.wikipedia.org/wiki/Sora_(text-to-video_model)
- **Second big surprise:** on 24 March 2026 OpenAI announced it was discontinuing Sora. The app shut on 26 April 2026; the API is scheduled to shut on 24 September 2026 (so it should be off by now). Reports linked it to compute and cost (estimated ~$1M/day). [verified, same page, which cites news reports] openai.com/sora returned 403 to my fetch, so I could not confirm from OpenAI directly.
- Lesson for Bridge: hosted generative-video products can disappear. A local, code-drawn pipeline cannot be shut down by a vendor.

### Google Veo

- Veo 3.1 is current. Clips are 8 s; "Scene Extension" continues from the last second. 1080p and 4K. Native audio (SFX, ambience, dialogue), with short speech still "being refined". Access via Gemini app, Flow, Google Vids, AI Studio, Gemini API. [verified] https://deepmind.google/models/veo/

### Runway

- Free: 125 one-time credits. Standard $12/mo yearly (625 credits ≈ 52 s of Gen-4.5); Pro $28 (2,250 ≈ 187 s); Max $76 (9,500 ≈ 791 s). Gen-4.5 costs 12 credits/s. Also hosts Kling 4.0, Seedance 2.0 Pro, Aleph 2.0, and audio models (Lyria 3, TTS). [verified] https://runway.com/pricing (runwayml.com now redirects to runway.com)

### Summary for the group

| Input | Output | Length control | Faithfulness | Price | Local | OSS | AV |
|---|---|---|---|---|---|---|---|
| Text/image prompt | 4–10 s clips | Per clip only | None; hallucinated text and diagrams [recalled] | ~$0.10–0.50 per second of video (Runway 12 credits/s) [derived from verified prices] | No | No (open models like Wan / HunyuanVideo exist but need big GPUs [recalled]) | Veo has native audio; no captions |

---

## 4. Paper readers and explainers (text, not video)

### Explainpaper

- Upload a paper, highlight a confusing passage, get a plain explanation in 50+ languages; Q&A "with cited sections". Free: unlimited highlight explanations with basic models. Pro $16/mo: better models, whole-paper summaries. [verified] https://www.explainpaper.com/

### SciSpace (formerly Typeset)

- Pricing page returned 403. [unverified for numbers] Chat with PDF, literature review tables, "Copilot" explanations, and an AI podcast/audio feature. [recalled]

### Elicit

- Basic free: unlimited search over 138M+ papers, unlimited summaries and chat with full text, source citations, limited Research Agent/Reports. Pro $49/user/mo yearly; Scale $229; Enterprise custom. Scale adds figure extraction and interpretation. [verified] https://elicit.com/pricing
- Strength: sentence-level citations back to the paper are the norm here. Bridge should match that bar inside a video.

### Scholarcy

- Pricing page returned 403. [unverified] Summary "flashcards", key findings, reference extraction; free browser extension tier and a low monthly paid tier. [recalled]

### alphaXiv

- An arXiv companion: discovery by topic and conference, a one-line takeaway per paper, grounded literature review, an MCP server, browser extension and an "Autoresearch" tool. Pricing and audio/video features not visible on the homepage. [verified] https://www.alphaxiv.org/ . It has offered AI-generated blog-style overviews of papers. [recalled]

**Group lesson:** these tools are good at grounded text answers, with citations. None outputs a video. Bridge is "Explainpaper, but a 1-minute video with every claim linked".

---

## 5. Research systems: paper/theorem/code to video

### Paper2Video / PaperTalker (Show Lab, NUS)

- arXiv 2510.05096 (Oct 2025). PaperTalker is "the first multi-agent framework for academic presentation video generation": slides with layout refinement by tree search, subtitles, speech, cursor grounding, talking head. Benchmark: 101 papers paired with the authors' own talk videos, slides and speaker metadata. Metrics: Meta Similarity, PresentArena, PresentQuiz, IP Memory. Claims "more faithful and informative than existing baselines". [verified] https://arxiv.org/abs/2510.05096
- Benchmark papers average ~13.3K words, 44.7 figures, 28.7 pages; reference videos average ~6 min 15 s, up to 14 min; 16 slides on average. [verified] https://showlab.github.io/Paper2Video/
- Code: MIT licence. Needs LaTeX source of the paper, OpenAI/Gemini keys (GPT-4.1 or Gemini 2.5 Pro suggested; local Qwen possible), Beamer slides via `tectonic`, voice cloned from a ~10 s reference clip, Hallo2 talking head; recommended GPU NVIDIA A6000 48 GB. A "light" pipeline skips the talking head. [verified] https://github.com/showlab/Paper2Video
- **Lessons:** (1) PresentQuiz, asking a model questions after "watching", is a usable automatic learning metric. (2) Needs LaTeX source; Bridge must work from a PDF. (3) Output is a conference talk (slides + face), long and dry, not a colourful 20 s explainer. (4) Requires a 48 GB GPU for the full path; Bridge targets an ordinary laptop.

### TheoremExplainAgent (TIGER-AI-Lab)

- arXiv 2502.19400. Agentic planner + coder generating long-form (> 5 min) Manim videos for theorems. TheoremExplainBench: 240 theorems, 5 automated metrics. o3-mini agent: 93.8 % success, overall score 0.77. Failure modes: most videos have minor layout problems; video reveals reasoning flaws that text hides. [verified] https://arxiv.org/abs/2502.19400
- Code: MIT, "research purposes only". Uses LiteLLM model names (o3-mini), Gemini + GPT-4o for evaluation, **Kokoro TTS** (kokoro-v0_19.onnx) for narration, Manim Community. ~1.5k stars. [verified] https://github.com/TIGER-AI-Lab/TheoremExplainAgent
- **Lessons:** layout overlap is the number-one defect of LLM-written Manim. Bridge's choice to use a fixed visual library (scenes as typed templates with a layout solver) rather than free-form LLM code avoids most of it. Kokoro is good enough for researchers to use; it is also Bridge's default.

### Code2Video (Show Lab)

- arXiv 2510.01174. Planner → Coder → Critic agents that write and execute Manim code. Critic is a VLM using "visual anchor prompts" to fix layout. Benchmark MMMC; metrics include VLM-judged aesthetics, code efficiency and **TeachQuiz** (make a VLM "unlearn" a topic, show it the video, test how much it recovers). Reports 40 % improvement over direct code generation. [verified] https://arxiv.org/abs/2510.01174
- Code: MIT. Best Manim code from Claude-4-Opus; critic best with gemini-2.5-pro; optional IconFinder API. No runtime or cost figures. [verified] https://github.com/showlab/Code2Video
- **Lessons:** a render → screenshot → VLM critic loop catches layout bugs. Bridge can do a cheap version locally: render key frames, run deterministic overlap/contrast/size checks (no VLM needed), and optionally a VLM critic when a key is present. TeachQuiz is a good eval idea.

### Other Manim-agent projects

- **Generative Manim / Animo**: LLM text-to-Manim; Apache-2.0; ~936 stars; many cloud models; Animo desktop app "renders on your machine with no cloud uploads"; no voice features listed. [verified] https://github.com/marcelo-earth/generative-manim
- **manim-voiceover**: MIT Manim plugin to sync animations to voiceover, with per-word timing via Whisper; TTS engines include Gemini, Azure, gTTS and pyttsx3 (pyttsx3 is offline [recalled]). [verified] https://github.com/ManimCommunity/manim-voiceover. This is the closest existing piece to Bridge's word-timed beats.
- Other related academic systems I know of but did not open: PresentAgent (doc → presentation video), "Manimator", "TheoremExplainAgent" follow-ups, and various "LLM + Manim" course projects. [recalled]

---

## 6. Open-source text-to-video repos

### MoneyPrinterTurbo

- MIT; ~138k stars, 22k forks. Topic/keyword → script → TTS → stock footage → subtitles → music → video. 9:16, 16:9, 1:1 at 1080p. TTS: Edge TTS default (no key, but cloud), plus Azure, Gemini, ElevenLabs, MiniMax, Fish Audio, and self-hosted Kokoro and Chatterbox. Subtitles via TTS timestamps or local faster-whisper. Many LLMs including local Ollama. Bundled music "from YouTube videos" with a request to remove infringing tracks. [verified] https://github.com/harry0703/MoneyPrinterTurbo
- **Lessons:** proves massive demand for "free, open, one-click video". But it makes faceless social content from stock footage, not explanations, has no faithfulness checks, and its music licensing is shaky. Bridge synthesises music in code to avoid that.

### Remotion (framework, not a generator)

- React-based programmatic video. Free for individuals, non-profits and for-profits with ≤ 3 employees; larger companies need a paid Company License. [verified] https://github.com/remotion-dev/remotion/blob/main/LICENSE.md
- **Lesson:** not truly open source for companies. If Bridge wants to be usable by anyone, it should not depend on Remotion. (Bridge's own Canvas 2D → ffmpeg renderer avoids this.)

### Others [recalled]

- **Motion Canvas** (MIT): TypeScript programmatic animation with an editor; a good reference for timing APIs ("waitUntil" markers tied to voice).
- **ShortGPT**, **AI-Youtube-Shorts-Generator**, **text2video** style repos: stock-footage shorts, similar to MoneyPrinterTurbo.
- **Open-Sora**, **Wan**, **HunyuanVideo**, **LTX-Video**: open generative video models; need large GPUs; same faithfulness problems as Sora/Veo.
- **Kokoro-82M** (Apache-2.0): small, local, good-quality TTS; used by TheoremExplainAgent and MoneyPrinterTurbo. [recalled for the model; usage verified above]

---

## 7. Gap analysis

Legend: ✓ yes, ~ partly, ✗ no, ? not known.

| Capability | NotebookLM / Gemini Notebook | Synthesia / HeyGen / Colossyan / Elai | Pictory / InVideo / Fliki / Lumen5 / Visla / Steve | Vyond / Canva | Sora / Veo / Runway | Explainpaper / Elicit / SciSpace | Paper2Video | TheoremExplainAgent / Code2Video | MoneyPrinterTurbo | **Bridge (target)** |
|---|---|---|---|---|---|---|---|---|---|---|
| Free with no account | ✗ (Google account) | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (self-host) | ✓ (self-host) | ✓ | ✓ |
| Works with zero API keys | n/a (cloud) | n/a | n/a | n/a | n/a | n/a | ✗ (OpenAI/Gemini) | ✗ (LLM + VLM keys) | ~ (Edge TTS cloud; Ollama possible) | ✓ |
| Runs offline on a laptop | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ (48 GB GPU for full) | ✗ (cloud LLMs) | ~ | ✓ |
| Open source | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ MIT | ✓ MIT | ✓ MIT | ✓ |
| PDF paper input | ✓ | ~ | ~ | ✓ (Vyond Go) | ✗ | ✓ | ✗ (needs LaTeX) | ✗ (topic only) | ✗ | ✓ |
| Software project input | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Exact length (20 s / 1 / 3 / 5 min / custom) | ~ (Short ≈ 60 s preset) | ~ (follows script) | ~ (follows script) | ~ | per clip | n/a | ✗ | ✗ (> 5 min) | ~ (target length) | ✓ |
| Content scaled to length (1 idea at 20 s) | ~ | ✗ | ✗ | ✗ | ✗ | n/a | ✗ | ✗ | ✗ | ✓ |
| Per-claim source map | ? (not stated for video) | ✗ | ✗ | ✗ | ✗ | ✓ (text) | ✗ | ✗ | ✗ | ✓ |
| Faithfulness gate / evals | ? | ✗ | ✗ | ✗ | ✗ | ~ | ✓ (benchmark) | ✓ (benchmark) | ✗ | ✓ (gate + eval set) |
| Real figures cropped from the paper | ✓ ("pulls in images, diagrams") | ✗ | ✗ | ✗ | ✗ | ~ (Elicit Scale) | ✓ (slides) | ✗ | ✗ | ✓ |
| Code-drawn diagrams and charts that build | ~ (slides/illustrations) | ✗ | ✗ | ~ (templates) | ✗ | ✗ | ✗ (static slides) | ✓ (Manim) | ✗ | ✓ |
| Consistent semantic colour system | ~ | ~ (brand kit) | ~ (brand kit) | ~ (brand kit) | ✗ | n/a | ✗ | ~ | ✗ | ✓ |
| Voiceover | ✓ | ✓ (best voices) | ✓ | ✓ | ~ (Veo) | ✗ | ✓ (cloned) | ✓ (Kokoro) | ✓ | ✓ (Kokoro / system / BYO) |
| Music bed | ? | ✓ | ✓ | ✓ | ~ | ✗ | ✗ | ✗ | ✓ (license risk) | ✓ (synthesised) |
| Burned + exported captions | ? | ✓ | ✓ (.srt/.vtt) | ✓ | ✗ | ✗ | ✓ | ~ (SRT) | ✓ | ✓ |
| Many languages | ✓ (80+ audio) | ✓ (140+) | ✓ | ✓ | ~ | ✓ | ~ | ✗ | ✓ | ~ (later) |
| Quizzes / LMS export | ✗ (separate tools) | ✓ (Colossyan SCORM) | ✗ | ✓ (Vyond SCORM) | ✗ | ✗ | ✗ | ✗ | ✗ | ~ (3 check questions) |
| Deterministic / reproducible render | ✗ | ✗ | ✗ | ✗ | ✗ | n/a | ~ | ~ | ~ | ✓ (seeded core) |
| Data stays on your machine | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ (cloud LLM) | ✗ | ~ | ✓ (free path) |

---

## 8. What Bridge does that nobody does

1. **Free, local, zero keys, on an ordinary laptop.** Every research system above needs paid LLM/VLM keys or a 48 GB GPU. Every product is cloud-only. Bridge's free path is a small local model (or the extractive floor), Kokoro or system TTS, synthesised music, and code-drawn visuals. Nothing leaves the machine.
2. **Exact length that changes the content, not just the speed.** The nearest anyone gets is NotebookLM's "Short ≈ 60 s" preset. Bridge's length picker sets a word, beat and idea budget (40–50 words and 1 idea at 20 s; 620–680 words and 6–9 ideas at 5 min; see EXPLAINER_CRAFT.md) and the planner selects what to keep.
3. **A source map for every claim, visible to the viewer.** Elicit and Explainpaper do sentence-level citations in text. No video tool does. Bridge ties each beat to source segments, shows them in the app next to the timeline, and can show the real PDF sentence with a highlighter sweep in the video (the Vox paper look).
4. **A faithfulness gate before render.** Numbers and names in narration must appear in the source; unsupported beats are dropped or rewritten. No product claims this. The research systems measure quality after the fact (PresentQuiz, TeachQuiz) but don't gate.
5. **Real paper figures, cropped and animated in.** NotebookLM and PaperTalker use document images. Bridge crops the exact figure region from the PDF, then builds on top of it (highlight a curve, zoom the key panel), alongside code-drawn diagrams.
6. **Software projects as input.** No tool here explains a codebase as a video. Bridge can show code typing itself, a request moving through components, and a chart of real output.
7. **A teaching design system, enforced.** Semantic colour bound at plan time, keyword captions, temporal contiguity, motion with declared purpose. These are linted rules, not a template look.
8. **Can't be switched off.** Sora's shutdown in 2026 shows hosted video products can vanish. An open, local pipeline keeps working.
9. **Reproducible.** Seeded pure core: the same input and settings give the same video. Useful for teachers, for evals and for bug reports.

---

## 9. What they do better, and what we should learn

| From | What they do better | What Bridge should take |
|---|---|---|
| NotebookLM | Polished visuals, 80+ languages, steering prompt, interactive audio, generous free tier. Visual style presets. | A steering box ("focus on the method", "for high-schoolers"). 2–4 visual style presets on top of one design system. Plan languages early (Kokoro supports several [recalled]). |
| NotebookLM | "Producer notes" reviewed before rendering. | Show the script and beat plan for edit before the full render (Bridge already has analyze → length → render). |
| HeyGen / Synthesia | Very natural voices and translation. | BYO ElevenLabs/OpenAI key path for voice; keep the voice principle in mind when choosing local voices. |
| Descript | Edit the video by editing the transcript. Great captions. | Let users edit narration text and re-render only the affected beats. |
| Pictory / Fliki | Fast "paste a blog → video" flow; .srt/.vtt export. | One-click default with no settings required; always export captions as files. |
| Colossyan / Vyond | Quizzes, branching, SCORM for teachers. | Export 3 check questions per video; later a SCORM/H5P package. |
| Canva / Vyond | Huge, consistent asset libraries and brand kits. | A small, high-quality icon and shape library in the design system; a "brand kit" with the user's palette (validated for contrast and CVD). |
| Veo / Runway | Beautiful motion and native audio. | Optional, key-gated B-roll for a hook shot only, never for claims. Default stays code-drawn. |
| Elicit | Sentence-level citations, figure extraction. | Match Elicit's citation granularity in the source map. |
| Paper2Video | A benchmark (101 papers + author videos) and PresentQuiz. | Add a PresentQuiz-style eval to `evals/`: ask a model the hand-written questions after giving it only the transcript + key frames. |
| Code2Video | Render → screenshot → critic loop; TeachQuiz. | Deterministic frame checks (overlap, contrast, min font size, safe area) after every render; optional VLM critic with a key. |
| TheoremExplainAgent | Showed layout overlap is the main defect of LLM-written Manim. | Keep the typed scene library and layout solver; don't let the LLM write raw drawing code. |
| MoneyPrinterTurbo | Huge adoption from one-click, open, many TTS/LLM back-ends. Batch CLI. | A batch mode (`bridge make` over a folder). Lots of back-ends behind one router. Avoid its music licensing problem. |
| manim-voiceover | Per-word timing tied to animation triggers. | Bridge's timeline should key animations to word timestamps from TTS (or local whisper alignment), not to fixed offsets. |

---

## 10. Risks and caveats

- **NotebookLM is the real competitor** and moves fast (three video formats, eight styles, ~60 s Short in about 15 months). If Google adds exact length and per-claim citations, Bridge's remaining edge is local + open + free + software projects + faithfulness gate.
- **Local quality ceiling.** A small local model writes weaker scripts than frontier models. The extractive floor plus the faithfulness gate keeps it correct, but it may be dull. BYO key closes the gap.
- **Many pricing pages contradict themselves** (Fliki, Elai, Steve AI, Visla all had internal inconsistencies). Don't build a public comparison page from these numbers without re-checking.
- **Pages I could not open:** Lumen5 (empty render), Canva, SciSpace, Scholarcy (403), openai.com/sora (403), the Guo et al. ACM page (403), the BBC subtitle guidelines (blocked), and Muller's thesis PDF (404). Their claims above are [recalled] or [unverified].
