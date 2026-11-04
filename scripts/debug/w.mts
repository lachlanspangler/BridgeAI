import { readFileSync } from 'node:fs';
import { whatIsIt, trimSentence, thirdPerson } from '../../src/core/script/extractive.ts';
for (const c of ['mixtral-pdf', 'humanize-repo']) {
  const src = JSON.parse(readFileSync(`${process.env.HOME}/.bridge/evals/${c}/run-20/source.json`, 'utf8'));
  const d = whatIsIt(src);
  console.log(c, '→', d?.text);
  if (d) console.log('   said:', thirdPerson(trimSentence(d.text, 20)));
  console.log('   lead:', src.segments.filter((s: {kind:string}) => s.kind === 'abstract' || s.kind === 'paragraph').slice(0, 5).map((s: {text:string}) => s.text.slice(0, 70)));
}
