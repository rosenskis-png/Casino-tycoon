// A spin with everything it shows (docs/spec/designer.md §3, §4): the same draws as the floor's `spinX`, recorded
// with their screens, for playing it yourself and the lab. Test runs can force an outcome: it's drawn from the real
// distribution within that outcome, so a forced Grand looks exactly like a real one. On a machine (`spinCtx.on`)
// progressives pay their live meters and the collector fills; the caller adds a must-hit-by meter that crosses.
import {
  BONUS_OFFER, BONUS_PICK, BONUS_WHEEL, HNS_RESPINS, ORB_VALUES, OFFER_STEP, SCATTER, WILD, levelName,
} from "../../data/designer";
import type { Rng } from "../rng";
import {
  collectPrize, drawCum, drawEntry, drawMult, drawMysteryMult, drawWin, featLevel, lastSpin, pickSplit, spinCtx,
  type Compiled, type Entry, type FeatInfo, type Ladder, type TrigId,
} from "./compile";
import { addPiece, build, type Grid } from "./grid";

export type Force =
  | "loss" | "near" | "ldw" | "small" | "big" | "mega" | "epic" | "top" | "fs" | "jp0" | "jp1" | "jp2" | "jp3"
  | "hns" | "pick" | "wheel" | "offer" | "collect" | "cascade" | "mystery";
/** Win celebration tiers, in multiples of the bet. */
export const TIERS = { big: 10, mega: 25, epic: 50 };

export interface FreeSpin { x: number; mult: number; e: Entry | null; retrig: number; grid: Grid; pre?: Grid }
export interface FreeRec { sym: number; spins: FreeSpin[]; total: number }
/** A hold & spin orb: its spot (reel × rows + row), credits (× bet) or the jackpot level it shows. */
export interface Orb { at: number; x: number; lv: number }
export interface Outcome {
  /** Total pay × bet (an offer's pay is added when it's taken). */
  x: number;
  kind: "loss" | "win" | "fs" | "jackpot" | TrigId;
  /** The base game win on the first screen. */
  e: Entry | null;
  level: number;
  /** Scatters on the first screen, and what they paid. */
  scat: number;
  scatPay: number;
  near: boolean;
  grid: Grid;
  pre?: Grid;
  fs?: FreeRec;
  /** (M8.5) Cascades after the first win: each drop's screen, pay (× bet, multiplier included) and multiplier. */
  casc?: { grid: Grid; x: number; m: number }[];
  /** A mystery multiplier on the base win; a wild storm spin; a mystery jackpot (no symbols). */
  mm?: number;
  storm?: boolean;
  myst?: boolean;
  hns?: { start: Orb[]; steps: Orb[][]; spots: number; level: number; credits: number };
  pick?: { mode: "collect" | "match"; reveals: { x: number; lv: number }[]; level: number; board: number };
  wheel?: { segs: { x: number; lv: number }[]; at: number; level: number; topper: boolean };
  /** An offer's walk: the four offers and the final prize (× bet). */
  offer?: number[];
  /** Collector: a piece landed this spin, the meter before, and a full meter's prize (credits or super free spins). */
  col?: { piece: boolean; before: number; full: boolean; credits: number; super?: FreeRec };
  /** Must-hit-by: a meter crossed its point on this spin (added by the caller). */
  mhb?: { level: number; x: number };
  /** A jackpot hit on too small a bet (max-bet-only). */
  voided?: number;
}

const fsKind = (c: Compiled) => (c.d.fs?.enh === "extra" ? "extra" : c.d.fs?.enh === "wildx" ? "wildx" : "plain");
const featOf = (c: Compiled, id: TrigId) => c.feats.find((f) => f.id === id);
const BONUS_CODE: Partial<Record<TrigId, number>> = { pick: BONUS_PICK, wheel: BONUS_WHEEL, offer: BONUS_OFFER };

/** Plays one spin and records it. `draw` false skips building screens (the lab's session simulator). */
export function spinFull(c: Compiled, r: Rng, force?: Force, draw = true): Outcome {
  lastSpin.voided = -1;
  const out = core(c, r, force, draw);
  if (lastSpin.voided >= 0) out.voided = lastSpin.voided;
  // Collector pieces land on any spin (on a machine); a full meter pays its prize.
  if (c.col && spinCtx.on) {
    const before = spinCtx.col, piece = force === "collect" || r.next() < c.col.chance;
    if (force === "collect") spinCtx.col = c.col.N - 1;
    const col: NonNullable<Outcome["col"]> = { piece, before: force === "collect" ? c.col.N - 1 : before, full: false, credits: 0 };
    if (piece && ++spinCtx.col >= c.col.N) {
      spinCtx.col = 0;
      col.full = true;
      if (c.col.prize === "super") {
        const j = pickSplit(c, r), rec = playFreeRec(c, r, c.spins[j], draw);
        col.super = { ...rec, total: 3 * (c.scat[j] + rec.total) };
        col.credits = col.super.total;
      } else col.credits = c.col.x;
      out.x += col.credits;
    }
    out.col = col;
    if (piece && draw) out.grid = addPiece(c, out.grid, r);
  }
  return out;
}

function core(c: Compiled, r: Rng, force: Force | undefined, draw: boolean): Outcome {
  const blank = (kind: Outcome["kind"], x: number, grid: Grid): Outcome => ({ x, kind, e: null, level: -1, scat: 0, scatPay: 0, near: false, grid });
  // Jackpots won by symbols or at random, a level of their own.
  let level = -1;
  if (force?.startsWith("jp")) {
    level = Math.min(c.levels.length - 1, Number(force.slice(2)));
  } else if (!force) {
    let u = r.next();
    for (let i = 0; i < c.levels.length; i++) {
      const l = c.levels[i];
      if (l.f >= 0) continue;
      if (u < l.p) {
        if (l.kind === "mhb" && spinCtx.on) { level = -2; break; }
        if (spinCtx.on && l.max && spinCtx.jf < 1 - 1e-9) { lastSpin.voided = i; level = -3; break; }
        if (spinCtx.on && (l.kind === "sa" || l.kind === "linked") && spinCtx.jf < 1 - 1e-9 && r.next() >= spinCtx.jf) break;
        level = i;
        break;
      }
      u -= l.p;
    }
  }
  if (level === -2) return { ...blank("loss", 0, draw ? build(c, { e: null, scat: 0, jp: 0, near: false }, r).grid : []) };
  if (level === -3) {
    // Jackpot symbols on too small a bet: they show, and pay nothing.
    const n = c.lay.win === "classic" ? 3 : 3 + lastSpin.voided;
    return { ...blank("loss", 0, draw ? build(c, { e: null, scat: 0, jp: n, near: false }, r).grid : []), voided: lastSpin.voided };
  }
  if (level >= 0) {
    const l = c.levels[level];
    // A level won inside a feature: force that feature with it.
    if (l.f >= 0) return feature(c, c.feats[l.f], r, draw, level);
    const pay = l.kind === "fixed" ? l.x : spinCtx.on && l.kind !== "mhb" ? spinCtx.mx[level] ?? l.xbar : l.xbar;
    if (l.how === "mystery") {
      const g = draw ? build(c, { e: null, scat: 0, jp: 0, near: false }, r).grid : [];
      return { ...blank("jackpot", pay, g), level, myst: true };
    }
    // Jackpot symbols: 3 on the line (classic), or 3 + level anywhere.
    const n = c.lay.win === "classic" ? 3 : 3 + level;
    return { ...blank("jackpot", pay, draw ? build(c, { e: null, scat: 0, jp: n, near: false }, r).grid : []), level };
  }
  // Features.
  const forcedFeat = force === "fs" || force === "hns" || force === "pick" || force === "wheel" || force === "offer" ? featOf(c, force) : undefined;
  if (forcedFeat) return feature(c, forcedFeat, r, draw, -1);
  if (!force) {
    let v = r.next();
    for (const f of c.feats) {
      if (v < f.q) {
        if (f.id === "collect") {
          // On a machine the collector fills for real (spinFull); in the lab its prize is an outcome of its own.
          if (spinCtx.on) return blank("loss", 0, draw ? build(c, { e: null, scat: 0, jp: 0, near: false }, r).grid : []);
          return feature(c, f, r, draw, -1);
        }
        return feature(c, f, r, draw, -1);
      }
      v -= f.q;
    }
  }
  // The base game.
  const storm = !!c.mys?.storm && (force === "mystery" ? c.mys.kind === "wilds" : !force && r.next() < c.mys!.p);
  const lad = storm ? c.mys!.storm! : c.base;
  let e = force === "cascade" || (force === "mystery" && c.mys?.kind === "mult") ? drawWin(lad, r) : force ? forcedEntry(lad, force, r) : drawEntry(lad, r);
  if (force === "mystery" && !e) e = drawWin(lad, r);
  const nearKind = !e && (force === "near" || (!force && r.chance(c.near)));
  const shown = draw ? build(c, { e, scat: 0, jp: 0, near: nearKind, storm }, r) : { grid: [] as Grid, pre: undefined };
  const out: Outcome = { x: e ? e.x : 0, kind: e ? "win" : "loss", e, level: -1, scat: 0, scatPay: 0, near: nearKind, grid: shown.grid, pre: shown.pre };
  if (storm) out.storm = true;
  if (e && c.cas) {
    const casc: NonNullable<Outcome["casc"]> = [];
    let k = 1;
    while (k < 60 && (r.next() < c.cas.p || (force === "cascade" && k < 3))) {
      const m = c.cas.ladder[Math.min(c.cas.ladder.length - 1, k)], w = drawWin(lad, r);
      casc.push({ grid: draw ? build(c, { e: w, scat: 0, jp: 0, near: false, storm }, r).grid : [], x: m * w.x, m });
      out.x += m * w.x;
      k++;
    }
    if (casc.length) out.casc = casc;
  }
  if (e && c.mys?.kind === "mult" && (force === "mystery" || (!force && r.next() < c.mys.p))) {
    out.mm = drawMysteryMult(r);
    out.x *= out.mm;
  }
  return out;
}

/** A triggered feature, played step by step (`lv`: a jackpot level it must award, from a forced or drawn jackpot). */
function feature(c: Compiled, f: FeatInfo, r: Rng, draw: boolean, lv: number): Outcome {
  const base = (kind: Outcome["kind"], grid: Grid): Outcome => ({ x: 0, kind, e: null, level: -1, scat: 0, scatPay: 0, near: false, grid });
  switch (f.id) {
    case "fs": {
      const j = pickSplit(c, r), n = 3 + j;
      const fs = playFreeRec(c, r, c.spins[j], draw);
      const shown = draw ? build(c, { e: null, scat: n, jp: 0, near: false }, r) : { grid: [] };
      return { ...base("fs", shown.grid), x: c.scat[j] + fs.total, scat: n, scatPay: c.scat[j], fs };
    }
    case "hns": return holdSpin(c, f, r, draw, lv);
    case "pick": {
      const shown = draw ? build(c, { e: null, scat: 0, jp: 0, near: false, bonus: BONUS_PICK }, r) : { grid: [] };
      const p = c.pick!;
      if (p.mode === "match") {
        const level = lv >= 0 ? lv : featLevel(c, f, r);
        const reveals = matchReveals(f, level, r);
        return { ...base("pick", shown.grid), x: level >= 0 ? levelPayOf(c, level) : 0, level, pick: { mode: "match", reveals, level, board: 12 } };
      }
      const X = p.x[drawCum(p.cum, r.next())];
      // The prize is set when the feature starts (as in real games); the picks reveal it in parts, then "collect".
      const k = r.int(2, 5), parts: number[] = [];
      let left = X;
      for (let i = 0; i < k - 1; i++) { const q = left * (0.2 + 0.4 * r.next()); parts.push(q); left -= q; }
      parts.push(left);
      return { ...base("pick", shown.grid), x: X, pick: { mode: "collect", reveals: parts.map((x) => ({ x, lv: -1 })).concat({ x: 0, lv: -2 }), level: -1, board: 12 } };
    }
    case "wheel": {
      const shown = draw ? build(c, { e: null, scat: 0, jp: 0, near: false, bonus: BONUS_WHEEL }, r) : { grid: [] };
      const w = c.wheel!;
      const segs = w.x.map((x) => ({ x, lv: -1 }));
      // Jackpot segments sit between the credit ones.
      f.lv.forEach((i, k) => segs.splice(Math.round(((k + 1) * segs.length) / (f.lv.length + 1)), 0, { x: 0, lv: i }));
      const level = lv >= 0 ? lv : featLevel(c, f, r);
      let at: number, x: number;
      if (level >= 0) { at = segs.findIndex((q) => q.lv === level); x = levelPayOf(c, level); }
      else {
        const v = w.x[drawCum(w.cum, r.next())];
        const idx = segs.map((q, i) => (q.lv < 0 && q.x === v ? i : -1)).filter((i) => i >= 0);
        at = idx[r.int(0, idx.length - 1)];
        x = v;
      }
      return { ...base("wheel", shown.grid), x, level, wheel: { segs, at, level, topper: c.d.cab.topper === "wheel" } };
    }
    case "offer": {
      const shown = draw ? build(c, { e: null, scat: 0, jp: 0, near: false, bonus: BONUS_OFFER }, r) : { grid: [] };
      const vals = [c.offer];
      for (let k = 0; k < OFFER_STEP.offers; k++) vals.push(vals[k] * (r.next() < OFFER_STEP.pLo ? OFFER_STEP.lo : OFFER_STEP.hi));
      return { ...base("offer", shown.grid), x: 0, offer: vals };
    }
    case "collect": {
      // The lab's collector prize (on a machine the meter fills for real).
      const x = collectPrize(c, r);
      return { ...base("collect", draw ? build(c, { e: null, scat: 0, jp: 0, near: false }, r).grid : []), x };
    }
  }
}

const levelPayOf = (c: Compiled, i: number) => {
  const l = c.levels[i];
  return l.kind === "fixed" ? l.x : spinCtx.on && l.kind !== "mhb" ? spinCtx.mx[i] ?? l.xbar : l.xbar;
};

/** Hold & spin, respin by respin: orbs lock; any new orb resets the respins to 3. */
function holdSpin(c: Compiled, f: FeatInfo, r: Rng, draw: boolean, lvIn: number): Outcome {
  const h = c.hns!, lv = lvIn >= 0 ? lvIn : featLevel(c, f, r), grand = lv >= 0 && lv === h.grand;
  const orbX = () => ORB_VALUES[drawCum(h.orbCum, r.next())];
  let start: Orb[] = [], steps: Orb[][] = [];
  for (let tries = 0; tries < 200; tries++) {
    const cells = shuffled(h.spots, r);
    start = cells.slice(0, h.start).map((at) => ({ at, x: 0, lv: -1 }));
    const locked = new Set(start.map((o) => o.at));
    steps = [];
    let left = HNS_RESPINS;
    while (left > 0 && locked.size < h.spots) {
      const got: Orb[] = [];
      for (let at = 0; at < h.spots; at++) if (!locked.has(at) && r.next() < h.land) got.push({ at, x: 0, lv: -1 });
      steps.push(got);
      for (const o of got) locked.add(o.at);
      left = got.length ? HNS_RESPINS : left - 1;
    }
    // The Grand fills the screen: the last respins keep landing orbs until it's full.
    if (grand) {
      while (locked.size < h.spots) {
        const free = [...Array(h.spots).keys()].filter((q) => !locked.has(q));
        const got = shuffledOf(free, r).slice(0, Math.min(free.length, r.int(1, 3))).map((at) => ({ at, x: 0, lv: -1 }));
        steps.push(got);
        for (const o of got) locked.add(o.at);
      }
      break;
    }
    // Without the Grand the screen can't fill when the Grand is won by filling it: drawn again (exactly the conditional).
    if (h.grand >= 0 && locked.size >= h.spots) continue;
    break;
  }
  const all = [...start, ...steps.flat()];
  for (const o of all) o.x = orbX();
  if (lv >= 0 && !grand) {
    const o = all[all.length - 1];
    o.x = 0; o.lv = lv;
  }
  const credits = all.reduce((a, o) => a + o.x, 0);
  const x = credits + (lv >= 0 ? levelPayOf(c, lv) : 0);
  const shown = draw ? build(c, { e: null, scat: 0, jp: 0, near: false, orbs: start.map((o) => o.at) }, r) : { grid: [] };
  return { x, kind: "hns", e: null, level: lv, scat: 0, scatPay: 0, near: false, grid: shown.grid, hns: { start, steps, spots: h.spots, level: lv, credits } };
}
function shuffled(n: number, r: Rng): number[] { return shuffledOf([...Array(n).keys()], r); }
function shuffledOf<T>(a: T[], r: Rng): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = r.int(0, i); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

/** Pick to match: tiles turned until three of the awarded level show (no other level reaches three). */
function matchReveals(f: FeatInfo, level: number, r: Rng): { x: number; lv: number }[] {
  const lvls = f.lv.length ? f.lv : [Math.max(0, level)];
  const bag: number[] = [];
  for (const q of lvls) if (q !== level) for (let k = r.int(0, 2); k > 0; k--) bag.push(q);
  if (level >= 0) bag.push(level, level);
  const out = shuffledOf(bag, r);
  // The third of the awarded level comes last; with no award (too small a bet) the board just runs out.
  if (level >= 0) out.push(level);
  return out.map((lv) => ({ x: 0, lv }));
}

/** A free spins feature of n spins, recorded (same draws as compile.ts `playFree`). */
export function playFreeRec(c: Compiled, r: Rng, n: number, draw: boolean): FreeRec {
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
  const set = l.e.filter((q) => q.x > lo && q.x < hi + (hi === Infinity ? 0 : 1e-9) && !(lo === 0 && q.x >= 1));
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
  const has = (id: TrigId) => c.feats.some((f) => f.id === id && f.q > 0);
  if (has("fs")) out.push({ id: "fs", name: "Free spins" });
  if (has("hns")) out.push({ id: "hns", name: "Hold & spin" });
  if (has("pick")) out.push({ id: "pick", name: "Pick" });
  if (has("wheel")) out.push({ id: "wheel", name: "Wheel" });
  if (has("offer")) out.push({ id: "offer", name: "Offer" });
  if (c.col) out.push({ id: "collect", name: "Fill the collector" });
  if (c.cas) out.push({ id: "cascade", name: "Cascades" });
  if (c.mys) out.push({ id: "mystery", name: c.mys.kind === "mult" ? "Mystery multiplier" : "Wild storm" });
  c.levels.forEach((_, i) => { const n = levelName(c.levels.length, i, c.lay.win === "classic"); out.push({ id: `jp${i}` as Force, name: n[0] + n.slice(1).toLowerCase() }); });
  return out;
}

/** Symbols on a screen that are wild or scatter (for the screen's highlights). */
export const specials = { WILD, SCATTER };
export { BONUS_CODE };
