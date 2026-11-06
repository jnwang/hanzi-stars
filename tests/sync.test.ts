import test from 'node:test';
import assert from 'node:assert/strict';
import type { Curriculum, Progress } from '../src/model.ts';
import { emptyProgress, levelsFor, newSession, hearCharacter, beginReading, answerReading, currentReadingCharacter, beginWriting, tracePassed, recallPassed, lightStar, validateProgress } from '../src/engine.ts';
import { mergeProgress } from '../src/sync-merge.ts';
import { GitHubSync, SYNC_KEY, encodeContent, decodeContent, validateSyncConfig } from '../src/github-sync.ts';
import { ProgressStore } from '../src/storage.ts';

const token = `github_pat_${'test'.repeat(12)}`;
const repository = 'example/learning-progress';
function curriculum(): Curriculum {
  return { version:'test-sync', books:[1,2].map(i=>({id:`g${i}s1`,grade:i,term:1,title:'测试',edition:'test',notes:[],sources:[],characters:Array.from('天地人你我他一二三四木').map((hanzi,j)=>({id:`${i}-${j}`,hanzi,pinyin:'mù',word:'树木',polyphonic:false,distractors:['mò','nù','mǔ'],audio:'a.mp3',stroke:'s.json'}))})) };
}
function memory() {
  const values=new Map<string,string>();
  return { values, getItem:(key:string)=>values.get(key)||null, setItem:(key:string,value:string)=>{values.set(key,value);}, removeItem:(key:string)=>{values.delete(key);} };
}
function complete(p:Progress,c:Curriculum,bookIndex=0):void {
  const book=c.books[bookIndex],level=levelsFor(book)[0],s=newSession(level);p.sessions[level.id]=s;p.lastLevel=level.id;
  level.characters.forEach(ch=>hearCharacter(s,ch.id));beginReading(s,level);
  while(s.stage==='reading')answerReading(s,level,currentReadingCharacter(s,level)!.pinyin);
  beginWriting(s,level);while(s.stage!=='done'){tracePassed(s,level);recallPassed(s,level,0,false);}lightStar(p,s,level,book);
}
function server(c:Curriculum) {
  const state={text:null as string|null,sha:0,puts:0,private:true,offline:false,unauthorized:false,conflict:null as Progress|null,gate:null as Promise<void>|null};
  const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  const fetcher:typeof fetch=async(input,init)=>{
    assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');
    const url=new URL(String(input));assert.equal(url.origin,'https://api.github.com');
    if(state.offline)throw new TypeError('offline');
    if(state.unauthorized)return json({},401);
    if(!url.pathname.includes('/contents/'))return json({private:state.private,default_branch:'main'});
    assert.ok(url.pathname.endsWith(`/progress/${c.version}.json`));
    if(init?.method==='PUT'){
      state.puts++;
      if(state.gate)await state.gate;
      if(state.conflict){state.text=JSON.stringify(state.conflict);state.conflict=null;state.sha++;return json({},409);}
      const body=JSON.parse(String(init.body));
      if(state.text!==null&&body.sha!==String(state.sha))return json({},409);
      state.text=decodeContent(body.content);state.sha++;return json({content:{sha:String(state.sha)}},201);
    }
    if(state.text===null)return json({},404);
    return json({type:'file',size:state.text.length,sha:String(state.sha),encoding:'base64',content:encodeContent(state.text)});
  };
  return {state,fetcher};
}
function device(c:Curriculum,fetcher:typeof fetch,initial=emptyProgress(c)) {
  let progress=initial;const storage=memory();
  const sync=new GitHubSync({curriculum:c,storage,fetcher,getProgress:()=>progress,receive:p=>{progress=p;},changed:()=>{}});
  return {sync,storage,get p(){return progress;}};
}

test('跨设备合并星星和打卡，旧进度不会覆盖新成就',()=>{
  const c=curriculum(),a=emptyProgress(c),b=emptyProgress(c);complete(a,c,0);complete(b,c,1);
  a.days=['2026-11-05'];b.days=['2026-11-06'];const merged=mergeProgress(a,b,c);
  assert.deepEqual(merged.completed,{g1s1:['g1s1-0'],g2s1:['g2s1-0']});assert.deepEqual(merged.days,['2026-11-05','2026-11-06']);
  assert.deepEqual(mergeProgress(merged,emptyProgress(c),c).completed,merged.completed);validateProgress(merged,c);
});
test('未完成的错题轮次保持完整，较旧设备不会退回已通过的书写',()=>{
  const c=curriculum(),a=emptyProgress(c),level=levelsFor(c.books[0])[0],s=newSession(level);a.sessions[level.id]=s;
  level.characters.forEach(ch=>hearCharacter(s,ch.id));beginReading(s,level);
  while(s.stage==='reading'){const ch=currentReadingCharacter(s,level)!;answerReading(s,level,ch.id.endsWith('-2')?ch.distractors[0]:ch.pinyin);}
  const b=structuredClone(a);beginReading(b.sessions[level.id],level);answerReading(b.sessions[level.id],level,'mù');beginWriting(b.sessions[level.id],level);tracePassed(b.sessions[level.id],level);recallPassed(b.sessions[level.id],level,0,false);
  const merged=mergeProgress(a,b,c);assert.equal(merged.sessions[level.id].written.length,1);assert.equal(merged.sessions[level.id].previousRounds.length,1);validateProgress(merged,c);
});
test('已完成关卡可以重新练习；预习已听字可合并',()=>{
  const c=curriculum(),a=emptyProgress(c);complete(a,c);a.updatedAt='2026-11-05T00:00:00Z';const b=structuredClone(a),level=levelsFor(c.books[0])[0];
  b.sessions[level.id]=newSession(level);b.updatedAt='2026-11-06T00:00:00Z';assert.equal(mergeProgress(a,b,c).sessions[level.id].stage,'preview');
  const x=emptyProgress(c),y=emptyProgress(c);x.sessions[level.id]=newSession(level);y.sessions[level.id]=newSession(level);
  hearCharacter(x.sessions[level.id],level.characters[0].id);hearCharacter(y.sessions[level.id],level.characters[1].id);
  assert.equal(mergeProgress(x,y,c).sessions[level.id].heard.length,2);
});
test('中文备份使用 UTF-8；密钥只能是精细权限令牌，地址不能改变 API 目标',()=>{
  const value='汉字星星：mǔ，✓';assert.equal(decodeContent(encodeContent(value)),value);
  assert.throws(()=>validateSyncConfig({repository:'https://evil.test/a',token}));assert.throws(()=>validateSyncConfig({repository,token:'ghp_oldtoken'}));
});
test('首次上传、另一台设备恢复、刷新后继续自动连接',async()=>{
  const c=curriculum(),remote=server(c),a=device(c,remote.fetcher);complete(a.p,c);
  await a.sync.connect(repository,token);assert.equal(a.sync.status.state,'synced');assert.equal(remote.state.puts,1);assert.ok(a.storage.getItem(SYNC_KEY));
  assert.ok(!remote.state.text!.includes(token));const b=device(c,remote.fetcher);await b.sync.connect(repository,token);
  assert.deepEqual(b.p.completed,a.p.completed);assert.equal(remote.state.puts,1);
  const restarted=new GitHubSync({curriculum:c,storage:b.storage,fetcher:remote.fetcher,getProgress:()=>b.p,receive:()=>{},changed:()=>{}});
  assert.equal(restarted.connected,true);await restarted.syncNow();assert.equal(restarted.status.state,'synced');
});
test('拒绝公开仓库，不保存连接密钥，也不上传记录',async()=>{
  const c=curriculum(),remote=server(c);remote.state.private=false;const a=device(c,remote.fetcher);
  await assert.rejects(a.sync.connect(repository,token),/私有仓库/);assert.equal(remote.state.puts,0);assert.equal(a.storage.getItem(SYNC_KEY),null);
});
test('仓库之后变成公开时也停止上传',async()=>{
  const c=curriculum(),remote=server(c),a=device(c,remote.fetcher);await a.sync.connect(repository,token);remote.state.private=false;
  a.p.days=['2026-11-06'];await a.sync.syncNow();assert.equal(a.sync.status.state,'error');assert.equal(remote.state.puts,1);
});
test('网络失败后保留本机记录，重连时合并恢复',async()=>{
  const c=curriculum(),remote=server(c),a=device(c,remote.fetcher);await a.sync.connect(repository,token);
  remote.state.offline=true;complete(a.p,c);await a.sync.syncNow();assert.equal(a.sync.status.state,'error');assert.equal(a.p.completed.g1s1.length,1);
  remote.state.offline=false;await a.sync.syncNow();assert.equal(a.sync.status.state,'synced');assert.equal(JSON.parse(remote.state.text!).completed.g1s1.length,1);
});
test('云端记录损坏时不覆盖云端或本机',async()=>{
  const c=curriculum(),remote=server(c),a=device(c,remote.fetcher);await a.sync.connect(repository,token);complete(a.p,c);remote.state.text='broken json';
  await a.sync.syncNow();assert.equal(a.sync.status.state,'error');assert.equal(remote.state.text,'broken json');assert.equal(a.p.completed.g1s1.length,1);assert.equal(remote.state.puts,1);
});
test('两台设备同时写入发生冲突时重新读取并合并重试',async()=>{
  const c=curriculum(),remote=server(c),a=device(c,remote.fetcher);await a.sync.connect(repository,token);complete(a.p,c,0);
  const other=emptyProgress(c);complete(other,c,1);remote.state.conflict=other;
  await a.sync.syncNow();assert.equal(a.sync.status.state,'synced');assert.deepEqual(JSON.parse(remote.state.text!).completed,{g1s1:['g1s1-0'],g2s1:['g2s1-0']});assert.equal(remote.state.puts,3);
});
test('上传中继续答题时不会误显示所有新进度已同步',async()=>{
  const c=curriculum(),remote=server(c),a=device(c,remote.fetcher);await a.sync.connect(repository,token);
  let release!:()=>void;remote.state.gate=new Promise<void>(resolve=>{release=resolve;});a.p.days=['2026-11-05'];
  const task=a.sync.syncNow();while(remote.state.puts<2)await new Promise(resolve=>setTimeout(resolve,1));
  a.p.days.push('2026-11-06');a.sync.schedule();release();await task;
  assert.equal(a.sync.status.state,'pending');remote.state.gate=null;await a.sync.syncNow();assert.deepEqual(JSON.parse(remote.state.text!).days,['2026-11-05','2026-11-06']);a.sync.disconnect();
});
test('自动保存不会因连续操作无限延后；断开取消待上传并删除本机密钥',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const c=curriculum(),remote=server(c),a=device(c,remote.fetcher);await a.sync.connect(repository,token);
  a.p.days=['2026-11-05'];a.sync.schedule();t.mock.timers.tick(1200);a.p.days.push('2026-11-06');a.sync.schedule();t.mock.timers.tick(600);await a.sync.syncNow();assert.equal(remote.state.puts,2);
  a.p.days.push('2026-11-07');a.sync.schedule();a.sync.disconnect();t.mock.timers.tick(2000);assert.equal(remote.state.puts,2);assert.equal(a.storage.getItem(SYNC_KEY),null);assert.equal(a.p.days.length,3);
});
test('密钥失效显示错误，不把未上传误报为已同步',async()=>{
  const c=curriculum(),remote=server(c),a=device(c,remote.fetcher);await a.sync.connect(repository,token);remote.state.unauthorized=true;
  await a.sync.syncNow();assert.equal(a.sync.status.state,'error');assert.match(a.sync.status.message,/密钥已失效/);
});
test('接收云端记录前保留本机备份',()=>{
  const c=curriculum(),storage=memory(),store=new ProgressStore(c,storage as unknown as Storage);const p=store.load();store.save(p);const prior=store.raw();const remote=emptyProgress(c);complete(remote,c);
  store.receive(remote);assert.equal(storage.getItem(`${store.key}:before-sync`),prior);assert.equal(store.load().completed.g1s1.length,1);
});
test('本机无法写入时不报告已接收云端记录',()=>{
  const c=curriculum(),original=JSON.stringify(emptyProgress(c));
  const storage={getItem:()=>original,setItem:()=>{throw new Error('quota');}} as unknown as Storage;
  const store=new ProgressStore(c,storage);const remote=emptyProgress(c);complete(remote,c);
  assert.throws(()=>store.receive(remote),/尚未存入本机/);assert.equal(store.raw(),original);
});
