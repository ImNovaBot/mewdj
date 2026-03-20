// DJ MEW v2.0 - Smart Queue Master
// Focus: Reliability, Music Intelligence, Perfect Flow

class DJMEWv2 {
    constructor() {
        this.ws = null;
        this.state = {
            isPlaying: false,
            currentTrack: null,
            queue: [],
            connected: false
        };
        this.stats = {};
        this.searchResults = [];
        this.searchTimeout = null;
        
        console.log('🎵 DJ MEW v2.0 - Smart Queue Master initializing...');
        this.init();
    }

    init() {
        this.initWebSocket();
        this.initEventListeners();
        this.checkAuthStatus();
        this.fetchStats();
        
        // Initialize Spotify Web Playbook SDK if available
        window.onSpotifyWebPlaybackSDKReady = () => {
            this.initSpotifyPlayer();
        };
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
                this.state.queue = message.queue;
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

            console.log('➕ Adding to queue:', track.name);
            
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
            
            this.showNotification(`✅ Added "${track.name}" to queue (${result.item.bpm} BPM, ${result.item.key} key)`);
            
            // Clear search after adding
            document.getElementById('song-search').value = '';
            this.clearSearchResults();
            
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
        this.state.queue.splice(index, 1);
        this.renderQueue();
        
        // Send update to server
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'queue-update',
                queue: this.state.queue
            }));
        }
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
            if (this.player && this.deviceId) {
                // If we have queue items, start playing them
                if (this.state.queue.length > 0 && !this.state.currentTrack) {
                    await this.playNextFromQueue();
                } else {
                    // Resume current playback
                    await this.player.resume();
                    console.log('▶️ Resumed playback');
                    this.showNotification('▶️ Playing');
                }
            } else {
                this.showNotification('❌ Spotify player not ready', 'error');
            }
        } catch (error) {
            console.error('Play error:', error);
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

    // Play next song from MEW's queue
    async playNextFromQueue() {
        if (this.state.queue.length === 0) {
            this.showNotification('❌ Queue is empty - add some songs!');
            return;
        }

        try {
            const nextTrack = this.state.queue.shift(); // Remove first track
            console.log('🎵 Playing next from queue:', nextTrack.name);

            // Play the track via Spotify
            const response = await fetch('/api/play-track', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    trackUri: `spotify:track:${nextTrack.id}`,
                    deviceId: this.deviceId 
                })
            });

            if (response.ok) {
                this.state.currentTrack = nextTrack;
                this.renderQueue(); // Update queue display
                this.updateNowPlaying();
                this.showNotification(`🎵 Now Playing: ${nextTrack.name}`);
                
                // Broadcast state update
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({
                        type: 'track-changed',
                        track: nextTrack,
                        queue: this.state.queue
                    }));
                }
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to play track');
            }
        } catch (error) {
            console.error('❌ Play next error:', error);
            this.showNotification('Failed to play track: ' + error.message, 'error');
        }
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
}

// Initialize DJ MEW v2.0
window.aidj = new DJMEWv2();

console.log('🔮✨ DJ MEW v2.0 - Smart Queue Master Ready!');
console.log('🎯 Features: Smart search, beat analysis, queue optimization');
console.log('💡 Focus: Music intelligence that actually works!');