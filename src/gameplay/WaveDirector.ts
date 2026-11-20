import type { StageConfig, WaveConfig } from '../types/game';
import type { EnemyAIManager } from './EnemyAI';
import type { BossStateMachine } from './BossStateMachine';

const WAVE_LABELS: Record<WaveConfig['kind'], string> = {
  normal: 'Normal Wave',
  mixed: 'Mixed Assault',
  elite: 'Elite Vanguard',
  boss: 'Boss Encounter'
};

export class WaveDirector {
  private stage: StageConfig | null = null;
  private triggered = new Set<number>();
  public currentWave = 1;
  public currentWaveLabel = 'Normal Wave';
  public bossArenaLocked = false;
  public bossStandZ = 0;

  public initStage(stage: StageConfig): void {
    this.stage = stage;
    this.triggered.clear();
    this.currentWave = 1;
    this.currentWaveLabel = WAVE_LABELS[stage.waves[0].kind];
    this.bossArenaLocked = false;
    // Squad stops at comfortable engagement distance in front of boss until boss is defeated
    this.bossStandZ = stage.waves[3].spawnZ - 14.5;
  }

  public update(
    squadZ: number,
    enemies: EnemyAIManager,
    boss: BossStateMachine,
    onBanner?: (text: string, tone: 'good' | 'bad' | 'buff') => void
  ): void {
    if (!this.stage) return;

    for (const wave of this.stage.waves) {
      if (this.triggered.has(wave.waveNumber)) continue;
      if (squadZ >= wave.triggerZ) {
        this.triggered.add(wave.waveNumber);
        this.currentWave = wave.waveNumber;
        this.currentWaveLabel = WAVE_LABELS[wave.kind];
        this.spawnWave(wave, enemies);

        if (wave.kind === 'boss') {
          boss.activate();
          onBanner?.(`WAVE 4 — ${this.stage.boss.name.toUpperCase()}!`, 'bad');
        } else if (wave.kind === 'elite') {
          onBanner?.('WAVE 3 — ELITE VANGUARD!', 'buff');
        } else {
          onBanner?.(`WAVE ${wave.waveNumber} — ${WAVE_LABELS[wave.kind].toUpperCase()}`, 'good');
        }
      }
    }

    // Halt forward auto-advance once squad reaches the boss arena standoff line
    if (!boss.defeated && squadZ >= this.bossStandZ) {
      this.bossArenaLocked = true;
      if (!boss.active) boss.activate();
    } else if (boss.defeated) {
      this.bossArenaLocked = false;
    }
  }

  private spawnWave(wave: WaveConfig, enemies: EnemyAIManager): void {
    if (!this.stage) return;
    const halfTrack = this.stage.trackWidth * 0.5 - 1.1;

    let groupOffsetZ = 0;
    for (const group of wave.groups) {
      const spread = Math.min(halfTrack * 2, group.spreadX ?? 9.0);
      for (let i = 0; i < group.count; i++) {
        const frac = group.count === 1 ? 0 : (i / (group.count - 1)) * 2 - 1;
        const jitterX = (Math.random() - 0.5) * 1.1;
        const x = Math.max(-halfTrack, Math.min(halfTrack, frac * (spread * 0.5) + jitterX));
        const rowOffset = Math.floor(i / 5) * 2.1 + Math.random() * 1.2;
        const z = wave.spawnZ + groupOffsetZ + rowOffset;

        enemies.spawnEnemy(group.enemyId, x, z, {
          isElite: group.isElite,
          hpMultiplier: group.isElite ? wave.eliteModifier?.hpMultiplier : 1.0,
          damageMultiplier: group.isElite ? wave.eliteModifier?.damageMultiplier : 1.0,
          scaleMultiplier: group.isElite ? wave.eliteModifier?.scaleMultiplier : 1.0,
          cleaveRadius: group.isElite ? wave.eliteModifier?.cleaveRadius : undefined
        });
      }
      groupOffsetZ += 2.6;
    }
  }
}
