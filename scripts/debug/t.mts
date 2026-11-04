import { screenPhrase, numberLabel, tidyEnd } from '/Users/spanglew/Desktop/Bridge/src/core/script/extractive.ts';
console.log(screenPhrase('Safe. It uses hardware random generator. Can run across servers', 7));
console.log(screenPhrase('Nano ID is faster than crypto.randomUUID and uuid/v4 in every benchmark test.', 7));
console.log(numberLabel('Nano ID uses 126 random bits versus 122.', '126'), '|', numberLabel('It scores 28.4 BLEU on English to French.', '28.4'), '|', numberLabel('ported to over 20 programming languages', '20'));
console.log(tidyEnd('Portable. Nano ID was ported to over'));
