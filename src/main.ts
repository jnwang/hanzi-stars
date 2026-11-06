import HanziWriter from 'hanzi-writer';
import './style.css';
import type { Book, Character, Curriculum, Level, Progress, Session } from './model.ts';
import { allHeard, answerReading, beginReading, beginWriting, bookComplete, countStars, currentReadingCharacter, currentWritingCharacter, hearCharacter, isComplete, isUnlocked, levelsFor, lightStar, localDate, markPractice, newSession, readingPassed, recallPassed, tracePassed, validateProgress } from './engine.ts';
import { ProgressStore } from './storage.ts';
import { AudioCancelled, Voice } from './audio.ts';
import { GitHubSync, SYNC_KEY } from './github-sync.ts';
import { mergeProgress, progressFingerprint } from './sync-merge.ts';

const app = document.querySelector<HTMLDivElement>('#app')!;
const base = new URL(import.meta.env.BASE_URL, document.baseURI).href;
const voice = new Voice(base);
const gradeNames = ['一','二','三','四','五','六'];
let curriculum: Curriculum, progress: Progress, store: ProgressStore;
let sync: GitHubSync, pendingCloud: Progress | null = null;
let generation = 0;
let writer: HanziWriter | null = null;
let writerResize: ResizeObserver | null = null;
let feedback: { character: Character; selected: string; correct: boolean; choices: string[] } | null = null;
let writeMistakes = 0, usedHint = false, writeFinished = false, writeBusy = false, writeRecorded = false;
let followSequence = 0;
let current: { book: Book; level: Level; session: Session } | null = null;
const strokeCache = new Map<string, Promise<any>>();

const escape = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icon = (name: 'back'|'sound'|'settings'|'check'|'lock'|'download'|'upload') => {
  const paths = { back:'<path d="m14 6-6 6 6 6"/>', sound:'<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>', settings:'<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/>', check:'<path d="m5 12 4 4L19 6"/>', lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>', download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>' };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};
function star(letter = '', cls = ''): string {
  return `<svg class="star ${cls}" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 5 63 32 93 36 71 57 77 88 50 73 23 88 29 57 7 36 37 32Z"/><text x="50" y="57" text-anchor="middle">${escape(letter)}</text></svg>`;
}
function go(hash: string): void { if (location.hash === hash) render(); else location.hash = hash; }
function commit(): void { if(store.save(progress))sync?.schedule(); updateSaveNotice(); }
function receiveCloud(cloud:Progress):void{
  if(store.error)throw new Error('本机记录暂时无法保存，请先处理保存提示。');
  const merged=mergeProgress(progress,cloud,curriculum);
  if(current){
    // Finish the question or handwritten stroke without changing the visible attempt.
    pendingCloud=structuredClone(merged);
    merged.sessions[current.level.id]=current.session;
    merged.lastLevel=current.level.id;
  }
  if(progressFingerprint(merged)!==progressFingerprint(progress)){
    store.receive(merged);progress=merged;
    if(!current&&location.hash!=='#/sync')render();
  }
}
function applyPendingCloud():void{
  if(!pendingCloud||store.error)return;
  const merged=mergeProgress(progress,pendingCloud,curriculum);
  store.receive(merged);progress=merged;pendingCloud=null;
}
function updateSyncStatus():void{
  if(!sync)return;
  const status=sync.status;
  document.querySelectorAll<HTMLElement>('[data-sync-message]').forEach(el=>{el.textContent=status.message;});
  document.querySelectorAll<HTMLElement>('[data-sync-last]').forEach(el=>{el.textContent=status.lastSynced?`最近同步：${new Date(status.lastSynced).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`:'';});
  const strip=document.querySelector<HTMLElement>('#sync-strip');
  if(strip){strip.hidden=!sync.connected;strip.dataset.state=store.error?'error':status.state;strip.textContent=store.error?'保存未完成':status.state==='synced'?'已同步':status.state==='syncing'?'正在同步…':'已存本机 · 待同步';}
  document.querySelectorAll<HTMLButtonElement>('[data-action="sync-now"]').forEach(b=>{b.disabled=status.state==='syncing';});
}
function updateSaveNotice(): void {
  const el = document.querySelector<HTMLElement>('#save-notice');
  if (el) { el.textContent = store.error; el.hidden = !store.error; }
  updateSyncStatus();
}
function notice(message: string): void {
  const el = document.querySelector<HTMLElement>('#notice');
  if (el) { el.textContent = message; el.hidden = false; }
}
async function speak(file: string): Promise<void> {
  try { await voice.play(file); }
  catch (error) { if (!(error instanceof AudioCancelled)) notice(error instanceof Error ? error.message : '请再点一次喇叭。'); }
}
function chrome(title: string, back?: string, right = ''): string {
  return `<header class="topbar"><div class="top-left">${back ? `<button class="icon-button" data-go="${back}" aria-label="返回">${icon('back')}</button>` : `<a class="brand" href="#/">${star()}<span>汉字星星</span></a>`}</div>${title ? `<h1>${escape(title)}</h1>` : '<span></span>'}<div class="top-right">${right}</div></header><div id="sync-strip" class="sync-strip" role="status" hidden></div><div id="save-notice" class="notice warning" role="alert" hidden></div><div id="notice" class="notice" role="status" hidden></div>`;
}
function soundButton(): string { return `<button class="icon-button sound-button" data-action="sound" aria-label="听语音提示">${icon('sound')}</button>`; }
function tally(book?: Book): string {
  const stars = book ? levelsFor(book) : curriculum.books.flatMap(levelsFor);
  const done = stars.filter(level => isComplete(progress, level)).length;
  return `<span class="tally" aria-label="已点亮 ${done} 颗，共 ${stars.length} 颗">${star('', 'mini')}<strong>${done}</strong><span>/ ${stars.length}</span></span>`;
}
function home(): void {
  const {done,total} = countStars(progress, curriculum);
  app.innerHTML = `${chrome('', undefined, `<button class="icon-button" data-go="#/records" aria-label="学习记录与备份">${icon('settings')}</button>`)}<main class="home page"><div class="home-summary"><span class="eyebrow">我的汉字星空</span><div class="big-tally">${star('', 'gold')}<strong>${done}</strong><span>/ ${total}</span></div><p>选一个年级，开始吧</p></div><div class="grade-grid">${gradeNames.map((name,i) => {
    const books = curriculum.books.filter(b => b.grade === i + 1);
    const upper = books.find(b => b.term === 1), lower = books.find(b => b.term === 2);
    const up = upper && bookComplete(progress,upper), down = lower && bookComplete(progress,lower);
    const levels = books.flatMap(levelsFor), done = levels.filter(l=>isComplete(progress,l)).length;
    return `<button class="grade-card ${up&&down?'complete':''}" data-go="#/grade/${i+1}" aria-label="${name}年级，上学期${up?'完成':'未完成'}，下学期${down?'完成':'未完成'}"><span class="grade-medal"><span class="half upper ${up?'lit':''}"></span><span class="half lower ${down?'lit':''}"></span><span class="grade-glyph">${name}</span></span><span class="grade-name">${name}年级</span><span class="card-count">${done} / ${levels.length}</span></button>`;
  }).join('')}</div>${progress.lastLevel && findLevel(progress.lastLevel) ? `<button class="resume-button" data-action="resume">继续上次的练习 <span>→</span></button>`:''}<div class="home-foot">${progress.days.includes(localDate())?`${icon('check')} 今天来过啦`:'每天一点，慢慢点亮'}</div></main>`;
  const supplement=curriculum.books.find(b=>b.id==='supplement');
  if(supplement)app.querySelector('.grade-grid')?.insertAdjacentHTML('afterend',`<button class="supplement-entry" data-go="#/book/${supplement.id}"><span>补充字</span><span>${supplement.characters.length} 字</span>${tally(supplement)}</button>`);
}
function yearPage(grade: number): void {
  const books = curriculum.books.filter(b=>b.grade===grade);
  app.innerHTML = `${chrome(`${gradeNames[grade-1]}年级`,'#/')}<main class="page semester-page"><div class="semester-grid">${books.map(book=>`<button class="semester-card ${bookComplete(progress,book)?'complete':''}" data-go="#/book/${book.id}"><span class="semester-symbol">${book.term===1?'上':'下'}</span><span class="semester-title">${book.term===1?'上学期':'下学期'}</span>${tally(book)}</button>`).join('')}</div></main>`;
}
function mapPage(book: Book): void {
  const levels=levelsFor(book);
  app.innerHTML = `${chrome(book.grade===0?book.title:`${gradeNames[book.grade-1]}年级 · ${book.term===1?'上':'下'}学期`,book.grade===0?'#/':`#/grade/${book.grade}`,tally(book))}<main class="page constellation"><div class="star-grid">${levels.map(level=>{
    const done=isComplete(progress,level), unlocked=isUnlocked(progress,level,book), active=!done&&unlocked;
    return `<button class="star-button ${done?'done':active?'next':'locked'}" data-go="#/level/${book.id}/${level.index}" ${unlocked?'':'disabled'} aria-label="第 ${level.index+1} 关，${escape(level.characters[0].hanzi)}，${level.characters.length} 个字，${done?'已点亮，可复习':active?'可以开始':'尚未解锁'}">${star(level.characters[0].hanzi)}${active?'<span class="active-dot" aria-hidden="true"></span>':''}${!unlocked?`<span class="lock-mark">${icon('lock')}</span>`:''}</button>`;
  }).join('')}</div></main>`;
}
function findLevel(id: string): {book:Book;level:Level} | undefined {
  for(const book of curriculum.books){const level=levelsFor(book).find(l=>l.id===id);if(level)return{book,level};}
}
function getContext(book: Book, level: Level): {book:Book;level:Level;session:Session} {
  let session=progress.sessions[level.id];
  if(!session){session=newSession(level);progress.sessions[level.id]=session;}
  progress.lastLevel=level.id;commit();return{book,level,session};
}
function learningHeader(label:string,book:Book, counter=''):string{return chrome(label,`#/book/${book.id}`,`<span class="step-counter">${counter}</span>${soundButton()}`);}
function previewPage(book:Book,level:Level,session:Session):void{
  app.innerHTML=`${learningHeader('认一认',book)}<main class="page learning preview-page"><div class="character-grid">${level.characters.map(c=>`<button class="character-card ${session.heard.includes(c.id)?'heard':''}" data-character="${escape(c.id)}" aria-label="${escape(c.hanzi)}，${escape(c.pinyin)}，点一下听读音"><span class="pinyin">${escape(c.pinyin)}</span><span class="hanzi">${escape(c.hanzi)}</span><span class="heard-mark">${icon('check')}</span></button>`).join('')}</div><div class="action-area"><button class="primary" data-action="${allHeard(session,level)?'begin-reading':'follow'}">${allHeard(session,level)?'开始':'跟读一遍'}</button><p class="quiet" id="follow-status">${allHeard(session,level)?'准备好，就开始吧':'点一个字，也可以听'}</p></div></main>`;
}
async function follow():Promise<void>{
  if(!current)return;const {session,level}=current;const run=++followSequence,token=generation;
  const button=app.querySelector<HTMLButtonElement>('[data-action="follow"]');
  if(button){button.disabled=true;button.textContent='跟我读';}
  try{
    for(const c of level.characters){
      if(run!==followSequence||token!==generation)return;
      highlightCharacter(c.id);
      await voice.play(c.audio);
      if(run!==followSequence||token!==generation)return;
      hearCharacter(session,c.id);markPractice(progress);commit();markHeard(c.id);
    }
    if(token===generation)render();
  }catch(error){if(!(error instanceof AudioCancelled)&&token===generation)notice(error instanceof Error?error.message:'声音暂时无法播放。');}
  finally{if(button?.isConnected){button.disabled=false;button.textContent='继续跟读';}highlightCharacter('');}
}
function highlightCharacter(id:string):void{app.querySelectorAll<HTMLElement>('[data-character]').forEach(el=>el.classList.toggle('speaking',el.dataset.character===id));}
function markHeard(id:string):void{app.querySelectorAll<HTMLElement>('[data-character]').forEach(el=>{if(el.dataset.character===id)el.classList.add('heard');});}
async function readOne(id:string):Promise<void>{
  if(!current)return;const {level,session}=current;const c=level.characters.find(c=>c.id===id);if(!c)return;
  ++followSequence;const token=generation;highlightCharacter(id);
  try{await voice.play(c.audio);if(token!==generation)return;hearCharacter(session,id);markPractice(progress);commit();if(allHeard(session,level))render();else markHeard(id);}
  catch(error){if(!(error instanceof AudioCancelled)&&token===generation)notice(error instanceof Error?error.message:'请重试听音。');}
  finally{if(token===generation)highlightCharacter('');}
}
function quizPage(book:Book,level:Level,session:Session):void{
  const c=feedback?.character || currentReadingCharacter(session,level);if(!c){readingResult(book,level,session);return;}
  const choices=feedback?.choices||session.choices[c.id];
  const number=feedback?session.answers.length:session.answers.length+1;
  app.innerHTML=`${learningHeader('选拼音',book,`${number} / ${session.order.length}`)}<main class="page learning quiz-page"><div class="quiz-word"><div class="question-hanzi">${escape(c.hanzi)}</div>${c.polyphonic?`<div class="context-word">${escape(c.word)}</div>`:''}</div><div class="choice-grid">${choices.map(choice=>`<button class="pinyin-choice ${feedback?(choice===c.pinyin?'correct':choice===feedback.selected?'incorrect':'quiet-choice'):''}" data-answer="${escape(choice)}" ${feedback?'disabled':''}>${escape(choice)}${feedback&&choice===c.pinyin?icon('check'):''}</button>`).join('')}</div><div class="answer-feedback" role="status">${feedback?(feedback.correct?'选对啦！':`记住它，读 ${escape(c.pinyin)}`):''}</div>${feedback?`<button class="primary" data-action="next-question">${session.answers.length===session.order.length?'这一轮完成':'下一个'}</button>`:''}</main>`;
}
function readingResult(book:Book,level:Level,session:Session):void{
  const pass=readingPassed(session,level),count=session.answers.filter(a=>a.correct).length;
  app.innerHTML=`${learningHeader('认读完成',book)}<main class="page learning result-page"><div class="result-symbol ${pass?'success':''}">${pass?icon('check'):'↻'}</div><h2>${pass?'全部认对啦':'再认一认'}</h2><p class="score">${count}<span> / ${session.order.length}</span></p>${!pass?`<div class="retry-words">${session.answers.filter(a=>!a.correct).map(a=>{const c=level.characters.find(c=>c.id===a.id)!;return`<button data-read-answer="${escape(c.id)}"><span>${escape(c.pinyin)}</span><b>${escape(c.hanzi)}</b></button>`;}).join('')}</div>`:''}<button class="primary" data-action="${pass?'begin-writing':'retry-reading'}">${pass?'写一写':'再练这几个字'}</button>${!pass?'<p class="quiet">只练答错的字，认会了就写字</p>':''}</main>`;
}
function writingPage(book:Book,level:Level,session:Session):void{
  const c=currentWritingCharacter(session,level);if(!c){donePage(book,level);return;}
  const recall=session.stage==='recall';
  writeMistakes=0;usedHint=false;writeFinished=false;writeBusy=true;writeRecorded=false;
  app.innerHTML=`${learningHeader(recall?'自己写':'跟着写',book,`${session.written.length+1} / ${level.characters.length}`)}<main class="page learning writing-page"><div class="writing-prompt"><span class="writing-pinyin">${escape(c.pinyin)}</span>${c.word !== c.hanzi ? `<span class="writing-word">${escape(recall ? c.word.replaceAll(c.hanzi,'□') : c.word)}</span>` : ''}</div><div class="writing-board"><div class="grid-lines" aria-hidden="true"></div><div id="writer" aria-label="${recall?'根据读音独立书写':'跟写'}汉字的田字格"></div><div id="writer-loading" class="writer-loading">准备笔画…</div></div><div class="writing-feedback" id="writing-feedback" role="status">${recall?'听读音，自己写出来':'看一遍，再跟着写'}</div><div class="writing-tools"><button class="text-button" data-action="hint" disabled>帮帮我</button><button class="text-button" data-action="rewrite" disabled>重写</button></div><button class="primary" id="writing-next" data-action="writing-next" hidden></button></main>`;
  void setupWriter(c,recall,generation);
}
async function getStroke(c:Character):Promise<any>{
  if(!strokeCache.has(c.hanzi))strokeCache.set(c.hanzi,fetch(new URL(c.stroke,base)).then(r=>{if(!r.ok)throw new Error('笔顺暂时没打开，请点“重试”。');return r.json();}).catch(error=>{strokeCache.delete(c.hanzi);throw error;}));
  return strokeCache.get(c.hanzi)!;
}
function writeText(message:string):void{const el=document.querySelector('#writing-feedback');if(el)el.textContent=message;}
function writingControls(enabled:boolean):void{app.querySelectorAll<HTMLButtonElement>('.writing-tools button').forEach(b=>b.disabled=!enabled);}
async function setupWriter(c:Character,recall:boolean,token:number):Promise<void>{
  try{
    const data=await getStroke(c);if(token!==generation)return;
    const target=document.querySelector<HTMLElement>('#writer')!,size=target.getBoundingClientRect().width;
    writer=HanziWriter.create(target,c.hanzi,{width:size,height:size,padding:20,showCharacter:false,showOutline:!recall,strokeColor:'#294d39',outlineColor:'#e0e8d9',drawingColor:'#294d39',highlightColor:'#c2852d',drawingWidth:9,strokeAnimationSpeed:1.2,delayBetweenStrokes:220,showHintAfterMisses:false,highlightOnComplete:false,acceptBackwardsStrokes:false,markStrokeCorrectAfterMisses:false,leniency:1,charDataLoader:()=>data});
    let currentSize=size;
    writerResize=new ResizeObserver(()=>{
      if(token!==generation||!writer)return;
      const nextSize=target.getBoundingClientRect().width;
      if(nextSize>0&&Math.abs(nextSize-currentSize)>0.5){currentSize=nextSize;writer.updateDimensions({width:nextSize,height:nextSize});}
    });
    writerResize.observe(target);
    document.querySelector('#writer-loading')?.remove();
    if(!recall){await writer.animateCharacter();if(token!==generation)return;await writer.hideCharacter();}
    if(token!==generation)return;
    writeBusy=false;writingControls(true);writeText(recall?'自己写，慢慢来':'现在轮到你啦');
    void writer.quiz({showHintAfterMisses:false,acceptBackwardsStrokes:false,markStrokeCorrectAfterMisses:false,highlightOnComplete:false,onMistake:()=>{
      if(token!==generation)return;writeMistakes++;writeText('这一笔再试试');
    },onCorrectStroke:()=>{if(token===generation)writeText('继续写');},onComplete:(result)=>{
      if(token!==generation)return;writeMistakes=Math.max(writeMistakes,result.totalMistakes);writeFinished=true;writingControls(false);
      const next=document.querySelector<HTMLButtonElement>('#writing-next')!;next.hidden=false;
      const pass=!recall||(!usedHint&&writeMistakes===0);
      next.textContent=!recall?'自己写一遍':pass?(current!.session.written.length+1===current!.level.characters.length?'看看星星':'下一个字'):'再独立写一次';
      if(pass&&current){const {session,level,book}=current;if(!recall)tracePassed(session,level);else recallPassed(session,level,0,false);writeRecorded=true;markPractice(progress);if(session.stage==='done')lightStar(progress,session,level,book);commit();}
      writeText(pass?'写好啦！':'练过了，再自己写一遍');
    }});
  }catch(error){if(token!==generation)return;writeBusy=false;document.querySelector('#writer-loading')?.remove();writeText(error instanceof Error?error.message:'笔顺暂时无法打开');const b=document.querySelector<HTMLButtonElement>('[data-action="rewrite"]');if(b){b.disabled=false;b.textContent='重试';}}
}
async function hint():Promise<void>{
  if(!writer||writeBusy||writeFinished)return;usedHint=true;writeBusy=true;writingControls(false);const token=generation;
  writer.cancelQuiz();writeText('看一遍，等会儿再自己写');
  await writer.animateCharacter();if(token!==generation)return;
  // A hint always returns to an unscored guided attempt. The next independent attempt must start fresh.
  if(current){current.session.stage='trace';commit();render();}
}
function nextWriting():void{
  if(!current||!writeFinished)return;const {session,level,book}=current;
  if(!writeRecorded){if(session.stage==='trace')tracePassed(session,level);
  else if(session.stage==='recall')recallPassed(session,level,writeMistakes,usedHint);}
  markPractice(progress);
  if(session.stage==='done')lightStar(progress,session,level,book);
  commit();render();
  if(session.stage==='recall')void speak(currentWritingCharacter(session,level)!.audio);
  else if(session.stage==='done')void speak('audio/ui/done.mp3');
}
function donePage(book:Book,level:Level):void{
  const next=levelsFor(book)[level.index+1];
  app.innerHTML=`${learningHeader('点亮啦',book)}<main class="page learning result-page"><div class="celebration-star">${star(level.characters[0].hanzi,'gold')}</div><h2>又亮了一颗</h2><div class="result-total">${tally(book)}</div><button class="primary" data-go="${next?`#/level/${book.id}/${next.index}`:`#/book/${book.id}`}">${next?'下一颗':'看看我的星星'}</button><button class="text-button review-button" data-action="review">再练一遍</button></main>`;
}
function recordsPage():void{
  const {done,total}=countStars(progress,curriculum);
  app.innerHTML=`${chrome('学习记录','#/')}<main class="page records-page"><div class="record-summary"><div><strong>${done} <small>/ ${total}</small></strong><span>已点亮星星</span></div><div><strong>${progress.days.length}</strong><span>练习天数</span></div></div><div class="backup-actions"><button class="secondary" data-action="export">${icon('download')} 导出备份</button><button class="secondary" data-action="import">${icon('upload')} 导入备份</button><input type="file" id="backup-file" accept="application/json,.json" hidden /></div><p class="record-note">进度保存在这台设备的当前浏览器中。清理浏览器数据前，请先导出备份。</p>${store.error?'<button class="text-button" data-action="export-original">导出原始记录</button>':''}<details class="record-details"><summary>教材版本与字库</summary><p>每册合并识字表和写字表，按来源顺序在册内去重。星星表示已完成本关的屏幕练习，纸笔书写还需要在作业中运用。</p>${curriculum.books.map(b=>`<section><h3>${escape(b.title)}</h3><p>${escape(b.edition)} · ${b.characters.length} 字 · ${levelsFor(b).length} 颗星</p>${b.notes.map(n=>`<p>${escape(n)}</p>`).join('')}${b.sources.map(s=>`<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title||'字表来源')}</a>`).join(' · ')}</section>`).join('')}</details><details class="record-details"><summary>关于汉字星星</summary><p>认读答错的字会单独复习；全部认会，并在跟写后无提示独立写对，本关才会点亮。学过的星星可以重复复习，不会重复计数。</p><p>字形与笔顺使用 Hanzi Writer / Make Me a Hanzi 数据。<a href="${base}licenses/ARPHICPL.txt" target="_blank" rel="noopener">数据许可</a> · <a href="${base}licenses/THIRD-PARTY.txt" target="_blank" rel="noopener">开源说明</a></p><p>字库版本：${escape(curriculum.version)}</p></details></main>`;
}
function render():void{
  generation++;followSequence++;voice.stop();writerResize?.disconnect();writerResize=null;writer?.cancelQuiz();writer=null;current=null;
  const parts=(location.hash||'#/').slice(1).split('/').filter(Boolean);
  if(parts[0]==='grade'&&/^[1-6]$/.test(parts[1]||''))yearPage(Number(parts[1]));
  else if(parts[0]==='book'){
    const book=curriculum.books.find(b=>b.id===parts[1]);if(book)mapPage(book);else home();
  }else if(parts[0]==='level'){
    const book=curriculum.books.find(b=>b.id===parts[1]);const index=Number(parts[2]);const level=book&&levelsFor(book)[index];
    if(!book||!level||!Number.isInteger(index)){home();return;}
    if(!isUnlocked(progress,level,book)){mapPage(book);notice('先点亮前面的星星，再来这里。');return;}
    current=getContext(book,level);const session=current.session;
    if(feedback)quizPage(book,level,session);
    else if(session.stage==='preview')previewPage(book,level,session);
    else if(session.stage==='reading')quizPage(book,level,session);
    else if(session.stage==='reading-result')readingResult(book,level,session);
    else if(session.stage==='trace'||session.stage==='recall')writingPage(book,level,session);
    else {lightStar(progress,session,level,book);commit();donePage(book,level);}
  }else if(parts[0]==='records'){
    recordsPage();
    app.querySelector('.record-summary')?.insertAdjacentHTML('afterend',`<button class="sync-entry" data-go="#/sync"><span><strong>跨设备同步</strong><small data-sync-message></small></span><span aria-hidden="true">→</span></button>`);
    const note=app.querySelector('.record-note');if(note)note.textContent='进度自动保存在本机。连接 GitHub 私有仓库后，可在 iPad 和其他设备之间同步。';
    app.querySelector('.record-details')?.insertAdjacentHTML('beforebegin',coverageDetails());
  }else if(parts[0]==='sync')syncPage();else home();
  updateSaveNotice();updateSyncStatus();window.scrollTo({top:0,behavior:'instant'});
}

function coverageDetails():string{
  const rows=curriculum.books.map(book=>{
    const c=book.coverage;
    return `<tr><th scope="row">${escape(book.title)}</th><td>${c?c.recognition:'—'}</td><td>${c?c.writing:'—'}</td><td>${c?c.overlap:'—'}</td><td>${book.characters.length}</td><td>${levelsFor(book).length}</td></tr>`;
  }).join('');
  return `<details class="record-details"><summary>为什么各年级的字数不同？</summary><p>这里统计每册识字表与写字表合并后的练习字数，不是该年级累计应掌握的汉字总量。同一汉字在同册只算一次，跨册保留复习。</p><div class="coverage-scroll"><table class="coverage-table"><thead><tr><th>册别</th><th>识字表</th><th>写字表</th><th>重合</th><th>合并</th><th>星星</th></tr></thead><tbody>${rows}</tbody></table></div><p>识字表列数已含蓝色复习字，并按汉字去重，因此可能大于书末标注的“新字”数量。合并数＝识字表＋写字表－两表重合。</p><p>现有六年级两册没有识字表，写字表分别为180字、120字。它们没有重复列出低年级已经学过的全部汉字。</p><p>另设「补充字」58字、6颗星，补齐新旧版混用后缺少的已核验旧版字。现在共覆盖3,031个不同汉字、472颗星；原关卡与学习进度保留。</p><p><strong>核验范围：</strong>已逐字核对当前十二份教材及旧版一至三年级字表，覆盖这些来源的全部汉字。四至六年级仍使用旧版，尚未完成2026修订版全套核验。</p><a href="https://github.com/jnwang/hanzi-stars/blob/main/data/CURRICULUM-AUDIT.md" target="_blank" rel="noopener noreferrer">查看核验报告与来源</a></details>`;
}

function syncPage():void{
  const connected=sync.connected;
  const repository=sync.repository||'jnwang/hanzi-stars-progress';
  app.innerHTML=`${chrome('家长设置','#/records')}<main class="page sync-page">
    <section class="sync-card"><h2>在别的设备接着学</h2><p>连接一次，以后自动同步。</p>
      <div class="sync-status" role="status"><strong data-sync-message></strong><small data-sync-last></small></div>
      ${connected?`<p class="sync-repository">${escape(repository)}</p><button class="primary" data-action="sync-now">立即同步</button><p class="sync-note">换设备前，确认页面显示“已同步”。没有网络时，进度先保存在本机。</p>`:''}
    </section>
    <${connected?'details':'section'} class="sync-card">${connected?'<summary>更新连接密钥</summary>':'<h3>首次连接</h3>'}
      <form id="sync-form" class="sync-form">
        <label for="sync-repository">私有仓库</label><input id="sync-repository" name="repository" type="text" value="${escape(repository)}" autocapitalize="none" autocorrect="off" spellcheck="false" required />
        <label for="sync-token">连接密钥</label><input id="sync-token" name="token" type="password" placeholder="github_pat_…" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" aria-describedby="token-note" required />
        <p id="token-note" class="sync-note">密钥仅保存在这台设备的浏览器中，用来访问指定的私有仓库。不要发到聊天里。</p>
        <button class="primary" type="submit">连接并开启自动同步</button>
        <p id="sync-form-error" class="sync-form-error" role="alert" hidden></p>
      </form>
    </${connected?'details':'section'}>
    <details class="sync-card sync-help" ${connected?'':'open'}><summary>如何获取连接密钥</summary><ol>
      <li>登录 GitHub，确认能打开<a href="https://github.com/jnwang/hanzi-stars-progress" target="_blank" rel="noopener noreferrer">学习记录私有仓库</a>。</li>
      <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">创建 Fine-grained token</a>。Repository access 选择 <b>Only select repositories</b>，只勾选 <b>hanzi-stars-progress</b>。</li>
      <li>Repository permissions 中添加 <b>Contents：Read and write</b>，设置到期日，生成后复制到上方。</li>
    </ol><p class="sync-note">每台设备首次需要连接。建议分别创建密钥，到期后在这里更新。无需授权网站源码仓库。</p></details>
    <details class="sync-card sync-help"><summary>在 iPad 上使用</summary><p>用 Safari 普通标签页打开网站；也可以通过“分享 → 添加到主屏幕”作为单独入口使用。</p><p>在实际使用的入口完成连接。结束练习或换设备前，确认出现“已同步”。切到后台后，iPad 可能暂停网页，待同步内容会在下次打开并联网后补传。</p><p>星星与打卡会合并。如果两台设备同时做同一关，会保留进度更多的一份完整练习；正在写的这一笔不会被远程切换。</p></details>
    ${connected?'<button class="text-button disconnect-button" data-action="sync-disconnect">断开这台设备</button>':''}
  </main>`;
}

app.addEventListener('submit',async event=>{
  const form=event.target as HTMLFormElement;if(form.id!=='sync-form')return;event.preventDefault();
  const button=form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const errorBox=form.querySelector<HTMLElement>('#sync-form-error')!;
  const values=new FormData(form);button.disabled=true;errorBox.hidden=true;
  try{
    await sync.connect(String(values.get('repository')||''),String(values.get('token')||''));
    form.querySelector<HTMLInputElement>('#sync-token')!.value='';
    void navigator.storage?.persist?.().catch(()=>false);
    if(location.hash==='#/sync')render();
  }catch(error){errorBox.textContent=error instanceof Error?error.message:'连接失败，请重试。';errorBox.hidden=false;}
  finally{button.disabled=false;}
});

app.addEventListener('click',event=>{
  const button=(event.target as Element).closest<HTMLElement>('button,[data-go]');if(!button||button.hasAttribute('disabled'))return;
  if(button.dataset.go){feedback=null;go(button.dataset.go);return;}
  if(button.dataset.character){void readOne(button.dataset.character);return;}
  if(button.dataset.readAnswer&&current){const c=current.level.characters.find(c=>c.id===button.dataset.readAnswer);if(c)void speak(c.audio);return;}
  if(button.dataset.answer&&current&&!feedback){
    const {session,level}=current,c=currentReadingCharacter(session,level)!;const choices=session.choices[c.id];const selected=button.dataset.answer;
    const correct=answerReading(session,level,selected);feedback={character:c,selected,correct,choices};markPractice(progress);commit();render();void speak(c.audio);return;
  }
  try{
    switch(button.dataset.action){
      case 'resume':{const result=findLevel(progress.lastLevel||'');if(result)go(`#/level/${result.book.id}/${result.level.index}`);break;}
      case 'follow':void follow();break;
      case 'begin-reading':case 'retry-reading':if(current){beginReading(current.session,current.level);commit();render();void speak('audio/ui/reading.mp3');}break;
      case 'next-question':feedback=null;render();break;
      case 'begin-writing':if(current){beginWriting(current.session,current.level);commit();render();void speak('audio/ui/trace.mp3');}break;
      case 'hint':void hint();break;
      case 'rewrite':render();break;
      case 'writing-next':nextWriting();break;
      case 'review':if(current){progress.sessions[current.level.id]=newSession(current.level);commit();render();}break;
      case 'sound':{
        if(feedback)void speak(feedback.character.audio);
        else if(current){const {session,level}=current;
          if(session.stage==='preview')void follow();
          else if(session.stage==='reading')void speak('audio/ui/reading.mp3');
          else if(session.stage==='reading-result')void speak(readingPassed(session,level)?'audio/ui/reading-pass.mp3':'audio/ui/reading-retry.mp3');
          else if(session.stage==='trace')void speak('audio/ui/trace.mp3');
          else if(session.stage==='recall')void speak(currentWritingCharacter(session,level)!.audio);
          else void speak('audio/ui/done.mp3');
        }break;
      }
      case 'export':download(JSON.stringify(progress,null,2),`汉字星星-${localDate()}.json`);break;
      case 'export-original':download(store.raw()||JSON.stringify(progress),'汉字星星-原始记录.json');break;
      case 'import':document.querySelector<HTMLInputElement>('#backup-file')?.click();break;
      case 'sync-now':void sync.syncNow();break;
      case 'sync-disconnect':if(confirm('断开后，这台设备只在本机保存。云端和本机记录都不会删除，是否断开？')){sync.disconnect();pendingCloud=null;render();}break;
    }
  }catch(error){notice(error instanceof Error?error.message:'这一步暂时没有完成，请重试。');}
});
app.addEventListener('change',async event=>{
  const input=event.target as HTMLInputElement;if(input.id!=='backup-file'||!input.files?.[0])return;
  try{
    const file=input.files[0];if(file.size>4_000_000)throw new Error('备份文件过大。');
    const text=await file.text();validateProgress(JSON.parse(text),curriculum);
    if(!confirm('导入后将使用备份中的学习进度。当前记录会自动保留一份，是否继续？')){input.value='';return;}
    progress=store.import(text);feedback=null;render();sync.schedule();notice('备份已恢复。');
  }catch(error){notice(error instanceof Error?error.message:'备份没有导入，原记录未改变。');}
});
function download(text:string,name:string):void{const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
window.addEventListener('hashchange',()=>{feedback=null;if(curriculum){try{applyPendingCloud();render();}catch(error){notice(error instanceof Error?error.message:'云端记录暂未读取。');}}});
window.addEventListener('pagehide',()=>{if(progress)commit();voice.stop();});
window.addEventListener('storage',event=>{if(store&&(event.key===store.key||event.key===SYNC_KEY||event.key===null)){store.error='另一个窗口更新了进度或连接，请刷新后继续。';updateSaveNotice();}});
const syncIfVisible=()=>{if(sync?.connected&&!document.hidden&&!store.error)void sync.syncNow();};
window.addEventListener('online',syncIfVisible);
window.addEventListener('focus',syncIfVisible);
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(progress)commit();if(sync?.connected&&!store.error)void sync.syncNow();}else syncIfVisible();});
setInterval(syncIfVisible,60_000);

async function start():Promise<void>{
  try{
    const response=await fetch(new URL('data/curriculum.json',base));if(!response.ok)throw new Error('字库暂时没有打开');
    curriculum=await response.json();if(curriculum.books.filter(b=>b.grade>=1&&b.grade<=6).length!==12)throw new Error('字库不完整');
    store=new ProgressStore(curriculum);progress=store.load();
    sync=new GitHubSync({curriculum,storage:localStorage,getProgress:()=>{if(store.error)throw new Error('请先处理本机保存提示，再进行云同步。');return progress;},receive:receiveCloud,changed:updateSyncStatus});
    if(sync.connected&&!store.error){
      app.innerHTML='<main class="loading"><p>正在读取学习进度…</p></main>';
      await sync.syncNow();
    }
    render();
  }catch(error){app.innerHTML=`<main class="load-error"><h1>暂时没有打开</h1><p>${escape(error instanceof Error?error.message:'请检查网络连接')}</p><button class="primary" onclick="location.reload()">重新打开</button></main>`;}
}
void start();
