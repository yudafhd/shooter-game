import * as THREE from 'three';
import { AssetRegistry, disposeObject3D } from '../engine/AssetRegistry';
import type { StageConfig, WorldConfig } from '../types/game';
import type { QualityProfile } from '../engine/PerformanceManager';

export class StageDirector {
  private scene: THREE.Scene;
  private assets: AssetRegistry;
  private worldGroup = new THREE.Group();
  private animatedProps: Array<{ mesh: THREE.Object3D; baseY: number; phase: number; mode: 'bob' | 'spin' }> = [];
  private backdropMesh: THREE.Mesh | null = null;
  private createdGeos: THREE.BufferGeometry[] = [];
  private createdMats: THREE.Material[] = [];

  private ambientLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private currentWorldMode: WorldConfig['waterMode'] = 'ocean';

  constructor(scene: THREE.Scene, assets: AssetRegistry) {
    this.scene = scene;
    this.assets = assets;
    this.scene.add(this.worldGroup);

    this.ambientLight = new THREE.HemisphereLight(0xdbeafe, 0x334155, 0.85);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfff7ed, 1.55);
    this.sunLight.position.set(22, 36, -18);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 140;
    const d = 28;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0008;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
  }

  public async buildStage(
    stage: StageConfig,
    world: WorldConfig,
    profile: QualityProfile
  ): Promise<void> {
    this.clear();
    this.currentWorldMode = world.waterMode;

    // 1. Sky, Fog, Poly Haven HDRI environment lighting
    this.scene.background = new THREE.Color(world.skyColor);
    this.scene.fog = new THREE.Fog(world.fogColor, world.fogNear, world.fogFar);

    if (profile.enableEnvMap) {
      const envTex = await this.assets.loadHdri(world.hdriId);
      this.scene.environment = envTex;
    } else {
      this.scene.environment = null;
    }

    this.ambientLight.color.set(world.ambientColor);
    this.ambientLight.groundColor.set(world.floorPlaneColor);
    this.ambientLight.intensity = world.ambientIntensity;

    this.sunLight.color.set(world.sunColor);
    this.sunLight.intensity = world.sunIntensity;
    this.sunLight.castShadow = profile.shadows;
    this.sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);

    // 2. Vast World Floor Backdrop (Ocean / Mossy Valley / Desert Dunes / Snowfield / Volcanic Lava)
    const floorGeo = new THREE.PlaneGeometry(260, stage.trackLength + 180, 24, 32);
    floorGeo.rotateX(-Math.PI / 2);
    this.createdGeos.push(floorGeo);

    const floorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(world.floorPlaneColor),
      emissive: world.floorPlaneEmissive ? new THREE.Color(world.floorPlaneEmissive) : new THREE.Color(0x000000),
      emissiveIntensity: world.waterMode === 'lava' ? 0.65 : 0,
      roughness: world.waterMode === 'ocean' ? 0.25 : world.waterMode === 'snow' ? 0.55 : 0.9,
      metalness: world.waterMode === 'ocean' ? 0.35 : 0.05
    });
    this.createdMats.push(floorMat);

    this.backdropMesh = new THREE.Mesh(floorGeo, floorMat);
    this.backdropMesh.position.set(0, -1.65, stage.trackLength * 0.5);
    this.backdropMesh.receiveShadow = false;
    this.worldGroup.add(this.backdropMesh);

    // 3. Modular 3D Track made from real Quaternius / Kenney GLB road, bridge & dungeon tiles
    this.buildModularTrack(stage, world);

    // 4. Flanking World Scenery & Props (real Quaternius trees, ships, rocks, columns, torches)
    this.buildScenery(stage, world, profile.propDensity);

    // 5. Boss Arena Accent Columns & Finish Goal Archway
    this.buildBossArenaAndFinish(stage, world);
  }

  private buildModularTrack(stage: StageConfig, world: WorldConfig): void {
    const tileLength = 10;
    const totalLength = stage.trackLength + 28;
    const numTiles = Math.ceil(totalLength / tileLength);
    const startZ = -14;

    const tileAsset = this.assets.getCachedModel(stage.arenaAssetId);
    const isStreetOrBridge =
      stage.arenaAssetId.includes('bridge') || stage.arenaAssetId.includes('street');
    const rawW = Math.max(0.1, tileAsset.size.x);
    const rawD = Math.max(0.1, tileAsset.size.z);
    const rawH = Math.max(0.05, tileAsset.size.y);

    // Quaternius street/bridge tiles run along local X (railings along ±Z), so rotate 90° to run along Z
    const sx = (stage.trackWidth + 1.0) / (isStreetOrBridge ? rawD : rawW);
    const sz = (tileLength + 0.14) / (isStreetOrBridge ? rawW : rawD);
    const sy = isStreetOrBridge ? 1.85 : Math.min(2.2, Math.max(0.45, 0.9 / rawH));

    // Subtle track curb rail for dungeon/open tracks (bridges already have real 3D railings!)
    if (!stage.arenaAssetId.includes('bridge')) {
      const railGeo = new THREE.BoxGeometry(0.45, 0.55, totalLength);
      this.createdGeos.push(railGeo);
      const railColor =
        world.waterMode === 'lava'
          ? 0x3b1d1a
          : world.waterMode === 'snow'
            ? 0xdbeafe
            : world.waterMode === 'sand'
              ? 0xa16207
              : 0x64748b;
      const railMat = new THREE.MeshStandardMaterial({ color: railColor, roughness: 0.78 });
      this.createdMats.push(railMat);

      const leftRail = new THREE.Mesh(railGeo, railMat);
      leftRail.position.set(-stage.trackWidth * 0.5 - 0.22, 0.18, startZ + totalLength * 0.5);
      leftRail.receiveShadow = true;
      const rightRail = new THREE.Mesh(railGeo, railMat);
      rightRail.position.set(stage.trackWidth * 0.5 + 0.22, 0.18, startZ + totalLength * 0.5);
      rightRail.receiveShadow = true;
      this.worldGroup.add(leftRail, rightRail);
    }

    // Place real 3D GLB tiles along the entire causeway
    for (let i = 0; i < numTiles; i++) {
      const tileZ = startZ + i * tileLength + tileLength * 0.5;
      const clone = tileAsset.gltf.scene.clone(true);
      if (isStreetOrBridge) {
        clone.rotation.y = Math.PI * 0.5;
        clone.scale.set(sz, sy, sx);
      } else {
        clone.scale.set(sx, sy, sz);
      }

      // Align walkable surface cleanly at y = 0 (keep bridge railings rising above y = 0!)
      clone.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(clone);
      const yOffset = stage.arenaAssetId.includes('bridge') ? -0.14 : -box.max.y;
      clone.position.set(
        -(box.min.x + box.max.x) * 0.5,
        yOffset,
        tileZ - (box.min.z + box.max.z) * 0.5
      );

      clone.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.receiveShadow = true;
          mesh.castShadow = false;
        }
      });

      this.worldGroup.add(clone);
    }
  }

  private buildScenery(stage: StageConfig, world: WorldConfig, density: number): void {
    const stepZ = Math.round(13 / Math.max(0.5, density));
    const halfTrack = stage.trackWidth * 0.5;
    let seed = stage.stageNumber * 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let z = -4; z < stage.trackLength + 18; z += stepZ) {
      for (const side of [-1, 1]) {
        const propId = world.sidePropIds[Math.floor(rand() * world.sidePropIds.length)];
        const isShip = propId.includes('ship');
        const distOut = isShip
          ? halfTrack + 8.5 + rand() * 14
          : halfTrack + 3.8 + rand() * 13;
        const targetH = isShip ? 7.5 + rand() * 3.5 : 3.2 + rand() * 4.2;

        const { root } = this.assets.instantiateModel(propId, targetH, {
          castShadow: false,
          receiveShadow: false
        });
        const yPos = isShip ? -1.45 : -1.55;
        root.position.set(side * distOut, yPos, z + (rand() - 0.5) * 4);
        root.rotation.y = rand() * Math.PI * 2;
        this.worldGroup.add(root);

        if (isShip) {
          this.animatedProps.push({
            mesh: root,
            baseY: yPos,
            phase: rand() * Math.PI * 2,
            mode: 'bob'
          });
        }

        // Accent pillar / torch / banner right beside track edges every 2 steps
        if (z % (stepZ * 2) === 0 && world.accentPropIds.length > 0) {
          const accentId = world.accentPropIds[Math.floor(rand() * world.accentPropIds.length)];
          const accentH = accentId.includes('torch') ? 2.4 : accentId.includes('banner') ? 3.8 : 4.2;
          const { root: accent } = this.assets.instantiateModel(accentId, accentH, {
            castShadow: false,
            receiveShadow: true
          });
          accent.position.set(side * (halfTrack + 1.4), 0, z);
          accent.rotation.y = side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
          this.worldGroup.add(accent);
        }
      }
    }
  }

  private buildBossArenaAndFinish(stage: StageConfig, world: WorldConfig): void {
    const bossZ = stage.waves[3].spawnZ;
    const finishZ = stage.trackLength;
    const halfTrack = stage.trackWidth * 0.5;

    // Boss Arena corner pillars
    const pillarAsset = world.waterMode === 'lava' ? 'env_column_dark' : 'env_column';
    for (const side of [-1, 1]) {
      for (const zOff of [-10, 4]) {
        const { root } = this.assets.instantiateModel(pillarAsset, 5.8, {
          castShadow: true,
          receiveShadow: true
        });
        root.position.set(side * (halfTrack + 0.9), 0, bossZ + zOff);
        this.worldGroup.add(root);
      }
    }

    // Finish Goal Archway + Goal Flags + Floating Gold Coins
    const { root: finishArch } = this.assets.instantiateModel(stage.gateAssetId, 6.2, {
      tintHex: '#fbbf24',
      emissiveHex: '#b45309',
      emissiveIntensity: 0.22,
      castShadow: true,
      receiveShadow: true,
      cloneMaterials: true
    });
    finishArch.scale.x = 2.05;
    finishArch.position.set(0, 0, finishZ);
    this.worldGroup.add(finishArch);

    for (const side of [-1, 1]) {
      const { root: flag } = this.assets.instantiateModel(stage.goalAssetId, 4.4, {
        castShadow: true
      });
      flag.position.set(side * (halfTrack - 0.6), 0, finishZ - 1.0);
      this.worldGroup.add(flag);
    }

    for (let i = -2; i <= 2; i++) {
      const { root: coin } = this.assets.instantiateModel('prop_coin', 1.1, { castShadow: false });
      coin.position.set(i * 1.9, 1.2, finishZ - 4.0);
      this.worldGroup.add(coin);
      this.animatedProps.push({ mesh: coin, baseY: 1.2, phase: i * 0.6, mode: 'spin' });
    }
  }

  public update(dt: number, squadZ: number): void {
    // Move directional shadow frustum with the player squad so shadows stay sharp along entire 180m track!
    this.sunLight.position.set(22, 34, squadZ - 16);
    this.sunLight.target.position.set(0, 0, squadZ + 12);
    this.sunLight.target.updateMatrixWorld();

    const t = performance.now() * 0.0018;
    for (const item of this.animatedProps) {
      if (item.mode === 'bob') {
        item.mesh.position.y = item.baseY + Math.sin(t + item.phase) * 0.25;
        item.mesh.rotation.z = Math.sin(t * 0.8 + item.phase) * 0.035;
      } else if (item.mode === 'spin') {
        item.mesh.rotation.y += dt * 2.6;
        item.mesh.position.y = item.baseY + Math.sin(t * 2.0 + item.phase) * 0.22;
      }
    }

    if (this.backdropMesh && this.currentWorldMode === 'lava') {
      const mat = this.backdropMesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.55 + Math.sin(t * 1.8) * 0.18;
    }
  }

  public clear(): void {
    while (this.worldGroup.children.length > 0) {
      const child = this.worldGroup.children[0];
      this.worldGroup.remove(child);
      disposeObject3D(child, true);
    }
    for (const g of this.createdGeos) g.dispose();
    for (const m of this.createdMats) m.dispose();
    this.createdGeos = [];
    this.createdMats = [];
    this.animatedProps = [];
    this.backdropMesh = null;
  }

  public dispose(): void {
    this.clear();
    this.scene.remove(this.worldGroup);
    this.scene.remove(this.ambientLight);
    this.scene.remove(this.sunLight);
    this.scene.remove(this.sunLight.target);
  }
}
