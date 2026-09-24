// A small step sequencer for data/music tracks (docs/spec/audio.md): drums, bass, pad, arpeggio and lead
// synthesized per step with a short look-ahead. Each player has its own gain and pan so the UI can place it on
// the floor (a club's dance floor) or play it plainly (the title theme).
import { CHORD_TONES, TRACKS, type Track, type Wave } from "../data/music";
import { audioOut } from "./audio";

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const tokens = (s: string) => s.trim().split(/\s+/);
/** How many steps a note at step k lasts: itself plus any "-" holds after it. */
function holdOf(t: string[], k: number): number {
  let n = 1;
  while (t[(k + n) % t.length] === "-" && n < t.length) n++;
  return n;
}

export class MusicPlayer {
  readonly track: Track;
  private out: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private timer = 0;
  private step = 0;
  private next = 0;
  private level = 0;
  private parsed: { bass?: string[]; arp?: string[]; lead?: string[][] };

  constructor(id: string) {
    this.track = TRACKS[id];
    const t = this.track;
    this.parsed = { bass: t.bass && tokens(t.bass.notes), arp: t.arp && tokens(t.arp.notes), lead: t.lead?.bars.map(tokens) };
  }

  get playing() { return this.timer !== 0; }

  /** Starts (if audio is unlocked) at this gain and pan. Returns whether it's playing. */
  start(gain = 1, pan = 0): boolean {
    if (this.timer) { this.place(gain, pan); return true; }
    const a = audioOut("music");
    if (!a) return false;
    this.out = a.ctx.createGain();
    this.out.gain.value = 0;
    this.pan = a.ctx.createStereoPanner();
    this.out.connect(this.pan).connect(a.out);
    this.next = a.ctx.currentTime + 0.06;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.place(gain, pan);
    return true;
  }

  /** Moves the music: its level (0-1) and left/right pan, eased. */
  place(gain: number, pan = 0) {
    const a = audioOut("music");
    if (!a || !this.out || !this.pan) return;
    this.level = gain;
    this.out.gain.setTargetAtTime(gain * this.track.gain, a.ctx.currentTime, 0.25);
    this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), a.ctx.currentTime, 0.25);
  }

  /** Fades out and stops. */
  stop(fade = 0.6) {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = 0;
    const out = this.out, a = audioOut("music");
    this.out = null;
    this.pan = null;
    if (!out) return;
    if (a) out.gain.setTargetAtTime(0, a.ctx.currentTime, fade / 4);
    window.setTimeout(() => out.disconnect(), fade * 1000 + 400);
  }

  private schedule() {
    const a = audioOut("music");
    if (!a || !this.out) return;
    // Behind (the tab slept): skip ahead rather than play a burst of catch-up notes.
    if (this.next < a.ctx.currentTime - 0.2) this.next = a.ctx.currentTime + 0.05;
    const dur = 60 / this.track.bpm / 4;
    while (this.next < a.ctx.currentTime + 0.12) {
      // Silent (far away): keep time, skip the notes.
      if (this.level > 0.01) this.playStep(a.ctx, a.noise, this.step, this.next, dur);
      this.step++;
      this.next += dur;
    }
  }

  private playStep(ctx: AudioContext, noise: AudioBuffer, step: number, t0: number, dur: number) {
    const tr = this.track, k = step % 16, bar = Math.floor(step / 16);
    const swing = k % 4 === 2 ? Math.max(0, 4 * (tr.swing ?? 0.5) - 2) * dur : 0;
    const t = t0 + swing, out = this.out!;
    const [chordRoot, q] = tr.chords[bar % tr.chords.length], tones = CHORD_TONES[q];
    const tone = (note: number, len: number, wave: Wave, gain: number, o: { a?: number; cutoff?: number; f1?: number } = {}) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(hz(note), t);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + len);
      const a = o.a ?? 0.005;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      let node: AudioNode = osc;
      if (o.cutoff) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.cutoff; osc.connect(f); node = f; }
      node.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + len + 0.02);
    };
    const hiss = (len: number, gain: number, type: BiquadFilterType, freq: number, at = 0) => {
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noise;
      f.type = type;
      f.frequency.value = freq;
      g.gain.setValueAtTime(gain, t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      src.connect(f).connect(g).connect(out);
      src.start(t + at, (step * 0.137) % 1.5);
      src.stop(t + at + len + 0.02);
    };
    const hit = (p: string | undefined) => { const c = p?.[k]; return c === "X" ? 1.4 : c === "x" ? 1 : 0; };
    const d = tr.drums;
    let v: number;
    if ((v = hit(d.kick))) { tone(40, 0.16, "sine", 0.55 * v, { f1: 42 }); tone(88, 0.03, "triangle", 0.2 * v); }
    if ((v = hit(d.snare))) { hiss(0.13, 0.22 * v, "lowpass", 5200); tone(55, 0.07, "triangle", 0.12 * v); }
    if ((v = hit(d.clap))) { for (const at of [0, 0.012, 0.024]) hiss(0.06 + at, 0.16 * v, "bandpass", 1400, at); }
    if ((v = hit(d.hat))) hiss(0.03, 0.06 * v, "highpass", 8000);
    if ((v = hit(d.open))) hiss(0.18, 0.05 * v, "highpass", 7000);
    if ((v = hit(d.rim))) { tone(95, 0.025, "square", 0.05 * v); tone(83, 0.03, "triangle", 0.06 * v); }
    if ((v = hit(d.ride))) { hiss(0.28, 0.035 * v, "highpass", 6500); tone(100, 0.2, "sine", 0.015 * v); }
    const base = tr.root + chordRoot;
    const bt = this.parsed.bass?.[k];
    if (tr.bass && bt && bt !== "." && bt !== "-") tone(base + Number(bt) + 12 * tr.bass.oct, dur * holdOf(this.parsed.bass!, k) * 0.9, tr.bass.wave, 0.22, { cutoff: tr.bass.cutoff ?? 1400 });
    if (tr.pad && k === 0) for (const n of tones.slice(0, 4)) tone(base + n + 12 * tr.pad.oct, dur * 15.5, tr.pad.wave, tr.pad.gain, { a: 0.12, cutoff: 2200 });
    const at = this.parsed.arp?.[k];
    if (tr.arp && at && at !== "." && at !== "-") {
      const up = at.endsWith("+") ? 12 : 0, i = Number(up ? at.slice(0, -1) : at);
      tone(base + tones[i % tones.length] + up + 12 * tr.arp.oct, dur * holdOf(this.parsed.arp!, k) * 0.85, tr.arp.wave, tr.arp.gain, { cutoff: 3200 });
    }
    const lb = this.parsed.lead?.[bar % this.parsed.lead.length], lt = lb?.[k];
    if (tr.lead && lt && lt !== "." && lt !== "-") {
      // A lead note rings until the next one (at most half a bar).
      let n = 1;
      while (n < 8 && k + n < 16 && (lb![k + n] === "." || lb![k + n] === "-")) n++;
      tone(tr.root + Number(lt) + 12 * tr.lead.oct, dur * n * 0.85, tr.lead.wave, tr.lead.gain, { a: 0.02, cutoff: 2600 });
    }
  }
}
