/**
 * Crashoria: Ultimate Road Adventure - BeamNG Soft-Body Physics Edition
 * Enhanced Procedural Web Audio Synthesizer (V12/V8/Rotary Engine, Metal Crumple, Glass Shatter, NOS, BGM)
 */

(function (global) {
    'use strict';

    class RacingAudioEngine {
        constructor() {
            this.ctx = null;
            this.masterGainNode = null;
            this.bgmGainNode = null;
            this.sfxGainNode = null;
            this.sfxEnabled = true;
            this.bgmMode = 1; // 1: Cyber Synthwave, 2: Nitro Eurobeat, 3: Dark Overdrive, 4: Police Pursuit, 5: Destruction Derby, 6: Canyon Rock, 0: OFF
            this.masterVolume = 1.0;
            this.bgmVolume = 1.0;
            this.sfxVolume = 1.0;
            this.isPlayingEngine = false;
            this.engineOsc1 = null;
            this.engineOsc2 = null;
            this.engineSub = null;
            this.engineFilter = null;
            this.engineGain = null;
            this.bgmTimer = null;
            this.bgmStep = 0;
            this.lastGear = 1;
            this.lastEngineVol = 0;
            this.lastCrashSfxTime = 0;
            this.lastBurstSfxTime = 0;
            this.lastScreechSfxTime = 0;
            this.lastHornSfxTime = 0;
            this.lastNosSfxTime = 0;

            // Restore saved settings
            try {
                const savedBgmMode = localStorage.getItem('crashoria_bgm_mode');
                if (savedBgmMode !== null) this.bgmMode = parseInt(savedBgmMode, 10);
                const savedBgmVol = localStorage.getItem('crashoria_bgm_vol');
                if (savedBgmVol !== null) this.bgmVolume = parseFloat(savedBgmVol);
                const savedSfxVol = localStorage.getItem('crashoria_sfx_vol');
                if (savedSfxVol !== null) this.sfxVolume = parseFloat(savedSfxVol);
                const savedSfxEn = localStorage.getItem('crashoria_sfx_enabled');
                if (savedSfxEn !== null) this.sfxEnabled = savedSfxEn === '1';
            } catch (e) {}

            if (typeof window !== 'undefined') {
                try {
                    this.init();
                } catch (e) {}

                /* navigator.mediaDevices permanently removed: camera/mic hardware is never queried */

                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) {
                        if (this.masterGainNode && this.ctx) {
                            this.masterGainNode.gain.setValueAtTime(0, this.ctx.currentTime);
                        }
                    } else {
                        if (this.masterGainNode && this.ctx) {
                            this.masterGainNode.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
                        }
                    }
                });

                window.addEventListener('beforeunload', () => {
                    this.stopAllAudio();
                    if (this.ctx && this.ctx.state !== 'closed') {
                        this.ctx.close().catch(() => {});
                    }
                });
            }
        }

        stopAllAudio() {
            this.stopBGM();
            this.stopEngine();
            if (this.masterGainNode && this.ctx && this.ctx.currentTime) {
                this.masterGainNode.gain.setValueAtTime(0, this.ctx.currentTime);
            }
        }

        ensureActive() {
            if (!this.ctx || this.ctx.state === 'closed') {
                this.ctx = null;
                this.init();
                return;
            }
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
        }

        init() {
            if (!this.ctx || this.ctx.state === 'closed') {
                try {
                    const AudioCtx = window.AudioContext || window.webkitAudioContext;
                    if (!AudioCtx) return;
                    this.ctx = new AudioCtx();

                    // Master output channel connected directly to hardware destination
                    this.masterGainNode = this.ctx.createGain();
                    this.masterGainNode.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
                    this.masterGainNode.connect(this.ctx.destination);

                    // Dedicated clean BGM channel
                    this.bgmGainNode = this.ctx.createGain();
                    this.bgmGainNode.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
                    this.bgmGainNode.connect(this.masterGainNode);

                    // Dedicated clean SFX channel
                    this.sfxGainNode = this.ctx.createGain();
                    this.sfxGainNode.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
                    this.sfxGainNode.connect(this.masterGainNode);

                    this.setupEngineSound();
                    this.startBGMSequencer();
                } catch (e) {
                    console.warn('Web Audio API not supported:', e);
                }
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
        }

        setBgmVolume(val) {
            this.bgmVolume = Math.max(0, Math.min(2.0, val));
            try { localStorage.setItem('crashoria_bgm_vol', this.bgmVolume); } catch (e) {}
            if (this.bgmGainNode && this.ctx) {
                this.bgmGainNode.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
            }
        }

        setSfxVolume(val) {
            this.sfxVolume = Math.max(0, Math.min(2.0, val));
            try { localStorage.setItem('crashoria_sfx_vol', this.sfxVolume); } catch (e) {}
            if (this.sfxGainNode && this.ctx) {
                this.sfxGainNode.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
            }
        }

        testSound() {
            this.ensureActive();
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            this.playEtcDing(true);
            setTimeout(() => {
                this.playTurboBlowoff();
            }, 180);
        }

        setupEngineSound() {
            if (!this.ctx) return;
            try {
                this.engineOsc1 = this.ctx.createOscillator();
                this.engineOsc2 = this.ctx.createOscillator();
                this.engineSub = this.ctx.createOscillator();
                this.engineFilter = this.ctx.createBiquadFilter();
                this.engineGain = this.ctx.createGain();

                this.engineOsc1.type = 'sawtooth';
                this.engineOsc2.type = 'triangle';
                this.engineSub.type = 'square';

                this.engineOsc1.frequency.value = 55;
                this.engineOsc2.frequency.value = 110;
                this.engineSub.frequency.value = 27.5;

                this.engineFilter.type = 'lowpass';
                this.engineFilter.frequency.value = 520;

                this.engineGain.gain.value = 0.0001;

                const subGain = this.ctx.createGain();
                subGain.gain.value = 0.45;
                this.engineSub.connect(subGain);
                subGain.connect(this.engineFilter);

                this.engineOsc1.connect(this.engineFilter);
                this.engineOsc2.connect(this.engineFilter);
                this.engineFilter.connect(this.engineGain);
                this.engineGain.connect(this.sfxGainNode || this.ctx.destination);

                this.engineOsc1.start();
                this.engineOsc2.start();
                this.engineSub.start();
                this.isPlayingEngine = true;
            } catch (err) {
                console.warn('Engine sound init warning:', err);
            }
        }

        startBGMSequencer() {
            if (this.bgmTimer) clearInterval(this.bgmTimer);
            this.bgmTimer = setInterval(() => {
                if (!this.ctx || this.ctx.state === 'closed') {
                    this.init();
                    return;
                }
                if (this.bgmMode === 0) return;
                if (this.ctx.state === 'suspended') {
                    this.ctx.resume().catch(() => {});
                    return;
                }
                if (this.ctx.state !== 'running') return;
                this.playBGMStep(this.bgmStep);
                this.bgmStep = (this.bgmStep + 1) % 32;
            }, 108);
        }

        playBGMStep(step) {
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const dest = this.bgmGainNode || this.ctx.destination;

            const bassPatterns = {
                1: [55, 55, 110, 55, 65.4, 65.4, 130.8, 65.4, 73.4, 73.4, 146.8, 73.4, 61.7, 61.7, 123.5, 82.4],
                2: [65.4, 130.8, 65.4, 130.8, 73.4, 146.8, 73.4, 146.8, 82.4, 164.8, 82.4, 164.8, 77.8, 155.6, 98.0, 196.0],
                3: [41.2, 41.2, 41.2, 82.4, 43.65, 43.65, 41.2, 41.2, 49.0, 49.0, 46.25, 46.25, 41.2, 82.4, 61.7, 55.0],
                4: [73.4, 73.4, 146.8, 73.4, 82.4, 82.4, 164.8, 82.4, 98.0, 98.0, 196.0, 98.0, 87.3, 87.3, 174.6, 82.4],
                5: [36.7, 36.7, 73.4, 36.7, 36.7, 73.4, 36.7, 73.4, 41.2, 41.2, 82.4, 41.2, 38.9, 38.9, 77.8, 43.7],
                6: [49.0, 98.0, 49.0, 73.4, 55.0, 110.0, 55.0, 82.4, 61.7, 123.5, 61.7, 98.0, 55.0, 110.0, 49.0, 73.4]
            };
            const leadPatterns = {
                1: [440, 0, 523.3, 659.3, 587.3, 0, 523.3, 440, 392, 0, 440, 523.3, 659.3, 587.3, 523.3, 493.9],
                2: [523.3, 659.3, 784.0, 659.3, 587.3, 698.5, 880.0, 698.5, 659.3, 784.0, 987.8, 784.0, 880.0, 784.0, 659.3, 587.3],
                3: [329.6, 0, 349.2, 0, 329.6, 392.0, 0, 349.2, 329.6, 0, 293.7, 0, 261.6, 293.7, 329.6, 246.9],
                4: [587.3, 784.0, 880.0, 1174.7, 880.0, 784.0, 659.3, 587.3, 659.3, 880.0, 987.8, 1174.7, 987.8, 880.0, 784.0, 659.3],
                5: [293.7, 0, 311.1, 0, 293.7, 0, 349.2, 0, 329.6, 0, 293.7, 0, 261.6, 277.2, 293.7, 0],
                6: [392.0, 493.9, 587.3, 493.9, 440.0, 554.4, 659.3, 554.4, 493.9, 622.3, 740.0, 622.3, 440.0, 554.4, 392.0, 493.9]
            };

            const bassFreq = bassPatterns[this.bgmMode]?.[step % 16];
            const leadFreq = leadPatterns[this.bgmMode]?.[Math.floor(step / 2) % 16];

            // 1. Energetic Driving Bassline (High presence, rich harmonic low-end)
            if (bassFreq) {
                const bOsc = this.ctx.createOscillator();
                const bFilter = this.ctx.createBiquadFilter();
                const bGain = this.ctx.createGain();
                bOsc.type = 'sawtooth';
                bOsc.frequency.setValueAtTime(bassFreq, now);
                bFilter.type = 'lowpass';
                bFilter.frequency.setValueAtTime(880, now);
                bFilter.frequency.exponentialRampToValueAtTime(240, now + 0.10);
                bGain.gain.setValueAtTime(0.26, now);
                bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
                bOsc.connect(bFilter);
                bFilter.connect(bGain);
                bGain.connect(dest);
                bOsc.start(now);
                bOsc.stop(now + 0.12);
            }

            // 2. Singing Cyber Synth Lead Melody
            if (step % 2 === 0 && leadFreq > 0) {
                const lOsc = this.ctx.createOscillator();
                const lGain = this.ctx.createGain();
                lOsc.type = this.bgmMode === 2 ? 'sawtooth' : 'square';
                lOsc.frequency.setValueAtTime(leadFreq, now);
                lGain.gain.setValueAtTime(0.18, now);
                lGain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
                lOsc.connect(lGain);
                lGain.connect(dest);
                lOsc.start(now);
                lOsc.stop(now + 0.21);
            }

            // 3. Punchy 4-on-the-Floor Kick Drum
            if (step % 4 === 0) {
                const kOsc = this.ctx.createOscillator();
                const kGain = this.ctx.createGain();
                kOsc.type = 'sine';
                kOsc.frequency.setValueAtTime(160, now);
                kOsc.frequency.exponentialRampToValueAtTime(36, now + 0.12);
                kGain.gain.setValueAtTime(0.35, now);
                kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
                kOsc.connect(kGain);
                kGain.connect(dest);
                kOsc.start(now);
                kOsc.stop(now + 0.14);
            }

            // 4. Snare / Clap on Beats 2 and 4 (Steps 4 and 12)
            if (step % 8 === 4) {
                const sBufSize = Math.floor(this.ctx.sampleRate * 0.12);
                const sBuf = this.ctx.createBuffer(1, sBufSize, this.ctx.sampleRate);
                const sData = sBuf.getChannelData(0);
                for (let i = 0; i < sBufSize; i++) {
                    sData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sBufSize * 0.32));
                }
                const sSrc = this.ctx.createBufferSource();
                sSrc.buffer = sBuf;
                const sFilter = this.ctx.createBiquadFilter();
                sFilter.type = 'highpass';
                sFilter.frequency.setValueAtTime(1100, now);
                const sGain = this.ctx.createGain();
                sGain.gain.setValueAtTime(0.20, now);
                sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                sSrc.connect(sFilter);
                sFilter.connect(sGain);
                sGain.connect(dest);
                sSrc.start(now);
            }

            // 5. Crisp 16th-note Hi-Hat Cymbal on Offbeats
            if (step % 2 === 1) {
                const hBufSize = Math.floor(this.ctx.sampleRate * 0.045);
                const hBuf = this.ctx.createBuffer(1, hBufSize, this.ctx.sampleRate);
                const hData = hBuf.getChannelData(0);
                for (let i = 0; i < hBufSize; i++) {
                    hData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (hBufSize * 0.22));
                }
                const hSrc = this.ctx.createBufferSource();
                hSrc.buffer = hBuf;
                const hFilter = this.ctx.createBiquadFilter();
                hFilter.type = 'highpass';
                hFilter.frequency.setValueAtTime(7500, now);
                const hGain = this.ctx.createGain();
                hGain.gain.setValueAtTime(0.08, now);
                hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
                hSrc.connect(hFilter);
                hFilter.connect(hGain);
                hGain.connect(dest);
                hSrc.start(now);
            }
        }

        updateEngine(speedKmh, isAccelerating, gameActive, carKey = 'HYPER', timeScale = 1.0) {
            this.ensureActive();
            if (!this.ctx || !this.isPlayingEngine) return;
            if (!this.sfxEnabled || !gameActive) {
                if (this.engineGain && this.lastEngineVol !== 0.0001) {
                    this.lastEngineVol = 0.0001;
                    this.engineGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
                }
                return;
            }

            const safeSpeed = Number.isFinite(speedKmh) ? Math.max(0, Math.min(460, speedKmh)) : 100;
            const gearRatios = [0, 68, 122, 178, 235, 295, 440];
            let gear = 1;
            for (let i = 1; i < gearRatios.length; i++) {
                if (safeSpeed >= gearRatios[i - 1]) gear = i;
            }
            if (gear > this.lastGear) {
                this.playTurboBlowoff();
            }
            this.lastGear = gear;

            const minSpd = gearRatios[gear - 1];
            const maxSpd = gearRatios[gear];
            const rpmNormalized = Math.min(1, Math.max(0.15, (safeSpeed - minSpd) / (maxSpd - minSpd)));

            const pitchMap = {
                FORMULA_APEX: 1.55,
                PROTOTYPE: 1.35,
                ROTARY_FD: 1.28,
                DRIFT: 1.25,
                PORSCHE_TURBO: 1.18,
                HYPER_GT3: 1.16,
                JDM: 1.12,
                POLICE_INTERCEPTOR: 1.12,
                EVO_IX: 1.10,
                WRX_STI: 1.08,
                DEVIL_Z: 1.05,
                HYPER: 1.0,
                CYBERTRUCK: 0.85,
                HELLCAT: 0.78,
                INTERCEPTOR: 0.76,
                CHARGER_69: 0.72,
                GOLIATH: 0.68,
                DEKOTORA: 0.62
            };
            const pitchMultiplier = (pitchMap[carKey] || 1.0) * (0.55 + 0.45 * timeScale);
            const baseFreq = Math.min(380, Math.max(38, (48 + rpmNormalized * 135 + (safeSpeed * 0.18)) * pitchMultiplier));

            this.engineOsc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.04);
            this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.5, this.ctx.currentTime, 0.04);
            this.engineSub.frequency.setTargetAtTime(baseFreq * 0.5, this.ctx.currentTime, 0.04);
            this.engineFilter.frequency.setTargetAtTime(360 + rpmNormalized * 700, this.ctx.currentTime, 0.05);

            const targetVol = isAccelerating ? 0.22 : 0.13;
            if (Math.abs((this.lastEngineVol || 0) - targetVol) > 0.01) {
                this.lastEngineVol = targetVol;
                this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.08);
            }
        }

        playTurboBlowoff() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;
            const bufSize = Math.floor(this.ctx.sampleRate * 0.18);
            const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.35));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(3200, now);
            filter.frequency.exponentialRampToValueAtTime(1400, now + 0.16);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.20, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }

        playNosRoar() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            if (now - this.lastNosSfxTime < 0.22) return;
            this.lastNosSfxTime = now;

            const dest = this.sfxGainNode || this.ctx.destination;
            const bufSize = Math.floor(this.ctx.sampleRate * 0.28);
            const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.6));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1100, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.26, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }

        playTireScreech() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            if (now - this.lastScreechSfxTime < 0.28) return;
            this.lastScreechSfxTime = now;

            const dest = this.sfxGainNode || this.ctx.destination;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(980, now);
            osc.frequency.linearRampToValueAtTime(740, now + 0.2);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.23);
        }

        playTireBurst() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            if (now - this.lastBurstSfxTime < 0.35) return;
            this.lastBurstSfxTime = now;

            const dest = this.sfxGainNode || this.ctx.destination;
            const bufSize = Math.floor(this.ctx.sampleRate * 0.30);
            const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.09));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1200, now);
            filter.frequency.exponentialRampToValueAtTime(320, now + 0.26);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }

        playEtcDing(success = true) {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = success ? 'sine' : 'triangle';
            if (success) {
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.setValueAtTime(1318.5, now + 0.08);
            } else {
                osc.frequency.setValueAtTime(240, now);
                osc.frequency.setValueAtTime(180, now + 0.12);
            }
            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.29);
        }

        /**
         * Realistic BeamNG-style multi-layered Metal Crumple + Crunch + Glass Shatter sound
         */
        playCrash(intensity = 1.0) {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            if (now - this.lastCrashSfxTime < 0.22) return;
            this.lastCrashSfxTime = now;

            const dest = this.sfxGainNode || this.ctx.destination;
            const safeIntensity = Number.isFinite(intensity) ? Math.min(1.5, Math.max(0.2, intensity)) : 0.6;
            const duration = 0.28 + safeIntensity * 0.24;

            // 1. Metallic crunch noise burst
            const bufferSize = Math.floor(this.ctx.sampleRate * duration);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                const foldMod = 0.7 + 0.3 * Math.sin(i * 0.045);
                data[i] = (Math.random() * 2 - 1) * foldMod * Math.exp(-i / (this.ctx.sampleRate * 0.14));
            }

            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(560, now);
            filter.Q.setValueAtTime(1.4, now);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.32 + safeIntensity * 0.24, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);

            // 2. Heavy chassis thud sub-bass
            const osc = this.ctx.createOscillator();
            const oscGain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(125, now);
            osc.frequency.exponentialRampToValueAtTime(30, now + 0.22);
            oscGain.gain.setValueAtTime(0.32, now);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
            osc.connect(oscGain);
            oscGain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.24);

            // 3. High-frequency glass tinkle on heavy impacts
            if (safeIntensity > 0.65) {
                for (let g = 0; g < 3; g++) {
                    const gOsc = this.ctx.createOscillator();
                    const gGain = this.ctx.createGain();
                    gOsc.type = 'sine';
                    gOsc.frequency.setValueAtTime(2400 + Math.random() * 2200, now + g * 0.04);
                    gGain.gain.setValueAtTime(0.08, now + g * 0.04);
                    gGain.gain.exponentialRampToValueAtTime(0.001, now + g * 0.04 + 0.10);
                    gOsc.connect(gGain);
                    gGain.connect(dest);
                    gOsc.start(now + g * 0.04);
                    gOsc.stop(now + g * 0.04 + 0.11);
                }
            }
        }

        playOvertake() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(520, now);
            osc.frequency.exponentialRampToValueAtTime(1180, now + 0.14);
            gain.gain.setValueAtTime(0.24, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.16);
        }

        playHorn(isAggressive = true) {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            if (now - this.lastHornSfxTime < 0.45) return;
            this.lastHornSfxTime = now;

            const dest = this.sfxGainNode || this.ctx.destination;
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc1.type = 'sawtooth';
            osc2.type = 'sawtooth';
            osc1.frequency.setValueAtTime(isAggressive ? 415 : 490, now);
            osc2.frequency.setValueAtTime(isAggressive ? 520 : 620, now);

            const dur = isAggressive ? 0.32 : 0.24;
            gain.gain.setValueAtTime(0.26, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(dest);
            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + dur + 0.02);
            osc2.stop(now + dur + 0.02);
        }

        /**
         * Heavy Wood Log Impact: Deep hollow trunk thud with splintering resonance
         */
        playWoodImpact() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            // 1. Deep hollow wooden body resonance
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);
            gain.gain.setValueAtTime(0.38, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.38);

            // 2. High splinter crack noise burst
            const bufSize = Math.floor(this.ctx.sampleRate * 0.18);
            const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2.5);
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1850, now);
            filter.Q.setValueAtTime(2.2, now);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.22, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(dest);
            noise.start(now);
        }

        /**
         * Granular Sand & Gravel Friction Drag: Gritty rushing sound when front bumper grinds through sand
         */
        playSandGravelDrag() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            const bufSize = Math.floor(this.ctx.sampleRate * 0.28);
            const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                // Granular irregular modulation
                const grit = 0.6 + 0.4 * Math.sin(i * 0.08);
                data[i] = (Math.random() * 2 - 1) * grit * Math.pow(1 - i / bufSize, 0.7);
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1250, now);
            filter.Q.setValueAtTime(1.1, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.19, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }

        playCrashSound(damage = 20) {
            this.ensureActive();
            this.playCrash(damage / 25);
        }

        /**
         * Tokyo Highway Orvis Speed Camera: Flash snapshot shutter click or radar jam chime
         */
        playOrvisFlash(success = false) {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            if (success) {
                // High-tech radar jammer electronic dual-chirp
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.setValueAtTime(1760, now + 0.08);
                gain.gain.setValueAtTime(0.24, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
                osc.connect(gain);
                gain.connect(dest);
                osc.start(now);
                osc.stop(now + 0.24);
            } else {
                // Mechanical high-voltage xenon flash discharge + shutter click + alarm warble
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(1420, now);
                osc.frequency.exponentialRampToValueAtTime(440, now + 0.28);
                gain.gain.setValueAtTime(0.32, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
                osc.connect(gain);
                gain.connect(dest);
                osc.start(now);
                osc.stop(now + 0.32);
            }
        }

        /**
         * Shuto C1 Tunnel: Cybernetic Boost Pad supersonic warp surge
         */
        playCyberBoost() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            // Pitch ascending supersonic sweep
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(1650, now + 0.42);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(500, now);
            filter.frequency.exponentialRampToValueAtTime(2800, now + 0.42);
            filter.Q.setValueAtTime(3.5, now);

            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.46);
        }

        /**
         * Inferno Industrial: High-pressure flaming pipeline burst
         */
        playFlameRoar() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            const bufSize = Math.floor(this.ctx.sampleRate * 0.42);
            const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                const env = Math.sin((i / bufSize) * Math.PI);
                data[i] = (Math.random() * 2 - 1) * env;
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(420, now);
            filter.frequency.linearRampToValueAtTime(850, now + 0.15);
            filter.frequency.exponentialRampToValueAtTime(220, now + 0.42);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }

        /**
         * Blizzard Snow: Black Ice slick gliding tire hiss
         */
        playIceSkid() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            const bufSize = Math.floor(this.ctx.sampleRate * 0.30);
            const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 0.4);
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(2400, now);
            filter.Q.setValueAtTime(0.8, now);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }

        /**
         * In-Run Bounty / Mission Complete fanfare chime
         */
        playBountyComplete() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            notes.forEach((freq, idx) => {
                const noteTime = now + idx * 0.08;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, noteTime);
                gain.gain.setValueAtTime(0.24, noteTime);
                gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.32);
                osc.connect(gain);
                gain.connect(dest);
                osc.start(noteTime);
                osc.stop(noteTime + 0.34);
            });
        }

        /**
         * Burnout / Takedown Crash chord for wrecking cop or road-rage cars
         */
        playTakedown() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            // Sub-bass heavy drop
            const sub = this.ctx.createOscillator();
            const subGain = this.ctx.createGain();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(160, now);
            sub.frequency.exponentialRampToValueAtTime(32, now + 0.45);
            subGain.gain.setValueAtTime(0.45, now);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
            sub.connect(subGain);
            subGain.connect(dest);
            sub.start(now);
            sub.stop(now + 0.50);

            // Metallic crunch
            this.playCrash(1.4);
        }

        /**
         * Slipstream drafting suction whistle
         */
        playSlipstream() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(620, now);
            osc.frequency.exponentialRampToValueAtTime(980, now + 0.18);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.22);
        }

        /**
         * Authentic Highway Patrol Police Wailing Siren
         */
        playPoliceSiren(intensity = 1.0) {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            if (this.lastSirenTime && (now - this.lastSirenTime < 0.65)) return;
            this.lastSirenTime = now;

            const dest = this.sfxGainNode || this.ctx.destination;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            const f1 = 640;
            const f2 = 980;
            osc.frequency.setValueAtTime(f1, now);
            osc.frequency.linearRampToValueAtTime(f2, now + 0.32);
            osc.frequency.linearRampToValueAtTime(f1, now + 0.64);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1450, now);
            filter.Q.setValueAtTime(2.0, now);

            const safeInt = Math.max(0.05, Math.min(1.0, intensity));
            const vol = 0.16 * safeInt;
            gain.gain.setValueAtTime(vol, now);
            gain.gain.setValueAtTime(vol, now + 0.58);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.66);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.68);
        }

        playHazardClick() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(1450, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.035);

            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.04);
        }

        playPassingFlash() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(2400, now);
            osc.frequency.exponentialRampToValueAtTime(3600, now + 0.09);

            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.13);
        }

        playMiniTurbo(isSuper = false) {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = isSuper ? 'sawtooth' : 'triangle';
            const startFreq = isSuper ? 480 : 340;
            const endFreq = isSuper ? 1420 : 980;
            const dur = isSuper ? 0.65 : 0.45;

            osc.frequency.setValueAtTime(startFreq, now);
            osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);

            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + dur + 0.02);
        }

        playExplosion() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;
            const duration = 1.4;
            const bufferSize = Math.floor(this.ctx.sampleRate * duration);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.8);
            }

            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(750, now);
            filter.frequency.exponentialRampToValueAtTime(65, now + duration);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }
        /**
         * Exhaust Antilag / Backfire pop gunshot
         */
        playBackfire(pitchMult = 1.0) {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            // Sharp metallic snap
            const snap = this.ctx.createOscillator();
            const snapGain = this.ctx.createGain();
            snap.type = 'triangle';
            snap.frequency.setValueAtTime(320 * pitchMult, now);
            snap.frequency.exponentialRampToValueAtTime(45, now + 0.08);
            snapGain.gain.setValueAtTime(0.35, now);
            snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
            snap.connect(snapGain);
            snapGain.connect(dest);
            snap.start(now);
            snap.stop(now + 0.10);

            // Explosive noise crackle
            const bufSize = Math.floor(this.ctx.sampleRate * 0.14);
            const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 2.2);
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(950, now);
            filter.Q.setValueAtTime(1.5, now);
            const nGain = this.ctx.createGain();
            nGain.gain.setValueAtTime(0.38, now);
            nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            noise.connect(filter);
            filter.connect(nGain);
            nGain.connect(dest);
            noise.start(now);
        }

        /**
         * Guardrail / Metal Scraping Friction with bright sparks
         */
        playSparksScrape(duration = 0.25) {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            if (this.lastScrapeTime && (now - this.lastScrapeTime < 0.12)) return;
            this.lastScrapeTime = now;
            const dest = this.sfxGainNode || this.ctx.destination;

            const bufSize = Math.floor(this.ctx.sampleRate * duration);
            const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = (Math.random() * 2 - 1) * 0.75 + Math.sin(i * 0.42) * 0.25;
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(2800, now);
            filter.frequency.linearRampToValueAtTime(1900, now + duration);
            filter.Q.setValueAtTime(3.5, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.24, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }

        /**
         * Canyon Cliff Plummet Fall & Colossal Crater Impact
         */
        playCliffFall() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            const howl = this.ctx.createOscillator();
            const howlGain = this.ctx.createGain();
            howl.type = 'sawtooth';
            howl.frequency.setValueAtTime(680, now);
            howl.frequency.exponentialRampToValueAtTime(95, now + 1.25);
            howlGain.gain.setValueAtTime(0.28, now);
            howlGain.gain.linearRampToValueAtTime(0.38, now + 1.15);
            howlGain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);

            const hFilter = this.ctx.createBiquadFilter();
            hFilter.type = 'lowpass';
            hFilter.frequency.setValueAtTime(1200, now);
            hFilter.frequency.linearRampToValueAtTime(400, now + 1.25);

            howl.connect(hFilter);
            hFilter.connect(howlGain);
            howlGain.connect(dest);
            howl.start(now);
            howl.stop(now + 1.35);

            setTimeout(() => {
                this.playExplosion();
                this.playCrash(2.2);
            }, 1250);
        }

        /**
         * Destruction Derby / Stadium Arena Crowd Cheering Roar
         */
        playCrowdCheer() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;
            const dur = 1.6;
            const bufSize = Math.floor(this.ctx.sampleRate * dur);
            const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / bufSize);
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(820, now);
            filter.frequency.linearRampToValueAtTime(1150, now + 0.8);
            filter.frequency.linearRampToValueAtTime(650, now + dur);
            filter.Q.setValueAtTime(1.2, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.01, now);
            gain.gain.linearRampToValueAtTime(0.22, now + 0.4);
            gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }

        /**
         * Windshield & Window Glass Shatter
         */
        playGlassShatter() {
            this.ensureActive();
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;

            const bufSize = Math.floor(this.ctx.sampleRate * 0.35);
            const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 0.7);
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(3200, now);
            filter.Q.setValueAtTime(2.0, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }
    }

    global.RacingAudioEngine = RacingAudioEngine;
})(window);
