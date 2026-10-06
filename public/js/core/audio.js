import { LEAD, musicLayers } from '../data/music.js';
import { RELOADS, SFX_DIR, reloadOf } from '../data/reloads.js';
import { clamp } from './util.js';

// ================= AUDIO =================
export const Sound = (() => {
  let ctx = null, master, sfx, sirenPan, heliPan, engPan, mus, noise, reverbIn, sirenGain, heliGain, skidGain, skidF, engO1, engO2, engF, engG, musicOn = true, seq = null, step = 0, nextT = 0, intensity = 0, wantIntensity = 0, layers = musicLayers(0);
  const mix = { on: true, sfx: 1, music: 1 }; // from the Settings screen
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function makeNoise() { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  function impulse(sec, decay) { const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return b; }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = mix.on ? 0.85 : 0; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; comp.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = 0.75 * mix.sfx; sfx.connect(comp);
    mus = ctx.createGain(); mus.gain.value = musicLevel(); mus.connect(comp);
    noise = makeNoise();
    const conv = ctx.createConvolver(); conv.buffer = impulse(1.8, 2.6); const rv = ctx.createGain(); rv.gain.value = 0.4; conv.connect(rv); rv.connect(mus); reverbIn = conv;
    // siren: wailing saw
    const so = ctx.createOscillator(); so.type = 'sawtooth'; so.frequency.value = 900;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.35; const lg = ctx.createGain(); lg.gain.value = 320; lfo.connect(lg); lg.connect(so.frequency);
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1700;
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0; so.connect(sf); sf.connect(sirenGain); sirenGain.connect(sirenPan = panner()); so.start(); lfo.start();
    // helicopter rotor: chopped noise
    const hn = ctx.createBufferSource(); hn.buffer = noise; hn.loop = true;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 380;
    const chop = ctx.createGain(); chop.gain.value = 0.5; const clfo = ctx.createOscillator(); clfo.type = 'square'; clfo.frequency.value = 13; const cg = ctx.createGain(); cg.gain.value = 0.5; clfo.connect(cg); cg.connect(chop.gain);
    heliGain = ctx.createGain(); heliGain.gain.value = 0; hn.connect(hf); hf.connect(chop); chop.connect(heliGain); heliGain.connect(heliPan = panner()); hn.start(); clfo.start();
    // boxer twin: low saw at the firing rate plus a soft triangle octave, through a gentle tracking lowpass
    // and a fixed one that keeps the buzzy highs out
    engO1 = ctx.createOscillator(); engO1.type = 'sawtooth'; engO1.frequency.value = 18;
    engO2 = ctx.createOscillator(); engO2.type = 'triangle'; engO2.frequency.value = 36; const e2g = ctx.createGain(); e2g.gain.value = 0.45;
    engF = ctx.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 220; engF.Q.value = 0.9;
    const engCap = ctx.createBiquadFilter(); engCap.type = 'lowpass'; engCap.frequency.value = 650; engCap.Q.value = 0.5;
    engG = ctx.createGain(); engG.gain.value = 0; engO1.connect(engF); engO2.connect(e2g); e2g.connect(engF); engF.connect(engCap); engCap.connect(engG); engG.connect(engPan = panner()); engO1.start(); engO2.start();
    // tyre squeal: narrow band of noise, wavering a little
    const kn = ctx.createBufferSource(); kn.buffer = noise; kn.loop = true; kn.playbackRate.value = 0.8;
    skidF = ctx.createBiquadFilter(); skidF.type = 'bandpass'; skidF.frequency.value = 1500; skidF.Q.value = 9;
    const klfo = ctx.createOscillator(); klfo.frequency.value = 7; const klg = ctx.createGain(); klg.gain.value = 90; klfo.connect(klg); klg.connect(skidF.frequency);
    skidGain = ctx.createGain(); skidGain.gain.value = 0; kn.connect(skidF); skidF.connect(skidGain); skidGain.connect(sfx); kn.start(); klfo.start();
    startMusic(); loadSamples();
  }
  function musicLevel() { return musicOn ? 0.32 * mix.music : 0; }
  function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  // a stereo panner into the effects bus (or the bus itself where the browser has none); the looping voices keep
  // one each and steer it as their source moves
  function panner(pan) {
    if (!ctx.createStereoPanner) return sfx;
    const p = ctx.createStereoPanner(); p.pan.value = clamp(pan || 0, -1, 1); p.connect(sfx); return p;
  }
  function steer(p, pan) { if (p.pan) p.pan.setTargetAtTime(clamp(pan || 0, -1, 1), ctx.currentTime, 0.08); }
  function out(vol, pan) { const g = ctx.createGain(); g.gain.value = vol; g.connect(panner(pan)); return g; }
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
    for (const { sound } of Object.values(RELOADS)) {
      if (!sound || sound in buffers) continue;
      buffers[sound] = null;
      fetch(`${SFX_DIR}${sound}.mp3`).then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status)).then(b => ctx.decodeAudioData(b)).then(buf => { buffers[sound] = buf; }).catch(() => {});
    }
  }
  function sample(name, vol, pan) {
    const buf = buffers[name]; if (!buf) return null;
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(out(vol, pan)); s.start(); return s;
  }
  function stopReload() { if (reloadSrc) { try { reloadSrc.stop(); } catch (e) { /* already ended */ } reloadSrc = null; } }
  function clickReload(vol, pan) { const t = ctx.currentTime, o = out(0.5 * vol, pan); nz(o, t, 0.04, 'bandpass', 2800, 3, 0.8); nz(o, t + 0.22, 0.05, 'bandpass', 1900, 3, 0.9); }
  const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const GUN = { pistol: [3600, .22, 150, .9], smg: [5200, .1, 210, .6], shotgun: [2300, .55, 80, 1.35], rifle: [5600, .17, 130, .85], minigun: [6200, .07, 240, .5], rpg: [1400, .7, 60, .9] };
  function shot(kind, vol = 1, pan = 0) {
    if (!ctx || vol < 0.02) return; const p = GUN[kind] || GUN.pistol, t = ctx.currentTime, o = out(vol, pan);
    nz(o, t, p[1], 'lowpass', p[0], 0.8, p[3], 0.85 + Math.random() * 0.3);
    tone(o, t, 'sine', p[2] * 2, p[2] * 0.5, p[1] * 0.8, p[3] * 0.8);
    nz(o, t, 0.03, 'highpass', 6000, 0.5, p[3] * 0.4);
    if (kind === 'rpg') { const f = nz(o, t, 0.9, 'bandpass', 600, 2, 0.5); f.frequency.exponentialRampToValueAtTime(2500, t + 0.9); }
  }
  return {
    init, get ready() { return !!ctx; },
    shot,
    boom(vol = 1, pan = 0) { if (!ctx || vol < 0.02) return; const t = ctx.currentTime, o = out(vol, pan); nz(o, t, 1.6, 'lowpass', 900, 0.6, 1.4, 0.6); tone(o, t, 'sine', 90, 30, 0.9, 1.2); nz(o, t, 0.3, 'bandpass', 2400, 1, 0.5); },
    hit() { if (!ctx) return; tone(out(0.35, 0), ctx.currentTime, 'square', 1700, 1200, 0.05, 0.4); },
    head() { if (!ctx) return; const t = ctx.currentTime, o = out(0.4, 0); tone(o, t, 'square', 2100, 1500, 0.05, 0.4); tone(o, t + 0.05, 'square', 2600, 1900, 0.06, 0.35); },
    ting(vol, pan) { if (!ctx || vol < .02) return; tone(out(vol * 0.25, pan), ctx.currentTime, 'triangle', 3200 + Math.random() * 800, 2400, 0.12, 0.5); },
    hurt() { if (!ctx) return; const t = ctx.currentTime, o = out(0.6, 0); tone(o, t, 'sawtooth', 210, 120, 0.18, 0.4); nz(o, t, 0.1, 'lowpass', 500, 1, 0.6); },
    scream(vol, pan) { if (!ctx || vol < 0.03) return; const t = ctx.currentTime, o = out(vol * 0.5, pan); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100 + Math.random() * 500; f.Q.value = 2.5; f.connect(o); const b = 380 + Math.random() * 300; const os = tone(f, t, 'sawtooth', b * 1.6, b * 0.7, 0.55, 0.9, 0.02); const v = ctx.createOscillator(); v.frequency.value = 7; const vg = ctx.createGain(); vg.gain.value = 30; v.connect(vg); vg.connect(os.frequency); v.start(t); v.stop(t + 0.6); },
    cash() { if (!ctx) return; const t = ctx.currentTime, o = out(0.3, 0); tone(o, t, 'square', 1046, 0, 0.07, 0.35); tone(o, t + 0.07, 'square', 1568, 0, 0.12, 0.35); },
    pickup() { if (!ctx) return; const t = ctx.currentTime, o = out(0.35, 0); [523, 659, 784, 1046].forEach((f, i) => tone(o, t + i * 0.05, 'triangle', f, 0, 0.1, 0.5)); },
    // a gun's own reload sound (data/reloads.js); a new reload, or switching guns, cuts the last one off
    reload(id, vol = 1, pan = 0) {
      if (!ctx) return; stopReload(); if (vol < 0.02) return;
      const name = reloadOf(id).sound;
      reloadSrc = name && sample(name, 0.6 * vol, pan);
      if (!reloadSrc) clickReload(vol, pan);
    },
    stopReload() { if (ctx) stopReload(); },
    get samplesLoaded() { return Object.keys(buffers).filter(k => buffers[k]); },
    empty() { if (!ctx) return; nz(out(0.4, 0), ctx.currentTime, 0.03, 'highpass', 4000, 2, 0.7); },
    horn(vol, pan) { if (!ctx || vol < .03) return; const t = ctx.currentTime, o = out(vol * 0.25, pan); tone(o, t, 'square', 392, 0, 0.45, 0.5, 0.01); tone(o, t, 'square', 494, 0, 0.45, 0.4, 0.01); },
    star() { if (!ctx) return; const t = ctx.currentTime, o = out(0.4, 0); tone(o, t, 'triangle', 880, 0, 0.15, 0.6); tone(o, t + 0.12, 'triangle', 660, 0, 0.3, 0.6); },
    buy() { if (!ctx) return; const t = ctx.currentTime, o = out(0.35, 0); [784, 988, 1175, 1568].forEach((f, i) => tone(o, t + i * 0.06, 'square', f, 0, 0.09, 0.3)); nz(o, t + 0.25, 0.08, 'bandpass', 3000, 3, 0.6); },
    deny() { if (!ctx) return; const t = ctx.currentTime, o = out(0.35, 0); tone(o, t, 'square', 220, 0, 0.12, 0.4); tone(o, t + 0.13, 'square', 165, 0, 0.2, 0.4); },
    thud(vol, pan) { if (!ctx || vol < 0.02) return; const t = ctx.currentTime, o = out(vol, pan); nz(o, t, 0.22, 'lowpass', 420, 1, 1.1, 0.7); tone(o, t, 'sine', 140, 45, 0.2, 0.9); },
    setEngine(vol, rpm, pan = 0) { if (!ctx) return; steer(engPan, pan); const t = ctx.currentTime, f = rpm / 60; engO1.frequency.setTargetAtTime(f, t, 0.06); engO2.frequency.setTargetAtTime(f * 2.02, t, 0.06); engF.frequency.setTargetAtTime(Math.min(140 + f * 3.5, 600), t, 0.08); engG.gain.setTargetAtTime(vol, t, 0.12); },
    // tyres sliding: 0 (gripping) to 1 (a full drift)
    setSkid(v) { if (!ctx) return; const t = ctx.currentTime; skidGain.gain.setTargetAtTime(v * 0.22, t, 0.06); skidF.frequency.setTargetAtTime(1300 + v * 500, t, 0.1); },
    setSiren(v, pan = 0) { if (ctx) { sirenGain.gain.setTargetAtTime(v, ctx.currentTime, 0.3); steer(sirenPan, pan); } },
    setHeli(v, pan = 0) { if (ctx) { heliGain.gain.setTargetAtTime(v, ctx.currentTime, 0.3); steer(heliPan, pan); } },
    // the wanted level; new layers join (or drop out) on the next beat
    setIntensity(level) { wantIntensity = level; },
    get intensity() { return intensity; },
    toggleMusic() { musicOn = !musicOn; if (ctx) mus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.2); return musicOn; },
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
