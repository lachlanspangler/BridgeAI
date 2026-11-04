/**
 * THE contract. Every stage validates its output against these schemas:
 *   ingest → Source (segments)   analyze → Analysis (ranked ideas)   script → Script (beats + visuals + claims)
 *   faith → FaithReport          timeline → Timeline (timed beats, words, captions, sfx)   render → mp4
 * Pure: no Node, no DOM. Shared by the server, the CLI, the renderer and the web app.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = '1.0.0';

// ───────────────────────────── Source ─────────────────────────────

export const SegmentKind = z.enum([
  'title',
  'heading',
  'abstract',
  'paragraph',
  'list',
  'caption',
  'code',
  'table',
  'figure',
  'meta',
]);
export type SegmentKind = z.infer<typeof SegmentKind>;

/** Where a segment came from, so every claim can be traced back. */
export const Locator = z.object({
  page: z.number().int().positive().optional(),
  /** Line range in a text/code file (1-based, inclusive). */
  lines: z.tuple([z.number().int(), z.number().int()]).optional(),
  file: z.string().optional(),
  /** Bounding box on the page in PDF points [x, y, w, h] (top-left origin). */
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  /** Section heading path, e.g. ["3 Model Architecture", "3.2 Attention"]. */
  section: z.array(z.string()).optional(),
});
export type Locator = z.infer<typeof Locator>;

export const Segment = z.object({
  id: z.string().regex(/^s\d+$/),
  kind: SegmentKind,
  text: z.string(),
  loc: Locator.default({}),
  /** For figures/images: id of an asset in Source.assets. */
  assetId: z.string().optional(),
  /** Code language for code segments. */
  lang: z.string().optional(),
});
export type Segment = z.infer<typeof Segment>;

export const Asset = z.object({
  id: z.string().regex(/^a\d+$/),
  kind: z.enum(['figure', 'image', 'page']),
  /** Path relative to the job directory (PNG/JPEG). */
  path: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  caption: z.string().optional(),
  /** Text found in the image by OCR. */
  ocr: z.string().optional(),
  /** OCR word boxes, normalised 0..1 [x, y, w, h], so a beat can point at the label it is talking about. */
  words: z
    .array(z.object({ t: z.string(), b: z.tuple([z.number(), z.number(), z.number(), z.number()]) }))
    .optional(),
  loc: Locator.default({}),
});
export type Asset = z.infer<typeof Asset>;

export const SourceKind = z.enum(['text', 'pdf', 'images', 'project']);
export type SourceKind = z.infer<typeof SourceKind>;

export const Source = z.object({
  schema: z.literal('bridge.source/1').default('bridge.source/1'),
  kind: SourceKind,
  title: z.string(),
  /** Where it came from: a file name, a URL, "pasted text". Never contains secrets. */
  origin: z.string(),
  segments: z.array(Segment),
  assets: z.array(Asset).default([]),
  /** Ingestion warnings shown to the user (e.g. "page 7 had no text layer"). */
  warnings: z.array(z.string()).default([]),
  stats: z
    .object({
      words: z.number().int(),
      pages: z.number().int().optional(),
      files: z.number().int().optional(),
    })
    .default({ words: 0 }),
});
export type Source = z.infer<typeof Source>;

// ───────────────────────────── Analysis ─────────────────────────────

export const Evidence = z.object({
  segmentId: z.string(),
  /** A verbatim (or near-verbatim) quote from that segment. Verified by faith/quotes.ts. */
  quote: z.string(),
});
export type Evidence = z.infer<typeof Evidence>;

export const IdeaKind = z.enum([
  'claim',
  'method',
  'result',
  'number',
  'definition',
  'problem',
  'architecture',
  'code',
  'figure',
]);
export type IdeaKind = z.infer<typeof IdeaKind>;

export const Idea = z.object({
  id: z.string().regex(/^i\d+$/),
  /** One plain sentence. */
  statement: z.string(),
  kind: IdeaKind,
  /** 0..1, higher is more important. Rank order is by this. */
  importance: z.number().min(0).max(1),
  evidence: z.array(Evidence).min(1),
  /** Numbers that matter for this idea, verbatim from the source ("28.4 BLEU"). */
  numbers: z.array(z.string()).default([]),
  /** Key terms (for keyword highlighting). */
  terms: z.array(z.string()).default([]),
  /** Asset ids (figures) that illustrate this idea. */
  assets: z.array(z.string()).default([]),
});
export type Idea = z.infer<typeof Idea>;

export const Analysis = z.object({
  schema: z.literal('bridge.analysis/1').default('bridge.analysis/1'),
  /** One-line gist of the whole source. */
  gist: z.string(),
  ideas: z.array(Idea),
  /** Which engine produced it ("extractive", "local:qwen3.5-4b", "anthropic:claude-…"). */
  engine: z.string(),
});
export type Analysis = z.infer<typeof Analysis>;

// ───────────────────────────── Script ─────────────────────────────

export const Tone = z.enum(['accent', 'primary', 'secondary', 'positive', 'negative', 'neutral']);
export type Tone = z.infer<typeof Tone>;

/** The visual library: every beat picks exactly one; the renderer can draw all of them. */
export const Visual = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('title'),
    title: z.string(),
    subtitle: z.string().optional(),
    kicker: z.string().optional(),
  }),
  z.object({
    type: z.literal('statement'),
    /** Short on-screen line (≤ 10 words). */
    text: z.string(),
    /** Words in `text` to highlight. */
    highlight: z.array(z.string()).default([]),
    icon: z.string().optional(),
  }),
  z.object({
    type: z.literal('bigNumber'),
    /** Verbatim from the source, e.g. "28.4". */
    value: z.string(),
    unit: z.string().optional(),
    label: z.string(),
    /** Optional comparison, e.g. { value: "26.4", label: "previous best" }. */
    compare: z.object({ value: z.string(), label: z.string() }).optional(),
    /** Who/what the number belongs to (labels its bar in a comparison), e.g. "Mistral 7B". */
    subject: z.string().optional(),
  }),
  z.object({
    type: z.literal('bullets'),
    heading: z.string().optional(),
    items: z.array(z.string()).min(1).max(5),
  }),
  z.object({
    type: z.literal('bars'),
    title: z.string(),
    unit: z.string().optional(),
    bars: z
      .array(z.object({ label: z.string(), value: z.number(), highlight: z.boolean().default(false) }))
      .min(2)
      .max(8),
  }),
  z.object({
    type: z.literal('flow'),
    title: z.string().optional(),
    nodes: z
      .array(z.object({ id: z.string(), label: z.string(), tone: Tone.default('primary') }))
      .min(2)
      .max(7),
    edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })).default([]),
  }),
  z.object({
    type: z.literal('compare'),
    left: z.object({ label: z.string(), points: z.array(z.string()).max(4) }),
    right: z.object({ label: z.string(), points: z.array(z.string()).max(4) }),
    /** Which side wins, if the source says so. */
    winner: z.enum(['left', 'right', 'none']).default('none'),
  }),
  z.object({ type: z.literal('quote'), text: z.string(), cite: z.string().optional() }),
  z.object({
    type: z.literal('code'),
    code: z.string(),
    lang: z.string().default('text'),
    /** 1-based line numbers to highlight. */
    focus: z.array(z.number().int()).default([]),
    caption: z.string().optional(),
  }),
  z.object({
    type: z.literal('figure'),
    assetId: z.string(),
    caption: z.string().optional(),
    /** Region to zoom/highlight, normalised 0..1 [x, y, w, h]. */
    focus: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  }),
  z.object({
    type: z.literal('tree'),
    title: z.string().optional(),
    /** File-tree lines, indentation by two spaces. */
    lines: z.array(z.string()).min(1).max(14),
    focus: z.array(z.string()).default([]),
  }),
  z.object({
    type: z.literal('tokens'),
    title: z.string().optional(),
    /** A short phrase as word chips (3–8 words). */
    words: z.array(z.string()).min(2).max(8),
    /** Index of the word that "looks at" the others. */
    focus: z.number().int().min(0).default(0),
    /** Link strength from the focus word to each word (0..1), same length as words. */
    weights: z.array(z.number().min(0).max(1)).default([]),
  }),
  z.object({ type: z.literal('takeaway'), text: z.string(), highlight: z.array(z.string()).default([]) }),
]);
export type Visual = z.infer<typeof Visual>;
export type VisualType = Visual['type'];

export const Claim = z.object({
  /** The factual content of (part of) the narration, as said. */
  text: z.string(),
  /** Segment ids that support it. Empty only for `kind: framing`. */
  support: z.array(z.string()),
  /** `framing` = transitions/hooks with no factual content ("Here's the big idea."). */
  kind: z.enum(['fact', 'framing', 'analogy']).default('fact'),
});
export type Claim = z.infer<typeof Claim>;

export const BeatRole = z.enum(['hook', 'context', 'idea', 'evidence', 'example', 'takeaway']);
export type BeatRole = z.infer<typeof BeatRole>;

export const Beat = z.object({
  id: z.string().regex(/^b\d+$/),
  role: BeatRole,
  /** What the voice says. Plain words, one idea. */
  narration: z.string(),
  visual: Visual,
  claims: z.array(Claim).default([]),
  /** Idea ids this beat covers. */
  ideas: z.array(z.string()).default([]),
  /** Words to pop on screen in sync with the voice. */
  keywords: z.array(z.string()).default([]),
});
export type Beat = z.infer<typeof Beat>;

export const Script = z.object({
  schema: z.literal('bridge.script/1').default('bridge.script/1'),
  title: z.string(),
  targetSeconds: z.number().positive(),
  beats: z.array(Beat).min(1),
  engine: z.string(),
});
export type Script = z.infer<typeof Script>;

// ───────────────────────────── Faithfulness ─────────────────────────────

export const ClaimVerdict = z.object({
  beatId: z.string(),
  claim: z.string(),
  verdict: z.enum(['supported', 'unsupported', 'framing']),
  /** Which check decided it. */
  by: z.enum(['numbers', 'names', 'overlap', 'judge', 'framing']),
  reason: z.string().optional(),
});
export type ClaimVerdict = z.infer<typeof ClaimVerdict>;

export const FaithReport = z.object({
  verdicts: z.array(ClaimVerdict),
  unsupported: z.number().int(),
  /** Beats removed or rewritten by the gate. */
  actions: z.array(
    z.object({ beatId: z.string(), action: z.enum(['dropped', 'rewritten', 'kept']), reason: z.string() }),
  ),
});
export type FaithReport = z.infer<typeof FaithReport>;

// ───────────────────────────── Timeline ─────────────────────────────

export const WordTiming = z.object({ word: z.string(), start: z.number(), end: z.number() });
export type WordTiming = z.infer<typeof WordTiming>;

export const TimedBeat = z.object({
  beat: Beat,
  start: z.number(),
  end: z.number(),
  /** Voice audio for this beat starts at `start + voiceOffset`. */
  voiceOffset: z.number(),
  voiceDuration: z.number(),
  words: z.array(WordTiming),
});
export type TimedBeat = z.infer<typeof TimedBeat>;

export const Cue = z.object({ start: z.number(), end: z.number(), text: z.string() });
export type Cue = z.infer<typeof Cue>;

export const SfxKind = z.enum(['whoosh', 'pop', 'tick', 'riser', 'impact', 'click', 'chime']);
export type SfxKind = z.infer<typeof SfxKind>;

export const Timeline = z.object({
  schema: z.literal('bridge.timeline/1').default('bridge.timeline/1'),
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  duration: z.number().positive(),
  beats: z.array(TimedBeat),
  captions: z.array(Cue),
  sfx: z.array(z.object({ t: z.number(), kind: SfxKind, gain: z.number().default(1) })),
  seed: z.number().int(),
  title: z.string(),
});
export type Timeline = z.infer<typeof Timeline>;

// ───────────────────────────── Requests ─────────────────────────────

export const LengthPreset = z.enum(['20s', '1m', '3m', '5m', 'custom']);
export type LengthPreset = z.infer<typeof LengthPreset>;

export const Level = z.enum(['newcomer', 'practitioner', 'expert']);
export type Level = z.infer<typeof Level>;

/** Engine ids: a fixed set, optionally with a model slug ("openrouter:anthropic/claude-sonnet-5.5"). Never a path. */
export const EngineSpec = z
  .string()
  .regex(
    /^(auto|local|extractive|system|kokoro|openai-tts|anthropic|openai|gemini|openrouter|elevenlabs)(:[A-Za-z0-9._/-]{1,100})?$/,
  )
  .refine((x) => !x.includes('..'), 'bad engine id');

export const RenderSettings = z.object({
  seconds: z.number().min(10).max(900),
  level: Level.default('newcomer'),
  /** Kokoro voice id or provider voice. */
  voice: z
    .string()
    .regex(/^[A-Za-z0-9_-]{0,64}$/)
    .default('af_heart'),
  captions: z.enum(['burned', 'track', 'both', 'off']).default('both'),
  music: z.boolean().default(true),
  sfx: z.boolean().default(true),
  /** Provider ids per stage; "auto" picks the best available. */
  llm: EngineSpec.default('auto'),
  tts: EngineSpec.default('auto'),
  width: z.number().int().min(320).max(3840).default(1920),
  height: z.number().int().min(180).max(2160).default(1080),
  fps: z.number().int().min(12).max(60).default(30),
  seed: z.number().int().default(7),
  /** Pinned/dropped idea ids from the review step. */
  pin: z.array(z.string().max(40)).max(200).default([]),
  drop: z.array(z.string().max(40)).max(200).default([]),
});
export type RenderSettings = z.infer<typeof RenderSettings>;
