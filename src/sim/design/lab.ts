// The slot lab (docs/spec/designer.md §4): the par sheet (exact), a session simulator per guest type on common
// random numbers, the panel's verdict, and the three ratings: Excitement (the panel), Intensity and Drain (math).
// Pure; runs on its own seeded generators, never the game's streams.
import { GUEST_TYPES } from "../../data/guests";
import { FEATURE_NAMES, featuresOf, levelName } from "../../data/designer";
import { seeded } from "../rng";
import { lastSpin, spinX, type Compiled } from "./compile";
import { feelOf, judge, sessionOf } from "./appeal";

export interface ParRow { k: string; v: string }
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const oneIn = (p: number) => (p > 0 ? `1 in ${p >= 0.01 ? Math.round(1 / p).toLocaleString("en-US") : Math.round(1 / p).toLocaleString("en-US")}` : "never");

const FEAT_LABEL: Record<string, string> = { fs: "Free spins", hns: "Hold & spin", pick: "Pick", wheel: "Wheel", offer: "Offer", collect: "Collector" };

/** The exact numbers. */
export function parSheet(c: Compiled): ParRow[] {
  const f = feelOf(c), b = c.budget, T = c.d.rtp, rows: ParRow[] = [];
  const PJ = c.PJ, na = 1 - PJ;
  rows.push({ k: "Payback", v: pct(T) });
  rows.push({ k: "Hit rate (any win)", v: pct(c.h) });
  rows.push({ k: "Wins at least the bet", v: pct(f.win) });
  if (f.ldw > 0) rows.push({ k: "Wins smaller than the bet", v: pct(c.base.e.reduce((a, q) => a + (q.x < 1 ? q.p : 0), 0) * na * (1 - c.Q)) });
  rows.push({ k: "Volatility index (SD per spin)", v: `${Math.sqrt(Math.max(0, c.v)).toFixed(1)}× bet` });
  for (const fi of c.feats) {
    if (fi.q <= 0) continue;
    const name = FEAT_LABEL[fi.id] ?? fi.id, jv = fi.lv.reduce((a, i, k) => a + fi.lc[k] * c.levels[i].xbar, 0);
    rows.push({ k: name, v: fi.id === "collect" ? `fills about ${oneIn(na * fi.q)}` : oneIn(na * fi.q) });
    rows.push({ k: `${name} pays on average`, v: fi.id === "fs" ? `${c.fsAvg.toFixed(1)}× bet over ${c.fsSpins.toFixed(1)} spins` : `${(fi.v + jv).toFixed(1)}× bet${jv > 0 ? ` (jackpots ${jv.toFixed(1)}×)` : ""}` });
    rows.push({ k: `Seeing it in 100 spins`, v: pct(1 - Math.pow(1 - na * fi.q, 100), 0) });
  }
  if (c.cas) rows.push({ k: "Cascades", v: `a win drops again ${pct(c.cas.p, 0)} of the time; base game ×${c.cas.K.toFixed(2)}` });
  if (c.mys) rows.push({ k: c.mys.kind === "mult" ? "Mystery multiplier" : "Wild storm", v: c.mys.kind === "mult" ? `${oneIn(c.mys.p)} wins, ×2 to ×5` : `${oneIn(c.mys.p)} spins` });
  const n = c.levels.length, top = c.d.maxBet * c.d.denom;
  c.levels.forEach((l, i) => {
    const nm = levelName(n, i, c.lay.win === "classic"), name = nm[0] + nm.slice(1).toLowerCase();
    const kind = l.kind === "fixed" ? `${l.x}× bet` : l.kind === "mhb" ? `must hit by $${(l.cap * top).toFixed(0)}, avg $${(l.xbar * top).toFixed(0)}` : `${l.kind === "linked" ? "linked" : "progressive"}, seed $${(l.x * top).toFixed(0)}, avg $${(l.xbar * top).toFixed(0)}`;
    rows.push({ k: `${name} (${kind})`, v: `${oneIn(l.p)}${l.max ? " · largest bet only" : ""}` });
  });
  rows.push({ k: "Top base award", v: `${Math.round(c.base.e.reduce((a, q) => Math.max(a, q.x), 0)).toLocaleString("en-US")}× bet` });
  rows.push({ k: "Spins a minute (1×)", v: f.perMin.toFixed(0) });
  rows.push({ k: "Drain at min / max bet", v: `$${((1 - T) * f.perMin * f.minBet).toFixed(2)} / $${((1 - T) * f.perMin * f.maxBet).toFixed(2)} a minute` });
  const parts = [["small", b.small], ["big", b.big], ["cascades", b.cascade], ["mystery", b.mystery], ["free spins", b.scatter + b.fs], ["hold & spin", b.hns], ["pick", b.pick], ["wheel", b.wheel], ["offer", b.offer], ["collector", b.collect], ["jackpots", b.jackpots]] as [string, number][];
  rows.push({ k: "Payback split", v: parts.filter(([, v]) => v > 1e-6).map(([k, v]) => `${k} ${pct(v / T, 0)}`).join(" · ") });
  return rows;
}

export interface SessionStats {
  type: string;
  /** Median minutes on the machine; share who saw a feature; share who walked away up; median best win (× bet); median longest dry spell (spins). */
  minutes: number; sawFeature: number; up: number; best: number; dry: number;
  /** A typical session's credits over time (dollars, sampled). */
  curve: number[];
}

/** 200 sessions of a type's typical visitor, on the same random numbers for every design (a change moves results smoothly). */
export function sessions(c: Compiled, type: string, n = 200): SessionStats {
  const f = feelOf(c), t = GUEST_TYPES[type], sess = sessionOf(type, f, c.d.rtp);
  const bet = sess.stake, maxSpins = Math.round(t.minutes.mean * f.perMin);
  const r = seeded(4242 + type.length * 97 + type.charCodeAt(0));
  const mins: number[] = [], bests: number[] = [], drys: number[] = [];
  let saw = 0, up = 0;
  const curves: number[][] = [];
  for (let s = 0; s < n; s++) {
    let money = sess.budget, spins = 0, best = 0, dry = 0, maxDry = 0, feat = false;
    const curve: number[] = [money];
    // Leave when broke, when time's up, or up by the type's win goal (its low end).
    const goal = sess.budget * (1 + t.play.winGoal[0]);
    while (spins < maxSpins && money >= bet && money < goal) {
      const x = spinX(c, r);
      money += (x - 1) * bet;
      spins++;
      if (lastSpin.kind) feat = true;
      if (x > best) best = x;
      if (x >= 1) { dry = 0; } else if (++dry > maxDry) maxDry = dry;
      if (spins % 10 === 0) curve.push(Math.round(money));
    }
    curve.push(Math.round(money));
    mins.push(spins / f.perMin);
    bests.push(best);
    drys.push(maxDry);
    if (feat) saw++;
    if (money > sess.budget) up++;
    curves.push(curve);
  }
  const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  // The typical session: the one whose length is the median.
  const order = mins.map((m, i) => [m, i]).sort((a, b) => a[0] - b[0]);
  return { type, minutes: med(mins), sawFeature: saw / n, up: up / n, best: med(bests), dry: med(drys), curve: curves[order[Math.floor(n / 2)][1]] };
}

export interface Ratings { excitement: number; intensity: number; drain: number }
export const RATING_WORDS = ["Very low", "Low", "Medium", "High", "Very high"];
export const INTENSITY_WORDS = ["Low", "Medium", "High", "Very high", "Extreme"];
export const ratingWord = (v: number, words = RATING_WORDS) => words[Math.max(0, Math.min(words.length - 1, Math.floor(v / 2)))];

export interface Panel {
  ratings: Ratings;
  /** Per type: its weight on the panel, Excitement, appeal. */
  byType: { type: string; w: number; excitement: number; appeal: number; reasons: string[] }[];
  /** The panel's most common remarks, in guests' words. */
  verdict: string[];
}

/** A test panel of the scenario's guests (`mix`: slot plays by type), judging a design. */
export function panel(c: Compiled, mix: Record<string, number>): Panel {
  const f = feelOf(c), total = Object.values(mix).reduce((a, b) => a + b, 0) || 1;
  const byType = Object.entries(mix).filter(([t, w]) => w > 0 && GUEST_TYPES[t]).map(([type, w]) => {
    const j = judge(c, type);
    return { type, w: w / total, excitement: j.excitement, appeal: j.appeal, reasons: j.reasons };
  });
  // The panel's Excitement leans toward the guests who'd actually sit down at it (M8.5): a game made for one crowd
  // rates by how that crowd felt, not by the average of people who'd walk past it.
  const pw = byType.map((t) => t.w * (0.4 + Math.max(0, t.appeal)));
  const pt = pw.reduce((a, b) => a + b, 0) || 1;
  const excitement = byType.reduce((a, t, i) => a + (pw[i] / pt) * t.excitement, 0);
  const tally = new Map<string, number>();
  for (const t of byType) for (const r of t.reasons) tally.set(r, (tally.get(r) ?? 0) + t.w);
  const verdict = [...tally].filter(([, w]) => w >= 0.15).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r]) => r);
  return { ratings: { excitement, intensity: f.intensity, drain: f.drain }, byType, verdict };
}

/**
 * (Batch B, owner) A design's one-line description for its cards: its feature, its volatility and who it suits
 * (no crowd names: the player learns those). `wide`: its progressives are wide-area (a stock or sold design).
 */
export function gameBlurb(c: Compiled, wide = false): string {
  const d = c.d, feats = featuresOf(d).map((f) => FEATURE_NAMES[f].toLowerCase());
  const progs = c.levels.filter((l) => l.kind !== "fixed");
  const what = feats.length ? feats.join(", ").replace(/, ([^,]*)$/, " and $1") : c.lay.win === "classic" ? "a classic stepper, no bonus" : "straight reels, no bonus";
  const jp = !c.levels.length ? "" : progs.length
    ? ` with ${progs.some((l) => l.kind === "mhb") ? "a must-hit-by " : ""}${wide && progs.some((l) => l.kind !== "sa") ? "wide-area " : ""}progressive${progs.length > 1 ? "s" : ""}`
    : ` with ${c.levels.length > 1 ? `${c.levels.length} fixed jackpots` : "a fixed jackpot"}`;
  const v = Math.min(4, Math.floor(d.vol * 5)), top = d.maxBet * d.denom;
  const who = top >= 25 ? "big bets for serious players"
    : v <= 0 ? "long, gentle sessions on a small budget"
    : v === 1 ? "steady play with a shot at something bigger"
    : v === 2 ? "players who like some swing"
    : "thrill seekers chasing the big hit";
  const cap = what[0].toUpperCase() + what.slice(1);
  return `${cap}${jp}. ${INTENSITY_WORDS[v]} volatility: ${who}.`;
}
