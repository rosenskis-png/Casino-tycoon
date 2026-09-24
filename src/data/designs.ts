// Stock slot designs (docs/spec/designer.md): the three original machines re-expressed as designs, and three
// classics of the genre. The player can open any of them in the designer and save a copy.
import type { SlotDesign } from "./designer";

const show = (o: Partial<SlotDesign["show"]>): SlotDesign["show"] =>
  ({ lights: 2, light: 0, sound: 2, call: "call_classic", ldw: 1, near: 1, antic: true, rollup: 1, speed: 1, ...o });

export const STOCK_DESIGNS: Record<string, SlotDesign> = {
  cherry: {
    id: "cherry", name: "Cherry Parade", theme: "classic", set: 1, layout: "l20", denom: 0.25, minBet: 1, maxBet: 4,
    rtp: 0.88, hit: 0.42, vol: 0.25, wild: "plain", stacks: false, fs: null, jackpots: [],
    show: show({ lights: 3, light: 3, sound: 2, ldw: 1, speed: 2 }), cab: { type: "upright", body: 1, topper: "sign" },
  },
  liberty: {
    id: "liberty", name: "Liberty Bell", theme: "classic", set: 0, layout: "c3", denom: 1, minBet: 1, maxBet: 2,
    rtp: 0.92, hit: 0.2, vol: 0.35, wild: "plain", stacks: false, fs: null, jackpots: [],
    show: show({ lights: 1, light: 0, sound: 1, speed: 0, rollup: 0 }), cab: { type: "stepper", body: 6, topper: "none" },
  },
  thunder: {
    id: "thunder", name: "Thunder Jackpot", theme: "rome", set: 1, layout: "c3", denom: 1, minBet: 1, maxBet: 3,
    rtp: 0.89, hit: 0.08, vol: 0.7, wild: "x3", stacks: false, fs: null, jackpots: [],
    show: show({ lights: 3, light: 2, sound: 3, call: "call_rome", rollup: 2, speed: 1 }), cab: { type: "upright", body: 7, topper: "dome" },
  },
  stampede: {
    id: "stampede", name: "Stampede Gold", theme: "goldrush", set: 0, layout: "w1024", denom: 0.01, minBet: 40, maxBet: 400,
    rtp: 0.9, hit: 0.38, vol: 0.6, wild: "plain", stacks: true, fs: { every: 130, count: 1, retrigger: true, enh: "wildx" }, jackpots: [],
    show: show({ lights: 3, light: 0, sound: 3, call: "call_goldrush", ldw: 2, speed: 2 }), cab: { type: "tall", body: 2, topper: "figure" },
  },
  sphinx: {
    id: "sphinx", name: "Sphinx Treasures", theme: "egypt", set: 0, layout: "l20", denom: 0.01, minBet: 20, maxBet: 200,
    rtp: 0.91, hit: 0.33, vol: 0.55, wild: "plain", stacks: false, fs: { every: 140, count: 2, retrigger: true, enh: "expand" }, jackpots: [],
    show: show({ lights: 2, light: 0, sound: 2, call: "call_egypt", ldw: 1 }), cab: { type: "upright", body: 6, topper: "sign" },
  },
  diamond: {
    id: "diamond", name: "Diamond Sevens", theme: "classic", set: 0, layout: "c3", denom: 1, minBet: 1, maxBet: 3,
    rtp: 0.93, hit: 0.14, vol: 0.5, wild: "x2", stacks: false, fs: null, jackpots: [{ x: 1000, every: 150000 }],
    show: show({ lights: 1, light: 5, sound: 1, rollup: 0, speed: 0 }), cab: { type: "stepper", body: 8, topper: "sign" },
  },
  platinum: {
    id: "platinum", name: "Platinum Reserve", theme: "luxe", set: 0, layout: "r33", denom: 5, minBet: 1, maxBet: 5,
    rtp: 0.94, hit: 0.18, vol: 0.5, wild: "x2", stacks: false, fs: null, jackpots: [{ x: 500, every: 60000 }],
    show: show({ lights: 1, light: 1, sound: 1, call: "call_luxe", ldw: 0, speed: 0 }), cab: { type: "slant", body: 9, topper: "none" },
  },
  lantern: {
    id: "lantern", name: "Lantern Fortune", theme: "dragon", set: 0, layout: "w243", denom: 0.01, minBet: 50, maxBet: 500,
    rtp: 0.9, hit: 0.36, vol: 0.55, wild: "plain", stacks: false, fs: { every: 120, count: 1, retrigger: true, enh: "rand" },
    jackpots: [{ x: 10, every: 300 }, { x: 50, every: 2500 }, { x: 250, every: 30000 }, { x: 2000, every: 900000 }],
    show: show({ lights: 3, light: 5, sound: 3, call: "call_dragon", ldw: 2, speed: 2 }), cab: { type: "giant", body: 0, topper: "figure" },
  },
};
/** Research needed before a stock design can be placed (data/research.ts). */
export const STOCK_RESEARCH: Record<string, string> = { thunder: "bigslots", stampede: "freespins", sphinx: "freespins", lantern: "freespins" };
