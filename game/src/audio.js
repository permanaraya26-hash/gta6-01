// Solmar Bay sound: everything is synthesized live with WebAudio —
// oscillators for the engine hum and the two-tone siren, filtered noise
// for impacts, short tones for pickups and jingles. No audio files.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenFlip = null;
  let muted = false;
  let engineRunning = false;

  // Build the context and the two always-on loops on first use.
  function boot() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);

      // engine: a sawtooth through a lowpass, pitch tracks speed
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc.connect(lp);
      lp.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();

      // siren: a square wave that alternates between two notes
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 700;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenFlip = setInterval(() => {
        if (!ctx || sirenGain.gain.value === 0) return;
        sirenOsc.frequency.value = sirenOsc.frequency.value > 800 ? 700 : 950;
      }, 380);
      return true;
    } catch (e) {
      ctx = null;
      return false;
    }
  }

  // A burst of shaped noise (gunshots, punches, impacts).
  function noise(dur, freq, vol, filterType = 'bandpass') {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  // A short pitched blip, optionally sliding down.
  function blip(freq, dur, vol, type = 'sine', slideTo = null) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  // Play a little arpeggio: notes spaced `step` ms apart.
  function jingle(notes, dur, vol, type, step) {
    notes.forEach((freq, i) => {
      setTimeout(() => blip(freq, dur, vol, type), i * step);
    });
  }

  return {
    unlock() {
      if (boot() && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    setEngine(speed01, on) {
      if (!ctx || muted) {
        engineRunning = false;
        return;
      }
      engineRunning = on;
      engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, ctx.currentTime, 0.08);
    },
    setSiren(on) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on && !muted ? 0.035 : 0, ctx.currentTime, 0.1);
    },
    gunshot() {
      noise(0.14, 900, 0.5, 'lowpass');
      blip(160, 0.08, 0.25, 'square', 60);
    },
    punch() {
      noise(0.09, 300, 0.4, 'lowpass');
    },
    pickup() {
      blip(880, 0.12, 0.22);
      setTimeout(() => blip(1318, 0.18, 0.22), 90);
    },
    cash() {
      blip(1046, 0.1, 0.2);
      setTimeout(() => blip(1568, 0.22, 0.2), 80);
    },
    mission() {
      jingle([523, 659, 784, 1046], 0.22, 0.22, 'sine', 110);
    },
    busted() {
      jingle([392, 330, 262], 0.4, 0.25, 'triangle', 220);
    },
    wasted() {
      jingle([330, 262, 196, 131], 0.5, 0.25, 'triangle', 260);
    },
    click() {
      blip(1200, 0.05, 0.15, 'square');
    },
    horn() {
      blip(370, 0.35, 0.2, 'square');
      setTimeout(() => blip(370, 0.3, 0.2, 'square'), 400);
    },
  };
}
