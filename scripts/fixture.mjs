// Writes tests/saves/schema-<N>.json for the current schema if it doesn't exist yet: a real save from a short
// played game, kept forever so every later version must still load it. Run once per schema bump.
import { existsSync, writeFileSync } from "node:fs";
import { loadSim } from "./sim-bundle.mjs";

const sim = await loadSim();
const file = `tests/saves/schema-${sim.SCHEMA_VERSION}.json`;
if (existsSync(file)) { console.log(`${file} already exists`); process.exit(0); }
const g = sim.Game.create("horseshoe", 12345);
const w = g.state.map.w;
// M9.5: the tutorial starts with no research; the fixture builds as if it had it all.
if (sim.SCHEMA_VERSION >= 12) g.state.research.done.push("bigslots", "tables", "tables2", "restaurant", "outdoors", "th_vegas", "th_ancient", "th_luxury", "th_fun");
g.dispatch({ type: "place", kind: "bar", x: 30, y: 20, rot: 0 });
g.dispatch({ type: "place", kind: "slot_thunder", x: 14, y: 20, rot: 1 });
g.dispatch({ type: "hire", role: "tech" });
g.dispatch({ type: "hire", role: "server" });
g.dispatch({ type: "place", kind: "atm", x: 34, y: 28, rot: 0 });
if (sim.SCHEMA_VERSION >= 6) { g.dispatch({ type: "hire", role: "guard" }); g.dispatch({ type: "setRule", cat: "disorder", level: 3 }); }
for (let t = 0; t < 2; t++) g.step();
const bar = g.state.objects.find((o) => o.kind === "bar");
if (bar) g.dispatch({ type: "setBar", id: bar.id, price: 1.5, comp: 0.25, strength: 1.4 });
g.dispatch({ type: "build", what: "wall", tiles: [40, 41, 42].map((x) => 24 * w + x) });
if (sim.SCHEMA_VERSION >= 8) { g.step(); g.dispatch({ type: "build", what: "door", tiles: [24 * w + 41] }); }
g.dispatch({ type: "setRoom", tile: 10 * w + 40, name: "Back room", purpose: "office" });
if (sim.SCHEMA_VERSION >= 8) {
  // M6: a sized restaurant, a door rule with a fee.
  g.dispatch({ type: "place", kind: "restaurant", x: 38, y: 20, rot: 0, w: 5, h: 3 });
  for (let t = 0; t < 2; t++) g.step();
  g.dispatch({ type: "setDoor", tile: 24 * w + 41, rule: 0, fee: 2 });
}
if (sim.SCHEMA_VERSION >= 9) {
  // M6.5: themed decor, a garden and a pool outside.
  g.dispatch({ type: "place", kind: "deco_lamp", x: 20, y: 8, rot: 0 });
  g.dispatch({ type: "place", kind: "tiki_torch", x: 40, y: 34, rot: 0 });
  g.dispatch({ type: "place", kind: "garden", x: 34, y: 33, rot: 0, w: 4, h: 3 });
}
if (sim.SCHEMA_VERSION >= 10) {
  // M7: blackjack and craps with dealers and a pit boss; house rules on the blackjack table.
  g.dispatch({ type: "place", kind: "blackjack", x: 30, y: 12, rot: 0 });
  g.dispatch({ type: "place", kind: "craps", x: 12, y: 6, rot: 0 });
  for (const role of ["dealer", "dealer", "dealer", "pitboss"]) g.dispatch({ type: "hire", role });
  for (let t = 0; t < 2; t++) g.step();
  const bj = g.state.objects.find((o) => o.kind === "blackjack");
  if (bj) g.dispatch({ type: "setTable", id: bj.id, rules: [1, 0, 1], lim: 3 });
}
if (sim.SCHEMA_VERSION >= 11) {
  // M9: pay, a zoned janitor, a loan, insurance, a skim and comps.
  g.dispatch({ type: "setPay", role: "dealer", pay: 1.3 });
  g.dispatch({ type: "setPay", role: "janitor", pay: 0.8 });
  const jan = g.state.agents.find((a) => a.role === "janitor");
  if (jan) g.dispatch({ type: "setZone", id: jan.id, tile: 10 * w + 20 });
  g.dispatch({ type: "borrow", amount: 2000 });
  g.dispatch({ type: "setInsurance", over: 1000 });
  g.dispatch({ type: "setSkim", share: 0.1 });
  g.dispatch({ type: "setComp", kind: "meal", at: 20 });
  g.dispatch({ type: "setComp", kind: "back", at: 5 });
}
if (sim.SCHEMA_VERSION >= 13) {
  // M9.6: vice ignored, drugs lenient, a comped room (no elevator here: never given).
  g.dispatch({ type: "setRule", cat: "vice", level: 0 });
  g.dispatch({ type: "setRule", cat: "drugs", level: 1 });
  g.dispatch({ type: "setComp", kind: "room", at: 20 });
}
if (sim.SCHEMA_VERSION >= 12) {
  // M9.5: research under way, an ad campaign.
  g.dispatch({ type: "setFunding", amount: 500 });
  g.dispatch({ type: "setProject", id: "club" });
  g.dispatch({ type: "advertise", id: "radio", months: 3 });
}
for (let t = 0; t < 200 * (sim.SCHEMA_VERSION >= 4 ? 40 : 4) + 37; t++) g.step();
if (sim.SCHEMA_VERSION >= 14) {
  // M10: saved mid-hand at your own blackjack table (a slot if the table has no dealer).
  const bj = g.state.objects.find((o) => o.kind === "blackjack" && !g.check({ type: "yours", act: "open", id: o.id }));
  const slot = g.state.objects.find((o) => o.kind.startsWith("slot"));
  g.dispatch({ type: "yours", act: "open", id: (bj ?? slot).id });
  g.step();
  if (bj) g.dispatch({ type: "yours", act: "deal", bet: sim.limitsNow(g, bj)[0] });
  else g.dispatch({ type: "yours", act: "spin", bet: 1 });
  g.step();
}
writeFileSync(file, sim.serialize(g));
console.log(`wrote ${file} (${g.state.agents.length} agents, ${g.state.objects.length} objects)`);
