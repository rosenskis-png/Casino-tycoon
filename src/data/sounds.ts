// Sound is data (CLAUDE.md): short synth recipes played through Web Audio by platform/audio.ts. No audio files.
export interface Voice {
  wave: "sine" | "square" | "triangle" | "sawtooth" | "noise";
  /** Start and end frequency in Hz (ignored for noise except as a lowpass cutoff). */
  f0: number;
  f1?: number;
  /** Seconds after the sound starts. */
  at?: number;
  dur: number;
  gain: number;
}
export type SoundRecipe = Voice[];

export const SOUNDS: Record<string, SoundRecipe> = {
  click: [{ wave: "square", f0: 1400, f1: 900, dur: 0.03, gain: 0.08 }],
  build: [{ wave: "noise", f0: 1800, dur: 0.06, gain: 0.25 }, { wave: "triangle", f0: 180, f1: 90, dur: 0.08, gain: 0.3 }],
  place: [{ wave: "triangle", f0: 520, f1: 780, dur: 0.07, gain: 0.2 }, { wave: "triangle", f0: 780, at: 0.06, dur: 0.08, gain: 0.15 }],
  demolish: [{ wave: "noise", f0: 900, dur: 0.18, gain: 0.3 }, { wave: "sawtooth", f0: 140, f1: 50, dur: 0.15, gain: 0.12 }],
  deny: [{ wave: "square", f0: 220, dur: 0.07, gain: 0.08 }, { wave: "square", f0: 165, at: 0.08, dur: 0.1, gain: 0.08 }],
  news: [{ wave: "sine", f0: 880, dur: 0.06, gain: 0.08 }, { wave: "sine", f0: 1320, at: 0.07, dur: 0.09, gain: 0.07 }],
  urgent: [{ wave: "square", f0: 660, dur: 0.1, gain: 0.08 }, { wave: "square", f0: 660, at: 0.16, dur: 0.1, gain: 0.08 }],
};
