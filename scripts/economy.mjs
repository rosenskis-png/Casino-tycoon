// Tutorial economy report: plays The Lucky Horseshoe headless for a year with the obvious first moves (a slot
// tech and a bar), then prints guests, reputation and the monthly books. For balancing against earlier builds;
// a report, not a check. Usage: node scripts/economy.mjs [seed]
import { loadSim } from "./sim-bundle.mjs";

const sim = await loadSim();
const g = sim.Game.create("horseshoe", Number(process.argv[2] || 1));
g.dispatch({ type: "hire", role: "tech" });
g.dispatch({ type: "place", kind: "bar", x: 30, y: 20, rot: 0 });
let guests = 0, n = 0, playing = 0;
for (let d = 0; d < 365; d++) {
  for (let t = 0; t < sim.TICKS_PER_DAY; t++) {
    g.step();
    if (t === 0) { n++; guests += g.state.agents.filter((a) => a.role === "guest").length; playing += g.state.agents.filter((a) => a.role === "guest" && a.act === "play" && a.seat >= 0).length / Math.max(1, g.gameSeats); }
  }
  g.bus.flush();
}
const cats = ["slots", "bar", "drinks", "wages", "upkeep"];
console.log(`average guests on the floor ${(guests / n).toFixed(0)} (${Math.round((100 * playing) / n)}% of game seats in use); cash at year end ${Math.round(g.state.cash)}`);
for (const m of g.state.finance.history) console.log(`${sim.MONTH_NAMES[m.month]}  ${cats.map((c) => `${c} ${Math.round(m.l[c] ?? 0)}`).join("  ")}`);
console.log(`reputation ${Object.entries(g.state.rep).map(([t, r]) => `${t} ${Math.round(r)}`).join(", ")}`);
