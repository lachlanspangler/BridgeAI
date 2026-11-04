import { ingestInput } from '../../src/node/ingest/index.ts';
const s = await ingestInput({ url: process.argv[2] }, '/tmp/bridge-proj');
console.log(s.kind, s.title, s.segments.length, s.stats, s.warnings);
for (const x of s.segments.slice(0, 30)) console.log(x.id, x.kind, x.loc.file ?? '', '|', x.text.slice(0, 120).replace(/\n/g, ' ⏎ '));
