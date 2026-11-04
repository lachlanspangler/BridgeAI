/**
 * JSON schemas the models must fill. Written in the strict subset every backend understands:
 * node-llama-cpp GBNF grammars (all properties required, `oneOf`), OpenAI strict structured outputs
 * (`additionalProperties: false`, all required, `anyOf`), Anthropic tool input schemas and Gemini responseSchema.
 * Segment ids, idea ids and asset ids are enums, so a model *cannot* cite something that doesn't exist.
 */
import type { Source } from '../schema.ts';

export type JsonSchema = Record<string, unknown>;

const str = (description?: string): JsonSchema => ({ type: 'string', ...(description ? { description } : {}) });
const arr = (items: JsonSchema, maxItems?: number, minItems?: number): JsonSchema => ({
  type: 'array',
  items,
  ...(maxItems !== undefined ? { maxItems } : {}),
  ...(minItems !== undefined ? { minItems } : {}),
});
const obj = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const enumOf = (values: string[]): JsonSchema => ({ type: 'string', enum: values.length ? values : ['none'] });

export const IDEA_KINDS = ['claim', 'method', 'result', 'number', 'definition', 'problem', 'architecture', 'code', 'figure'];

export function analysisSchema(segmentIds: string[], assetIds: string[], maxIdeas: number): JsonSchema {
  return obj({
    gist: str('one plain sentence: what the whole source is about'),
    ideas: arr(
      obj({
        statement: str('one plain sentence, at most 20 words'),
        kind: enumOf(IDEA_KINDS),
        importance: { type: 'integer', enum: [1, 2, 3, 4, 5] },
        evidence: arr(obj({ segmentId: enumOf(segmentIds), quote: str('copied word for word from that segment') }), 2, 1),
        numbers: arr(str(), 3),
        terms: arr(str(), 3),
        figure: enumOf(['none', ...assetIds]),
      }),
      maxIdeas,
      1,
    ),
  });
}

export const VISUAL_TYPES = ['title', 'statement', 'bigNumber', 'bullets', 'bars', 'flow', 'compare', 'quote', 'code', 'figure', 'tree', 'takeaway'] as const;

/** Visual variants offered to the model for this source (code/figure/tree only when the source has them). */
export function visualSchema(src: Source): JsonSchema {
  const codeIds = src.segments.filter((s) => s.kind === 'code').map((s) => s.id);
  const assetIds = src.assets.filter((a) => a.kind !== 'page').map((a) => a.id);
  const hasTree = src.segments.some((s) => s.kind === 'meta' && s.text.startsWith('FILE TREE'));
  const t = (name: string) => ({ type: 'string', const: name });
  const variants: JsonSchema[] = [
    obj({ type: t('title'), title: str(), subtitle: str() }),
    obj({ type: t('statement'), text: str('≤ 7 words on screen'), highlight: arr(str(), 2) }),
    obj({ type: t('bigNumber'), value: str('a number copied from the source'), unit: str(), label: str('≤ 7 words'), compareValue: str('"" if none'), compareLabel: str('"" if none') }),
    obj({ type: t('bullets'), heading: str(), items: arr(str('≤ 5 words'), 4, 2) }),
    obj({ type: t('bars'), title: str(), unit: str(), bars: arr(obj({ label: str(), value: { type: 'number' }, highlight: { type: 'boolean' } }), 6, 2) }),
    obj({ type: t('flow'), title: str(), nodes: arr(obj({ id: str(), label: str('≤ 3 words') }), 5, 2), edges: arr(obj({ from: str(), to: str() }), 6) }),
    obj({ type: t('compare'), leftLabel: str(), leftPoints: arr(str('≤ 5 words'), 3), rightLabel: str(), rightPoints: arr(str('≤ 5 words'), 3), winner: enumOf(['left', 'right', 'none']) }),
    obj({ type: t('quote'), text: str('a short exact quote from the source') }),
    obj({ type: t('takeaway'), text: str('≤ 10 words'), highlight: arr(str(), 2) }),
  ];
  if (codeIds.length) variants.push(obj({ type: t('code'), segmentId: enumOf(codeIds), focusLines: arr({ type: 'integer' }, 3), caption: str() }));
  if (assetIds.length) variants.push(obj({ type: t('figure'), assetId: enumOf(assetIds), caption: str('≤ 7 words') }));
  if (hasTree) variants.push(obj({ type: t('tree'), title: str(), focus: arr(str('a file or folder name from the tree'), 3) }));
  return { oneOf: variants };
}

export const ROLES = ['hook', 'context', 'idea', 'evidence', 'example', 'takeaway'];

export function scriptSchema(src: Source, maxBeats: number): JsonSchema {
  const segmentIds = src.segments.map((s) => s.id);
  return obj({
    title: str('≤ 7 words'),
    beats: arr(
      obj({
        role: enumOf(ROLES),
        narration: str('what the voice says: plain words, one idea'),
        visual: visualSchema(src),
        claims: arr(obj({ text: str(), support: arr(enumOf(segmentIds), 3), kind: enumOf(['fact', 'framing', 'analogy']) }), 3, 1),
        keywords: arr(str(), 3),
      }),
      maxBeats,
      2,
    ),
  });
}

export function judgeSchema(): JsonSchema {
  return obj({ verdict: enumOf(['supported', 'not_supported']), reason: str('≤ 20 words') });
}

export function tightenSchema(): JsonSchema {
  return obj({ narration: str() });
}

/** OpenAI strict mode wants `anyOf` instead of `oneOf`, and no `const` without `type` (we always set type). */
export function toOpenAiSchema(s: JsonSchema): JsonSchema {
  return JSON.parse(JSON.stringify(s).replace(/"oneOf":/g, '"anyOf":')) as JsonSchema;
}
