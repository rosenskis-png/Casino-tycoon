// Writes tests/saves/schema-<N>.json for the current schema if it doesn't exist yet: a real save from a short
// played game, kept forever so every later version must still load it. Run once per schema bump.
import { existsSync, writeFileSync } from "node:fs";
import { loadSim } from "./sim-bundle.mjs";

const sim = await loadSim();
const file = `tests/saves/schema-${sim.SCHEMA_VERSION}.json`;
if (existsSync(file)) { console.log(`${file} already exists`); process.exit(0); }
const g = sim.Game.create("horseshoe", 12345);
const w = g.state.map.w;
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
for (let t = 0; t < 200 * (sim.SCHEMA_VERSION >= 4 ? 40 : 4) + 37; t++) g.step();
writeFileSync(file, sim.serialize(g));
console.log(`wrote ${file} (${g.state.agents.length} agents, ${g.state.objects.length} objects)`);
