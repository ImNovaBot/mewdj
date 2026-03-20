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
            console.log('🔊 Loading simple, reliable audio effects...');
            
            // Create simple HTML5 audio elements with data URLs
            await this.loadEffect('air_horn', this.createAirHornSound());
            await this.loadEffect('scratch', this.createScratchSound());
            await this.loadEffect('laser', this.createLaserSound());
            await this.loadEffect('impact', this.createImpactSound());
            await this.loadEffect('whoosh', this.createWhooshSound());
            await this.loadEffect('crowd', this.createCrowdSound());
            await this.loadEffect('siren', this.createSirenSound());
            
            this.isReady = true;
            console.log(`✅ ${this.effects.size} simple audio effects loaded and ready!`);
            return this.effects.size;
            
        } catch (error) {
            console.error('❌ Failed to load simple effects:', error);
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

    createAirHornSound() {
        // Create a loud, attention-grabbing air horn using multiple tones
        return this.generateWaveformDataURL(1.2, (t) => {
            const envelope = Math.exp(-t * 1.5) * (t < 0.1 ? t * 10 : 1);
            const tone1 = Math.sin(2 * Math.PI * 440 * t);
            const tone2 = Math.sin(2 * Math.PI * 880 * t) * 0.5;
            const tone3 = Math.sin(2 * Math.PI * 220 * t) * 0.3;
            return (tone1 + tone2 + tone3) * envelope * 0.8;
        });
    }

    createScratchSound() {
        // Create turntable scratch effect
        return this.generateWaveformDataURL(0.6, (t) => {
            const envelope = 1 - t / 0.6;
            return (Math.random() * 2 - 1) * Math.sin(t * 100) * envelope * 0.6;
        });
    }

    createLaserSound() {
        // Create electronic laser sweep
        return this.generateWaveformDataURL(1.5, (t) => {
            const freq = 2000 - 1500 * (t / 1.5);
            const envelope = Math.sin(Math.PI * t / 1.5);
            return Math.sin(2 * Math.PI * freq * t) * envelope * 0.5;
        });
    }

    createImpactSound() {
        // Create heavy impact/drop sound
        return this.generateWaveformDataURL(0.4, (t) => {
            const envelope = Math.exp(-t * 12);
            const lowFreq = Math.sin(2 * Math.PI * 60 * t);
            const click = Math.sin(2 * Math.PI * 2000 * t) * Math.exp(-t * 50);
            return (lowFreq + click * 0.3) * envelope * 0.9;
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

    // Simple, reliable effect playback
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
            // Set volume
            if (volume !== null) {
                audio.volume = Math.max(0, Math.min(1, volume));
            }
            
            // Reset to beginning and play
            audio.currentTime = 0;
            await audio.play();
            
            console.log(`🔊 PLAYED: ${effectName} (volume: ${audio.volume.toFixed(2)})`);
            return true;
            
        } catch (error) {
            console.error(`❌ Failed to play ${effectName}:`, error);
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