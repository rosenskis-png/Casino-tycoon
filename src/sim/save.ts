// Save format: the GameState itself (plain JSON). Loading runs the migration chain up to SCHEMA_VERSION, then
// rebuilds caches. Every released schema keeps a real save in tests/saves/ that `npm run check` loads and steps.
import { SCENARIOS } from "../data/scenarios";
import { GUEST_TYPES } from "../data/guests";
import { Game } from "./game";
import { SCHEMA_VERSION, type GameState } from "./state";
import { T } from "../data/terrain";
import { seedPool } from "./pool";
import { lineTiles } from "./map";

/** M2.5 per-type familiarity defaults, frozen here so the 2 → 3 migration never changes. */
const FAMILIAR_START: Record<string, number> = { local: 0.5, retiree: 0.4, tourist: 0.05 };

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
  // 2 → 3 (M2.5): wayfinding. Objects remember when they were built; guests gain floor knowledge and search
  // state; each type's familiarity with the floor starts at its default.
  2: (s) => {
    for (const o of s.objects) o.built = 0;
    s.familiar = {};
    for (const t of Object.keys(s.rep)) if (t in FAMILIAR_START) s.familiar[t] = FAMILIAR_START[t];
    const w = s.map.w;
    for (const a of s.agents) {
      if (a.role !== "guest" || !a.g) continue;
      let door = -1, bd = Infinity;
      for (const e of s.map.entrances) {
        const d = Math.abs((e % w) - a.x) + Math.abs(Math.floor(e / w) - a.y);
        if (d < bd) { bd = d; door = e; }
      }
      Object.assign(a.g, { know: s.familiar[a.g.type] ?? 0, kseed: a.id, memDate: 0, door, seen: [], trail: [], seek: "", lost: 0, gaveUp: 0, trapped: 0 });
    }
    return s;
  },
  // 3 → 4 (M3): the per-type familiarity becomes a seeded pool of real people who know the floor that well.
  // Guests on the floor stay as one-off visitors, gaining the new fields; drink counts become intoxication.
  // The sidewalk appears; pedestrians, drink policy, and thought counts by day arrive.
  3: (s) => {
    const def = SCENARIOS[s.scenario];
    for (const a of s.agents) {
      const g = a.g;
      if (a.role !== "guest" || !g) continue;
      const intend = g.sober ? 0 : 0.3, intox = Math.min(1.3, (g.intox ?? 0) * 0.12);
      Object.assign(g, {
        pid: -1, group: a.id, lead: 1, sex: a.id & 1, atm: g.atm ? 50 : 0, trips: 0, stake: Math.max(0.25, g.bankroll * 0.008),
        floorTime: s.tick - g.mem.arrived + 3600, intend, drift: intend ? 0.02 : 0, intox, chase: 0, wait: -1,
      });
      delete g.sober;
      delete g.credits;
      Object.assign(g.mem, { feel: 0, rounds: 0, served: 0, comped: 0, early: 0, startIntend: intend, peak: intox, atmYes: 0, exitHops: 0, barAt: 0 });
    }
    s.pool = [];
    s.peds = [];
    s.drinks = { price: 1, comp: 0, strength: 1 };
    for (const t of Object.keys(def?.population ?? {})) if (GUEST_TYPES[t] && s.rep[t] === undefined) s.rep[t] = def.rep[t] ?? 50;
    if (def) seedPool(s, def, s.familiar ?? {});
    delete s.familiar;
    s.thoughts = [s.thoughts?.today ?? {}, s.thoughts?.yday ?? {}];
    s.visits.today.walkedPast = 0;
    s.visits.yday.walkedPast = 0;
    for (const sw of def?.sidewalks ?? []) for (const i of lineTiles(s.map, sw.from, sw.to)) if (s.map.terrain[i] === T.VOID) s.map.terrain[i] = T.SIDEWALK;
    return s;
  },
  // 4 → 5 (M3 revisions): drink policy moves from the whole casino to each bar; guests hold a drink at a time,
  // browse before settling and carry frustration instead of a fail count; people keep favorite spots; servers
  // work a bar (spread evenly) and start a fresh round.
  4: (s) => {
    const pol = s.drinks ?? { price: 1, comp: 0, strength: 1 };
    const bars = s.objects.filter((o: any) => o.kind === "bar");
    for (const o of bars) o.bar = { price: pol.price, comp: pol.comp, strength: pol.strength, area: -1 };
    delete s.drinks;
    for (const p of s.pool) p.fav = [];
    let k = 0;
    for (const a of s.agents) {
      if (a.role === "server") {
        Object.assign(a, { act: "idle", next: "idle", target: -1, timer: 0, dest: a.y * s.map.w + a.x });
        delete a.tray;
        if (bars.length) a.bar = bars[k++ % bars.length].id;
      }
      const g = a.g;
      if (a.role !== "guest" || !g) continue;
      Object.assign(g, { drink: 0, dStr: 0, browse: 0, frus: g.mem.fails ?? 0, liked: [], favAt: 0 });
      delete g.mem.fails;
      Object.assign(g.mem, { offerAt: 0, sitAt: s.tick, favSeat: -1, favScore: 0 });
      // Anyone mid-drink at the bar starts their (new-style) round over.
      if (a.act === "drink") a.timer = 0;
    }
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
