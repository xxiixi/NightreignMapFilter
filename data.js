// 常量表（POIS_BY_MAP / MAP_IMAGES / MAP_NAME_ZH / NIGHTLORDS / MAPS / TYPE_INFO）
// 已由 tools/build_seed_data.py 生成到 assets/data/slots.js，index.html 在其之前引入。
// 本文件只保留数据集读取与筛选相关的辅助函数。

// 通用图标（老的三类兴趣点用项目自带的小图标）
const ICON_ASSETS = {
  church: "assets/images/church.png",
  mage: "assets/images/mage-tower.png",
  village: "assets/images/village.png"
};

// Constants
const ICON_SIZE = 38;
const CANVAS_SIZE = 900;


// Global variable to hold dataset data
let DATASET_DATA = null;

// Load and parse dataset.json
async function loadDatasetData() {
  try {
    const response = await fetch('dataset/dataset.json');
    const data = await response.json();
    DATASET_DATA = data;
    return true;
  } catch (error) {
    console.error('Error loading dataset:', error);
    return false;
  }
}

// Get all seeds from dataset
function getAllSeeds() {
  if (!DATASET_DATA || !DATASET_DATA.poiDatabase || !DATASET_DATA.poiDatabase.seeds) {
    return [];
  }
  return Object.values(DATASET_DATA.poiDatabase.seeds);
}

// Get seeds filtered by nightlord and/or map
function getFilteredSeeds(nightlord = null, mapType = null) {
  const allSeeds = getAllSeeds();

  return allSeeds.filter(seed => {
    const nightlordMatch = !nightlord || nightlord === 'Unknown' || seed.nightlord === nightlord;
    const mapMatch = !mapType || seed.mapType === mapType;
    return nightlordMatch && mapMatch;
  });
}

// Get seed by number
function getSeedByNumber(seedNumber) {
  if (!DATASET_DATA || !DATASET_DATA.poiDatabase || !DATASET_DATA.poiDatabase.seeds) {
    return null;
  }
  return DATASET_DATA.poiDatabase.seeds[seedNumber.toString()];
}

// 取某个种子在某个点位上的建筑类型（点位 id 与 slots.js 中的 POIS_BY_MAP 一致）
// 返回 null 表示该点位在这个种子里没有记录的建筑
function getPOITypeById(seedNumber, poiId) {
  const seed = getSeedByNumber(seedNumber);
  if (!seed || !seed.pois) {
    return null;
  }
  const poi = seed.pois[poiId.toString()];
  return poi ? poi.type : null;
}

// 兼容旧接口：按坐标就近查找（新逻辑已改为按点位 id 精确匹配）
function getPOITypeAtCoordinate(seedNumber, x, y, tolerance = 40) {
  const seed = getSeedByNumber(seedNumber);
  if (!seed || !seed.pois) {
    return null;
  }

  for (const poi of Object.values(seed.pois)) {
    const dx = x - poi.coordinates.x;
    const dy = y - poi.coordinates.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= tolerance) {
      return poi.type;
    }
  }

  return null;
}
