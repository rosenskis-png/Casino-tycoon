// Tutorial economy report (M11.2): plays The Lucky Horseshoe headless under scripted strategies and prints cash,
// worth, the monthly books, guests and reputation every 6 months, over several seeds. "idle" does nothing,
// "janitor" only hires janitors, "good" fixes what the tutorial is about (janitors, a guard and moderate rules,
// no free strong drinks, the broken theming out, Medieval decor, a restaurant, a family campaign, a show lounge
// once researched). Doing nothing must never win; "good" should win before the deadline. For balancing, not a check.
// Usage: node scripts/economy.mjs [strategy] [months] [seeds]
import { loadSim } from "./sim-bundle.mjs";
const [strat = "good", months = "24", seeds = "1,2,3"] = process.argv.slice(2);
const sim = await loadSim();
const P = (kind, x, y, extra = {}) => ({ type: "place", kind, x, y, rot: 0, ...extra });
const plan = {
  idle: [],
  janitor: [[0, (g) => [{ type: "hire", role: "janitor" }, { type: "hire", role: "janitor" }]]],
  good: [
    [0, (g) => [
      { type: "hire", role: "janitor" }, { type: "hire", role: "janitor" }, { type: "hire", role: "guard" },
      { type: "setRule", cat: "intox", level: 2 }, { type: "setRule", cat: "disorder", level: 2 },
      ...g.state.objects.filter((o) => o.kind === "bar").map((o) => ({ type: "setBar", id: o.id, comp: 0, strength: 1 })),
      ...g.state.objects.filter((o) => sim.OBJECTS[o.kind].scenarioOnly).map((o) => ({ type: "remove", id: o.id })),
      { type: "setFunding", amount: 500 }, { type: "setProject", id: "shows" },
    ]],
    [3, () => [P("med_banner", 21, 7), P("med_banner", 21, 10), P("med_shield", 22, 14), P("med_armor", 7, 9), P("med_armor", 34, 9), P("med_brazier", 21, 17), P("med_shield", 7, 18), P("med_banner", 38, 6), P("bin", 22, 12), P("bin", 26, 19), P("plant", 34, 16)]],
    [20, () => [P("restaurant", 30, 20, { w: 4, h: 4 }), { type: "hire", role: "server" }]],
    [60, () => [{ type: "advertise", id: "family", months: 6 }]],
    [40, () => [P("med_armor", 29, 19), P("med_brazier", 35, 22), P("egypt_cat", 44, 8), P("rome_bust", 44, 12), P("rome_urn", 38, 13)]],
    [-1, (g) => sim.researched(g.state, "shows") && !g.state.objects.some((o) => o.kind === "showlounge") ? [P("showlounge", 38, 18, { w: 5, h: 5 }), { type: "setFunding", amount: 0 }] : []],
  ],
};
for (const seed of seeds.split(",").map(Number)) {
  const g = sim.Game.create("horseshoe", seed);
  const out = [];
  let rejects = [];
  for (let day = 0; day < +months * 30; day++) {
    for (const [d, f] of plan[strat]) if (d === day || (d === -1 && day % 10 === 5)) for (const c of f(g)) { const why = g.dispatch(c); if (why) rejects.push(`${c.type}${c.kind ? " " + c.kind : ""}: ${why}`); g.flushCommands(); }
    for (let t = 0; t < sim.TICKS_PER_DAY; t++) g.step();
    g.bus.flush();
    if ((day + 1) % 180 === 0) {
      const H = g.state.finance.history.slice(-6); let net = 0, gam = 0;
      for (const h of H) for (const [k, v] of Object.entries(h.l)) { if (!["start", "build", "hire", "sales"].includes(k)) net += v / H.length; if (k === "slots") gam += v / H.length; }
      out.push(`m${(day + 1) / 30}: cash ${Math.round(g.state.cash / 100) / 10}K worth ${Math.round(sim.worth(g) / 100) / 10}K net/mo ${Math.round(net)} slots/mo ${Math.round(gam)} guests ${g.state.agents.filter((a) => a.role === "guest").length} rep L${Math.round(g.state.rep.local)} T${Math.round(g.state.rep.tourist)} F${Math.round(g.state.rep.family)} R${Math.round(g.state.rep.retiree)} ${g.state.outcome}`);
    }
  }
  console.log(`${strat} seed ${seed}: ${out.join(" | ")}${rejects.length ? "\n  rejected: " + [...new Set(rejects)].join("; ") : ""}`);
}
