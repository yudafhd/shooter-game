import type * as THREE from 'three';
import type { QualityPreset } from '../types/game';

export interface QualityProfile {
  preset: QualityPreset;
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  maxSkinnedTroopers: number;
  maxVisualTroopers: number;
  animUpdateStep: number; // Update distant mixers every N ticks
  particleBudget: number;
  propDensity: number; // 0.5..1.0
  enableEnvMap: boolean;
}

const PROFILES: Record<QualityPreset, QualityProfile> = {
  low: {
    preset: 'low',
    maxPixelRatio: 1.0,
    shadows: false,
    shadowMapSize: 512,
    maxSkinnedTroopers: 14,
    maxVisualTroopers: 44,
    animUpdateStep: 2,
    particleBudget: 40,
    propDensity: 0.55,
    enableEnvMap: false
  },
  medium: {
    preset: 'medium',
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    maxSkinnedTroopers: 24,
    maxVisualTroopers: 75,
    animUpdateStep: 1,
    particleBudget: 90,
    propDensity: 0.8,
    enableEnvMap: true
  },
  high: {
    preset: 'high',
    maxPixelRatio: 2.0,
    shadows: true,
    shadowMapSize: 2048,
    maxSkinnedTroopers: 34,
    maxVisualTroopers: 120,
    animUpdateStep: 1,
    particleBudget: 150,
    propDensity: 1.0,
    enableEnvMap: true
  }
};

export class PerformanceManager {
  private preset: QualityPreset;
  private renderer: THREE.WebGLRenderer;
  private fpsSamples: number[] = [];
  private currentFps = 60;
  private dynamicScale = 1.0;
  private scaleCheckTimer = 0;

  constructor(renderer: THREE.WebGLRenderer, initialPreset: QualityPreset) {
    this.renderer = renderer;
    this.preset = initialPreset;
    this.applyRendererSettings();
  }

  public setPreset(preset: QualityPreset): void {
    this.preset = preset;
    this.dynamicScale = 1.0;
    this.applyRendererSettings();
  }

  public getPreset(): QualityPreset {
    return this.preset;
  }

  public getProfile(): QualityProfile {
    return PROFILES[this.preset];
  }

  public getFps(): number {
    return Math.round(this.currentFps);
  }

  public applyRendererSettings(): void {
    const profile = PROFILES[this.preset];
    const dpr = Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio) * this.dynamicScale;
    this.renderer.setPixelRatio(Math.max(0.65, dpr));
    this.renderer.shadowMap.enabled = profile.shadows;
  }

  public sampleFrame(dt: number): void {
    if (dt <= 0.0001 || dt > 0.5) return;
    const instantFps = 1 / dt;
    this.fpsSamples.push(instantFps);
    if (this.fpsSamples.length > 30) this.fpsSamples.shift();

    let sum = 0;
    for (let i = 0; i < this.fpsSamples.length; i++) sum += this.fpsSamples[i];
    this.currentFps = sum / this.fpsSamples.length;

    // Dynamic resolution scaling to hold 60 FPS desktop / >=30 FPS mobile
    this.scaleCheckTimer += dt;
    if (this.scaleCheckTimer >= 2.5 && this.fpsSamples.length >= 20) {
      this.scaleCheckTimer = 0;
      const targetMin = this.preset === 'low' ? 29 : 42;
      const targetGood = this.preset === 'low' ? 45 : 55;
      if (this.currentFps < targetMin && this.dynamicScale > 0.72) {
        this.dynamicScale = Math.max(0.7, this.dynamicScale - 0.12);
        this.applyRendererSettings();
      } else if (this.currentFps > targetGood && this.dynamicScale < 1.0) {
        this.dynamicScale = Math.min(1.0, this.dynamicScale + 0.08);
        this.applyRendererSettings();
      }
    }
  }
}
