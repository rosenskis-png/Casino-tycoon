// Books (FOUNDATIONS §14, docs/spec/clock.md): every cash movement posts to a category. Wages and upkeep are
// monthly figures accrued each beat so cash moves smoothly; the month's ledger closes on the 1st.
import { STAFF_ROLES } from "../data/staff";
import { MONTH_NAMES, TICKS_PER_BEAT, TICKS_PER_DAY, dateOfDay, daysInMonth } from "./clock";
import type { Game } from "./game";
import type { System } from "./registry";
import { fmtMoney, newsFor } from "./news";
import { priceOf } from "./geometry";
import { SCENARIOS } from "../data/scenarios";
import { wageFor } from "./crew";
import { liability } from "./design/meters";
import { houseMeters } from "./design/market";
const news = newsFor("money");

export const LEDGER_LABELS: Record<string, string> = {
  start: "Starting cash", slots: "Slot win", tables: "Table win", poker: "Poker rake", keno: "Keno & bingo", sports: "Sportsbook", marketing: "Marketing", research: "Research", rooms: "Hotel rooms", bar: "Bar (less drink costs)", build: "Construction", sales: "Sold objects",
  wages: "Wages", upkeep: "Upkeep", drinks: "Drink costs", fines: "Fines", bribes: "Bribes", medical: "Paramedics", recovered: "Recovered from cheats",
  food: "Restaurants (less food costs)", foodCost: "Food costs", shows: "Shows (less show costs)", cover: "Club covers (less costs)", doors: "Door fees", poolFees: "Pool (less costs)", golfFees: "Mini golf (less costs)", land: "Land",
  tax: "Gaming tax", interest: "Loan interest", loanFees: "Loan fees", borrowed: "Borrowed", repaid: "Repaid", insurance: "Insurance claims",
  premium: "Insurance premium", comps: "Comps", shrink_bar: "Shrinkage: bar", shrink_cage: "Shrinkage: cage", shrink_tables: "Shrinkage: tables",
  shrink_machines: "Shrinkage: machines", yours: "Owner's play",
};
const HISTORY_MONTHS = 24;

/** Moves cash and records why. The only way cash changes. */
/** (Batch A) What the Sandbox's cash is kept near. */
export const UNLIMITED = 1_000_000_000;

export function post(g: Game, cat: string, amount: number) {
  if (!amount) return;
  const f = g.state.finance;
  g.state.cash += amount;
  f.month[cat] = (f.month[cat] ?? 0) + amount;
  f.total[cat] = (f.total[cat] ?? 0) + amount;
}

export function monthlyCosts(g: Game): { wages: number; upkeep: number } {
  let wages = 0, upkeep = 0;
  for (const a of g.state.agents) if (STAFF_ROLES[a.role]) wages += wageFor(g, a.role);
  for (const o of g.state.objects) upkeep += priceOf(o, g.state).upkeep;
  return { wages, upkeep };
}

/** What everything placed would sell for, plus land (which keeps what was paid for it). */
export function assetsOf(g: Game): number {
  let v = 0;
  for (const o of g.state.objects) v += priceOf(o, g.state).cost / 2;
  for (const p of SCENARIOS[g.state.scenario]?.parcels ?? []) if (g.state.parcels.includes(p.id)) v += p.price;
  return v;
}

/** Cash plus what everything placed would sell for, less debt (M9). */
export function worth(g: Game): number {
  return g.state.cash + assetsOf(g) - g.state.bank.loan - g.state.bank.emergency - meterDebt(g);
}
/** (M8.5) What players have put on the progressive meters beyond their seeds: owed, so it counts against worth. */
export const meterDebt = (g: Game) => { const h = houseMeters(g.state); return liability(h.meters, h.objects); };
/** A ledger line's name: (M8.6) each sold design has its own. */
export function ledgerLabel(g: Game, k: string): string {
  if (k.startsWith("sale:")) { const rec = g.state.designs[k.slice(5)]; return `Sold: ${rec?.d.name ?? "a design"}`; }
  return LEDGER_LABELS[k] ?? k;
}

/** Ledger lines that move money without being income or cost (kept out of a month's net). */
export const NOT_INCOME = new Set(["start", "borrowed", "repaid"]);

export const financeSystem: System = {
  id: "finance",
  beat(g) {
    // This beat closes the interval ending now, so it belongs to the day of the previous tick.
    const d = dateOfDay(Math.floor((g.state.tick - 1) / TICKS_PER_DAY));
    const share = TICKS_PER_BEAT / (daysInMonth(d.month) * TICKS_PER_DAY);
    const { wages, upkeep } = monthlyCosts(g);
    post(g, "wages", -wages * share);
    post(g, "upkeep", -upkeep * share);
    // (Batch A) The Sandbox: money never runs out.
    if (SCENARIOS[g.state.scenario]?.unlimited && g.state.cash < UNLIMITED / 2) post(g, "start", UNLIMITED - g.state.cash);
  },
  month(g) {
    const f = g.state.finance;
    const prev = dateOfDay(Math.floor(g.state.tick / TICKS_PER_DAY) - 1);
    f.history.push({ year: prev.year, month: prev.month, l: f.month });
    const net = Object.entries(f.month).filter(([k]) => !NOT_INCOME.has(k)).reduce((a, [, v]) => a + v, 0);
    news(g, "info", `${MONTH_NAMES[prev.month]} books closed: ${net >= 0 ? "+" : ""}${fmtMoney(net)}.`, true);
    if (f.history.length > HISTORY_MONTHS) f.history.shift();
    f.month = {};
  },
};
