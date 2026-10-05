import { clamp } from './util.js';

// ================= AUDIO =================
export const Sound = (() => {
  let ctx = null, sfx, mus, noise, reverbIn, sirenGain, heliGain, engO1, engO2, engF, engG, musicOn = true, seq = null, step = 0, nextT = 0;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function makeNoise() { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  function impulse(sec, decay) { const len = ctx.sampleRate * sec, b = ctx.createBuffer(2, len, ctx.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return b; }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; comp.connect(master);
    sfx = ctx.createGain(); sfx.gain.value = 0.75; sfx.connect(comp);
    mus = ctx.createGain(); mus.gain.value = 0.32; mus.connect(comp);
    noise = makeNoise();
    const conv = ctx.createConvolver(); conv.buffer = impulse(1.8, 2.6); const rv = ctx.createGain(); rv.gain.value = 0.4; conv.connect(rv); rv.connect(mus); reverbIn = conv;
    // siren: wailing saw
    const so = ctx.createOscillator(); so.type = 'sawtooth'; so.frequency.value = 900;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.35; const lg = ctx.createGain(); lg.gain.value = 320; lfo.connect(lg); lg.connect(so.frequency);
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1700;
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0; so.connect(sf); sf.connect(sirenGain); sirenGain.connect(sfx); so.start(); lfo.start();
    // helicopter rotor: chopped noise
    const hn = ctx.createBufferSource(); hn.buffer = noise; hn.loop = true;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 380;
    const chop = ctx.createGain(); chop.gain.value = 0.5; const clfo = ctx.createOscillator(); clfo.type = 'square'; clfo.frequency.value = 13; const cg = ctx.createGain(); cg.gain.value = 0.5; clfo.connect(cg); cg.connect(chop.gain);
    heliGain = ctx.createGain(); heliGain.gain.value = 0; hn.connect(hf); hf.connect(chop); chop.connect(heliGain); heliGain.connect(sfx); hn.start(); clfo.start();
    // boxer twin: low saw at the firing rate plus a square octave, through a resonant lowpass
    engO1 = ctx.createOscillator(); engO1.type = 'sawtooth'; engO1.frequency.value = 18;
    engO2 = ctx.createOscillator(); engO2.type = 'square'; engO2.frequency.value = 36; const e2g = ctx.createGain(); e2g.gain.value = 0.35;
    engF = ctx.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 300; engF.Q.value = 4;
    engG = ctx.createGain(); engG.gain.value = 0; engO1.connect(engF); engO2.connect(e2g); e2g.connect(engF); engF.connect(engG); engG.connect(sfx); engO1.start(); engO2.start();
    startMusic();
  }
  function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function out(vol, pan) {
    const g = ctx.createGain(); g.gain.value = vol;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan || 0, -1, 1); g.connect(p); p.connect(sfx); } else g.connect(sfx);
    return g;
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
    reload() { if (!ctx) return; const t = ctx.currentTime, o = out(0.5, 0); nz(o, t, 0.04, 'bandpass', 2800, 3, 0.8); nz(o, t + 0.22, 0.05, 'bandpass', 1900, 3, 0.9); },
    empty() { if (!ctx) return; nz(out(0.4, 0), ctx.currentTime, 0.03, 'highpass', 4000, 2, 0.7); },
    horn(vol, pan) { if (!ctx || vol < .03) return; const t = ctx.currentTime, o = out(vol * 0.25, pan); tone(o, t, 'square', 392, 0, 0.45, 0.5, 0.01); tone(o, t, 'square', 494, 0, 0.45, 0.4, 0.01); },
    star() { if (!ctx) return; const t = ctx.currentTime, o = out(0.4, 0); tone(o, t, 'triangle', 880, 0, 0.15, 0.6); tone(o, t + 0.12, 'triangle', 660, 0, 0.3, 0.6); },
    buy() { if (!ctx) return; const t = ctx.currentTime, o = out(0.35, 0); [784, 988, 1175, 1568].forEach((f, i) => tone(o, t + i * 0.06, 'square', f, 0, 0.09, 0.3)); nz(o, t + 0.25, 0.08, 'bandpass', 3000, 3, 0.6); },
    deny() { if (!ctx) return; const t = ctx.currentTime, o = out(0.35, 0); tone(o, t, 'square', 220, 0, 0.12, 0.4); tone(o, t + 0.13, 'square', 165, 0, 0.2, 0.4); },
    thud(vol, pan) { if (!ctx || vol < 0.02) return; const t = ctx.currentTime, o = out(vol, pan); nz(o, t, 0.22, 'lowpass', 420, 1, 1.1, 0.7); tone(o, t, 'sine', 140, 45, 0.2, 0.9); },
    setEngine(vol, rpm) { if (!ctx) return; const t = ctx.currentTime, f = rpm / 60; engO1.frequency.setTargetAtTime(f, t, 0.06); engO2.frequency.setTargetAtTime(f * 2.02, t, 0.06); engF.frequency.setTargetAtTime(160 + f * 6, t, 0.08); engG.gain.setTargetAtTime(vol, t, 0.12); },
    setSiren(v) { if (ctx) sirenGain.gain.setTargetAtTime(v, ctx.currentTime, 0.3); },
    setHeli(v) { if (ctx) heliGain.gain.setTargetAtTime(v, ctx.currentTime, 0.3); },
    toggleMusic() { musicOn = !musicOn; if (ctx) mus.gain.setTargetAtTime(musicOn ? 0.32 : 0, ctx.currentTime, 0.2); return musicOn; },
  };
  // ---- synthwave radio ----
  function startMusic() {
    nextT = ctx.currentTime + 0.1;
    seq = setInterval(() => { while (nextT < ctx.currentTime + 0.15) { playStep(step, nextT); nextT += 60 / 108 / 4; step = (step + 1) % 128; } }, 30);
  }
  function playStep(s, t) {
    if (!musicOn) return;
    const st = s % 16, ch = PROG[Math.floor(s / 16) % 4], SPB = 60 / 108 / 4;
    if (st % 4 === 0) tone(mus, t, 'sine', 150, 42, 0.3, 0.9);
    if (st === 4 || st === 12) { nz(mus, t, 0.2, 'bandpass', 1700, 0.8, 0.5); nz(reverbIn, t, 0.15, 'bandpass', 1700, 0.8, 0.6); tone(mus, t, 'triangle', 220, 130, 0.12, 0.3); }
    if (st % 2 === 1) nz(mus, t, st % 4 === 3 ? 0.09 : 0.03, 'highpass', 7500, 0.6, st % 4 === 3 ? 0.13 : 0.07);
    if (st % 2 === 0) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(ch[0] - 24 + (st % 4 === 2 ? 12 : 0));
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + SPB * 1.8);
      const g = ctx.createGain(); env(g, t, 0.005, 0.32, SPB * 1.9); o.connect(f); f.connect(g); g.connect(mus); o.start(t); o.stop(t + SPB * 2);
    }
    if (st === 0) ch.forEach(n => [-6, 6].forEach(det => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1300;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.028, t + 0.5); g.gain.setValueAtTime(0.028, t + SPB * 14); g.gain.exponentialRampToValueAtTime(0.0001, t + SPB * 16);
      o.connect(f); f.connect(g); g.connect(mus); g.connect(reverbIn); o.start(t); o.stop(t + SPB * 16 + 0.05);
    }));
    if (Math.floor(s / 64) === 1 && st % 2 === 0) {
      const n = ch[(st / 2) % 3] + 12 + (st >= 8 ? 12 : 0);
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = mtof(n);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
      const g = ctx.createGain(); env(g, t, 0.005, 0.05, 0.16); o.connect(f); f.connect(g); g.connect(mus); g.connect(reverbIn); o.start(t); o.stop(t + 0.2);
    }
  }
})();
