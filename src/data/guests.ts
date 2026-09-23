// Guest types (FOUNDATIONS §6). PROVISIONAL: the roster and every number here are placeholders until the guest
// design discussion (FOUNDATIONS §26, before M3). The structure is the full §6 entry; fields marked (M3/M4)
// are carried but not yet used by the simulation.
import type { Channel } from "./fields";

/** A quality a guest reacts to: the hidden field channels plus DIRT (litter near them). */
export type Taste = Extract<Channel, "NRG" | "CRW" | "PRS" | "TRF"> | "DIRT";
export interface Pref { ideal: number; tol: number; w: number }
export type QuitRule = "winGoal" | "lossLimit" | "broke" | "jackpot";

export interface GuestTypeDef {
  id: string;
  name: string;
  /** Arrival weight and month-by-month multiplier (no time of day; docs/spec/clock.md). */
  arrival: { base: number; season: number[] };
  /** (M3) Group sizes and weights. Everyone arrives alone until groups exist. */
  group: { sizes: number[]; weights: number[] };
  /** Arrival bankroll range in dollars; ATM/cage use (chance to withdraw when low, and cap range). */
  budget: [number, number];
  atm: { chance: number; cap: [number, number] };
  /** (M9) Credit behavior. */
  credit: number;
  /** Appeal of each slot model, 0..1. */
  games: Record<string, number>;
  prefs: Partial<Record<Taste, Pref>>;
  drinking: { sober: number; perVisit: [number, number]; overdo: number };
  /** (M4) Incident tendencies, tolerance for others' incidents, reaction to leniency per house-rule category. */
  incidents: Record<string, number>;
  tolerance: Record<string, number>;
  leniency: Record<string, number>;
  /** How hard scandals hit this type's reputation (M4+). */
  repSensitivity: number;
  /** (M9) Comp appetite. */
  comps: number;
  play: {
    /** 0 = always min credits, 1 = always max. */
    credits: number;
    pace: [number, number];
    quit: Record<QuitRule, number>;
    /** Leave when up this multiple of the bankroll (winGoal rule). */
    winGoal: [number, number];
    /** Leave after losing this fraction of the bankroll (lossLimit rule). */
    lossLimit: [number, number];
    /** (M9) Slow-plays cheap machines for free drinks. */
    compSeek: number;
  };
  /** Need growth per second at 1× (0-100 scale). */
  needs: { bladder: number; hunger: number; thirst: number; fatigue: number };
  /**
   * Knowing the floor (docs/spec/navigation.md). PROVISIONAL stand-in until real returning individuals:
   * `regulars` is the share of arrivals who have been before, `start` the type's familiarity with a new casino,
   * `lapse` the days since a regular's last visit (anything built since then is new to them).
   */
  familiarity: { regulars: number; start: number; lapse: [number, number] };
  /** Seconds of play at 1× that feel like good value for money (NORTH_STAR: time over money). */
  valueSeconds: number;
}

const flat = (v = 1) => Array(12).fill(v);

export const GUEST_TYPES: Record<string, GuestTypeDef> = {
  local: {
    id: "local", name: "Locals",
    arrival: { base: 1, season: flat() },
    group: { sizes: [1], weights: [1] },
    budget: [60, 220], atm: { chance: 0.25, cap: [40, 120] }, credit: 0,
    games: { cherry: 0.5, liberty: 1, thunder: 0.6 },
    prefs: { NRG: { ideal: 5, tol: 5, w: 0.6 }, CRW: { ideal: 2, tol: 3, w: 0.8 }, DIRT: { ideal: 0, tol: 2, w: 0.9 }, PRS: { ideal: 1, tol: 3, w: 0.3 } },
    drinking: { sober: 0.3, perVisit: [1, 2], overdo: 0.05 },
    incidents: {}, tolerance: {}, leniency: {}, repSensitivity: 1, comps: 0.5,
    play: { credits: 0.4, pace: [0.9, 1.2], quit: { winGoal: 2, lossLimit: 3, broke: 1, jackpot: 1 }, winGoal: [0.5, 1.2], lossLimit: [0.6, 1], compSeek: 0.2 },
    needs: { bladder: 0.3, hunger: 0.1, thirst: 0.32, fatigue: 0.4 },
    familiarity: { regulars: 0.8, start: 0.5, lapse: [2, 30] },
    valueSeconds: 260,
  },
  retiree: {
    id: "retiree", name: "Retirees",
    arrival: { base: 0.6, season: [1.3, 1.3, 1.2, 1, 0.9, 0.7, 0.6, 0.6, 0.8, 1, 1.2, 1.3] },
    group: { sizes: [1], weights: [1] },
    budget: [50, 150], atm: { chance: 0.08, cap: [20, 60] }, credit: 0,
    games: { cherry: 1, liberty: 0.7, thunder: 0.2 },
    prefs: { NRG: { ideal: 2, tol: 4, w: 1 }, CRW: { ideal: 1, tol: 2, w: 1 }, DIRT: { ideal: 0, tol: 1, w: 1.2 }, PRS: { ideal: 3, tol: 3, w: 0.5 } },
    drinking: { sober: 0.6, perVisit: [1, 1], overdo: 0.01 },
    incidents: {}, tolerance: {}, leniency: {}, repSensitivity: 1.2, comps: 0.7,
    play: { credits: 0.15, pace: [0.7, 1], quit: { winGoal: 3, lossLimit: 4, broke: 0.5, jackpot: 1 }, winGoal: [0.3, 0.8], lossLimit: [0.5, 0.9], compSeek: 0.4 },
    needs: { bladder: 0.36, hunger: 0.12, thirst: 0.25, fatigue: 0.42 },
    familiarity: { regulars: 0.6, start: 0.4, lapse: [3, 45] },
    valueSeconds: 300,
  },
  tourist: {
    id: "tourist", name: "Tourists",
    arrival: { base: 0.4, season: [0.6, 0.7, 1.1, 1, 1.1, 1.5, 1.7, 1.6, 1, 0.8, 0.7, 1.1] },
    group: { sizes: [1], weights: [1] },
    budget: [100, 400], atm: { chance: 0.35, cap: [60, 200] }, credit: 0,
    games: { cherry: 0.8, liberty: 0.4, thunder: 1 },
    prefs: { NRG: { ideal: 10, tol: 6, w: 1 }, CRW: { ideal: 4, tol: 3, w: 0.5 }, PRS: { ideal: 5, tol: 4, w: 0.8 }, DIRT: { ideal: 0, tol: 1.5, w: 1 }, TRF: { ideal: 3, tol: 3, w: 0.4 } },
    drinking: { sober: 0.15, perVisit: [1, 3], overdo: 0.1 },
    incidents: {}, tolerance: {}, leniency: {}, repSensitivity: 0.8, comps: 0.3,
    play: { credits: 0.7, pace: [1, 1.4], quit: { winGoal: 1, lossLimit: 2, broke: 2, jackpot: 1 }, winGoal: [0.8, 2], lossLimit: [0.7, 1], compSeek: 0.05 },
    needs: { bladder: 0.3, hunger: 0.14, thirst: 0.36, fatigue: 0.38 },
    familiarity: { regulars: 0.05, start: 0.05, lapse: [60, 365] },
    valueSeconds: 200,
  },
};
export type GuestTypeId = keyof typeof GUEST_TYPES;

/** First names for the inspector. Guests are shown by name, never by type (types are earned: FOUNDATIONS §16). */
export const FIRST_NAMES = [
  "Ada", "Al", "Bea", "Bill", "Carl", "Dot", "Deb", "Earl", "Edna", "Frank", "Gus", "Hal", "Ida", "Irv", "Jan", "Joe",
  "June", "Kay", "Lou", "Mae", "Mel", "Nan", "Ned", "Opal", "Pat", "Ray", "Rita", "Sal", "Sue", "Ted", "Val", "Walt",
  "Zeke", "Rosa", "Luis", "Mina", "Kenji", "Priya", "Omar", "Ines", "Tariq", "Lena", "Hugo", "Nia", "Dev", "Yuki",
];
