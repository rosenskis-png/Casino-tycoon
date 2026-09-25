// Dark-lever report (M11.2): plays the Test Floor for a year clean and with every dark lever pulled (a 30% tax
// skim, free strong drinks at every bar, every house rule on Ignore), over several seeds, and prints what each
// earned and what it cost: cash, the authorities, reputation. A report, not a check. Usage: node scripts/dark.mjs [days] [seeds]
import { loadSim } from "./sim-bundle.mjs";

const days = Number(process.argv[2] || 360);
// Gaming win swings far more than any lever between seeds (jackpots, whales): compare slots' theoretical win,
// and read each lever's cost in its own ledger line.
const seeds = (process.argv[3] || "1,2,3").split(",").map(Number);
const sim = await loadSim();
const theoWin = (g) => {
  let t = 0;
  for (const o of g.state.objects) if (sim.OBJECTS[o.kind].slot) t += o.st.coinIn * (1 - (sim.designById(g.state, o.design ?? sim.OBJECTS[o.kind].slot)?.rtp ?? 0.9));
  return t;
};
for (const dark of [false, true]) {
  const rows = [];
  for (const seed of seeds) {
    const g = sim.Game.create("testfloor", seed);
    if (dark) {
      const cmds = [{ type: "setSkim", share: 0.3 }, ...g.state.objects.filter((o) => o.bar).map((o) => ({ type: "setBar", id: o.id, comp: 1, strength: 1.4 })),
        ...["intox", "disorder", "misconduct", "vice", "drugs"].map((cat) => ({ type: "setRule", cat, level: 0 }))];
      for (const c of cmds) { const why = g.dispatch(c); if (why) console.log(`  ${c.type} refused: ${why}`); }
      g.flushCommands();
    }
    let low = { police: 100, reg: 100 };
    for (let d = 0; d < days; d++) {
      for (let t = 0; t < sim.TICKS_PER_DAY; t++) g.step();
      g.bus.flush();
      low = { police: Math.min(low.police, g.state.auth.police.standing), reg: Math.min(low.reg, g.state.auth.regulator.standing) };
    }
    const H = g.state.finance.history, sum = (k) => Math.round(H.reduce((a, m) => a + (m.l[k] ?? 0), 0));
    const rep = Object.values(g.state.rep), avgRep = rep.reduce((a, b) => a + b, 0) / rep.length;
    rows.push(`  seed ${seed}: cash ${Math.round(g.state.cash)}, worth ${Math.round(sim.worth(g))}, slots theo ${Math.round(theoWin(g))}, tax ${sum("tax")} (evaded ${Math.round(g.state.bank.evaded)}), fines ${sum("fines")}, drinks ${sum("drinks")}, bar ${sum("bar")}; police low ${Math.round(low.police)}, stage ${g.state.auth.police.stage}; regulator low ${Math.round(low.reg)}, stage ${g.state.auth.regulator.stage}; avg rep ${Math.round(avgRep)}; ${g.state.outcome || ""}`);
  }
  console.log(`${dark ? "dark levers" : "clean"} (${days} days)\n${rows.join("\n")}`);
}
