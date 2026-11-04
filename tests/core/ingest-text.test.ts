import { describe, expect, it } from 'vitest';
import { ingestText } from '../../src/core/ingest/text.ts';
import { Source } from '../../src/core/schema.ts';

describe('ingestText', () => {
  it('reads a markdown title, abstract, headings, lists and code with line numbers', () => {
    const md = [
      '# My Paper',
      '',
      'Abstract',
      'We do a thing.',
      '',
      '## Method',
      '',
      '- step one',
      '- step two',
      '',
      '```ts',
      'const x = 1;',
      '```',
      '',
      'Final words here.',
    ].join('\n');
    const s = Source.parse(ingestText(md, 'paper.md'));
    expect(s.title).toBe('My Paper');
    const kinds = s.segments.map((x) => x.kind);
    expect(kinds).toEqual(['title', 'abstract', 'heading', 'list', 'code', 'paragraph']);
    const code = s.segments.find((x) => x.kind === 'code')!;
    expect(code.lang).toBe('ts');
    expect(code.text).toBe('const x = 1;');
    expect(s.segments.find((x) => x.kind === 'list')!.text).toBe('step one; step two');
    expect(s.segments.find((x) => x.kind === 'paragraph')!.loc.section).toEqual(['Method']);
    expect(s.segments.find((x) => x.kind === 'abstract')!.loc.lines).toEqual([4, 4]);
  });
  it('derives a title from plain text and treats a short text as an abstract', () => {
    const s = ingestText('Short title here\n\nThis is the body. It has two sentences.');
    expect(s.title).toBe('Short title here');
    expect(s.segments[1]!.kind).toBe('abstract');
  });
  it('warns on empty input', () => {
    expect(ingestText('   ').warnings).toContain('the text was empty');
  });
});
