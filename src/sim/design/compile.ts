// The slot designer's compiler (docs/spec/designer.md §3): a design becomes exact math. The payback budget is
// solved in closed form (jackpots, the free spins feature, then what's left for the base game), and each ladder of
// wins (base game, free spins) is solved exactly for its return, hit rate and big-win share. Pure and headless.
import {
  CABINETS, CELEBRATE, CLASSIC_PAYS, C_BLANK, C_WILD, FS_COUNTS, FS_ENH, LAYOUTS, LUCK_ROOM, PAYING, R33_PAYS, RETRIGGER,
  SCATTER_PAYS, SCATTER_SPLIT, SPEEDS, TOP_PAY, VIDEO_PAYS, WILD, type LayoutDef, type SlotDesign,
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

export interface Budget { small: number; big: number; scatter: number; fs: number; jackpots: number }

export interface Compiled {
  d: SlotDesign;
  lay: LayoutDef;
  /** Symbol paytable in use: per symbol, pays for 3, 4, 5 (, 6) of a kind (credits per line or unit; classic per coin). */
  pt: number[][];
  top: number;
  base: Ladder;
  /** Free spins ladders: one, or one per expanding symbol (index = symbol). */
  fsL: Ladder[];
  /** Jackpot chance per spin and amount (× bet) per level. */
  pJ: number[];
  jx: number[];
  /** Free spins: trigger chance on a non-jackpot spin, scatter split, spins and scatter pays per scatter count. */
  q: number;
  split: number[];
  spins: number[];
  scat: number[];
  retrig: number;
  /** Free spin multiplier: [value, chance] pairs. */
  mult: [number, number][];
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
  /** Per-spin variance (× bet²) and chance of any pay. */
  v: number;
  h: number;
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
  return JSON.stringify([d.layout, d.denom, d.minBet, d.maxBet, d.rtp, d.hit, d.vol, d.wild, d.stacks, d.fs, d.jackpots, d.show.near, d.show.ldw, d.show.speed, d.cab.type]);
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

function build(d: SlotDesign, id: string): Compiled {
  const lay = LAYOUTS[d.layout], notes: string[] = [];
  const { pt, top } = paytableOf(d);
  const big = bigAt(lay);
  const T = d.rtp;
  // Jackpots: fixed amounts; together at most 35% of the payback.
  const levels = lay.win === "classic" ? d.jackpots.slice(0, 1) : d.jackpots.slice(0, 4);
  let pJ = levels.map((j) => 1 / j.every), jx = levels.map((j) => j.x);
  let J = pJ.reduce((a, p, i) => a + p * jx[i], 0);
  if (J > 0.35 * T) { const k = (0.35 * T) / J; pJ = pJ.map((p) => p * k); J = 0.35 * T; notes.push("Jackpots trimmed: they took more than a third of the payback"); }
  const PJ = pJ.reduce((a, b) => a + b, 0);
  // Free spins.
  const fs = lay.win !== "classic" ? d.fs : null;
  const enh = FS_ENH[fs?.enh ?? "none"];
  const split = SCATTER_SPLIT[lay.reels] ?? SCATTER_SPLIT[5];
  const spins = split.map((_, j) => FS_COUNTS[fs?.count ?? 1].n[j]);
  const scat = split.map((_, j) => SCATTER_PAYS[j]);
  const mu = split.reduce((a, p, j) => a + p * spins[j], 0), Sbar = split.reduce((a, p, j) => a + p * scat[j], 0);
  const retrig = fs?.retrigger ? Math.min(RETRIGGER.chance, RETRIGGER.cap / mu) : 0;
  const EK = mu / (1 - retrig * mu);
  const mult: [number, number][] = enh.randMult ?? [[enh.mult ?? 1, 1]];
  const mbar = mult.reduce((a, [v, p]) => a + v * p, 0), m2 = mult.reduce((a, [v, p]) => a + v * v * p, 0);
  let q = fs ? 1 / fs.every : 0;
  // What's left for the base game: b per base draw (closed form, docs/spec/designer.md §3).
  const R = (T - J) / (1 - PJ);
  const baseOf = (qq: number) => (R - qq * Sbar * (1 + EK * retrig)) / (1 - qq + qq * EK * (1 - retrig) * mbar * enh.uplift);
  let b = baseOf(q);
  // The base game needs at least a third of the target to keep a hit rate at all.
  while (q > 0 && b < T / 3) { q *= 0.8; b = baseOf(q); }
  if (fs && q < 1 / fs.every - 1e-12) notes.push(`Free spins made rarer (1 in ${Math.round(1 / q)}): they ate the base game`);
  // Hit rate: overall (any pay) → base ladder.
  const hMax = Math.min(lay.hit[1], 1 - LUCK_ROOM / T), hMin = lay.hit[0];
  const hWant = Math.min(Math.max(d.hit, hMin), hMax);
  const toBase = (h: number) => ((h - PJ) / (1 - PJ) - q) / (1 - q);
  const toAll = (hb: number) => PJ + (1 - PJ) * (q + (1 - q) * hb);
  const s = 0.08 + 0.62 * d.vol;
  const src = lay.win === "classic" ? classicEntries(d, top) : videoEntries(d, pt, { wildx: false, expand: -1 });
  const solved = solveLadder(src, b, Math.min(0.95, Math.max(0.005, toBase(hWant))), s, big);
  const base = solved.lad;
  const hitRange: [number, number] = [Math.max(hMin, toAll(solved.lo)), Math.min(hMax, toAll(solved.hi))];
  const hit = toAll(base.hit);
  if (Math.abs(hit - d.hit) > 0.005) notes.push(`Hit rate ${Math.round(d.hit * 100)}% isn't reachable here: ${Math.round(hit * 100)}%`);
  // Free spins ladders.
  let fsL: Ladder[] = [base];
  if (fs && (enh.id === "wildx" || enh.id === "extra" || enh.id === "expand")) {
    const Efs = enh.uplift * b, hfs = Math.min(0.85, base.hit * enh.hitUp), sfs = Math.min(0.9, base.big * enh.volUp + (enh.id === "expand" ? 0.15 : 0));
    if (enh.id === "expand") fsL = Array.from({ length: PAYING }, (_, e) => solveLadder(videoEntries(d, pt, { wildx: false, expand: e }), Efs, hfs, sfs, big).lad);
    else fsL = [solveLadder(videoEntries(d, pt, { wildx: enh.id === "wildx", expand: -1 }), Efs, hfs, sfs, big).lad];
  }
  const EL = fsL.reduce((a, l) => a + l.ev, 0) / fsL.length, EL2 = fsL.reduce((a, l) => a + l.e2, 0) / fsL.length;
  // Moments of one feature (docs/spec/designer.md §3): W is one free spin with everything it retriggers.
  const ES = Sbar, ES2 = split.reduce((a, p, j) => a + p * scat[j] * scat[j], 0), ESN = split.reduce((a, p, j) => a + p * scat[j] * spins[j], 0);
  const ENN1 = split.reduce((a, p, j) => a + p * spins[j] * (spins[j] - 1), 0);
  const EY = mbar * EL, EY2 = m2 * EL2;
  const EW = ((1 - retrig) * EY + retrig * ES) / (1 - retrig * mu);
  const EW2 = ((1 - retrig) * EY2 + retrig * (ES2 + 2 * EW * ESN + ENN1 * EW * EW)) / (1 - retrig * mu);
  const fsAvg = ES + mu * EW, fsX2 = ES2 + 2 * EW * ESN + mu * EW2 + ENN1 * EW * EW;
  // The whole spin.
  const qa = (1 - PJ) * q;
  const ev = pJ.reduce((a, p, i) => a + p * jx[i], 0) + qa * fsAvg + (1 - PJ) * (1 - q) * base.ev;
  const e2 = pJ.reduce((a, p, i) => a + p * jx[i] * jx[i], 0) + qa * fsX2 + (1 - PJ) * (1 - q) * base.e2;
  const h = 1 - (1 - PJ) * (1 - q) * (1 - base.hit);
  const budget: Budget = {
    jackpots: J, scatter: qa * ES + qa * EK * retrig * ES,
    fs: qa * EK * (1 - retrig) * EY,
    big: (1 - PJ) * (1 - q) * base.ev * base.big, small: (1 - PJ) * (1 - q) * base.ev * (1 - base.big),
  };
  // Near misses: two scatters (or jackpot symbols) short, or a top symbol just off the line.
  const natural = fs || levels.length ? 0.12 : lay.win === "classic" ? 0.08 : 0.04;
  const near = Math.min(0.6, natural * d.show.near);
  const cab = CABINETS[d.cab.type];
  const c: Compiled = {
    d, lay, pt, top, base, fsL, pJ, jx, q, split, spins, scat, retrig, mult, budget, hit, hitRange, notes, fsAvg, fsSpins: EK,
    v: e2 - T * T, h, near, natural,
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
  void cab;
  return c;
}

// ---------------------------------------------------------------------------------------------------------
// Drawing a spin (the floor's fast path; sim/design/spin.ts records the same draws for display).

/** What the last `spinX` did, for the round's length and feel (no allocation on the floor). */
export const lastSpin = { kind: 0 as 0 | 1 | 2 | 3, spins: 0, level: -1 };

/** One spin, × the bet. kind: 0 base, 1 free spins, 2 jackpot. */
export function spinX(c: Compiled, r: Uniform): number {
  let u = r.next();
  for (let i = 0; i < c.pJ.length; i++) {
    if (u < c.pJ[i]) { lastSpin.kind = 2; lastSpin.level = i; lastSpin.spins = 0; return c.jx[i]; }
    u -= c.pJ[i];
  }
  if (c.q > 0 && r.next() < c.q) {
    lastSpin.kind = 1; lastSpin.level = -1;
    const j = pickSplit(c, r);
    return c.scat[j] + playFree(c, r, c.spins[j]);
  }
  lastSpin.kind = 0; lastSpin.spins = 0; lastSpin.level = -1;
  const e = drawEntry(c.base, r);
  return e ? e.x : 0;
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

/** The whole spin as a table of pays (exact in mean): base and jackpots exactly, features from a fixed sample. */
function summarize(c: Compiled): Pay[] {
  const PJ = c.pJ.reduce((a, b) => a + b, 0), out = new Map<number, number>();
  const add = (x: number, p: number) => { if (x > 0 && p > 0) out.set(x, (out.get(x) ?? 0) + p); };
  c.pJ.forEach((p, i) => add(c.jx[i], p));
  for (const e of c.base.e) add(e.x, (1 - PJ) * (1 - c.q) * e.p);
  if (c.q > 0) {
    const r = seeded(7), n = 4000, xs: number[] = [];
    for (let i = 0; i < n; i++) { const j = pickSplit(c, r); xs.push(c.scat[j] + playFree(c, r, c.spins[j])); }
    const mean = xs.reduce((a, b) => a + b, 0) / n, k = c.fsAvg / mean;
    // Buckets of 1% of the sample, each at its mean.
    xs.sort((a, b) => a - b);
    const pa = (1 - PJ) * c.q;
    for (let i = 0; i < n; i += 40) {
      const part = xs.slice(i, i + 40);
      add((part.reduce((a, b) => a + b, 0) / part.length) * k, (pa * part.length) / n);
    }
  }
  return [...out].map(([x, p]) => ({ x, p })).sort((a, b) => a.x - b.x);
}
