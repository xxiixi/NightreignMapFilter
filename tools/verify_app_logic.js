// 校验：用前端同一套逻辑（按点位 id 精确匹配）验证 520 个种子是否都能被唯一识别
// 用法: node tools/verify_app_logic.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(path.join(root, 'assets', 'data', 'slots.js'), 'utf8') +
  '\n;globalThis.__slots = { POIS_BY_MAP, MAPS, TYPE_INFO, MAP_NAME_ZH, NIGHTLORDS, MAP_IMAGES };',
  ctx);
const { POIS_BY_MAP, MAPS, TYPE_INFO } = ctx.__slots;
const dataset = JSON.parse(fs.readFileSync(path.join(root, 'dataset', 'dataset.json'), 'utf8'));
const seeds = dataset.poiDatabase.seeds;

function typeById(seedNum, poiId) {
  const s = seeds[String(seedNum)];
  const p = s && s.pois ? s.pois[String(poiId)] : null;
  return p ? p.type : null;
}

// 与 script.js matchesPOIState 一致
function matches(seedNum, poi, state) {
  if (state === 'dot' || state === undefined) return true;
  const real = typeById(seedNum, poi.id);
  if (state === 'empty') return real === null;
  if (state === 'other' || state === 'unknown') {
    if (real === null) return true;
    return !(poi.options || []).includes(real);
  }
  return real === state;
}

function filter(seedNums, map, states) {
  const pois = POIS_BY_MAP[map] || [];
  return seedNums.filter(n => pois.every(p => matches(n, p, states[p.id])));
}

// 1) 每个种子用它自己的真实数据当"用户点击"，看是否只筛出它自己
let notUnique = [];
for (const k of Object.keys(seeds)) {
  const n = Number(k);
  const s = seeds[k];
  const pois = POIS_BY_MAP[s.mapType] || [];
  const states = {};
  for (const p of pois) {
    const t = typeById(n, p.id);
    states[p.id] = t === null ? 'empty' : t;
  }
  const group = Object.keys(seeds).map(Number)
    .filter(m => seeds[String(m)].nightlord === s.nightlord && seeds[String(m)].mapType === s.mapType);
  const hit = filter(group, s.mapType, states);
  if (hit.length !== 1 || hit[0] !== n) notUnique.push([n, hit.length, hit.slice(0, 5)]);
}
console.log(`种子总数: ${Object.keys(seeds).length}`);
console.log(`按(夜王+地图)分组后，用自身真实数据点击无法唯一定位的种子: ${notUnique.length}`);
notUnique.slice(0, 10).forEach(x => console.log('   ', x));

// 2) 数据完整性：点位候选是否覆盖各种子出现的类型
let badOpt = 0, missingSlot = 0;
for (const k of Object.keys(seeds)) {
  const s = seeds[k];
  const pois = POIS_BY_MAP[s.mapType] || [];
  const byId = {};
  pois.forEach(p => byId[p.id] = p);
  for (const [pid, p] of Object.entries(s.pois || {})) {
    const slot = byId[pid];
    if (!slot) { missingSlot++; continue; }
    if (!(slot.options || []).includes(p.type)) badOpt++;
  }
}
console.log(`点位候选未覆盖的类型数: ${badOpt}`);
console.log(`种子里出现但地图点位表里没有的点位 id: ${missingSlot}`);

// 3) 每个地图的点位数量与类型分布
for (const map of MAPS) {
  const pois = POIS_BY_MAP[map] || [];
  const n = Object.values(seeds).filter(s => s.mapType === map).length;
  console.log(`  ${map}: 点位 ${pois.length} 个, 种子 ${n} 个, 平均候选 ${(pois.reduce((a, p) => a + p.options.length, 0) / pois.length).toFixed(1)} 种`);
}
