/**
 * Public links → Source: arXiv (abs → pdf), any PDF, GitHub repos (archive zip), or a web article (HTML → text).
 * Only public http(s) URLs; hosts that resolve to private/loopback addresses are refused (SSRF guard).
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ingestText } from '../../core/ingest/text.ts';
import type { Source } from '../../core/schema.ts';

const MAX = 60 * 1024 * 1024;

export function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const l = ip.toLowerCase();
    return (
      l === '::1' ||
      l.startsWith('fc') ||
      l.startsWith('fd') ||
      l.startsWith('fe80') ||
      l === '::' ||
      l.startsWith('::ffff:127.') ||
      l.startsWith('::ffff:10.') ||
      l.startsWith('::ffff:192.168.')
    );
  }
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('that is not a valid link');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('only http(s) links are supported');
  if (u.username || u.password) throw new Error('links with credentials are not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateAddress))
    throw new Error('that link points to a private or local address');
  return u;
}

/** Map special sites to their raw content URL. */
export function resolveSpecial(u: URL): { kind: 'pdf' | 'github' | 'page'; url: string; name: string } {
  if (/(^|\.)arxiv\.org$/.test(u.hostname)) {
    const m = u.pathname.match(/^\/(abs|pdf|html)\/([^/?#]+?)(\.pdf)?$/);
    if (m) return { kind: 'pdf', url: `https://arxiv.org/pdf/${m[2]}`, name: `arxiv-${m[2]}.pdf` };
  }
  if (u.hostname === 'github.com') {
    const [, owner, repo, tree, ...rest] = u.pathname.split('/');
    if (owner && repo) {
      const r = repo.replace(/\.git$/, '');
      const ref = tree === 'tree' && rest.length ? rest.join('/') : 'HEAD';
      return {
        kind: 'github',
        url: `https://codeload.github.com/${owner}/${r}/zip/${ref === 'HEAD' ? 'HEAD' : `refs/heads/${ref}`}`,
        name: `${owner}/${r}`,
      };
    }
  }
  if (/\.pdf$/i.test(u.pathname)) return { kind: 'pdf', url: u.href, name: u.pathname.split('/').pop()! };
  return { kind: 'page', url: u.href, name: u.hostname + u.pathname };
}

async function fetchCapped(url: string, signal?: AbortSignal): Promise<{ data: Uint8Array; type: string }> {
  await assertPublicUrl(url);
  const res = await fetch(url, {
    signal,
    redirect: 'follow',
    headers: { 'user-agent': 'Bridge/0.1 (local explainer-video app)' },
  });
  if (!res.ok || !res.body) throw new Error(`could not fetch the link (HTTP ${res.status})`);
  await assertPublicUrl(res.url); // the redirect target must be public too
  const chunks: Uint8Array[] = [];
  let n = 0;
  for await (const c of res.body as unknown as AsyncIterable<Uint8Array>) {
    n += c.length;
    if (n > MAX) throw new Error('that download is larger than 60 MB');
    chunks.push(c);
  }
  const data = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    data.set(c, o);
    o += c.length;
  }
  return { data, type: res.headers.get('content-type') ?? '' };
}

export function htmlToMarkdown(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim();
  const main =
    html.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ??
    html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ??
    html;
  const text = main
    .replace(/<(script|style|noscript|nav|header|footer|aside|form|svg)[\s\S]*?<\/\1>/gi, '')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n')
    .replace(/<h[3-6][^>]*>([\s\S]*?)<\/h[3-6]>/gi, '\n\n### $1\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n\n```\n$1\n```\n\n')
    .replace(/<(p|div|br|tr|section)[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
  return { title, text };
}

export async function ingestUrl(raw: string, dir: string, signal?: AbortSignal): Promise<Source> {
  const u = await assertPublicUrl(raw);
  const sp = resolveSpecial(u);
  const { data, type } = await fetchCapped(sp.url, signal);
  if (sp.kind === 'pdf' || type.includes('application/pdf')) {
    const { ingestPdf } = await import('./pdf.ts');
    return { ...(await ingestPdf(data, sp.name, dir)), origin: raw };
  }
  if (sp.kind === 'github') {
    const { ingestZip } = await import('./project.ts');
    return { ...ingestZip(data, sp.name, dir), origin: raw };
  }
  const html = new TextDecoder().decode(data);
  const { title, text } = htmlToMarkdown(html);
  return { ...ingestText(text, raw, title || undefined), origin: raw };
}
