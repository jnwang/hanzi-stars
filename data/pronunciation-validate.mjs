import fs from 'node:fs';
import { pinyin, polyphonic } from 'pinyin-pro';

const read = (name) => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'));
const source = read('./curriculum-source.json');
const contexts = read('./pronunciation-contexts.json');
const selected = new Map();
const all = new Map();

for (const book of source.books) {
  for (const character of book.orderedCharacters) {
    const reading = book.readings[character] || pinyin(character, { toneSandhi: false });
    selected.set(`${character}|${reading}`, { character, reading });
    all.set(`${character}|${reading}`, { character, reading });
  }
  for (const item of [...book.recognitionItems, ...book.writingItems]) {
    if (item.pinyin) all.set(`${item.character}|${item.pinyin}`, { character: item.character, reading: item.pinyin });
  }
}

const missing = [...all.values()].filter(({ character, reading }) => !contexts[character]?.[reading]);
const clues = new Map();
for (const { character, reading } of all.values()) {
  const context = contexts[character]?.[reading];
  if (!context) continue;
  const key = `${reading}|${context.replaceAll(character, '□')}`;
  if (!clues.has(key)) clues.set(key, new Set());
  clues.get(key).add(character);
}
const ambiguousClues = [...clues].filter(([, characters]) => characters.size > 1)
  .map(([clue, characters]) => ({ clue, characters: [...characters] }));
const invalid = [];
for (const [character, readings] of Object.entries(contexts)) {
  const allowed = polyphonic(character, { type: 'array' })[0];
  for (const [reading, context] of Object.entries(readings)) {
    if (!allowed.includes(reading)) invalid.push({ character, reading, context, reason: 'unknown-character-reading' });
    if (typeof context !== 'string' || !context.includes(character)) invalid.push({ character, reading, context, reason: 'missing-target-character' });
  }
}

// Phrase readings returned by a general-purpose library are diagnostic only.
// Textbook readings, polyphonic context, neutral tones and tone sandhi need human review.
const phraseDifferences = [...all.values()].flatMap(({ character, reading }) => {
  const context = contexts[character]?.[reading];
  if (!context) return [];
  const inferred = pinyin(context, { type: 'array', toneSandhi: false })[[...context].indexOf(character)];
  return inferred === reading ? [] : [{ character, reading, context, inferred }];
});

const result = {
  selectedCharacterReadings: selected.size,
  allTextbookCharacterReadings: all.size,
  contextCharacters: Object.keys(contexts).length,
  contextReadings: Object.values(contexts).reduce((sum, readings) => sum + Object.keys(readings).length, 0),
  missing,
  invalid,
  ambiguousClues,
  phraseDifferences,
};
console.log(JSON.stringify(result, null, 2));
if (missing.length || invalid.length || ambiguousClues.length) process.exitCode = 1;
