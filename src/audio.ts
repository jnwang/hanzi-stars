export class AudioCancelled extends Error {}
export class Voice {
  private player = new Audio();
  private cancel: (() => void) | null = null;
  private base: string;
  constructor(base: string) { this.base = base; this.player.preload = 'auto'; }
  stop(): void { this.cancel?.(); this.cancel = null; this.player.pause(); }
  play(file: string): Promise<void> {
    this.stop();
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true; clearTimeout(timer); this.player.onended = null; this.player.onerror = null; this.cancel = null;
        if (error) reject(error); else resolve();
      };
      const timer = setTimeout(() => finish(new Error('声音暂时无法播放，请点喇叭重试。')), 25000);
      this.cancel = () => finish(new AudioCancelled());
      this.player.onended = () => finish();
      this.player.onerror = () => finish(new Error('声音暂时无法播放，请点喇叭重试。'));
      this.player.src = new URL(file, this.base).href;
      void this.player.play().catch(() => finish(new Error('请再点一次喇叭，开启声音。')));
    });
  }
}
