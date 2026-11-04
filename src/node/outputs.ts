/** Human-facing outputs: the source map (claim → source segment → page/lines) and the script as Markdown. */
import type { FaithReport, Script, Source, Timeline } from '../core/schema.ts';

export interface SourceMapEntry {
  beatId: string;
  start: number;
  end: number;
  narration: string;
  claims: {
    text: string;
    kind: string;
    verdict: string;
    sources: {
      segmentId: string;
      page?: number;
      lines?: [number, number];
      file?: string;
      section?: string;
      excerpt: string;
    }[];
  }[];
}

export function buildSourceMap(
  script: Script,
  tl: Timeline,
  src: Source,
  faith: FaithReport,
): { schema: string; origin: string; title: string; entries: SourceMapEntry[] } {
  const byId = new Map(src.segments.map((s) => [s.id, s]));
  return {
    schema: 'bridge.sourcemap/1',
    origin: src.origin,
    title: src.title,
    entries: script.beats.map((b, i) => {
      const tb = tl.beats[i];
      return {
        beatId: b.id,
        start: tb?.start ?? 0,
        end: tb?.end ?? 0,
        narration: b.narration,
        claims: b.claims.map((c) => ({
          text: c.text,
          kind: c.kind,
          verdict:
            faith.verdicts.find((v) => v.beatId === b.id && v.claim === c.text)?.verdict ??
            faith.verdicts.find((v) => v.claim === c.text)?.verdict ??
            (c.kind === 'framing' ? 'framing' : 'unchecked'),
          sources: c.support.map((id) => {
            const s = byId.get(id);
            return {
              segmentId: id,
              page: s?.loc.page,
              lines: s?.loc.lines,
              file: s?.loc.file,
              section: s?.loc.section?.join(' › '),
              excerpt: (s?.text ?? '').slice(0, 400),
            };
          }),
        })),
      };
    }),
  };
}

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function scriptMarkdown(script: Script, tl: Timeline, src: Source): string {
  const out = [
    `# ${script.title}`,
    '',
    `_${tl.duration.toFixed(1)} s · source: ${src.origin} · engine: ${script.engine}_`,
    '',
  ];
  script.beats.forEach((b, i) => {
    const tb = tl.beats[i];
    const where = b.claims
      .flatMap((c) => c.support)
      .map((id) => {
        const s = src.segments.find((x) => x.id === id);
        return s?.loc.page
          ? `p.${s.loc.page}`
          : s?.loc.lines
            ? `${s.loc.file ? `${s.loc.file}:` : 'l.'}${s.loc.lines[0]}`
            : id;
      });
    out.push(`**${mmss(tb?.start ?? 0)}** · _${b.role}_ · ${b.visual.type}  `);
    out.push(`${b.narration}${where.length ? ` <sub>[${[...new Set(where)].join(', ')}]</sub>` : ''}`, '');
  });
  return out.join('\n');
}
