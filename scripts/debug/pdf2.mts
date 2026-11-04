console.log('start');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
console.log('loaded', pdfjs.version);
import { readFileSync } from 'node:fs';
const t = pdfjs.getDocument({ data: new Uint8Array(readFileSync(process.argv[2]!)) });
const d = await t.promise;
console.log('pages', d.numPages);
