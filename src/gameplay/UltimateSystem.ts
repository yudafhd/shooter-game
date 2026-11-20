import * as THREE from 'three';
import { AssetRegistry, disposeObject3D } from '../engine/AssetRegistry';
import type { PlayerSquadController } from './PlayerSquadController';
import type { EnemyAIManager } from './EnemyAI';
import type { BossStateMachine } from './BossStateMachine';
import type { GateManager } from './GateManager';
import type { WeaponSystem } from './WeaponSystem';
import type { AudioManager } from '../engine/AudioManager';
import type { CameraController } from '../engine/CameraController';

export type UltFlightStatus = 'charging' | 'ready' | 'launching' | 'inbound';

export interface UltTickResult {
  coinsEarned: number;
  enemiesKilled: number;
  bossKilled: boolean;
}

interface ShockwaveFx {
  ring: THREE.Mesh;
  core: THREE.Mesh;
  age: number;
  maxAge: number;
}

// 3-Stage Choreography right above the player's squad:
// 1. Slow vertical rise above the character ("dari bawah ke atas pelan")
const RISE_DURATION = 0.90;
// 2. Hover & tilt forward aiming at target above the character ("lalu miring")
const TILT_DURATION = 0.65;
// 3. Blazing high-speed surge into enemies/boss ("dan menerjang")
const SURGE_DURATION = 0.52;
const TOTAL_FLIGHT = RISE_DURATION + TILT_DURATION + SURGE_DURATION;

const HOVER_HEIGHT = 5.6;
const BLAST_RADIUS = 8.0;

export class UltimateSystem {
  private scene: THREE.Scene;
  private assets: AssetRegistry;
  private group = new THREE.Group();

  public charge = 50; // 0..100
  private flying = false;
  private flightTime = 0;
  private surgeStarted = false;

  private rocketPivot: THREE.Group | null = null;
  private rocketModelWrap: THREE.Group | null = null;
  private flameOuter: THREE.Mesh;
  private flameInner: THREE.Mesh;
  private noseGlow: THREE.Mesh;

  private surgeStartPos = new THREE.Vector3();
  private targetPos = new THREE.Vector3();
  private currentPos = new THREE.Vector3();
  private trailTimer = 0;
  private lockedOnBoss = false;

  // Tactical ground reticle
  private reticleGroup = new THREE.Group();
  private reticleOuter: THREE.Mesh;
  private reticleInner: THREE.Mesh;
  private reticlePulse: THREE.Mesh;

  // Expanding detonation shockwaves
  private shockwaves: ShockwaveFx[] = [];
  private sharedRingGeo = new THREE.RingGeometry(0.72, 1.0, 40);
  private sharedCoreGeo = new THREE.SphereGeometry(1.0, 16, 12);

  // Poly Pizza CC0 Rocket nose points along local +Y
  private upAxis = new THREE.Vector3(0, 1, 0);
  private dirVec = new THREE.Vector3();
  private uprightQuat = new THREE.Quaternion();
  private targetQuat = new THREE.Quaternion();

  constructor(scene: THREE.Scene, assets: AssetRegistry) {
    this.scene = scene;
    this.assets = assets;
    this.sharedRingGeo.rotateX(-Math.PI / 2);

    // Layered blazing thruster flames pointing downward (-Y) from rocket tail
    const outerFlameGeo = new THREE.ConeGeometry(0.55, 2.3, 10);
    outerFlameGeo.rotateX(Math.PI); // Tip points toward -Y
    this.flameOuter = new THREE.Mesh(
      outerFlameGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff6d00,
        transparent: true,
        opacity: 0.88
      })
    );

    const innerFlameGeo = new THREE.ConeGeometry(0.3, 1.5, 8);
    innerFlameGeo.rotateX(Math.PI);
    this.flameInner = new THREE.Mesh(
      innerFlameGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfff59d,
        transparent: true,
        opacity: 0.95
      })
    );

    // Fiery reentry heat-halo around rocket nose during high-speed surge
    const glowGeo = new THREE.SphereGeometry(0.92, 14, 10);
    this.noseGlow = new THREE.Mesh(
      glowGeo,
      new THREE.MeshBasicMaterial({
        color: 0xff9100,
        transparent: true,
        opacity: 0.0,
        depthWrite: false
      })
    );

    // Ground tactical target reticle
    const outerGeo = new THREE.RingGeometry(BLAST_RADIUS * 0.88, BLAST_RADIUS, 44);
    outerGeo.rotateX(-Math.PI / 2);
    this.reticleOuter = new THREE.Mesh(
      outerGeo,
      new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

    const innerGeo = new THREE.RingGeometry(1.2, 1.68, 28);
    innerGeo.rotateX(-Math.PI / 2);
    this.reticleInner = new THREE.Mesh(
      innerGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

    const fillGeo = new THREE.CircleGeometry(BLAST_RADIUS, 40);
    fillGeo.rotateX(-Math.PI / 2);
    this.reticlePulse = new THREE.Mesh(
      fillGeo,
      new THREE.MeshBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );

    this.reticleGroup.add(this.reticleOuter, this.reticleInner, this.reticlePulse);
    this.reticleGroup.visible = false;

    this.group.add(this.reticleGroup);
    this.scene.add(this.group);
  }

  public initStage(): void {
    this.clearActive();
    this.charge = 50;
  }

  public addCharge(amount: number): void {
    if (this.flying) return;
    this.charge = Math.min(100, this.charge + amount);
  }

  public isReady(): boolean {
    return !this.flying && this.charge >= 100;
  }

  public getStatus(): UltFlightStatus {
    if (!this.flying) {
      return this.charge >= 100 ? 'ready' : 'charging';
    }
    return this.flightTime < RISE_DURATION + TILT_DURATION ? 'launching' : 'inbound';
  }

  public trigger(
    squad: PlayerSquadController,
    enemies: EnemyAIManager,
    boss: BossStateMachine,
    weapons: WeaponSystem,
    audio: AudioManager,
    camera: CameraController,
    onBanner?: (text: string, tone: 'good' | 'bad' | 'buff') => void
  ): boolean {
    if (!this.isReady()) return false;

    this.charge = 0;
    this.flying = true;
    this.flightTime = 0;
    this.surgeStarted = false;
    this.trailTimer = 0;

    const target = this.selectTarget(squad, enemies, boss);
    this.lockedOnBoss = target.isBoss;
    this.targetPos.set(target.x, 0.55, target.z);

    // Start low right behind/above the squad so the slow vertical rise is front-and-center
    this.currentPos.set(squad.centerX, 0.7, squad.centerZ + 0.6);

    // Build centered pivot around the real CC0 Warhead Rocket GLB (height 3.1m)
    this.clearRocketModel();
    const rocketHeight = 3.1;
    const { root: modelRoot } = this.assets.instantiateModel('weapon_rocket', rocketHeight, {
      castShadow: true,
      cloneMaterials: true
    });
    // Center rocket vertically around pivot origin so pitching/tilting looks crisp & balanced
    modelRoot.position.y = -rocketHeight * 0.5;

    const pivot = new THREE.Group();
    pivot.add(modelRoot);

    this.flameOuter.position.set(0, -rocketHeight * 0.5 - 0.95, 0);
    this.flameInner.position.set(0, -rocketHeight * 0.5 - 0.65, 0);
    this.noseGlow.position.set(0, rocketHeight * 0.25, 0);
    (this.noseGlow.material as THREE.MeshBasicMaterial).opacity = 0.0;

    pivot.add(this.flameOuter, this.flameInner, this.noseGlow);
    pivot.position.copy(this.currentPos);
    pivot.quaternion.copy(this.uprightQuat);

    this.rocketPivot = pivot;
    this.rocketModelWrap = modelRoot;
    this.group.add(pivot);

    // Show tactical target reticle on ground
    this.reticleGroup.position.set(this.targetPos.x, 0.16, this.targetPos.z);
    this.reticleGroup.visible = true;

    // Gentle ignition smoke burst right at squad launch pad
    weapons.spawnBurst(this.currentPos.x, 0.5, this.currentPos.z, 0xe2e8f0, 14, 3.8);
    weapons.spawnBurst(this.currentPos.x, 0.7, this.currentPos.z, 0xff9800, 10, 4.2);
    audio.play('sfx_shoot_heavy', 0.85, 40, -0.12);
    camera.addShake(0.24);
    onBanner?.('🚀 ROCKET LAUNCHING!', 'buff');

    return true;
  }

  private selectTarget(
    squad: PlayerSquadController,
    enemies: EnemyAIManager,
    boss: BossStateMachine
  ): { x: number; z: number; isBoss: boolean } {
    if (boss.active && !boss.defeated) {
      return { x: boss.x, z: boss.z, isBoss: true };
    }

    const active = enemies
      .getEnemies()
      .filter((e) => e.alive && e.z >= squad.centerZ + 4 && e.z <= squad.centerZ + 42);
    if (active.length > 0) {
      let bestX = active[0].x;
      let bestZ = active[0].z;
      let bestScore = -1;
      for (const c of active) {
        let score = c.isElite ? 4 : 1;
        for (const other of active) {
          if (Math.hypot(other.x - c.x, other.z - c.z) <= BLAST_RADIUS) {
            score += other.isElite ? 3 : 1;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestX = c.x;
          bestZ = c.z;
        }
      }
      return { x: bestX, z: bestZ, isBoss: false };
    }

    return { x: squad.centerX * 0.4, z: squad.centerZ + 24, isBoss: false };
  }

  public update(
    dt: number,
    squad: PlayerSquadController,
    enemies: EnemyAIManager,
    boss: BossStateMachine,
    gates: GateManager,
    weapons: WeaponSystem,
    audio: AudioManager,
    camera: CameraController,
    onBanner?: (text: string, tone: 'good' | 'bad' | 'buff') => void
  ): UltTickResult {
    let coinsEarned = 0;
    let enemiesKilled = 0;
    let bossKilled = false;

    // Update detonation shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const fx = this.shockwaves[i];
      fx.age += dt;
      const t = fx.age / fx.maxAge;
      if (t >= 1) {
        this.group.remove(fx.ring, fx.core);
        (fx.ring.material as THREE.Material).dispose();
        (fx.core.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }
      const easeOut = 1 - Math.pow(1 - t, 3);
      fx.ring.scale.setScalar(0.6 + easeOut * (BLAST_RADIUS * 1.25));
      (fx.ring.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.92;

      const coreScale = 0.8 + easeOut * 4.5;
      fx.core.scale.set(coreScale, coreScale * 0.72, coreScale);
      (fx.core.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - t * 1.3) * 0.88);
    }

    if (!this.flying) {
      this.charge = Math.min(100, this.charge + dt * 4.5);
      return { coinsEarned, enemiesKilled, bossKilled };
    }

    this.flightTime += dt;

    // Keep tracking target smoothly during Rise & Tilt phases so the aim is always dead-on
    if (this.flightTime < RISE_DURATION + TILT_DURATION) {
      if (this.lockedOnBoss && boss.active && !boss.defeated) {
        this.targetPos.x += (boss.x - this.targetPos.x) * Math.min(1, dt * 5.0);
        this.targetPos.z += (boss.z - this.targetPos.z) * Math.min(1, dt * 5.0);
      } else {
        const refreshed = this.selectTarget(squad, enemies, boss);
        this.targetPos.x += (refreshed.x - this.targetPos.x) * Math.min(1, dt * 3.0);
        this.targetPos.z += (refreshed.z - this.targetPos.z) * Math.min(1, dt * 3.0);
      }
    }

    // Animate ground target reticle
    this.reticleGroup.position.set(this.targetPos.x, 0.16, this.targetPos.z);
    this.reticleOuter.rotation.z += dt * 2.0;
    this.reticleInner.rotation.z -= dt * 3.8;
    const totalProgress = Math.min(1, this.flightTime / TOTAL_FLIGHT);
    this.reticlePulse.scale.setScalar(Math.max(0.15, totalProgress));
    (this.reticlePulse.material as THREE.MeshBasicMaterial).opacity = 0.14 + totalProgress * 0.36;

    const flicker = 0.88 + Math.sin(this.flightTime * 60) * 0.2;

    if (this.flightTime < RISE_DURATION) {
      // PHASE 1: Slow vertical rise right above the character ("dari bawah ke atas pelan")
      const u = this.flightTime / RISE_DURATION;
      const smoothRise = 1 - Math.pow(1 - u, 2.2); // Smooth slow climb to hover altitude
      const y = THREE.MathUtils.lerp(0.85, HOVER_HEIGHT, smoothRise);
      const wobbleX = Math.sin(this.flightTime * 28) * 0.05;
      this.currentPos.set(squad.centerX + wobbleX, y, squad.centerZ + 0.7);

      if (this.rocketPivot) {
        this.rocketPivot.position.copy(this.currentPos);
        this.rocketPivot.quaternion.copy(this.uprightQuat);
        this.flameOuter.scale.set(0.85 * flicker, 0.95 * flicker, 0.85 * flicker);
        this.flameInner.scale.set(0.8 * flicker, 0.9 * flicker, 0.8 * flicker);
      }

      // Billowing launch exhaust right beneath the rising rocket
      this.trailTimer += dt;
      if (this.trailTimer >= 0.045) {
        this.trailTimer = 0;
        weapons.spawnBurst(this.currentPos.x, Math.max(0.3, y - 1.7), this.currentPos.z, 0xe2e8f0, 2, 2.2);
        weapons.spawnBurst(this.currentPos.x, Math.max(0.3, y - 1.5), this.currentPos.z, 0xff9800, 2, 1.8);
      }
    } else if (this.flightTime < RISE_DURATION + TILT_DURATION) {
      // PHASE 2: Hover & smoothly tilt nose toward target right above the character ("lalu miring")
      const u = (this.flightTime - RISE_DURATION) / TILT_DURATION;
      // Smooth S-curve ease for mechanical pitch-over
      const easeTilt = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;

      const y = HOVER_HEIGHT + Math.sin(u * Math.PI) * 0.45;
      this.currentPos.set(squad.centerX, y, squad.centerZ + 0.9 + u * 0.7);

      // Compute exact aim quaternion from rocket hover point -> target point
      this.dirVec.subVectors(this.targetPos, this.currentPos).normalize();
      this.targetQuat.setFromUnitVectors(this.upAxis, this.dirVec);

      if (this.rocketPivot) {
        this.rocketPivot.position.copy(this.currentPos);
        this.rocketPivot.quaternion.copy(this.uprightQuat).slerp(this.targetQuat, easeTilt);

        // Thruster flares bigger as rocket prepares to charge forward
        const chargeBoost = 1.0 + easeTilt * 0.75;
        this.flameOuter.scale.set(chargeBoost * flicker, (1.1 + easeTilt * 0.9) * flicker, chargeBoost * flicker);
        this.flameInner.scale.set(chargeBoost * flicker, (1.0 + easeTilt * 0.8) * flicker, chargeBoost * flicker);
        (this.noseGlow.material as THREE.MeshBasicMaterial).opacity = easeTilt * 0.22;
      }

      this.trailTimer += dt;
      if (this.trailTimer >= 0.04) {
        this.trailTimer = 0;
        weapons.spawnBurst(this.currentPos.x, this.currentPos.y - 0.6, this.currentPos.z - 0.6, 0xffb74d, 2, 2.2);
      }

      // Record exact surge origin right at end of tilt
      this.surgeStartPos.copy(this.currentPos);
    } else {
      // PHASE 3: Blazing high-speed surge into enemies/boss ("dan menerjang")
      if (!this.surgeStarted) {
        this.surgeStarted = true;
        this.surgeStartPos.copy(this.currentPos);
        // Afterburner ignition blast!
        weapons.spawnBurst(this.surgeStartPos.x, this.surgeStartPos.y, this.surgeStartPos.z, 0xffd54f, 18, 6.0);
        weapons.spawnBurst(this.surgeStartPos.x, this.surgeStartPos.y, this.surgeStartPos.z, 0xff5722, 14, 5.2);
        audio.play('sfx_shoot_heavy', 1.0, 30, 0.14);
        camera.addShake(0.32);
      }

      const u = Math.min(1, (this.flightTime - RISE_DURATION - TILT_DURATION) / SURGE_DURATION);
      // Fast accelerating surge (ease-in quadratic)
      const accel = u * u * 0.72 + u * 0.28;

      this.currentPos.lerpVectors(this.surgeStartPos, this.targetPos, accel);
      // Slight downward aerodynamic arc during charge
      this.currentPos.y += Math.sin(u * Math.PI) * 0.45;

      this.dirVec.subVectors(this.targetPos, this.surgeStartPos).normalize();
      this.targetQuat.setFromUnitVectors(this.upAxis, this.dirVec);

      if (this.rocketPivot) {
        this.rocketPivot.position.copy(this.currentPos);
        this.rocketPivot.quaternion.copy(this.targetQuat);
        // Dramatic spin around nose axis + blazing orange fire aura
        if (this.rocketModelWrap) {
          this.rocketModelWrap.rotation.y += dt * 11.0;
        }
        this.flameOuter.scale.set(1.45 * flicker, 2.35 * flicker, 1.45 * flicker);
        this.flameInner.scale.set(1.25 * flicker, 1.9 * flicker, 1.25 * flicker);
        (this.noseGlow.material as THREE.MeshBasicMaterial).opacity = 0.34 + flicker * 0.12;
        this.noseGlow.scale.setScalar(1.05 + u * 0.35);
      }

      // Intense fiery exhaust streak behind the surging missile
      this.trailTimer += dt;
      if (this.trailTimer >= 0.022) {
        this.trailTimer = 0;
        weapons.spawnBurst(this.currentPos.x, this.currentPos.y, this.currentPos.z, 0xff5722, 4, 2.6);
        weapons.spawnBurst(this.currentPos.x, this.currentPos.y, this.currentPos.z, 0xffeb3b, 2, 1.8);
      }
    }

    // Detonate on impact!
    if (this.flightTime >= TOTAL_FLIGHT) {
      const det = this.detonate(squad, enemies, boss, gates, weapons, audio, camera, onBanner);
      coinsEarned += det.coinsEarned;
      enemiesKilled += det.enemiesKilled;
      bossKilled = det.bossKilled;
    }

    return { coinsEarned, enemiesKilled, bossKilled };
  }

  private detonate(
    squad: PlayerSquadController,
    enemies: EnemyAIManager,
    boss: BossStateMachine,
    gates: GateManager,
    weapons: WeaponSystem,
    audio: AudioManager,
    camera: CameraController,
    onBanner?: (text: string, tone: 'good' | 'bad' | 'buff') => void
  ): UltTickResult {
    this.flying = false;
    this.reticleGroup.visible = false;
    this.clearRocketModel();

    const ix = this.targetPos.x;
    const iz = this.targetPos.z;

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff8c00,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(this.sharedRingGeo, ringMat);
    ring.position.set(ix, 0.22, iz);

    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffd54f,
      transparent: true,
      opacity: 0.92
    });
    const core = new THREE.Mesh(this.sharedCoreGeo, coreMat);
    core.position.set(ix, 1.0, iz);

    this.group.add(ring, core);
    this.shockwaves.push({ ring, core, age: 0, maxAge: 0.68 });

    weapons.spawnBurst(ix, 1.4, iz, 0xff5722, 26, 12.0);
    weapons.spawnBurst(ix, 2.0, iz, 0xffeb3b, 20, 9.8);
    weapons.spawnBurst(ix, 1.0, iz, 0xdc2626, 16, 8.2);
    camera.addShake(0.95);
    audio.play('sfx_boss_slam', 1.0, 40, 0.05);
    audio.play('sfx_enemy_die', 0.9, 40, 0.08);

    const squadDps =
      Math.max(6, squad.getCount()) * squad.getEffectiveDamage() * squad.getEffectiveFireRate();
    const enemyBlastDamage = Math.max(450, squadDps * 2.3);

    let coinsEarned = 0;
    let enemiesKilled = 0;
    let bossKilled = false;

    for (const e of enemies.getEnemies()) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - ix, e.z - iz);
      if (d <= BLAST_RADIUS + e.radius) {
        const res = enemies.damageEnemy(e, enemyBlastDamage, weapons, audio);
        if (res.killed) {
          enemiesKilled++;
          coinsEarned += res.coins;
        }
      }
    }

    for (const o of gates.getObstacles()) {
      if (!o.alive || !o.destructible) continue;
      const d = Math.hypot(o.x - ix, o.z - iz);
      if (d <= BLAST_RADIUS + o.radius) {
        gates.damageObstacle(o, enemyBlastDamage, weapons, audio);
      }
    }

    if (boss.active && !boss.defeated) {
      const d = Math.hypot(boss.x - ix, boss.z - iz);
      if (d <= BLAST_RADIUS + boss.radius + 1.6) {
        const bossBurst = Math.min(
          boss.maxHp * 0.32,
          Math.max(boss.maxHp * 0.18, squadDps * 2.5)
        );
        const res = boss.takeDamage(bossBurst, weapons, audio, camera, onBanner);
        if (res.killed) {
          bossKilled = true;
          coinsEarned += res.rewardCoins;
        }
      }
    }

    if (enemiesKilled >= 3) {
      onBanner?.(`💥 DIRECT HIT! ${enemiesKilled} ELIMINATED!`, 'good');
    } else {
      onBanner?.('💥 ROCKET IMPACT!', 'good');
    }

    return { coinsEarned, enemiesKilled, bossKilled };
  }

  private clearRocketModel(): void {
    if (this.rocketPivot) {
      this.rocketPivot.remove(this.flameOuter, this.flameInner, this.noseGlow);
      this.group.remove(this.rocketPivot);
      disposeObject3D(this.rocketPivot, true);
      this.rocketPivot = null;
      this.rocketModelWrap = null;
    }
  }

  public clearActive(): void {
    this.flying = false;
    this.flightTime = 0;
    this.surgeStarted = false;
    this.reticleGroup.visible = false;
    this.clearRocketModel();
    for (const fx of this.shockwaves) {
      this.group.remove(fx.ring, fx.core);
      (fx.ring.material as THREE.Material).dispose();
      (fx.core.material as THREE.Material).dispose();
    }
    this.shockwaves = [];
  }

  public dispose(): void {
    this.clearActive();
    this.flameOuter.geometry.dispose();
    (this.flameOuter.material as THREE.Material).dispose();
    this.flameInner.geometry.dispose();
    (this.flameInner.material as THREE.Material).dispose();
    this.noseGlow.geometry.dispose();
    (this.noseGlow.material as THREE.Material).dispose();
    this.reticleOuter.geometry.dispose();
    (this.reticleOuter.material as THREE.Material).dispose();
    this.reticleInner.geometry.dispose();
    (this.reticleInner.material as THREE.Material).dispose();
    this.reticlePulse.geometry.dispose();
    (this.reticlePulse.material as THREE.Material).dispose();
    this.sharedRingGeo.dispose();
    this.sharedCoreGeo.dispose();
    this.scene.remove(this.group);
  }
}
