import * as THREE from 'three';
import { AssetRegistry, disposeObject3D } from '../engine/AssetRegistry';
import type { QualityProfile } from '../engine/PerformanceManager';
import { CrowdFormation } from './CrowdFormation';

export interface SquadUnit {
  id: number;
  alive: boolean;
  hp: number;
  maxHp: number;
  x: number;
  z: number;
  fireTimer: number;
  hitFlash: number;
  stridePhase: number;
}

interface SkinnedVisualSlot {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: {
    run: THREE.AnimationAction | null;
    idle: THREE.AnimationAction | null;
    victory: THREE.AnimationAction | null;
  };
  currentAnim: 'run' | 'idle' | 'victory';
}

interface RigidVisualSlot {
  root: THREE.Group;
}

export class PlayerSquadController {
  private scene: THREE.Scene;
  private assets: AssetRegistry;
  private formation: CrowdFormation;
  private group = new THREE.Group();

  private units: SquadUnit[] = [];
  private nextUnitId = 1;

  // LOD Tier 1: Real skinned & animated Quaternius troopers (Commander + Vanguard)
  private skinnedPool: SkinnedVisualSlot[] = [];
  // LOD Tier 2: Real Quaternius 3D trooper clones with lightweight stride bob (zero skinning CPU cost!)
  private rigidPool: RigidVisualSlot[] = [];

  private maxSkinnedVisual = 24;
  private maxTotalVisual = 75;
  private animFrameCounter = 0;
  private animUpdateStep = 1;

  public centerX = 0;
  public centerZ = 0;
  public forwardSpeed = 4.2;
  public movingForward = true;
  public maxCapacity = 40;
  public baseUnitHp = 32;
  public baseUnitDamage = 14;
  public baseFireRate = 2.6;
  public damageMultiplier = 1.0;
  public fireRateMultiplier = 1.0;
  public trackHalfWidth = 5.4;

  private celebrationMode = false;

  constructor(scene: THREE.Scene, assets: AssetRegistry) {
    this.scene = scene;
    this.assets = assets;
    this.formation = new CrowdFormation(120);
    this.scene.add(this.group);
  }

  public initStage(
    initialCount: number,
    maxCapacity: number,
    unitHp: number,
    unitDamage: number,
    fireRate: number,
    trackWidth: number,
    profile: QualityProfile
  ): void {
    this.clearVisuals();
    this.units = [];
    this.nextUnitId = 1;
    this.centerX = 0;
    this.centerZ = 0;
    this.movingForward = true;
    this.celebrationMode = false;

    this.maxCapacity = Math.min(120, Math.max(10, maxCapacity));
    this.baseUnitHp = unitHp;
    this.baseUnitDamage = unitDamage;
    this.baseFireRate = fireRate;
    this.damageMultiplier = 1.0;
    this.fireRateMultiplier = 1.0;
    this.trackHalfWidth = trackWidth * 0.5 - 0.85;

    this.maxSkinnedVisual = profile.maxSkinnedTroopers;
    this.maxTotalVisual = Math.min(120, profile.maxVisualTroopers);
    this.animUpdateStep = profile.animUpdateStep;

    this.addUnits(initialCount);
  }

  public applyQualityProfile(profile: QualityProfile): void {
    this.maxSkinnedVisual = profile.maxSkinnedTroopers;
    this.maxTotalVisual = Math.min(120, profile.maxVisualTroopers);
    this.animUpdateStep = profile.animUpdateStep;
  }

  private ensureVisualPools(neededCount: number): void {
    const visualTarget = Math.min(neededCount, this.maxTotalVisual);
    const skinnedTarget = Math.min(visualTarget, this.maxSkinnedVisual);

    while (this.skinnedPool.length < skinnedTarget) {
      const idx = this.skinnedPool.length;
      const isCommander = idx === 0;
      const assetId = isCommander ? 'char_commander' : 'char_soldier';
      const height = isCommander ? 1.82 : 1.56;
      const { root, model, asset } = this.assets.instantiateModel(assetId, height, {
        castShadow: idx < 16,
        receiveShadow: false
      });

      const mixer = new THREE.AnimationMixer(model);
      const runClip = AssetRegistry.pickClip(asset.animations, ['Run_Shoot', 'Run_Gun', 'Run']);
      const idleClip = AssetRegistry.pickClip(asset.animations, ['Idle_Shoot', 'Idle_Gun_Shoot', 'Idle_Gun', 'Idle']);
      const victoryClip = AssetRegistry.pickClip(asset.animations, ['Yes', 'Wave', 'Jump', 'Idle']);

      const runAction = runClip ? mixer.clipAction(runClip) : null;
      const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
      const victoryAction = victoryClip ? mixer.clipAction(victoryClip) : null;

      if (runAction) {
        runAction.timeScale = 0.85 + (idx % 5) * 0.03;
        runAction.play();
        // Desynchronize trooper footsteps so crowd looks organic
        mixer.update((idx * 0.13) % 0.8);
      }

      root.visible = false;
      this.group.add(root);
      this.skinnedPool.push({
        root,
        mixer,
        actions: { run: runAction, idle: idleAction, victory: victoryAction },
        currentAnim: 'run'
      });
    }

    const rigidNeeded = Math.max(0, visualTarget - this.maxSkinnedVisual);
    while (this.rigidPool.length < rigidNeeded) {
      // Real Quaternius soldier GLB instantiated in static LOD pose (no AnimationMixer overhead!)
      const { root } = this.assets.instantiateModel('char_soldier', 1.5, {
        castShadow: false,
        receiveShadow: false
      });
      root.visible = false;
      this.group.add(root);
      this.rigidPool.push({ root });
    }
  }

  public addUnits(count: number): number {
    const allowed = Math.max(0, Math.min(count, this.maxCapacity - this.units.length));
    for (let i = 0; i < allowed; i++) {
      const slot = this.formation.getSlot(this.units.length, this.units.length + 1);
      this.units.push({
        id: this.nextUnitId++,
        alive: true,
        hp: this.baseUnitHp,
        maxHp: this.baseUnitHp,
        x: this.centerX + slot.offsetX,
        z: this.centerZ + slot.offsetZ,
        fireTimer: Math.random() * (1 / this.getEffectiveFireRate()),
        hitFlash: 0,
        stridePhase: Math.random() * Math.PI * 2
      });
    }
    this.ensureVisualPools(this.units.length);
    return allowed;
  }

  public removeUnits(count: number): number {
    const toRemove = Math.min(count, this.units.length);
    for (let i = 0; i < toRemove; i++) {
      this.units.pop();
    }
    return toRemove;
  }

  public healAll(fraction: number): void {
    for (const u of this.units) {
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * fraction);
    }
  }

  public getCount(): number {
    return this.units.length;
  }

  public getUnits(): SquadUnit[] {
    return this.units;
  }

  public getEffectiveDamage(): number {
    return this.baseUnitDamage * this.damageMultiplier;
  }

  public getEffectiveFireRate(): number {
    return this.baseFireRate * this.fireRateMultiplier;
  }

  public getSquadRadius(): number {
    return this.formation.getBoundingRadius(this.units.length);
  }

  public setCelebration(active: boolean): void {
    this.celebrationMode = active;
  }

  /**
   * Apply damage to specific units within radius of an attack point (or nearest unit).
   * Returns number of units killed.
   */
  public applyDamageAt(
    worldX: number,
    worldZ: number,
    damage: number,
    radius: number,
    maxTargets = 1
  ): { killed: number; hitPos: THREE.Vector3 | null } {
    if (this.units.length === 0) return { killed: 0, hitPos: null };

    // Sort candidate indices by distance to impact point (protecting slot 0 Commander slightly last)
    const candidates: Array<{ idx: number; d2: number }> = [];
    const r2 = radius * radius;
    for (let i = 0; i < this.units.length; i++) {
      const u = this.units[i];
      const dx = u.x - worldX;
      const dz = u.z - worldZ;
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2) {
        candidates.push({ idx: i, d2 });
      }
    }

    if (candidates.length === 0) {
      // Fallback to closest unit if radius was small
      let bestIdx = -1;
      let bestD2 = Infinity;
      for (let i = 0; i < this.units.length; i++) {
        const u = this.units[i];
        const d2 = (u.x - worldX) ** 2 + (u.z - worldZ) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestD2 <= (radius + 1.5) ** 2) {
        candidates.push({ idx: bestIdx, d2: bestD2 });
      }
    }

    candidates.sort((a, b) => a.d2 - b.d2);
    const hits = candidates.slice(0, maxTargets);
    let killed = 0;
    let hitPos: THREE.Vector3 | null = null;

    for (const h of hits) {
      const u = this.units[h.idx];
      u.hp -= damage;
      u.hitFlash = 0.2;
      if (!hitPos) hitPos = new THREE.Vector3(u.x, 1.0, u.z);
      if (u.hp <= 0) {
        u.alive = false;
        killed++;
      }
    }

    if (killed > 0) {
      this.units = this.units.filter((u) => u.alive);
    }
    return { killed, hitPos };
  }

  public update(dt: number, inputTargetX: number, aimTargetX: number | null, aimTargetZ: number | null): void {
    // 1. Advance squad center & steer horizontally
    const radius = this.getSquadRadius();
    const clampBound = Math.max(1.2, this.trackHalfWidth - Math.min(2.2, radius * 0.48));
    const clampedTargetX = Math.max(-clampBound, Math.min(clampBound, inputTargetX));

    const steerSmooth = 1 - Math.exp(-11.0 * dt);
    this.centerX += (clampedTargetX - this.centerX) * steerSmooth;
    if (this.movingForward) {
      this.centerZ += this.forwardSpeed * dt;
    }

    // 2. Interpolate individual trooper formation positions
    const count = this.units.length;
    const slotSmooth = 1 - Math.exp(-10.5 * dt);
    for (let i = 0; i < count; i++) {
      const u = this.units[i];
      const slot = this.formation.getSlot(i, count);
      const desiredX = Math.max(
        -this.trackHalfWidth,
        Math.min(this.trackHalfWidth, this.centerX + slot.offsetX)
      );
      const desiredZ = this.centerZ + slot.offsetZ;
      u.x += (desiredX - u.x) * slotSmooth;
      u.z += (desiredZ - u.z) * slotSmooth;
      u.hitFlash = Math.max(0, u.hitFlash - dt);
      u.stridePhase += dt * (this.movingForward ? 7.6 : 3.0);
    }

    // 3. Sync LOD visuals (Tier 1 skinned + Tier 2 rigid clones)
    this.ensureVisualPools(count);
    this.animFrameCounter++;

    const desiredAnim: 'run' | 'idle' | 'victory' = this.celebrationMode
      ? 'victory'
      : this.movingForward
        ? 'run'
        : 'idle';

    const visualCount = Math.min(count, this.maxTotalVisual);
    const skinnedActive = Math.min(visualCount, this.maxSkinnedVisual);

    for (let i = 0; i < this.skinnedPool.length; i++) {
      const v = this.skinnedPool[i];
      if (i < skinnedActive) {
        const u = this.units[i];
        v.root.visible = true;
        v.root.position.set(u.x, 0, u.z);

        // Face forward (+Z) or slightly toward active combat target
        let yaw = 0;
        if (aimTargetX !== null && aimTargetZ !== null && aimTargetZ > u.z - 2) {
          yaw = Math.atan2(aimTargetX - u.x, Math.max(1, aimTargetZ - u.z));
          yaw = Math.max(-0.55, Math.min(0.55, yaw));
        }
        v.root.rotation.y = yaw;

        if (v.currentAnim !== desiredAnim) {
          this.switchAnim(v, desiredAnim);
        }

        // Animation LOD: update near units every frame, back-row skinned units at reduced frequency on Low preset
        if (i < 10 || this.animFrameCounter % this.animUpdateStep === i % this.animUpdateStep) {
          v.mixer.update(i < 10 ? dt : dt * this.animUpdateStep);
        }
      } else {
        v.root.visible = false;
      }
    }

    for (let i = 0; i < this.rigidPool.length; i++) {
      const unitIdx = this.maxSkinnedVisual + i;
      const r = this.rigidPool[i];
      if (unitIdx < visualCount) {
        const u = this.units[unitIdx];
        r.root.visible = true;
        const bobY = this.movingForward ? Math.abs(Math.sin(u.stridePhase)) * 0.14 : 0;
        r.root.position.set(u.x, bobY, u.z);
        r.root.rotation.z = this.movingForward ? Math.sin(u.stridePhase) * 0.06 : 0;
        r.root.rotation.y = 0;
      } else {
        r.root.visible = false;
      }
    }
  }

  private switchAnim(slot: SkinnedVisualSlot, next: 'run' | 'idle' | 'victory'): void {
    const prevAction = slot.actions[slot.currentAnim];
    const nextAction = slot.actions[next] || slot.actions.run || slot.actions.idle;
    slot.currentAnim = next;
    if (!nextAction || prevAction === nextAction) return;
    nextAction.reset().fadeIn(0.16).play();
    if (prevAction) prevAction.fadeOut(0.16);
  }

  public clearVisuals(): void {
    for (const s of this.skinnedPool) {
      s.mixer.stopAllAction();
      this.group.remove(s.root);
      disposeObject3D(s.root, true);
    }
    for (const r of this.rigidPool) {
      this.group.remove(r.root);
      disposeObject3D(r.root, true);
    }
    this.skinnedPool = [];
    this.rigidPool = [];
  }

  public dispose(): void {
    this.clearVisuals();
    this.scene.remove(this.group);
  }
}
