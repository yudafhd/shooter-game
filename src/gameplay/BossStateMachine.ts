import * as THREE from 'three';
import { AssetRegistry, disposeObject3D } from '../engine/AssetRegistry';
import type { BossPatternType, BossStageConfig } from '../types/game';
import type { PlayerSquadController } from './PlayerSquadController';
import type { WeaponSystem } from './WeaponSystem';
import type { EnemyAIManager } from './EnemyAI';
import type { AudioManager } from '../engine/AudioManager';
import type { CameraController } from '../engine/CameraController';

type BossPhaseState = 'dormant' | 'idle' | 'telegraph' | 'executing' | 'dead';

export class BossStateMachine {
  private scene: THREE.Scene;
  private assets: AssetRegistry;
  private group = new THREE.Group();

  private config: BossStageConfig | null = null;
  private root: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private clips: {
    idle: THREE.AnimationAction | null;
    move: THREE.AnimationAction | null;
    attack: THREE.AnimationAction | null;
    shoot: THREE.AnimationAction | null;
    hit: THREE.AnimationAction | null;
    death: THREE.AnimationAction | null;
  } = { idle: null, move: null, attack: null, shoot: null, hit: null, death: null };
  private activeAction: THREE.AnimationAction | null = null;

  public active = false;
  public defeated = false;
  public hp = 0;
  public maxHp = 1;
  public phase: 1 | 2 = 1;
  public x = 0;
  public z = 0;
  public homeZ = 0;
  public radius = 2.6;
  public warningText = '';

  private state: BossPhaseState = 'dormant';
  private attackCooldownTimer = 1.6;
  private telegraphTimer = 0;
  private telegraphDuration = 1.0;
  private currentPattern: BossPatternType = 'area_slam';
  private patternIndex = 0;
  private targetX = 0;
  private targetZ = 0;
  private slamRadius = 3.2;
  private chargeProgress = 0;
  private hitFlash = 0;
  private deathTimer = 0;
  private trackHalfWidth = 5.4;

  // Ground telegraph meshes
  private telegraphGroup = new THREE.Group();
  private slamOuter: THREE.Mesh;
  private slamInner: THREE.Mesh;
  private laneMesh: THREE.Mesh;
  private auraMesh: THREE.Mesh;

  // Reward chest shown on victory
  private rewardChest: THREE.Group | null = null;

  constructor(scene: THREE.Scene, assets: AssetRegistry) {
    this.scene = scene;
    this.assets = assets;

    const ringGeo = new THREE.RingGeometry(0.88, 1.0, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const fillGeo = new THREE.CircleGeometry(1.0, 36);
    fillGeo.rotateX(-Math.PI / 2);
    const laneGeo = new THREE.PlaneGeometry(3.4, 16);
    laneGeo.rotateX(-Math.PI / 2);

    this.slamOuter = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    this.slamInner = new THREE.Mesh(
      fillGeo,
      new THREE.MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false })
    );
    this.laneMesh = new THREE.Mesh(
      laneGeo,
      new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.36, side: THREE.DoubleSide, depthWrite: false })
    );
    this.auraMesh = new THREE.Mesh(
      ringGeo.clone(),
      new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
    );

    this.slamOuter.visible = false;
    this.slamInner.visible = false;
    this.laneMesh.visible = false;
    this.auraMesh.visible = false;

    this.telegraphGroup.add(this.slamOuter, this.slamInner, this.laneMesh, this.auraMesh);
    this.group.add(this.telegraphGroup);
    this.scene.add(this.group);
  }

  public initStage(bossConfig: BossStageConfig, spawnZ: number, trackWidth: number): void {
    this.clearBossModel();
    this.config = bossConfig;
    this.active = false;
    this.defeated = false;
    this.hp = bossConfig.hp;
    this.maxHp = bossConfig.hp;
    this.phase = 1;
    this.x = 0;
    this.z = spawnZ;
    this.homeZ = spawnZ;
    this.radius = 2.4 * Math.min(1.45, Math.max(0.95, bossConfig.scale * 0.8));
    this.trackHalfWidth = trackWidth * 0.5 - 1.2;
    this.state = 'dormant';
    this.attackCooldownTimer = 1.4;
    this.patternIndex = 0;
    this.warningText = '';
    this.hideTelegraphs();

    const targetHeight = 4.6 * Math.min(1.45, Math.max(0.95, bossConfig.scale * 0.78));
    const { root, model, asset } = this.assets.instantiateModel(bossConfig.assetId, targetHeight, {
      tintHex: bossConfig.tintHex,
      emissiveHex: '#551208',
      emissiveIntensity: 0.18,
      castShadow: true,
      receiveShadow: true,
      cloneMaterials: true
    });
    root.position.set(this.x, 0, this.z);
    root.rotation.y = Math.PI;
    this.root = root;
    this.group.add(root);

    this.auraMesh.position.set(this.x, 0.12, this.z);
    this.auraMesh.scale.setScalar(this.radius * 1.15);
    this.auraMesh.visible = true;

    if (asset.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      const idleClip = AssetRegistry.pickClip(asset.animations, ['Idle', 'Hello', 'Dance']);
      const moveClip = AssetRegistry.pickClip(asset.animations, ['Run', 'Walk']);
      const attackClip = AssetRegistry.pickClip(asset.animations, ['Punch', 'SwordSlash', 'Attack', 'Kick']);
      const shootClip = AssetRegistry.pickClip(asset.animations, ['Shoot', 'Attack', 'Punch']);
      const hitClip = AssetRegistry.pickClip(asset.animations, ['HitRecieve_1', 'HitRecieve_2', 'HitRecieve', 'No']);
      const deathClip = AssetRegistry.pickClip(asset.animations, ['Death', 'Dead']);

      this.clips = {
        idle: idleClip ? this.mixer.clipAction(idleClip) : null,
        move: moveClip ? this.mixer.clipAction(moveClip) : null,
        attack: attackClip ? this.mixer.clipAction(attackClip) : null,
        shoot: shootClip ? this.mixer.clipAction(shootClip) : null,
        hit: hitClip ? this.mixer.clipAction(hitClip) : null,
        death: deathClip ? this.mixer.clipAction(deathClip) : null
      };

      if (this.clips.death) {
        this.clips.death.setLoop(THREE.LoopOnce, 1);
        this.clips.death.clampWhenFinished = true;
      }
      if (this.clips.attack) this.clips.attack.setLoop(THREE.LoopOnce, 1);
      if (this.clips.shoot) this.clips.shoot.setLoop(THREE.LoopOnce, 1);
      if (this.clips.hit) this.clips.hit.setLoop(THREE.LoopOnce, 1);
      this.playAction(this.clips.idle);
    }
  }

  public activate(): void {
    if (this.active || this.defeated || !this.config) return;
    this.active = true;
    this.state = 'idle';
    this.attackCooldownTimer = 1.25;
    this.warningText = `${this.config.name.toUpperCase()} ENGAGED!`;
  }

  private playAction(action: THREE.AnimationAction | null): void {
    if (!action || this.activeAction === action) return;
    action.reset().fadeIn(0.16).play();
    if (this.activeAction) this.activeAction.fadeOut(0.16);
    this.activeAction = action;
  }

  private hideTelegraphs(): void {
    this.slamOuter.visible = false;
    this.slamInner.visible = false;
    this.laneMesh.visible = false;
  }

  public takeDamage(
    damage: number,
    weapons: WeaponSystem,
    audio: AudioManager,
    camera: CameraController,
    onBanner?: (text: string, tone: 'good' | 'bad' | 'buff') => void
  ): { killed: boolean; rewardCoins: number } {
    if (!this.active || this.defeated || !this.config) {
      return { killed: false, rewardCoins: 0 };
    }

    this.hp = Math.max(0, this.hp - damage);
    this.hitFlash = 0.09;

    // Trigger Phase 2 enrage at 50% HP
    if (this.config.hasPhaseTwo && this.phase === 1 && this.hp > 0 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      this.warningText = 'PHASE 2 — ENRAGED!';
      (this.auraMesh.material as THREE.MeshBasicMaterial).color.setHex(0xff0033);
      weapons.spawnBurst(this.x, 2.2, this.z, 0xff2244, 24, 8.5);
      camera.addShake(0.6);
      audio.play('sfx_boss_slam', 0.9, 60);
      onBanner?.('BOSS ENRAGED — PHASE 2!', 'bad');
    }

    if (this.hp <= 0) {
      this.defeated = true;
      this.active = false;
      this.state = 'dead';
      this.deathTimer = 2.4;
      this.warningText = '';
      this.hideTelegraphs();
      this.auraMesh.visible = false;
      this.playAction(this.clips.death);
      weapons.spawnBurst(this.x, 2.2, this.z, 0xfbbf24, 34, 9.5);
      camera.addShake(0.85);
      audio.play('sfx_boss_slam', 1.0, 50);

      // Spawn real 3D Gold Treasure Chest reward at boss position
      const { root: chest } = this.assets.instantiateModel('prop_chest_gold', 1.45, {
        castShadow: true,
        receiveShadow: true
      });
      chest.position.set(this.x, 0, this.z);
      this.rewardChest = chest;
      this.group.add(chest);

      return { killed: true, rewardCoins: this.config.rewardCoins };
    }

    if (this.state === 'idle' && this.clips.hit && Math.random() < 0.14) {
      this.playAction(this.clips.hit);
    }

    return { killed: false, rewardCoins: 0 };
  }

  public update(
    dt: number,
    squad: PlayerSquadController,
    weapons: WeaponSystem,
    enemies: EnemyAIManager,
    audio: AudioManager,
    camera: CameraController
  ): void {
    if (this.mixer) this.mixer.update(dt);

    if (this.rewardChest) {
      this.rewardChest.rotation.y += dt * 1.4;
    }

    if (!this.root || !this.config) return;

    if (this.state === 'dead') {
      this.deathTimer = Math.max(0, this.deathTimer - dt);
      if (this.deathTimer < 0.8) {
        this.root.position.y -= dt * 2.2;
      }
      return;
    }

    // Subtle breathing / hit recoil
    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.root.scale.setScalar(1 + (this.hitFlash / 0.09) * 0.05);
    } else {
      this.root.scale.setScalar(1);
    }

    // Rotate aura ring
    this.auraMesh.position.set(this.x, 0.12, this.z);
    this.auraMesh.rotation.z += dt * (this.phase === 2 ? 2.5 : 1.0);

    if (!this.active) return;

    // Face player squad
    const lookYaw = Math.atan2(squad.centerX - this.x, squad.centerZ - this.z);
    this.root.rotation.y = lookYaw;

    const phaseMult = this.phase === 2 ? 0.72 : 1.0;

    if (this.state === 'idle') {
      // Gently strafe horizontally to keep the fight dynamic
      const desiredX = Math.max(
        -this.trackHalfWidth * 0.55,
        Math.min(this.trackHalfWidth * 0.55, squad.centerX * 0.45)
      );
      this.x += (desiredX - this.x) * Math.min(1, dt * 1.6);
      this.z += (this.homeZ - this.z) * Math.min(1, dt * 3.0);
      this.root.position.set(this.x, 0, this.z);

      this.attackCooldownTimer -= dt;
      if (this.attackCooldownTimer <= 0) {
        this.startNextPattern(squad);
      }
    } else if (this.state === 'telegraph') {
      this.telegraphTimer -= dt;
      const fillRatio = 1 - Math.max(0, this.telegraphTimer / this.telegraphDuration);

      if (this.currentPattern === 'area_slam') {
        this.slamInner.scale.setScalar(Math.max(0.08, this.slamRadius * fillRatio));
      } else if (this.currentPattern === 'charge_rush') {
        (this.laneMesh.material as THREE.MeshBasicMaterial).opacity = 0.22 + fillRatio * 0.48;
      }

      if (this.telegraphTimer <= 0) {
        this.executePattern(squad, weapons, enemies, audio, camera, phaseMult);
      }
    } else if (this.state === 'executing') {
      if (this.currentPattern === 'charge_rush') {
        this.chargeProgress += dt * (this.phase === 2 ? 2.4 : 1.9);
        if (this.chargeProgress <= 1.0) {
          this.z = THREE.MathUtils.lerp(this.homeZ, squad.centerZ + 1.5, this.chargeProgress);
          this.root.position.set(this.x, 0, this.z);
          // Damage units caught in rush lane
          const hit = squad.applyDamageAt(this.x, this.z, this.config.damage * 0.75, 2.35, 3);
          if (hit.hitPos) {
            weapons.spawnBurst(hit.hitPos.x, 1.0, hit.hitPos.z, 0xff4455, 8, 5.2);
            audio.play('sfx_hurt', 0.65, 160);
            camera.addShake(0.35);
          }
        } else if (this.chargeProgress <= 2.0) {
          this.z = THREE.MathUtils.lerp(squad.centerZ + 1.5, this.homeZ, this.chargeProgress - 1.0);
          this.root.position.set(this.x, 0, this.z);
        } else {
          this.z = this.homeZ;
          this.root.position.set(this.x, 0, this.z);
          this.finishAttack(phaseMult);
        }
      } else {
        this.telegraphTimer -= dt;
        if (this.telegraphTimer <= 0) {
          this.finishAttack(phaseMult);
        }
      }
    }
  }

  private startNextPattern(squad: PlayerSquadController): void {
    if (!this.config) return;
    const patterns = this.config.patterns;
    this.currentPattern = patterns[this.patternIndex % patterns.length];
    this.patternIndex++;

    this.state = 'telegraph';
    this.hideTelegraphs();

    if (this.currentPattern === 'area_slam') {
      this.targetX = squad.centerX;
      this.targetZ = squad.centerZ;
      this.slamRadius = this.phase === 2 ? 3.8 : 3.2;
      this.telegraphDuration = this.phase === 2 ? 0.95 : 1.18;
      this.telegraphTimer = this.telegraphDuration;
      this.warningText = 'DODGE! AREA SLAM INCOMING';

      this.slamOuter.position.set(this.targetX, 0.14, this.targetZ);
      this.slamOuter.scale.setScalar(this.slamRadius);
      this.slamOuter.visible = true;

      this.slamInner.position.set(this.targetX, 0.12, this.targetZ);
      this.slamInner.scale.setScalar(0.1);
      this.slamInner.visible = true;
    } else if (this.currentPattern === 'projectile_barrage') {
      this.targetX = squad.centerX;
      this.targetZ = squad.centerZ;
      this.telegraphDuration = this.phase === 2 ? 0.65 : 0.85;
      this.telegraphTimer = this.telegraphDuration;
      this.warningText = 'INCOMING ENERGY BARRAGE!';
      this.playAction(this.clips.shoot || this.clips.attack);
    } else if (this.currentPattern === 'summon_minions') {
      this.telegraphDuration = 0.85;
      this.telegraphTimer = this.telegraphDuration;
      this.warningText = 'BOSS SUMMONING MINIONS!';
      this.playAction(this.clips.attack || this.clips.idle);
    } else if (this.currentPattern === 'charge_rush') {
      this.targetX = Math.max(-this.trackHalfWidth + 1, Math.min(this.trackHalfWidth - 1, squad.centerX));
      this.x = this.targetX;
      this.telegraphDuration = this.phase === 2 ? 0.85 : 1.05;
      this.telegraphTimer = this.telegraphDuration;
      this.warningText = 'MOVE ASIDE! BOSS CHARGE!';

      this.laneMesh.position.set(this.targetX, 0.13, (this.homeZ + squad.centerZ) * 0.5);
      this.laneMesh.visible = true;
    }
  }

  private executePattern(
    squad: PlayerSquadController,
    weapons: WeaponSystem,
    enemies: EnemyAIManager,
    audio: AudioManager,
    camera: CameraController,
    phaseMult: number
  ): void {
    if (!this.config) return;
    this.hideTelegraphs();
    this.state = 'executing';

    if (this.currentPattern === 'area_slam') {
      this.playAction(this.clips.attack);
      const hit = squad.applyDamageAt(
        this.targetX,
        this.targetZ,
        this.config.damage,
        this.slamRadius + 0.35,
        this.phase === 2 ? 7 : 5
      );
      weapons.spawnBurst(this.targetX, 0.6, this.targetZ, 0xff3b30, 22, 8.0);
      camera.addShake(0.65);
      audio.play('sfx_boss_slam', 0.9, 60);
      if (hit.hitPos) audio.play('sfx_hurt', 0.6, 80);
      this.telegraphTimer = 0.55;
    } else if (this.currentPattern === 'projectile_barrage') {
      const bolts = this.phase === 2 ? 7 : 5;
      for (let i = 0; i < bolts; i++) {
        const frac = (i / (bolts - 1)) * 2 - 1;
        const aimX = squad.centerX + frac * 6.8;
        weapons.spawnEnemyShot(
          this.x,
          2.2,
          this.z - 1.2,
          aimX,
          0.9,
          squad.centerZ,
          this.config.damage * 0.65,
          this.phase === 2 ? 19.5 : 16.5,
          1.45
        );
      }
      audio.play('sfx_shoot_heavy', 0.85, 60);
      camera.addShake(0.28);
      this.telegraphTimer = 0.55;
    } else if (this.currentPattern === 'summon_minions') {
      const count = this.config.summonCount + (this.phase === 2 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const sx = (i - (count - 1) / 2) * 2.3;
        const clampedX = Math.max(-this.trackHalfWidth, Math.min(this.trackHalfWidth, this.x + sx));
        enemies.spawnEnemy(this.config.summonEnemyId, clampedX, this.z - 2.6);
        weapons.spawnBurst(clampedX, 1.0, this.z - 2.6, 0xa855f7, 8, 4.0);
      }
      audio.play('sfx_gate_bad', 0.7, 60);
      this.telegraphTimer = 0.5;
    } else if (this.currentPattern === 'charge_rush') {
      this.chargeProgress = 0;
      this.playAction(this.clips.move || this.clips.attack);
      audio.play('sfx_boss_slam', 0.75, 80);
    } else {
      this.finishAttack(phaseMult);
    }
  }

  private finishAttack(phaseMult: number): void {
    if (!this.config) return;
    this.state = 'idle';
    this.warningText = '';
    this.attackCooldownTimer = this.config.attackCooldown * phaseMult;
    this.playAction(this.clips.idle);
  }

  public clearBossModel(): void {
    this.mixer?.stopAllAction();
    this.mixer = null;
    this.activeAction = null;
    if (this.root) {
      this.group.remove(this.root);
      disposeObject3D(this.root, true);
      this.root = null;
    }
    if (this.rewardChest) {
      this.group.remove(this.rewardChest);
      disposeObject3D(this.rewardChest, true);
      this.rewardChest = null;
    }
    this.hideTelegraphs();
    this.auraMesh.visible = false;
  }

  public dispose(): void {
    this.clearBossModel();
    this.slamOuter.geometry.dispose();
    (this.slamOuter.material as THREE.Material).dispose();
    this.slamInner.geometry.dispose();
    (this.slamInner.material as THREE.Material).dispose();
    this.laneMesh.geometry.dispose();
    (this.laneMesh.material as THREE.Material).dispose();
    this.auraMesh.geometry.dispose();
    (this.auraMesh.material as THREE.Material).dispose();
    this.scene.remove(this.group);
  }
}
