/** Caption files: WebVTT and SRT from timeline cues. */
import type { Cue } from '../schema.ts';

function ts(t: number, sep: '.' | ','): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(r, 3)}`;
}

const clean = (s: string): string => s.replace(/-->/g, '→').replace(/\r?\n/g, ' ');

export function toVtt(cues: Cue[]): string {
  return ['WEBVTT', '', ...cues.flatMap((c, i) => [`${i + 1}`, `${ts(c.start, '.')} --> ${ts(c.end, '.')}`, clean(c.text), ''])].join('\n');
}

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => [`${i + 1}`, `${ts(c.start, ',')} --> ${ts(c.end, ',')}`, clean(c.text), ''].join('\n')).join('\n');
}

/** The active cue at time t, if any. */
export function cueAt(cues: Cue[], t: number): Cue | undefined {
  // cues are sorted and non-overlapping
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid]!;
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return c;
  }
  return undefined;
}
