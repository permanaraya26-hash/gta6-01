// Synthesized sound effects with WebAudio — no audio files, no network.
// Everything is created lazily on the first user gesture so headless renders stay quiet.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // Engine: sawtooth through a lowpass, pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 50;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filt); filt.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
      // Siren: triangle that flips between two tones.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 750;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.ctx.destination);
      this.sirenOsc.start();
    } catch { this.ctx = null; }
  }

  toggleMute() { this.muted = !this.muted; return this.muted; }

  setEngine(speed01, on) {
    if (!this.ctx || !this.engineGain) return;
    const target = this.muted || !on ? 0 : 0.03 + speed01 * 0.05;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(45 + speed01 * 130, this.ctx.currentTime, 0.05);
  }

  setSiren(on, dt) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.42) { this.sirenTimer = 0; this.sirenHigh = !this.sirenHigh; }
    const target = this.muted || !on ? 0 : 0.028;
    this.sirenGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 660, this.ctx.currentTime, 0.05);
  }

  blip(freq, dur, type = 'sine', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  }

  noiseBurst(dur, vol, lowpass = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lowpass;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t);
  }

  gunshot() { this.noiseBurst(0.14, 0.5, 2800); this.blip(160, 0.08, 'square', 0.18); }
  punch() { this.noiseBurst(0.09, 0.35, 500); }
  pickup() { this.blip(660, 0.1, 'sine', 0.14); setTimeout(() => this.blip(990, 0.16, 'sine', 0.14), 90); }
  cash() { this.blip(880, 0.09, 'triangle', 0.14); setTimeout(() => this.blip(1174, 0.09, 'triangle', 0.14), 80); setTimeout(() => this.blip(1568, 0.18, 'triangle', 0.14), 160); }
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.16), i * 110)); }
  busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.1), i * 160)); }
  click() { this.blip(700, 0.05, 'square', 0.08); }
  horn() { this.blip(370, 0.18, 'square', 0.1); }
}
