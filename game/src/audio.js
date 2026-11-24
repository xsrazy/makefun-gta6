// Neon Harbor — all sound is synthesized with WebAudio: no audio files, no
// network. Engine hum, two-tone sirens, gunshots, pickups and a small bass
// loop. Everything is guarded: a browser with no audio device just stays
// quiet instead of throwing.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain).connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch { /* stay quiet */ }
  }

  function noise(dur, vol, lowpass) {
    if (!ensure()) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter).connect(gain).connect(master);
      src.start();
    } catch { /* stay quiet */ }
  }

  // A looping bassline: A minor groove, one note per eighth at 112 BPM.
  const BASSLINE = [110, 0, 110, 130.8, 0, 110, 98, 0, 110, 0, 146.8, 130.8, 0, 98, 110, 0];
  function startMusic() {
    if (!ensure() || musicTimer) return;
    musicTimer = window.setInterval(() => {
      const note = BASSLINE[musicStep % BASSLINE.length];
      musicStep += 1;
      if (note > 0) tone(note, 0.24, 'triangle', 0.16);
      if (musicStep % 4 === 0) noise(0.05, 0.05, 6000);
    }, 268);
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    try {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineOsc.connect(filter).connect(engineGain).connect(master);
      engineOsc.start();
    } catch { engineOsc = null; }
  }

  function setEngine(speed01, driving) {
    if (!engineOsc) return;
    try {
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.06 : 0, ctx.currentTime, 0.1);
    } catch { /* stay quiet */ }
  }

  function setSiren(on) {
    if (on && !sirenOsc) {
      if (!ensure()) return;
      try {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 700;
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.045;
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 1.6;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 220;
        lfo.connect(lfoGain).connect(sirenOsc.frequency);
        lfo.start();
        sirenOsc._lfo = lfo;
      } catch { sirenOsc = null; }
    } else if (!on && sirenOsc) {
      try {
        sirenOsc._lfo?.stop();
        sirenOsc.stop();
      } catch { /* already stopped */ }
      sirenOsc = null;
    }
  }

  return {
    unlock() { ensure(); startMusic(); startEngine(); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    shot() { noise(0.14, 0.5, 2800); tone(160, 0.09, 'square', 0.2, 60); },
    copShot() { noise(0.1, 0.25, 2200); },
    crash() { noise(0.25, 0.5, 900); tone(90, 0.2, 'sine', 0.4, 40); },
    pickup() { tone(660, 0.09, 'sine', 0.3); tone(990, 0.14, 'sine', 0.3); },
    cash() { tone(880, 0.08, 'triangle', 0.25); tone(1174, 0.16, 'triangle', 0.25); },
    missionStart() { tone(523, 0.12, 'triangle', 0.3); tone(784, 0.2, 'triangle', 0.3); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => window.setTimeout(() => tone(f, 0.22, 'triangle', 0.3), i * 110)); },
    failed() { tone(330, 0.25, 'sawtooth', 0.2, 160); },
    busted() { tone(440, 0.4, 'sawtooth', 0.2, 220); },
    click() { tone(700, 0.05, 'sine', 0.2); },
    setEngine,
    setSiren,
  };
}
