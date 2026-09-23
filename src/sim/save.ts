// Save format: { schema, state }. Loading runs the migration chain up to SCHEMA_VERSION, then rebuilds caches.
import { SCENARIOS } from "../data/scenarios";
import { Game } from "./game";
import { SCHEMA_VERSION, type GameState } from "./state";

/** MIGRATIONS[n] upgrades a schema-n state to schema n+1. Add one with every save-shape change. */
const MIGRATIONS: Record<number, (s: any) => any> = {};

export function serialize(g: Game): string {
  return JSON.stringify(g.state);
}

export function loadState(raw: unknown): Game {
  let s = typeof raw === "string" ? JSON.parse(raw) : structuredClone(raw);
  if (!s || typeof s !== "object" || typeof s.schema !== "number") throw new Error("Not a Casino Tycoon save");
  if (s.schema > SCHEMA_VERSION) throw new Error("Save is from a newer version of the game");
  while (s.schema < SCHEMA_VERSION) {
    const m = MIGRATIONS[s.schema];
    if (!m) throw new Error(`No migration from save version ${s.schema}`);
    s = m(s);
    s.schema++;
  }
  const st = s as GameState;
  if (!SCENARIOS[st.scenario] || !st.map || st.map.terrain.length !== st.map.w * st.map.h) throw new Error("Save is damaged");
  return new Game(st);
}
