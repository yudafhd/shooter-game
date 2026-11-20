import * as THREE from 'three';
import { AssetRegistry, disposeObject3D } from '../engine/AssetRegistry';
import { ENEMY_DEFINITIONS } from '../data/enemies';
import type { EnemyDefinition, EnemyState } from '../types/game';
import type { PlayerSquadController } from './PlayerSquadController';
import type { WeaponSystem } from './WeaponSystem';
import type { AudioManager } from '../engine/AudioManager';

export interface ActiveEnemy {
  id: number;
  def: EnemyDefinition;
  isElite: boolean;
  cleaveRadius: number;
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  clips: {
    idle: THREE.AnimationAction | null;
    move: THREE.AnimationAction | null;
    attack: THREE.AnimationAction | null;
    hit: THREE.AnimationAction | null;
    death: THREE.AnimationAction | null;
  };
  state: EnemyState;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  damage: number;
  radius: number;
  attackTimer: number;
  stateTimer: number;
  hitFlashTimer: number;
  flankSign: number;
  chargeWindup: number;
  charging: boolean;
  telegraphMesh: THREE.Mesh | null;
  hpBarFill: THREE.Mesh | null;
  alive: boolean;
  deadTimer: number;
}

export class EnemyAIManager {
  private scene: THREE.Scene;
  private assets: AssetRegistry;
  private group = new THREE.Group();
  private enemies: ActiveEnemy[] = [];
  private nextId = 1;
  private trackHalfWidth = 5.6;

  private sharedRingGeo = new THREE.RingGeometry(0.1, 1.0, 24);
  private sharedBarBgGeo = new THREE.PlaneGeometry(1.4, 0.16);
  private sharedBarFillGeo = new THREE.PlaneGeometry(1.34, 0.11);
  private sharedBarBgMat = new THREE.MeshBasicMaterial({ color: 0x111827, side: THREE.DoubleSide });
  private sharedEliteRingMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  private disposableMats: THREE.Material[] = [];

  constructor(scene: THREE.Scene, assets: AssetRegistry) {
    this.scene = scene;
    this.assets = assets;
    this.sharedRingGeo.rotateX(-Math.PI / 2);
    this.scene.add(this.group);
  }

  public setTrackWidth(width: number): void {
    this.trackHalfWidth = width * 0.5 - 0.7;
  }

  public spawnEnemy(
    enemyId: string,
    x: number,
    z: number,
    options?: {
      isElite?: boolean;
      hpMultiplier?: number;
      damageMultiplier?: number;
      scaleMultiplier?: number;
      cleaveRadius?: number;
    }
  ): ActiveEnemy {
    const def = ENEMY_DEFINITIONS[enemyId];
    if (!def) {
      throw new Error(`Unknown enemy definition: ${enemyId}`);
    }

    const isElite = Boolean(options?.isElite);
    const scaleMult = options?.scaleMultiplier ?? (isElite ? 1.38 : 1.0);
    const hpMult = options?.hpMultiplier ?? (isElite ? 2.4 : 1.0);
    const dmgMult = options?.damageMultiplier ?? (isElite ? 1.45 : 1.0);

    const targetHeight = (isElite ? 2.65 : 1.75) * def.scale * (scaleMult / (isElite ? 1.38 : 1.0));
    const { root, model, asset } = this.assets.instantiateModel(def.assetId, targetHeight, {
      tintHex: isElite ? '#ff8c24' : def.tintHex,
      emissiveHex: isElite ? '#d9480f' : undefined,
      emissiveIntensity: isElite ? 0.35 : 0,
      castShadow: true,
      receiveShadow: false,
      cloneMaterials: true
    });

    root.position.set(x, 0, z);
    root.rotation.y = Math.PI; // Face toward approaching player squad (-Z)

    // AnimationMixer mapped to real GLB animation clips
    let mixer: THREE.AnimationMixer | null = null;
    const clips: ActiveEnemy['clips'] = {
      idle: null,
      move: null,
      attack: null,
      hit: null,
      death: null
    };

    if (asset.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      const idleClip = AssetRegistry.pickClip(asset.animations, ['Idle', 'Idle_2', 'Flying']);
      const moveClip = AssetRegistry.pickClip(asset.animations, [
        'Run',
        'Gallop',
        'Walk',
        'Walking',
        'Flying',
        'Jump'
      ]);
      const attackClip = AssetRegistry.pickClip(asset.animations, [
        'Shoot',
        'Attack',
        'Bite_Front',
        'Attack_Headbutt',
        'Run_swordAttack',
        'Punch'
      ]);
      const hitClip = AssetRegistry.pickClip(asset.animations, [
        'HitRecieve',
        'HitReact',
        'Idle_HitReact_Left',
        'No'
      ]);
      const deathClip = AssetRegistry.pickClip(asset.animations, ['Death', 'Dead']);

      clips.idle = idleClip ? mixer.clipAction(idleClip) : null;
      clips.move = moveClip ? mixer.clipAction(moveClip) : null;
      clips.attack = attackClip ? mixer.clipAction(attackClip) : null;
      clips.hit = hitClip ? mixer.clipAction(hitClip) : null;
      clips.death = deathClip ? mixer.clipAction(deathClip) : null;

      if (clips.death) {
        clips.death.setLoop(THREE.LoopOnce, 1);
        clips.death.clampWhenFinished = true;
      }
      if (clips.attack) {
        clips.attack.setLoop(THREE.LoopOnce, 1);
      }
      if (clips.hit) {
        clips.hit.setLoop(THREE.LoopOnce, 1);
      }
      if (clips.move) {
        clips.move.play();
        mixer.update(Math.random() * 0.6);
      } else if (clips.idle) {
        clips.idle.play();
      }
    }

    // Elite ground aura + cleave telegraph ring + overhead HP bar
    let telegraphMesh: THREE.Mesh | null = null;
    let hpBarFill: THREE.Mesh | null = null;
    if (isElite) {
      const aura = new THREE.Mesh(this.sharedRingGeo, this.sharedEliteRingMat);
      aura.position.y = 0.08;
      aura.scale.setScalar(def.radius * 1.45);
      root.add(aura);

      const teleMat = new THREE.MeshBasicMaterial({
        color: 0xff2244,
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      this.disposableMats.push(teleMat);
      telegraphMesh = new THREE.Mesh(this.sharedRingGeo, teleMat);
      telegraphMesh.position.y = 0.1;
      telegraphMesh.visible = false;
      root.add(telegraphMesh);

      const barGroup = new THREE.Group();
      barGroup.position.set(0, targetHeight + 0.55, 0);
      barGroup.rotation.y = Math.PI;
      const bg = new THREE.Mesh(this.sharedBarBgGeo, this.sharedBarBgMat);
      const fillMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide });
      this.disposableMats.push(fillMat);
      hpBarFill = new THREE.Mesh(this.sharedBarFillGeo, fillMat);
      hpBarFill.position.z = 0.02;
      barGroup.add(bg, hpBarFill);
      root.add(barGroup);
    }

    this.group.add(root);

    const maxHp = Math.round(def.baseHp * hpMult);
    const enemy: ActiveEnemy = {
      id: this.nextId++,
      def,
      isElite,
      cleaveRadius: options?.cleaveRadius ?? 2.4,
      root,
      mixer,
      clips,
      state: 'move',
      x,
      z,
      hp: maxHp,
      maxHp,
      damage: Math.round(def.baseDamage * dmgMult),
      radius: def.radius * (isElite ? 1.32 : 1.0),
      attackTimer: 0.35 + Math.random() * 0.45,
      stateTimer: 0,
      hitFlashTimer: 0,
      flankSign: Math.random() < 0.5 ? -1 : 1,
      chargeWindup: 0,
      charging: false,
      telegraphMesh,
      hpBarFill,
      alive: true,
      deadTimer: 0
    };

    this.enemies.push(enemy);
    return enemy;
  }

  public getEnemies(): ActiveEnemy[] {
    return this.enemies;
  }

  public getAliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  public damageEnemy(
    e: ActiveEnemy,
    damage: number,
    weapons: WeaponSystem,
    audio: AudioManager
  ): { killed: boolean; coins: number } {
    if (!e.alive) return { killed: false, coins: 0 };
    e.hp -= damage;
    e.hitFlashTimer = 0.12;

    if (e.hpBarFill) {
      const ratio = Math.max(0.001, e.hp / e.maxHp);
      e.hpBarFill.scale.x = ratio;
      e.hpBarFill.position.x = -(1 - ratio) * 0.67;
    }

    if (e.hp <= 0) {
      e.alive = false;
      e.state = 'death';
      e.deadTimer = 0.95;
      if (e.telegraphMesh) e.telegraphMesh.visible = false;
      this.transitionState(e, 'death');
      weapons.spawnBurst(e.x, 1.0, e.z, e.isElite ? 0xf59e0b : 0xff5577, e.isElite ? 14 : 7, 5.2);
      audio.play('sfx_enemy_die', e.isElite ? 0.7 : 0.42, 65);
      return { killed: true, coins: e.def.coinValue * (e.isElite ? 3 : 1) };
    }

    if (e.state !== 'attack' && e.clips.hit && e.stateTimer <= 0) {
      this.transitionState(e, 'hit');
      e.stateTimer = 0.22;
    }
    return { killed: false, coins: 0 };
  }

  private transitionState(e: ActiveEnemy, next: EnemyState): void {
    if (e.state === 'death' && next !== 'death') return;
    const prevAction = e.clips[e.state];
    e.state = next;
    const nextAction = e.clips[next] || e.clips.move || e.clips.idle;
    if (!nextAction || prevAction === nextAction) return;
    nextAction.reset().fadeIn(0.12).play();
    if (prevAction) prevAction.fadeOut(0.12);
  }

  public update(
    dt: number,
    squad: PlayerSquadController,
    weapons: WeaponSystem,
    audio: AudioManager
  ): void {
    const squadX = squad.centerX;
    const squadZ = squad.centerZ;
    const squadRadius = squad.getSquadRadius();

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.mixer) e.mixer.update(dt);

      if (!e.alive) {
        e.deadTimer -= dt;
        // Sink gracefully after death animation completes
        if (e.deadTimer < 0.35) {
          e.root.position.y -= dt * 2.4;
        }
        if (e.deadTimer <= 0) {
          e.mixer?.stopAllAction();
          this.group.remove(e.root);
          disposeObject3D(e.root, true);
          this.enemies.splice(i, 1);
        }
        continue;
      }

      // Despawn enemies left far behind the squad
      if (e.z < squadZ - 14) {
        e.mixer?.stopAllAction();
        this.group.remove(e.root);
        disposeObject3D(e.root, true);
        this.enemies.splice(i, 1);
        continue;
      }

      e.attackTimer = Math.max(0, e.attackTimer - dt);
      e.stateTimer = Math.max(0, e.stateTimer - dt);
      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
        const s = 1 + (e.hitFlashTimer / 0.12) * 0.08;
        e.root.scale.setScalar(s);
      } else {
        e.root.scale.setScalar(1);
      }

      const dx = squadX - e.x;
      const dz = squadZ - e.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const engageRange = e.def.attackRange + squadRadius * 0.55;

      // Rotate smoothly toward player squad
      const desiredYaw = Math.atan2(dx, dz);
      e.root.rotation.y = desiredYaw;

      // Elite telegraph special cleave
      if (e.isElite && e.chargeWindup > 0) {
        e.chargeWindup -= dt;
        if (e.telegraphMesh) {
          e.telegraphMesh.visible = true;
          const t = 1 - Math.max(0, e.chargeWindup / 0.65);
          e.telegraphMesh.scale.setScalar(e.cleaveRadius * (0.35 + t * 0.65));
        }
        if (e.chargeWindup <= 0) {
          if (e.telegraphMesh) e.telegraphMesh.visible = false;
          this.transitionState(e, 'attack');
          e.stateTimer = 0.45;
          e.attackTimer = e.def.attackCooldown * 1.15;
          const hit = squad.applyDamageAt(e.x, e.z, e.damage * 1.25, e.cleaveRadius + 0.6, 4);
          if (hit.hitPos) {
            weapons.spawnBurst(e.x, 0.7, e.z, 0xf59e0b, 12, 6.0);
            audio.play('sfx_boss_slam', 0.55, 110);
          }
        }
        continue;
      }

      // Engage or move based on enemy behavior
      if (dist <= engageRange) {
        if (e.attackTimer <= 0) {
          if (e.isElite && e.def.behavior !== 'ranged') {
            // Telegraph elite AoE cleave before striking multiple troopers
            e.chargeWindup = 0.65;
            if (e.telegraphMesh) e.telegraphMesh.visible = true;
            continue;
          }

          this.transitionState(e, 'attack');
          e.stateTimer = 0.42;
          e.attackTimer = e.def.attackCooldown;

          if (e.def.behavior === 'ranged') {
            weapons.spawnEnemyShot(
              e.x,
              1.15,
              e.z,
              squadX + (Math.random() - 0.5) * 1.6,
              0.9,
              squadZ + 0.5,
              e.damage,
              e.def.projectileSpeed ?? 16.5,
              e.isElite ? 1.35 : 0.95
            );
            audio.play('sfx_shoot_heavy', 0.25, 140, 0.15);
          } else {
            const maxTargets = e.isElite ? 3 : 1;
            const hit = squad.applyDamageAt(e.x, e.z, e.damage, e.radius + 1.35, maxTargets);
            if (hit.hitPos) {
              weapons.spawnBurst(hit.hitPos.x, 0.9, hit.hitPos.z, 0xff4455, 5, 3.6);
              audio.play('sfx_hurt', 0.42, 120);
            }
          }
        } else if (e.stateTimer <= 0 && e.state !== 'idle') {
          this.transitionState(e, 'idle');
        }
      } else {
        if (e.stateTimer <= 0 && e.state !== 'move') {
          this.transitionState(e, 'move');
        }

        let moveX = dx / dist;
        let moveZ = dz / dist;
        let speed = e.def.moveSpeed;

        if (e.def.behavior === 'flanker' && dist > 4.2) {
          // Curved lateral flank dive
          moveX += e.flankSign * 0.62;
          const mLen = Math.hypot(moveX, moveZ) || 1;
          moveX /= mLen;
          moveZ /= mLen;
        } else if (e.def.behavior === 'charger' && dist < 13 && dist > 3.2) {
          speed *= 1.48;
        } else if (e.def.behavior === 'ranged' && dist < e.def.attackRange * 0.72) {
          speed *= 0.25;
        }

        e.x = Math.max(
          -this.trackHalfWidth,
          Math.min(this.trackHalfWidth, e.x + moveX * speed * dt)
        );
        e.z += moveZ * speed * dt;
        e.root.position.set(e.x, 0, e.z);
      }
    }
  }

  public clear(): void {
    for (const e of this.enemies) {
      e.mixer?.stopAllAction();
      this.group.remove(e.root);
      disposeObject3D(e.root, true);
    }
    for (const m of this.disposableMats) m.dispose();
    this.enemies = [];
    this.disposableMats = [];
  }

  public dispose(): void {
    this.clear();
    this.sharedRingGeo.dispose();
    this.sharedBarBgGeo.dispose();
    this.sharedBarFillGeo.dispose();
    this.sharedBarBgMat.dispose();
    this.sharedEliteRingMat.dispose();
    this.scene.remove(this.group);
  }
}
