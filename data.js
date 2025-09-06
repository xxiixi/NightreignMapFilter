// Point of Interest data for each map
const POIS_BY_MAP = {
  Default: [
    { id: 1, x: 155, y: 551 },
    { id: 2, x: 350, y: 545 },
    { id: 3, x: 155, y: 436 },
    { id: 4, x: 280, y: 308 },
    { id: 5, x: 165, y: 284 },
    { id: 6, x: 436, y: 620 },
    { id: 7, x: 420, y: 495 },
    { id: 8, x: 620, y: 455 },
    { id: 9, x: 530, y: 285 },
    { id: 10, x: 595, y: 278 },
    { id: 11, x: 410, y: 180 }
  ],

  Crater: [
    { id: 1, x: 155, y: 551 },
    { id: 2, x: 348, y: 545 },
    { id: 3, x: 155, y: 440 },
    { id: 5, x: 165, y: 284 },
    { id: 6, x: 436, y: 630 },
    { id: 7, x: 420, y: 495 },
    { id: 8, x: 620, y: 455 },
    { id: 9, x: 530, y: 295 },
    { id: 10, x: 595, y: 278 }
  ],

  "Rotted Woods": [
    { id: 1, x: 153, y: 557 },
    { id: 2, x: 350, y: 545 },
    { id: 3, x: 155, y: 442 },
    { id: 4, x: 275, y: 315 },
    { id: 5, x: 165, y: 284 },
    { id: 9, x: 530, y: 285 },
    { id: 10, x: 597, y: 285 },
    { id: 11, x: 410, y: 180 }
  ],

  Mountaintop: [
    { id: 1, x: 155, y: 551 },
    { id: 2, x: 345, y: 547 },
    { id: 3, x: 155, y: 440 },
    { id: 6, x: 436, y: 620 },
    { id: 7, x: 420, y: 495 },
    { id: 8, x: 620, y: 460 },
    { id: 9, x: 530, y: 285 },
    { id: 10, x: 595, y: 278 },
    { id: 11, x: 410, y: 180 }
  ],

  Noklateo: [
    { id: 4, x: 278, y: 308 },
    { id: 5, x: 165, y: 284 },
    { id: 6, x: 436, y: 620 },
    { id: 7, x: 420, y: 495 },
    { id: 8, x: 620, y: 455 },
    { id: 9, x: 530, y: 287 },
    { id: 10, x: 595, y: 278 },
    { id: 11, x: 410, y: 182 }
  ]
};

// Map background images (local paths)
const MAP_IMAGES = {
  Default: "assets/images/Default-POI.png",
  Mountaintop: "assets/images/Mountaintop-POI.png",
  Crater: "assets/images/Crater-POI.png",
  Noklateo: "assets/images/Noklateo-POI.png",
  "Rotted Woods": "assets/images/RottedWoods-POI.png"
};


// Icon assets (data URIs for now - no external dependencies)
const ICON_ASSETS = {
  church: "assets/images/church.png",
  mage: "assets/images/mage-tower.png",
  village: "assets/images/village.png"
};

// Constants
const ICON_SIZE = 38;
const CANVAS_SIZE = 768;

// Available Nightlords
const NIGHTLORDS = [
  'Gladius', 'Adel', 'Gnoster', 'Maris', 
  'Libra', 'Fulghor', 'Caligo', 'Heolstor'
];

// Available Maps
const MAPS = [
  'Default', 'Mountaintop', 'Crater', 'Rotted Woods', 'Noklateo'
];


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

// Get POI type at specific coordinate for a seed
function getPOITypeAtCoordinate(seedNumber, x, y, tolerance = 40) {
  const seed = getSeedByNumber(seedNumber);
  if (!seed || !seed.pois) {
    return null;
  }
  
  // Find POI at this coordinate
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
