const express = require('express');
const path = require('path');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://mewdj.onrender.com/callback';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// DJ State - Simple and Clean
let djState = {
    currentTrack: null,
    queue: [],
    isPlaying: false,
    accessToken: null,
    analysisCache: new Map() // Cache song analysis to avoid repeated API calls
};

// Usage Statistics
let usageStats = {
    spotifyAPICalls: 0,
    songsAnalyzed: 0,
    queueOptimizations: 0,
    renderHours: 0,
    startTime: Date.now(),
    sessionsToday: 0,
    lastReset: new Date().toDateString()
};

console.log('🎵 DJ MEW v2.0 - Smart Queue Master Starting...');
console.log('🔑 Spotify Client ID:', CLIENT_ID ? 'Configured ✅' : 'Missing ❌');
console.log('🔗 Redirect URI:', REDIRECT_URI);

// Spotify API Helper Class - Clean and Reliable
class SpotifyAPI {
    constructor() {
        this.token = null;
        this.baseUrl = 'https://api.spotify.com/v1';
    }

    async authenticate(code) {
        console.log('🔐 Authenticating with Spotify...');
        
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI
            })
        });

        if (!response.ok) {
            throw new Error(`Authentication failed: ${response.status}`);
        }

        const data = await response.json();
        this.token = data.access_token;
        djState.accessToken = this.token;
        
        console.log('✅ Spotify authentication successful');
        return data;
    }

    async apiCall(endpoint, options = {}) {
        if (!this.token) {
            throw new Error('No Spotify token available');
        }

        const response = await fetch(this.baseUrl + endpoint, {
            ...options,
            headers: {
                'Authorization': 'Bearer ' + this.token,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        // Track API usage
        usageStats.spotifyAPICalls++;
        
        if (!response.ok) {
            if (response.status === 401) {
                this.token = null;
                djState.accessToken = null;
                throw new Error('Spotify token expired. Please reconnect.');
            }
            throw new Error(`Spotify API error: ${response.status}`);
        }

        const text = await response.text();
        return text ? JSON.parse(text) : {};
    }

    async searchTracks(query, limit = 20) {
        console.log(`🔍 Searching for: "${query}"`);
        const response = await this.apiCall(`/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`);
        return response.tracks.items;
    }

    async getAudioFeatures(trackId) {
        const cached = djState.analysisCache.get(trackId);
        if (cached) {
            console.log(`📊 Using cached analysis for ${trackId}`);
            return cached;
        }

        console.log(`📊 Analyzing track: ${trackId}`);
        const features = await this.apiCall(`/audio-features/${trackId}`);
        
        // Cache the analysis
        djState.analysisCache.set(trackId, features);
        usageStats.songsAnalyzed++;
        
        return features;
    }

    async getMultipleAudioFeatures(trackIds) {
        const idsString = trackIds.join(',');
        const response = await this.apiCall(`/audio-features?ids=${idsString}`);
        return response.audio_features;
    }

    async getUserInfo() {
        return await this.apiCall('/me');
    }
}

const spotify = new SpotifyAPI();

// Music Analysis & Smart Queue Management
class SmartQueue {
    static analyzeCompatibility(track1Features, track2Features) {
        if (!track1Features || !track2Features) return 0;

        let score = 0;
        
        // BPM compatibility (closer BPMs = higher score)
        const bpmDiff = Math.abs(track1Features.tempo - track2Features.tempo);
        const bpmScore = Math.max(0, 100 - (bpmDiff / 2)); // Within 2 BPM = perfect score
        score += bpmScore * 0.3;

        // Key compatibility (using circle of fifths)
        const keyScore = this.getKeyCompatibility(track1Features.key, track2Features.key);
        score += keyScore * 0.25;

        // Energy flow (gradual changes preferred)
        const energyDiff = Math.abs(track1Features.energy - track2Features.energy);
        const energyScore = Math.max(0, 100 - (energyDiff * 100));
        score += energyScore * 0.25;

        // Valence (mood) compatibility
        const valenceDiff = Math.abs(track1Features.valence - track2Features.valence);
        const valenceScore = Math.max(0, 100 - (valenceDiff * 100));
        score += valenceScore * 0.2;

        return Math.round(score);
    }

    static getKeyCompatibility(key1, key2) {
        // Simplified key compatibility (circle of fifths)
        const keyMap = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]; // Circle of fifths
        const pos1 = keyMap.indexOf(key1);
        const pos2 = keyMap.indexOf(key2);
        
        if (pos1 === -1 || pos2 === -1) return 50; // Unknown key
        
        const distance = Math.min(Math.abs(pos1 - pos2), 12 - Math.abs(pos1 - pos2));
        return Math.max(0, 100 - (distance * 20)); // Adjacent keys = 80+ score
    }

    static optimizeQueue(queue) {
        if (queue.length <= 1) return queue;

        console.log('🧠 MEW is optimizing queue for perfect flow...');
        usageStats.queueOptimizations++;

        // Start with first track
        const optimized = [queue[0]];
        const remaining = queue.slice(1);

        while (remaining.length > 0) {
            const current = optimized[optimized.length - 1];
            let bestMatch = remaining[0];
            let bestScore = 0;

            // Find the best next track
            for (const candidate of remaining) {
                if (current.analysis && candidate.analysis) {
                    const score = this.analyzeCompatibility(current.analysis, candidate.analysis);
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = candidate;
                    }
                }
            }

            optimized.push(bestMatch);
            remaining.splice(remaining.indexOf(bestMatch), 1);
        }

        console.log('✨ Queue optimized for perfect transitions!');
        return optimized;
    }

    static getBPMColor(bpm) {
        if (bpm < 100) return '#64b5f6'; // Blue - Slow
        if (bpm < 120) return '#81c784'; // Green - Medium
        if (bpm < 140) return '#ffb74d'; // Orange - Fast
        return '#f06292'; // Pink - Very Fast
    }

    static getKeyName(key) {
        const keys = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
        return keys[key] || 'Unknown';
    }
}

// WebSocket for Real-time Updates
const server = app.listen(PORT, () => {
    console.log(`🎧 DJ MEW v2.0 running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('🎵 Client connected to DJ MEW');
    usageStats.sessionsToday++;
    
    // Send current state
    ws.send(JSON.stringify({
        type: 'state-update',
        state: djState,
        stats: usageStats
    }));

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📨 Received:', data.type);

            switch (data.type) {
                case 'play':
                    djState.isPlaying = true;
                    broadcast({ type: 'playback-update', isPlaying: true });
                    break;
                    
                case 'pause':
                    djState.isPlaying = false;
                    broadcast({ type: 'playback-update', isPlaying: false });
                    break;
                    
                case 'next':
                    if (djState.queue.length > 0) {
                        djState.currentTrack = djState.queue.shift();
                        broadcast({ type: 'track-changed', track: djState.currentTrack });
                        broadcast({ type: 'queue-update', queue: djState.queue });
                    }
                    break;
                    
                case 'optimize-queue':
                    djState.queue = SmartQueue.optimizeQueue(djState.queue);
                    broadcast({ type: 'queue-optimized', queue: djState.queue });
                    break;
            }
        } catch (error) {
            console.error('WebSocket error:', error);
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    });
});

function broadcast(message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Routes - Clean and Simple

// Spotify Authentication
app.get('/login', (req, res) => {
    const scopes = [
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-currently-playing',
        'playlist-read-private',
        'streaming',
        'user-read-email',
        'user-read-private'
    ].join(' ');

    const authUrl = 'https://accounts.spotify.com/authorize?' +
        new URLSearchParams({
            response_type: 'code',
            client_id: CLIENT_ID,
            scope: scopes,
            redirect_uri: REDIRECT_URI
        });

    console.log('🔗 Redirecting to Spotify login');
    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    
    try {
        await spotify.authenticate(code);
        const userInfo = await spotify.getUserInfo();
        
        console.log(`🎵 User connected: ${userInfo.display_name}`);
        
        res.redirect(`/?authenticated=true&user=${encodeURIComponent(JSON.stringify(userInfo))}`);
    } catch (error) {
        console.error('Authentication error:', error);
        res.redirect(`/?error=auth_failed&detail=${encodeURIComponent(error.message)}`);
    }
});

// API Endpoints - Simple and Reliable

// Search for tracks
app.post('/api/search', async (req, res) => {
    try {
        const { query, limit = 20 } = req.body;
        const tracks = await spotify.searchTracks(query, limit);
        
        // Add simplified info for frontend
        const results = tracks.map(track => ({
            id: track.id,
            name: track.name,
            artist: track.artists[0]?.name,
            album: track.album.name,
            image: track.album.images[0]?.url,
            duration: track.duration_ms,
            preview_url: track.preview_url
        }));
        
        res.json(results);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add track to queue with analysis
app.post('/api/add-to-queue', async (req, res) => {
    try {
        const { track } = req.body;
        
        // Get audio analysis for the track
        const analysis = await spotify.getAudioFeatures(track.id);
        
        const queueItem = {
            ...track,
            analysis,
            bpm: Math.round(analysis.tempo),
            key: SmartQueue.getKeyName(analysis.key),
            energy: Math.round(analysis.energy * 100),
            valence: Math.round(analysis.valence * 100),
            addedAt: Date.now()
        };
        
        djState.queue.push(queueItem);
        
        console.log(`➕ Added to queue: ${track.name} (${queueItem.bpm} BPM, ${queueItem.key} key)`);
        
        // Broadcast update
        broadcast({ type: 'queue-update', queue: djState.queue });
        
        res.json({ success: true, item: queueItem, queueLength: djState.queue.length });
    } catch (error) {
        console.error('Add to queue error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Optimize queue order
app.post('/api/optimize-queue', async (req, res) => {
    try {
        if (djState.queue.length <= 1) {
            return res.json({ message: 'Queue too short to optimize', queue: djState.queue });
        }
        
        const originalOrder = djState.queue.map(track => track.name);
        djState.queue = SmartQueue.optimizeQueue(djState.queue);
        const newOrder = djState.queue.map(track => track.name);
        
        console.log('🧠 Queue optimization complete');
        console.log('Before:', originalOrder);
        console.log('After:', newOrder);
        
        broadcast({ type: 'queue-optimized', queue: djState.queue });
        
        res.json({ 
            success: true, 
            message: 'MEW optimized your queue for perfect flow!',
            queue: djState.queue 
        });
    } catch (error) {
        console.error('Queue optimization error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Clear queue
app.post('/api/clear-queue', (req, res) => {
    djState.queue = [];
    broadcast({ type: 'queue-update', queue: djState.queue });
    res.json({ success: true });
});

// Get current state
app.get('/api/state', (req, res) => {
    res.json({
        ...djState,
        stats: usageStats
    });
});

// Get usage statistics
app.get('/api/usage-stats', (req, res) => {
    // Update render hours
    const uptimeHours = (Date.now() - usageStats.startTime) / (1000 * 60 * 60);
    usageStats.renderHours = uptimeHours;
    
    res.json(usageStats);
});

// User info
app.get('/api/user', async (req, res) => {
    try {
        if (!spotify.token) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const userInfo = await spotify.getUserInfo();
        res.json(userInfo);
    } catch (error) {
        console.error('User info error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Spotify token for Web Playback SDK
app.get('/api/spotify-token', (req, res) => {
    if (!spotify.token) {
        return res.status(401).json({ error: 'No token available' });
    }
    res.json({ access_token: spotify.token });
});

console.log('🔮 DJ MEW v2.0 - Smart Queue Master ready!');
console.log('✨ Features: Smart search, beat matching, intelligent queue optimization');
console.log('🎯 Focus: Reliability, music intelligence, perfect transitions');