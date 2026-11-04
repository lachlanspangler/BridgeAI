/**
 * Model output → Bridge's contract, defensively. Quotes are verified against the cited segment (fuzzy), visuals
 * are converted from the flat model schema into the renderer's Visual type and repaired when they reference
 * numbers or assets that don't exist, and everything is validated with zod at the end.
 */
import {
  Analysis,
  Script,
  Visual,
  type Beat,
  type Idea,
  type IdeaKind,
  type Source,
  type Tone,
} from '../schema.ts';
import { contentWords, normNumber, numbers, stem, wordCount } from '../text/text.ts';
import { IDEA_KINDS } from './schemas.ts';
import { trimSentence } from '../script/extractive.ts';

const normQ = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9%. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Is `quote` (near-)verbatim in `text`? Exact normalised substring, else ≥ 85% of its content stems in order-free match. */
export function quoteFound(quote: string, text: string): boolean {
  const q = normQ(quote);
  if (!q) return false;
  const t = normQ(text);
  if (t.includes(q)) return true;
  const qs = contentWords(quote).map(stem);
  if (qs.length < 3) return false;
  const ts = new Set(contentWords(text).map(stem));
  const hit = qs.filter((w) => ts.has(w)).length;
  return hit / qs.length >= 0.85;
}

interface RawIdea {
  statement?: string;
  kind?: string;
  importance?: number;
  evidence?: { segmentId?: string; quote?: string }[];
  numbers?: string[];
  terms?: string[];
  figure?: string;
}

export function parseAnalysis(
  raw: unknown,
  src: Source,
  engine: string,
): { analysis: Analysis; dropped: string[] } {
  const r = (raw ?? {}) as { gist?: string; ideas?: RawIdea[] };
  const seg = new Map(src.segments.map((s) => [s.id, s]));
  const dropped: string[] = [];
  const ideas: Idea[] = [];
  for (const it of r.ideas ?? []) {
    const statement = (it.statement ?? '').trim();
    if (!statement) continue;
    const evidence = (it.evidence ?? [])
      .filter((e) => e.segmentId && seg.has(e.segmentId))
      .map((e) => {
        const s = seg.get(e.segmentId!)!;
        // keep the model's quote if verified; else fall back to the segment's own first sentence
        const quote = e.quote && quoteFound(e.quote, s.text) ? e.quote.trim() : '';
        return { segmentId: e.segmentId!, quote, verified: !!quote };
      });
    const verified = evidence.filter((e) => e.verified);
    if (!verified.length) {
      dropped.push(`unverifiable evidence: ${statement}`);
      continue;
    }
    const allSupport = verified.map((e) => seg.get(e.segmentId)!.text).join(' ');
    const nums = (it.numbers ?? []).filter((n) =>
      numbers(n).every((x) => numbers(allSupport).map(normNumber).includes(normNumber(x))),
    );
    const kind = (IDEA_KINDS.includes(it.kind ?? '') ? it.kind : 'claim') as IdeaKind;
    ideas.push({
      id: `i${ideas.length + 1}`,
      statement,
      kind,
      importance: Math.max(0, Math.min(1, (it.importance ?? 3) / 5)),
      evidence: verified.map(({ segmentId, quote }) => ({ segmentId, quote })),
      numbers: nums,
      terms: (it.terms ?? [])
        .filter((t) => t && allSupport.toLowerCase().includes(t.toLowerCase()))
        .slice(0, 3),
      assets:
        it.figure && it.figure !== 'none' && src.assets.some((a) => a.id === it.figure) ? [it.figure] : [],
    });
  }
  // stable sort by importance (model order breaks ties)
  ideas.sort((a, b) => b.importance - a.importance);
  ideas.forEach((i, k) => (i.id = `i${k + 1}`));
  const analysis = Analysis.parse({
    schema: 'bridge.analysis/1',
    gist: (r.gist ?? '').trim() || src.title,
    ideas,
    engine,
  });
  return { analysis, dropped };
}

/** Merge per-chunk analyses: dedupe near-duplicate statements, keep the strongest, re-rank. */
export function mergeAnalyses(parts: Analysis[], engine: string, max = 14): Analysis {
  const all = parts.flatMap((p) => p.ideas);
  const kept: Idea[] = [];
  const bag = (s: string) => new Set(contentWords(s).map(stem));
  for (const idea of [...all].sort((a, b) => b.importance - a.importance)) {
    const b = bag(idea.statement);
    const dup = kept.find((k) => {
      const o = bag(k.statement);
      let common = 0;
      for (const w of b) if (o.has(w)) common++;
      return common / Math.max(1, Math.min(b.size, o.size)) > 0.6;
    });
    if (dup) {
      // merge evidence
      for (const e of idea.evidence)
        if (!dup.evidence.some((x) => x.segmentId === e.segmentId)) dup.evidence.push(e);
      dup.evidence = dup.evidence.slice(0, 3);
      continue;
    }
    kept.push({ ...idea, evidence: [...idea.evidence] });
  }
  const ideas = kept.slice(0, max).map((i, k) => ({ ...i, id: `i${k + 1}` }));
  return { schema: 'bridge.analysis/1', gist: parts[0]?.gist ?? '', ideas, engine };
}

// ───────────── script ─────────────

interface RawVisual {
  type?: string;
  [k: string]: unknown;
}
interface RawBeat {
  role?: string;
  narration?: string;
  visual?: RawVisual;
  claims?: { text?: string; support?: string[]; kind?: string }[];
  keywords?: string[];
}

const s = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
const sa = (x: unknown): string[] => (Array.isArray(x) ? x.map(s).filter(Boolean) : []);
const clampW = (t: string, n: number): string => t.split(/\s+/).slice(0, n).join(' ');
const TONES: Tone[] = ['primary', 'secondary', 'accent', 'positive', 'neutral'];

function sourceHasNumber(src: Source, value: string): boolean {
  const n = numbers(value).map(normNumber);
  if (!n.length) return false;
  const all = new Set(src.segments.flatMap((x) => numbers(x.text).map(normNumber)));
  return n.every((x) => all.has(x) || all.has(String(Number(x))));
}

/** Flat model visual → renderer Visual. Falls back to a statement when the model asked for something impossible. */
export function toVisual(
  v: RawVisual | undefined,
  src: Source,
  narration: string,
  keywords: string[],
): Visual {
  const fallback: Visual = {
    type: 'statement',
    text: clampW(keywords.join(' · ') || narration, 7),
    highlight: keywords.slice(0, 2),
  };
  if (!v || !v.type) return fallback;
  try {
    switch (v.type) {
      case 'title':
        return Visual.parse({
          type: 'title',
          title: clampW(s(v.title) || src.title, 9),
          subtitle: s(v.subtitle) || undefined,
        });
      case 'statement': {
        const text = s(v.text);
        // a statement must say something on its own (≥ 3 words); else show the narration's key clause
        const shown = wordCount(text) >= 3 ? text : trimSentence(narration, 9).replace(/[.!?]$/, '');
        return Visual.parse({
          type: 'statement',
          text: clampW(shown, 9),
          highlight: sa(v.highlight).slice(0, 2),
        });
      }
      case 'bigNumber': {
        const value = s(v.value);
        if (!sourceHasNumber(src, value)) return fallback;
        let cv = s(v.compareValue);
        // a comparison must be like-for-like and visible: beyond 20:1 it's usually a stock vs a flow
        const r = Number(normNumber(value)) / Number(normNumber(cv));
        if (cv && (!Number.isFinite(r) || r > 20 || r < 1 / 20)) cv = '';
        return Visual.parse({
          type: 'bigNumber',
          value: value.replace(/\s*%$/, '%'),
          unit: s(v.unit) || undefined,
          label: clampW(s(v.label), 8),
          compare:
            cv && sourceHasNumber(src, cv)
              ? { value: cv, label: clampW(s(v.compareLabel) || 'before', 4) }
              : undefined,
        });
      }
      case 'bullets':
        return Visual.parse({
          type: 'bullets',
          heading: s(v.heading) || undefined,
          items: sa(v.items)
            .slice(0, 4)
            .map((x) => clampW(x, 7)),
        });
      case 'bars': {
        const bars = (Array.isArray(v.bars) ? v.bars : []) as {
          label?: string;
          value?: number;
          highlight?: boolean;
        }[];
        const clean = bars.filter(
          (b) =>
            typeof b.value === 'number' && Number.isFinite(b.value) && sourceHasNumber(src, String(b.value)),
        );
        if (clean.length < 2) return fallback;
        return Visual.parse({
          type: 'bars',
          title: clampW(s(v.title), 8),
          unit: s(v.unit) || undefined,
          bars: clean
            .slice(0, 6)
            .map((b) => ({ label: clampW(s(b.label), 4), value: b.value!, highlight: !!b.highlight })),
        });
      }
      case 'flow': {
        const nodes = (Array.isArray(v.nodes) ? v.nodes : []) as { id?: string; label?: string }[];
        const ns = nodes
          .filter((n) => s(n.label))
          .slice(0, 5)
          .map((n, i) => ({
            id: `n${i}`,
            orig: s(n.id),
            label: clampW(s(n.label), 4),
            tone: TONES[i % TONES.length]!,
          }));
        if (ns.length < 2) return fallback;
        // models reuse or omit ids; our ids are positional. Edges are kept only if the model's ids were unique.
        const origs = ns.map((n) => n.orig);
        const unique = origs.every((o) => o) && new Set(origs).size === origs.length;
        const idOf = new Map(ns.map((n) => [n.orig, n.id]));
        let edges = unique
          ? ((Array.isArray(v.edges) ? v.edges : []) as { from?: string; to?: string }[])
              .filter((e) => idOf.has(s(e.from)) && idOf.has(s(e.to)) && s(e.from) !== s(e.to))
              .map((e) => ({ from: idOf.get(s(e.from))!, to: idOf.get(s(e.to))! }))
          : [];
        const parallel = /\b(parallel|at once|simultaneous|independent|side by side|in parallel)\b/i.test(
          `${s(v.title)} ${narration}`,
        );
        if (parallel)
          edges = []; // arrows would say "sequence" when the narration says "parallel"
        else if (!edges.length) edges = ns.slice(1).map((n, i) => ({ from: ns[i]!.id, to: n.id }));
        return Visual.parse({
          type: 'flow',
          title: s(v.title) || undefined,
          nodes: ns.map(({ orig: _o, ...n }) => n),
          edges,
        });
      }
      case 'compare':
        // both sides must have a label and something to say, or it's an empty card
        if (
          !s(v.leftLabel) ||
          !s(v.rightLabel) ||
          (!sa(v.leftPoints).length && !sa(v.rightPoints).length) ||
          !sa(v.leftPoints).length ||
          !sa(v.rightPoints).length
        )
          return fallback;
        return Visual.parse({
          type: 'compare',
          left: {
            label: clampW(s(v.leftLabel), 4),
            points: sa(v.leftPoints)
              .slice(0, 3)
              .map((x) => clampW(x, 7)),
          },
          right: {
            label: clampW(s(v.rightLabel), 4),
            points: sa(v.rightPoints)
              .slice(0, 3)
              .map((x) => clampW(x, 7)),
          },
          winner: ['left', 'right'].includes(s(v.winner)) ? s(v.winner) : 'none',
        });
      case 'quote': {
        const text = s(v.text);
        const found = src.segments.find((x) => quoteFound(text, x.text));
        // a quote card must be what the voice is saying (dual coding), not a stray line from the source
        if (!found || coverageOf(text, narration) < 0.5) return fallback;
        return Visual.parse({ type: 'quote', text: clampW(text, 30), cite: src.title });
      }
      case 'code': {
        const seg = src.segments.find((x) => x.id === s(v.segmentId) && x.kind === 'code');
        if (!seg) return fallback;
        const lines = seg.text.split('\n');
        const focus = (Array.isArray(v.focusLines) ? v.focusLines : []).filter(
          (n): n is number => typeof n === 'number' && n >= 1 && n <= Math.min(14, lines.length),
        );
        return Visual.parse({
          type: 'code',
          code: lines.slice(0, 14).join('\n'),
          lang: seg.lang ?? 'text',
          focus,
          caption: s(v.caption) || seg.loc.file || undefined,
        });
      }
      case 'figure': {
        const a = src.assets.find((x) => x.id === s(v.assetId));
        if (!a) return fallback;
        // "Figure 4 shows…" may only show Figure 4
        const said = narration.match(/\bfig(?:ure)?\.?\s*(\d+)/i)?.[1];
        const has = (a.caption ?? '').match(/^fig(?:ure)?\.?\s*(\d+)/i)?.[1];
        if (said && has && said !== has) return fallback;
        return Visual.parse({
          type: 'figure',
          assetId: a.id,
          caption: a.caption ? clampW(a.caption, 12) : undefined,
        });
      }
      case 'tree': {
        const t = src.segments.find((x) => x.kind === 'meta' && x.text.startsWith('FILE TREE'));
        if (!t) return fallback;
        const lines = t.text.split('\n').slice(1).filter(Boolean).slice(0, 14);
        return Visual.parse({
          type: 'tree',
          title: s(v.title) || undefined,
          lines,
          focus: sa(v.focus).slice(0, 3),
        });
      }
      case 'takeaway': {
        const t = s(v.text);
        const text =
          wordCount(t) >= 3 && wordCount(t) <= 12 && !/\b(and|or|the|a|of|to|with|much|but)$/i.test(t)
            ? t
            : trimSentence(narration, 12).replace(/[.!?]$/, '');
        return Visual.parse({ type: 'takeaway', text, highlight: sa(v.highlight).slice(0, 2) });
      }
      case 'tokens': {
        const words = sa(v.words)
          .slice(0, 8)
          .map((w) => w.split(/\s+/)[0]!.slice(0, 16));
        if (words.length < 3) return fallback;
        const focus = Math.max(0, Math.min(words.length - 1, typeof v.focus === 'number' ? v.focus : 0));
        const weights = (Array.isArray(v.weights) ? v.weights : [])
          .map((x) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0.3))
          .slice(0, words.length);
        return Visual.parse({ type: 'tokens', title: s(v.title) || undefined, words, focus, weights });
      }
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function parseScript(raw: unknown, src: Source, targetSeconds: number, engine: string): Script {
  const r = (raw ?? {}) as { title?: string; beats?: RawBeat[] };
  const ids = new Set(src.segments.map((x) => x.id));
  const beats: Beat[] = [];
  for (const rb of r.beats ?? []) {
    const narration = s(rb.narration).replace(/\s+/g, ' ');
    if (wordCount(narration) < 2) continue;
    const keywords = sa(rb.keywords)
      .filter((k) => narration.toLowerCase().includes(k.toLowerCase()))
      .slice(0, 3);
    const role = (
      ['hook', 'context', 'idea', 'evidence', 'example', 'takeaway'].includes(s(rb.role))
        ? s(rb.role)
        : 'idea'
    ) as Beat['role'];
    const claims = (rb.claims ?? [])
      .map((c) => ({
        text: s(c.text),
        support: sa(c.support).filter((x) => ids.has(x)),
        kind: (['fact', 'framing', 'analogy'].includes(s(c.kind)) ? s(c.kind) : 'fact') as
          'fact' | 'framing' | 'analogy',
      }))
      .filter((c) => c.text);
    // the narration is what is actually said: make sure it's covered. If the model gave no fact claims, treat
    // the whole narration as one fact claim citing everything it cited (so the gate checks it).
    const support = [...new Set(claims.flatMap((c) => c.support))];
    const hasFact = claims.some((c) => c.kind === 'fact');
    const finalClaims =
      hasFact || role === 'hook' ? claims : [{ text: narration, support, kind: 'fact' as const }];
    if (role === 'hook' && !finalClaims.length)
      finalClaims.push({ text: narration, support, kind: support.length ? 'fact' : 'framing' });
    beats.push({
      id: `b${beats.length + 1}`,
      role,
      narration,
      visual: toVisual(rb.visual, src, narration, keywords),
      claims: finalClaims,
      ideas: [],
      keywords,
    });
  }
  if (!beats.length) throw new Error('the model returned no usable beats');
  // one idea per beat, no filler: drop beats that repeat an earlier beat, keep only the LAST takeaway
  const bag = (t: string) => new Set(contentWords(t).map(stem));
  for (let i = beats.length - 1; i > 0; i--) {
    const b = bag(beats[i]!.narration);
    const dup = beats.slice(0, i).some((p) => {
      const o = bag(p.narration);
      let common = 0;
      for (const w of b) if (o.has(w)) common++;
      return common / Math.max(1, Math.min(b.size, o.size)) > 0.7;
    });
    if (dup && beats.length > 2) beats.splice(i, 1);
  }
  const lastTake = beats.map((b) => b.role).lastIndexOf('takeaway');
  for (let i = beats.length - 2; i >= 1; i--) {
    if (beats[i]!.role === 'takeaway' && i !== lastTake) {
      // a mid-script "takeaway" is usually a repeat; keep it only as an idea if it's not near the end
      if (i >= beats.length - 3) beats.splice(i, 1);
      else beats[i] = { ...beats[i]!, role: 'idea' };
    }
  }
  // shape guarantees: first beat is a hook with a title card, last is a takeaway
  if (beats[0]!.role !== 'hook') beats[0] = { ...beats[0]!, role: 'hook' };
  // a title card on the hook always shows the source's real title (model titles can overclaim)
  if (beats[0]!.visual.type === 'title')
    beats[0] = {
      ...beats[0]!,
      visual: {
        type: 'title',
        title: clampW(src.title, 9),
        kicker: src.kind === 'pdf' ? 'PAPER' : src.kind === 'project' ? 'PROJECT' : 'EXPLAINED',
      },
    };
  const last = beats[beats.length - 1]!;
  if (beats.length > 1 && last.role !== 'takeaway') beats[beats.length - 1] = { ...last, role: 'takeaway' };
  const lb = beats[beats.length - 1]!;
  if (beats.length > 1 && lb.visual.type !== 'takeaway')
    beats[beats.length - 1] = {
      ...lb,
      visual: {
        type: 'takeaway',
        text: clampW(lb.narration.replace(/[.!?]$/, ''), 12),
        highlight: lb.keywords.slice(0, 1),
      },
    };
  ensureFigure(beats, src);
  // a figure is shown once, and figures stay a spice (≤ 1 per ~45 s); repeats become a line of their own narration
  const seen = new Set<string>();
  const maxFigs = Math.max(1, Math.round(targetSeconds / 45));
  beats.forEach((b, i) => {
    if (b.visual.type !== 'figure') return;
    if (seen.has(b.visual.assetId) || seen.size >= maxFigs)
      beats[i] = {
        ...b,
        visual: {
          type: 'statement',
          text: trimSentence(b.narration, 8).replace(/[.!?]$/, ''),
          highlight: b.keywords.slice(0, 2),
        },
      };
    seen.add(b.visual.assetId);
  });
  return Script.parse({ schema: 'bridge.script/1', title: src.title, targetSeconds, beats, engine });
}

/**
 * Real pictures beat drawn ones: if the source has figures/images and no beat shows one, the idea beat whose
 * words best match a figure's caption/OCR (or, for image sets, the first idea beat) shows that figure instead.
 */
export function ensureFigure(beats: Beat[], src: Source): void {
  const figs = src.assets.filter((a) => a.kind !== 'page');
  if (!figs.length || beats.some((b) => b.visual.type === 'figure')) return;
  const candidates = beats
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.role !== 'hook' && b.role !== 'takeaway' && b.visual.type !== 'bigNumber');
  if (!candidates.length) {
    // an image set must show its image: put it on the hook (or the first non-takeaway beat)
    if (src.kind !== 'images') return;
    const i = beats.findIndex((b) => b.role !== 'takeaway');
    if (i < 0) return;
    const a = figs[0]!;
    beats[i] = { ...beats[i]!, visual: { type: 'figure', assetId: a.id, caption: a.caption } };
    return;
  }
  let best = { i: -1, a: figs[0]!, score: -1 };
  for (const { b, i } of candidates) {
    for (const a of figs) {
      const score = coverageOf(b.narration, `${a.caption ?? ''} ${a.ocr ?? ''}`);
      if (score > best.score) best = { i, a, score };
    }
  }
  if (src.kind !== 'images' && best.score < 0.25) return; // papers: only when a figure clearly matches
  const i = best.i >= 0 && best.score > 0 ? best.i : candidates[0]!.i;
  const b = beats[i]!;
  beats[i] = {
    ...b,
    visual: {
      type: 'figure',
      assetId: best.a.id,
      caption: best.a.caption ? best.a.caption.split(/\s+/).slice(0, 12).join(' ') : undefined,
    },
  };
}

function coverageOf(a: string, b: string): number {
  const A = new Set(contentWords(a).map(stem));
  const B = new Set(contentWords(b).map(stem));
  if (!A.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / A.size;
}
