import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const STAGES_DIR = path.join(ROOT, 'src', 'data', 'stages');

// Parse enemy stats from src/data/enemies.ts
const enemiesSrc = fs.readFileSync(path.join(ROOT, 'src', 'data', 'enemies.ts'), 'utf8');
const enemies = {};
for (const m of enemiesSrc.matchAll(/(\w+):\s*\{([\s\S]*?)\n  \}/g)) {
  const id = m[1];
  const body = m[2];
  const num = (k, def) => {
    const r = body.match(new RegExp(`${k}:\\s*([\\d.]+)`));
    return r ? Number(r[1]) : def;
  };
  enemies[id] = {
    baseHp: num('baseHp', 40),
    baseDamage: num('baseDamage', 12),
    coinValue: num('coinValue', 5)
  };
}

// Mirror SaveManager upgrade formulas
let coins = 0;
const upg = { initialSquad: 0, unitDamage: 0, fireRate: 0, maxCapacity: 0 };
const SPECS = {
  initialSquad: { max: 15, base: 70, mul: 1.42 },
  unitDamage: { max: 15, base: 85, mul: 1.44 },
  fireRate: { max: 15, base: 90, mul: 1.45 },
  maxCapacity: { max: 10, base: 110, mul: 1.48 }
};

function cost(key) {
  const s = SPECS[key];
  return Math.round(s.base * Math.pow(s.mul, upg[key]));
}

function autoUpgrade() {
  // Spend earned coins smartly on the cheapest available upgrade
  for (let iter = 0; iter < 20; iter++) {
    const keys = Object.keys(SPECS).filter((k) => upg[k] < SPECS[k].max);
    keys.sort((a, b) => cost(a) - cost(b));
    if (keys.length === 0 || coins < cost(keys[0])) break;
    coins -= cost(keys[0]);
    upg[keys[0]]++;
  }
}

let allPassed = true;
const summary = [];

for (let i = 1; i <= 30; i++) {
  const stage = JSON.parse(
    fs.readFileSync(path.join(STAGES_DIR, `stage-${String(i).padStart(2, '0')}.json`), 'utf8')
  );

  const maxCap = Math.min(120, 40 + upg.maxCapacity * 8);
  let squad = Math.min(maxCap, 6 + upg.initialSquad * 2 + (stage.initialSquadBonus || 0));
  const unitHp = 32 + Math.floor(upg.initialSquad * 2.5);
  let dmgMult = 1.0;
  let rateMult = 1.0;
  const baseDmg = 14 + upg.unitDamage * 5;
  const baseRate = 2.6 + upg.fireRate * 0.24;

  // Simulate traversing track: waves & gates in Z-order
  const events = [
    ...stage.gates.map((g) => ({ z: g.z, kind: 'gate', data: g })),
    ...stage.waves.map((w) => ({ z: w.triggerZ, kind: 'wave', data: w }))
  ].sort((a, b) => a.z - b.z);

  let stageCoins = 0;

  for (const ev of events) {
    if (ev.kind === 'gate') {
      const score = (opt) => {
        if (opt.type === 'mul') return squad * (opt.value - 1);
        if (opt.type === 'add') return opt.value;
        if (opt.type === 'damage_buff') return squad * 0.35;
        if (opt.type === 'rate_buff') return squad * 0.32;
        return -opt.value;
      };
      const pick = score(ev.data.left) >= score(ev.data.right) ? ev.data.left : ev.data.right;
      if (pick.type === 'add') squad = Math.min(maxCap, squad + pick.value);
      else if (pick.type === 'mul') squad = Math.min(maxCap, squad * pick.value);
      else if (pick.type === 'damage_buff') dmgMult += pick.value / 100;
      else if (pick.type === 'rate_buff') rateMult += pick.value / 100;
      else if (pick.type === 'sub') squad = Math.max(0, squad - pick.value);
    } else if (ev.kind === 'wave') {
      const w = ev.data;
      let waveHp = 0;
      let waveThreatDps = 0;
      for (const g of w.groups) {
        const def = enemies[g.enemyId];
        const hpMul = g.isElite ? (w.eliteModifier?.hpMultiplier ?? 2.4) : 1;
        const dmgMul = g.isElite ? (w.eliteModifier?.damageMultiplier ?? 1.45) : 1;
        waveHp += def.baseHp * hpMul * g.count;
        // Effective contact/ranged pressure accounting for player kiting & shooting from 25m out
        waveThreatDps += def.baseDamage * dmgMul * g.count * 0.14;
        stageCoins += def.coinValue * (g.isElite ? 3 : 1) * g.count;
      }
      const dps = Math.max(1, squad * baseDmg * dmgMult * baseRate * rateMult);
      const clearTime = waveHp / dps;
      // Only enemies surviving close approach deal damage (scaled down as wave thins)
      const incomingDmg = waveThreatDps * Math.min(clearTime, 5.5) * 0.35;
      const unitsLost = Math.floor(incomingDmg / unitHp);
      squad = Math.max(0, squad - unitsLost);
    }
  }

  // Boss Fight simulation (player dodges ~65% of telegraphed slams/charges via horizontal steering)
  const dps = Math.max(1, squad * baseDmg * dmgMult * baseRate * rateMult);
  const bossTime = stage.boss.hp / dps;
  const bossAttacks = Math.floor(bossTime / stage.boss.attackCooldown);
  const bossDmgTaken = bossAttacks * stage.boss.damage * 1.15;
  const bossUnitsLost = Math.floor(bossDmgTaken / unitHp);
  squad = Math.max(0, squad - bossUnitsLost);

  const won = squad >= 1 && bossTime < 28;
  if (!won) allPassed = false;

  stageCoins += stage.boss.rewardCoins + stage.rewardCoins;
  coins += stageCoins;
  autoUpgrade();

  summary.push(
    `S${String(i).padStart(2, '0')} (${stage.worldId.slice(0, 6)}): ${won ? 'WIN ' : 'FAIL'} | endSquad=${String(squad).padStart(3)} | bossTTK=${bossTime.toFixed(1)}s | upg=[${upg.initialSquad},${upg.unitDamage},${upg.fireRate},${upg.maxCapacity}]`
  );
}

console.log(summary.join('\n'));
if (!allPassed) {
  console.error('\nQA SIMULATION FAILED: One or more stages could not be cleared!');
  process.exit(1);
}
console.log('\nQA SIMULATION PASSED: All 30/30 stages across 5 worlds cleared cleanly with progressive upgrades!');
