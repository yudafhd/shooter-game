import * as THREE from 'three';
import { AssetRegistry, disposeObject3D } from '../engine/AssetRegistry';
import type { GateOptionConfig, GateRowConfig, ObstacleConfig } from '../types/game';
import type { PlayerSquadController } from './PlayerSquadController';
import type { WeaponSystem } from './WeaponSystem';
import type { AudioManager } from '../engine/AudioManager';

export interface ActiveGateRow {
  z: number;
  triggered: boolean;
  left: GateOptionConfig;
  right: GateOptionConfig;
  leftGroup: THREE.Group;
  rightGroup: THREE.Group;
  leftPortal: THREE.Mesh;
  rightPortal: THREE.Mesh;
}

export interface ActiveObstacle {
  config: ObstacleConfig;
  root: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  x: number;
  z: number;
  baseX: number;
  hp: number;
  maxHp: number;
  destructible: boolean;
  alive: boolean;
  hitCooldown: number;
  phase: number;
  radius: number;
}

export class GateManager {
  private scene: THREE.Scene;
  private assets: AssetRegistry;
  private group = new THREE.Group();
  private rows: ActiveGateRow[] = [];
  private obstacles: ActiveObstacle[] = [];
  private createdTextures: THREE.Texture[] = [];
  private createdGeometries: THREE.BufferGeometry[] = [];
  private createdMaterials: THREE.Material[] = [];

  constructor(scene: THREE.Scene, assets: AssetRegistry) {
    this.scene = scene;
    this.assets = assets;
    this.scene.add(this.group);
  }

  public initStage(
    gateRows: GateRowConfig[],
    obstacleConfigs: ObstacleConfig[],
    gateAssetId: string,
    trackWidth: number
  ): void {
    this.clear();
    const laneOffset = trackWidth * 0.24;

    for (const row of gateRows) {
      // Camera looks toward +Z: screen-left is +X, screen-right is -X
      const leftBuilt = this.buildGateVisual(row.left, gateAssetId, laneOffset, row.z);
      const rightBuilt = this.buildGateVisual(row.right, gateAssetId, -laneOffset, row.z);
      this.group.add(leftBuilt.group, rightBuilt.group);
      this.rows.push({
        z: row.z,
        triggered: false,
        left: row.left,
        right: row.right,
        leftGroup: leftBuilt.group,
        rightGroup: rightBuilt.group,
        leftPortal: leftBuilt.portal,
        rightPortal: rightBuilt.portal
      });
    }

    for (const obsCfg of obstacleConfigs) {
      const targetHeight = obsCfg.kind === 'saw' ? 1.5 : obsCfg.kind === 'spikes' ? 0.55 : 1.45;
      const { root, model, asset } = this.assets.instantiateModel(obsCfg.assetId, targetHeight, {
        castShadow: true,
        receiveShadow: true,
        cloneMaterials: true
      });
      root.position.set(obsCfg.x, 0, obsCfg.z);
      this.group.add(root);

      let mixer: THREE.AnimationMixer | null = null;
      if (asset.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        const clip = asset.animations[0];
        mixer.clipAction(clip).play();
      }

      const destructible = obsCfg.kind === 'barrel' || obsCfg.kind === 'crate';
      this.obstacles.push({
        config: obsCfg,
        root,
        mixer,
        x: obsCfg.x,
        z: obsCfg.z,
        baseX: obsCfg.x,
        hp: obsCfg.hp ?? 9999,
        maxHp: obsCfg.hp ?? 9999,
        destructible,
        alive: true,
        hitCooldown: 0,
        phase: Math.random() * Math.PI * 2,
        radius: obsCfg.kind === 'saw' ? 1.15 : 1.05
      });
    }
  }

  private getGateColors(opt: GateOptionConfig): { primary: string; glowHex: number; badgeBg: string } {
    if (opt.type === 'sub') {
      return { primary: '#ff4455', glowHex: 0xff3344, badgeBg: '#7f1220' };
    }
    if (opt.type === 'mul') {
      return { primary: '#fbbf24', glowHex: 0xf59e0b, badgeBg: '#78350f' };
    }
    if (opt.type === 'damage_buff' || opt.type === 'rate_buff') {
      return { primary: '#a855f7', glowHex: 0x9333ea, badgeBg: '#4c1d95' };
    }
    return { primary: '#22d3ee', glowHex: 0x0ea5e9, badgeBg: '#0c4a6e' };
  }

  private buildGateVisual(
    opt: GateOptionConfig,
    gateAssetId: string,
    x: number,
    z: number
  ): { group: THREE.Group; portal: THREE.Mesh } {
    const container = new THREE.Group();
    container.position.set(x, 0, z);

    const colors = this.getGateColors(opt);

    // Real 3D Quaternius Arch GLB framing the gate
    const { root: arch } = this.assets.instantiateModel(gateAssetId, 4.4, {
      tintHex: colors.primary,
      castShadow: true,
      receiveShadow: true,
      cloneMaterials: true
    });
    // Slightly widen arch to clearly cover half of the track
    arch.scale.x = 1.28;
    container.add(arch);

    // Translucent glowing energy curtain inside the real 3D arch
    const portalGeo = new THREE.PlaneGeometry(4.1, 3.3);
    this.createdGeometries.push(portalGeo);
    const portalMat = new THREE.MeshBasicMaterial({
      color: colors.glowHex,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.createdMaterials.push(portalMat);
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.position.set(0, 1.7, 0);
    container.add(portal);

    // Crisp floating sign canvas texture above the portal for instant legibility
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 192);

    ctx.fillStyle = colors.badgeBg;
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.roundRect(14, 14, 484, 164, 28);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 78px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 10;
    ctx.fillText(opt.label, 256, 100);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.createdTextures.push(tex);

    const signGeo = new THREE.PlaneGeometry(4.3, 1.55);
    this.createdGeometries.push(signGeo);
    const signMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide
    });
    this.createdMaterials.push(signMat);
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 3.55, -0.35);
    // Face back toward camera (-Z)
    sign.rotation.y = Math.PI;
    container.add(sign);

    return { group: container, portal };
  }

  public getObstacles(): ActiveObstacle[] {
    return this.obstacles;
  }

  public damageObstacle(obs: ActiveObstacle, damage: number, weapons: WeaponSystem, audio: AudioManager): void {
    if (!obs.alive || !obs.destructible) return;
    obs.hp -= damage;
    if (obs.hp <= 0) {
      obs.alive = false;
      obs.root.visible = false;
      weapons.spawnBurst(obs.x, 0.8, obs.z, 0xf59e0b, 10, 5.0);
      audio.play('sfx_enemy_die', 0.45, 70);
    }
  }

  public update(
    dt: number,
    squad: PlayerSquadController,
    weapons: WeaponSystem,
    audio: AudioManager,
    onBanner?: (text: string, tone: 'good' | 'bad' | 'buff') => void
  ): void {
    const time = performance.now() * 0.003;

    // 1. Check gate crossings
    for (const row of this.rows) {
      if (row.triggered) continue;
      // Pulse portal energy
      const pulse = 0.34 + Math.sin(time + row.z) * 0.08;
      (row.leftPortal.material as THREE.MeshBasicMaterial).opacity = pulse;
      (row.rightPortal.material as THREE.MeshBasicMaterial).opacity = pulse;

      if (squad.centerZ >= row.z - 0.55) {
        row.triggered = true;
        const choseLeft = squad.centerX > 0;
        const chosen = choseLeft ? row.left : row.right;
        const chosenX = choseLeft ? 3.1 : -3.1;
        this.applyGateEffect(chosen, chosenX, row.z, squad, weapons, audio, onBanner);

        // Dim portals once passed
        (row.leftPortal.material as THREE.MeshBasicMaterial).opacity = 0.06;
        (row.rightPortal.material as THREE.MeshBasicMaterial).opacity = 0.06;
      }
    }

    // 2. Update obstacles & collision with squad
    for (const obs of this.obstacles) {
      if (!obs.alive) continue;
      obs.hitCooldown = Math.max(0, obs.hitCooldown - dt);
      if (obs.mixer) obs.mixer.update(dt);

      if (obs.config.kind === 'saw') {
        obs.phase += dt * (obs.config.patrolSpeed ?? 1.8);
        obs.x = obs.baseX + Math.sin(obs.phase) * (obs.config.patrolWidth ?? 2.8);
        obs.root.position.x = obs.x;
        // Spin the circular saw blade in its vertical plane
        const child = obs.root.children[0];
        if (child) child.rotation.z += dt * 7.5;
      }

      if (Math.abs(obs.z - squad.centerZ) > 5.0) continue;

      if (obs.hitCooldown <= 0) {
        const hitRes = squad.applyDamageAt(obs.x, obs.z, obs.config.damage, obs.radius + 0.45, 2);
        if (hitRes.hitPos) {
          obs.hitCooldown = obs.destructible ? 0.55 : 0.48;
          weapons.spawnBurst(hitRes.hitPos.x, 0.9, hitRes.hitPos.z, 0xff4455, 6, 4.2);
          audio.play('sfx_hurt', 0.55, 110);
          if (obs.destructible) {
            // Crashing through a crate/barrel breaks it after dealing one impact
            obs.alive = false;
            obs.root.visible = false;
            weapons.spawnBurst(obs.x, 0.8, obs.z, 0xd97706, 9, 4.5);
          }
        }
      }
    }
  }

  private applyGateEffect(
    opt: GateOptionConfig,
    x: number,
    z: number,
    squad: PlayerSquadController,
    weapons: WeaponSystem,
    audio: AudioManager,
    onBanner?: (text: string, tone: 'good' | 'bad' | 'buff') => void
  ): void {
    if (opt.type === 'add') {
      const added = squad.addUnits(opt.value);
      weapons.spawnBurst(x, 1.5, z, 0x22d3ee, 14, 5.5);
      audio.play('sfx_gate_good', 0.85, 60);
      onBanner?.(`+${added} SQUAD`, 'good');
    } else if (opt.type === 'mul') {
      const current = squad.getCount();
      const targetAdd = Math.max(1, Math.round(current * (opt.value - 1)));
      const added = squad.addUnits(targetAdd);
      weapons.spawnBurst(x, 1.8, z, 0xfbbf24, 18, 6.2);
      audio.play('sfx_gate_good', 0.95, 60);
      onBanner?.(`x${opt.value} SQUAD (+${added})`, 'good');
    } else if (opt.type === 'sub') {
      const lost = squad.removeUnits(opt.value);
      weapons.spawnBurst(x, 1.5, z, 0xff3344, 14, 5.5);
      audio.play('sfx_gate_bad', 0.85, 60);
      onBanner?.(`-${lost} SQUAD`, 'bad');
    } else if (opt.type === 'damage_buff') {
      squad.damageMultiplier += opt.value / 100;
      weapons.spawnBurst(x, 1.6, z, 0xa855f7, 16, 5.8);
      audio.play('sfx_gate_good', 0.9, 60);
      onBanner?.(opt.label, 'buff');
    } else if (opt.type === 'rate_buff') {
      squad.fireRateMultiplier += opt.value / 100;
      weapons.spawnBurst(x, 1.6, z, 0xa855f7, 16, 5.8);
      audio.play('sfx_gate_good', 0.9, 60);
      onBanner?.(opt.label, 'buff');
    } else if (opt.type === 'heal') {
      squad.healAll(opt.value / 100);
      weapons.spawnBurst(x, 1.5, z, 0x34d399, 14, 5.0);
      audio.play('sfx_gate_good', 0.85, 60);
      onBanner?.('SQUAD HEALED', 'good');
    }
  }

  public clear(): void {
    for (const r of this.rows) {
      this.group.remove(r.leftGroup, r.rightGroup);
      disposeObject3D(r.leftGroup, true);
      disposeObject3D(r.rightGroup, true);
    }
    for (const o of this.obstacles) {
      o.mixer?.stopAllAction();
      this.group.remove(o.root);
      disposeObject3D(o.root, true);
    }
    for (const t of this.createdTextures) t.dispose();
    for (const g of this.createdGeometries) g.dispose();
    for (const m of this.createdMaterials) m.dispose();
    this.rows = [];
    this.obstacles = [];
    this.createdTextures = [];
    this.createdGeometries = [];
    this.createdMaterials = [];
  }

  public dispose(): void {
    this.clear();
    this.scene.remove(this.group);
  }
}
