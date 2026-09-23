// Scenario goals (FOUNDATIONS §20): a money goal (casino worth) and a reputation goal, by a deadline. Checked
// when each month closes. Play continues after a win or a loss.
import { SCENARIOS, type Goals } from "../data/scenarios";
import { GUEST_TYPES } from "../data/guests";
import { MONTH_NAMES, TICKS_PER_DAY, dateOfDay } from "./clock";
import type { Game } from "./game";
import type { System } from "./registry";
import { worth } from "./finance";
import { fmtMoney, news } from "./news";

export interface GoalStatus { worth: number; rep: number; worthOk: boolean; repOk: boolean; goals: Goals }

export function goalStatus(g: Game): GoalStatus | null {
  const goals = SCENARIOS[g.state.scenario].goals;
  if (!goals) return null;
  const w = worth(g);
  const types = goals.rep.type ? [goals.rep.type] : Object.keys(g.state.rep);
  const rep = Math.min(...types.map((t) => g.state.rep[t] ?? 0));
  return { worth: w, rep, worthOk: w >= goals.worth, repOk: rep >= goals.rep.min, goals };
}

export function describeGoals(goals: Goals): string {
  const who = goals.rep.type ? GUEST_TYPES[goals.rep.type]?.name ?? goals.rep.type : "every kind of guest";
  return `Worth ${fmtMoney(goals.worth)} and a reputation of ${goals.rep.min} with ${who} by the end of ${MONTH_NAMES[goals.by.month]}, Year ${goals.by.year}.`;
}

export const goalSystem: System = {
  id: "goals",
  deps: ["finance", "guests"],
  month(g) {
    const st = goalStatus(g);
    if (!st || g.state.outcome) return;
    // The month that just closed.
    const d = dateOfDay(Math.floor(g.state.tick / TICKS_PER_DAY) - 1);
    const pastDeadline = d.year > st.goals.by.year || (d.year === st.goals.by.year && d.month >= st.goals.by.month);
    if (st.worthOk && st.repOk) {
      g.state.outcome = "won";
      news(g, "good", "Scenario complete! You met every goal. Play on as long as you like.");
    } else if (pastDeadline) {
      g.state.outcome = "lost";
      news(g, "urgent", "The deadline passed with goals unmet. The scenario is lost, but you can keep playing.");
    }
  },
};
