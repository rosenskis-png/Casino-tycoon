// Web Audio synth for data/sounds recipes. iOS requires a user gesture before audio can start: call unlock()
// from a touch handler.
import { SOUNDS } from "../data/sounds";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let volume = 0.8;
let muted = false;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    // Fixed pseudo-noise (not gameplay randomness): a cheap LCG keeps this free of Math.random.
    let x = 12345;
    for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = x / 0x3fffffff - 1; }
  }
  if (ctx.state === "suspended") void ctx.resume();
  applyVolume();
}

function applyVolume() { if (master) master.gain.value = muted ? 0 : volume; }
export function setVolume(v: number) { volume = v; applyVolume(); }
export function setMuted(m: boolean) { muted = m; applyVolume(); }
export const isMuted = () => muted;

export function play(id: string) {
  const recipe = SOUNDS[id];
  if (!recipe || !ctx || !master || muted || ctx.state !== "running") return;
  const t0 = ctx.currentTime + 0.005;
  for (const v of recipe) {
    const start = t0 + (v.at ?? 0), end = start + v.dur;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v.gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    g.connect(master);
    if (v.wave === "noise") {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = v.f0;
      src.connect(lp).connect(g);
      src.start(start);
      src.stop(end);
    } else {
      const o = ctx.createOscillator();
      o.type = v.wave;
      o.frequency.setValueAtTime(v.f0, start);
      if (v.f1) o.frequency.exponentialRampToValueAtTime(v.f1, end);
      o.connect(g);
      o.start(start);
      o.stop(end);
    }
  }
}
