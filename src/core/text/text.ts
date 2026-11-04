/** Text utilities: sentences, words, syllables, numbers, keywords. Pure and deterministic. */

const ABBREV = new Set([
  'e.g', 'i.e', 'et al', 'al', 'fig', 'figs', 'eq', 'eqs', 'sec', 'vs', 'etc', 'cf', 'approx', 'dr', 'mr', 'mrs',
  'ms', 'prof', 'no', 'vol', 'pp', 'ref', 'refs', 'tab', 'resp', 'st', 'jr', 'inc', 'ltd', 'u.s', 'e.t.c',
]);

/** Split prose into sentences. Handles abbreviations, decimals, initials and citations like "[12]." */
export function sentences(text: string): string[] {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (c !== '.' && c !== '!' && c !== '?') continue;
    // decimal number "3.14"
    if (c === '.' && /\d/.test(t[i - 1] ?? '') && /\d/.test(t[i + 1] ?? '')) continue;
    // need whitespace (or end) after, optionally after closing quotes/brackets
    let j = i + 1;
    while (j < t.length && /["'”’)\]]/.test(t[j]!)) j++;
    if (j < t.length && t[j] !== ' ') continue;
    const before = t.slice(start, i).toLowerCase();
    const lastWord = before.split(/\s+/).pop() ?? '';
    if (c === '.' && (ABBREV.has(lastWord.replace(/^[("[]+/, '')) || /^[a-z]$/i.test(lastWord))) continue;
    // next sentence should start with an uppercase letter, digit, or quote
    const next = t[j + 1] ?? '';
    if (j < t.length && next && !/[A-Z0-9"“‘'([]/.test(next)) continue;
    out.push(t.slice(start, j).trim());
    start = j + 1;
  }
  const rest = t.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter((s) => s.length > 0);
}

/** Words as spoken (keeps numbers like 28.4 and hyphenated words together). */
export function words(text: string): string[] {
  return text.match(/[A-Za-z0-9][A-Za-z0-9'’.\-%]*[A-Za-z0-9%]|[A-Za-z0-9]/g) ?? [];
}

export const wordCount = (text: string): number => words(text).length;

/** Heuristic English syllable count (for word-timing estimates). */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!w) return 0;
  if (/^\d/.test(w)) return Math.max(1, numberSpokenWords(w) * 2);
  if (w.length <= 3) return 1;
  const s = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return Math.max(1, s ? s.length : 1);
}

function numberSpokenWords(n: string): number {
  // "28.4" → twenty eight point four ≈ 4 words; "2014" ≈ 3
  const digits = n.replace(/[^0-9]/g, '').length;
  return Math.min(6, Math.max(1, Math.ceil(digits * 0.8)));
}

/** Numbers as written in text: 28.4, 3,000, 2×, 41%, 1e-4, 3.5B. Returns normalised canonical strings. */
export function numbers(text: string): string[] {
  const m = text.match(/(?<![A-Za-z])[-−]?\d[\d,]*(?:\.\d+)?(?:e-?\d+)?\s?(?:%|×|x\b|k\b|K\b|M\b|B\b)?/g) ?? [];
  return m.map(normNumber).filter((x) => x !== '');
}

export function normNumber(raw: string): string {
  const s = raw.trim().replace(/−/g, '-').replace(/\s/g, '');
  const m = s.match(/^(-?)([\d,]+(?:\.\d+)?(?:e-?\d+)?)(.*)$/);
  if (!m) return '';
  const digits = m[2]!.replace(/,/g, '');
  return m[1] + digits;
}

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', twenty: '20', thirty: '30', forty: '40', fifty: '50', hundred: '100',
  thousand: '1000', million: '1000000', billion: '1000000000', half: '0.5', twice: '2', double: '2', triple: '3',
};

/** Number words that carry quantity in narration ("two tasks", "twice as fast"). */
export function numberWords(text: string): string[] {
  return words(text.toLowerCase())
    .map((w) => NUMBER_WORDS[w])
    .filter((x): x is string => !!x);
}

export const STOPWORDS = new Set(
  (
    'a an the and or but if then else of to in on at by for with from as is are was were be been being it its this ' +
    'that these those there their they them we our us you your he she his her i me my not no nor so than too very ' +
    'can could should would may might must will shall do does did doing have has had having into over under about ' +
    'between through during before after above below up down out off again further once here when where why how ' +
    'all any both each few more most other some such only own same just also which who whom whose what while ' +
    'because until against among per via et al using use used based show shows shown paper work approach method ' +
    'methods results result new propose proposed present presents study studies however thus therefore'
  ).split(/\s+/),
);

export function contentWords(text: string): string[] {
  return words(text.toLowerCase())
    .map((w) => w.replace(/['’]s$/, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d/.test(w));
}

/** Crude stemmer (enough for overlap checks): strips common English suffixes. */
export function stem(w: string): string {
  return w
    .toLowerCase()
    .replace(/(ization|isation)$/, 'ize')
    .replace(/(ational)$/, 'ate')
    .replace(/(iveness|fulness|ousness)$/, '')
    .replace(/(ments?|ness|ings?|edly|ed|ly|es|s)$/, '')
    .replace(/(.)\1$/, '$1');
}

/** Capitalised names/terms that are not sentence-initial: "Transformer", "BLEU", "WMT", "GPT-4". */
export function properNouns(text: string): string[] {
  const out: string[] = [];
  for (const s of sentences(text)) {
    const ws = s.split(/\s+/);
    ws.forEach((raw, i) => {
      const w = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9-]+$/g, '');
      if (!w || w.length < 2) return;
      const isAcronym = /^[A-Z][A-Z0-9-]{1,}$/.test(w) && /[A-Z]/.test(w.slice(1));
      const isCap = /^[A-Z][a-z]+[A-Za-z0-9-]*$/.test(w) && i > 0 && !/[.:!?]$/.test(ws[i - 1] ?? '');
      const hasDigitName = /^[A-Za-z]+-?\d/.test(w);
      if (isAcronym || isCap || hasDigitName) out.push(w);
    });
  }
  return [...new Set(out)];
}

/** Remove citation brackets, figure refs and parentheticals that don't read well aloud. */
export function cleanForSpeech(s: string): string {
  return s
    .replace(/\[[\d,\s–-]+\]/g, '')
    .replace(/\((?:see )?(?:fig(?:ure)?|table|eq|section|sec|appendix)\.?\s*[\w.]+\)/gi, '')
    .replace(/\(([A-Z][A-Za-z-]+(?: et al\.?)?,? \d{4}[a-z]?;?\s*)+\)/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Truncate to at most n words, ending cleanly. */
export function clampWords(text: string, n: number): string {
  const ws = text.split(/\s+/).filter(Boolean);
  if (ws.length <= n) return text.trim();
  return ws.slice(0, n).join(' ').replace(/[,;:]$/, '') + '…';
}

/** Jaccard-ish overlap of stemmed content words: |a ∩ b| / |a|. */
export function coverage(a: string, b: string): number {
  const A = new Set(contentWords(a).map(stem));
  if (A.size === 0) return 1;
  const B = new Set(contentWords(b).map(stem));
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / A.size;
}

/** Title-case-ish short label from a phrase (for on-screen text). */
export function sentenceCase(s: string): string {
  const t = s.trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
}
