import { ALL_AMB_FILES, AMB } from '../data/ambience.js';
import { ALL_IMPACT_FILES, IMPACTS, impactFiles } from '../data/impacts.js';
import { LEAD, musicLayers } from '../data/music.js';
import { RELOADS, SFX_DIR, reloadOf } from '../data/reloads.js';
import { ALL_SHOT_FILES, SHOTS, shotFiles } from '../data/shots.js';
import { clamp } from './util.js';
import { HEAR, airCutoff, distToEar, doppler, echoSend, falloff, listenerPose } from './spatial.js';

// ================= AUDIO =================
export const Sound = (() => {
  let ctx = null, master, dimmer, dimmed = false, sfx, mus, musLvl, noise, reverbIn, skidGain, skidF, amb, ambDuck, bedF, echoIn, slap, slapG, tailG, own, ownVoice, engG, evOwn, evG, musicOn = true, seq = null, step = 0, nextT = 0, intensity = 0, wantIntensity = 0, layers = musicLayers(0);
  const mix = { on: true, sfx: 1, music: 1, amb: 1 }; // from the Settings screen
  const AMB_LEVEL = 0.3, RADIO_ON_FOOT = 0.5; // the city's level next to the effects; the radio's share while on foot
  let radioK = 1; const beds = {};
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
    // the radio: every note plays into mus, which the beach huts' radios also listen to; musLvl is its volume
    mus = ctx.createGain(); musLvl = ctx.createGain(); musLvl.gain.value = musicLevel(); mus.connect(musLvl); musLvl.connect(comp);
    // the city around you (game/ambience.js) on its own volume: ducked for a moment under gunfire and bangs
    amb = ctx.createGain(); amb.gain.value = AMB_LEVEL * mix.amb; amb.connect(comp); ambDuck = ctx.createGain(); ambDuck.connect(amb);
    bedF = ctx.createBiquadFilter(); bedF.type = 'lowpass'; bedF.frequency.value = 12000; bedF.connect(ambDuck);
    noise = makeNoise();
    const conv = ctx.createConvolver(); conv.buffer = impulse(1.8, 2.6); const rv = ctx.createGain(); rv.gain.value = 0.4; conv.connect(rv); rv.connect(mus); reverbIn = conv;
    // the street's echo: placed sounds send a share here (see out below); the walls take the highs off, then a
    // slap that comes back once and fades over a few repeats, and a short ring. room() sets all three per place.
    echoIn = ctx.createGain(); echoIn.gain.value = 0; const wall = ctx.createBiquadFilter(); wall.type = 'lowpass'; wall.frequency.value = 3200; echoIn.connect(wall);
    slap = ctx.createDelay(0.5); slap.delayTime.value = 0.08; const fb = ctx.createGain(); fb.gain.value = 0.28; slapG = ctx.createGain(); slapG.gain.value = 0.55;
    wall.connect(slap); slap.connect(fb); fb.connect(slap); slap.connect(slapG); slapG.connect(sfx);
    const ring = ctx.createConvolver(); ring.buffer = impulse(1.3, 3.2); tailG = ctx.createGain(); tailG.gain.value = 0.5; wall.connect(ring); ring.connect(tailG); tailG.connect(sfx);
    // the player's own ride: not placed, since the listener sits on it
    engG = ctx.createGain(); engG.gain.value = 0; engG.connect(sfx); ownVoice = 'twin'; own = makeEngine({ voice: ownVoice }); own.out.connect(engG);
    // the player's own electric car: the hum and the road under it, also unplaced
    evOwn = makeEv(); evG = ctx.createGain(); evG.gain.value = 0; evOwn.out.connect(evG); evG.connect(sfx);
    // tyre squeal: narrow band of noise, wavering a little
    const kn = ctx.createBufferSource(); kn.buffer = noise; kn.loop = true; kn.playbackRate.value = 0.8;
    skidF = ctx.createBiquadFilter(); skidF.type = 'bandpass'; skidF.frequency.value = 1500; skidF.Q.value = 9;
    const klfo = ctx.createOscillator(); klfo.frequency.value = 7; const klg = ctx.createGain(); klg.gain.value = 90; klfo.connect(klg); klg.connect(skidF.frequency);
    skidGain = ctx.createGain(); skidGain.gain.value = 0; kn.connect(skidF); skidF.connect(skidGain); skidGain.connect(sfx); kn.start(); klfo.start();
    startMusic(); loadSamples(); renderLoops();
  }
  function musicLevel() { return musicOn ? 0.32 * mix.music * radioK : 0; }
  function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  // ---- placing sounds in the world ----
  // The listener (where the player's head is, facing the camera) is moved every frame by listen(). A sound with
  // a source goes gain (its volume at this distance) -> lowpass (air dulling far sounds) -> HRTF panner (direction,
  // in front, behind, above) -> the effects bus. Distance is handled by our own curves (core/spatial.js), so the
  // panners themselves don't roll off.
  let L = null, room = null; const recent = [];
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
  function panner(p, hrtf, bus = sfx) {
    const n = ctx.createPanner(); n.panningModel = hrtf ? 'HRTF' : 'equalpower'; n.distanceModel = 'inverse'; n.refDistance = 1; n.rolloffFactor = 0;
    const t = ctx.currentTime; if (!setPos(n, 'position', p.x, p.y ?? 1, p.z, t, true)) n.setPosition(p.x, p.y ?? 1, p.z);
    n.connect(bus); return n;
  }
  // the node a sound plays into: at `at` (a world point) heard by the `prof` rules, or straight into the
  // effects bus when it has no place (the player's own gun, the UI); null when it is too far off to hear.
  // `echo` sends a share of it to the street's echo: on for everything placed, and the player's own gun and bangs.
  function out(vol, at, prof, echo = !!at, bus = sfx) {
    let g = ctx.createGain(), dest = bus, d = 0, p = prof || HEAR.shot;
    if (at) {
      L = L || listenerPose();
      d = distToEar(at, L); vol *= falloff(d, p);
      if (vol >= 0.004 && ctx.createPanner) {
        const t = ctx.currentTime; while (recent.length && recent[0] < t - 0.5) recent.shift(); recent.push(t);
        dest = ctx.createBiquadFilter(); dest.type = 'lowpass'; dest.frequency.value = airCutoff(d, p); dest.connect(panner(at, recent.length <= 12, bus));
      }
    }
    if (vol < 0.004) return null;
    g.gain.value = vol; g.connect(dest);
    if (echo) { const e = ctx.createGain(); e.gain.value = echoSend(d, p); g.connect(e); e.connect(echoIn); }
    return g;
  }

  // ---- looping sources: one voice per siren, rotor and passing engine ----
  // loops(kind, sources) is called every frame with every candidate source of that kind ({ key, x, y, z, vol,
  // prof, ...}; prof, when given, is how that one source carries); the loudest few as heard from here get a voice,
  // which follows its source, and the rest stay silent.
  // A voice whose source drops out fades and is freed. Each voice estimates how fast its source closes on the
  // listener for a touch of Doppler.
  const LOOPS = {
    siren: { max: 3, prof: HEAR.siren, make: makeSiren },
    rotor: { max: 2, prof: HEAR.rotor, make: makeRotor },
    tank: { max: 1, prof: HEAR.tank, make: makeTank },
    ufo: { max: 1, prof: HEAR.ufo, make: makeUfo },
    engine: { max: 6, prof: null, make: makeEngine },
    ev: { max: 3, prof: null, make: makeEv },
    // the city's own: the surf along the shore and sounds tied to places (game/ambience.js); they never move, so
    // the cheaper equal-power panner will do, and they play on the ambience volume
    surf: { max: 3, prof: HEAR.surf, make: () => makeLoop(AMB.surf), amb: true },
    spot: { max: 4, prof: HEAR.spot, make: makeSpot, amb: true },
  };
  const live = Object.fromEntries(Object.keys(LOOPS).map(k => [k, new Map()]));
  function loops(kind, list, prof) {
    if (!ctx) return;
    const def = LOOPS[kind], p = prof || def.prof, map = live[kind], t = ctx.currentTime; L = L || listenerPose();
    const heardNow = [];
    for (const s of list) { const d = distToEar(s, L), g = (s.vol ?? 1) * falloff(d, s.prof || p); if (g > 0.001) heardNow.push({ s, d, g }); }
    heardNow.sort((a, b) => b.g - a.g); heardNow.length = Math.min(heardNow.length, def.max);
    const keep = new Set();
    for (const { s, d, g } of heardNow) {
      let v = map.get(s.key);
      if (!v) {
        v = def.make(s); v.gain = ctx.createGain(); v.gain.gain.value = 0; v.air = ctx.createBiquadFilter(); v.air.type = 'lowpass'; v.air.frequency.value = airCutoff(d, s.prof || p);
        v.pan = panner(s, !def.amb, def.amb ? ambDuck : sfx); v.out.connect(v.gain); v.gain.connect(v.air); v.air.connect(v.pan);
        v.lastD = d; v.lastT = t; v.closing = 0; map.set(s.key, v);
      }
      keep.add(s.key);
      const dt = t - v.lastT; if (dt > 0.01) { v.closing += (clamp((v.lastD - d) / dt, -60, 60) - v.closing) * Math.min(1, dt * 6); v.lastD = d; v.lastT = t; }
      v.gain.gain.setTargetAtTime(g, t, 0.12); v.air.frequency.setTargetAtTime(airCutoff(d, s.prof || p), t, 0.1);
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
  // UFO: a low beating hum of two close sines under a high warble that rises and falls
  function makeUfo() {
    const a = ctx.createOscillator(), b = ctx.createOscillator(), w = ctx.createOscillator(); a.frequency.value = 96; b.frequency.value = 99; w.frequency.value = 760;
    const wg = ctx.createGain(); wg.gain.value = 0.12; const lfo = ctx.createOscillator(); lfo.frequency.value = 0.7; const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(w.frequency);
    const mix = ctx.createGain(); mix.gain.value = 0.6; a.connect(mix); b.connect(mix); w.connect(wg); wg.connect(mix);
    a.start(); b.start(); w.start(); lfo.start();
    return { out: mix, set(s, k, t) { a.frequency.setTargetAtTime(96 * k, t, 0.1); b.frequency.setTargetAtTime(99 * k, t, 0.1); }, stop() { a.stop(); b.stop(); w.stop(); lfo.stop(); } };
  }
  // the engine a vehicle sounds like, by its source's `voice` (vehicles/engine.js picks one per model): a bike's
  // boxer twin, a car's four, a truck's diesel or the Model Y's motor whine. The player's own ride uses the same ones.
  function makeEngine(s) { return (VOICES[s && s.voice] || makeTwin)(); }
  // boxer twin: low saw at the firing rate plus a soft triangle octave, through a gentle tracking lowpass and a
  // fixed one that keeps the buzzy highs out
  function makeTwin() {
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 18;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 36; const g2 = ctx.createGain(); g2.gain.value = 0.45;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 0.9;
    const cap = ctx.createBiquadFilter(); cap.type = 'lowpass'; cap.frequency.value = 650; cap.Q.value = 0.5;
    o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(cap); o1.start(); o2.start();
    return { out: cap, set(s, k, t) { const hz = (s.rpm || 1050) / 60 * k; o1.frequency.setTargetAtTime(hz, t, 0.06); o2.frequency.setTargetAtTime(hz * 2.02, t, 0.06); f.frequency.setTargetAtTime(Math.min(140 + hz * 3.5, 600), t, 0.08); }, stop() { o1.stop(); o2.stop(); } };
  }
  // the hiss of tyres on the road, opening up with speed (s.speed in m/s); shared by the car voices
  function tyres(mix) {
    const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true; n.playbackRate.value = 0.6;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 0.7; const g = ctx.createGain(); g.gain.value = 0;
    n.connect(f); f.connect(g); g.connect(mix); n.start(0, Math.random() * 1.5);
    return { set(s, t) { const k = Math.min(Math.abs(s.speed || 0) / 30, 1); g.gain.setTargetAtTime(k * 0.9, t, 0.15); f.frequency.setTargetAtTime(220 + k * 380, t, 0.15); }, stop() { n.stop(); } };
  }
  // a car's inline four: two firings a turn, so an octave over a twin at the same revs; a rounder note than the
  // bike's (a saw with a sine an octave down, closed off lower) and the tyres underneath
  function makeFour() {
    const mix = ctx.createGain();
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 35;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 17.5; const g2 = ctx.createGain(); g2.gain.value = 0.7;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160; f.Q.value = 0.7;
    const cap = ctx.createBiquadFilter(); cap.type = 'lowpass'; cap.frequency.value = 420; cap.Q.value = 0.5;
    o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(cap); cap.connect(mix); o1.start(); o2.start();
    const road = tyres(mix);
    return { out: mix, set(s, k, t) {
      const hz = (s.rpm || 1050) / 30 * k; o1.frequency.setTargetAtTime(hz, t, 0.08); o2.frequency.setTargetAtTime(hz / 2, t, 0.08);
      f.frequency.setTargetAtTime(Math.min(110 + hz * 2.2, 380), t, 0.1); road.set(s, t);
    }, stop() { o1.stop(); o2.stop(); road.stop(); } };
  }
  // a truck's diesel six: three firings a turn on a deep, dull saw, with the knock of the injectors, a band of
  // noise chopped at the firing rate
  function makeDiesel() {
    const mix = ctx.createGain();
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 21;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 150; f.Q.value = 0.8; o.connect(f); f.connect(mix);
    const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1300; nf.Q.value = 2.5;
    const knock = ctx.createGain(); knock.gain.value = 0.06; const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 21; const lg = ctx.createGain(); lg.gain.value = 0.06;
    lfo.connect(lg); lg.connect(knock.gain); n.connect(nf); nf.connect(knock); knock.connect(mix);
    o.start(); n.start(0, Math.random() * 1.5); lfo.start();
    const road = tyres(mix);
    return { out: mix, set(s, k, t) {
      const hz = (s.rpm || 1050) / 20 * k; o.frequency.setTargetAtTime(hz, t, 0.1); lfo.frequency.setTargetAtTime(hz, t, 0.1);
      f.frequency.setTargetAtTime(Math.min(120 + hz * 1.4, 320), t, 0.12); road.set(s, t);
    }, stop() { o.stop(); n.stop(); lfo.stop(); road.stop(); } };
  }
  // the Model Y: no engine, the whine of its motor rising with speed (two sines a fifth apart) over the tyres
  function makeWhine() {
    const mix = ctx.createGain(), wg = ctx.createGain(); wg.gain.value = 0.05; wg.connect(mix);
    const a = ctx.createOscillator(); a.type = 'sine'; a.frequency.value = 300;
    const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = 450; const bg = ctx.createGain(); bg.gain.value = 0.4;
    a.connect(wg); b.connect(bg); bg.connect(wg); a.start(); b.start();
    const road = tyres(mix);
    return { out: mix, set(s, k, t) {
      const sp = Math.abs(s.speed || 0), hz = (240 + sp * 38) * k; a.frequency.setTargetAtTime(hz, t, 0.08); b.frequency.setTargetAtTime(hz * 1.5, t, 0.08);
      wg.gain.setTargetAtTime(0.02 + Math.min(sp / 15, 1) * 0.06, t, 0.12); road.set(s, t);
    }, stop() { a.stop(); b.stop(); road.stop(); } };
  }
  const VOICES = { twin: makeTwin, four: makeFour, diesel: makeDiesel, whine: makeWhine };
  // a recording (data/ambience.js) played round and round from a random point, so two of them never line up;
  // silent until it has loaded, then it comes in on its own
  function makeLoop(name) {
    const out = ctx.createGain(); let src = null;
    const go = () => { const buf = buffers[name]; if (src || !buf) return; src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(out); src.start(0, Math.random() * buf.duration); };
    go();
    return { out, set() { go(); }, stop() { if (src) src.stop(); } };
  }
  // a place's sound (game/ambience.js): a recording or a groove drawn by renderLoops, s.sound, heard through a wall
  // when s.wall (a lowpass, Hz) is set; or s.sound 'radio', a beach hut's radio playing Neon FM, small and tinny
  function makeSpot(s) {
    if (s.sound === 'radio') {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      mus.connect(hp); hp.connect(lp); return { out: lp, set() {}, stop() { mus.disconnect(hp); } };
    }
    const v = makeLoop(s.sound); if (!s.wall) return v;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = s.wall; f.Q.value = 0.8; v.out.connect(f);
    return { out: f, set: v.set, stop: v.stop };
  }
  // the city beds (day, night and the wind on the roofs), each on its own level; day and night go through a lowpass
  // that dulls the street from up on a roof
  function bed(name) {
    if (!beds[name]) { const v = makeLoop(AMB[name]), g = ctx.createGain(); g.gain.value = 0; v.out.connect(g); g.connect(name === 'wind' ? ambDuck : bedF); beds[name] = { v, g }; }
    return beds[name];
  }
  // under a gunshot or a bang close by the city drops back for a moment, so the fight reads clearly
  function duck(at) {
    if (at) { L = L || listenerPose(); if (distToEar(at, L) > 40) return; }
    const g = ambDuck.gain, t = ctx.currentTime; g.setTargetAtTime(0.55, t, 0.02); g.setTargetAtTime(1, t + 0.3, 0.5);
  }
  // electric car: no engine. Below 30 km/h a soft two-tone hum (sines a fifth apart, with a slow wobble) that rises
  // a little with speed; then road noise, low tyre rumble plus a breathier band of wind, both opening up with speed.
  // s.hum and s.road (0 to 1) set how much of each, s.speed (km/h) the pitch and brightness (see vehicles/engine.js).
  function makeEv() {
    const mix = ctx.createGain();
    const h1 = ctx.createOscillator(); h1.type = 'sine'; h1.frequency.value = 330;
    const h2 = ctx.createOscillator(); h2.type = 'triangle'; h2.frequency.value = 495; const h2g = ctx.createGain(); h2g.gain.value = 0.35;
    const hum = ctx.createGain(); hum.gain.value = 0;
    const wob = ctx.createOscillator(); wob.frequency.value = 3.2; const wg = ctx.createGain(); wg.gain.value = 0.18; wob.connect(wg);
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1400; hf.Q.value = 0.6;
    const trem = ctx.createGain(); trem.gain.value = 1; wg.connect(trem.gain);
    h1.connect(hf); h2.connect(h2g); h2g.connect(hf); hf.connect(trem); trem.connect(hum); hum.connect(mix);
    const rn = ctx.createBufferSource(); rn.buffer = noise; rn.loop = true; rn.playbackRate.value = 0.6;
    const tyre = ctx.createBiquadFilter(); tyre.type = 'lowpass'; tyre.frequency.value = 250; tyre.Q.value = 0.7;
    const wind = ctx.createBiquadFilter(); wind.type = 'bandpass'; wind.frequency.value = 900; wind.Q.value = 0.5; const windG = ctx.createGain(); windG.gain.value = 0;
    const road = ctx.createGain(); road.gain.value = 0;
    rn.connect(tyre); tyre.connect(road); rn.connect(wind); wind.connect(windG); windG.connect(road); road.connect(mix);
    const t0 = ctx.currentTime; h1.start(t0); h2.start(t0); wob.start(t0); rn.start(t0, Math.random() * 1.5);
    return {
      out: mix,
      set(s, k, t) {
        const sp = s.speed || 0, f = (330 + sp * 4) * k;
        h1.frequency.setTargetAtTime(f, t, 0.08); h2.frequency.setTargetAtTime(f * 1.5, t, 0.08);
        hum.gain.setTargetAtTime((s.hum || 0) * 0.5, t, 0.15);
        road.gain.setTargetAtTime((s.road || 0) * 1.6, t, 0.15);
        tyre.frequency.setTargetAtTime(220 + sp * 4, t, 0.15); windG.gain.setTargetAtTime(Math.min(sp / 140, 1) * 0.6, t, 0.2); wind.frequency.setTargetAtTime(700 + sp * 6, t, 0.2);
      },
      stop() { h1.stop(); h2.stop(); wob.stop(); rn.stop(); },
    };
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
  // recorded sounds (public/sfx/), decoded once; until one has loaded (or if it fails) its synthesized stand-in plays
  const buffers = {};
  let reloadSrc = null;
  function loadSamples() {
    for (const sound of [...ALL_SHOT_FILES, ...ALL_IMPACT_FILES, ...Object.values(RELOADS).map(r => r.sound), ...ALL_AMB_FILES]) {
      if (!sound || sound in buffers) continue;
      buffers[sound] = null;
      fetch(`${SFX_DIR}${sound}.mp3`).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).then(b => ctx.decodeAudioData(b)).then(buf => { buffers[sound] = buf; }).catch(() => {});
    }
  }
  // a loaded sound played once: its source node, null when it is too far off to hear, false when not loaded
  function sample(name, vol, at, prof = HEAR.reload, rate = 1, echo = !!at, bus = sfx) {
    const buf = buffers[name]; if (!buf) return false;
    const o = out(vol, at, prof, echo, bus); if (!o) return null;
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate; s.connect(o); s.start(); return s;
  }
  // ---- grooves for the city's places ----
  // the music heard through the wall of a club or a bar, an arcade's bleeps and the buzz of a neon sign: each a
  // couple of seconds drawn once into a buffer with an offline context when the sound starts, then looped like a
  // recording by the spots in game/ambience.js
  const BPM = 120, BEAT = 60 / BPM, E = BEAT / 2; // two bars of 4/4 at 120 make 4 s
  function renderLoops() {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return;
    for (const [name, [dur, draw]] of Object.entries(GROOVES)) {
      const c = new OAC(1, Math.round(ctx.sampleRate * dur), ctx.sampleRate), out = c.createGain(); out.connect(c.destination);
      draw(c, out);
      const r = c.startRendering(); if (r && r.then) r.then(b => { buffers[name] = b; }).catch(() => {});
    }
  }
  // a note or a drum hit in an offline context: an oscillator gliding f0 to f1 (or noise through a filter when
  // type is a filter type) under a quick attack and an exponential fall
  function hitAt(c, dest, t, type, f0, f1, dur, peak) {
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(dest);
    let src;
    if (['lowpass', 'highpass', 'bandpass'].includes(type)) {
      src = c.createBufferSource(); const b = c.createBuffer(1, noise.length, noise.sampleRate); b.copyToChannel(noise.getChannelData(0), 0); src.buffer = b;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = f0; f.Q.value = f1 || 0.8; src.connect(f); f.connect(g); src.start(t, Math.random()); src.stop(t + dur + 0.02); return;
    }
    src = c.createOscillator(); src.type = type; src.frequency.setValueAtTime(f0, t); if (f1) src.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(g); src.start(t); src.stop(t + dur + 0.02);
  }
  const GROOVES = {
    // a disco club: four on the floor, a clap on two and four, and the bass jumping octaves on the eighths (Am, F)
    'club-disco': [8 * BEAT, (c, o) => {
      for (let b = 0; b < 8; b++) {
        const t = b * BEAT, root = b < 4 ? 55 : 43.65;
        hitAt(c, o, t, 'sine', 130, 42, 0.32, 0.9);
        if (b % 2) hitAt(c, o, t, 'bandpass', 1400, 1.2, 0.14, 0.35);
        hitAt(c, o, t, 'triangle', root, 0, E * 0.9, 0.45); hitAt(c, o, t + E, 'triangle', root * 2, 0, E * 0.9, 0.4);
      }
    }],
    // a Latin bar: the son clave (3-2), the tumbao bass pushing ahead of the beat, congas on four and its "and",
    // and a piano montuno over C and G
    'club-salsa': [8 * BEAT, (c, o) => {
      for (const e of [0, 3, 6, 10, 12]) hitAt(c, o, e * E, 'sine', 2300, 0, 0.06, 0.25); // clave, in eighths over the two bars
      for (let bar = 0; bar < 2; bar++) {
        const t0 = bar * 4 * BEAT, [a, b] = bar ? [49, 65.4] : [65.4, 49]; // C then G, G then C
        hitAt(c, o, t0 + 3 * E, 'triangle', a, 0, 3 * E, 0.55); hitAt(c, o, t0 + 6 * E, 'triangle', b, 0, 2 * E, 0.5);
        hitAt(c, o, t0 + 6 * E, 'sine', 230, 200, 0.18, 0.5); hitAt(c, o, t0 + 7 * E, 'sine', 230, 200, 0.18, 0.45); // open congas
        for (const e of [0, 2, 4]) hitAt(c, o, t0 + e * E, 'sine', 120, 90, 0.12, 0.25); // heel and toe on the low drum
        const chord = bar ? [196, 246.9, 293.7] : [261.6, 329.6, 392];
        for (const [i, e] of [0, 2, 3, 5, 7].entries()) hitAt(c, o, t0 + e * E, 'triangle', chord[i % 3], 0, 0.2, 0.18);
        for (let q = 0; q < 4; q++) hitAt(c, o, t0 + q * BEAT, 'square', 800, 0, 0.07, 0.05); // cowbell
      }
    }],
    // an arcade's attract mode: little square-wave runs and blips, never quite the same game twice
    arcade: [8 * BEAT, (c, o) => {
      let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let t = 0; t < 8 * BEAT - 0.3; t += 0.09 + r() * 0.25) {
        const f = 400 + Math.floor(r() * 8) * 160;
        if (r() < 0.3) for (let k = 0; k < 4; k++) hitAt(c, o, t + k * 0.05, 'square', f * (1 + k * 0.25), 0, 0.05, 0.12);
        else hitAt(c, o, t, 'square', f, r() < 0.4 ? f * 0.5 : 0, 0.07, 0.12);
      }
    }],
    // a neon tube's buzz: the mains hum (60 Hz here, so it buzzes at 120) with its harmonics, and a crackle now and then
    'neon-buzz': [1, (c, o) => {
      for (const [type, f, a] of [['sawtooth', 120, 0.25], ['square', 240, 0.08], ['sine', 360, 0.12]]) {
        const x = c.createOscillator(), g = c.createGain(); x.type = type; x.frequency.value = f; g.gain.value = a; x.connect(g); g.connect(o); x.start(0); x.stop(1);
      }
      for (const t of [0.13, 0.52, 0.81]) hitAt(c, o, t, 'highpass', 3000, 0.7, 0.03, 0.2);
    }],
  };
  function stopReload() { if (reloadSrc) { try { reloadSrc.stop(); } catch (e) { /* already ended */ } reloadSrc = null; } }
  const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const GUN = { pistol: [3600, .22, 150, .9], smg: [5200, .1, 210, .6], shotgun: [2300, .55, 80, 1.35], rifle: [5600, .17, 130, .85], minigun: [6200, .07, 240, .5], rpg: [1400, .7, 60, .9], sniper: [3800, .5, 70, 1.45], laser: [4000, .12, 900, .7], cannon: [700, 1.1, 40, 1.8] };
  // `at` is where it was fired (a world point), or nothing for the player's own gun. A gun with recordings
  // (data/shots.js) plays one of its takes, a touch faster or slower each time; until they have loaded (or for a
  // gun without any) the synthesized shot below stands in.
  let shotsPlayed = 0;
  function shot(kind, vol = 1, at = null) {
    if (!ctx) return; duck(at);
    const takes = shotFiles(kind), name = takes[Math.floor(Math.random() * takes.length)];
    if (name && sample(name, SHOTS[kind].vol * vol, at, HEAR.shot, 0.95 + Math.random() * 0.1, true) !== false) { shotsPlayed++; return; }
    const o = out(vol, at, HEAR.shot, true); if (!o) return; const p = GUN[kind] || GUN.pistol, t = ctx.currentTime;
    // a laser has no bang: a falling sci-fi zap and a little fizz
    if (kind === 'laser') { tone(o, t, 'square', 2400, 220, 0.14, 0.32); tone(o, t, 'sine', 1300, 180, 0.18, 0.5); nz(o, t, 0.06, 'highpass', 5000, 0.5, 0.2); return; }
    nz(o, t, p[1], 'lowpass', p[0], 0.8, p[3], 0.85 + Math.random() * 0.3);
    tone(o, t, 'sine', p[2] * 2, p[2] * 0.5, p[1] * 0.8, p[3] * 0.8);
    nz(o, t, 0.03, 'highpass', 6000, 0.5, p[3] * 0.4);
    // the sniper's bolt racks back and forward once the crack has rung out
    if (kind === 'sniper') { tone(o, t + 0.55, 'square', 900, 500, 0.04, 0.25); tone(o, t + 0.8, 'square', 1300, 700, 0.05, 0.3); }
    if (kind === 'rpg') { const f = nz(o, t, 0.9, 'bandpass', 600, 2, 0.5); f.frequency.exponentialRampToValueAtTime(2500, t + 0.9); }
  }
  // a bullet landing on `surface` (data/impacts.js) at a world point: one of its takes, a touch higher or lower each
  // time, quiet next to the shot and without the street's echo; it leaves the city's sounds alone. Until the takes
  // have loaded a short filtered tick stands in.
  const IMPACT_SYNTH = { brick: ['bandpass', 2600, 1.4, 0.05], sand: ['lowpass', 900, 0.8, 0.08], wood: ['bandpass', 1300, 2.5, 0.06], water: ['bandpass', 1800, 0.7, 0.18], metal: ['bandpass', 3600, 6, 0.12], flesh: ['lowpass', 600, 1, 0.07] };
  const impactsPlayed = Object.fromEntries(Object.keys(IMPACTS).map(k => [k, 0]));
  function impact(surface, vol = 1, at = null) {
    if (!ctx || !IMPACTS[surface]) return;
    const takes = impactFiles(surface), name = takes[Math.floor(Math.random() * takes.length)];
    const s = sample(name, IMPACTS[surface].vol * vol, at, HEAR.impact, 0.92 + Math.random() * 0.16, false);
    if (s === null) return; // too far off to hear
    impactsPlayed[surface]++;
    if (s) return;
    const o = out(IMPACTS[surface].vol * vol, at, HEAR.impact, false); if (!o) return; const [type, f, q, dur] = IMPACT_SYNTH[surface];
    nz(o, ctx.currentTime, dur, type, f, q, 0.8, 1);
  }
  return {
    init, get ready() { return !!ctx; },
    shot, impact,
    // how many bullet impacts each surface has played, recorded or not, within earshot (for tests)
    get impactsPlayed() { return { ...impactsPlayed }; },
    boom(vol = 1, at = null) { if (!ctx) return; duck(at); const t = ctx.currentTime, o = out(vol, at, HEAR.boom, true); if (!o) return; nz(o, t, 1.6, 'lowpass', 900, 0.6, 1.4, 0.6); tone(o, t, 'sine', 90, 30, 0.9, 1.2); nz(o, t, 0.3, 'bandpass', 2400, 1, 0.5); },
    // the scope's zoom click; deeper on the way back out
    zoom(level) { if (!ctx) return; tone(out(0.3), ctx.currentTime, 'square', level ? 2400 + level * 400 : 1500, 1100, 0.035, 0.35); },
    hit() { if (!ctx) return; tone(out(0.35), ctx.currentTime, 'square', 1700, 1200, 0.05, 0.4); },
    head() { if (!ctx) return; const t = ctx.currentTime, o = out(0.4); tone(o, t, 'square', 2100, 1500, 0.05, 0.4); tone(o, t + 0.05, 'square', 2600, 1900, 0.06, 0.35); },
    ting(vol, at) { if (!ctx) return; const o = out(vol * 0.25, at, HEAR.ting, false); if (o) tone(o, ctx.currentTime, 'triangle', 3200 + Math.random() * 800, 2400, 0.12, 0.5); },
    hurt() { if (!ctx) return; const t = ctx.currentTime, o = out(0.6); tone(o, t, 'sawtooth', 210, 120, 0.18, 0.4); nz(o, t, 0.1, 'lowpass', 500, 1, 0.6); },
    scream(vol, at) { if (!ctx) return; const t = ctx.currentTime, o = out(vol * 0.5, at, HEAR.voice); if (!o) return; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100 + Math.random() * 500; f.Q.value = 2.5; f.connect(o); const b = 380 + Math.random() * 300; const os = tone(f, t, 'sawtooth', b * 1.6, b * 0.7, 0.55, 0.9, 0.02); const v = ctx.createOscillator(); v.frequency.value = 7; const vg = ctx.createGain(); vg.gain.value = 30; v.connect(vg); vg.connect(os.frequency); v.start(t); v.stop(t + 0.6); },
    cash() { if (!ctx) return; const t = ctx.currentTime, o = out(0.3); tone(o, t, 'square', 1046, 0, 0.07, 0.35); tone(o, t + 0.07, 'square', 1568, 0, 0.12, 0.35); },
    pickup() { if (!ctx) return; const t = ctx.currentTime, o = out(0.35); [523, 659, 784, 1046].forEach((f, i) => tone(o, t + i * 0.05, 'triangle', f, 0, 0.1, 0.5)); },
    // a gun's own reload sound (data/reloads.js), from the player's hands or `at` a world point; a new reload,
    // or switching guns, cuts the player's last one off
    reload(id, vol = 1, at = null) {
      if (!ctx) return; if (!at) stopReload();
      const name = reloadOf(id).sound, src = name && sample(name, 0.6 * vol, at);
      if (src === null) return; // too far off to hear
      if (src) { if (!at) reloadSrc = src; return; }
      const t = ctx.currentTime, o = out(0.5 * vol, at, HEAR.reload); if (!o) return;
      nz(o, t, 0.04, 'bandpass', 2800, 3, 0.8); nz(o, t + 0.22, 0.05, 'bandpass', 1900, 3, 0.9);
    },
    stopReload() { if (ctx) stopReload(); },
    get samplesLoaded() { return Object.keys(buffers).filter(k => buffers[k]); },
    // how many shots have played a recording rather than the synthesized stand-in (for tests)
    get shotsPlayed() { return shotsPlayed; },
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
    // a puff of the jetpack's roar; played back to back while it burns (game/jetpack.js)
    jet(vol = 1) { if (!ctx) return; const t = ctx.currentTime, o = out(vol * 0.3); nz(o, t, 0.14, 'lowpass', 700, 0.7, 0.9, 1); nz(o, t, 0.1, 'bandpass', 2600, 1.2, 0.25); },
    // the repair tool's torch: a hiss with a crackle of sparks; played back to back while it welds (game/repair.js)
    weld(vol = 1) { if (!ctx) return; const t = ctx.currentTime, o = out(vol * 0.22); nz(o, t, 0.12, 'highpass', 3200, 0.7, 0.6, 1); nz(o, t, 0.1, 'bandpass', 1300, 1.5, 0.35); if (Math.random() < 0.5) tone(o, t + Math.random() * 0.05, 'square', 2400 + Math.random() * 1600, 0, 0.02, 0.18, 0.002); },
    // a parachute opening: the cord's rip, the rustle of cloth, then the canopy snapping full (game/parachute.js)
    chute(vol = 1) { if (!ctx) return; const t = ctx.currentTime, o = out(vol * 0.4); nz(o, t, 0.08, 'highpass', 3000, 0.8, 0.5); nz(o, t + 0.05, 0.35, 'bandpass', 1400, 0.6, 0.4, 0.8); nz(o, t + 0.38, 0.16, 'lowpass', 500, 1, 1.2, 0.6); },
    thud(vol, at, prof = HEAR.thud) { if (!ctx) return; const t = ctx.currentTime, o = out(vol, at, prof); if (!o) return; nz(o, t, 0.22, 'lowpass', 420, 1, 1.1, 0.7); tone(o, t, 'sine', 140, 45, 0.2, 0.9); },
    // the player's own ride (the engine under you isn't placed): its voice ('twin', 'four', 'diesel', 'whine'; null
    // keeps the last one), revs and speed in m/s
    setEngine(vol, rpm, voice = null, speed = 0) {
      if (!ctx) return; const t = ctx.currentTime;
      if (voice && voice !== ownVoice) { own.out.disconnect(); own.stop(); ownVoice = voice; own = makeEngine({ voice }); own.out.connect(engG); }
      own.set({ rpm, speed }, 1, t); engG.gain.setTargetAtTime(vol, t, 0.12);
    },
    // the player's own electric car: vol overall, mix { hum, road, speed } from evMix in vehicles/engine.js
    setElectric(vol, mix) { if (!ctx) return; const t = ctx.currentTime; evOwn.set(mix, 1, t); evG.gain.setTargetAtTime(vol, t, 0.12); },
    // tyres sliding: 0 (gripping) to 1 (a full drift)
    setSkid(v) { if (!ctx) return; const t = ctx.currentTime; skidGain.gain.setTargetAtTime(v * 0.22, t, 0.06); skidF.frequency.setTargetAtTime(1300 + v * 500, t, 0.1); },
    // move the listener to the player's head and the camera's view; once a frame, before the sounds of the frame
    listen,
    // how the street around the listener echoes: { wet, delay, tail } from roomAt in world/acoustics.js
    room(r) {
      if (!ctx) return; const t = ctx.currentTime; room = r;
      echoIn.gain.setTargetAtTime(r.wet, t, 0.3); slap.delayTime.setTargetAtTime(r.delay, t, 0.3);
      tailG.gain.setTargetAtTime(0.25 + 0.5 * r.tail, t, 0.3); slapG.gain.setTargetAtTime(0.65 - 0.3 * r.tail, t, 0.3);
    },
    get echo() { return room; },
    // the city beds: { day, night, wind } levels (0 to 1) and how bright the street sounds (a lowpass in Hz), from
    // bedMix in game/ambience.js; eased in over a second or two
    bed(m) {
      if (!ctx) return; const t = ctx.currentTime;
      for (const k of ['day', 'night', 'wind']) { const b = bed(k); b.v.set(); b.g.gain.setTargetAtTime(m[k] || 0, t, 1.2); }
      bedF.frequency.setTargetAtTime(m.bright || 12000, t, 1);
    },
    // the places' grooves that have been drawn (for tests)
    get grooves() { return Object.keys(GROOVES).filter(k => buffers[k]); },
    // how loud each bed is meant to be right now, and whether its recording is playing (for tests)
    beds() { return Object.fromEntries(Object.entries(beds).map(([k, b]) => [k, { level: b.g.gain.value, loaded: !!buffers[AMB[k]] }])); },
    // a gull calling at a point over the beach
    gull(at) { if (!ctx) return; const n = AMB.gulls[Math.floor(Math.random() * AMB.gulls.length)]; sample(n, 0.45, at, HEAR.gull, 0.9 + Math.random() * 0.2, false, ambDuck); },
    // Neon FM plays at full volume in a vehicle and drops back while on foot, so the city can be heard
    onFoot(foot) {
      const k = foot ? RADIO_ON_FOOT : 1; if (k === radioK) return; radioK = k;
      if (ctx) musLvl.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.6);
    },
    get radio() { return radioK; },
    // the sirens, rotors, passing engines and electric cars out in the world this frame (see loops above)
    loops,
    // silence every looping sound at once: pausing, a shop menu, death
    hush() {
      if (!ctx) return; const t = ctx.currentTime;
      for (const map of Object.values(live)) for (const [key, v] of map) drop(map, key, v, t);
      engG.gain.setTargetAtTime(0, t, 0.12); evG.gain.setTargetAtTime(0, t, 0.12); skidGain.gain.setTargetAtTime(0, t, 0.06);
    },
    // how many voices of each looping kind are playing (for tests)
    voices() { return Object.fromEntries(Object.entries(live).map(([k, m]) => [k, m.size])); },
    // the sources of one looping kind that have a voice right now (for tests)
    playing(kind) { return [...(live[kind] || new Map()).keys()]; },
    // the wanted level; new layers join (or drop out) on the next beat
    setIntensity(level) { wantIntensity = level; },
    get intensity() { return intensity; },
    toggleMusic() { musicOn = !musicOn; if (ctx) musLvl.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.2); return musicOn; },
    // fade all sound down while a menu is open, and back up when it closes (on top of the Settings volumes)
    dim(on) {
      dimmed = !!on; if (!ctx) return;
      const g = dimmer.gain, t = ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(dimmed ? MENU_DIM : 1, t + DIM_FADE);
    },
    get dimmed() { return dimmed; },
    // sound on / off and the effects, music and city ambience volumes (0 to 1)
    setMix({ on, sfx: s, music, amb: a = 1 }) {
      Object.assign(mix, { on, sfx: s, music, amb: a }); if (!ctx) return;
      const t = ctx.currentTime; master.gain.setTargetAtTime(on ? 0.85 : 0, t, 0.05); sfx.gain.setTargetAtTime(0.75 * s, t, 0.05); musLvl.gain.setTargetAtTime(musicLevel(), t, 0.05);
      amb.gain.setTargetAtTime(AMB_LEVEL * a, t, 0.05);
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
    // a theremin out of an old flying-saucer film: one long sine per half bar, sliding up to its note with a wide vibrato
    if (L.theremin && st % 8 === 0) {
      const n = ch[(st / 8 + bar) % 3] + 24, dur = SPB * 8, o = synth('sine', mtof(n - 5), 0, t, dur, 0.05, 6000, true);
      o.frequency.setValueAtTime(mtof(n - 5), t); o.frequency.exponentialRampToValueAtTime(mtof(n), t + SPB * 2);
      const v = ctx.createOscillator(); v.frequency.value = 6.5; const vg = ctx.createGain(); vg.gain.value = mtof(n) * 0.025; v.connect(vg); vg.connect(o.frequency); v.start(t); v.stop(t + dur + 0.05);
    }
    if (L.arp && st % 2 === 0) synth('square', mtof(ch[(st / 2) % 3] + 12 + (st >= 8 ? 12 : 0)), 0, t, 0.16, 0.05, 2400, true);
    if (L.lead) for (const [at, tn, oct, len] of LEAD) if (at === st) {
      const n = ch[tn] + 12 * oct, dur = SPB * len;
      [-8, 8].forEach(det => { const o = synth('sawtooth', mtof(n), det, t, dur, 0.045, 3200, true); o.frequency.setValueAtTime(mtof(n - 1), t); o.frequency.exponentialRampToValueAtTime(mtof(n), t + 0.04); });
      if (L.chase) synth('square', mtof(n + 12), 0, t, dur, 0.022, 4000, true);
    }
  }
})();
