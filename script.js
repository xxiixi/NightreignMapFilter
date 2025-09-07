// Main application for Nightreign seed recognition
let CV_CLASSIFICATION_DATA = null; // Will hold the exported classification results

// Load classification results from dataset.json
async function loadClassificationResults() {
    try {
        const response = await fetch('dataset/dataset.json');
        const data = await response.json();
        
        if (data.classifications) {
            CV_CLASSIFICATION_DATA = data.classifications;
            const seedCount = Object.keys(CV_CLASSIFICATION_DATA).length;
            console.log('✅ Loaded classification results:', seedCount, 'seeds');
            return true;
        }
        return false;
    } catch (error) {
        console.warn('⚠️ Dataset not found (this is normal if not yet created):', error.message);
        return false;
    }
}


// Display name mappings (English key -> Chinese display)
const NIGHTLORD_NAME_ZH = {
    Gladius: '"黑夜野兽"格拉狄乌斯',
    Adel: '"黑夜之爵"艾德雷',
    Gnoster: '"黑夜之智"格诺斯塔',
    Maris: '"深海黑夜"玛丽斯',
    Libra: '"黑夜之魔"利普拉',
    Fulghor: '"黑夜光骑士"弗格尔',
    Caligo: '"黑夜雾霾"卡莉果',
    Heolstor: '"黑夜王"布德奇冥',
    Unknown: '未知'
};

const MAP_NAME_ZH = {
    Default: '默认',
    Mountaintop: '山顶',
    Crater: '火山口',
    'Rotted Woods': '腐败森林',
    Noklateo: '隐城'
};


class NightreignMapRecogniser {
    constructor() {
        this.chosenNightlord = null;
        this.chosenMap = null;
        this.currentPOIs = [];
        this.poiStates = {};
        this.images = {
            maps: {},
            church: new Image(),
            mage: new Image(),
            village: new Image(),
            favicon: new Image()
        };
        this.showingSeedImage = false;
        this.canvas = null;
        this.ctx = null;
        this.contextMenu = null;
        this.currentRightClickedPOI = null;
        
        // Arrow key navigation for seeds
        this.currentSeedIndex = -1;
        this.availableSeeds = [];
        this.poiFilterEnabled = false;
        
        
        this.init();
    }

    async init() {
        this.setupImages();
        this.setupEventListeners();
        await this.loadInitialData();
        this.showSelectionSection();
    }


    setupImages() {
        // Load icon images (data URIs don't need crossOrigin)
        this.images.church.src = ICON_ASSETS.church;
        this.images.mage.src = ICON_ASSETS.mage;
        this.images.village.src = ICON_ASSETS.village;
        this.images.favicon.src = 'assets/images/church.png';

        // Add error handling for images
        this.images.church.onerror = () => {
            console.warn('Failed to load church icon');
        };
        this.images.mage.onerror = () => {
            console.warn('Failed to load mage icon');
        };
        this.images.favicon.onerror = () => {
            console.warn('Failed to load favicon icon');
        };
        this.images.village.onerror = () => {
            console.warn('Failed to load village icon');
        };

        // Load map images with error handling
        Object.entries(MAP_IMAGES).forEach(([mapName, url]) => {
            const img = new Image();
            // Don't need crossOrigin for local images
            // img.crossOrigin = 'anonymous';
            img.onload = () => {
                console.log(`Map image loaded: ${mapName}`);
            };
            img.onerror = () => {
                console.warn(`Failed to load map image: ${mapName}`, url);
            };
            
            // Load real images
            img.src = url;
            
            this.images.maps[mapName] = img;
        });
    }


    setupEventListeners() {
        // Nightlord selection
        document.querySelectorAll('.nightlord-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const nightlord = btn.dataset.nightlord;
                this.selectNightlord(nightlord);
            });
        });

        // Map selection
        document.querySelectorAll('.map-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const map = btn.dataset.map;
                this.selectMap(map);
            });
        });

        // Reset button
        document.getElementById('reset-map-btn').addEventListener('click', () => {
            this.resetMap();
        });
        // Clear all POIs button
        const clearPoiBtn = document.getElementById('clear-poi-btn');
        if (clearPoiBtn) {
            clearPoiBtn.addEventListener('click', () => {
                this.clearAllPOISelections();
            });
        }
        // Toggle POI filter button
        const toggleBtn = document.getElementById('toggle-poi-filter-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.poiFilterEnabled = !this.poiFilterEnabled;
                toggleBtn.classList.toggle('active', this.poiFilterEnabled);
                toggleBtn.textContent = this.poiFilterEnabled ? '兴趣点筛选模式【已开启】' : '兴趣点筛选模式【已关闭】';
                // 开启筛选时仅需选择地图
                if (this.poiFilterEnabled) {
                    if (!this.chosenMap) {
                        this.poiFilterEnabled = false;
                        toggleBtn.classList.remove('active');
                        toggleBtn.textContent = '兴趣点筛选模式【已关闭】';
                        alert('请先选择【特殊地形】后再开启兴趣点筛选');
                        return;
                    }
                }
                // 清除已标注POI
                this.poiStates = this.initializePOIStates();
                this.currentRightClickedPOI = null;
                this.hideContextMenu();
                // 关闭筛选时自动关闭POI标注（停留在非交互态并回到画布）
                if (!this.poiFilterEnabled) {
                    this.showingSeedImage = false;
                    const canvas = document.getElementById('map-canvas');
                    const seedImageContainer = document.getElementById('seed-image-container');
                    if (canvas && seedImageContainer) {
                        canvas.style.display = 'block';
                        seedImageContainer.style.display = 'none';
                    }
                }
                // 渲染画布与交互区域
                if (this.chosenMap) {
                    this.showingSeedImage = false;
                    this.showInteractionSection();
                    this.showResultsSection();
                    this.renderMap();
                    this.hideSelectionOverlay();
                } else if (this.canvas && this.ctx) {
                    this.drawDefaultMapWithImage();
                }
                this.updateSeedFiltering();
            });
        }
        
        // CV Classification data loader

        // Help button and modal
        document.getElementById('help-btn').addEventListener('click', () => {
            this.showHelpModal();
        });

        document.getElementById('close-help').addEventListener('click', () => {
            this.hideHelpModal();
        });

        // Close modal when clicking outside
        document.getElementById('help-modal').addEventListener('click', (e) => {
            if (e.target.id === 'help-modal') {
                this.hideHelpModal();
            }
        });

        // Close modal with Escape key and handle arrow keys for seed navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideHelpModal();
                this.hideContextMenu();
            } else if (this.availableSeeds.length > 0) {
                this.handleSeedNavigation(e);
            }
        });

        // Context menu setup
        this.setupContextMenu();

        // Hide context menu when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#poi-context-menu')) {
                this.hideContextMenu();
            }
        });
    }

    async loadInitialData() {
        try {
            // Load both dataset and classification data
            const hasDataset = await loadDatasetData();
            const hasClassifications = await loadClassificationResults();
            
            let seedCount = 320; // Default fallback
            if (hasDataset) {
                const allSeeds = getAllSeeds();
                seedCount = allSeeds.length;
            }
            
            // Update status display
            const statusElement = document.getElementById('cv-status');
            if (statusElement) {
                const rocketSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M9.752 6.193c.599.6 1.73.437 2.528-.362s.96-1.932.362-2.531c-.599-.6-1.73-.438-2.528.361-.798.8-.96 1.933-.362 2.532"/><path d="M15.811 3.312c-.363 1.534-1.334 3.626-3.64 6.218l-.24 2.408a2.56 2.56 0 0 1-.732 1.526L8.817 15.85a.51.51 0 0 1-.867-.434l.27-1.899c.04-.28-.013-.593-.131-.956a9 9 0 0 0-.249-.657l-.082-.202c-.815-.197-1.578-.662-2.191-1.277-.614-.615-1.079-1.379-1.275-2.195l-.203-.083a10 10 0 0 0-.655-.248c-.363-.119-.675-.172-.955-.132l-1.896.27A.51.51 0 0 1 .15 7.17l2.382-2.386c.41-.41.947-.67 1.524-.734h.006l2.4-.238C9.005 1.55 11.087.582 12.623.208c.89-.217 1.59-.232 2.08-.188.244.023.435.06.57.093q.1.026.16.045c.184.06.279.13.351.295l.029.073a3.5 3.5 0 0 1 .157.721c.055.485.051 1.178-.159 2.065m-4.828 7.475.04-.04-.107 1.081a1.54 1.54 0 0 1-.44.913l-1.298 1.3.054-.38c.072-.506-.034-.993-.172-1.418a9 9 0 0 0-.164-.45c.738-.065 1.462-.38 2.087-1.006M5.205 5c-.625.626-.94 1.351-1.004 2.09a9 9 0 0 0-.45-.164c-.424-.138-.91-.244-1.416-.172l-.38.054 1.3-1.3c.245-.246.566-.401.91-.44l1.08-.107zm9.406-3.961c-.38-.034-.967-.027-1.746.163-1.558.38-3.917 1.496-6.937 4.521-.62.62-.799 1.34-.687 2.051.107.676.483 1.362 1.048 1.928.564.565 1.25.941 1.924 1.049.71.112 1.429-.067 2.048-.688 3.079-3.083 4.192-5.444 4.556-6.987.183-.771.18-1.345.138-1.713a3 3 0 0 0-.045-.283 3 3 0 0 0-.3-.041Z"/><path d="M7.009 12.139a7.6 7.6 0 0 1-1.804-1.352A7.6 7.6 0 0 1 3.794 8.86c-1.102.992-1.965 5.054-1.839 5.18.125.126 3.936-.896 5.054-1.902Z"/></svg>';
                if (hasClassifications) {
                    const classCount = Object.keys(CV_CLASSIFICATION_DATA).length;
                    statusElement.innerHTML = `<span class="status-rocket">${rocketSvg}成功加载了 ${seedCount} 个地图种子 (其中 ${classCount} 个已标注)</span>`;
                } else {
                    statusElement.innerHTML = `<span class="status-rocket">${rocketSvg}成功加载了 ${seedCount} 个地图种子</span>`;
                }
            }
            
            this.hideLoadingSection();
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showError('Failed to load data. Please refresh the page.');
        }
    }

    hideLoadingSection() {
        const loadingSection = document.getElementById('loading-section');
        if (loadingSection) {
            loadingSection.style.display = 'none';
            // loadingSection.setAttribute('hidden', '');
            // loadingSection.setAttribute('aria-hidden', 'true');
            // loadingSection.classList.add('is-hidden');
        }
    }

    showSelectionSection() {
        const selectionSection = document.getElementById('selection-section');
        selectionSection.style.display = 'block';
        
        // Also show results section with initial seed count
        const resultsSection = document.getElementById('results-section');
        resultsSection.style.display = 'block';
        this.updateSeedCount();
        
        // Show default map immediately so users can start clicking
        this.showDefaultMap();

        // When nothing is selected, display all seeds by default
        const allSeeds = getAllSeeds();
        if (Array.isArray(allSeeds) && allSeeds.length > 0) {
            this.showPossibleSeeds(allSeeds);
            this.updateSeedCountDisplay(allSeeds.length);
        }
    }

    showDefaultMap() {
        // Set up a default map (Default map type) for immediate interaction
        this.currentPOIs = POIS_BY_MAP['Default'] || [];
        this.poiStates = this.initializePOIStates();
        
        // Show interaction section
        const interactionSection = document.getElementById('interaction-section');
        interactionSection.style.display = 'block';
        
        // Render the default map
        this.renderDefaultMap();
    }

    renderDefaultMap() {
        console.log('Rendering default map for immediate interaction');
        
        const canvas = document.getElementById('map-canvas');
        if (!canvas) {
            console.error('Canvas element not found!');
            return;
        }
        
        canvas.style.display = 'block';
        document.getElementById('seed-image-container').style.display = 'none';
        
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Try to load the default POI image, fall back to placeholder if needed
        this.drawDefaultMapWithImage();
        this.setupCanvasEventListeners();
    }

    drawDefaultMap() {
        this.ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        
        // Draw a nice default background
        const gradient = this.ctx.createRadialGradient(CANVAS_SIZE/2, CANVAS_SIZE/2, 0, CANVAS_SIZE/2, CANVAS_SIZE/2, CANVAS_SIZE/2);
        gradient.addColorStop(0, '#34495e');
        gradient.addColorStop(0.7, '#2c3e50');
        gradient.addColorStop(1, '#1a1a2e');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        
        // Add decorative border
        this.ctx.strokeStyle = '#4fc3f7';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(10, 10, CANVAS_SIZE - 20, CANVAS_SIZE - 20);
        
        // Add title
        this.ctx.fillStyle = '#ffd700';
        this.ctx.font = 'bold 28px Inter, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const mapTitle = this.chosenMap ? `${this.chosenMap} Map Area` : 'Default Map Area';
        this.ctx.fillText(mapTitle, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 60);
        
        this.ctx.fillStyle = '#4fc3f7';
        this.ctx.font = 'bold 18px Inter, sans-serif';
        this.ctx.fillText('Click orange dots to mark POI locations', CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 20);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '14px Inter, sans-serif';
        this.ctx.fillText('Select Nightlord and Map above for accurate seed detection', CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 20);

        // Draw POIs for Default map
        this.currentPOIs.forEach(poi => {
            const state = this.poiStates[poi.id];
            this.drawPOI(poi, state);
        });
        
        console.log(`Drew default map with ${this.currentPOIs.length} POIs`);
    }

    drawDefaultMapWithImage() {
        // Try to use the actual Default POI image if available
        const defaultMapImg = this.images.maps['Default'];
        
        if (defaultMapImg && defaultMapImg.complete && defaultMapImg.naturalWidth > 0) {
            // Use the actual POI image
            this.ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
            this.ctx.drawImage(defaultMapImg, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
            
            // Draw POIs on top
            this.currentPOIs.forEach(poi => {
                const state = this.poiStates[poi.id];
                this.drawPOI(poi, state);
            });
            
            console.log(`Drew default map with actual POI image and ${this.currentPOIs.length} POIs`);
        } else {
            // Fall back to placeholder
            this.drawDefaultMap();
        }
    }

    drawMapWithSelectedImage() {
        // Use the selected map's POI image if available
        const mapImg = this.images.maps[this.chosenMap];
        
        if (mapImg && mapImg.complete && mapImg.naturalWidth > 0) {
            // Use the actual POI image for the selected map
            this.ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
            this.ctx.drawImage(mapImg, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
            
            // Draw POIs on top
            this.currentPOIs.forEach(poi => {
                const state = this.poiStates[poi.id];
                this.drawPOI(poi, state);
            });
            
            console.log(`Drew ${this.chosenMap} map with actual POI image and ${this.currentPOIs.length} POIs`);
        } else {
            // Fall back to placeholder with map name
            this.drawDefaultMap();
        }
    }

    selectNightlord(nightlord) {
        // Toggle off if clicking the same nightlord
        if (this.chosenNightlord === nightlord) {
            this.chosenNightlord = null;
            // Update UI
            document.getElementById('chosen-nightlord').textContent = '未选择';
            document.querySelectorAll('.nightlord-btn').forEach(btn => btn.classList.remove('active'));
            this.updateGameState();
            return;
        }

        this.chosenNightlord = nightlord;
        
        // Update UI
        const zhName = NIGHTLORD_NAME_ZH[nightlord] || nightlord;
        document.getElementById('chosen-nightlord').textContent = zhName;
        
        // Update button states
        document.querySelectorAll('.nightlord-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.nightlord === nightlord);
        });

        this.updateGameState();
    }

    selectMap(map) {
        // Toggle off if clicking the same map
        if (this.chosenMap === map) {
            this.chosenMap = null;
            this.currentPOIs = POIS_BY_MAP['Default'] || [];
            this.poiStates = this.initializePOIStates();
            // Auto-disable POI filtering when map is unset
            this.poiFilterEnabled = false;
            const toggleBtn = document.getElementById('toggle-poi-filter-btn');
            if (toggleBtn) {
                toggleBtn.classList.remove('active');
                toggleBtn.textContent = '兴趣点筛选模式【已关闭】';
            }
            // Update UI
            document.getElementById('chosen-map').textContent = '未选择';
            document.querySelectorAll('.map-btn').forEach(btn => btn.classList.remove('active'));
            this.updateGameState();
            return;
        }

        this.chosenMap = map;
        this.currentPOIs = POIS_BY_MAP[map] || [];
        this.poiStates = this.initializePOIStates();
        
        console.log(`Selected map: ${map}, POIs: ${this.currentPOIs.length}`);
        
        // Update UI
        const zhMap = MAP_NAME_ZH[map] || map;
        document.getElementById('chosen-map').textContent = zhMap;
        
        // Update button states
        document.querySelectorAll('.map-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.map === map);
        });


        // Re-render the map with new POIs
        if (this.canvas && this.ctx) {
            if (this.chosenNightlord) {
                this.renderMap(); // Full render if both are selected
            } else {
                this.drawMapWithSelectedImage(); // Use selected map image if available
            }
        }

        this.updateGameState();
    }

    initializePOIStates() {
        const states = {};
        this.currentPOIs.forEach(poi => {
            states[poi.id] = 'dot';
        });
        return states;
    }

    updateGameState() {
        // Hide possible seeds section when changing selections
        this.hidePossibleSeeds();
        
        if (this.chosenNightlord && this.chosenMap) {
            // Keep using the original clickable coordinates for user interaction
            this.currentPOIs = POIS_BY_MAP[this.chosenMap] || [];
            this.poiStates = this.initializePOIStates();
            
            this.showInteractionSection();
            this.showResultsSection();
            this.renderMap();
            this.updateSeedFiltering();
            this.hideSelectionOverlay();
        } else {
            // Always update seed count when selections change
            this.updateSeedCount();
            // 仅选地图 + 启用POI筛选：进入POI交互
            if (this.poiFilterEnabled && this.chosenMap && !this.chosenNightlord) {
                this.currentPOIs = POIS_BY_MAP[this.chosenMap] || [];
                this.poiStates = this.initializePOIStates();
                this.showInteractionSection();
                this.showResultsSection();
                this.renderMap();
                this.updateSeedFiltering();
                this.hideSelectionOverlay();
                return;
            }
            // If only nightlord is selected, show all seeds for that nightlord (across maps)
            if (this.chosenNightlord && !this.chosenMap) {
                const nightlordFilter = this.chosenNightlord === 'Unknown' ? null : this.chosenNightlord;
                const seedsByNightlord = getFilteredSeeds(nightlordFilter, null);
                this.showPossibleSeeds(seedsByNightlord);
                // Default behavior: show first seed image instead of POI canvas
                if (seedsByNightlord.length > 0) {
                    this.hideSelectionOverlay();
                    this.selectSeedFromGrid(seedsByNightlord[0].seedNumber);
                }
            } else if (!this.chosenNightlord && this.chosenMap) {
                // If only map is selected, show all seeds for that map
                const seedsByMap = getFilteredSeeds(null, this.chosenMap);
                this.showPossibleSeeds(seedsByMap);
                if (seedsByMap.length > 0) {
                    this.hideSelectionOverlay();
                    this.selectSeedFromGrid(seedsByMap[0].seedNumber);
                }
            } else {
                // Nothing selected: show all seeds and results panel
                this.showResultsSection();
                this.hideSelectionOverlay();
                const allSeeds = getAllSeeds();
                this.updateSeedCountDisplay(allSeeds.length);
                this.showPossibleSeeds(allSeeds);
            }
        }
    }

    showInteractionSection() {
        const interactionSection = document.getElementById('interaction-section');
        interactionSection.style.display = 'block';
    }

    showResultsSection() {
        const resultsSection = document.getElementById('results-section');
        resultsSection.style.display = 'block';
    }

    showSelectionOverlay() {
        const overlay = document.getElementById('selection-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
    }

    hideSelectionOverlay() {
        const overlay = document.getElementById('selection-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    setupContextMenu() {
        this.contextMenu = document.getElementById('poi-context-menu');
        
        // Handle context menu item clicks
        document.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const type = e.currentTarget.dataset.type;
                if (this.currentRightClickedPOI) {
                    this.poiStates[this.currentRightClickedPOI.id] = type;
                    this.drawMap(this.images.maps[this.chosenMap]);
                    this.updateSeedFiltering();
                    this.hideContextMenu();
                    this.currentRightClickedPOI = null;
                }
            });
        });
    }

    showContextMenu(x, y) {
        if (this.contextMenu) {
            this.contextMenu.style.display = 'block';
            this.contextMenu.style.left = `${x}px`;
            this.contextMenu.style.top = `${y}px`;
        }
    }

    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.style.display = 'none';
        }
        this.currentRightClickedPOI = null;
    }

    renderMap() {
        if (this.showingSeedImage) return;

        console.log(`Rendering map for ${this.chosenMap}`);
        
        const mapContainer = document.querySelector('.map-container');
        const canvas = document.getElementById('map-canvas');
        const seedImageContainer = document.getElementById('seed-image-container');
        
        if (!canvas) {
            console.error('Canvas element not found!');
            return;
        }
        
        canvas.style.display = 'block';
        seedImageContainer.style.display = 'none';
        
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        const mapImage = this.images.maps[this.chosenMap];
        
        if (!mapImage) {
            console.error(`Map image not found for ${this.chosenMap}`);
            // Draw anyway with placeholder
            this.drawMap(null);
        } else if (mapImage.complete) {
            console.log(`Map image ready for ${this.chosenMap}`);
            this.drawMap(mapImage);
        } else {
            console.log(`Waiting for map image to load: ${this.chosenMap}`);
            mapImage.onload = () => {
                console.log(`Map image loaded: ${this.chosenMap}`);
                this.drawMap(mapImage);
            };
            // Also draw immediately with what we have
            this.drawMap(mapImage);
        }

        this.setupCanvasEventListeners();
    }

    drawMap(mapImage) {
        this.ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        
        // Always draw a background first
        this.ctx.fillStyle = '#2b2b2b';
        this.ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        
        // Draw map image if available
        if (mapImage && mapImage.complete && mapImage.naturalWidth > 0) {
            try {
                this.ctx.drawImage(mapImage, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
            } catch (error) {
                console.warn('Error drawing map image:', error);
                // Draw placeholder background
                const gradient = this.ctx.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
                gradient.addColorStop(0, '#2c3e50');
                gradient.addColorStop(1, '#34495e');
                this.ctx.fillStyle = gradient;
                this.ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
                
                // Add text
                this.ctx.fillStyle = '#ffffff';
                this.ctx.font = 'bold 20px Inter, sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(`${this.chosenMap} Map`, CANVAS_SIZE / 2, CANVAS_SIZE / 2);
                this.ctx.font = '14px Inter, sans-serif';
                this.ctx.fillText('Click on orange dots to mark POIs', CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 30);
            }
        }

        // Always draw POIs (they should be visible even without background image)
        this.currentPOIs.forEach(poi => {
            const state = this.poiStates[poi.id];
            this.drawPOI(poi, state);
        });
        
        console.log(`Drew map with ${this.currentPOIs.length} POIs for ${this.chosenMap}`);
    }

    // Clear all selected POIs when in POI filter mode, keep nightlord/map
    clearAllPOISelections() {
        // Only works in POI filter mode
        if (!this.poiFilterEnabled) {
            // alert('仅在【兴趣点筛选模式】开启时可移除兴趣点');
            return;
        }
        // Require map to be selected (nightlord optional)
        if (!this.chosenMap) {
            // alert('请先选择【特殊地形】');
            return;
        }

        // Reinitialize POI states (equivalent to clearing current selections)
        this.poiStates = this.initializePOIStates();
        this.currentRightClickedPOI = null;
        this.hideContextMenu();

        // Redraw map and update filtering results
        if (this.canvas && this.ctx) {
            this.drawMap(this.images.maps[this.chosenMap]);
        }
        // Return to POI页面: show map canvas, hide seed image, and refresh list
        const canvas = document.getElementById('map-canvas');
        const seedImageContainer = document.getElementById('seed-image-container');
        if (canvas && seedImageContainer) {
            canvas.style.display = 'block';
            seedImageContainer.style.display = 'none';
        }
        this.showingSeedImage = false;

        // Update seeds list based on cleared POIs (still filtered by map and optionally nightlord)
        this.updateSeedFiltering();
    }

    drawPOI(poi, state) {
        // Scale POI coordinates from base (768) to canvas size
        const COORD_BASE_SIZE = 768;
        const DRAW_SCALE = CANVAS_SIZE / COORD_BASE_SIZE;
        const x = poi.x * DRAW_SCALE;
        const y = poi.y * DRAW_SCALE;
        
        switch (state) {
            case 'dot':
                this.drawDot(x, y, '', '#ff8c00');
                break;
            case 'church':
                // Use favicon if available, otherwise fallback to church icon
                if (this.images.favicon.complete && this.images.favicon.naturalWidth > 0) {
                    this.drawIcon(this.images.favicon, x, y);
                } else {
                    this.drawIcon(this.images.church, x, y);
                }
                break;
            case 'mage':
                this.drawIcon(this.images.mage, x, y);
                break;
            case 'village':
                this.drawIcon(this.images.village, x, y);
                break;
            case 'other':
                this.drawDot(x, y, '', '#808080');
                break;
            case 'unknown':
                this.drawDot(x, y, '?', '#808080');
                break;
        }
    }

    drawDot(x, y, label, color) {
        const COORD_BASE_SIZE = 768;
        const DRAW_SCALE = CANVAS_SIZE / COORD_BASE_SIZE;
        this.ctx.beginPath();
        this.ctx.arc(x, y, (ICON_SIZE * DRAW_SCALE) / 2, 0, 2 * Math.PI);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        if (label) {
            this.ctx.fillStyle = '#000000';
            this.ctx.font = 'bold 16px Inter, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(label, x, y);
        }
    }

    drawIcon(image, x, y) {
        const COORD_BASE_SIZE = 768;
        const DRAW_SCALE = CANVAS_SIZE / COORD_BASE_SIZE;
        if (image.complete) {
            const size = ICON_SIZE * DRAW_SCALE;
            this.ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
        }
    }

    setupCanvasEventListeners() {
        // Left click - open selection menu (church/mage/village/other)
        this.canvas.addEventListener('click', (e) => {
            if (!this.chosenMap || !this.poiFilterEnabled) {
                console.log('请先选择特殊地形并开启兴趣点筛选');
                return;
            }
            const pos = this.getMousePos(e);
            const poi = this.findClickedPOI(pos.x, pos.y);
            if (poi) {
                this.currentRightClickedPOI = poi;
                // Show existing context menu at the click position
                this.showContextMenu(e.clientX, e.clientY);
                // Prevent the document-level click handler from immediately hiding the menu
                e.stopPropagation();
            }
        });

        // Right click - delete current marker (reset to unmarked dot)
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!this.chosenMap || !this.poiFilterEnabled) {
                console.log('请先选择特殊地形并开启兴趣点筛选');
                return;
            }
            const pos = this.getMousePos(e);
            const poi = this.findClickedPOI(pos.x, pos.y);
            if (poi) {
                this.poiStates[poi.id] = 'dot';
                this.hideContextMenu();
                this.currentRightClickedPOI = null;
                if (this.chosenMap) {
                    this.drawMap(this.images.maps[this.chosenMap]);
                } else {
                    this.drawDefaultMapWithImage();
                }
                this.updateSeedFiltering();
            }
        });

        // Middle click - mark as unknown
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                if (!this.chosenMap || !this.poiFilterEnabled) {
                    console.log('请先选择特殊地形并开启兴趣点筛选');
                    return;
                }
                const pos = this.getMousePos(e);
                const poi = this.findClickedPOI(pos.x, pos.y);
                if (poi) {
                    this.poiStates[poi.id] = 'unknown';
                    if (this.chosenMap) {
                        this.drawMap(this.images.maps[this.chosenMap]);
                    } else {
                        this.drawDefaultMapWithImage();
                    }
                    this.updateSeedFiltering();
                }
            }
        });

        // Prevent middle click scroll
        this.canvas.addEventListener('auxclick', (e) => {
            if (e.button === 1) {
                e.preventDefault();
            }
        });
    }

    getMousePos(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }

    findClickedPOI(x, y) {
        const COORD_BASE_SIZE = 768;
        const DRAW_SCALE = CANVAS_SIZE / COORD_BASE_SIZE;
        return this.currentPOIs.find(poi => {
            const dx = x - poi.x * DRAW_SCALE;
            const dy = y - poi.y * DRAW_SCALE;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= (ICON_SIZE * DRAW_SCALE) / 2;
        });
    }

    resetMap() {
        // Clear selections
        this.chosenNightlord = null;
        this.chosenMap = null;
        // Disable POI filtering
        this.poiFilterEnabled = false;
        const toggleBtn = document.getElementById('toggle-poi-filter-btn');
        if (toggleBtn) {
            toggleBtn.classList.remove('active');
            toggleBtn.textContent = '兴趣点筛选模式【已关闭】';
        }
        // Clear button highlights
        document.querySelectorAll('.nightlord-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.map-btn').forEach(btn => btn.classList.remove('active'));
        // Reset selection labels
        const nightlordLabel = document.getElementById('chosen-nightlord');
        const mapLabel = document.getElementById('chosen-map');
        if (nightlordLabel) nightlordLabel.textContent = '未选择';
        if (mapLabel) mapLabel.textContent = '未选择';
        
        // Reset POIs to default map for drawing baseline
        this.currentPOIs = POIS_BY_MAP['Default'] || [];
        this.poiStates = this.initializePOIStates();
        this.showingSeedImage = false;
        
        // Hide possible seeds section
        this.hidePossibleSeeds();
        
        // Draw default baseline and show overlay
        if (this.currentPOIs.length > 0 && this.canvas && this.ctx) {
            this.drawDefaultMapWithImage();
        }
        
        // Show the canvas and hide seed image container
        const canvas = document.getElementById('map-canvas');
        const seedImageContainer = document.getElementById('seed-image-container');
        canvas.style.display = 'block';
        seedImageContainer.style.display = 'none';
        
        // Update counts and lists
        this.hideSelectionOverlay();
        this.showSelectionOverlay();
        this.hidePossibleSeeds();
        this.updateSeedCount();
    }


    classifyPOI(poiString) {
        if (!poiString) return null;
        if (poiString.includes('Church')) return 'Church';
        if (poiString.includes('Sorcerer') || poiString.includes('Mage') || poiString.includes('Rise')) return 'Mage';
        if (poiString.includes('Village')) return 'Village';
        return 'Other'; // Return 'Other' for non-Church/Mage/Village POIs instead of null
    }

    updateSeedCount() {
        if (!this.chosenNightlord && !this.chosenMap) {
            const allSeeds = getAllSeeds();
            document.getElementById('seed-count').textContent = allSeeds.length || '320';
            return;
        }

        // Use new dataset functions to count seeds
        const filteredSeeds = getFilteredSeeds(this.chosenNightlord, this.chosenMap);
        this.updateSeedCountDisplay(filteredSeeds.length);
    }

    updateSeedFiltering() {
        // If POI filter is disabled: only filter by nightlord/map, show list, no POI matching
        if (!this.poiFilterEnabled) {
            const filteredSeeds = getFilteredSeeds(
                this.chosenNightlord && this.chosenNightlord !== 'Unknown' ? this.chosenNightlord : null,
                this.chosenMap || null
            );
            this.updateSeedCountDisplay(filteredSeeds.length);
            this.showPossibleSeeds(filteredSeeds);
            // If both selected but POI filter is off, auto-show the first seed
            if (this.chosenNightlord && this.chosenMap && filteredSeeds.length > 0) {
                this.selectSeedFromGrid(filteredSeeds[0].seedNumber);
            }
            return;
        }

        // POI filter enabled: 至少需要地图
        if (!this.chosenMap) {
            this.updateSeedCount();
            return;
        }
        
        // 未选择夜王或选择 Unknown：仅按地图+POI
        if (!this.chosenNightlord || this.chosenNightlord === 'Unknown') {
            this.handleUnknownNightlord();
            return;
        }

        // Filter seeds by nightlord and map using new dataset functions
        const possibleSeeds = getFilteredSeeds(this.chosenNightlord, this.chosenMap);
        console.log(`Found ${possibleSeeds.length} seeds for ${this.chosenNightlord} + ${this.chosenMap}`);

        // Filter by POI states using coordinate-based matching
        const filteredSeeds = possibleSeeds.filter(seed => {
            const seedNum = seed.seedNumber;
            console.log(`\n🔍 Checking Seed ${seedNum}:`);
            
            for (const poi of this.currentPOIs) {
                const userState = this.poiStates[poi.id];
                
                // If user hasn't marked this POI yet, skip it
                if (userState === 'dot') {
                    console.log(`  POI ${poi.id} at (${poi.x}, ${poi.y}): User hasn't marked - SKIPPING`);
                    continue;
                }
                
                console.log(`  POI ${poi.id} at (${poi.x}, ${poi.y}): User marked as ${userState.toUpperCase()}`);
                
                // Find what POI type exists at this coordinate in the real seed data
                const realPOIType = getPOITypeAtCoordinate(seedNum, poi.x, poi.y);
                console.log(`    Real data shows: ${realPOIType || 'NOTHING'} at this location`);
                
                // If user marked as unknown (?), reject if seed has Church/Mage/Village here
                if (userState === 'unknown') {
                    if (realPOIType === 'church' || realPOIType === 'mage' || realPOIType === 'village') {
                        console.log(`    ❌ REJECTED: User said unknown but real data has ${realPOIType}`);
                        return false;
                    }
                    console.log(`    ✅ OK: User said unknown and real data has ${realPOIType || 'nothing'}`);
                    continue;
                }

                // User has marked as church, mage, or other - seed MUST match exactly
                if (userState === 'church') {
                    if (realPOIType !== 'church') {
                        console.log(`    ❌ REJECTED: User said church but real data has ${realPOIType || 'nothing'}`);
                        return false;
                    }
                    console.log(`    ✅ MATCH: User said church and real data has church`);
                } else if (userState === 'mage') {
                    if (realPOIType !== 'mage') {
                        console.log(`    ❌ REJECTED: User said mage but real data has ${realPOIType || 'nothing'}`);
                        return false;
                    }
                    console.log(`    ✅ MATCH: User said mage and real data has mage`);
                } else if (userState === 'village') {
                    if (realPOIType !== 'village') {
                        console.log(`    ❌ REJECTED: User said village but real data has ${realPOIType || 'nothing'}`);
                        return false;
                    }
                    console.log(`    ✅ MATCH: User said village and real data has village`);
                } else if (userState === 'other') {
                    if (realPOIType === 'church' || realPOIType === 'mage' || realPOIType === 'village' || !realPOIType) {
                        console.log(`    ❌ REJECTED: User said other POI but real data has ${realPOIType || 'nothing'}`);
                        return false;
                    }
                    console.log(`    ✅ MATCH: User said other POI and real data has ${realPOIType}`);
                }
            }
            console.log(`  ✅ Seed ${seedNum} PASSED all POI checks`);
            return true;
        });

        console.log(`After POI filtering: ${filteredSeeds.length} seeds remaining`);

        this.updateSeedCountDisplay(filteredSeeds.length);

        if (filteredSeeds.length === 0) {
            this.showNoSeedsFound();
        } else {
            // Always show possible seeds (whether 1 or multiple)
            this.showPossibleSeeds(filteredSeeds);
        }
    }

    updateSeedCountDisplay(count) {
        const seedCountElement = document.getElementById('seed-count');
        seedCountElement.textContent = count;
        seedCountElement.className = count === 0 ? 'seed-count no-seeds' : 'seed-count';
    }

    showNoSeedsFound() {
        const seedCountElement = document.getElementById('seed-count');
        seedCountElement.innerHTML = '<span style="color: #e74c3c; font-weight: 600;">未找到匹配的种子<br>请重置地图！</span>';
    }


    showSeedImage(mapSeed) {
        const canvas = document.getElementById('map-canvas');
        const seedImageContainer = document.getElementById('seed-image-container');
        // Ensure selection overlay does not block the view when showing a seed image
        this.hideSelectionOverlay();
        
        canvas.style.display = 'none';
        seedImageContainer.style.display = 'block';
        
        // 使用浏览器默认加载指示，不再创建自定义覆盖层

        const seedStr = mapSeed.toString().padStart(3, '0');
        const cacheBust = Date.now();
        const localUrl = `assets/pattern-zh-CN/${seedStr}.jpg?v=${cacheBust}`;
        // const remoteUrl = `https://www.trc-playground.hu/GameZ/NightreignSeeds/Seeds/${seedStr}.jpg`;
        
        // Prefer local zh-CN image; 仅使用占位容器与默认加载
        seedImageContainer.innerHTML = `
            <center>
                <a href="${localUrl}" target="_blank">
                    <div class="seed-image-wrapper">
                        <img id="seed-image" class="seed-image" src="" alt="Seed ${mapSeed}" style="opacity: 0;"
                             onload="this.style.opacity='1';"
                             onerror="this.onerror=null;">
                    </div>
                </a>
                <br>
                <b style="color: #ffd700;">地图种子：${mapSeed}</b>
                <br>
                <small style="color: #4fc3f7;">点击图片可在新标签页中打开</small>
            </center>
        `;
        // 设置实际图片地址，触发加载
        const imgEl = document.getElementById('seed-image');
        if (imgEl) {
            imgEl.src = localUrl;
        }
        // ==========================测试用===============================================
        // Optional: simulate image loading delay via URL param ?imgDelay=ms
    //     try {
    //         const val = new URLSearchParams(location.search).get('imgDelay');
    //         const ms = parseInt(val, 10);
    //         const delayMs = isNaN(ms) ? 0 : Math.max(0, ms);
    //         const imgEl = document.getElementById('seed-image');
    //         const setSrc = () => { if (imgEl) imgEl.src = localUrl; };
    //         if (delayMs > 0) {
    //             setTimeout(setSrc, delayMs);
    //         } else {
    //             setSrc();
    //         }
    //     } catch (_) {
    //         const imgEl = document.getElementById('seed-image');
    //         if (imgEl) imgEl.src = localUrl;
    //     }
    // }
    }

// =========================================================================

    showError(message) {
        const loadingSection = document.getElementById('loading-section');
        loadingSection.innerHTML = `
            <div class="loading-indicator">
                <i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>
                <p style="color: #e74c3c;">${message}</p>
            </div>
        `;
    }

    showHelpModal() {
        const helpModal = document.getElementById('help-modal');
        helpModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    hideHelpModal() {
        const helpModal = document.getElementById('help-modal');
        helpModal.style.display = 'none';
        document.body.style.overflow = '';
    }

    handleUnknownNightlord() {
        // When Unknown nightlord is selected, filter seeds by POI states only
        const allSeeds = getFilteredSeeds(null, this.chosenMap); // Get all seeds for this map type
        console.log(`Unknown nightlord selected. Checking ${allSeeds.length} seeds for ${this.chosenMap}`);

        // Filter by POI states using coordinate-based matching
        const filteredSeeds = allSeeds.filter(seed => {
            const seedNum = seed.seedNumber;
            
            for (const poi of this.currentPOIs) {
                const userState = this.poiStates[poi.id];
                
                // If user hasn't marked this POI yet, skip it
                if (userState === 'dot') {
                    continue;
                }
                
                // Find what POI type exists at this coordinate in the real seed data
                const realPOIType = getPOITypeAtCoordinate(seedNum, poi.x, poi.y);
                
                // Apply the same filtering logic as before
                if (userState === 'unknown') {
                    if (realPOIType === 'church' || realPOIType === 'mage' || realPOIType === 'village') {
                        return false;
                    }
                } else if (userState === 'church') {
                    if (realPOIType !== 'church') {
                        return false;
                    }
                } else if (userState === 'mage') {
                    if (realPOIType !== 'mage') {
                        return false;
                    }
                } else if (userState === 'village') {
                    if (realPOIType !== 'village') {
                        return false;
                    }
                } else if (userState === 'other') {
                    if (realPOIType === 'church' || realPOIType === 'mage' || realPOIType === 'village' || !realPOIType) {
                        return false;
                    }
                }
            }
            return true;
        });

        console.log(`After POI filtering for Unknown nightlord: ${filteredSeeds.length} seeds remaining`);
        
        this.updateSeedCountDisplay(filteredSeeds.length);
        
        if (filteredSeeds.length === 0) {
            this.showNoSeedsFound();
        } else {
            // Always show possible seeds (whether 1 or multiple)
            this.showPossibleSeeds(filteredSeeds);
        }
    }

    showPossibleSeeds(seeds) {
        this.showingSeedImage = false;
        if (this.chosenNightlord && this.chosenMap) {
            this.renderMap();
        }
        
        // Store seeds for arrow key navigation
        this.availableSeeds = seeds.sort((a, b) => a.seedNumber - b.seedNumber);
        this.currentSeedIndex = -1;
        
        // Show the possible seeds section
        const possibleSeedsSection = document.getElementById('possible-seeds-section');
        const possibleSeedsGrid = document.getElementById('possible-seeds-grid');
        
        possibleSeedsSection.style.display = 'block';
        
        // Clear existing seeds
        possibleSeedsGrid.innerHTML = '';
        
        // Add each seed as a clickable item
        this.availableSeeds.forEach((seed, index) => {
            const seedItem = document.createElement('div');
            seedItem.className = 'seed-item';
            seedItem.textContent = seed.seedNumber;
            seedItem.addEventListener('click', () => {
                this.currentSeedIndex = index;
                this.selectSeedFromGrid(seed.seedNumber);
            });
            possibleSeedsGrid.appendChild(seedItem);
        });
        
        if (this.availableSeeds.length > 0) {
            setTimeout(() => {
                // Only auto-display if there's exactly 1 seed left (definitive match)
                // Don't auto-highlight for multiple seeds - let user browse manually
                if (this.availableSeeds.length === 1 && this.chosenNightlord && this.chosenMap && this.poiFilterEnabled) {
                    this.selectSeedFromGrid(this.availableSeeds[0].seedNumber);
                }
            }, 100);
        }
    }

    selectSeedFromGrid(seedNumber) {
        // Remove previous selections
        document.querySelectorAll('.seed-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Mark this seed as selected
        const clickedItem = Array.from(document.querySelectorAll('.seed-item'))
            .find(item => item.textContent == seedNumber);
        if (clickedItem) {
            clickedItem.classList.add('selected');
        }
        
        // Always allow showing the seed image when a seed is clicked
        this.showSeedImage(seedNumber);
        this.showingSeedImage = true;
    }

    hidePossibleSeeds() {
        const possibleSeedsSection = document.getElementById('possible-seeds-section');
        // Keep the section visible but clear its content
        if (possibleSeedsSection) {
            const possibleSeedsGrid = document.getElementById('possible-seeds-grid');
            if (possibleSeedsGrid) {
                possibleSeedsGrid.innerHTML = '';
            }
        }
        
        // Clear seed navigation state
        this.availableSeeds = [];
        this.currentSeedIndex = -1;
    }

    handleSeedNavigation(e) {
        if (this.availableSeeds.length === 0) return;
        
        let newIndex = this.currentSeedIndex;
        
        switch(e.key) {
            case 'ArrowUp':
                e.preventDefault();
                newIndex = Math.max(0, this.currentSeedIndex - 1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                newIndex = Math.min(this.availableSeeds.length - 1, this.currentSeedIndex + 1);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                newIndex = Math.max(0, this.currentSeedIndex - 1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                newIndex = Math.min(this.availableSeeds.length - 1, this.currentSeedIndex + 1);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.currentSeedIndex >= 0) {
                    const seed = this.availableSeeds[this.currentSeedIndex];
                    this.selectSeedFromGrid(seed.seedNumber);
                }
                return;
            default:
                return;
        }
        
        if (newIndex !== this.currentSeedIndex) {
            this.currentSeedIndex = newIndex;
            this.highlightCurrentSeed();
            
            // Immediately display the selected seed
            const selectedSeed = this.availableSeeds[this.currentSeedIndex];
            this.selectSeedFromGrid(selectedSeed.seedNumber);
        }
    }

    highlightCurrentSeed() {
        // Remove previous highlight
        document.querySelectorAll('.seed-item.keyboard-selected').forEach(item => {
            item.classList.remove('keyboard-selected');
        });
        
        if (this.currentSeedIndex >= 0 && this.currentSeedIndex < this.availableSeeds.length) {
            const seedItems = document.querySelectorAll('.seed-item');
            if (seedItems[this.currentSeedIndex]) {
                seedItems[this.currentSeedIndex].classList.add('keyboard-selected');
                seedItems[this.currentSeedIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }


    findRealPOITypeAtCoordinate(seedNum, clickX, clickY) {
        // Use CV classification data if available
        if (CV_CLASSIFICATION_DATA) {
            const seedKey = seedNum.toString().padStart(3, '0');
            const seedClassifications = CV_CLASSIFICATION_DATA[seedKey];
            
            if (seedClassifications) {
                // Find which clickable POI this coordinate matches
                const clickablePOI = this.currentPOIs.find(poi => {
                    const dx = clickX - poi.x;
                    const dy = clickY - poi.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    return distance <= 40; // Same tolerance as used elsewhere
                });
                
                if (clickablePOI) {
                    const poiKey = `POI${clickablePOI.id}`;
                    const cvClassification = seedClassifications[poiKey];
                    
                    if (cvClassification) {
                        console.log(`    ✅ Classification: ${cvClassification.toUpperCase()} for POI ${clickablePOI.id}`);
                        return cvClassification === 'nothing' ? null : cvClassification;
                    }
                }
            }
        }
        
        // No classification data available - return null
        console.log(`    ❌ No classification found in dataset for seed ${seedNum}`);
        return null;
    }
    


}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NightreignMapRecogniser();
});
