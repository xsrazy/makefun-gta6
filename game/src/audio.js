// Sound, synthesised live with WebAudio oscillators and filtered noise — no audio files,
// so the game loads nothing over the network. The context starts on the first user gesture;
// every call before that is a silent no-op.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineNodes = null;
  let sirenNodes = null;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 1;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function blip(freq, dur, type, gain, when = 0, slideTo = null) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, gain, filterFreq, type = 'lowpass', when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  return {
    /** Call from any user gesture so the browser lets sound start. */
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** The engine hum: two detuned saws whose pitch follows the car's speed. */
    engine(speed01, running) {
      if (!ensure()) return;
      if (!running) {
        if (engineNodes) {
          try { engineNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } catch { /* already gone */ }
          const nodes = engineNodes;
          engineNodes = null;
          window.setTimeout(() => { try { nodes.osc1.stop(); nodes.osc2.stop(); } catch { /* stopped */ } }, 300);
        }
        return;
      }
      if (!engineNodes) {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc1.type = 'sawtooth';
        osc2.type = 'square';
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        gain.gain.value = 0.0;
        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain).connect(master);
        osc1.start();
        osc2.start();
        engineNodes = { osc1, osc2, gain };
      }
      const freq = 55 + speed01 * 165;
      engineNodes.osc1.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
      engineNodes.osc2.frequency.setTargetAtTime(freq * 1.5 + 3, ctx.currentTime, 0.05);
      engineNodes.gain.gain.setTargetAtTime(0.05 + speed01 * 0.05, ctx.currentTime, 0.08);
    },
    /** The two-tone police siren, while any cop is near. */
    siren(on) {
      if (!ensure()) return;
      if (!on) {
        if (sirenNodes) {
          try { sirenNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1); } catch { /* gone */ }
          const nodes = sirenNodes;
          sirenNodes = null;
          window.setTimeout(() => { try { nodes.osc.stop(); } catch { /* stopped */ } }, 500);
        }
        return;
      }
      if (!sirenNodes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        gain.gain.value = 0.0;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.9;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 180;
        lfo.connect(lfoGain).connect(osc.frequency);
        osc.frequency.value = 780;
        osc.connect(gain).connect(master);
        osc.start();
        lfo.start();
        gain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.2);
        sirenNodes = { osc, lfo, gain };
      }
    },
    shot() { noise(0.14, 0.35, 1800, 'highpass'); blip(160, 0.1, 'square', 0.12, 0, 60); },
    punch() { noise(0.08, 0.25, 500); },
    crash() { noise(0.3, 0.4, 700); blip(90, 0.25, 'sawtooth', 0.2, 0, 40); },
    skid() { noise(0.25, 0.12, 2400, 'bandpass'); },
    pickup() { blip(660, 0.12, 'sine', 0.25); blip(990, 0.18, 'sine', 0.25, 0.09); },
    cash() { blip(880, 0.1, 'sine', 0.22); blip(1174, 0.1, 'sine', 0.22, 0.08); blip(1568, 0.2, 'sine', 0.22, 0.16); },
    missionComplete() {
      blip(523, 0.14, 'triangle', 0.25);
      blip(659, 0.14, 'triangle', 0.25, 0.12);
      blip(784, 0.14, 'triangle', 0.25, 0.24);
      blip(1047, 0.3, 'triangle', 0.28, 0.36);
    },
    missionFailed() { blip(392, 0.2, 'sawtooth', 0.15); blip(311, 0.35, 'sawtooth', 0.15, 0.18, 220); },
    wantedUp() { blip(740, 0.12, 'square', 0.14); blip(740, 0.12, 'square', 0.14, 0.16); },
    busted() { blip(440, 0.3, 'sawtooth', 0.18, 0, 220); blip(330, 0.5, 'sawtooth', 0.18, 0.25, 165); },
    click() { blip(1200, 0.05, 'sine', 0.15); },
    explosion() { noise(0.8, 0.5, 300); blip(70, 0.6, 'sine', 0.4, 0, 30); },
  };
}
