// Effetti sonori sintetizzati con WebAudio (nessun file audio): scatti, contattori, ronzii, scintille.
export class Sfx {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.hum = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  noise(dur, { freq = 2000, q = 1, gain = 0.5, type = 'bandpass', decay = 30 } = {}) {
    const c = this.ctx;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-i / c.sampleRate) * decay);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  tone(freq, dur, { type = 'sine', gain = 0.2, slide = 0 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  play(name) {
    if (!this.enabled || !name) return;
    if (!this.ensure()) return;
    switch (name) {
      case 'switch-on':
      case 'switch-off':
        this.noise(0.05, { freq: name === 'switch-on' ? 3200 : 2400, q: 2, gain: 0.9, decay: 80 });
        break;
      case 'rocker':
        this.noise(0.04, { freq: 2600, q: 3, gain: 0.7, decay: 90 });
        break;
      case 'button':
      case 'click':
        this.noise(0.03, { freq: 4000, q: 4, gain: 0.45, decay: 120 });
        break;
      case 'button-up':
        this.noise(0.02, { freq: 3000, q: 4, gain: 0.25, decay: 140 });
        break;
      case 'relay':
        this.noise(0.05, { freq: 1500, q: 2, gain: 0.8, decay: 70 });
        break;
      case 'trip':
        this.noise(0.08, { freq: 1800, q: 1.5, gain: 1.1, decay: 45 });
        this.tone(160, 0.08, { type: 'square', gain: 0.05 });
        break;
      case 'trip-short':
        this.noise(0.25, { freq: 900, q: 0.7, gain: 1.4, decay: 18, type: 'lowpass' });
        this.noise(0.12, { freq: 5000, q: 1, gain: 0.8, decay: 30 });
        break;
      case 'burn':
        this.noise(0.4, { freq: 3500, q: 0.8, gain: 0.6, decay: 8 });
        break;
      case 'limiter':
        this.tone(880, 0.15, { gain: 0.15 });
        setTimeout(() => this.tone(660, 0.2, { gain: 0.15 }), 160);
        break;
      case 'hum':
        this.tone(100, 0.6, { type: 'sawtooth', gain: 0.06 });
        break;
      case 'place':
        this.noise(0.05, { freq: 900, q: 1.5, gain: 0.7, decay: 60 });
        this.noise(0.03, { freq: 3500, q: 3, gain: 0.3, decay: 120 });
        break;
      case 'wire':
        this.noise(0.06, { freq: 2600, q: 1.2, gain: 0.35, decay: 50 });
        break;
      case 'ok':
        this.tone(660, 0.12, { gain: 0.12 });
        setTimeout(() => this.tone(990, 0.18, { gain: 0.12 }), 110);
        break;
      case 'error':
        this.tone(240, 0.25, { type: 'triangle', gain: 0.12 });
        break;
      default:
        break;
    }
  }

  /** Ronzio continuo dei motori in marcia (volume in base al numero/stato) */
  setMotorHum(level) {
    if (!this.enabled || !this.ctx) {
      if (this.hum) this.hum.g.gain.value = 0;
      return;
    }
    if (!this.hum) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 100;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      o.connect(f).connect(g).connect(this.master);
      o.start();
      this.hum = { o, g };
    }
    this.hum.g.gain.setTargetAtTime(level * 0.05, this.ctx.currentTime, 0.1);
  }
}
