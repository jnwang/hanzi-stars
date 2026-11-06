import type { Book, Character, Curriculum, Level, Progress, Session } from './model.ts';

export function levelsFor(book: Book): Level[] {
  const result: Level[] = [];
  for (let i = 0; i < book.characters.length; i += 10) {
    result.push({ id: `${book.id}-${i / 10}`, index: i / 10, bookId: book.id, characters: book.characters.slice(i, i + 10) });
  }
  return result;
}
export function shuffle<T>(values: readonly T[], random = Math.random): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function emptyProgress(curriculum: Curriculum): Progress {
  return { schema: 1, curriculumVersion: curriculum.version, completed: {}, sessions: {}, days: [], lastLevel: null, updatedAt: new Date().toISOString() };
}
export function newSession(level: Level): Session {
  return { bookId: level.bookId, levelIndex: level.index, stage: 'preview', heard: [], order: [], choices: {}, answers: [], previousRounds: [], round: 0, traced: [], written: [] };
}
export function isComplete(progress: Progress, level: Level): boolean { return (progress.completed[level.bookId] || []).includes(level.id); }
export function isUnlocked(progress: Progress, level: Level, book: Book): boolean {
  return levelsFor(book).slice(0, level.index).every(previous => isComplete(progress, previous));
}
export function countStars(progress: Progress, curriculum: Curriculum): { done: number; total: number } {
  const levels = curriculum.books.flatMap(levelsFor);
  return { total: levels.length, done: levels.filter(level => isComplete(progress, level)).length };
}
export function bookComplete(progress: Progress, book: Book): boolean {
  const levels = levelsFor(book);
  return levels.length > 0 && levels.every(level => isComplete(progress, level));
}
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function markPractice(progress: Progress, date = localDate()): void { if (!progress.days.includes(date)) progress.days.push(date); }
export function hearCharacter(session: Session, id: string): void { if (!session.heard.includes(id)) session.heard.push(id); }
export function allHeard(session: Session, level: Level): boolean { return level.characters.every(c => session.heard.includes(c.id)); }
export function beginReading(session: Session, level: Level, random = Math.random): void {
  if (!allHeard(session, level)) throw new Error('请先把本关的字跟读一遍。');
  if (session.stage !== 'preview' && session.stage !== 'reading-result') throw new Error('当前不能开始认读。');
  const pending = session.stage === 'preview' ? level.characters.map(c => c.id) : session.answers.filter(a => !a.correct).map(a => a.id);
  if (!pending.length) throw new Error('这些字都答对了，可以开始写字。');
  if (session.stage === 'reading-result') session.previousRounds.push([...session.answers]);
  session.order = shuffle(pending, random);
  session.choices = Object.fromEntries(level.characters.map(c => [c.id, shuffle([c.pinyin, ...c.distractors], random)]));
  session.answers = []; session.round++; session.stage = 'reading';
}
export function currentReadingCharacter(session: Session, level: Level): Character | undefined {
  return level.characters.find(c => c.id === session.order[session.answers.length]);
}
export function answerReading(session: Session, level: Level, selected: string): boolean {
  if (session.stage !== 'reading') throw new Error('当前不在认读测验中。');
  const character = currentReadingCharacter(session, level);
  if (!character || !session.choices[character.id]?.includes(selected)) throw new Error('无效的拼音选项。');
  const correct = character.pinyin === selected;
  session.answers.push({ id: character.id, selected, correct });
  if (session.answers.length === session.order.length) session.stage = 'reading-result';
  return correct;
}
export function readingPassed(session: Session, level: Level): boolean {
  const correct = new Set([...session.previousRounds.flat(), ...session.answers].filter(a => a.correct && level.characters.some(c => c.id === a.id && c.pinyin === a.selected)).map(a => a.id));
  return session.answers.length === session.order.length && level.characters.every(c => correct.has(c.id));
}
export function beginWriting(session: Session, level: Level): void {
  if (session.stage !== 'reading-result' || !readingPassed(session, level)) throw new Error('把还没认对的字练会，就能开始写字。');
  session.stage = 'trace';
}
export function currentWritingCharacter(session: Session, level: Level): Character | undefined { return level.characters.find(c => !session.written.includes(c.id)); }
export function tracePassed(session: Session, level: Level): void {
  const character = currentWritingCharacter(session, level);
  if (session.stage !== 'trace' || !readingPassed(session, level) || !character) throw new Error('当前不能完成跟写。');
  if (!session.traced.includes(character.id)) session.traced.push(character.id);
  session.stage = 'recall';
}
export function recallPassed(session: Session, level: Level, mistakes: number, usedHint: boolean): boolean {
  const character = currentWritingCharacter(session, level);
  if (session.stage !== 'recall' || !character || !readingPassed(session, level) || !session.traced.includes(character.id)) throw new Error('请先完成跟写。');
  if (mistakes > 0 || usedHint) return false;
  session.written.push(character.id);
  session.stage = session.written.length === level.characters.length ? 'done' : 'trace';
  return true;
}
export function lightStar(progress: Progress, session: Session, level: Level, book: Book): boolean {
  if (!isUnlocked(progress, level, book) || session.stage !== 'done' || !readingPassed(session, level) || !level.characters.every(c => session.traced.includes(c.id) && session.written.includes(c.id))) return false;
  if (!progress.completed[level.bookId]) progress.completed[level.bookId] = [];
  if (!isComplete(progress, level)) progress.completed[level.bookId].push(level.id);
  markPractice(progress);
  return true;
}

// Backups and stored state are parsed before use. A malformed file cannot unlock a skipped level.
export function validateProgress(value: unknown, curriculum: Curriculum): Progress {
  if (!value || typeof value !== 'object') throw new Error('这不是有效的学习记录。');
  const p = value as Progress;
  if (p.schema !== 1 || (p.curriculumVersion !== curriculum.version && !curriculum.legacyVersions?.includes(p.curriculumVersion))) throw new Error('这份记录与当前字库版本不同，请保留原备份。');
  if (!p.completed || typeof p.completed !== 'object' || Array.isArray(p.completed) || !p.sessions || typeof p.sessions !== 'object' || Array.isArray(p.sessions) || !Array.isArray(p.days) || typeof p.updatedAt !== 'string' || (p.lastLevel !== null && typeof p.lastLevel !== 'string')) throw new Error('学习记录格式不完整。');
  const allLevels = curriculum.books.flatMap(levelsFor);
  const bookIds = new Set(curriculum.books.map(b => b.id));
  for (const [bookId, completed] of Object.entries(p.completed)) {
    const book = curriculum.books.find(b => b.id === bookId);
    if (!book || !Array.isArray(completed) || new Set(completed).size !== completed.length) throw new Error('关卡记录无效。');
    const expected = levelsFor(book).slice(0, completed.length).map(l => l.id);
    if (expected.length !== completed.length || expected.some(id => !completed.includes(id))) throw new Error('关卡顺序记录无效。');
  }
  for (const [id, s] of Object.entries(p.sessions)) {
    const level = allLevels.find(l => l.id === id);
    if (!level || !s || typeof s !== 'object' || !bookIds.has(s.bookId) || s.bookId !== level.bookId || s.levelIndex !== level.index || !['preview','reading','reading-result','trace','recall','done'].includes(s.stage)) throw new Error('练习进度无效。');
    const ids = level.characters.map(c => c.id);
    for (const list of [s.heard, s.traced, s.written]) if (!Array.isArray(list) || new Set(list).size !== list.length || list.some(x => !ids.includes(x))) throw new Error('汉字进度无效。');
    if (s.written.some(x => !s.traced.includes(x)) || !Number.isInteger(s.round) || s.round < 0 || !Array.isArray(s.answers) || !Array.isArray(s.previousRounds) || !Array.isArray(s.order) || !s.choices || typeof s.choices !== 'object') throw new Error('练习记录不完整。');
    if (s.stage !== 'preview') {
      let pending = [...ids];
      for (const round of s.previousRounds) {
        if (!Array.isArray(round) || round.length !== pending.length || new Set(round.map(a => a.id)).size !== round.length || round.some(a => !pending.includes(a.id))) throw new Error('错题复习记录无效。');
        for (const a of round) { const c = level.characters.find(c => c.id === a.id)!; if (![c.pinyin,...c.distractors].includes(a.selected) || a.correct !== (a.selected === c.pinyin)) throw new Error('历史答案无效。'); }
        pending = round.filter(a => !a.correct).map(a => a.id);
      }
      if (!pending.length || s.order.length !== pending.length || new Set(s.order).size !== pending.length || s.order.some(x => !pending.includes(x)) || s.answers.length > pending.length || !allHeard(s, level) || s.round !== s.previousRounds.length + 1) throw new Error('认读题目记录无效。');
      for (const c of level.characters) {
        const choices = s.choices[c.id];
        if (!Array.isArray(choices) || choices.length !== 4 || new Set(choices).size !== 4 || choices.some(x => ![c.pinyin,...c.distractors].includes(x))) throw new Error('拼音选项记录无效。');
      }
      s.answers.forEach((a, i) => { const c = level.characters.find(c => c.id === a.id); if (!c || s.order[i] !== a.id || !s.choices[a.id].includes(a.selected) || a.correct !== (a.selected === c.pinyin)) throw new Error('认读答案记录无效。'); });
      if (s.stage === 'reading' && s.answers.length >= s.order.length) throw new Error('认读阶段记录无效。');
      if (s.stage === 'reading-result' && s.answers.length !== s.order.length) throw new Error('认读结果尚未完成。');
      if (['trace','recall','done'].includes(s.stage) && !readingPassed(s, level)) throw new Error('尚未通过认读。');
      if (s.stage === 'done' && !ids.every(x => s.traced.includes(x) && s.written.includes(x))) throw new Error('尚未完成书写。');
    }
    if (!isUnlocked(p, level, curriculum.books.find(b => b.id === level.bookId)!)) throw new Error('练习关卡尚未解锁。');
  }
  if (p.days.some(d => typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) || new Set(p.days).size !== p.days.length || (p.lastLevel !== null && !allLevels.some(l => l.id === p.lastLevel))) throw new Error('学习日期或位置无效。');
  return structuredClone({...p,curriculumVersion:curriculum.version});
}
