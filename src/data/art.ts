// Art is data (CLAUDE.md): palette-indexed text sprites, compiled into an atlas at load by render/atlas.ts.
// '.' is transparent. Each sprite may use the shared palette plus its own overrides.

export const PALETTE: Record<string, string> = {
  // carpet
  a: "#4c1726", b: "#6a2436", c: "#d4a64a", d: "#35101b",
  // wood, brass, outline
  k: "#120a07", w: "#2b1810", W: "#4a2d1e", V: "#3a2217", y: "#8f6d2c", Y: "#d4a64a",
  // water
  u: "#1f5a80", U: "#2f78a6", v: "#9fd8f0",
  // outdoor ground
  g: "#35592d", G: "#44703a", j: "#2b4a25",
  // unowned land
  z: "#140c09", Z: "#1b110d",
  // people (recolored per look)
  s: "#e3b48c", h: "#4b2e1a", t: "#2c3e6b", n: "#2e4a7a", e: "#1a1a1a",
  // plants and pots
  l: "#2d6a3e", L: "#4f9a5a", r: "#8a4b2a", R: "#b86a3a",
  // neon
  x: "#ff4fa0", X: "#ffd0ea", q: "#2a1e30",
  // stone
  m: "#b8b0a0", M: "#8a8272",
};

export interface SpriteDef { rows: string[]; pal?: Record<string, string> }

const tile = (rows: string[], pal?: Record<string, string>): SpriteDef => ({ rows, pal });

export const TILES: Record<string, SpriteDef> = {
  carpet: tile([
    "caaaaaaabaaaaaac", "aaaaaaababaaaaaa", "aaaaaabaaabaaaaa", "aaaaabaaaaabaaaa",
    "aaaabaaaaaaabaaa", "aaabaaaaaaaaabaa", "aabaaaaaaaaaaaba", "abaaaabacabaaaab",
    "baaaaaacccaaaaaa", "abaaaabacabaaaab", "aabaaaaaaaaaaaba", "aaabaaaaaaaaabaa",
    "aaaabaaaaaaabaaa", "aaaaabaaaaabaaaa", "aaaaaabaaabaaaaa", "caaaaaababaaaaac",
  ]),
  wall: tile([
    "kkkkkkkkkkkkkkkk", "kWWWWWWWWWWWWWWk", "kWVWWWWWWWWWWVWk", "kWWWWWWWWWWWWWWk",
    "kWWWWWVWWWWWWWWk", "kWWWWWWWWWWVWWWk", "kWWWWWWWWWWWWWWk", "kYYYYYYYYYYYYYYk",
    "kyyyyyyyyyyyyyyk", "kwwwwwwwwwwwwwwk", "kwVwwwwwwwVwwwwk", "kwwwwwwwwwwwwwwk",
    "kwwwwwVwwwwwwwwk", "kwwwwwwwwwwwwVwk", "kwwwwwwwwwwwwwwk", "kkkkkkkkkkkkkkkk",
  ]),
  door: tile([
    "kkkkkkkkkkkkkkkk", "kWWWWWWWWWWWWWWk", "kYYYYYYYYYYYYYYk", "kYkkkkkkkkkkkkYk",
    "kYkddddddddddkYk", "kYkdaaaaaaaadkYk", "kYkdaaaaaaaadkYk", "kYkdaaaaaaaadkYk",
    "kYkdaaaaaaaadkYk", "kYkdaaaaaaaadkYk", "kYkdaaaaaaaadkYk", "kYkdaaaaaaaadkYk",
    "kYkdaaaaaaaadkYk", "kYkdaaaaaaaadkYk", "kYkdaaaaaaaadkYk", "kykaaaaaaaaaakyk",
  ]),
  water: tile([
    "uuuuuuuuuuuuuuuu", "uuuUUuuuuuuuuuuu", "uuUvvUuuuuuuuuuu", "uuuuuuuuuuuUUuuu",
    "uuuuuuuuuuUvvUuu", "uuuuuuuuuuuuuuuu", "uuuuuuuuuuuuuuuu", "uuuuuUUuuuuuuuuu",
    "uuuuUvvUuuuuuuuu", "uuuuuuuuuuuuuuuu", "uuuuuuuuuuuuUUuu", "uuuuuuuuuuuUvvUu",
    "uuUUuuuuuuuuuuuu", "uUvvUuuuuuuuuuuu", "uuuuuuuuuuuuuuuu", "uuuuuuuuuuuuuuuu",
  ]),
  grass: tile([
    "gggggggggggggggg", "ggGgggggggggjggg", "gggggggggggggggg", "gggggggGgggggggg",
    "gjgggggggggggggg", "ggggggggggggGggg", "gggggGgggggggggg", "gggggggggjgggggg",
    "gggggggggggggggg", "gGgggggggggggggg", "gggggggggggGgggg", "ggggjggggggggggg",
    "gggggggggggggggg", "gggggggGggggggjg", "ggGggggggggggggg", "gggggggggggggggg",
  ]),
  void: tile([
    "zzzzzzzzzzzzzzzz", "zzzzzzzzzzzzzzzz", "zzzZzzzzzzzzzzzz", "zzzzzzzzzzzzzzzz",
    "zzzzzzzzzzzzzzzz", "zzzzzzzzzzzZzzzz", "zzzzzzzzzzzzzzzz", "zzzzzzzzzzzzzzzz",
    "zzzzzzzzzzzzzzzz", "zzzzzZzzzzzzzzzz", "zzzzzzzzzzzzzzzz", "zzzzzzzzzzzzzzzz",
    "zzzzzzzzzzzzzZzz", "zzzzzzzzzzzzzzzz", "zzZzzzzzzzzzzzzz", "zzzzzzzzzzzzzzzz",
  ]),
};

export const OBJECT_SPRITES: Record<string, SpriteDef> = {
  plant: tile([
    "......L..L......", "...L..LL.LL..L..", "....LLlLLlLLL...", "..LLllLlllLlLL..",
    ".LlllLllLllllL..", "..LlLlllllLlLL..", ".Ll.LllLllL.lL..", "....lLllllL.....",
    "...L..llll..L...", "......l.ll......", "......rrrr......", ".....RRRRRr.....",
    ".....RrrrRr.....", ".....RrrrRr.....", "......rrrr......", "................",
  ]),
  neon: tile([
    "................", ".qqqqqqqqqqqqqq.", ".qxxxxqqxxqxxxq.", ".qxqqqqxqqqqxqq.",
    ".qxqqqqxxxqqxqq.", ".qxqqqqqqxqqxqq.", ".qxxxxqxxqqqxqq.", ".qqqqqqqqqqqqqq.",
    "......qkkq......", "......kyyk......", "......kyyk......", "......kyyk......",
    ".....kyyyyk.....", "....kyyyyyyk....", "....kkkkkkkk....", "................",
  ]),
  fountain: {
    rows: [
      "................................", "..........MMMMMMMMMMMM..........", ".......MMMmmmmmmmmmmmmMMM.......",
      ".....MMmmmmmmmmmmmmmmmmmmMM.....", "....Mmmmmmuuuuuuuuuuuummmmm.....", "...MmmmuuuuuuuuuuuuuuuuummmM....",
      "..MmmuuuuuUUuuuuuuuuUUuuuummM...", "..MmuuuuuUvvUuuuuuuUvvUuuuumM...", ".MmmuuuuuuuuuuuvvuuuuuuuuuummM..",
      ".MmuuuuuuuuuuuvXXvuuuuuuuuuumM..", ".MmuuuUUuuuuuvmmmmvuuuuUUuuumM..", ".MmuuUvvUuuuuummmmmuuuuUvvUumM..",
      ".MmuuuuuuuuuuuvmmvuuuuuuuuuumM..", ".MmuuuuuuuuuuuummuuuuuuuuuuumM..", ".MmuuuuuuuuuuuummuuuuuuuuuuumM..",
      ".MmuuuuuuUUuuuummuuuUUuuuuuumM..", ".MmuuuuuUvvUuuummuuUvvUuuuuumM..", ".MmuuuuuuuuuuuummuuuuuuuuuuumM..",
      ".MmmuuuuuuuuuuuuuuuuuuuuuuummM..", "..MmuuuuuuuuuUUuuuuuuuuuuuumM...", "..MmmuuuuuuuUvvUuuuuuuuuummM....",
      "...MmmmuuuuuuuuuuuuuuuuummmM....", "....MMmmmmuuuuuuuuuuuummmMM.....", "......MMMmmmmmmmmmmmmmmMM.......",
      "........MMMMMMMMMMMMMMM.........",
    ],
    pal: { X: "#ffffff" },
  },
};

/** Person frames, 8×12: down/up/side × stand/step. Left is side mirrored. */
export const PERSON: Record<string, string[]> = {
  down0: ["..hhhh..", ".hhhhhh.", ".hssssh.", "..ssss..", "..ssss..", ".tttttt.", "stttttts", "s.tttt.s", "..nnnn..", "..n..n..", "..n..n..", "..e..e.."],
  down1: ["..hhhh..", ".hhhhhh.", ".hssssh.", "..ssss..", "..ssss..", ".tttttt.", "stttttts", "s.tttt.s", "..nnnn..", "..n..n..", ".n....n.", ".e....e."],
  up0: ["..hhhh..", ".hhhhhh.", ".hhhhhh.", "..hhhh..", "..ssss..", ".tttttt.", "stttttts", "s.tttt.s", "..nnnn..", "..n..n..", "..n..n..", "..e..e.."],
  up1: ["..hhhh..", ".hhhhhh.", ".hhhhhh.", "..hhhh..", "..ssss..", ".tttttt.", "stttttts", "s.tttt.s", "..nnnn..", "..n..n..", ".n....n.", ".e....e."],
  side0: ["..hhhh..", ".hhhhhh.", ".hhhsss.", "..hssss.", "...sss..", "..tttt..", "..tttt..", "..tsst..", "..nnnn..", "...nn...", "...nn...", "...ee..."],
  side1: ["..hhhh..", ".hhhhhh.", ".hhhsss.", "..hssss.", "...sss..", "..tttt..", "..tttt..", "..tsst..", "..nnnn..", "..n..n..", ".n....n.", ".e....e."],
};

/** Recolor sets for test walkers; guests get data-driven looks per type in M2. */
export const LOOKS = {
  skin: ["#f3d0b0", "#e3b48c", "#c98f5f", "#9a6440", "#6b4228"],
  hair: ["#2a1a12", "#4b2e1a", "#7b4a24", "#c8a060", "#161616", "#8a3020", "#d8d0c0"],
  shirt: ["#2c3e6b", "#6b2c3a", "#556b2f", "#ff6b6b", "#4ecdc4", "#ffd93d", "#a8d8c0", "#d8b0d8", "#2a2a30", "#f0f0f0"],
  pants: ["#2e4a7a", "#3a3a44", "#c8b48c", "#26262c", "#8c8c9c"],
};
export const LOOK_VARIANTS = 16;
