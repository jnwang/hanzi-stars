import type { Curriculum, Progress } from './model.ts';
import { emptyProgress, validateProgress } from './engine.ts';

export class ProgressStore {
  readonly key: string;
  error = '';
  private curriculum: Curriculum;
  private storage: Storage;
  constructor(curriculum: Curriculum, storage: Storage = localStorage) { this.curriculum = curriculum; this.storage = storage; this.key = `hanzi-stars:v1:${curriculum.version}`; }
  load(): Progress {
    try {
      const raw = this.storage.getItem(this.key);
      if (raw) return validateProgress(JSON.parse(raw), this.curriculum);
      for (const version of this.curriculum.legacyVersions || []) {
        const old = this.storage.getItem(`hanzi-stars:v1:${version}`);
        if (!old) continue;
        const migrated = validateProgress(JSON.parse(old), this.curriculum);
        try { this.storage.setItem(this.key, JSON.stringify(migrated)); }
        catch { this.error = '旧进度已读取，但新记录未保存，请先导出备份。'; }
        return migrated;
      }
      return emptyProgress(this.curriculum);
    } catch {
      this.error = '原学习记录暂时无法读取。已保留原数据，请到学习记录页导出备份。';
      return emptyProgress(this.curriculum);
    }
  }
  save(progress: Progress): boolean {
    if (this.error.startsWith('原学习记录') || this.error.startsWith('另一个窗口')) return false;
    try { progress.updatedAt = new Date().toISOString(); this.storage.setItem(this.key, JSON.stringify(progress)); this.error = ''; return true; }
    catch { this.error = '进度未保存，请在离开前导出备份。'; return false; }
  }
  raw(): string | null { try { return this.storage.getItem(this.key); } catch { return null; } }
  receive(progress: Progress): void {
    if (this.error) throw new Error('本机记录暂时无法保存，请先处理保存提示。');
    const parsed = validateProgress(progress, this.curriculum);
    try {
      const prior = this.storage.getItem(this.key);
      if (prior && !this.storage.getItem(`${this.key}:before-sync`)) this.storage.setItem(`${this.key}:before-sync`, prior);
      this.storage.setItem(this.key, JSON.stringify(parsed));
    } catch { throw new Error('云端记录尚未存入本机，请检查浏览器存储空间；原记录仍保留。'); }
  }
  import(text: string): Progress {
    if (text.length > 4_000_000) throw new Error('备份文件过大。');
    const parsed = validateProgress(JSON.parse(text), this.curriculum);
    const prior = this.storage.getItem(this.key);
    if (prior) this.storage.setItem(`${this.key}:before-import`, prior);
    this.storage.setItem(this.key, JSON.stringify(parsed));
    this.error = '';
    return parsed;
  }
}
