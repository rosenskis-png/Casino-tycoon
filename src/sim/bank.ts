// Money and risk (FOUNDATIONS §12, §14, §16; docs/spec/money.md): gaming tax and skimming, ordinary and emergency
// loans, unpaid winnings, insolvency, jackpot insurance, and comps by theoretical loss.
import {
  COMEBACK_COST, COMEBACK_SCORE, COMEBACK_SOONER, COMP_AT, COMP_KINDS, EMERGENCY_FEE, EMERGENCY_MIN, EMERGENCY_RATE, EMERGENCY_SHARE, EMERGENCY_STEP,
  EVADED_FADE, INSOLVENT_MONTHS, ROOM_COST, ROOM_STAY, INSURE_LOAD, INSURE_MIN, INSURE_SHARE, LOAN_RATE, LOAN_SHARE, LOAN_STEP, REG, SCANDAL_REP, SKIM_LEVELS, type CompKind,
} from "../data/money";
import { GUEST_TYPES } from "../data/guests";
import { SCENARIOS } from "../data/scenarios";
import { SCALE } from "../data/psych";
import type { SlotModel } from "../data/games";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Agent, Bank, GuestData } from "./state";
import { post, assetsOf } from "./finance";
import { fmtMoney, newsFor } from "./news";
import { hitReputation, person } from "./pool";
import { adjustRegulator } from "./regulator";
import { think } from "./guests";
import { hasClub } from "./research";
import { OBJECTS } from "../data/objects";
import { TICKS_PER_DAY, dateOfDay, daysInMonth } from "./clock";
const news = newsFor("money");

declare module "./commands" {
  interface CommandTypes {
    borrow: { amount: number };
    repay: { amount: number };
    setSkim: { share: number };
    setInsurance: { level: number };
    setComp: { kind: CompKind; at: number };
    /** With the player's club: comps for one guest type only ("" = everyone). */
    targetComps: { who: string };
  }
}

export const newBank = (): Bank => ({
  loan: 0, emergency: 0, skim: 0, evaded: 0, insure: 0, insExp: 0, insLvl: 0, theoM: 0, theoLast: 0, emergencies: 0, broke: 0, unpaid: 0, low: 0,
  comps: { meal: 0, show: 0, back: 0 }, given: 0,
});

/** Ledger lines that make up the gaming win (taxed). */
export const GAMING = ["slots", "tables", "poker", "keno", "sports"];

/**
 * (M11.1) The casino's scale: its average monthly gaming win over the last 3 closed months, or before any month
 * has closed an estimate from its game seats. Threats and penalties are sized by it (`scaled`).
 */
export function monthlyWin(g: Game): number {
  const hist = g.state.finance.history.slice(-3);
  if (!hist.length) return SCALE.perSeat * g.gameSeats;
  return Math.max(0, hist.reduce((a, h) => a + GAMING.reduce((b, k) => b + (h.l[k] ?? 0), 0), 0) / hist.length);
}

/** (M11.1) A dollar amount tuned for a casino winning SCALE.refMonth a month, sized to this one (clamped). */
export function scaled(g: Game, amount: number): number {
  const k = Math.max(SCALE.min, Math.min(SCALE.max, monthlyWin(g) / SCALE.refMonth));
  const v = amount * k;
  return v >= 100 ? Math.round(v / 10) * 10 : Math.max(1, Math.round(v));
}

export const debtOf = (g: Game) => g.state.bank.loan + g.state.bank.emergency;
/** What the casino owns before debt: cash (if any) plus resale value and land. */
const grossOf = (g: Game) => Math.max(0, g.state.cash) + assetsOf(g);
/** How much more can be borrowed as an ordinary loan (in whole steps). */
export const loanRoom = (g: Game) => Math.max(0, Math.floor((LOAN_SHARE * grossOf(g) - debtOf(g)) / LOAN_STEP) * LOAN_STEP);
/** Emergency credit left. */
export const emergencyRoom = (g: Game) => Math.max(0, Math.max(EMERGENCY_MIN, EMERGENCY_SHARE * assetsOf(g)) - g.state.bank.emergency);

/**
 * Make sure cash can cover `need` more going out: an emergency loan tops it up (steps, fee, a scandal the first
 * time in a month). Returns what still can't be covered.
 */
export function ensureCash(g: Game, need: number): number {
  const s = g.state, b = s.bank;
  const gap = need - s.cash;
  if (gap <= 1e-9) return 0;
  let take = Math.ceil(gap / (1 - EMERGENCY_FEE) / EMERGENCY_STEP) * EMERGENCY_STEP;
  take = Math.min(take, Math.floor(emergencyRoom(g)));
  if (take > 0) {
    b.emergency += take;
    post(g, "borrowed", take);
    post(g, "loanFees", -take * EMERGENCY_FEE);
    if (b.emergencies++ === 0) {
      news(g, "urgent", `Emergency loan of ${fmtMoney(take)} to cover what the casino owes. It's in the papers.`, { tab: "finance" });
      for (const t of Object.keys(s.rep)) hitReputation(g, t, SCANDAL_REP * (GUEST_TYPES[t]?.repSensitivity ?? 1));
    }
  }
  return Math.max(0, need - s.cash);
}

/** The house can't pay a guest what they won: what cash covers is paid, the rest is owed and the regulator hears. */
export function stiff(g: Game, a: Agent, amount: number) {
  const s = g.state, gd = a.g!;
  gd.unpaid += amount;
  s.bank.unpaid++;
  adjustRegulator(g, -(amount >= REG.unpaidBigAt ? REG.unpaidBig : amount >= REG.unpaidSmallAt ? REG.unpaid : REG.unpaidSmall));
  const p = gd.pid >= 0 ? person(g, gd.pid) : undefined;
  if (p) p.score = Math.max(0, p.score - 10);
  think(g, a, "unpaid");
  // Small sums go to the log only; the regulator hears of them all.
  news(g, amount >= REG.unpaidSmallAt ? "urgent" : "bad", `The casino couldn't pay ${fmtMoney(amount)} in winnings. The regulator has been told.`, amount < REG.unpaidSmallAt);
}

// ---------------------------------------------------------------------------------------------------------
// Jackpot insurance.

/**
 * (M11.4) The payout line for the chosen level: a share of the expected machine win for a month (last month's, or
 * this month's so far over a full month when that's more, counting at least a week), at least INSURE_MIN. Set
 * daily, so it grows with the casino.
 */
export function insureLine(g: Game): number {
  const b = g.state.bank, k = INSURE_SHARE[b.insLvl] ?? 0;
  if (!k) return 0;
  const d = dateOfDay(Math.floor(g.state.tick / TICKS_PER_DAY));
  const month = Math.max(b.theoLast, (b.theoM * daysInMonth(d.month)) / Math.max(7, d.day));
  return Math.max(INSURE_MIN, Math.round((k * month) / 50) * 50);
}
/** Machines the insurance covers: slots, video poker and keno (tables have their limits; bingo pays players' money). */
export const insured = (kind: string) => !!OBJECTS[kind]?.slot || kind === "vpoker" || kind === "keno";

const excessCache = new Map<string, number>();
/** Expected payout above `over` for one wager of `bet` on this paytable. */
export function expectedExcess(m: SlotModel, bet: number, over: number): number {
  const key = `${m.id}:${bet}:${over}`;
  let e = excessCache.get(key);
  if (e === undefined) {
    e = 0;
    for (const q of m.pays) if (q.x * bet > over) e += q.p * (q.x * bet - over);
    if (excessCache.size > 5000) excessCache.clear();
    excessCache.set(key, e);
  }
  return e;
}

// ---------------------------------------------------------------------------------------------------------
// Comps (theoretical loss = what the math expects the guest to lose this visit).

export const COMP_BIT: Record<CompKind, number> = { meal: 1, show: 2, back: 4, room: 32 };
export const COMP_USED: Record<"meal" | "show", number> = { meal: 8, show: 16 };
export const theo = (gd: GuestData) => gd.mem.wagered - gd.mem.ev;

/** After a round: comps the guest's play has now earned. */
export function earnComps(g: Game, a: Agent) {
  const gd = a.g!, c = g.state.bank.comps, t = theo(gd);
  // Targeted comps (the player's club, M9.5): one type only.
  if (c.only && c.only !== gd.type) return;
  for (const k of COMP_KINDS) {
    const at = c[k] ?? 0;
    if (!at || gd.comp & COMP_BIT[k] || t < at) continue;
    // A room (M9.6) needs the hotel elevator.
    if (k === "room" && g.state.map.lift < 0) continue;
    gd.comp |= COMP_BIT[k];
    g.state.bank.given++;
    if (k === "room") { gd.floorTime = Math.round(gd.floorTime * ROOM_STAY); post(g, "comps", -ROOM_COST); }
    if (k !== "back") {
      gd.buzz = Math.min(20, gd.buzz + 3 * (GUEST_TYPES[gd.type]?.comps ?? 1));
      think(g, a, "comped");
    }
  }
}

/** A comped meal or show: free once. True when this one is on the house. */
export function useComp(gd: GuestData, k: "meal" | "show"): boolean {
  if (!(gd.comp & COMP_BIT[k]) || gd.comp & COMP_USED[k]) return false;
  gd.comp |= COMP_USED[k];
  return true;
}

/** As a guest leaves: a come-back offer brings a regular back sooner and a little fonder. */
export function comeBack(g: Game, a: Agent) {
  const gd = a.g!, s = g.state;
  if (!(gd.comp & COMP_BIT.back) || gd.pid < 0) return;
  const p = person(g, gd.pid);
  if (!p) return;
  post(g, "comps", -COMEBACK_COST);
  p.score = Math.min(100, p.score + COMEBACK_SCORE);
  if (p.next > s.tick) p.next = s.tick + Math.round((p.next - s.tick) * COMEBACK_SOONER);
}

// ---------------------------------------------------------------------------------------------------------

const commands: CommandTable<"borrow" | "repay" | "setSkim" | "setInsurance" | "setComp" | "targetComps"> = {
  targetComps: {
    validate: (g, c) => (c.who && !hasClub(g.state) ? "Needs the player's club" : c.who && !GUEST_TYPES[c.who] ? "Unknown type" : null),
    apply(g, c) { g.state.bank.comps.only = c.who; },
  },
  borrow: {
    validate: (g, c) => (!(c.amount > 0) || c.amount % LOAN_STEP ? "Borrow in whole thousands" : c.amount > loanRoom(g) ? "The bank won't lend that much" : null),
    apply(g, c) {
      g.state.bank.loan += c.amount;
      post(g, "borrowed", c.amount);
      news(g, "info", `Borrowed ${fmtMoney(c.amount)} at ${Math.round(LOAN_RATE * 100)}% a month.`);
    },
  },
  repay: {
    validate: (g, c) => (!(c.amount > 0) ? "Nothing to repay" : !debtOf(g) ? "No debt" : c.amount > g.state.cash + 1e-9 ? "Not enough cash" : null),
    apply(g, c) {
      const b = g.state.bank;
      let left = Math.min(c.amount, debtOf(g));
      // The steep emergency debt goes first.
      const e = Math.min(left, b.emergency);
      b.emergency -= e;
      left -= e;
      b.loan -= left;
      post(g, "repaid", -(e + left));
    },
  },
  setSkim: {
    validate: (_g, c) => (SKIM_LEVELS.includes(c.share) ? null : "Unknown level"),
    apply(g, c) { g.state.bank.skim = c.share; },
  },
  setInsurance: {
    validate: (_g, c) => (c.level >= 0 && c.level < INSURE_SHARE.length && c.level % 1 === 0 ? null : "Unknown cover"),
    apply(g, c) { g.state.bank.insLvl = c.level; g.state.bank.insure = insureLine(g); },
  },
  setComp: {
    validate: (_g, c) => (!COMP_KINDS.includes(c.kind) ? "Unknown comp" : COMP_AT.includes(c.at) ? null : "Unknown level"),
    apply(g, c) { g.state.bank.comps[c.kind] = c.at; },
  },
};

export const bankSystem: System = {
  id: "bank",
  deps: ["crew"],
  commands,
  beat(g) {
    // Wages and upkeep may have pushed cash below zero: the bank steps in while it can.
    const s = g.state;
    if (s.cash >= 0) return;
    ensureCash(g, 0);
    if (s.cash < 0 && !s.bank.low) { s.bank.low = 1; news(g, "urgent", "Cash is below zero and the bank won't lend more. Nothing can be built until it recovers.", { tab: "finance" }); }
  },
  day(g) { g.state.bank.insure = insureLine(g); },
  closeMonth(g) {
    const s = g.state, b = s.bank, f = s.finance.month;
    // Gaming tax on the month's win; a skim hides part of it (the dodged tax is owed, and fades slowly).
    const win = GAMING.reduce((a, k) => a + (f[k] ?? 0), 0);
    const rate = SCENARIOS[s.scenario]?.tax ?? 0;
    b.evaded *= EVADED_FADE;
    if (win > 0 && rate > 0) {
      post(g, "tax", -rate * win * (1 - b.skim));
      b.evaded += rate * win * b.skim;
    }
    const interest = b.loan * LOAN_RATE + b.emergency * EMERGENCY_RATE;
    if (interest > 0) post(g, "interest", -interest);
    if (b.insExp > 0) post(g, "premium", -INSURE_LOAD * b.insExp);
    b.insExp = 0;
    b.theoLast = b.theoM;
    b.theoM = 0;
    b.insure = insureLine(g);
    b.emergencies = 0;
    b.low = 0;
    b.given = 0;
    ensureCash(g, 0);
    // Insolvency: months in a row closing below zero, with no credit left.
    if (s.cash < 0) {
      b.broke++;
      news(g, "urgent", `The casino closed the month unable to pay its debts${b.broke <= INSOLVENT_MONTHS ? ` (${b.broke} of ${INSOLVENT_MONTHS})` : ""}.`);
      if (b.broke >= INSOLVENT_MONTHS && !s.outcome) {
        s.outcome = "lost";
        news(g, "urgent", "The casino is insolvent. The scenario is lost; keep playing if you like.", { tab: "finance" });
      }
    } else b.broke = 0;
  },
};
