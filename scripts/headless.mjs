// Proves the sim runs headless in Node (no DOM): runs the smoke check (with exact-math checks), loads and steps
// every save fixture in tests/saves/, and reports ticks per second for a crowd.
// Usage: node scripts/headless.mjs [days] [agents]
import { readdirSync, readFileSync } from "node:fs";
import { loadSim } from "./sim-bundle.mjs";

const days = Number(process.argv[2] || 7);
const agents = Number(process.argv[3] || 5000);
const sim = await loadSim();

const res = sim.smoke({ days, seeds: [1, 2] });
if (!res.ok) { console.error(res.problems.join("\n")); process.exit(1); }

// Save fixtures: one real save per released schema must load (through migrations) and keep running cleanly.
const fixtures = readdirSync("tests/saves").filter((f) => /^schema-\d+\.json$/.test(f));
const have = new Set(fixtures.map((f) => Number(f.match(/\d+/)[0])));
const missing = [];
for (let v = 1; v <= sim.SCHEMA_VERSION; v++) if (!have.has(v)) missing.push(v);
if (missing.length) { console.error(`no save fixture for schema ${missing.join(", ")}: run npm run fixture`); process.exit(1); }
for (const f of fixtures) {
  const p = sim.checkSave(JSON.parse(readFileSync(`tests/saves/${f}`, "utf8")), 1);
  if (p.length) { console.error(`tests/saves/${f}:\n${p.slice(0, 20).join("\n")}`); process.exit(1); }
}

// Largest-scale floor: invariants hold with a big crowd, then time a tick.
const g = sim.Game.create("bigfloor", 7);
for (let k = 0; k < agents; k += 5000) { g.dispatch({ type: "spawnGuests", n: Math.min(5000, agents - k) }); g.step(); }
for (let t = 0; t < 400; t++) g.step();
const big = sim.checkInvariants(g);
if (big.length) { console.error(`big floor:\n${big.slice(0, 20).join("\n")}`); process.exit(1); }
const t0 = performance.now();
for (let t = 0; t < 400; t++) g.step();
const ms = (performance.now() - t0) / 400;
console.log(`headless ok: ${days} days × 2 seeds clean; ${fixtures.length} save fixtures load; big floor ${g.state.agents.length} agents at ${ms.toFixed(3)} ms/tick`);
