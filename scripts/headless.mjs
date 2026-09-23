// Proves the sim runs headless in Node (no DOM): bundles src/sim with rolldown, runs the smoke check,
// and reports ticks per second for a crowd. Usage: node scripts/headless.mjs [days] [agents]
import { rolldown } from "rolldown";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const days = Number(process.argv[2] || 7);
const agents = Number(process.argv[3] || 2000);
const dir = mkdtempSync(join(tmpdir(), "ct-headless-"));
const out = join(dir, "sim.mjs");
const bundle = await rolldown({ input: "src/sim/index.ts", platform: "node", logLevel: "silent" });
await bundle.write({ file: out, format: "esm" });
const sim = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

const res = sim.smoke({ days, seeds: [1, 2] });
if (!res.ok) { console.error(res.problems.join("\n")); process.exit(1); }

const g = sim.Game.create("sandbox", 7);
g.dispatch({ type: "spawnWalkers", n: Math.min(agents, 5000) });
for (let k = 5000; k < agents; k += 5000) { g.step(); g.dispatch({ type: "spawnWalkers", n: Math.min(5000, agents - k) }); }
for (let t = 0; t < 200; t++) g.step();
const t0 = performance.now();
for (let t = 0; t < 400; t++) g.step();
const ms = (performance.now() - t0) / 400;
console.log(`headless ok: ${days} days × 2 seeds clean; ${g.state.agents.length} agents at ${ms.toFixed(3)} ms/tick`);
