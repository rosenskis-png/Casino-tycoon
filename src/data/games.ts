// Machine models (FOUNDATIONS §7): slots (compiled from designs since M8), video poker and the tables' bets. Each
// paytable is the true per-wager distribution: `x` is the payout as a multiple of the bet (0.5 = a loss dressed up as
// a win), `p` its probability; everything else loses.
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
export const WAGERS_PER_ROUND = 8;

// The original slot models (Cherry Parade, Liberty Bell, Thunder Jackpot) are stock designs since M8
// (data/designs.ts); the slot designer compiles every slot's model (sim/design/compile.ts).

export const expectedReturn = (m: SlotModel) => m.pays.reduce((s, q) => s + q.x * q.p, 0);
export const hitFrequency = (m: SlotModel) => m.pays.reduce((s, q) => s + q.p, 0);
