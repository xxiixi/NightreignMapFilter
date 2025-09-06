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
                if (hasClassifications) {
                    const classCount = Object.keys(CV_CLASSIFICATION_DATA).length;
                    statusElement.innerHTML = `<span style="color: #28a745;">✅ Loaded ${seedCount} seeds (${classCount} classified)</span>`;
                } else {
                    statusElement.innerHTML = `<span style="color: #28a745;">✅ Loaded ${seedCount} seeds</span>`;
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
        this.chosenNightlord = nightlord;
        
        // Update UI
        document.getElementById('chosen-nightlord').textContent = nightlord;
        
        // Update button states
        document.querySelectorAll('.nightlord-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.nightlord === nightlord);
        });

        this.updateGameState();
    }

    selectMap(map) {
        this.chosenMap = map;
        this.currentPOIs = POIS_BY_MAP[map] || [];
        this.poiStates = this.initializePOIStates();
        
        console.log(`Selected map: ${map}, POIs: ${this.currentPOIs.length}`);
        
        // Update UI
        document.getElementById('chosen-map').textContent = map;
        
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
            this.showSelectionOverlay();
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

    drawPOI(poi, state) {
        const { x, y } = poi;
        
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
        this.ctx.beginPath();
        this.ctx.arc(x, y, ICON_SIZE / 2, 0, 2 * Math.PI);
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
        if (image.complete) {
            this.ctx.drawImage(image, x - ICON_SIZE / 2, y - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
        }
    }

    setupCanvasEventListeners() {
        // Left click - place church
        this.canvas.addEventListener('click', (e) => {
            if (!this.chosenNightlord || !this.chosenMap) {
                console.log('Please select both Nightlord and Map before marking POIs');
                return;
            }
            const pos = this.getMousePos(e);
            const poi = this.findClickedPOI(pos.x, pos.y);
            if (poi) {
                this.poiStates[poi.id] = 'church';
                this.drawMap(this.images.maps[this.chosenMap]);
                this.updateSeedFiltering();
            }
        });

        // Right click - show context menu
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!this.chosenNightlord || !this.chosenMap) {
                console.log('Please select both Nightlord and Map before marking POIs');
                return;
            }
            const pos = this.getMousePos(e);
            const poi = this.findClickedPOI(pos.x, pos.y);
            if (poi) {
                this.currentRightClickedPOI = poi;
                this.showContextMenu(e.clientX, e.clientY);
            }
        });

        // Middle click - mark as unknown
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                if (!this.chosenNightlord || !this.chosenMap) {
                    console.log('Please select both Nightlord and Map before marking POIs');
                    return;
                }
                const pos = this.getMousePos(e);
                const poi = this.findClickedPOI(pos.x, pos.y);
                if (poi) {
                    this.poiStates[poi.id] = 'unknown';
                    this.drawMap(this.images.maps[this.chosenMap]);
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
        return this.currentPOIs.find(poi => {
            const dx = x - poi.x;
            const dy = y - poi.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance <= ICON_SIZE / 2;
        });
    }

    resetMap() {
        this.poiStates = this.initializePOIStates();
        this.showingSeedImage = false;
        
        // Hide possible seeds section
        this.hidePossibleSeeds();
        
        // Always go back to the interactive map for POI input
        if (this.chosenMap && this.chosenNightlord) {
            this.renderMap();
        } else if (this.chosenMap) {
            this.drawMapWithSelectedImage();
        } else if (this.currentPOIs.length > 0) {
            this.drawDefaultMapWithImage();
        }
        
        // Show the canvas and hide seed image container
        const canvas = document.getElementById('map-canvas');
        const seedImageContainer = document.getElementById('seed-image-container');
        canvas.style.display = 'block';
        seedImageContainer.style.display = 'none';
        
        this.updateSeedFiltering();
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
        if (!this.chosenNightlord || !this.chosenMap) {
            this.updateSeedCount();
            this.hideSeedDetails();
            return;
        }

        // Handle "Unknown" nightlord case
        if (this.chosenNightlord === 'Unknown') {
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
        seedCountElement.innerHTML = '<span style="color: #e74c3c; font-weight: 600;">NO SEED FOUND<br>RESET THE MAP!</span>';
    }


    showSeedImage(mapSeed) {
        const canvas = document.getElementById('map-canvas');
        const seedImageContainer = document.getElementById('seed-image-container');
        
        canvas.style.display = 'none';
        seedImageContainer.style.display = 'block';
        
        const seedStr = mapSeed.toString().padStart(3, '0');
        const seedImageUrl = "https://www.trc-playground.hu/GameZ/NightreignSeeds/Seeds/" + seedStr + ".jpg";
        
        seedImageContainer.innerHTML = `
            <center>
                <a href="${seedImageUrl}" target="_blank">
                    <img src="${seedImageUrl}" alt="Seed ${mapSeed}" style="max-width: 768px; border: 2px solid black;">
                </a>
                <br>
                <b style="color: black;">Mapseed: ${mapSeed}</b>
                <br>
                <small style="color: blue;">Click on the map to open it in a new tab.</small>
            </center>
        `;
    }



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
        this.renderMap();
        
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
            this.currentSeedIndex = 0;
            setTimeout(() => {
                this.highlightCurrentSeed();
                // Only auto-display if there's exactly 1 seed left (definitive match)
                // Don't auto-display for multiple seeds - let user browse manually
                if (this.availableSeeds.length === 1) {
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
        
        // Show the seed image
        this.showSeedImage(seedNumber);
        this.showingSeedImage = true;
    }

    hidePossibleSeeds() {
        const possibleSeedsSection = document.getElementById('possible-seeds-section');
        possibleSeedsSection.style.display = 'none';
        
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
