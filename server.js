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

        try {
            console.log(`📊 Analyzing track: ${trackId}`);
            const features = await this.apiCall(`/audio-features/${trackId}`);
            
            // Handle case where Spotify returns null for some tracks
            if (!features || !features.tempo) {
                console.log(`⚠️ No audio features available for ${trackId}, using defaults`);
                const defaultFeatures = {
                    tempo: 120,
                    key: 0,
                    energy: 0.5,
                    valence: 0.5,
                    danceability: 0.5,
                    acousticness: 0.5,
                    instrumentalness: 0.5,
                    speechiness: 0.5,
                    liveness: 0.5
                };
                djState.analysisCache.set(trackId, defaultFeatures);
                return defaultFeatures;
            }
            
            // Cache the analysis
            djState.analysisCache.set(trackId, features);
            usageStats.songsAnalyzed++;
            
            return features;
        } catch (error) {
            console.error(`❌ Failed to get audio features for ${trackId}:`, error);
            // Return default features instead of throwing
            const defaultFeatures = {
                tempo: 120,
                key: 0,
                energy: 0.5,
                valence: 0.5,
                danceability: 0.5,
                acousticness: 0.5,
                instrumentalness: 0.5,
                speechiness: 0.5,
                liveness: 0.5
            };
            djState.analysisCache.set(trackId, defaultFeatures);
            return defaultFeatures;
        }
    }

    async getDetailedAudioAnalysis(trackId) {
        const cacheKey = `analysis_${trackId}`;
        const cached = djState.analysisCache.get(cacheKey);
        if (cached) {
            console.log(`🎛️ Using cached detailed analysis for ${trackId}`);
            return cached;
        }

        try {
            console.log(`🎛️ Getting detailed audio analysis for: ${trackId}`);
            const analysis = await this.apiCall(`/audio-analysis/${trackId}`);
            
            if (!analysis || !analysis.sections) {
                console.log(`⚠️ No detailed analysis available for ${trackId}`);
                return null;
            }
            
            // Cache the detailed analysis
            djState.analysisCache.set(cacheKey, analysis);
            
            return analysis;
        } catch (error) {
            console.error(`❌ Failed to get detailed analysis for ${trackId}:`, error);
            return null;
        }
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

// MEW's DJ Intelligence - Makes Smart Song Decisions
class DJIntelligence {
    static analyzeSongStructure(audioFeatures, detailedAnalysis, duration_ms) {
        console.log('🧠 MEW is analyzing song structure...');
        
        const structure = {
            duration_ms,
            sections: [],
            recommendations: {}
        };

        if (detailedAnalysis && detailedAnalysis.sections) {
            // Use Spotify's detailed section analysis
            structure.sections = detailedAnalysis.sections.map(section => ({
                start: section.start,
                duration: section.duration,
                confidence: section.confidence,
                loudness: section.loudness,
                tempo: section.tempo,
                key: section.key,
                mode: section.mode,
                time_signature: section.time_signature
            }));
        } else {
            // Fallback: Create estimated sections based on audio features
            structure.sections = this.estimateSongSections(audioFeatures, duration_ms);
        }

        // Generate MEW's smart recommendations
        structure.recommendations = this.generateSmartRecommendations(audioFeatures, structure.sections, duration_ms);
        
        console.log(`✨ MEW found ${structure.sections.length} sections with smart entry/exit points`);
        return structure;
    }

    static estimateSongSections(audioFeatures, duration_ms) {
        // Estimate song structure based on common patterns
        const duration_s = duration_ms / 1000;
        const sections = [];
        
        // Typical song structure estimation
        const introEnd = Math.min(30, duration_s * 0.15); // 15% or 30s max
        const verseStart = introEnd;
        const chorusStart = duration_s * 0.35;
        const bridgeStart = duration_s * 0.65;
        const outroStart = Math.max(duration_s * 0.85, duration_s - 30);
        
        sections.push({
            start: 0,
            duration: introEnd,
            section_type: 'intro',
            energy: audioFeatures.energy * 0.6 // Intros usually lower energy
        });
        
        sections.push({
            start: verseStart,
            duration: chorusStart - verseStart,
            section_type: 'verse',
            energy: audioFeatures.energy * 0.8
        });
        
        sections.push({
            start: chorusStart,
            duration: bridgeStart - chorusStart,
            section_type: 'chorus',
            energy: audioFeatures.energy // Peak energy
        });
        
        sections.push({
            start: bridgeStart,
            duration: outroStart - bridgeStart,
            section_type: 'bridge',
            energy: audioFeatures.energy * 0.7
        });
        
        sections.push({
            start: outroStart,
            duration: duration_s - outroStart,
            section_type: 'outro',
            energy: audioFeatures.energy * 0.4 // Outros fade out
        });
        
        return sections;
    }

    static generateSmartRecommendations(audioFeatures, sections, duration_ms) {
        const duration_s = duration_ms / 1000;
        const recommendations = {
            ideal_start: 0,
            ideal_end: duration_s,
            best_mix_out: duration_s * 0.8,
            best_mix_in: duration_s * 0.2,
            hot_cues: [],
            play_duration: duration_s,
            energy_peak: duration_s * 0.5,
            cut_recommendations: []
        };

        // Analyze energy and danceability to make smart decisions
        const energy = audioFeatures.energy;
        const danceability = audioFeatures.danceability;
        const instrumentalness = audioFeatures.instrumentalness;
        const speechiness = audioFeatures.speechiness;

        // Smart start point
        if (energy > 0.7 && danceability > 0.6) {
            // High energy track - can start earlier
            recommendations.ideal_start = Math.min(15, duration_s * 0.1);
        } else if (speechiness > 0.4) {
            // Vocal track - respect the intro
            recommendations.ideal_start = Math.min(20, duration_s * 0.15);
        } else {
            // Standard intro skip
            recommendations.ideal_start = Math.min(25, duration_s * 0.2);
        }

        // Smart end point based on song structure
        if (energy > 0.8) {
            // High energy - can play longer without getting boring
            recommendations.ideal_end = Math.max(duration_s * 0.9, duration_s - 20);
            recommendations.play_duration = recommendations.ideal_end - recommendations.ideal_start;
        } else if (energy < 0.4) {
            // Low energy - cut shorter to maintain flow
            recommendations.ideal_end = Math.min(duration_s * 0.75, recommendations.ideal_start + 120); // Max 2 minutes
            recommendations.play_duration = recommendations.ideal_end - recommendations.ideal_start;
        } else {
            // Medium energy - standard length
            recommendations.ideal_end = Math.max(duration_s * 0.85, duration_s - 25);
            recommendations.play_duration = recommendations.ideal_end - recommendations.ideal_start;
        }

        // Best mix points
        recommendations.best_mix_out = recommendations.ideal_end - 15; // Start mixing out 15s before cut
        recommendations.best_mix_in = recommendations.ideal_start + 10; // Mix in 10s after start

        // Generate hot cue points for key moments
        sections.forEach((section, index) => {
            if (section.section_type === 'chorus') {
                recommendations.hot_cues.push({
                    name: `Chorus ${Math.floor(index/2) + 1}`,
                    time: section.start,
                    type: 'chorus'
                });
            } else if (section.section_type === 'bridge') {
                recommendations.hot_cues.push({
                    name: 'Bridge/Break',
                    time: section.start,
                    type: 'breakdown'
                });
            }
        });

        // Add energy peak cue
        recommendations.hot_cues.push({
            name: 'Energy Peak',
            time: recommendations.ideal_start + (recommendations.play_duration * 0.6),
            type: 'peak'
        });

        // Cut recommendations for DJ flow
        if (duration_s > 180) { // Songs longer than 3 minutes
            recommendations.cut_recommendations.push('Consider cutting outro to maintain energy');
        }
        if (recommendations.ideal_start > 20) {
            recommendations.cut_recommendations.push('Skip intro for better energy flow');
        }
        if (energy < 0.4 && duration_s > 150) {
            recommendations.cut_recommendations.push('Cut short - low energy track');
        }

        return recommendations;
    }

    static calculateTransitionStrategy(fromTrack, toTrack) {
        console.log('🎛️ MEW is planning legendary transition strategy...');
        
        if (!fromTrack.structure || !toTrack.structure) {
            return this.basicTransitionStrategy(fromTrack, toTrack);
        }

        const strategy = {
            from_cut_point: fromTrack.structure.recommendations.best_mix_out,
            to_start_point: toTrack.structure.recommendations.best_mix_in,
            crossfade_duration: 8000,
            effects: [],
            technique: 'crossfade',
            energy_flow: 'maintain'
        };

        // Analyze energy change
        const energyDiff = toTrack.energy - fromTrack.energy;
        
        if (energyDiff > 0.2) {
            // Building energy
            strategy.energy_flow = 'build';
            strategy.effects.push('filter_sweep', 'reverb_tail');
            strategy.technique = 'energy_build';
            strategy.crossfade_duration = 6000; // Faster transition for energy build
        } else if (energyDiff < -0.2) {
            // Dropping energy
            strategy.energy_flow = 'drop';
            strategy.effects.push('echo_out', 'low_pass_filter');
            strategy.technique = 'energy_drop';
            strategy.crossfade_duration = 10000; // Longer transition for energy drop
        } else {
            // Maintaining energy
            strategy.energy_flow = 'maintain';
            strategy.effects.push('subtle_filter');
            strategy.crossfade_duration = 8000;
        }

        // BPM considerations
        const bpmDiff = Math.abs(fromTrack.bpm - toTrack.bpm);
        if (bpmDiff > 20) {
            strategy.effects.push('tempo_adjust');
            strategy.crossfade_duration += 2000; // Longer for difficult BPM changes
        }

        console.log(`✨ Transition strategy: ${strategy.technique} (${strategy.crossfade_duration/1000}s) with ${strategy.effects.length} effects`);
        return strategy;
    }

    static basicTransitionStrategy(fromTrack, toTrack) {
        return {
            from_cut_point: (fromTrack.duration || 180) * 0.8,
            to_start_point: 15,
            crossfade_duration: 8000,
            effects: ['basic_crossfade'],
            technique: 'basic',
            energy_flow: 'maintain'
        };
    }
}

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
        
        if (!track || !track.id) {
            return res.status(400).json({ error: 'Invalid track data' });
        }
        
        console.log(`➕ Adding to queue: ${track.name} by ${track.artist}`);
        
        // Get basic audio analysis
        const analysis = await spotify.getAudioFeatures(track.id);
        
        // Get detailed analysis for DJ intelligence
        console.log('🧠 MEW is analyzing song structure for legendary DJ decisions...');
        const detailedAnalysis = await spotify.getDetailedAudioAnalysis(track.id);
        
        // Generate MEW's DJ intelligence recommendations
        const structure = DJIntelligence.analyzeSongStructure(analysis, detailedAnalysis, track.duration);
        
        const queueItem = {
            ...track,
            analysis,
            structure, // MEW's smart DJ recommendations
            bpm: Math.round(analysis.tempo || 120),
            key: SmartQueue.getKeyName(analysis.key || 0),
            energy: Math.round((analysis.energy || 0.5) * 100),
            valence: Math.round((analysis.valence || 0.5) * 100),
            addedAt: Date.now(),
            // MEW's smart cut points
            smart_start: structure.recommendations.ideal_start,
            smart_end: structure.recommendations.ideal_end,
            play_duration: structure.recommendations.play_duration,
            hot_cues: structure.recommendations.hot_cues
        };
        
        djState.queue.push(queueItem);
        
        console.log(`✅ Successfully added: ${track.name} (${queueItem.bpm} BPM, ${queueItem.key} key)`);
        
        // Broadcast update
        broadcast({ type: 'queue-update', queue: djState.queue });
        
        res.json({ success: true, item: queueItem, queueLength: djState.queue.length });
        
    } catch (error) {
        console.error('🚨 Add to queue error:', {
            error: error.message,
            stack: error.stack?.split('\n')[0],
            track: req.body?.track?.name
        });
        
        // More specific error messages
        if (error.message.includes('token')) {
            res.status(401).json({ error: 'Spotify connection expired. Please reconnect.' });
        } else {
            res.status(500).json({ error: `Failed to add song: ${error.message}` });
        }
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

// Update queue (sync client changes)
app.post('/api/update-queue', (req, res) => {
    try {
        const { queue } = req.body;
        console.log('🔄 Syncing queue from client:', queue?.length || 0, 'tracks');
        
        djState.queue = queue || [];
        
        // Broadcast to other clients
        broadcast({ type: 'queue-update', queue: djState.queue });
        
        res.json({ success: true, queueLength: djState.queue.length });
    } catch (error) {
        console.error('Update queue error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Clear queue
app.post('/api/clear-queue', (req, res) => {
    console.log('🗑️ Clearing entire queue');
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

// Transfer playback to specific device
app.post('/api/transfer-playback', async (req, res) => {
    try {
        const { deviceId } = req.body;
        
        console.log('🔄 Transferring playback to device:', deviceId);
        
        await spotify.apiCall('/me/player', {
            method: 'PUT',
            body: JSON.stringify({
                device_ids: [deviceId],
                play: false
            })
        });
        
        console.log('✅ Playback transferred successfully');
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ Transfer playback error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Play specific track on device
app.post('/api/play-track', async (req, res) => {
    try {
        const { trackUri, deviceId } = req.body;
        
        console.log('🎵 Play track request received:');
        console.log('  - Track URI:', trackUri);
        console.log('  - Device ID:', deviceId);
        console.log('  - Spotify token exists:', !!spotify.token);

        if (!trackUri || !deviceId) {
            return res.status(400).json({ error: 'Missing trackUri or deviceId' });
        }

        if (!spotify.token) {
            return res.status(401).json({ error: 'No Spotify token available' });
        }
        
        // Play the specific track on the specific device
        const playResponse = await spotify.apiCall(`/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            body: JSON.stringify({
                uris: [trackUri]
            })
        });
        
        console.log('✅ Track started successfully on MEW device');
        res.json({ success: true, message: 'Track playing from MEW queue' });
        
    } catch (error) {
        console.error('❌ Play track error:', {
            message: error.message,
            trackUri: req.body?.trackUri,
            deviceId: req.body?.deviceId
        });

        if (error.message.includes('token')) {
            res.status(401).json({ error: 'Spotify connection expired. Please reconnect.' });
        } else {
            res.status(500).json({ error: `Failed to play track: ${error.message}` });
        }
    }
});

// Play track with MEW's smart timing
app.post('/api/play-track-smart', async (req, res) => {
    try {
        const { trackUri, deviceId, startTime, endTime } = req.body;
        
        console.log('🧠 MEW is starting track with legendary timing:');
        console.log(`  - Track: ${trackUri}`);
        console.log(`  - Start: ${startTime}s (skipping ${startTime}s of intro)`);
        console.log(`  - End: ${endTime}s (cutting ${((parseInt(req.body.duration) || 180) - endTime)}s of outro)`);
        
        if (!trackUri || !deviceId) {
            return res.status(400).json({ error: 'Missing trackUri or deviceId' });
        }

        // Play track starting at smart start point
        await spotify.apiCall(`/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            body: JSON.stringify({
                uris: [trackUri],
                position_ms: Math.floor(startTime * 1000) // Convert to milliseconds
            })
        });
        
        console.log('✨ Track started with MEW\'s perfect timing!');
        
        // Schedule automatic transition at end point
        const playDuration = (endTime - startTime) * 1000; // Convert to ms
        setTimeout(() => {
            console.log('🎛️ MEW says it\'s time to transition - track at perfect cut point');
            // Broadcast transition signal
            broadcast({
                type: 'smart-transition-ready',
                message: 'MEW detected perfect transition point',
                track: trackUri
            });
        }, playDuration - 10000); // Signal 10 seconds before cut
        
        res.json({ 
            success: true, 
            message: 'Track playing with MEW\'s legendary timing',
            play_duration: playDuration / 1000,
            smart_timing: true
        });
        
    } catch (error) {
        console.error('❌ Smart play error:', error);
        res.status(500).json({ error: `Failed to play with smart timing: ${error.message}` });
    }
});

// Get detailed DJ analysis for a track
app.get('/api/dj-analysis/:trackId', async (req, res) => {
    try {
        const { trackId } = req.params;
        console.log('🧠 Getting MEW\'s DJ analysis for:', trackId);
        
        // Get both basic and detailed analysis
        const [features, detailedAnalysis] = await Promise.all([
            spotify.getAudioFeatures(trackId),
            spotify.getDetailedAudioAnalysis(trackId)
        ]);
        
        // Get track info for duration
        const track = await spotify.apiCall(`/tracks/${trackId}`);
        
        // Generate MEW's DJ intelligence
        const structure = DJIntelligence.analyzeSongStructure(features, detailedAnalysis, track.duration_ms);
        
        res.json({
            success: true,
            track_id: trackId,
            basic_features: features,
            dj_structure: structure,
            smart_recommendations: structure.recommendations
        });
        
    } catch (error) {
        console.error('❌ DJ analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Test audio features endpoint
app.get('/api/test-audio-features/:trackId', async (req, res) => {
    try {
        const { trackId } = req.params;
        console.log('🧪 Testing audio features for:', trackId);
        
        const features = await spotify.getAudioFeatures(trackId);
        console.log('🧪 Audio features result:', features);
        
        res.json({ success: true, features });
    } catch (error) {
        console.error('🚨 Audio features test error:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
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