// Table games, video poker and the draw games (FOUNDATIONS §7, §7.2; docs/spec/tables.md). Each game is data:
// its rules and their options, its limits, and the exact math that turns rules (and a player's skill) into a
// per-wager distribution in the same shape as a slot paytable (data/games.ts), so luck, cheating, the suspicion
// tools and the books treat every game alike.
import type { Pay, SlotModel } from "./games";

export type Family = "vpoker" | "blackjack" | "roulette" | "craps" | "baccarat" | "poker" | "keno" | "bingo" | "sports";

/** A rule the player sets per table: option labels (default first) and how rules-aware guests read each (−1..1). */
export interface RuleDef { id: string; name: string; opts: string[]; score: number[] }

export interface TableDef {
  id: Family;
  name: string;
  /** Seconds per round at 1× (one round = WAGERS_PER_ROUND hands). Video poker uses the player's pace. */
  round: number;
  rules: RuleDef[];
  /** Limit presets per hand, [min, max] in dollars (default first); pool games use only the minimum (the stake). */
  limits: [number, number][];
  /** Poker and bingo: players play each other for a pot; the house takes a cut. */
  pool?: boolean;
  /** Players needed before a hand is dealt. */
  minPlayers: number;
  /** Ledger line. */
  ledger: "slots" | "tables" | "poker" | "keno" | "sports";
  /** Wants privacy: better in a high-limit room, worse where foot traffic runs past. */
  privacy?: boolean;
  /** Draws onlookers (craps). */
  onlookers?: boolean;
}

export const TABLE_GAMES: Record<Family, TableDef> = {
  vpoker: {
    id: "vpoker", name: "Video poker", round: 3, minPlayers: 1, ledger: "slots",
    rules: [{ id: "pay", name: "Paytable", opts: ["9/6", "8/5", "7/5", "6/5"], score: [0.4, 0, -0.3, -0.6] }],
    limits: [[0.25, 1.25], [1, 5], [5, 25]],
  },
  blackjack: {
    id: "blackjack", name: "Blackjack", round: 7, minPlayers: 1, ledger: "tables",
    rules: [
      { id: "nat", name: "Natural pays", opts: ["3:2", "6:5"], score: [0.2, -1] },
      { id: "decks", name: "Decks", opts: ["6", "8", "2", "1"], score: [0, -0.1, 0.2, 0.4] },
      { id: "s17", name: "Dealer soft 17", opts: ["Stands", "Hits"], score: [0.1, -0.2] },
    ],
    limits: [[5, 250], [10, 500], [25, 1000], [2, 100], [100, 5000]],
  },
  roulette: {
    id: "roulette", name: "Roulette", round: 10, minPlayers: 1, ledger: "tables",
    rules: [{ id: "zero", name: "Wheel", opts: ["Double zero", "Single zero"], score: [0, 0.7] }],
    limits: [[5, 250], [10, 500], [25, 1000], [2, 100], [100, 5000]],
  },
  craps: {
    id: "craps", name: "Craps", round: 8, minPlayers: 1, ledger: "tables", onlookers: true,
    rules: [{ id: "odds", name: "Odds", opts: ["2×", "None", "1×", "3-4-5×", "10×"], score: [0, -0.6, -0.2, 0.3, 0.6] }],
    limits: [[5, 250], [10, 500], [25, 1000], [2, 100], [100, 5000]],
  },
  baccarat: {
    id: "baccarat", name: "Baccarat", round: 8, minPlayers: 1, ledger: "tables", privacy: true,
    rules: [{ id: "comm", name: "Commission", opts: ["5%", "4%"], score: [0, 0.5] }],
    limits: [[25, 1000], [10, 500], [100, 5000], [5, 250]],
  },
  poker: {
    id: "poker", name: "Poker", round: 12, minPlayers: 2, ledger: "poker", pool: true,
    rules: [{ id: "rake", name: "Rake", opts: ["10%", "5%"], score: [0, 0.5] }],
    limits: [[5, 5], [2, 2], [10, 10], [25, 25]],
  },
  keno: {
    id: "keno", name: "Keno", round: 20, minPlayers: 1, ledger: "keno",
    rules: [],
    limits: [[1, 20], [2, 50], [5, 100]],
  },
  bingo: {
    id: "bingo", name: "Bingo", round: 25, minPlayers: 1, ledger: "keno", pool: true,
    rules: [{ id: "hold", name: "House hold", opts: ["30%", "20%", "40%"], score: [0, 0.5, -0.5] }],
    limits: [[2, 2], [1, 1], [5, 5]],
  },
  // M9.5 (docs/spec/calendar.md): bets on a game at a price; the book's vig is the edge.
  sports: {
    id: "sports", name: "Sportsbook", round: 30, minPlayers: 1, ledger: "sports",
    rules: [{ id: "vig", name: "Price", opts: ["-110", "-105", "-120"], score: [0, 0.5, -0.6] }],
    limits: [[5, 500], [10, 1000], [25, 2500]],
  },
};

/** A table's rule option index per rule (missing = the default, 0). */
export type Rules = number[];
export const ruleOf = (rules: Rules | undefined, k: number) => rules?.[k] ?? 0;

/** How a rules-aware guest reads a table's rules: the sum of each rule's score, −1..1-ish. */
export function rulesScore(fam: Family, rules: Rules | undefined): number {
  return TABLE_GAMES[fam].rules.reduce((s, r, k) => s + r.score[ruleOf(rules, k)], 0);
}

/** Skill levels (docs/spec/tables.md §Guests): 0 poor, 1 typical, 2 sharp. */
export const SKILL_NAMES = ["poor", "typical", "sharp"];
/** Points of edge each skill level gives away at blackjack and at video poker; poker win weights. */
export const BJ_MISTAKES = [0.025, 0.012, 0.003];
export const VP_MISTAKES = [0.03, 0.015, 0.004];
export const POKER_WEIGHT = [0.7, 1, 1.35];
/** A card counter's gain by number of decks, and their bet spread (units, drawn per round). */
export const COUNT_GAIN: Record<number, number> = { 1: 0.015, 2: 0.01, 6: 0.008, 8: 0.006 };
export const COUNT_SPREAD = [1, 1, 1, 2, 4, 8];
/** Poker: most the rake takes from one pot. */
export const RAKE_CAP = 10;

const cache = new Map<string, SlotModel>();
function model(id: string, name: string, pays: Pay[], extra: Partial<SlotModel> = {}): SlotModel {
  let m = cache.get(id);
  if (!m) {
    const rtp = pays.reduce((s, q) => s + q.x * q.p, 0);
    m = { id, name, denom: 1, maxCredits: 1, spin: 5, rtp, pays, jackpotX: 1e9, breakChance: 0, look: "cherry", ...extra };
    cache.set(id, m);
  }
  return m;
}

// ---- Video poker: Jacks or Better, perfect-play frequencies; the paytable sets the full house and flush pays.
const VP_FH_FL: [number, number][] = [[9, 6], [8, 5], [7, 5], [6, 5]];
export function vpModel(pay: number, skill: number): SlotModel {
  const [fh, fl] = VP_FH_FL[pay] ?? VP_FH_FL[0];
  const base: Pay[] = [
    { x: 1, p: 0.21458503 }, { x: 2, p: 0.1292789 }, { x: 3, p: 0.0744487 }, { x: 4, p: 0.01122869 }, { x: fl, p: 0.01101451 },
    { x: fh, p: 0.01151221 }, { x: 25, p: 0.00236255 }, { x: 50, p: 0.00010931 }, { x: 800, p: 0.00002476 },
  ];
  // Mistakes throw away paying hands: a pair of jacks held wrong costs exactly this much return.
  base[0] = { x: 1, p: base[0].p - (VP_MISTAKES[skill] ?? VP_MISTAKES[1]) };
  return model(`vp:${pay}:${skill}`, `Video poker ${VP_FH_FL[pay]?.join("/") ?? "9/6"}`, base, { jackpotX: 800, breakChance: 1 / 900, spin: 3, look: "bell" });
}
/** Perfect-play return of a video poker paytable (the machine's "by design" figure). */
export const vpPayback = (pay: number) => vpModel(pay, 1).rtp + VP_MISTAKES[1];

// ---- Blackjack: loss, push, win, natural. The win chance is solved so the return is exactly 1 − edge.
const BJ_NATURAL = 0.0475, BJ_PUSH = 0.085;
const DECKS = [6, 8, 2, 1];
export const BJ_DECK_ADJ: Record<number, number> = { 1: -0.0048, 2: -0.0019, 6: 0, 8: 0.0002 };
/** House edge of a blackjack table's rules against perfect basic strategy. */
export function bjBaseEdge(rules: Rules | undefined): number {
  const nat65 = ruleOf(rules, 0) === 1, decks = DECKS[ruleOf(rules, 1)] ?? 6, h17 = ruleOf(rules, 2) === 1;
  return 0.004 + BJ_DECK_ADJ[decks] + (h17 ? 0.0022 : 0) + (nat65 ? 0.0139 : 0);
}
export const bjDecks = (rules: Rules | undefined) => DECKS[ruleOf(rules, 1)] ?? 6;
/** Edge against this player: the rules, their mistakes, and a counter's gain. */
export function bjEdge(rules: Rules | undefined, skill: number, counter: number): number {
  return bjBaseEdge(rules) + (BJ_MISTAKES[skill] ?? BJ_MISTAKES[1]) - (counter ? COUNT_GAIN[bjDecks(rules)] : 0);
}
export function bjModel(rules: Rules | undefined, skill: number, counter: number): SlotModel {
  const nat = ruleOf(rules, 0) === 1 ? 1.2 : 1.5, edge = bjEdge(rules, skill, counter);
  const win = (1 - edge - BJ_PUSH - (1 + nat) * BJ_NATURAL) / 2;
  return model(`bj:${(rules ?? []).join(",")}:${skill}:${counter}`, "Blackjack", [
    { x: 1, p: BJ_PUSH }, { x: 2, p: win }, { x: 1 + nat, p: BJ_NATURAL },
  ], { jackpotX: 1e9 });
}

// ---- Roulette: a shared number; every bet pays so its return is 36 / pockets.
export const ROULETTE_BETS = [
  { id: "red", name: "red", covers: 18, x: 2 },
  { id: "dozen", name: "a dozen", covers: 12, x: 3 },
  { id: "straight", name: "a number", covers: 1, x: 36 },
];
export const pockets = (rules: Rules | undefined) => (ruleOf(rules, 0) === 1 ? 37 : 38);
export function rouletteModel(rules: Rules | undefined, bet: number): SlotModel {
  const n = pockets(rules), b = ROULETTE_BETS[bet];
  return model(`rl:${n}:${bet}`, "Roulette", [{ x: b.x, p: b.covers / n }], { shared: true, win: b.x, jackpotX: 36 });
}
/** Whether pocket k (0 = 0, 37 = 00 when there is one, 1-36 the numbers) wins a bet of this kind for a player's pick. */
export function rouletteWins(bet: number, pick: number, k: number): boolean {
  if (k === 0 || k === 37) return false;
  if (bet === 0) return RED.has(k) === (pick % 2 === 0);
  if (bet === 1) return Math.ceil(k / 12) === (pick % 3) + 1;
  return k === (pick % 36) + 1;
}
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

// ---- Craps: one decision per hand, shared by the table. Points 4/10, 5/9, 6/8 are made with 3/9, 4/10, 5/11.
export interface CrapsOutcome { kind: "natural" | "craps" | "made" | "out"; point: number; dice: [number, number]; p: number }
const POINT_WAYS: Record<number, number> = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 };
const MAKE: Record<number, number> = { 4: 3 / 9, 5: 4 / 10, 6: 5 / 11, 8: 5 / 11, 9: 4 / 10, 10: 3 / 9 };
/** True odds paid on an odds bet, as a payout multiple (stake included). */
export const ODDS_X: Record<number, number> = { 4: 3, 5: 2.5, 6: 2.2, 8: 2.2, 9: 2.5, 10: 3 };
const pair = (t: number): [number, number] => [Math.max(1, t - 6), t - Math.max(1, t - 6)];
export const CRAPS_OUTCOMES: CrapsOutcome[] = [
  { kind: "natural", point: 0, dice: [3, 4], p: 6 / 36 }, { kind: "natural", point: 0, dice: [5, 6], p: 2 / 36 },
  { kind: "craps", point: 2, dice: [1, 1], p: 1 / 36 }, { kind: "craps", point: 3, dice: [1, 2], p: 2 / 36 },
  { kind: "craps", point: 12, dice: [6, 6], p: 1 / 36 },
  ...[4, 5, 6, 8, 9, 10].flatMap((n): CrapsOutcome[] => [
    { kind: "made", point: n, dice: pair(n), p: (POINT_WAYS[n] / 36) * MAKE[n] },
    { kind: "out", point: n, dice: [2, 5], p: (POINT_WAYS[n] / 36) * (1 - MAKE[n]) },
  ]),
];
/** The odds multiple a table allows for a point: none, 1×, 2×, 3-4-5×, 10× (rule option order: 2×, none, 1×, 3-4-5×, 10×). */
export function oddsAllowed(rules: Rules | undefined, point: number): number {
  switch (ruleOf(rules, 0)) {
    case 1: return 0;
    case 2: return 1;
    case 3: return point === 6 || point === 8 ? 5 : point === 5 || point === 9 ? 4 : 3;
    case 4: return 10;
    default: return 2;
  }
}
/** Line bets: 0 pass, 1 don't pass (bar 12). Payout multiple for an outcome. */
export function lineX(bet: number, o: CrapsOutcome): number {
  const passWins = o.kind === "natural" || o.kind === "made";
  if (bet === 0) return passWins ? 2 : 0;
  if (o.kind === "craps" && o.point === 12) return 1;
  return passWins ? 0 : 2;
}
export function lineModel(bet: number): SlotModel {
  const pays: Pay[] = [];
  let win = 0, push = 0;
  for (const o of CRAPS_OUTCOMES) { const x = lineX(bet, o); if (x === 2) win += o.p; else if (x === 1) push += o.p; }
  pays.push({ x: 2, p: win });
  if (push) pays.push({ x: 1, p: push });
  return model(`cr:${bet}`, bet ? "Craps (don't pass)" : "Craps (pass line)", pays, { shared: true, win: 2 });
}
/** An odds bet on a point: pays true odds, so it returns exactly 1. */
export const oddsModel = (point: number) => model(`co:${point}`, "Craps (odds)", [{ x: ODDS_X[point], p: MAKE[point] }], { shared: true, win: ODDS_X[point] });

// ---- Baccarat (8 decks): banker, player, tie per coup.
export const BAC_P = { banker: 0.458597, player: 0.446247, tie: 1 - 0.458597 - 0.446247 };
export const BAC_BETS = ["banker", "player", "tie"] as const;
export const commission = (rules: Rules | undefined) => (ruleOf(rules, 0) === 1 ? 0.04 : 0.05);
/** Payout multiple for a bet on a coup (0 banker, 1 player, 2 tie). A tie pushes banker and player bets. */
export function bacX(rules: Rules | undefined, bet: number, coup: number): number {
  if (bet === 2) return coup === 2 ? 9 : 0;
  if (coup === 2) return 1;
  if (coup !== bet) return 0;
  return bet === 0 ? 2 - commission(rules) : 2;
}
export function bacModel(rules: Rules | undefined, bet: number): SlotModel {
  const P = [BAC_P.banker, BAC_P.player, BAC_P.tie], pays: Pay[] = [];
  for (let c = 0; c < 3; c++) { const x = bacX(rules, bet, c); if (x > 0) pays.push({ x, p: P[c] }); }
  return model(`bc:${ruleOf(rules, 0)}:${bet}`, "Baccarat", pays, { shared: true, win: bacX(rules, bet, bet), jackpotX: 9 });
}

// ---- Keno: 20 balls of 80; a ticket of n spots pays by catches (hypergeometric, exact).
export const KENO_SPOTS = [4, 6, 8];
export const KENO_PAYS: Record<number, Record<number, number>> = {
  4: { 2: 1, 3: 4, 4: 110 },
  6: { 3: 1, 4: 5, 5: 80, 6: 1500 },
  8: { 4: 1, 5: 10, 6: 90, 7: 1200, 8: 10000 },
};
const choose = (n: number, k: number) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
export const kenoCatch = (n: number, k: number) => (choose(20, k) * choose(60, n - k)) / choose(80, n);
export function kenoModel(spots: number): SlotModel {
  const pays = Object.entries(KENO_PAYS[spots]).map(([k, x]) => ({ x, p: kenoCatch(spots, +k) }));
  const top = Math.max(...pays.map((q) => q.x));
  return model(`kn:${spots}`, `Keno (${spots}-spot)`, pays, { shared: true, win: pays[0].x, jackpotX: Math.min(top, 1000) });
}

// ---- Pool games: the house's cut.
export const bingoHold = (rules: Rules | undefined) => [0.3, 0.2, 0.4][ruleOf(rules, 0)] ?? 0.3;
export const pokerRake = (rules: Rules | undefined) => (ruleOf(rules, 0) === 1 ? 0.05 : 0.1);

// ---- Sportsbook (M9.5): a bet on one of two even sides at American odds −N: a win returns the stake plus 100/N.
export const SPORTS_PRICE = [110, 105, 120];
export const sportsX = (rules: Rules | undefined) => 1 + 100 / SPORTS_PRICE[ruleOf(rules, 0)];
export function sportsModel(rules: Rules | undefined): SlotModel {
  const x = sportsX(rules);
  return model(`sp:${ruleOf(rules, 0)}`, "Sportsbook", [{ x, p: 0.5 }], { shared: true, win: x, jackpotX: 100 });
}
