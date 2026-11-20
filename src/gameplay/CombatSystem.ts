import type { PlayerSquadController } from './PlayerSquadController';
import type { EnemyAIManager } from './EnemyAI';
import type { BossStateMachine } from './BossStateMachine';
import type { GateManager } from './GateManager';
import type { WeaponSystem } from './WeaponSystem';
import type { AudioManager } from '../engine/AudioManager';
import type { CameraController } from '../engine/CameraController';

export interface CombatTickResult {
  coinsEarned: number;
  enemiesKilled: number;
  bossKilled: boolean;
  primaryTargetX: number | null;
  primaryTargetZ: number | null;
}

export class CombatSystem {
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
  ): CombatTickResult {
    let coinsEarned = 0;
    let enemiesKilled = 0;
    let bossKilled = false;

    const units = squad.getUnits();
    const activeEnemies = enemies.getEnemies();
    const obstacles = gates.getObstacles();
    const fireInterval = 1 / Math.max(0.5, squad.getEffectiveFireRate());
    const baseDamage = squad.getEffectiveDamage();

    // Limit visual bullets spawned per frame at massive squad counts by bundling surplus damage into super-rounds
    // so 120 units still deliver full 120x DPS cleanly without overflowing bullet pools!
    const count = units.length;
    const sampleStride = count > 48 ? Math.ceil(count / 40) : 1;
    const damagePerShot = baseDamage * sampleStride;

    let primaryTargetX: number | null = null;
    let primaryTargetZ: number | null = null;
    let bestGlobalScore = Infinity;

    // 1. Auto-targeting & Firing for all alive squad units (distance + threat + forward cone)
    for (let i = 0; i < count; i += sampleStride) {
      const u = units[i];
      u.fireTimer -= dt;
      if (u.fireTimer > 0) continue;

      let bestX = 0;
      let bestY = 1.1;
      let bestZ = 0;
      let bestScore = Infinity;
      let found = false;

      // Evaluate enemies within forward cone (range 27m)
      for (let j = 0; j < activeEnemies.length; j++) {
        const e = activeEnemies[j];
        if (!e.alive) continue;
        const dz = e.z - u.z;
        if (dz < -2.0 || dz > 27.5) continue;
        const dx = e.x - u.x;
        const dist = Math.hypot(dx, dz);
        if (dist > 28) continue;

        // Forward cone preference + threat weighting (closer/elites prioritized)
        const lateralPenalty = Math.abs(dx) * 0.45;
        const threatBonus = e.isElite ? -3.5 : e.def.behavior === 'flanker' ? -1.8 : 0;
        const score = dist + lateralPenalty + threatBonus;
        if (score < bestScore) {
          bestScore = score;
          bestX = e.x;
          bestY = e.isElite ? 1.55 : 0.95;
          bestZ = e.z;
          found = true;
        }
      }

      // Evaluate active boss
      if (boss.active && !boss.defeated) {
        const dz = boss.z - u.z;
        const dx = boss.x - u.x;
        const dist = Math.hypot(dx, dz);
        if (dz > -2 && dist < 34) {
          const score = dist - 1.5;
          if (score < bestScore) {
            bestScore = score;
            bestX = boss.x + (Math.random() - 0.5) * 1.4;
            bestY = 2.0;
            bestZ = boss.z;
            found = true;
          }
        }
      }

      // Evaluate destructible barrels/crates directly ahead
      if (!found) {
        for (let k = 0; k < obstacles.length; k++) {
          const o = obstacles[k];
          if (!o.alive || !o.destructible) continue;
          const dz = o.z - u.z;
          if (dz < 0.5 || dz > 20) continue;
          const dx = Math.abs(o.x - u.x);
          if (dx > 3.6) continue;
          const score = dz + dx;
          if (score < bestScore) {
            bestScore = score;
            bestX = o.x;
            bestY = 0.8;
            bestZ = o.z;
            found = true;
          }
        }
      }

      if (found) {
        u.fireTimer = fireInterval * (0.9 + Math.random() * 0.2);
        weapons.spawnPlayerShot(u.x, 1.05, u.z + 0.55, bestX, bestY, bestZ, damagePerShot);
        audio.play('sfx_shoot', 0.2, 65, 0.14);

        if (bestScore < bestGlobalScore) {
          bestGlobalScore = bestScore;
          primaryTargetX = bestX;
          primaryTargetZ = bestZ;
        }
      } else {
        u.fireTimer = 0.08;
      }
    }

    // 2. Player projectile collision vs enemies, boss, and destructible obstacles
    const pBullets = weapons.getPlayerBullets();
    for (let i = 0; i < pBullets.length; i++) {
      const b = pBullets[i];
      if (!b.active) continue;

      let hit = false;

      // vs Boss
      if (boss.active && !boss.defeated) {
        const dx = b.x - boss.x;
        const dz = b.z - boss.z;
        const r = boss.radius + b.radius;
        if (dx * dx + dz * dz <= r * r) {
          b.active = false;
          hit = true;
          weapons.spawnBurst(b.x, b.y, b.z, 0xffe46b, 3, 3.0);
          audio.play('sfx_hit', 0.25, 70, 0.15);
          const res = boss.takeDamage(b.damage, weapons, audio, camera, onBanner);
          if (res.killed) {
            bossKilled = true;
            coinsEarned += res.rewardCoins;
          }
        }
      }
      if (hit) continue;

      // vs Enemies
      for (let j = 0; j < activeEnemies.length; j++) {
        const e = activeEnemies[j];
        if (!e.alive) continue;
        const dx = b.x - e.x;
        const dz = b.z - e.z;
        const r = e.radius + b.radius;
        if (dx * dx + dz * dz <= r * r) {
          b.active = false;
          hit = true;
          weapons.spawnBurst(b.x, b.y, b.z, 0xffe46b, 2, 2.5);
          audio.play('sfx_hit', 0.22, 75, 0.15);
          const res = enemies.damageEnemy(e, b.damage, weapons, audio);
          if (res.killed) {
            enemiesKilled++;
            coinsEarned += res.coins;
          }
          break;
        }
      }
      if (hit) continue;

      // vs Destructible Obstacles
      for (let k = 0; k < obstacles.length; k++) {
        const o = obstacles[k];
        if (!o.alive || !o.destructible) continue;
        const dx = b.x - o.x;
        const dz = b.z - o.z;
        const r = o.radius + b.radius;
        if (dx * dx + dz * dz <= r * r) {
          b.active = false;
          weapons.spawnBurst(b.x, b.y, b.z, 0xfbbf24, 3, 3.0);
          gates.damageObstacle(o, b.damage, weapons, audio);
          break;
        }
      }
    }

    // 3. Enemy/Boss projectile collision vs Squad Units
    const eBullets = weapons.getEnemyBullets();
    for (let i = 0; i < eBullets.length; i++) {
      const b = eBullets[i];
      if (!b.active) continue;
      if (Math.abs(b.z - squad.centerZ) > squad.getSquadRadius() + 2.0) continue;

      const hitRes = squad.applyDamageAt(b.x, b.z, b.damage, b.radius + 0.58, 1);
      if (hitRes.hitPos) {
        b.active = false;
        weapons.spawnBurst(hitRes.hitPos.x, 0.9, hitRes.hitPos.z, 0xff4971, 6, 4.0);
        audio.play('sfx_hurt', 0.48, 100);
      }
    }

    return {
      coinsEarned,
      enemiesKilled,
      bossKilled,
      primaryTargetX,
      primaryTargetZ
    };
  }
}
