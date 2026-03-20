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
            this.updateSpotifyStatus(true);
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

    updateSpotifyStatus(connected) {
        const statusEl = document.getElementById('spotify-status');
        if (connected) {
            statusEl.textContent = '✅ Spotify Connected';
            statusEl.style.color = '#1db954';
        } else {
            statusEl.textContent = '❌ Not Connected';
            statusEl.style.color = '#ff4444';
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
        
        if (!request) return;
        
        this.sendCommand('request-song', { request });
        
        if (!customRequest) {
            requestInput.value = '';
        }
        
        this.showNotification(`🎵 Processing request: "${request}"`);
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