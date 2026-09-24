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
  /** (M10) Attack in seconds (default: instant). */
  a?: number;
}
export type SoundRecipe = Voice[];

export const SOUNDS: Record<string, SoundRecipe> = {
  click: [{ wave: "square", f0: 1400, f1: 900, dur: 0.03, gain: 0.08 }],
  build: [{ wave: "noise", f0: 1800, dur: 0.06, gain: 0.25 }, { wave: "triangle", f0: 180, f1: 90, dur: 0.08, gain: 0.3 }],
  place: [{ wave: "triangle", f0: 520, f1: 780, dur: 0.07, gain: 0.2 }, { wave: "triangle", f0: 780, at: 0.06, dur: 0.08, gain: 0.15 }],
  demolish: [{ wave: "noise", f0: 900, dur: 0.18, gain: 0.3 }, { wave: "sawtooth", f0: 140, f1: 50, dur: 0.15, gain: 0.12 }],
  deny: [{ wave: "square", f0: 220, dur: 0.07, gain: 0.08 }, { wave: "square", f0: 165, at: 0.08, dur: 0.1, gain: 0.08 }],
  news: [{ wave: "sine", f0: 880, dur: 0.06, gain: 0.08 }, { wave: "sine", f0: 1320, at: 0.07, dur: 0.09, gain: 0.07 }],
  win: [{ wave: "triangle", f0: 1046, dur: 0.08, gain: 0.12 }, { wave: "triangle", f0: 1318, at: 0.08, dur: 0.08, gain: 0.12 }, { wave: "triangle", f0: 1568, at: 0.16, dur: 0.14, gain: 0.12 }],
  jackpot: [
    { wave: "square", f0: 784, dur: 0.1, gain: 0.08 }, { wave: "square", f0: 988, at: 0.1, dur: 0.1, gain: 0.08 },
    { wave: "square", f0: 1175, at: 0.2, dur: 0.1, gain: 0.08 }, { wave: "square", f0: 1568, at: 0.3, dur: 0.35, gain: 0.08 },
    { wave: "noise", f0: 6000, at: 0.3, dur: 0.4, gain: 0.08 },
  ],
  broken: [{ wave: "sawtooth", f0: 300, f1: 120, dur: 0.25, gain: 0.08 }],
  fixed: [{ wave: "triangle", f0: 660, f1: 990, dur: 0.1, gain: 0.1 }],
  // Incidents (M4).
  fight: [{ wave: "noise", f0: 700, dur: 0.08, gain: 0.25 }, { wave: "noise", f0: 500, at: 0.14, dur: 0.07, gain: 0.22 }, { wave: "square", f0: 180, f1: 120, at: 0.05, dur: 0.1, gain: 0.06 }],
  dice: [{ wave: "noise", f0: 2600, dur: 0.05, gain: 0.12 }, { wave: "noise", f0: 2200, at: 0.08, dur: 0.05, gain: 0.1 }, { wave: "noise", f0: 1800, at: 0.15, dur: 0.06, gain: 0.08 }],
  wheel: [{ wave: "square", f0: 2400, dur: 0.02, gain: 0.04 }, { wave: "square", f0: 2400, at: 0.1, dur: 0.02, gain: 0.04 }, { wave: "square", f0: 2400, at: 0.22, dur: 0.02, gain: 0.04 }, { wave: "square", f0: 2400, at: 0.38, dur: 0.02, gain: 0.04 }, { wave: "triangle", f0: 1200, at: 0.5, dur: 0.06, gain: 0.05 }],
  cheer: [{ wave: "noise", f0: 3000, dur: 0.45, gain: 0.1 }, { wave: "triangle", f0: 660, f1: 990, dur: 0.18, gain: 0.08 }],
  retch: [{ wave: "sawtooth", f0: 160, f1: 90, dur: 0.22, gain: 0.07 }, { wave: "noise", f0: 400, at: 0.12, dur: 0.15, gain: 0.12 }],
  thud: [{ wave: "sine", f0: 110, f1: 45, dur: 0.18, gain: 0.3 }],
  // Cheats and enforcement (M5): a catch, a beating (three punches, timed to the animation), a disappearance (one
  // muffled shot and the fall).
  caught: [{ wave: "square", f0: 988, dur: 0.09, gain: 0.07 }, { wave: "square", f0: 740, at: 0.11, dur: 0.09, gain: 0.07 }, { wave: "square", f0: 988, at: 0.22, dur: 0.09, gain: 0.07 }],
  punch: [
    { wave: "noise", f0: 600, at: 0.2, dur: 0.06, gain: 0.3 }, { wave: "sine", f0: 120, f1: 60, at: 0.2, dur: 0.08, gain: 0.25 },
    { wave: "noise", f0: 600, at: 0.8, dur: 0.06, gain: 0.3 }, { wave: "sine", f0: 120, f1: 60, at: 0.8, dur: 0.08, gain: 0.25 },
    { wave: "noise", f0: 500, at: 1.4, dur: 0.07, gain: 0.32 }, { wave: "sine", f0: 110, f1: 50, at: 1.4, dur: 0.1, gain: 0.28 },
  ],
  shot: [{ wave: "noise", f0: 2400, at: 0.6, dur: 0.05, gain: 0.35 }, { wave: "sine", f0: 160, f1: 50, at: 0.6, dur: 0.12, gain: 0.25 }, { wave: "sine", f0: 110, f1: 45, at: 0.95, dur: 0.18, gain: 0.3 }],
  urgent: [{ wave: "square", f0: 660, dur: 0.1, gain: 0.08 }, { wave: "square", f0: 660, at: 0.16, dur: 0.1, gain: 0.08 }],
  // M10: the floor and your own games.
  reeltick: [{ wave: "square", f0: 1900, dur: 0.012, gain: 0.03 }],
  reelstop: [{ wave: "noise", f0: 1400, dur: 0.03, gain: 0.12 }, { wave: "triangle", f0: 240, f1: 160, dur: 0.05, gain: 0.12 }],
  reels: [
    { wave: "noise", f0: 1400, dur: 0.03, gain: 0.1 }, { wave: "noise", f0: 1400, at: 0.14, dur: 0.03, gain: 0.1 }, { wave: "noise", f0: 1400, at: 0.28, dur: 0.03, gain: 0.1 },
  ],
  chime: [{ wave: "sine", f0: 1568, dur: 0.25, gain: 0.05 }, { wave: "sine", f0: 2093, at: 0.09, dur: 0.3, gain: 0.04 }],
  card: [{ wave: "noise", f0: 5000, dur: 0.035, gain: 0.14, a: 0.01 }],
  cards: [{ wave: "noise", f0: 5000, dur: 0.035, gain: 0.1, a: 0.01 }, { wave: "noise", f0: 5000, at: 0.12, dur: 0.035, gain: 0.1, a: 0.01 }, { wave: "noise", f0: 5000, at: 0.24, dur: 0.035, gain: 0.1, a: 0.01 }],
  chips: [{ wave: "triangle", f0: 3200, dur: 0.02, gain: 0.06 }, { wave: "triangle", f0: 2900, at: 0.04, dur: 0.02, gain: 0.05 }, { wave: "triangle", f0: 3400, at: 0.07, dur: 0.025, gain: 0.05 }],
  ball: [{ wave: "sine", f0: 880, f1: 700, dur: 0.12, gain: 0.08 }, { wave: "noise", f0: 1200, dur: 0.05, gain: 0.05 }],
  spin: Array.from({ length: 14 }, (_, k) => ({ wave: "square" as const, f0: 2600, at: 0.04 * k * (1 + k * 0.12), dur: 0.015, gain: 0.03 })),
  glass: [{ wave: "sine", f0: 2637, dur: 0.18, gain: 0.04 }, { wave: "sine", f0: 3951, dur: 0.12, gain: 0.02 }],
  applause: [{ wave: "noise", f0: 3500, dur: 1.4, gain: 0.12, a: 0.3 }, { wave: "noise", f0: 2200, at: 0.2, dur: 1.1, gain: 0.08, a: 0.2 }],
  roar: [{ wave: "noise", f0: 1500, dur: 0.9, gain: 0.14, a: 0.15 }, { wave: "sawtooth", f0: 220, f1: 330, dur: 0.4, gain: 0.03, a: 0.1 }],
  coin: [{ wave: "triangle", f0: 2350, f1: 2500, dur: 0.035, gain: 0.04 }, { wave: "sine", f0: 3520, at: 0.015, dur: 0.05, gain: 0.025 }],
  lose: [{ wave: "triangle", f0: 330, f1: 262, dur: 0.18, gain: 0.06 }],
  bigwin: [
    { wave: "square", f0: 523, dur: 0.08, gain: 0.07 }, { wave: "square", f0: 659, at: 0.08, dur: 0.08, gain: 0.07 }, { wave: "square", f0: 784, at: 0.16, dur: 0.08, gain: 0.07 },
    { wave: "square", f0: 1047, at: 0.24, dur: 0.08, gain: 0.07 }, { wave: "square", f0: 784, at: 0.32, dur: 0.08, gain: 0.07 }, { wave: "square", f0: 1047, at: 0.4, dur: 0.5, gain: 0.08 },
    { wave: "triangle", f0: 262, at: 0.4, dur: 0.5, gain: 0.1 }, { wave: "noise", f0: 7000, at: 0.4, dur: 0.6, gain: 0.05 },
  ],
};

/** Mixer category per sound (docs/spec/audio.md); anything unlisted is "games". */
export type SoundCat = "music" | "ui" | "games" | "floor" | "crowd";
export const SOUND_CAT: Record<string, SoundCat> = {
  click: "ui", build: "ui", place: "ui", demolish: "ui", deny: "ui", news: "ui", urgent: "ui", broken: "floor", fixed: "floor",
  fight: "crowd", cheer: "crowd", retch: "crowd", thud: "crowd", caught: "crowd", punch: "crowd", shot: "crowd", applause: "crowd", roar: "crowd",
  glass: "floor", chime: "floor",
};
export const SOUND_CATS: { id: SoundCat; name: string }[] = [
  { id: "music", name: "Music" }, { id: "games", name: "Games" }, { id: "floor", name: "Floor" }, { id: "crowd", name: "Crowd" }, { id: "ui", name: "Interface" },
];
