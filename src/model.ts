export interface Character {
  id: string;
  hanzi: string;
  pinyin: string;
  word: string;
  polyphonic: boolean;
  distractors: string[];
  audio: string;
  stroke: string;
}
export interface Book {
  id: string;
  grade: number;
  term: number;
  title: string;
  edition: string;
  notes: string[];
  sources: { title?: string; url: string }[];
  characters: Character[];
  coverage?: { recognition: number; writing: number; overlap: number; printedNew: number | null };
}
export interface Curriculum { version: string; books: Book[]; legacyVersions?: string[] }
export interface Level { id: string; index: number; bookId: string; characters: Character[] }
export type Stage = 'preview' | 'reading' | 'reading-result' | 'trace' | 'recall' | 'done';
export interface Answer { id: string; selected: string; correct: boolean }
export interface Session {
  bookId: string;
  levelIndex: number;
  stage: Stage;
  heard: string[];
  order: string[];
  choices: Record<string, string[]>;
  answers: Answer[];
  previousRounds: Answer[][];
  round: number;
  traced: string[];
  written: string[];
}
export interface Progress {
  schema: 1;
  curriculumVersion: string;
  completed: Record<string, string[]>;
  sessions: Record<string, Session>;
  days: string[];
  lastLevel: string | null;
  updatedAt: string;
}
