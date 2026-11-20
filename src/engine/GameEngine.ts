import * as THREE from 'three';
import { WORLDS } from '../data/worlds';
import { ENEMY_DEFINITIONS } from '../data/enemies';
import { getStageConfig } from '../data/stages';
import type { HUDState, QualityPreset, StageConfig, StageResult } from '../types/game';
import { AssetRegistry } from './AssetRegistry';
import { AudioManager } from './AudioManager';
import { CameraController } from './CameraController';
import { InputController } from './InputController';
import { PerformanceManager } from './PerformanceManager';
import { SaveManager } from '../gameplay/SaveManager';
import { PlayerSquadController } from '../gameplay/PlayerSquadController';
import { WeaponSystem } from '../gameplay/WeaponSystem';
import { GateManager } from '../gameplay/GateManager';
import { EnemyAIManager } from '../gameplay/EnemyAI';
import { BossStateMachine } from '../gameplay/BossStateMachine';
import { WaveDirector } from '../gameplay/WaveDirector';
import { CombatSystem } from '../gameplay/CombatSystem';
import { StageDirector } from '../gameplay/StageDirector';

export type EngineMode = 'menu' | 'loading' | 'playing' | 'paused' | 'victory_march' | 'ended';

export interface EngineCallbacks {
  onHudUpdate: (hud: HUDState) => void;
  onBanner: (text: string, tone: 'good' | 'bad' | 'buff') => void;
  onLoadingProgress: (percent: number, label: string) => void;
  onStageEnd: (result: StageResult) => void;
  onModeChange: (mode: EngineMode) => void;
}

const FIXED_DT = 1 / 60;

export class GameEngine {
  public readonly save: SaveManager;
  public readonly audio: AudioManager;

  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private cameraCtrl: CameraController;
  private input: InputController;
  private perf: PerformanceManager;
  private assets: AssetRegistry;

  private stageDirector: StageDirector;
  private squad: PlayerSquadController;
  private weapons: WeaponSystem;
  private gates: GateManager;
  private enemies: EnemyAIManager;
  private boss: BossStateMachine;
  private waveDirector: WaveDirector;
  private combat: CombatSystem;

  private callbacks: EngineCallbacks;
  private mode: EngineMode = 'menu';
  private activeStage: StageConfig | null = null;
  private rafId = 0;
  private lastTimestamp = 0;
  private accumulator = 0;
  private hudEmitTimer = 0;

  // Stage run telemetry
  private stageCoins = 0;
  private enemiesDefeated = 0;
  private stageElapsed = 0;
  private victoryMarchTimer = 0;
  private lastTargetX: number | null = null;
  private lastTargetZ: number | null = null;
  private menuAngle = 0;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.save = new SaveManager();
    this.audio = new AudioManager();

    const settings = this.save.getSettings();
    this.audio.setVolumes(settings.masterVolume, settings.sfxVolume);

    this.renderer = new THREE.WebGLRenderer({
      antialias: settings.quality !== 'low',
      powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.cameraCtrl = new CameraController(
      (container.clientWidth || window.innerWidth) / Math.max(1, container.clientHeight || window.innerHeight)
    );
    this.cameraCtrl.setShakeEnabled(settings.screenShake);

    this.perf = new PerformanceManager(this.renderer, settings.quality);
    this.input = new InputController(this.renderer.domElement);
    this.assets = new AssetRegistry(this.renderer);

    this.stageDirector = new StageDirector(this.scene, this.assets);
    this.squad = new PlayerSquadController(this.scene, this.assets);
    this.weapons = new WeaponSystem(this.scene);
    this.gates = new GateManager(this.scene, this.assets);
    this.enemies = new EnemyAIManager(this.scene, this.assets);
    this.boss = new BossStateMachine(this.scene, this.assets);
    this.waveDirector = new WaveDirector();
    this.combat = new CombatSystem();

    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onGlobalKey);
  }

  public async bootstrap(): Promise<void> {
    const manifest = await this.assets.loadManifest();
    void this.audio.preload(manifest);

    // Preload & showcase Stage 1 diorama live behind the main menu
    await this.loadMenuShowcase();

    this.lastTimestamp = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private async loadMenuShowcase(): Promise<void> {
    const stage1 = getStageConfig(Math.min(30, this.save.getData().lastPlayedStage || 1));
    const world = WORLDS[stage1.worldId];
    const profile = this.perf.getProfile();
    const enemyAssetIds = this.collectStageEnemyAssetIds(stage1);

    await this.assets.preloadStage(stage1, world, enemyAssetIds, profile.enableEnvMap);
    await this.stageDirector.buildStage(stage1, world, profile);
    const stats = this.save.getPlayerStats();
    this.squad.initStage(
      Math.min(12, stats.initialSquad + stage1.initialSquadBonus),
      stats.maxCapacity,
      stats.unitHp,
      stats.unitDamage,
      stats.fireRate,
      stage1.trackWidth,
      profile
    );
    this.squad.movingForward = false;
    this.cameraCtrl.snapTo(0, 0);
    this.setMode('menu');
  }

  private collectStageEnemyAssetIds(stage: StageConfig): string[] {
    const ids = new Set<string>();
    for (const w of stage.waves) {
      for (const g of w.groups) {
        const def = ENEMY_DEFINITIONS[g.enemyId];
        if (def) ids.add(def.assetId);
      }
    }
    const summonDef = ENEMY_DEFINITIONS[stage.boss.summonEnemyId];
    if (summonDef) ids.add(summonDef.assetId);
    return [...ids];
  }

  public async startStage(stageNumber: number): Promise<void> {
    this.audio.unlock();
    this.setMode('loading');
    this.input.setEnabled(false);

    const stage = getStageConfig(stageNumber);
    const world = WORLDS[stage.worldId];
    const profile = this.perf.getProfile();
    this.activeStage = stage;
    this.save.recordStageAttempt(stage.stageNumber);

    this.callbacks.onLoadingProgress(5, `Loading ${world.name} — Stage ${stage.stageNumber}...`);

    const enemyAssetIds = this.collectStageEnemyAssetIds(stage);
    await this.assets.preloadStage(stage, world, enemyAssetIds, profile.enableEnvMap, (done, total) => {
      const pct = Math.round(10 + (done / Math.max(1, total)) * 80);
      this.callbacks.onLoadingProgress(pct, `Loading 3D models (${done}/${total})...`);
    });

    this.callbacks.onLoadingProgress(94, `Building ${stage.name}...`);

    // Cleanly reset all stage subsystems (zero leak across repeated restarts)
    this.weapons.clear();
    this.weapons.setParticleBudget(profile.particleBudget);
    this.enemies.clear();
    this.enemies.setTrackWidth(stage.trackWidth);
    this.gates.clear();
    this.boss.clearBossModel();

    await this.stageDirector.buildStage(stage, world, profile);

    const stats = this.save.getPlayerStats();
    const startUnits = Math.min(stats.maxCapacity, stats.initialSquad + stage.initialSquadBonus);
    this.squad.initStage(
      startUnits,
      stats.maxCapacity,
      stats.unitHp,
      stats.unitDamage,
      stats.fireRate,
      stage.trackWidth,
      profile
    );
    this.gates.initStage(stage.gates, stage.obstacles, stage.gateAssetId, stage.trackWidth);
    this.boss.initStage(stage.boss, stage.waves[3].spawnZ, stage.trackWidth);
    this.waveDirector.initStage(stage);

    this.input.setBounds(stage.trackWidth * 0.5 - 1.1);
    this.input.reset(0);
    this.cameraCtrl.snapTo(0, 0);

    this.stageCoins = 0;
    this.enemiesDefeated = 0;
    this.stageElapsed = 0;
    this.victoryMarchTimer = 0;
    this.lastTargetX = null;
    this.lastTargetZ = null;
    this.accumulator = 0;

    this.callbacks.onLoadingProgress(100, 'Ready!');
    this.input.setEnabled(true);
    this.setMode('playing');
    this.emitHud();
    this.callbacks.onBanner(`STAGE ${stage.stageNumber}: ${stage.name.toUpperCase()}`, 'good');
  }

  public pause(): void {
    if (this.mode !== 'playing' && this.mode !== 'victory_march') return;
    this.input.setEnabled(false);
    this.setMode('paused');
  }

  public resume(): void {
    if (this.mode !== 'paused') return;
    this.input.setEnabled(true);
    this.lastTimestamp = performance.now();
    this.setMode(this.boss.defeated ? 'victory_march' : 'playing');
  }

  public async restartStage(): Promise<void> {
    if (!this.activeStage) return;
    await this.startStage(this.activeStage.stageNumber);
  }

  public returnToMenu(): void {
    this.input.setEnabled(false);
    this.weapons.clear();
    this.enemies.clear();
    this.boss.clearBossModel();
    this.gates.clear();
    this.squad.movingForward = false;
    this.squad.setCelebration(false);
    this.setMode('menu');
  }

  public applySettings(): void {
    const s = this.save.getSettings();
    this.audio.setVolumes(s.masterVolume, s.sfxVolume);
    this.cameraCtrl.setShakeEnabled(s.screenShake);
    this.perf.setPreset(s.quality);
    const profile = this.perf.getProfile();
    this.squad.applyQualityProfile(profile);
    this.weapons.setParticleBudget(profile.particleBudget);
  }

  public setQuality(preset: QualityPreset): void {
    this.save.updateSettings({ quality: preset });
    this.applySettings();
  }

  public getMode(): EngineMode {
    return this.mode;
  }

  private setMode(mode: EngineMode): void {
    this.mode = mode;
    this.callbacks.onModeChange(mode);
  }

  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.renderer.setSize(w, h);
    this.cameraCtrl.setAspect(w / h);
  };

  private onGlobalKey = (e: KeyboardEvent): void => {
    if (e.code === 'Escape') {
      if (this.mode === 'playing') this.pause();
      else if (this.mode === 'paused') this.resume();
    }
  };

  private loop = (now: number): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const rawDt = Math.min(0.1, Math.max(0, (now - this.lastTimestamp) / 1000));
    this.lastTimestamp = now;

    this.perf.sampleFrame(rawDt);

    if (this.mode === 'playing' || this.mode === 'victory_march') {
      this.accumulator += rawDt;
      let subSteps = 0;
      while (this.accumulator >= FIXED_DT && subSteps < 5) {
        this.fixedUpdate(FIXED_DT);
        this.accumulator -= FIXED_DT;
        subSteps++;
      }
      this.hudEmitTimer += rawDt;
      if (this.hudEmitTimer >= 0.08) {
        this.hudEmitTimer = 0;
        this.emitHud();
      }
    } else if (this.mode === 'menu') {
      this.menuAngle += rawDt * 0.25;
      this.squad.update(rawDt, 0, null, null);
      this.stageDirector.update(rawDt, 0);
      this.cameraCtrl.camera.position.set(
        Math.sin(this.menuAngle) * 7.5,
        8.2 + Math.sin(this.menuAngle * 0.7) * 0.6,
        -11.5
      );
      this.cameraCtrl.camera.lookAt(0, 1.5, 4);
    }

    this.renderer.render(this.scene, this.cameraCtrl.camera);
  };

  private fixedUpdate(dt: number): void {
    if (!this.activeStage) return;
    this.stageElapsed += dt;

    this.input.update(dt);

    // 1. Wave Director & Boss Arena lock check
    if (this.mode === 'playing') {
      this.waveDirector.update(this.squad.centerZ, this.enemies, this.boss, this.callbacks.onBanner);
      this.squad.movingForward = !this.waveDirector.bossArenaLocked;
    } else if (this.mode === 'victory_march') {
      this.squad.movingForward = true;
      this.victoryMarchTimer += dt;
    }

    // 2. Player Squad update (movement, formation interpolation, LOD animations)
    this.squad.update(dt, this.input.getTargetX(), this.lastTargetX, this.lastTargetZ);

    // 3. Gates & Obstacles
    this.gates.update(dt, this.squad, this.weapons, this.audio, this.callbacks.onBanner);

    // 4. Enemy AI & Boss State Machine
    this.enemies.update(dt, this.squad, this.weapons, this.audio);
    this.boss.update(dt, this.squad, this.weapons, this.enemies, this.audio, this.cameraCtrl);

    // 5. Weapons & Combat Simulation
    const combatRes = this.combat.update(
      dt,
      this.squad,
      this.enemies,
      this.boss,
      this.gates,
      this.weapons,
      this.audio,
      this.cameraCtrl,
      this.callbacks.onBanner
    );

    this.stageCoins += combatRes.coinsEarned;
    this.enemiesDefeated += combatRes.enemiesKilled;
    this.lastTargetX = combatRes.primaryTargetX;
    this.lastTargetZ = combatRes.primaryTargetZ;

    if (combatRes.bossKilled && this.mode === 'playing') {
      this.setMode('victory_march');
      this.squad.movingForward = true;
      this.callbacks.onBanner('BOSS DEFEATED! ADVANCE TO FINISH!', 'good');
      this.audio.play('sfx_victory', 0.9, 100);
    }

    // 6. Projectiles, particles, world animations, and camera
    this.weapons.update(dt);
    this.stageDirector.update(dt, this.squad.centerZ);
    this.cameraCtrl.update(
      dt,
      this.squad.centerX,
      this.squad.centerZ,
      this.squad.getCount(),
      this.boss.active && !this.boss.defeated
    );

    // 7. Win / Loss conditions
    if (this.squad.getCount() <= 0) {
      this.finishStage(false);
      return;
    }

    if (this.boss.defeated && this.squad.centerZ >= this.activeStage.trackLength - 1.2) {
      this.finishStage(true);
    }
  }

  private finishStage(victory: boolean): void {
    if (!this.activeStage || this.mode === 'ended') return;
    this.input.setEnabled(false);
    this.squad.movingForward = false;
    this.squad.setCelebration(victory);
    this.setMode('ended');

    const world = WORLDS[this.activeStage.worldId];
    const surviving = this.squad.getCount();
    let stars = 0;
    let totalCoins = Math.round(this.stageCoins * (victory ? 1.0 : 0.45));

    if (victory) {
      totalCoins += this.activeStage.rewardCoins;
      const startSquad = this.save.getPlayerStats().initialSquad + this.activeStage.initialSquadBonus;
      stars = surviving >= Math.max(12, startSquad * 1.4) ? 3 : surviving >= Math.max(5, startSquad * 0.7) ? 2 : 1;
      this.audio.play('sfx_victory', 0.95, 50);
    } else {
      this.audio.play('sfx_defeat', 0.9, 50);
    }

    this.save.recordStageResult(
      this.activeStage.stageNumber,
      victory,
      stars,
      totalCoins,
      surviving,
      this.stageElapsed
    );

    this.emitHud();
    this.callbacks.onStageEnd({
      victory,
      stageNumber: this.activeStage.stageNumber,
      stageName: this.activeStage.name,
      worldName: world.name,
      stars,
      coinsEarned: totalCoins,
      enemiesDefeated: this.enemiesDefeated,
      survivingSquad: surviving,
      durationSec: this.stageElapsed,
      hasNextStage: this.activeStage.stageNumber < 30
    });
  }

  private emitHud(): void {
    if (!this.activeStage) return;
    const world = WORLDS[this.activeStage.worldId];
    const progress = Math.max(0, Math.min(1, this.squad.centerZ / this.activeStage.trackLength));
    this.callbacks.onHudUpdate({
      stageNumber: this.activeStage.stageNumber,
      stageName: this.activeStage.name,
      worldName: world.name,
      waveNumber: this.waveDirector.currentWave,
      totalWaves: 4,
      waveLabel: this.waveDirector.currentWaveLabel,
      squadCount: this.squad.getCount(),
      maxSquad: this.squad.maxCapacity,
      coins: this.save.getData().coins + this.stageCoins,
      stageCoins: this.stageCoins,
      progress,
      damageBuffPct: Math.round((this.squad.damageMultiplier - 1) * 100),
      rateBuffPct: Math.round((this.squad.fireRateMultiplier - 1) * 100),
      bossActive: this.boss.active && !this.boss.defeated,
      bossName: this.activeStage.boss.name,
      bossHp: Math.ceil(this.boss.hp),
      bossMaxHp: this.boss.maxHp,
      bossPhase: this.boss.phase,
      bossWarning: this.boss.warningText,
      fps: this.perf.getFps(),
      quality: this.perf.getPreset()
    });
  }

  public dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onGlobalKey);
    this.input.dispose();
    this.squad.dispose();
    this.weapons.dispose(this.scene);
    this.gates.dispose();
    this.enemies.dispose();
    this.boss.dispose();
    this.stageDirector.dispose();
    this.assets.dispose();
    this.renderer.dispose();
  }
}
