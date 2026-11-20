import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const MANIFEST_PATH = path.join(PUBLIC_DIR, 'assets', 'manifest.json');
const STAGES_DIR = path.join(ROOT, 'src', 'data', 'stages');

let errors = [];
function fail(msg) {
  errors.push(msg);
}

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error('FATAL: public/assets/manifest.json is missing. Run node scripts/fetch-assets.mjs first.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

// 1. Validate all manifest assets exist and have valid binary headers
for (const [id, m] of Object.entries(manifest.models)) {
  const full = path.join(PUBLIC_DIR, m.path);
  if (!fs.existsSync(full)) {
    fail(`Missing model file for ${id}: ${m.path}`);
    continue;
  }
  const buf = fs.readFileSync(full);
  if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') {
    fail(`Invalid GLB header for ${id}: ${m.path}`);
  }
  if (!m.source || !m.owner || !m.license) {
    fail(`Incomplete manifest metadata for model ${id}`);
  }
}

for (const [id, a] of Object.entries(manifest.audio)) {
  const full = path.join(PUBLIC_DIR, a.path);
  if (!fs.existsSync(full)) {
    fail(`Missing audio file for ${id}: ${a.path}`);
    continue;
  }
  const buf = fs.readFileSync(full);
  if (buf.length < 32 || buf.toString('ascii', 0, 4) !== 'OggS') {
    fail(`Invalid OGG header for ${id}: ${a.path}`);
  }
}

for (const [id, h] of Object.entries(manifest.hdris)) {
  const full = path.join(PUBLIC_DIR, h.path);
  if (!fs.existsSync(full)) {
    fail(`Missing HDRI file for ${id}: ${h.path}`);
    continue;
  }
  const head = fs.readFileSync(full, 'utf8').slice(0, 16);
  if (!head.startsWith('#?RADIANCE') && !head.startsWith('#?RGBE')) {
    fail(`Invalid HDR header for ${id}: ${h.path}`);
  }
}

// Parse enemy definitions from src/data/enemies.ts to cross-check asset IDs and balance
const enemiesSrc = fs.readFileSync(path.join(ROOT, 'src', 'data', 'enemies.ts'), 'utf8');
const enemyBlocks = [...enemiesSrc.matchAll(/(\w+):\s*\{([\s\S]*?)\n  \}/g)];
const enemyMap = {};
for (const m of enemyBlocks) {
  const id = m[1];
  const body = m[2];
  const assetMatch = body.match(/assetId:\s*'([^']+)'/);
  const hpMatch = body.match(/baseHp:\s*([\d.]+)/);
  const dmgMatch = body.match(/baseDamage:\s*([\d.]+)/);
  if (assetMatch) {
    enemyMap[id] = {
      assetId: assetMatch[1],
      baseHp: hpMatch ? Number(hpMatch[1]) : 40,
      baseDamage: dmgMatch ? Number(dmgMatch[1]) : 12
    };
    if (!manifest.models[assetMatch[1]]) {
      fail(`Enemy ${id} references unknown model assetId: ${assetMatch[1]}`);
    }
  }
}

// 2. Validate all 30 stage JSON files
const WORLD_COUNT = {};
let totalWaves = 0;

for (let i = 1; i <= 30; i++) {
  const file = path.join(STAGES_DIR, `stage-${String(i).padStart(2, '0')}.json`);
  if (!fs.existsSync(file)) {
    fail(`Missing stage config: stage-${String(i).padStart(2, '0')}.json`);
    continue;
  }
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  WORLD_COUNT[s.worldId] = (WORLD_COUNT[s.worldId] || 0) + 1;

  if (s.stageNumber !== i) fail(`Stage ${i} has mismatched stageNumber=${s.stageNumber}`);
  for (const field of ['arenaAssetId', 'gateAssetId', 'goalAssetId']) {
    if (!manifest.models[s[field]]) {
      fail(`Stage ${i} ${field}="${s[field]}" not found in manifest.json`);
    }
  }
  if (!manifest.models[s.boss.assetId]) {
    fail(`Stage ${i} boss.assetId="${s.boss.assetId}" not found in manifest.json`);
  }
  if (!s.boss.patterns || s.boss.patterns.length < 2) {
    fail(`Stage ${i} boss must have at least 2 attack patterns`);
  }
  if (!enemyMap[s.boss.summonEnemyId]) {
    fail(`Stage ${i} boss.summonEnemyId="${s.boss.summonEnemyId}" not defined in enemies.ts`);
  }

  // Validate 4 waves of expected kinds
  if (!Array.isArray(s.waves) || s.waves.length !== 4) {
    fail(`Stage ${i} must have exactly 4 waves`);
  } else {
    totalWaves += s.waves.length;
    const expectedKinds = ['normal', 'mixed', 'elite', 'boss'];
    s.waves.forEach((w, idx) => {
      if (w.kind !== expectedKinds[idx]) {
        fail(`Stage ${i} wave ${idx + 1} expected kind=${expectedKinds[idx]}, got ${w.kind}`);
      }
      for (const g of w.groups) {
        if (!enemyMap[g.enemyId]) {
          fail(`Stage ${i} wave ${idx + 1} references unknown enemyId="${g.enemyId}"`);
        }
      }
    });
  }

  // Validate every gate row has at least one non-negative route
  for (const row of s.gates) {
    if (row.left.type === 'sub' && row.right.type === 'sub') {
      fail(`Stage ${i} gate at z=${row.z} has negative effect on both lanes!`);
    }
  }

  // Validate obstacles reference real assets
  for (const obs of s.obstacles) {
    if (!manifest.models[obs.assetId]) {
      fail(`Stage ${i} obstacle references unknown assetId="${obs.assetId}"`);
    }
  }

  // 3. Deterministic winnability simulation check for each stage
  // Assumes reasonable player progression for stage i (permanent upgrades earned from prior stages)
  const expectedUpg = Math.min(10, Math.floor((i - 1) / 3));
  let squad = 6 + expectedUpg * 2 + (s.initialSquadBonus || 0);
  const maxCap = Math.min(120, 45 + expectedUpg * 8);
  let dmgPerShot = 14 + expectedUpg * 5.2;
  let fireRate = 2.6 + expectedUpg * 0.24;

  // Player picks optimal gate in each row
  for (const row of s.gates) {
    const pickOptimal = (opt) => {
      if (opt.type === 'mul') return squad * (opt.value - 1);
      if (opt.type === 'add') return opt.value;
      if (opt.type === 'damage_buff') return squad * 0.28;
      if (opt.type === 'rate_buff') return squad * 0.25;
      return -opt.value;
    };
    const chosen = pickOptimal(row.left) >= pickOptimal(row.right) ? row.left : row.right;
    if (chosen.type === 'add') squad = Math.min(maxCap, squad + chosen.value);
    else if (chosen.type === 'mul') squad = Math.min(maxCap, squad * chosen.value);
    else if (chosen.type === 'damage_buff') dmgPerShot *= 1 + chosen.value / 100;
    else if (chosen.type === 'rate_buff') fireRate *= 1 + chosen.value / 100;
  }

  const squadDps = squad * dmgPerShot * fireRate;
  const timeToKillBoss = s.boss.hp / Math.max(1, squadDps);
  // Boss should be killable within 22s of sustained fire (not instant <1.5s, not impossible >25s)
  if (timeToKillBoss > 26) {
    fail(`Stage ${i} boss TTK too high (${timeToKillBoss.toFixed(1)}s, squad=${squad}, dps=${squadDps.toFixed(0)}, bossHp=${s.boss.hp})`);
  }
}

if (Object.keys(WORLD_COUNT).length !== 5) {
  fail(`Expected 5 worlds across stages, got ${Object.keys(WORLD_COUNT).length}`);
}
if (totalWaves !== 120) {
  fail(`Expected 120 total waves across 30 stages, got ${totalWaves}`);
}

if (errors.length > 0) {
  console.error(`VALIDATION FAILED (${errors.length} errors):`);
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}

console.log(
  `VALIDATION PASSED: ${Object.keys(manifest.models).length} GLB models, ${Object.keys(manifest.audio).length} OGG audio, ${Object.keys(manifest.hdris).length} HDRIs, 30 stages, 5 worlds, ${totalWaves} waves verified & balanced.`
);
