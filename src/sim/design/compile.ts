// The slot designer's compiler (docs/spec/designer.md §3): a design becomes exact math. The payback budget is
// solved in closed form (jackpots, every feature, then what's left for the base game), and each ladder of wins (base
// game, free spins, a wild storm) is solved exactly for its return, hit rate and big-win share. Features are exact by
// construction (hold & spin's Markov chain, finite pick and wheel tables, a fair offer, cascades' geometric chain).
// Progressive meters pay their live value on the floor and their mean in the lab. Pure and headless.
import {
  CABINETS, CASCADE_CHAIN, CASCADE_LADDER, CELEBRATE, CLASSIC_PAYS, COLLECT_SIZES, C_BLANK, C_WILD, FS_COUNTS, FS_ENH, HNS_LAND,
  HNS_RESPINS, LAYOUTS, LUCK_ROOM, MYSTERY_MULT, OFFER_SIZES, OFFER_STEP, ORB_SPREAD, ORB_VALUES, PAYING, PICK_PRIZES, R33_PAYS,
  RETRIGGER, SCATTER_PAYS, SCATTER_SPLIT, SPEEDS, STORM_UPLIFT, TOP_PAY, VIDEO_PAYS, WHEEL_SEGS, WHEEL_W, WILD, howOf, hnsTrigger,
  kindOf, type JackpotHow, type JackpotKind, type LayoutDef, type SlotDesign,
} from "../../data/designer";
import type { Pay, SlotModel, Uniform } from "../../data/games";
import { seeded } from "../rng";
import { linePatterns } from "./lines";

/**
 * One kind of win: symbol `s` (classic: the three symbols packed as a·49 + b·7 + c) over `k` reels, on `m` lines
 * or ways (ways games: the product of each reel's weight, wild multipliers included), with a line game's wild
 * multiplier `w`. `full`: the expanding symbol fills its k reels. `x` pays × the bet, `p` its chance.
 */
export interface Entry { x: number; p: number; s: number; k: number; m: number; w: number; full?: 1; nat: number }
export interface Ladder { e: Entry[]; cum: Float64Array; hit: number; ev: number; e2: number; big: number }

/** Where the payback goes (points of the target). */
export interface Budget {
  small: number; big: number; scatter: number; fs: number; jackpots: number;
  /** (M8.5) Each bonus feature's credits, and what cascades and mystery add to the base game. */
  hns: number; pick: number; wheel: number; offer: number; collect: number; cascade: number; mystery: number;
}

/** A triggered feature: its chance on a non-jackpot spin, value per trigger (A + B × the base return), moments, time. */
export type TrigId = "fs" | "hns" | "pick" | "wheel" | "offer" | "collect";
export interface FeatInfo {
  id: TrigId;
  q: number;
  A: number; B: number;
  /** Average credits per trigger (× bet; jackpots won inside are in the jackpot budget) and its second moment. */
  v: number; x2: number;
  /** Average seconds it adds to a spin at 1×. */
  secs: number;
  /** Jackpot levels won inside it and their chance per trigger. */
  lv: number[]; lc: number[];
}

/** A jackpot level as compiled: amount (fixed) or seed (progressive), mean pay, chance per spin, feature it's won in. */
export interface Level {
  kind: JackpotKind; how: JackpotHow;
  /** Fixed amount, or a progressive's seed (× the design's largest bet); its cap (must-hit-by, × the largest bet). */
  x: number; cap: number;
  /** Mean pay per hit (× the largest bet): a progressive's seed plus what its meter gathers between hits. */
  xbar: number;
  /** Chance per spin at the largest bet; share of each bet added to a meter; won only at the largest bet. */
  p: number; inc: number; max: boolean;
  /** Index into `feats` of the feature it's won in, or -1 (symbols, mystery: an outcome of its own). */
  f: number;
}

export interface HnsInfo {
  spots: number; start: number; land: number;
  /** Final orb count distribution (cumulative, index = count) when no Grand is awarded; the level that fills the screen. */
  cum: Float64Array; grand: number;
  orbCum: Float64Array; orbMu: number; orbS2: number;
}

export interface Compiled {
  d: SlotDesign;
  lay: LayoutDef;
  /** Symbol paytable in use: per symbol, pays for 3, 4, 5 (, 6) of a kind (credits per line or unit; classic per coin). */
  pt: number[][];
  top: number;
  base: Ladder;
  /** Free spins ladders: one, or one per expanding symbol (index = symbol). */
  fsL: Ladder[];
  /** Jackpot levels; chance per spin and mean pay (× bet) per level. */
  levels: Level[];
  pJ: number[];
  jx: number[];
  /** Chance of an exclusive jackpot spin (symbols, mystery). */
  PJ: number;
  /** Triggered features (free spins first), their total chance on a non-jackpot spin. */
  feats: FeatInfo[];
  Q: number;
  /** Free spins: trigger chance on a non-jackpot spin, scatter split, spins and scatter pays per scatter count. */
  q: number;
  split: number[];
  spins: number[];
  scat: number[];
  retrig: number;
  /** Free spin multiplier: [value, chance] pairs. */
  mult: [number, number][];
  /** (M8.5) Base-game modifiers: cascades, mystery multiplier or wild storm; the base return multiplier they make. */
  cas: { p: number; ladder: number[]; K: number } | null;
  mys: { kind: "mult" | "wilds"; p: number; storm: Ladder | null } | null;
  M: number;
  hns: HnsInfo | null;
  pick: { mode: "collect" | "match"; x: number[]; cum: Float64Array } | null;
  wheel: { x: number[]; cum: Float64Array } | null;
  offer: number;
  col: { N: number; chance: number; prize: "credits" | "super"; x: number } | null;
  /** The payback budget (points of the target). */
  budget: Budget;
  /** Hit rate reached, the range the design allows, and what the slider was clamped from. */
  hit: number;
  hitRange: [number, number];
  /** Settings the compiler had to change to make the design feasible (shown by the designer). */
  notes: string[];
  /** Average pay of one free spins feature, trigger scatters included (× bet), and its expected spins. */
  fsAvg: number;
  fsSpins: number;
  /** Per-spin variance (× bet²) and chance of any pay; the variance without jackpots (the swings a player feels). */
  v: number;
  h: number;
  vFelt: number;
  /** Near misses: share of losing spins shown as one; the design's natural share. */
  near: number;
  natural: number;
  model: SlotModel;
}

/** Wins at or above this many times the bet are "big" (the volatility slider's share). */
export const bigAt = (lay: LayoutDef) => (lay.win === "classic" ? 20 : 10);
const SYM_W = [0.35, 0.5, 0.6, 0.7, 1, 1, 1.1, 1.2, 1.3];
const K_W: Record<number, number> = { 3: 1, 4: 0.28, 5: 0.07, 6: 0.02 };
const COUNT_P = [1, 0.3, 0.08, 0.02];
const STACK_P = [1, 0.45, 0.35, 0.35];
const LINE_M = [0, 1, 0.15, 0.03];
const EXPAND_W: Record<number, number> = { 3: 0.04, 4: 0.006, 5: 0.0008, 6: 0.0001 };
/** Wild chance per winning position in free spins with multiplier wilds, and ×2 vs ×3. */
const WILDX = { p: 0.3, m2: 0.65 };
/** Pays above this multiple of the bet are left off the ladders. */
const MAX_X = 10000;

const lerpLog = (a: number, b: number, t: number) => a * Math.pow(b / a, t);
const niceRound = (v: number) => {
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / (mag * 5)) * mag * 5;
};

/** The paytable a design uses, and its top award (hero 5 of a kind, or 3 wilds on 3-reel games). */
export function paytableOf(d: SlotDesign): { pt: number[][]; top: number } {
  const lay = LAYOUTS[d.layout];
  if (lay.win === "classic") {
    const top = niceRound(lerpLog(TOP_PAY.classic[0], TOP_PAY.classic[1], d.vol));
    return { pt: [], top };
  }
  if (lay.reels === 3) {
    const top = niceRound(lerpLog(TOP_PAY.r33[0], TOP_PAY.r33[1], d.vol));
    const pt = R33_PAYS.map((v) => [v]);
    if (d.wild === "none") pt[0] = [top];
    return { pt, top };
  }
  const hero5 = niceRound(lerpLog(TOP_PAY.video[0], TOP_PAY.video[1], d.vol));
  const pt = VIDEO_PAYS.map((r) => r.slice());
  pt[0] = [pt[0][0], niceRound(pt[0][1] * Math.sqrt(hero5 / 750)), hero5, hero5 * 2];
  return { pt, top: hero5 };
}

// ---------------------------------------------------------------------------------------------------------
// Classic reels.

/** Classic pay per coin of three symbols on the line (wilds multiply by `wm` each; 3 wilds pay the top award). */
export function classicPay(a: number, b: number, c: number, wm: number, top: number, wilds: boolean): number {
  const syms = [a, b, c];
  const nw = syms.filter((q) => q === C_WILD).length;
  if (nw === 3) return top;
  const mult = Math.pow(wm, nw);
  const is = (q: number, set: number[]) => q === C_WILD || set.includes(q);
  let best = 0;
  // Three of a kind: tops (the top award when there are no wilds), each bar.
  const threes: [number, number][] = [[1, wilds ? CLASSIC_PAYS.top : top], [2, CLASSIC_PAYS.bars[0]], [3, CLASSIC_PAYS.bars[1]], [4, CLASSIC_PAYS.bars[2]]];
  for (const [sym, pay] of threes) if (syms.every((q) => is(q, [sym]))) best = Math.max(best, pay * mult);
  if (syms.every((q) => is(q, [2, 3, 4]))) best = Math.max(best, CLASSIC_PAYS.anyBar * mult);
  const ch = syms.filter((q) => q === 5).length;
  if (ch > 0) {
    const n = Math.min(3, ch + nw);
    best = Math.max(best, CLASSIC_PAYS.cherry[n - 1] * mult);
  }
  return best;
}
const CLASSIC_REEL_W = [0.5, 0.8, 1.2, 1.6, 2.2, 1.5, 9];

function classicEntries(d: SlotDesign, top: number): Entry[] {
  const wilds = d.wild !== "none", wm = d.wild === "x3" ? 3 : d.wild === "x2" ? 2 : 1;
  const out: Entry[] = [];
  for (let a = 0; a <= C_BLANK; a++) for (let b = 0; b <= C_BLANK; b++) for (let c = 0; c <= C_BLANK; c++) {
    if (!wilds && (a === C_WILD || b === C_WILD || c === C_WILD)) continue;
    const x = classicPay(a, b, c, wm, top, wilds);
    if (x > 0) out.push({ x, p: 0, s: a * 49 + b * 7 + c, k: 3, m: 1, w: 1, nat: CLASSIC_REEL_W[a] * CLASSIC_REEL_W[b] * CLASSIC_REEL_W[c] });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Video: lines and ways.

interface ReelOpt { w: number; p: number; wild: number }

/** Per-reel options: how many of the symbol (or wilds, which count as 1, or their multiplier) a reel shows. */
function reelOpts(rows: number, stacked: boolean, wildx: boolean): ReelOpt[] {
  const pc = stacked ? STACK_P : COUNT_P;
  const out = new Map<string, ReelOpt>();
  const add = (w: number, p: number, wild: number) => {
    const key = `${w}:${wild}`;
    const o = out.get(key);
    if (o) o.p += p; else out.set(key, { w, p, wild });
  };
  for (let c = 1; c <= rows; c++) {
    if (!wildx) { add(c, pc[c - 1], 0); continue; }
    for (let nw = 0; nw <= c; nw++) {
      const pw = binom(c, nw) * Math.pow(WILDX.p, nw) * Math.pow(1 - WILDX.p, c - nw);
      for (let n3 = 0; n3 <= nw; n3++) {
        const pm = binom(nw, n3) * Math.pow(1 - WILDX.m2, n3) * Math.pow(WILDX.m2, nw - n3);
        add(c - nw + 2 * (nw - n3) + 3 * n3, pc[c - 1] * pw * pm, nw > 0 ? 1 : 0);
      }
    }
  }
  return [...out.values()];
}
function binom(n: number, k: number) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i;
  return r;
}
/** Which reels may show wilds: every reel on 3-reel games; the middle reels otherwise (never the first). */
export const wildReel = (lay: LayoutDef, r: number) => lay.reels === 3 || (r >= 1 && r <= lay.reels - 2);

/**
 * Ways products for a run of k reels and their natural chance. Wilds on both reels 1 and 2 need reel 0 full of
 * the symbol, or a filler on reel 0 would win through them (sim/design/grid.ts builds reels by the same rule).
 */
function waysProducts(lay: LayoutDef, k: number, stacked: boolean, wildx: boolean): Map<number, number> {
  let states = new Map<number, number>(); // key: T * 8 + flags (1 wild on reel 1, 2 wild on reel 2, 4 reel 0 full)
  for (const o of reelOpts(lay.rows, stacked, false)) states.set(o.w * 8 + (o.w === lay.rows ? 4 : 0), (states.get(o.w * 8 + (o.w === lay.rows ? 4 : 0)) ?? 0) + o.p);
  for (let r = 1; r < k; r++) {
    const opts = reelOpts(lay.rows, stacked, wildx && wildReel(lay, r));
    const next = new Map<number, number>();
    let maxP = 0;
    for (const [key, p] of states) {
      const T = Math.floor(key / 8), fl = key % 8;
      for (const o of opts) {
        let f = fl;
        if (o.wild && r === 1) f |= 1;
        if (o.wild && r === 2) f |= 2;
        if ((f & 3) === 3 && !(f & 4)) continue;
        const nk = T * o.w * 8 + f, np = (next.get(nk) ?? 0) + p * o.p;
        next.set(nk, np);
        if (np > maxP) maxP = np;
      }
    }
    states = new Map([...next].filter(([, p]) => p > maxP * 1e-9));
  }
  const out = new Map<number, number>();
  for (const [key, p] of states) out.set(Math.floor(key / 8), (out.get(Math.floor(key / 8)) ?? 0) + p);
  return out;
}

interface LadderSpec { wildx: boolean; expand: number }

function videoEntries(d: SlotDesign, pt: number[][], spec: LadderSpec): Entry[] {
  const lay = LAYOUTS[d.layout], out: Entry[] = [];
  const U = lay.units;
  const push = (e: Entry) => { if (e.x <= MAX_X && e.nat > 0) out.push(e); };
  if (lay.win === "ways") {
    for (let k = 3; k <= lay.reels; k++) {
      for (const stacked of [false, true]) {
        if (stacked && !d.stacks) continue;
        const prods = waysProducts(lay, k, stacked, spec.wildx);
        for (let s = 0; s < PAYING; s++) {
          if ((s === 0) !== stacked && d.stacks) continue;
          for (const [T, p] of prods) push({ x: (pt[s][k - 3] * T) / U, p: 0, s, k, m: T, w: 1, nat: SYM_W[s] * K_W[k] * p });
        }
      }
    }
  } else {
    const r33 = lay.reels === 3;
    for (let k = 3; k <= lay.reels; k++) {
      for (let m = 1; m <= 3; m++) {
        if (!linePatterns(lay, k, m).length) continue;
        for (let s = 0; s < PAYING; s++) {
          const stackBoost = d.stacks && s === 0 && m > 1 ? 3 : 1;
          push({ x: (pt[s][k - 3] * m) / U, p: 0, s, k, m, w: 1, nat: SYM_W[s] * K_W[k] * LINE_M[m] * stackBoost });
        }
      }
      // Multiplier wilds on one line: j of the run's wild-eligible positions (reel 0 too on 3-reel games).
      const wm = spec.wildx ? 0 : d.wild === "x2" ? 2 : d.wild === "x3" ? 3 : 0;
      if ((spec.wildx || (r33 && wm)) && linePatterns(lay, k, 1).length) {
        // Line games never put wilds on both reels 1 and 2 of a 5-reel run (a filler on reel 0 would win through them).
        const slots = r33 ? k - 1 : Math.min(k, lay.reels - 1) - 1, maxJ = r33 ? 2 : k === 3 ? 1 : 2;
        for (let j = 1; j <= Math.min(slots, maxJ); j++) {
          const mults: [number, number][] = spec.wildx ? multCombos(j) : [[Math.pow(wm, j), 1]];
          for (const [w, pw] of mults) for (let s = 0; s < PAYING; s++) {
            push({ x: (pt[s][k - 3] * w) / U, p: 0, s, k, m: 1, w, nat: SYM_W[s] * K_W[k] * binom(slots, j) * Math.pow(spec.wildx ? WILDX.p : 0.1, j) * pw });
          }
        }
      }
    }
    // Three wilds on a 3-reel game: the top award.
    if (r33 && d.wild !== "none") {
      const { top } = paytableOf(d);
      push({ x: top / U, p: 0, s: WILD, k: 3, m: 1, w: 1, nat: 0.002 });
    }
  }
  // Expanding symbol (free spins): it fills k reels and pays on every line / way.
  if (spec.expand >= 0) {
    const e = spec.expand;
    for (let k = 3; k <= lay.reels; k++) {
      const m = lay.win === "ways" ? Math.pow(lay.rows, k) : lay.lines.length;
      push({ x: (pt[e][k - 3] * m) / U, p: 0, s: e, k, m, w: 1, full: 1, nat: EXPAND_W[k] * SYM_W[e] * 3 });
    }
  }
  return out;
}
/** Products of j wild multipliers (×2 or ×3) and their chances. */
function multCombos(j: number): [number, number][] {
  const out: [number, number][] = [];
  for (let n3 = 0; n3 <= j; n3++) out.push([Math.pow(2, j - n3) * Math.pow(3, n3), binom(j, n3) * Math.pow(1 - WILDX.m2, n3) * Math.pow(WILDX.m2, j - n3)]);
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// The ladder solver.

/**
 * Chances for a set of wins so they return exactly `E` per draw, hit `h` of the time (clamped to what the set
 * allows), with share `s` of the return in big wins. Big wins: chance ∝ natural weight ÷ pay; small wins: a tilt
 * ∝ natural weight × pay^−α, α solved by bisection. The last small win absorbs rounding.
 */
export function solveLadder(src: Entry[], E: number, h: number, s: number, big: number): { lad: Ladder; lo: number; hi: number } {
  const e = src.map((q) => ({ ...q }));
  const S = e.filter((q) => q.x < big), B = e.filter((q) => q.x >= big);
  if (!S.length) s = 1;
  if (!B.length) s = 0;
  let PB = 0;
  if (B.length && s > 0) {
    let a = 0, b = 0;
    for (const q of B) { a += q.nat; b += q.nat / q.x; }
    const MB = a / b;
    PB = (s * E) / MB;
    // Big wins may take at most half the hits.
    if (PB > h * 0.5 && S.length) { PB = h * 0.5; s = (PB * MB) / E; }
    for (const q of B) q.p = (PB * (q.nat / q.x)) / b;
  }
  const ES = (1 - s) * E;
  // Mean of the small wins at tilt α (log-space weights for stability).
  const logx = S.map((q) => Math.log(q.x)), logn = S.map((q) => Math.log(q.nat));
  const tilt = (alpha: number, out?: number[]) => {
    let mx = -Infinity;
    const lw = logn.map((l, i) => { const v = l - alpha * logx[i]; if (v > mx) mx = v; return v; });
    let sw = 0, sx = 0;
    for (let i = 0; i < S.length; i++) { const w = Math.exp(lw[i] - mx); sw += w; sx += w * S[i].x; if (out) out[i] = w; }
    if (out) for (let i = 0; i < S.length; i++) out[i] /= sw;
    return sx / sw;
  };
  let lo = PB, hi = PB;
  if (S.length && ES > 0) {
    const meanHi = tilt(-25), meanLo = tilt(25);
    lo = PB + ES / meanHi;
    hi = PB + ES / meanLo;
    const PS = Math.min(Math.max(h, lo), hi) - PB;
    const target = ES / PS;
    let a = -25, b = 25;
    for (let it = 0; it < 90; it++) {
      const mid = (a + b) / 2;
      if (tilt(mid) > target) a = mid; else b = mid;
    }
    const w: number[] = [];
    tilt((a + b) / 2, w);
    // Rescale so the small wins' return is exact.
    let sx = 0;
    for (let i = 0; i < S.length; i++) sx += w[i] * S[i].x;
    const scale = ES / sx;
    for (let i = 0; i < S.length; i++) S[i].p = w[i] * scale;
  }
  const kept = e.filter((q) => q.p > 1e-15);
  kept.sort((a, b) => a.x - b.x);
  // Absorb rounding in the most likely win.
  let ev = 0;
  for (const q of kept) ev += q.x * q.p;
  if (kept.length) {
    let mi = 0;
    for (let i = 1; i < kept.length; i++) if (kept[i].p > kept[mi].p) mi = i;
    kept[mi].p += (E - ev) / kept[mi].x;
  }
  const cum = new Float64Array(kept.length);
  let c = 0, e2 = 0, bigEv = 0;
  ev = 0;
  for (let i = 0; i < kept.length; i++) {
    c += kept[i].p; cum[i] = c;
    ev += kept[i].x * kept[i].p; e2 += kept[i].x * kept[i].x * kept[i].p;
    if (kept[i].x >= big) bigEv += kept[i].x * kept[i].p;
  }
  return { lad: { e: kept, cum, hit: c, ev, e2, big: ev > 0 ? bigEv / ev : 0 }, lo, hi };
}

/** A win drawn from a ladder (null: a losing spin). */
export function drawEntry(l: Ladder, r: Uniform): Entry | null {
  const u = r.next();
  if (u >= l.hit) return null;
  let a = 0, b = l.cum.length - 1;
  while (a < b) { const m = (a + b) >> 1; if (l.cum[m] > u) b = m; else a = m + 1; }
  return l.e[a];
}

// ---------------------------------------------------------------------------------------------------------
// The design.

const cache = new Map<string, Compiled>();
/** Math-relevant fields: two designs with the same key compile to the same numbers. */
export function mathKey(d: SlotDesign): string {
  return JSON.stringify([d.layout, d.denom, d.minBet, d.maxBet, d.rtp, d.hit, d.vol, d.wild, d.stacks, d.fs, d.jackpots, d.show.near, d.show.ldw, d.show.speed, d.cab.type,
    d.hns ?? null, d.pick ?? null, d.wheel ?? null, d.cascade ?? null, d.collect ?? null, d.offer ?? null, d.mystery ?? null, d.cab.topper === "wheel"]);
}

/** Compiled math for a design (cached by its math; `id` names the model for the sim's caches). */
export function compile(d: SlotDesign, id = d.id): Compiled {
  const key = `${id}|${mathKey(d)}`;
  let c = cache.get(key);
  if (!c) {
    if (cache.size > 400) cache.clear();
    cache.set(key, (c = build(d, id)));
  }
  // Cosmetic fields follow the design without recompiling.
  c.d = d;
  c.model.name = d.name;
  return c;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
function cumOf(w: number[]): Float64Array {
  const t = sum(w), out = new Float64Array(w.length);
  let c = 0;
  w.forEach((v, i) => { c += v / t; out[i] = c; });
  out[w.length - 1] = 1;
  return out;
}
/** Index drawn from a cumulative table. */
export function drawCum(cum: Float64Array, u: number): number {
  let a = 0, b = cum.length - 1;
  while (a < b) { const m = (a + b) >> 1; if (cum[m] > u) b = m; else a = m + 1; }
  return a;
}
/** Mean and second moment of a weighted table. */
function moments(x: number[], w: number[]): [number, number] {
  const t = sum(w);
  let m = 0, m2 = 0;
  x.forEach((v, i) => { m += (v * w[i]) / t; m2 += (v * v * w[i]) / t; });
  return [m, m2];
}

/** Hold & spin's final orb count distribution (index = orbs), exactly: a Markov chain over (orbs, respins left). */
export function hnsChain(spots: number, start: number, land: number): Float64Array {
  const out = new Float64Array(spots + 1);
  const P: Float64Array[] = Array.from({ length: spots + 1 }, () => new Float64Array(HNS_RESPINS + 1));
  P[start][HNS_RESPINS] = 1;
  const binom = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i; return r; };
  for (let n = start; n < spots; n++) {
    const e = spots - n;
    const pk = Array.from({ length: e + 1 }, (_, k) => binom(e, k) * Math.pow(land, k) * Math.pow(1 - land, e - k));
    for (let r = HNS_RESPINS; r >= 1; r--) {
      const mass = P[n][r];
      if (!mass) continue;
      if (r > 1) P[n][r - 1] += mass * pk[0]; else out[n] += mass * pk[0];
      for (let k = 1; k <= e; k++) {
        if (n + k === spots) out[spots] += mass * pk[k];
        else P[n + k][HNS_RESPINS] += mass * pk[k];
      }
    }
  }
  return out;
}

/** Cascades: the base return multiplier and the chain's second moment factor, for a chain chance and ladder. */
function cascadeMoments(p: number, ladder: number[], mw: number, mw2: number): { K: number; e2w: number } {
  const m = (j: number) => ladder[Math.min(ladder.length - 1, j)];
  let K = 0, e2 = 0, pn = 1 - p, sm = 0, sm2 = 0;
  for (let n = 1; n <= 80; n++) {
    const pN = n === 80 ? Math.pow(p, n - 1) : pn;
    sm += m(n - 1); sm2 += m(n - 1) * m(n - 1);
    e2 += pN * (mw2 * sm2 + mw * mw * (sm * sm - sm2));
    K += Math.pow(p, n - 1) * m(n - 1);
    pn *= p;
  }
  return { K, e2w: e2 };
}

function build(d: SlotDesign, id: string): Compiled {
  const lay = LAYOUTS[d.layout], notes: string[] = [];
  const { pt, top } = paytableOf(d);
  const big = bigAt(lay);
  const T = d.rtp;
  const classic = lay.win === "classic";
  const spots = lay.reels * lay.rows;

  // Triggered features, in a fixed order (free spins first). Values follow once the base return is known.
  const feats: FeatInfo[] = [];
  const addFeat = (fi: Omit<FeatInfo, "v" | "x2" | "lv" | "lc">) => { feats.push({ ...fi, v: 0, x2: 0, lv: [], lc: [] }); return feats.length - 1; };
  const fs = !classic ? d.fs : null;
  const iFs = fs ? addFeat({ id: "fs", q: 1 / fs.every, A: 0, B: 0, secs: 0 }) : -1;
  const iHns = !classic && d.hns ? addFeat({ id: "hns", q: 1 / d.hns.every, A: 0, B: 0, secs: 0 }) : -1;
  const iPick = !classic && d.pick ? addFeat({ id: "pick", q: d.pick.mode === "match" ? 0 : 1 / d.pick.every, A: 0, B: 0, secs: d.pick.mode === "match" ? 7 : 6 }) : -1;
  const topWheel = d.cab.topper === "wheel";
  const iWheel = !classic && d.wheel ? addFeat({ id: "wheel", q: 1 / d.wheel.every, A: 0, B: 0, secs: topWheel ? 9 : 7 }) : -1;
  const iOffer = !classic && d.offer ? addFeat({ id: "offer", q: 1 / d.offer.every, A: 0, B: 0, secs: 8 }) : -1;
  const superFs = d.collect?.prize === "super" && !!fs;
  const iCol = !classic && d.collect ? addFeat({ id: "collect", q: 1 / d.collect.every, A: 0, B: 0, secs: 3 }) : -1;

  // Jackpot levels: fixed, standalone and linked progressives (seed plus what the meter gathers), must-hit-by.
  const raw = classic ? d.jackpots.slice(0, 1) : d.jackpots.slice(0, 4);
  const levels: Level[] = raw.map((j) => {
    const kind = kindOf(j), inc = kind === "fixed" ? 0 : j.inc ?? 0.005;
    let how = howOf(j);
    let f = -1;
    if (how === "hns") f = iHns;
    else if (how === "wheel") f = iWheel;
    else if (how === "pick") f = iPick >= 0 && d.pick?.mode === "match" ? iPick : -1;
    if ((how === "hns" || how === "wheel" || how === "pick") && f < 0) how = "sym";
    const capM = kind === "mhb" ? Math.max(1.05, j.cap ?? 2) : 0;
    if (kind === "mhb") {
      // The hit point is drawn evenly between seed and cap: it pays (seed + cap) / 2 on average after (cap − seed) / 2 of increments.
      const cap = j.x * capM;
      return { kind, how: "mystery" as JackpotHow, x: j.x, cap, xbar: (j.x + cap) / 2, p: (2 * inc) / (cap - j.x), inc, max: false, f: -1 };
    }
    const p = 1 / j.every;
    return { kind, how, x: j.x, cap: 0, xbar: j.x + (kind === "fixed" ? 0 : inc / p), p, inc, max: !!j.max, f };
  });
  // Together at most 35% of the payback (progressives: their increments scale with them).
  const Jof = () => sum(levels.map((l) => l.p * l.xbar));
  let J = Jof();
  if (J > 0.35 * T) {
    const k = (0.35 * T) / J;
    for (const l of levels) { l.p *= k; l.inc *= k; if (l.kind !== "fixed" && l.kind !== "mhb") l.xbar = l.x + l.inc / l.p; }
    J = Jof();
    notes.push("Jackpots trimmed: they took more than a third of the payback");
  }
  const excl = levels.filter((l) => l.f < 0);
  const PJ = sum(excl.map((l) => l.p));
  // Levels won inside a feature: their chance per trigger. Pick-to-match comes exactly as often as its jackpots.
  if (iPick >= 0 && d.pick!.mode === "match") {
    const pp = sum(levels.filter((l) => l.f === iPick).map((l) => l.p));
    feats[iPick].q = pp / (1 - PJ);
    if (pp <= 0) notes.push("Pick to match needs jackpot levels won by picking (Jackpots tab)");
  }
  levels.forEach((l, i) => { if (l.f >= 0) { feats[l.f].lv.push(i); } });
  for (const fi of feats) {
    const tot = sum(fi.lv.map((i) => levels[i].p));
    if (fi.q <= 0) { fi.lc = fi.lv.map(() => 0); continue; }
    let k = 1;
    if (tot / ((1 - PJ) * fi.q) > (fi.id === "pick" ? 1 : 0.9) + 1e-12) {
      k = ((fi.id === "pick" ? 1 : 0.9) * (1 - PJ) * fi.q) / tot;
      notes.push(`Jackpots in the ${fi.id === "hns" ? "hold & spin" : fi.id} made rarer: it can't award one more often than it triggers`);
    }
    for (const i of fi.lv) { const l = levels[i]; l.p *= k; l.inc *= k; if (l.kind === "sa" || l.kind === "linked") l.xbar = l.x + l.inc / l.p; }
    fi.lc = fi.lv.map((i) => levels[i].p / ((1 - PJ) * fi.q));
  }
  J = Jof();

  // Free spins: value per trigger A + B·b.
  const enh = FS_ENH[fs?.enh ?? "none"];
  const split = SCATTER_SPLIT[lay.reels] ?? SCATTER_SPLIT[5];
  const spins = split.map((_, j) => FS_COUNTS[fs?.count ?? 1].n[j]);
  const scat = split.map((_, j) => SCATTER_PAYS[j]);
  const mu = split.reduce((a, p, j) => a + p * spins[j], 0), Sbar = split.reduce((a, p, j) => a + p * scat[j], 0);
  const retrig = fs?.retrigger ? Math.min(RETRIGGER.chance, RETRIGGER.cap / mu) : 0;
  const EK = mu / (1 - retrig * mu);
  const mult: [number, number][] = enh.randMult ?? [[enh.mult ?? 1, 1]];
  const mbar = mult.reduce((a, [v, p]) => a + v * p, 0), m2 = mult.reduce((a, [v, p]) => a + v * v * p, 0);
  const fsA = Sbar * (1 + EK * retrig), fsB = EK * (1 - retrig) * mbar * enh.uplift;
  if (iFs >= 0) Object.assign(feats[iFs], { A: fsA, B: fsB, secs: EK });

  // Hold & spin: credits = orbs × the average orb (a jackpot orb replaces one; the top level fills the screen).
  let hns: HnsInfo | null = null;
  if (iHns >= 0) {
    const h = d.hns!, start = hnsTrigger(spots), land = HNS_LAND[h.land]?.p ?? HNS_LAND[1].p;
    const dist = hnsChain(spots, start, land);
    const top = levels.length - 1, fi = feats[iHns];
    const grand = fi.lv.includes(top) ? top : -1;
    const cond = Array.from(dist);
    if (grand >= 0) { cond[spots] = 0; const t = sum(cond); for (let n = 0; n <= spots; n++) cond[n] /= t; }
    const orbW = ORB_SPREAD[h.values]?.w ?? ORB_SPREAD[1].w;
    const [om, om2] = moments(ORB_VALUES, orbW);
    const os2 = om2 - om * om;
    hns = { spots, start, land, cum: cumOf(cond), grand, orbCum: cumOf(orbW), orbMu: om, orbS2: os2 };
    // Credits' moments: n orbs of credit (n − 1 when a jackpot orb shows).
    const cG = grand >= 0 ? fi.lc[fi.lv.indexOf(grand)] : 0;
    const cJo = sum(fi.lc) - cG;
    const cm = (n: number) => [n * om, n * os2 + n * n * om * om];
    let v = 0, x2 = 0, en = 0;
    for (let n = 0; n <= spots; n++) {
      if (!cond[n]) continue;
      const w = cond[n] * (1 - cG);
      en += w * n;
      const [a1, a2] = cm(n), [b1, b2] = cm(Math.max(0, n - 1));
      const jo = w > 0 ? cJo / (1 - cG || 1) : 0;
      v += w * ((1 - jo) * a1 + jo * b1);
      x2 += w * ((1 - jo) * a2 + jo * b2);
    }
    if (cG > 0) { const [a1, a2] = cm(spots); v += cG * a1; x2 += cG * a2; en += cG * spots; }
    Object.assign(fi, { A: v, B: 0, secs: 1.5 * (en - start + HNS_RESPINS) + 2 });
    fi.x2 = x2;
  }
  // Pick: until collect (a prize table), or match three (jackpots only).
  let pick: Compiled["pick"] = null;
  if (iPick >= 0) {
    const t = PICK_PRIZES[d.pick!.size] ?? PICK_PRIZES[1];
    pick = { mode: d.pick!.mode, x: t.x, cum: cumOf(t.w) };
    if (d.pick!.mode === "collect") { const [m1, m2] = moments(t.x, t.w); Object.assign(feats[iPick], { A: m1 }); feats[iPick].x2 = m2; }
  }
  // Wheel: credit segments; jackpot segments come with their levels' chances.
  let wheel: Compiled["wheel"] = null;
  if (iWheel >= 0) {
    const segs = WHEEL_SEGS[d.wheel!.spread] ?? WHEEL_SEGS[1], fi = feats[iWheel];
    wheel = { x: segs.x, cum: cumOf(WHEEL_W) };
    const [m1, m2] = moments(segs.x, WHEEL_W), cj = sum(fi.lc);
    Object.assign(fi, { A: (1 - cj) * m1 }); fi.x2 = (1 - cj) * m2;
  }
  // Offer: a fair walk (×0.4 or ×1.5) from its size; its second moment if every offer is refused.
  const offer = iOffer >= 0 ? (OFFER_SIZES[d.offer!.size] ?? OFFER_SIZES[1]).v : 0;
  if (iOffer >= 0) {
    const e2 = OFFER_STEP.pLo * OFFER_STEP.lo ** 2 + (1 - OFFER_STEP.pLo) * OFFER_STEP.hi ** 2;
    Object.assign(feats[iOffer], { A: offer }); feats[iOffer].x2 = offer * offer * Math.pow(e2, OFFER_STEP.offers);
  }
  // Collector: a full meter pays credits, or super free spins (a free spins feature with everything ×3).
  let col: Compiled["col"] = null;
  if (iCol >= 0) {
    const cc = d.collect!, N = COLLECT_SIZES[cc.size] ?? 20;
    col = { N, chance: Math.min(1, N / cc.every), prize: superFs ? "super" : "credits", x: cc.x };
    if (superFs) Object.assign(feats[iCol], { A: 3 * fsA, B: 3 * fsB, secs: 3 + EK });
    else { Object.assign(feats[iCol], { A: cc.x }); feats[iCol].x2 = cc.x * cc.x; }
  }

  // Base game modifiers: cascades (a geometric chain of wins), mystery (a multiplier on some wins, or a wild storm).
  const casP = !classic && d.cascade ? CASCADE_CHAIN[d.cascade.chain]?.p ?? 0.3 : 0;
  const ladder = d.cascade?.climb ? CASCADE_LADDER : [1];
  const Kc = casP ? cascadeMoments(casP, ladder, 1, 1).K : 1;
  const mysKind = !classic && d.mystery ? d.mystery.kind : null;
  const mysP = mysKind ? 1 / d.mystery!.every : 0;
  const [mm1, mm2] = moments(MYSTERY_MULT.map((q) => q[0]), MYSTERY_MULT.map((q) => q[1]));
  const Km = mysKind === "mult" ? 1 + mysP * (mm1 - 1) : mysKind === "wilds" ? 1 + mysP * (STORM_UPLIFT - 1) : 1;
  const M = Kc * Km;

  // What's left for the base game: b per base draw (closed form, docs/spec/designer.md §3). Rn: what a spin that
  // isn't an exclusive jackpot returns, jackpots won inside features excluded.
  const Rn = (T - J) / (1 - PJ);
  const baseOf = () => {
    const Q = sum(feats.map((f) => f.q));
    return (Rn - sum(feats.map((f) => f.q * f.A))) / ((1 - Q) * M + sum(feats.map((f) => f.q * f.B)));
  };
  let b = baseOf();
  // The base game needs at least a quarter of the target to keep a hit rate at all: features made rarer.
  let shrunk = false;
  // A feature that awards jackpots keeps triggering at least as often as they need.
  const qMin = (fi: FeatInfo) => sum(fi.lv.map((i) => levels[i].p)) / ((1 - PJ) * (fi.id === "pick" ? 1 : 0.9));
  for (let it = 0; it < 60 && feats.length && b < T / 4; it++) {
    for (const f of feats) if (!(f.id === "pick" && d.pick!.mode === "match")) f.q = Math.max(f.q * 0.85, qMin(f));
    b = baseOf();
    shrunk = true;
  }
  if (shrunk) {
    notes.push("Features made rarer: together they ate the base game");
    for (const fi of feats) fi.lc = fi.lv.map((i) => (fi.q > 0 ? levels[i].p / ((1 - PJ) * fi.q) : 0));
  }
  for (const f of feats) { f.v = f.A + f.B * b; }
  const Q = sum(feats.map((f) => f.q));
  const q = iFs >= 0 ? feats[iFs].q : 0;

  // Hit rate: overall (any pay) → base ladder.
  const hMax = Math.min(lay.hit[1], 1 - LUCK_ROOM / T), hMin = lay.hit[0];
  const hWant = Math.min(Math.max(d.hit, hMin), hMax);
  const toBase = (hh: number) => ((hh - PJ) / (1 - PJ) - Q) / (1 - Q);
  const toAll = (hb: number) => PJ + (1 - PJ) * (Q + (1 - Q) * hb);
  const s = 0.08 + 0.62 * d.vol;
  const src = classic ? classicEntries(d, top) : videoEntries(d, pt, { wildx: false, expand: -1 });
  const solved = solveLadder(src, b, Math.min(0.95, Math.max(0.005, toBase(hWant))), s, big);
  const base = solved.lad;
  // A wild storm draws from a richer ladder with more hits (the screen shows the extra wilds).
  const storm = mysKind === "wilds" ? solveLadder(src, STORM_UPLIFT * b, Math.min(0.9, base.hit * 1.4), Math.min(0.9, base.big), big).lad : null;
  const hb = storm ? (1 - mysP) * base.hit + mysP * storm.hit : base.hit;
  const hitRange: [number, number] = [Math.max(hMin, toAll(solved.lo)), Math.min(hMax, toAll(solved.hi))];
  const hit = toAll(hb);
  if (Math.abs(hit - d.hit) > 0.005) notes.push(`Hit rate ${Math.round(d.hit * 100)}% isn't reachable here: ${Math.round(hit * 100)}%`);
  // Free spins ladders.
  let fsL: Ladder[] = [base];
  if (fs && (enh.id === "wildx" || enh.id === "extra" || enh.id === "expand")) {
    const Efs = enh.uplift * b, hfs = Math.min(0.85, base.hit * enh.hitUp), sfs = Math.min(0.9, base.big * enh.volUp + (enh.id === "expand" ? 0.15 : 0));
    if (enh.id === "expand") fsL = Array.from({ length: PAYING }, (_, e) => solveLadder(videoEntries(d, pt, { wildx: false, expand: e }), Efs, hfs, sfs, big).lad);
    else fsL = [solveLadder(videoEntries(d, pt, { wildx: enh.id === "wildx", expand: -1 }), Efs, hfs, sfs, big).lad];
  }
  const EL = fsL.reduce((a, l) => a + l.ev, 0) / fsL.length, EL2 = fsL.reduce((a, l) => a + l.e2, 0) / fsL.length;
  // Moments of one free spins feature (docs/spec/designer.md §3): W is one free spin with everything it retriggers.
  const ES = Sbar, ES2 = split.reduce((a, p, j) => a + p * scat[j] * scat[j], 0), ESN = split.reduce((a, p, j) => a + p * scat[j] * spins[j], 0);
  const ENN1 = split.reduce((a, p, j) => a + p * spins[j] * (spins[j] - 1), 0);
  const EY = mbar * EL, EY2 = m2 * EL2;
  const EW = ((1 - retrig) * EY + retrig * ES) / (1 - retrig * mu);
  const EW2 = ((1 - retrig) * EY2 + retrig * (ES2 + 2 * EW * ESN + ENN1 * EW * EW)) / (1 - retrig * mu);
  const fsAvg = fs ? ES + mu * EW : 0, fsX2 = ES2 + 2 * EW * ESN + mu * EW2 + ENN1 * EW * EW;
  if (iFs >= 0) feats[iFs].x2 = fsX2;
  if (iCol >= 0 && superFs) feats[iCol].x2 = 9 * fsX2;
  // Base spin moments with cascades and mystery.
  const baseMoments = (l: Ladder): [number, number] => {
    if (!casP || l.hit <= 0) return [l.ev * Kc, l.e2];
    const cm = cascadeMoments(casP, ladder, l.ev / l.hit, l.e2 / l.hit);
    return [l.ev * cm.K, l.hit * cm.e2w];
  };
  let [bE, bE2] = baseMoments(base);
  if (storm) { const [sE, sE2] = baseMoments(storm); bE = (1 - mysP) * bE + mysP * sE; bE2 = (1 - mysP) * bE2 + mysP * sE2; }
  if (mysKind === "mult") { bE *= Km; bE2 *= 1 + mysP * (mm2 - 1); }
  // The whole spin.
  const na = 1 - PJ;
  const featEv = sum(feats.map((f) => f.q * f.v)), featE2 = sum(feats.map((f) => f.q * f.x2));
  const jEv = J, jE2 = sum(levels.map((l) => l.p * l.xbar * l.xbar));
  const ev = jEv + na * (featEv + (1 - Q) * bE);
  const e2 = jE2 + na * (featE2 + (1 - Q) * bE2);
  const h = 1 - na * (1 - Q) * (1 - hb);
  const mNJ = featEv + (1 - Q) * bE, vFelt = featE2 + (1 - Q) * bE2 - mNJ * mNJ;
  const baseShare = na * (1 - Q) * b;
  const budget: Budget = {
    jackpots: J,
    scatter: iFs >= 0 ? na * q * (ES + EK * retrig * ES) : 0,
    fs: iFs >= 0 ? na * q * EK * (1 - retrig) * EY : 0,
    big: baseShare * base.big,
    small: baseShare * (1 - base.big),
    hns: iHns >= 0 ? na * feats[iHns].q * feats[iHns].v : 0,
    pick: iPick >= 0 ? na * feats[iPick].q * feats[iPick].v : 0,
    wheel: iWheel >= 0 ? na * feats[iWheel].q * feats[iWheel].v : 0,
    offer: iOffer >= 0 ? na * feats[iOffer].q * feats[iOffer].v : 0,
    collect: iCol >= 0 ? na * feats[iCol].q * feats[iCol].v : 0,
    cascade: baseShare * (Kc - 1),
    mystery: baseShare * Kc * (Km - 1),
  };
  // Near misses: two scatters (or bonus or jackpot symbols) short, or a top symbol just off the line.
  const natural = feats.length || levels.length ? 0.12 : classic ? 0.08 : 0.04;
  const near = Math.min(0.6, natural * d.show.near);
  const pJ = levels.map((l) => l.p), jx = levels.map((l) => l.xbar);
  const c: Compiled = {
    d, lay, pt, top, base, fsL, levels, pJ, jx, PJ, feats, Q, q, split, spins, scat, retrig, mult,
    cas: casP ? { p: casP, ladder, K: Kc } : null, mys: mysKind ? { kind: mysKind, p: mysP, storm } : null, M,
    hns, pick, wheel, offer, col, budget, hit, hitRange, notes, fsAvg, fsSpins: EK,
    v: e2 - T * T, h, vFelt, near, natural,
    model: {
      id, name: d.name, denom: d.denom, minCredits: d.minBet, maxCredits: d.maxBet, spin: SPEEDS[d.show.speed]?.spin ?? 3, rtp: T,
      pays: [], jackpotX: 100, breakChance: d.cab.type === "stepper" ? 1 / 450 : d.cab.type === "giant" ? 1 / 400 : 1 / 600,
      nearMiss: near, ldwFeel: CELEBRATE[d.show.ldw]?.feel ?? 0.3, look: "cherry",
      stats: { v: e2 - T * T, h },
    },
  };
  if (Math.abs(ev - T) > 1e-9) c.notes.push(`internal: returns ${ev}`);
  c.model.draw = (r: Uniform) => spinX(c, r);
  let pays: Pay[] | null = null;
  Object.defineProperty(c.model, "pays", { get: () => (pays ??= summarize(c)), enumerable: true });
  void CABINETS; void WILD;
  return c;
}

// ---------------------------------------------------------------------------------------------------------
// Drawing a spin (the floor's fast path; sim/design/spin.ts records the same draws for display).

/**
 * The machine a spin is played on (M8.5): off in the lab (progressives pay their mean, must-hit-by meters and
 * collectors are outcomes of their own); on for the floor and your own play, where they are live.
 */
export interface SpinCtx {
  on: boolean;
  /** This bet ÷ the design's largest bet (at most 1): a progressive's chance scales with it. */
  jf: number;
  /** Progressive meters in multiples of this bet, per level (a hit resets it to NaN: the caller reseeds). */
  mx: number[];
  /** Collector progress (updated). */
  col: number;
}
export const spinCtx: SpinCtx = { on: false, jf: 1, mx: [], col: 0 };

/** What the last `spinX` did, for the round's length and feel (no allocation on the floor). */
export const lastSpin = {
  /** 0 base, 1 feature, 2 jackpot. */
  kind: 0 as 0 | 1 | 2 | 3,
  spins: 0, level: -1,
  /** Seconds the spin adds at 1× (features, cascades); the feature played; a jackpot won on too small a bet; collector pieces and a full meter. */
  secs: 0, feat: "" as TrigId | "", voided: -1, pieces: 0, full: false,
};

/** The pay of level i (× bet) when it hits: the live meter on a machine, its mean in the lab. */
const levelPay = (c: Compiled, i: number) => {
  const l = c.levels[i];
  if (l.kind === "fixed") return l.x;
  if (spinCtx.on && l.kind !== "mhb") return spinCtx.mx[i] ?? l.xbar;
  return l.xbar;
};
/** Whether a level hit on this bet counts: max-bet-only levels need the largest bet; progressives' chance scales with the bet. */
function levelCounts(c: Compiled, i: number, r: Uniform): boolean {
  if (!spinCtx.on) return true;
  const l = c.levels[i];
  if (l.max) { if (spinCtx.jf < 1 - 1e-9) { lastSpin.voided = i; return false; } return true; }
  if (l.kind === "sa" || l.kind === "linked") return spinCtx.jf >= 1 - 1e-9 || r.next() < spinCtx.jf;
  return true;
}

/** A win drawn from a ladder given that it wins. */
export function drawWin(l: Ladder, r: Uniform): Entry {
  const u = r.next() * l.hit;
  let a = 0, b = l.cum.length - 1;
  while (a < b) { const m = (a + b) >> 1; if (l.cum[m] > u) b = m; else a = m + 1; }
  return l.e[a];
}

/** One spin, × the bet. */
export function spinX(c: Compiled, r: Uniform): number {
  lastSpin.kind = 0; lastSpin.spins = 0; lastSpin.level = -1; lastSpin.secs = 0; lastSpin.feat = ""; lastSpin.voided = -1; lastSpin.pieces = 0; lastSpin.full = false;
  let x = spinCore(c, r);
  // Collector pieces land on any spin; a full meter pays its prize (on a machine: the model draws it as an outcome).
  if (c.col && spinCtx.on && r.next() < c.col.chance) {
    lastSpin.pieces = 1;
    if (++spinCtx.col >= c.col.N) {
      spinCtx.col = 0;
      lastSpin.full = true;
      x += collectPrize(c, r);
      if (!lastSpin.kind) lastSpin.kind = 1;
      lastSpin.feat = "collect";
    }
  }
  return x;
}

function spinCore(c: Compiled, r: Uniform): number {
  let u = r.next();
  for (let i = 0; i < c.levels.length; i++) {
    const l = c.levels[i];
    if (l.f >= 0) continue;
    if (u < l.p) {
      // Must-hit-by meters hit when they cross their point (the caller does that); on a machine this outcome is a loss.
      if (l.kind === "mhb" && spinCtx.on) return 0;
      if (!levelCounts(c, i, r)) { if (lastSpin.voided >= 0) { lastSpin.kind = 2; return 0; } break; }
      lastSpin.kind = 2; lastSpin.level = i; lastSpin.secs = 3;
      return levelPay(c, i);
    }
    u -= l.p;
  }
  let v = r.next();
  for (const f of c.feats) {
    if (v < f.q) {
      lastSpin.kind = 1; lastSpin.feat = f.id;
      if (f.id === "collect" && spinCtx.on) { lastSpin.kind = 0; lastSpin.feat = ""; return 0; }
      return playFeature(c, f, r);
    }
    v -= f.q;
  }
  return baseSpin(c, r);
}

/** A base spin: a win from the ladder (a wild storm's now and then), its cascades, a mystery multiplier. */
function baseSpin(c: Compiled, r: Uniform): number {
  const storm = c.mys?.storm && r.next() < c.mys.p ? c.mys.storm : null;
  const lad = storm ?? c.base;
  const e = drawEntry(lad, r);
  if (!e) return 0;
  let x = e.x;
  if (c.cas) {
    let k = 1;
    while (k < 60 && r.next() < c.cas.p) { x += c.cas.ladder[Math.min(c.cas.ladder.length - 1, k)] * drawWin(lad, r).x; k++; }
    lastSpin.secs += 0.8 * (k - 1);
  }
  if (c.mys?.kind === "mult" && r.next() < c.mys.p) x *= drawMysteryMult(r);
  return x;
}
export function drawMysteryMult(r: Uniform): number {
  let u = r.next();
  for (const [m, p] of MYSTERY_MULT) { if (u < p) return m; u -= p; }
  return MYSTERY_MULT[MYSTERY_MULT.length - 1][0];
}

/** Which jackpot level (if any) a feature awards, by its conditional chances. */
export function featLevel(c: Compiled, f: FeatInfo, r: Uniform): number {
  if (!f.lv.length) return -1;
  let u = r.next();
  for (let k = 0; k < f.lv.length; k++) {
    if (u < f.lc[k]) { const i = f.lv[k]; return levelCounts(c, i, r) ? i : -1; }
    u -= f.lc[k];
  }
  return -1;
}
const jpPay = (c: Compiled, i: number) => (i < 0 ? 0 : levelPay(c, i));

function playFeature(c: Compiled, f: FeatInfo, r: Uniform): number {
  switch (f.id) {
    case "fs": { const j = pickSplit(c, r); const x = c.scat[j] + playFree(c, r, c.spins[j]); lastSpin.secs = lastSpin.spins * 0.75 + 2; return x; }
    case "hns": {
      const h = c.hns!, lv = featLevel(c, f, r);
      if (lv >= 0) { lastSpin.level = lv; }
      const n = lv >= 0 && lv === h.grand ? h.spots : drawCum(h.cum, r.next());
      const credits = n - (lv >= 0 && lv !== h.grand ? 1 : 0);
      let x = 0;
      for (let k = 0; k < credits; k++) x += ORB_VALUES[drawCum(h.orbCum, r.next())];
      lastSpin.secs = 1.5 * (n - h.start + HNS_RESPINS) + 2;
      return x + jpPay(c, lv);
    }
    case "pick": {
      lastSpin.secs = f.secs;
      if (c.pick!.mode === "match") { const lv = featLevel(c, f, r); lastSpin.level = lv; return jpPay(c, lv); }
      return c.pick!.x[drawCum(c.pick!.cum, r.next())];
    }
    case "wheel": {
      lastSpin.secs = f.secs;
      const lv = featLevel(c, f, r);
      if (lv >= 0) { lastSpin.level = lv; return jpPay(c, lv); }
      // A jackpot segment on too small a bet lands on a credit segment instead (payback stays exact per bet only at the largest).
      return c.wheel!.x[drawCum(c.wheel!.cum, r.next())];
    }
    case "offer": {
      lastSpin.secs = f.secs;
      // Guests take an offer at random (a fair walk: any way of choosing returns the same on average).
      let v = c.offer;
      for (let k = 0; k < OFFER_STEP.offers; k++) {
        if (r.next() < 0.3) return v;
        v *= r.next() < OFFER_STEP.pLo ? OFFER_STEP.lo : OFFER_STEP.hi;
      }
      return v;
    }
    case "collect": { lastSpin.secs = f.secs; return collectPrize(c, r); }
  }
}
/** A full collector's prize: credits, or super free spins (everything ×3). */
export function collectPrize(c: Compiled, r: Uniform): number {
  const cl = c.col!;
  if (cl.prize === "super") { const j = pickSplit(c, r); const x = 3 * (c.scat[j] + playFree(c, r, c.spins[j])); lastSpin.secs += lastSpin.spins * 0.75 + 3; return x; }
  return cl.x;
}

export function pickSplit(c: Compiled, r: Uniform): number {
  let u = r.next();
  for (let j = 0; j < c.split.length; j++) { if (u < c.split[j]) return j; u -= c.split[j]; }
  return c.split.length - 1;
}
export function drawMult(c: Compiled, r: Uniform): number {
  if (c.mult.length === 1) return c.mult[0][0];
  let u = r.next();
  for (const [v, p] of c.mult) { if (u < p) return v; u -= p; }
  return c.mult[c.mult.length - 1][0];
}
/** Plays a free spins feature of n spins (retriggers add more). */
export function playFree(c: Compiled, r: Uniform, n: number): number {
  const lad = c.fsL.length > 1 ? c.fsL[Math.min(c.fsL.length - 1, Math.floor(r.next() * c.fsL.length))] : c.fsL[0];
  let left = n, total = 0, k = 0;
  while (left > 0 && k < 500) {
    left--; k++;
    if (c.retrig > 0 && r.next() < c.retrig) { const j = pickSplit(c, r); total += c.scat[j]; left += c.spins[j]; continue; }
    const m = drawMult(c, r), e = drawEntry(lad, r);
    if (e) total += m * e.x;
  }
  lastSpin.spins = k;
  return total;
}

/** The whole spin as a table of pays (exact in mean): jackpots at their mean, the rest from a fixed sample. */
function summarize(c: Compiled): Pay[] {
  const out = new Map<number, number>();
  const add = (x: number, p: number) => { if (x > 0 && p > 0) out.set(x, (out.get(x) ?? 0) + p); };
  const saved = { ...spinCtx };
  spinCtx.on = false;
  c.levels.forEach((l) => add(l.xbar, l.p));
  const na = 1 - c.PJ;
  const exactBase = !c.cas && !c.mys;
  if (exactBase) for (const e of c.base.e) add(e.x, na * (1 - c.Q) * e.p);
  // Features (and a modified base game) from a fixed sample, in 1% buckets, rescaled to their exact means.
  const r = seeded(7);
  const sample = (n: number, f: () => number, mean: number, weight: number) => {
    const xs: number[] = [];
    for (let i = 0; i < n; i++) xs.push(f());
    const m = xs.reduce((a, b) => a + b, 0) / n, k = m > 0 ? mean / m : 1;
    xs.sort((a, b) => a - b);
    const step = n / 100;
    for (let i = 0; i < n; i += step) {
      const part = xs.slice(i, i + step);
      add((part.reduce((a, b) => a + b, 0) / part.length) * k, (weight * part.length) / n);
    }
  };
  for (const f of c.feats) {
    if (f.q <= 0) continue;
    // Jackpots won inside are counted above: sample the credits only.
    sample(2000, () => { const x = playFeature(c, { ...f, lv: [], lc: [] }, r); return x; }, f.v, na * f.q);
  }
  if (!exactBase) {
    const bm = c.base.ev * c.M;
    sample(4000, () => baseSpin(c, r), bm, na * (1 - c.Q));
  }
  Object.assign(spinCtx, saved);
  return [...out].map(([x, p]) => ({ x, p })).sort((a, b) => a.x - b.x);
}
