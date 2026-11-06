import type { Curriculum, Progress } from './model.ts';
import { validateProgress } from './engine.ts';
import { mergeProgress, progressFingerprint } from './sync-merge.ts';

export const SYNC_KEY = 'hanzi-stars:github-sync:v1';
export interface SyncConfig { repository: string; token: string }
export type SyncState = 'off' | 'pending' | 'syncing' | 'synced' | 'error';
export interface SyncStatus { state: SyncState; message: string; lastSynced: string }
interface Options {
  curriculum: Curriculum;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  getProgress: () => Progress;
  receive: (progress: Progress) => void;
  changed: (status: SyncStatus) => void;
  fetcher?: typeof fetch;
}
class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function validateSyncConfig(value: unknown): SyncConfig {
  const c = value as SyncConfig;
  if (!c || typeof c.repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(c.repository) || c.repository.split('/')[1] === '..') throw new Error('仓库格式应为：账号名/仓库名。');
  if (typeof c.token !== 'string' || !/^github_pat_[A-Za-z0-9_]{20,}$/.test(c.token)) throw new Error('请使用 GitHub 的 Fine-grained personal access token，并只授权学习记录仓库。');
  return { repository: c.repository, token: c.token };
}
export function encodeContent(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function decodeContent(text: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(text.replace(/\s/g, '')), c => c.charCodeAt(0)));
}

export class GitHubSync {
  status: SyncStatus = { state: 'off', message: '仅保存在这台设备', lastSynced: '' };
  private options: Options;
  private config: SyncConfig | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private epoch = 0;
  private controller: AbortController | null = null;
  private seen = '';
  private revision = 0;
  constructor(options: Options) {
    this.options = options;
    try {
      const raw = options.storage.getItem(SYNC_KEY);
      if (raw) {
        this.config = validateSyncConfig(JSON.parse(raw));
        this.status = { state: 'pending', message: '准备读取云端记录', lastSynced: '' };
      }
    } catch { this.status = { state: 'error', message: '连接设置无法读取，请重新连接；本机学习记录不受影响。', lastSynced: '' }; }
  }
  get connected(): boolean { return this.config !== null; }
  get repository(): string { return this.config?.repository || ''; }
  get path(): string { return `progress/${encodeURIComponent(this.options.curriculum.version)}.json`; }
  private setStatus(state: SyncState, message: string): void {
    this.status = { state, message, lastSynced: state === 'synced' ? new Date().toISOString() : this.status.lastSynced };
    this.options.changed(this.status);
  }
  async connect(repository: string, token: string): Promise<void> {
    const candidate = validateSyncConfig({ repository: repository.trim(), token: token.trim() });
    if (this.running) throw new Error('请等当前同步结束后再更换连接。');
    this.setStatus('syncing', '正在检查私有仓库');
    try {
      await this.checkRepository(candidate);
      this.options.storage.setItem(SYNC_KEY, JSON.stringify(candidate));
      this.config = candidate; this.epoch++; this.seen = '';
      await this.syncNow();
    } catch (error) {
      this.setStatus('error', error instanceof Error ? error.message : '连接失败，请重试。');
      throw error;
    }
  }
  disconnect(): void {
    // If removal fails, do not falsely report that this device has disconnected.
    this.options.storage.removeItem(SYNC_KEY);
    this.epoch++; this.controller?.abort(); this.config = null; this.seen = '';
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    this.setStatus('off', '已断开；本机和云端记录都保留');
  }
  schedule(): void {
    if (!this.config) return;
    let fingerprint: string;
    try { fingerprint = progressFingerprint(this.options.getProgress()); }
    catch { return; }
    if (fingerprint === this.seen) return;
    this.seen = fingerprint; this.revision++;
    if (!this.running) this.setStatus('pending', '已存本机，等待同步');
    // Do not postpone indefinitely when the child keeps answering.
    if (!this.timer) this.timer = setTimeout(() => { this.timer = null; void this.syncNow(); }, 1800);
  }
  async syncNow(): Promise<void> {
    if (!this.config) return;
    if (this.running) return this.running;
    if (this.timer) clearTimeout(this.timer); this.timer = null;
    const config = this.config, epoch = this.epoch, revision = this.revision;
    this.setStatus('syncing', '正在同步');
    const task = this.exchange(config, epoch).catch(error => {
      if (epoch !== this.epoch) return;
      this.setStatus('error', error instanceof Error ? error.message : '暂未同步，联网后会重试。');
    });
    this.running = task;
    try { await task; }
    finally {
      if (this.running === task) this.running = null;
      if (epoch === this.epoch && this.config && revision !== this.revision && this.status.state !== 'error') {
        this.setStatus('pending', '已存本机，等待同步');
        if (!this.timer) this.timer = setTimeout(() => { this.timer = null; void this.syncNow(); }, 1800);
      }
    }
  }
  private async request(config: SyncConfig, suffix: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController(); this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await (this.options.fetcher || fetch)(`https://api.github.com/repos/${config.repository}${suffix}`, {
        ...init, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${config.token}`, ...init.headers },
      });
      if (!response.ok) {
        const message = response.status === 401 ? '连接密钥已失效，请在家长设置中更新。'
          : response.status === 403 || response.status === 429 ? 'GitHub 暂不允许同步，请检查密钥权限或稍后重试。'
          : response.status === 404 ? '找不到私有仓库，请检查名称和密钥授权。'
          : '暂未同步，请稍后重试；本机记录仍保留。';
        throw new RequestError(response.status, message);
      }
      return response;
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new Error('网络暂时不可用或响应超时；本机记录仍保留，联网后会重试。');
    } finally { clearTimeout(timeout); if (this.controller === controller) this.controller = null; }
  }
  private async checkRepository(config: SyncConfig): Promise<string> {
    const repo = await (await this.request(config, '')).json();
    if (repo.private !== true) throw new Error('请选择私有仓库，学习记录不会上传到公开仓库。');
    if (repo.archived || repo.disabled) throw new Error('这个仓库无法写入，请使用可用的私有仓库。');
    if (!repo.default_branch || typeof repo.default_branch !== 'string') throw new Error('请先在私有仓库中创建 README 文件。');
    return repo.default_branch;
  }
  private async exchange(config: SyncConfig, epoch: number): Promise<void> {
    const curriculum = this.options.curriculum;
    // Check visibility on every exchange, including after settings change remotely.
    const branch = await this.checkRepository(config);
    if (epoch !== this.epoch) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      let remote: Progress | null = null, sha: string | undefined;
      const suffix = `/contents/${this.path}?ref=${encodeURIComponent(branch)}`;
      try {
        const file = await (await this.request(config, suffix)).json();
        if (file.type !== 'file' || typeof file.sha !== 'string' || file.size > 4_000_000) throw new Error('云端记录格式或大小不正确，未覆盖任何记录。');
        sha = file.sha;
        const text = file.encoding === 'base64' ? decodeContent(file.content)
          : await (await this.request(config, suffix, { headers: { Accept: 'application/vnd.github.raw+json' } })).text();
        if (text.length > 4_000_000) throw new Error('云端记录过大，未覆盖任何记录。');
        try { remote = validateProgress(JSON.parse(text), curriculum); }
        catch { throw new Error('云端记录无法校验，未覆盖任何记录，请先检查云端备份。'); }
      } catch (error) {
        if (!(error instanceof RequestError && error.status === 404)) throw error;
      }
      if (epoch !== this.epoch) return;
      const local = validateProgress(this.options.getProgress(), curriculum);
      const merged = remote ? mergeProgress(local, remote, curriculum) : local;
      // Capture local changes made while a request is in flight in the next exchange.
      const snapshot = progressFingerprint(local);
      if (!remote || progressFingerprint(merged) !== progressFingerprint(remote)) {
        const text = JSON.stringify(merged);
        if (new TextEncoder().encode(text).length > 4_000_000) throw new Error('学习记录过大，请先导出备份。');
        try {
          await this.request(config, `/contents/${this.path}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Sync learning progress', branch, sha, content: encodeContent(text) }),
          });
        } catch (error) {
          if (error instanceof RequestError && (error.status === 409 || error.status === 422) && attempt < 2) continue;
          throw error;
        }
      }
      if (epoch !== this.epoch) return;
      const now = this.options.getProgress();
      const changedInFlight = progressFingerprint(now) !== snapshot;
      this.options.receive(mergeProgress(now, merged, curriculum));
      this.seen = progressFingerprint(this.options.getProgress());
      if (changedInFlight) {
        this.revision++;
        this.setStatus('pending', '已存本机，等待同步');
      } else this.setStatus('synced', '已同步到 GitHub');
      return;
    }
    throw new Error('另一台设备也在保存，稍后会继续同步。');
  }
}
