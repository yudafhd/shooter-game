import type { AssetManifest } from '../types/game';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private lastPlayed = new Map<string, number>();
  private masterVolume = 0.75;
  private sfxVolume = 0.85;
  private loaded = false;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setVolumes(master: number, sfx: number): void {
    this.masterVolume = Math.max(0, Math.min(1, master));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
  }

  public async preload(manifest: AssetManifest): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const entries = Object.values(manifest.audio);
    await Promise.all(
      entries.map(async (entry) => {
        try {
          const res = await fetch(`./${entry.path}`);
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          this.rawBuffers.set(entry.id, arr);
        } catch {
          // Graceful fallback if audio fetch fails
        }
      })
    );
  }

  private rawBuffers = new Map<string, ArrayBuffer>();
  private decoding = new Set<string>();

  private ensureDecoded(id: string): AudioBuffer | null {
    const existing = this.buffers.get(id);
    if (existing) return existing;
    if (!this.ctx || this.decoding.has(id)) return null;
    const raw = this.rawBuffers.get(id);
    if (!raw) return null;
    this.decoding.add(id);
    const copy = raw.slice(0);
    this.ctx
      .decodeAudioData(copy)
      .then((buf) => {
        this.buffers.set(id, buf);
      })
      .catch(() => {})
      .finally(() => {
        this.decoding.delete(id);
      });
    return null;
  }

  public play(id: string, volume = 1.0, minIntervalMs = 45, pitchJitter = 0.08): void {
    const effectiveVol = this.masterVolume * this.sfxVolume * volume;
    if (effectiveVol <= 0.005) return;
    this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return;

    const now = performance.now();
    const prev = this.lastPlayed.get(id) ?? 0;
    if (now - prev < minIntervalMs) return;
    this.lastPlayed.set(id, now);

    const buffer = this.ensureDecoded(id);
    if (!buffer) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    if (pitchJitter > 0) {
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitchJitter;
    }

    const gain = this.ctx.createGain();
    gain.gain.value = Math.min(1.0, effectiveVol);

    src.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(0);
  }
}
