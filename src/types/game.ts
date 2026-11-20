export type QualityPreset = 'low' | 'medium' | 'high';

export type WorldId =
  | 'ocean_crossing'
  | 'overgrown_ruins'
  | 'dust_outpost'
  | 'frozen_pass'
  | 'inferno_citadel';

export type EnemyBehavior = 'melee' | 'ranged' | 'flanker' | 'charger';

export type EnemyState = 'idle' | 'move' | 'attack' | 'hit' | 'death';

export type WaveKind = 'normal' | 'mixed' | 'elite' | 'boss';

export type BossPatternType =
  | 'area_slam'
  | 'projectile_barrage'
  | 'summon_minions'
  | 'charge_rush';

export type GateEffectType = 'add' | 'sub' | 'mul' | 'damage_buff' | 'rate_buff' | 'heal';

export interface GateOptionConfig {
  type: GateEffectType;
  value: number;
  label: string;
}

export interface GateRowConfig {
  z: number;
  left: GateOptionConfig;
  right: GateOptionConfig;
}

export type ObstacleKind = 'saw' | 'spikes' | 'barrel' | 'crate';

export interface ObstacleConfig {
  z: number;
  x: number;
  kind: ObstacleKind;
  assetId: string;
  damage: number;
  hp?: number;
  patrolWidth?: number;
  patrolSpeed?: number;
}

export interface WaveSpawnGroup {
  enemyId: string;
  count: number;
  isElite?: boolean;
  spreadX?: number;
}

export interface WaveConfig {
  waveNumber: 1 | 2 | 3 | 4;
  kind: WaveKind;
  triggerZ: number;
  spawnZ: number;
  groups: WaveSpawnGroup[];
  eliteModifier?: {
    hpMultiplier: number;
    damageMultiplier: number;
    scaleMultiplier: number;
    cleaveRadius: number;
  };
}

export interface BossStageConfig {
  bossId: string;
  assetId: string;
  name: string;
  hp: number;
  damage: number;
  scale: number;
  attackCooldown: number;
  patterns: BossPatternType[];
  hasPhaseTwo: boolean;
  summonEnemyId: string;
  summonCount: number;
  rewardCoins: number;
  tintHex?: string;
}

export interface StageConfig {
  stageNumber: number;
  name: string;
  worldId: WorldId;
  isWorldFinale: boolean;
  arenaAssetId: string;
  gateAssetId: string;
  goalAssetId: string;
  initialSquadBonus: number;
  trackLength: number;
  trackWidth: number;
  gates: GateRowConfig[];
  obstacles: ObstacleConfig[];
  waves: WaveConfig[];
  boss: BossStageConfig;
  rewardCoins: number;
}

export interface WorldConfig {
  id: WorldId;
  index: number;
  name: string;
  subtitle: string;
  stageRange: [number, number];
  hdriId: string;
  trackAssetId: string;
  altTrackAssetId: string;
  sidePropIds: string[];
  accentPropIds: string[];
  skyColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambientColor: string;
  ambientIntensity: number;
  sunColor: string;
  sunIntensity: number;
  floorPlaneColor: string;
  floorPlaneEmissive?: string;
  trackTint?: string;
  trackRoughness: number;
  waterMode: 'ocean' | 'moss' | 'sand' | 'snow' | 'lava';
}

export interface EnemyDefinition {
  id: string;
  name: string;
  assetId: string;
  behavior: EnemyBehavior;
  baseHp: number;
  baseDamage: number;
  moveSpeed: number;
  attackRange: number;
  attackCooldown: number;
  scale: number;
  radius: number;
  coinValue: number;
  projectileSpeed?: number;
  tintHex?: string;
}

export interface ModelAssetEntry {
  id: string;
  category: string;
  source: string;
  owner: string;
  license: string;
  originUrl: string;
  path: string;
  sizeBytes: number;
  meshCount: number;
  hasSkins: boolean;
  animations: string[];
  bounds: { width: number; height: number; depth: number } | null;
}

export interface AudioAssetEntry {
  id: string;
  source: string;
  owner: string;
  license: string;
  originUrl: string;
  originalFile: string;
  path: string;
  sizeBytes: number;
}

export interface HdriAssetEntry {
  id: string;
  world: string;
  source: string;
  owner: string;
  license: string;
  originUrl: string;
  path: string;
  sizeBytes: number;
}

export interface AssetManifest {
  version: string;
  generatedAt: string;
  models: Record<string, ModelAssetEntry>;
  audio: Record<string, AudioAssetEntry>;
  hdris: Record<string, HdriAssetEntry>;
}

export interface UpgradeLevels {
  initialSquad: number;
  unitDamage: number;
  fireRate: number;
  maxCapacity: number;
}

export interface StageRecord {
  completed: boolean;
  stars: number;
  bestSquad: number;
  bestTimeSec: number;
}

export interface GameSettings {
  quality: QualityPreset;
  masterVolume: number;
  sfxVolume: number;
  screenShake: boolean;
  showFps: boolean;
}

export interface SaveData {
  version: number;
  unlockedStage: number;
  lastPlayedStage: number;
  coins: number;
  upgrades: UpgradeLevels;
  stages: Record<number, StageRecord>;
  settings: GameSettings;
}

export interface HUDState {
  stageNumber: number;
  stageName: string;
  worldName: string;
  waveNumber: number;
  totalWaves: number;
  waveLabel: string;
  squadCount: number;
  maxSquad: number;
  coins: number;
  stageCoins: number;
  progress: number; // 0..1
  damageBuffPct: number;
  rateBuffPct: number;
  bossActive: boolean;
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  bossPhase: 1 | 2;
  bossWarning: string;
  ultCharge: number; // 0..100
  ultReady: boolean;
  ultStatus: 'charging' | 'ready' | 'launching' | 'inbound';
  fps: number;
  quality: QualityPreset;
}

export interface StageResult {
  victory: boolean;
  stageNumber: number;
  stageName: string;
  worldName: string;
  stars: number;
  coinsEarned: number;
  enemiesDefeated: number;
  survivingSquad: number;
  durationSec: number;
  hasNextStage: boolean;
}
