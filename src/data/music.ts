// Music is data (CLAUDE.md, docs/spec/audio.md): each track is a tempo, a key, one chord per bar and 16-step
// patterns, played by platform/music.ts through Web Audio. No audio files.
//
// Patterns: drums are 16 characters per bar ("x" hit, "X" accent, "." rest). Bass and arp are 16 space-separated
// tokens: bass tokens are semitones above the bar's chord root, arp tokens pick a chord tone (0-3) and may add
// "+" for an octave up; "." rests and "-" holds the previous note. Bass, arp and stab notes follow the chord of their
// half bar. Melody lines (lead, counter, bells) are one 16-token string per bar in semitones above the key's root,
// cycling through the bars. Tracks with an intro play it once, then loop from `loopFrom`.

export type Quality = "maj" | "min" | "7" | "m7" | "maj7" | "dim" | "m9" | "6" | "m6" | "aug";
export const CHORD_TONES: Record<Quality, number[]> = {
  maj: [0, 4, 7, 12], min: [0, 3, 7, 12], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6, 9], m9: [0, 3, 10, 14],
  "6": [0, 4, 7, 9], m6: [0, 3, 7, 9], aug: [0, 4, 8, 12],
};
export type Wave = "sine" | "square" | "triangle" | "sawtooth";
export type Drums = { kick?: string; snare?: string; clap?: string; hat?: string; open?: string; rim?: string; ride?: string; crash?: string; tom?: string };

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
  pad?: { wave: Wave; gain: number; oct: number };
  arp?: { wave: Wave; notes: string; oct: number; gain: number };
  /** Horn-section chord hits: 16 characters per bar ("x" hit, "X" accent, "-" hold, "." rest), the chord's upper tones. */
  stabs?: { wave: Wave; hits: string; oct: number; gain: number; cutoff?: number };
  lead?: Line;
  counter?: Line;
  bells?: Line;
  /** Per-bar changes (song bar index): that bar's drums, bass or stabs replace the usual ones. */
  fills?: Record<number, { drums?: Drums; bass?: string; stabs?: string }>;
  /** Overall level (tracks are mixed against each other by ear). */
  gain: number;
}

/** Shifts every note of some lead bars by n semitones. */
const up = (bars: string[], n: number) => bars.map((b) => b.replace(/-?\d+/g, (m) => String(Number(m) + n)));

// The main theme (owner, 2026-09-26: "entirely different", in the spirit of the RollerCoaster Tycoon title): a Vegas
// showband march in B-flat. What made that theme stick, kept: a bouncy straight-eighths two-beat (oom-pah bass on
// 1 and 3, the band on 2 and 4), one short hook stated, sequenced up and repeated until you can hum it, secondary
// dominants and chromatic pickups for the fairground cheek, AABA with a contrasting bridge, and a loop that turns
// straight back to the top. The Vegas part: a drumroll-and-fanfare intro that steps up a half step, brass stabs,
// a minor-iv sigh, a Charleston 3-3-2 kick, a "Sing, Sing, Sing" tom bridge in G minor with the spy-movie line
// cliche underneath, and a glockenspiel doubling the last chorus like a jackpot.
const HOOK = [
  "19 . 21 23 24 - - . 19 . 16 . 12 - - .", //   Bb6   F G A Bb, F D Bb
  "20 . 21 23 26 - - . 23 . 20 . 16 - - .", //   D7    the same shape, a step up
  "21 . 22 24 29 - - . 24 . 21 . 17 - - .", //   Eb6   and again, to the top
  "29 - - . 26 . 24 . 20 - - - . . 17 18", //   Ebm6  the sigh, and a chromatic pickup
];
const ANSWER = [
  "19 . 21 23 24 - - 22 21 . 25 . 28 - - .", //  Bb6 | G7
  "26 . 28 26 24 - - . 21 . 18 . 14 - - .", //  C7
  "26 . . 24 . . 23 . 29 . . 28 . . 26 .", //   F7    3-3-2
];
const TURN = "24 - - - - - . . . . . . . . 17 18"; // Bb6 | F7, back to the top
const BUTTON = "24 - - . 19 . 24 . . . . . . . . ."; //  Bb6 | D7, "shave and a haircut" into the bridge
const BIG = "31 - - - - - - - - - - - . . 17 18"; //   F7 | F+ (the intro's last bar and the bridge's)
const BRIDGE = [
  "28 - - - - - 27 - 28 - - - . . . .", //       Gm
  "31 - - . 28 . 24 . 21 - - - . . . .", //      Gm
  "29 - - - - - 28 - 29 - - - . . . .", //       Cm7
  "26 - - . 23 . 20 . 16 - - - . . . .", //      D7
  "28 - - - - - 27 - 28 - - - . . . .", //       Gm
  "27 - - . 24 . 21 . 17 - - - . . . .", //      Eb7
  "26 . 24 . 21 . 24 . 23 . 26 . 29 . 31 .", //  Cm7 | F7
  BIG, //                                        F7 | F+
];
const FANFARE = ["", "19 . . 19 19 . 23 . 26 - - - - - - .", "20 . . 20 20 . 24 . 27 - - - - - - .", BIG];
const THEME_LEAD = [...FANFARE, ...HOOK, ...ANSWER, TURN, ...HOOK, ...ANSWER, BUTTON, ...BRIDGE, ...HOOK, ...ANSWER, TURN];
const A_CHORDS: Track["chords"] = [[0, "6"], [4, "7"], [5, "6"], [5, "m6"], [0, "6", 9, "7"], [2, "7"], [7, "7"]];
const THEME_DRUMS: Drums = { kick: "x.......x.......", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.", open: "..............x." };
const TOMS: Drums = { tom: "X...x..xX...x..x", kick: "x.......x.......", hat: "..x...x...x...x." };
const FANFARE_HITS = "X..xx.x.X------.";
const FANFARE_DRUMS: Drums = { kick: "x..xx.x.x.......", snare: "x..xx.x.X.......", crash: "x..............." };
const BIG_DRUMS: Drums = { crash: "x...............", kick: "x.......x.......", tom: "............xxxX" };
const THREE_THREE_TWO = "x..x..x.x..x..x.";
const TURN_FILL = { bass: "0 - . . . . . . 0 . 2 . 4 - . .", drums: { ...THEME_DRUMS, snare: "....x.......x.xx" } };

export const TRACKS: Record<string, Track> = {
  theme: {
    id: "theme", name: "Casino Tycoon", bpm: 140, root: 58, gain: 0.9, loopFrom: 4,
    chords: [
      [7, "7"], [7, "7"], [8, "7"], [7, "7", 7, "aug"],
      ...A_CHORDS, [0, "6", 7, "7"], ...A_CHORDS, [0, "6", 4, "7"],
      [9, "min"], [9, "min"], [2, "m7"], [4, "7"], [9, "min"], [5, "7"], [2, "m7", 7, "7"], [7, "7", 7, "aug"],
      ...A_CHORDS, [0, "6", 7, "7"],
    ],
    drums: THEME_DRUMS,
    bass: { wave: "triangle", notes: "0 - . . . . . . -5 - . . . . . .", oct: -1, cutoff: 1000, fold: true },
    pad: { wave: "triangle", gain: 0.025, oct: 0 },
    stabs: { wave: "sawtooth", hits: "....x.......x...", oct: 0, gain: 0.022, cutoff: 2200 },
    lead: { wave: "sawtooth", bars: THEME_LEAD, oct: 0, gain: 0.05, exact: true, detune: 9, vib: 14, brass: true, cutoff: 2800 },
    counter: {
      wave: "sawtooth", oct: -1, gain: 0.04, exact: true, brass: true, cutoff: 1500,
      bars: [
        "", "", "", "", "", "", "", "", "", "", "", ". . . . . . . . 26 . 24 . 23 - . .",
        "", "", "", "", "", "", "", ". . . . . . . . 16 . 20 . 23 . 26 .",
        // The line cliche: G, F#, F, E under the held melody.
        "21 - - - - - - - 20 - - - - - - -", "19 - - - - - - - 18 - - - - - - -", "", "",
        "21 - - - - - - - 20 - - - - - - -", "19 - - - - - - - 17 - - - - - - -", "", "",
        "", "", "", "", "", "", "", ". . . . . . . . 26 . 24 . 23 - . .",
      ],
    },
    bells: {
      wave: "sine", oct: 0, gain: 0.03, ring: 0.7,
      bars: [
        "", "", "", ". . . . . . . . 19 23 27 31 35 39 . .",
        "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
        ". . . . . . . . 16 20 23 26 28 32 35 38",
        "", "", "", "", "", "", "", "",
        ...up([...HOOK, ...ANSWER, TURN], 12),
      ],
    },
    fills: {
      0: { drums: { snare: "xxxxxxxxXXXXXXXX" }, bass: "0 - - - - - - - - - - - - - - -", stabs: "................" },
      1: { drums: FANFARE_DRUMS, bass: "0 . . 0 0 . 0 . 0 - - - - - - .", stabs: FANFARE_HITS },
      2: { drums: FANFARE_DRUMS, bass: "0 . . 0 0 . 0 . 0 - - - - - - .", stabs: FANFARE_HITS },
      3: { drums: BIG_DRUMS, bass: "0 - - - - - - - 0 - - - - - . .", stabs: "X-------X-----.." },
      4: { drums: { ...THEME_DRUMS, crash: "x..............." } },
      7: { bass: "0 - . . . . . . -1 . -2 . -3 . -4 ." },
      10: { stabs: THREE_THREE_TWO }, 11: TURN_FILL,
      15: { bass: "0 - . . . . . . -1 . -2 . -3 . -4 ." },
      18: { stabs: THREE_THREE_TWO },
      19: { drums: { kick: "x.....x.x.......", snare: "......X.x.x.xxxx", crash: "x.....x........." }, bass: "0 - . . . . 0 . 0 - - - 7 - . .", stabs: "X.....X.X---...." },
      20: { drums: { ...TOMS, crash: "x..............." }, stabs: "......x.......x." }, 21: { drums: TOMS, stabs: "......x.......x." },
      22: { drums: TOMS, stabs: "......x.......x." }, 23: { drums: TOMS, stabs: "......x.......x." },
      24: { drums: TOMS, stabs: "......x.......x." }, 25: { drums: TOMS, stabs: "......x.......x." },
      26: { drums: TOMS, stabs: "x.x.x.x.x.x.x.x." },
      27: { drums: BIG_DRUMS, bass: "0 - - - - - - - 0 - . . 2 . 4 .", stabs: "X-------X-----.." },
      28: { drums: { ...THEME_DRUMS, crash: "x..............." } },
      31: { bass: "0 - . . . . . . -1 . -2 . -3 . -4 ." },
      34: { stabs: THREE_THREE_TWO }, 35: TURN_FILL,
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
