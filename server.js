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

// Persistent Usage Statistics
const fs = require('fs').promises;
const path = require('path');

const STATS_FILE = path.join(__dirname, 'usage-stats.json');

// Default stats structure
let usageStats = {
    spotifyAPICalls: 0,
    songsAnalyzed: 0,
    queueOptimizations: 0,
    transitionsPerformed: 0,
    autonomousSongsAdded: 0,
    mewSuggestions: 0,
    sessionsTotal: 0,
    sessionsToday: 0,
    totalUptime: 0,
    renderHours: 0,
    startTime: Date.now(),
    lastReset: new Date().toDateString(),
    firstLaunch: new Date().toISOString(),
    lastSaved: new Date().toISOString()
};

// Load persistent stats on startup
async function loadUsageStats() {
    try {
        console.log('📊 Loading persistent usage stats...');
        const statsData = await fs.readFile(STATS_FILE, 'utf8');
        const savedStats = JSON.parse(statsData);
        
        // Merge saved stats with defaults (preserves new fields)
        usageStats = {
            ...usageStats,
            ...savedStats,
            startTime: Date.now(), // Reset session start
        };
        
        // Reset daily stats if new day
        if (usageStats.lastReset !== new Date().toDateString()) {
            usageStats.sessionsToday = 0;
            usageStats.lastReset = new Date().toDateString();
        }
        
        console.log('✅ Loaded persistent stats:', {
            totalSessions: usageStats.sessionsTotal,
            totalSpotifyAPICalls: usageStats.spotifyAPICalls,
            totalSongsAnalyzed: usageStats.songsAnalyzed,
            totalUptime: Math.round(usageStats.totalUptime / (1000 * 60 * 60)) + 'h',
            firstLaunch: usageStats.firstLaunch
        });
        
    } catch (error) {
        console.log('📊 No existing stats file, starting fresh');
        usageStats.firstLaunch = new Date().toISOString();
        await saveUsageStats(); // Create initial stats file
    }
}

// Save stats to persistent storage
async function saveUsageStats() {
    try {
        // Update total uptime
        const sessionUptime = Date.now() - usageStats.startTime;
        const statsToSave = {
            ...usageStats,
            totalUptime: usageStats.totalUptime + sessionUptime,
            renderHours: (usageStats.totalUptime + sessionUptime) / (1000 * 60 * 60),
            lastSaved: new Date().toISOString(),
            startTime: Date.now() // Reset for next interval
        };
        
        await fs.writeFile(STATS_FILE, JSON.stringify(statsToSave, null, 2));
        usageStats = statsToSave; // Update in-memory stats
        console.log('💾 Usage stats saved to persistent storage');
    } catch (error) {
        console.error('❌ Failed to save usage stats:', error);
    }
}

// Auto-save stats every 2 minutes
setInterval(saveUsageStats, 2 * 60 * 1000);

// Save stats on process exit
process.on('SIGTERM', async () => {
    console.log('💾 Saving final stats before shutdown...');
    await saveUsageStats();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('💾 Saving final stats before shutdown...');
    await saveUsageStats();
    process.exit(0);
});

// Increment counter helper
function incrementStat(statName, amount = 1) {
    if (usageStats.hasOwnProperty(statName)) {
        usageStats[statName] += amount;
    }
}

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
        incrementStat('spotifyAPICalls');
        
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
            incrementStat('songsAnalyzed');
            
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

// MEW's Advanced DJ Intelligence - Creative Decisions & Vibe Reading
class DJIntelligence {
    static analyzeQueueVibe(queue) {
        if (!queue || queue.length === 0) {
            return {
                primary_genre: 'unknown',
                energy_trend: 'neutral',
                average_bpm: 120,
                average_energy: 0.5,
                mood: 'neutral',
                recommendations: []
            };
        }

        console.log('🔮 MEW is reading the vibe of your set...');
        
        // Analyze overall characteristics
        const totalEnergy = queue.reduce((sum, track) => sum + (track.analysis?.energy || 0.5), 0);
        const totalBPM = queue.reduce((sum, track) => sum + (track.analysis?.tempo || 120), 0);
        const totalValence = queue.reduce((sum, track) => sum + (track.analysis?.valence || 0.5), 0);
        const totalDanceability = queue.reduce((sum, track) => sum + (track.analysis?.danceability || 0.5), 0);
        
        const avgEnergy = totalEnergy / queue.length;
        const avgBPM = totalBPM / queue.length;
        const avgValence = totalValence / queue.length;
        const avgDanceability = totalDanceability / queue.length;

        // Enhanced genre detection for all party types
        let primaryGenre = 'electronic';
        let mood = 'neutral';
        
        // Analyze track names and artists for genre hints
        const trackText = queue.map(track => 
            `${track.name || ''} ${track.artist || ''}`.toLowerCase()
        ).join(' ');
        
        const genreKeywords = {
            'hip-hop': ['hip hop', 'rap', 'drake', 'kendrick', 'cole', 'future', 'travis scott', 'kanye'],
            'trap': ['trap', 'migos', 'lil', 'young', 'savage', 'metro boomin', '21 savage'],
            'reggaeton': ['reggaeton', 'bad bunny', 'ozuna', 'maluma', 'j balvin', 'daddy yankee'],
            'latin': ['latin', 'salsa', 'bachata', 'merengue', 'latino', 'spanish'],
            'pop': ['pop', 'taylor swift', 'ariana', 'dua lipa', 'billie eilish', 'weeknd'],
            'r&b': ['r&b', 'rnb', 'soul', 'neo soul', 'sza', 'frank ocean', 'the weeknd']
        };
        
        // Check for genre keywords first
        for (const [genre, keywords] of Object.entries(genreKeywords)) {
            if (keywords.some(keyword => trackText.includes(keyword))) {
                primaryGenre = genre;
                break;
            }
        }
        
        // Fallback to audio feature analysis
        if (primaryGenre === 'electronic') {
            if (avgEnergy > 0.8 && avgDanceability > 0.7 && avgBPM > 125) {
                primaryGenre = 'high-energy-dance';
                mood = 'party';
            } else if (avgEnergy > 0.7 && avgBPM >= 140 && avgBPM <= 180) {
                primaryGenre = 'electronic';
                mood = 'rave';
            } else if (avgEnergy > 0.6 && avgBPM >= 70 && avgBPM <= 90) {
                primaryGenre = 'hip-hop'; // Hip-hop BPM range
                mood = 'party';
            } else if (avgEnergy > 0.6 && avgBPM > 120) {
                primaryGenre = 'electronic';
                mood = 'energetic';
            } else if (avgValence > 0.6 && avgEnergy < 0.6) {
                primaryGenre = 'feel-good';
                mood = 'uplifting';
            } else if (avgEnergy < 0.4) {
                primaryGenre = 'chill';
                mood = 'relaxed';
            }
        } else {
            // Set mood based on detected genre
            if (primaryGenre === 'hip-hop' || primaryGenre === 'trap' || primaryGenre === 'reggaeton') {
                mood = avgEnergy > 0.6 ? 'party' : 'chill';
            } else if (primaryGenre === 'pop' || primaryGenre === 'latin') {
                mood = 'uplifting';
            } else if (primaryGenre === 'r&b') {
                mood = 'smooth';
            }
        }

        // Analyze energy trend
        let energyTrend = 'neutral';
        if (queue.length >= 3) {
            const firstHalf = queue.slice(0, Math.floor(queue.length / 2));
            const secondHalf = queue.slice(Math.floor(queue.length / 2));
            
            const firstEnergy = firstHalf.reduce((sum, track) => sum + (track.analysis?.energy || 0.5), 0) / firstHalf.length;
            const secondEnergy = secondHalf.reduce((sum, track) => sum + (track.analysis?.energy || 0.5), 0) / secondHalf.length;
            
            if (secondEnergy > firstEnergy + 0.1) energyTrend = 'building';
            else if (secondEnergy < firstEnergy - 0.1) energyTrend = 'cooling';
        }

        const vibe = {
            primary_genre: primaryGenre,
            energy_trend: energyTrend,
            average_bpm: Math.round(avgBPM),
            average_energy: Math.round(avgEnergy * 100),
            average_valence: Math.round(avgValence * 100),
            mood: mood,
            danceability: Math.round(avgDanceability * 100),
            recommendations: this.generateVibeRecommendations(primaryGenre, mood, energyTrend, avgBPM)
        };

        console.log(`✨ MEW detected vibe: ${mood} ${primaryGenre} (${energyTrend} energy)`);
        return vibe;
    }

    static generateVibeRecommendations(genre, mood, trend, avgBPM) {
        const recommendations = [];

        // Expanded genre-specific song suggestions for all party types
        const genreQueries = {
            'high-energy-dance': ['festival EDM bangers', 'club dance hits', 'rave anthems', 'electronic festival'],
            'electronic': ['house music hits', 'techno classics', 'synth pop bangers', 'electronic dance'],
            'hip-hop': ['hip hop party songs', 'rap bangers', 'hip hop club hits', 'trap music'],
            'rap': ['rap party anthems', 'hip hop club bangers', 'gangsta rap classics', 'rap hits'],
            'trap': ['trap bangers', 'dirty south hip hop', 'trap party music', 'bass heavy trap'],
            'reggaeton': ['reggaeton hits', 'latin party music', 'perreo classics', 'reggaeton club'],
            'pop': ['pop party hits', 'mainstream bangers', 'top 40 dance', 'pop club hits'],
            'feel-good': ['feel good party', 'uplifting dance', 'positive energy hits', 'good vibes music'],
            'chill': ['chill vibes', 'laid back hip hop', 'smooth R&B', 'relaxed party music'],
            'latin': ['latin party hits', 'salsa club music', 'bachata party', 'latin dance']
        };

        // Energy trend adjustments with genre awareness
        if (trend === 'building') {
            if (genre.includes('hip-hop') || genre.includes('rap')) {
                recommendations.push({
                    query: `high energy rap bangers ${Math.round(avgBPM + 5)} bpm`,
                    reason: 'Building rap energy - need harder hitting tracks'
                });
            } else {
                recommendations.push({
                    query: `high energy ${genre} ${Math.round(avgBPM + 10)} bpm`,
                    reason: 'Building energy - need higher BPM tracks'
                });
            }
        } else if (trend === 'cooling') {
            recommendations.push({
                query: `smooth ${genre} ${Math.round(avgBPM - 5)} bpm`,
                reason: 'Cooling down - need mellower tracks'
            });
        } else {
            recommendations.push({
                query: genreQueries[genre]?.[0] || 'party music',
                reason: `Maintaining ${mood} ${genre} vibe`
            });
        }

        return recommendations;
    }

    static selectTransitionTechnique(fromTrack, toTrack, queueVibe) {
        console.log('🎛️ MEW is choosing the perfect transition technique...');
        
        const energyChange = (toTrack.analysis?.energy || 0.5) - (fromTrack.analysis?.energy || 0.5);
        const bpmChange = Math.abs((toTrack.analysis?.tempo || 120) - (fromTrack.analysis?.tempo || 120));
        const genre = queueVibe.primary_genre;
        const mood = queueVibe.mood;

        const techniques = [];

        // Genre-specific techniques
        if (genre === 'high-energy-dance' || mood === 'party') {
            if (energyChange > 0.2) {
                techniques.push('air_horn_buildup', 'crowd_cheer_transition', 'laser_sweep');
            } else {
                techniques.push('quick_cut_impact', 'siren_transition', 'echo_slam');
            }
        } else if (genre === 'electronic') {
            techniques.push('filter_sweep', 'whoosh_transition', 'synth_stab');
        } else if (genre === 'feel-good' || mood === 'uplifting') {
            techniques.push('smooth_crossfade', 'harmonic_transition', 'vocal_drop');
        } else if (genre === 'chill' || mood === 'relaxed') {
            techniques.push('ambient_fade', 'reverb_tail', 'soft_transition');
        }

        // BPM-specific adjustments
        if (bpmChange > 20) {
            techniques.push('tempo_bridge', 'rhythm_break');
        }

        // Energy-specific techniques
        if (energyChange > 0.3) {
            techniques.push('energy_riser', 'buildup_effect');
        } else if (energyChange < -0.3) {
            techniques.push('energy_drop', 'breakdown_effect');
        }

        // Select random technique from appropriate options
        const selectedTechnique = techniques[Math.floor(Math.random() * techniques.length)] || 'smooth_crossfade';
        
        console.log(`✨ MEW chose: ${selectedTechnique} (perfect for ${mood} ${genre})`);
        
        return {
            technique: selectedTechnique,
            duration: this.getTransitionDuration(selectedTechnique),
            effects: this.getTransitionEffects(selectedTechnique),
            timing: this.getTransitionTiming(selectedTechnique, fromTrack, toTrack)
        };
    }

    static getTransitionDuration(technique) {
        const durations = {
            'air_horn_buildup': 3000,
            'quick_cut_impact': 1000,
            'filter_sweep': 6000,
            'smooth_crossfade': 8000,
            'ambient_fade': 10000,
            'siren_transition': 4000,
            'crowd_cheer_transition': 5000,
            'laser_sweep': 4000,
            'echo_slam': 2000,
            'whoosh_transition': 3000,
            'synth_stab': 1500,
            'harmonic_transition': 7000,
            'vocal_drop': 2000,
            'reverb_tail': 9000,
            'soft_transition': 12000,
            'tempo_bridge': 8000,
            'rhythm_break': 4000,
            'energy_riser': 6000,
            'buildup_effect': 5000,
            'energy_drop': 7000,
            'breakdown_effect': 8000
        };
        return durations[technique] || 6000;
    }

    static getTransitionEffects(technique) {
        const effectMap = {
            'air_horn_buildup': ['air_horn', 'crowd_buildup', 'impact'],
            'quick_cut_impact': ['gunshot', 'impact'],
            'filter_sweep': ['filter_sweep', 'whoosh'],
            'smooth_crossfade': ['reverb_tail', 'subtle_filter'],
            'ambient_fade': ['reverb_tail', 'echo_fade'],
            'siren_transition': ['siren', 'rising_effect'],
            'crowd_cheer_transition': ['crowd_cheer', 'applause'],
            'laser_sweep': ['laser', 'sweep'],
            'echo_slam': ['echo', 'impact', 'slam'],
            'whoosh_transition': ['whoosh', 'wind'],
            'synth_stab': ['synth_stab', 'electronic_hit'],
            'harmonic_transition': ['harmonic_rise', 'musical_transition'],
            'vocal_drop': ['vocal_effect', 'voice_drop'],
            'reverb_tail': ['reverb', 'echo_tail'],
            'soft_transition': ['soft_fade', 'ambient'],
            'tempo_bridge': ['tempo_shift', 'rhythm_effect'],
            'rhythm_break': ['break_effect', 'pause'],
            'energy_riser': ['riser', 'buildup'],
            'buildup_effect': ['tension_build', 'energy_rise'],
            'energy_drop': ['drop_effect', 'impact'],
            'breakdown_effect': ['breakdown', 'filter_drop']
        };
        return effectMap[technique] || ['crossfade'];
    }

    static getTransitionTiming(technique, fromTrack, toTrack) {
        // Calculate optimal timing based on technique and song structure
        const fastTechniques = ['quick_cut_impact', 'gunshot', 'echo_slam', 'synth_stab'];
        const buildupTechniques = ['air_horn_buildup', 'siren_transition', 'energy_riser'];
        
        if (fastTechniques.includes(technique)) {
            return {
                prep_time: 500,   // Very quick preparation
                effect_start: 0,  // Effect starts immediately
                track_change: 1000 // Quick track change
            };
        } else if (buildupTechniques.includes(technique)) {
            return {
                prep_time: 2000,  // Build anticipation
                effect_start: 1000, // Effect starts early
                track_change: 3000  // Track changes after buildup
            };
        } else {
            return {
                prep_time: 1000,
                effect_start: 500,
                track_change: 2000
            };
        }
    }
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
        incrementStat('queueOptimizations');

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
    incrementStat('sessionsToday');
    incrementStat('sessionsTotal');
    
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

// Get usage statistics with real-time calculations
app.get('/api/usage-stats', (req, res) => {
    // Calculate current session uptime
    const sessionUptime = (Date.now() - usageStats.startTime) / (1000 * 60 * 60);
    const totalUptime = (usageStats.totalUptime / (1000 * 60 * 60)) + sessionUptime;
    
    // Enhanced stats response
    const enhancedStats = {
        ...usageStats,
        renderHours: totalUptime,
        sessionUptime: sessionUptime,
        totalUptime: totalUptime,
        avgSessionLength: usageStats.sessionsTotal > 0 ? totalUptime / usageStats.sessionsTotal : 0,
        songsPerSession: usageStats.sessionsTotal > 0 ? usageStats.songsAnalyzed / usageStats.sessionsTotal : 0,
        apiCallsPerHour: totalUptime > 0 ? usageStats.spotifyAPICalls / totalUptime : 0,
        daysSinceFirstLaunch: usageStats.firstLaunch ? Math.floor((Date.now() - new Date(usageStats.firstLaunch).getTime()) / (1000 * 60 * 60 * 24)) : 0
    };
    
    res.json(enhancedStats);
});

// Endpoint to track transitions (called from frontend)
app.post('/api/track-transition', (req, res) => {
    try {
        incrementStat('transitionsPerformed');
        console.log('🎛️ Transition performed - stats updated');
        res.json({ success: true, transitions: usageStats.transitionsPerformed });
    } catch (error) {
        console.error('Error tracking transition:', error);
        res.status(500).json({ error: error.message });
    }
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

// MEW reads the vibe and suggests songs
app.post('/api/mew-suggest-songs', async (req, res) => {
    try {
        console.log('🔮 MEW is analyzing your vibe and finding perfect songs...');
        
        const currentQueue = djState.queue || [];
        const { count = 3 } = req.body;
        
        // Let MEW analyze and suggest
        const suggestions = await AutonomousDJ.autoFillQueue(currentQueue, spotify);
        
        console.log(`✨ MEW found ${suggestions.suggestions.length} songs for ${suggestions.vibe.mood} vibe`);
        
        // Track MEW suggestion usage
        incrementStat('mewSuggestions');
        
        res.json({
            success: true,
            vibe: suggestions.vibe,
            suggestions: suggestions.suggestions,
            reasoning: suggestions.reasoning,
            message: `🔮 MEW detected ${suggestions.vibe.mood} ${suggestions.vibe.primary_genre} vibe`
        });
        
    } catch (error) {
        console.error('🚨 MEW suggestion error:', error);
        res.status(500).json({ error: error.message });
    }
});

// MEW automatically adds suggested songs to queue
app.post('/api/mew-auto-add', async (req, res) => {
    try {
        console.log('🤖 MEW is autonomously building your set...');
        
        const currentQueue = djState.queue || [];
        const suggestions = await AutonomousDJ.autoFillQueue(currentQueue, spotify);
        
        // Add MEW's suggestions to queue with analysis
        for (const track of suggestions.suggestions.slice(0, 2)) { // Add top 2
            try {
                const analysis = await spotify.getAudioFeatures(track.id);
                const detailedAnalysis = await spotify.getDetailedAudioAnalysis(track.id);
                const structure = DJIntelligence.analyzeSongStructure(analysis, detailedAnalysis, track.duration_ms);
                
                const queueItem = {
                    ...track,
                    analysis,
                    structure,
                    bpm: Math.round(analysis.tempo || 120),
                    key: SmartQueue.getKeyName(analysis.key || 0),
                    energy: Math.round((analysis.energy || 0.5) * 100),
                    valence: Math.round((analysis.valence || 0.5) * 100),
                    addedAt: Date.now(),
                    smart_start: structure.recommendations.ideal_start,
                    smart_end: structure.recommendations.ideal_end,
                    play_duration: structure.recommendations.play_duration,
                    hot_cues: structure.recommendations.hot_cues,
                    added_by: 'mew',
                    vibe_match_score: track.score || 75
                };
                
                djState.queue.push(queueItem);
                incrementStat('autonomousSongsAdded');
                console.log(`✨ MEW added: ${track.name} (${track.score || 75}% vibe match)`);
            } catch (error) {
                console.error(`Failed to add ${track.name}:`, error);
            }
        }
        
        // Broadcast queue update
        broadcast({ type: 'queue-update', queue: djState.queue });
        
        res.json({
            success: true,
            added: suggestions.suggestions.slice(0, 2).length,
            vibe: suggestions.vibe,
            reasoning: suggestions.reasoning,
            message: `🤖 MEW autonomously added ${suggestions.suggestions.slice(0, 2).length} perfect tracks!`
        });
        
    } catch (error) {
        console.error('🚨 MEW auto-add error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get current queue vibe analysis
app.get('/api/queue-vibe', (req, res) => {
    try {
        const vibe = DJIntelligence.analyzeQueueVibe(djState.queue || []);
        res.json({ success: true, vibe });
    } catch (error) {
        console.error('Vibe analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Set MEW's party mode (DJ style focus)
app.post('/api/set-party-mode', (req, res) => {
    try {
        const { mode } = req.body;
        
        const partyModes = {
            'legendary-mix': { 
                name: 'Legendary Mix', 
                description: 'MEW chooses techniques from all genres - ultimate party intelligence',
                priority_genres: ['all'],
                energy_preference: 'adaptive'
            },
            'hip-hop-party': {
                name: 'Hip-Hop Party',
                description: 'DJ Khaled meets DJ Premier - classic hip-hop party vibes',
                priority_genres: ['hip-hop', 'rap', 'trap'],
                energy_preference: 'high'
            },
            'electronic-rave': {
                name: 'Electronic Rave',
                description: 'Deadmau5 meets Skrillex - festival electronic energy',
                priority_genres: ['electronic', 'high-energy-dance'],
                energy_preference: 'maximum'
            },
            'latin-fiesta': {
                name: 'Latin Fiesta',
                description: 'DJ Nelson reggaeton party - authentic Latin celebration',
                priority_genres: ['reggaeton', 'latin'],
                energy_preference: 'party'
            },
            'smooth-vibes': {
                name: 'Smooth Vibes',
                description: '9th Wonder meets Jazzy Jeff - sophisticated party flow',
                priority_genres: ['r&b', 'chill', 'feel-good'],
                energy_preference: 'smooth'
            },
            'mainstream-party': {
                name: 'Mainstream Party',
                description: 'David Guetta meets Diplo - crowd-pleasing party hits',
                priority_genres: ['pop', 'electronic'],
                energy_preference: 'crowd-pleasing'
            }
        };
        
        if (!partyModes[mode]) {
            return res.status(400).json({ error: 'Invalid party mode' });
        }
        
        djState.partyMode = partyModes[mode];
        console.log(`🎛️ MEW party mode set to: ${partyModes[mode].name}`);
        
        // Broadcast party mode change
        broadcast({ 
            type: 'party-mode-update', 
            mode: djState.partyMode,
            message: `🔥 MEW is now in ${partyModes[mode].name} mode!`
        });
        
        res.json({ 
            success: true, 
            mode: djState.partyMode,
            available_modes: partyModes
        });
        
    } catch (error) {
        console.error('Party mode error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get available party modes
app.get('/api/party-modes', (req, res) => {
    const partyModes = {
        'legendary-mix': { 
            name: 'Legendary Mix', 
            description: 'MEW chooses techniques from all genres - ultimate party intelligence',
            emoji: '🔮'
        },
        'hip-hop-party': {
            name: 'Hip-Hop Party',
            description: 'DJ Khaled meets DJ Premier - classic hip-hop party vibes',
            emoji: '🎤'
        },
        'electronic-rave': {
            name: 'Electronic Rave',
            description: 'Deadmau5 meets Skrillex - festival electronic energy',
            emoji: '⚡'
        },
        'latin-fiesta': {
            name: 'Latin Fiesta',
            description: 'DJ Nelson reggaeton party - authentic Latin celebration',
            emoji: '🌶️'
        },
        'smooth-vibes': {
            name: 'Smooth Vibes',
            description: '9th Wonder meets Jazzy Jeff - sophisticated party flow',
            emoji: '🪐'
        },
        'mainstream-party': {
            name: 'Mainstream Party',
            description: 'David Guetta meets Diplo - crowd-pleasing party hits',
            emoji: '🎉'
        }
    };
    
    res.json({ 
        success: true, 
        modes: partyModes,
        current_mode: djState.partyMode || partyModes['legendary-mix']
    });
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

// MEW's Autonomous DJ System - Finds Perfect Songs
class AutonomousDJ {
    static async findSongsForVibe(vibe, spotify, count = 3) {
        console.log(`🔮 MEW is hunting for ${count} songs to match your ${vibe.mood} ${vibe.primary_genre} vibe...`);
        
        const searchQueries = this.generateSmartSearchQueries(vibe);
        const foundTracks = [];
        
        for (const query of searchQueries.slice(0, 3)) { // Try up to 3 different searches
            try {
                console.log(`🎯 MEW searching: "${query.query}"`);
                const results = await spotify.searchTracks(query.query, 10);
                
                // Filter and score results based on vibe compatibility
                const scoredTracks = results
                    .map(track => ({
                        ...track,
                        score: this.scoreTrackForVibe(track, vibe)
                    }))
                    .filter(track => track.score > 60) // Only good matches
                    .sort((a, b) => b.score - a.score); // Best first
                
                // Add top tracks from this search
                foundTracks.push(...scoredTracks.slice(0, 2));
                
                if (foundTracks.length >= count) break;
            } catch (error) {
                console.error('Search error:', error);
            }
        }
        
        // Remove duplicates and return best matches
        const uniqueTracks = foundTracks.filter((track, index, self) =>
            index === self.findIndex(t => t.id === track.id)
        ).slice(0, count);
        
        console.log(`✨ MEW found ${uniqueTracks.length} perfect tracks for the vibe!`);
        return uniqueTracks;
    }

    static generateSmartSearchQueries(vibe) {
        const queries = [];
        
        // Expanded base genre queries for LEGENDARY party vibes
        const genreQueries = {
            'high-energy-dance': [
                'festival EDM bangers',
                'club dance anthems',
                'electronic party hits',
                'rave festival music'
            ],
            'electronic': [
                'house music bangers',
                'techno club hits',
                'electronic dance hits',
                'synth pop party'
            ],
            'hip-hop': [
                'hip hop party bangers',
                'rap club hits',
                'hip hop dance tracks',
                'party rap anthems'
            ],
            'rap': [
                'rap bangers',
                'hardcore rap hits',
                'gangsta rap classics',
                'rap party songs'
            ],
            'trap': [
                'trap bangers',
                'hard trap beats',
                'southern hip hop',
                'trap party music'
            ],
            'reggaeton': [
                'reggaeton hits',
                'latin party music',
                'perreo classics',
                'reggaeton club bangers'
            ],
            'latin': [
                'latin party hits',
                'salsa dance music',
                'bachata party',
                'latin dance tracks'
            ],
            'pop': [
                'pop party hits',
                'mainstream dance',
                'top 40 bangers',
                'radio party hits'
            ],
            'r&b': [
                'r&b party songs',
                'neo soul hits',
                'smooth r&b',
                'r&b club tracks'
            ],
            'feel-good': [
                'feel good party',
                'uplifting dance hits',
                'positive energy music',
                'good vibes party'
            ],
            'chill': [
                'chill party vibes',
                'laid back hip hop',
                'smooth party music',
                'relaxed club music'
            ]
        };

        // Energy-specific modifiers
        const energyModifiers = {
            'building': ['high energy', 'intense', 'powerful', 'energetic'],
            'cooling': ['mellow', 'calm', 'relaxed', 'smooth'],
            'neutral': ['steady', 'consistent', 'flowing']
        };

        // BPM-specific additions
        let bpmRange = '';
        if (vibe.average_bpm > 130) bpmRange = 'fast tempo';
        else if (vibe.average_bpm < 100) bpmRange = 'slow tempo';
        else bpmRange = 'medium tempo';

        // Generate combination queries
        const baseQueries = genreQueries[vibe.primary_genre] || genreQueries['electronic'];
        const energyMods = energyModifiers[vibe.energy_trend] || energyModifiers['neutral'];

        baseQueries.forEach((base, index) => {
            if (index < energyMods.length) {
                queries.push({
                    query: `${energyMods[index]} ${base} ${bpmRange}`,
                    reason: `${vibe.energy_trend} energy ${vibe.primary_genre}`
                });
            } else {
                queries.push({
                    query: `${base} ${bpmRange}`,
                    reason: `${vibe.primary_genre} vibe match`
                });
            }
        });

        return queries;
    }

    static scoreTrackForVibe(track, vibe) {
        let score = 50; // Base score
        
        const trackName = (track.name || '').toLowerCase();
        const artistName = (track.artist || '').toLowerCase();
        const combined = `${trackName} ${artistName}`;
        
        // Expanded genre matching keywords for all party types
        const genreKeywords = {
            'high-energy-dance': ['dance', 'remix', 'festival', 'club', 'energy', 'party', 'banger', 'anthem'],
            'electronic': ['electronic', 'synth', 'house', 'techno', 'beat', 'mix', 'edm', 'rave'],
            'hip-hop': ['hip hop', 'rap', 'freestyle', 'cipher', 'bars', 'flow', 'beats', 'mixtape'],
            'rap': ['rap', 'rapper', 'spitter', 'lyrical', 'bars', 'verse', 'hook', 'banger'],
            'trap': ['trap', 'drill', 'mumble', 'auto-tune', 'adlibs', 'sauce', 'slaps', 'goes hard'],
            'reggaeton': ['reggaeton', 'perreo', 'dembow', 'latino', 'urbano', 'fiesta', 'party'],
            'latin': ['latin', 'latino', 'spanish', 'salsa', 'bachata', 'merengue', 'cumbia'],
            'pop': ['pop', 'mainstream', 'radio', 'hit', 'single', 'chart', 'billboard'],
            'r&b': ['r&b', 'rnb', 'soul', 'smooth', 'vocals', 'melody', 'groove'],
            'feel-good': ['happy', 'good', 'love', 'feel', 'positive', 'up', 'vibes', 'mood'],
            'chill': ['chill', 'ambient', 'mellow', 'soft', 'calm', 'relax', 'laid back']
        };

        // Enhanced mood matching keywords
        const moodKeywords = {
            'party': ['party', 'club', 'wild', 'crazy', 'lit', 'fire', 'banger', 'slaps', 'goes hard'],
            'rave': ['rave', 'festival', 'drop', 'bass', 'build', 'euphoria', 'energy', 'insane'],
            'energetic': ['energy', 'power', 'intense', 'strong', 'hype', 'pump', 'adrenaline'],
            'uplifting': ['up', 'rise', 'lift', 'high', 'bright', 'positive', 'good vibes'],
            'smooth': ['smooth', 'silk', 'butter', 'flow', 'groove', 'vibe', 'chill'],
            'relaxed': ['calm', 'peace', 'soft', 'gentle', 'quiet', 'mellow', 'laid back']
        };

        // Score based on genre match
        const genreWords = genreKeywords[vibe.primary_genre] || [];
        genreWords.forEach(keyword => {
            if (combined.includes(keyword)) score += 15;
        });

        // Score based on mood match  
        const moodWords = moodKeywords[vibe.mood] || [];
        moodWords.forEach(keyword => {
            if (combined.includes(keyword)) score += 10;
        });

        // Legendary artist bonuses by genre
        const legendaryArtists = {
            'hip-hop': [
                'kendrick lamar', 'j cole', 'drake', 'kanye', 'jay-z', 'nas', 'eminem', 'tupac', 
                'biggie', 'ice cube', 'snoop dogg', 'dr dre', 'outkast', 'wu-tang', 'rakim'
            ],
            'rap': [
                'kendrick', 'cole', 'drake', 'travis scott', 'future', 'lil wayne', 'nicki minaj',
                'cardi b', 'megan thee stallion', 'dababy', 'roddy ricch', 'polo g'
            ],
            'trap': [
                'migos', 'future', 'travis scott', '21 savage', 'lil baby', 'gunna', 'young thug',
                'metro boomin', 'southside', 'zaytoven', 'lex luger', 'pierre bourne'
            ],
            'reggaeton': [
                'bad bunny', 'ozuna', 'maluma', 'j balvin', 'daddy yankee', 'don omar', 
                'wisin y yandel', 'nicky jam', 'farruko', 'anuel aa', 'karol g'
            ],
            'electronic': [
                'avicii', 'calvin harris', 'deadmau5', 'skrillex', 'martin garrix', 'tiësto',
                'david guetta', 'diplo', 'zedd', 'marshmello', 'chainsmokers', 'swedish house mafia'
            ],
            'pop': [
                'taylor swift', 'ariana grande', 'dua lipa', 'billie eilish', 'the weeknd',
                'bruno mars', 'ed sheeran', 'justin bieber', 'olivia rodrigo', 'doja cat'
            ],
            'r&b': [
                'the weeknd', 'sza', 'frank ocean', 'daniel caesar', 'bryson tiller',
                'summer walker', 'jhené aiko', 'miguel', 'usher', 'chris brown'
            ]
        };

        // Apply legendary artist bonus
        const artistsForGenre = legendaryArtists[vibe.primary_genre] || [];
        artistsForGenre.forEach(artist => {
            if (artistName.includes(artist) || combined.includes(artist)) {
                score += 25; // Big bonus for legendary artists
            }
        });

        // Special party keywords get extra points
        const partyKeywords = ['banger', 'slaps', 'goes hard', 'fire', 'lit', 'anthem', 'club', 'party'];
        partyKeywords.forEach(keyword => {
            if (combined.includes(keyword)) score += 12;
        });

        // Energy-based adjustments
        if (vibe.mood === 'party' && combined.includes('energy')) score += 15;
        if (vibe.mood === 'rave' && (combined.includes('drop') || combined.includes('bass'))) score += 20;
        
        return Math.min(100, score); // Cap at 100
    }

    static async autoFillQueue(currentQueue, spotify) {
        console.log('🤖 MEW is analyzing your vibe and finding perfect songs...');
        
        // Analyze current vibe
        const vibe = DJIntelligence.analyzeQueueVibe(currentQueue);
        
        // Find complementary tracks
        const suggestedTracks = await this.findSongsForVibe(vibe, spotify, 3);
        
        return {
            vibe: vibe,
            suggestions: suggestedTracks,
            reasoning: `Found ${suggestedTracks.length} tracks that match your ${vibe.mood} ${vibe.primary_genre} vibe`
        };
    }
}

// Load persistent stats on startup
loadUsageStats().then(() => {
    console.log('🔮 DJ MEW v2.0 - Legendary AI DJ ready!');
    console.log('✨ Features: Smart search, beat matching, intelligent transitions, autonomous song discovery');
    console.log('🎯 Focus: Musical intelligence, creative decisions, perfect vibes');
    console.log('🤖 New: MEW can read vibes and find perfect songs autonomously!');
    console.log('📊 Persistent usage tracking enabled');
});