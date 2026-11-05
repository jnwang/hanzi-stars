import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { polyphonic } from 'pinyin-pro';

const curriculum = JSON.parse(await readFile(new URL('../data/curriculum-source.json', import.meta.url), 'utf8'));
const expectedRecognition = [280, 410, 460, 450, 250, 250, 250, 250, 200, 200, 0, 0];
const expectedWriting = [100, 200, 250, 250, 250, 250, 250, 250, 220, 180, 180, 120];
const expectedMerged = [280, 495, 609, 593, 428, 405, 429, 423, 359, 309, 180, 120];
const allCharacters = new Set();
let checkedReadings = 0;
let totalCharacters = 0;
let totalStars = 0;
assert.equal(curriculum.books.length, 12);

for (const [index, book] of curriculum.books.entries()) {
  assert.equal(book.id, `g${Math.floor(index / 2) + 1}s${index % 2 + 1}`);
  const items = [...book.recognitionItems, ...book.writingItems];
  const union = new Set(items.map(item => item.character));
  assert.equal(book.recognitionItems.filter(item => !item.previouslyLearnedReading).length, expectedRecognition[index], `${book.id}: printed recognition total`);
  assert.equal(book.writingItems.length, expectedWriting[index], `${book.id}: printed writing total`);
  assert.equal(book.orderedCharacters.length, expectedMerged[index], `${book.id}: merged total`);
  assert.equal(new Set(book.orderedCharacters).size, book.orderedCharacters.length);
  assert.deepEqual(new Set(book.orderedCharacters), union);
  assert.deepEqual(book.orderedCharacters, [...new Set(book.lessons.flatMap(lesson => [...lesson.recognition, ...lesson.writing]))]);
  assert.deepEqual(new Set(book.recognition), new Set(book.recognitionItems.map(item => item.character)));
  assert.deepEqual(new Set(book.writing), new Set(book.writingItems.map(item => item.character)));
  for (const item of items) {
    assert.match(item.character, /^[\u3400-\u9fff]$/u);
    assert.ok(book.lessons.some(lesson => lesson.id === item.lessonId));
    assert.ok(Number.isInteger(item.pdfPage));
    if (item.pinyin) {
      // Dictionaries are a diagnostic, not a replacement for textbook readings.
      // A future mismatch must be checked on its source page before changing it.
      const allowed = polyphonic(item.character).flatMap(readings => readings.split(' '));
      assert.ok(allowed.includes(item.pinyin), `${book.id} p${item.pdfPage} ${item.character}=${item.pinyin}; dictionary: ${allowed}`);
      checkedReadings += 1;
    }
  }
  for (const [character, reading] of Object.entries(book.readings)) {
    assert.ok(items.some(item => item.character === character && item.pinyin === reading));
  }
  book.orderedCharacters.forEach(character => allCharacters.add(character));
  totalCharacters += book.orderedCharacters.length;
  totalStars += Math.ceil(book.orderedCharacters.length / 10);
}

// Rare textbook readings confirmed visually on the original appendix pages.
assert.equal(curriculum.books.find(book => book.id === 'g3s2').readings['曾'], 'zēng');
assert.equal(curriculum.books.find(book => book.id === 'g5s1').readings['哼'], 'hng');
assert.deepEqual(curriculum.books.find(book => book.id === 'g5s2').readingVariants['呵'], ['ā', 'a']);
assert.equal(curriculum.books.find(book => book.id === 'g5s2').readings['喇'], 'lā');
assert.equal(totalCharacters, 4630);
assert.equal(totalStars, 466);
assert.equal(allCharacters.size, 2973);
console.log(`12 books verified: ${totalCharacters} book-specific characters, ${allCharacters.size} unique characters, ${totalStars} stars; ${checkedReadings} source readings checked.`);
