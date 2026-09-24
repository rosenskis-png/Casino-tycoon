// Art is data (CLAUDE.md, docs/spec/art.md): palette-indexed text sprites, compiled into an atlas at load by
// render/atlas.ts, which also adds the 1px ink outline, derives clothing shades, and composes people.
// '.' is transparent. Palette colors may carry alpha (#rrggbbaa). Light comes from the top-left.

/** The shared "Velvet Night" palette. Ramps run dark → light. Sprites may override letters locally. */
export const PALETTE: Record<string, string> = {
  // ink: outlines (added by the compiler) and deep interior lines
  k: "#1b0e14", K: "#2a1a22",
  // carpet: quiet harlequin, dim gold motifs
  a: "#4e1527", b: "#62233a", d: "#43111f", c: "#6a3c2a", C: "#93703a",
  // walnut
  1: "#1c0f0a", 2: "#2e1a12", 3: "#472a1b", 4: "#66402a", 5: "#8a5c3a",
  // brass (0 = specular)
  6: "#4a3212", 7: "#8a6424", 8: "#c99a3e", 9: "#f2d27a", 0: "#fff4c8",
  // steel
  m: "#353846", M: "#5d6474", n: "#959dad", N: "#d6dde8",
  // cream, velvet, felt
  p: "#efe6d0", P: "#c2b396", r: "#6e1624", R: "#a8263a", O: "#d44a5c", f: "#174a33", F: "#236b48",
  // water
  u: "#103a5a", U: "#1c5e8c", v: "#3a8fc4", V: "#9ad8f2", Q: "#f2fdff",
  // neon (emissive: the brightest pixels on screen are always light sources)
  x: "#ff4fa0", X: "#ffd0ea", z: "#3ff2ff", Z: "#d8feff", q: "#ffd23f",
  // grass and leaves
  g: "#2a4a24", G: "#3a6430", h: "#4f8040", H: "#6e9e4c", l: "#1f5a34", L: "#2f7d45", j: "#58a85a",
  // stone and pavement
  s: "#57534c", S: "#77726a", t: "#948f84", T: "#b5afa0",
  // unowned land
  e: "#0d0809", E: "#150d0f", i: "#22161a",
  // screens and white
  y: "#0e0a14", Y: "#2a2440", w: "#f6f1e6",
};

export interface SpriteDef {
  rows: string[];
  pal?: Record<string, string>;
  /** Ink outline on the silhouette: true (all sides), false, or the sides to outline ("tblr"). Default true. */
  outline?: boolean | string;
}

// ---- Authoring helpers (pure). Grids are built at load; the compiler checks every row is the same width.

/** Mirror left halves into symmetric rows; `swap` turns light letters into their shade on the right half. */
export function mir(rows: string[], swap: Record<string, string> = {}): string[] {
  return rows.map((r) => r + [...r].reverse().map((ch) => swap[ch] ?? ch).join(""));
}
/** Replace whole rows by index (animation frames, variants). */
export function patch(rows: string[], p: Record<number, string>): string[] {
  return rows.map((r, i) => p[i] ?? r);
}
/** Swap letters inside a row range (inclusive). */
export function recolor(rows: string[], map: Record<string, string>, from = 0, to = rows.length - 1): string[] {
  return rows.map((r, i) => (i < from || i > to ? r : [...r].map((ch) => map[ch] ?? ch).join("")));
}
/** Shift a row range sideways by dx (plants swaying). */
export function shift(rows: string[], dx: number, from: number, to: number): string[] {
  return rows.map((r, i) => {
    if (i < from || i > to) return r;
    const pad = ".".repeat(Math.abs(dx));
    return dx > 0 ? (pad + r).slice(0, r.length) : (r + pad).slice(-r.length);
  });
}

const S = (rows: string[], pal?: Record<string, string>, outline: boolean | string = true): SpriteDef => ({ rows, pal, outline });

// ---------------------------------------------------------------------------------------------------------
// Terrain tiles (16×16, no outline). The renderer adds wall edges, wall shadows and baked light pools.

const CARPET_TOP = [
  "dddddddbbddddddd", "ddddddbaabdddddd", "dddddbaaaabddddd", "ddddbaaaaaabdddd",
  "dddbaaaaaaaabddd", "ddbaaaaaaaaaabdd",
];
const CARPET_BOT = [
  "ddbaaaaaaaaaabdd", "dddbaaaaaaaabddd", "ddddbaaaaaabdddd", "dddddbaaaabddddd",
  "ddddddbaabdddddd", "dddddddbbddddddd",
];
const WALLPAPER = { A: "#1b3a33", B: "#25504a" };

export const TILES: Record<string, SpriteDef> = {
  carpet: S([...CARPET_TOP, "dbaaaaaccaaaaabd", "baaaaacCCcaaaaab", "baaaaacCCcaaaaab", "dbaaaaaccaaaaabd", ...CARPET_BOT], undefined, false),
  carpet2: S([...CARPET_TOP, "dbaaaaaaaaaaaabd", "baaaaaacaaaaaaab", "baaaaaaacaaaaaab", "dbaaaaaaaaaaaabd", ...CARPET_BOT], undefined, false),
  // Wall seen from above (another wall below it): a dark walnut cap.
  wall: S([
    "3333333333333333", "3332333333333333", "3333333333334333", "3333333333333333",
    "3333333233333333", "3333333333333333", "3343333333333323", "3333333333333333",
    "3333333333333333", "3333323333333333", "3333333333333333", "3333333333343333",
    "3323333333333333", "3333333333333333", "3333333332333333", "3333333333333333",
  ], undefined, false),
  // Wall whose south face shows: cap, brass crown, green damask, chair rail, walnut wainscot.
  wallface: S([
    "3333333333333333", "3332333333333333", "3333333333334333", "4444444444444444",
    "9999999999999999", "7777777777777777", "AABAAAAAAABAAAAA", "ABBBAAAAABBBAAAA",
    "AABAAAAAAABAAAAA", "AAAAAABAAAAAAABA", "8888888888888888", "6666666666666666",
    "2444442224444422", "2433332224333322", "2422222224222222", "1111111111111111",
  ], WALLPAPER, false),
  // Wall whose south face is outside: cap, brass cornice, cream stucco blocks, stone plinth.
  wallout: S([
    "3333333333333333", "3332333333333333", "3333333333334333", "4444444444444444",
    "9999999999999999", "7777777777777777", "pppppppPpppppppP", "pppppppPpppppppP",
    "PPPPPPPPPPPPPPPP", "pppPpppppppPpppp", "pppPpppppppPpppp", "PPPPPPPPPPPPPPPP",
    "TTTTTTTTTTTTTTTT", "SSSSSSSSSSSSSSSS", "ssssssssssssssss", "1111111111111111",
  ], undefined, false),
  // Doorway in an east-west wall: brass lintel and posts, red runner.
  door: S([
    "3333333333333333", "3333333333333333", "4444444444444444", "9999999999999999",
    "7777777777777777", "87kkkkkkkkkkkk78", "87KKKKKKKKKKKK78", "87rrrrrrrrrrrr78",
    "87rOOOOOOOOOOr78", "87rRRRRRRRRRRr78", "87rRRRRRRRRRRr78", "87rRRRRRRRRRRr78",
    "87rRRRRRRRRRRr78", "87rRRRRRRRRRRr78", "87rRRRRRRRRRRr78", "97rRRRRRRRRRRr79",
  ], undefined, false),
  // Doorway in a north-south wall.
  doorV: S([
    "3333333333333333", "4444444444444444", "9999999999999999", "7777777777777777",
    "rrrrrrrrrrrrrrrr", "OOOOOOOOOOOOOOOO", "RRRRRRRRRRRRRRRR", "RRRRRRRRRRRRRRRR",
    "RRRRRRRRRRRRRRRR", "RRRRRRRRRRRRRRRR", "RRRRRRRRRRRRRRRR", "rrrrrrrrrrrrrrrr",
    "9999999999999999", "7777777777777777", "4444444444444444", "3333333333333333",
  ], undefined, false),
  water: S([
    "UUUUUUUUUUUUUUUU", "UUUvvUUUUUUUUUUU", "UUvVVvUUUUUUUuUU", "UUUUUUUUUUUUUUUU",
    "UUUUUUUUUUvvUUUU", "UuUUUUUUUvVVvUUU", "UUUUUUUUUUUUUUUU", "UUUUUvvUUUUUUUUU",
    "UUUUvVVvUUUUUUuU", "UUUUUUUUUUUUUUUU", "UUUUUUUUUUUUvvUU", "UUuUUUUUUUUvVVvU",
    "UUUvvUUUUUUUUUUU", "UUvVVvUUUUUuUUUU", "UUUUUUUUUUUUUUUU", "UUUUUUUUUUUUUUUU",
  ], undefined, false),
  grass: S([
    "GGGGGGGGGGGGGGGG", "GGhGGGGGGGGGgGGG", "GhGGGGGGGGGGGGGG", "GGGGGGGhGGGGGGGG",
    "GgGGGGGhHGGGGGGG", "GGGGGGGGGGGGhGGG", "GGGGGhGGGGGGGGGG", "GGGGGGGGGgGGGGGG",
    "GGGGGGGGGGGGGGGG", "GhGGGGGGGGGGGGGG", "GGGGGGGGGGGhGGGG", "GGGGgGGGGGhHGGGG",
    "GGGGGGGGGGGGGGGG", "GGGGGGGhGGGGGGgG", "GGhGGGGGGGGGGGGG", "GGGGGGGGGGGGGGGG",
  ], undefined, false),
  grass2: S([
    "GGGGGGGGGGGGGGGG", "GGGGGGGGhGGGGGGG", "GGGgGGGGGGGGGGGG", "GGGGGGGGGGGGGhGG",
    "GGGGGGGGGGGGhHGG", "GhGGGGGGGGGGGGGG", "GhHGGGGqGGGGGGGG", "GGGGGGGGGGGGGgGG",
    "GGGGGGGGGGGGGGGG", "GGGGGGGGGhGGGGGG", "GGGGgGGGGGGGGGGG", "GGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGGGhGG", "GGhGGGGGXGGGGGGG", "GGGGGGGGGGGGGGGG", "GGGGGGgGGGGGGGGG",
  ], undefined, false),
  sidewalk: S([
    "TTTTTTTTTTTTTTTs", "TSSSSSSSSSSSSSSs", "TSSSSSSSSSSSSSSs", "TSSSSStSSSSSSSSs",
    "TSSSSSSSSSSSSSSs", "TSSSSSSSSSSSSSSs", "TSSSSSSSSSSsSSSs", "TSSSSSSSSSSSSSSs",
    "TSSSSSSSSSSSSSSs", "TSStSSSSSSSSSSSs", "TSSSSSSSSSSSSSSs", "TSSSSSSSSSSSSSSs",
    "TSSSSSSSSSSSSSSs", "TSSSSSSSSStSSSSs", "TSSSSSSSSSSSSSSs", "ssssssssssssssss",
  ], undefined, false),
  void: S([
    "EEEEEEEEEEEEEEEE", "EEEEEEEEEEEEEEEE", "EEEiEEEEEEEEEEEE", "EEEEEEEEEEEeEEEE",
    "EEEEEEEEEEEEEEEE", "EEEEEEEEEEEEiEEE", "EeEEEEEEEEEEEEEE", "EEEEEEEEEEEEEEEE",
    "EEEEEEEEEEEEEEEE", "EEEEEiEEEEEEEEEE", "EEEEEEEEEEEEEEEE", "EEEEEEEEEEEEEEeE",
    "EEEEEEEEEEEiEEEE", "EEEEEEEEEEEEEEEE", "EEiEEEEEEEEEEEEE", "EEEEEEEEEEEEEEEE",
  ], undefined, false),
};

// ---------------------------------------------------------------------------------------------------------
// Objects. Sprites stand on the bottom of their footprint and may rise above it. Keys: `obj:<sprite>`,
// `obj:<sprite>:<facing>` (front/back/side; right = side mirrored), tiled pieces `obj:<sprite>:<facing>:<a|b|c>`
// (start, middle, end along the long axis), animation frames `<key>~1`, `<key>~2` (timing in ANIMS).

// Slot cabinet (16×20): topper with chase lamps, screen with three reels, button deck, belly art.
const SLOT_FRONT = mir([
  "....JJJJ", "...JIoIo", "...JIIFF", "....DDDD", "..AAAAAA", "..EBBBBB", "..Eyyyyy", "..Eyppyp", "..EyFFyF",
  "..Eyppyp", "..Eyyyyy", "..E88888", "..EBRRBq", "..DDDDDD", "..EBBBBB", "..EBBJJJ", "..EBBJII", "..EBBJJJ",
  "..EBBBBB", "..KKKKKK",
], { E: "D" });
const SLOT_BACK = mir([
  "....JJJJ", "...JIoIo", "...JJJJJ", "....DDDD", "..AAAAAA", "..EBBBBB", "..EBDDDD", "..EBBBBB", "..EBDDDD",
  "..EBBBBB", "..EBDDDD", "..EBBBBB", "..EBBBBB", "..EBBBBn", "..EJJJJJ", "..EBBBBB", "..EBBBBB", "..EBBBBB",
  "..EBBBBB", "..KKKKKK",
], { E: "D" });
const SLOT_SIDE = [
  ".....JJJJJ......", ".....IoIoJ......", ".....JJJJJ......", "......DDDD......", "....AAAAAAAAA...",
  "...yEBBBBBBBD...", "..yyEBBBBBBBD...", "..ypEBBBBBBBD...", "..yFEBBBBBBBD...", "..yyEBBBBBBBD...",
  "..88EBBBBBBBD...", "..RDEBBBBBBBD...", "...DEBBBBBBBD...", "....EBBBBBBBD...", "....EBJJJJJBD...",
  "....EBJIIIJBD...", "....EBJJJJJBD...", "....EBBBBBBBD...", "....EBBBBBBBD...", "....KKKKKKKKK...",
];
const LAMPS = { I: "o", o: "I" };
export const SLOT_ROWS: Record<string, string[]> = {
  front: SLOT_FRONT, "front~1": recolor(SLOT_FRONT, LAMPS, 1, 1),
  back: SLOT_BACK, "back~1": recolor(SLOT_BACK, LAMPS, 1, 1),
  side: SLOT_SIDE, "side~1": recolor(SLOT_SIDE, LAMPS, 1, 1),
};
/** Where the three reel windows sit on the front sprite (art px), for the spinning animation. */
export const SLOT_REELS = { x: [4, 7, 10], y: 7, w: 2, h: 3 };
/** Reel strip scrolled through the windows while a round spins (2 px wide). */
export const REEL_STRIP = ["pp", "FF", "pp", "RR", "pp", "qq", "pp", "kk", "pp", "FF", "pp", "vv"];
/** Per model: A top face, E lit edge, B body, D shade, J topper, I lamp on, o lamp off, F symbol. */
export const SLOT_COLORS: Record<string, Record<string, string>> = {
  cherry: { A: "#f08aaa", E: "#d8527e", B: "#b8325e", D: "#6e1a36", J: "#ff7ab4", I: "#fff0f6", o: "#9a3862", F: "#e5303d" },
  liberty: { A: "#8cc0f0", E: "#4f8fd0", B: "#2f6fb0", D: "#173a63", J: "#ffc94a", I: "#fff6d8", o: "#8a6a24", F: "#c88a1a" },
  thunder: { A: "#ac90ff", E: "#7a58d8", B: "#5a36b8", D: "#2a1a62", J: "#4fe8ff", I: "#e8fdff", o: "#246a7a", F: "#ffb81a" },
};

// Bar counter pieces. Front: back bar with bottles, a bartender in the middle piece, walnut panels, brass rails.
const BAR_BOTTLES = ["...V......q.....", "...V...R..q..F..", "..VVV..R.qqq.F..", "..VpV.RRRqpq.FF.", "..VVV.RRRqqq.FF."];
const BAR_TOP = ["5555555555555555", "3333333333333333", "1111111111111111", "1111111111111111", "5555555555555555", "4444444444444444"];
const BAR_FRONT = [
  "8888888888888888", "7777777777777777", "2444442224444422", "2433332224333322", "2433332224333322",
  "2433332224333322", "2422222224222222", "9999999999999999", "7777777777777777", "1111111111111111", "1111111111111111",
];
const BAR_PAL = { s: "#e3b48c", S: "#b07a5a", h: "#2a1a12", w: "#f6f1e6", J: "#1c1820", e: "#1b0e14", y: "#b0283c", F: "#2f8a4a" };
const barTender = (hands: [string, string]) => [
  "...V..hhhh..q...", "...V.hhhhhh.q...", "..VVVhsssshqqq..", "..VpVseSSesqpq..", "..VVVssssssqqq..",
  "5555JJwyywJJ5555", "3333JJJwwJJJ3333", hands[0], hands[1],
];
const BAR_BACK = [
  "................", "................", "9999999999999999", "7777777777777777", "5555555555555555", "5545555555555455",
  "4444444444444444", "2222222222222222", "1V1V11q1q11R1V11", "1V1V11q1q11R1V11", "3333333333333333", "1p1p1p11p1p1p1p1",
  "2222222222222222", "3333333333333333", "3333333333333333", "1111111111111111",
];
const BAR_SIDE = (i: number) => {
  const shelf = ["3q3V", "3333", "R3F3", "3333"];
  return Array.from({ length: 16 }, (_, y) => "87" + (y % 5 === 2 ? "5554555" : "5555555") + "42" + "1" + shelf[(y + i) % 4]);
};

// Cashier cage pieces: brass grille over a walnut counter; a teller behind the bars.
const CAGE_HEAD = ["6777777777777776", "7999999999999997", "7888888888888887"];
const GRILLE = "8KK7KK7KK7KK7KK7";
const CAGE_LOW = ["7777777777777777", "5555555555555555", "4444444444444444", ...BAR_FRONT.slice(2)];
const CAGE_PAL = { s: "#c98f62", h: "#1a1010", w: "#e8f0e0", F: "#3c8d5a" };
const CAGE_BACK = [
  "................", "................", "7999999999999997", "6888888888888886", "3333333333333333", "3444444444444443",
  "3433333333333323", "3433333333333323", "3433333333333323", "3433333333333323", "3422222222222223",
  "3333333333333333", "3333333333333333", "2222222222222222", "1111111111111111", "1111111111111111",
];
const CAGE_SIDE = Array.from({ length: 16 }, (_, y) => (y % 2 ? "8K8K" : "8888") + "75555542" + (y % 3 ? "33" : "3F") + "11");

// Restrooms (32×36): walnut roof cap, teal tiled front with two stall doors and pictograms.
const RR_PAL = { O: "#3f7f9a", o: "#2f6076", I: "#5a9ab4", w: "#f4efe4" };
const RR_CAP = [
  "..999999999999999999999999999...", ".97777777777777777777777777777..", ".7333333333333333333333333333336",
  ".7333323333333333333333333233336", ".7333333333333333323333333333336", ".7333333333333333333333333333336",
  ".7333333323333333333333333333336", ".7333333333333333333333333332336", ".7333333333333333333333333333336",
  ".7333333333323333333333333333336", ".7444444444444444444444444444446", ".9999999999999999999999999999997",
];
const RR_FRONT = [
  ...RR_CAP,
  ".IOOOOOOOOOOOOOOOOOOOOOOOOOOOOo.", ".IOOOOOwOOOOOOOOOOOOOOOOwOOOOOo.", ".IOOOOwwwOOOOOOOOOOOOOOwwwOOOOo.",
  ".IOOOOwwwOOOOOOOOOOOOOwwwwwOOOo.", ".IOOOOwOwOOOOOOOOOOOOOOwOwOOOOo.", ".IOkkkkkkkkkOOOOOOOOkkkkkkkkkOo.",
  ".IOk4444443kOOOOOOOOk4444443kOo.", ".IOk4333332kOOOOOOOOk4333332kOo.", ".IOk4333332kOOOOOOOOk4333332kOo.",
  ".IOk4333332kOOOOOOOOk4333332kOo.", ".IOk4333392kOOOOOOOOk4933332kOo.", ".IOk4333332kOOOOOOOOk4333332kOo.",
  ".IOk4333332kOOOOOOOOk4333332kOo.", ".IOk4333332kOOOOOOOOk4333332kOo.", ".IOk4222222kOOOOOOOOk4222222kOo.",
  ".IOk4444443kOOOOOOOOk4444443kOo.", ".IOk4333332kOOOOOOOOk4333332kOo.", ".IOk4333332kOOOOOOOOk4333332kOo.",
  ".IOk4333332kOOOOOOOOk4333332kOo.", ".IOk4222222kOOOOOOOOk4222222kOo.", ".oooooooooooooooooooooooooooooo.",
  ".111111111111111111111111111111.", "..1111111111111111111111111111..", "................................",
];
const RR_WALL = (door: boolean) => [
  ...RR_CAP,
  ...Array.from({ length: 20 }, (_, i) => (door && i > 4 && i < 19 ? ".kk" : ".IO") + (i % 5 === 4 ? "o".repeat(27) : "O".repeat(27)) + "o."),
  ".oooooooooooooooooooooooooooooo.", ".111111111111111111111111111111.", "..1111111111111111111111111111..", "................................",
];

// ATM (16×21): lit header, blue screen, keypad, cash slot.
const ATM_PAL = { E: "#d6dde8", D: "#353846" };
const ATM_FRONT = mir([
  "..NNNNNN", "..Ezzzzz", "..EzZzZz", "..Ezzzzz", "..EMMMMM", "..EMyyyy", "..EMyUUU", "..EMyUvv", "..EMyUUU",
  "..EMyyyy", "..ENNNNN", "..EMnmnm", "..EMmnmn", "..EMMMMM", "..EMMMkk", "..EMMMMM", "..EMMMMM", "..EMMMMM",
  "..EMMMMM", "..EMMMMM", "..KKKKKK",
], { E: "D" });
const ATM_BACK = mir([
  "..NNNNNN", "..Ezzzzz", "..Ezzzzz", "..Ezzzzz", "..EMMMMM", "..EMmmmm", "..EMMMMM", "..EMmmmm", "..EMMMMM",
  "..EMmmmm", "..EMMMMM", "..EMMMMM", "..EMMMMM", "..EMMMMn", "..EMMMMM", "..EMMMMM", "..EMMMMM", "..EMMMMM",
  "..EMMMMM", "..EMMMMM", "..KKKKKK",
], { E: "D" });
const ATM_SIDE = [
  "....NNNNNNNN....", "...zEzzzzzzD....", "...zEzzzzzzD....", "...zEzzzzzzD....", "....EMMMMMMD....",
  "...yEMMMMMMD....", "..yUEMMMMMMD....", "..yvEMMMMMMD....", "..yUEMMMMMMD....", "...yEMMMMMMD....",
  "..NNEMMMMMMD....", "..nmEMMMMMMD....", "...mEMMMMMMD....", "....EMMMMMMD....", "...kEMMMMMMD....",
  "....EMMMMMMD....", "....EMMMMMMD....", "....EMMMMMMD....", "....EMMMMMMD....", "....EMMMMMMD....",
  "....KKKKKKKK....",
];

// Potted palm (16×22), two sway frames.
const PALM = [
  ".....j....j.....", "..jj.jL..jL.jj..", ".jLLjLL..LLjLLj.", "jL..LLLjLLLL..Lj", "L..jLLLLLLLLj..L",
  "..jL.LlLLlL.Lj..", ".jL.lL.ll.Ll.Lj.", ".L..L..44..L..L.", "...l...43...l...", "......344.......",
  "......434.......", "......344.......", "......434.......", "......344.......", "..799999999997..",
  "..688888888886..", "...9888888876...", "...9888888876...", "....98888876....", "....98888876....",
  ".....888876.....", ".....677766.....",
];

// Neon sign (16×22): a cyan lucky 7 inside a pink tube border, on a brass pole. Frame 1 flickers.
const NEON = [
  "..KKKKKKKKKKKK..", "..KxxxxxxxxxxK..", "..KxKZZZZZZKxK..", "..KxKKKKKzzKxK..", "..KxKKKKzzKKxK..", "..KxKKKzzKKKxK..",
  "..KxKKKzzKKKxK..", "..KxKKzzKKKKxK..", "..KxKKzzKKKKxK..", "..KxxxxxxxxxxK..", "..KKKKKKKKKKKK..",
  ".......87.......", ".......87.......", ".......87.......", ".......87.......", ".......87.......",
  ".......87.......", ".......87.......", ".......87.......", "......9876......", "....99888777....",
];
const NEON_PAL = { K: "#221019", H: "#6a2048" };

// Wayfinding sign (16×22): green board, cream arrows and lettering, brass post.
const SIGN = [
  ".LLLLLLLLLLLLLL.", ".LGGGGGGGGGGGGg.", ".LGGwGGGGGGwGGg.", ".LGwwwwGGwwwwGg.", ".LGGwGGGGGGwGGg.",
  ".LGGGGGGGGGGGGg.", ".LGwwwGGwwwwwGg.", ".LGGGGGGGGGGGGg.", ".gggggggggggggg.", ".......87.......",
  ".......87.......", ".......87.......", ".......87.......", ".......87.......", ".......87.......",
  ".......87.......", ".......87.......", ".......87.......", ".......87.......", ".......87.......",
  "......9876......", "....99888777....",
];
const SIGN_PAL = { L: "#2f7a52", G: "#1e5a3c", g: "#123a26" };

// Fountain (32×36): octagonal marble basin, centre tier with a jet; three spray/ripple frames.
const FOUNTAIN = mir([
  "...............Q", "...............Q", "............V..V", "...........V...V", "..........TTTTTT",
  "..........mVVVVV", "...........MMMMM", "..............mM", "....TTTTTTTTTTmM", "...ETmmmmmmmmmmM",
  "..ETmuuuuuuuuumM", ".ETmuuUUUUUUUUmM", ".EmuUUUUUUUUUUmM", ".EmuUUUvUUUUUUmM", ".EmuUUUUUUUUUUmM",
  ".EmuUUUUUUUUVVVV", ".EmuUUUUUUUVVVVV", ".EmuUUUUUUUUUUUU", ".EmuUUvUUUUUUUUU", ".EmuUUUUUUUUvUUU",
  ".EmuUUUUUUUUUUUU", ".EmuUUUUvUUUUUUU", ".EmuUUUUUUUUUUUU", ".EmuUUUUUUUUUvUU", ".EmuUUvUUUUUUUUU",
  ".EmuUUUUUUUUUUUU", ".EmuuuuuuuuuuuuU", ".ETmmmmmmmmmmmmm", "..ETTTTTTTTTTTTT", "...mmmmmmmmmmmmm",
  "...MMMMMMMMMMMMM", "...MMDMMMMMMDMMM", "...MMMMMMMMMMMMM", "...MMMMMDMMMMMMM", "...DDDDDDDDDDDDD",
  "................",
], { E: "D" });
const FOUNTAIN_PAL = { T: "#eee8dc", E: "#d8d2c6", m: "#c4bcae", M: "#9a9284", D: "#6e6658", u: "#16507a" };
const FOUNTAIN_1 = patch(FOUNTAIN, {
  2: mir(["...........V...V"])[0], 3: mir(["..........V....V"])[0], 13: mir([".EmuUUUUvUUUUUmM"])[0],
  15: mir([".EmuUUUUUUUVVVUU"])[0], 16: mir([".EmuUUUUUUVVVVVV"])[0], 19: mir([".EmuUUUUUUUUUvUU"])[0],
});
const FOUNTAIN_2 = patch(FOUNTAIN, {
  2: mir(["...............V"])[0], 3: mir([".........V.....V"])[0], 4: mir(["........V.TTTTTT"])[0],
  15: mir([".EmuUUUUUUUUUVVV"])[0], 21: mir([".EmuUUUUUvUUUUUU"])[0],
});

// Security (M5): a ceiling dome over the tile (drawn at its top edge) and a dumpster out back.
const CAMERA = [
  "................", "......mmmm......", ".....MnnnnM.....", "....nyyyyyyn....", "....nyYyyyLn....", ".....nyyyyn.....",
  "......nnnn......", "................", "................", "................", "................", "................",
  "................", "................", "................", "................",
];
const DUMPSTER_PAL = { A: "#4f7d58", B: "#335c3e", C: "#21402b", L: "#e5303d" };
const DUMPSTER = [
  "...AAAAAAAAAAAAAAAAAAAAAAAAAA...", "..AAAAAAAAAAAAAAAAAAAAAAAAAAAA..", "..CCCCCCCCCCCCCCCCCCCCCCCCCCCC..",
  ...Array.from({ length: 10 }, (_, y) => (y % 3 === 1 ? "..BmBBBBBCBBBBBBBBBBBBCBBBBBmBC.." : "..BBBBBBBCBBBBBBBBBBBBCBBBBBBBC..").slice(0, 32)),
  "..CCCCCCCCCCCCCCCCCCCCCCCCCCCCC.".slice(0, 32), "...nn....................nn.....",
];

// ---------------------------------------------------------------------------------------------------------
// Amenities as places (M6): pieces the renderer lays out cell by cell from an amenity's size (sim/layout.ts).

/** Columns [a, b) of every row. */
const cols = (rows: string[], a: number, b: number) => rows.map((r) => r.slice(a, b));
// Restrooms of any size: the 2×2 block's pieces. A face column (with a stall door, or plain), and the roof in
// three bands (top edge, a repeatable middle, the eave), each as left edge / middle / right edge columns.
const RR_MID = (r: string) => r.slice(16, 30) + r.slice(14, 16);
const rrPiece = (rows: string[]) => ({ l: cols(rows, 0, 16), m: rows.map(RR_MID), r: cols(rows, 16, 32) });
const RR_FACE_DOOR = rrPiece(RR_FRONT.slice(RR_CAP.length)), RR_FACE_WALL = rrPiece(RR_WALL(false).slice(RR_CAP.length));
const RR_TOP = rrPiece(RR_CAP.slice(0, 2)), RR_EAVE = rrPiece(RR_CAP.slice(10, 12));
const RR_ROOF = rrPiece(Array.from({ length: 16 }, (_, i) => RR_CAP[2 + (i % 8)]));
const rrSet = (name: string, P: { l: string[]; m: string[]; r: string[] }, outline: Record<string, string>) =>
  Object.fromEntries((["l", "m", "r"] as const).map((k) => [`rr:${name}:${k}`, S(P[k], RR_PAL, outline[k])]));

const KITCHEN = [
  "..nnnnnnnnnnnn..", "..MMMMMMMMMMMM..", "...m..q..q...m..", "...m.........m..",
  "NNNNNNNNNNNNNNNN", "nwwnnnPPnnnwwnnn", "nwwnnPFFPnnwwnnn", "nnnnnnPPnnnnnnnn", "MMMMMMMMMMMMMMMM",
  "mMMMMmMMMMmMMMMm", "mMMMMmMMMMmMMMMm", "mMMMMmMMMMmMMMMm", "mMMMMmMMMMmMMMMm", "mMMMMmMMMMmMMMMm",
  "mMMMMmMMMMmMMMMm", "mmmmmmmmmmmmmmmm",
];
const KITCHEN_TOP = [
  "NNNNNNNNNNNNNNNN", "NnnnnnnnnnnnnnnM", "Nn.mm.nnnn.mm.nM", "Nnm..mnnnnm..mnM", "Nnm..mnnnnm..mnM",
  "Nn.mm.nnnn.mm.nM", "NnnnnnnnnnnnnnnM", "NnnwwnnPPnnwwnnM", "NnnwwnPFFPnwwnnM", "NnnnnnnPPnnnnnnM",
  "NnnnnnnnnnnnnnnM", "MMMMMMMMMMMMMMMM", "mMMMMmMMMMmMMMMm", "mMMMMmMMMMmMMMMm", "mMMMMmMMMMmMMMMm", "mmmmmmmmmmmmmmmm",
];
const STAGE = [
  "5555555555555555", "4444444444444444", "4434443444434444", "3333333333333333", "5555555555555555",
  "4444444444444444", "4444344444443444", "3333333333333333", "5555555555555555", "4444444444444444",
  "4443444443444444", "3333333333333333", "9999999999999999", "7777777777777777", "2222222222222222", "1111111111111111",
];
const CURTAIN = [
  "9999999999999999", "8787878787878787", "RRrOORRrOORRrOOR", "RRrORRRrORRRrORR", "RRrORRRrORRRrORR",
  "RRrORRRrORRRrORR", "RrrORRrrORRrrORR", "RrrORRrrORRrrORR", "RrrORRrrORRrrORR", "RrrORRrrORRrrORR",
  "RrrORRrrORRrrORR", "RrrORRrrORRrrORR", "rrrOrRrrOrRrrOrR", "rrrrrrrrrrrrrrrr", "8.8.8.8.8.8.8.8.", "................",
];
const DJ_PAL = { b: "#1a1622", B: "#2c2638" };
const DJBOOTH = [
  "................", "................", "..bbbbbbbbbbbb..", ".bmmmmbBBbmmmmb.", ".bmNNmbBBbmNNmb.",
  ".bmNymbzzbmNymb.", ".bmmmmbBBbmmmmb.", "bbbbbbbbbbbbbbbb", "BBBBBBBBBBBBBBBB", "bzzzzzzzzzzzzzzb",
  "bBBBBBBBBBBBBBBb", "bBBxBBBBBBBBxBBb", "bBBBBBBBBBBBBBBb", "bBBBBBBBBBBBBBBb", "bBBBBBBBBBBBBBBb", "bbbbbbbbbbbbbbbb",
];
const SPEAKER = [
  "..bbbbbbbbbbbb..", "..bBBBBBBBBBBb..", "..bB..mmmm..Bb..", "..bB.mMnnMm.Bb..", "..bB.mnyynm.Bb..",
  "..bB.mMnnMm.Bb..", "..bB..mmmm..Bb..", "..bBBBBBBBBBBb..", "..bB.mmmmmm.Bb..", "..bBmMnnnnMmBb..",
  "..bBmnyyyynmBb..", "..bBmnyyyynmBb..", "..bBmMnnnnMmBb..", "..bB.mmmmmm.Bb..", "..bBBBBBBBBBBb..",
  "..bBBBBBBBBBBb..", "..bbbbbbbbbbbb..", "...m........m...",
];
const BACKDROP = [
  "bbbbbbbbbbbbbbbb", "bBBBBBBBBBBBBBBb", "bBBBBBBBBBBBBBBb", "bxxxxxxxxxxxxxxb", "bBBBBBBBBBBBBBBb",
  "bBBzBBBBBBBBzBBb", "bBBBBBBBBBBBBBBb", "bBBBBBBBBBBBBBBb", "bzzzzzzzzzzzzzzb", "bBBBBBBBBBBBBBBb",
  "bBBBBBBBBBBBBBBb", "bBBBBBBBBBBBBBBb", "bBBBBBBBBBBBBBBb", "bBBBBBBBBBBBBBBb", "bBBBBBBBBBBBBBBb", "bbbbbbbbbbbbbbbb",
];
/** Dance floor: lit squares, three frames of the pattern stepping on. Floor-level glow, no outline. */
const DANCE_PAL = { a: "#ff4fa055", b: "#3ff2ff55", c: "#ffd23f55", d: "#1a162288" };
const danceFrame = (k: number) => Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => {
  if (x % 4 === 0 || y % 4 === 0) return "d";
  return "abc"[((x >> 2) + (y >> 2) + k) % 3];
}).join(""));

// ---------------------------------------------------------------------------------------------------------
// Themed decor (M6.5, docs/spec/themes.md): four 1×1 pieces per theme, 16 wide, standing on their tile's
// bottom. Symmetric pieces are drawn as left halves and mirrored (light left, shade right).
const PLINTH = ["..tttttttttttt..", "..TTTTTTTTTTTTt.", "...tTTTTTTTTt...", "...tTTTTTTTTt...", "..ssssssssssss.."];
const M = (rows: string[], swap: Record<string, string> = {}) => mir(rows, swap);
const SH = { p: "P", T: "t", N: "n", 9: "8", 5: "4", R: "r", h: "g", H: "h", V: "v", S: "s", F: "f", Z: "z", X: "x" };

export const DECOR_SPRITES: Record<string, SpriteDef> = {
  // Ancient Rome: marble, gold, crimson.
  rome_column: S(M([
    "..TTTTTT", "..tttttt", "...TpTpT", "....tttt", "....pTpT", "....pTpT", "....pTpT", "....pTpT", "....pTpT",
    "....pTpT", "....pTpT", "....pTpT", "....pTpT", "....pTpT", "....pTpT", "....pTpT", "....pTpT", "....pTpT",
    "....pTpT", "...ttttt", "..TTTTTT", "..tttttt",
  ], SH)),
  rome_bust: S([
    "......pppp......", ".....pppppP.....", ".....pTppTP.....", ".....ppppPP.....", "......pPPP......",
    "....ppppPPPP....", "...pRRRRRRRRP...", "...pppppPPPPP...", "....ppppPPPP....", "...tttttttttt...",
    ...PLINTH.slice(1, 4), "...tTTTTTTTTt...", ...PLINTH.slice(3),
  ]),
  rome_urn: S(M([
    "...h.H.h", "..hHhHhH", ".hHLhHLh", "..hLhhLh", "...LhLLh", "....ssss", "...TTTTT", "..TppppT",
    "..TpTTpT", "..TppppT", "...TpppT", "....TTTT", "...ttttt", "..tttttt",
  ], SH)),
  rome_standard: S([
    ".....8.99.8.....", "....8899998.....", "...8.89998.8....", ".......98.......", "...RRRRRRRRRR...",
    "...RR8R8R8RRr...", "...RRRRRRRRRr...", "...R8RR8RR8Rr...", "...rrrrrrrrrr...", ".......87.......",
    ".......87.......", ".......87.......", ".......87.......", ".......87.......", "......8877......", ".....ssssss.....",
  ]),
  // Ancient Egypt: sandstone, lapis, gold.
  egypt_obelisk: S([
    ".......99.......", "......9TTt......", "......TTTt......", "......TUTt......", "......TTTt......",
    ".....TT8Ttt.....", ".....TTTTtt.....", ".....TUTTtt.....", ".....TT8Ttt.....", ".....TTTTtt.....",
    ".....T8TTtt.....", ".....TTUTtt.....", ".....TTTTtt.....", "....TTT8TTtt....", "....TTTTTTtt....",
    "....TTUTT8tt....", "....TTTTTTtt....", "...ssssssssss...", "...SSSSSSSSSs...", "..ssssssssssss..",
  ], { T: "#d8b870", t: "#a88848" }),
  egypt_pharaoh: S([
    "......9999......", ".....UU99UU.....", "....U9UUUU9U....", "...U9UssssU9U...", "...U9sessesU9U..",
    "...U9UsssSU9U...", "..UU9UsSSsU9UU..", "..U9UUUssUUU9U..", "..U9U..99..U9U..", "..UU9..99..9UU..",
    "...U9.9999.9U...", "...tttttttttt...", ...PLINTH.slice(1),
  ], { s: "#c8905a", S: "#9a6a3a", e: "#1b0e14" }),
  egypt_papyrus: S([
    "..h.G.h..h.G.h..", ".hGh.hGhhGh.hGh.", "..h..hG..Gh..h..", "....h.GhhG.h....", ".....hGGGGh.....",
    "......GhhG......", ".......GG.......", "......UUUU......", ".....U9999U.....", ".....UUUUUU.....",
    ".....U9U9UU.....", ".....UUUUUU.....", "......UUUU......", ".....ssssss.....",
  ]),
  egypt_cat: S([
    "......y..y......", "......yyyy......", ".....yy9yyy.....", ".....yyyyyy.....", "......yyyy......",
    "......yyyy......", ".....yyyyyy.....", ".....yyyyyyY....", ".....yyyyyyY....", "....yyyyyyyyy...",
    "....yyyyyyyyy...", "...tttttttttt...", ...PLINTH.slice(1),
  ]),
  // Medieval: iron, oak, heraldic red and gold.
  med_armor: S(M([
    ".....NNN", "....NnNN", "....NyyN", "....NNNN", "...NNnnN", "..NNNNNN", "..nNNNNN", "..nNNnNN",
    "..nNNNNN", "...NNnNN", "...NNNNN", "...NnNNN", "...NN..N", "...NN..N", "...Nn..N", "..NNN..N",
    "..sssssss", "..ssssss",
  ].map((r) => r.slice(0, 8)), { N: "n" })),
  med_banner: S([
    ".888888888888...", "..RRRRRRRRRR....", "..RRR9999RRR....", "..RR99RR99RR....", "..RRR9999RRR....",
    "..RRRR99RRRR....", "..RRR9999RRR....", "..RRRRRRRRRR....", "..RRRRRRRRRR....", "...RRRRRRRR.....",
    "....RRRRRR......", ".....RRRR.......", "......RR........", "......2.........", "......2.........",
    "......2.........", ".....222........", "....ssssss......",
  ]),
  med_brazier: S([
    "......q.q.......", ".....qXqqX......", "....qXqXXqq.....", "....qqXXqXq.....", ".....qqqqq......",
    "...mmmmmmmmmm...", "...mMmMmMmMmm...", "....mmmmmmmm....", ".......mm.......", "......m..m......",
    ".....m....m.....", "....m......m....", "...mm......mm...",
  ]),
  med_shield: S([
    "..n..........n..", "...n........n...", "....n......n....", ".....RRRRRR.....", "....RR9RR9RR....",
    "....R999999R....", "....RR9RR9RR....", "....RRR99RRR....", ".....RR99RR.....", "......RRRR......",
    "...n...RR...n...", "..n..........n..", "......2222......", "......2222......", ".....ssssss.....",
  ]),
  // Rock & Roll: red lacquer, chrome, amp black.
  rock_guitar: S([
    ".......nn.......", ".......mn.......", ".......mn.......", ".......2m.......", ".......2m.......",
    ".......2m.......", ".......2m.......", ".....RRRRR......", "....RRRRRRR.....", ".....RRRRR......",
    "....RRmnmRRR....", "...RRRnnnRRRR...", "...RRRmnmRRRR...", "...RRRRRRRRRR...", "....RRRRRRRR....",
    "......2222......", ".....ssssss.....",
  ]),
  rock_amps: S([
    "..bbbbbbbbbbbb..", "..bBBBBBBBBBBb..", "..bBmmBBBBmmBb..", "..bBmnBBBBmnBb..", "..bBBBBBBBBBBb..",
    "..bqBBBBBBBBqb..", "..bbbbbbbbbbbb..", "..bBBBBBBBBBBb..", "..bBmmmBBmmmBb..", "..bBmyymmyymBb..",
    "..bBmyymmyymBb..", "..bBmmmBBmmmBb..", "..bBBBBBBBBBBb..", "..bbbbbbbbbbbb..", "...m........m...",
  ], { b: "#1a1622", B: "#2c2638" }),
  rock_jukebox: S(M([
    "....zzzz", "...zZZZZ", "..zZqqqq", "..zqRRRR", ".zqRyyyy", ".zqRyXXy", ".zqRyyyy", ".zqRRRRR",
    ".zqR9999", ".zqRnnnn", ".zqRnmnm", ".zqRnnnn", ".zqRRRRR", ".zqRxxxx", ".zqRRRRR", ".zzzzzzz",
  ], { Z: "z", q: "q" })),
  rock_record: S([
    "..222222222222..", "..2wwwwwwwwww2..", "..2w99999999w2..", "..2w9888888w2...", "..2w98y9y89w2...",
    "..2w98yyy89w2...", "..2w98y9y89w2...", "..2w9888889w2...", "..2w99999999w2..", "..2wwwwwwwwww2..",
    "..222222222222..", ".......22.......", ".......22.......", "......2222......", ".....ssssss.....",
  ].map((r) => r.padEnd(16, ".").slice(0, 16))),
  // Gilded Deco: black lacquer and gold.
  deco_lamp: S(M([
    "...99999", "..900000", "...99999", "....9999", ".....888", "......98", "......98", "......98",
    "......98", "......98", "......98", "......98", "......98", "......98", "......98", ".....888",
    "....9888", "...yyyyy", "..yyyyyy",
  ], SH)),
  deco_statue: S([
    "........9.......", ".......999......", "......9998......", ".....99.98......", "....9...98......",
    ".......998......", "......9.98......", ".....9...9......", "....9.....9.....", "...yyyyyyyyyy...",
    "...y99999999y...", "...yyyyyyyyyy...", "...yyyyyyyyyy...", "...yy8yyyy8yy...", "..yyyyyyyyyyyy..",
  ]),
  deco_screen: S(M([
    "..yyyyyy", ".yyyyyyy", ".yy9yy9y", ".yyy9y99", ".yyyy999", ".y999999", ".yyyy999", ".yyy9y99",
    ".yy9yy9y", ".yyyyyyy", ".y888888", ".yyyyyyy", ".yyyyyyy", ".8....8.",
  ])),
  deco_urn: S(M([
    "..l...L.", "...lLLlL", "....lLLL", ".....LLL", "....yyyy", "...y9999", "..yyyyyy", "..yyy9yy",
    "..yy999y", "..yyy9yy", "...yyyyy", "....yyyy", "....8888", "...yyyyy",
  ])),
  // Modern Luxe: chrome, glass, white.
  luxe_sculpture: S([
    ".....NNNNN......", "....NnnnnNN.....", "...Nn....nNN....", "...Nn.....nN....", "...NN.....nN....",
    "....NN...nNN....", ".....NNNNNN.....", "......NNNN......", ".......Nn.......", ".......Nn.......",
    "....wwwwwwww....", "....wNNNNNNw....", "....wwwwwwww....", "....wPPPPPPw....", "....wwwwwwww....",
  ]),
  luxe_orchid: S([
    "......w.w.......", ".....wxwXw......", "......wxw.......", ".......l.w......", ".......lwxw.....",
    ".......l.w......", "......LlL.......", ".....LLlLL......", "....VVVVVVVV....", "....VvvvvvvV....",
    "....VvhhhhvV....", "....VvvvvvvV....", "....VVVVVVVV....",
  ], { V: "#d6f0ffcc", v: "#9ad8f288" }),
  luxe_glass: S(M([
    "..NNNNNN", "..NVVVVV", "..NVvVVV", "..NVVvVV", "..NVVVvV", "..NVVVVV", "..NVvVVV", "..NVVvVV",
    "..NVVVvV", "..NVVVVV", "..NVVVVV", "..NVVVVV", "..NNNNNN", "..n.....",
  ], { V: "V" }), { V: "#d6f0ff99", v: "#ffffffaa" }),
  luxe_lamp: S([
    "...wwww.........", "..wwwwww........", "..wwwwww........", "...Nwww.........", "....N...........",
    ".....N..........", "......N.........", ".......N........", "........N.......", "........N.......",
    "........N.......", "........N.......", "........N.......", "........N.......", ".......NNN......", "......wwwww.....",
  ]),
  // Riviera: cypress, lemons, terracotta, blue stripes.
  riv_cypress: S(M([
    ".......l", "......lL", "......lL", ".....lLL", ".....lLL", ".....LLL", "....lLLL", "....lLjL",
    "....LLLL", "....lLLL", "...lLLjL", "...lLLLL", "...LLLLL", "....LLLL", "......44", ".....ssc",
    ".....ccc", "....cccc",
  ], { L: "l", j: "L" }), { c: "#b8643a" }),
  riv_lemon: S([
    "....LhLLhL......", "...hLqLhLqLh....", "..LhLLhqLLhLh...", "..hqLhLLhLqLL...", "...LhLqLhLLh....",
    "....hLLhLqL.....", "......44........", "......43........", "......43........", ".....cccc.......",
    "....cCcccc......", "....cccccc......", ".....cccc.......",
  ].map((r) => r.padEnd(16, ".")), { c: "#b8643a", C: "#e0905a", q: "#ffe040" }),
  riv_amphora: S(M([
    ".....ccc", "....c.cc", "....cccc", ".....ccc", "....cccc", "...ccCcc", "..cccCcc", "..ccCccc",
    "..cccccc", "...ccccc", "....cccc", ".....ccc", "......cc", ".....ccc",
  ], { C: "c" }), { c: "#b8643a", C: "#e0905a" }),
  riv_parasol: S([
    "......UwUwU.....", "....UwUwUwUwU...", "...UwUwUwUwUwU..", "..UUwwUUwwUUwwU.", "......N.........",
    "......N.........", "......N.........", "....wwwwwww.....", "....wwwwwww.....", ".....n...n......",
    ".....n...n......",
  ].map((r) => r.padEnd(16, "."))),
  // Rat Pack Lounge: walnut, red velvet, chrome.
  rat_mic: S([
    ".......nn.......", "......nNNn......", "......nNNn......", ".......nn.......", ".......N........",
    ".......N........", ".......N........", ".......N........", ".......N........", ".......N........",
    ".......N........", ".......N........", ".......N........", "......NNN.......", ".....NnnnN......",
  ]),
  rat_lamp: S([
    ".....RRRRRR.....", "....RRRRRRRr....", "...RRRRRRRRrr...", "...rrrrrrrrrr...", ".......99.......",
    ".......88.......", "......5555......", "...5555555555...", "...4444444444...", "....3......3....",
    "....3......3....",
  ]),
  rat_chair: S([
    "...rRRRRRRRRr...", "..rRRORRORRRRr..", "..rRRRRRRRRRRr..", "..rRRORRORRRRr..", "..rRRRRRRRRRRr..",
    ".5rrrrrrrrrrrr5.", ".5RRRRRRRRRRRR5.", ".5RRRRRRRRRRRR5.", ".5rrrrrrrrrrrr5.", ".44..........44.",
  ]),
  rat_marquee: S([
    "q.q.q.q.q.q.q.q.", "rrrrrrrrrrrrrrr.", "q.rwwwwwwwwwr.q.", ".rrwRRwwRRwwrr..", "q.rwwwwwwwwwr.q.",
    ".rrwwRRRRwwwrr..", "q.rwwwwwwwwwr.q.", "rrrrrrrrrrrrrrr.", "q.q.q.q.q.q.q.q.", "......22........",
    "......22........", "......22........", ".....2222.......",
  ].map((r) => r.padEnd(16, "."))),
  // Neon Atomic: chrome, turquoise, pink neon.
  atom_rocket: S(M([
    ".......x", "......nN", "......NN", ".....nNN", ".....NzN", ".....NzN", ".....NNN", ".....NNN",
    "....xNNN", "...xxNNN", "..xx.NNN", "..x..NNN", "......qq", "......Xq", ".......q", ".....sss",
  ], SH)),
  atom_star: S([
    ".......x........", "...x...x...x....", "....x..x..x.....", ".....xxxxx......", "..xxxxXXXxxxx...",
    ".....xxxxx......", "....x..x..x.....", "...x...x...x....", ".......x........", ".......N........",
    ".......N........", ".......N........", ".......N........", "......NNN.......", ".....sssss......",
  ]),
  atom_atom: S([
    "...z........z...", "....z......z....", ".....z.NN.z.....", "..NNNNzzzzNNNN..", ".N...zxXXxz...N.",
    "..NNNNzzzzNNNN..", ".....z.NN.z.....", "....z......z....", "...z........z...", ".......NN.......",
    ".......NN.......", "......NNNN......", ".....wwwwww.....",
  ]),
  atom_lava: S([
    "......nnnn......", ".....nXxxXn.....", ".....XxXXxX.....", ".....xXxxXx.....", "......XxxX......",
    "......xXXx......", ".....nnnnnn.....", ".....NNNNNN.....", "....NNNNNNNN....",
  ]),
  // Gold Rush: weathered wood, iron, gold nuggets.
  gold_cart: S([
    "...9.99.9.99....", "..9999999999....", "..4444444444....", "..4333433343....", "..4444444444....",
    "..3333333333....", "..mm......mm....", ".mMMm....mMMm...", "..mm......mm....", "ssssssssssssss..",
  ].map((r) => r.padEnd(16, "."))),
  gold_barrel: S(M([
    "...44444", "..433333", "..mmmmmm", "..433434", "..433434", "..433434", "..mmmmmm", "..433434",
    "..433434", "..mmmmmm", "...33333",
  ], { 4: "3" })),
  gold_cactus: S([
    ".......hh.......", "......hHHh......", "......hHHh......", "..hh..hHHh......", ".hHHh.hHHh..hh..",
    ".hHHh.hHHh.hHHh.", ".hHHhhhHHh.hHHh.", "..hHHHHHHhhhHHh.", "...hhhhHHHHHHh..", "......hHHhhhh...",
    "......hHHh......", "......hHHh......", "......hHHh......", ".....tttttt.....",
  ]),
  gold_wanted: S([
    "..PPPPPPPPPPPP..", "..PkkPkPkkPkkP..", "..PPPPPPPPPPPP..", "..PPPPssssPPPP..", "..PPPsesseSPPP..",
    "..PPPPssssPPPP..", "..PPPP4444PPPP..", "..PPPPPPPPPPPP..", "..PPkkPPPkkkPP..", "..PPPPPPPPPPPP..",
    "...4........4...", "...4........4...", "...4........4...", "..44........44..",
  ], { s: "#c8905a", e: "#1b0e14" }),
  // Tropical Tiki: carved wood, bamboo, flame.
  tiki_idol: S(M([
    "...44444", "..455555", "..454444", "..45y5yy", "..455555", "..454444", "..45RRRR", "..45wRwR",
    "..455555", "..454455", "..455555", "..454444", "..455555", "..444444", "...33333",
  ], { 5: "4", w: "w" })),
  tiki_torch: S([
    ".......q........", "......qXq.......", "......qXXq......", ".......qq.......", "......4554......",
    ".......54.......", ".......54.......", ".......44.......", ".......54.......", ".......54.......",
    ".......44.......", ".......54.......", ".......54.......", "......4444......",
  ]),
  tiki_bamboo: S([
    ".h.h.h.h.h.h.h..", ".HhHhHhHhHhHhH..", ".HhHhHhHhHhHhH..", ".4444444444444..", ".HhHhHhHhHhHhH..",
    ".HhHhHhHhHhHhH..", ".HhHhHhHhHhHhH..", ".4444444444444..", ".HhHhHhHhHhHhH..", ".HhHhHhHhHhHhH..",
    ".HhHhHhHhHhHhH..", ".h.h.h.h.h.h.h..",
  ], { H: "#c8b060", h: "#8a7838" }),
  tiki_drum: S(M([
    "...PPPPP", "..PpPPPP", "..PPPPPP", "..444444", "..4R4R4R", "..454545", "..4R4R4R", "..454545",
    "..444444", "...44444", "...3..33",
  ], { p: "P", 5: "4" })),
  // Pirate Cove: ship timber, iron, gold.
  pirate_wheel: S([
    ".......4........", "...4...4...4....", "....4.444.4.....", ".....4...4......", "...44.4.4.44....",
    "..4444.9.4444...", "...44.4.4.44....", ".....4...4......", "....4.444.4.....", "...4...4...4....",
    ".......4........", ".......3........", "......333.......", ".....sssss......",
  ]),
  pirate_chest: S([
    "..444444444444..", ".45555555555554..", ".4mmmmmmmmmmmm4.", ".49q9q999q9q994.", ".4444449944444..",
    ".4555559955554..", ".4555555555554..", ".4mmmmmmmmmmmm4.", ".4555555555554..", ".44444444444444.",
  ].map((r) => r.slice(0, 16))),
  pirate_anchor: S([
    ".......mm.......", "......m..m......", ".......mm.......", "....mmmmmmmm....", ".......mm.......",
    ".......mm.......", ".......mm.......", ".......mm.......", "..m....mm....m..", "..mm...mm...mm..",
    "...mm..mm..mm...", "....mmmmmmmm....", ".....PPPPPP.....", "....PpPPpPPP....",
  ]),
  pirate_cannon: S([
    "................", "..mmmmmmmmmm....", ".mMMMMMMMMMmm...", ".mMmmmmmmmmMmy..", ".mMMMMMMMMMmm...",
    "..mmmmmmmmmm....", "...44.....44....", "..4334...4334...", "..4334...4334...", "...44.....44....",
  ]),
  // Outdoors (M6.5): pool water and deck, loungers, garden hedges, flower beds, benches and path, umbrellas
  // over outdoor tables, and a for-sale sign on unowned land.
  water: S(Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => ((x + 2 * y) % 11 === 0 ? "V" : (x * 3 + y) % 7 === 0 ? "v" : "U")).join("")), undefined, false),
  "water~1": S(Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => ((x + 2 * y + 5) % 11 === 0 ? "V" : (x * 3 + y + 3) % 7 === 0 ? "v" : "U")).join("")), undefined, false),
  deck: S(Array.from({ length: 16 }, (_, y) => (y % 4 === 3 ? "tttttttttttttttt" : "TTTTTTTTTTTTTTTT")), undefined, false),
  lounger: S([
    "................", "................", "................", "...wwwwwwwww....", "...wUwUwUwUww...",
    "...wwwwwwwwww...", "...UwUwUwUwUw...", "...wwwwwwwwww...", "...UwUwUwUwUw...", "...wwwwwwwwww...",
    "...UwUwUwUwUw...", "...wwwwwwwwww...", "...n........n...",
  ]),
  hedge: S([
    "..hHhHhHhHhHhH..", ".hHLHhLHhHLHhHh.", "hHHhHHHhHHHhHHHh", "hLHHhLHHhHLHhHLh", "hHHhHHhHHHhHHHhh",
    "hHLHhHHLHhHHLHhh", "hhHHhHhHHhHhHHhg", "ghhhghhhghhhghhg", "gggggggggggggggg",
  ]),
  flowers: S([
    "................", "................", "................", "................", "................",
    "..x..q..X..x..q.", ".xhx.qhq.hx.xhx.", "..hG..h.GhG..h..", ".GhGhGhGhGhGhGh.", "gGgGgGgGgGgGgGgg",
    "gggggggggggggggg",
  ], undefined, "tb"),
  bench: S([
    "................", "................", "................", "................", "................",
    "..444444444444..", "..555555555555..", "..444444444444..", "..mm........mm..", "..555555555555..",
    "..333333333333..", "..mm........mm..",
  ]),
  path: S(Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => ((x * 5 + y * 3) % 9 === 0 ? "s" : "t")).join("")), undefined, false),
  umbrella: S([
    "....RwRwRwRw....", "..RwRwRwRwRwRw..", ".RRwwRRwwRRwwRR.", "......nn........", "......nn........",
    "......nn........",
  ].map((r) => r.slice(0, 16))),
  forsale: S([
    "..PPPPPPPPPPPP..", "..PRRRRRRRRRRP..", "..PRwRwRwwRwRP..", "..PRRRRRRRRRRP..", "..PP9PP9P9PPPP..",
    "..PPPPPPPPPPPP..", "......44........", "......44........", "......44........", "......44........",
    ".....4444.......",
  ]),
};

export const ZONE_SPRITES: Record<string, SpriteDef> = {
  // A bar counter piece without a bartender, and a cage window with a teller, for long counters.
  "counter:front:m": S([...BAR_BOTTLES, ...BAR_TOP, ...BAR_FRONT], BAR_PAL, "tb"),
  "cage:front:b": S([...CAGE_HEAD, "8KK7KhhhK7KK7KK7", "8KK7KsssK7KK7KK7", "8KK7KsesK7KK7KK7", "8KK7wFFFw7KK7KK7", "8KKwwFFFww7K7KK7", GRILLE, ...CAGE_LOW], { ...CAGE_PAL, e: "#1b0e14" }, "tb"),
  // A cocktail table: walnut top on a brass pedestal.
  table: S([
    "................", "................", "................", "................", ".....555555.....",
    "....54444445....", "...5444444443...", "...3444444443...", "....33333333....", "......3223......",
    ".......76.......", ".......76.......", ".......76.......", "......7766......", ".....877766.....", "................",
  ]),
  // Velvet chairs: facing down (back at the top), up (seen from behind), and to the side.
  "chair:front": S([
    "................", "................", "................", "................", "......2222......",
    ".....2RRRR2.....", ".....2ROOR2.....", ".....2RRRR2.....", ".....2rrrr2.....", "....2RRRRRR2....",
    "....2RRRRRR2....", "....2rrrrrr2....", ".....3....3.....", ".....3....3.....", "................", "................",
  ]),
  "chair:back": S([
    "................", "................", "................", "................", "................",
    "....2RRRRRR2....", "....2RRRRRR2....", "....2rrrrrr2....", ".....2RRRR2.....", ".....2ROOR2.....",
    ".....2RRRR2.....", ".....2rrrr2.....", ".....3....3.....", ".....3....3.....", "................", "................",
  ]),
  "chair:side": S([
    "................", "................", "................", "................", "..........2.....",
    ".........2R2....", ".........2R2....", ".........2O2....", ".........2R2....", ".....2RRRRR2....",
    ".....2RRRRR2....", ".....2rrrrr2....", ".....3....3.....", ".....3....3.....", "................", "................",
  ]),
  // A dining table: white cloth, two places, a candle.
  dtable: S([
    "................", "................", "...pppppppppp...", "..pwwppqqppwwp..", "..pwwpp09ppwwp..",
    "..pppppqqppppp..", "..pppppppppppp..", "..pwwppppppwwp..", "..pwwppppppwwp..", "..pppppppppppp..",
    "..PPPPPPPPPPPP..", "..PpPpPpPpPpPP..", "..PPPPPPPPPPPP..", "...3........3...", "...3........3...", "................",
  ]),
  // The kitchen: a steel pass with heat lamps and plates (front pieces), or the steel top seen from above.
  "kitchen:front:a": S(KITCHEN, { F: "#c86a2a" }, "tbl"), "kitchen:front:b": S(KITCHEN, { F: "#c86a2a" }, "tb"), "kitchen:front:c": S(KITCHEN, { F: "#c86a2a" }, "tbr"),
  "kitchen:top": S(KITCHEN_TOP, { F: "#c86a2a" }),
  stage: S(STAGE, undefined, false), "stage:curtain": S(CURTAIN, undefined, "lr"),
  djbooth: S(DJBOOTH, DJ_PAL), "djbooth~1": S(recolor(DJBOOTH, { z: "x" }, 5, 9), DJ_PAL),
  speaker: S(SPEAKER, DJ_PAL), "speaker~1": S(recolor(SPEAKER, { n: "N" }, 3, 12), DJ_PAL),
  backdrop: S(BACKDROP, DJ_PAL), "backdrop~1": S(recolor(BACKDROP, { x: "z", z: "x" }), DJ_PAL),
  dance: S(danceFrame(0), DANCE_PAL, false), "dance~1": S(danceFrame(1), DANCE_PAL, false), "dance~2": S(danceFrame(2), DANCE_PAL, false),
  ...rrSet("door", RR_FACE_DOOR, { l: "bl", m: "b", r: "br" }), ...rrSet("wall", RR_FACE_WALL, { l: "bl", m: "b", r: "br" }),
  ...rrSet("top", RR_TOP, { l: "tl", m: "t", r: "tr" }), ...rrSet("roof", RR_ROOF, { l: "l", m: "", r: "r" }), ...rrSet("eave", RR_EAVE, { l: "l", m: "", r: "r" }),
  // Door rule markers, drawn over a door tile: staff plaque, padlock, card reader, velvet rope, role plaque, fee.
  "door:staff": S(["................", "...RRRRRRRRRR...", "...RwRwwRwwRR...", "...RRRRRRRRRR..."]),
  "door:locked": S(["......nnnn......", ".....n....n.....", ".....n....n.....", "....88888888....", "....87777778....", "....877kk778....", "....8777k778....", "....88888888...."]),
  "door:card": S(["......mmmm......", "......myym......", "......mjjm......", "......mmmm......"], { j: "#58ff7a" }),
  "door:dress": S([
    "................", "................", "................", "................", "................",
    "................", "................", "................", "..9..........9..", "..8..........8..",
    "..8RR......RR8..", "..8..RRRRRR..8..", "..8..........8..", "..8..........8..", ".777........777.", "................",
  ]),
  "door:role": S(["................", "...qqqqqqqqqq...", "...qkqkkqkkqq...", "...qqqqqqqqqq..."]),
  "door:fee": S(["..........999...", ".........97779..", ".........97979..", ".........97779..", "..........999..."]),
};

export const OBJECT_SPRITES: Record<string, SpriteDef> = {
  ...ZONE_SPRITES,
  ...DECOR_SPRITES,
  camera: S(CAMERA, { L: "#ff3040" }),
  dumpster: S(DUMPSTER, DUMPSTER_PAL),
  plant: S(PALM), "plant~1": S(shift(PALM, 1, 0, 6)),
  neon: S(NEON, NEON_PAL), "neon~1": S(recolor(NEON, { x: "H" }, 0, 10), NEON_PAL),
  sign: S(SIGN, SIGN_PAL),
  fountain: S(FOUNTAIN, FOUNTAIN_PAL), "fountain~1": S(FOUNTAIN_1, FOUNTAIN_PAL), "fountain~2": S(FOUNTAIN_2, FOUNTAIN_PAL),
  "atm:front": S(ATM_FRONT, ATM_PAL), "atm:back": S(ATM_BACK, ATM_PAL), "atm:side": S(ATM_SIDE, ATM_PAL),
  "restroom:front": S(RR_FRONT, RR_PAL), "restroom:back": S(RR_WALL(false), RR_PAL), "restroom:side": S(RR_WALL(true), RR_PAL),
  "counter:front:a": S([...BAR_BOTTLES, ...BAR_TOP.slice(0, 1), ...BAR_TOP.slice(1), ...BAR_FRONT], BAR_PAL, "tbl"),
  "counter:front:b": S([...barTender(["111sJJJwwJJJ1111", "111FJJJwwJJJs111"]), "5555555555555555", "4444444444444444", ...BAR_FRONT], BAR_PAL, "tb"),
  "counter:front:b~1": S([...barTender(["1111JJJwwJJJs111", "111sJJJwwJJJF111"]), "5555555555555555", "4444444444444444", ...BAR_FRONT], BAR_PAL, "tb"),
  "counter:front:c": S([...BAR_BOTTLES.map((r) => [...r].reverse().join("")), ...patch(BAR_TOP, { 2: "1111111111988111", 3: "1111111111988111" }), ...BAR_FRONT], BAR_PAL, "tbr"),
  "counter:back:a": S(BAR_BACK, BAR_PAL, "tbl"), "counter:back:b": S(patch(BAR_BACK, { 8: "11111nNNNNn11111", 9: "11111nuuuun11111" }), BAR_PAL, "tb"),
  "counter:back:c": S(BAR_BACK, BAR_PAL, "tbr"),
  "counter:side:a": S(patch(BAR_SIDE(0), { 0: "9888888888713333" }), BAR_PAL, "tlr"), "counter:side:b": S(BAR_SIDE(1), BAR_PAL, "lr"),
  "counter:side:c": S(patch(BAR_SIDE(2), { 10: "7777777777771111", 11: "3323323323321111", 12: "3323323323321111", 13: "3323323323321111", 14: "2222222222221111", 15: "1111111111111111" }), BAR_PAL, "blr"),
  "cage:front:a": S([...CAGE_HEAD, GRILLE, "8KK7FFFFFF7KK7K7", "8KK7FFpFFF7KK7K7", "8KK7FpppFF7KK7K7", "8KK7FFFFFF7KK7K7", GRILLE, ...CAGE_LOW], CAGE_PAL, "tbl"),
  "cage:front:c": S([...CAGE_HEAD, "8KK7KhhhK7KK7KK7", "8KK7KsssK7KK7KK7", "8KK7KsesK7KK7KK7", "8KK7wFFFw7KK7KK7", "8KKwwFFFww7K7KK7", GRILLE, ...CAGE_LOW], { ...CAGE_PAL, e: "#1b0e14" }, "tbr"),
  "cage:back:a": S(CAGE_BACK, CAGE_PAL, "tbl"), "cage:back:c": S(CAGE_BACK, CAGE_PAL, "tbr"),
  "cage:side:a": S(patch(CAGE_SIDE, { 0: "8888999999999911" }), CAGE_PAL, "tlr"),
  "cage:side:c": S(patch(CAGE_SIDE, { 12: "7777777777777711", 13: "3323323323323311", 14: "3323323323323311", 15: "1111111111111111" }), CAGE_PAL, "blr"),
};

// ---------------------------------------------------------------------------------------------------------
// Small props and effects.
const A_SHADOW = "#10060c66";
export const EXTRA_SPRITES: Record<string, SpriteDef> = {
  stool: S([
    "................", "................", "................", "................", "................",
    "................", "................", "................", "................", "......OORR......",
    ".....OORRRr.....", ".....rrrrrr.....", ".......87.......", ".......87.......", "......8877......",
    "................",
  ]),
  litter: S([
    "................", "................", "................", "....ww..........", "....wR..........",
    "................", "..........MN....", "..........MM....", "................", "................",
    "......Pp........", "......pP........", "................", "................", "................",
    "................",
  ], undefined, false),
  spill: S([
    "................", "................", "..........ww....", "..........wR....", "...aaaa.........",
    "..aAAAAa........", "..aAAAAAa.......", "...aAAAa........", "....aaa...MN....", "..........MM....",
    "................", "..ww............", "..Rw............", "................", "................",
    "................",
  ], { a: "#b8862a88", A: "#e0b04a88" }, false),
  broken: S(["...q...", "..qkq..", "..qkq..", ".qqkqq.", ".qqqqq.", "qqqkqqq", "qqqqqqq"]),
  // People props: drawn at the hand. Shadow under every standing figure.
  shadow: S([".zzzzzz.", "zzzzzzzz", ".zzzzzz."], { z: A_SHADOW }, false),
  glass: S(["VVV", "q9q", "qqq"]),
  soda: S(["..w", "RRw", "ROR", "RRR"]),
  tray: S([".NNNn.", "NnnnnM", ".MMMM."]),
  "tray:full": S(["Q.V.X.", "q.v.x.", "NnnnnM", ".MMMM."]),
  mop: S(["...4", "...4", "..4.", "..4.", "..4.", ".4..", ".4..", "pPpP"]),
  "mop~1": S(["4...", "4...", ".4..", ".4..", ".4..", "..4.", "..4.", "PpPp"]),
  toolbox: S([".mm.", "RRRR", "rrrr"]),
  spark: S(["..q..", "q.q.q", ".qwq.", "q.q.q", "..q.."], undefined, false),
  "spark~1": S([".q.q.", "..q..", "qqwqq", "..q..", ".q.q."], undefined, false),
  // Security's radio, worn at the hip.
  radio: S([".n", "mm", "mM", "mm"]),
  // Enforcement (M5): a body bag on the floor and over the shoulder, a small pistol and its muzzle flash.
  bag: S([".bbbbbbbbbb.", "bBBBBmBBBBBb", "bbbbbmbbbbbb", ".bbbbbbbbbb."], { b: "#18161e", B: "#2c2a34" }),
  "bag:carry": S(["bbb.", "bBBb", "bBmb", "bBBb", "bBBb", ".bb."], { b: "#18161e", B: "#2c2a34" }),
  gun: S(["nnnn", "Mn.."]),
  flash: S([".q.", "qwq", ".q."], undefined, false),
  // Incidents (M4): marks over a head, a sick face, a scuffle cloud, and vomit on the floor.
  "inc:loud": S(["..qq", "..q9", "..q.", ".qq.", "qqq.", "qq.."]),
  "inc:loud~1": S(["...qq", "...q9", "...q.", "..qq.", ".qqq.", ".qq.."]),
  "inc:angry": S(["O.O", "O.O", "O.O", "...", "O.O"]),
  "inc:sob": S(["........", "........", "........", "........", "........", ".V....V.", ".v....v."], { V: "#9ad8f2cc", v: "#3a8fc4aa" }, false),
  "inc:sick": S(["........", "........", "........", ".gggggg.", ".gggggg.", ".gggggg."], { g: "#58a85a66" }, false),
  "inc:heart": S(["x.x", "xxx", ".x."]),
  "inc:cheer": S(["x...q", "..z..", "q...x", ".x.z."], undefined, false),
  "inc:cheer~1": S(["..q..", "z...x", "..x..", "q...z"], undefined, false),
  "inc:zzz": S(["NNN", "..N", ".N.", "NNN"]),
  "inc:fight": S(["..n..q..n...", ".nNn.nn.nNn.", "nNNNnNNnNNNn", ".nnNNnnNNnn."], { n: "#b5afa0aa", N: "#e8e2d4cc" }, false),
  "inc:fight~1": S([".n...n..q.n.", "nNn.nNNn.nNn", ".nNNNnnNNNn.", "..nnn..nnn.."], { n: "#b5afa0aa", N: "#e8e2d4cc" }, false),
  vomit: S([
    "................", "................", "................", "................", ".....aa.........",
    "...aaAAaa..a....", "..aAAAAAAa.aA...", "..aAAAbAAAa.a...", "...aAAAAAAa.....", "....aaAAaa..aa..",
    "......aa....aA..", "..............a.", "................", "................", "................",
    "................",
  ], { a: "#8a9a3aaa", A: "#b8c04acc", b: "#d8d070dd" }, false),
  "flush1:down": S(["........", "........", "........", "........", "........", ".r....r."], { r: "#ff2a4a66" }, false),
  "flush2:down": S(["........", "........", "........", "........", ".r....r.", ".rrRRrr.", "..rrrr.."], { r: "#ff2a4a70", R: "#ff2a4aaa" }, false),
  "flush1:side": S(["........", "........", "........", "........", "........", "....r..."], { r: "#ff2a4a66" }, false),
  "flush2:side": S(["........", "........", "........", "........", ".......R", "...rrrr.", "...rrr.."], { r: "#ff2a4a70", R: "#ff2a4aaa" }, false),
};

/** Animation timing (real time, so fast-forward doesn't strobe decor). `seq` lists frame numbers per step. */
export const ANIMS: Record<string, { ms: number; seq?: number[] }> = {
  plant: { ms: 900 },
  neon: { ms: 70, seq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0] },
  fountain: { ms: 160 },
  counter: { ms: 700 },
  djbooth: { ms: 350 },
  speaker: { ms: 180 },
  backdrop: { ms: 600 },
  dance: { ms: 300 },
  water: { ms: 700 },
  slot: { ms: 450 },
  mop: { ms: 220 },
  "inc:loud": { ms: 250 },
  "inc:cheer": { ms: 200 },
  "inc:fight": { ms: 120 },
  spark: { ms: 90 },
};

/** Light pools baked into the floor: color, radius in tiles, strength 0-1, and an offset toward the object's front. */
export interface LightDef { color: string; r: number; k: number; front?: number }
export const LIGHTS: Record<string, LightDef> = {
  neon: { color: "#ff4fa0", r: 3.6, k: 0.75 },
  fountain: { color: "#6fd8ff", r: 2.8, k: 0.4 },
  counter: { color: "#ffb050", r: 2.4, k: 0.35, front: 0.8 },
  cage: { color: "#ffd070", r: 1.8, k: 0.3, front: 0.8 },
  atm: { color: "#5fc8ff", r: 1.4, k: 0.4, front: 0.8 },
  restroom: { color: "#fff0c0", r: 1.4, k: 0.15, front: 1 },
  kitchen: { color: "#ffb050", r: 2.2, k: 0.3, front: 0.8 },
  stage: { color: "#ffe0a0", r: 3.2, k: 0.45, front: 0.6 },
  djbooth: { color: "#ff4fa0", r: 4, k: 0.55 },
  tiki_torch: { color: "#ffb050", r: 2.2, k: 0.45 },
  med_brazier: { color: "#ff9a40", r: 2.4, k: 0.45 },
  atom_star: { color: "#ff4fa0", r: 3, k: 0.55 },
  rat_marquee: { color: "#ffd23f", r: 2.6, k: 0.45 },
  rock_jukebox: { color: "#3ff2ff", r: 2, k: 0.35 },
  deco_lamp: { color: "#ffe0a0", r: 2.4, k: 0.35 },
  atom_lava: { color: "#ff4fa0", r: 1.4, k: 0.3 },
  slot_cherry: { color: "#ff7ab4", r: 1.5, k: 0.35, front: 0.7 },
  slot_liberty: { color: "#ffc94a", r: 1.5, k: 0.3, front: 0.7 },
  slot_thunder: { color: "#4fe8ff", r: 1.6, k: 0.4, front: 0.7 },
};

// ---------------------------------------------------------------------------------------------------------
// People: paper dolls. A body pose uses region letters; an outfit maps regions to clothing colors; hair,
// hats and accessories are overlays. The compiler composes every look × pose and derives shades
// (uppercase = shade of lowercase) from the look's colors. Frames are 8×15 before the outline.
// Regions: s/S skin, e eyes, u/U torso, c chest centre, a/A upper arms, w/W forearms, x hands,
// l/L hips, g/G shins, f feet.

const HEAD_DOWN = ["........", "..ssss..", ".ssssss.", ".ssssss.", ".sesseS.", ".sssssS.", "..sssS.."];
const HEAD_UP = ["........", "..ssss..", ".ssssss.", ".ssssss.", ".ssssss.", ".sssssS.", "..sssS.."];
const HEAD_SIDE = ["........", "..ssss..", ".ssssss.", ".ssssss.", ".ssssess", ".ssssss.", "..sssS.."];
const TORSO = ["auuccuUA", "auuccuUA", "wuuccuUW", "xlllllLx", ".llllLL."];
const BACK = ["auuuuuUA", "auuuuuUA", "wuuuuuUW", "xlllllLx", ".llllLL."];
const SIDE = ["..uaAU..", "..uaAU..", "..uwWU..", "..lxxL..", "..llLL.."];
const LEGS = {
  stand: [".gg..gG.", ".gg..gG.", ".ff..ff."],
  a: [".gg..gG.", ".gg..ff.", ".ff....."],
  b: [".gg..gG.", ".ff..gG.", ".....ff."],
  side: ["...gG...", "...gG...", "...fff.."],
  sideA: ["..g.GG..", ".gg..GG.", ".f....ff"],
  sideB: ["..G.gg..", ".GG..gg.", ".f....ff"],
  sitDown: [".gg..gG.", ".ff..ff.", "........"],
  sitUp: ["........", "........", "........"],
  sitSide: [".....gG.", ".....ff.", "........"],
};
/** Pose frames: <dir><step>, step 0 stand, 1 and 2 strides; <dir>s seated. "left" is side mirrored. */
export const POSES: Record<string, string[]> = {
  down0: [...HEAD_DOWN, ...TORSO, ...LEGS.stand], down1: [...HEAD_DOWN, ...TORSO, ...LEGS.a], down2: [...HEAD_DOWN, ...TORSO, ...LEGS.b],
  up0: [...HEAD_UP, ...BACK, ...LEGS.stand], up1: [...HEAD_UP, ...BACK, ...LEGS.b], up2: [...HEAD_UP, ...BACK, ...LEGS.a],
  side0: [...HEAD_SIDE, ...SIDE, ...LEGS.side], side1: [...HEAD_SIDE, ...SIDE, ...LEGS.sideA], side2: [...HEAD_SIDE, ...SIDE, ...LEGS.sideB],
  downs: [...HEAD_DOWN, ...TORSO, ...LEGS.sitDown], ups: [...HEAD_UP, ...BACK, ...LEGS.sitUp],
  sides: [...HEAD_SIDE, ...patch(SIDE, { 4: "..llLLL." }), ...LEGS.sitSide],
};
/** Rows a seated figure drops by, so hips meet the stool. */
export const SIT_DROP = 2;

/** Outfits: region → palette letter (t top, j jacket/accent, n bottoms, s skin, w white, f shoes). */
const BASE = { s: "s", S: "S", e: "e", x: "s", f: "f" };
const TEE = { ...BASE, u: "t", U: "T", c: "t", a: "t", A: "T", w: "s", W: "S", l: "n", L: "N", g: "n", G: "N" };
export const OUTFITS: Record<string, { map: Record<string, string>; pattern?: string; over?: string[] }> = {
  tee: { map: TEE },
  shorts: { map: { ...TEE, g: "s", G: "S" } },
  longsleeve: { map: { ...TEE, w: "t", W: "T" } },
  polo: { map: { ...TEE, c: "j" } },
  hawaiian: { map: { ...TEE, g: "s", G: "S" }, pattern: "j" },
  cardigan: { map: { ...TEE, u: "j", U: "J", a: "j", A: "J", w: "j", W: "J" } },
  cardiganSkirt: { map: { ...TEE, u: "j", U: "J", a: "j", A: "J", w: "j", W: "J", g: "s", G: "S" }, over: ["skirt"] },
  blouseSkirt: { map: { ...TEE, g: "s", G: "S" }, over: ["skirt"] },
  blazer: { map: { ...TEE, u: "j", U: "J", a: "j", A: "J", w: "j", W: "J" } },
  dress: { map: { ...TEE, a: "s", A: "S", l: "t", L: "T", g: "s", G: "S" }, over: ["dress"] },
  coverall: { map: { ...TEE, w: "t", W: "T", l: "t", L: "T", g: "t", G: "T" } },
  techvest: { map: { ...TEE, u: "j", U: "J", c: "j", w: "t", W: "T" }, over: ["belt"] },
  waiter: { map: { ...TEE, u: "j", U: "J", c: "w", a: "w", A: "P", w: "w", W: "P" }, over: ["bowtie"] },
};

/** Overlays by facing (down/up/side), placed at row y. Letters are final palette letters. */
type Over = Partial<Record<"down" | "up" | "side", { y: number; rows: string[] }>>;
export const HAIR: Record<string, Over> = {
  short: {
    down: { y: 1, rows: ["..hhhh..", ".hhhhhH.", ".h....H."] },
    up: { y: 1, rows: ["..hhhh..", ".hhhhhH.", ".hhhhhH.", ".hhhhHH.", "..hhH..."] },
    side: { y: 1, rows: ["..hhhh..", ".hhhhhH.", ".hhh....", ".hh.....", ".h......"] },
  },
  crop: {
    down: { y: 1, rows: ["..hhhh..", ".hhhhhH."] },
    up: { y: 1, rows: ["..hhhh..", ".hhhhhH.", ".hhhhHH.", "..hhH..."] },
    side: { y: 1, rows: ["..hhhh..", ".hhhhH..", ".hh....."] },
  },
  quiff: {
    down: { y: 0, rows: ["..hhh...", ".hhhhhH.", ".hhhhhH.", ".h....H."] },
    up: { y: 0, rows: ["..hhh...", ".hhhhhH.", ".hhhhhH.", ".hhhhhH.", ".hhhhHH.", "..hhH..."] },
    side: { y: 0, rows: ["...hhh..", "..hhhhh.", ".hhhhhH.", ".hhh....", ".hh.....", ".h......"] },
  },
  long: {
    down: { y: 1, rows: ["..hhhh..", ".hhhhhH.", ".hh..hH.", ".h....H.", ".h....H.", ".h....H.", ".h....H."] },
    up: { y: 1, rows: ["..hhhh..", ".hhhhhH.", ".hhhhhH.", ".hhhhhH.", ".hhhhhH.", ".hhhhhH.", ".hhhhHH.", "..hhHH.."] },
    side: { y: 1, rows: ["..hhhh..", ".hhhhhH.", ".hhhh...", ".hhh....", ".hhh....", ".hhh....", ".hhH....", "..hH...."] },
  },
  bob: {
    down: { y: 1, rows: ["..hhhh..", ".hhhhhH.", ".hh..hH.", ".h....H.", ".h....H."] },
    up: { y: 1, rows: ["..hhhh..", ".hhhhhH.", ".hhhhhH.", ".hhhhhH.", ".hhhhhH.", ".hhhhHH."] },
    side: { y: 1, rows: ["..hhhh..", ".hhhhhH.", ".hhhhh..", ".hhh....", ".hhh....", ".hh....."] },
  },
  puff: {
    down: { y: 1, rows: ["..hhhh..", ".hhhhhH.", "hhh..hHH", "hh....HH", "h......H"] },
    up: { y: 1, rows: ["..hhhh..", ".hhhhhH.", "hhhhhhHH", "hhhhhhHH", "hhhhhHHH", ".hhhhHH."] },
    side: { y: 1, rows: ["..hhhh..", ".hhhhhH.", "hhhhhhH.", "hhhh....", "hhh.....", ".hh....."] },
  },
  bun: {
    down: { y: 0, rows: ["...hH...", "..hhhh..", ".hhhhhH.", ".h....H."] },
    up: { y: 0, rows: ["...hH...", "..hhhh..", ".hhhhhH.", ".hhhhhH.", ".hhhhhH.", "..hhHH.."] },
    side: { y: 0, rows: [".hh.....", "..hhhh..", ".hhhhhH.", ".hhh....", ".hh.....", ".h......"] },
  },
  bald: {
    down: { y: 3, rows: [".h....H.", ".h....H."] },
    up: { y: 3, rows: [".hhhhhH.", ".hhhhhH.", "..hhH..."] },
    side: { y: 3, rows: [".hh.....", ".hh.....", ".h......"] },
  },
  cap: {
    down: { y: 1, rows: ["..qqqq..", ".qqqqqQ.", ".QQQQQQ.", ".h....H."] },
    up: { y: 1, rows: ["..qqqq..", ".qqqqqQ.", ".qqqqQQ.", ".hhhhHH.", "..hhH..."] },
    side: { y: 1, rows: ["..qqqq..", ".qqqqqQ.", ".hqqqqqq", ".hh.....", ".h......"] },
  },
  sunhat: {
    down: { y: 0, rows: ["..qqqq..", "..jjjJ..", "qqqqqqQQ", ".h....H."] },
    up: { y: 0, rows: ["..qqqq..", "..jjjJ..", "qqqqqqQQ", ".hhhhhH.", ".hhhhHH.", "..hhH..."] },
    side: { y: 0, rows: ["..qqqq..", "..jjjJ..", "qqqqqqqQ", ".hh.....", ".h......"] },
  },
};
export const ACCESSORIES: Record<string, Over> = {
  skirt: { down: { y: 11, rows: [".nnnnNN.", "nnnnnNNN"] }, up: { y: 11, rows: [".nnnnNN.", "nnnnnNNN"] }, side: { y: 11, rows: ["..nnNN..", ".nnnNNN."] } },
  dress: { down: { y: 11, rows: [".ttttTT.", "tttttTTT"] }, up: { y: 11, rows: [".ttttTT.", "tttttTTT"] }, side: { y: 11, rows: ["..ttTT..", ".tttTTT."] } },
  glasses: { down: { y: 4, rows: ["..oeeo.."] }, side: { y: 4, rows: ["...eeo.."] } },
  camera: { down: { y: 8, rows: ["..ee....", "..eo...."] }, up: { y: 7, rows: ["......e.", ".....e.."] }, side: { y: 8, rows: [".....ee.", ".....oe."] } },
  bowtie: { down: { y: 7, rows: ["...yy..."] } },
  belt: { down: { y: 10, rows: [".yqqqqy."] }, up: { y: 10, rows: [".yqqqqy."] }, side: { y: 10, rows: ["..yqqy.."] } },
};

/** A look: outfit + hair + accessories. Colors come from the set's lists, picked per variant. */
export interface Style { o: string; h: string; x?: string[] }
export interface LookSet {
  variants: number;
  /** One torso row shorter (retirees). */
  short?: boolean;
  skin: string[]; hair: string[]; top: string[]; bottom: string[]; accent: string[]; hat: string[]; shoes: string[];
  /** Styles by sex (0, 1). */
  styles: [Style[], Style[]];
}
const SKINS = ["#f5d3b8", "#e6b48f", "#c98f62", "#a86d45", "#7d4c30", "#5a3423"];
const HAIRS = ["#2a1a12", "#4b2e1a", "#7b4a24", "#c8a060", "#161616", "#8a3020", "#3a2418"];
const SHOES = ["#241814", "#1a1a20", "#3a2418"];
export const PEOPLE: Record<string, LookSet> = {
  local: {
    variants: 12, skin: SKINS, hair: HAIRS, shoes: SHOES,
    top: ["#34487a", "#7a3040", "#56703a", "#5c5c64", "#2f6a78", "#9a7434", "#6a4a8a"],
    bottom: ["#2e4a7a", "#26324a", "#2a2a30", "#7a6c50"], accent: ["#e8e0cc", "#c8b890", "#303848"], hat: ["#a8323a", "#2a3a6a", "#1e1e24", "#3a6a3a"],
    styles: [
      [{ o: "tee", h: "short" }, { o: "tee", h: "cap" }, { o: "longsleeve", h: "crop" }, { o: "polo", h: "short" }],
      [{ o: "tee", h: "long" }, { o: "longsleeve", h: "bob" }, { o: "blouseSkirt", h: "bun" }, { o: "polo", h: "long", x: ["glasses"] }],
    ],
  },
  retiree: {
    variants: 12, short: true, skin: SKINS, hair: ["#ecebe6", "#c9c9c9", "#b9b4d8", "#d8d0c0", "#9a9a9a"], shoes: ["#5a4030", "#e8e0d0", "#3a3030"],
    top: ["#a8d8c0", "#d8b0d8", "#f0c0a0", "#b0c8f0", "#f0e0a0", "#e8e8e0"],
    bottom: ["#c8b48c", "#7c7c8c", "#e0d8c4", "#6a5a78"], accent: ["#c8b48c", "#8fa888", "#c89aa0", "#9a9ab0", "#b07a5a"], hat: ["#e8dcc0", "#6a7a9a"],
    styles: [
      [{ o: "cardigan", h: "bald", x: ["glasses"] }, { o: "polo", h: "bald" }, { o: "cardigan", h: "short" }, { o: "polo", h: "cap", x: ["glasses"] }],
      [{ o: "blouseSkirt", h: "puff" }, { o: "cardiganSkirt", h: "puff", x: ["glasses"] }, { o: "blouseSkirt", h: "puff", x: ["glasses"] }, { o: "cardigan", h: "bob" }],
    ],
  },
  tourist: {
    variants: 12, skin: SKINS, hair: HAIRS, shoes: ["#f0ece4", "#3a2a20", "#d04040"],
    top: ["#ff6b5b", "#2ec4b6", "#ffd23d", "#ff9f43", "#48b8f0", "#ff6ab4"],
    bottom: ["#e0cfa0", "#5a9ad0", "#f0ece4", "#8a9a5a"], accent: ["#fff6e0", "#ffe070", "#e04a4a", "#2a6a9a"], hat: ["#e8cf8a", "#f6f1e6", "#ff9ac0", "#e04a4a"],
    styles: [
      [{ o: "hawaiian", h: "sunhat", x: ["camera"] }, { o: "shorts", h: "cap", x: ["camera"] }, { o: "hawaiian", h: "short" }],
      [{ o: "shorts", h: "sunhat", x: ["camera"] }, { o: "shorts", h: "long" }, { o: "hawaiian", h: "bun", x: ["camera"] }],
    ],
  },
  party: {
    variants: 12, skin: SKINS, hair: [...HAIRS, "#f0e0a0", "#e04a8a"], shoes: ["#101014", "#c0283c", "#e8c860"],
    top: ["#e8228a", "#18c89a", "#f8d020", "#8a3cf0", "#f05a20", "#f0f0f0", "#20a0f0"],
    bottom: ["#141418", "#26262e", "#2a3050"], accent: ["#141418", "#1c2238", "#5a1830", "#e8e4dc"], hat: ["#141418"],
    styles: [
      [{ o: "blazer", h: "quiff" }, { o: "tee", h: "short" }, { o: "blazer", h: "short" }, { o: "longsleeve", h: "quiff" }],
      [{ o: "dress", h: "long" }, { o: "dress", h: "bun" }, { o: "dress", h: "bob" }, { o: "dress", h: "long" }],
    ],
  },
  janitor: {
    variants: 6, skin: SKINS, hair: HAIRS, shoes: ["#1a1a20"], top: ["#5f7a8c"], bottom: ["#5f7a8c"], accent: ["#e8e0cc"], hat: ["#34485a"],
    styles: [[{ o: "coverall", h: "cap" }], [{ o: "coverall", h: "cap" }]],
  },
  tech: {
    variants: 6, skin: SKINS, hair: HAIRS, shoes: ["#1a1a20"], top: ["#2e3440"], bottom: ["#2e3440"], accent: ["#f08c1e"], hat: ["#f08c1e"],
    styles: [[{ o: "techvest", h: "cap" }], [{ o: "techvest", h: "cap" }]],
  },
  guard: {
    variants: 6, skin: SKINS, hair: HAIRS, shoes: ["#101014"], top: ["#e8e4dc"], bottom: ["#141418"], accent: ["#141418"], hat: ["#141418"],
    styles: [[{ o: "blazer", h: "crop" }], [{ o: "blazer", h: "bun" }]],
  },
  officer: {
    variants: 6, skin: SKINS, hair: HAIRS, shoes: ["#101014"], top: ["#2a3a6a"], bottom: ["#1e2438"], accent: ["#2a3a6a"], hat: ["#1e2438"],
    styles: [[{ o: "longsleeve", h: "cap", x: ["belt"] }], [{ o: "longsleeve", h: "cap", x: ["belt"] }]],
  },
  medic: {
    variants: 6, skin: SKINS, hair: HAIRS, shoes: ["#1a1a20"], top: ["#eef0ec"], bottom: ["#eef0ec"], accent: ["#c0283c"], hat: ["#c0283c"],
    styles: [[{ o: "coverall", h: "crop", x: ["belt"] }], [{ o: "coverall", h: "bun", x: ["belt"] }]],
  },
  enforcer: {
    variants: 6, skin: SKINS, hair: HAIRS, shoes: ["#101014"], top: ["#3e2a22"], bottom: ["#1e1e24"], accent: ["#141418"], hat: ["#141418"],
    styles: [[{ o: "longsleeve", h: "crop" }], [{ o: "longsleeve", h: "bun" }]],
  },
  operator: {
    variants: 6, skin: SKINS, hair: HAIRS, shoes: ["#1a1a20"], top: ["#7a808c"], bottom: ["#2a2e38"], accent: ["#1c2030"], hat: ["#1c2030"],
    styles: [[{ o: "polo", h: "short", x: ["glasses"] }], [{ o: "polo", h: "bob", x: ["glasses"] }]],
  },
  server: {
    variants: 6, skin: SKINS, hair: HAIRS, shoes: ["#101014"], top: ["#f6f1e6"], bottom: ["#141418"], accent: ["#1c1820"], hat: ["#141418"],
    styles: [[{ o: "waiter", h: "crop" }], [{ o: "waiter", h: "bun" }]],
  },
};
/** Fixed person colors: eyes, lenses, white and its shade, red (bow ties, belts). */
export const PERSON_FIXED: Record<string, string> = { e: "#1e1218", o: "#cfe8f0", w: "#f6f1e6", P: "#c8c0b0", y: "#b0283c" };
