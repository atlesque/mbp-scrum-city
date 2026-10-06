import { LEAD, musicLayers } from '../data/music.js';
import { clamp } from './util.js';
import { HEAR, airCutoff, distToEar, doppler, falloff, listenerPose } from './spatial.js';

// ================= AUDIO =================
export const Sound = (() => {
  let ctx = null, master, dimmer, dimmed = false, sfx, mus, noise, reverbIn, skidGain, skidF, engO1, engO2, engF, engG, musicOn = true, seq = null, step = 0, nextT = 0, intensity = 0, wantIntensity = 0, layers = musicLayers(0);
  const mix = { on: true, sfx: 1, music: 1 }; // from the Settings screen
  const MENU_DIM = 0.5, DIM_FADE = 0.3; // everything plays at half volume, faded over 0.3 s, while the pause menu is open
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function makeNoise() { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  function impulse(sec, decay) { const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return b; }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = mix.on ? 0.85 : 0; dimmer = ctx.createGain(); dimmer.gain.value = dimmed ? MENU_DIM : 1; master.connect(dimmer); dimmer.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; comp.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = 0.75 * mix.sfx; sfx.connect(comp);
    mus = ctx.createGain(); mus.gain.value = musicLevel(); mus.connect(comp);
    noise = makeNoise();
    const conv = ctx.createConvolver(); conv.buffer = impulse(1.8, 2.6); const rv = ctx.createGain(); rv.gain.value = 0.4; conv.connect(rv); rv.connect(mus); reverbIn = conv;
    // the player's own ride: not placed, since the listener sits on it
    engO1 = ctx.createOscillator(); engO1.type = 'sawtooth'; engO1.frequency.value = 18;
    engO2 = ctx.createOscillator(); engO2.type = 'triangle'; engO2.frequency.value = 36; const e2g = ctx.createGain(); e2g.gain.value = 0.45;
    engF = ctx.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 220; engF.Q.value = 0.9;
    const engCap = ctx.createBiquadFilter(); engCap.type = 'lowpass'; engCap.frequency.value = 650; engCap.Q.value = 0.5;
    engG = ctx.createGain(); engG.gain.value = 0; engO1.connect(engF); engO2.connect(e2g); e2g.connect(engF); engF.connect(engCap); engCap.connect(engG); engG.connect(sfx); engO1.start(); engO2.start();
    // tyre squeal: narrow band of noise, wavering a little
    const kn = ctx.createBufferSource(); kn.buffer = noise; kn.loop = true; kn.playbackRate.value = 0.8;
    skidF = ctx.createBiquadFilter(); skidF.type = 'bandpass'; skidF.frequency.value = 1500; skidF.Q.value = 9;
    const klfo = ctx.createOscillator(); klfo.frequency.value = 7; const klg = ctx.createGain(); klg.gain.value = 90; klfo.connect(klg); klg.connect(skidF.frequency);
    skidGain = ctx.createGain(); skidGain.gain.value = 0; kn.connect(skidF); skidF.connect(skidGain); skidGain.connect(sfx); kn.start(); klfo.start();
    startMusic();
  }
  function musicLevel() { return musicOn ? 0.32 * mix.music : 0; }
  function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  // ---- placing sounds in the world ----
  // The listener (where the player's head is, facing the camera) is moved every frame by listen(). A sound with
  // a source goes gain (its volume at this distance) -> lowpass (air dulling far sounds) -> HRTF panner (direction,
  // in front, behind, above) -> the effects bus. Distance is handled by our own curves (core/spatial.js), so the
  // panners themselves don't roll off.
  let L = null; const recent = [];
  function setPos(n, prefix, x, y, z, t, snap) {
    const px = n[prefix + 'X'];
    if (px) for (const [k, v] of [['X', x], ['Y', y], ['Z', z]]) { const a = n[prefix + k]; if (snap) a.setValueAtTime(v, t); else a.setTargetAtTime(v, t, 0.04); }
    else return false;
    return true;
  }
  function listen() {
    if (!ctx) return;
    L = listenerPose(); const l = ctx.listener, t = ctx.currentTime;
    if (!setPos(l, 'position', L.x, L.y, L.z, t)) { l.setPosition(L.x, L.y, L.z); l.setOrientation(L.fx, L.fy, L.fz, L.ux, L.uy, L.uz); return; }
    setPos(l, 'forward', L.fx, L.fy, L.fz, t); setPos(l, 'up', L.ux, L.uy, L.uz, t);
  }
  // HRTF for everything, except when a burst of one-shots (a minigun) would stack up a dozen at once: those
  // extra ones get the cheaper equal-power panner
  function panner(p, hrtf) {
    const n = ctx.createPanner(); n.panningModel = hrtf ? 'HRTF' : 'equalpower'; n.distanceModel = 'inverse'; n.refDistance = 1; n.rolloffFactor = 0;
    const t = ctx.currentTime; if (!setPos(n, 'position', p.x, p.y ?? 1, p.z, t, true)) n.setPosition(p.x, p.y ?? 1, p.z);
    n.connect(sfx); return n;
  }
  // the node a sound plays into: at `at` (a world point) heard by the `prof` rules, or straight into the
  // effects bus when it has no place (the player's own gun, the UI); null when it is too far off to hear
  function out(vol, at, prof) {
    let g = ctx.createGain(), dest = sfx;
    if (at) {
      L = L || listenerPose();
      const d = distToEar(at, L), p = prof || HEAR.shot; vol *= falloff(d, p);
      if (vol >= 0.004 && ctx.createPanner) {
        const t = ctx.currentTime; while (recent.length && recent[0] < t - 0.5) recent.shift(); recent.push(t);
        dest = ctx.createBiquadFilter(); dest.type = 'lowpass'; dest.frequency.value = airCutoff(d, p); dest.connect(panner(at, recent.length <= 12));
      }
    }
    if (vol < 0.004) return null;
    g.gain.value = vol; g.connect(dest); return g;
  }

  // ---- looping sources: one voice per siren, rotor and passing engine ----
  // loops(kind, sources) is called every frame with every candidate source of that kind ({ key, x, y, z, vol,
  // ...}); the loudest few as heard from here get a voice, which follows its source, and the rest stay silent.
  // A voice whose source drops out fades and is freed. Each voice estimates how fast its source closes on the
  // listener for a touch of Doppler.
  const LOOPS = {
    siren: { max: 3, prof: HEAR.siren, make: makeSiren },
    rotor: { max: 2, prof: HEAR.rotor, make: makeRotor },
    tank: { max: 1, prof: HEAR.tank, make: makeTank },
    engine: { max: 3, prof: null, make: makeEngine },
  };
  const live = { siren: new Map(), rotor: new Map(), engine: new Map(), tank: new Map() };
  function loops(kind, list, prof) {
    if (!ctx) return;
    const def = LOOPS[kind], p = prof || def.prof, map = live[kind], t = ctx.currentTime; L = L || listenerPose();
    const heardNow = [];
    for (const s of list) { const d = distToEar(s, L), g = (s.vol ?? 1) * falloff(d, p); if (g > 0.001) heardNow.push({ s, d, g }); }
    heardNow.sort((a, b) => b.g - a.g); heardNow.length = Math.min(heardNow.length, def.max);
    const keep = new Set();
    for (const { s, d, g } of heardNow) {
      let v = map.get(s.key);
      if (!v) {
        v = def.make(); v.gain = ctx.createGain(); v.gain.gain.value = 0; v.air = ctx.createBiquadFilter(); v.air.type = 'lowpass'; v.air.frequency.value = airCutoff(d, p);
        v.pan = panner(s, true); v.out.connect(v.gain); v.gain.connect(v.air); v.air.connect(v.pan);
        v.lastD = d; v.lastT = t; v.closing = 0; map.set(s.key, v);
      }
      keep.add(s.key);
      const dt = t - v.lastT; if (dt > 0.01) { v.closing += (clamp((v.lastD - d) / dt, -60, 60) - v.closing) * Math.min(1, dt * 6); v.lastD = d; v.lastT = t; }
      v.gain.gain.setTargetAtTime(g, t, 0.12); v.air.frequency.setTargetAtTime(airCutoff(d, p), t, 0.1);
      setPos(v.pan, 'position', s.x, s.y ?? 1, s.z, t) || v.pan.setPosition(s.x, s.y ?? 1, s.z);
      v.set(s, doppler(v.closing), t);
    }
    for (const [key, v] of map) if (!keep.has(key)) drop(map, key, v, t);
  }
  function drop(map, key, v, t) { map.delete(key); v.gain.gain.setTargetAtTime(0, t, 0.15); setTimeout(() => { v.stop(); v.pan.disconnect(); }, 1500); }
  // a wailing saw; each car's is a little off from the others so two sirens don't merge into one
  function makeSiren() {
    const base = 860 + Math.random() * 80;
    const so = ctx.createOscillator(); so.type = 'sawtooth'; so.frequency.value = base;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.32 + Math.random() * 0.06; const lg = ctx.createGain(); lg.gain.value = 320; lfo.connect(lg); lg.connect(so.frequency);
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1700; so.connect(sf);
    const t = ctx.currentTime; so.start(t); lfo.start(t + Math.random() * 2);
    return { out: sf, set(s, k, t) { so.frequency.setTargetAtTime(base * k, t, 0.1); }, stop() { so.stop(); lfo.stop(); } };
  }
  // helicopter rotor: chopped noise
  function makeRotor() {
    const hn = ctx.createBufferSource(); hn.buffer = noise; hn.loop = true;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 380;
    const chop = ctx.createGain(); chop.gain.value = 0.5; const clfo = ctx.createOscillator(); clfo.type = 'square'; clfo.frequency.value = 13; const cg = ctx.createGain(); cg.gain.value = 0.5; clfo.connect(cg); cg.connect(chop.gain);
    hn.connect(hf); hf.connect(chop); hn.start(0, Math.random() * 1.5); clfo.start();
    return { out: chop, set(s, k, t) { clfo.frequency.setTargetAtTime(13 * k, t, 0.1); hf.frequency.setTargetAtTime(380 * k, t, 0.1); }, stop() { hn.stop(); clfo.stop(); } };
  }
  // tank: a deep diesel drone, and the squeak and clatter of the tracks, faster and louder the quicker it rolls
  function makeTank() {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 32;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160; o.connect(f);
    const tn = ctx.createBufferSource(); tn.buffer = noise; tn.loop = true;
    const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 1400; tf.Q.value = 3;
    const clack = ctx.createGain(); clack.gain.value = 0; const clfo = ctx.createOscillator(); clfo.type = 'square'; clfo.frequency.value = 6;
    const cg = ctx.createGain(); cg.gain.value = 0; clfo.connect(cg); cg.connect(clack.gain);
    tn.connect(tf); tf.connect(clack);
    const mix = ctx.createGain(); f.connect(mix); clack.connect(mix);
    o.start(); tn.start(0, Math.random() * 1.5); clfo.start();
    return { out: mix, set(s, k, t) {
      const sp = Math.min(1, (s.speed || 0) / 7);
      o.frequency.setTargetAtTime((30 + sp * 16) * k, t, 0.2); f.frequency.setTargetAtTime(140 + sp * 120, t, 0.2);
      clfo.frequency.setTargetAtTime((3 + sp * 9) * k, t, 0.1); cg.gain.setTargetAtTime(sp * 0.18, t, 0.1); clack.gain.setTargetAtTime(sp * 0.18, t, 0.1);
    }, stop() { o.stop(); tn.stop(); clfo.stop(); } };
  }
  // boxer twin: low saw at the firing rate plus a soft triangle octave, through a gentle tracking lowpass and a
  // fixed one that keeps the buzzy highs out (the same voice as the player's own, below)
  function makeEngine() {
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 18;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 36; const g2 = ctx.createGain(); g2.gain.value = 0.45;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 0.9;
    const cap = ctx.createBiquadFilter(); cap.type = 'lowpass'; cap.frequency.value = 650; cap.Q.value = 0.5;
    o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(cap); o1.start(); o2.start();
    return { out: cap, set(s, k, t) { const hz = (s.rpm || 1050) / 60 * k; o1.frequency.setTargetAtTime(hz, t, 0.06); o2.frequency.setTargetAtTime(hz * 2.02, t, 0.06); f.frequency.setTargetAtTime(Math.min(140 + hz * 3.5, 600), t, 0.08); }, stop() { o1.stop(); o2.stop(); } };
  }
  function nz(dest, t, dur, type, freq, q, peak, rate) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = rate || 1;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    const g = ctx.createGain(); env(g, t, 0.002, peak, dur); s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); return f;
  }
  function tone(dest, t, type, f0, f1, dur, peak, a) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); env(g, t, a || 0.004, peak, dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o;
  }
  const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const GUN = { pistol: [3600, .22, 150, .9], smg: [5200, .1, 210, .6], shotgun: [2300, .55, 80, 1.35], rifle: [5600, .17, 130, .85], minigun: [6200, .07, 240, .5], rpg: [1400, .7, 60, .9], sniper: [3800, .5, 70, 1.45], cannon: [700, 1.1, 40, 1.8] };
  // `at` is where it was fired (a world point), or nothing for the player's own gun
  function shot(kind, vol = 1, at = null) {
    if (!ctx) return; const o = out(vol, at, HEAR.shot); if (!o) return; const p = GUN[kind] || GUN.pistol, t = ctx.currentTime;
    nz(o, t, p[1], 'lowpass', p[0], 0.8, p[3], 0.85 + Math.random() * 0.3);
    tone(o, t, 'sine', p[2] * 2, p[2] * 0.5, p[1] * 0.8, p[3] * 0.8);
    nz(o, t, 0.03, 'highpass', 6000, 0.5, p[3] * 0.4);
    // the sniper's bolt racks back and forward once the crack has rung out
    if (kind === 'sniper') { tone(o, t + 0.55, 'square', 900, 500, 0.04, 0.25); tone(o, t + 0.8, 'square', 1300, 700, 0.05, 0.3); }
    if (kind === 'rpg') { const f = nz(o, t, 0.9, 'bandpass', 600, 2, 0.5); f.frequency.exponentialRampToValueAtTime(2500, t + 0.9); }
  }
  return {
    init, get ready() { return !!ctx; },
    shot,
    boom(vol = 1, at = null) { if (!ctx) return; const t = ctx.currentTime, o = out(vol, at, HEAR.boom); if (!o) return; nz(o, t, 1.6, 'lowpass', 900, 0.6, 1.4, 0.6); tone(o, t, 'sine', 90, 30, 0.9, 1.2); nz(o, t, 0.3, 'bandpass', 2400, 1, 0.5); },
    // the scope's zoom click; deeper on the way back out
    zoom(level) { if (!ctx) return; tone(out(0.3), ctx.currentTime, 'square', level ? 2400 + level * 400 : 1500, 1100, 0.035, 0.35); },
    hit() { if (!ctx) return; tone(out(0.35), ctx.currentTime, 'square', 1700, 1200, 0.05, 0.4); },
    head() { if (!ctx) return; const t = ctx.currentTime, o = out(0.4); tone(o, t, 'square', 2100, 1500, 0.05, 0.4); tone(o, t + 0.05, 'square', 2600, 1900, 0.06, 0.35); },
    ting(vol, at) { if (!ctx) return; const o = out(vol * 0.25, at, HEAR.ting); if (o) tone(o, ctx.currentTime, 'triangle', 3200 + Math.random() * 800, 2400, 0.12, 0.5); },
    hurt() { if (!ctx) return; const t = ctx.currentTime, o = out(0.6); tone(o, t, 'sawtooth', 210, 120, 0.18, 0.4); nz(o, t, 0.1, 'lowpass', 500, 1, 0.6); },
    scream(vol, at) { if (!ctx) return; const t = ctx.currentTime, o = out(vol * 0.5, at, HEAR.voice); if (!o) return; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100 + Math.random() * 500; f.Q.value = 2.5; f.connect(o); const b = 380 + Math.random() * 300; const os = tone(f, t, 'sawtooth', b * 1.6, b * 0.7, 0.55, 0.9, 0.02); const v = ctx.createOscillator(); v.frequency.value = 7; const vg = ctx.createGain(); vg.gain.value = 30; v.connect(vg); vg.connect(os.frequency); v.start(t); v.stop(t + 0.6); },
    cash() { if (!ctx) return; const t = ctx.currentTime, o = out(0.3); tone(o, t, 'square', 1046, 0, 0.07, 0.35); tone(o, t + 0.07, 'square', 1568, 0, 0.12, 0.35); },
    pickup() { if (!ctx) return; const t = ctx.currentTime, o = out(0.35); [523, 659, 784, 1046].forEach((f, i) => tone(o, t + i * 0.05, 'triangle', f, 0, 0.1, 0.5)); },
    reload() { if (!ctx) return; const t = ctx.currentTime, o = out(0.5); nz(o, t, 0.04, 'bandpass', 2800, 3, 0.8); nz(o, t + 0.22, 0.05, 'bandpass', 1900, 3, 0.9); },
    empty() { if (!ctx) return; nz(out(0.4), ctx.currentTime, 0.03, 'highpass', 4000, 2, 0.7); },
    horn(vol, at) { if (!ctx) return; const t = ctx.currentTime, o = out(vol * 0.25, at, HEAR.horn); if (!o) return; tone(o, t, 'square', 392, 0, 0.45, 0.5, 0.01); tone(o, t, 'square', 494, 0, 0.45, 0.4, 0.01); },
    star() { if (!ctx) return; const t = ctx.currentTime, o = out(0.4); tone(o, t, 'triangle', 880, 0, 0.15, 0.6); tone(o, t + 0.12, 'triangle', 660, 0, 0.3, 0.6); },
    buy() { if (!ctx) return; const t = ctx.currentTime, o = out(0.35); [784, 988, 1175, 1568].forEach((f, i) => tone(o, t + i * 0.06, 'square', f, 0, 0.09, 0.3)); nz(o, t + 0.25, 0.08, 'bandpass', 3000, 3, 0.6); },
    deny() { if (!ctx) return; const t = ctx.currentTime, o = out(0.35); tone(o, t, 'square', 220, 0, 0.12, 0.4); tone(o, t + 0.13, 'square', 165, 0, 0.2, 0.4); },
    // melee: a whoosh through the air, the blow landing (fist, blunt, blade or on a car's metal), a chainsaw's bite;
    // at places them in the world (an NPC's swing), none plays them as the player's own
    swing(vol = 1, at = null) { if (!ctx) return; const t = ctx.currentTime, o = out(vol * 0.5, at, HEAR.thud); if (!o) return; const f = nz(o, t, 0.2, 'bandpass', 500, 2.2, 0.8, 1.2); f.frequency.exponentialRampToValueAtTime(1900, t + 0.14); },
    smack(kind = 'fist', vol = 1, at = null) {
      if (!ctx) return; const t = ctx.currentTime, o = out(vol * 0.7, at, HEAR.thud); if (!o) return;
      if (kind === 'blade') { nz(o, t, 0.12, 'highpass', 2600, 1, 0.8, 1.4); tone(o, t, 'sine', 900, 300, 0.08, 0.35); nz(o, t + 0.02, 0.1, 'lowpass', 700, 1, 0.5); return; }
      if (kind === 'metal') { tone(o, t, 'triangle', 520, 380, 0.25, 0.5); tone(o, t, 'square', 1180, 900, 0.12, 0.18); nz(o, t, 0.08, 'bandpass', 1800, 2, 0.6); return; }
      const deep = kind === 'blunt';
      nz(o, t, deep ? 0.16 : 0.1, 'lowpass', deep ? 900 : 650, 1, 1.1, 0.8); tone(o, t, 'sine', deep ? 170 : 130, 55, deep ? 0.16 : 0.12, 0.9);
      if (deep) nz(o, t, 0.04, 'bandpass', 2400, 3, 0.5);
    },
    saw(vol = 1, at = null) { if (!ctx) return; const t = ctx.currentTime, o = out(vol * 0.22, at, HEAR.shot); if (!o) return; tone(o, t, 'sawtooth', 118 + Math.random() * 12, 0, 0.11, 0.7, 0.003); nz(o, t, 0.1, 'bandpass', 2200, 1.5, 0.35); },
    thud(vol, at, prof = HEAR.thud) { if (!ctx) return; const t = ctx.currentTime, o = out(vol, at, prof); if (!o) return; nz(o, t, 0.22, 'lowpass', 420, 1, 1.1, 0.7); tone(o, t, 'sine', 140, 45, 0.2, 0.9); },
    // the player's own ride (the engine under you isn't placed)
    setEngine(vol, rpm) { if (!ctx) return; const t = ctx.currentTime, f = rpm / 60; engO1.frequency.setTargetAtTime(f, t, 0.06); engO2.frequency.setTargetAtTime(f * 2.02, t, 0.06); engF.frequency.setTargetAtTime(Math.min(140 + f * 3.5, 600), t, 0.08); engG.gain.setTargetAtTime(vol, t, 0.12); },
    // tyres sliding: 0 (gripping) to 1 (a full drift)
    setSkid(v) { if (!ctx) return; const t = ctx.currentTime; skidGain.gain.setTargetAtTime(v * 0.22, t, 0.06); skidF.frequency.setTargetAtTime(1300 + v * 500, t, 0.1); },
    // move the listener to the player's head and the camera's view; once a frame, before the sounds of the frame
    listen,
    // the sirens, rotors and passing engines out in the world this frame (see loops above)
    loops,
    // silence every looping sound at once: pausing, a shop menu, death
    hush() {
      if (!ctx) return; const t = ctx.currentTime;
      for (const map of Object.values(live)) for (const [key, v] of map) drop(map, key, v, t);
      engG.gain.setTargetAtTime(0, t, 0.12); skidGain.gain.setTargetAtTime(0, t, 0.06);
    },
    // how many voices of each looping kind are playing (for tests)
    voices() { return Object.fromEntries(Object.entries(live).map(([k, m]) => [k, m.size])); },
    // the wanted level; new layers join (or drop out) on the next beat
    setIntensity(level) { wantIntensity = level; },
    get intensity() { return intensity; },
    toggleMusic() { musicOn = !musicOn; if (ctx) mus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.2); return musicOn; },
    // fade all sound down while a menu is open, and back up when it closes (on top of the Settings volumes)
    dim(on) {
      dimmed = !!on; if (!ctx) return;
      const g = dimmer.gain, t = ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(dimmed ? MENU_DIM : 1, t + DIM_FADE);
    },
    get dimmed() { return dimmed; },
    // sound on / off and the effects and music volumes (0 to 1)
    setMix({ on, sfx: s, music }) {
      Object.assign(mix, { on, sfx: s, music }); if (!ctx) return;
      const t = ctx.currentTime; master.gain.setTargetAtTime(on ? 0.85 : 0, t, 0.05); sfx.gain.setTargetAtTime(0.75 * s, t, 0.05); mus.gain.setTargetAtTime(musicLevel(), t, 0.05);
    },
  };
  // ---- synthwave radio ----
  function startMusic() {
    nextT = ctx.currentTime + 0.1;
    seq = setInterval(() => { while (nextT < ctx.currentTime + 0.15) { playStep(step, nextT); nextT += 60 / 108 / 4; step = (step + 1) % 128; } }, 30);
  }
  function synth(type, freq, det, t, dur, peak, cutoff, wet) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = det || 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ctx.createGain(); env(g, t, 0.005, peak, dur); o.connect(f); f.connect(g); g.connect(mus); if (wet) g.connect(reverbIn); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function playStep(s, t) {
    if (!musicOn) return;
    const st = s % 16, bar = Math.floor(s / 16), ch = PROG[bar % 4], SPB = 60 / 108 / 4;
    if (st % 4 === 0 && wantIntensity !== intensity) { intensity = wantIntensity; layers = musicLayers(intensity); }
    const L = layers;
    // drums
    if (L.kick && st % 4 === 0) tone(mus, t, 'sine', 150, 42, 0.3, 0.9);
    if (L.snare && (st === 4 || st === 12)) { nz(mus, t, 0.2, 'bandpass', 1700, 0.8, 0.5); nz(reverbIn, t, 0.15, 'bandpass', 1700, 0.8, 0.6); tone(mus, t, 'triangle', 220, 130, 0.12, 0.3); }
    if (L.hats && st % 2 === 1) nz(mus, t, st % 4 === 3 ? 0.09 : 0.03, 'highpass', 7500, 0.6, st % 4 === 3 ? 0.13 : 0.07);
    if (L.drive) {
      if (st % 2 === 0) nz(mus, t, 0.025, 'highpass', 9000, 0.6, 0.05);
      if (st % 4 === 2) nz(mus, t, 0.22, 'highpass', 6500, 0.5, 0.08);
      if (st === 4 || st === 12) [0, 0.012, 0.026].forEach(d => nz(mus, t + d, 0.06, 'bandpass', 1200, 1.5, 0.35));
    }
    if (L.chase) {
      if (st === 0 && bar % 2 === 0) { nz(mus, t, 1.4, 'highpass', 5000, 0.4, 0.22); nz(reverbIn, t, 0.8, 'highpass', 5000, 0.4, 0.2); }
      if (bar % 4 === 3 && st >= 12) tone(mus, t, 'sine', [196, 164, 131, 98][st - 12], 0, SPB * 0.9, 0.55);
      if ((st === 6 || st === 14) && bar % 2 === 1) ch.forEach(n => synth('sawtooth', mtof(n + 12), 0, t, 0.14, 0.035, 2600, true));
    }
    // bass: steady eighths, octave-jumping sixteenths once the drive layer is in
    if (L.bass && (st % 2 === 0 || L.drive)) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(ch[0] - 24 + (st % 4 === 2 || (L.drive && st % 2 === 1) ? 12 : 0));
      const len = L.drive ? SPB * 0.95 : SPB * 1.9;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(L.drive ? 1300 : 900, t); f.frequency.exponentialRampToValueAtTime(220, t + len);
      const g = ctx.createGain(); env(g, t, 0.005, 0.32, len); o.connect(f); f.connect(g); g.connect(mus); o.start(t); o.stop(t + len + 0.1);
    }
    if (L.pad && st === 0) ch.forEach(n => [-6, 6].forEach(det => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = L.chase ? 2000 : 1300;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.028, t + 0.5); g.gain.setValueAtTime(0.028, t + SPB * 14); g.gain.exponentialRampToValueAtTime(0.0001, t + SPB * 16);
      o.connect(f); f.connect(g); g.connect(mus); g.connect(reverbIn); o.start(t); o.stop(t + SPB * 16 + 0.05);
    }));
    if (L.arp && st % 2 === 0) synth('square', mtof(ch[(st / 2) % 3] + 12 + (st >= 8 ? 12 : 0)), 0, t, 0.16, 0.05, 2400, true);
    if (L.lead) for (const [at, tn, oct, len] of LEAD) if (at === st) {
      const n = ch[tn] + 12 * oct, dur = SPB * len;
      [-8, 8].forEach(det => { const o = synth('sawtooth', mtof(n), det, t, dur, 0.045, 3200, true); o.frequency.setValueAtTime(mtof(n - 1), t); o.frequency.exponentialRampToValueAtTime(mtof(n), t + 0.04); });
      if (L.chase) synth('square', mtof(n + 12), 0, t, dur, 0.022, 4000, true);
    }
  }
})();
