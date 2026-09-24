// Web Audio synth for data/sounds recipes (docs/spec/audio.md). A mixer: master, then one gain per category
// (music, games, floor, crowd, interface), kept on the device. Sounds may be placed (gain and left/right pan,
// worked out by the UI from the camera). A voice cap keeps a busy floor from clipping. iOS requires a user gesture
// before audio can start: call unlockAudio() from a touch handler.
import { SOUNDS, SOUND_CAT, SOUND_CATS, type SoundCat } from "../data/sounds";
import { Store } from "./storage";

export interface SoundSettings { master: number; muted: boolean; cats: Record<SoundCat, number> }
const KEY = "ct-sound";
const DEFAULTS: SoundSettings = { master: 0.8, muted: false, cats: { music: 0.7, games: 0.8, floor: 0.7, crowd: 0.8, ui: 0.8 } };
let settings: SoundSettings = (() => {
  const s = Store.get<SoundSettings>(KEY);
  return { ...DEFAULTS, ...s, cats: { ...DEFAULTS.cats, ...s?.cats } };
})();

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const cats = {} as Record<SoundCat, GainNode>;
let noiseBuf: AudioBuffer | null = null;
/** End times of sounds playing, for the voice cap. */
let voices: number[] = [];
const MAX_VOICES = 24;
const unlockers = new Set<() => void>();

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    for (const c of SOUND_CATS) { cats[c.id] = ctx.createGain(); cats[c.id].connect(master); }
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    // Fixed pseudo-noise (not gameplay randomness): a cheap LCG keeps this free of Math.random.
    let x = 12345;
    for (let i = 0; i < d.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = x / 0x3fffffff - 1; }
    applyVolume();
  }
  if (ctx.state === "suspended") void ctx.resume();
  for (const f of unlockers) f();
}
/** Runs `f` once audio is available (now, if it already is), and again on every later unlock. */
export function onAudio(f: () => void) { unlockers.add(f); if (running()) f(); return () => { unlockers.delete(f); }; }

function applyVolume() {
  if (!master) return;
  master.gain.value = settings.muted ? 0 : settings.master;
  for (const c of SOUND_CATS) cats[c.id].gain.value = settings.cats[c.id];
}
export const soundSettings = () => settings;
export function setSound(next: Partial<SoundSettings> & { cat?: [SoundCat, number] }) {
  settings = { ...settings, ...next, cats: { ...settings.cats } };
  if (next.cat) settings.cats[next.cat[0]] = next.cat[1];
  delete (settings as { cat?: unknown }).cat;
  Store.set(KEY, settings);
  applyVolume();
}
export const isMuted = () => settings.muted;
export const setMuted = (m: boolean) => setSound({ muted: m });

/** The audio graph for the music player (null until unlocked). */
export function audioOut(cat: SoundCat): { ctx: AudioContext; out: GainNode; noise: AudioBuffer } | null {
  return ctx && running() ? { ctx, out: cats[cat], noise: noiseBuf! } : null;
}
const running = () => !!ctx && ctx.state === "running";

/** Plays a sound; `gain` (0-1) and `pan` (-1 left … 1 right) place it on the floor. */
export function play(id: string, opts?: { gain?: number; pan?: number }) {
  const recipe = SOUNDS[id];
  if (!recipe || !ctx || !master || settings.muted || !running()) return;
  const gain = opts?.gain ?? 1, cat = SOUND_CAT[id] ?? "games";
  if (gain < 0.02) return;
  const now = ctx.currentTime;
  voices = voices.filter((t) => t > now);
  if (voices.length >= MAX_VOICES && cat !== "ui") return;
  const t0 = now + 0.005;
  let out: AudioNode = cats[cat];
  if (opts?.pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, opts.pan));
    p.connect(out);
    out = p;
  }
  let last = t0;
  for (const v of recipe) {
    const start = t0 + (v.at ?? 0), end = start + v.dur, peak = v.gain * gain;
    last = Math.max(last, end);
    const g = ctx.createGain();
    if (v.a) { g.gain.setValueAtTime(0.0001, start); g.gain.exponentialRampToValueAtTime(peak, start + Math.min(v.a, v.dur * 0.9)); }
    else g.gain.setValueAtTime(peak, start);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    g.connect(out);
    if (v.wave === "noise") {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = v.f0;
      src.connect(lp).connect(g);
      src.start(start, (start * 7.3) % 1.5);
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
  voices.push(last);
}

// ---- The ambient floor: a looped murmur of voices (band-passed noise, slowly wandering) whose level the UI
// sets from the crowd and energy in view.
let amb: { g: GainNode; f: BiquadFilterNode; lfo: OscillatorNode } | null = null;
export function setAmbient(level: number) {
  if (!ctx || !running()) return;
  if (!amb) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 600;
    f.Q.value = 0.9;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.value = 0;
    // A slow wobble in the band makes noise read as a room of voices rather than hiss.
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 0.35;
    depth.gain.value = 180;
    lfo.connect(depth).connect(f.frequency);
    lfo.start();
    src.connect(f).connect(lp).connect(g).connect(cats.floor);
    src.start();
    amb = { g, f, lfo };
  }
  amb.g.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.22, ctx.currentTime, 0.4);
}
