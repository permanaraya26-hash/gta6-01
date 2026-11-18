// Synthesized WebAudio for Solmar Bay: no audio files, everything is
// generated with oscillators and filtered noise.
export function createAudio() {
  let ctx = null, master = null, engineOsc = null, engineGain = null;
  let sirenOsc = null, sirenGain = null, sirenTimer = null;
  let muted = false;
  let engineOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // engine hum: sawtooth + lowpass, pitch follows speed
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
      // two-tone siren
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
      sirenTimer = setInterval(() => {
        if (!ctx || sirenGain.gain.value === 0) return;
        sirenOsc.frequency.value = sirenOsc.frequency.value > 800 ? 700 : 950;
      }, 380);
      return true;
    } catch (e) { ctx = null; return false; }
  }

  function noiseBurst(dur, freq, vol, type = 'bandpass') {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  function tone(freq, dur, vol, type = 'sine', slideTo = null) {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur);
  }

  return {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted() { return muted; },
    setEngine(speed01, on) {
      if (!ctx || muted) { engineOn = false; return; }
      engineOn = on;
      engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, ctx.currentTime, 0.08);
    },
    setSiren(on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on && !muted ? 0.035 : 0, ctx.currentTime, 0.1);
    },
    gunshot() { noiseBurst(0.14, 900, 0.5, 'lowpass'); tone(160, 0.08, 0.25, 'square', 60); },
    punch() { noiseBurst(0.09, 300, 0.4, 'lowpass'); },
    pickup() { tone(880, 0.12, 0.22); setTimeout(() => tone(1318, 0.18, 0.22), 90); },
    cash() { tone(1046, 0.1, 0.2); setTimeout(() => tone(1568, 0.22, 0.2), 80); },
    mission() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.22), i * 110)); },
    busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.4, 0.25, 'triangle'), i * 220)); },
    wasted() { [330, 262, 196, 131].forEach((f, i) => setTimeout(() => tone(f, 0.5, 0.25, 'triangle'), i * 260)); },
    click() { tone(1200, 0.05, 0.15, 'square'); },
    horn() { tone(370, 0.35, 0.2, 'square'); setTimeout(() => tone(370, 0.3, 0.2, 'square'), 400); },
  };
}
