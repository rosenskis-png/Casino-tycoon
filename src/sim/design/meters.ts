// Progressive meters and collectors on real machines (docs/spec/designer.md §2, §3, §10): every bet adds its
// increment to each meter; a hit pays the live meter and resets it to its seed; a must-hit-by meter pays whoever's
// wager carries it past its hidden point, drawn evenly between seed and cap. Linked and must-hit-by meters are one
// per design (every machine of it feeds and can win them); standalone ones live on each machine. Used by the floor,
// your own play and the designer's test machine, each with its own meters. Pure over the records it's given.
import type { Uniform } from "../../data/games";
import type { Meter } from "../state";
import { spinCtx, type Compiled } from "./compile";

/** Where a machine's meters live: the design's shared record (linked, must-hit-by) and the machine's own. */
export interface MeterHost { meters: Record<string, Meter>; own: { meter?: Meter; col?: number }; id: string }

/** The design's largest bet in dollars (progressive seeds and caps are multiples of it). */
export const maxBetOf = (c: Compiled) => c.d.maxBet * c.d.denom;
const shared = (k: string) => k === "linked" || k === "mhb";
export const hasMeters = (c: Compiled) => c.levels.some((l) => l.kind !== "fixed");

function blank(c: Compiled, which: "shared" | "own", r: Uniform | null): Meter {
  const top = maxBetOf(c), m: Meter = { v: [], hit: [], seed: [] };
  c.levels.forEach((l, i) => {
    const mine = l.kind !== "fixed" && (which === "shared" ? shared(l.kind) : !shared(l.kind));
    m.seed[i] = mine ? l.x * top : 0;
    m.v[i] = m.seed[i];
    m.hit[i] = mine && l.kind === "mhb" ? l.x * top + (r ? r.next() : 0.5) * (l.cap - l.x) * top : 0;
  });
  return m;
}
/** The record holding level i's meter (made on first use), or null for a fixed level. */
export function meterFor(h: MeterHost, c: Compiled, i: number, r: Uniform | null = null): Meter | null {
  const l = c.levels[i];
  if (!l || l.kind === "fixed") return null;
  if (shared(l.kind)) {
    let m = h.meters[h.id];
    if (!m || m.v.length !== c.levels.length) h.meters[h.id] = m = blank(c, "shared", r);
    return m;
  }
  let m = h.own.meter;
  if (!m || m.v.length !== c.levels.length) h.own.meter = m = blank(c, "own", r);
  return m;
}
/** A level's meter in dollars now (its seed before anyone has played). */
export function meterValue(h: MeterHost, c: Compiled, i: number): number {
  const l = c.levels[i];
  if (l.kind === "fixed") return l.x * maxBetOf(c);
  const m = shared(l.kind) ? h.meters[h.id] : h.own.meter;
  return m && m.v.length === c.levels.length ? m.v[i] : l.x * maxBetOf(c);
}

/** Before a wager: each meter takes its increment, and the spin sees the meters (in multiples of this bet). */
export function prepSpin(h: MeterHost, c: Compiled, bet: number, r: Uniform) {
  spinCtx.on = true;
  spinCtx.jf = Math.min(1, bet / maxBetOf(c));
  spinCtx.col = h.own.col ?? 0;
  const mx = spinCtx.mx;
  mx.length = c.levels.length;
  for (let i = 0; i < c.levels.length; i++) {
    const l = c.levels[i];
    if (l.kind === "fixed") { mx[i] = l.x; continue; }
    const m = meterFor(h, c, i, r)!;
    m.v[i] += l.inc * bet;
    mx[i] = m.v[i] / bet;
  }
}

/**
 * After a wager: a progressive that paid resets to its seed; a must-hit-by meter past its point pays this wager
 * (returned, × bet) and resets with a new point; the collector's progress is kept on the machine.
 */
export function afterSpin(h: MeterHost, c: Compiled, bet: number, paidLevel: number, r: Uniform): { x: number; level: number } {
  spinCtx.on = false;
  if (c.col) h.own.col = spinCtx.col;
  if (paidLevel >= 0) {
    const l = c.levels[paidLevel];
    if (l && (l.kind === "sa" || l.kind === "linked")) { const m = meterFor(h, c, paidLevel)!; m.v[paidLevel] = m.seed[paidLevel]; }
  }
  let x = 0, level = -1;
  for (let i = 0; i < c.levels.length; i++) {
    const l = c.levels[i];
    if (l.kind !== "mhb") continue;
    const m = meterFor(h, c, i, r)!;
    if (m.v[i] >= m.hit[i]) {
      x += m.v[i] / bet;
      level = i;
      m.v[i] = m.seed[i];
      m.hit[i] = m.seed[i] + r.next() * (l.cap - l.x) * maxBetOf(c);
    }
  }
  return { x, level };
}

/** Money on the meters beyond their seeds: owed to players (a liability in the books). */
export function liability(meters: Record<string, Meter>, objects: { meter?: Meter }[]): number {
  let t = 0;
  const add = (m: Meter | undefined) => { if (m) for (let i = 0; i < m.v.length; i++) t += Math.max(0, m.v[i] - m.seed[i]); };
  for (const m of Object.values(meters)) add(m);
  for (const o of objects) add(o.meter);
  return t;
}
