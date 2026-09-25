// The slot designer's vocabulary (docs/spec/designer.md): reel layouts and their paylines, themes' symbol sets,
// paytable templates, free spins options, cabinets, toppers, colors and signature calls. A design (SlotDesign)
// is plain data made of these choices; sim/design/ compiles it into exact math.
import type { ThemeId } from "./themes";

// ---------------------------------------------------------------------------------------------------------
// Layouts.

export type LayoutId = "c3" | "r33" | "l20" | "l40" | "w243" | "w1024" | "w4096";
export type WinKind = "classic" | "lines" | "ways";

export interface LayoutDef {
  id: LayoutId;
  name: string;
  /** Side badge on the reel screen ("20 LINES", "1024 WAYS"). */
  badge: string;
  reels: number;
  rows: number;
  win: WinKind;
  /** Lines games: each line's row per reel (0 = top). Classic: the one line through the middle. */
  lines: number[][];
  /** Wins are paytable values × bet / units (lines: the line count; ways: the credits a bet unit is split into). */
  units: number;
  /** Hit rate the layout can reach (any win, features and jackpots included). */
  hit: [number, number];
  /** Research project that unlocks it (docs/spec/research.md), if any. */
  research?: string;
}

const L = (...ls: string[]) => ls.map((s) => [...s].map(Number));

/** The usual 20 lines of a 5×3 video slot. */
const LINES20 = L("11111", "00000", "22222", "01210", "21012", "00100", "22122", "12221", "10001", "10101",
  "12121", "01010", "21212", "11011", "11211", "00200", "22022", "02220", "20002", "02020");
/** 40 lines on 5×4: rows, steps and zigzags, none sharing its first three positions with another. */
const LINES40 = L("11111", "22222", "00000", "33333", "01210", "12321", "21012", "32123", "00100", "33233",
  "11211", "22122", "10001", "23332", "01110", "32223", "12221", "21112", "00010", "33323",
  "10101", "23232", "01010", "32323", "11011", "22322", "12121", "21212", "00110", "33223",
  "01000", "32333", "11001", "22332", "10000", "23333", "11101", "22232", "01001", "32332");

export const LAYOUTS: Record<LayoutId, LayoutDef> = {
  c3: { id: "c3", name: "Classic 3-reel", badge: "1 LINE", reels: 3, rows: 1, win: "classic", lines: [[0, 0, 0]], units: 1, hit: [0.05, 0.2] },
  r33: { id: "r33", name: "3×3, 5 lines", badge: "5 LINES", reels: 3, rows: 3, win: "lines", lines: L("111", "000", "222", "012", "210"), units: 5, hit: [0.1, 0.3] },
  l20: { id: "l20", name: "5×3, 20 lines", badge: "20 LINES", reels: 5, rows: 3, win: "lines", lines: LINES20, units: 20, hit: [0.2, 0.45], research: "video" },
  l40: { id: "l40", name: "5×4, 40 lines", badge: "40 LINES", reels: 5, rows: 4, win: "lines", lines: LINES40, units: 40, hit: [0.25, 0.5], research: "video" },
  w243: { id: "w243", name: "5×3, 243 ways", badge: "243 WAYS", reels: 5, rows: 3, win: "ways", lines: [], units: 25, hit: [0.25, 0.5], research: "ways" },
  w1024: { id: "w1024", name: "5×4, 1024 ways", badge: "1024 WAYS", reels: 5, rows: 4, win: "ways", lines: [], units: 40, hit: [0.3, 0.55], research: "ways" },
  w4096: { id: "w4096", name: "6×4, 4096 ways", badge: "4096 WAYS", reels: 6, rows: 4, win: "ways", lines: [], units: 60, hit: [0.35, 0.6], research: "ways" },
};
export const LAYOUT_IDS = Object.keys(LAYOUTS) as LayoutId[];

// ---------------------------------------------------------------------------------------------------------
// Symbols. A symbol is a string: an emoji, or a token starting with "#" that the play screen draws itself
// (card ranks "#A" … "#9", sevens "#7r" "#7b" "#7w", bars "#bar1" … "#bar3", "#wild", "#blank").

/** Symbol indexes in a video game: 0-3 highs (0 = the hero), 4-8 lows, then wild, scatter, jackpot. */
export const WILD = 9, SCATTER = 10, JACKPOT = 11;
/**
 * (M8.5) Feature symbols: a hold & spin orb (it shows a value), the bonus symbols that trigger a pick, a wheel and
 * an offer, and a collector's piece. Codes 12 and 13 are wilds with multipliers (sim/design/grid.ts).
 */
export const ORB = 14, BONUS_PICK = 15, BONUS_WHEEL = 16, BONUS_OFFER = 17, PIECE = 18;
export const PAYING = 9;
/** Classic reels: wild, top, three bars (3, 2, 1), cherry, blank. */
export const C_WILD = 0, C_TOP = 1, C_BAR3 = 2, C_BAR2 = 3, C_BAR1 = 4, C_CHERRY = 5, C_BLANK = 6;

export interface SymbolSet {
  name: string;
  /** Highs, hero first. */
  highs: string[];
  /** Lows, best first (5). */
  lows: string[];
  wild: string;
  scatter: string;
  jackpot: string;
  /** Classic reels: top symbol, bars (3, 2, 1) and the cherry. */
  classic: [string, string, string, string, string];
}

export type SlotTheme = ThemeId | "classic";

export interface SlotThemeDef {
  id: SlotTheme;
  name: string;
  sets: [SymbolSet, SymbolSet];
  /** Play screen: background gradient, frame accent, logo colors (fill, outline). */
  bg: [string, string];
  accent: string;
  logo: [string, string];
  /** Default signature call (data/sounds.ts). */
  call: string;
  /** Bright and cartoonish: draws children's eyes (docs/spec/designer.md §2). */
  kiddy?: number;
}

const CARDS = ["#A", "#K", "#Q", "#J", "#10"];
const set = (name: string, highs: string[], lows: string[], wild: string, scatter: string, jackpot: string, classic: string[]): SymbolSet =>
  ({ name, highs, lows, wild, scatter, jackpot, classic: classic as SymbolSet["classic"] });

export const SLOT_THEMES: Record<SlotTheme, SlotThemeDef> = {
  classic: {
    id: "classic", name: "Classic Vegas", bg: ["#20103a", "#07040f"], accent: "#e8c35a", logo: ["#ffd54a", "#8a1020"], call: "call_classic",
    sets: [
      set("Sevens & Bars", ["#7r", "#7b", "#7w", "🔔"], ["#bar3", "#bar2", "#bar1", "🍒", "🍋"], "#wild", "⭐", "💎", ["#7r", "#bar3", "#bar2", "#bar1", "🍒"]),
      set("Fruit Cocktail", ["🍒", "🍉", "🍇", "🔔"], ["🍓", "🍑", "🍊", "🍋", "🍐"], "#wild", "⭐", "💰", ["🔔", "🍉", "🍇", "🍊", "🍒"]),
    ],
  },
  dragon: {
    id: "dragon", name: "Lucky Dragon", bg: ["#7a0a0a", "#2a0202"], accent: "#ffcc33", logo: ["#ffd700", "#8b0000"], call: "call_dragon",
    sets: [
      set("Golden Dragon", ["🐉", "🐅", "🐢", "🏮"], CARDS, "#wild", "🧧", "🪙", ["🐉", "🏮", "🧧", "🎋", "🍊"]),
      set("Fortune Coins", ["🪙", "🐸", "🧧", "🎋"], CARDS, "#wild", "🏮", "🐉", ["🪙", "🧧", "🎋", "🏮", "🍑"]),
    ],
  },
  goldrush: {
    id: "goldrush", name: "Gold Rush", bg: ["#6b2d0a", "#1f0a02"], accent: "#e8a33a", logo: ["#ffcf5a", "#5a2a00"], call: "call_goldrush", kiddy: 0.2,
    sets: [
      set("Stampede", ["🦬", "🦅", "🐺", "🐆"], ["#A", "#K", "#Q", "#J", "#9"], "#wild", "🪙", "💰", ["🦬", "🦅", "🐺", "🐆", "🌵"]),
      set("Prospector", ["🤠", "⛏️", "🧨", "🐎"], CARDS, "#wild", "🪙", "💰", ["🤠", "⛏️", "🧨", "🐎", "🌵"]),
    ],
  },
  egypt: {
    id: "egypt", name: "Ancient Egypt", bg: ["#1a3a6a", "#060f22"], accent: "#e8c35a", logo: ["#ffe08a", "#1a2a6a"], call: "call_egypt",
    sets: [
      set("Pharaoh", ["👑", "🐍", "🪲", "🐈‍⬛"], CARDS, "#wild", "🔺", "👁️", ["👑", "🐍", "🪲", "🐈‍⬛", "🌿"]),
      set("Tomb", ["⚱️", "📜", "🔺", "🦅"], CARDS, "#wild", "👁️", "💰", ["⚱️", "📜", "🔺", "🦅", "🌿"]),
    ],
  },
  tiki: {
    id: "tiki", name: "Tropical Tiki", bg: ["#0a5a4a", "#022019"], accent: "#ff9a3a", logo: ["#ffb84a", "#6a1a00"], call: "call_tiki", kiddy: 0.5,
    sets: [
      set("Volcano", ["🌋", "🗿", "🌺", "🍍"], CARDS, "#wild", "🔥", "💰", ["🌋", "🗿", "🌺", "🍍", "🥥"]),
      set("Reef", ["🐙", "🐠", "🐚", "🦀"], CARDS, "#wild", "🫧", "💰", ["🐙", "🐠", "🐚", "🦀", "🌴"]),
    ],
  },
  pirate: {
    id: "pirate", name: "Pirate Cove", bg: ["#10304a", "#030a14"], accent: "#d8b060", logo: ["#ffd070", "#301800"], call: "call_pirate", kiddy: 0.5,
    sets: [
      set("Treasure", ["🏴‍☠️", "🦜", "🗺️", "⚓"], CARDS, "#wild", "💰", "💎", ["🏴‍☠️", "🦜", "🗺️", "⚓", "🍺"]),
      set("Kraken", ["🦑", "🧭", "🦈", "🪝"], CARDS, "#wild", "🗝️", "💎", ["🦑", "🧭", "🦈", "🪝", "🍺"]),
    ],
  },
  rome: {
    id: "rome", name: "Ancient Rome", bg: ["#5a0a1a", "#1a0206"], accent: "#e8c35a", logo: ["#ffe08a", "#5a0010"], call: "call_rome",
    sets: [
      set("Colosseum", ["🏛️", "🦁", "🗡️", "🏺"], CARDS, "#wild", "🛡️", "👑", ["🏛️", "🦁", "🗡️", "🏺", "🍇"]),
      set("Olympus", ["⚡", "🦅", "🍇", "🏺"], CARDS, "#wild", "🌩️", "👑", ["⚡", "🦅", "🍇", "🏺", "🫒"]),
    ],
  },
  medieval: {
    id: "medieval", name: "Medieval", bg: ["#2a2a3a", "#0a0a12"], accent: "#b0b8c8", logo: ["#e0e6f0", "#2a1a3a"], call: "call_medieval", kiddy: 0.3,
    sets: [
      set("Castle", ["🏰", "🐉", "🛡️", "⚔️"], CARDS, "#wild", "📯", "👑", ["🏰", "🐉", "🛡️", "⚔️", "🍷"]),
      set("Wizard", ["🧙", "🔮", "🦉", "📜"], CARDS, "#wild", "✨", "👑", ["🧙", "🔮", "🦉", "📜", "🍷"]),
    ],
  },
  rock: {
    id: "rock", name: "Rock & Roll", bg: ["#3a0a4a", "#0e0214"], accent: "#ff3a8a", logo: ["#ff5ab0", "#1a0020"], call: "call_rock", kiddy: 0.2,
    sets: [
      set("Stadium", ["🎸", "🎤", "🥁", "🎹"], CARDS, "#wild", "⭐", "💿", ["🎸", "🎤", "🥁", "🎹", "🎵"]),
      set("Vinyl", ["💿", "🎧", "🕶️", "🎷"], CARDS, "#wild", "⭐", "🎸", ["💿", "🎧", "🕶️", "🎷", "🎵"]),
    ],
  },
  deco: {
    id: "deco", name: "Gilded Deco", bg: ["#0a2a2a", "#020a0a"], accent: "#e8c35a", logo: ["#f6e2a0", "#0a1a1a"], call: "call_deco",
    sets: [
      set("Gatsby", ["🍸", "💎", "🎩", "🕰️"], CARDS, "#wild", "🥂", "💎", ["🍸", "💎", "🎩", "🕰️", "🍒"]),
      set("Jazz Age", ["🎺", "🎷", "🌟", "🥂"], CARDS, "#wild", "🎟️", "💎", ["🎺", "🎷", "🌟", "🥂", "🍒"]),
    ],
  },
  luxe: {
    id: "luxe", name: "Modern Luxe", bg: ["#1a1a1e", "#050507"], accent: "#e0e0e8", logo: ["#ffffff", "#303040"], call: "call_luxe",
    sets: [
      set("Jet Set", ["🛥️", "🏎️", "⌚", "💍"], CARDS, "#wild", "💎", "🗝️", ["🛥️", "🏎️", "⌚", "💍", "🥂"]),
      set("Penthouse", ["🍾", "💎", "🗝️", "🥂"], CARDS, "#wild", "🌃", "💍", ["🍾", "💎", "🗝️", "🥂", "🍓"]),
    ],
  },
  riviera: {
    id: "riviera", name: "Riviera", bg: ["#0a4a8a", "#021a3a"], accent: "#ffe07a", logo: ["#fff0a0", "#0a2a5a"], call: "call_riviera",
    sets: [
      set("Côte", ["⛵", "🌞", "🍾", "🍋"], CARDS, "#wild", "🐚", "💎", ["⛵", "🌞", "🍾", "🍋", "🍊"]),
      set("Dolce Vita", ["🛵", "🍨", "🌊", "🐚"], CARDS, "#wild", "🌞", "💎", ["🛵", "🍨", "🌊", "🐚", "🍋"]),
    ],
  },
  ratpack: {
    id: "ratpack", name: "Rat Pack Lounge", bg: ["#3a0a0a", "#120202"], accent: "#e8c35a", logo: ["#ffd070", "#200000"], call: "call_ratpack",
    sets: [
      set("Crooner", ["🎙️", "🍸", "🎲", "🃏"], CARDS, "#wild", "⭐", "💰", ["🎙️", "🍸", "🎲", "🃏", "🍒"]),
      set("Showgirl", ["💃", "🎩", "🥃", "🌹"], CARDS, "#wild", "⭐", "💰", ["💃", "🎩", "🥃", "🌹", "🍒"]),
    ],
  },
  atomic: {
    id: "atomic", name: "Neon Atomic", bg: ["#0a1a4a", "#020616"], accent: "#3af0ff", logo: ["#7af8ff", "#1a004a"], call: "call_atomic", kiddy: 0.6,
    sets: [
      set("Space Age", ["🚀", "🪐", "👽", "🛸"], CARDS, "#wild", "⭐", "☄️", ["🚀", "🪐", "👽", "🛸", "🌙"]),
      set("Robot", ["🤖", "⚛️", "💡", "🔭"], CARDS, "#wild", "⭐", "☄️", ["🤖", "⚛️", "💡", "🔭", "🌙"]),
    ],
  },
};
export const SLOT_THEME_IDS = Object.keys(SLOT_THEMES) as SlotTheme[];

// ---------------------------------------------------------------------------------------------------------
// Paytables. Video: 3/4/5/6-of-a-kind per symbol (index as above), in credits per line (lines) or per unit (ways).
// The hero's top pay scales with volatility. The 3×3 game pays 3 of a kind only. Classic: per coin.

export const VIDEO_PAYS: number[][] = [
  [40, 150, 750, 1500], [25, 75, 300, 600], [20, 50, 250, 500], [15, 40, 200, 400],
  [10, 25, 150, 300], [10, 20, 125, 250], [5, 15, 100, 200], [5, 10, 75, 150], [5, 10, 50, 100],
];
export const R33_PAYS = [100, 50, 25, 15, 10, 8, 6, 5, 4];
/** Hero 5-of-a-kind (video), 3 wilds (3×3) and 3 wilds (classic) at volatility 0 and 1 (scaled between). */
export const TOP_PAY = { video: [150, 12000], r33: [60, 6000], classic: [200, 25000] };
/** Classic, per coin: 3 tops, 3 of each bar (3, 2, 1), any 3 bars, cherries (1, 2, 3). */
export const CLASSIC_PAYS = { top: 100, bars: [40, 25, 10], anyBar: 5, cherry: [2, 5, 10] };
/** Scatters (3, 4, 5, 6 of them) pay this many times the whole bet. */
export const SCATTER_PAYS = [2, 5, 20, 50];

// ---------------------------------------------------------------------------------------------------------
// Free spins.

/** Free spins for 3 / 4 / 5 (/ 6) scatters. */
export const FS_COUNTS: { name: string; n: number[] }[] = [
  { name: "Short (5 / 8 / 12)", n: [5, 8, 12, 15] },
  { name: "Standard (8 / 15 / 20)", n: [8, 15, 20, 25] },
  { name: "Long (12 / 18 / 25)", n: [12, 18, 25, 30] },
  { name: "Marathon (20 / 25 / 30)", n: [20, 25, 30, 40] },
];
export type FsEnh = "none" | "x2" | "x3" | "rand" | "wildx" | "extra" | "expand";
export interface FsEnhDef {
  id: FsEnh;
  name: string;
  desc: string;
  /** Wins multiplied (fixed), or a random multiplier per spin (value: weight). */
  mult?: number;
  randMult?: [number, number][];
  /** How much richer a free spin is than a base spin, before multipliers. */
  uplift: number;
  /** Hit rate of a free spin relative to a base spin. */
  hitUp: number;
  /** Share of a free spin's return in big wins, relative to the base game's. */
  volUp: number;
  research?: string;
}
export const FS_ENH: Record<FsEnh, FsEnhDef> = {
  none: { id: "none", name: "Plain", desc: "Free spins play like the base game.", uplift: 1, hitUp: 1, volUp: 1 },
  x2: { id: "x2", name: "All wins ×2", desc: "Every free spin win doubled.", mult: 2, uplift: 1, hitUp: 1, volUp: 1 },
  x3: { id: "x3", name: "All wins ×3", desc: "Every free spin win tripled.", mult: 3, uplift: 1, hitUp: 1, volUp: 1 },
  rand: { id: "rand", name: "Random multiplier", desc: "Each free spin rolls a ×2 to ×5 multiplier.", randMult: [[2, 0.4], [3, 0.3], [4, 0.2], [5, 0.1]], uplift: 1, hitUp: 1, volUp: 1.1 },
  wildx: { id: "wildx", name: "Multiplier wilds", desc: "Wilds on the middle reels carry ×2 or ×3; they multiply each other.", uplift: 2.2, hitUp: 1.15, volUp: 1.3 },
  extra: { id: "extra", name: "Extra wilds", desc: "More wilds land during free spins.", uplift: 1.6, hitUp: 1.35, volUp: 1 },
  expand: { id: "expand", name: "Expanding symbol", desc: "One symbol is chosen; when it lands it fills its reels and pays anywhere.", uplift: 2, hitUp: 1, volUp: 1.6 },
};
export const FS_ENH_IDS = Object.keys(FS_ENH) as FsEnh[];
/** Share of free-spin triggers by scatter count (3, 4, 5, 6). */
export const SCATTER_SPLIT: Record<number, number[]> = { 3: [1], 5: [0.84, 0.13, 0.03], 6: [0.8, 0.15, 0.04, 0.01] };
/** Chance a free spin retriggers (when retriggers are on), at most this share of the spins it awards. */
export const RETRIGGER = { chance: 0.02, cap: 0.4 };

// ---------------------------------------------------------------------------------------------------------
// Jackpot levels (M8: fixed amounts, a multiple of the bet; progressives are M8.5).

export const JACKPOT_NAMES = ["MINI", "MINOR", "MAJOR", "GRAND"];
/** A level's name: n levels take the top n names (one level is the Grand); a classic's one level is the Jackpot. */
export const levelName = (n: number, i: number, classic = false) => (classic ? "JACKPOT" : JACKPOT_NAMES[4 - n + i]);
export const levelColor = (n: number, i: number) => JACKPOT_COLORS[4 - n + i];
export const JACKPOT_COLORS = ["#c060ff", "#3a8aff", "#3ad060", "#ff3a3a"];
/** Defaults per level: amount (× bet) and 1 in N spins. */
export const JACKPOT_DEFAULTS: { x: number; every: number }[] = [{ x: 10, every: 400 }, { x: 50, every: 3000 }, { x: 250, every: 40000 }, { x: 2000, every: 1e6 }];

// ---------------------------------------------------------------------------------------------------------
// Cabinets, toppers, colors.

export type CabType = "slant" | "upright" | "stepper" | "tall" | "giant";
export interface CabinetDef {
  id: CabType;
  name: string;
  /** Object kind (data/objects.ts). */
  kind: string;
  cost: number;
  /** Energy from lights and sound, relative to an upright. */
  loud: number;
  desc: string;
  research?: string;
}
export const CABINETS: Record<CabType, CabinetDef> = {
  slant: { id: "slant", name: "Slant-top", kind: "slot_slant", cost: 250, loud: 0.7, desc: "Low and seated. Doesn't block sight lines; a touch of class." },
  upright: { id: "upright", name: "Upright", kind: "slot_upright", cost: 200, loud: 1, desc: "The standard video cabinet." },
  stepper: { id: "stepper", name: "Stepper", kind: "slot_stepper", cost: 225, loud: 0.9, desc: "Mechanical reels behind glass, for classics." },
  tall: { id: "tall", name: "Tall portrait", kind: "slot_tall", cost: 400, loud: 1.3, desc: "A curved portrait screen, seen from farther.", research: "cabinets" },
  giant: { id: "giant", name: "Giant", kind: "slot_giant", cost: 1500, loud: 2.2, desc: "A 2×2 attraction, seen across the floor.", research: "cabinets" },
};
export const CAB_IDS = Object.keys(CABINETS) as CabType[];

export type TopperId = "none" | "sign" | "dome" | "figure" | "wheel";
export const TOPPERS: Record<TopperId, { name: string; cost: number }> = {
  none: { name: "None", cost: 0 }, sign: { name: "Lit sign", cost: 50 }, dome: { name: "Dome light", cost: 75 }, figure: { name: "Theme figure", cost: 150 },
  wheel: { name: "Topper wheel", cost: 300 },
};
export const TOPPER_IDS = Object.keys(TOPPERS) as TopperId[];

/** Cabinet body ramps: top face, lit edge, body, shade. */
export const BODY_COLORS: { name: string; ramp: [string, string, string, string] }[] = [
  { name: "Ruby", ramp: ["#f08a8a", "#d05252", "#a8323a", "#5a1418"] },
  { name: "Rose", ramp: ["#f08aaa", "#d8527e", "#b8325e", "#6e1a36"] },
  { name: "Amber", ramp: ["#ffc07a", "#e08a3a", "#b8621a", "#5a2e0a"] },
  { name: "Gold", ramp: ["#ffe08a", "#e0b040", "#b08420", "#5a420e"] },
  { name: "Emerald", ramp: ["#8ae0a8", "#3fa864", "#236b48", "#123a26"] },
  { name: "Teal", ramp: ["#8ae0e0", "#3aa8b0", "#1a7a84", "#0a3a40"] },
  { name: "Sapphire", ramp: ["#8cc0f0", "#4f8fd0", "#2f6fb0", "#173a63"] },
  { name: "Violet", ramp: ["#ac90ff", "#7a58d8", "#5a36b8", "#2a1a62"] },
  { name: "Onyx", ramp: ["#6a6a78", "#40404c", "#26262e", "#101014"] },
  { name: "Silver", ramp: ["#e8ecf4", "#b8c0cc", "#8a92a0", "#4a505a"] },
  { name: "Copper", ramp: ["#f0b08a", "#c87a52", "#9a5232", "#4a2414"] },
  { name: "Jade", ramp: ["#b0e08a", "#74b04a", "#4a8a2a", "#224a12"] },
];
/** Light colors (trim, lamps, LED edge, the topper): main, bright, dim. */
export const LIGHT_COLORS: { name: string; c: [string, string, string] }[] = [
  { name: "Gold", c: ["#ffc94a", "#fff6d8", "#8a6a24"] },
  { name: "White", c: ["#f0f4ff", "#ffffff", "#7a8090"] },
  { name: "Cyan", c: ["#4fe8ff", "#e8fdff", "#246a7a"] },
  { name: "Pink", c: ["#ff7ab4", "#fff0f6", "#9a3862"] },
  { name: "Green", c: ["#5aff8a", "#e8ffee", "#2a7a3a"] },
  { name: "Red", c: ["#ff4a4a", "#ffe0e0", "#8a1a1a"] },
  { name: "Blue", c: ["#4a7aff", "#e0e8ff", "#1a2a8a"] },
  { name: "Violet", c: ["#c07aff", "#f4e8ff", "#5a2a8a"] },
];

// ---------------------------------------------------------------------------------------------------------
// Show.

export const SPEEDS = [{ name: "Relaxed", spin: 3.5 }, { name: "Standard", spin: 3 }, { name: "Fast", spin: 2.5 }];
export const ROLLUPS = [{ name: "Quick", s: 0.6 }, { name: "Standard", s: 1.2 }, { name: "Long", s: 2.4 }];
export const CELEBRATE = [{ name: "None", feel: 0.12 }, { name: "Modest", feel: 0.3 }, { name: "Full", feel: 0.6 }];
/** Signature calls (sound ids in data/sounds.ts). */
export const CALLS: Record<string, string> = {
  call_classic: "Bell ring", call_dragon: "Gong", call_goldrush: "Stampede", call_egypt: "Desert wind", call_tiki: "Tiki drums",
  call_pirate: "Cannon", call_rome: "Fanfare", call_medieval: "Horn", call_rock: "Power chord", call_deco: "Big band",
  call_luxe: "Crystal chime", call_riviera: "Mandolin", call_ratpack: "Brass stab", call_atomic: "Theremin",
};

// ---------------------------------------------------------------------------------------------------------
// The design.

export interface FreeSpins {
  /** Triggers once in this many spins (on average). */
  every: number;
  /** FS_COUNTS index. */
  count: number;
  retrigger: boolean;
  enh: FsEnh;
}

// ---------------------------------------------------------------------------------------------------------
// (M8.5) Bonus features (docs/spec/designer.md §2). Each is exact by construction (sim/design/compile.ts).

/** Hold & spin: orbs lock, three respins that reset on every new orb; `land`: how readily orbs land; `values`: the orb value spread. */
export interface HoldSpin { every: number; land: number; values: number }
/** Pick: pick until "collect" (credits), or match three (jackpots only: it comes as often as its jackpots). */
export interface Pick { every: number; mode: "collect" | "match"; size: number }
/** Wheel: its segments' spread; on the cabinet when the topper is a wheel. */
export interface Wheel { every: number; spread: number }
/** Cascades (base game): winning symbols vanish and new ones drop; `chain`: how readily a drop wins again. */
export interface Cascade { chain: number; climb: boolean }
/** Collector: pieces land on some spins and fill a meter kept on the machine; a full meter pays its prize. */
export interface Collector { size: number; every: number; prize: "credits" | "super"; x: number }
/** Offer: up to four offers, take it or leave it; every offer is worth what refusing it is. */
export interface Offer { every: number; size: number }
/** Mystery (base game): a random multiplier on some wins, or a storm of extra wilds on some spins. */
export interface Mystery { kind: "mult" | "wilds"; every: number }

export type FeatureId = "fs" | "hns" | "pick" | "wheel" | "cascade" | "collect" | "offer" | "mystery";
export const FEATURE_NAMES: Record<FeatureId, string> = {
  fs: "Free spins", hns: "Hold & spin", pick: "Pick", wheel: "Wheel", cascade: "Cascades", collect: "Collector", offer: "Offer", mystery: "Mystery",
};
/** Research each feature needs (data/research.ts). */
export const FEATURE_RESEARCH: Record<FeatureId, string> = {
  fs: "freespins", hns: "holdspin", pick: "bonusgames", wheel: "bonusgames", offer: "bonusgames", cascade: "cascades", collect: "cascades", mystery: "cascades",
};

/** Hold & spin: chance an empty spot lands an orb per respin, by `land`; respins; orbs that trigger it by grid size. */
export const HNS_LAND = [{ name: "Tight", p: 0.045 }, { name: "Standard", p: 0.065 }, { name: "Generous", p: 0.09 }];
export const HNS_RESPINS = 3;
export const hnsTrigger = (spots: number) => (spots <= 9 ? 4 : 6);
/** Orb credit values (× bet) and their weights, by spread (Low, Standard, High). */
export const ORB_VALUES = [0.5, 1, 1.5, 2, 3, 5, 10, 25];
export const ORB_SPREAD = [
  { name: "Steady", w: [30, 30, 20, 12, 6, 2, 0, 0] },
  { name: "Standard", w: [28, 26, 16, 12, 9, 6, 2.5, 0.5] },
  { name: "Wild", w: [34, 24, 12, 9, 8, 6, 5, 2] },
];
/** Pick until collect: prize table (× bet) and weights, by size. */
export const PICK_PRIZES = [
  { name: "Small", x: [5, 8, 10, 15, 20, 30, 50], w: [20, 25, 22, 15, 10, 6, 2] },
  { name: "Medium", x: [10, 15, 20, 30, 40, 60, 100], w: [18, 24, 22, 16, 10, 7, 3] },
  { name: "Large", x: [20, 30, 40, 60, 100, 150, 250], w: [20, 24, 20, 16, 11, 6, 3] },
];
/** Wheel credit segments (× bet) by spread; 16 segments, jackpot segments replace the smallest. */
export const WHEEL_SEGS = [
  { name: "Gentle", x: [5, 8, 10, 10, 12, 15, 15, 20, 20, 25, 30, 40, 50, 75, 100, 150] },
  { name: "Standard", x: [5, 5, 8, 10, 10, 15, 15, 20, 25, 30, 40, 50, 75, 100, 200, 500] },
  { name: "Wild", x: [3, 5, 5, 5, 8, 10, 10, 15, 20, 25, 40, 50, 100, 250, 500, 1000] },
];
/** How likely a segment is (weights by position in the sorted list: small ones common). */
export const WHEEL_W = [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 3, 2, 1.2, 0.6];
/** Cascades: chance a drop wins again, by `chain`; the climbing multiplier ladder. */
export const CASCADE_CHAIN = [{ name: "Short", p: 0.2 }, { name: "Standard", p: 0.3 }, { name: "Long", p: 0.4 }];
export const CASCADE_LADDER = [1, 2, 3, 5];
/** Collector meter sizes, and credit prizes (× bet). */
export const COLLECT_SIZES = [10, 20, 30, 50];
export const COLLECT_X = [25, 50, 100, 200, 500];
/** Offer sizes: the average prize (× bet); each offer moves by ×0.4 or ×1.5 (fair: the mean stays put). */
export const OFFER_SIZES = [{ name: "Modest", v: 20 }, { name: "Standard", v: 40 }, { name: "Big", v: 80 }];
export const OFFER_STEP = { lo: 0.4, hi: 1.5, pLo: 5 / 11, offers: 4 };
/** Mystery: multiplier values and weights; a wild storm's richness (× a base spin). */
export const MYSTERY_MULT: [number, number][] = [[2, 0.5], [3, 0.3], [5, 0.2]];
export const STORM_UPLIFT = 2;

// ---------------------------------------------------------------------------------------------------------
// Jackpot levels.

/**
 * Fixed amounts (× bet); (M8.5) progressives: standalone (a meter on each machine), linked (one meter for every
 * machine of the design on the floor), or must-hit-by (a mystery meter that must hit before its cap).
 */
export type JackpotKind = "fixed" | "sa" | "linked" | "mhb";
/** How a level is won: jackpot symbols, inside a hold & spin (the top level fills the screen), a wheel, a pick-to-match, or at random. */
export type JackpotHow = "sym" | "hns" | "wheel" | "pick" | "mystery";
export interface JackpotLevel {
  /** Amount (× bet); progressives: the seed (× the design's largest bet). */
  x: number;
  /** 1 in this many spins (at the largest bet); ignored by must-hit-by (it follows from its meter). */
  every: number;
  kind?: JackpotKind;
  /** Progressives: share of every bet added to the meter. */
  inc?: number;
  /** Must-hit-by: the cap as a multiple of the seed. */
  cap?: number;
  how?: JackpotHow;
  /** Won only at the largest bet (a hit on a smaller bet pays nothing). */
  max?: boolean;
}
export const JACKPOT_KINDS: Record<JackpotKind, { name: string; research?: string; desc: string }> = {
  fixed: { name: "Fixed", desc: "Always the same multiple of the bet." },
  sa: { name: "Progressive", research: "progressive", desc: "A meter on each machine grows with every bet until someone wins it." },
  linked: { name: "Linked", research: "linked", desc: "One meter shared by every machine of this game on your floor." },
  mhb: { name: "Must-hit-by", research: "progressive", desc: "A mystery meter that must hit before it reaches its cap. Hunters watch it." },
};
export const JACKPOT_HOWS: Record<JackpotHow, string> = { sym: "Jackpot symbols", hns: "Hold & spin", wheel: "Wheel", pick: "Pick to match", mystery: "Mystery" };
export const INC_RANGE: [number, number] = [0.002, 0.02];
export const CAP_RANGE: [number, number] = [1.2, 10];

// ---------------------------------------------------------------------------------------------------------
// (M8.5) The machine's face (cosmetic): logo font and effect, top box, meters, reel window, button deck.

/** Logo fonts: iOS system font stacks with fallbacks (no font files). */
export const FONTS: { name: string; css: string }[] = [
  { name: "Impact", css: "Impact, 'Haettenschweiler', 'Arial Narrow Bold', sans-serif" },
  { name: "Futura", css: "'Futura-CondensedExtraBold', 'Futura', 'Avenir Next Condensed', 'Arial Narrow', sans-serif" },
  { name: "Didot", css: "Didot, 'Bodoni 72', 'Bodoni MT', Georgia, serif" },
  { name: "Copperplate", css: "Copperplate, 'Copperplate Gothic Light', 'Palatino', serif" },
  { name: "Rockwell", css: "Rockwell, 'Rockwell Extra Bold', 'Courier New', serif" },
  { name: "Typewriter", css: "'American Typewriter', 'Courier New', monospace" },
  { name: "Marker", css: "'Marker Felt', 'Comic Sans MS', 'Chalkboard SE', cursive" },
  { name: "Chalk", css: "Chalkduster, 'Chalkboard SE', 'Comic Sans MS', cursive" },
  { name: "Script", css: "'Snell Roundhand', 'Savoye LET', 'Brush Script MT', cursive" },
  { name: "Papyrus", css: "Papyrus, 'Herculanum', fantasy" },
  { name: "Avenir", css: "'Avenir Next', 'Helvetica Neue', Arial, sans-serif" },
  { name: "Georgia", css: "Georgia, 'Times New Roman', serif" },
];
export const LOGO_FX = ["Glow", "Gold", "Chrome", "Outline", "Neon"];
export interface Look {
  font: number;
  fx: number;
  /** Top box: large, small, none. */
  top: number;
  /** Jackpot meter row: in the top box, above the reels, hidden. */
  meters: number;
  /** Reel window: compact, standard, large. */
  reels: number;
  /** Button deck: standard, compact. */
  deck: number;
}
export const defaultLook = (): Look => ({ font: 0, fx: 0, top: 0, meters: 1, reels: 1, deck: 0 });
export const LOOK_TOP = ["Large", "Small", "None"];
export const LOOK_METERS = ["In the top box", "Above the reels", "Hidden"];
export const LOOK_REELS = ["Compact", "Standard", "Large"];
export const LOOK_DECK = ["Standard", "Compact"];

// ---------------------------------------------------------------------------------------------------------
// The design.

export interface JackpotLevelDefaults { x: number; every: number }
/** Where a design came from (M8.6's sale offers go only to the player's own). */
export type DesignOrigin = "own" | "stock" | "rival" | "imported";

export interface SlotDesign {
  /** Stock designs: their name key; the player's: "d1", "d2", … A math change makes a new design (id). */
  id: string;
  name: string;
  theme: SlotTheme;
  set: 0 | 1;
  layout: LayoutId;
  /** Dollars per credit, and the bet range in credits. */
  denom: number;
  minBet: number;
  maxBet: number;
  /** Target payback, hit rate (any win), volatility 0-1. */
  rtp: number;
  hit: number;
  vol: number;
  wild: "none" | "plain" | "x2" | "x3";
  stacks: boolean;
  fs: FreeSpins | null;
  /** (M8.5) Bonus features (missing = off). Free spins and these count toward MAX_FEATURES. */
  hns?: HoldSpin | null;
  pick?: Pick | null;
  wheel?: Wheel | null;
  cascade?: Cascade | null;
  collect?: Collector | null;
  offer?: Offer | null;
  mystery?: Mystery | null;
  /** Up to 4 levels, Mini first (classic: 1). */
  jackpots: JackpotLevel[];
  show: {
    lights: number; light: number; sound: number; call: string;
    /** Small-win celebration (CELEBRATE index), near misses (× the natural rate; above 1 is rigging), anticipation. */
    ldw: number; near: number; antic: boolean;
    rollup: number; speed: number;
  };
  cab: { type: CabType; body: number; topper: TopperId };
  /** (M8.5) The machine's face; missing = defaults. */
  look?: Look;
  /** (M8.5) Where it came from; missing = the player's own. */
  origin?: DesignOrigin;
}

/** The features a design has on, in display order. */
export function featuresOf(d: SlotDesign): FeatureId[] {
  const out: FeatureId[] = [];
  if (d.fs) out.push("fs");
  for (const k of ["hns", "pick", "wheel", "cascade", "collect", "offer", "mystery"] as const) if (d[k]) out.push(k);
  return out;
}
/** A jackpot level's kind and how it's won, with defaults. */
export const kindOf = (j: JackpotLevel): JackpotKind => j.kind ?? "fixed";
export const howOf = (j: JackpotLevel): JackpotHow => (j.kind === "mhb" ? "mystery" : j.how ?? "sym");
export const isProg = (j: JackpotLevel) => j.kind === "sa" || j.kind === "linked" || j.kind === "mhb";

export const DENOMS = [0.01, 0.05, 0.25, 1, 5, 25];
/** Designer ranges: payback (legal floor comes from the scenario), below which only uncertified designs go. */
export const RTP_RANGE: [number, number] = [0.8, 0.99];
export const RTP_RIGGED = 0.5;
/** Near misses: 1 = the design's natural rate (legal); up to 3 when uncertified. */
export const NEAR_RANGE: [number, number] = [0, 3];
export const FS_EVERY: [number, number] = [60, 2000];
/** (M8.5) How often a bonus feature can trigger, and a collector fill. */
export const FEAT_EVERY: [number, number] = [40, 3000];
export const COLLECT_EVERY: [number, number] = [80, 1500];
export const MYSTERY_EVERY: [number, number] = [5, 200];
export const MAX_FEATURES = 3;

/** Luck needs rtp × (1 − hit) ≥ 0.2 to shift payback by exactly 20 points (docs/spec/cheats.md). */
export const LUCK_ROOM = 0.2;

export function newDesign(id: string): SlotDesign {
  return {
    id, name: "New Game", theme: "goldrush", set: 0, layout: "l20", denom: 0.01, minBet: 40, maxBet: 400,
    rtp: 0.9, hit: 0.35, vol: 0.45, wild: "plain", stacks: false,
    fs: { every: 150, count: 1, retrigger: true, enh: "x2" }, jackpots: [],
    show: { lights: 2, light: 0, sound: 2, call: "call_goldrush", ldw: 1, near: 1, antic: true, rollup: 1, speed: 1 },
    cab: { type: "upright", body: 2, topper: "sign" }, look: defaultLook(), origin: "own",
  };
}
