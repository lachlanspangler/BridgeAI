/**
 * Pasted text / Markdown → Source. Pure (works in the browser too). Detects a title, an abstract, Markdown
 * headings, fenced code, lists and paragraphs, and tracks line numbers so every segment can be traced.
 */
import type { Segment, Source } from '../schema.ts';
import { wordCount } from '../text/text.ts';

export function ingestText(text: string, origin = 'pasted text', titleHint?: string): Source {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const segs: Segment[] = [];
  const section: string[] = [];
  let buf: string[] = [];
  let bufStart = 1;
  let inCode: { lang: string; start: number; lines: string[] } | null = null;
  let title = titleHint?.trim() ?? '';
  let nextKind: Segment['kind'] | null = null;
  const id = () => `s${segs.length + 1}`;

  const flush = (endLine: number) => {
    const body = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (body) {
      const isList = buf.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
      let kind: Segment['kind'] = nextKind ?? (isList ? 'list' : 'paragraph');
      if (/^abstract[:.—-]\s*/i.test(body)) kind = 'abstract';
      segs.push({
        id: id(),
        kind,
        text: isList ? buf.map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s+/, '').trim()).join('; ') : body.replace(/^abstract[:.—-]\s*/i, ''),
        loc: { lines: [bufStart, endLine], section: section.length ? [...section] : undefined },
      });
      if (kind === 'abstract') nextKind = null;
    }
    buf = [];
  };

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trimEnd();
    if (inCode) {
      if (/^```/.test(line.trim())) {
        segs.push({ id: id(), kind: 'code', text: inCode.lines.join('\n'), lang: inCode.lang || undefined, loc: { lines: [inCode.start, n] } });
        inCode = null;
      } else inCode.lines.push(raw);
      return;
    }
    const fence = line.trim().match(/^```(\w*)/);
    if (fence) {
      flush(n - 1);
      inCode = { lang: fence[1] ?? '', start: n, lines: [] };
      return;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush(n - 1);
      const level = h[1]!.length;
      const text = h[2]!.replace(/[#*_`]/g, '').trim();
      if (level === 1 && !title) {
        title = text;
        segs.push({ id: id(), kind: 'title', text, loc: { lines: [n, n] } });
      } else {
        section.splice(Math.max(0, level - 2));
        section.push(text);
        segs.push({ id: id(), kind: 'heading', text, loc: { lines: [n, n], section: [...section] } });
        nextKind = /^abstract$/i.test(text) ? 'abstract' : null;
      }
      return;
    }
    if (!line.trim()) {
      flush(n - 1);
      bufStart = n + 1;
      return;
    }
    // a bare "Abstract" line acts like a heading
    if (/^abstract\s*$/i.test(line.trim())) {
      flush(n - 1);
      nextKind = 'abstract';
      bufStart = n + 1;
      return;
    }
    if (!buf.length) bufStart = n;
    buf.push(line.replace(/[*_`]{1,2}([^*_`]+)[*_`]{1,2}/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'));
  });
  if (inCode) {
    const c = inCode as { lang: string; start: number; lines: string[] };
    segs.push({ id: id(), kind: 'code', text: c.lines.join('\n'), lang: c.lang || undefined, loc: { lines: [c.start, lines.length] } });
  }
  flush(lines.length);

  // no Markdown title: a short first paragraph without a final period is the title
  if (!title) {
    const first = segs.find((s) => s.kind === 'paragraph');
    if (first && wordCount(first.text) <= 16 && !/[.!?]$/.test(first.text)) {
      first.kind = 'title';
      title = first.text;
    } else {
      title = deriveTitle(segs);
    }
  }
  // if nothing was marked abstract and the text is short, its first paragraph plays that role
  if (!segs.some((s) => s.kind === 'abstract')) {
    const firstPara = segs.find((s) => s.kind === 'paragraph');
    if (firstPara && wordCount(text) < 600) firstPara.kind = 'abstract';
  }
  return {
    schema: 'bridge.source/1',
    kind: 'text',
    title,
    origin,
    segments: segs,
    assets: [],
    warnings: segs.length ? [] : ['the text was empty'],
    stats: { words: wordCount(text) },
  };
}

function deriveTitle(segs: Segment[]): string {
  const p = segs.find((s) => s.kind === 'paragraph' || s.kind === 'abstract');
  if (!p) return 'Untitled';
  const first = p.text.split(/[.!?]/)[0] ?? p.text;
  return first.split(/\s+/).slice(0, 8).join(' ');
}
