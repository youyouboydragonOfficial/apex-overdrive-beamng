/**
 * APEX OVERDRIVE: BeamNG Soft-Body Physics Edition v2.5
 * Enhanced Procedural Web Audio Engine:
 * - 5 Multi-Channel In-Game Radio Stations (Synthwave, Eurobeat, Cyber Rock, Lo-Fi, Police Scanner)
 * - Multi-Harmonic V12/V8/Rotary/EV Engine Synthesizers & Turbo Spool / Blow-Off
 * - Deep Impact Crunch, Glass Shatter, Metal Groaning, Doppler Effect & Police Siren
 */

(function (global) {
    'use strict';

    class RacingAudioEngine {
        constructor() {
            this.ctx = null;
            this.masterCompressor = null;
            this.bgmGainNode = null;
            this.sfxGainNode = null;
            this.sfxEnabled = true;
            this.bgmMode = 1; // 0: OFF, 1: Synthwave FM, 2: Eurobeat Nitro, 3: Cyber Rock, 4: Lo-Fi Chill, 5: Police Scanner
            this.isPlayingEngine = false;
            this.engineOsc1 = null;
            this.engineOsc2 = null;
            this.engineSub = null;
            this.engineFilter = null;
            this.engineGain = null;
            this.bgmTimer = null;
            this.bgmStep = 0;
            this.lastGear = 1;
            this.lastCrashSfxTime = 0;
            this.lastBurstSfxTime = 0;
            this.lastScreechSfxTime = 0;
            this.lastHornSfxTime = 0;
            this.lastNosSfxTime = 0;
            this.policeSirenOsc = null;
            this.policeSirenGain = null;
        }

        init() {
            if (!this.ctx) {
                try {
                    const AudioCtx = window.AudioContext || window.webkitAudioContext;
                    this.ctx = new AudioCtx();

                    this.masterCompressor = this.ctx.createDynamicsCompressor();
                    this.masterCompressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
                    this.masterCompressor.knee.setValueAtTime(18, this.ctx.currentTime);
                    this.masterCompressor.ratio.setValueAtTime(8, this.ctx.currentTime);
                    this.masterCompressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
                    this.masterCompressor.release.setValueAtTime(0.18, this.ctx.currentTime);
                    this.masterCompressor.connect(this.ctx.destination);

                    this.bgmGainNode = this.ctx.createGain();
                    this.bgmGainNode.gain.setValueAtTime(0.80, this.ctx.currentTime);
                    this.bgmGainNode.connect(this.masterCompressor);

                    this.sfxGainNode = this.ctx.createGain();
                    this.sfxGainNode.gain.setValueAtTime(0.72, this.ctx.currentTime);
                    this.sfxGainNode.connect(this.masterCompressor);

                    this.setupEngineSound();
                    this.startBGMSequencer();
                } catch (e) {
                    console.warn('Web Audio API not supported:', e);
                }
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }

        setupEngineSound() {
            if (!this.ctx) return;
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
            this.engineFilter.frequency.value = 420;

            this.engineGain.gain.value = 0.0001;

            const subGain = this.ctx.createGain();
            subGain.gain.value = 0.35;
            this.engineSub.connect(subGain);
            subGain.connect(this.engineFilter);

            this.engineOsc1.connect(this.engineFilter);
            this.engineOsc2.connect(this.engineFilter);
            this.engineFilter.connect(this.engineGain);
            this.engineGain.connect(this.sfxGainNode);

            this.engineOsc1.start();
            this.engineOsc2.start();
            this.engineSub.start();
            this.isPlayingEngine = true;
        }

        startBGMSequencer() {
            if (this.bgmTimer) clearInterval(this.bgmTimer);
            this.bgmTimer = setInterval(() => {
                if (!this.ctx || this.bgmMode === 0 || this.ctx.state !== 'running') return;
                this.playBGMStep(this.bgmStep);
                this.bgmStep = (this.bgmStep + 1) % 32;
            }, 108);
        }

        playBGMStep(step) {
            const now = this.ctx.currentTime;
            const dest = this.bgmGainNode || this.ctx.destination;

            // 5 Station Melodic Patterns
            const bassPatterns = {
                1: [55, 55, 110, 55, 65.4, 65.4, 130.8, 65.4, 73.4, 73.4, 146.8, 73.4, 61.7, 61.7, 123.5, 82.4],
                2: [65.4, 130.8, 65.4, 130.8, 73.4, 146.8, 73.4, 146.8, 82.4, 164.8, 82.4, 164.8, 77.8, 155.6, 98.0, 196.0],
                3: [41.2, 41.2, 41.2, 82.4, 43.65, 43.65, 41.2, 41.2, 49.0, 49.0, 46.25, 46.25, 41.2, 82.4, 61.7, 55.0],
                4: [65.4, 0, 65.4, 0, 82.4, 0, 73.4, 0, 65.4, 0, 55.0, 0, 73.4, 0, 82.4, 0],
                5: [110, 0, 0, 110, 0, 0, 123.5, 0, 110, 0, 0, 98, 0, 0, 110, 0]
            };
            const leadPatterns = {
                1: [440, 0, 523.3, 659.3, 587.3, 0, 523.3, 440, 392, 0, 440, 523.3, 659.3, 587.3, 523.3, 493.9],
                2: [523.3, 659.3, 784.0, 659.3, 587.3, 698.5, 880.0, 698.5, 659.3, 784.0, 987.8, 784.0, 880.0, 784.0, 659.3, 587.3],
                3: [329.6, 0, 349.2, 0, 329.6, 392.0, 0, 349.2, 329.6, 0, 293.7, 0, 261.6, 293.7, 329.6, 246.9],
                4: [261.6, 0, 329.6, 0, 392.0, 0, 523.3, 0, 392.0, 0, 329.6, 0, 293.7, 0, 261.6, 0],
                5: [880, 0, 0, 880, 0, 0, 987.8, 0, 880, 0, 0, 784, 0, 0, 880, 0]
            };

            const bassFreq = bassPatterns[this.bgmMode]?.[step % 16];
            const leadFreq = leadPatterns[this.bgmMode]?.[Math.floor(step / 2) % 16];

            if (bassFreq) {
                const bOsc = this.ctx.createOscillator();
                const bFilter = this.ctx.createBiquadFilter();
                const bGain = this.ctx.createGain();
                bOsc.type = this.bgmMode === 3 ? 'sawtooth' : (this.bgmMode === 4 ? 'sine' : 'sawtooth');
                bOsc.frequency.setValueAtTime(bassFreq, now);
                bFilter.type = 'lowpass';
                bFilter.frequency.setValueAtTime(this.bgmMode === 4 ? 320 : 620, now);
                bGain.gain.setValueAtTime(0.048, now);
                bGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
                bOsc.connect(bFilter);
                bFilter.connect(bGain);
                bGain.connect(dest);
                bOsc.start(now);
                bOsc.stop(now + 0.1);
            }

            if (step % 2 === 0 && leadFreq > 0) {
                const lOsc = this.ctx.createOscillator();
                const lGain = this.ctx.createGain();
                lOsc.type = this.bgmMode === 2 ? 'sawtooth' : (this.bgmMode === 3 ? 'sawtooth' : (this.bgmMode === 4 ? 'sine' : 'square'));
                lOsc.frequency.setValueAtTime(leadFreq, now);
                lGain.gain.setValueAtTime(this.bgmMode === 4 ? 0.018 : 0.026, now);
                lGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
                lOsc.connect(lGain);
                lGain.connect(dest);
                lOsc.start(now);
                lOsc.stop(now + 0.19);
            }

            if (step % 4 === 0 && this.bgmMode !== 4) {
                const kOsc = this.ctx.createOscillator();
                const kGain = this.ctx.createGain();
                kOsc.type = 'sine';
                kOsc.frequency.setValueAtTime(130, now);
                kOsc.frequency.exponentialRampToValueAtTime(32, now + 0.11);
                kGain.gain.setValueAtTime(0.10, now);
                kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                kOsc.connect(kGain);
                kGain.connect(dest);
                kOsc.start(now);
                kOsc.stop(now + 0.13);
            }
        }

        updateEngine(speedKmh, isAccelerating, gameActive, carKey = 'HYPER', timeScale = 1.0) {
            if (!this.ctx || !this.isPlayingEngine) return;
            if (!this.sfxEnabled || !gameActive) {
                this.engineGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
                return;
            }
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
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
                PROTOTYPE: 1.35,
                DRIFT: 1.25,
                JDM: 1.12,
                HYPER: 1.0,
                INTERCEPTOR: 0.76,
                GOLIATH: 0.68
            };
            const pitchMultiplier = (pitchMap[carKey] || 1.0) * (0.55 + 0.45 * timeScale);
            const baseFreq = Math.min(340, Math.max(32, (42 + rpmNormalized * 118 + (safeSpeed * 0.17)) * pitchMultiplier));

            this.engineOsc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.04);
            this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.5, this.ctx.currentTime, 0.04);
            this.engineSub.frequency.setTargetAtTime(baseFreq * 0.5, this.ctx.currentTime, 0.04);
            this.engineFilter.frequency.setTargetAtTime(320 + rpmNormalized * 620, this.ctx.currentTime, 0.05);

            const targetVol = isAccelerating ? 0.068 : 0.042;
            this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.08);
        }

        playTurboBlowoff() {
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;
            const bufSize = Math.floor(this.ctx.sampleRate * 0.14);
            const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.35));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(3400, now);
            filter.frequency.exponentialRampToValueAtTime(1600, now + 0.13);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }

        playNosRoar() {
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            if (now - this.lastNosSfxTime < 0.25) return;
            this.lastNosSfxTime = now;

            const dest = this.sfxGainNode || this.ctx.destination;
            const bufSize = Math.floor(this.ctx.sampleRate * 0.24);
            const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.6));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buf;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(950, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.09, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }

        playTireScreech() {
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            if (now - this.lastScreechSfxTime < 0.32) return;
            this.lastScreechSfxTime = now;

            const dest = this.sfxGainNode || this.ctx.destination;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(980, now);
            osc.frequency.linearRampToValueAtTime(760, now + 0.2);
            gain.gain.setValueAtTime(0.042, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.23);
        }

        playTireBurst() {
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            if (now - this.lastBurstSfxTime < 0.35) return;
            this.lastBurstSfxTime = now;

            const dest = this.sfxGainNode || this.ctx.destination;
            const bufSize = Math.floor(this.ctx.sampleRate * 0.28);
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
            filter.frequency.exponentialRampToValueAtTime(350, now + 0.25);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }

        playEtcDing(success = true) {
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
            gain.gain.setValueAtTime(0.11, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.27);
        }

        /**
         * DEEP BEAMNG CRUNCH + GLASS SHATTER + METALLIC GROANING
         */
        playCrash(intensity = 1.0) {
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            if (now - this.lastCrashSfxTime < 0.20) return;
            this.lastCrashSfxTime = now;

            const dest = this.sfxGainNode || this.ctx.destination;
            const safeIntensity = Number.isFinite(intensity) ? Math.min(1.8, Math.max(0.2, intensity)) : 0.6;
            const duration = 0.32 + safeIntensity * 0.28;

            // 1. Multi-frequency folding crunch
            const bufferSize = Math.floor(this.ctx.sampleRate * duration);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                const foldMod = 0.7 + 0.3 * Math.sin(i * 0.05);
                data[i] = (Math.random() * 2 - 1) * foldMod * Math.exp(-i / (this.ctx.sampleRate * 0.15));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(560, now);
            filter.Q.setValueAtTime(1.4, now);
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.16 + safeIntensity * 0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);

            // 2. Heavy chassis thud sub-bass
            const osc = this.ctx.createOscillator();
            const oscGain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(135, now);
            osc.frequency.exponentialRampToValueAtTime(28, now + 0.24);
            oscGain.gain.setValueAtTime(0.22, now);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.connect(oscGain);
            oscGain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.26);

            // 3. High-frequency glass tinkle on impacts
            if (safeIntensity > 0.55) {
                for (let g = 0; g < 4; g++) {
                    const gOsc = this.ctx.createOscillator();
                    const gGain = this.ctx.createGain();
                    gOsc.type = 'sine';
                    gOsc.frequency.setValueAtTime(2600 + Math.random() * 2400, now + g * 0.035);
                    gGain.gain.setValueAtTime(0.045, now + g * 0.035);
                    gGain.gain.exponentialRampToValueAtTime(0.001, now + g * 0.035 + 0.09);
                    gOsc.connect(gGain);
                    gGain.connect(dest);
                    gOsc.start(now + g * 0.035);
                    gOsc.stop(now + g * 0.035 + 0.10);
                }
            }
        }

        playDopplerPass() {
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(420, now);
            osc.frequency.exponentialRampToValueAtTime(180, now + 0.35);
            gain.gain.setValueAtTime(0.035, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.40);
        }

        playOvertake() {
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(460, now);
            osc.frequency.exponentialRampToValueAtTime(980, now + 0.13);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.connect(gain);
            gain.connect(dest);
            osc.start(now);
            osc.stop(now + 0.15);
        }

        playHorn(isAggressive = true) {
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
            gain.gain.setValueAtTime(0.07, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(dest);
            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + dur + 0.02);
            osc2.stop(now + dur + 0.02);
        }

        playPoliceSiren(active = true) {
            if (!this.ctx) return;
            if (!active) {
                if (this.policeSirenGain) {
                    this.policeSirenGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
                }
                return;
            }
            if (!this.policeSirenOsc) {
                const now = this.ctx.currentTime;
                this.policeSirenOsc = this.ctx.createOscillator();
                this.policeSirenGain = this.ctx.createGain();
                this.policeSirenOsc.type = 'sine';
                this.policeSirenOsc.frequency.setValueAtTime(650, now);
                this.policeSirenGain.gain.setValueAtTime(0.038, now);
                this.policeSirenOsc.connect(this.policeSirenGain);
                this.policeSirenGain.connect(this.sfxGainNode || this.ctx.destination);
                this.policeSirenOsc.start();
            }
            const time = this.ctx.currentTime;
            const freq = 650 + Math.sin(time * 3.5) * 250;
            this.policeSirenOsc.frequency.setValueAtTime(freq, time);
            this.policeSirenGain.gain.setValueAtTime(0.045, time);
        }

        playExplosion() {
            if (!this.ctx || !this.sfxEnabled) return;
            const now = this.ctx.currentTime;
            const dest = this.sfxGainNode || this.ctx.destination;
            const duration = 1.6;
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
            gain.gain.setValueAtTime(0.32, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(dest);
            noise.start(now);
        }
    }

    global.RacingAudioEngine = RacingAudioEngine;
})(window);
