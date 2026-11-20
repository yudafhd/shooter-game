import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, 'public', 'assets');
const MODELS_DIR = path.join(ASSETS_DIR, 'models');
const AUDIO_DIR = path.join(ASSETS_DIR, 'audio');
const HDRI_DIR = path.join(ASSETS_DIR, 'hdri');
const TMP_DIR = path.join(ROOT, '_tmp_downloads');

for (const dir of [MODELS_DIR, AUDIO_DIR, HDRI_DIR, TMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const UA = 'CrowdSiegeAssetPipeline/1.0';

async function downloadFile(url, destPath, headers = {}) {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 256) {
    return;
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} downloading ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
}

/**
 * Parse a GLB file's JSON chunk to audit meshes, animations, and bounding box.
 */
function inspectGlb(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error(`Invalid GLB header: ${filePath}`);
  }
  const jsonLength = buf.readUInt32LE(12);
  const jsonType = buf.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) {
    throw new Error(`Invalid GLB JSON chunk: ${filePath}`);
  }
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLength));
  const animations = (gltf.animations || []).map((a, idx) => a.name || `clip_${idx}`);
  const meshCount = (gltf.meshes || []).length;
  const hasSkins = (gltf.skins || []).length > 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const mesh of gltf.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const posIdx = prim.attributes?.POSITION;
      if (posIdx !== undefined && gltf.accessors?.[posIdx]) {
        const acc = gltf.accessors[posIdx];
        if (acc.min && acc.max) {
          minX = Math.min(minX, acc.min[0]);
          minY = Math.min(minY, acc.min[1]);
          minZ = Math.min(minZ, acc.min[2]);
          maxX = Math.max(maxX, acc.max[0]);
          maxY = Math.max(maxY, acc.max[1]);
          maxZ = Math.max(maxZ, acc.max[2]);
        }
      }
    }
  }
  return {
    sizeBytes: buf.length,
    meshCount,
    hasSkins,
    animations,
    bounds: Number.isFinite(minY)
      ? {
          width: Number((maxX - minX).toFixed(3)),
          height: Number((maxY - minY).toFixed(3)),
          depth: Number((maxZ - minZ).toFixed(3))
        }
      : null
  };
}

const QUATERNIUS_BASE =
  'https://raw.githubusercontent.com/trebeljahr/quaternius-showcase/main/public/glb';

const QUATERNIUS_ASSETS = [
  // Player & weapons
  { id: 'char_soldier', category: 'player', pack: 'Quaternius Platformer Game Pack', remote: 'platformer_game_pack/Character_Gun.glb' },
  { id: 'char_commander', category: 'player', pack: 'Quaternius Cyberpunk Pack', remote: 'cyberpunk_pack/Character.glb' },
  { id: 'char_swat', category: 'player', pack: 'Quaternius Modular Men', remote: 'modular_men/Swat.glb' },
  { id: 'weapon_ar3', category: 'weapon', pack: 'Quaternius Modular Sci-Fi Guns', remote: 'modular_sci_fi_guns_pack/AR_3.glb' },

  // Monsters - Normal / Ranged / Flanker / Elite / Boss
  { id: 'enemy_crab', category: 'enemy', pack: 'Quaternius Platformer Game Pack', remote: 'platformer_game_pack/Crab.glb' },
  { id: 'enemy_frog', category: 'enemy', pack: 'Quaternius Easy Enemies Pack', remote: 'easy_enemies_pack/Frog.glb' },
  { id: 'enemy_rat', category: 'enemy', pack: 'Quaternius Easy Enemies Pack', remote: 'easy_enemies_pack/Rat.glb' },
  { id: 'enemy_snake', category: 'enemy', pack: 'Quaternius Easy Enemies Pack', remote: 'easy_enemies_pack/Snake.glb' },
  { id: 'enemy_snake_angry', category: 'enemy', pack: 'Quaternius Easy Enemies Pack', remote: 'easy_enemies_pack/Snake_angry.glb' },
  { id: 'enemy_spider', category: 'enemy', pack: 'Quaternius Easy Enemies Pack', remote: 'easy_enemies_pack/Spider.glb' },
  { id: 'enemy_wasp', category: 'enemy', pack: 'Quaternius Easy Enemies Pack', remote: 'easy_enemies_pack/Wasp.glb' },
  { id: 'enemy_bee', category: 'enemy', pack: 'Quaternius Platformer Game Pack', remote: 'platformer_game_pack/Bee.glb' },
  { id: 'enemy_skull', category: 'enemy', pack: 'Quaternius Platformer Game Pack', remote: 'platformer_game_pack/Skull.glb' },
  { id: 'enemy_wolf', category: 'enemy', pack: 'Quaternius Animals Pack', remote: 'animals_pack/Wolf.glb' },
  { id: 'enemy_bull', category: 'enemy', pack: 'Quaternius Animals Pack', remote: 'animals_pack/Bull.glb' },
  { id: 'enemy_raptor', category: 'enemy', pack: 'Quaternius Dinosaurs Pack', remote: 'dinosaurs_pack/Velociraptor.glb' },
  { id: 'enemy_triceratops', category: 'enemy', pack: 'Quaternius Dinosaurs Pack', remote: 'dinosaurs_pack/Triceratops.glb' },
  { id: 'enemy_stego', category: 'enemy', pack: 'Quaternius Dinosaurs Pack', remote: 'dinosaurs_pack/Stegosaurus.glb' },
  { id: 'enemy_bot_2legs', category: 'enemy', pack: 'Quaternius Cyberpunk Pack', remote: 'cyberpunk_pack/Enemy_2Legs.glb' },
  { id: 'enemy_bot_gun', category: 'enemy', pack: 'Quaternius Cyberpunk Pack', remote: 'cyberpunk_pack/Enemy_2Legs_Gun.glb' },
  { id: 'enemy_drone_gun', category: 'enemy', pack: 'Quaternius Cyberpunk Pack', remote: 'cyberpunk_pack/Enemy_Flying_Gun.glb' },
  { id: 'enemy_heavy', category: 'enemy', pack: 'Quaternius Cyberpunk Pack', remote: 'cyberpunk_pack/Enemy_Large.glb' },
  { id: 'enemy_heavy_gun', category: 'enemy', pack: 'Quaternius Cyberpunk Pack', remote: 'cyberpunk_pack/Enemy_Large_Gun.glb' },
  { id: 'enemy_knight', category: 'enemy', pack: 'Quaternius Single Knight Pack', remote: 'single_knight_pack/KnightCharacter.glb' },

  // Bosses
  { id: 'boss_stan', category: 'boss', pack: 'Quaternius Mech Pack', remote: 'mech_pack/Stan.glb' },
  { id: 'boss_mike', category: 'boss', pack: 'Quaternius Mech Pack', remote: 'mech_pack/Mike.glb' },
  { id: 'boss_leela', category: 'boss', pack: 'Quaternius Mech Pack', remote: 'mech_pack/Leela.glb' },
  { id: 'boss_george', category: 'boss', pack: 'Quaternius Mech Pack', remote: 'mech_pack/George.glb' },
  { id: 'boss_trex', category: 'boss', pack: 'Quaternius Dinosaurs Pack', remote: 'dinosaurs_pack/Trex.glb' },

  // Environment, Gates, Obstacles, Pickups
  { id: 'env_bridge_water', category: 'environment', pack: 'Quaternius Street Pack', remote: 'street_pack/Street_Bridge_Water.glb' },
  { id: 'env_bridge_straight', category: 'environment', pack: 'Quaternius Street Pack', remote: 'street_pack/Street_Bridge.glb' },
  { id: 'env_street_straight', category: 'environment', pack: 'Quaternius Street Pack', remote: 'street_pack/Street_Straight.glb' },
  { id: 'env_dungeon_floor', category: 'environment', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Floor_Modular.glb' },
  { id: 'env_dungeon_floor_snow', category: 'environment', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Floor_BricksSeparate.glb' },
  { id: 'env_dungeon_floor_lava', category: 'environment', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Floor_BricksSeparate2.glb' },
  { id: 'env_arch_gate', category: 'gate', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Arch.glb' },
  { id: 'env_arch_bars', category: 'environment', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Arch_bars.glb' },
  { id: 'env_column', category: 'prop', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Column.glb' },
  { id: 'env_column_dark', category: 'prop', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Column2.glb' },
  { id: 'env_wall', category: 'prop', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Wall_Modular.glb' },
  { id: 'env_wall_deco', category: 'prop', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Decorative_Wall.glb' },
  { id: 'prop_torch', category: 'prop', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Torch.glb' },
  { id: 'prop_woodfire', category: 'prop', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Woodfire.glb' },
  { id: 'prop_banner', category: 'prop', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Banner.glb' },
  { id: 'prop_chest_gold', category: 'prop', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Chest_Gold.glb' },
  { id: 'prop_goal_flag', category: 'prop', pack: 'Quaternius Platformer Game Pack', remote: 'platformer_game_pack/Goal_Flag.glb' },
  { id: 'prop_coin', category: 'prop', pack: 'Quaternius Platformer Game Pack', remote: 'platformer_game_pack/Coin.glb' },

  // Obstacles
  { id: 'obs_saw', category: 'obstacle', pack: 'Quaternius Platformer Game Pack', remote: 'platformer_game_pack/Hazard_Saw.glb' },
  { id: 'obs_spikes', category: 'obstacle', pack: 'Quaternius Platformer Game Pack', remote: 'platformer_game_pack/Hazard_SpikeTrap.glb' },
  { id: 'obs_barrel', category: 'obstacle', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Barrel.glb' },
  { id: 'obs_crate', category: 'obstacle', pack: 'Quaternius Modular Dungeon', remote: 'modular_dungeon_1/Crate.glb' },

  // World Scenery Props
  { id: 'prop_ship_sail', category: 'prop', pack: 'Quaternius Ships Pack', remote: 'ships_pack/Sail_ship.glb' },
  { id: 'prop_ship_viking', category: 'prop', pack: 'Quaternius Ships Pack', remote: 'ships_pack/Viking_boat.glb' },
  { id: 'prop_palm', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/PalmTree_1.glb' },
  { id: 'prop_tree_common', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/CommonTree_1.glb' },
  { id: 'prop_tree_birch', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/BirchTree_1.glb' },
  { id: 'prop_bush', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/Bush_1.glb' },
  { id: 'prop_rock_plain', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/Rock_1.glb' },
  { id: 'prop_rock_moss', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/Rock_Moss_1.glb' },
  { id: 'prop_cactus', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/Cactus_1.glb' },
  { id: 'prop_cactus_flower', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/CactusFlower_1.glb' },
  { id: 'prop_rock_desert', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/Rock_3.glb' },
  { id: 'prop_tree_dead', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/CommonTree_Dead_1.glb' },
  { id: 'prop_pine_snow', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/PineTree_Snow_1.glb' },
  { id: 'prop_birch_snow', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/BirchTree_Snow_1.glb' },
  { id: 'prop_rock_snow', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/Rock_Snow_1.glb' },
  { id: 'prop_bush_snow', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/Bush_Snow_1.glb' },
  { id: 'prop_rock_volcanic', category: 'prop', pack: 'Quaternius Ultimate Nature Pack', remote: 'nature_pack/Rock_6.glb' }
];

async function fetchKenneyPack(slug, outDir) {
  const zipPath = path.join(TMP_DIR, `${slug.replace(/\//g, '_')}.zip`);
  if (!fs.existsSync(outDir)) {
    const hex = Buffer.from(slug, 'utf8').toString('hex');
    const res = await fetch(`https://kenney.nl/download-link/${hex}`, {
      headers: { Referer: `https://kenney.nl/${slug}`, 'User-Agent': UA }
    });
    if (!res.ok) throw new Error(`Kenney download-link failed for ${slug}: ${res.status}`);
    const data = await res.json();
    if (!data.url) throw new Error(`No signed url for ${slug}`);
    await downloadFile(data.url, zipPath);
    fs.mkdirSync(outDir, { recursive: true });
    execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${outDir}' -Force"`, {
      stdio: 'pipe'
    });
  }
}

function findFiles(dir, predicate, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFiles(full, predicate, results);
    else if (predicate(full, entry.name)) results.push(full);
  }
  return results;
}

async function fetchPolyHavenHdri(id, outFile) {
  if (fs.existsSync(outFile) && fs.statSync(outFile).size > 1000) {
    return `https://polyhaven.com/a/${id}`;
  }
  const res = await fetch(`https://api.polyhaven.com/files/${id}`, {
    headers: { 'User-Agent': UA }
  });
  if (!res.ok) throw new Error(`Poly Haven API failed for ${id}: ${res.status}`);
  const data = await res.json();
  const url = data?.hdri?.['1k']?.hdr?.url;
  if (!url) throw new Error(`No 1k HDR url for ${id}`);
  await downloadFile(url, outFile);
  return `https://polyhaven.com/a/${id}`;
}

async function main() {
  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    models: {},
    audio: {},
    hdris: {}
  };

  console.log('1/4 Downloading Quaternius CC0 GLB models...');
  const concurrency = 8;
  for (let i = 0; i < QUATERNIUS_ASSETS.length; i += concurrency) {
    const batch = QUATERNIUS_ASSETS.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (item) => {
        const fileName = `${item.id}.glb`;
        const dest = path.join(MODELS_DIR, fileName);
        const url = `${QUATERNIUS_BASE}/${item.remote}`;
        await downloadFile(url, dest);
        const info = inspectGlb(dest);
        manifest.models[item.id] = {
          id: item.id,
          category: item.category,
          source: item.pack,
          owner: 'Quaternius (Tomas Laulhe)',
          license: 'CC0 1.0 Universal',
          originUrl: 'https://quaternius.com',
          path: `assets/models/${fileName}`,
          ...info
        };
      })
    );
  }
  console.log(`   Fetched & audited ${QUATERNIUS_ASSETS.length} Quaternius GLBs.`);

  console.log('2/4 Downloading official Kenney CC0 3D kits & audio packs...');
  const kenneyPacks = [
    { slug: 'assets/city-kit-roads', dir: path.join(TMP_DIR, 'kenney_roads') },
    { slug: 'assets/modular-dungeon-kit', dir: path.join(TMP_DIR, 'kenney_dungeon') },
    { slug: 'assets/blaster-kit', dir: path.join(TMP_DIR, 'kenney_blaster') },
    { slug: 'assets/impact-sounds', dir: path.join(TMP_DIR, 'kenney_impact') },
    { slug: 'assets/interface-sounds', dir: path.join(TMP_DIR, 'kenney_interface') },
    { slug: 'assets/sci-fi-sounds', dir: path.join(TMP_DIR, 'kenney_scifi') }
  ];
  for (const kp of kenneyPacks) {
    await fetchKenneyPack(kp.slug, kp.dir);
  }

  // Extract selected Kenney GLB models
  const kenneyModelSelections = [
    {
      id: 'kenney_road_straight',
      dir: path.join(TMP_DIR, 'kenney_roads'),
      match: /^road-straight\.glb$/i,
      category: 'environment',
      pack: 'Kenney City Kit (Roads)',
      url: 'https://kenney.nl/assets/city-kit-roads'
    },
    {
      id: 'kenney_road_bridge',
      dir: path.join(TMP_DIR, 'kenney_roads'),
      match: /^bridge-pillar\.glb$|^road-bridge\.glb$|^bridge\.glb$/i,
      category: 'environment',
      pack: 'Kenney City Kit (Roads)',
      url: 'https://kenney.nl/assets/city-kit-roads'
    },
    {
      id: 'kenney_blaster_rifle',
      dir: path.join(TMP_DIR, 'kenney_blaster'),
      match: /^blaster-a\.glb$|^blaster-b\.glb$|^blaster-c\.glb$/i,
      category: 'weapon',
      pack: 'Kenney Blaster Kit',
      url: 'https://kenney.nl/assets/blaster-kit'
    },
    {
      id: 'kenney_dungeon_gate',
      dir: path.join(TMP_DIR, 'kenney_dungeon'),
      match: /gate|arch|doorway|corridor|tile/i,
      category: 'environment',
      pack: 'Kenney Modular Dungeon Kit',
      url: 'https://kenney.nl/assets/modular-dungeon-kit'
    }
  ];

  for (const sel of kenneyModelSelections) {
    const glbs = findFiles(sel.dir, (_f, n) => n.toLowerCase().endsWith('.glb'));
    const chosen = glbs.find((f) => sel.match.test(path.basename(f))) || glbs[0];
    if (chosen) {
      const dest = path.join(MODELS_DIR, `${sel.id}.glb`);
      fs.copyFileSync(chosen, dest);
      const info = inspectGlb(dest);
      manifest.models[sel.id] = {
        id: sel.id,
        category: sel.category,
        source: sel.pack,
        owner: 'Kenney (kenney.nl)',
        license: 'CC0 1.0 Universal',
        originUrl: sel.url,
        path: `assets/models/${sel.id}.glb`,
        ...info
      };
      console.log(`   Extracted Kenney GLB: ${sel.id} <- ${path.basename(chosen)}`);
    } else {
      console.log(`   NOTE: No GLB found in ${sel.dir} (pack may use OBJ/FBX only)`);
    }
  }

  // Extract selected Kenney Audio files (OGG)
  const audioSelections = [
    { id: 'sfx_shoot', dir: path.join(TMP_DIR, 'kenney_scifi'), pattern: /laserSmall_000\.ogg$/i, pack: 'Kenney Sci-Fi Sounds', url: 'https://kenney.nl/assets/sci-fi-sounds' },
    { id: 'sfx_shoot_heavy', dir: path.join(TMP_DIR, 'kenney_scifi'), pattern: /laserLarge_000\.ogg$/i, pack: 'Kenney Sci-Fi Sounds', url: 'https://kenney.nl/assets/sci-fi-sounds' },
    { id: 'sfx_hit', dir: path.join(TMP_DIR, 'kenney_impact'), pattern: /impactGeneric_light_002\.ogg$/i, pack: 'Kenney Impact Sounds', url: 'https://kenney.nl/assets/impact-sounds' },
    { id: 'sfx_enemy_die', dir: path.join(TMP_DIR, 'kenney_impact'), pattern: /impactPunch_heavy_001\.ogg$/i, pack: 'Kenney Impact Sounds', url: 'https://kenney.nl/assets/impact-sounds' },
    { id: 'sfx_boss_slam', dir: path.join(TMP_DIR, 'kenney_impact'), pattern: /impactMining_004\.ogg$|impactPlate_heavy_002\.ogg$/i, pack: 'Kenney Impact Sounds', url: 'https://kenney.nl/assets/impact-sounds' },
    { id: 'sfx_hurt', dir: path.join(TMP_DIR, 'kenney_impact'), pattern: /impactMetal_medium_001\.ogg$/i, pack: 'Kenney Impact Sounds', url: 'https://kenney.nl/assets/impact-sounds' },
    { id: 'sfx_gate_good', dir: path.join(TMP_DIR, 'kenney_interface'), pattern: /confirmation_002\.ogg$/i, pack: 'Kenney Interface Sounds', url: 'https://kenney.nl/assets/interface-sounds' },
    { id: 'sfx_gate_bad', dir: path.join(TMP_DIR, 'kenney_interface'), pattern: /error_005\.ogg$/i, pack: 'Kenney Interface Sounds', url: 'https://kenney.nl/assets/interface-sounds' },
    { id: 'sfx_ui_click', dir: path.join(TMP_DIR, 'kenney_interface'), pattern: /click_002\.ogg$/i, pack: 'Kenney Interface Sounds', url: 'https://kenney.nl/assets/interface-sounds' },
    { id: 'sfx_upgrade', dir: path.join(TMP_DIR, 'kenney_interface'), pattern: /maximize_006\.ogg$|bong_001\.ogg$/i, pack: 'Kenney Interface Sounds', url: 'https://kenney.nl/assets/interface-sounds' },
    { id: 'sfx_victory', dir: path.join(TMP_DIR, 'kenney_interface'), pattern: /confirmation_004\.ogg$/i, pack: 'Kenney Interface Sounds', url: 'https://kenney.nl/assets/interface-sounds' },
    { id: 'sfx_defeat', dir: path.join(TMP_DIR, 'kenney_interface'), pattern: /error_008\.ogg$/i, pack: 'Kenney Interface Sounds', url: 'https://kenney.nl/assets/interface-sounds' }
  ];

  for (const asel of audioSelections) {
    const oggs = findFiles(asel.dir, (_f, n) => n.toLowerCase().endsWith('.ogg'));
    const chosen = oggs.find((f) => asel.pattern.test(path.basename(f))) || oggs[0];
    if (!chosen) throw new Error(`Missing OGG audio in ${asel.dir} for ${asel.id}`);
    const dest = path.join(AUDIO_DIR, `${asel.id}.ogg`);
    fs.copyFileSync(chosen, dest);
    manifest.audio[asel.id] = {
      id: asel.id,
      source: asel.pack,
      owner: 'Kenney (kenney.nl)',
      license: 'CC0 1.0 Universal',
      originUrl: asel.url,
      originalFile: path.basename(chosen),
      path: `assets/audio/${asel.id}.ogg`,
      sizeBytes: fs.statSync(dest).size
    };
  }
  console.log(`   Extracted ${audioSelections.length} Kenney CC0 OGG audio effects.`);

  console.log('3/4 Downloading Poly Haven CC0 1k HDRIs for all 5 Worlds...');
  const hdriConfigs = [
    { id: 'hdri_ocean', phId: 'kloppenheim_06_puresky', world: 'Ocean Crossing' },
    { id: 'hdri_ruins', phId: 'citrus_orchard_puresky', world: 'Overgrown Ruins' },
    { id: 'hdri_dust', phId: 'drackenstein_quarry_puresky', world: 'Dust Outpost' },
    { id: 'hdri_frozen', phId: 'drakensberg_solitary_mountain', world: 'Frozen Pass' },
    { id: 'hdri_inferno', phId: 'belfast_sunset_puresky', world: 'Inferno Citadel' }
  ];
  for (const h of hdriConfigs) {
    const dest = path.join(HDRI_DIR, `${h.id}.hdr`);
    const originUrl = await fetchPolyHavenHdri(h.phId, dest);
    manifest.hdris[h.id] = {
      id: h.id,
      world: h.world,
      source: `Poly Haven (${h.phId})`,
      owner: 'Poly Haven Contributors',
      license: 'CC0 1.0 Universal',
      originUrl,
      path: `assets/hdri/${h.id}.hdr`,
      sizeBytes: fs.statSync(dest).size
    };
  }
  console.log(`   Fetched ${hdriConfigs.length} Poly Haven CC0 HDRIs.`);

  console.log('4/4 Writing verified manifest & cleaning temporary downloads...');
  fs.writeFileSync(path.join(ASSETS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  console.log('\n=== ANIMATION AUDIT SUMMARY ===');
  for (const [id, m] of Object.entries(manifest.models)) {
    if (m.animations.length > 0) {
      console.log(`  ${id} (${(m.sizeBytes / 1024).toFixed(0)}KB, h=${m.bounds?.height ?? '?'}): [${m.animations.join(', ')}]`);
    }
  }
  console.log(`\nManifest written to public/assets/manifest.json (${Object.keys(manifest.models).length} models, ${Object.keys(manifest.audio).length} audio, ${Object.keys(manifest.hdris).length} HDRIs).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
