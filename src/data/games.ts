// Slot models (FOUNDATIONS §7). Each paytable is the true per-wager distribution: `x` is the payout as a
// multiple of the bet (0.5 = a loss dressed up as a win), `p` its probability; everything else loses.
// `rtp` is the declared target; `npm run headless` fails unless Σ x·p equals it exactly.
export interface Pay { x: number; p: number }
/** A source of uniform numbers in [0, 1) (sim/rng.ts streams satisfy it). */
export interface Uniform { next(): number }

export interface SlotModel {
  id: string;
  name: string;
  /** Dollars per credit; guests bet minCredits (default 1)..maxCredits credits per wager. */
  denom: number;
  maxCredits: number;
  minCredits?: number;
  /** Seconds per round at 1× (one round = WAGERS_PER_ROUND wagers, docs/spec/clock.md). */
  spin: number;
  rtp: number;
  pays: Pay[];
  /** Payouts at or above this multiple are jackpots (ticker, fanfare). */
  jackpotX: number;
  /** Chance per round that the machine breaks down. */
  breakChance: number;
  /** (M8 hooks) Share of losing spins shown as near misses, and how good a win smaller than the bet feels (0-1). */
  nearMiss?: number;
  ldwFeel?: number;
  /** Reel symbols shown on the cabinet. */
  look: "cherry" | "bell" | "bolt";
  /**
   * (M7) Shared-outcome games (roulette, craps, baccarat, keno): one outcome per hand for the whole table, so luck
   * turns a loss into this bet's win (`win`, its payout multiple) instead of drawing again (docs/spec/tables.md).
   */
  shared?: boolean;
  win?: number;
  /**
   * (M8) Designed slots (docs/spec/designer.md): one spin drawn procedurally from the design's exact math (free
   * spins played out), and its exact hit chance and per-spin variance. `pays` is then a summary of the same
   * distribution (exact in mean) for insurance and the paytable views.
   */
  draw?: (r: Uniform) => number;
  stats?: { v: number; h: number };
}

/** Wagers resolved per visible round: the main money-scale knob (docs/spec/clock.md). */
export const WAGERS_PER_ROUND = 4;

export const SLOT_MODELS: Record<string, SlotModel> = {
  cherry: {
    id: "cherry", name: "Cherry Parade", denom: 0.25, maxCredits: 4, spin: 2.5, rtp: 0.88, jackpotX: 100, breakChance: 1 / 600, look: "cherry",
    pays: [{ x: 0.5, p: 0.2 }, { x: 1, p: 0.12 }, { x: 2, p: 0.06 }, { x: 5, p: 0.03 }, { x: 20, p: 0.008 }, { x: 100, p: 0.001 }, { x: 1000, p: 0.00013 }],
  },
  liberty: {
    id: "liberty", name: "Liberty Bell", denom: 1, maxCredits: 2, spin: 3.5, rtp: 0.92, jackpotX: 100, breakChance: 1 / 900, look: "bell",
    pays: [{ x: 1, p: 0.1 }, { x: 2, p: 0.06 }, { x: 5, p: 0.03 }, { x: 10, p: 0.012 }, { x: 25, p: 0.0068 }, { x: 100, p: 0.001 }, { x: 800, p: 0.0002 }],
  },
  thunder: {
    id: "thunder", name: "Thunder Jackpot", denom: 1, maxCredits: 3, spin: 3, rtp: 0.89, jackpotX: 100, breakChance: 1 / 500, look: "bolt",
    pays: [{ x: 2, p: 0.05 }, { x: 5, p: 0.02 }, { x: 20, p: 0.006 }, { x: 100, p: 0.0012 }, { x: 500, p: 0.0003 }, { x: 2500, p: 0.00012 }],
  },
};

export const expectedReturn = (m: SlotModel) => m.pays.reduce((s, q) => s + q.x * q.p, 0);
export const hitFrequency = (m: SlotModel) => m.pays.reduce((s, q) => s + q.p, 0);
