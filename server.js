const express = require('express');
const WebSocket = require('ws');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Spotify API credentials (you'll set these in .env)
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';

// DJ State
let djState = {
    isPlaying: false,
    currentTrack: null,
    nextTrack: null,
    queue: [],
    accessToken: null,
    bpm: null,
    key: null,
    energy: null,
    mixingMode: 'auto' // auto, manual
};

class SpotifyAPI {
    constructor() {
        this.baseUrl = 'https://api.spotify.com/v1';
        this.token = null;
    }

    async authenticate(code) {
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
        
        const data = await response.json();
        this.token = data.access_token;
        djState.accessToken = this.token;
        return data;
    }

    async refreshToken(refreshToken) {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            })
        });
        
        const data = await response.json();
        this.token = data.access_token;
        return data;
    }

    async apiCall(endpoint, options = {}) {
        const response = await fetch(this.baseUrl + endpoint, {
            ...options,
            headers: {
                'Authorization': 'Bearer ' + this.token,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    }

    // Get detailed audio features for beat matching
    async getAudioFeatures(trackId) {
        return await this.apiCall(`/audio-features/${trackId}`);
    }

    // Get audio analysis for precise beat matching
    async getAudioAnalysis(trackId) {
        return await this.apiCall(`/audio-analysis/${trackId}`);
    }

    // Search for tracks
    async searchTracks(query, limit = 20) {
        const params = new URLSearchParams({
            q: query,
            type: 'track',
            limit: limit
        });
        return await this.apiCall(`/search?${params}`);
    }

    // Player controls
    async play(trackUri = null) {
        const body = trackUri ? { uris: [trackUri] } : {};
        return await this.apiCall('/me/player/play', {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    async pause() {
        return await this.apiCall('/me/player/pause', { method: 'PUT' });
    }

    async next() {
        return await this.apiCall('/me/player/next', { method: 'POST' });
    }

    async getCurrentlyPlaying() {
        return await this.apiCall('/me/player/currently-playing');
    }
}

class DJMixEngine {
    constructor(spotifyApi) {
        this.spotify = spotifyApi;
        this.camelotWheel = this.buildCamelotWheel();
    }

    // Camelot wheel for harmonic mixing
    buildCamelotWheel() {
        return {
            '1A': { key: 'Ab', mode: 'minor', compatibleKeys: ['1B', '2A', '12A'] },
            '1B': { key: 'B', mode: 'major', compatibleKeys: ['1A', '2B', '12B'] },
            '2A': { key: 'Eb', mode: 'minor', compatibleKeys: ['2B', '3A', '1A'] },
            '2B': { key: 'Gb', mode: 'major', compatibleKeys: ['2A', '3B', '1B'] },
            // ... (complete wheel)
        };
    }

    // Analyze track for DJ compatibility
    async analyzeTrack(trackId) {
        const [features, analysis] = await Promise.all([
            this.spotify.getAudioFeatures(trackId),
            this.spotify.getAudioAnalysis(trackId)
        ]);

        return {
            bpm: features.tempo,
            key: this.convertToCamelot(features.key, features.mode),
            energy: features.energy,
            danceability: features.danceability,
            valence: features.valence,
            beats: analysis.beats,
            sections: analysis.sections,
            segments: analysis.segments
        };
    }

    convertToCamelot(pitchClass, mode) {
        const camelotMap = {
            0: mode === 1 ? '5B' : '8A', // C
            1: mode === 1 ? '12B' : '3A', // C#/Db
            2: mode === 1 ? '7B' : '10A', // D
            3: mode === 1 ? '2B' : '5A', // D#/Eb
            4: mode === 1 ? '9B' : '12A', // E
            5: mode === 1 ? '4B' : '7A', // F
            6: mode === 1 ? '11B' : '2A', // F#/Gb
            7: mode === 1 ? '6B' : '9A', // G
            8: mode === 1 ? '1B' : '4A', // G#/Ab
            9: mode === 1 ? '8B' : '11A', // A
            10: mode === 1 ? '3B' : '6A', // A#/Bb
            11: mode === 1 ? '10B' : '1A' // B
        };
        return camelotMap[pitchClass] || 'Unknown';
    }

    // Check if two tracks are harmonically compatible
    areTracksCompatible(track1Key, track2Key) {
        const wheel = this.camelotWheel;
        return wheel[track1Key] && wheel[track1Key].compatibleKeys.includes(track2Key);
    }

    // Find the best transition point between two tracks
    async findTransitionPoint(currentTrack, nextTrack) {
        const currentAnalysis = await this.analyzeTrack(currentTrack.id);
        const nextAnalysis = await this.analyzeTrack(nextTrack.id);

        // Find sections where energy levels match
        const bestTransition = {
            outroStart: this.findOutroSection(currentAnalysis),
            introEnd: this.findIntroSection(nextAnalysis),
            crossfadeDuration: this.calculateCrossfadeDuration(currentAnalysis, nextAnalysis)
        };

        return bestTransition;
    }

    findOutroSection(analysis) {
        // Find the last 32 bars or similar repetitive section
        const sections = analysis.sections;
        const lastSection = sections[sections.length - 1];
        return Math.max(0, lastSection.start - 32); // 32 seconds before end
    }

    findIntroSection(analysis) {
        // Find where the main beat kicks in (usually after intro)
        const sections = analysis.sections;
        return sections.find(s => s.loudness > -20)?.start || 16; // Default to 16s
    }

    calculateCrossfadeDuration(track1Analysis, track2Analysis) {
        // Base duration on BPM compatibility
        const bpmDiff = Math.abs(track1Analysis.bpm - track2Analysis.bpm);
        if (bpmDiff < 5) return 8; // Quick mix
        if (bpmDiff < 15) return 16; // Normal mix
        return 32; // Extended mix for large BPM differences
    }
}

// Initialize APIs
const spotify = new SpotifyAPI();
const mixEngine = new DJMixEngine(spotify);

// Routes
app.get('/login', (req, res) => {
    const scopes = [
        'user-read-playback-state',
        'user-modify-playback-state',
        'user-read-currently-playing',
        'playlist-read-private',
        'playlist-read-collaborative'
    ].join(' ');

    const authUrl = 'https://accounts.spotify.com/authorize?' +
        new URLSearchParams({
            response_type: 'code',
            client_id: CLIENT_ID,
            scope: scopes,
            redirect_uri: REDIRECT_URI
        });

    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    try {
        const tokens = await spotify.authenticate(code);
        
        // Fetch user info after successful authentication
        try {
            const userInfo = await spotify.apiCall('/me');
            res.redirect(`/?authenticated=true&user=${encodeURIComponent(JSON.stringify(userInfo))}`);
        } catch (userError) {
            console.error('Failed to fetch user info:', userError);
            res.redirect('/?authenticated=true');
        }
    } catch (error) {
        console.error('Auth error:', error);
        res.redirect('/?error=auth_failed');
    }
});

// DJ Control endpoints
app.post('/api/search', async (req, res) => {
    try {
        const { query, limit = 20 } = req.body;
        const results = await spotify.searchTracks(query, limit);
        res.json(results);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/queue-track', async (req, res) => {
    try {
        const { trackId } = req.body;
        const analysis = await mixEngine.analyzeTrack(trackId);
        
        djState.queue.push({
            trackId,
            analysis,
            addedAt: Date.now()
        });
        
        // Broadcast queue update
        broadcast({ type: 'queue-updated', queue: djState.queue });
        
        res.json({ success: true, queue: djState.queue });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/state', (req, res) => {
    res.json(djState);
});

// Get current Spotify user info
app.get('/api/spotify/me', async (req, res) => {
    try {
        if (!spotify.token) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const userInfo = await spotify.apiCall('/me');
        res.json(userInfo);
    } catch (error) {
        console.error('Error fetching user info:', error);
        res.status(500).json({ error: error.message });
    }
});

// Sign out from Spotify
app.post('/api/spotify/signout', (req, res) => {
    spotify.token = null;
    djState.accessToken = null;
    djState.isPlaying = false;
    djState.currentTrack = null;
    
    // Broadcast state update
    broadcast({ type: 'spotify-disconnected' });
    
    res.json({ success: true, message: 'Signed out successfully' });
});

// WebSocket for real-time updates
wss.on('connection', (ws) => {
    console.log('DJ client connected');
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'play':
                    await spotify.play();
                    djState.isPlaying = true;
                    broadcast({ type: 'state-update', isPlaying: true });
                    break;
                    
                case 'pause':
                    await spotify.pause();
                    djState.isPlaying = false;
                    broadcast({ type: 'state-update', isPlaying: false });
                    break;
                    
                case 'request-song':
                    // AI will process this and add to queue intelligently
                    await handleSongRequest(data.request);
                    break;
                    
                case 'refresh-spotify':
                    // Refresh Spotify connection
                    if (spotify.token) {
                        try {
                            const userInfo = await spotify.apiCall('/me');
                            ws.send(JSON.stringify({ 
                                type: 'spotify-refreshed', 
                                userInfo: userInfo 
                            }));
                        } catch (error) {
                            ws.send(JSON.stringify({ 
                                type: 'error', 
                                message: 'Failed to refresh Spotify connection' 
                            }));
                        }
                    }
                    break;
                    
                case 'spotify-signout':
                    spotify.token = null;
                    djState.accessToken = null;
                    djState.isPlaying = false;
                    djState.currentTrack = null;
                    broadcast({ type: 'spotify-disconnected' });
                    break;
            }
        } catch (error) {
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

// AI Song Request Handler
async function handleSongRequest(request) {
    console.log('Processing song request:', request);
    
    try {
        // Check if it's a natural language request vs specific song
        const isNaturalLanguage = /^(play something|give me|i want|mood|feel like|vibe)/i.test(request.trim());
        
        let searchQuery = request;
        
        if (isNaturalLanguage) {
            // Process natural language requests
            searchQuery = await processNaturalLanguageRequest(request);
            console.log(`Natural language request "${request}" -> search query: "${searchQuery}"`);
        }
        
        // Search for the song
        const results = await spotify.searchTracks(searchQuery, 5);
        
        if (results.tracks && results.tracks.items && results.tracks.items.length > 0) {
            // For natural language requests, pick based on energy/mood
            let selectedTrack;
            
            if (isNaturalLanguage) {
                selectedTrack = await selectTrackByMood(results.tracks.items, request);
            } else {
                selectedTrack = results.tracks.items[0]; // First result for specific searches
            }
            
            // Analyze the track for DJ mixing
            const analysis = await mixEngine.analyzeTrack(selectedTrack.id);
            
            djState.queue.push({
                trackId: selectedTrack.id,
                track: selectedTrack,
                analysis,
                addedAt: Date.now(),
                requestedBy: 'user',
                request: request,
                originalRequest: request
            });
            
            const message = isNaturalLanguage ? 
                `🧠 Found perfect match: "${selectedTrack.name}" by ${selectedTrack.artists[0].name}` :
                `🎵 Added "${selectedTrack.name}" by ${selectedTrack.artists[0].name} to queue`;
            
            broadcast({ 
                type: 'song-queued', 
                track: selectedTrack,
                message: message
            });
            
        } else {
            broadcast({ 
                type: 'error', 
                message: `No tracks found for "${request}". Try a different search!`
            });
        }
        
    } catch (error) {
        console.error('Error handling song request:', error);
        broadcast({ 
            type: 'error', 
            message: `Failed to process request: ${error.message}`
        });
    }
}

// Process natural language requests into search queries
async function processNaturalLanguageRequest(request) {
    const requestLower = request.toLowerCase();
    
    // Mood-based mapping
    const moodMappings = {
        'energetic': 'high energy electronic dance music',
        'uplifting': 'uplifting happy pop music',
        'chill': 'chill ambient electronic music',
        'party': 'party dance electronic hits',
        'sad': 'sad emotional ballad',
        'romantic': 'romantic love songs',
        'workout': 'workout motivation electronic',
        'relaxing': 'relaxing ambient chill music',
        'happy': 'happy upbeat pop music',
        'intense': 'intense electronic dubstep',
        'classic': 'classic rock hits',
        'hip hop': 'hip hop rap music',
        'electronic': 'electronic dance music EDM',
        'pop': 'popular pop hits'
    };
    
    // Check for mood keywords
    for (const [mood, searchTerm] of Object.entries(moodMappings)) {
        if (requestLower.includes(mood)) {
            return searchTerm;
        }
    }
    
    // Genre extraction
    const genres = ['rock', 'pop', 'hip hop', 'rap', 'electronic', 'edm', 'house', 'techno', 'dubstep', 'jazz', 'classical', 'country', 'r&b', 'funk', 'reggae'];
    for (const genre of genres) {
        if (requestLower.includes(genre)) {
            return `${genre} music hits`;
        }
    }
    
    // Time-based requests
    if (requestLower.includes('90s') || requestLower.includes('nineties')) return '90s hits music';
    if (requestLower.includes('2000s') || requestLower.includes('2000')) return '2000s pop hits';
    if (requestLower.includes('80s') || requestLower.includes('eighties')) return '80s classic hits';
    
    // Default fallback - extract meaningful words
    const meaningfulWords = request.split(' ').filter(word => 
        word.length > 2 && 
        !['play', 'something', 'give', 'me', 'want', 'like', 'the', 'and', 'with'].includes(word.toLowerCase())
    ).join(' ');
    
    return meaningfulWords || 'popular music hits';
}

// Select best track based on mood/request
async function selectTrackByMood(tracks, originalRequest) {
    const requestLower = originalRequest.toLowerCase();
    
    // Get audio features for all tracks to make smart selection
    const tracksWithFeatures = [];
    
    for (const track of tracks.slice(0, 3)) { // Analyze top 3 results
        try {
            const features = await spotify.getAudioFeatures(track.id);
            tracksWithFeatures.push({ track, features });
        } catch (error) {
            console.error('Failed to get audio features for', track.name, error);
            tracksWithFeatures.push({ track, features: null });
        }
    }
    
    // Score tracks based on request
    let bestTrack = tracksWithFeatures[0];
    let bestScore = 0;
    
    for (const { track, features } of tracksWithFeatures) {
        let score = 0;
        
        if (!features) {
            score = Math.random(); // Random score if no features available
        } else {
            // Score based on energy and valence for different moods
            if (requestLower.includes('energetic') || requestLower.includes('party')) {
                score += features.energy * 2 + features.danceability;
            }
            
            if (requestLower.includes('happy') || requestLower.includes('uplifting')) {
                score += features.valence * 2 + features.energy;
            }
            
            if (requestLower.includes('chill') || requestLower.includes('relaxing')) {
                score += (1 - features.energy) + (features.valence * 0.5);
            }
            
            if (requestLower.includes('sad')) {
                score += (1 - features.valence) * 2;
            }
            
            if (requestLower.includes('workout') || requestLower.includes('intense')) {
                score += features.energy * 2 + features.loudness / 10;
            }
            
            // Bonus for higher popularity
            score += (track.popularity / 100) * 0.5;
        }
        
        if (score > bestScore) {
            bestScore = score;
            bestTrack = { track, features };
        }
    }
    
    return bestTrack.track;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🐾 DJ MEW Server running on port ${PORT}`);
    console.log(`🔗 Connect Spotify: http://localhost:${PORT}/login`);
    console.log(`✨ Legendary psychic mixing powers: ONLINE`);
});