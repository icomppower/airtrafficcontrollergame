'use strict';

/*
 * Self-contained Web Audio SFX engine for Tower Control.
 * Everything is synthesized — no external audio files needed.
 */
class SFXEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineGain = null;
    this._lastEngineN = -1;
    this._chatterTimer = null;
    this.noise = null;
    this.brown = null;
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.noise = this._makeNoise(2, false);
      this.brown = this._makeNoise(4, true);
      this._startAmbience();
      this._startEngineDrone();
      this._scheduleChatter();
    } catch (e) { this.ctx = null; }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.04);
    }
  }

  /* ---------- generators ---------- */

  _makeNoise(seconds, brown) {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.floor(sr * seconds), sr);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        d[i] = w;
      }
    }
    return buf;
  }

  // Low wind / distant airfield rumble, loops forever.
  _startAmbience() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start();
    // slow swell LFO so the wind breathes
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 0.018;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    lfo.start();
  }

  // Aircraft engine drone — intensity follows how many planes are in the air.
  _startEngineDrone() {
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'sawtooth';
    o1.frequency.value = 47; o2.frequency.value = 47.7;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 140;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    o1.connect(lp); o2.connect(lp);
    lp.connect(this.engineGain);
    this.engineGain.connect(this.master);
    o1.start(); o2.start();
  }

  setEngine(planeCount) {
    if (!this.ctx || planeCount === this._lastEngineN) return;
    this._lastEngineN = planeCount;
    const v = planeCount > 0 ? Math.min(0.07, 0.014 + planeCount * 0.009) : 0;
    this.engineGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.5);
  }

  // Garbled tower radio chatter every so often — pure atmosphere.
  _scheduleChatter() {
    clearTimeout(this._chatterTimer);
    this._chatterTimer = setTimeout(() => {
      this._chatter();
      this._scheduleChatter();
    }, 9000 + Math.random() * 15000);
  }

  _chatter() {
    if (!this.ctx || this.muted || document.hidden) return;
    this._lastChatterT = this.ctx.currentTime;
    const t = this.ctx.currentTime;
    this._beep(1500, t, 0.04, 0.025, 'square'); // squelch click
    const dur = 0.5 + Math.random() * 0.9;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1250 + Math.random() * 500;
    bp.Q.value = 4;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    // chop the noise into syllable-like bursts
    let tt = t + 0.06;
    while (tt < t + dur) {
      g.gain.setValueAtTime(Math.random() > 0.35 ? 0.03 : 0, tt);
      tt += 0.05 + Math.random() * 0.09;
    }
    g.gain.setValueAtTime(0, t + dur);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  // trigger a radio-chatter burst tied to a specific in-game event (glide
  // capture, runway closure/reopen, rush hour, follow-behind sequencing),
  // throttled so it can't pile up with the ambient random chatter
  radioCall() {
    if (!this.ctx || this.ctx.currentTime - (this._lastChatterT || -99) < 4) return;
    this._chatter();
    this._scheduleChatter(); // push the next ambient burst out so it doesn't double up
  }

  /* ---------- one-shots ---------- */

  _beep(freq, t, dur, vol, type, freqEnd) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  click() {
    if (!this.ctx) return;
    this._beep(1150, this.ctx.currentTime, 0.05, 0.1, 'sine');
  }

  // new aircraft entering the sector
  blip() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._beep(520, t, 0.07, 0.06, 'sine');
    this._beep(780, t + 0.09, 0.09, 0.06, 'sine');
  }

  // path successfully assigned to a runway
  confirm() {
    if (!this.ctx) return;
    this._beep(940, this.ctx.currentTime, 0.06, 0.07, 'triangle');
  }

  // safe landing — warm little chime
  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._beep(659.25, t, 0.35, 0.14, 'triangle');
    this._beep(830.6, t + 0.09, 0.4, 0.12, 'triangle');
    this._beep(987.77, t + 0.18, 0.5, 0.1, 'triangle');
  }

  // low-fuel emergency declared — urgent two-tone klaxon
  emergency() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._beep(920, t, 0.14, 0.11, 'square');
    this._beep(690, t + 0.16, 0.14, 0.11, 'square');
    this._beep(920, t + 0.34, 0.14, 0.11, 'square');
    this._beep(690, t + 0.5, 0.18, 0.11, 'square');
  }

  // rush hour klaxon — heads-up, traffic burst incoming
  rush() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._beep(1500, t, 0.04, 0.03, 'square'); // squelch
    this._beep(690, t + 0.05, 0.1, 0.1, 'square');
    this._beep(690, t + 0.2, 0.1, 0.1, 'square');
    this._beep(980, t + 0.35, 0.16, 0.1, 'square');
  }

  // stage clear fanfare
  fanfare() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      this._beep(f, t + i * 0.13, 0.45, 0.16, 'triangle');
    });
    this._beep(1318.5, t + 0.55, 0.7, 0.12, 'triangle');
  }

  // TCAS resolution advisory — urgent triple beep
  raAlert() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._beep(1250, t, 0.06, 0.11, 'square');
    this._beep(1250, t + 0.09, 0.06, 0.11, 'square');
    this._beep(1250, t + 0.18, 0.06, 0.11, 'square');
  }

  // proximity warning
  warn() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._beep(880, t, 0.09, 0.1, 'square');
    this._beep(880, t + 0.16, 0.09, 0.1, 'square');
  }

  crash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // noise blast with a falling lowpass sweep
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6000, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.9);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.65, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 1.2);
    // sub thump
    this._beep(75, t, 0.6, 0.55, 'sine', 28);
  }
}

window.SFX = new SFXEngine();
