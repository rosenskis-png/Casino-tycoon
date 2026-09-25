// Tutorial economy report (M11.2): plays The Lucky Horseshoe headless under scripted strategies and prints cash,
// worth, the monthly books, guests and reputation every 6 months, over several seeds. "idle" does nothing,
// "janitor" only hires janitors, "big" spends freely on everything, "good" fixes what the tutorial is about (janitors, a guard and moderate rules,
// no free strong drinks, the broken theming out, Medieval decor, a restaurant, a family campaign, a show lounge
// once researched), "tempt" is "good" plus the families' favorite machines moved by the attractions (M11.3). Doing nothing must never win; "good" should win before the deadline. For balancing, not a check.
// Usage: node scripts/economy.mjs [strategy] [months] [seeds]
import { loadSim } from "./sim-bundle.mjs";
const [strat = "good", months = "24", seeds = "1,2,3"] = process.argv.slice(2);
const sim = await loadSim();
const P = (kind, x, y, extra = {}) => ({ type: "place", kind, x, y, rot: 0, ...extra });
// (M11.3) Moves up to `n` machines of `design` (farthest first) next to an attraction, where the guests it draws walk
// past them on the way in and out: temptation's layout lever. Dispatches directly (each move is validated).
const nearMoves = (g, kind, design, n) => {
  const at = g.state.objects.find((o) => o.kind === kind);
  if (!at) return [];
  const d = (o) => Math.abs(o.x - at.x) + Math.abs(o.y - at.y);
  const ms = g.state.objects.filter((o) => o.design === design && d(o) > 10).sort((a, b) => d(b) - d(a));
  let moved = 0;
  for (let r = 2; r <= 9 && moved < n; r++)
    for (let dy = -r; dy <= r && moved < n; dy++) for (let dx = -r; dx <= r && moved < n; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !ms.length) continue;
      if (!g.dispatch({ type: "move", id: ms[0].id, x: at.x + dx, y: at.y + dy, rot: 0 })) { g.flushCommands(); ms.shift(); moved++; }
    }
  return [];
};
const plan = {
  idle: [],
  janitor: [[0, (g) => [{ type: "hire", role: "janitor" }, { type: "hire", role: "janitor" }]]],
  // Spends freely, as a player who fixes everything and themes the whole floor would (M11.2 owner's playtest).
  big: [
    [0, (g) => [
      { type: "hire", role: "janitor" }, { type: "hire", role: "janitor" }, { type: "hire", role: "janitor" }, { type: "hire", role: "guard" }, { type: "hire", role: "guard" },
      { type: "setRule", cat: "intox", level: 2 }, { type: "setRule", cat: "disorder", level: 3 },
      ...g.state.objects.filter((o) => o.kind === "bar").map((o) => ({ type: "setBar", id: o.id, comp: 0, strength: 1 })),
      ...g.state.objects.filter((o) => sim.OBJECTS[o.kind].scenarioOnly).map((o) => ({ type: "remove", id: o.id })),
      { type: "setFunding", amount: 1000 }, { type: "setProject", id: "shows" },
    ]],
    [2, () => [P("med_banner", 21, 7), P("med_banner", 21, 10), P("med_shield", 22, 14), P("med_armor", 7, 9), P("med_armor", 34, 9), P("med_brazier", 21, 17), P("med_shield", 7, 18), P("med_banner", 38, 6),
      P("med_armor", 7, 12), P("med_brazier", 34, 13), P("med_shield", 10, 6), P("med_banner", 33, 6), P("rome_bust", 44, 12), P("rome_urn", 38, 13), P("rome_column", 45, 6), P("rome_standard", 41, 6),
      P("bin", 22, 12), P("bin", 26, 19), P("bin", 9, 25), P("plant", 34, 16), P("plant", 20, 28)]],
    [10, () => [P("restaurant", 30, 20, { w: 6, h: 4 }), { type: "hire", role: "server" }, { type: "hire", role: "entertainer" }]],
    [15, () => [P("minigolf", 16, 33, { w: 7, h: 5 })]],
    [30, () => [{ type: "advertise", id: "family", months: 6 }, { type: "advertise", id: "travel", months: 6 }]],
    [45, () => [P("med_armor", 29, 19), P("med_brazier", 37, 22), P("egypt_cat", 44, 8), P("med_banner", 29, 25), P("med_shield", 36, 26)]],
    [-1, (g) => sim.researched(g.state, "shows") && !g.state.objects.some((o) => o.kind === "showlounge") ? [P("showlounge", 38, 18, { w: 6, h: 6 }), { type: "setFunding", amount: 0 }] : []],
  ],
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
    [60, () => [{ type: "advertise", id: "family", months: 6 }, P("minigolf", 16, 33, { w: 6, h: 4 }), { type: "hire", role: "entertainer" }]],
    [40, () => [P("med_armor", 29, 19), P("med_brazier", 35, 22), P("egypt_cat", 44, 8), P("rome_bust", 44, 12), P("rome_urn", 38, 13)]],
    [-1, (g) => sim.researched(g.state, "shows") && !g.state.objects.some((o) => o.kind === "showlounge") ? [P("showlounge", 38, 18, { w: 5, h: 5 }), { type: "setFunding", amount: 0 }] : []],
  ],
};
// (M11.3) "good" plus temptation by layout: the families' favorite machines by the restaurant, mini golf and the show.
plan.tempt = [...plan.good,
  [21, (g) => nearMoves(g, "restaurant", "cherries", 6)], [61, (g) => nearMoves(g, "minigolf", "cherries", 6)],
  [-1, (g) => { if (g.state.objects.some((o) => o.kind === "showlounge") && !g.moved) { g.moved = 1; nearMoves(g, "showlounge", "cherries", 6); } return []; }],
];
for (const seed of seeds.split(",").map(Number)) {
  const g = sim.Game.create("horseshoe", seed);
  g.dispatch({ type: "setInsurance", level: 1 }); // (M11.4, owner) insured like a sensible player: big payouts over half a month's machine win
  const out = [];
  let rejects = [];
  let occ = { play: 0, seats: 0, here: 0, by: {} };
  for (let day = 0; day < +months * 30; day++) {
    for (const [d, f] of plan[strat]) if (d === day || (d === -1 && day % 10 === 5)) for (const c of f(g)) { const why = g.dispatch(c); if (why) rejects.push(`${c.type}${c.kind ? " " + c.kind : ""}: ${why}`); g.flushCommands(); }
    for (let t = 0; t < sim.TICKS_PER_DAY; t++) {
      g.step();
      if (t % 50) continue;
      let play = 0, here = 0;
      for (const a of g.state.agents) if (a.role === "guest" && !a.g.minor) {
        here++;
        const on = a.act === "play" && a.seat >= 0, k = (occ.by[a.g.type] ??= [0, 0]);
        k[0]++;
        if (on) { play++; k[1]++; }
      }
      occ.play += play; occ.seats += g.gameSeats; occ.here += here;
    }
    g.bus.flush();
    if ((day + 1) % 180 === 0) {
      const H = g.state.finance.history.slice(-6); let net = 0, gam = 0;
      for (const h of H) for (const [k, v] of Object.entries(h.l)) { if (!["start", "build", "hire", "sales"].includes(k)) net += v / H.length; if (k === "slots") gam += v / H.length; }
      const o = occ; occ = { play: 0, seats: 0, here: 0, by: {} };
      const n = Math.max(1, o.seats / g.gameSeats), who = Object.entries(o.by).sort((a, b) => b[1][0] - a[1][0]).map(([t, [c, p]]) => `${t[0].toUpperCase()}${Math.round(c / n)}/${Math.round((100 * p) / Math.max(1, c))}%`).join(" ");
      out.push(`m${(day + 1) / 30}: cash ${Math.round(g.state.cash / 100) / 10}K worth ${Math.round(sim.worth(g) / 100) / 10}K net/mo ${Math.round(net)} slots/mo ${Math.round(gam)} guests ${g.state.agents.filter((a) => a.role === "guest").length} seats used ${Math.round((100 * o.play) / Math.max(1, o.seats))}% adults playing ${Math.round((100 * o.play) / Math.max(1, o.here))}% [${who}] rep L${Math.round(g.state.rep.local)} T${Math.round(g.state.rep.tourist)} F${Math.round(g.state.rep.family)} R${Math.round(g.state.rep.retiree)} ${g.state.outcome}`);
    }
  }
  console.log(`${strat} seed ${seed}: ${out.join(" | ")}${rejects.length ? "\n  rejected: " + [...new Set(rejects)].join("; ") : ""}`);
}
