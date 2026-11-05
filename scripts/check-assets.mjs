import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { polyphonic, convert } from 'pinyin-pro';
const data=JSON.parse(await fs.readFile('public/data/curriculum.json','utf8'));
assert.equal(data.books.length,12);
let count=0,stars=0;
for(const book of data.books){
  assert.equal(new Set(book.characters.map(c=>c.hanzi)).size,book.characters.length,`${book.id}: duplicates`);
  assert.ok(book.edition&&book.sources.length,`${book.id}: provenance`);
  stars+=Math.ceil(book.characters.length/10);
  for(const c of book.characters){
    count++;
    const readings=polyphonic(c.hanzi,{type:'array'})[0];
    assert.ok(readings.includes(c.pinyin),`${c.hanzi}: invalid pinyin ${c.pinyin}`);
    assert.equal(new Set([c.pinyin,...c.distractors]).size,4,`${c.hanzi}: repeated choices`);
    assert.equal(c.distractors.length,3);
    assert.ok(c.distractors.every(p=>!readings.includes(p)),`${c.hanzi}: alternative legal reading in distractors`);
    assert.ok(c.distractors.some(p=>convert(p,{format:'toneNone'})!==convert(c.pinyin,{format:'toneNone'})),`${c.hanzi}: tone-only choices`);
    assert.ok(c.word.includes(c.hanzi)&&c.word.length>1,`${c.hanzi} ${c.pinyin}: missing word context`);
    const stroke=JSON.parse(await fs.readFile(`public/${c.stroke}`,'utf8'));
    assert.ok(stroke.strokes.length&&stroke.strokes.length===stroke.medians.length,`${c.hanzi}: invalid strokes`);
    assert.ok((await fs.stat(`public/${c.audio}`)).size>500,`${c.hanzi}: missing audio`);
  }
}
for(const key of ['reading','reading-pass','reading-retry','trace','recall','done'])assert.ok((await fs.stat(`public/audio/ui/${key}.mp3`)).size>500);
console.log(`Assets verified: ${data.books.length} books, ${count} character positions, ${stars} stars; readings, choices, contexts, strokes and audio checked.`);
