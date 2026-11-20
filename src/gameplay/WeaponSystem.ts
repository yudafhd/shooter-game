import * as THREE from 'three';

export interface Projectile {
  active: boolean;
  fromPlayer: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  radius: number;
  life: number;
  colorIndex: number;
  scale: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

const MAX_PLAYER_BULLETS = 320;
const MAX_ENEMY_BULLETS = 110;
const MAX_PARTICLES = 180;

export class WeaponSystem {
  private group = new THREE.Group();
  private playerBullets: Projectile[] = [];
  private enemyBullets: Projectile[] = [];
  private particles: Particle[] = [];

  private playerMesh: THREE.InstancedMesh;
  private enemyMesh: THREE.InstancedMesh;
  private particleMesh: THREE.InstancedMesh;

  private dummy = new THREE.Object3D();
  private upVec = new THREE.Vector3(0, 1, 0);
  private dirVec = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private particleBudget = 120;

  constructor(scene: THREE.Scene) {
    // Player tracer bolts (elongated capsule-like prism via InstancedMesh -> 1 draw call!)
    const pGeo = new THREE.CapsuleGeometry(0.085, 0.52, 4, 6);
    pGeo.rotateX(Math.PI / 2);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffe46b });
    this.playerMesh = new THREE.InstancedMesh(pGeo, pMat, MAX_PLAYER_BULLETS);
    this.playerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.playerMesh.frustumCulled = false;
    this.playerMesh.count = 0;

    // Enemy / boss energy projectiles (octahedron crystal shard -> 1 draw call!)
    const eGeo = new THREE.OctahedronGeometry(0.28, 1);
    const eMat = new THREE.MeshBasicMaterial({ color: 0xff4971 });
    this.enemyMesh = new THREE.InstancedMesh(eGeo, eMat, MAX_ENEMY_BULLETS);
    this.enemyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyMesh.frustumCulled = false;
    this.enemyMesh.count = 0;

    // Pooled VFX sparks/debris (1 draw call!)
    const vGeo = new THREE.DodecahedronGeometry(0.16, 0);
    const vMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(vGeo, vMat, MAX_PARTICLES);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.count = 0;

    for (let i = 0; i < MAX_PLAYER_BULLETS; i++) {
      this.playerBullets.push({
        active: false,
        fromPlayer: true,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        damage: 0,
        radius: 0.35,
        life: 0,
        colorIndex: 0,
        scale: 1
      });
    }

    for (let i = 0; i < MAX_ENEMY_BULLETS; i++) {
      this.enemyBullets.push({
        active: false,
        fromPlayer: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        damage: 0,
        radius: 0.45,
        life: 0,
        colorIndex: 0,
        scale: 1
      });
    }

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.4,
        scale: 1,
        color: new THREE.Color(0xffffff)
      });
    }

    this.group.add(this.playerMesh, this.enemyMesh, this.particleMesh);
    scene.add(this.group);
  }

  public setParticleBudget(budget: number): void {
    this.particleBudget = Math.min(MAX_PARTICLES, Math.max(20, budget));
  }

  public clear(): void {
    for (const b of this.playerBullets) b.active = false;
    for (const b of this.enemyBullets) b.active = false;
    for (const p of this.particles) p.active = false;
    this.playerMesh.count = 0;
    this.enemyMesh.count = 0;
    this.particleMesh.count = 0;
  }

  public spawnPlayerShot(
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
    damage: number,
    speed = 42
  ): void {
    let slot: Projectile | null = null;
    for (let i = 0; i < this.playerBullets.length; i++) {
      if (!this.playerBullets[i].active) {
        slot = this.playerBullets[i];
        break;
      }
    }
    if (!slot) return;

    const dx = tx - x;
    const dy = ty - y;
    const dz = tz - z;
    const len = Math.hypot(dx, dy, dz) || 1;
    slot.active = true;
    slot.fromPlayer = true;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = (dx / len) * speed;
    slot.vy = (dy / len) * speed;
    slot.vz = (dz / len) * speed;
    slot.damage = damage;
    slot.radius = 0.42;
    slot.life = 1.45;
    slot.scale = 1.0;
  }

  public spawnEnemyShot(
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
    damage: number,
    speed = 17,
    scale = 1.0
  ): void {
    let slot: Projectile | null = null;
    for (let i = 0; i < this.enemyBullets.length; i++) {
      if (!this.enemyBullets[i].active) {
        slot = this.enemyBullets[i];
        break;
      }
    }
    if (!slot) return;

    const dx = tx - x;
    const dy = ty - y;
    const dz = tz - z;
    const len = Math.hypot(dx, dy, dz) || 1;
    slot.active = true;
    slot.fromPlayer = false;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = (dx / len) * speed;
    slot.vy = (dy / len) * speed;
    slot.vz = (dz / len) * speed;
    slot.damage = damage;
    slot.radius = 0.45 * scale;
    slot.life = 2.8;
    slot.scale = scale;
  }

  public spawnBurst(x: number, y: number, z: number, colorHex: number, count = 6, spread = 4.2): void {
    let spawned = 0;
    for (let i = 0; i < this.particleBudget && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        const a = Math.random() * Math.PI * 2;
        const spd = (0.35 + Math.random() * 0.65) * spread;
        p.vx = Math.cos(a) * spd;
        p.vy = 1.6 + Math.random() * spread * 0.7;
        p.vz = Math.sin(a) * spd;
        p.maxLife = 0.25 + Math.random() * 0.28;
        p.life = p.maxLife;
        p.scale = 0.7 + Math.random() * 0.85;
        p.color.setHex(colorHex);
        spawned++;
      }
    }
  }

  public getPlayerBullets(): Projectile[] {
    return this.playerBullets;
  }

  public getEnemyBullets(): Projectile[] {
    return this.enemyBullets;
  }

  public update(dt: number): void {
    let pCount = 0;
    for (let i = 0; i < this.playerBullets.length; i++) {
      const b = this.playerBullets[i];
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.life -= dt;
      if (b.life <= 0 || b.y < -1) {
        b.active = false;
        continue;
      }
      this.dummy.position.set(b.x, b.y, b.z);
      this.dirVec.set(b.vx, b.vy, b.vz).normalize();
      this.quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.dirVec);
      this.dummy.quaternion.copy(this.quat);
      this.dummy.scale.setScalar(b.scale);
      this.dummy.updateMatrix();
      this.playerMesh.setMatrixAt(pCount++, this.dummy.matrix);
    }
    this.playerMesh.count = pCount;
    this.playerMesh.instanceMatrix.needsUpdate = true;

    let eCount = 0;
    for (let i = 0; i < this.enemyBullets.length; i++) {
      const b = this.enemyBullets[i];
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.life -= dt;
      if (b.life <= 0 || b.y < -1) {
        b.active = false;
        continue;
      }
      this.dummy.position.set(b.x, b.y, b.z);
      this.dummy.rotation.set(b.life * 8, b.life * 10, 0);
      this.dummy.scale.setScalar(b.scale);
      this.dummy.updateMatrix();
      this.enemyMesh.setMatrixAt(eCount++, this.dummy.matrix);
    }
    this.enemyMesh.count = eCount;
    this.enemyMesh.instanceMatrix.needsUpdate = true;

    let vCount = 0;
    for (let i = 0; i < this.particleBudget; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy -= 12.0 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.08, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const t = p.life / p.maxLife;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.life * 6, p.life * 4, 0);
      this.dummy.scale.setScalar(p.scale * t);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(vCount, this.dummy.matrix);
      this.particleMesh.setColorAt(vCount, p.color);
      vCount++;
    }
    this.particleMesh.count = vCount;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
    void this.upVec;
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.playerMesh.geometry.dispose();
    (this.playerMesh.material as THREE.Material).dispose();
    this.enemyMesh.geometry.dispose();
    (this.enemyMesh.material as THREE.Material).dispose();
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
  }
}
