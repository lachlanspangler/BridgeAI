import { readFileSync } from 'node:fs';
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const d = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(process.argv[2]!)), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
console.log('doc');
const p = await d.getPage(1);
console.log('page');
const tc = await p.getTextContent();
console.log('items', tc.items.length);
