import type { Curriculum, Progress, Session } from './model.ts';
import { levelsFor, validateProgress } from './engine.ts';

function rank(session: Session): number[] {
  const attempts = [...session.previousRounds.flat(), ...session.answers];
  const correct = new Set(attempts.filter(a => a.correct).map(a => a.id)).size;
  const stage = { preview: 0, reading: 1, 'reading-result': 2, trace: 3, recall: 4, done: 5 }[session.stage];
  return [session.written.length, correct, session.traced.length, attempts.length, session.round, stage, session.heard.length];
}
function chooseSession(a: Session, b: Session): Session {
  const ar = rank(a), br = rank(b);
  for (let i = 0; i < ar.length; i++) if (ar[i] !== br[i]) return structuredClone(ar[i] > br[i] ? a : b);
  // A stable tie-break avoids devices repeatedly replacing each other's snapshots.
  return structuredClone(JSON.stringify(a) >= JSON.stringify(b) ? a : b);
}
export function progressFingerprint(progress: Progress): string {
  const { updatedAt: _updatedAt, ...content } = progress;
  return JSON.stringify(content);
}

/** Merge achievements monotonically, but keep an unfinished quiz as a coherent attempt. */
export function mergeProgress(left: Progress, right: Progress, curriculum: Curriculum): Progress {
  const a = validateProgress(left, curriculum), b = validateProgress(right, curriculum);
  const newer = a.updatedAt >= b.updatedAt ? a : b;
  const result: Progress = {
    schema: 1, curriculumVersion: curriculum.version, completed: {}, sessions: {},
    days: [...new Set([...a.days, ...b.days])].sort(),
    lastLevel: newer.lastLevel || a.lastLevel || b.lastLevel,
    updatedAt: a.updatedAt >= b.updatedAt ? a.updatedAt : b.updatedAt,
  };
  for (const book of curriculum.books) {
    const done = new Set([...(a.completed[book.id] || []), ...(b.completed[book.id] || [])]);
    if (done.size) result.completed[book.id] = levelsFor(book).filter(l => done.has(l.id)).map(l => l.id);
    for (const level of levelsFor(book)) {
      const as = a.sessions[level.id], bs = b.sessions[level.id];
      if (!as && !bs) continue;
      let selected = as && bs ? chooseSession(as, bs) : structuredClone(as || bs);
      // Replaying an already earned star is allowed; keep the newer replay.
      if (as && bs && (a.completed[book.id] || []).includes(level.id) && (b.completed[book.id] || []).includes(level.id)) {
        selected = structuredClone(newer.sessions[level.id] || selected);
      }
      if (as && bs && selected.stage === 'preview') {
        selected.heard = level.characters.filter(c => as.heard.includes(c.id) || bs.heard.includes(c.id)).map(c => c.id);
      }
      result.sessions[level.id] = selected;
    }
  }
  return validateProgress(result, curriculum);
}
