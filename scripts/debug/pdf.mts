import { readFileSync } from 'node:fs';
import { ingestPdf } from '../../src/node/ingest/pdf.ts';
const t0 = performance.now();
const s = await ingestPdf(readFileSync(process.argv[2]!), 'paper.pdf', '/tmp/bridge-pdf');
console.log('ms', Math.round(performance.now() - t0), 'title:', s.title, 'segs', s.segments.length, 'words', s.stats.words, 'assets', s.assets.length, s.warnings);
for (const x of s.segments.slice(0, 40)) console.log(x.id, x.kind, x.loc.page, (x.loc.section ?? []).join('/').slice(0, 25), '|', x.text.slice(0, 110));
for (const a of s.assets) console.log(a.id, a.width, a.height, a.caption?.slice(0, 60));
