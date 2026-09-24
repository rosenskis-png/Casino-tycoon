// Money, risk, the regulator, whales and comps (FOUNDATIONS §13, §14, §16, §17; docs/spec/money.md). Starting values,
// checked only against sanity flags until M11.

/** Skimming choices: the share of the gaming win kept off the books. */
export const SKIM_LEVELS = [0, 0.1, 0.2, 0.3, 0.5];
/** Back taxes owed fade this much a month; a found skim is fined this multiple of them. */
export const EVADED_FADE = 0.95;
export const SKIM_FINE_X = 3;
/** Share of gross worth that ordinary loans may reach; monthly interest. */
export const LOAN_SHARE = 0.5;
export const LOAN_RATE = 0.02;
export const LOAN_STEP = 1000;
/** Emergency credit: a share of gross worth (at least the floor), borrowed in steps with a fee, at a steep rate. */
export const EMERGENCY_SHARE = 0.25;
export const EMERGENCY_MIN = 2000;
export const EMERGENCY_STEP = 500;
export const EMERGENCY_FEE = 0.1;
export const EMERGENCY_RATE = 0.06;
/** Reputation lost with every type in a scandal (an emergency loan, skimming exposed). */
export const SCANDAL_REP = 3;
/** Months in a row closing below zero that lose the scenario. */
export const INSOLVENT_MONTHS = 3;
/** Jackpot insurance: the lines a policy can cover above (0 = off), and the insurer's loading on expected claims. */
export const INSURE_OVER = [0, 1000, 5000, 25000];
export const INSURE_LOAD = 1.3;

/** The gaming regulator (docs/spec/money.md): costs to standing, the ladder's money, and the inspector's schedule. */
export const REG = {
  recover: 0.2,
  unpaid: 8, unpaidBig: 15, unpaidBigAt: 1000, unpaidSmall: 2, unpaidSmallAt: 100,
  auditUnpaid: 5, weakControls: 5, weakShare: 0.03, clean: 3,
  skimFound: 20, skimFoundPerShare: 40, skimBase: 0.25,
  fine: 1000, suspendFine: 3000, suspendDays: 3, suspendEvery: 30, revokeDays: 30,
  visitDays: [45, 75] as [number, number], auditEvery: 10, visitSecs: 120,
};
export const REG_LADDER_NAMES = ["Good standing", "Warned", "Fined", "Under audit", "Suspended"];

/** Whales (FOUNDATIONS §17): how often, how rich, what they want. */
export const WHALE = {
  noticeDays: 2, everyDays: [30, 60] as [number, number],
  bankrollX: [2, 4] as [number, number], bankrollMin: 10_000,
  /** They bet this share of the bankroll per hand; stay this long (minutes); quit after losing / winning these shares. */
  betShare: 1 / 25, minutes: [20, 30] as [number, number], lossQuit: 0.8, winQuit: 0.5,
  /** Each unmet request cuts the visit to this share. */
  unmetCut: 0.6,
  games: { baccarat: 0.5, blackjack: 0.25, craps: 0.15, roulette: 0.1 } as Record<string, number>,
  companions: [1, 3] as [number, number],
};
export type WhaleRequest = "game" | "limit" | "private" | "show" | "comp";
export const WHALE_REQUESTS: Record<WhaleRequest, string> = {
  game: "their game", limit: "a table limit that covers their bet", private: "privacy (a high-limit room)", show: "a show", comp: "drinks on the house",
};

/** Comps: theoretical-loss thresholds a policy can pick (0 = off), and what a come-back offer costs and does. */
export const COMP_AT = [0, 5, 20, 100];
export const COMP_KINDS = ["meal", "show", "back", "room"] as const;
export type CompKind = (typeof COMP_KINDS)[number];
export const COMP_NAMES: Record<CompKind, string> = { meal: "Free meal", show: "Free show", back: "Come-back offer", room: "Hotel room" };
/** (M9.6) A comped room: the stay runs this much longer; what the room costs the house. */
export const ROOM_STAY = 1.5;
export const ROOM_COST = 40;
export const COMEBACK_COST = 10;
export const COMEBACK_SOONER = 0.6;
export const COMEBACK_SCORE = 2;
