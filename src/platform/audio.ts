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
  // iOS 17+: play through the silent switch like a game, not like a ringtone.
  try { const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession; if (s && s.type !== "playback") s.type = "playback"; } catch { /* unsupported */ }
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
  if (ctx.state !== "running") {
    // Suspended, or "interrupted" after a call or backgrounding on iOS. A silent buffer played inside the tap
    // is what unlocks older iOS versions.
    void ctx.resume().then(() => { for (const f of unlockers) f(); }, () => {});
    const b = ctx.createBufferSource();
    b.buffer = ctx.createBuffer(1, 1, 22050);
    b.connect(ctx.destination);
    b.start(0);
  }
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

// ---- The ambient floor (Batch B, owner: "light conversation murmur replaces the whoosh"): a few synthesized
// voices talking at once. Each is a buzzy tone at a speaking pitch through two vowel filters (formants) that move
// from syllable to syllable, spoken in bursts with pauses between phrases, all muffled as if from across the
// room, over a faint room tone. The UI sets the level from the crowd in view; the voices pause when it's silent.
interface Voice { osc: OscillatorNode; f1: BiquadFilterNode; f2: BiquadFilterNode; g: GainNode; base: number; talk: number; pause: number }
let amb: { g: GainNode; voices: Voice[]; timer: number; level: number } | null = null;
/** Vowel formants (F1, F2 in Hz): ah, eh, ee, oh, oo, uh. */
const VOWELS: [number, number][] = [[730, 1090], [530, 1840], [290, 2250], [570, 840], [300, 870], [640, 1190]];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
function syllables(now: number) {
  if (!ctx || !amb) return;
  for (const v of amb.voices) {
    if (now < v.pause) continue;
    // A phrase is 4-14 syllables; then a breath or a listen (0.4-2.5 s).
    if (v.talk <= 0) { v.talk = 4 + Math.floor(Math.random() * 10); v.pause = now + 0.4 + Math.random() * 2.1; v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); continue; }
    v.talk--;
    const t = ctx.currentTime, len = 0.11 + Math.random() * 0.14, [a, b] = pick(VOWELS);
    v.f1.frequency.setTargetAtTime(a, t, 0.03);
    v.f2.frequency.setTargetAtTime(b, t, 0.03);
    // Speech melody: a little up and down around the voice's pitch, falling at a phrase's end.
    v.osc.frequency.setTargetAtTime(v.base * (0.9 + Math.random() * 0.25) * (v.talk === 0 ? 0.85 : 1), t, 0.06);
    v.g.gain.setTargetAtTime(0.5 + Math.random() * 0.5, t, 0.025);
    v.g.gain.setTargetAtTime(0.08, t + len * 0.7, 0.03);
    v.pause = now + len;
  }
}
export function setAmbient(level: number) {
  if (!ctx || !running()) return;
  if (!amb) {
    const out = ctx.createGain();
    out.gain.value = 0;
    // Across the room: no consonants, no words.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1300;
    lp.connect(out).connect(cats.floor);
    // Room tone: a whisper of low noise under the voices.
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const nf = ctx.createBiquadFilter(), ng = ctx.createGain();
    nf.type = "lowpass";
    nf.frequency.value = 400;
    ng.gain.value = 0.12;
    src.connect(nf).connect(ng).connect(lp);
    src.start();
    const voices: Voice[] = [];
    const pitches = [105, 118, 132, 150, 185, 205, 220, 240];
    for (let k = 0; k < 8; k++) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = pitches[k];
      const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), g = ctx.createGain(), pan = ctx.createStereoPanner();
      f1.type = f2.type = "bandpass";
      f1.Q.value = 6; f2.Q.value = 9;
      f1.frequency.value = 600; f2.frequency.value = 1400;
      g.gain.value = 0;
      pan.pan.value = ((k * 5) % 8) / 4 - 0.9;
      const mix = ctx.createGain();
      mix.gain.value = 0.05;
      osc.connect(f1).connect(g);
      osc.connect(f2).connect(g);
      g.connect(mix).connect(pan).connect(lp);
      osc.start();
      voices.push({ osc, f1, f2, g, base: pitches[k], talk: 0, pause: k * 0.3 });
    }
    amb = { g: out, voices, timer: 0, level: 0 };
  }
  const l = Math.max(0, Math.min(1, level));
  amb.level = l;
  // Busier floors: more of the voices talk (the quiet ones stay silent).
  const talking = Math.round(2 + l * 6);
  amb.voices.forEach((v, k) => { if (k >= talking) { v.talk = 0; v.pause = Infinity; v.g.gain.setTargetAtTime(0, ctx!.currentTime, 0.1); } else if (v.pause === Infinity) v.pause = 0; });
  if (l > 0 && !amb.timer) amb.timer = window.setInterval(() => syllables(performance.now() / 1000), 45);
  if (l === 0 && amb.timer) { clearInterval(amb.timer); amb.timer = 0; }
  amb.g.gain.setTargetAtTime(Math.sqrt(l) * 0.55, ctx.currentTime, 0.4);
}
