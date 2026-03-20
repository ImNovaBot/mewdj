// DJ MEW v2.0 - Smart Queue Master
// Focus: Reliability, Music Intelligence, Perfect Flow

class DJMEWv2 {
    constructor() {
        this.ws = null;
        this.state = {
            isPlaying: false,
            currentTrack: null,
            queue: [],
            connected: false,
            crossfading: false,
            nextTrackLoaded: false
        };
        this.stats = {};
        this.searchResults = [];
        this.searchTimeout = null;
        
        // DJ Mixing Properties
        this.audioContext = null;
        this.crossfadeValue = 0.5; // 0 = track A, 1 = track B
        this.transitionDuration = 8000; // 8 seconds for crossfade
        this.nextTrackStartTime = null;
        this.isTransitioning = false;
        
        console.log('🎵 DJ MEW v2.0 - Smart Queue Master + DJ Mixing initializing...');
        this.init();
    }

    init() {
        this.initWebSocket();
        this.initEventListeners();
        this.checkAuthStatus();
        this.fetchStats();
        this.initDJMixing();
        
        // Initialize Spotify Web Playbook SDK if available
        window.onSpotifyWebPlaybackSDKReady = () => {
            this.initSpotifyPlayer();
        };
    }

    // Initialize DJ Mixing Capabilities
    async initDJMixing() {
        try {
            // Initialize Web Audio API for mixing
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create master gain nodes for crossfading
            this.trackAGain = this.audioContext.createGain();
            this.trackBGain = this.audioContext.createGain();
            this.masterGain = this.audioContext.createGain();
            
            // Connect the audio graph
            this.trackAGain.connect(this.masterGain);
            this.trackBGain.connect(this.masterGain);
            this.masterGain.connect(this.audioContext.destination);
            
            // Initialize crossfader
            this.setCrossfaderPosition(0.5); // Center position
            
            console.log('🎛️ DJ Mixing initialized - ready for legendary crossfading!');
            
        } catch (error) {
            console.error('❌ Failed to initialize DJ mixing:', error);
            // Fallback to basic playback without mixing
        }
    }

    // Set crossfader position (0 = track A only, 1 = track B only, 0.5 = both equal)
    setCrossfaderPosition(position) {
        if (!this.audioContext) return;
        
        this.crossfadeValue = Math.max(0, Math.min(1, position));
        
        // Calculate gain values for smooth crossfade
        const trackAVolume = Math.cos(this.crossfadeValue * Math.PI / 2);
        const trackBVolume = Math.sin(this.crossfadeValue * Math.PI / 2);
        
        this.trackAGain.gain.setValueAtTime(trackAVolume, this.audioContext.currentTime);
        this.trackBGain.gain.setValueAtTime(trackBVolume, this.audioContext.currentTime);
    }

    // Automatic DJ crossfade between tracks
    async performAutoCrossfade(fromTrack, toTrack) {
        if (!this.audioContext || this.isTransitioning) return false;
        
        console.log('🎛️ MEW is crossfading from', fromTrack.name, 'to', toTrack.name);
        this.isTransitioning = true;
        
        try {
            // Calculate optimal crossfade timing based on BPM
            const crossfadeDuration = this.calculateCrossfadeDuration(fromTrack, toTrack);
            
            // Start next track slightly behind beat to sync up
            const beatOffset = this.calculateBeatOffset(fromTrack, toTrack);
            
            // Show crossfade visualization
            this.showNotification(`🎛️ MEW is crossfading... ${fromTrack.name} → ${toTrack.name}`);
            
            // Perform the crossfade
            await this.executeSmartCrossfade(crossfadeDuration, beatOffset);
            
            console.log('✨ Crossfade complete - legendary transition achieved!');
            return true;
            
        } catch (error) {
            console.error('❌ Crossfade failed:', error);
            return false;
        } finally {
            this.isTransitioning = false;
        }
    }

    // Calculate optimal crossfade duration based on track compatibility
    calculateCrossfadeDuration(fromTrack, toTrack) {
        if (!fromTrack.analysis || !toTrack.analysis) {
            return 8000; // Default 8 seconds
        }
        
        // Shorter crossfade for similar BPMs, longer for different ones
        const bpmDiff = Math.abs(fromTrack.analysis.tempo - toTrack.analysis.tempo);
        const baseDuration = 6000; // 6 seconds base
        const bpmFactor = Math.min(bpmDiff / 10, 4); // Max 4 extra seconds
        
        return baseDuration + (bpmFactor * 1000);
    }

    // Calculate beat offset for perfect sync
    calculateBeatOffset(fromTrack, toTrack) {
        if (!fromTrack.analysis || !toTrack.analysis) {
            return 0;
        }
        
        // Simple beat matching - start next track on beat boundary
        const fromBPM = fromTrack.analysis.tempo;
        const toBPM = toTrack.analysis.tempo;
        const beatLength = (60 / fromBPM) * 1000; // Beat length in ms
        
        return beatLength / 4; // Start slightly behind beat
    }

    // Execute the actual crossfade with Web Audio API
    async executeSmartCrossfade(duration, beatOffset) {
        const steps = 50; // Smooth crossfade steps
        const stepDuration = duration / steps;
        
        for (let i = 0; i <= steps; i++) {
            const progress = i / steps;
            const crossfadePosition = 0.5 + (progress * 0.5); // 0.5 to 1.0
            
            this.setCrossfaderPosition(crossfadePosition);
            
            // Add subtle effects during transition
            if (i === Math.floor(steps * 0.3)) {
                this.applyTransitionEffect('filter-sweep');
            }
            if (i === Math.floor(steps * 0.7)) {
                this.applyTransitionEffect('reverb-tail');
            }
            
            await new Promise(resolve => setTimeout(resolve, stepDuration));
        }
        
        // Reset crossfader for next track
        this.setCrossfaderPosition(0.5);
    }

    // Apply transition effects during crossfade
    applyTransitionEffect(effect) {
        console.log(`🎛️ Applying ${effect} effect`);
        // Visual effect indicators
        const effectElement = document.getElementById(`effect-${effect.split('-')[0]}`);
        if (effectElement) {
            effectElement.classList.add('active');
            setTimeout(() => {
                effectElement.classList.remove('active');
            }, 2000);
        }
    }

    // WebSocket Connection - Simple and Reliable
    initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('🔗 Connected to DJ MEW server');
                this.updateConnectionStatus(true);
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            };

            this.ws.onclose = () => {
                console.log('🔌 Disconnected from server');
                this.updateConnectionStatus(false);
                // Reconnect after 3 seconds
                setTimeout(() => this.initWebSocket(), 3000);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
        }
    }

    handleWebSocketMessage(message) {
        console.log('📨 Received:', message.type);
        
        switch (message.type) {
            case 'state-update':
                this.state = { ...this.state, ...message.state };
                this.stats = message.stats || this.stats;
                this.updateUI();
                break;
                
            case 'queue-update':
                console.log('📨 Queue update received:', message.queue.length, 'tracks');
                this.state.queue = message.queue || [];
                this.renderQueue();
                break;
                
            case 'queue-optimized':
                this.state.queue = message.queue;
                this.renderQueue();
                this.showNotification('🧠 MEW optimized your queue for perfect flow!');
                break;
                
            case 'playback-update':
                this.state.isPlaying = message.isPlaying;
                this.updatePlaybackControls();
                break;
                
            case 'track-changed':
                this.state.currentTrack = message.track;
                this.updateNowPlaying();
                break;
                
            case 'smart-transition-ready':
                console.log('🔮 MEW detected perfect transition point!');
                this.showNotification('🔮 MEW: Perfect transition point detected!');
                // Could auto-advance to next track here
                break;
                
            case 'error':
                this.showNotification(message.message, 'error');
                break;
        }
    }

    // Event Listeners
    initEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('song-search');
        const searchBtn = document.getElementById('search-btn');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    if (e.target.value.length > 2) {
                        this.searchTracks(e.target.value);
                    } else {
                        this.clearSearchResults();
                    }
                }, 300);
            });
        }

        // Playback controls
        document.getElementById('play-btn')?.addEventListener('click', () => this.play());
        document.getElementById('pause-btn')?.addEventListener('click', () => this.pause());
        document.getElementById('next-btn')?.addEventListener('click', () => this.nextTrack());
        
        // Queue controls
        document.getElementById('optimize-queue-btn')?.addEventListener('click', () => this.optimizeQueue());
        document.getElementById('clear-queue-btn')?.addEventListener('click', () => this.clearQueue());
        
        // MEW's autonomous capabilities
        // (Click handlers are inline in HTML for MEW functions)
        
        // Refresh stats periodically
        setInterval(() => this.fetchStats(), 30000); // Every 30 seconds
    }

    // Authentication Check
    checkAuthStatus() {
        const urlParams = new URLSearchParams(window.location.search);
        
        if (urlParams.get('authenticated') === 'true') {
            console.log('✅ Spotify authentication detected');
            
            const userParam = urlParams.get('user');
            if (userParam) {
                try {
                    const userInfo = JSON.parse(decodeURIComponent(userParam));
                    this.updateSpotifyStatus(true, userInfo);
                } catch (e) {
                    console.error('Failed to parse user info:', e);
                }
            }
            
            this.hideConnectionPanel();
            this.showNotification('🎵 Connected to Spotify! Ready to build smart queues.');
            
            // Clear URL parameters
            setTimeout(() => {
                window.history.replaceState({}, document.title, window.location.pathname);
            }, 1000);
            
        } else if (urlParams.get('error')) {
            this.showNotification('❌ Spotify connection failed', 'error');
        }
    }

    // Search Functionality
    async searchTracks(query) {
        try {
            console.log('🔍 Searching for:', query);
            
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query, limit: 10 })
            });

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }

            const results = await response.json();
            this.searchResults = results;
            this.renderSearchResults();
            
        } catch (error) {
            console.error('Search error:', error);
            this.showNotification('Search failed: ' + error.message, 'error');
        }
    }

    renderSearchResults() {
        const container = document.getElementById('search-results');
        if (!container) return;

        if (this.searchResults.length === 0) {
            container.innerHTML = '<p class="no-results">No results found</p>';
            return;
        }

        container.innerHTML = this.searchResults.map(track => `
            <div class="search-result" data-track-id="${track.id}">
                <img src="${track.image || '/placeholder-album.png'}" alt="${track.name}" class="track-image">
                <div class="track-info">
                    <h4>${track.name}</h4>
                    <p>${track.artist} • ${track.album}</p>
                </div>
                <button class="add-btn" onclick="aidj.addToQueue('${track.id}')">
                    ➕ Add to Queue
                </button>
            </div>
        `).join('');
    }

    clearSearchResults() {
        const container = document.getElementById('search-results');
        if (container) {
            container.innerHTML = '';
        }
    }

    // Queue Management - The Smart Part!
    async addToQueue(trackId) {
        try {
            const track = this.searchResults.find(t => t.id === trackId);
            if (!track) {
                throw new Error('Track not found');
            }

            // Check if song is already in queue
            const alreadyQueued = this.state.queue.find(queueTrack => queueTrack.id === trackId);
            if (alreadyQueued) {
                this.showNotification(`⚠️ "${track.name}" is already in queue!`, 'error');
                return;
            }

            console.log('➕ Adding to queue:', track.name, 'ID:', trackId);
            
            const response = await fetch('/api/add-to-queue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ track })
            });

            if (!response.ok) {
                throw new Error(`Failed to add to queue: ${response.status}`);
            }

            const result = await response.json();
            
            // Update local queue state immediately
            this.state.queue.push(result.item);
            this.renderQueue();
            
            this.showNotification(`✅ Added "${track.name}" to queue (${result.item.bpm} BPM, ${result.item.key} key)`);
            
            // Clear search after adding
            document.getElementById('song-search').value = '';
            this.clearSearchResults();
            
            console.log('🎵 Current queue after adding:', this.state.queue.map(t => t.name));
            
        } catch (error) {
            console.error('Add to queue error:', error);
            this.showNotification('Failed to add song: ' + error.message, 'error');
        }
    }

    async optimizeQueue() {
        try {
            if (this.state.queue.length <= 1) {
                this.showNotification('Need at least 2 songs to optimize queue');
                return;
            }

            console.log('🧠 Requesting queue optimization...');
            
            const response = await fetch('/api/optimize-queue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Optimization failed: ${response.status}`);
            }

            const result = await response.json();
            console.log('✨ Queue optimization result:', result.message);
            
        } catch (error) {
            console.error('Queue optimization error:', error);
            this.showNotification('Failed to optimize queue: ' + error.message, 'error');
        }
    }

    async clearQueue() {
        try {
            const response = await fetch('/api/clear-queue', {
                method: 'POST'
            });

            if (response.ok) {
                this.showNotification('🗑️ Queue cleared');
            }
        } catch (error) {
            console.error('Clear queue error:', error);
        }
    }

    // Queue Rendering with Smart Analysis
    renderQueue() {
        const container = document.getElementById('queue-list');
        if (!container) return;

        if (this.state.queue.length === 0) {
            container.innerHTML = '<p class="empty-queue">Queue is empty - add some songs!</p>';
            return;
        }

        container.innerHTML = this.state.queue.map((track, index) => {
            const compatibility = this.getCompatibilityScore(index);
            
            return `
                <div class="queue-item" data-index="${index}">
                    <div class="queue-number">${index + 1}</div>
                    <img src="${track.image || '/placeholder-album.png'}" alt="${track.name}" class="queue-track-image">
                    
                    <div class="queue-track-info">
                        <h4>${track.name}</h4>
                        <p>${track.artist}</p>
                    </div>
                    
                    <div class="track-analysis">
                        <div class="analysis-item">
                            <span class="bpm-badge" style="background-color: ${this.getBPMColor(track.bpm)}">
                                ${track.bpm} BPM
                            </span>
                        </div>
                        <div class="analysis-item">
                            <span class="key-badge">${track.key}</span>
                        </div>
                        <div class="analysis-item">
                            <span class="energy-badge">⚡ ${track.energy}%</span>
                        </div>
                    </div>
                    
                    ${track.structure ? `
                        <div class="mew-intelligence">
                            <div class="mew-timing">
                                <div class="smart-timing-badge">
                                    🧠 MEW: ${Math.round(track.play_duration)}s
                                </div>
                                <div class="timing-details">
                                    Start: ${Math.round(track.smart_start)}s | End: ${Math.round(track.smart_end)}s
                                </div>
                            </div>
                            ${track.hot_cues && track.hot_cues.length > 0 ? `
                                <div class="hot-cues">
                                    ${track.hot_cues.slice(0, 2).map(cue => 
                                        `<span class="cue-badge">${cue.name}</span>`
                                    ).join('')}
                                </div>
                            ` : ''}
                            ${track.structure.recommendations.cut_recommendations.length > 0 ? `
                                <div class="mew-recommendation">
                                    💡 ${track.structure.recommendations.cut_recommendations[0]}
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                    
                    ${compatibility ? `
                        <div class="compatibility-score">
                            <div class="compatibility-bar">
                                <div class="compatibility-fill" style="width: ${compatibility}%"></div>
                            </div>
                            <span class="compatibility-text">${compatibility}% flow</span>
                        </div>
                    ` : ''}
                    
                    <button class="remove-btn" onclick="aidj.removeFromQueue(${index})">❌</button>
                </div>
            `;
        }).join('');
        
        // Update queue stats
        this.updateQueueStats();
    }

    getCompatibilityScore(index) {
        if (index === 0 || !this.state.queue[index - 1]) return null;
        
        const current = this.state.queue[index];
        const previous = this.state.queue[index - 1];
        
        if (!current.analysis || !previous.analysis) return null;
        
        // Simplified compatibility calculation
        let score = 0;
        
        // BPM compatibility
        const bpmDiff = Math.abs(current.analysis.tempo - previous.analysis.tempo);
        const bpmScore = Math.max(0, 100 - (bpmDiff / 2));
        score += bpmScore * 0.4;
        
        // Energy flow
        const energyDiff = Math.abs(current.analysis.energy - previous.analysis.energy);
        const energyScore = Math.max(0, 100 - (energyDiff * 100));
        score += energyScore * 0.3;
        
        // Key compatibility (simplified)
        const keyScore = this.getKeyCompatibility(current.analysis.key, previous.analysis.key);
        score += keyScore * 0.3;
        
        return Math.round(score);
    }

    getKeyCompatibility(key1, key2) {
        // Simplified key compatibility
        if (key1 === key2) return 100;
        
        // Adjacent keys in circle of fifths
        const adjacentKeys = {
            0: [7, 5], 1: [8, 6], 2: [9, 7], 3: [10, 8], 4: [11, 9], 5: [0, 10],
            6: [1, 11], 7: [2, 0], 8: [3, 1], 9: [4, 2], 10: [5, 3], 11: [6, 4]
        };
        
        if (adjacentKeys[key1]?.includes(key2)) return 80;
        
        return 50; // Default compatibility
    }

    getBPMColor(bpm) {
        if (bpm < 100) return '#64b5f6'; // Blue - Slow
        if (bpm < 120) return '#81c784'; // Green - Medium  
        if (bpm < 140) return '#ffb74d'; // Orange - Fast
        return '#f06292'; // Pink - Very Fast
    }

    removeFromQueue(index) {
        console.log('🗑️ Removing track at index:', index);
        const removedTrack = this.state.queue[index];
        this.state.queue.splice(index, 1);
        this.renderQueue();
        
        this.showNotification(`🗑️ Removed "${removedTrack?.name}" from queue`);
        
        // Send update to server via API
        fetch('/api/update-queue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ queue: this.state.queue })
        }).catch(error => {
            console.error('Failed to update server queue:', error);
        });
    }

    updateQueueStats() {
        const statsEl = document.getElementById('queue-stats');
        if (!statsEl || this.state.queue.length === 0) return;
        
        const avgBPM = Math.round(
            this.state.queue.reduce((sum, track) => sum + track.bpm, 0) / this.state.queue.length
        );
        
        const avgEnergy = Math.round(
            this.state.queue.reduce((sum, track) => sum + track.energy, 0) / this.state.queue.length  
        );
        
        const totalDuration = this.state.queue.reduce((sum, track) => sum + track.duration, 0);
        const minutes = Math.floor(totalDuration / 60000);
        
        statsEl.innerHTML = `
            <div class="queue-stat">📊 ${this.state.queue.length} songs</div>
            <div class="queue-stat">⏱️ ${minutes} min</div>
            <div class="queue-stat">🎵 ${avgBPM} avg BPM</div>
            <div class="queue-stat">⚡ ${avgEnergy}% avg energy</div>
        `;
    }

    // Playback Controls - Now Actually Control Spotify!
    async play() {
        try {
            console.log('▶️ PLAY button clicked');
            console.log('🔍 Player ready:', !!this.player);
            console.log('🔍 Device ID:', this.deviceId);
            console.log('🔍 Queue length:', this.state.queue.length);
            console.log('🔍 Current track:', this.state.currentTrack ? this.state.currentTrack.name : 'none');

            if (!this.player || !this.deviceId) {
                this.showNotification('❌ Spotify player not ready', 'error');
                return;
            }

            // ALWAYS play from MEW's queue if it has songs
            if (this.state.queue.length > 0) {
                console.log('🎵 Queue has songs - playing from MEW queue');
                await this.playNextFromQueue();
            } else if (this.state.currentTrack) {
                // Resume current track if we have one
                console.log('🎵 Resuming current track');
                await this.player.resume();
                this.showNotification('▶️ Resumed');
            } else {
                this.showNotification('❌ No songs in queue - add some music first!', 'error');
            }
        } catch (error) {
            console.error('❌ Play error:', error);
            this.showNotification('Failed to play: ' + error.message, 'error');
        }
    }

    async pause() {
        try {
            if (this.player) {
                await this.player.pause();
                console.log('⏸️ Paused playback');
                this.showNotification('⏸️ Paused');
            }
        } catch (error) {
            console.error('Pause error:', error);
            this.showNotification('Failed to pause: ' + error.message, 'error');
        }
    }

    async nextTrack() {
        try {
            await this.playNextFromQueue();
        } catch (error) {
            console.error('Next track error:', error);
            this.showNotification('Failed to skip: ' + error.message, 'error');
        }
    }

    // Play next song from MEW's queue with DJ mixing
    async playNextFromQueue() {
        console.log('🎵 playNextFromQueue called, queue length:', this.state.queue.length);
        
        if (this.state.queue.length === 0) {
            this.showNotification('❌ Queue is empty - add some songs!');
            return;
        }

        try {
            const nextTrack = this.state.queue.shift(); // Remove first track
            console.log('🎵 Next track from MEW queue:', nextTrack.name, 'by', nextTrack.artist);
            console.log('🎛️ Analysis - BPM:', nextTrack.bpm, 'Key:', nextTrack.key, 'Energy:', nextTrack.energy + '%');

            // If we have a current track, perform DJ crossfade
            if (this.state.currentTrack && this.audioContext) {
                console.log('🎛️ Performing legendary DJ crossfade...');
                await this.performDJTransition(this.state.currentTrack, nextTrack);
            } else {
                console.log('🎵 No current track - starting fresh');
                await this.startTrackPlayback(nextTrack);
            }

            // Update state
            this.state.currentTrack = nextTrack;
            this.renderQueue(); // Update queue display
            this.updateNowPlaying();
            
            // Sync queue state with server (track was removed by shift())
            await fetch('/api/update-queue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ queue: this.state.queue })
            }).catch(error => {
                console.error('Failed to sync queue with server:', error);
            });
            
            // Schedule next transition if more tracks in queue
            if (this.state.queue.length > 0) {
                this.scheduleNextTransition(nextTrack);
            }
            
            // Broadcast state update
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'track-changed',
                    track: nextTrack,
                    queue: this.state.queue
                }));
            }
            
        } catch (error) {
            console.error('❌ Play next error:', error);
            this.showNotification('Failed to play track: ' + error.message, 'error');
        }
    }

    // Perform intelligent DJ transition with varied techniques
    async performDJTransition(fromTrack, toTrack) {
        console.log('🎛️ MEW\'s legendary DJ intelligence activating...');
        console.log(`🎵 Transitioning: ${fromTrack.name} (${fromTrack.bpm} BPM) → ${toTrack.name} (${toTrack.bpm} BPM)`);
        
        try {
            // Get current queue vibe for intelligent technique selection
            const vibeResponse = await fetch('/api/queue-vibe');
            const { vibe } = await vibeResponse.json();
            
            // MEW chooses the perfect transition technique based on vibe
            const technique = this.selectIntelligentTransition(fromTrack, toTrack, vibe);
            
            console.log(`🧠 MEW selected: ${technique.name} (perfect for ${vibe.mood} ${vibe.primary_genre})`);
            
            // Show MEW's creative decision
            this.showNotification(`🔮 MEW: ${technique.description}`, 'dj-transition');
            
            // Execute the chosen technique
            await this.executeTransitionTechnique(technique, fromTrack, toTrack);
            
            // Track transition in persistent stats
            this.trackTransition();
            
            // Start playing next track with perfect timing
            await this.startTrackPlayback(toTrack);
            
            console.log(`✨ ${technique.name} complete! Legendary transition achieved!`);
            this.showNotification(`✨ ${technique.success_message}`);
            
        } catch (error) {
            console.error('❌ Advanced transition failed:', error);
            // Fallback to basic transition
            await this.basicTransition(fromTrack, toTrack);
        }
    }

    // Select intelligent transition technique based on vibe and tracks
    selectIntelligentTransition(fromTrack, toTrack, vibe) {
        const energyChange = (toTrack.energy || 50) - (fromTrack.energy || 50);
        const bpmChange = Math.abs((toTrack.bpm || 120) - (fromTrack.bpm || 120));
        
        const techniques = {
            // High-energy/party techniques
            'air_horn_slam': {
                name: 'Air Horn Energy Slam',
                description: 'Building massive energy with air horn',
                condition: vibe.mood === 'party' && energyChange > 10,
                effects: ['air_horn', 'crowd_buildup', 'impact_slam'],
                duration: 3000,
                success_message: 'LEGENDARY energy slam! Crowd is going wild!'
            },
            
            'laser_sweep_drop': {
                name: 'Laser Sweep Drop',
                description: 'Electronic laser sweep into drop',
                condition: vibe.primary_genre === 'electronic' || vibe.primary_genre === 'high-energy-dance',
                effects: ['laser_sweep', 'whoosh', 'electronic_drop'],
                duration: 4000,
                success_message: 'Perfect laser drop! Pure electronic magic!'
            },
            
            'crowd_cheer_buildup': {
                name: 'Crowd Cheer Buildup',
                description: 'Crowd energy building into anthem',
                condition: vibe.mood === 'party' && toTrack.energy > 70,
                effects: ['crowd_cheer', 'applause', 'anthem_rise'],
                duration: 5000,
                success_message: 'Crowd erupted! Festival vibes unlocked!'
            },
            
            // Smooth/feel-good techniques
            'harmonic_flow': {
                name: 'Harmonic Flow Transition',
                description: 'Smooth harmonic transition',
                condition: vibe.mood === 'uplifting' || vibe.primary_genre === 'feel-good',
                effects: ['harmonic_rise', 'smooth_filter', 'musical_bridge'],
                duration: 7000,
                success_message: 'Buttery smooth transition! Perfect harmonic flow!'
            },
            
            'vocal_drop_blend': {
                name: 'Vocal Drop Blend',
                description: 'Perfect vocal timing blend',
                condition: vibe.primary_genre === 'feel-good' && energyChange < 10,
                effects: ['vocal_drop', 'echo_tail', 'smooth_blend'],
                duration: 6000,
                success_message: 'Vocal magic! Seamless blend achieved!'
            },
            
            // Chill techniques
            'ambient_fade_bridge': {
                name: 'Ambient Fade Bridge',
                description: 'Dreamy ambient transition',
                condition: vibe.mood === 'relaxed' || vibe.primary_genre === 'chill',
                effects: ['ambient_wash', 'reverb_tail', 'soft_fade'],
                duration: 10000,
                success_message: 'Ethereal transition! Perfect ambient flow!'
            },
            
            // High BPM change techniques
            'tempo_bridge_effect': {
                name: 'Tempo Bridge Effect',
                description: 'Bridging BPM gap with style',
                condition: bpmChange > 20,
                effects: ['tempo_shift', 'rhythm_break', 'sync_effect'],
                duration: 8000,
                success_message: 'Tempo bridge mastered! BPM transition perfected!'
            },
            
            // Universal techniques
            'psychic_crossfade': {
                name: 'Psychic Crossfade',
                description: 'MEW\'s signature psychic blend',
                condition: true, // Always available as fallback
                effects: ['psychic_energy', 'crossfade_magic', 'mew_signature'],
                duration: 6000,
                success_message: 'Psychic crossfade complete! Pure MEW magic!'
            }
        };
        
        // Find first technique that matches conditions
        for (const [key, technique] of Object.entries(techniques)) {
            if (technique.condition) {
                return { ...technique, key };
            }
        }
        
        // Fallback to psychic crossfade
        return { ...techniques.psychic_crossfade, key: 'psychic_crossfade' };
    }

    // Execute the chosen transition technique with effects
    async executeTransitionTechnique(technique, fromTrack, toTrack) {
        console.log(`🎛️ Executing ${technique.name}...`);
        
        // Visual effects sequence
        const effectDuration = technique.duration / technique.effects.length;
        
        for (let i = 0; i < technique.effects.length; i++) {
            const effect = technique.effects[i];
            console.log(`🎪 Applying ${effect} effect`);
            
            // Activate visual effect
            this.activateTransitionEffect(effect);
            
            // Show crossfader movement
            this.animateCrossfader(i / technique.effects.length);
            
            // Wait for effect duration
            await new Promise(resolve => setTimeout(resolve, effectDuration));
        }
        
        // Final crossfader position
        this.animateCrossfader(1.0);
    }

    // Activate specific transition effect visually
    activateTransitionEffect(effect) {
        // Map effects to visual elements
        const effectMap = {
            'air_horn': 'effect-filter',
            'laser_sweep': 'effect-reverb',
            'crowd_cheer': 'effect-echo',
            'harmonic_rise': 'effect-filter',
            'ambient_wash': 'effect-reverb',
            'tempo_shift': 'effect-drop',
            'psychic_energy': 'effect-filter'
        };
        
        const elementId = effectMap[effect] || 'effect-filter';
        const effectEl = document.getElementById(elementId);
        
        if (effectEl) {
            effectEl.classList.add('active');
            setTimeout(() => {
                effectEl.classList.remove('active');
            }, 2000);
        }
        
        // Show effect name in notification
        const effectNames = {
            'air_horn': '📯 AIR HORN!',
            'laser_sweep': '🌟 LASER SWEEP!',
            'crowd_cheer': '👥 CROWD CHEER!',
            'harmonic_rise': '🎹 HARMONIC RISE!',
            'ambient_wash': '🌊 AMBIENT WASH!',
            'tempo_shift': '⚡ TEMPO SHIFT!',
            'psychic_energy': '🔮 PSYCHIC ENERGY!'
        };
        
        const notification = document.createElement('div');
        notification.className = 'effect-popup';
        notification.textContent = effectNames[effect] || '✨ EFFECT!';
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(45deg, #8b5cf6, #a855f7);
            color: white;
            padding: 20px 40px;
            border-radius: 15px;
            font-weight: bold;
            font-size: 1.5rem;
            z-index: 1000;
            animation: effectPop 1.5s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 1500);
    }

    // Animate crossfader movement
    animateCrossfader(position) {
        const crossfader = document.getElementById('crossfader');
        if (crossfader) {
            crossfader.value = 50 + (position * 50); // 50 to 100
            
            // Add glow effect during movement
            const container = document.querySelector('.crossfader-container');
            if (container) {
                container.classList.add('mixing');
                setTimeout(() => {
                    container.classList.remove('mixing');
                }, 3000);
            }
        }
    }

    // Basic fallback transition
    async basicTransition(fromTrack, toTrack) {
        console.log('🔄 Using basic transition fallback');
        await this.startTrackPlayback(toTrack);
        this.trackTransition(); // Track fallback transitions too
        this.showNotification(`🔄 Basic transition to ${toTrack.name}`);
    }

    // Track transition in persistent stats
    async trackTransition() {
        try {
            await fetch('/api/track-transition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (error) {
            console.error('Failed to track transition:', error);
        }
    }

    // Start track playback with MEW's smart timing
    async startTrackPlayback(track) {
        // Use MEW's smart cut points if available
        if (track.structure && track.structure.recommendations) {
            console.log('🧠 Using MEW\'s legendary DJ timing:');
            console.log(`  - Start: ${track.smart_start}s (skip intro)`);
            console.log(`  - End: ${track.smart_end}s (cut outro)`);
            console.log(`  - Duration: ${track.play_duration}s (optimal length)`);
            
            const response = await fetch('/api/play-track-smart', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    trackUri: `spotify:track:${track.id}`,
                    deviceId: this.deviceId,
                    startTime: track.smart_start || 15,
                    endTime: track.smart_end || 180,
                    duration: track.duration / 1000
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to play track with smart timing');
            }
            
            const result = await response.json();
            this.showNotification(`🧠 MEW: Playing ${track.play_duration}s of pure gold! (${result.message})`);
        } else {
            // Fallback to regular playback
            const response = await fetch('/api/play-track', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    trackUri: `spotify:track:${track.id}`,
                    deviceId: this.deviceId 
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to play track');
            }
        }
    }

    // Calculate how well two tracks will transition
    calculateTransitionCompatibility(fromTrack, toTrack) {
        if (!fromTrack.analysis || !toTrack.analysis) return 50;

        let score = 0;
        
        // BPM compatibility (40% weight)
        const bpmDiff = Math.abs(fromTrack.analysis.tempo - toTrack.analysis.tempo);
        const bpmScore = Math.max(0, 100 - (bpmDiff / 2));
        score += bpmScore * 0.4;

        // Key compatibility (30% weight) 
        const keyScore = this.getKeyCompatibility(fromTrack.analysis.key, toTrack.analysis.key);
        score += keyScore * 0.3;

        // Energy flow (30% weight)
        const energyDiff = Math.abs(fromTrack.analysis.energy - toTrack.analysis.energy);
        const energyScore = Math.max(0, 100 - (energyDiff * 100));
        score += energyScore * 0.3;

        return Math.round(score);
    }

    // Calculate transition duration based on compatibility
    calculateTransitionDuration(fromTrack, toTrack, compatibility) {
        const baseDuration = 8000; // 8 seconds
        
        // Shorter transitions for high compatibility
        if (compatibility > 80) return 6000; // 6 seconds
        if (compatibility > 60) return 8000; // 8 seconds  
        return 10000; // 10 seconds for difficult transitions
    }

    // Visual crossfade effect
    async visualCrossfade(fromTrack, toTrack, duration) {
        const crossfader = document.getElementById('crossfader');
        const steps = 60; // Smooth animation
        const stepDuration = duration / steps;
        
        // Show crossfader controls
        this.showCrossfaderActive(true);
        
        for (let i = 0; i <= steps; i++) {
            const progress = i / steps;
            
            // Move crossfader visually
            if (crossfader) {
                crossfader.value = 50 + (progress * 50); // 50 to 100
            }
            
            // Apply transition effects at key moments
            if (i === Math.floor(steps * 0.25)) {
                this.activateEffect('filter');
            }
            if (i === Math.floor(steps * 0.75)) {
                this.activateEffect('reverb');
            }
            
            await new Promise(resolve => setTimeout(resolve, stepDuration));
        }
        
        // Reset crossfader
        if (crossfader) {
            crossfader.value = 50;
        }
        this.showCrossfaderActive(false);
    }

    // Show crossfader in action
    showCrossfaderActive(active) {
        const container = document.querySelector('.crossfader-container');
        if (container) {
            container.classList.toggle('mixing', active);
        }
    }

    // Activate visual effect indicator
    activateEffect(effect) {
        const effectEl = document.getElementById(`effect-${effect}`);
        if (effectEl) {
            effectEl.classList.add('active');
            setTimeout(() => {
                effectEl.classList.remove('active');
            }, 2000);
        }
    }

    // Schedule next transition
    scheduleNextTransition(currentTrack) {
        // For now, we'll transition when user clicks next
        // Later we can add auto-transition based on track length
        console.log('🔮 Next transition prepared...');
    }

    // UI Updates
    updatePlaybackControls() {
        const playBtn = document.getElementById('play-btn');
        const pauseBtn = document.getElementById('pause-btn');
        
        if (this.state.isPlaying) {
            playBtn?.classList.remove('active');
            pauseBtn?.classList.add('active');
        } else {
            playBtn?.classList.add('active');  
            pauseBtn?.classList.remove('active');
        }
    }

    updateNowPlaying() {
        const track = this.state.currentTrack;
        
        if (track) {
            document.getElementById('current-title').textContent = track.name;
            document.getElementById('current-artist').textContent = track.artist;
            document.getElementById('current-artwork').src = track.image || '/placeholder-album.png';
            
            if (track.analysis) {
                document.getElementById('current-bpm').textContent = Math.round(track.analysis.tempo);
                document.getElementById('current-key').textContent = this.getKeyName(track.analysis.key);
                document.getElementById('current-energy').textContent = Math.round(track.analysis.energy * 100) + '%';
            }
            
            // Show MEW's DJ intelligence for current track
            this.displayMEWIntelligence(track);
        }
    }

    // Display MEW's DJ intelligence decisions
    displayMEWIntelligence(track) {
        const nowPlayingEl = document.querySelector('.now-playing');
        
        // Remove existing MEW intelligence display
        const existing = nowPlayingEl.querySelector('.mew-current-decisions');
        if (existing) {
            existing.remove();
        }
        
        if (track.structure && track.structure.recommendations) {
            const mewDecisions = document.createElement('div');
            mewDecisions.className = 'mew-current-decisions';
            mewDecisions.innerHTML = `
                <div class="mew-decision">
                    <div class="mew-decision-title">🧠 MEW's Legendary DJ Decisions:</div>
                    <div class="mew-decision-detail">
                        Playing ${Math.round(track.play_duration)}s of ${Math.round(track.duration/1000)}s total
                        (Skip ${Math.round(track.smart_start)}s intro, Cut ${Math.round((track.duration/1000) - track.smart_end)}s outro)
                    </div>
                    ${track.hot_cues && track.hot_cues.length > 0 ? `
                        <div class="mew-decision-detail">
                            🎯 Hot Cues: ${track.hot_cues.map(cue => cue.name).join(', ')}
                        </div>
                    ` : ''}
                </div>
            `;
            
            nowPlayingEl.appendChild(mewDecisions);
        }
    }

    getKeyName(key) {
        const keys = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
        return keys[key] || '?';
    }

    updateSpotifyStatus(connected, userInfo = null) {
        const statusEl = document.getElementById('spotify-status');
        
        if (connected && userInfo) {
            statusEl.innerHTML = `✅ Connected as ${userInfo.display_name}`;
            statusEl.style.color = '#1db954';
        } else {
            statusEl.innerHTML = '❌ Not Connected';
            statusEl.style.color = '#ef4444';
        }
    }

    updateConnectionStatus(connected) {
        this.state.connected = connected;
        const indicator = document.getElementById('connection-indicator');
        if (indicator) {
            indicator.classList.toggle('connected', connected);
            indicator.textContent = connected ? '🟢 Connected' : '🔴 Disconnected';
        }
    }

    hideConnectionPanel() {
        const panel = document.getElementById('connection-panel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    // Statistics
    async fetchStats() {
        try {
            const response = await fetch('/api/usage-stats');
            if (response.ok) {
                const stats = await response.json();
                this.stats = stats;
                this.updateStatsDisplay();
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        }
    }

    updateStatsDisplay() {
        // Update Spotify API calls
        const spotifyEl = document.getElementById('spotify-api-count');
        if (spotifyEl) {
            spotifyEl.textContent = `${this.stats.spotifyAPICalls || 0} / 10k`;
        }
        
        // Update songs analyzed
        const analyzedEl = document.getElementById('songs-analyzed');
        if (analyzedEl) {
            analyzedEl.textContent = `${this.stats.songsAnalyzed || 0} analyzed`;
        }
        
        // Update optimizations
        const optimizationsEl = document.getElementById('optimizations-count');  
        if (optimizationsEl) {
            optimizationsEl.textContent = `${this.stats.queueOptimizations || 0} optimizations`;
        }
        
        // Update render hours
        const renderEl = document.getElementById('render-hours');
        if (renderEl) {
            const hours = this.stats.renderHours || 0;
            renderEl.textContent = `${hours.toFixed(1)}h / 750h`;
        }

        // Update comprehensive persistent stats
        this.updateComprehensiveStats();
    }

    // Update comprehensive persistent statistics display
    updateComprehensiveStats() {
        const statsContainer = document.getElementById('comprehensive-stats');
        if (!statsContainer || !this.stats) return;
        
        // Calculate cost estimates
        const estimatedCost = this.calculateEstimatedCost(this.stats);
        
        statsContainer.innerHTML = `
            <div class="comprehensive-stats-content">
                <h4>📊 Persistent MEW Statistics</h4>
                
                <!-- MEW Intelligence Stats -->
                <div class="stats-category legendary">
                    <h5>🤖 MEW's Legendary Performance</h5>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-label">Total Sessions:</span>
                            <span class="stat-value highlight">${this.stats.sessionsTotal || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">DJ Transitions:</span>
                            <span class="stat-value highlight">${this.stats.transitionsPerformed || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Songs Added by MEW:</span>
                            <span class="stat-value highlight">${this.stats.autonomousSongsAdded || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Vibe Suggestions:</span>
                            <span class="stat-value highlight">${this.stats.mewSuggestions || 0}</span>
                        </div>
                    </div>
                </div>

                <!-- Usage Overview -->
                <div class="stats-category">
                    <h5>📈 Usage Overview</h5>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-label">Total Uptime:</span>
                            <span class="stat-value">${this.stats.totalUptime?.toFixed(1) || '0.0'}h</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Sessions Today:</span>
                            <span class="stat-value">${this.stats.sessionsToday || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Days Active:</span>
                            <span class="stat-value">${this.stats.daysSinceFirstLaunch || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Avg Session:</span>
                            <span class="stat-value">${this.stats.avgSessionLength?.toFixed(1) || '0.0'}h</span>
                        </div>
                    </div>
                </div>

                <!-- Technical Performance -->
                <div class="stats-category">
                    <h5>⚡ Technical Performance</h5>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-label">Songs Analyzed:</span>
                            <span class="stat-value">${this.stats.songsAnalyzed || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">API Calls/Hour:</span>
                            <span class="stat-value">${this.stats.apiCallsPerHour?.toFixed(1) || '0.0'}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Queue Optimizations:</span>
                            <span class="stat-value">${this.stats.queueOptimizations || 0}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Songs/Session:</span>
                            <span class="stat-value">${this.stats.songsPerSession?.toFixed(1) || '0.0'}</span>
                        </div>
                    </div>
                </div>

                <!-- Cost Tracking -->
                <div class="stats-category cost-section">
                    <h5>💰 Cost Tracking</h5>
                    <div class="stats-grid">
                        <div class="stat-item cost">
                            <span class="stat-label">Render Cost:</span>
                            <span class="stat-value">${estimatedCost.render}</span>
                        </div>
                        <div class="stat-item cost">
                            <span class="stat-label">Spotify Premium:</span>
                            <span class="stat-value">${estimatedCost.spotify}</span>
                        </div>
                        <div class="stat-item cost total">
                            <span class="stat-label">Monthly Total:</span>
                            <span class="stat-value">${estimatedCost.total}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Calculate cost estimates based on usage
    calculateEstimatedCost(stats) {
        // Render.com pricing: ~$7/month for 750 hours
        const renderHours = stats.totalUptime || 0;
        const renderCostPerMonth = (renderHours / 750) * 7;
        
        // Spotify Premium: $9.99/month (fixed)
        const spotifyPremium = 9.99;
        
        // Total monthly estimate
        const totalMonthly = renderCostPerMonth + spotifyPremium;
        
        return {
            render: `$${renderCostPerMonth.toFixed(2)}`,
            spotify: `$${spotifyPremium.toFixed(2)}`,
            total: `$${totalMonthly.toFixed(2)}`
        };
    }

    // Notifications
    showNotification(message, type = 'info') {
        console.log(`📢 ${message}`);
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Show with animation
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Remove after 4 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => document.body.removeChild(notification), 300);
        }, 4000);
    }

    // Spotify Web Playback SDK Integration
    async initSpotifyPlayer() {
        try {
            console.log('🎵 Initializing Spotify Web Playback SDK...');
            const tokenResponse = await fetch('/api/spotify-token');
            
            if (!tokenResponse.ok) {
                console.log('❌ No Spotify token available - player not initialized');
                return;
            }
            
            const { access_token } = await tokenResponse.json();
            
            this.player = new Spotify.Player({
                name: 'DJ MEW v2.0 - Smart Queue Master',
                getOAuthToken: cb => { cb(access_token); },
                volume: 0.8
            });
            
            // Ready
            this.player.addListener('ready', ({ device_id }) => {
                console.log('✅ DJ MEW player ready! Device ID:', device_id);
                this.deviceId = device_id;
                this.showNotification('🎵 DJ MEW player ready! You can now play music.');
                
                // Auto-transfer playback to this device
                this.transferPlayback(device_id);
            });
            
            // Not ready
            this.player.addListener('not_ready', ({ device_id }) => {
                console.log('❌ DJ MEW player disconnected:', device_id);
                this.showNotification('❌ DJ MEW player disconnected', 'error');
            });

            // Player state changes
            this.player.addListener('player_state_changed', (state) => {
                if (state) {
                    this.updatePlayerState(state);
                }
            });
            
            // Errors
            this.player.addListener('initialization_error', ({ message }) => {
                console.error('❌ Spotify player initialization error:', message);
                this.showNotification('Failed to initialize Spotify player: ' + message, 'error');
            });

            this.player.addListener('authentication_error', ({ message }) => {
                console.error('❌ Spotify player auth error:', message);
                this.showNotification('Spotify authentication error - please reconnect', 'error');
            });

            this.player.addListener('account_error', ({ message }) => {
                console.error('❌ Spotify account error:', message);
                this.showNotification('Spotify Premium required for playback', 'error');
            });
            
            // Connect to the player
            console.log('🔗 Connecting to Spotify...');
            const connected = await this.player.connect();
            
            if (connected) {
                console.log('✅ Connected to Spotify Web Playback SDK');
            } else {
                console.error('❌ Failed to connect to Spotify Web Playback SDK');
                this.showNotification('Failed to connect to Spotify player', 'error');
            }
            
        } catch (error) {
            console.error('❌ Failed to initialize Spotify player:', error);
            this.showNotification('Failed to initialize Spotify player: ' + error.message, 'error');
        }
    }

    // Transfer playback to MEW device
    async transferPlayback(deviceId) {
        try {
            console.log('🔄 Transferring playback to DJ MEW...');
            
            const response = await fetch('/api/transfer-playback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ deviceId })
            });

            if (response.ok) {
                console.log('✅ Playback transferred to DJ MEW');
                this.showNotification('🎧 Playback transferred to DJ MEW!');
            } else {
                console.log('⚠️ Could not auto-transfer playback');
            }
        } catch (error) {
            console.error('Transfer playback error:', error);
        }
    }

    // Update player state from Spotify
    updatePlayerState(state) {
        console.log('🎵 Player state update:', state);
        
        this.state.isPlaying = !state.paused;
        
        if (state.track_window.current_track) {
            const track = state.track_window.current_track;
            this.state.currentTrack = {
                name: track.name,
                artist: track.artists[0]?.name,
                album: track.album.name,
                image: track.album.images[0]?.url
            };
        }
        
        this.updateNowPlaying();
        this.updatePlaybackControls();
    }

    updateUI() {
        this.renderQueue();
        this.updateNowPlaying();  
        this.updatePlaybackControls();
        this.updateStatsDisplay();
    }

    // MEW's autonomous song discovery
    async mewSuggestSongs() {
        try {
            console.log('🔮 Asking MEW to read the vibe and suggest songs...');
            this.showNotification('🔮 MEW is reading your vibe and finding perfect songs...');
            
            const response = await fetch('/api/mew-suggest-songs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ count: 3 })
            });

            if (!response.ok) {
                throw new Error(`MEW suggestion failed: ${response.status}`);
            }

            const result = await response.json();
            console.log('🔮 MEW\'s vibe analysis:', result.vibe);
            console.log('🎯 MEW\'s suggestions:', result.suggestions);

            // Show vibe analysis
            this.showVibeAnalysis(result.vibe);
            
            // Show suggestions in a special popup
            this.showMEWSuggestions(result.suggestions, result.vibe);
            
            this.showNotification(`🔮 ${result.message} - Found ${result.suggestions.length} perfect matches!`);
            
        } catch (error) {
            console.error('MEW suggestion error:', error);
            this.showNotification('Failed to get MEW suggestions: ' + error.message, 'error');
        }
    }

    // MEW automatically adds songs based on vibe
    async mewAutoAdd() {
        try {
            console.log('🤖 MEW is autonomously building your set...');
            this.showNotification('🤖 MEW is autonomously adding perfect songs to your set...');
            
            const response = await fetch('/api/mew-auto-add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`MEW auto-add failed: ${response.status}`);
            }

            const result = await response.json();
            console.log('🤖 MEW autonomously added:', result.added, 'tracks');

            this.showNotification(`🤖 ${result.message}`);
            
            // Refresh queue display to show new tracks
            this.renderQueue();
            
        } catch (error) {
            console.error('MEW auto-add error:', error);
            this.showNotification('MEW auto-add failed: ' + error.message, 'error');
        }
    }

    // Show MEW's vibe analysis
    showVibeAnalysis(vibe) {
        const analysisEl = document.getElementById('current-vibe-analysis');
        
        if (analysisEl) {
            analysisEl.innerHTML = `
                <div class="vibe-analysis-content">
                    <h4>🔮 MEW's Vibe Reading:</h4>
                    <div class="vibe-details">
                        <span class="vibe-tag ${vibe.primary_genre}">${vibe.primary_genre}</span>
                        <span class="vibe-tag ${vibe.mood}">${vibe.mood}</span>
                        <span class="vibe-tag ${vibe.energy_trend}">${vibe.energy_trend} energy</span>
                    </div>
                    <div class="vibe-stats">
                        <div>Avg BPM: ${vibe.average_bpm}</div>
                        <div>Energy: ${vibe.average_energy}%</div>
                        <div>Vibe: ${vibe.average_valence}%</div>
                    </div>
                </div>
            `;
        } else {
            // Create vibe analysis element if it doesn't exist
            const newElement = document.createElement('div');
            newElement.id = 'current-vibe-analysis';
            newElement.className = 'vibe-analysis';
            newElement.innerHTML = `
                <div class="vibe-analysis-content">
                    <h4>🔮 MEW's Vibe Reading:</h4>
                    <div class="vibe-details">
                        <span class="vibe-tag ${vibe.primary_genre}">${vibe.primary_genre}</span>
                        <span class="vibe-tag ${vibe.mood}">${vibe.mood}</span>
                        <span class="vibe-tag ${vibe.energy_trend}">${vibe.energy_trend} energy</span>
                    </div>
                    <div class="vibe-stats">
                        <div>Avg BPM: ${vibe.average_bpm}</div>
                        <div>Energy: ${vibe.average_energy}%</div>
                        <div>Vibe: ${vibe.average_valence}%</div>
                    </div>
                </div>
            `;
            
            // Add to intelligence panel
            const intelligencePanel = document.querySelector('.intelligence-panel');
            if (intelligencePanel) {
                intelligencePanel.appendChild(newElement);
            }
        }
    }

    // Show MEW's song suggestions in a popup
    showMEWSuggestions(suggestions, vibe) {
        // Create suggestions modal
        const modal = document.createElement('div');
        modal.className = 'mew-suggestions-modal';
        modal.innerHTML = `
            <div class="mew-suggestions-content">
                <h3>🔮 MEW's Perfect Song Suggestions</h3>
                <p class="vibe-description">For your ${vibe.mood} ${vibe.primary_genre} vibe</p>
                
                <div class="suggestions-list">
                    ${suggestions.map((track, index) => `
                        <div class="suggestion-item">
                            <img src="${track.image || '/placeholder-album.png'}" alt="${track.name}" class="suggestion-image">
                            <div class="suggestion-info">
                                <h4>${track.name}</h4>
                                <p>${track.artist}</p>
                                <div class="suggestion-score">${track.score || 75}% vibe match</div>
                            </div>
                            <button class="add-suggestion-btn" onclick="aidj.addMEWSuggestion('${track.id}', ${index})">
                                ➕ Add
                            </button>
                        </div>
                    `).join('')}
                </div>
                
                <div class="suggestions-actions">
                    <button class="suggestions-btn add-all" onclick="aidj.addAllSuggestions()">✨ Add All</button>
                    <button class="suggestions-btn close" onclick="aidj.closeMEWSuggestions()">❌ Close</button>
                </div>
            </div>
        `;
        
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;
        
        document.body.appendChild(modal);
        this.currentSuggestions = suggestions;
    }

    // Add specific MEW suggestion to queue
    async addMEWSuggestion(trackId, index) {
        try {
            const suggestion = this.currentSuggestions[index];
            console.log('➕ Adding MEW suggestion:', suggestion.name);
            
            await this.addToQueue(trackId);
            this.showNotification(`✨ Added MEW's suggestion: ${suggestion.name}`);
            
        } catch (error) {
            console.error('Add suggestion error:', error);
            this.showNotification('Failed to add suggestion: ' + error.message, 'error');
        }
    }

    // Add all MEW suggestions
    async addAllSuggestions() {
        try {
            for (const suggestion of this.currentSuggestions) {
                await this.addToQueue(suggestion.id);
            }
            this.showNotification(`✨ Added all ${this.currentSuggestions.length} MEW suggestions!`);
            this.closeMEWSuggestions();
        } catch (error) {
            console.error('Add all suggestions error:', error);
            this.showNotification('Failed to add all suggestions: ' + error.message, 'error');
        }
    }

    // Close MEW suggestions modal
    closeMEWSuggestions() {
        const modal = document.querySelector('.mew-suggestions-modal');
        if (modal) {
            document.body.removeChild(modal);
        }
        this.currentSuggestions = null;
    }

    // Debug function to check queue state
    debugQueue() {
        console.log('🐛 DEBUG QUEUE STATE:');
        console.log('📱 Client queue:', this.state.queue.map(t => ({ name: t.name, id: t.id })));
        console.log('🎵 Current track:', this.state.currentTrack ? this.state.currentTrack.name : 'None');
        console.log('🔍 Search results:', this.searchResults.map(t => ({ name: t.name, id: t.id })));
        
        // Also fetch server state
        fetch('/api/state')
            .then(r => r.json())
            .then(state => {
                console.log('🖥️ Server queue:', state.queue?.map(t => ({ name: t.name, id: t.id })) || []);
                console.log('🖥️ Server current:', state.currentTrack ? state.currentTrack.name : 'None');
            })
            .catch(e => console.error('Failed to fetch server state:', e));
        
        this.showNotification('🐛 Queue debug info logged to console');
    }
}

// Initialize DJ MEW v2.0
window.aidj = new DJMEWv2();

console.log('🔮✨ DJ MEW v2.0 - Smart Queue Master Ready!');
console.log('🎯 Features: Smart search, beat analysis, queue optimization');
console.log('💡 Focus: Music intelligence that actually works!');