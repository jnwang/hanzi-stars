import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pinyin, polyphonic, convert } from 'pinyin-pro';

const root=process.cwd();
const source=JSON.parse(await fs.readFile('data/curriculum-source.json','utf8'));
const supplemental=JSON.parse(await fs.readFile('data/supplemental-source.json','utf8'));
source.books.push(supplemental);
const contexts=JSON.parse(await fs.readFile('data/pronunciation-contexts.json','utf8'));
const allCharacters=[...new Set(source.books.flatMap(b=>b.orderedCharacters))];
const firstReadings={};
for(const book of source.books)for(const [c,reading] of Object.entries(book.readings||{}))firstReadings[c]??=reading;
const normalize=p=>p.trim().normalize('NFC').toLowerCase();
const legal=new Map();
for(const char of allCharacters)legal.set(char,[...new Set(polyphonic(char,{type:'array'})[0].map(normalize))]);
const coreCharacters=[...new Set(source.books.filter(b=>b.id!=='supplement').flatMap(b=>b.orderedCharacters))];
const syllables=[...new Set(coreCharacters.flatMap(c=>legal.get(c)))].sort();
const plainCache=new Map();
const plain=p=>{if(!plainCache.has(p))plainCache.set(p,convert(p,{format:'toneNone'}));return plainCache.get(p);};
const initial=p=>plain(p).match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/u)?.[0]||'';
const final=p=>plain(p).slice(initial(p).length);
const toneCache=new Map();
const tone=p=>{if(!toneCache.has(p))toneCache.set(p,convert(p,{format:'symbolToNum'}).match(/[1-4]$/)?.[0]||'0');return toneCache.get(p);};
const distractorCache=new Map();
function distance(a,b){const row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let last=row[0];row[0]=i;for(let j=1;j<=b.length;j++){const prev=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,last+(a[i-1]===b[j-1]?0:1));last=prev;}}return row[b.length];}
function distractors(char,answer){
  const key=char+answer;if(distractorCache.has(key))return distractorCache.get(key);
  const allowed=syllables.filter(p=>!legal.get(char).includes(p)&&p!==answer&&/^[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ]+$/u.test(p));
  const result=[];
  const score=p=>distance(plain(p),plain(answer))*4+(tone(p)===tone(answer)?0:1)+Math.abs(p.length-answer.length)*.2;
  const scores=new Map(allowed.map(p=>[p,score(p)]));
  const pick=predicate=>{const options=allowed.filter(p=>!result.includes(p)&&predicate(p)).sort((a,b)=>scores.get(a)-scores.get(b)||a.localeCompare(b));if(options[0])result.push(options[0]);};
  pick(p=>initial(p)===initial(answer)&&final(p)!==final(answer));
  pick(p=>initial(p)!==initial(answer)&&final(p)===final(answer));
  pick(p=>plain(p)===plain(answer));
  while(result.length<3)pick(()=>true);
  if(result.every(p=>plain(p)===plain(answer)))throw new Error(`仅声调干扰：${char}`);
  distractorCache.set(key,result);return result;
}
const sha=text=>crypto.createHash('sha256').update(text).digest('hex').slice(0,16);
const audioJobs=new Map(),missingContexts=[],unusualReadings=[],missingStrokes=[];
const books=[];
await fs.mkdir('public/strokes',{recursive:true});await fs.mkdir('public/data',{recursive:true});await fs.mkdir('public/licenses',{recursive:true});
for(const book of source.books){
  const characters=[];
  for(const hanzi of book.orderedCharacters){
    if(!/^\p{Script=Han}$/u.test(hanzi))throw new Error(`非法汉字：${book.id} ${hanzi}`);
    const reading=normalize(book.readings?.[hanzi]||firstReadings[hanzi]||pinyin(hanzi));
    if(!legal.get(hanzi).includes(reading))unusualReadings.push({book:book.id,hanzi,reading,allowed:legal.get(hanzi)});
    const word=contexts[hanzi]?.[reading]||hanzi;
    if(word===hanzi)missingContexts.push({book:book.id,hanzi,reading});
    const isPoly=legal.get(hanzi).length>1;
    const text=isPoly?`${word}。`:(word===hanzi?`${hanzi}。`:`${hanzi}。${word}。`);
    const audio=`audio/chars/${sha(text)}.mp3`;
    audioJobs.set(audio,{file:audio,text});
    const stroke=`strokes/${hanzi.codePointAt(0).toString(16)}.json`;
    try{await fs.copyFile(path.join(root,'node_modules/hanzi-writer-data',`${hanzi}.json`),path.join(root,'public',stroke));}
    catch{missingStrokes.push(hanzi);}
    characters.push({id:hanzi,hanzi,pinyin:reading,word,polyphonic:isPoly,distractors:distractors(hanzi,reading),audio,stroke});
  }
  if(new Set(characters.map(c=>c.id)).size!==characters.length)throw new Error(`册内重复：${book.id}`);
  const recognition=new Set(book.recognition),writing=new Set(book.writing);
  const coverage={recognition:recognition.size,writing:writing.size,overlap:[...writing].filter(c=>recognition.has(c)).length,printedNew:book.printedCounts?.newRecognition??null};
  books.push({id:book.id,grade:book.grade,term:book.term,title:book.title,edition:book.edition,notes:book.notes||[],sources:book.sources,characters,coverage});
}
if(unusualReadings.length)throw new Error(`未核对读音：${JSON.stringify(unusualReadings)}`);
if(missingStrokes.length)throw new Error(`缺少笔顺：${[...new Set(missingStrokes)].join('')}`);
const contentVersion=values=>`pep-${sha(JSON.stringify(values.map(b=>({id:b.id,edition:b.edition,characters:b.characters.map(c=>[c.id,c.pinyin,c.word,c.distractors])}))))}`;
const version=contentVersion(books);
// Adding a separate supplement preserves every original level's characters and IDs.
// Only that exact original content version is eligible for automatic migration.
const curriculum={version,books,legacyVersions:[contentVersion(books.filter(b=>b.id!=='supplement'))]};
await fs.writeFile('public/data/curriculum.json',JSON.stringify(curriculum));
const ui={reading:'看看这个字，选出它的拼音。','reading-pass':'这些字都认对啦。接下来写一写。','reading-retry':'我们只练刚才答错的字。',trace:'先看一遍笔顺，再跟着写。',recall:'现在把范字藏起来，听一听，自己写出来。',done:'这一关认字和写字都完成啦！点亮一颗星星。'};
for(const [id,text] of Object.entries(ui))audioJobs.set(`audio/ui/${id}.mp3`,{file:`audio/ui/${id}.mp3`,text});
await fs.writeFile('data/audio-jobs.json',JSON.stringify([...audioJobs.values()],null,2));
await fs.writeFile('data/asset-audit.json',JSON.stringify({version,books:books.map(b=>({id:b.id,characters:b.characters.length,stars:Math.ceil(b.characters.length/10)})),totalStars:books.reduce((sum,b)=>sum+Math.ceil(b.characters.length/10),0),uniqueCharacters:allCharacters.length,audioClips:audioJobs.size,missingContexts},null,2));
await fs.copyFile('node_modules/hanzi-writer-data/ARPHICPL.TXT','public/licenses/ARPHICPL.txt');
await fs.writeFile('public/licenses/THIRD-PARTY.txt','Hanzi Writer 3.7.3 — MIT — https://github.com/chanind/hanzi-writer\nHanzi Writer Data 2.0.1 — Arphic Public License — https://github.com/chanind/hanzi-writer-data\nData derived from Make Me a Hanzi: https://github.com/skishore/makemeahanzi\nPinyin Pro — MIT — https://github.com/zh-lx/pinyin-pro\n\n');
for(const pkg of ['hanzi-writer','pinyin-pro']){try{const license=await fs.readFile(`node_modules/${pkg}/LICENSE`,'utf8');await fs.appendFile('public/licenses/THIRD-PARTY.txt',`\n${pkg}\n${license}\n`);}catch{}}
console.log(JSON.stringify({version,books:books.length,characters:allCharacters.length,stars:books.reduce((n,b)=>n+Math.ceil(b.characters.length/10),0),audioClips:audioJobs.size,missingContexts:missingContexts.length}));
