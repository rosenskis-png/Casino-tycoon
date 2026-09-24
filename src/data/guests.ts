// Guest types (FOUNDATIONS §6, docs/spec/guests.md). A type is who someone is: its tastes, budget, seasons and
// drinking. Group size, play style and chasing are drawn per person from the ranges a type sets, so types overlap
// at the edges. Distribution numbers are the M3 starting targets (docs/spec/guests.md §Targets), tuned headless.
import type { Channel } from "./fields";
import type { IncidentCat } from "./incidents";

/** A quality a guest reacts to: the hidden field channels plus DIRT (litter near them). */
export type Taste = Extract<Channel, "NRG" | "CRW" | "PRS" | "TRF" | "SMK"> | "DIRT" | "THM";
export interface Pref { ideal: number; tol: number; w: number }
export type QuitRule = "winGoal" | "lossLimit" | "broke" | "jackpot";

/** Log-normal (long right tail): the median, the spread (sigma of the log), and optional hard bounds. */
export interface LogNormal { median: number; sigma: number; min?: number; cap?: number }
/** Normal, clamped to optional bounds. */
export interface Normal { mean: number; sd: number; min?: number; max?: number }

export interface GuestTypeDef {
  id: string;
  name: string;
  /** Weight among arrivals and month-by-month multiplier (no time of day; docs/spec/clock.md). */
  arrival: { base: number; season: number[] };
  /** Visits bunch around the 1st and 15th of each month (paydays): how strongly, 0-1. */
  payday: number;
  /**
   * Recurring types keep real returning people in the scenario's pool: `share` of visits end with a plan to come
   * back, `days` later. One-off types have `share` 0 except for the few who return (Tourists).
   */
  returns: { share: number; days: LogNormal };
  /** Group size weights, by size (index 0 = alone). */
  group: number[];
  /** (M9.5) Families: the first 1-2 of a group are adults, the rest are minors (they never gamble or drink). */
  kids?: { adults: [number, number] };
  /** Party-style groups: all men, all women or mixed. Otherwise members are drawn independently. */
  sexes?: boolean;
  /** Money for one visit (dollars, before the ATM). */
  budget: LogNormal;
  /**
   * Floor time a guest plans on, in real minutes at 1× (fatigue means going home: no hotel yet). Set above the
   * target visit length, since money, quit rules and the group end many visits sooner.
   */
  minutes: Normal;
  /** Regulars' savings (the most they could ever draw) and monthly disposable income. */
  savings: LogNormal;
  income: LogNormal;
  /** One-off guests: the most they'd draw at the ATM on this trip. */
  tripCap: LogNormal;
  /** Share who never use the ATM; what the rest draw per trip; base chance of going back once out of money. */
  atm: { never: number; draw: LogNormal; again: number };
  /**
   * Intoxication (0 sober, ~0.25 tipsy, ~0.5 drunk, ~0.8 wasted): the sober share (exactly 0), the drinkers'
   * intended level (skewed bell: mean, sd, cap), overshoot (median of how hard being drunk pushes the intended
   * level up; the spread gives the few who run away), the share who come in for a drink first, how readily they
   * take a drink a server offers (0-1, before thirst, price, comps and drink), and seconds to finish one.
   */
  drinking: { sober: number; mean: number; sd: number; cap: number; overshoot: number; first: number; accept: number; sip: number };
  /** Seconds a first-timer spends browsing before settling on a machine (sightseeing; regulars less, by what they know). */
  browse: number;
  /** Chance per visit, on an easy floor, that someone starts chasing their losses. */
  chase: number;
  /** (M9) Credit behavior. */
  credit: number;
  /** Appeal of each slot model, and (M7) of each table game family (data/tables.ts), 0..1. */
  games: Record<string, number>;
  /**
   * (M7, docs/spec/tables.md) Tables: stake per hand as a multiple of their usual stake per wager; how much a
   * table's rules sway them (0 = never notice); skill weights (poor, typical, sharp); share who count cards; and
   * how much their coming at all depends on the casino having tables (0 = not at all).
   */
  tableStake: number;
  rules: number;
  skill: [number, number, number];
  counters: number;
  tableDraw: number;
  prefs: Partial<Record<Taste, Pref>>;
  /** Walk-in appeal: how readily a passer-by of this type steps inside (times the entrance's curb appeal). */
  walkIn: number;
  /**
   * Incidents (docs/spec/incidents.md), per category: how readily a cause turns into an incident for this type
   * (1 = the catalog's rate), and tolerance for seeing one (0 = the full bother, 1 = unbothered, above 1 = fun to
   * watch). Types react to what they see and to being policed, never to the house-rule setting itself.
   */
  incidents: Record<IncidentCat, number>;
  tolerance: Record<IncidentCat, number>;
  /** How much being warned, cut off or thrown out (or seeing a friend thrown out) bothers them, 0-1. */
  policed: number;
  /** Appetite for drama, 0-1: low-drama guests are the ones who report incidents to staff. */
  drama: number;
  /** (M5) Share who are cheats. Cheats never look any different. */
  cheat: number;
  /** How hard scandals hit this type's reputation (M4+). */
  repSensitivity: number;
  /** (M9) Comp appetite. */
  comps: number;
  play: {
    /** Usual stake per wager as a fraction of the visit budget (drawn uniformly). */
    stake: [number, number];
    pace: [number, number];
    quit: Record<QuitRule, number>;
    /** Leave when up this multiple of the budget (winGoal rule). */
    winGoal: [number, number];
    /** Leave after losing this fraction of the budget (lossLimit rule). */
    lossLimit: [number, number];
    /** Nurses cheap machines for free drinks, when drinks are comped. */
    compSeek: number;
  };
  /** Need growth per second at 1× (0-100 scale). */
  needs: { bladder: number; hunger: number; thirst: number; fatigue: number };
  /** Seconds of play per dollar lost that feel like good value (NORTH_STAR: time over money). */
  secPerDollar: number;
  /**
   * (M6) Share who come for a meal, a show or the club when the casino has one (docs/spec/construction.md). Each
   * kind the casino has also adds this much (more for a finer one) to the type's arrivals.
   */
  comeFor: { dine: number; show: number; club: number; pool: number };
  /** (M6) Share who smoke. */
  smokers: number;
  /** (M6.5) How much theming matters to them: a coherent themed room lifts their mood, a muddled one sours it. */
  theming: number;
}

const flat = (v = 1) => Array(12).fill(v);
const NO_POOL = { share: 0, days: { median: 1, sigma: 0 } };

export const GUEST_TYPES: Record<string, GuestTypeDef> = {
  local: {
    id: "local", name: "Locals",
    arrival: { base: 1, season: flat() }, payday: 0.6,
    returns: { share: 0.85, days: { median: 7, sigma: 0.55, min: 3, cap: 20 } },
    group: [0.6, 0.35, 0.025, 0.025],
    budget: { median: 90, sigma: 0.6, min: 20, cap: 600 },
    minutes: { mean: 8, sd: 2.5, min: 1 },
    savings: { median: 2500, sigma: 1, min: 100 }, income: { median: 300, sigma: 0.5, min: 50 },
    tripCap: { median: 200, sigma: 0.6, min: 40, cap: 1500 },
    atm: { never: 0.35, draw: { median: 60, sigma: 0.5, min: 20 }, again: 0.35 },
    drinking: { sober: 0.3, mean: 0.35, sd: 0.15, cap: 1.3, overshoot: 0.1, first: 0.12, accept: 0.35, sip: 80 },
    browse: 40,
    chase: 0.01,
    credit: 0,
    games: { cherry: 0.5, liberty: 1, thunder: 0.6, vpoker: 0.9, blackjack: 0.8, craps: 0.6, roulette: 0.4, baccarat: 0.2, poker: 0.5, keno: 0.3, bingo: 0.3, sports: 0.7 },
    tableStake: 6, rules: 0.6, skill: [0.25, 0.55, 0.2], counters: 0.01, tableDraw: 0,
    prefs: { NRG: { ideal: 5, tol: 5, w: 0.6 }, CRW: { ideal: 2, tol: 3, w: 0.8 }, DIRT: { ideal: 0, tol: 2, w: 0.9 }, PRS: { ideal: 1, tol: 3, w: 0.3 } },
    walkIn: 0.25,
    incidents: { intox: 1, disorder: 1, misconduct: 0.8, celebration: 1, social: 0.6 },
    tolerance: { intox: 0.4, disorder: 0.2, misconduct: 0.1, celebration: 1, social: 0.8 }, policed: 0.5,
    drama: 0.4, cheat: 0.01, repSensitivity: 1, comps: 0.5,
    play: { stake: [0.005, 0.012], pace: [0.9, 1.2], quit: { winGoal: 2, lossLimit: 3, broke: 1, jackpot: 1 }, winGoal: [0.5, 1.2], lossLimit: [0.6, 1], compSeek: 0.2 },
    needs: { bladder: 0.3, hunger: 0.1, thirst: 0.32, fatigue: 0.13 },
    secPerDollar: 6,
    comeFor: { dine: 0.12, show: 0.05, club: 0.02, pool: 0.03 }, smokers: 0.25, theming: 0.3,
  },
  retiree: {
    id: "retiree", name: "Retirees",
    arrival: { base: 0.6, season: [1.3, 1.3, 1.2, 1, 0.9, 0.7, 0.6, 0.6, 0.8, 1, 1.2, 1.3] }, payday: 0.3,
    returns: { share: 0.7, days: { median: 14, sigma: 0.4, min: 7, cap: 30 } },
    group: [0.4, 0.55, 0.0125, 0.0125, 0.0125, 0.0125],
    budget: { median: 60, sigma: 0.3, min: 20, cap: 200 },
    minutes: { mean: 11, sd: 3.5, min: 1 },
    savings: { median: 8000, sigma: 0.9, min: 500 }, income: { median: 200, sigma: 0.4, min: 50 },
    tripCap: { median: 100, sigma: 0.4, min: 20, cap: 400 },
    atm: { never: 0.75, draw: { median: 40, sigma: 0.4, min: 20 }, again: 0.2 },
    drinking: { sober: 0.6, mean: 0.2, sd: 0.08, cap: 1.3, overshoot: 0.03, first: 0.08, accept: 0.2, sip: 100 },
    browse: 50,
    chase: 0.003,
    credit: 0,
    games: { cherry: 1, liberty: 0.7, thunder: 0.2, vpoker: 0.7, blackjack: 0.3, roulette: 0.4, craps: 0.1, baccarat: 0.1, poker: 0.2, keno: 1, bingo: 1, sports: 0.1 },
    tableStake: 4, rules: 0, skill: [0.3, 0.6, 0.1], counters: 0.002, tableDraw: 0,
    prefs: { NRG: { ideal: 2, tol: 4, w: 1 }, CRW: { ideal: 1, tol: 2, w: 1 }, DIRT: { ideal: 0, tol: 1, w: 1.2 }, PRS: { ideal: 3, tol: 3, w: 0.5 } },
    walkIn: 0.15,
    incidents: { intox: 0.5, disorder: 0.4, misconduct: 0.3, celebration: 0.8, social: 0.3 },
    tolerance: { intox: 0.1, disorder: 0, misconduct: 0, celebration: 0.8, social: 0.5 }, policed: 0.1,
    drama: 0.1, cheat: 0.005, repSensitivity: 1.2, comps: 0.7,
    play: { stake: [0.004, 0.009], pace: [0.7, 1], quit: { winGoal: 3, lossLimit: 4, broke: 0.5, jackpot: 1 }, winGoal: [0.3, 0.8], lossLimit: [0.5, 0.9], compSeek: 0.4 },
    needs: { bladder: 0.36, hunger: 0.12, thirst: 0.25, fatigue: 0.1 },
    secPerDollar: 12,
    comeFor: { dine: 0.2, show: 0.2, club: 0, pool: 0.05 }, smokers: 0.15, theming: 0.5,
  },
  tourist: {
    id: "tourist", name: "Tourists",
    arrival: { base: 0.4, season: [0.6, 0.7, 1.1, 1, 1.1, 1.5, 1.7, 1.6, 1, 0.8, 0.7, 1.1] }, payday: 0,
    returns: { share: 0.05, days: { median: 150, sigma: 0.5, min: 60, cap: 365 } },
    group: [0.25, 0.5, 0.0833, 0.0833, 0.0834],
    budget: { median: 180, sigma: 0.7, min: 30, cap: 2000 },
    minutes: { mean: 5.5, sd: 2, min: 1 },
    savings: { median: 3000, sigma: 1, min: 100 }, income: { median: 300, sigma: 0.5, min: 50 },
    tripCap: { median: 300, sigma: 0.7, min: 50, cap: 2000 },
    atm: { never: 0.3, draw: { median: 100, sigma: 0.5, min: 20 }, again: 0.35 },
    drinking: { sober: 0.15, mean: 0.45, sd: 0.2, cap: 1.3, overshoot: 0.12, first: 0.15, accept: 0.45, sip: 70 },
    browse: 60,
    chase: 0.003,
    credit: 0,
    games: { cherry: 0.8, liberty: 0.4, thunder: 1, vpoker: 0.3, blackjack: 0.6, roulette: 1, craps: 0.8, baccarat: 0.3, poker: 0.3, keno: 0.4, bingo: 0.1, sports: 0.4 },
    tableStake: 5, rules: 0, skill: [0.55, 0.4, 0.05], counters: 0.003, tableDraw: 0,
    prefs: { NRG: { ideal: 10, tol: 6, w: 1 }, CRW: { ideal: 4, tol: 3, w: 0.5 }, PRS: { ideal: 5, tol: 4, w: 0.8 }, DIRT: { ideal: 0, tol: 1.5, w: 1 }, TRF: { ideal: 3, tol: 3, w: 0.4 } },
    walkIn: 0.35,
    incidents: { intox: 1.1, disorder: 0.8, misconduct: 0.8, celebration: 1.3, social: 1 },
    tolerance: { intox: 0.6, disorder: 0.3, misconduct: 0.2, celebration: 1, social: 1 }, policed: 0.6,
    drama: 0.5, cheat: 0.01, repSensitivity: 0.8, comps: 0.3,
    play: { stake: [0.01, 0.022], pace: [1, 1.4], quit: { winGoal: 1, lossLimit: 2, broke: 2, jackpot: 1 }, winGoal: [0.8, 2], lossLimit: [0.7, 1], compSeek: 0.05 },
    needs: { bladder: 0.3, hunger: 0.14, thirst: 0.36, fatigue: 0.18 },
    secPerDollar: 2.2,
    comeFor: { dine: 0.15, show: 0.2, club: 0.1, pool: 0.15 }, smokers: 0.15, theming: 1,
  },
  party: {
    id: "party", name: "Party groups",
    arrival: { base: 0.15, season: [0.6, 0.7, 1.4, 1.1, 1.2, 1.3, 1.3, 1.2, 0.9, 0.9, 1, 1.5] }, payday: 0.3,
    returns: NO_POOL,
    group: [0, 0, 0, 0.2, 0.2, 0.2, 0.2, 0.2], sexes: true,
    budget: { median: 120, sigma: 0.5, min: 30, cap: 800 },
    minutes: { mean: 6.5, sd: 2.5, min: 1 },
    savings: { median: 2000, sigma: 1, min: 100 }, income: { median: 300, sigma: 0.5, min: 50 },
    tripCap: { median: 250, sigma: 0.6, min: 40, cap: 800 },
    atm: { never: 0.2, draw: { median: 80, sigma: 0.5, min: 20 }, again: 0.4 },
    drinking: { sober: 0.05, mean: 0.65, sd: 0.2, cap: 1.3, overshoot: 0.15, first: 0.5, accept: 0.6, sip: 50 },
    browse: 25,
    chase: 0,
    credit: 0,
    games: { cherry: 0.7, liberty: 0.3, thunder: 1, vpoker: 0.1, blackjack: 0.6, roulette: 0.7, craps: 1, baccarat: 0.2, poker: 0.3, keno: 0, bingo: 0, sports: 0.8 },
    tableStake: 6, rules: 0, skill: [0.6, 0.35, 0.05], counters: 0, tableDraw: 0,
    prefs: { NRG: { ideal: 12, tol: 6, w: 1.2 }, CRW: { ideal: 6, tol: 4, w: 0.6 }, PRS: { ideal: 3, tol: 4, w: 0.3 }, DIRT: { ideal: 0, tol: 3, w: 0.5 } },
    walkIn: 0.3,
    incidents: { intox: 1.5, disorder: 1.3, misconduct: 1.4, celebration: 1.5, social: 1.6 },
    tolerance: { intox: 1.1, disorder: 0.6, misconduct: 0.5, celebration: 1.2, social: 1.2 }, policed: 1,
    drama: 0.9, cheat: 0.01, repSensitivity: 0.6, comps: 0.3,
    play: { stake: [0.009, 0.02], pace: [1, 1.4], quit: { winGoal: 1, lossLimit: 2, broke: 2, jackpot: 1 }, winGoal: [0.8, 2], lossLimit: [0.7, 1], compSeek: 0.02 },
    needs: { bladder: 0.3, hunger: 0.12, thirst: 0.4, fatigue: 0.15 },
    secPerDollar: 3.3,
    comeFor: { dine: 0.05, show: 0.1, club: 0.45, pool: 0.2 }, smokers: 0.35, theming: 0.6,
  },
  highroller: {
    id: "highroller", name: "High rollers",
    arrival: { base: 0.05, season: flat() }, payday: 0,
    returns: { share: 0.7, days: { median: 20, sigma: 0.5, min: 7, cap: 60 } },
    group: [0.5, 0.4, 0.1],
    budget: { median: 2000, sigma: 0.6, min: 500, cap: 20000 },
    minutes: { mean: 10, sd: 3, min: 2 },
    savings: { median: 100000, sigma: 1, min: 10000 }, income: { median: 5000, sigma: 0.6, min: 1000 },
    tripCap: { median: 5000, sigma: 0.7, min: 1000, cap: 50000 },
    atm: { never: 0.5, draw: { median: 500, sigma: 0.5, min: 100 }, again: 0.3 },
    drinking: { sober: 0.3, mean: 0.3, sd: 0.1, cap: 1.2, overshoot: 0.05, first: 0.2, accept: 0.4, sip: 90 },
    browse: 30,
    chase: 0.004,
    credit: 0,
    games: { cherry: 0, liberty: 0.3, thunder: 0.4, vpoker: 0.3, blackjack: 0.9, roulette: 0.6, craps: 0.6, baccarat: 1, poker: 0.5, keno: 0, bingo: 0, sports: 0.4 },
    tableStake: 1.5, rules: 1, skill: [0.15, 0.5, 0.35], counters: 0.02, tableDraw: 0.85,
    prefs: { PRS: { ideal: 8, tol: 4, w: 1.2 }, CRW: { ideal: 1, tol: 2, w: 1 }, NRG: { ideal: 4, tol: 4, w: 0.6 }, DIRT: { ideal: 0, tol: 1, w: 1.2 }, TRF: { ideal: 1, tol: 3, w: 0.6 } },
    walkIn: 0.1,
    incidents: { intox: 0.6, disorder: 0.4, misconduct: 0.3, celebration: 0.8, social: 0.6 },
    tolerance: { intox: 0.2, disorder: 0.1, misconduct: 0.1, celebration: 0.8, social: 0.6 }, policed: 0.8,
    drama: 0.2, cheat: 0.01, repSensitivity: 1.3, comps: 1,
    play: { stake: [0.01, 0.025], pace: [0.9, 1.1], quit: { winGoal: 2, lossLimit: 3, broke: 0.5, jackpot: 0.5 }, winGoal: [0.5, 1.5], lossLimit: [0.5, 0.9], compSeek: 0 },
    needs: { bladder: 0.3, hunger: 0.12, thirst: 0.3, fatigue: 0.12 },
    secPerDollar: 1.5,
    comeFor: { dine: 0.3, show: 0.2, club: 0.02, pool: 0.1 }, smokers: 0.2, theming: 0.8,
  },
  // M9.5 (docs/spec/calendar.md): business visitors who come in waves with conventions.
  conventioneer: {
    id: "conventioneer", name: "Conventioneers",
    arrival: { base: 0.03, season: flat() }, payday: 0,
    returns: { share: 0.05, days: { median: 200, sigma: 0.5, min: 60, cap: 365 } },
    group: [0.1, 0.4, 0.3, 0.2],
    budget: { median: 150, sigma: 0.6, min: 40, cap: 1500 },
    minutes: { mean: 5, sd: 2, min: 1 },
    savings: { median: 5000, sigma: 1, min: 500 }, income: { median: 500, sigma: 0.5, min: 100 },
    tripCap: { median: 300, sigma: 0.6, min: 50, cap: 2000 },
    atm: { never: 0.4, draw: { median: 100, sigma: 0.5, min: 20 }, again: 0.3 },
    drinking: { sober: 0.15, mean: 0.4, sd: 0.15, cap: 1.2, overshoot: 0.1, first: 0.33, accept: 0.5, sip: 60 },
    browse: 40,
    chase: 0.002,
    credit: 0,
    games: { cherry: 0.6, liberty: 0.5, thunder: 0.6, vpoker: 0.4, blackjack: 0.9, roulette: 0.6, craps: 0.9, baccarat: 0.2, poker: 0.4, keno: 0.2, bingo: 0, sports: 0.6 },
    tableStake: 4, rules: 0.3, skill: [0.4, 0.5, 0.1], counters: 0.005, tableDraw: 0.3,
    prefs: { NRG: { ideal: 9, tol: 6, w: 0.8 }, CRW: { ideal: 4, tol: 4, w: 0.4 }, PRS: { ideal: 5, tol: 4, w: 0.6 }, DIRT: { ideal: 0, tol: 1.5, w: 1 }, TRF: { ideal: 3, tol: 4, w: 0.3 } },
    walkIn: 0.3,
    incidents: { intox: 1.1, disorder: 0.7, misconduct: 0.6, celebration: 1.2, social: 1.3 },
    tolerance: { intox: 0.6, disorder: 0.3, misconduct: 0.3, celebration: 1, social: 1 }, policed: 0.7,
    drama: 0.5, cheat: 0.01, repSensitivity: 0.8, comps: 0.8,
    play: { stake: [0.01, 0.025], pace: [1, 1.3], quit: { winGoal: 1, lossLimit: 2, broke: 1, jackpot: 1 }, winGoal: [0.8, 2], lossLimit: [0.6, 1], compSeek: 0.05 },
    needs: { bladder: 0.3, hunger: 0.14, thirst: 0.4, fatigue: 0.18 },
    secPerDollar: 2,
    comeFor: { dine: 0.2, show: 0.2, club: 0.1, pool: 0.05 }, smokers: 0.15, theming: 0.6,
  },
  // M9.5 (docs/spec/guests.md §Families): parents with children. The children never gamble or drink.
  family: {
    id: "family", name: "Families",
    arrival: { base: 0.15, season: [0.7, 0.7, 1.1, 1.1, 1, 1.5, 1.7, 1.5, 0.8, 0.8, 1, 1.4] }, payday: 0,
    returns: { share: 0.05, days: { median: 150, sigma: 0.5, min: 60, cap: 365 } },
    group: [0, 0, 0.35, 0.4, 0.25],
    kids: { adults: [1, 2] },
    budget: { median: 100, sigma: 0.6, min: 20, cap: 800 },
    minutes: { mean: 4.5, sd: 1.5, min: 1 },
    savings: { median: 3000, sigma: 1, min: 100 }, income: { median: 300, sigma: 0.5, min: 50 },
    tripCap: { median: 150, sigma: 0.6, min: 20, cap: 800 },
    atm: { never: 0.5, draw: { median: 60, sigma: 0.5, min: 20 }, again: 0.2 },
    drinking: { sober: 0.5, mean: 0.2, sd: 0.1, cap: 0.6, overshoot: 0.03, first: 0.05, accept: 0.2, sip: 90 },
    browse: 50,
    chase: 0.001,
    credit: 0,
    games: { cherry: 0.8, liberty: 0.5, thunder: 0.3, vpoker: 0.2, blackjack: 0.3, roulette: 0.4, craps: 0.2, baccarat: 0, poker: 0, keno: 0.3, bingo: 0.4, sports: 0 },
    tableStake: 3, rules: 0, skill: [0.6, 0.35, 0.05], counters: 0, tableDraw: 0,
    prefs: { NRG: { ideal: 5, tol: 4, w: 0.8 }, DIRT: { ideal: 0, tol: 1, w: 1.5 }, CRW: { ideal: 3, tol: 3, w: 0.6 }, PRS: { ideal: 4, tol: 4, w: 0.4 } },
    walkIn: 0.2,
    incidents: { intox: 0.5, disorder: 0.5, misconduct: 1, celebration: 1, social: 0.3 },
    tolerance: { intox: 0.1, disorder: 0.05, misconduct: 0.1, celebration: 1, social: 0.6 }, policed: 0.8,
    drama: 0.1, cheat: 0.002, repSensitivity: 1.2, comps: 0.6,
    play: { stake: [0.01, 0.02], pace: [0.8, 1.1], quit: { winGoal: 2, lossLimit: 3, broke: 1, jackpot: 1 }, winGoal: [0.5, 1.5], lossLimit: [0.5, 0.8], compSeek: 0 },
    needs: { bladder: 0.25, hunger: 0.2, thirst: 0.3, fatigue: 0.22 },
    secPerDollar: 2.5,
    comeFor: { dine: 0.4, show: 0.3, club: 0, pool: 0.5 }, smokers: 0.05, theming: 1,
  },
};
export type GuestTypeId = keyof typeof GUEST_TYPES;

/** Types whose people are kept in the scenario's pool from the start (the rest are one-off, with a few returning). */
export const recurring = (t: GuestTypeDef) => t.returns.share >= 0.5;

/** First names for the inspector. Guests are shown by name, never by type (types are earned: FOUNDATIONS §16). */
export const FIRST_NAMES = [
  "Ada", "Al", "Bea", "Bill", "Carl", "Dot", "Deb", "Earl", "Edna", "Frank", "Gus", "Hal", "Ida", "Irv", "Jan", "Joe",
  "June", "Kay", "Lou", "Mae", "Mel", "Nan", "Ned", "Opal", "Pat", "Ray", "Rita", "Sal", "Sue", "Ted", "Val", "Walt",
  "Zeke", "Rosa", "Luis", "Mina", "Kenji", "Priya", "Omar", "Ines", "Tariq", "Lena", "Hugo", "Nia", "Dev", "Yuki",
];
