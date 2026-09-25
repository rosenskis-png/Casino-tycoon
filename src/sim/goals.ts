// Scenario goals (FOUNDATIONS §20): a money goal (casino worth), reputation goals, (M12) gaming win from a crowd
// held for months in a row, and police standing kept above a line, by a deadline. Checked when each month closes
// (police standing daily: dropping below the line loses on the spot). Play continues after a win or a loss.
import { SCENARIOS, type Goals } from "../data/scenarios";
import { GUEST_TYPES } from "../data/guests";
import { MONTH_NAMES, TICKS_PER_DAY, dateOfDay } from "./clock";
import type { Game } from "./game";
import type { System } from "./registry";
import { worth } from "./finance";
import { fmtMoney, news } from "./news";

export interface GoalStatus {
  worth: number; rep: number; worthOk: boolean; repOk: boolean; goals: Goals; reps: { type: string; rep: number; ok: boolean }[];
  /** (M12) The crowd's gaming win this month so far and in the last closed months (oldest first), and whether the streak is met. */
  gaming?: { now: number; months: { label: string; v: number }[]; avg: number; ok: boolean };
  /** (M12) Police standing now and the lowest it has been; ok while never below the line. */
  police?: { now: number; low: number; ok: boolean };
  ok: boolean;
}

/** A crowd's gaming win in a month's record (every crowd when `type` is omitted). */
const winOf = (m: Record<string, number>, type?: string) => (type ? m[type] ?? 0 : Object.values(m).reduce((a, b) => a + b, 0));

export function goalStatus(g: Game): GoalStatus | null {
  const goals = SCENARIOS[g.state.scenario].goals;
  if (!goals) return null;
  const s = g.state, w = worth(g);
  let rep = 0, repOk = true;
  if (goals.rep) {
    const types = goals.rep.type ? [goals.rep.type] : Object.keys(s.rep).filter((t) => !GUEST_TYPES[t]?.noRep);
    rep = Math.min(...types.map((t) => s.rep[t] ?? 0));
    repOk = rep >= goals.rep.min;
  }
  const reps = (goals.reps?.types ?? []).map((t) => ({ type: t, rep: s.rep[t] ?? 0, ok: (s.rep[t] ?? 0) >= goals.reps!.min }));
  repOk &&= reps.every((r) => r.ok);
  let gaming: GoalStatus["gaming"];
  if (goals.gaming) {
    const gm = goals.gaming, hist = s.crowdWin.hist.slice(-gm.months), first = s.finance.history.length - hist.length;
    const months = hist.map((m, k) => {
      const h = s.finance.history[first + k];
      return { label: h ? `${MONTH_NAMES[h.month].slice(0, 3)} Y${h.year}` : "", v: winOf(m, gm.type) };
    });
    const avg = months.reduce((a, m) => a + m.v, 0) / gm.months;
    gaming = { now: winOf(s.crowdWin.month, gm.type), months, avg, ok: months.length >= gm.months && avg >= gm.min };
  }
  const police = goals.police !== undefined ? { now: s.auth.police.standing, low: s.lowPolice, ok: s.lowPolice >= goals.police && !s.auth.revoked } : undefined;
  const worthOk = w >= goals.worth;
  return { worth: w, rep, worthOk, repOk, goals, reps, gaming, police, ok: worthOk && repOk && (gaming?.ok ?? true) && (police?.ok ?? true) };
}

export function describeGoals(goals: Goals): string {
  const parts: string[] = [];
  if (goals.gaming) {
    const who = goals.gaming.type ? GUEST_TYPES[goals.gaming.type]?.name ?? goals.gaming.type : "every crowd";
    parts.push(`The take from ${who} averaging ${fmtMoney(goals.gaming.min)} a month over ${goals.gaming.months} months`);
  }
  if (goals.worth) parts.push(`Worth ${fmtMoney(goals.worth)}`);
  if (goals.rep) {
    const who = goals.rep.type ? GUEST_TYPES[goals.rep.type]?.name ?? goals.rep.type : "every kind of guest";
    parts.push(`a reputation of ${goals.rep.min} with ${who}`);
  }
  if (goals.reps) parts.push(`${goals.reps.min} with ${goals.reps.types.map((t) => GUEST_TYPES[t]?.name ?? t).join(" and ")}`);
  const line = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "";
  const keep = goals.police !== undefined ? ` Keep police standing at ${goals.police} or above the whole time.` : "";
  return `${line[0].toUpperCase()}${line.slice(1)} by the end of ${MONTH_NAMES[goals.by.month]}, Year ${goals.by.year}.${keep}`;
}

export const goalSystem: System = {
  id: "goals",
  deps: ["finance", "guests"],
  month(g) {
    // (M12) Close the month's gaming win by crowd (kept for 24 months, like the books).
    const cw = g.state.crowdWin;
    cw.hist.push(cw.month);
    cw.month = {};
    if (cw.hist.length > 24) cw.hist.shift();
    const st = goalStatus(g);
    if (!st || g.state.outcome) return;
    // The month that just closed.
    const d = dateOfDay(Math.floor(g.state.tick / TICKS_PER_DAY) - 1);
    const pastDeadline = d.year > st.goals.by.year || (d.year === st.goals.by.year && d.month >= st.goals.by.month);
    if (st.ok) {
      g.state.outcome = "won";
      news(g, "good", "Scenario complete! You met every goal. Play on as long as you like.", { tab: "goals" });
    } else if (pastDeadline) {
      g.state.outcome = "lost";
      news(g, "urgent", "The deadline passed with goals unmet. The scenario is lost, but you can keep playing.", { tab: "goals" });
    }
  },
  day(g) {
    // (M12) A held line: police standing below it (or the license gone) loses on the spot.
    const goals = SCENARIOS[g.state.scenario].goals;
    if (goals?.police === undefined || g.state.outcome) return;
    if (g.state.lowPolice < goals.police || g.state.auth.revoked) {
      g.state.outcome = "lost";
      news(g, "urgent", `Police standing fell below ${goals.police}. The scenario is lost, but you can keep playing.`, { tab: "goals" });
    }
  },
};
