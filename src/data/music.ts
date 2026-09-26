// Music is data (CLAUDE.md, docs/spec/audio.md): each track is a tempo, a key, one chord per bar and 16-step
// patterns, played by platform/music.ts through Web Audio. No audio files.
//
// Patterns: drums are 16 characters per bar ("x" hit, "X" accent, "." rest). Bass and arp are 16 space-separated
// tokens: bass tokens are semitones above the bar's chord root, arp tokens pick a chord tone (0-3) and may add
// "+" for an octave up; "." rests and "-" holds the previous note. Bass, arp and stab notes follow the chord of their
// half bar. Melody lines (lead, counter, bells) are one 16-token string per bar in semitones above the key's root,
// cycling through the bars. Tracks with an intro play it once, then loop from `loopFrom`.

export type Quality = "maj" | "min" | "7" | "m7" | "maj7" | "dim" | "m9" | "6" | "m6" | "aug" | "mM7";
export const CHORD_TONES: Record<Quality, number[]> = {
  maj: [0, 4, 7, 12], min: [0, 3, 7, 12], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6, 9], m9: [0, 3, 10, 14],
  "6": [0, 4, 7, 9], m6: [0, 3, 7, 9], aug: [0, 4, 8, 12], mM7: [0, 3, 7, 11],
};
export type Wave = "sine" | "square" | "triangle" | "sawtooth";
export type Drums = { kick?: string; snare?: string; clap?: string; hat?: string; open?: string; rim?: string; ride?: string; crash?: string; tom?: string; brush?: string };

/** A melody part. Bars are one 16-token string each ("" rests a whole bar), cycling through the song. */
export interface Line {
  wave: Wave; bars: string[]; oct: number; gain: number;
  /** Notes last exactly their "-" holds and sustain (brass). Otherwise a note rings on through rests, up to half a bar. */
  exact?: boolean;
  /** A second voice this many cents sharp (a section, not a soloist). */
  detune?: number;
  /** Vibrato depth in cents, easing in on longer notes. */
  vib?: number;
  /** The filter opens on each note ("bwah"). */
  brass?: boolean;
  /** Struck and left to ring this many seconds, whatever the holds (bells). */
  ring?: number;
  /** Seconds to swell in (default: a quick 0.02). */
  attack?: number;
  cutoff?: number;
}

export interface Track {
  id: string;
  name: string;
  bpm: number;
  /** 0 straight; up to ~0.6 pushes every second 16th late (shuffle). */
  swing?: number;
  /** MIDI note of the key's root (57 = A3). */
  root: number;
  /** One chord per bar (semitones above the root, and its quality), or two: the second takes the bar's second half. */
  chords: ([number, Quality] | [number, Quality, number, Quality])[];
  /** Bars before this play once (an intro); the song then loops from here. */
  loopFrom?: number;
  drums: Drums;
  /** fold: roots above a fifth drop an octave, so the bass stays low whatever the chord. */
  bass?: { wave: Wave; notes: string; oct: number; cutoff?: number; fold?: boolean };
  /** Sustained chords. detune and attack (seconds) make a string section of it; otherwise it fades like an organ. */
  pad?: { wave: Wave; gain: number; oct: number; detune?: number; attack?: number; cutoff?: number };
  arp?: { wave: Wave; notes: string; oct: number; gain: number; cutoff?: number };
  /** Horn-section chord hits: 16 characters per bar ("x" hit, "X" accent, "-" hold, "." rest), the chord's upper tones.
   * swell: the horns fade in softly instead of biting. */
  stabs?: { wave: Wave; hits: string; oct: number; gain: number; cutoff?: number; swell?: boolean };
  lead?: Line;
  counter?: Line;
  bells?: Line;
  /** Per-bar changes (song bar index): that bar's drums, bass or stabs replace the usual ones; quiet parts sit out. */
  fills?: Record<number, { drums?: Drums; bass?: string; stabs?: string; quiet?: ("bass" | "pad" | "arp")[] }>;
  /** Room reverb level (0 dry). */
  space?: number;
  /** Overall level (tracks are mixed against each other by ear). */
  gain: number;
}

/** Shifts every note of some lead bars by n semitones. */
const up = (bars: string[], n: number) => bars.map((b) => b.replace(/-?\d+/g, (m) => String(Number(m) + n)));

// The main theme (owner, 2026-09-26, second pass): a spy-casino theme in G minor with a B-flat major bridge.
// The owner's brief after the first pass: warm, plodding and comforting, like the RollerCoaster Tycoon title,
// which moves minor to a major bridge and back; expected chords and resolutions, no jarring notes; rich layers.
// Rules it keeps: chords change every two bars or so (i, iv, V, i; I, vi, IV, V in the bridge); the melody moves
// by step in long notes and every phrase lands on a chord tone, the first on V and the second home on G. The one
// color is the spy-movie line cliche (G, F#, F, E), heard as a slow inner voice in the strings and guitar under
// held melody notes, so it's a pattern the ear learns rather than a surprise. Layers enter one by one in the intro
// (bass and ride, then guitar, then strings, then drums), a melody doubled in octaves, soft horn swells at the
// peaks, vibes doubling the last chorus, all in a reverb room.
const QUESTION = [
  "12 - - - 15 - - - 19 - - - - - - -", //    Gm, Gm(maj7)   G Bb D, rising
  "19 - - - 20 - - - 19 - - - 17 - 15 -", //   Gm7, Gm6       D, a sigh up to Eb and back
  "17 - - - 20 - - - 24 - - - 22 - 20 -", //  Cm
  "19 - - - - - - - 23 - - - 26 - - -", //    D7             left hanging on V
];
const ANSWER = [
  "27 - - - 24 - - - 19 - - - - - - -", //    Gm, Gm(maj7)   the same arpeggio, falling
  "19 - - - 17 - - - 15 - - - - - - -", //    Gm7, Gm6       stepping down
  "17 - - - 15 - - - 14 - - - 11 - - -", //   Cm | D7        down to the leading tone
  "12 - - - - - - - - - - - - - - -", //      Gm             home
];
const ANSWER_HIGH = [
  "24 - - - 20 - - - 24 - - - 27 - - -", //   Eb             climbing
  "29 - - - 27 - - - 24 - - - 20 - - -", //   Cm             the top, then down
  "26 - - - 24 - - - 23 - - - 26 - - -", //   D7
  "24 - - - - - - - - - - - - - - -", //      Gm             home
];
const BRIDGE = [
  "19 - - - 22 - - - 27 - - - - - - -", //    Bb             the hook's rise, in major
  "24 - - - 22 - - - 19 - - - - - - -", //    Gm
  "20 - - - 24 - - - 27 - - - - - - -", //    Eb
  "29 - - - 27 - - - 26 - - - 22 - - -", //   F7
  "22 - - - 27 - - - 31 - - - - - - -", //    Bb             the peak
  "31 - - - 29 - - - 27 - - - 24 - - -", //   Gm
  "20 - - - 24 - - - 29 - - - - - - -", //    Cm
  "26 - - - - - - - 23 - - - 19 - - -", //    D7             back to G minor
];
const THEME_LEAD = ["", "", "", "", ...QUESTION, ...ANSWER, ...QUESTION, ...ANSWER_HIGH, ...BRIDGE, ...QUESTION, ...ANSWER_HIGH];
const CLICHE: Track["chords"] = [[0, "min", 0, "mM7"], [0, "m7", 0, "m6"]];
const THEME_DRUMS: Drums = { kick: "x.......x.......", brush: "....x.......x...", ride: "x.x.x.x.x.x.x.x." };
const SWELL = "X---------------";

export const TRACKS: Record<string, Track> = {
  theme: {
    id: "theme", name: "Casino Tycoon", bpm: 100, root: 55, gain: 0.9, loopFrom: 4, space: 0.45,
    chords: [
      [0, "min"], [0, "mM7"], [0, "m7"], [0, "m6"],
      ...CLICHE, [5, "min"], [7, "7"], ...CLICHE, [5, "min", 7, "7"], [0, "min"],
      ...CLICHE, [5, "min"], [7, "7"], [8, "maj"], [5, "min"], [7, "7"], [0, "min"],
      [3, "maj"], [0, "min"], [8, "maj"], [10, "7"], [3, "maj"], [0, "min"], [5, "min"], [7, "7"],
      ...CLICHE, [5, "min"], [7, "7"], [8, "maj"], [5, "min"], [7, "7"], [0, "min"],
    ],
    // Brushes on 2 and 4 under a straight ride.
    drums: THEME_DRUMS,
    bass: { wave: "triangle", notes: "0 - - . 7 - - . 12 - - . 7 - - .", oct: -1, cutoff: 800, fold: true },
    // The guitar: a twangy eighth-note figure whose top note walks the line cliche.
    arp: { wave: "sawtooth", notes: "0 . 2 . 3 . 2 . 0 . 2 . 3 . 2 .", oct: 0, gain: 0.028, cutoff: 1400 },
    pad: { wave: "sawtooth", gain: 0.016, oct: 0, detune: 12, attack: 0.5, cutoff: 1300 },
    stabs: { wave: "sawtooth", hits: "................", oct: 0, gain: 0.014, cutoff: 1600, swell: true },
    lead: { wave: "sawtooth", bars: THEME_LEAD, oct: 0, gain: 0.042, exact: true, detune: 7, vib: 12, attack: 0.06, cutoff: 1900 },
    counter: { wave: "triangle", bars: THEME_LEAD, oct: -1, gain: 0.04, exact: true, attack: 0.05 },
    bells: {
      wave: "sine", oct: 0, gain: 0.028, ring: 1.4,
      bars: [...Array<string>(28).fill(""), ...up([...QUESTION, ...ANSWER_HIGH], 12)],
    },
    fills: {
      0: { drums: { ride: THEME_DRUMS.ride }, quiet: ["pad", "arp"] },
      1: { drums: { ride: THEME_DRUMS.ride }, quiet: ["pad"] },
      2: { drums: { ride: THEME_DRUMS.ride, kick: THEME_DRUMS.kick } },
      4: { drums: { ...THEME_DRUMS, crash: "x..............." } },
      16: { stabs: SWELL }, 19: { stabs: SWELL },
      20: { drums: { ...THEME_DRUMS, crash: "x..............." } }, 24: { stabs: SWELL },
      28: { drums: { ...THEME_DRUMS, crash: "x..............." } },
      32: { stabs: SWELL }, 35: { stabs: SWELL },
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
