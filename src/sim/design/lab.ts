// The slot lab (docs/spec/designer.md §4): the par sheet (exact), a session simulator per guest type on common
// random numbers, the panel's verdict, and the three ratings: Excitement (the panel), Intensity and Drain (math).
// Pure; runs on its own seeded generators, never the game's streams.
import { GUEST_TYPES } from "../../data/guests";
import { levelName } from "../../data/designer";
import { seeded } from "../rng";
import { lastSpin, spinX, type Compiled } from "./compile";
import { feelOf, judge, sessionOf } from "./appeal";

export interface ParRow { k: string; v: string }
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const oneIn = (p: number) => (p > 0 ? `1 in ${p >= 0.01 ? Math.round(1 / p).toLocaleString("en-US") : Math.round(1 / p).toLocaleString("en-US")}` : "never");

/** The exact numbers. */
export function parSheet(c: Compiled): ParRow[] {
  const f = feelOf(c), b = c.budget, T = c.d.rtp, rows: ParRow[] = [];
  const PJ = c.pJ.reduce((a, q) => a + q, 0);
  rows.push({ k: "Payback", v: pct(T) });
  rows.push({ k: "Hit rate (any win)", v: pct(c.h) });
  rows.push({ k: "Wins at least the bet", v: pct(f.win) });
  if (f.ldw > 0) rows.push({ k: "Wins smaller than the bet", v: pct(c.base.e.reduce((a, q) => a + (q.x < 1 ? q.p : 0), 0) * (1 - PJ) * (1 - c.q)) });
  rows.push({ k: "Volatility index (SD per spin)", v: `${Math.sqrt(Math.max(0, c.v)).toFixed(1)}× bet` });
  if (c.q > 0) {
    rows.push({ k: "Free spins", v: oneIn((1 - PJ) * c.q) });
    rows.push({ k: "Free spins pay on average", v: `${c.fsAvg.toFixed(1)}× bet over ${c.fsSpins.toFixed(1)} spins` });
    rows.push({ k: "Seeing free spins in 100 spins", v: pct(1 - Math.pow(1 - (1 - PJ) * c.q, 100), 0) });
  }
  const n = c.pJ.length;
  c.pJ.forEach((p, i) => rows.push({ k: `${levelName(n, i, c.lay.win === "classic")[0]}${levelName(n, i, c.lay.win === "classic").slice(1).toLowerCase()} (${c.jx[i]}× bet)`, v: oneIn(p) }));
  rows.push({ k: "Top base award", v: `${Math.round(c.base.e.reduce((a, q) => Math.max(a, q.x), 0)).toLocaleString("en-US")}× bet` });
  rows.push({ k: "Spins a minute (1×)", v: f.perMin.toFixed(0) });
  rows.push({ k: "Drain at min / max bet", v: `$${((1 - T) * f.perMin * f.minBet).toFixed(2)} / $${((1 - T) * f.perMin * f.maxBet).toFixed(2)} a minute` });
  rows.push({ k: "Payback split", v: [`small ${pct(b.small / T, 0)}`, `big ${pct(b.big / T, 0)}`, b.scatter + b.fs > 0 ? `free spins ${pct((b.scatter + b.fs) / T, 0)}` : "", b.jackpots > 0 ? `jackpots ${pct(b.jackpots / T, 0)}` : ""].filter(Boolean).join(" · ") });
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
