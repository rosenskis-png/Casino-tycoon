// Named RNG streams. Each stream's position lives in saved state, so adding a stream never reshuffles another.
import type { GameState } from "./state";

function hash(str: string, seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x85ebca6b);
    h = (h ^ (h >>> 13)) >>> 0;
  }
  return Math.imul(h ^ (h >>> 16), 0xc2b2ae35) >>> 0;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
}

/** Returns the named stream for this state. Draws advance `state.rng[name]` (mulberry32). */
export function rng(state: GameState, name: string): Rng {
  if (state.rng[name] === undefined) state.rng[name] = hash(name, state.seed);
  const next = () => {
    let t = (state.rng[name] = (state.rng[name] + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}
