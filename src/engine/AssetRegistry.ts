import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AssetManifest, StageConfig, WorldConfig } from '../types/game';

export interface LoadedModelAsset {
  id: string;
  gltf: GLTF;
  animations: THREE.AnimationClip[];
  size: THREE.Vector3;
  baseOffsetY: number;
  hasSkins: boolean;
}

export class AssetRegistry {
  private manifest: AssetManifest | null = null;
  private gltfLoader = new GLTFLoader();
  private rgbeLoader = new RGBELoader();
  private modelCache = new Map<string, LoadedModelAsset>();
  private loadingModels = new Map<string, Promise<LoadedModelAsset>>();
  private hdriCache = new Map<string, THREE.Texture>();
  private pmremGenerator: THREE.PMREMGenerator;

  constructor(renderer: THREE.WebGLRenderer) {
    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    this.pmremGenerator.compileEquirectangularShader();
  }

  public async loadManifest(): Promise<AssetManifest> {
    if (this.manifest) return this.manifest;
    const res = await fetch('./assets/manifest.json');
    if (!res.ok) {
      throw new Error(`Failed to load assets/manifest.json (${res.status})`);
    }
    this.manifest = (await res.json()) as AssetManifest;
    return this.manifest;
  }

  public getManifest(): AssetManifest {
    if (!this.manifest) throw new Error('Asset manifest not loaded');
    return this.manifest;
  }

  public async loadModel(id: string): Promise<LoadedModelAsset> {
    const cached = this.modelCache.get(id);
    if (cached) return cached;

    const pending = this.loadingModels.get(id);
    if (pending) return pending;

    const manifest = this.getManifest();
    const entry = manifest.models[id];
    if (!entry) {
      throw new Error(`Unknown logical asset ID: "${id}"`);
    }

    const promise = new Promise<LoadedModelAsset>((resolve, reject) => {
      this.gltfLoader.load(
        `./${entry.path}`,
        (gltf) => {
          gltf.scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = new THREE.Vector3();
          box.getSize(size);
          if (size.y < 0.001) size.set(1, 1, 1);

          let hasSkins = false;
          gltf.scene.traverse((obj) => {
            if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
              hasSkins = true;
            }
            if ((obj as THREE.Mesh).isMesh) {
              const mesh = obj as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              for (const mat of mats) {
                if (mat && 'roughness' in mat) {
                  const std = mat as THREE.MeshStandardMaterial;
                  std.roughness = Math.max(0.35, std.roughness ?? 0.75);
                  std.metalness = Math.min(0.45, std.metalness ?? 0.1);
                }
              }
            }
          });

          const loaded: LoadedModelAsset = {
            id,
            gltf,
            animations: gltf.animations || [],
            size,
            baseOffsetY: Number.isFinite(box.min.y) ? -box.min.y : 0,
            hasSkins
          };
          this.modelCache.set(id, loaded);
          this.loadingModels.delete(id);
          resolve(loaded);
        },
        undefined,
        (err) => {
          this.loadingModels.delete(id);
          reject(new Error(`Failed to load GLB "${id}" (${entry.path}): ${err}`));
        }
      );
    });

    this.loadingModels.set(id, promise);
    return promise;
  }

  public getCachedModel(id: string): LoadedModelAsset {
    const asset = this.modelCache.get(id);
    if (!asset) {
      throw new Error(`Model "${id}" requested before preloading`);
    }
    return asset;
  }

  /**
   * Instantiate a normalized GLB clone grounded at y=0 with targetHeight in world meters.
   */
  public instantiateModel(
    id: string,
    targetHeight: number,
    options?: {
      tintHex?: string;
      emissiveHex?: string;
      emissiveIntensity?: number;
      castShadow?: boolean;
      receiveShadow?: boolean;
      cloneMaterials?: boolean;
    }
  ): { root: THREE.Group; model: THREE.Object3D; asset: LoadedModelAsset } {
    const asset = this.getCachedModel(id);
    const cloned = asset.hasSkins ? SkeletonUtils.clone(asset.gltf.scene) : asset.gltf.scene.clone(true);

    const scaleFactor = targetHeight / Math.max(0.05, asset.size.y);
    cloned.scale.setScalar(scaleFactor);
    cloned.position.y = asset.baseOffsetY * scaleFactor;

    const needsMatClone = Boolean(options?.tintHex || options?.emissiveHex || options?.cloneMaterials);
    const tint = options?.tintHex ? new THREE.Color(options.tintHex) : null;
    const emissive = options?.emissiveHex ? new THREE.Color(options.emissiveHex) : null;

    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.frustumCulled = false; // Safe for animated skinned meshes
        if (options?.castShadow !== undefined) mesh.castShadow = options.castShadow;
        if (options?.receiveShadow !== undefined) mesh.receiveShadow = options.receiveShadow;

        if (needsMatClone) {
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map((m) => this.applyMatOverrides(m.clone(), tint, emissive, options?.emissiveIntensity));
          } else if (mesh.material) {
            mesh.material = this.applyMatOverrides(mesh.material.clone(), tint, emissive, options?.emissiveIntensity);
          }
        }
      }
    });

    const root = new THREE.Group();
    root.add(cloned);
    return { root, model: cloned, asset };
  }

  private applyMatOverrides(
    mat: THREE.Material,
    tint: THREE.Color | null,
    emissive: THREE.Color | null,
    emissiveIntensity?: number
  ): THREE.Material {
    mat.userData.disposable = true;
    const std = mat as THREE.MeshStandardMaterial;
    if (tint && std.color) {
      std.color.lerp(tint, 0.42);
    }
    if (emissive && std.emissive) {
      std.emissive.copy(emissive);
      std.emissiveIntensity = emissiveIntensity ?? 0.35;
    }
    return mat;
  }

  public async loadHdri(hdriId: string): Promise<THREE.Texture | null> {
    const cached = this.hdriCache.get(hdriId);
    if (cached) return cached;
    const manifest = this.getManifest();
    const entry = manifest.hdris[hdriId];
    if (!entry) return null;

    try {
      const equirect = await this.rgbeLoader.loadAsync(`./${entry.path}`);
      const envRT = this.pmremGenerator.fromEquirectangular(equirect);
      equirect.dispose();
      this.hdriCache.set(hdriId, envRT.texture);
      return envRT.texture;
    } catch {
      return null;
    }
  }

  /**
   * Lazy-load only the assets needed for a specific stage + world (plus core player/common props).
   */
  public async preloadStage(
    stage: StageConfig,
    world: WorldConfig,
    enemyAssetIds: string[],
    enableEnvMap: boolean,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<void> {
    const ids = new Set<string>([
      'char_soldier',
      'char_commander',
      'prop_coin',
      'prop_chest_gold',
      stage.arenaAssetId,
      stage.gateAssetId,
      stage.goalAssetId,
      stage.boss.assetId,
      world.trackAssetId,
      world.altTrackAssetId,
      ...world.sidePropIds,
      ...world.accentPropIds,
      ...stage.obstacles.map((o) => o.assetId),
      ...enemyAssetIds
    ]);

    const idList = [...ids];
    const total = idList.length + (enableEnvMap ? 1 : 0);
    let done = 0;

    await Promise.all(
      idList.map(async (id) => {
        await this.loadModel(id);
        done++;
        onProgress?.(done, total);
      })
    );

    if (enableEnvMap) {
      await this.loadHdri(world.hdriId);
      done++;
      onProgress?.(done, total);
    }
  }

  /**
   * Helper to find the best matching animation clip from a real GLB's AnimationClip list.
   */
  public static pickClip(
    clips: THREE.AnimationClip[],
    keywords: string[]
  ): THREE.AnimationClip | null {
    if (!clips || clips.length === 0) return null;
    for (const kw of keywords) {
      const lower = kw.toLowerCase();
      const exact = clips.find((c) => {
        const shortName = c.name.includes('|') ? c.name.split('|').pop()! : c.name;
        return shortName.toLowerCase() === lower;
      });
      if (exact) return exact;
    }
    for (const kw of keywords) {
      const lower = kw.toLowerCase();
      const partial = clips.find((c) => c.name.toLowerCase().includes(lower));
      if (partial) return partial;
    }
    return clips[0];
  }

  public dispose(): void {
    this.pmremGenerator.dispose();
    for (const tex of this.hdriCache.values()) tex.dispose();
    this.hdriCache.clear();
  }
}

export function disposeObject3D(obj: THREE.Object3D, skipSharedGeometries = true): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      if (!skipSharedGeometries && mesh.geometry) {
        mesh.geometry.dispose();
      }
      // Dispose cloned materials (we mark custom/disposable materials with userData.disposable = true)
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m && m.userData?.disposable) {
          m.dispose();
        }
      }
    }
  });
}
