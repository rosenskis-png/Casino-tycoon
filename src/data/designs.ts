// Stock slot designs (docs/spec/designer.md): the three original machines re-expressed as designs (each keeps its
// old top prize as a jackpot, at the same share of its payback, so it swings as it did), and classics of the genre.
// (M8.5) Volatility values re-expressed on the wider slider, so each keeps its M8 base game. The player can open any of them in the designer and save a copy.
import type { SlotDesign } from "./designer";

const show = (o: Partial<SlotDesign["show"]>): SlotDesign["show"] =>
  ({ lights: 2, light: 0, sound: 2, call: "call_classic", ldw: 1, near: 1, antic: true, rollup: 1, speed: 1, ...o });

export const STOCK_DESIGNS: Record<string, SlotDesign> = {
  cherry: {
    id: "cherry", name: "Cherry Parade", theme: "classic", set: 1, layout: "l20", denom: 0.25, minBet: 1, maxBet: 4,
    rtp: 0.88, hit: 0.42, vol: 0.26, wild: "plain", stacks: false, fs: null, jackpots: [{ x: 1000, every: 7700 }],
    show: show({ lights: 3, light: 3, sound: 2, ldw: 1, speed: 2 }), cab: { type: "upright", body: 1, topper: "sign" },
  },
  liberty: {
    id: "liberty", name: "Liberty Bell", theme: "classic", set: 0, layout: "c3", denom: 1, minBet: 1, maxBet: 2,
    rtp: 0.92, hit: 0.2, vol: 0.34, wild: "plain", stacks: false, fs: null, jackpots: [{ x: 800, every: 5000 }],
    show: show({ lights: 1, light: 0, sound: 1, speed: 0, rollup: 0 }), cab: { type: "stepper", body: 6, topper: "none" },
  },
  // (M11.2) Gentle classics for the tutorial (owner: smaller jackpots): the same games with a small top prize, so
  // one jackpot never wipes out a month.
  cherries: {
    id: "cherries", name: "Lucky Cherries", theme: "classic", set: 1, layout: "l20", denom: 0.25, minBet: 1, maxBet: 4,
    rtp: 0.88, hit: 0.42, vol: 0.2, wild: "plain", stacks: false, fs: null, jackpots: [{ x: 150, every: 2500 }],
    show: show({ lights: 3, light: 3, sound: 2, ldw: 1, speed: 2 }), cab: { type: "upright", body: 3, topper: "sign" },
  },
  bells: {
    id: "bells", name: "Silver Bells", theme: "classic", set: 0, layout: "c3", denom: 1, minBet: 1, maxBet: 2,
    rtp: 0.92, hit: 0.22, vol: 0.25, wild: "plain", stacks: false, fs: null, jackpots: [{ x: 150, every: 2500 }],
    show: show({ lights: 1, light: 0, sound: 1, speed: 0, rollup: 0 }), cab: { type: "stepper", body: 4, topper: "none" },
  },
  thunder: {
    id: "thunder", name: "Thunder Jackpot", theme: "rome", set: 1, layout: "c3", denom: 1, minBet: 1, maxBet: 3,
    rtp: 0.89, hit: 0.08, vol: 0.53, wild: "x3", stacks: false, fs: null, jackpots: [{ x: 2500, every: 8300 }],
    show: show({ lights: 3, light: 2, sound: 3, call: "call_rome", rollup: 2, speed: 1 }), cab: { type: "upright", body: 7, topper: "dome" },
  },
  stampede: {
    id: "stampede", name: "Stampede Gold", theme: "goldrush", set: 0, layout: "w1024", denom: 0.01, minBet: 40, maxBet: 400,
    rtp: 0.9, hit: 0.38, vol: 0.5, wild: "plain", stacks: true, fs: { every: 130, count: 1, retrigger: true, enh: "wildx" }, jackpots: [],
    show: show({ lights: 3, light: 0, sound: 3, call: "call_goldrush", ldw: 2, speed: 2 }), cab: { type: "tall", body: 2, topper: "figure" },
  },
  sphinx: {
    id: "sphinx", name: "Sphinx Treasures", theme: "egypt", set: 0, layout: "l20", denom: 0.01, minBet: 20, maxBet: 200,
    rtp: 0.91, hit: 0.33, vol: 0.47, wild: "plain", stacks: false, fs: { every: 140, count: 2, retrigger: true, enh: "expand" }, jackpots: [],
    show: show({ lights: 2, light: 0, sound: 2, call: "call_egypt", ldw: 1 }), cab: { type: "upright", body: 6, topper: "sign" },
  },
  diamond: {
    id: "diamond", name: "Diamond Sevens", theme: "classic", set: 0, layout: "c3", denom: 1, minBet: 1, maxBet: 3,
    rtp: 0.93, hit: 0.14, vol: 0.43, wild: "x2", stacks: false, fs: null, jackpots: [{ x: 1000, every: 150000 }],
    show: show({ lights: 1, light: 5, sound: 1, rollup: 0, speed: 0 }), cab: { type: "stepper", body: 8, topper: "sign" },
  },
  platinum: {
    id: "platinum", name: "Platinum Reserve", theme: "luxe", set: 0, layout: "r33", denom: 5, minBet: 1, maxBet: 5,
    rtp: 0.94, hit: 0.18, vol: 0.43, wild: "x2", stacks: false, fs: null, jackpots: [{ x: 500, every: 60000 }],
    show: show({ lights: 1, light: 1, sound: 1, call: "call_luxe", ldw: 0, speed: 0 }), cab: { type: "slant", body: 9, topper: "none" },
  },
  lantern: {
    id: "lantern", name: "Lantern Fortune", theme: "dragon", set: 0, layout: "w243", denom: 0.01, minBet: 50, maxBet: 500,
    rtp: 0.9, hit: 0.36, vol: 0.47, wild: "plain", stacks: false, fs: { every: 120, count: 1, retrigger: true, enh: "rand" },
    jackpots: [{ x: 10, every: 300 }, { x: 50, every: 2500 }, { x: 250, every: 30000 }, { x: 2000, every: 900000 }],
    show: show({ lights: 3, light: 5, sound: 3, call: "call_dragon", ldw: 2, speed: 2 }), cab: { type: "giant", body: 0, topper: "figure" },
  },
  // (M8.5) The bonus genres: a Lightning Link-style hold & spin with linked Major and Grand, a Wheel of Fortune-style
  // topper wheel, and one each for cascades, collectors and picks.
  ember: {
    id: "ember", name: "Ember Link", theme: "tiki", set: 0, layout: "l20", denom: 0.01, minBet: 50, maxBet: 500,
    rtp: 0.9, hit: 0.34, vol: 0.4, wild: "plain", stacks: false, fs: { every: 170, count: 1, retrigger: true, enh: "none" },
    hns: { every: 85, land: 1, values: 1 },
    jackpots: [{ x: 10, every: 350, how: "hns" }, { x: 50, every: 3000, how: "hns" }, { x: 250, every: 40000, kind: "linked", inc: 0.004, how: "hns" }, { x: 2500, every: 1500000, kind: "linked", inc: 0.006, how: "hns" }],
    show: show({ lights: 3, light: 5, sound: 3, call: "call_tiki", ldw: 2, speed: 2 }), cab: { type: "tall", body: 2, topper: "sign" },
    look: { font: 0, fx: 1, top: 0, meters: 1, reels: 1, deck: 0 }, origin: "stock",
  },
  grandwheel: {
    id: "grandwheel", name: "Grand Wheel", theme: "deco", set: 0, layout: "r33", denom: 0.25, minBet: 4, maxBet: 12,
    rtp: 0.91, hit: 0.2, vol: 0.35, wild: "x2", stacks: false, fs: null, wheel: { every: 90, spread: 1 },
    jackpots: [{ x: 1000, every: 300000, kind: "linked", inc: 0.005, how: "wheel" }],
    show: show({ lights: 3, light: 0, sound: 3, call: "call_deco", ldw: 0, rollup: 1 }), cab: { type: "upright", body: 3, topper: "wheel" },
    look: { font: 2, fx: 1, top: 1, meters: 1, reels: 1, deck: 0 }, origin: "stock",
  },
  tumble: {
    id: "tumble", name: "Neon Tumble", theme: "atomic", set: 0, layout: "w243", denom: 0.01, minBet: 25, maxBet: 250,
    rtp: 0.9, hit: 0.32, vol: 0.5, wild: "plain", stacks: false, fs: null, cascade: { chain: 1, climb: true }, mystery: { kind: "mult", every: 25 },
    jackpots: [], show: show({ lights: 3, light: 2, sound: 3, call: "call_atomic", ldw: 2, speed: 2 }), cab: { type: "upright", body: 7, topper: "dome" },
    look: { font: 1, fx: 4, top: 1, meters: 2, reels: 2, deck: 0 }, origin: "stock",
  },
  prospector: {
    id: "prospector", name: "Prospector's Haul", theme: "goldrush", set: 1, layout: "l20", denom: 0.01, minBet: 40, maxBet: 400,
    rtp: 0.9, hit: 0.35, vol: 0.45, wild: "plain", stacks: false, fs: { every: 180, count: 1, retrigger: true, enh: "x2" },
    collect: { size: 1, every: 400, prize: "super", x: 50 }, jackpots: [],
    show: show({ lights: 2, light: 0, sound: 2, call: "call_goldrush", ldw: 1 }), cab: { type: "upright", body: 10, topper: "figure" },
    look: { font: 4, fx: 1, top: 0, meters: 1, reels: 1, deck: 0 }, origin: "stock",
  },
  treasure: {
    id: "treasure", name: "Treasure Cove", theme: "pirate", set: 0, layout: "l20", denom: 0.01, minBet: 40, maxBet: 400,
    rtp: 0.9, hit: 0.34, vol: 0.45, wild: "plain", stacks: false, fs: null, pick: { every: 200, mode: "match", size: 1 }, offer: { every: 220, size: 1 },
    jackpots: [{ x: 10, every: 600, how: "pick" }, { x: 40, every: 4000, how: "pick" }, { x: 150, every: 25000, how: "pick" }, { x: 250, every: 0, kind: "mhb", inc: 0.004, cap: 2 }],
    show: show({ lights: 2, light: 0, sound: 2, call: "call_pirate", ldw: 1 }), cab: { type: "upright", body: 6, topper: "sign" },
    look: { font: 9, fx: 0, top: 0, meters: 1, reels: 1, deck: 0 }, origin: "stock",
  },
};
// (M8.5) Every stock design, and any copy of one, comes from its maker.
for (const d of Object.values(STOCK_DESIGNS)) d.origin = "stock";
/** Research needed before a stock design can be placed (data/research.ts). */
export const STOCK_RESEARCH: Record<string, string> = {
  thunder: "bigslots", stampede: "freespins", sphinx: "freespins", lantern: "freespins",
  ember: "holdspin", grandwheel: "bonusgames", tumble: "cascades", prospector: "cascades", treasure: "bonusgames",
};
