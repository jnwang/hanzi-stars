import test from 'node:test';
import assert from 'node:assert/strict';
import type { Book, Curriculum, Level, Session } from '../src/model.ts';
import { levelsFor, emptyProgress, newSession, hearCharacter, beginReading, answerReading, currentReadingCharacter, readingPassed, beginWriting, tracePassed, recallPassed, lightStar, isUnlocked, countStars, validateProgress, localDate } from '../src/engine.ts';
import { ProgressStore } from '../src/storage.ts';

function fixture(size=24):{book:Book;curriculum:Curriculum;level:Level;session:Session}{
  const chars=Array.from('天地人你我他一二三四五上下口耳目手足日月水火山石');
  const book:Book={id:'g1s1',grade:1,term:1,title:'一年级上册',edition:'test',sources:[],notes:[],characters:chars.slice(0,size).map((hanzi,i)=>({id:`c${i}`,hanzi,pinyin:'mù',word:'树木',polyphonic:false,distractors:['mò','nù','mǔ'],audio:'a.mp3',stroke:'s.json'}))};
  const curriculum={version:'test-1',books:[book]};const level=levelsFor(book)[0];return{book,curriculum,level,session:newSession(level)};
}
function learn(s:Session,l:Level):void{l.characters.forEach(c=>hearCharacter(s,c.id));beginReading(s,l,()=>.51);}
function round(s:Session,l:Level,wrong:string[]=[]):void{while(s.stage==='reading'){const c=currentReadingCharacter(s,l)!;answerReading(s,l,wrong.includes(c.id)?c.distractors[0]:c.pinyin);}}
function writeAll(s:Session,l:Level):void{while(s.stage!=='done'){tracePassed(s,l);assert.equal(recallPassed(s,l,0,false),true);}}

test('每10字一关，末关保留实际字数和首字',()=>{
  const {book}=fixture();const levels=levelsFor(book);assert.deepEqual(levels.map(l=>l.characters.length),[10,10,4]);assert.equal(levels[1].characters[0].hanzi,'五');
});
test('只复习本轮错字：10 → 2 → 1，正确字不会重考，重载后保留',()=>{
  const {book,curriculum,level,session}=fixture();const p=emptyProgress(curriculum);p.sessions[level.id]=session;
  learn(session,level);round(session,level,['c2','c4']);assert.equal(readingPassed(session,level),false);assert.throws(()=>beginWriting(session,level));
  beginReading(session,level);assert.deepEqual([...session.order].sort(),['c2','c4']);round(session,level,['c4']);
  const restored=validateProgress(JSON.parse(JSON.stringify(p)),curriculum);const s=restored.sessions[level.id];
  beginReading(s,level);assert.deepEqual(s.order,['c4']);round(s,level);assert.equal(readingPassed(s,level),true);beginWriting(s,level);
  assert.equal(lightStar(restored,s,level,book),false);
  writeAll(s,level);assert.equal(lightStar(restored,s,level,book),true);assert.equal(countStars(restored,curriculum).done,1);
});
test('第一次全对可以直接写字；未跟读不能开始测验',()=>{
  const {level,session}=fixture();assert.throws(()=>beginReading(session,level));learn(session,level);assert.equal(new Set(session.order).size,10);round(session,level);assert.equal(session.stage,'reading-result');assert.ok(readingPassed(session,level));beginWriting(session,level);assert.equal(session.stage,'trace');
});
test('提示、错误、描写均不能冒充独立书写完成',()=>{
  const {book,curriculum,level,session}=fixture();const p=emptyProgress(curriculum);learn(session,level);round(session,level);beginWriting(session,level);
  assert.throws(()=>recallPassed(session,level,0,false));tracePassed(session,level);
  assert.equal(recallPassed(session,level,1,false),false);assert.equal(recallPassed(session,level,0,true),false);assert.deepEqual(session.written,[]);assert.equal(lightStar(p,session,level,book),false);
  assert.equal(recallPassed(session,level,0,false),true);assert.equal(session.written.length,1);assert.equal(lightStar(p,session,level,book),false);
});
test('关卡按学期顺序解锁，重复通关不增加星数',()=>{
  const {book,curriculum,level,session}=fixture();const p=emptyProgress(curriculum);assert.equal(isUnlocked(p,levelsFor(book)[1],book),false);
  learn(session,level);round(session,level);beginWriting(session,level);writeAll(session,level);lightStar(p,session,level,book);lightStar(p,session,level,book);
  assert.deepEqual(p.completed.g1s1,[level.id]);assert.equal(isUnlocked(p,levelsFor(book)[1],book),true);assert.equal(isUnlocked(p,levelsFor(book)[2],book),false);assert.equal(p.days.length,1);
});
test('1字末关使用同样的认读和书写规则',()=>{
  const {level,session}=fixture(1);learn(session,level);round(session,level,['c0']);beginReading(session,level);assert.deepEqual(session.order,['c0']);round(session,level);beginWriting(session,level);writeAll(session,level);assert.equal(session.stage,'done');
});
test('中途退出保留认读答案和已通过书写的字',()=>{
  const {curriculum,level,session}=fixture();const p=emptyProgress(curriculum);p.sessions[level.id]=session;learn(session,level);
  const c=currentReadingCharacter(session,level)!;answerReading(session,level,c.distractors[0]);
  const a=validateProgress(JSON.parse(JSON.stringify(p)),curriculum);assert.equal(a.sessions[level.id].answers[0].correct,false);
  round(session,level);beginReading(session,level);round(session,level);beginWriting(session,level);tracePassed(session,level);recallPassed(session,level,0,false);
  const b=validateProgress(JSON.parse(JSON.stringify(p)),curriculum);assert.equal(b.sessions[level.id].written.length,1);assert.equal(b.sessions[level.id].stage,'trace');
});
test('拒绝跳关、篡改错题结果、未知字库和损坏备份',()=>{
  const {curriculum,level,session}=fixture();const p=emptyProgress(curriculum);p.completed.g1s1=['g1s1-1'];assert.throws(()=>validateProgress(p,curriculum));p.completed={};p.sessions[level.id]=session;
  learn(session,level);const c=currentReadingCharacter(session,level)!;answerReading(session,level,c.distractors[0]);session.answers[0].correct=true;assert.throws(()=>validateProgress(p,curriculum));
  assert.throws(()=>validateProgress({...emptyProgress(curriculum),curriculumVersion:'wrong'},curriculum));assert.throws(()=>validateProgress(null,curriculum));
});
test('写入失败明确返回失败，损坏原记录不被覆盖',()=>{
  const {curriculum}=fixture();let raw='not json';let writes=0;
  const memory={getItem:()=>raw,setItem:()=>{writes++;throw new Error('quota');}} as unknown as Storage;
  const store=new ProgressStore(curriculum,memory);const p=store.load();assert.ok(store.error);assert.equal(store.save(p),false);assert.equal(writes,0);assert.equal(raw,'not json');
  const blocked=new ProgressStore(curriculum,{getItem:()=>null,setItem:()=>{throw new Error('blocked');}} as unknown as Storage);blocked.load();assert.equal(blocked.save(emptyProgress(curriculum)),false);assert.match(blocked.error,/未保存/);
});
test('打卡按设备本地日期计算',()=>{const d=new Date(2026,10,6,0,5);assert.equal(localDate(d),'2026-11-06');});
test('有效备份恢复前保留旧记录；无效备份不改动现有记录',()=>{
  const {curriculum,level,session}=fixture();const values=new Map<string,string>();
  const memory={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);}} as unknown as Storage;
  const store=new ProgressStore(curriculum,memory);const old=emptyProgress(curriculum);store.save(old);const oldRaw=store.raw();
  const fresh=emptyProgress(curriculum);fresh.sessions[level.id]=session;learn(session,level);round(session,level,['c2']);
  const restored=store.import(JSON.stringify(fresh));assert.equal(restored.sessions[level.id].answers.length,10);assert.equal(values.get(`${store.key}:before-import`),oldRaw);
  const current=store.raw();assert.throws(()=>store.import('{"bad":true}'));assert.equal(store.raw(),current);
});
