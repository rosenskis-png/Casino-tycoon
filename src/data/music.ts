// Music is data (CLAUDE.md, docs/spec/audio.md): each track is a tempo, a key, one chord per bar and 16-step
// patterns, played by platform/music.ts through Web Audio. No audio files.
//
// Patterns: drums are 16 characters per bar ("x" hit, "X" accent, "." rest). Bass and arp are 16 space-separated
// tokens: bass tokens are semitones above the bar's chord root, arp tokens pick a chord tone (0-3) and may add
// "+" for an octave up; "." rests and "-" holds the previous note. Lead lines are one 16-token string per bar in
// semitones above the key's root, cycling through the bars.

export type Quality = "maj" | "min" | "7" | "m7" | "maj7" | "dim" | "m9";
export const CHORD_TONES: Record<Quality, number[]> = {
  maj: [0, 4, 7, 12], min: [0, 3, 7, 12], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6, 9], m9: [0, 3, 10, 14],
};
export type Wave = "sine" | "square" | "triangle" | "sawtooth";

export interface Track {
  id: string;
  name: string;
  bpm: number;
  /** 0 straight; up to ~0.6 pushes every second 16th late (shuffle). */
  swing?: number;
  /** MIDI note of the key's root (57 = A3). */
  root: number;
  /** One chord per bar: semitones above the root, and its quality. */
  chords: [number, Quality][];
  drums: { kick?: string; snare?: string; clap?: string; hat?: string; open?: string; rim?: string; ride?: string };
  bass?: { wave: Wave; notes: string; oct: number; cutoff?: number };
  pad?: { wave: Wave; gain: number; oct: number };
  arp?: { wave: Wave; notes: string; oct: number; gain: number };
  lead?: { wave: Wave; bars: string[]; oct: number; gain: number };
  /** Overall level (tracks are mixed against each other by ear). */
  gain: number;
}

export const TRACKS: Record<string, Track> = {
  // The main theme (Batch B, owner: "a better title theme"): a 16-bar swinging lounge tune in F, verse and bridge.
  // A brassy hook over walking bass, brushes and a vibraphone sparkle; bluesy turnarounds back to the top.
  theme: {
    id: "theme", name: "Casino Tycoon", bpm: 118, swing: 0.62, root: 53, gain: 0.9,
    chords: [
      [0, "maj7"], [9, "m7"], [2, "m7"], [7, "7"], [4, "m7"], [9, "7"], [2, "m7"], [7, "7"],
      [5, "maj7"], [10, "7"], [4, "m7"], [9, "7"], [2, "m7"], [7, "7"], [0, "maj7"], [7, "7"],
    ],
    drums: { ride: "x...x.x.x...x.x.", rim: "....x.......x...", kick: "x.......x.....x.", hat: "....x.......x..." },
    bass: { wave: "triangle", notes: "0 - - . 7 - - . 12 - - . 9 - 7 -", oct: -1, cutoff: 900 },
    pad: { wave: "triangle", gain: 0.045, oct: 0 },
    arp: { wave: "triangle", notes: ". . 0+ . . . 1+ . . . 2+ . . . 3 .", oct: 1, gain: 0.022 },
    lead: {
      wave: "square", oct: 0, gain: 0.065,
      bars: [
        "12 . 16 . 19 . 21 - - . 19 . 16 . . .",
        "21 . . 19 21 . 24 . 21 - - . . . . .",
        "19 . . 17 14 . 17 . 21 - - . . . 19 .",
        "23 - - . 22 . 19 . 17 . 16 . 14 . . .",
        "16 . 19 . 23 . 26 - - . 24 . 23 . . .",
        "25 . . 26 25 . 21 . 19 - - . . . . .",
        "17 . 21 . 24 . 26 . 24 . 21 . 17 . 14 .",
        "16 - - - 19 - - - 12 . . . . . . .",
        "24 . . . 21 . 24 . 28 - - - . . . .",
        "26 . . 25 26 . 22 . 20 - - - . . . .",
        "19 . . . 16 . 19 . 23 - - - . . . .",
        "25 . . 24 25 . 21 . 19 - - - . . . .",
        "14 . 17 . 21 . 24 . 26 . 24 . 21 . 17 .",
        "23 . . . 22 . . . 19 . 17 . 16 . 14 .",
        "12 . 16 . 19 . 21 . 24 - - - - - . .",
        ". . . . 19 . 21 . 22 . 23 . . . . .",
      ],
    },
  },
  // Nightclub tracks (a club's card picks one).
  house: {
    id: "house", name: "House", bpm: 124, root: 45, gain: 0.85,
    chords: [[0, "m7"], [8, "maj7"], [3, "maj"], [10, "maj"]],
    drums: { kick: "x...x...x...x...", clap: "....x.......x...", hat: "..x...x...x...x.", open: "..............x." },
    bass: { wave: "sawtooth", notes: "0 . 0 . . 0 . 12 0 . 0 . . 0 7 .", oct: 0, cutoff: 700 },
    arp: { wave: "square", notes: ". . 0 . . 2 . . 1 . . 3 . . 2 .", oct: 1, gain: 0.04 },
    pad: { wave: "sawtooth", gain: 0.025, oct: 0 },
  },
  disco: {
    id: "disco", name: "Disco", bpm: 118, root: 50, gain: 0.85,
    chords: [[0, "m7"], [5, "7"], [10, "maj7"], [7, "m7"]],
    drums: { kick: "x...x...x...x...", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", open: "..x...x...x...x." },
    bass: { wave: "sawtooth", notes: "0 12 0 12 0 12 0 12 0 12 0 12 7 12 10 12", oct: -1, cutoff: 1100 },
    arp: { wave: "triangle", notes: "0 . 1 . 2 . 3 . 2+ . 1 . 3 . 2 .", oct: 1, gain: 0.05 },
    pad: { wave: "triangle", gain: 0.04, oct: 0 },
  },
  electro: {
    id: "electro", name: "Electro", bpm: 128, root: 43, gain: 0.8,
    chords: [[0, "min"], [0, "min"], [3, "maj"], [10, "maj"]],
    drums: { kick: "x..x..x...x..x..", clap: "....x.......x...", hat: "xxxxxxxxxxxxxxxx" },
    bass: { wave: "sawtooth", notes: "0 0 12 0 0 12 0 3 0 0 12 0 7 0 10 12", oct: 0, cutoff: 600 },
    arp: { wave: "sawtooth", notes: "0 1 2 1+ 0 1 2 0+ 0 1 2 1+ 0 2 1 3", oct: 1, gain: 0.03 },
  },
  latin: {
    id: "latin", name: "Latin", bpm: 104, root: 48, gain: 0.85,
    chords: [[0, "min"], [5, "min"], [7, "7"], [0, "min"]],
    drums: { rim: "x..x..x...x.x...", kick: "x..x...x..x...x.", hat: "x.xxx.xxx.xxx.xx", open: ".......x.......x" },
    bass: { wave: "triangle", notes: ". . . 7 - - 12 - . . . 7 - - 10 -", oct: 0, cutoff: 900 },
    arp: { wave: "square", notes: "0 . 1 2 . 1 . 2 0 . 1 2 . 1 . 3", oct: 1, gain: 0.04 },
  },
  hiphop: {
    id: "hiphop", name: "Hip hop", bpm: 88, swing: 0.55, root: 46, gain: 0.9,
    chords: [[0, "m9"], [0, "m9"], [5, "m7"], [3, "maj7"]],
    drums: { kick: "x......x..x.....", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.xx" },
    bass: { wave: "triangle", notes: "0 - - - - - . 0 - . 7 - - - . .", oct: 0, cutoff: 500 },
    pad: { wave: "triangle", gain: 0.05, oct: 0 },
  },
  // The show lounge, while a show is on: a quick big-band vamp in B-flat.
  showtime: {
    id: "showtime", name: "Showtime", bpm: 144, swing: 0.6, root: 58, gain: 0.8,
    chords: [[0, "7"], [5, "7"], [0, "7"], [7, "7"]],
    drums: { ride: "x...x.x.x...x.x.", snare: "......x.......x.", kick: "x.......x..x...." },
    bass: { wave: "triangle", notes: "0 - 4 - 7 - 9 - 10 - 9 - 7 - 4 -", oct: -1, cutoff: 900 },
    arp: { wave: "square", notes: ". . . . 1+ . . 1+ . . . . 2+ . 3 .", oct: 0, gain: 0.05 },
    lead: {
      wave: "sawtooth", oct: 0, gain: 0.035,
      bars: ["12 . . 15 16 . 19 . 16 . . . . . . .", "17 . . 21 22 . 21 . 17 . . . . . . .", "12 . . 15 16 . 19 . 22 . . 19 . 16 .", "14 . . . 17 . . . 19 . 17 . 14 . . ."],
    },
  },
};

/** Tracks a nightclub can play, in the card's order (PlacedObject.track indexes this). */
export const CLUB_TRACKS = ["house", "disco", "electro", "latin", "hiphop"];
export const SHOW_TRACK = "showtime";
export const THEME_TRACK = "theme";
