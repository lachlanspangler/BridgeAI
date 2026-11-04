# Explainer Craft: rules for Bridge's video generator

Status: research note, written 2026-11-03. Public web only.

## How to read this file

Every factual claim carries a label:

- **[verified]**: I opened the page in this session and it says so. URL given.
- **[recalled]**: prior knowledge, not re-checked this session. Treat as likely but check before quoting publicly.
- **[unverified]**: plausible, commonly repeated, but I have no solid source. Treat as a hypothesis to test.

Where a rule is our own design choice derived from evidence, it is marked **[derived]** and the reasoning is shown.

The goal is not a literature review. The goal is numbers a generator can enforce: words per second, words on screen, seconds per beat, colours per palette, milliseconds per animation.

---

## 1. Pacing and words per second

### 1.1 What the evidence says

| Context | Rate | Source |
|---|---|---|
| Audiobooks, "the range people comfortably hear and vocalize" | 150–160 wpm (2.5–2.7 w/s) | Wikipedia "Words per minute", citing Williams 1998. [verified] https://en.wikipedia.org/wiki/Words_per_minute |
| Slide presentations, comfortable | 100–125 wpm (1.7–2.1 w/s) | Same page, citing Wong 2014. [verified] |
| BBC radio news bulletins | ~168 wpm (2.8 w/s) | Wikipedia "Speech tempo", citing Rodero. [verified] https://en.wikipedia.org/wiki/Speech_tempo |
| Typical English syllable rate | ~4 syllables/s; range 3.3–5.9 | Same page, citing Cruttenden 2014 and Arnfield 1995. [verified] |
| Auctioneers | ~250 wpm | Words per minute page. [verified] |
| Educational video, engagement | 185–254 wpm associated with *higher* engagement in edX data | Brame 2016 summarising Guo, Kim & Rubin 2014. [verified] https://pmc.ncbi.nlm.nih.gov/articles/PMC5132380/ |
| Netflix subtitle reading speed | ≤ 20 chars/s adult, ≤ 17 chars/s children | Netflix Timed Text Style Guide. [verified] https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide |

Two important cautions:

1. The Guo finding (faster speakers = more engagement) measures *engagement* (how long people kept watching), not *learning*. The speakers were enthusiastic human lecturers. [verified via Brame] It does not license fast synthetic narration over dense material. It does tell us that slow, flat delivery loses viewers.
2. Words-per-minute is a crude unit. The speech-tempo page notes "the word is not well defined" and rates with pauses differ from rates without. [verified] Bridge should measure **syllables per second of voiced audio** as well as words per second of total runtime. A sentence full of "transformer", "attention", "gradient" is slower to absorb than one full of short words at the same w/s.

### 1.2 Caption arithmetic

English averages roughly 5 letters per word plus a space, so ~6 characters per word. [recalled]

- 2.5 w/s × 6 = 15 chars/s. Under Netflix's 17 cps children's limit. Comfortable.
- 2.9 w/s × 6 = 17.4 chars/s. At the children's limit, under the 20 cps adult limit.
- 3.3 w/s × 6 = 20 chars/s. At the adult ceiling. Anything faster cannot be read in full captions.

So **3.3 w/s is a hard physical ceiling** if we burn full captions. **[derived]**

### 1.3 Word budgets per mode

Assumptions **[derived]**: the hook's first 0.5 s is visual-only; the last 1.5–2.5 s is a silent or music-only end card holding the takeaway; and we add ~0.3 s of pause at each beat boundary. "Voiced time" is what is left.

| Mode | Runtime | Target rate | Hard cap | Voiced time | Word budget | Ideas | Beats |
|---|---|---|---|---|---|---|---|
| 20 s | 20 s | 2.6 w/s | 2.9 w/s | ~17 s | **40–50 words** | **1** (2 max) | 4–6 |
| 1 min | 60 s | 2.5 w/s | 2.8 w/s | ~54 s | **125–145 words** | **2–3** | 10–15 |
| 3 min | 180 s | 2.4 w/s | 2.7 w/s | ~165 s | **380–420 words** | **4–6** | 30–45 |
| 5 min | 300 s | 2.3 w/s | 2.6 w/s | ~280 s | **620–680 words** | **6–9** | 50–75 |
| Custom | T s | 2.3–2.6 | 2.9 | T − 3 s | 2.4 × (T − 3) | ≈ 1 + T/40 | T/4 to T/6 |

Why the rate drops as length grows: short videos can ride energy and one idea; long videos must leave room for the viewer to digest, and Mayer's segmenting principle asks for breaks between chunks. [derived]

Sanity check on the 20 s budget. 45 words is about three sentences. "Transformers read every word at once. Each word asks: which other words matter to me? That single trick, attention, replaced ten years of slower designs." That is 26 words. A 20 s Bridge video has room for that, a number, and a closing line. It does not have room for a second concept. That is the point.

### 1.4 Ideas per minute

There is no clean study giving "ideas per minute". [unverified] Our numbers come from three anchors:

- Working memory holds about 4 chunks (Cowan 2001), not 7. [recalled]
- Fireship's "in 100 seconds" videos cover one technology with roughly 3–5 sub-points (what it is, why it exists, the core concept, a code example, a caveat). [recalled]
- TED-Ed lessons run about 4–6 minutes and usually build one central question with 4–6 supporting steps. [recalled]

So: **one new idea per 30–45 s** of runtime after the first, and never more than 4 "live" ideas the viewer must hold at once. [derived]

---

## 2. Mayer's multimedia principles, turned into constraints

Mayer's cognitive theory of multimedia learning rests on three assumptions: dual channels (visual and verbal), limited capacity in each, and active processing. [verified] https://www.digitallearninginstitute.com/blog/mayers-principles-multimedia-learning. The twelve principles below are listed on that page [verified]. Effect sizes come from Mayer's own reviews and are [recalled]; the page I opened gives none.

| Principle | One-line meaning | Bridge constraint |
|---|---|---|
| Multimedia | Words + pictures beat words alone. | Every beat has a visual that carries meaning, not stock decoration. |
| Coherence | Remove extra words, pictures, sounds. | No decorative particles, no background loops with motion, no off-topic fun facts. Music bed ducked under voice (see §9). |
| Signaling | Cue what matters: arrows, highlights, bold. | Each beat has exactly one signaled focus (highlight, arrow, zoom, or colour change). |
| Redundancy | Do not show the same words as both narration and on-screen text next to a graphic. | See §3. Default keyword captions; full captions optional and spatially separated. |
| Spatial contiguity | Put labels next to what they label. | Labels attach to their object (≤ 40 px gap at 1080p). No legend boxes when direct labels fit. |
| Temporal contiguity | Narration and matching visual at the same time. | The visual for a word appears within ±300 ms of that word in the voice track. |
| Segmenting | Break into chunks; let learners pace. | Beats ≤ 8 s; chapter markers every 30–60 s in 3 and 5 min modes. |
| Pre-training | Teach key terms first. | In 3 and 5 min modes, introduce at most 2 key terms in the first 20 % before using them. In 20 s mode, avoid jargon entirely or define it in-line in ≤ 5 words. |
| Modality | Pictures + spoken words beat pictures + printed words. | Narration carries the explanation; on-screen text is labels and keywords. |
| Personalization | Conversational, first and second person. | Script uses "you" and "we". No passive academic voice. |
| Voice | Human-sounding voice beats robotic. | Use the most natural local TTS available; never a flat robotic voice. |
| Image | The speaker's face is not needed. | No avatars or talking heads. Screen time goes to the diagram. |

Effect sizes, for priority ordering [recalled, from Mayer 2009/2021 summaries]: coherence d ≈ 0.86, signaling d ≈ 0.41–0.52, redundancy d ≈ 0.72–0.86, spatial contiguity d ≈ 1.1, temporal contiguity d ≈ 1.2, segmenting d ≈ 0.79, pre-training d ≈ 0.75–0.85, modality d ≈ 0.72–1.0, personalization d ≈ 0.79, voice d ≈ 0.74. The image principle had a small or null effect. Contiguity and coherence are the biggest levers. They also happen to be the easiest for a code-drawn system to enforce.

Weeding (coherence) applies to video too. Ibrahim et al. 2012 found removing extraneous content improved retention and transfer. Brame lists music, complex backgrounds and extra animation features as sources of extraneous load. [verified via Brame 2016]

---

## 3. The caption tension, and how to resolve it

### 3.1 The problem

Bridge burns captions into the video. The redundancy principle says full printed narration next to a graphic hurts learning, because the eyes must split between reading and looking. [verified, principle list above]

But captions are not optional in practice:

- Deaf and hard-of-hearing viewers need them.
- Non-native speakers rely on them.
- Many people watch with sound off on phones. [recalled]

### 3.2 What softens the redundancy effect

- **Short text is fine.** Brame recommends two or three key words on screen, citing Mayer & Johnson 2008 and Ibrahim et al. 2012. [verified via Brame] Mayer & Johnson's "Revising the redundancy principle" found that short on-screen phrases placed next to the relevant part of the graphic did *not* hurt and could help retention. [recalled; I could not open the abstract]
- **Redundancy hurts most when pace is fast and the learner cannot pause**, and when the graphic is complex. [recalled]
- **Redundancy helps or is neutral for second-language learners** in some studies. [recalled]

### 3.3 Resolution for Bridge [derived]

Two caption layers, never both at full strength at once:

1. **Keyword layer (always on, part of the design).** 1–3 words per beat, placed *next to* the thing they name, in the diagram's colour language. This is signaling plus spatial contiguity, not redundancy.
2. **Speech caption layer (burned by default, style "quiet").** Placed in a fixed bottom band that never overlaps the diagram. Max 1 line, ≤ 32 characters, ≤ 5 words per chunk, current word bolded or tinted. Neutral colour (off-white on a 60–70 % opaque dark band), smaller than keyword labels, so it reads as a secondary channel.
3. **Export always also writes an .srt and .vtt**, so platforms that support soft captions can carry full captions without burning.
4. **User switch:** "Captions: keyword only / quiet (default) / full social style". The social style (big centered words, TikTok look) is offered for sound-off platforms, with a warning that it competes with the diagram.

Why ≤ 32 characters and 1 line: Netflix allows 42 characters × 2 lines [verified], but that is for film, where the picture is not the lesson. In an explainer the picture *is* the lesson, so the caption must take less of the screen. [derived]

---

## 4. Cognitive load, one idea per scene, and beat length

### 4.1 Terms

- **Beat**: one narration sentence or clause plus one visual change. The atomic unit.
- **Scene**: a group of beats sharing one layout and one idea.

### 4.2 Rules

- **One idea per scene.** A scene introduces at most one new concept. Everything else in the frame must be already known or directly support it. [derived from coherence + segmenting]
- **Beat length 2.5–8 s.** Under 2.5 s the viewer cannot read a label and hear the line. Over 8 s with no visual change, attention drops. [derived; consistent with the "move every few seconds" norm in YouTube editing, which is [unverified] as a number]
- **Mode-specific beat length**: 20 s mode 3–5 s per beat; 1 min mode 4–6 s; 3–5 min modes 4–8 s, with occasional 10 s "breather" holds on a key diagram. [derived]
- **Live elements ≤ 7** on screen at any time (objects that are not greyed out), and ≤ 4 that are new in the current scene. Based on Cowan's ~4 chunk limit. [recalled]
- **Video length overall.** Guo et al. 2014 (6.9 million sessions, four edX MOOCs): median engagement near 100 % for videos under 6 min, ~50 % at 9–12 min, ~20 % at 12–40 min. [verified via Brame 2016] Our 5 min cap is inside the safe zone. Custom lengths above 6 min should trigger a suggestion to split into parts.

---

## 5. Structure: hooks, roadmap, and endings

### 5.1 Hook in the first 3 seconds

- Platforms and ad guidance commonly say to capture attention in the first 3 seconds; this is industry lore rather than learning science. [unverified as a precise number]
- 3Blue1Brown advises opening with "the key exercise" and teaching concrete examples first, treating definitions as the conclusion. [verified] https://www.3blue1brown.com/faq
- Veritasium (Derek Muller) often opens with a question or a surprising claim the viewer probably gets wrong. [recalled] His 2008 Sydney PhD, *Designing Effective Multimedia for Physics Education*, is the basis for that habit. [verified that the thesis exists, via https://en.wikipedia.org/wiki/Veritasium] Its finding was that videos which first state and then confront common misconceptions produced larger learning gains than clear expository videos, even though students rated the expository ones as clearer and felt more confident. [recalled]

**Bridge hook menu** (the generator picks one) [derived]:

1. A surprising number with a comparison ("This model has 7 billion knobs. Your brain has 100 trillion.").
2. A question the viewer likely answers wrong (misconception hook, Muller).
3. The end result first (show the finished chart or output, then rewind).
4. A concrete instance before the abstract claim (3Blue1Brown).

The first visual change must land by 0.5 s and the first spoken word by 0.8 s. No logo intro. No "Hi, today we'll talk about".

### 5.2 "Tell them what you'll tell them"

The classic three-part structure (preview, body, recap) helps in long lectures by giving advance organisers. [recalled] In short form it wastes the scarcest resource.

Rules [derived]:

- **20 s mode:** no roadmap, no recap. Hook → idea → takeaway.
- **1 min mode:** no roadmap. One-line recap allowed as the takeaway.
- **3 min mode:** a one-sentence promise in the first 10 s ("By the end, you'll know why X"). Recap ≤ 10 s.
- **5 min mode:** a visual roadmap (3–5 chapter chips) shown for ≤ 5 s after the hook, returned to as a progress indicator at each chapter boundary. Recap ≤ 15 s. This is pre-training and segmenting, not padding.

### 5.3 End on a single takeaway

- The last 1.5–2.5 s shows one sentence of ≤ 12 words on screen, held still, music only or silence.
- That sentence must be the same idea as the hook resolved. A question opened at 0:01 is answered at the end.
- Fireship ends "in 100 seconds" videos with a fixed sign-off line ("This has been X in 100 seconds..."). [recalled] A fixed outro is fine for brand. It must come after the takeaway, not instead of it.

### 5.4 Concrete before abstract

3Blue1Brown: "Teach concrete examples before general frameworks... Don't begin with definitions; treat them as the conclusion." [verified] https://www.3blue1brown.com/faq

Rule: every abstract claim is preceded by at least one specific instance with real values (a real sentence, a real number, a real image from the source). The generator rejects a scene whose first beat is a definition. [derived]

### 5.5 Analogies

- An analogy is a bridge, then it must be taken down. Kurzgesagt and CGP Grey both use extended metaphors (immune cells as soldiers, etc.) and then return to the real mechanism. [recalled]
- Rule: max one analogy per idea, introduced in ≤ 2 beats, and followed by one beat that states where the analogy breaks ("Unlike a real library, ...") in 3 and 5 min modes. In 20 s mode the analogy may stand alone if it is not misleading. [derived]
- The analogy's visual must use the same colour as the real concept it stands for, so the mapping is visible. [derived]

### 5.6 Numbers

- **One number per beat.** Two numbers in one beat must be a comparison, not a list. [derived]
- **Make it big.** The hero number is the largest element on screen (≥ 160 px tall at 1080p). [derived]
- **Give it a comparison or a unit the viewer can feel.** Apple's iPod launch: "1,000 songs in your pocket" instead of "5 GB". [recalled] Raw "5 GB" means nothing to a novice; "1,000 songs" does.
- **Count up** only if the count itself means something (growth). Otherwise snap to the value with a 250 ms scale-in.
- **Round** to 2 significant figures in narration unless precision is the point. "About 7 billion", not "6.74 billion". The source map keeps the exact value.

---

## 6. Visual hierarchy

- **One focal point per beat.** The focal element is the brightest, most saturated, or largest thing in frame. Everything else is ≤ 50 % of its visual weight (desaturated or at 40–60 % opacity). [derived from signaling]
- **Dim, don't delete.** Earlier elements that give context fade to 30–40 % opacity instead of vanishing. This keeps the viewer oriented. 3Blue1Brown does this heavily. [recalled]
- **Reading order** follows narration order. Left→right, top→bottom for LTR languages.
- **Safe area.** Keep all text inside 90 % title-safe area (5 % margin each side; 96 px horizontal and 54 px vertical at 1920×1080). [recalled; SMPTE title-safe convention] Keep the bottom 15 % reserved for the caption band.
- **Grid.** 12-column grid with 24 px gutters at 1080p; snap layout boxes to it. [derived]

---

## 7. Colour

### 7.1 Evidence

- About 8 % of Caucasian men, 5 % of Asian men and 4 % of African men are red-green colour blind. Tritanopia is ~0.001 %. [verified] https://jfly.uni-koeln.de/color/
- Okabe & Ito advise: don't rely on colour alone, label directly, avoid red-green pairs (use magenta/green), use vermilion instead of pure red, ensure light/dark contrast, use thick lines, alternate warm and cool. [verified, same URL]
- The Okabe–Ito palette hex values: black #000000, orange #E69F00, sky blue #56B4E9, bluish green #009E73, yellow #F0E442, blue #0072B2, vermilion #D55E00, reddish purple #CC79A7. [recalled; the page shows them as an image only]
- WCAG 2.2 contrast: normal text ≥ 4.5:1 (AA), ≥ 7:1 (AAA); large text (≥ 18 pt or 14 pt bold, ~24 px / ~18.5 px) ≥ 3:1. Don't round. [verified] https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- Non-text graphics (lines, chart marks) ≥ 3:1 against adjacent colours (WCAG 1.4.11). [recalled]

### 7.2 Rules [derived]

- **Palette size: 5 semantic colours + 3 neutrals** (background, mid-grey for dimmed, near-white or near-black for text). Never more than 5 hues in one frame; 3 is better.
- **Consistent colour = consistent meaning.** The planner assigns each key concept a colour at script time ("input = blue, model = orange, output = green") and the colour never changes for the rest of the video. Captions and keyword labels use the same mapping. Colour is a variable in the scene graph, not a styling choice per scene.
- **Reserved meanings:** one accent (vermilion or orange) means "look here / the key thing". Don't use it for anything else.
- **Never encode meaning in red vs green alone.** Pair with shape, position, icon, or label.
- **Contrast:** all video text ≥ 4.5:1 against its actual background, even when large. Video compression and small phone screens erode contrast, so we use the normal-text threshold for everything. Chart marks ≥ 3:1.
- **Colour-blind check in CI:** render key frames through deuteranopia, protanopia and tritanopia simulation and require that every pair of semantic colours used in the same frame stays distinguishable (ΔE2000 ≥ 15 is a reasonable start; tune by eye). [derived; threshold unverified]
- **Dark background by default** (3Blue1Brown style), with a light theme option. Dark backgrounds make saturated semantic colours pop and hide compression banding less well, so use a slightly lifted dark (#111827-ish), not pure black. [derived]

---

## 8. Typography for video

- Text read on a phone at arm's length, after YouTube compression, needs to be much larger than web text. [recalled]
- Rules at 1920×1080 [derived; these are working defaults to tune by test viewing on a phone]:
  - Hero number: ≥ 160 px.
  - Title / takeaway line: 72–110 px, weight 700.
  - Keyword labels: ≥ 44 px, weight 600.
  - Speech captions: 40–48 px, weight 500–600, max 32 chars per line.
  - Code: ≥ 32 px monospace, ≤ 12 visible lines, ≤ 60 characters per line.
  - Absolute minimum for any text: 32 px (≈ 3 % of frame height). Anything smaller is not text, it is texture.
- **On-screen words per beat:** ≤ 3 keyword words (Brame's 2–3 [verified]), ≤ 12 words for a takeaway frame, ≤ 7 words for a title. Code and figures from the paper are exempt but must be cropped to the relevant lines/region.
- **Total visible words at once** (excluding captions and code): ≤ 15.
- **One or two typefaces**: a clean sans (Inter, IBM Plex Sans, Source Sans) and a mono for code. No serifs at small sizes. [derived]
- **Text appears ≥ 1 s before it is needed or as it is spoken**, and stays ≥ (0.3 s × word count + 1 s) so it can be read. [derived from ~3–4 w/s reading for short phrases]

---

## 9. Motion

- **Never move without meaning.** 3Blue1Brown: "Avoid pointless animation. Every on-screen movement should have a clear purpose and support the narration." [verified] https://www.3blue1brown.com/faq
- Meaning types a motion may carry [derived]: introduce (appear), transform (A becomes B), relate (connect, arrow), emphasise (pulse, highlight), compare (move side by side), sequence (step-by-step build), dismiss (dim or exit). If a motion does none of these, delete it.
- **Durations:** Manim's default `run_time` is 1 s per animation. [recalled] UI motion guidelines (Material Design) put most transitions at 200–500 ms. [recalled] For video:
  - Emphasis (pulse, highlight sweep): 250–400 ms.
  - Appear / write-on of a label: 300–600 ms.
  - Transform / morph: 600–1200 ms.
  - Camera move or zoom: 800–1500 ms.
  - Typing code: 25–40 characters/s, faster for boilerplate, and the line being discussed is highlighted when narration reaches it.
- **Hold after a build:** ≥ 0.8 s still frame after the last element of a build lands before the next build starts. Viewers need a moment to look. [derived]
- **Every beat has a visual change within 0.5 s of its first word.** [derived from temporal contiguity]
- **Easing:** ease-in-out (cubic or "smooth" sigmoid) for transforms; ease-out for entrances; ease-in for exits; linear only for constant processes (a timer, a flowing stream). Manim's default rate function is `smooth`. [recalled]
- **Max simultaneous moving objects: 3.** More than that and the eye cannot track. [derived]
- **No camera shake, no spinning, no bounce** except as a deliberate one-off emphasis. [derived from coherence]

## 10. Sound

- **Music bed** ducked to −18 to −24 dB below voice (or about −30 LUFS under ~−16 LUFS voice). Music that competes with speech violates coherence. [derived; Brame lists music as extraneous load, verified]
- **Final mix loudness** −14 LUFS integrated for YouTube-style platforms, true peak ≤ −1 dBTP. [recalled]
- **Sound effects** only on signaled events (a highlight landing, a number appearing), ≤ 1 per 2 s, short (< 300 ms), and quieter than voice. A sound effect is a signaling cue, so it must coincide with the visual signal within 50 ms.
- **Option to disable music** with one switch. Some learners find any music distracting. [derived]

---

## 11. What specific creators do, and what Bridge takes from each

### 3Blue1Brown (Grant Sanderson) and Manim

- Wrote Manim, an open-source Python animation engine "for precise, code-driven animations, mainly for explanatory math videos". MIT licence. ManimGL is the original; the Community Edition fork (2020) is more stable and documented. [verified] https://github.com/3b1b/manim
- Says Manim makes clips; narration syncing happens in a normal editor. [verified] https://www.3blue1brown.com/faq
- Advice: concrete before general, open with the key exercise, definitions last, a visual for every topic, no pointless animation, "topic choice matters way more than production quality", good audio matters. [verified, same FAQ]
- Techniques [recalled]: dark background; a small, stable colour mapping per video (e.g. one vector always yellow); `TransformMatchingTex` so parts of an equation move to their new positions and keep colour; dimming old content; the "pi creature" asking the viewer's question aloud; pausing to say "pause and ponder".
- **Take:** colour-as-variable, transform-not-replace, concrete-first, motion only with meaning, equations whose terms keep their colour across steps.

### Kurzgesagt – In a Nutshell

- Grew into a studio of about 70 people; known for minimalistic flat design, sometimes 3D; research in-house with expert checks; says sources are always given. About 25.6 million subscribers. [verified] https://en.wikipedia.org/wiki/Kurzgesagt
- Aims to be "aesthetic, fun and accessible" and to leave viewers with optimism. [verified] https://kurzgesagt.org/about/
- Techniques [recalled]: a tight saturated palette on dark backgrounds with soft gradients; every object built from simple geometric shapes; recurring characters (birds) as viewer stand-ins; huge scale comparisons ("if a cell were the size of a city"); publishing a sources document per video; original score per video.
- **Take:** scale comparisons for numbers; a public source list (Bridge does this per claim); a consistent object vocabulary (same shape = same thing).

### Vox explainers (Joss Fong, Johnny Harris era)

- Techniques [recalled]: printed paper on a desk, filmed, with a highlighter sweeping the key line; maps that zoom and draw borders; archival photos with parallax; quotes from primary documents shown as real paper; annotated charts that build bar by bar; Johnny Harris's "Borders" series filmed on location with hand-drawn map overlays.
- **Take:** this is the best existing model for Bridge's "figure cropped from the paper" visual. Show the real PDF region, slightly lifted with a shadow, then sweep a highlighter over the exact sentence being narrated. It makes the source visible and trustworthy. It is also cheap to render from a PDF bounding box.

### Fireship (Jeff Delaney) – "X in 100 Seconds"

- Format [recalled]: about 100–140 s; one technology per video; dense, fast narration (often ~3 w/s or more); meme images and jokes every few seconds; code on screen in an editor-style frame; the structure is roughly origin/what it is → the core idea → minimal code example → how to start → sign-off "This has been X in 100 seconds". Also the "Code Report" news series.
- Fireship's speed works because the audience is developers who already know the surrounding vocabulary. [derived] Bridge's audience is broader.
- **Take:** the 100-second skeleton maps almost exactly onto Bridge's 1 min mode (compressed) and gives the 20 s mode its shape: name → the one idea → one concrete example → takeaway. Take the code-on-screen frame and the strict scope. Do not take the meme density; memes are extraneous load for non-native and novice viewers.

### Veritasium (Derek Muller)

- PhD thesis *Designing Effective Multimedia for Physics Education*, Sydney, 2008; TEDxSydney 2012 talk "The key to effective educational science videos". [verified] https://en.wikipedia.org/wiki/Veritasium
- Finding [recalled]: clear exposition makes viewers feel they learned but leaves misconceptions intact; confronting the misconception first produces more learning.
- Techniques [recalled]: street interviews showing people's wrong predictions; "make a prediction now" pauses; physical demos.
- **Take:** in 1, 3 and 5 min modes, if the source has a known counter-intuitive result, structure one scene as "most people think X → actually Y → here's why". The planner should explicitly search the source for "surprisingly", "contrary to", "unlike prior work".

### MinutePhysics (Henry Reich)

- Techniques [recalled]: hand-drawn stick-figure style on white, filmed as a sped-up time-lapse of drawing; 1–4 min videos; one question per video; very simple visuals.
- **Take:** proof that one question per video, very simple visuals and short length work at scale. Bridge's 1 min mode should feel like this: one question, answered.

### Primer (Justin Helps)

- Techniques [recalled]: simulations of cute blob creatures to explain evolution, game theory, epidemics; runs the actual simulation and shows the result chart building next to it; 3D rendered in Blender, much of it scripted.
- **Take:** "show the system running, then the chart it produces". For software-project inputs, Bridge can do the same: run or step through the code and build a chart from its output.

### TED-Ed

- Techniques [recalled]: 4–6 min animated lessons; a different animator per lesson; each lesson centred on one question; companion "Think" questions and "Dig deeper" links on the lesson page.
- **Take:** the companion quiz and source links. Bridge can export 3 check questions per video from the script (also useful as a faithfulness test, see LANDSCAPE.md).

### CGP Grey

- Techniques [recalled]: very dense, heavily revised scripts; stick-figure and icon visuals; long continuous chains of cause and effect; recurring visual motifs; deliberately simple shapes so the eye goes to the argument.
- **Take:** script quality matters more than visuals. Bridge should spend LLM effort on script revision (2–3 passes for clarity and cutting) before touching visuals.

### Two Minute Papers (Károly Zsolnai-Fehér)

- Techniques [recalled]: one paper per video; uses the paper's own result videos and figures; compares against previous work ("two more papers down the line"); fixed catchphrases ("Dear Fellow Scholars", "What a time to be alive!"); links the paper. Videos have grown well beyond two minutes.
- **Take:** for papers, show the paper's *own* figures and the before/after comparison with prior work. Always link the paper. A consistent opening line helps brand recall.

### Distill.pub

- Techniques [recalled]: interactive ML articles with explorable figures; consistent colour for each concept across text and figures; "Research Debt" essay (Olah & Carter, 2017) argues that explanation is research work and that poor exposition is a debt everyone pays; Distill went on hiatus in 2021.
- **Take:** Bridge's mission statement is Research Debt in video form. Take the colour-in-text-matches-colour-in-figure habit: when narration says "attention weights", the caption word "attention" is tinted the same orange as the attention matrix on screen.

### Stripe and Apple product explainers

- Techniques [recalled]: Apple keynote slides with a single huge number or a single phrase; a comparison for every number ("2× faster than the previous generation"); clean animated UI walk-throughs with a cursor; Stripe's documentation and Sessions videos use isometric diagrams, a restrained palette and animated API flows with request/response packets moving between boxes.
- **Take:** the "one big number + comparison" frame; the animated request/response diagram for software projects; restraint.

---

## 12. Bridge rules

These are generator constraints. Each is tagged with its evidence: **V** = verified this session, **R** = recalled, **D** = derived design choice. Numbers are defaults; the eval harness should flag violations, and some can be overridden by the user.

### Pacing and budget

1. **Narration rate:** target 2.6 w/s (20 s), 2.5 (1 min), 2.4 (3 min), 2.3 (5 min). Hard cap 2.9 w/s in any mode, measured over any 10 s window of voiced audio. *(V: audiobook 150–160 wpm, BBC 168 wpm; D: caption math)*
2. **Word budgets:** 40–50 words (20 s), 125–145 (1 min), 380–420 (3 min), 620–680 (5 min); custom = 2.4 × (T − 3). Script is cut, not sped up, when over budget. *(D from rule 1)*
3. **Idea budget:** 1 idea at 20 s (2 only if the second is a direct consequence), 2–3 at 1 min, 4–6 at 3 min, 6–9 at 5 min. *(R: Cowan ~4 chunks; D)*
4. **Selection for short modes:** at 20 s the planner picks the single claim the source's own abstract/conclusion stresses most, and drops everything else, including methods. *(D)*
5. **Beat length:** 3–5 s at 20 s; 4–6 s at 1 min; 4–8 s at 3–5 min. No beat < 2.5 s or > 10 s. *(D; V: segmenting)*
6. **Overall length warning** above 6 min: offer to split. *(V: Guo et al. via Brame)*

### Structure

7. **Hook:** first visual change by 0.5 s, first spoken word by 0.8 s. No logo intro, no greeting. Hook type from: surprising number + comparison, misconception question, end-result first, concrete instance. *(D; V: 3b1b "open with the key exercise"; R: Muller)*
8. **Roadmap:** none at 20 s and 1 min; one-sentence promise at 3 min; 3–5 chapter chips ≤ 5 s at 5 min. *(D; V: pre-training, segmenting)*
9. **Single takeaway:** final 1.5–2.5 s holds one sentence ≤ 12 words, still, that resolves the hook. *(D)*
10. **Concrete first:** no scene may open with a definition; the first beat of each scene is a specific instance with real values from the source. *(V: 3b1b FAQ)*
11. **Misconception scene** in 1, 3 and 5 min modes when the source contains a counter-intuitive result. *(R: Muller 2008)*
12. **Analogy limit:** ≤ 1 per idea, ≤ 2 beats; in 3–5 min modes, followed by one beat on where it breaks. Analogy visuals use the real concept's colour. *(D)*

### On-screen text and captions

13. **Keyword labels:** ≤ 3 words per beat, placed within 40 px of the object they name. *(V: Brame 2–3 keywords; V: spatial contiguity)*
14. **Total visible words** (excluding captions, code and cropped figures): ≤ 15 at any time; titles ≤ 7 words; takeaway ≤ 12 words. *(D; V: coherence)*
15. **Speech captions:** default "quiet" style in a fixed bottom band (bottom 15 %), 1 line, ≤ 32 characters, ≤ 5 words per chunk, current word highlighted; never overlaps the diagram. *(V: Netflix 42 chars × 2 lines as an outer bound; V: redundancy principle; D)*
16. **Caption reading speed** ≤ 17 characters/s on average, ≤ 20 at peaks. *(V: Netflix)*
17. **Always export .srt and .vtt** alongside the burned-in video; offer "keyword only" and "full social" caption styles. *(D)*

### Visual hierarchy and colour

18. **One focal element per beat**, at ≥ 2× the visual weight (size, saturation or brightness) of anything else. *(V: signaling)*
19. **Dim, don't delete:** context elements fade to 30–40 % opacity. *(R: 3b1b practice)*
20. **Palette:** 5 semantic colours + 3 neutrals, built from Okabe–Ito (or validated equivalent). ≤ 5 hues in any frame. *(V: Okabe–Ito advice; R: hex values)*
21. **Colour is bound to meaning at plan time** and never changes within a video; caption words for a concept take that concept's colour. *(D; R: Distill, 3b1b)*
22. **One reserved accent colour** means "the key thing" and is used for nothing else. *(D)*
23. **No meaning by red vs green alone**; every colour distinction also has a label, shape or position. *(V: Okabe–Ito)*
24. **Contrast:** all text ≥ 4.5:1 against its real background (even large text); chart marks and lines ≥ 3:1. *(V: WCAG 2.2 1.4.3; R: 1.4.11)*
25. **CVD check:** key frames pass deuteranopia/protanopia/tritanopia simulation with semantic colour pairs still distinguishable. *(V: prevalence 8 % of Caucasian men; D: threshold)*

### Typography

26. **Sizes at 1080p:** hero number ≥ 160 px; titles 72–110 px; keyword labels ≥ 44 px; captions 40–48 px; code ≥ 32 px; nothing below 32 px. Scale proportionally for other resolutions. *(D; to validate on a phone)*
27. **Safe area:** all text inside 90 % title-safe; bottom 15 % reserved for captions. *(R: broadcast title-safe)*
28. **Code frames:** ≤ 12 visible lines, ≤ 60 chars per line; type at 25–40 chars/s; highlight the line being narrated. *(D)*
29. **Read time:** text stays on screen ≥ 0.3 s × words + 1 s. *(D)*

### Motion

30. **Every motion has a declared purpose** (introduce, transform, relate, emphasise, compare, sequence, dismiss). Motions without one are removed by the linter. *(V: 3b1b FAQ)*
31. **Temporal contiguity:** the visual for a narrated term appears within ±300 ms of the word. Every beat shows a visual change within 0.5 s of its first word. *(V: temporal contiguity)*
32. **Durations:** emphasis 250–400 ms; appear 300–600 ms; transform 600–1200 ms; camera 800–1500 ms. *(R: Manim 1 s default, Material 200–500 ms; D)*
33. **Hold ≥ 0.8 s** after a build completes before the next build. *(D)*
34. **Easing:** ease-out for entrances, ease-in for exits, ease-in-out for transforms, linear only for constant processes. *(R)*
35. **≤ 3 objects moving at once.** No shake, spin, or bounce except a single deliberate emphasis. *(D; V: coherence)*

### Numbers

36. **One number per beat**; a second number only as a direct comparison. *(D)*
37. **Every number gets a comparison or a felt unit**, and is rounded to 2 significant figures in narration (exact value kept in the source map). *(R: Apple "1,000 songs"; D)*

### Sound

38. **Music ducked** to 18–24 dB under voice; one-switch "no music". Final loudness −14 LUFS integrated, ≤ −1 dBTP. *(V: Brame on music as extraneous load; R: platform loudness)*
39. **Sound effects only on signaled events**, ≤ 1 per 2 s, < 300 ms, synced within 50 ms to the visual cue. *(D; V: signaling)*

### Voice and tone

40. **Conversational script:** second person, active voice, average sentence ≤ 15 words, no sentence > 25 words; the most natural available TTS voice; no avatars. *(V: personalization, voice, image principles)*

---

## 13. Open questions to test

- Is 2.6 w/s too slow for 20 s mode with an expert audience? Fireship-style viewers may want ~3 w/s. Test with an "expert pace" toggle capped at 2.9.
- Does the "quiet" caption style actually beat keyword-only on retention for native speakers? Run a small A/B with a 3-question quiz.
- Are 44 px labels big enough on a phone after YouTube's 1080p compression? Render test cards and check on two phones.
- Does local TTS quality hurt learning enough to matter (voice principle)? Compare the best local voice against a cloud voice on the same script.
