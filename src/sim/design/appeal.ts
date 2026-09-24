// How guests judge a design (docs/spec/designer.md §4-5): what they can feel of it (the feel vector), each type's
// Excitement (0-10) and appeal, and the lab's Intensity and Drain. The lab's Excitement is this same model run for
// a panel of the scenario's own guests, without a room, neighbors or novelty. Pure; cached per compiled design.
import { CABINETS, CELEBRATE, LAYOUTS, ROLLUPS, SLOT_THEMES, featuresOf, howOf, kindOf, type SlotDesign } from "../../data/designer";
import { GUEST_TYPES } from "../../data/guests";
import { PAIRINGS, SLOT_TASTES, type SlotTaste } from "../../data/slotTastes";
import type { Pref } from "../../data/guests";
import type { Compiled } from "./compile";

export interface Feel {
  hit: number; win: number; ldw: number;
  /** Free spins features per spin; one feature's average pay and spread (× bet); drama (features, jackpots), 0-1. */
  feat: number; featAvg: number; featCv: number; tension: number;
  /** Top prize × bet. */
  top: number;
  intensity: number; drain: number; spectacle: number; complexity: number;
  near: number; classic: number;
  /** Wagers per minute at 1×, features and roll-ups included. */
  perMin: number;
  /** Bet range in dollars. */
  minBet: number; maxBet: number;
  coherence: number; kiddy: number;
}

/** Piecewise log-linear map through anchor points. */
function scale(v: number, pts: [number, number][]): number {
  if (v <= pts[0][0]) return Math.max(0, (pts[0][1] * v) / pts[0][0]);
  for (let i = 1; i < pts.length; i++) {
    if (v <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * Math.log(v / x0)) / Math.log(x1 / x0);
    }
  }
  return pts[pts.length - 1][1];
}
export const intensityOf = (sd: number) => Math.min(10, scale(sd, [[1.2, 0], [2, 1.5], [3, 3], [6, 5], [12, 7], [25, 9], [40, 10]]));
export const drainOf = (perMin: number) => Math.min(10, scale(perMin, [[2, 1], [5, 3], [8, 5], [12, 7], [20, 10]]));

const LAYOUT_CX: Record<string, number> = { c3: 0.5, r33: 1.5, l20: 3, l40: 4, w243: 3.5, w1024: 4.5, w4096: 5.5 };
const ENH_CX: Record<string, number> = { none: 0, x2: 0.3, x3: 0.3, rand: 0.6, wildx: 1, extra: 0.5, expand: 1 };
const ENH_DRAMA: Record<string, number> = { none: 0, x2: 0.1, x3: 0.15, rand: 0.25, wildx: 0.3, extra: 0.15, expand: 0.35 };
const CAB_SPEC: Record<string, number> = { slant: 0, upright: 1, stepper: 0.5, tall: 2, giant: 3.5 };
const TOPPER_SPEC: Record<string, number> = { none: 0, sign: 0.5, dome: 1, figure: 1.5, wheel: 2.5 };
/** (M8.5) Each feature's drama (tension, 0-1) and how much it adds to the rules a player must follow. */
const FEAT_DRAMA: Record<string, number> = { hns: 0.6, pick: 0.35, wheel: 0.45, offer: 0.55, collect: 0.35 };
const FEAT_CX: Record<string, number> = { fs: 1.5, hns: 1.8, pick: 1, wheel: 0.8, offer: 1, collect: 1.6, cascade: 1.2, mystery: 0.5 };

const feelCache = new WeakMap<Compiled, Feel>();
export function feelOf(c: Compiled): Feel {
  let f = feelCache.get(c);
  if (f) return f;
  const d = c.d, lay = c.lay, PJ = c.PJ, na = 1 - PJ;
  const winP = c.base.e.reduce((a, q) => a + (q.x >= 1 ? q.p : 0), 0), ldwP = c.base.e.reduce((a, q) => a + (q.x < 1 ? q.p : 0), 0);
  // Features: every triggered one (jackpots won inside count toward what a feature is worth); jackpots of their own
  // count toward the top prize and the drama.
  const Q = c.Q, featP = na * Q;
  let fv = 0, fx2 = 0, drama = 0, secs = 0;
  for (const fi of c.feats) {
    if (fi.q <= 0) continue;
    const jv = fi.lv.reduce((a, i, k) => a + fi.lc[k] * c.levels[i].xbar, 0), jv2 = fi.lv.reduce((a, i, k) => a + fi.lc[k] * c.levels[i].xbar ** 2, 0);
    fv += fi.q * (fi.v + jv);
    fx2 += fi.q * (fi.x2 + jv2);
    secs += fi.q * (fi.id === "fs" ? fi.secs * (c.model.spin / 4) : fi.secs * 0.5);
    const dr = fi.id === "fs" ? 0.4 + (d.fs?.retrigger ? 0.15 : 0) + (ENH_DRAMA[d.fs?.enh ?? "none"] ?? 0)
      : (FEAT_DRAMA[fi.id] ?? 0.3) + (fi.id === "wheel" && d.cab.topper === "wheel" ? 0.15 : 0) + (fi.lv.length ? 0.1 : 0) + (fi.id === "pick" && c.pick?.mode === "match" ? 0.1 : 0);
    drama = Math.max(drama, dr);
  }
  const featAvg = Q > 0 ? fv / Q : 0, featSd = Q > 0 ? Math.sqrt(Math.max(0, fx2 / Q - featAvg * featAvg)) : 0;
  const nFeat = c.feats.filter((q) => q.q > 0).length + (c.cas ? 1 : 0) + (c.mys ? 1 : 0);
  const prog = c.levels.filter((l) => l.kind !== "fixed").length;
  // Time per wager: a quarter of a round, features' own time, cascades, and roll-ups on bigger wins.
  const tw = (c.model.spin / 4) * (1 + (c.cas ? c.cas.p / (1 - c.cas.p) * 0.3 : 0)) + na * secs + (ROLLUPS[d.show.rollup]?.s ?? 1.2) * 0.25 * c.base.e.reduce((a, q) => a + (q.x >= 5 ? q.p : 0), 0);
  const perMin = 60 / tw;
  const tension = Math.min(1, drama + 0.1 * Math.max(0, nFeat - 1) + (c.cas ? 0.15 : 0) + (c.mys ? 0.1 : 0)
    + (d.show.antic && (featP > 0 || PJ > 0) ? 0.1 : 0) + 0.08 * c.levels.length + 0.06 * prog);
  const celebrate = ldwP > 0 ? d.show.ldw * 0.5 : 0;
  const has = (id: string) => c.feats.some((q) => q.id === id && q.q > 0);
  f = {
    hit: c.h, win: PJ + na * (Q + (1 - Q) * winP), ldw: na * (1 - Q) * ldwP * (CELEBRATE[d.show.ldw]?.feel ?? 0.3) / 0.3,
    feat: featP, featAvg, featCv: featAvg > 0 ? Math.min(3, featSd / featAvg) : 0, tension,
    top: Math.max(c.top / (lay.win === "classic" ? 1 : lay.units), c.base.e.reduce((a, q) => Math.max(a, q.x), 0), ...c.jx),
    // Intensity is the swing a player feels: jackpots are rare dreams (the top prize), not swings.
    intensity: intensityOf(Math.sqrt(Math.max(0, c.vFelt))), drain: drainOf((1 - d.rtp) * perMin),
    spectacle: Math.min(10, d.show.lights * 1.2 + d.show.sound * 1.2 + CAB_SPEC[d.cab.type] + TOPPER_SPEC[d.cab.topper] + celebrate + (d.show.antic && featP > 0 ? 0.3 : 0)
      + (has("hns") || has("wheel") ? 0.5 : 0) + (c.cas ? 0.4 : 0) + 0.3 * prog),
    complexity: Math.min(10, LAYOUT_CX[d.layout] + (d.wild === "x2" || d.wild === "x3" ? 0.5 : 0) + (d.stacks ? 0.3 : 0)
      + c.feats.filter((q) => q.q > 0).reduce((a, q) => a + (FEAT_CX[q.id] ?? 1), 0) + (d.fs && c.q > 0 ? ENH_CX[d.fs.enh] + (d.fs.retrigger ? 0.3 : 0) : 0)
      + (c.cas ? FEAT_CX.cascade : 0) + (c.mys ? FEAT_CX.mystery : 0) + 0.4 * c.levels.length + 0.2 * prog),
    near: c.near, classic: Math.min(1, (d.layout === "c3" ? 1 : d.layout === "r33" ? 0.5 : 0) + (d.cab.type === "stepper" ? 0.3 : 0)),
    perMin, minBet: d.denom * d.minBet, maxBet: d.denom * d.maxBet,
    coherence: coherenceOf(d), kiddy: SLOT_THEMES[d.theme]?.kiddy ?? 0,
  };
  feelCache.set(c, f);
  return f;
}

/** Hidden pairings (data/slotTastes.ts) plus the signature call matching the theme. */
export function coherenceOf(d: SlotDesign): number {
  let v = d.show.call === SLOT_THEMES[d.theme]?.call ? 0.1 : -0.05;
  const feats = featuresOf(d);
  for (const p of PAIRINGS) {
    if (p.theme && !p.theme.includes(d.theme)) continue;
    if (p.set !== undefined && p.set !== d.set) continue;
    if (p.layout && !p.layout.includes(d.layout)) continue;
    if (p.enh && !(d.fs && p.enh.includes(d.fs.enh))) continue;
    if (p.wild && !p.wild.includes(d.wild)) continue;
    if (p.cab && !p.cab.includes(d.cab.type)) continue;
    if (p.minDenom !== undefined && d.denom * d.minBet < p.minDenom) continue;
    if (p.lights !== undefined && d.show.lights < p.lights) continue;
    if (p.sound !== undefined && d.show.sound < p.sound) continue;
    if (p.retrigger !== undefined && !(d.fs?.retrigger === p.retrigger)) continue;
    if (p.feat && !p.feat.every((q) => feats.includes(q))) continue;
    if (p.jk && !d.jackpots.some((j) => p.jk!.includes(kindOf(j)) && (!p.how || p.how.includes(howOf(j))))) continue;
    if (!p.jk && p.how && !d.jackpots.some((j) => p.how!.includes(howOf(j)))) continue;
    if (p.topper && !p.topper.includes(d.cab.topper)) continue;
    if (p.climb !== undefined && !(d.cascade?.climb === p.climb)) continue;
    if (p.match !== undefined && !((d.pick?.mode === "match") === p.match)) continue;
    if (p.over !== undefined && !(feats.length > p.over)) continue;
    v += p.v;
  }
  // More than two mechanics with nothing tying them together reads as clutter.
  const mech = feats.length + (d.jackpots.length ? 1 : 0) + (d.wild === "x2" || d.wild === "x3" ? 1 : 0) + (d.stacks ? 1 : 0);
  if (mech > 2 && v < 0.2) v -= 0.1 * (mech - 2);
  return Math.max(-0.5, Math.min(0.8, v));
}

/** A preference's fit, -1..1 (1 at the ideal, 0 at the tolerance's edge). */
const fit = (v: number, p: Pref) => Math.max(-1, Math.min(1, 1 - ((v - p.ideal) / p.tol) ** 2)) * p.w;

/** A type's typical stake per wager and visit, and how many wagers a visit holds on this design. */
export function sessionOf(type: string, f: Feel, rtp: number): { stake: number; budget: number; spins: number } {
  const t = GUEST_TYPES[type];
  const budget = t.budget.median, stake = Math.min(f.maxBet, Math.max(f.minBet, ((t.play.stake[0] + t.play.stake[1]) / 2) * budget));
  const byTime = t.minutes.mean * f.perMin, byMoney = budget / (stake * Math.max(0.02, 1 - rtp));
  return { stake, budget, spins: Math.min(byTime, byMoney) };
}

/** How steeply Excitement follows a design's qualities. */
export const EX_SLOPE = 6.5, EX_MID = 0.6;

export interface TypeJudgment { excitement: number; appeal: number; features: number; reasons: string[] }

/** One type's Excitement (0-10) and appeal (0-1.3) for a design, with what they'd say about it. */
export function judge(c: Compiled, type: string): TypeJudgment {
  const f = feelOf(c), tt: SlotTaste = SLOT_TASTES[type] ?? SLOT_TASTES.local, t = GUEST_TYPES[type];
  const sess = sessionOf(type, f, c.d.rtp);
  const reasons: string[] = [];
  const features = sess.spins * f.feat;
  // Features: how often they'd see one (log2 of features per visit) and how good one is.
  let featScore: number;
  if (f.feat > 0) {
    const quality = Math.max(-1, Math.min(1, Math.log10(Math.max(1, f.featAvg)) - 1.1)) * 0.5 + f.tension * 0.5 + Math.min(0.3, f.featCv * 0.1);
    featScore = tt.featAppetite * (fit(Math.log2(Math.max(0.05, features)), tt.feats) * 0.6 + quality);
    if (features < 0.4 && tt.featAppetite > 0.5) reasons.push("Never saw the bonus");
    if (f.featAvg < 12 && c.q > 0) reasons.push("The bonus pays nothing");
    if (quality > 0.45) reasons.push("Loved the bonus");
  } else {
    featScore = tt.featAppetite > 0.6 ? -0.3 * tt.featAppetite : 0;
    if (tt.featAppetite > 0.8) reasons.push("No bonus to play for");
  }
  const dream = tt.dream * Math.max(-0.5, Math.min(1, Math.log10(Math.max(1, (f.top * sess.stake) / sess.budget)) / 2));
  const ldw = tt.ldw * Math.min(1, f.ldw * 3);
  const intensity = fit(f.intensity, tt.intensity);
  const raw = 0.3 + 0.2 * fit(f.hit, tt.hit) + 0.2 * featScore + 0.15 * dream + 0.15 * fit(f.spectacle, tt.spectacle)
    + 0.1 * fit(f.complexity, tt.complexity) + 0.08 * ldw + 0.3 * tt.near * f.near + 0.22 * f.coherence * (0.5 + t.theming) + 0.12 * intensity + 0.08 * tt.classic * f.classic;
  // Squashed, like RCT's ratings (M8.5: steeper, so the whole 0-10 scale is reachable by design).
  const excitement = 10 / (1 + Math.exp(-EX_SLOPE * (raw - EX_MID)));
  // Appeal to sit down: the thrill, how it swings for them, what it costs a minute, and the stakes it takes.
  const drainPen = tt.drain * Math.max(0, f.drain - 5) / 5;
  const tooRich = Math.max(0, Math.min(1, Math.log10(f.minBet / (3 * sess.stake)))), tooSmall = Math.max(0, Math.min(1, Math.log10((((t.play.stake[0] + t.play.stake[1]) / 2) * t.budget.median) / (8 * f.maxBet))));
  const appeal = Math.max(0, Math.min(1.3, tt.base + tt.gain * 0.1 * excitement + 0.2 * intensity - 0.3 * drainPen - 0.45 * tooRich - 0.4 * tooSmall + 0.25 * tt.classic * f.classic));
  if (intensity < -0.5) reasons.push(f.intensity > tt.intensity.ideal ? "Too wild for me" : "Too tame");
  if (drainPen > 0.3) reasons.push("It ate my money fast");
  if (fit(f.spectacle, tt.spectacle) < -0.5) reasons.push(f.spectacle > tt.spectacle.ideal ? "Too loud and flashy" : "A bit dull to look at");
  if (fit(f.complexity, tt.complexity) < -0.5 && f.complexity > tt.complexity.ideal) reasons.push("Too complicated");
  if (ldw < -0.3) reasons.push("Stop celebrating when I lose");
  if (fit(f.hit, tt.hit) > 0.7 * tt.hit.w) reasons.push("Wins come nice and often");
  if (dream > 0.5) reasons.push("That top prize!");
  if (f.coherence > 0.35) reasons.push("Everything about it fits");
  return { excitement, appeal, features, reasons };
}

const judgeCache = new WeakMap<Compiled, Map<string, TypeJudgment>>();
/** Cached judgment (floor use). */
export function judged(c: Compiled, type: string): TypeJudgment {
  let m = judgeCache.get(c);
  if (!m) judgeCache.set(c, (m = new Map()));
  let j = m.get(type);
  if (!j) m.set(type, (j = judge(c, type)));
  return j;
}

/** The cabinet's energy (NRG) strength and radius on the floor from lights and sound. */
export function energyOf(d: SlotDesign): { strength: number; radius: number } {
  const loud = CABINETS[d.cab.type].loud, s = (0.4 + 0.45 * (d.show.lights + d.show.sound) / 2) * loud * 1.6;
  return { strength: Math.round(s * 10) / 10, radius: Math.min(5, 2 + Math.round((d.show.sound + (d.cab.type === "giant" ? 2 : 0)) / 1.5)) };
}

export const layoutName = (d: SlotDesign) => LAYOUTS[d.layout].name;
