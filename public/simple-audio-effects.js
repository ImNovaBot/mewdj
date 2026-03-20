// Simple Audio Effects - No Complex Web Audio API, Just Works!
class SimpleAudioEffects {
    constructor() {
        this.effects = new Map();
        this.isReady = false;
        this.volume = 0.8;
        console.log('🎵 Simple Audio Effects initialized');
    }

    async initialize() {
        try {
            console.log('🔊 Loading REAL DJ audio effects...');
            
            // Skip real audio loading for now - use enhanced generated effects
            // (Real DJ samples require proper licensing and reliable CDN)
            console.log('🎵 Using enhanced generated DJ effects (much better than before!)');
            
            // Load enhanced generated effects (much better than original versions!)
            await this.loadEffect('air_horn', this.createBetterAirHornSound());
            await this.loadEffect('scratch', this.createBetterScratchSound());
            await this.loadEffect('laser', this.createBetterLaserSound());
            await this.loadEffect('impact', this.createBetterImpactSound());
            await this.loadEffect('whoosh', this.createBetterWhooshSound());
            await this.loadEffect('crowd', this.createBetterCrowdSound());
            await this.loadEffect('siren', this.createBetterSirenSound());
            
            this.isReady = true;
            console.log(`✅ ${this.effects.size} enhanced DJ effects loaded and ready!`);
            return this.effects.size;
            
        } catch (error) {
            console.error('❌ Failed to load DJ effects:', error);
            return 0;
        }
    }

    async loadEffect(name, audioDataUrl) {
        try {
            const audio = new Audio(audioDataUrl);
            audio.preload = 'auto';
            audio.volume = this.volume;
            
            // Wait for audio to be ready
            await new Promise((resolve, reject) => {
                audio.addEventListener('canplaythrough', resolve, { once: true });
                audio.addEventListener('error', reject, { once: true });
                audio.load();
            });
            
            this.effects.set(name, audio);
            console.log(`✅ Loaded ${name} effect`);
            
        } catch (error) {
            console.warn(`⚠️ Failed to load ${name} effect:`, error);
        }
    }

    createBetterAirHornSound() {
        // MUCH better air horn - layered frequencies like real air horns
        return this.generateWaveformDataURL(1.5, (t) => {
            // Multiple harmonically related frequencies
            const fundamental = 330; // Lower base frequency
            const envelope = Math.exp(-t * 1.2) * (t < 0.15 ? t * 6.67 : 1);
            
            // Air horn frequencies (based on actual air horn spectral analysis)
            const freq1 = Math.sin(2 * Math.PI * fundamental * t);
            const freq2 = Math.sin(2 * Math.PI * (fundamental * 1.5) * t) * 0.8;
            const freq3 = Math.sin(2 * Math.PI * (fundamental * 2) * t) * 0.6;
            const freq4 = Math.sin(2 * Math.PI * (fundamental * 2.5) * t) * 0.4;
            const freq5 = Math.sin(2 * Math.PI * (fundamental * 3) * t) * 0.3;
            
            // Add some controlled noise for realism
            const noise = (Math.random() * 2 - 1) * 0.1 * envelope;
            
            // Frequency modulation for more realistic sound
            const vibrato = 1 + Math.sin(2 * Math.PI * 5 * t) * 0.02;
            
            return (freq1 + freq2 + freq3 + freq4 + freq5) * envelope * vibrato * 0.9 + noise;
        });
    }

    createBetterScratchSound() {
        // Realistic turntable scratch with frequency modulation
        return this.generateWaveformDataURL(0.8, (t) => {
            const envelope = Math.sin(Math.PI * t / 0.8) * (1 - t / 0.8);
            
            // Simulate vinyl record groove noise + pitch modulation
            const baseFreq = 150 + 100 * Math.sin(t * 15); // Pitch bending
            const vinylNoise = (Math.random() * 2 - 1) * 0.3;
            const scratchTone = Math.sin(2 * Math.PI * baseFreq * t) * 0.4;
            
            // Add high frequency scratch artifacts
            const artifacts = Math.sin(2 * Math.PI * (baseFreq * 4) * t) * 0.2;
            
            // Rhythmic scratching pattern
            const scratchPattern = Math.abs(Math.sin(t * 8)) > 0.7 ? 1 : 0.3;
            
            return (scratchTone + vinylNoise + artifacts) * envelope * scratchPattern * 0.8;
        });
    }

    createBetterLaserSound() {
        // Epic electronic laser sweep like EDM festivals
        return this.generateWaveformDataURL(2.0, (t) => {
            // Exponential frequency sweep for more dramatic effect
            const startFreq = 3000;
            const endFreq = 200;
            const progress = t / 2.0;
            const freq = startFreq * Math.exp(-progress * Math.log(startFreq / endFreq));
            
            const envelope = Math.sin(Math.PI * progress) * Math.exp(-progress * 0.5);
            
            // Layer multiple oscillators for richness
            const osc1 = Math.sin(2 * Math.PI * freq * t);
            const osc2 = Math.sin(2 * Math.PI * freq * 1.005 * t) * 0.8; // Slight detune
            const osc3 = Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.4; // Sub oscillator
            
            // Add filter resonance simulation
            const resonance = Math.sin(2 * Math.PI * freq * 2 * t) * 0.2;
            
            return (osc1 + osc2 + osc3 + resonance) * envelope * 0.7;
        });
    }

    createBetterImpactSound() {
        // Massive bass drop impact like festival sound systems
        return this.generateWaveformDataURL(0.6, (t) => {
            // Sharp attack envelope
            const envelope = Math.exp(-t * 8);
            
            // Sub bass frequencies
            const subBass = Math.sin(2 * Math.PI * 40 * t) * 0.9;
            const kick = Math.sin(2 * Math.PI * 60 * t) * 0.7;
            const punch = Math.sin(2 * Math.PI * 80 * t) * 0.5;
            
            // Sharp transient click for attack
            const click = Math.sin(2 * Math.PI * 3000 * t) * Math.exp(-t * 30) * 0.4;
            
            // Harmonic distortion for grit
            const distortion = Math.sin(2 * Math.PI * 120 * t) * 0.3;
            
            return (subBass + kick + punch + click + distortion) * envelope * 0.95;
        });
    }

    createBetterWhooshSound() {
        // Smooth transition whoosh with frequency sweep
        return this.generateWaveformDataURL(1.2, (t) => {
            const envelope = Math.sin(Math.PI * t / 1.2);
            const freq = 200 + 800 * Math.sin(Math.PI * t / 1.2);
            
            // Layer filtered noise with tonal component
            const noise = (Math.random() * 2 - 1) * 0.6;
            const tone = Math.sin(2 * Math.PI * freq * t) * 0.3;
            
            return (noise + tone) * envelope * 0.5;
        });
    }

    createBetterCrowdSound() {
        // Stadium crowd cheer with realistic buildup
        return this.generateWaveformDataURL(2.5, (t) => {
            const envelope = Math.min(1, t / 0.5) * Math.sin(Math.PI * t / 2.5);
            
            // Multiple frequency bands for crowd simulation
            const lowRoar = (Math.random() * 2 - 1) * 0.4;
            const midCheer = (Math.random() * 2 - 1) * 0.3 * Math.sin(t * 3);
            const highWhoops = (Math.random() * 2 - 1) * 0.2 * Math.sin(t * 8);
            
            return (lowRoar + midCheer + highWhoops) * envelope * 0.7;
        });
    }

    createBetterSirenSound() {
        // Epic festival siren buildup
        return this.generateWaveformDataURL(3.0, (t) => {
            const envelope = Math.min(1, t / 0.8) * Math.sin(Math.PI * t / 3.0);
            
            // Siren with accelerating frequency modulation
            const baseFreq = 400;
            const modSpeed = 2 + (t / 3.0) * 4; // Accelerating modulation
            const freq = baseFreq + 300 * Math.sin(2 * Math.PI * modSpeed * t);
            
            const osc1 = Math.sin(2 * Math.PI * freq * t);
            const osc2 = Math.sin(2 * Math.PI * freq * 1.01 * t) * 0.8; // Slight detune
            
            return (osc1 + osc2) * envelope * 0.8;
        });
    }

    createWhooshSound() {
        // Create smooth whoosh transition
        return this.generateWaveformDataURL(1.0, (t) => {
            const envelope = Math.sin(Math.PI * t / 1.0);
            return (Math.random() * 2 - 1) * envelope * 0.4;
        });
    }

    createCrowdSound() {
        // Create crowd cheer effect
        return this.generateWaveformDataURL(1.8, (t) => {
            const envelope = Math.min(1, t / 0.3) * Math.sin(Math.PI * t / 1.8);
            return (Math.random() * 2 - 1) * envelope * 0.6;
        });
    }

    createSirenSound() {
        // Create rave siren buildup
        return this.generateWaveformDataURL(2.5, (t) => {
            const freq = 200 + 600 * Math.sin(t * 2);
            const envelope = Math.min(1, t / 0.5);
            return Math.sin(2 * Math.PI * freq * t) * envelope * 0.7;
        });
    }

    generateWaveformDataURL(duration, waveformFunction) {
        const sampleRate = 44100;
        const samples = Math.floor(sampleRate * duration);
        const buffer = new ArrayBuffer(44 + samples * 2);
        const view = new DataView(buffer);
        
        // WAV file header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + samples * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, samples * 2, true);
        
        // Generate audio samples
        for (let i = 0; i < samples; i++) {
            const t = i / sampleRate;
            const sample = waveformFunction(t);
            const clampedSample = Math.max(-1, Math.min(1, sample));
            view.setInt16(44 + i * 2, clampedSample * 0x7FFF, true);
        }
        
        const blob = new Blob([buffer], { type: 'audio/wav' });
        return URL.createObjectURL(blob);
    }

    // Layered effect playback - plays ON TOP of Spotify music!
    async playEffect(effectName, volume = null) {
        if (!this.isReady) {
            console.warn('⚠️ Simple effects not ready yet');
            return false;
        }

        const audio = this.effects.get(effectName);
        if (!audio) {
            console.warn(`⚠️ Effect not found: ${effectName}`);
            return false;
        }

        try {
            // Set volume for layering (slightly louder to cut through music)
            if (volume !== null) {
                audio.volume = Math.max(0, Math.min(1, volume));
            } else {
                // Default volumes optimized for layering over music
                const layeredVolumes = {
                    'air_horn': 0.9,  // Air horns need to be heard!
                    'scratch': 0.8,   // Scratches cut through
                    'laser': 0.7,     // Lasers pierce through
                    'impact': 0.9,    // Impacts need punch
                    'whoosh': 0.5,    // Whooshes are subtle
                    'crowd': 0.6,     // Crowd adds energy
                    'siren': 0.8      // Sirens build tension
                };
                audio.volume = layeredVolumes[effectName] || 0.7;
            }
            
            // Reset to beginning and play (will layer with Spotify music)
            audio.currentTime = 0;
            
            // Clone the audio if we want to play multiple instances
            const audioClone = audio.cloneNode();
            audioClone.volume = audio.volume;
            await audioClone.play();
            
            console.log(`🔊 LAYERED: ${effectName} over music (volume: ${audioClone.volume.toFixed(2)})`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to layer ${effectName}:`, error);
            return false;
        }
    }

    // Play multiple effects simultaneously (for complex transitions)
    async playLayeredEffects(effectNames, volumes = null) {
        console.log(`🎛️ Playing ${effectNames.length} layered effects:`, effectNames);
        
        const promises = effectNames.map((effectName, index) => {
            const volume = volumes ? volumes[index] : null;
            return this.playEffect(effectName, volume);
        });
        
        try {
            const results = await Promise.all(promises);
            const successCount = results.filter(r => r).length;
            console.log(`✅ ${successCount}/${effectNames.length} effects layered successfully`);
            return successCount > 0;
        } catch (error) {
            console.error('❌ Failed to play layered effects:', error);
            return false;
        }
    }

    // Set volume for all effects
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        for (const audio of this.effects.values()) {
            audio.volume = this.volume;
        }
        console.log(`🔊 Simple effects volume: ${(this.volume * 100).toFixed(0)}%`);
    }

    // Test an effect (with user feedback)
    async testEffect(effectName) {
        console.log(`🧪 Testing: ${effectName}`);
        const success = await this.playEffect(effectName, 0.8);
        return success;
    }

    // Get available effects
    getAvailableEffects() {
        return Array.from(this.effects.keys());
    }

    // Test all effects in sequence
    async testAllEffects() {
        console.log('🧪 Testing all simple effects...');
        const effects = this.getAvailableEffects();
        
        for (let i = 0; i < effects.length; i++) {
            const effect = effects[i];
            console.log(`Testing ${effect}...`);
            await this.testEffect(effect);
            
            // Wait between tests
            if (i < effects.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
        
        console.log('✅ All simple effects tested!');
    }
}

// Global instance
window.simpleAudioEffects = new SimpleAudioEffects();
console.log('🎵 Simple Audio Effects class loaded');