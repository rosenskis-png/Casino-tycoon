// A spin with everything it shows (docs/spec/designer.md §3, §4): the same draws as the floor's `spinX`, recorded
// with their screens, for playing it yourself and the lab. Test runs can force an outcome: it's drawn from the real
// distribution within that outcome, so a forced Grand looks exactly like a real one.
import { SCATTER, WILD, levelName } from "../../data/designer";
import type { Rng } from "../rng";
import { drawEntry, drawMult, pickSplit, type Compiled, type Entry, type Ladder } from "./compile";
import { build, type Grid } from "./grid";

export type Force = "loss" | "near" | "ldw" | "small" | "big" | "mega" | "epic" | "top" | "fs" | "jp0" | "jp1" | "jp2" | "jp3";
/** Win celebration tiers, in multiples of the bet. */
export const TIERS = { big: 10, mega: 25, epic: 50 };

export interface FreeSpin { x: number; mult: number; e: Entry | null; retrig: number; grid: Grid; pre?: Grid }
export interface Outcome {
  /** Total pay × bet. */
  x: number;
  kind: "loss" | "win" | "fs" | "jackpot";
  /** The base game win on the first screen. */
  e: Entry | null;
  level: number;
  /** Scatters on the first screen, and what they paid. */
  scat: number;
  scatPay: number;
  near: boolean;
  grid: Grid;
  pre?: Grid;
  fs?: { sym: number; spins: FreeSpin[]; total: number };
}

const fsKind = (c: Compiled) => (c.d.fs?.enh === "extra" ? "extra" : c.d.fs?.enh === "wildx" ? "wildx" : "plain");

/** Plays one spin and records it. `draw` false skips building screens (the lab's session simulator). */
export function spinFull(c: Compiled, r: Rng, force?: Force, draw = true): Outcome {
  let level = -1;
  if (force?.startsWith("jp")) level = Math.min(c.pJ.length - 1, Number(force.slice(2)));
  else if (!force) {
    let u = r.next();
    for (let i = 0; i < c.pJ.length; i++) {
      if (u < c.pJ[i]) { level = i; break; }
      u -= c.pJ[i];
    }
  }
  if (level >= 0) {
    // Jackpot symbols: 3 on the line (classic), or 3 + level anywhere.
    const n = c.lay.win === "classic" ? 3 : 3 + level;
    const shown = draw ? build(c, { e: null, scat: 0, jp: n, near: false }, r) : { grid: [] };
    return { x: c.jx[level], kind: "jackpot", e: null, level, scat: 0, scatPay: 0, near: false, grid: shown.grid };
  }
  const trigger = force === "fs" ? c.q > 0 : !force && c.q > 0 && r.next() < c.q;
  if (trigger) {
    const j = pickSplit(c, r), n = 3 + j;
    const fs = playFreeRec(c, r, c.spins[j], draw);
    const shown = draw ? build(c, { e: null, scat: n, jp: 0, near: false }, r) : { grid: [] };
    return { x: c.scat[j] + fs.total, kind: "fs", e: null, level: -1, scat: n, scatPay: c.scat[j], near: false, grid: shown.grid, fs };
  }
  const e = force ? forcedEntry(c.base, force, r) : drawEntry(c.base, r);
  const near = !e && (force === "near" || (!force && r.chance(c.near)));
  const shown = draw ? build(c, { e, scat: 0, jp: 0, near }, r) : { grid: [] as Grid, pre: undefined };
  return { x: e ? e.x : 0, kind: e ? "win" : "loss", e, level: -1, scat: 0, scatPay: 0, near, grid: shown.grid, pre: shown.pre };
}

/** A free spins feature of n spins, recorded (same draws as compile.ts `playFree`). */
function playFreeRec(c: Compiled, r: Rng, n: number, draw: boolean): NonNullable<Outcome["fs"]> {
  const pick = c.fsL.length > 1 ? Math.min(c.fsL.length - 1, Math.floor(r.next() * c.fsL.length)) : 0;
  const lad = c.fsL[pick], kind = fsKind(c);
  const spins: FreeSpin[] = [];
  let left = n, total = 0;
  while (left > 0 && spins.length < 500) {
    left--;
    if (c.retrig > 0 && r.next() < c.retrig) {
      const j = pickSplit(c, r);
      total += c.scat[j];
      left += c.spins[j];
      const shown = draw ? build(c, { e: null, scat: 3 + j, jp: 0, near: false, fs: kind }, r) : { grid: [] };
      spins.push({ x: c.scat[j], mult: 1, e: null, retrig: 3 + j, grid: shown.grid });
      continue;
    }
    const m = drawMult(c, r), e = drawEntry(lad, r);
    if (e) total += m * e.x;
    const shown = draw ? build(c, { e, scat: 0, jp: 0, near: false, fs: kind }, r) : { grid: [] as Grid, pre: undefined };
    spins.push({ x: e ? m * e.x : 0, mult: m, e, retrig: 0, grid: shown.grid, pre: shown.pre });
  }
  return { sym: c.fsL.length > 1 ? pick : -1, spins, total };
}

/** A base win within a forced outcome's range, by its real chances (the nearest range when there's none). */
function forcedEntry(l: Ladder, f: Force, r: Rng): Entry | null {
  if (f === "loss" || f === "near") return null;
  if (f === "top") return l.e.reduce((a, b) => (b.x > a.x ? b : a), l.e[0]) ?? null;
  const bands: Record<string, [number, number]> = { ldw: [0, 1], small: [1, TIERS.big], big: [TIERS.big, TIERS.mega], mega: [TIERS.mega, TIERS.epic], epic: [TIERS.epic, Infinity] };
  const [lo, hi] = bands[f] ?? [1, TIERS.big];
  let set = l.e.filter((q) => q.x > lo && q.x < hi + (hi === Infinity ? 0 : 1e-9) && !(lo === 0 && q.x >= 1));
  if (!set.length) {
    // Nearest: the closest pay to the band.
    const mid = hi === Infinity ? lo * 2 : (lo + hi) / 2;
    const best = l.e.reduce((a, b) => (Math.abs(Math.log(b.x / mid)) < Math.abs(Math.log(a.x / mid)) ? b : a), l.e[0]);
    return best ?? null;
  }
  let u = r.next() * set.reduce((a, q) => a + q.p, 0);
  for (const q of set) { if (u < q.p) return q; u -= q.p; }
  return set[set.length - 1];
}

/** Which forced outcomes a design can show (the designer's Test tab). */
export function forces(c: Compiled): { id: Force; name: string }[] {
  const out: { id: Force; name: string }[] = [{ id: "loss", name: "Loss" }, { id: "near", name: "Near miss" }];
  if (c.base.e.some((q) => q.x < 1)) out.push({ id: "ldw", name: "Small win (< bet)" });
  out.push({ id: "small", name: "Win" }, { id: "big", name: "Big win" }, { id: "mega", name: "Mega win" }, { id: "epic", name: "Epic win" }, { id: "top", name: "Top award" });
  if (c.q > 0) out.push({ id: "fs", name: "Free spins" });
  c.pJ.forEach((_, i) => { const n = levelName(c.pJ.length, i, c.lay.win === "classic"); out.push({ id: `jp${i}` as Force, name: n[0] + n.slice(1).toLowerCase() }); });
  return out;
}

/** Symbols on a screen that are wild or scatter (for the screen's highlights). */
export const specials = { WILD, SCATTER };
