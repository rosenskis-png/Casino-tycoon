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

/** A 16×16 tile grid from a per-pixel letter rule (pure; built once at load). */
const grid = (f: (x: number, y: number) => string): string[] =>
  Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => f(x, y)).join(""));
/** A fixed pseudo-random 0..n-1 per pixel, so textures look hand-scattered but never change. */
const speck = (x: number, y: number, s: number, n: number) => (((x * 73856093) ^ (y * 19349663) ^ (s * 83492791)) >>> 0) % n;
const ring = (x: number, y: number, cx: number, cy: number) => Math.hypot(x - cx, y - cy);

// Desert ground (the lot outside): Vegas sand and dirt, muted for night so neon still owns the brights.
const SAND = { a: "#a0844e", b: "#b39660", c: "#8d7244", d: "#6f5835", e: "#c8ad76" };
const sand = (s: number, extra: (x: number, y: number) => string | null) => grid((x, y) => {
  const e = extra(x, y);
  if (e) return e;
  const r = speck(x, y, s, 23);
  return r === 0 ? "d" : r < 3 ? "c" : r < 6 ? "b" : r === 6 ? "e" : "a";
});

// Room floors (docs/spec/art.md): the general floor keeps the burgundy harlequin; every other purpose has its own.
const ROOM_FLOORS: Record<string, SpriteDef> = {
  // Bar: amber Art Deco lattice.
  bar: S(grid((x, y) => ((x + y) % 8 === 0 || (x - y + 16) % 8 === 0 ? "C" : ((x >> 2) + (y >> 2)) & 1 ? "a" : "b")),
    { a: "#553015", b: "#4a2911", C: "#9a7232" }, false),
  bar2: S(grid((x, y) => ((x + y) % 8 === 0 || (x - y + 16) % 8 === 0 ? (x % 4 === 0 ? "c" : "C") : ((x >> 2) + (y >> 2)) & 1 ? "b" : "a")),
    { a: "#553015", b: "#4a2911", C: "#9a7232", c: "#c29a4a" }, false),
  // Restaurant: midnight navy with small gold florets.
  restaurant: S(grid((x, y) => {
    const d = ring(x, y, 7.5, 7.5);
    return d < 1.2 ? "C" : d < 2.6 && (x === 7 || x === 8 || y === 7 || y === 8) ? "c" : (x + y) % 16 === 0 ? "b" : "a";
  }), { a: "#1c2640", b: "#253257", c: "#5a5a6a", C: "#a48040" }, false),
  restaurant2: S(grid((x, y) => ((x === 0 || x === 15) && (y === 0 || y === 15) ? "C" : (x + y) % 16 === 0 ? "b" : "a")),
    { a: "#1c2640", b: "#253257", C: "#a48040" }, false),
  // High-limit room: royal purple with gold medallions and a diamond between.
  highlimit: S(grid((x, y) => {
    const d = ring(x, y, 7.5, 7.5);
    return d > 5 && d < 6.2 ? "C" : d < 2 ? "c" : d < 3 ? "C" : "a";
  }), { a: "#3a1648", c: "#6e3a80", C: "#b08a3e" }, false),
  highlimit2: S(grid((x, y) => {
    const m = Math.abs(x - 7.5) + Math.abs(y - 7.5);
    return m < 2 ? "C" : m < 3 ? "c" : "b";
  }), { b: "#401a50", c: "#6e3a80", C: "#b08a3e" }, false),
  // Club: black arcade carpet, dim neon zigzags, dots and triangles.
  club: S(grid((x, y) => {
    if (y === 4 + Math.abs((x % 8) - 4) || y === 5 + Math.abs((x % 8) - 4)) return "z";
    if ((x === 12 && y === 12) || (x === 3 && y === 13)) return "x";
    if (y >= 11 && y <= 13 && x >= 7 && x <= 9 && Math.abs(x - 8) <= y - 11) return "q";
    return "a";
  }), { a: "#140c1e", z: "#2a9aa8", x: "#b0357e", q: "#a8892a" }, false),
  club2: S(grid((x, y) => {
    if (ring(x, y, 11, 5) > 2.2 && ring(x, y, 11, 5) < 3.3) return "x";
    if (x === 2 + (y >> 1) && y > 7) return "q";
    if ((x === 4 && y === 3) || (x === 13 && y === 13)) return "z";
    return "a";
  }), { a: "#140c1e", z: "#2a9aa8", x: "#b0357e", q: "#a8892a" }, false),
  // Show room: theater-red velvet with gold scrollwork bands.
  show: S(grid((x, y) => (y === 0 || y === 15 ? "C" : y === 1 || y === 14 ? "c" : (x + (y >> 1)) % 4 === 0 && (y === 7 || y === 8) ? "C" : (x + y) & 1 ? "a" : "b")),
    { a: "#7a1422", b: "#72121f", c: "#4e0c16", C: "#a9843a" }, false),
  // Smoking room: brown-olive tweed, a little burnt.
  smoking: S(grid((x, y) => { const r = speck(x, y, 5, 9); return r < 3 ? "a" : r < 6 ? "b" : r < 8 ? "c" : "d"; }),
    { a: "#4a4630", b: "#554f36", c: "#3f3b28", d: "#5f5a3e" }, false),
  smoking2: S(grid((x, y) => { const d = ring(x, y, 10, 6); if (d < 1.1) return "e"; if (d < 1.8) return "c"; const r = speck(x, y, 9, 9); return r < 3 ? "a" : r < 6 ? "b" : r < 8 ? "c" : "d"; }),
    { a: "#4a4630", b: "#554f36", c: "#3f3b28", d: "#5f5a3e", e: "#231f15" }, false),
  // Enforcement room: bare concrete, seams, cracks, a drain and a stain.
  enforcement: S(grid((x, y) => {
    if (x === 15 || y === 15) return "d";
    if ((x === 4 && y >= 2 && y <= 5) || (x === 5 && y >= 5 && y <= 8) || (x === 6 && y === 9)) return "d";
    const r = speck(x, y, 3, 17);
    return r === 0 ? "d" : r < 4 ? "c" : r < 7 ? "b" : "a";
  }), { a: "#5b5a56", b: "#65635e", c: "#52514d", d: "#3f3e3b" }, false),
  enforcement2: S(grid((x, y) => {
    if (x === 15 || y === 15) return "d";
    if (ring(x, y, 7.5, 7.5) < 1.6) return (x + y) & 1 ? "d" : "k";
    if (ring(x, y, 5, 10) < 3.2 && speck(x, y, 4, 3)) return "e";
    const r = speck(x, y, 7, 17);
    return r === 0 ? "d" : r < 4 ? "c" : r < 7 ? "b" : "a";
  }), { a: "#5b5a56", b: "#65635e", c: "#52514d", d: "#3f3e3b", e: "#4a3a34" }, false),
  // Back office: grey-blue commercial carpet tiles, pile running each way in turn.
  office: S(grid((x, y) => (x === 15 || y === 15 ? "d" : (((x >> 3) + (y >> 3)) & 1 ? x : y) % 2 ? "b" : "a")),
    { a: "#3c4658", b: "#445068", d: "#303848" }, false),
  // The lot outside: sand, with pebbles, a dry scrub or wheel ruts.
  // An entrance from the street: a paved apron with a brass threshold strip.
  entry: S(grid((x, y) => (y === 0 ? "9" : y === 1 ? "7" : x === 0 || x === 15 ? "s" : (x + (y >> 2)) % 4 === 0 && y % 4 === 0 ? "S" : speck(x, y, 11, 7) ? "T" : "t")), undefined, false),
  sand: S(sand(1, () => null), SAND, false),
  sand2: S(sand(2, (x, y) => (ring(x, y, 5, 9) < 1.3 ? "d" : ring(x, y, 11, 4) < 1 ? "c" : null)), SAND, false),
  sand3: S(sand(3, (x, y) => {
    const l = (x === 7 && y > 9) || (x === 6 && y === 11) || (x === 8 && y === 10) || (x === 5 && y === 12) || (x === 9 && y === 12);
    return l ? "g" : x === 7 && y === 9 ? "h" : null;
  }), { ...SAND, g: "#5a5a2e", h: "#7a7a3e" }, false),
};

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
  ...ROOM_FLOORS,
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
  vpoker: { A: "#9ad0b0", E: "#3f8a64", B: "#236b48", D: "#123a26", J: "#f6f1e6", I: "#fff4c8", o: "#8a6424", F: "#e5303d" },
  thunder: { A: "#ac90ff", E: "#7a58d8", B: "#5a36b8", D: "#2a1a62", J: "#4fe8ff", I: "#e8fdff", o: "#246a7a", F: "#ffb81a" },
};

// ---------------------------------------------------------------------------------------------------------
// (M8) Designed slot cabinets (docs/spec/designer.md §8): a body per cabinet type and a topper, recolored per design
// (A top face, E lit edge, B body, D shade from its body color; J, I, o, F from its light color). Rows are the left
// half, mirrored. Compiled per look into the atlas (render/atlas.ts), so frames still blit cached pixels.
const UPRIGHT_BODY = [
  "....DDDD", "..AAAAAA", "..EBBBBB", "..Eyyyyy", "..Eyppyp", "..EyFFyF", "..Eyppyp", "..Eyyyyy", "..E88888", "..EBRRBq",
  "..DDDDDD", "..EBBBBB", "..EBBJJJ", "..EBBJII", "..EBBJJJ", "..EBBBBB", "..KKKKKK",
];
const STEPPER_BODY = [
  "....DDDD", "..AAAAAA", "..E88888", "..E8wwBw", "..E8RRBR", "..E8wwBw", "..E88888", "..EBqRBq", "..DDDDDD", "..EBBBBB",
  "..EBJJJJ", "..EBJIFI", "..EBJJJJ", "..EBBBBB", "..KKKKKK",
];
const SLANT_BODY = [
  "....AAAA", "...AYYYY", "..AYyppy", "..AYyFFy", "..AYyppy", "..EB8888", "..EBqRRB", "..DDDDDD", "..EBBBBB", "..EBBJJJ",
  "..EBBBBB", "..KKKKKK",
];
const TALL_BODY = [
  "....DDDD", "..AAAAAA", "..EBBBBB", "..EYYYYY", "..EyYYYY", "..EyJIJI", "..EyYYYY", "..Eyppyp", "..EyFFyF", "..Eyppyp",
  "..EyFFyF", "..Eyppyp", "..EYYYYY", "..E88888", "..EBRRBq", "..DDDDDD", "..EBBBBB", "..EBBJJJ", "..EBBJII", "..EBBJJJ",
  "..KKKKKK",
];
const GIANT_BODY = [
  "........DDDDDDDD", "....AAAAAAAAAAAA", "...EBBBBBBBBBBBB", "...EYYYYYYYYYYYY", "...EYyyyyyyyyyyy", "...EYyJIJIJIJIJI",
  "...EYyyyyyyyyyyy", "...EYyppppyyyypp", "...EYyppppyyyypp", "...EYyFFFFyyyyFF", "...EYyFFFFyyyyFF", "...EYyppppyyyypp",
  "...EYyppppyyyypp", "...EYyyyyyyyyyyy", "...EYYYYYYYYYYYY", "...E888888888888", "...EBBRRRBBBqqqB", "...DDDDDDDDDDDDD",
  "...EBBBBBBBBBBBB", "...EBBBJJJJJJJJJ", "...EBBBJIIIIFFII", "...EBBBJJJJJJJJJ", "...EBBBBBBBBBBBB", "...KKKKKKKKKKKKK",
];
/** Toppers (left halves), stacked on top of the body. */
const TOPPER_FRONT: Record<string, string[]> = {
  none: [],
  sign: ["....JJJJ", "...JIoIo", "...JIIFF"],
  dome: ["......oI", ".....oII", ".....JJJ"],
  figure: [".......J", "......JI", "....JJIF", ".....JIJ", "....J..J"],
};
const TOPPER_SIDE: Record<string, string[]> = {
  none: [],
  sign: [".....JJJJJ......", ".....IoIoJ......", ".....JJJJJ......"],
  dome: [".......oI.......", "......oIIo......", "......JJJJ......"],
  figure: ["........J.......", ".......JIJ......", "......JIFIJ.....", ".......JIJ......", "......J...J....."],
};
/** Doubles a sprite's pixels (the giant's topper). */
const dbl = (rows: string[]) => rows.flatMap((r) => { const w = [...r].map((c) => c + c).join(""); return [w, w]; });
const pad = (rows: string[], w: number) => rows.map((r) => r.padEnd(w, "."));
/** Back and side views from a body's height: a plain back with vents, and a profile. */
function backOf(front: string[]): string[] {
  return front.map((r, i) => r.replace(/[yYpFwR8qJI]/g, (c) => (c === "8" ? "D" : i % 3 === 1 ? "D" : "B")));
}
function sideOf(h: number, w = 16): string[] {
  const out: string[] = [];
  for (let i = 0; i < h; i++) {
    const top = i === 0, base = i === h - 1, face = i > 1 && i < h * 0.55;
    const mid = w === 32 ? 20 : 9;
    const rowW = w;
    let r = "";
    if (top) r = ".".repeat(w === 32 ? 8 : 4) + "A".repeat(mid) ;
    else if (base) r = ".".repeat(w === 32 ? 8 : 4) + "K".repeat(mid);
    else r = ".".repeat(w === 32 ? (face ? 6 : 8) : face ? 2 : 4) + (face ? "yyE" : "E") + "B".repeat(mid - (face ? 2 : 1) - (w === 32 && face ? 0 : 0)) + "D";
    out.push(r.slice(0, rowW).padEnd(rowW, "."));
  }
  return out;
}
export type CabShape = "slant" | "upright" | "stepper" | "tall" | "giant";
const BODIES: Record<CabShape, string[]> = { slant: SLANT_BODY, upright: UPRIGHT_BODY, stepper: STEPPER_BODY, tall: TALL_BODY, giant: GIANT_BODY };
/** A designed cabinet's rows for a facing (front, back, side = facing left): body plus topper. */
export function cabinetRows(cab: CabShape, topper: string, face: "front" | "back" | "side"): string[] {
  const giant = cab === "giant", W = giant ? 32 : 16;
  const body = mir(BODIES[cab], { E: "D" });
  const top = giant ? dbl(mir(TOPPER_FRONT[topper] ?? [])) : mir(TOPPER_FRONT[topper] ?? []);
  if (face === "front") return pad([...top, ...body], W);
  if (face === "back") return pad([...top, ...backOf(body)], W);
  const sideTop = giant ? dbl(TOPPER_SIDE[topper] ?? []) : TOPPER_SIDE[topper] ?? [];
  return pad([...sideTop, ...sideOf(body.length, W)], W);
}
/** Where the reel windows sit on a designed cabinet's front (below its topper), for the spinning animation. */
export const CAB_REELS: Record<CabShape, { x: number[]; y: number; w: number; h: number }> = {
  upright: { x: [4, 7, 10], y: 4, w: 2, h: 3 }, stepper: { x: [4, 7, 10], y: 3, w: 2, h: 3 }, slant: { x: [4, 6, 9], y: 2, w: 2, h: 3 },
  tall: { x: [4, 7, 10], y: 7, w: 2, h: 5 }, giant: { x: [6, 14, 22], y: 7, w: 4, h: 6 },
};
/** Topper heights, to place the reel windows. */
export const topperHeight = (topper: string, giant: boolean) => (TOPPER_FRONT[topper]?.length ?? 0) * (giant ? 2 : 1);

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

// (M8.5) Bank sign (32×24): a gold marquee on two posts; a lit title strip and three rows of meter digits. The
// renderer writes the design's live meters over it.
const BANK_SIGN = [
  ".999999999999999999999999999999.",
  "98888888888888888888888888888889",
  "98yyyyyyyyyyyyyyyyyyyyyyyyyyyy89",
  "98yqqqqyYYYYYYYYYYYYYYYYYYYYyy89",
  "98yyyyyyyyyyyyyyyyyyyyyyyyyyyy89",
  "98yxxxxyxxxxyxxxxyxxxxyxxxxyyy89",
  "98yxXxxyxXxxyxXxxyxXxxyxXxxyyy89",
  "98yyyyyyyyyyyyyyyyyyyyyyyyyyyy89",
  "98yzzzzyzzzzyzzzzyzzzzyzzzzyyy89",
  "98yyyyyyyyyyyyyyyyyyyyyyyyyyyy89",
  "98888888888888888888888888888889",
  ".777777777777777777777777777777.",
  "......87................87......", "......87................87......", "......87................87......",
  "......87................87......", "......87................87......", "......87................87......",
  "......87................87......", "......87................87......", "......87................87......",
  "......87................87......",
  ".....9876..............9876.....",
  "...99888777..........99888777...",
];

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
  water: S(Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => ((x + 3 * y) % 23 === 0 ? "V" : (y % 5 === 2 && (x + y) % 8 < 3) ? "v" : "U")).join("")), undefined, false),
  "water~1": S(Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => ((x + 3 * y + 7) % 23 === 0 ? "V" : (y % 5 === 2 && (x + y + 4) % 8 < 3) ? "v" : "U")).join("")), undefined, false),
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


// ---------------------------------------------------------------------------------------------------------
// Tables (M7, docs/spec/tables.md): generated per kind and rotation from a few rules, since a table is a big
// flat felt top whose details (the dealer's chip rack, betting spots, the roulette wheel) move with rotation.
// Low: a felt top in a walnut rail, and a 3 px front lip. Keys `tbl_<kind>_<rot>`.

type Grid = string[][];
const TABLE_SIZE: Record<string, [number, number]> = { blackjack: [3, 1], roulette: [4, 1], craps: [5, 2], baccarat: [4, 2], poker: [4, 2] };
const DEALER_SIDE = ["t", "r", "b", "l"] as const;
function tableRows(kind: string, rot: number): string[] {
  const [bw, bh] = TABLE_SIZE[kind], W = (rot & 1 ? bh : bw) * 16, H = (rot & 1 ? bw : bh) * 16;
  const g: Grid = Array.from({ length: H + 3 }, () => Array(W).fill("."));
  const oval = kind === "poker";
  const felt = kind === "baccarat" ? ["u", "U"] : ["f", "F"];
  // Inside the table's outline, and how far from its edge (px).
  const depth = (x: number, y: number): number => {
    if (oval) {
      const nx = (x + 0.5 - W / 2) / (W / 2 - 0.5), ny = (y + 0.5 - H / 2) / (H / 2 - 0.5), d = Math.sqrt(nx * nx + ny * ny);
      return d > 1 ? -1 : Math.floor((1 - d) * Math.min(W, H) / 2);
    }
    if (x < 0 || y < 0 || x >= W || y >= H) return -1;
    const dx = Math.min(x, W - 1 - x), dy = Math.min(y, H - 1 - y);
    if (dx + dy < 3 && dx < 3 && dy < 3) return dx + dy < 2 ? -1 : 0;
    return Math.min(dx, dy);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = depth(x, y);
    if (d < 0) continue;
    const top = y < H / 2, left = x < W / 2;
    if (d < (oval ? 3 : 2)) g[y][x] = oval ? (top ? "3" : "2") : d === 0 ? (top || left ? "5" : "3") : "4";
    else if (d === (oval ? 3 : 2)) g[y][x] = felt[0];
    else g[y][x] = felt[1];
  }
  // The front lip: the rail's side face.
  for (let x = 0; x < W; x++) for (let k = 0; k < 3; k++) {
    let yy = H - 1;
    while (yy >= 0 && g[yy][x] === ".") yy--;
    if (yy >= 0 && yy >= H - 4) g[yy + 1 + k][x] = ["3", "2", "1"][k];
  }
  const put = (x: number, y: number, ch: string) => { if (y >= 0 && y < H && x >= 0 && x < W && g[y][x] !== ".") g[y][x] = ch; };
  const side = DEALER_SIDE[rot & 3], horiz = side === "t" || side === "b";
  // The dealer's chip rack, centered along their side.
  const rack = ["R", "q", "V", "w", "R", "q", "x", "V", "q", "R"];
  const L = horiz ? W : H, len = Math.min(rack.length, L - 12), start = Math.floor((L - len) / 2);
  for (let k = 0; k < len; k++) for (let d = 0; d < 2; d++) {
    const along = start + k, inset = (oval ? 4 : 3) + d, ch = d ? { R: "r", q: "8", V: "v", w: "P", x: "R" }[rack[k]] ?? "k" : rack[k];
    if (side === "t") put(along, inset, ch); else if (side === "b") put(along, H - 1 - inset, ch);
    else if (side === "l") put(inset, along, ch); else put(W - 1 - inset, along, ch);
  }
  // Betting spots on the players' side, one per tile.
  if (kind !== "craps") {
    const n = horiz ? W / 16 : H / 16;
    for (let t = 0; t < n; t++) {
      if (kind === "roulette" && t === (rot === 0 || rot === 1 ? 0 : n - 1)) continue;
      const c = t * 16 + 8, inset = oval ? 6 : 5;
      const ring = kind === "baccarat" ? "8" : "P";
      for (const [a, b] of [[-1, 0], [0, 0], [-2, 1], [1, 1], [-2, 2], [1, 2], [-1, 3], [0, 3]]) {
        if (side === "t") put(c + a, H - 1 - inset - b, ring); else if (side === "b") put(c + a, inset + b, ring);
        else if (side === "l") put(W - 1 - inset - b, c + a, ring); else put(inset + b, c + a, ring);
      }
    }
  }
  if (kind === "craps") {
    // The pass line (a cream loop) and the box in the middle.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = depth(x, y);
      if (d === 6) put(x, y, "p");
    }
    const cx = W >> 1, cy = H >> 1, hw = horiz ? 6 : 3, hh = horiz ? 3 : 6;
    for (let y = cy - hh; y <= cy + hh; y++) for (let x = cx - hw; x <= cx + hw; x++) if (Math.abs(x - cx) === hw || Math.abs(y - cy) === hh) put(x, y, "P");
  }
  if (kind === "roulette") {
    // The layout's grid of numbers, and the wheel at one end.
    const endT = rot === 0 || rot === 1 ? 0 : (horiz ? W : H) / 16 - 1;
    for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
      const t = Math.floor((horiz ? x : y) / 16);
      if (t === endT) continue;
      if ((horiz ? x : y) % 4 === 0 || (horiz ? y : x) % 4 === 0) put(x, y, "P");
      else if (((x >> 2) + (y >> 2)) % 2) put(x, y, "r");
    }
  }
  return g.map((r) => r.join(""));
}
/** The roulette wheel (13 px), drawn over the table's end; frames turn the pockets. */
function wheelRows(frame: number): string[] {
  return Array.from({ length: 13 }, (_, y) => Array.from({ length: 13 }, (_, x) => {
    const dx = x - 6, dy = y - 6, r = Math.sqrt(dx * dx + dy * dy);
    if (r > 6.4) return ".";
    if (r > 5.2) return "4";
    if (r > 3.2) return (Math.floor(((Math.atan2(dy, dx) / Math.PI + 1) * 9) + frame) % 2) ? "R" : "k";
    if (r > 1.2) return "8";
    return "9";
  }).join(""));
}
export const WHEEL_AT: Record<number, "l" | "t" | "r" | "b"> = { 0: "l", 1: "t", 2: "r", 3: "b" };

// Keno and bingo boards: tall lit boards with a cell per number; `BOARD_CELLS` places the lit numbers.
export const BOARD_CELLS: Record<string, { cols: number; rows: number; x0: number; y0: number; dx: number; dy: number }> = {
  keno: { cols: 10, rows: 8, x0: 3, y0: 8, dx: 6, dy: 2 },
  bingo: { cols: 15, rows: 5, x0: 3, y0: 8, dx: 6, dy: 3 },
};
function boardRows(kind: "keno" | "bingo" | "sports", face: "front" | "back" | "side"): string[] {
  const n = kind === "bingo" ? 6 : 4, c = BOARD_CELLS[kind === "sports" ? "keno" : kind], title = kind === "keno" ? "x" : kind === "sports" ? "z" : "q";
  if (face === "side") {
    const H = n * 16 + 14;
    return Array.from({ length: H }, (_, y) => (y < 2 ? "......8888......" : y >= H - 3 ? "......3..3......" : y < H - 5 ? "......YyyM......" : "......8888......"));
  }
  const W = n * 16, H = 30;
  return Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
    const edge = x < 1 || x >= W - 1;
    if (y >= H - 2) return (x < 4 || x >= W - 4) && x > 1 && x < W - 2 ? "3" : ".";
    if (y < 2 || y >= H - 4 || edge) return y === 0 && !edge ? "9" : "8";
    if (face === "back") return (x + y) % 5 ? "3" : "2";
    if (y < 6) return (x + y) % 3 === 0 ? title : "y";
    // M9.5 sportsbook: three game screens (green fields, white lines) under a lit strip.
    if (kind === "sports") {
      const sw = Math.floor((W - 2) / 3), sx = (x - 1) % sw;
      if (sx === 0 || y === 6 || y === H - 5) return "8";
      if (y === 7 || y === H - 6) return "y";
      if (sx === Math.floor(sw / 2)) return "w";
      return (sx >> 2) % 2 ? "F" : "f";
    }
    const cx = x - c.x0, cy = y - c.y0;
    if (cx >= 0 && cy >= 0 && cx % c.dx < 3 && cy % c.dy === 0 && cx / c.dx < c.cols && cy / c.dy < c.rows) return "Y";
    return "y";
  }).join(""));
}

const TABLE_SPRITES: Record<string, SpriteDef> = {};
for (const kind of Object.keys(TABLE_SIZE)) for (let rot = 0; rot < 4; rot++) TABLE_SPRITES[`tbl_${kind}_${rot}`] = S(tableRows(kind, rot), undefined, true);
for (let k = 0; k < 3; k++) TABLE_SPRITES[k ? `wheel~${k}` : "wheel"] = S(wheelRows(k), undefined, false);
for (const kind of ["keno", "bingo", "sports"] as const) {
  TABLE_SPRITES[`${kind}:front`] = S(boardRows(kind, "front"));
  TABLE_SPRITES[`${kind}:back`] = S(boardRows(kind, "back"));
  TABLE_SPRITES[`${kind}:side`] = S(boardRows(kind, "side"));
}

export const OBJECT_SPRITES: Record<string, SpriteDef> = {
  ...ZONE_SPRITES,
  ...TABLE_SPRITES,
  ...DECOR_SPRITES,
  camera: S(CAMERA, { L: "#ff3040" }),
  dumpster: S(DUMPSTER, DUMPSTER_PAL),
  plant: S(PALM), "plant~1": S(shift(PALM, 1, 0, 6)),
  neon: S(NEON, NEON_PAL), "neon~1": S(recolor(NEON, { x: "H" }, 0, 10), NEON_PAL),
  sign: S(SIGN, SIGN_PAL),
  bank_sign: S(BANK_SIGN),
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
  // Tables (M7): cards (face up, red or black, and face down), chips, dice.
  "card:r": S(["www", "wRw", "www", "wwP"]),
  "card:k": S(["www", "wkw", "www", "wwP"]),
  cardback: S(["RRR", "RrR", "RRR", "rrr"]),
  chips: S(["qqq", "888", "RRR", "rrr"]),
  chip: S(["qq", "88"]),
  "die1": S(["wwwww", "wwwww", "wwkww", "wwwww", "wwwww"]),
  "die2": S(["wwwww", "wkwww", "wwwww", "wwwkw", "wwwww"]),
  "die3": S(["wwwww", "wkwww", "wwkww", "wwwkw", "wwwww"]),
  "die4": S(["wwwww", "wkwkw", "wwwww", "wkwkw", "wwwww"]),
  "die5": S(["wwwww", "wkwkw", "wwkww", "wkwkw", "wwwww"]),
  "die6": S(["wwwww", "wkwkw", "wkwkw", "wkwkw", "wwwww"]),
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
  "inc:coin": S([".qq.", "q99q", "q97q", ".qq."]),
  "inc:high": S(["..Z..", "Z.w.Z", ".wZw.", "Z.w.Z", "..Z.."], undefined, false),
  // M9.6: the hotel elevator, brass doors with a lit floor indicator, standing against the wall behind its tile.
  lift: S([
    "..888888888888..", "..899999999998..", "..8yy0yyyy0yy8..", "..899999999998..",
    "..8MMMMnMMMMM8..", "..8MNNMnMNNMM8..", "..8MNNMnMNNMM8..", "..8MNNMnMNNMM8..", "..8MNNMnMNNMM8..",
    "..8MNNMnMNNMM8..", "..8MNNMnMNNMM8..", "..8MNNMnMNNMM8..", "..8MNNMnMNNMM8..", "..8MNNMnMNNMM8..",
    "..8MMMMnMMMMM8..", "..899999999998..",
  ]),
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
  wheel: { ms: 70 },
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
  badge: { down: { y: 8, rows: ["......w.", "......y."] }, side: { y: 8, rows: [".....w..", ".....y.."] } },
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
  highroller: {
    variants: 12, skin: SKINS, hair: HAIRS, shoes: ["#101014", "#3a1a12", "#c8a040"],
    top: ["#141418", "#1c2238", "#4a1422", "#2a2a30", "#e8e4dc"],
    bottom: ["#141418", "#1c2238", "#26262e"], accent: ["#c99a3e", "#e8e4dc", "#6e1624"], hat: ["#141418"],
    styles: [
      [{ o: "blazer", h: "short" }, { o: "blazer", h: "crop", x: ["glasses"] }, { o: "blazer", h: "bald" }],
      [{ o: "dress", h: "bun" }, { o: "dress", h: "long" }, { o: "blazer", h: "bob" }],
    ],
  },
  dealer: {
    variants: 6, skin: SKINS, hair: HAIRS, shoes: ["#101014"], top: ["#7a1a2c"], bottom: ["#141418"], accent: ["#f6f1e6"], hat: ["#141418"],
    styles: [[{ o: "blazer", h: "crop", x: ["bowtie"] }], [{ o: "blazer", h: "bun", x: ["bowtie"] }]],
  },
  pitboss: {
    variants: 6, skin: SKINS, hair: HAIRS, shoes: ["#101014"], top: ["#1c1c22"], bottom: ["#1c1c22"], accent: ["#e8e4dc"], hat: ["#141418"],
    styles: [[{ o: "blazer", h: "short" }], [{ o: "blazer", h: "bob" }]],
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
  // M9.5: families (casual, bright), their children (a row shorter, loud colors, caps), conventioneers (suits and badges).
  family: {
    variants: 12, skin: SKINS, hair: HAIRS, shoes: ["#f0ece4", "#3a2a20", "#5a9ad0"],
    top: ["#5a9ad0", "#e04a4a", "#48b8f0", "#8a9a5a", "#f0ece4", "#ff9f43"], bottom: ["#2a3050", "#5a9ad0", "#e0cfa0"], accent: ["#fff6e0", "#2a6a9a"], hat: ["#e8cf8a", "#2a3050"],
    styles: [[{ o: "polo", h: "short" }, { o: "tee", h: "cap" }, { o: "polo", h: "crop", x: ["glasses"] }], [{ o: "blouseSkirt", h: "bob" }, { o: "tee", h: "long" }, { o: "polo", h: "bun" }]],
  },
  kid: {
    variants: 12, short: true, skin: SKINS, hair: HAIRS, shoes: ["#f0ece4", "#e04a4a", "#48b8f0"],
    top: ["#ffd23d", "#ff6ab4", "#2ec4b6", "#ff6b5b", "#48b8f0", "#8a3cf0"], bottom: ["#5a9ad0", "#2a3050", "#e0cfa0"], accent: ["#fff6e0"], hat: ["#e04a4a", "#48b8f0", "#ffd23d"],
    styles: [[{ o: "tee", h: "cap" }, { o: "tee", h: "short" }], [{ o: "tee", h: "puff" }, { o: "tee", h: "long" }]],
  },
  conventioneer: {
    variants: 12, skin: SKINS, hair: HAIRS, shoes: ["#101014", "#3a2418"],
    top: ["#2a3050", "#3a3e48", "#1c2238", "#5a4a3a"], bottom: ["#26262e", "#2a3050"], accent: ["#e8e4dc", "#5a9ad0"], hat: ["#141418"],
    styles: [[{ o: "blazer", h: "short", x: ["badge"] }, { o: "blazer", h: "bald", x: ["badge", "glasses"] }], [{ o: "blazer", h: "bob", x: ["badge"] }, { o: "blazer", h: "bun", x: ["badge"] }]],
  },
  // M9.6: escorts (short dresses or open shirts, bright; revealing only at pixel scale).
  escort: {
    variants: 8, skin: SKINS, hair: [...HAIRS, "#f0e0a0", "#c02050"], shoes: ["#c0283c", "#101014", "#e8c860"],
    top: ["#e8228a", "#c0283c", "#8a3cf0", "#f0f0f0", "#101014"], bottom: ["#141418", "#26262e"], accent: ["#e8c860", "#f6f1e6"], hat: ["#141418"],
    styles: [[{ o: "tee", h: "quiff" }, { o: "blazer", h: "quiff" }], [{ o: "dress", h: "long" }, { o: "dress", h: "bob" }]],
  },
  // M9: the gaming regulator's inspector (grey suit, glasses), and a whale (white and gold, unmistakable).
  inspector: {
    variants: 6, skin: SKINS, hair: HAIRS, shoes: ["#1a1a20"], top: ["#8a8e98"], bottom: ["#3a3e48"], accent: ["#f6f1e6"], hat: ["#1c2030"],
    styles: [[{ o: "blazer", h: "short", x: ["glasses"] }], [{ o: "blazer", h: "bun", x: ["glasses"] }]],
  },
  whale: {
    variants: 6, skin: SKINS, hair: HAIRS, shoes: ["#c8a040", "#f0ece4"], top: ["#f2eee4", "#e8d8a8"], bottom: ["#f2eee4", "#e8d8a8"], accent: ["#e0b040"], hat: ["#f2eee4"],
    styles: [[{ o: "blazer", h: "bald", x: ["glasses"] }, { o: "blazer", h: "quiff" }], [{ o: "dress", h: "bun", x: ["glasses"] }, { o: "dress", h: "long" }]],
  },
  server: {
    variants: 6, skin: SKINS, hair: HAIRS, shoes: ["#101014"], top: ["#f6f1e6"], bottom: ["#141418"], accent: ["#1c1820"], hat: ["#141418"],
    styles: [[{ o: "waiter", h: "crop" }], [{ o: "waiter", h: "bun" }]],
  },
};
/** Fixed person colors: eyes, lenses, white and its shade, red (bow ties, belts). */
export const PERSON_FIXED: Record<string, string> = { e: "#1e1218", o: "#cfe8f0", w: "#f6f1e6", P: "#c8c0b0", y: "#b0283c" };
