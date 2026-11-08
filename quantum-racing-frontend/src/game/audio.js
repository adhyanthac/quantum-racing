// Small WebAudio synth. No assets; everything is generated.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engine = null;
  let enabled = true;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.55 : 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ type = 'sine', from, to = from, dur = 0.15, gain = 0.2, delay = 0, filter }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (filter) {
      const bq = ctx.createBiquadFilter();
      bq.type = 'lowpass';
      bq.frequency.value = filter;
      osc.connect(bq);
      node = bq;
    }
    node.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise({ dur = 0.3, gain = 0.3, freq = 800 }) {
    if (!ensure()) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bq = ctx.createBiquadFilter();
    bq.type = 'lowpass';
    bq.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(bq).connect(g).connect(master);
    src.start();
  }

  const sounds = {
    steer: () => tone({ type: 'triangle', from: 260, to: 200, dur: 0.06, gain: 0.05 }),
    split: () => {
      tone({ type: 'sine', from: 330, to: 880, dur: 0.22, gain: 0.12 });
      tone({ type: 'sine', from: 334, to: 890, dur: 0.22, gain: 0.08, delay: 0.015 });
    },
    tilt: () => tone({ type: 'sine', from: 620, to: 700, dur: 0.07, gain: 0.05 }),
    collapse: () => tone({ type: 'sine', from: 900, to: 300, dur: 0.16, gain: 0.1 }),
    observed: () => {
      tone({ type: 'square', from: 180, to: 160, dur: 0.18, gain: 0.05, filter: 1200 });
      tone({ type: 'sine', from: 900, to: 300, dur: 0.2, gain: 0.08 });
    },
    dodge: (e) => {
      const base = 520 + (e?.mult ?? 1) * 40;
      tone({ type: 'triangle', from: base, dur: 0.09, gain: 0.12 });
      tone({ type: 'triangle', from: base * 1.5, dur: 0.14, gain: 0.1, delay: 0.07 });
    },
    orb: () => tone({ type: 'sine', from: 1320, to: 1760, dur: 0.1, gain: 0.08 }),
    gateclear: () => tone({ type: 'triangle', from: 660, to: 990, dur: 0.12, gain: 0.07 }),
    hit: () => {
      noise({ dur: 0.35, gain: 0.5, freq: 900 });
      tone({ type: 'sine', from: 140, to: 50, dur: 0.3, gain: 0.3 });
    },
    crash: () => {
      noise({ dur: 0.9, gain: 0.6, freq: 700 });
      tone({ type: 'sine', from: 120, to: 35, dur: 0.8, gain: 0.35 });
    },
    nocharge: () => tone({ type: 'square', from: 140, dur: 0.12, gain: 0.04, filter: 800 }),
    sector: () => {
      tone({ type: 'triangle', from: 440, dur: 0.12, gain: 0.08 });
      tone({ type: 'triangle', from: 660, dur: 0.18, gain: 0.08, delay: 0.12 });
    },
    ui: () => tone({ type: 'triangle', from: 520, dur: 0.05, gain: 0.04 }),
  };

  function play(name, e) {
    if (!enabled) return;
    const fn = sounds[name];
    if (fn) fn(e);
  }

  function setEngine(speed, running) {
    if (!ctx || ctx.state !== 'running') return;
    if (!engine) {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const bq = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc2.type = 'square';
      bq.type = 'lowpass';
      bq.frequency.value = 420;
      g.gain.value = 0;
      osc.connect(bq);
      osc2.connect(bq);
      bq.connect(g).connect(master);
      osc.start();
      osc2.start();
      engine = { osc, osc2, g };
    }
    const now = ctx.currentTime;
    const hz = 38 + speed * 1.1;
    engine.osc.frequency.setTargetAtTime(hz, now, 0.1);
    engine.osc2.frequency.setTargetAtTime(hz * 0.502, now, 0.1);
    engine.g.gain.setTargetAtTime(running && enabled ? 0.035 : 0, now, 0.15);
  }

  function setEnabled(on) {
    enabled = on;
    if (master) master.gain.value = on ? 0.55 : 0;
  }

  return { play, setEngine, setEnabled, unlock: ensure };
}
