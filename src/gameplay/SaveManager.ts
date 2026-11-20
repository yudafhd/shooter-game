import type { GameSettings, QualityPreset, SaveData, StageRecord, UpgradeLevels } from '../types/game';

const STORAGE_KEY = 'crowd_siege_3d_save_v1';

export interface UpgradeSpec {
  key: keyof UpgradeLevels;
  title: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
  formatValue: (level: number) => string;
}

export const UPGRADE_SPECS: UpgradeSpec[] = [
  {
    key: 'initialSquad',
    title: 'Initial Squad Size',
    description: 'Start every stage with more troopers on the field.',
    maxLevel: 15,
    baseCost: 70,
    costMultiplier: 1.42,
    formatValue: (lvl) => `${6 + lvl * 2} units`
  },
  {
    key: 'unitDamage',
    title: 'Unit Damage',
    description: 'Increase weapon firepower for every trooper.',
    maxLevel: 15,
    baseCost: 85,
    costMultiplier: 1.44,
    formatValue: (lvl) => `${Math.round(14 + lvl * 5)} DMG`
  },
  {
    key: 'fireRate',
    title: 'Fire Rate',
    description: 'Boost firing cadence across the entire squad.',
    maxLevel: 15,
    baseCost: 90,
    costMultiplier: 1.45,
    formatValue: (lvl) => `${(2.6 + lvl * 0.24).toFixed(2)} /s`
  },
  {
    key: 'maxCapacity',
    title: 'Max Squad Capacity',
    description: 'Raise the troop ceiling up to 120 warriors.',
    maxLevel: 10,
    baseCost: 110,
    costMultiplier: 1.48,
    formatValue: (lvl) => `${Math.min(120, 40 + lvl * 8)} max`
  }
];

function detectDefaultQuality(): QualityPreset {
  if (typeof window === 'undefined') return 'medium';
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile || cores <= 4) return 'low';
  if (cores >= 8) return 'high';
  return 'medium';
}

export function createDefaultSave(): SaveData {
  return {
    version: 1,
    unlockedStage: 1,
    lastPlayedStage: 1,
    coins: 0,
    upgrades: {
      initialSquad: 0,
      unitDamage: 0,
      fireRate: 0,
      maxCapacity: 0
    },
    stages: {},
    settings: {
      quality: detectDefaultQuality(),
      masterVolume: 0.75,
      sfxVolume: 0.85,
      screenShake: true,
      showFps: false
    }
  };
}

export class SaveManager {
  private data: SaveData;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    const def = createDefaultSave();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return def;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return {
        version: 1,
        unlockedStage: Math.max(1, Math.min(30, Number(parsed.unlockedStage) || 1)),
        lastPlayedStage: Math.max(1, Math.min(30, Number(parsed.lastPlayedStage) || 1)),
        coins: Math.max(0, Math.floor(Number(parsed.coins) || 0)),
        upgrades: {
          initialSquad: Math.max(0, Math.min(15, Number(parsed.upgrades?.initialSquad) || 0)),
          unitDamage: Math.max(0, Math.min(15, Number(parsed.upgrades?.unitDamage) || 0)),
          fireRate: Math.max(0, Math.min(15, Number(parsed.upgrades?.fireRate) || 0)),
          maxCapacity: Math.max(0, Math.min(10, Number(parsed.upgrades?.maxCapacity) || 0))
        },
        stages: parsed.stages && typeof parsed.stages === 'object' ? parsed.stages : {},
        settings: {
          quality: parsed.settings?.quality || def.settings.quality,
          masterVolume:
            typeof parsed.settings?.masterVolume === 'number'
              ? parsed.settings.masterVolume
              : def.settings.masterVolume,
          sfxVolume:
            typeof parsed.settings?.sfxVolume === 'number'
              ? parsed.settings.sfxVolume
              : def.settings.sfxVolume,
          screenShake:
            typeof parsed.settings?.screenShake === 'boolean'
              ? parsed.settings.screenShake
              : def.settings.screenShake,
          showFps:
            typeof parsed.settings?.showFps === 'boolean'
              ? parsed.settings.showFps
              : def.settings.showFps
        }
      };
    } catch {
      return def;
    }
  }

  public save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore storage quota errors in private browsing
    }
  }

  public getData(): SaveData {
    return this.data;
  }

  public getSettings(): GameSettings {
    return this.data.settings;
  }

  public updateSettings(partial: Partial<GameSettings>): void {
    this.data.settings = { ...this.data.settings, ...partial };
    this.save();
  }

  public getUpgradeCost(key: keyof UpgradeLevels): number {
    const spec = UPGRADE_SPECS.find((s) => s.key === key)!;
    const level = this.data.upgrades[key];
    return Math.round(spec.baseCost * Math.pow(spec.costMultiplier, level));
  }

  public canBuyUpgrade(key: keyof UpgradeLevels): boolean {
    const spec = UPGRADE_SPECS.find((s) => s.key === key)!;
    const level = this.data.upgrades[key];
    return level < spec.maxLevel && this.data.coins >= this.getUpgradeCost(key);
  }

  public buyUpgrade(key: keyof UpgradeLevels): boolean {
    if (!this.canBuyUpgrade(key)) return false;
    const cost = this.getUpgradeCost(key);
    this.data.coins -= cost;
    this.data.upgrades[key] += 1;
    this.save();
    return true;
  }

  public getPlayerStats() {
    const u = this.data.upgrades;
    return {
      initialSquad: 6 + u.initialSquad * 2,
      unitDamage: 14 + u.unitDamage * 5,
      fireRate: 2.6 + u.fireRate * 0.24,
      maxCapacity: Math.min(120, 40 + u.maxCapacity * 8),
      unitHp: 32 + Math.floor(u.initialSquad * 2.5)
    };
  }

  public recordStageAttempt(stageNumber: number): void {
    this.data.lastPlayedStage = Math.max(1, Math.min(30, stageNumber));
    this.save();
  }

  public recordStageResult(
    stageNumber: number,
    victory: boolean,
    stars: number,
    coinsEarned: number,
    survivingSquad: number,
    durationSec: number
  ): void {
    this.data.coins += Math.max(0, Math.round(coinsEarned));
    this.data.lastPlayedStage = stageNumber;
    if (victory) {
      if (stageNumber >= this.data.unlockedStage && stageNumber < 30) {
        this.data.unlockedStage = stageNumber + 1;
      }
      const prev: StageRecord | undefined = this.data.stages[stageNumber];
      this.data.stages[stageNumber] = {
        completed: true,
        stars: Math.max(prev?.stars ?? 0, stars),
        bestSquad: Math.max(prev?.bestSquad ?? 0, survivingSquad),
        bestTimeSec: prev ? Math.min(prev.bestTimeSec, durationSec) : durationSec
      };
    }
    this.save();
  }

  public resetProgress(): void {
    const settings = { ...this.data.settings };
    this.data = createDefaultSave();
    this.data.settings = settings;
    this.save();
  }
}
