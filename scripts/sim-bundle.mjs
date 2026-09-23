// Bundles src/sim for Node (no DOM) and imports it. Shared by the headless checks and the save-fixture tool.
import { rolldown } from "rolldown";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function loadSim() {
  const dir = mkdtempSync(join(tmpdir(), "ct-sim-"));
  const out = join(dir, "sim.mjs");
  const bundle = await rolldown({ input: "src/sim/index.ts", platform: "node", logLevel: "silent" });
  await bundle.write({ file: out, format: "esm" });
  const sim = await import(pathToFileURL(out).href);
  rmSync(dir, { recursive: true, force: true });
  return sim;
}
