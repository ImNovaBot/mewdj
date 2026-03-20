// MEW's Audio Effects Manager - Real DJ Sound Control
class AudioEffectsManager {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.effectsGain = null;
        this.musicGain = null;
        this.effects = new Map();
        this.isInitialized = false;
        
        // Effect volume levels based on technique
        this.effectVolumes = {
            // Hip-Hop & Rap Effects (loud and impactful)
            'air_horn_triple': 0.8,
            'dj_khaled_vocal': 0.7,
            'scratch_baby': 0.6,
            'rewind': 0.75,
            'gunshot': 0.9,
            
            // Electronic & Rave Effects (cutting through mix)
            'laser_sweep': 0.7,
            'rave_siren': 0.8,
            'whoosh': 0.5,
            'electronic_drop': 0.85,
            'build_up': 0.6,
            
            // Reggaeton & Latin Effects (party energy)
            'dale_horn': 0.8,
            'fuego_vocal': 0.7,
            'party_whistle': 0.6,
            'reggaeton_horn': 0.75,
            
            // Universal Effects (balanced)
            'crowd_cheer': 0.6,
            'applause': 0.5,
            'countdown': 0.8,
            'impact': 0.9,
            'echo_tail': 0.4,
            
            // Default for unknown effects
            'default': 0.6
        };
        
        console.log('🔊 AudioEffectsManager initialized');
    }

    async initialize() {
        if (this.isInitialized) return;
        
        try {
            console.log('🎛️ Initializing MEW\'s audio effects system...');
            
            // Create Web Audio API context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // CRITICAL: Resume audio context (required for autoplay policies)
            if (this.audioContext.state === 'suspended') {
                console.log('🔓 Resuming audio context for effects...');
                await this.audioContext.resume();
            }
            
            // Create audio graph for mixing
            this.masterGain = this.audioContext.createGain();
            this.effectsGain = this.audioContext.createGain();
            this.musicGain = this.audioContext.createGain();
            
            // Connect audio graph
            this.effectsGain.connect(this.masterGain);
            this.musicGain.connect(this.masterGain);
            this.masterGain.connect(this.audioContext.destination);
            
            // Set initial levels (LOUDER for effects!)
            this.masterGain.gain.value = 1.0;      // Master volume
            this.effectsGain.gain.value = 1.0;     // Effects at full volume by default
            this.musicGain.gain.value = 0.8;       // Music lower to make room for effects
            
            await this.loadEffects();
            
            this.isInitialized = true;
            console.log('✅ MEW\'s audio effects system ready!');
            
            // Test with a quiet effect to verify audio works
            setTimeout(() => {
                this.playTestSound();
            }, 1000);
            
        } catch (error) {
            console.error('❌ Failed to initialize audio effects:', error);
        }
    }

    // Test that audio is working
    async playTestSound() {
        try {
            console.log('🔬 Testing audio effects system...');
            
            // Create a simple test beep
            const duration = 0.1;
            const sampleRate = this.audioContext.sampleRate;
            const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
            const data = buffer.getChannelData(0);
            
            for (let i = 0; i < buffer.length; i++) {
                const t = i / sampleRate;
                data[i] = Math.sin(2 * Math.PI * 800 * t) * 0.1; // Quiet test beep
            }
            
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.effectsGain);
            source.start();
            
            console.log('🔊 Audio test completed');
            
        } catch (error) {
            console.error('❌ Audio test failed:', error);
        }
    }

    async loadEffects() {
        console.log('📦 Loading MEW\'s legendary DJ effects...');
        
        // Essential effects for MEW's intelligence
        const effectsToLoad = [
            // Hip-Hop & Rap
            { name: 'air_horn_triple', url: '/effects/air_horn_triple.mp3', fallback: this.generateAirHorn },
            { name: 'scratch_baby', url: '/effects/scratch_baby.wav', fallback: this.generateScratch },
            { name: 'rewind', url: '/effects/rewind.mp3', fallback: this.generateRewind },
            
            // Electronic & Rave  
            { name: 'laser_sweep', url: '/effects/laser_sweep.wav', fallback: this.generateLaser },
            { name: 'rave_siren', url: '/effects/rave_siren.mp3', fallback: this.generateSiren },
            { name: 'whoosh', url: '/effects/whoosh.wav', fallback: this.generateWhoosh },
            
            // Universal
            { name: 'impact', url: '/effects/impact.wav', fallback: this.generateImpact },
            { name: 'crowd_cheer', url: '/effects/crowd_cheer.mp3', fallback: this.generateCrowd },
            { name: 'countdown', url: '/effects/countdown.mp3', fallback: this.generateCountdown },
        ];
        
        for (const effect of effectsToLoad) {
            try {
                // Try to load real audio file first
                const audioBuffer = await this.loadAudioFile(effect.url);
                if (audioBuffer) {
                    this.effects.set(effect.name, audioBuffer);
                    console.log(`✅ Loaded effect: ${effect.name}`);
                } else {
                    // Fallback to generated effect
                    const generatedBuffer = await effect.fallback.call(this);
                    this.effects.set(effect.name, generatedBuffer);
                    console.log(`🔧 Generated fallback: ${effect.name}`);
                }
            } catch (error) {
                console.warn(`⚠️ Failed to load ${effect.name}, using fallback:`, error);
                try {
                    const generatedBuffer = await effect.fallback.call(this);
                    this.effects.set(effect.name, generatedBuffer);
                } catch (genError) {
                    console.error(`❌ Failed to generate ${effect.name}:`, genError);
                }
            }
        }
        
        console.log(`🎵 Loaded ${this.effects.size} DJ effects for MEW's intelligence`);
    }

    async loadAudioFile(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            return audioBuffer;
        } catch (error) {
            return null; // Will use fallback
        }
    }

    // Generate fallback effects using Web Audio API
    async generateAirHorn() {
        const duration = 1.5;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            // Create air horn-like sound (louder sawtooth with envelope)
            const t = i / sampleRate;
            const envelope = Math.exp(-t * 2) * (t < 0.1 ? t * 10 : 1);
            // Mix multiple frequencies for richer air horn sound
            const freq1 = Math.sin(2 * Math.PI * 440 * t);
            const freq2 = Math.sin(2 * Math.PI * 880 * t) * 0.5;
            const freq3 = Math.sin(2 * Math.PI * 220 * t) * 0.3;
            data[i] = (freq1 + freq2 + freq3) * envelope * 0.6; // Louder!
        }
        
        console.log('🎺 Generated air horn effect');
        return buffer;
    }

    async generateScratch() {
        const duration = 0.8;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            // Create scratch-like noise
            const t = i / sampleRate;
            data[i] = (Math.random() * 2 - 1) * Math.sin(t * 50) * 0.4;
        }
        
        return buffer;
    }

    async generateLaser() {
        const duration = 2.0;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            // Create laser sweep sound
            const t = i / sampleRate;
            const freq = 2000 + 1000 * Math.sin(t * 3);
            data[i] = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 0.5) * 0.3;
        }
        
        return buffer;
    }

    async generateSiren() {
        const duration = 3.0;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            // Create siren buildup
            const t = i / sampleRate;
            const freq = 200 + 800 * (t / duration);
            data[i] = Math.sin(2 * Math.PI * freq * t) * 0.4;
        }
        
        return buffer;
    }

    async generateWhoosh() {
        const duration = 1.0;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            // Create whoosh sound (filtered noise)
            const t = i / sampleRate;
            const envelope = Math.sin(Math.PI * t / duration);
            data[i] = (Math.random() * 2 - 1) * envelope * 0.3;
        }
        
        return buffer;
    }

    async generateImpact() {
        const duration = 0.5;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            // Create impact sound (low frequency with sharp attack)
            const t = i / sampleRate;
            const envelope = Math.exp(-t * 10);
            data[i] = Math.sin(2 * Math.PI * 60 * t) * envelope * 0.8;
        }
        
        return buffer;
    }

    async generateCrowd() {
        const duration = 2.0;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            // Create crowd cheer (filtered noise with buildup)
            const t = i / sampleRate;
            data[i] = (Math.random() * 2 - 1) * (t / duration) * 0.5;
        }
        
        return buffer;
    }

    async generateRewind() {
        const duration = 1.2;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            // Create rewind effect (pitch bending down)
            const t = i / sampleRate;
            const freq = 800 * (1 - t / duration);
            data[i] = Math.sin(2 * Math.PI * freq * t) * 0.4;
        }
        
        return buffer;
    }

    async generateCountdown() {
        // This would be more complex - for now, simple beep pattern
        const duration = 2.0;
        const sampleRate = this.audioContext.sampleRate;
        const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            const t = i / sampleRate;
            // Three beeps pattern
            const beep = Math.floor(t * 4) < 3 ? Math.sin(2 * Math.PI * 800 * t) : 0;
            data[i] = beep * 0.3;
        }
        
        return buffer;
    }

    // MEW's intelligent effect playback
    async playEffect(effectName, volume = null, delay = 0) {
        if (!this.isInitialized) {
            console.log('🔄 Audio effects not initialized, initializing now...');
            await this.initialize();
        }

        // Make sure audio context is running
        if (this.audioContext.state === 'suspended') {
            console.log('🔓 Resuming audio context...');
            await this.audioContext.resume();
        }

        const audioBuffer = this.effects.get(effectName);
        if (!audioBuffer) {
            console.warn(`⚠️ Effect not found: ${effectName}`);
            return;
        }

        try {
            console.log(`🎬 Starting effect: ${effectName}`);
            
            // Create audio source
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            source.buffer = audioBuffer;
            
            // Set intelligent volume (LOUDER!)
            const baseVolume = volume !== null ? volume : (this.effectVolumes[effectName] || this.effectVolumes['default']);
            const finalVolume = Math.min(1.0, baseVolume * 1.5); // Boost volume by 50%
            gainNode.gain.value = finalVolume;
            
            // Connect audio graph
            source.connect(gainNode);
            gainNode.connect(this.effectsGain);
            
            // Schedule playback
            const startTime = this.audioContext.currentTime + (delay / 1000);
            source.start(startTime);
            
            console.log(`🔊 MEW playing effect: ${effectName} (volume: ${finalVolume.toFixed(2)}, delay: ${delay}ms, context state: ${this.audioContext.state})`);
            
            // Auto-cleanup
            source.onended = () => {
                console.log(`🔇 Effect ended: ${effectName}`);
                source.disconnect();
                gainNode.disconnect();
            };
            
            // Force a small delay to ensure audio starts
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve(source);
                }, 50);
            });
            
        } catch (error) {
            console.error(`❌ Failed to play effect ${effectName}:`, error);
            throw error;
        }
    }

    // MEW's intelligent volume ducking (lower music during effects)
    duckMusic(duckAmount = 0.3, duration = 1000) {
        if (!this.musicGain) return;
        
        const currentTime = this.audioContext.currentTime;
        const duckTime = duration / 1000;
        
        // Duck down
        this.musicGain.gain.exponentialRampToValueAtTime(
            0.9 * (1 - duckAmount), 
            currentTime + 0.1
        );
        
        // Restore
        this.musicGain.gain.exponentialRampToValueAtTime(
            0.9, 
            currentTime + duckTime
        );
        
        console.log(`🔉 MEW ducking music by ${(duckAmount * 100).toFixed(0)}% for ${duration}ms`);
    }

    // Set master effect volume
    setEffectsVolume(volume) {
        if (this.effectsGain) {
            this.effectsGain.gain.value = Math.max(0, Math.min(1, volume));
            console.log(`🔊 MEW effects volume: ${(volume * 100).toFixed(0)}%`);
        }
    }

    // Set music volume  
    setMusicVolume(volume) {
        if (this.musicGain) {
            this.musicGain.gain.value = Math.max(0, Math.min(1, volume));
            console.log(`🎵 MEW music volume: ${(volume * 100).toFixed(0)}%`);
        }
    }

    // Get available effects
    getAvailableEffects() {
        return Array.from(this.effects.keys());
    }

    // Test all effects
    async testAllEffects() {
        console.log('🧪 Testing all MEW effects...');
        const effects = this.getAvailableEffects();
        
        for (let i = 0; i < effects.length; i++) {
            const effect = effects[i];
            console.log(`Testing ${effect}...`);
            await this.playEffect(effect);
            
            // Wait between tests
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        console.log('✅ All effects tested!');
    }
}

// Global instance
window.audioEffectsManager = new AudioEffectsManager();

console.log('🔊 AudioEffectsManager class loaded');