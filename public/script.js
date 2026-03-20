class AIdjPro {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.currentTrack = null;
        this.queue = [];
        this.isPlaying = false;
        
        this.initWebSocket();
        this.initEventListeners();
        this.checkAuthStatus();
    }

    initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('🎧 Connected to AI DJ Server');
            this.updateConnectionStatus(true);
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
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
    }

    handleServerMessage(data) {
        switch (data.type) {
            case 'state-update':
                this.updateDJState(data);
                break;
                
            case 'queue-updated':
                this.updateQueue(data.queue);
                break;
                
            case 'song-queued':
                this.showNotification(`🎵 ${data.message}`);
                break;
                
            case 'track-changed':
                this.updateCurrentTrack(data.track);
                break;
                
            case 'mix-transition':
                this.showMixTransition(data);
                break;
                
            case 'ai-insight':
                this.updateAIInsights(data);
                break;
                
            case 'spotify-refreshed':
                this.updateSpotifyStatus(true, data.userInfo);
                this.showNotification('✨ Spotify connection refreshed');
                break;
                
            case 'spotify-disconnected':
                this.updateSpotifyStatus(false);
                this.showNotification('👋 Disconnected from Spotify');
                break;
                
            case 'error':
                this.showNotification(`❌ ${data.message}`, 'error');
                break;
        }
    }

    initEventListeners() {
        // Playback controls
        document.getElementById('play-btn').addEventListener('click', () => {
            this.sendCommand('play');
        });
        
        document.getElementById('pause-btn').addEventListener('click', () => {
            this.sendCommand('pause');
        });
        
        document.getElementById('next-btn').addEventListener('click', () => {
            this.sendCommand('next');
        });
        
        document.getElementById('mix-btn').addEventListener('click', () => {
            this.toggleAutoMix();
        });

        // Search functionality
        this.initSearchFeatures();

        // Effects
        document.querySelectorAll('.effect-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.toggleEffect(btn.dataset.effect);
            });
        });

        // Crossfader
        document.getElementById('crossfader').addEventListener('input', (e) => {
            this.updateCrossfader(e.target.value);
        });

        // Song requests
        document.getElementById('request-btn').addEventListener('click', () => {
            this.submitSongRequest();
        });
        
        document.getElementById('song-request').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.submitSongRequest();
            }
        });

        // Smart suggestions
        document.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.submitSongRequest(btn.dataset.request);
            });
        });

        // Queue controls
        document.getElementById('clear-queue').addEventListener('click', () => {
            this.clearQueue();
        });
        
        document.getElementById('shuffle-queue').addEventListener('click', () => {
            this.shuffleQueue();
        });

        // AI controls
        document.getElementById('ai-takeover').addEventListener('click', () => {
            this.enableAITakeover();
        });
        
        document.getElementById('ai-suggest').addEventListener('click', () => {
            this.getAISuggestion();
        });

        // Manual add song
        document.getElementById('manual-add-btn').addEventListener('click', () => {
            this.showManualAddDialog();
        });

        // Smart queue
        document.getElementById('smart-queue-btn').addEventListener('click', () => {
            this.generateSmartQueue();
        });
    }

    sendCommand(command, data = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: command,
                ...data
            }));
        }
    }

    checkAuthStatus() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('authenticated') === 'true') {
            this.hideConnectionPanel();
            
            // Parse user info if available
            const userParam = urlParams.get('user');
            let userInfo = null;
            if (userParam) {
                try {
                    userInfo = JSON.parse(decodeURIComponent(userParam));
                } catch (e) {
                    console.error('Failed to parse user info:', e);
                }
            }
            
            this.updateSpotifyStatus(true, userInfo);
            this.showNotification(`🎧 Welcome to MewDJ${userInfo?.display_name ? ', ' + userInfo.display_name : ''}!`);
            
            // Clear URL params
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (urlParams.get('error')) {
            this.showNotification('❌ Spotify connection failed', 'error');
        }
    }

    hideConnectionPanel() {
        document.getElementById('connection-panel').style.display = 'none';
    }

    updateConnectionStatus(connected) {
        this.isConnected = connected;
        // Update UI connection indicators
    }

    updateSpotifyStatus(connected, userInfo = null) {
        const statusEl = document.getElementById('spotify-status');
        const tooltip = document.getElementById('spotify-tooltip');
        
        if (connected) {
            statusEl.innerHTML = `✅ Spotify Connected
                <div class="spotify-status-tooltip" id="spotify-tooltip">
                    <div class="spotify-user-info">
                        <img id="user-avatar" src="${userInfo?.images?.[0]?.url || 'https://via.placeholder.com/40x40?text=User'}" alt="User">
                        <div class="spotify-user-details">
                            <h4 id="user-name">${userInfo?.display_name || 'Spotify User'}</h4>
                            <p id="user-subscription">${userInfo?.product === 'premium' ? 'Spotify Premium ✨' : 'Spotify Free'}</p>
                        </div>
                    </div>
                    <div class="spotify-actions">
                        <button class="tooltip-btn refresh" onclick="aidj.refreshSpotifyConnection()">🔄 Refresh</button>
                        <button class="tooltip-btn signout" onclick="aidj.signOutSpotify()">🚪 Sign Out</button>
                    </div>
                </div>`;
            statusEl.style.color = '#a855f7';
            statusEl.style.animation = 'psychic-pulse 2s ease-in-out infinite';
            
            // Fetch user info if not provided
            if (!userInfo) {
                this.fetchSpotifyUserInfo();
            }
        } else {
            statusEl.innerHTML = '❌ Not Connected';
            statusEl.style.color = '#ef4444';
            statusEl.style.animation = 'none';
        }
    }
    
    async fetchSpotifyUserInfo() {
        try {
            const response = await fetch('/api/spotify/me');
            if (response.ok) {
                const userInfo = await response.json();
                this.updateSpotifyStatus(true, userInfo);
            }
        } catch (error) {
            console.error('Failed to fetch user info:', error);
        }
    }
    
    refreshSpotifyConnection() {
        this.showNotification('🔄 Refreshing Spotify connection...');
        this.sendCommand('refresh-spotify');
    }
    
    signOutSpotify() {
        if (confirm('Sign out of Spotify? You\'ll need to reconnect to continue DJing.')) {
            this.sendCommand('spotify-signout');
            this.updateSpotifyStatus(false);
            this.showNotification('👋 Signed out of Spotify');
            
            // Show connection modal after a delay
            setTimeout(() => {
                document.getElementById('connection-panel').style.display = 'flex';
            }, 1500);
        }
    }

    updateDJState(state) {
        this.isPlaying = state.isPlaying;
        
        // Update play/pause buttons
        const playBtn = document.getElementById('play-btn');
        const pauseBtn = document.getElementById('pause-btn');
        
        if (this.isPlaying) {
            playBtn.style.opacity = '0.5';
            pauseBtn.style.opacity = '1';
        } else {
            playBtn.style.opacity = '1';
            pauseBtn.style.opacity = '0.5';
        }
    }

    updateCurrentTrack(track) {
        this.currentTrack = track;
        
        if (track) {
            document.getElementById('current-artwork').src = track.album?.images?.[0]?.url || 'https://via.placeholder.com/200x200?text=No+Image';
            document.getElementById('current-title').textContent = track.name;
            document.getElementById('current-artist').textContent = track.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
            
            // Update track stats (these would come from audio analysis)
            document.getElementById('current-bpm').textContent = track.bpm || '--';
            document.getElementById('current-key').textContent = track.key || '--';
            document.getElementById('current-energy').textContent = track.energy ? Math.round(track.energy * 100) + '%' : '--';
        }
    }

    updateQueue(queue) {
        this.queue = queue;
        const queueList = document.getElementById('queue-list');
        
        if (queue.length === 0) {
            queueList.innerHTML = '<p class="empty-queue">Queue is empty</p>';
            return;
        }
        
        queueList.innerHTML = queue.map((item, index) => `
            <div class="queue-item" data-index="${index}">
                <img src="${item.track?.album?.images?.[2]?.url || 'https://via.placeholder.com/50x50'}" alt="Track">
                <div class="queue-item-info">
                    <h4>${item.track?.name || 'Unknown Track'}</h4>
                    <p>${item.track?.artists?.map(a => a.name).join(', ') || 'Unknown Artist'}</p>
                </div>
                <div class="queue-item-stats">
                    <div>BPM: ${Math.round(item.analysis?.bpm || 0)}</div>
                    <div>Key: ${item.analysis?.key || '--'}</div>
                    <div>Energy: ${Math.round((item.analysis?.energy || 0) * 100)}%</div>
                </div>
                <button onclick="aidj.removeFromQueue(${index})" class="remove-btn">❌</button>
            </div>
        `).join('');
        
        // Update next track display
        if (queue.length > 0) {
            const nextTrack = queue[0];
            document.getElementById('next-track-info').innerHTML = `
                <h4>${nextTrack.track?.name}</h4>
                <p>${nextTrack.track?.artists?.map(a => a.name).join(', ')}</p>
                <div class="track-stats">
                    <span>BPM: ${Math.round(nextTrack.analysis?.bpm || 0)}</span>
                    <span>Key: ${nextTrack.analysis?.key || '--'}</span>
                </div>
            `;
        }
    }

    submitSongRequest(customRequest) {
        const requestInput = document.getElementById('song-request');
        const request = customRequest || requestInput.value.trim();
        
        if (!request) {
            this.showNotification('⚠️ Please enter a song or mood request', 'error');
            return;
        }
        
        // Hide suggestions when submitting
        this.hideSuggestions();
        
        this.sendCommand('request-song', { request });
        
        if (!customRequest) {
            requestInput.value = '';
        }
        
        // Show different messages based on request type
        const isNaturalLanguage = /^(play something|give me|i want|mood|feel like|vibe)/i.test(request.trim());
        const message = isNaturalLanguage ? 
            `🧠 Finding perfect match for: "${request}"` :
            `🎵 Adding to queue: "${request}"`;
            
        this.showNotification(message);
    }

    toggleEffect(effectName) {
        const btn = document.querySelector(`[data-effect="${effectName}"]`);
        const isActive = btn.classList.contains('active');
        
        // Remove active state from all effect buttons
        document.querySelectorAll('.effect-btn').forEach(b => b.classList.remove('active'));
        
        if (!isActive) {
            btn.classList.add('active');
            this.sendCommand('apply-effect', { effect: effectName, enabled: true });
            this.showNotification(`🎛️ ${effectName.toUpperCase()} ON`);
        } else {
            this.sendCommand('apply-effect', { effect: effectName, enabled: false });
            this.showNotification(`🎛️ ${effectName.toUpperCase()} OFF`);
        }
    }

    updateCrossfader(value) {
        // Send crossfader position to server for mixing
        this.sendCommand('crossfader', { position: value });
        
        // Visual feedback
        const crossfader = document.getElementById('crossfader');
        if (value < 30) {
            crossfader.style.background = 'linear-gradient(90deg, #ff6b35 0%, #ff6b35 30%, #333 50%, #333 100%)';
        } else if (value > 70) {
            crossfader.style.background = 'linear-gradient(90deg, #333 0%, #333 50%, #f7931e 70%, #f7931e 100%)';
        } else {
            crossfader.style.background = 'linear-gradient(90deg, #ff6b35 0%, #333 50%, #f7931e 100%)';
        }
    }

    toggleAutoMix() {
        const mixBtn = document.getElementById('mix-btn');
        const isAutoMix = mixBtn.classList.contains('active');
        
        if (isAutoMix) {
            mixBtn.classList.remove('active');
            mixBtn.textContent = '🎛️ AUTO MIX';
            this.sendCommand('set-mix-mode', { mode: 'manual' });
            this.showNotification('🤲 Manual mixing mode');
        } else {
            mixBtn.classList.add('active');
            mixBtn.textContent = '🤖 AI MIXING';
            this.sendCommand('set-mix-mode', { mode: 'auto' });
            this.showNotification('🧠 AI mixing enabled');
        }
    }

    clearQueue() {
        if (confirm('Clear entire queue?')) {
            this.sendCommand('clear-queue');
            this.showNotification('🗑️ Queue cleared');
        }
    }

    shuffleQueue() {
        this.sendCommand('shuffle-queue');
        this.showNotification('🔀 Queue shuffled');
    }

    removeFromQueue(index) {
        this.sendCommand('remove-from-queue', { index });
    }

    enableAITakeover() {
        const takeoverBtn = document.getElementById('ai-takeover');
        const isActive = takeoverBtn.classList.contains('active');
        
        if (isActive) {
            takeoverBtn.classList.remove('active');
            takeoverBtn.textContent = '🧠 Let AI Take Over';
            this.sendCommand('ai-takeover', { enabled: false });
            this.showNotification('🤲 Manual control resumed');
        } else {
            takeoverBtn.classList.add('active');
            takeoverBtn.textContent = '🤖 AI IN CONTROL';
            this.sendCommand('ai-takeover', { enabled: true });
            this.showNotification('🧠 AI has taken control');
        }
    }

    getAISuggestion() {
        this.sendCommand('get-ai-suggestion');
        this.showNotification('🤔 AI is thinking...');
    }

    generateSmartQueue() {
        this.sendCommand('generate-smart-queue');
        this.showNotification('🧠 Generating smart queue...');
    }

    initSearchFeatures() {
        const searchInput = document.getElementById('song-request');
        const suggestionsContainer = document.getElementById('search-suggestions');
        
        let searchTimeout = null;
        let selectedIndex = -1;
        let currentSuggestions = [];

        // Debounced search as user types
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            
            clearTimeout(searchTimeout);
            selectedIndex = -1;

            if (query.length < 2) {
                this.hideSuggestions();
                return;
            }

            // Show loading state
            suggestionsContainer.innerHTML = '<div class="search-loading">🔍 Searching...</div>';
            suggestionsContainer.classList.add('show');

            // Debounce search requests
            searchTimeout = setTimeout(() => {
                this.searchSpotifyTracks(query);
            }, 300);
        });

        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            const suggestions = document.querySelectorAll('.suggestion-item');
            
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
                    this.updateSelectedSuggestion();
                    break;
                    
                case 'ArrowUp':
                    e.preventDefault();
                    selectedIndex = Math.max(selectedIndex - 1, -1);
                    this.updateSelectedSuggestion();
                    break;
                    
                case 'Enter':
                    e.preventDefault();
                    if (selectedIndex >= 0 && currentSuggestions[selectedIndex]) {
                        this.selectSuggestion(currentSuggestions[selectedIndex]);
                    } else {
                        this.submitSongRequest();
                    }
                    break;
                    
                case 'Escape':
                    this.hideSuggestions();
                    searchInput.blur();
                    break;
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
                this.hideSuggestions();
            }
        });

        // Focus input shows recent suggestions if any
        searchInput.addEventListener('focus', () => {
            if (currentSuggestions.length > 0 && searchInput.value.trim().length >= 2) {
                suggestionsContainer.classList.add('show');
            }
        });
    }

    async searchSpotifyTracks(query) {
        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query, limit: 8 })
            });

            if (!response.ok) {
                throw new Error('Search failed');
            }

            const data = await response.json();
            currentSuggestions = data.tracks?.items || [];
            
            this.displaySuggestions(currentSuggestions);
        } catch (error) {
            console.error('Search error:', error);
            document.getElementById('search-suggestions').innerHTML = 
                '<div class="search-no-results">⚠️ Search failed. Try again.</div>';
        }
    }

    displaySuggestions(tracks) {
        const suggestionsContainer = document.getElementById('search-suggestions');
        
        if (tracks.length === 0) {
            suggestionsContainer.innerHTML = '<div class="search-no-results">🎵 No tracks found</div>';
            return;
        }

        const html = tracks.map((track, index) => {
            const duration = this.formatDuration(track.duration_ms);
            const imageUrl = track.album?.images?.[2]?.url || 'https://via.placeholder.com/40x40?text=♪';
            
            return `
                <div class="suggestion-item" data-index="${index}">
                    <img src="${imageUrl}" alt="Album" class="suggestion-artwork">
                    <div class="suggestion-info">
                        <p class="suggestion-title">${this.escapeHtml(track.name)}</p>
                        <p class="suggestion-artist">${this.escapeHtml(track.artists?.map(a => a.name).join(', ') || 'Unknown Artist')}</p>
                    </div>
                    <div class="suggestion-duration">${duration}</div>
                </div>
            `;
        }).join('');

        suggestionsContainer.innerHTML = html;
        suggestionsContainer.classList.add('show');

        // Add click listeners to suggestions
        document.querySelectorAll('.suggestion-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                this.selectSuggestion(tracks[index]);
            });
        });
    }

    updateSelectedSuggestion() {
        document.querySelectorAll('.suggestion-item').forEach((item, index) => {
            item.classList.toggle('selected', index === selectedIndex);
        });
    }

    selectSuggestion(track) {
        const searchInput = document.getElementById('song-request');
        searchInput.value = `${track.name} by ${track.artists?.[0]?.name || 'Unknown'}`;
        
        this.hideSuggestions();
        
        // Auto-submit the selected track
        this.submitSongRequest();
    }

    hideSuggestions() {
        document.getElementById('search-suggestions').classList.remove('show');
        selectedIndex = -1;
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showManualAddDialog() {
        const query = prompt('Search for a song:');
        if (query) {
            this.searchAndAddTrack(query);
        }
    }

    async searchAndAddTrack(query) {
        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query })
            });
            
            const data = await response.json();
            
            if (data.tracks && data.tracks.items.length > 0) {
                const track = data.tracks.items[0]; // Take first result
                
                const addResponse = await fetch('/api/queue-track', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ trackId: track.id })
                });
                
                if (addResponse.ok) {
                    this.showNotification(`➕ Added: ${track.name}`);
                }
            } else {
                this.showNotification('❌ No tracks found', 'error');
            }
        } catch (error) {
            console.error('Search error:', error);
            this.showNotification('❌ Search failed', 'error');
        }
    }

    updateAIInsights(insights) {
        if (insights.crowdEnergy) {
            document.getElementById('crowd-energy').textContent = insights.crowdEnergy;
        }
        if (insights.mixStrategy) {
            document.getElementById('mix-strategy').textContent = insights.mixStrategy;
        }
        if (insights.nextMove) {
            document.getElementById('next-move').textContent = insights.nextMove;
        }
    }

    showMixTransition(transition) {
        // Visual feedback for transitions
        const overlay = document.createElement('div');
        overlay.className = 'transition-overlay';
        overlay.innerHTML = `
            <div class="transition-info">
                <h3>🎛️ ${transition.type}</h3>
                <p>${transition.description}</p>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            overlay.remove();
        }, 3000);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: ${type === 'error' ? 'rgba(244, 67, 54, 0.9)' : 'rgba(255, 107, 53, 0.9)'};
            color: white;
            border-radius: 25px;
            font-weight: bold;
            z-index: 1001;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .transition-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1002;
        animation: fadeIn 0.5s ease;
    }
    
    .transition-info {
        text-align: center;
        color: white;
        background: linear-gradient(45deg, #ff6b35, #f7931e);
        padding: 40px;
        border-radius: 20px;
        border: 2px solid #ffd700;
        box-shadow: 0 0 50px rgba(255, 107, 53, 0.5);
    }
    
    .transition-info h3 {
        font-size: 2rem;
        margin-bottom: 10px;
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    
    .remove-btn {
        background: none;
        border: none;
        color: #ff4444;
        cursor: pointer;
        font-size: 1.2rem;
        padding: 5px;
        border-radius: 50%;
        transition: all 0.3s ease;
    }
    
    .remove-btn:hover {
        background: rgba(244, 67, 54, 0.2);
        transform: scale(1.1);
    }
`;
document.head.appendChild(style);

// Initialize the AI DJ
const aidj = new AIdjPro();