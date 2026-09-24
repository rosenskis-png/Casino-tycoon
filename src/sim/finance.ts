// Books (FOUNDATIONS §14, docs/spec/clock.md): every cash movement posts to a category. Wages and upkeep are
// monthly figures accrued each beat so cash moves smoothly; the month's ledger closes on the 1st.
import { STAFF_ROLES } from "../data/staff";
import { MONTH_NAMES, TICKS_PER_BEAT, TICKS_PER_DAY, dateOfDay, daysInMonth } from "./clock";
import type { Game } from "./game";
import type { System } from "./registry";
import { fmtMoney, news } from "./news";
import { priceOf } from "./geometry";
import { SCENARIOS } from "../data/scenarios";

export const LEDGER_LABELS: Record<string, string> = {
  start: "Starting cash", slots: "Slot win", bar: "Bar sales", build: "Construction", sales: "Sold objects",
  wages: "Wages", upkeep: "Upkeep", drinks: "Drink costs", fines: "Fines", medical: "Paramedics", recovered: "Recovered from cheats",
  food: "Food sales", foodCost: "Food costs", shows: "Show tickets", cover: "Cover charges", doors: "Door fees", poolFees: "Pool entry", land: "Land",
};
const HISTORY_MONTHS = 24;

/** Moves cash and records why. The only way cash changes. */
export function post(g: Game, cat: string, amount: number) {
  if (!amount) return;
  const f = g.state.finance;
  g.state.cash += amount;
  f.month[cat] = (f.month[cat] ?? 0) + amount;
  f.total[cat] = (f.total[cat] ?? 0) + amount;
}

export function monthlyCosts(g: Game): { wages: number; upkeep: number } {
  let wages = 0, upkeep = 0;
  for (const a of g.state.agents) wages += STAFF_ROLES[a.role]?.wage ?? 0;
  for (const o of g.state.objects) upkeep += priceOf(o).upkeep;
  return { wages, upkeep };
}

/** Cash plus what everything placed would sell for. */
export function worth(g: Game): number {
  let v = g.state.cash;
  for (const o of g.state.objects) v += priceOf(o).cost / 2;
  // Land keeps what was paid for it.
  for (const p of SCENARIOS[g.state.scenario]?.parcels ?? []) if (g.state.parcels.includes(p.id)) v += p.price;
  return v;
}

export const financeSystem: System = {
  id: "finance",
  beat(g) {
    // This beat closes the interval ending now, so it belongs to the day of the previous tick.
    const d = dateOfDay(Math.floor((g.state.tick - 1) / TICKS_PER_DAY));
    const share = TICKS_PER_BEAT / (daysInMonth(d.month) * TICKS_PER_DAY);
    const { wages, upkeep } = monthlyCosts(g);
    const before = g.state.cash;
    post(g, "wages", -wages * share);
    post(g, "upkeep", -upkeep * share);
    if (before >= 0 && g.state.cash < 0) news(g, "urgent", "Cash is below zero. Nothing can be built until it recovers.");
  },
  month(g) {
    const f = g.state.finance;
    const prev = dateOfDay(Math.floor(g.state.tick / TICKS_PER_DAY) - 1);
    f.history.push({ year: prev.year, month: prev.month, l: f.month });
    const net = Object.entries(f.month).filter(([k]) => k !== "start").reduce((a, [, v]) => a + v, 0);
    news(g, "info", `${MONTH_NAMES[prev.month]} books closed: ${net >= 0 ? "+" : ""}${fmtMoney(net)}.`, true);
    if (f.history.length > HISTORY_MONTHS) f.history.shift();
    f.month = {};
  },
};
