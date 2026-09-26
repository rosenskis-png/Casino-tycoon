// A small step sequencer for data/music tracks (docs/spec/audio.md): drums, bass, pad, arpeggio, horn stabs and
// melody lines synthesized per step with a short look-ahead. Each player has its own gain and pan so the UI can place it on
// the floor (a club's dance floor) or play it plainly (the title theme).
import { CHORD_TONES, TRACKS, type Line, type Track, type Wave } from "../data/music";
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
  private cache = new Map<string, string[]>();

  constructor(id: string) {
    this.track = TRACKS[id];
  }

  private tok(s: string): string[] {
    let t = this.cache.get(s);
    if (!t) this.cache.set(s, (t = tokens(s)));
    return t;
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
    const tr = this.track, k = step % 16, n = tr.chords.length, from = tr.loopFrom ?? 0;
    const raw = Math.floor(step / 16), bar = raw < n ? raw : from + ((raw - from) % (n - from));
    const swing = k % 4 === 2 ? Math.max(0, 4 * (tr.swing ?? 0.5) - 2) * dur : 0;
    const t = t0 + swing, out = this.out!;
    const c = tr.chords[bar], half = k >= 8 && c.length === 4;
    const chordRoot = half ? c[2]! : c[0], tones = CHORD_TONES[half ? c[3]! : c[1]];
    const fill = tr.fills?.[bar];
    type Voice = { a?: number; cutoff?: number; f1?: number; sus?: boolean; detune?: number; vib?: number; brass?: boolean };
    const tone = (note: number, len: number, wave: Wave, gain: number, o: Voice = {}) => {
      const g = ctx.createGain(), a = o.a ?? 0.005, end = t + len + (o.sus ? 0.08 : 0);
      const oscs = [ctx.createOscillator()];
      if (o.detune) oscs.push(ctx.createOscillator());
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain / oscs.length ** 0.5, t + a);
      if (o.sus && len > a + 0.02) g.gain.exponentialRampToValueAtTime(0.6 * gain / oscs.length ** 0.5, t + Math.max(a + 0.01, len * 0.8));
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      let dest: AudioNode = g;
      if (o.cutoff) {
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        if (o.brass) {
          f.frequency.setValueAtTime(o.cutoff * 0.3, t);
          f.frequency.exponentialRampToValueAtTime(o.cutoff, t + 0.06);
          f.frequency.setTargetAtTime(o.cutoff * 0.65, t + 0.06, 0.2);
        } else f.frequency.value = o.cutoff;
        f.connect(g);
        dest = f;
      }
      g.connect(out);
      let lfo: OscillatorNode | null = null, depth: GainNode | null = null;
      if (o.vib && len > 0.3) {
        lfo = ctx.createOscillator();
        depth = ctx.createGain();
        lfo.frequency.value = 5.5;
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(o.vib, t + 0.3);
        lfo.connect(depth);
        lfo.start(t);
        lfo.stop(end + 0.02);
      }
      oscs.forEach((osc, i) => {
        osc.type = wave;
        osc.frequency.setValueAtTime(hz(note), t);
        if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + len);
        if (i) osc.detune.value = o.detune!;
        depth?.connect(osc.detune);
        osc.connect(dest);
        osc.start(t);
        osc.stop(end + 0.02);
      });
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
    const d = fill?.drums ?? tr.drums;
    const hit = (p: string | undefined) => { const c = p?.[k]; return c === "X" ? 1.4 : c === "x" ? 1 : 0; };
    let v: number;
    if ((v = hit(d.kick))) { tone(40, 0.16, "sine", 0.55 * v, { f1: 42 }); tone(88, 0.03, "triangle", 0.2 * v); }
    if ((v = hit(d.snare))) { hiss(0.13, 0.22 * v, "lowpass", 5200); tone(55, 0.07, "triangle", 0.12 * v); }
    if ((v = hit(d.clap))) { for (const at of [0, 0.012, 0.024]) hiss(0.06 + at, 0.16 * v, "bandpass", 1400, at); }
    if ((v = hit(d.hat))) hiss(0.03, 0.06 * v, "highpass", 8000);
    if ((v = hit(d.open))) hiss(0.18, 0.05 * v, "highpass", 7000);
    if ((v = hit(d.rim))) { tone(95, 0.025, "square", 0.05 * v); tone(83, 0.03, "triangle", 0.06 * v); }
    if ((v = hit(d.ride))) { hiss(0.28, 0.035 * v, "highpass", 6500); tone(100, 0.2, "sine", 0.015 * v); }
    if ((v = hit(d.crash))) { hiss(1.4, 0.07 * v, "highpass", 4500); hiss(0.5, 0.04 * v, "bandpass", 9000); }
    // Toms fall in pitch across the bar, so a fill runs high to low.
    if ((v = hit(d.tom))) tone(52 - k * 0.7, 0.22, "sine", 0.24 * v, { f1: hz(46 - k * 0.7) });
    const base = tr.root + chordRoot;
    if (tr.bass) {
      const bs = this.tok(fill?.bass ?? tr.bass.notes), bt = bs[k];
      const low = tr.bass.fold && chordRoot > 6 ? base - 12 : base;
      if (bt && bt !== "." && bt !== "-") tone(low + Number(bt) + 12 * tr.bass.oct, dur * holdOf(bs, k) * 0.9, tr.bass.wave, 0.22, { cutoff: tr.bass.cutoff ?? 1400 });
    }
    // The pad sounds each chord for as long as it lasts.
    if (tr.pad && (k === 0 || (k === 8 && c.length === 4))) {
      for (const x of tones.slice(0, 4)) tone(base + x + 12 * tr.pad.oct, dur * (c.length === 4 ? 7.5 : 15.5), tr.pad.wave, tr.pad.gain, { a: 0.12, cutoff: 2200 });
    }
    const arp = tr.arp && this.tok(tr.arp.notes), at = arp?.[k];
    if (tr.arp && at && at !== "." && at !== "-") {
      const up = at.endsWith("+") ? 12 : 0, i = Number(up ? at.slice(0, -1) : at);
      tone(base + tones[i % tones.length] + up + 12 * tr.arp.oct, dur * holdOf(arp!, k) * 0.85, tr.arp.wave, tr.arp.gain, { cutoff: 3200 });
    }
    if (tr.stabs) {
      const p = fill?.stabs ?? tr.stabs.hits, ch = p[k];
      if (ch === "x" || ch === "X") {
        let len = 1;
        while (k + len < 16 && p[k + len] === "-") len++;
        for (const x of tones.slice(1, 4)) tone(base + x + 12 * tr.stabs.oct, dur * (len === 1 ? 0.7 : len), tr.stabs.wave, tr.stabs.gain * (ch === "X" ? 1.4 : 1), { cutoff: tr.stabs.cutoff ?? 2200, brass: true, sus: len > 1 });
      }
    }
    for (const line of [tr.lead, tr.counter, tr.bells]) if (line) this.melody(line, bar, k, dur, tone);
  }

  private melody(line: Line, bar: number, k: number, dur: number, tone: (n: number, len: number, w: Wave, g: number, o?: object) => void) {
    const lb = this.tok(line.bars[bar % line.bars.length]), lt = lb[k];
    if (!lt || lt === "." || lt === "-") return;
    let n = 1;
    if (line.exact) while (k + n < 16 && lb[k + n] === "-") n++;
    // Otherwise a note rings until the next one (at most half a bar).
    else while (n < 8 && k + n < 16 && (lb[k + n] === "." || lb[k + n] === "-")) n++;
    const len = line.ring ?? dur * n * (line.exact ? 0.95 : 0.85);
    tone(this.track.root + Number(lt) + 12 * line.oct, len, line.wave, line.gain, {
      a: line.ring ? 0.003 : 0.02, cutoff: line.cutoff ?? (line.ring ? undefined : 2600), sus: line.exact, detune: line.detune, vib: line.vib, brass: line.brass,
    });
  }
}
