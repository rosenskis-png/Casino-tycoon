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

/** Slot cabinets: one set of rows per facing, recolored per model (C/D cabinet, H topper, J marquee, F reel symbols). */
export const SLOT_ROWS = {
  front: [
    "....HHHHHHHH....", "...HJJJJJJJJH...", "...HHHHHHHHHH...", "..DDDDDDDDDDDD..",
    "..DCCCCCCCCCCD..", "..DkkkkkkkkkkD..", "..DkIIkIIkIIkD..", "..DkFFkFFkFFkD..",
    "..DkIIkIIkIIkD..", "..DkkkkkkkkkkD..", "..DCCCCCCCCCCD..", "..DCyYyCCCCCCD..",
    "..DDDDDDDDDDDD..", "..DCCCCCCCCCCD..", "..DCCCCCCCCCCD..", "..DCCCCCCCCCCD..",
    "..DDDDDDDDDDDD..", "...kkkkkkkkkk...",
  ],
  back: [
    "....HHHHHHHH....", "...HHHHHHHHHH...", "..DDDDDDDDDDDD..", "..DCCCCCCCCCCD..",
    "..DCCCCCCCCCCD..", "..DCDDDDDDDDCD..", "..DCCCCCCCCCCD..", "..DCDDDDDDDDCD..",
    "..DCCCCCCCCCCD..", "..DCDDDDDDDDCD..", "..DCCCCCCCCCCD..", "..DCCCCCCCCCCD..",
    "..DDDDDDDDDDDD..", "..DCCCCCCCCCCD..", "..DCCCCCCCCCCD..", "..DCCCCCCCCCCD..",
    "..DDDDDDDDDDDD..", "...kkkkkkkkkk...",
  ],
  side: [
    "......HHHHH.....", ".....HJJJJH.....", ".....HHHHHH.....", "....kDDDDDDD....",
    "...kkDCCCCCD....", "...kIDCCCCCD....", "...kFDCCCCCD....", "...kIDCCCCCD....",
    "...kFDCCCCCD....", "...kkDCCCCCD....", "....DDCCCCCD....", "...yYDCCCCCD....",
    "....DDDDDDDD....", "....DCCCCCCD....", "....DCCCCCCD....", "....DCCCCCCD....",
    "....DDDDDDDD....", ".....kkkkkk.....",
  ],
};
export const SLOT_COLORS: Record<string, Record<string, string>> = {
  cherry: { C: "#b8325e", D: "#6e1a36", H: "#ff9ec4", J: "#fff0f6", F: "#e5484d", I: "#f4efe4" },
  liberty: { C: "#2f6fb0", D: "#173a63", H: "#ffd36b", J: "#fff6d8", F: "#d4a64a", I: "#f4efe4" },
  thunder: { C: "#6a3fc8", D: "#33206a", H: "#7df9ff", J: "#e8fdff", F: "#ffd23f", I: "#f4efe4" },
};

/** Flat colors for objects at the Wide and Overview zoom levels, where they are baked into the floor image. */
export const OBJECT_MAP_COLORS: Record<string, string> = {
  counter: "#8a5a2a", cage: "#d4a64a", restroom: "#3f7f9a", plant: "#2d6a3e", neon: "#ff4fa0", fountain: "#9fd8f0",
};

export const EXTRA_SPRITES: Record<string, SpriteDef> = {
  stool: tile([
    "................", "................", "................", "................",
    "................", "................", "................", "................",
    "................", "................", "......WWWW......", ".....WYYYYW.....",
    "......WWWW......", ".......kk.......", ".......kk.......", "......kkkk......",
  ]),
  counter: tile([
    "kkkkkkkkkkkkkkkk", "kYYYYYYYYYYYYYYk", "kWWWWWWWWWWWWWWk", "kWVWWWWWWWWVWWWk",
    "kWWWWWWWWWWWWWWk", "kWWWmmWWWWWWWWWk", "kWWWmmWWWWWvvWWk", "kWWWWWWWWWWvvWWk",
    "kWWWWWWWWWWWWWWk", "kWVWWWWWWWVWWWWk", "kWWWWWWWWWWWWWWk", "kYYYYYYYYYYYYYYk",
    "kyyyyyyyyyyyyyyk", "kwwwwwwwwwwwwwwk", "kwwwwwwwwwwwwwwk", "kkkkkkkkkkkkkkkk",
  ]),
  cage: tile([
    "kkkkkkkkkkkkkkkk", "kYYYYYYYYYYYYYYk", "kYkYkYkYkYkYkYkk", "kYkYkYkYkYkYkYkk",
    "kYkYkYkYkYkYkYkk", "kYkYkYkYkYkYkYkk", "kYkYkYkYkYkYkYkk", "kYYYYYYYYYYYYYYk",
    "kWWWWWWWWWWWWWWk", "kWWWWggWWWWWWWWk", "kWWWWggWWWWggWWk", "kWWWWWWWWWWggWWk",
    "kYYYYYYYYYYYYYYk", "kyyyyyyyyyyyyyyk", "kwwwwwwwwwwwwwwk", "kkkkkkkkkkkkkkkk",
  ], { g: "#3c8d5a" }),
  restroom: {
    rows: [
      "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk", "kOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOk", "kOPPPPPPPPPPPPPPPPPPPPPPPPPPPPOk", "kOPOOOOOOOOOOOOOOOOOOOOOOOOOOPOk",
      "kOPOPPPPPPPPPPPPPPPPPPPPPPPPOPOk", "kOPOPOOOOOOOOOOOOOOOOOOOOOOPOPOk", "kOPOPOPPPPPPPPPPPPPPPPPPPPOPOPOk", "kOPOPOPOOOOOOOOOOOOOOOOOOPOPOPOk",
      "kOPOPOPOOOOOOOOOOOOOOOOOOPOPOPOk", "kOPOPOPOOOOOOkkkkkkOOOOOOPOPOPOk", "kOPOPOPOOOOOkIIIIIIkOOOOOPOPOPOk", "kOPOPOPOOOOOkIEIIEIkOOOOOPOPOPOk",
      "kOPOPOPOOOOOkIEIIEIkOOOOOPOPOPOk", "kOPOPOPOOOOOkEEEEEEkOOOOOPOPOPOk", "kOPOPOPOOOOOkIEIIEIkOOOOOPOPOPOk", "kOPOPOPOOOOOkIEIIEIkOOOOOPOPOPOk",
      "kOPOPOPOOOOOOkkkkkkOOOOOOPOPOPOk", "kOPOPOPOOOOOOOOOOOOOOOOOOPOPOPOk", "kOPOPOPOOOOOOOOOOOOOOOOOOPOPOPOk", "kOPOPOPPPPPPPPPPPPPPPPPPPPOPOPOk",
      "kOPOPOOOOOOOOOOOOOOOOOOOOOOPOPOk", "kOPOPPPPPPPPPPPPPPPPPPPPPPPPOPOk", "kOPOOOOOOOOOOOOOOOOOOOOOOOOOOPOk", "kOPPPPPPPPPPPPPPPPPPPPPPPPPPPPOk",
      "kOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOk", "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk", "kQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQk", "kQQQkkkkkkQQQQQQQQQQkkkkkkQQQQQk",
      "kQQQkNNNNkQQQQQQQQQQkNNNNkQQQQQk", "kQQQkNNNNkQQQQQQQQQQkNNNNkQQQQQk", "kQQQkNNNNkQQQQQQQQQQkNNNNkQQQQQk", "kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk",
    ],
    pal: { O: "#3f7f9a", P: "#2f6076", Q: "#5a4636", N: "#8a6a4a", I: "#f4efe4", E: "#2f6076" },
  },
  litter: tile([
    "................", "................", "................", "....II..........",
    "....IE..........", "................", "..........mm....", "..........mM....",
    "................", "................", "......vv........", "......vU........",
    "................", "................", "................", "................",
  ], { I: "#f4efe4", E: "#e5484d" }),
  spill: tile([
    "................", "................", "..........II....", "..........IE....",
    "...vvvv.........", "..vUUUUv........", "..vUUUUUv.......", "...vUUUv........",
    "....vvv...mm....", "..........mM....", "................", "..II............",
    "..EI............", "................", "................", "................",
  ], { I: "#f4efe4", E: "#e5484d" }),
  bubbleBad: tile([
    ".IIIII..", "IIIEIII.", "IIIEIII.", "IIIEIII.",
    "IIIIIII.", "IIIEIII.", ".IIIII..", "..I.....",
  ], { I: "#fff8ec", E: "#e5484d" }),
  bubbleGood: tile([
    ".IIIII..", "IIAIAII.", "IAAAAAI.", "IAAAAAI.",
    "IIAAAII.", "IIIAIII.", ".IIIII..", "..I.....",
  ], { I: "#fff8ec", A: "#3cbf6a" }),
  broken: tile([
    "...HH...", "..HkkH..", "..HkkH..", ".HHkkHH.",
    ".HHkkHH.", "HHHHHHHH", "HHHkkHHH", "HHHHHHHH",
  ], { H: "#ffd23f" }),
};

/** People looks by set: guest types (placeholder looks until the guest design discussion) and staff uniforms. */
export interface LookSet { skin: string[]; hair: string[]; shirt: string[]; pants: string[]; variants: number }
const SKINS = ["#f3d0b0", "#e3b48c", "#c98f5f", "#9a6440", "#6b4228"];
const HAIRS = ["#2a1a12", "#4b2e1a", "#7b4a24", "#c8a060", "#161616", "#8a3020"];
export const PEOPLE: Record<string, LookSet> = {
  local: { skin: SKINS, hair: HAIRS, shirt: ["#2c3e6b", "#6b2c3a", "#556b2f", "#5a5a5a", "#3a5a6b", "#8a6a3a"], pants: ["#2e4a7a", "#3a3a44", "#26262c"], variants: 12 },
  retiree: { skin: SKINS, hair: ["#e8e8e8", "#c9c9c9", "#b9b4d8", "#d8d0c0"], shirt: ["#a8d8c0", "#d8b0d8", "#f0c0a0", "#b0c8f0", "#f0e0a0"], pants: ["#c8b48c", "#8c8c9c", "#e8e0d0"], variants: 12 },
  tourist: { skin: SKINS, hair: HAIRS, shirt: ["#ff6b6b", "#4ecdc4", "#ffd93d", "#ff9f43", "#48dbfb", "#ff78c4"], pants: ["#e8d8b0", "#6bb0d8", "#f0f0f0"], variants: 12 },
  janitor: { skin: SKINS, hair: HAIRS, shirt: ["#7f8794"], pants: ["#5a616c"], variants: 5 },
  tech: { skin: SKINS, hair: HAIRS, shirt: ["#f08c1e"], pants: ["#2e3440"], variants: 5 },
};
