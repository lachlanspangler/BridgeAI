console.error('a');
const m = await import('../../src/node/ingest/pdf.ts');
console.error('b', Object.keys(m));
