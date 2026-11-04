/**
 * Input → Source. Text, PDF papers, image sets and projects (folder upload, zip, GitHub URL, README).
 * Everything the user gives us is untrusted data: it is parsed, never executed; archives are size- and
 * path-checked; URLs must be public http(s).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { ingestText } from '../../core/ingest/text.ts';
import type { Source } from '../../core/schema.ts';

export interface InputFile {
  /** Name, possibly with a relative folder path ("repo/src/index.ts"). */
  name: string;
  data: Uint8Array;
}

export interface Input {
  text?: string;
  url?: string;
  title?: string;
  files?: InputFile[];
}

export const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
const IMAGE = /\.(png|jpe?g|webp|gif|bmp)$/i;
const TEXTY = /\.(md|markdown|txt|rst|text)$/i;

export function safeName(n: string): string {
  return n
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .join('/');
}

export async function ingestInput(input: Input, dir: string, signal?: AbortSignal): Promise<Source> {
  mkdirSync(dir, { recursive: true });
  const files = (input.files ?? []).map((f) => ({ ...f, name: safeName(f.name) })).filter((f) => f.name);
  const total = files.reduce((n, f) => n + f.data.length, 0);
  if (total > MAX_UPLOAD_BYTES) throw new Error(`that upload is ${(total / 1e6).toFixed(0)} MB; the limit is ${MAX_UPLOAD_BYTES / 1e6} MB`);

  if (input.url?.trim()) {
    const { ingestUrl } = await import('./url.ts');
    return ingestUrl(input.url.trim(), dir, signal);
  }
  if (files.length === 1 && extname(files[0]!.name).toLowerCase() === '.pdf') {
    const { ingestPdf } = await import('./pdf.ts');
    return ingestPdf(files[0]!.data, files[0]!.name, dir);
  }
  if (files.length && files.every((f) => IMAGE.test(f.name))) {
    const { ingestImages } = await import('./images.ts');
    return ingestImages(files, dir, input.text);
  }
  if (files.length === 1 && /\.zip$/i.test(files[0]!.name)) {
    const { ingestZip } = await import('./project.ts');
    return ingestZip(files[0]!.data, files[0]!.name, dir);
  }
  if (files.length === 1 && TEXTY.test(files[0]!.name)) {
    const text = new TextDecoder().decode(files[0]!.data);
    const src = ingestText(text, files[0]!.name, input.title);
    return /^readme/i.test(files[0]!.name.split('/').pop() ?? '') ? { ...src, kind: 'project' } : src;
  }
  if (files.length) {
    const { ingestProjectFiles } = await import('./project.ts');
    return ingestProjectFiles(files, input.title ?? files[0]!.name.split('/')[0] ?? 'project', dir);
  }
  if (input.text?.trim()) {
    writeFileSync(join(dir, 'input.txt'), input.text);
    return ingestText(input.text, 'pasted text', input.title);
  }
  throw new Error('nothing to explain: paste text, upload a file, or give a link');
}
