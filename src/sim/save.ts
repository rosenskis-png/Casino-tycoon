// Save format: the GameState itself (plain JSON). Loading runs the migration chain up to SCHEMA_VERSION, then
// rebuilds caches. Every released schema keeps a real save in tests/saves/ that `npm run check` loads and steps.
import { SCENARIOS } from "../data/scenarios";
import { GUEST_TYPES } from "../data/guests";
import { Game } from "./game";
import { SCHEMA_VERSION, type GameState } from "./state";

/** MIGRATIONS[n] upgrades a schema-n state to schema n+1. Add one with every save-shape change. */
const MIGRATIONS: Record<number, (s: any) => any> = {
  // 1 → 2 (M2): test walkers retire (guests replace them); objects gain state and stats; dirt, reputation,
  // books, thought summaries, visit counters and the scenario outcome appear. Existing cash becomes the
  // opening balance so the books add up.
  1: (s) => {
    const n = s.map.w * s.map.h;
    s.agents = [];
    s.objects = s.objects.map((o: any) => ({ ...o, broken: 0, last: { tick: -1, win: 0 }, st: { rounds: 0, coinIn: 0, paidOut: 0, sessions: 0, playTicks: 0, uses: 0 } }));
    s.dirt = new Array(n).fill(0);
    s.rep = {};
    for (const t of Object.keys(SCENARIOS[s.scenario]?.population ?? {})) if (GUEST_TYPES[t]) s.rep[t] = 50;
    s.finance = { month: { start: s.cash }, history: [], total: { start: s.cash } };
    s.thoughts = { today: {}, yday: {} };
    const v = () => ({ arrived: 0, left: 0, satSum: 0, broke: 0 });
    s.visits = { today: v(), yday: v() };
    s.outcome = "";
    return s;
  },
};

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
