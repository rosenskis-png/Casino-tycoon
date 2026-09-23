// Drawing from the shapes guest data is written in (docs/spec/guests.md §Targets): log-normal, normal, skewed
// bells and weighted picks. Every draw comes from a named stream passed in.
import type { LogNormal, Normal } from "../data/guests";
import type { Rng } from "./rng";

/** Standard normal (Box-Muller; two uniform draws). */
export function gauss(r: Rng): number {
  const u = Math.max(1e-12, r.next()), v = r.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clamp = (x: number, lo = -Infinity, hi = Infinity) => Math.max(lo, Math.min(hi, x));

export function logNormal(r: Rng, d: LogNormal): number {
  return clamp(d.median * Math.exp(d.sigma * gauss(r)), d.min, d.cap);
}

export function normal(r: Rng, d: Normal): number {
  return clamp(d.mean + d.sd * gauss(r), d.min, d.max);
}

/** Right-skewed bell with this mean and sd (a log-normal matched on both), capped. */
export function skewed(r: Rng, mean: number, sd: number, cap = Infinity): number {
  const s2 = Math.log(1 + (sd * sd) / (mean * mean));
  return Math.min(cap, Math.exp(Math.log(mean) - s2 / 2 + Math.sqrt(s2) * gauss(r)));
}

/** Index drawn by weight. */
export function pickIndex(r: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  let u = r.next() * total;
  for (let k = 0; k < weights.length; k++) { u -= weights[k]; if (u < 0) return k; }
  return weights.length - 1;
}

export function pickKey<T extends string>(r: Rng, w: Record<T, number>): T {
  const keys = Object.keys(w) as T[];
  return keys[pickIndex(r, keys.map((k) => w[k]))];
}

export const range = (r: Rng, [lo, hi]: readonly [number, number]) => lo + r.next() * (hi - lo);
