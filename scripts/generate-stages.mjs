import fs from 'node:fs';
import path from 'node:path';

const STAGES_DIR = path.join(process.cwd(), 'src', 'data', 'stages');
fs.mkdirSync(STAGES_DIR, { recursive: true });

const WORLD_THEMES = [
  {
    worldId: 'ocean_crossing',
    arenaAssetId: 'env_bridge_water',
    names: [
      'Harbor Causeway',
      'Coral Span',
      'Stormbreaker Pier',
      'Siren Viaduct',
      'Tidal Barricade',
      'Leviathan Crossing'
    ],
    melee: ['reef_crab', 'tide_frog'],
    ranged: ['sea_viper', 'sea_hornet'],
    flanker: ['bilge_rat'],
    elite: ['tide_frog', 'reef_crab', 'sea_viper'],
    bosses: [
      { id: 'tide_mech', assetId: 'boss_stan', name: 'Harbor Sentinel', scale: 1.35 },
      { id: 'corsair_mech', assetId: 'boss_mike', name: 'Iron Corsair', scale: 1.4 },
      { id: 'abyss_rex', assetId: 'boss_trex', name: 'Leviathan Apex', scale: 1.05 }
    ],
    obstacles: [
      { kind: 'barrel', assetId: 'obs_barrel', damage: 12, hp: 55 },
      { kind: 'spikes', assetId: 'obs_spikes', damage: 18 },
      { kind: 'saw', assetId: 'obs_saw', damage: 22 }
    ]
  },
  {
    worldId: 'overgrown_ruins',
    arenaAssetId: 'env_dungeon_floor',
    names: [
      'Mossy Courtyard',
      'Sunken Aqueduct',
      'Vinebound Hall',
      'Canopy Sanctum',
      'Elder Watch',
      'Colossus Altar'
    ],
    melee: ['ruin_spider', 'moss_stego'],
    ranged: ['temple_cobra', 'canopy_wasp'],
    flanker: ['jungle_raptor', 'ruin_spider'],
    elite: ['moss_stego', 'jungle_raptor'],
    bosses: [
      { id: 'ruin_walker', assetId: 'boss_mike', name: 'Mossbound Guardian', scale: 1.45, tintHex: '#82d99a' },
      { id: 'canopy_strikebot', assetId: 'boss_leela', name: 'Verdant Stalker', scale: 1.45, tintHex: '#9ee6a8' },
      { id: 'ancient_colossus', assetId: 'boss_george', name: 'Overgrown Colossus', scale: 1.55, tintHex: '#7ed490' }
    ],
    obstacles: [
      { kind: 'crate', assetId: 'obs_crate', damage: 14, hp: 75 },
      { kind: 'spikes', assetId: 'obs_spikes', damage: 22 },
      { kind: 'saw', assetId: 'obs_saw', damage: 26 }
    ]
  },
  {
    worldId: 'dust_outpost',
    arenaAssetId: 'env_street_straight',
    names: [
      'Redrock Highway',
      'Sunburst Checkpoint',
      'Scrapyard Trench',
      'Dune Artillery Line',
      'Mirage Bastion',
      'Warlord Fortress'
    ],
    melee: ['scrap_raider', 'outpost_enforcer'],
    ranged: ['dune_gunner', 'sand_drone'],
    flanker: ['jungle_raptor', 'sand_drone'],
    elite: ['canyon_charger', 'outpost_enforcer'],
    bosses: [
      { id: 'dune_leela', assetId: 'boss_leela', name: 'Sirocco Striker', scale: 1.48, tintHex: '#ffd08a' },
      { id: 'bastion_stan', assetId: 'boss_stan', name: 'Siege Bastion MK-IV', scale: 1.55, tintHex: '#f5b971' },
      { id: 'sand_tyrant', assetId: 'boss_mike', name: 'Dust Warlord Titan', scale: 1.65, tintHex: '#ffbe6b' }
    ],
    obstacles: [
      { kind: 'barrel', assetId: 'obs_barrel', damage: 18, hp: 95 },
      { kind: 'crate', assetId: 'obs_crate', damage: 18, hp: 100 },
      { kind: 'saw', assetId: 'obs_saw', damage: 30 }
    ]
  },
  {
    worldId: 'frozen_pass',
    arenaAssetId: 'env_dungeon_floor_snow',
    names: [
      'Frostgate Trail',
      'Icicle Bridge',
      'Glacier Rampart',
      'Blizzard Overlook',
      'Permafrost Keep',
      'Glacier Sovereign'
    ],
    melee: ['frost_vanguard', 'ice_bull'],
    ranged: ['cryo_gunner', 'sand_drone'],
    flanker: ['frost_wolf'],
    elite: ['ice_bull', 'cryo_gunner', 'frost_vanguard'],
    bosses: [
      { id: 'frost_george', assetId: 'boss_george', name: 'Permafrost Warden', scale: 1.58, tintHex: '#a3e4ff' },
      { id: 'cryo_leela', assetId: 'boss_leela', name: 'Blizzard Valkyrie', scale: 1.58, tintHex: '#8ad8ff' },
      { id: 'glacier_rex', assetId: 'boss_trex', name: 'Glacier Apex Titan', scale: 1.18, tintHex: '#9ce2ff' }
    ],
    obstacles: [
      { kind: 'spikes', assetId: 'obs_spikes', damage: 28 },
      { kind: 'saw', assetId: 'obs_saw', damage: 34 },
      { kind: 'crate', assetId: 'obs_crate', damage: 22, hp: 130 }
    ]
  },
  {
    worldId: 'inferno_citadel',
    arenaAssetId: 'env_dungeon_floor_lava',
    names: [
      'Ashfall Causeway',
      'Brimstone Gate',
      'Cinder Armory',
      'Obsidian Spire',
      'Hellfire Crucible',
      'Citadel Overlord'
    ],
    melee: ['obsidian_knight', 'pyro_juggernaut'],
    ranged: ['inferno_artillery', 'dune_gunner'],
    flanker: ['ash_skull', 'magma_raptor'],
    elite: ['pyro_juggernaut', 'inferno_artillery', 'obsidian_knight'],
    bosses: [
      { id: 'cinder_stan', assetId: 'boss_stan', name: 'Crucible Dreadnought', scale: 1.65, tintHex: '#ff7043' },
      { id: 'hell_george', assetId: 'boss_george', name: 'Obsidian Behemoth', scale: 1.72, tintHex: '#ff5233' },
      { id: 'inferno_overlord', assetId: 'boss_trex', name: 'Inferno Overlord Rex', scale: 1.28, tintHex: '#ff4b24' }
    ],
    obstacles: [
      { kind: 'saw', assetId: 'obs_saw', damage: 40 },
      { kind: 'spikes', assetId: 'obs_spikes', damage: 35 },
      { kind: 'barrel', assetId: 'obs_barrel', damage: 28, hp: 160 }
    ]
  }
];

function buildGates(stageNumber, trackLength, worldIdx) {
  const rows = [];
  const gatePositions = [
    Math.round(trackLength * 0.14),
    Math.round(trackLength * 0.34),
    Math.round(trackLength * 0.56),
    Math.round(trackLength * 0.74)
  ];

  const baseAdd = 4 + Math.floor(stageNumber * 0.45);
  const bigAdd = 7 + Math.floor(stageNumber * 0.65);

  const templates = [
    [
      { type: 'add', value: baseAdd, label: `+${baseAdd}` },
      { type: 'sub', value: Math.max(3, Math.floor(baseAdd * 0.75)), label: `-${Math.max(3, Math.floor(baseAdd * 0.75))}` }
    ],
    [
      { type: 'damage_buff', value: 20 + worldIdx * 4, label: `+${20 + worldIdx * 4}% DMG` },
      { type: 'add', value: baseAdd + 2, label: `+${baseAdd + 2}` }
    ],
    [
      { type: 'mul', value: 2, label: 'x2 SQUAD' },
      { type: 'sub', value: Math.max(4, Math.floor(baseAdd * 0.9)), label: `-${Math.max(4, Math.floor(baseAdd * 0.9))}` }
    ],
    [
      { type: 'rate_buff', value: 22 + worldIdx * 3, label: `+${22 + worldIdx * 3}% RATE` },
      { type: 'add', value: bigAdd, label: `+${bigAdd}` }
    ]
  ];

  gatePositions.forEach((z, idx) => {
    const [a, b] = templates[idx % templates.length];
    // Alternate left/right placement deterministically so player actively steers
    const swap = (stageNumber + idx) % 2 === 1;
    rows.push({
      z,
      left: swap ? b : a,
      right: swap ? a : b
    });
  });

  return rows;
}

function buildObstacles(stageNumber, trackLength, obsPool) {
  const obstacles = [];
  const count = Math.min(6, 2 + Math.floor(stageNumber / 5));
  const startZ = trackLength * 0.22;
  const endZ = trackLength * 0.72;
  const step = (endZ - startZ) / Math.max(1, count);

  for (let i = 0; i < count; i++) {
    const z = Math.round(startZ + i * step + 4);
    const tpl = obsPool[(stageNumber + i) % obsPool.length];
    const laneChoices = [-3.6, 0, 3.6];
    const x = laneChoices[(stageNumber * 2 + i) % laneChoices.length];
    const obs = {
      z,
      x,
      kind: tpl.kind,
      assetId: tpl.assetId,
      damage: tpl.damage
    };
    if (tpl.hp) obs.hp = tpl.hp;
    if (tpl.kind === 'saw') {
      obs.patrolWidth = 3.2;
      obs.patrolSpeed = 1.6 + (stageNumber % 4) * 0.25;
    }
    obstacles.push(obs);
  }
  return obstacles;
}

const allStageFiles = [];

for (let stageNumber = 1; stageNumber <= 30; stageNumber++) {
  const worldIdx = Math.floor((stageNumber - 1) / 6);
  const localIdx = (stageNumber - 1) % 6; // 0..5
  const isWorldFinale = localIdx === 5;
  const theme = WORLD_THEMES[worldIdx];

  const trackLength = 152 + localIdx * 8 + worldIdx * 6;
  const trackWidth = 13;

  // Wave counts scale smoothly with stage number
  const w1Count = 5 + Math.floor(stageNumber * 0.4);
  const w2Melee = 4 + Math.floor(stageNumber * 0.35);
  const w2Ranged = 2 + Math.floor((stageNumber + 2) * 0.25);
  const w2Flank = 2 + Math.floor(stageNumber * 0.22);
  const w3Elites = isWorldFinale ? 3 : 1 + Math.floor(localIdx / 2);
  const w3Support = 4 + Math.floor(stageNumber * 0.3);

  const pick = (arr, offset = 0) => arr[(stageNumber + offset) % arr.length];

  const bossPoolIdx = isWorldFinale ? 2 : localIdx >= 3 ? 1 : 0;
  const bossDef = theme.bosses[bossPoolIdx];

  // Tuned boss HP curve balanced for exciting 6s-14s multi-pattern boss battles
  const baseBossHp = Math.round(
    (5200 + stageNumber * 2800 + Math.pow(stageNumber, 2.25) * 145) * (isWorldFinale ? 1.38 : 1.0)
  );
  const bossDamage = Math.round((18 + stageNumber * 1.9) * (isWorldFinale ? 1.18 : 1.0));

  const patterns = isWorldFinale
    ? ['area_slam', 'projectile_barrage', 'summon_minions', 'charge_rush']
    : localIdx % 2 === 0
      ? ['area_slam', 'projectile_barrage', 'summon_minions']
      : ['projectile_barrage', 'area_slam', 'charge_rush'];

  const bossZ = trackLength - 18;

  const stage = {
    stageNumber,
    name: theme.names[localIdx],
    worldId: theme.worldId,
    isWorldFinale,
    arenaAssetId: theme.arenaAssetId,
    gateAssetId: 'env_arch_gate',
    goalAssetId: 'prop_goal_flag',
    initialSquadBonus: Math.floor(worldIdx * 2),
    trackLength,
    trackWidth,
    gates: buildGates(stageNumber, trackLength, worldIdx),
    obstacles: buildObstacles(stageNumber, trackLength, theme.obstacles),
    waves: [
      {
        waveNumber: 1,
        kind: 'normal',
        triggerZ: Math.round(trackLength * 0.10),
        spawnZ: Math.round(trackLength * 0.24),
        groups: [
          { enemyId: pick(theme.melee, 0), count: w1Count, spreadX: 9.5 }
        ]
      },
      {
        waveNumber: 2,
        kind: 'mixed',
        triggerZ: Math.round(trackLength * 0.31),
        spawnZ: Math.round(trackLength * 0.47),
        groups: [
          { enemyId: pick(theme.melee, 1), count: w2Melee, spreadX: 9.5 },
          { enemyId: pick(theme.ranged, 0), count: w2Ranged, spreadX: 10.0 },
          { enemyId: pick(theme.flanker, 0), count: w2Flank, spreadX: 10.5 }
        ]
      },
      {
        waveNumber: 3,
        kind: 'elite',
        triggerZ: Math.round(trackLength * 0.54),
        spawnZ: Math.round(trackLength * 0.70),
        groups: [
          { enemyId: pick(theme.elite, 0), count: w3Elites, isElite: true, spreadX: 7.5 },
          { enemyId: pick(theme.ranged, 1), count: Math.max(2, Math.floor(w3Support * 0.5)), spreadX: 9.5 },
          { enemyId: pick(theme.melee, 0), count: Math.ceil(w3Support * 0.5), spreadX: 9.5 }
        ],
        eliteModifier: {
          hpMultiplier: 2.35 + worldIdx * 0.15,
          damageMultiplier: 1.45,
          scaleMultiplier: 1.38,
          cleaveRadius: 2.6
        }
      },
      {
        waveNumber: 4,
        kind: 'boss',
        triggerZ: Math.round(bossZ - 26),
        spawnZ: bossZ,
        groups: [
          { enemyId: pick(theme.flanker, 1), count: isWorldFinale ? 4 : 2, spreadX: 9.0 }
        ]
      }
    ],
    boss: {
      bossId: `${bossDef.id}_s${stageNumber}`,
      assetId: bossDef.assetId,
      name: isWorldFinale ? `${bossDef.name} (World Finale)` : bossDef.name,
      hp: baseBossHp,
      damage: bossDamage,
      scale: bossDef.scale,
      attackCooldown: Math.max(2.1, 3.3 - worldIdx * 0.18 - (isWorldFinale ? 0.25 : 0)),
      patterns,
      hasPhaseTwo: isWorldFinale || localIdx >= 3,
      summonEnemyId: pick(theme.flanker, 0),
      summonCount: isWorldFinale ? 4 : 3,
      rewardCoins: 45 + stageNumber * 12 + (isWorldFinale ? 60 : 0),
      ...(bossDef.tintHex ? { tintHex: bossDef.tintHex } : {})
    },
    rewardCoins: 60 + stageNumber * 16 + (isWorldFinale ? 90 : 0)
  };

  const fileName = `stage-${String(stageNumber).padStart(2, '0')}.json`;
  fs.writeFileSync(path.join(STAGES_DIR, fileName), JSON.stringify(stage, null, 2));
  allStageFiles.push({ stageNumber, fileName });
}

const indexLines = [
  "import type { StageConfig } from '../../types/game';",
  ...allStageFiles.map((s) => `import stage${String(s.stageNumber).padStart(2, '0')} from './${s.fileName}';`),
  '',
  'export const STAGES: StageConfig[] = [',
  ...allStageFiles.map((s) => `  stage${String(s.stageNumber).padStart(2, '0')} as StageConfig,`),
  '];',
  '',
  'export function getStageConfig(stageNumber: number): StageConfig {',
  '  const idx = Math.max(0, Math.min(STAGES.length - 1, stageNumber - 1));',
  '  return STAGES[idx];',
  '}',
  ''
];

fs.writeFileSync(path.join(STAGES_DIR, 'index.ts'), indexLines.join('\n'));
console.log(`Generated ${allStageFiles.length} data-driven JSON stage configs in src/data/stages/`);
