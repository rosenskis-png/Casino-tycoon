// Headless checks behind the __ct.smoke debug hook (FOUNDATIONS §1): run N days across seeds with random building,
// and verify invariants, save round-trips, and determinism. Never asserts outcomes of random systems.
import { OBJECTS } from "../data/objects";
import { T } from "../data/terrain";
import { CHANNELS } from "../data/fields";
import { TICKS_PER_DAY } from "./clock";
import { Game } from "./game";
import { rng } from "./rng";
import { loadState, serialize } from "./save";

export function checkInvariants(g: Game): string[] {
  const p: string[] = [];
  const s = g.state;
  const { w, h, terrain } = s.map;
  const n = w * h;
  (function finite(v: unknown, path: string) {
    if (p.length > 20) return;
    if (typeof v === "number") { if (!Number.isFinite(v)) p.push(`non-finite ${path}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const k in v) finite((v as Record<string, unknown>)[k], `${path}.${k}`);
  })(s, "state");
  for (const arr of ["terrain", "outdoor", "fixed", "door"] as const) if (s.map[arr].length !== n) p.push(`map.${arr} wrong length`);
  if (s.traffic.length !== n) p.push("traffic wrong length");
  if (s.cash < 0) p.push(`negative cash ${s.cash}`);
  const seen = new Int32Array(n);
  for (const o of s.objects) {
    const def = OBJECTS[o.kind];
    if (!def) { p.push(`object ${o.id} unknown kind ${o.kind}`); continue; }
    for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
      const x = o.x + dx, y = o.y + dy, i = y * w + x;
      if (x < 0 || y < 0 || x >= w || y >= h) { p.push(`object ${o.id} off map`); continue; }
      if (terrain[i] !== T.FLOOR) p.push(`object ${o.id} on non-floor tile`);
      if (seen[i]) p.push(`objects ${seen[i]} and ${o.id} overlap`);
      seen[i] = o.id;
      if (def.blocks && g.occ[i] !== o.id) p.push(`occupancy cache stale at ${i}`);
    }
  }
  const ids = new Set<number>();
  for (const a of s.agents) {
    if (ids.has(a.id)) p.push(`duplicate agent id ${a.id}`);
    ids.add(a.id);
    if (!g.walkable(a.y * w + a.x)) p.push(`agent ${a.id} on unwalkable tile ${a.x},${a.y}`);
    if (Math.abs(a.nx - a.x) + Math.abs(a.ny - a.y) > 1) p.push(`agent ${a.id} jumping`);
    if (a.t < 0 || a.t >= a.steps) p.push(`agent ${a.id} bad progress`);
  }
  for (let i = 0; i < n; i++) {
    const r = g.rooms.roomOf[i];
    if ((terrain[i] === T.FLOOR) !== (r >= 0)) { p.push(`room index wrong at ${i}`); break; }
  }
  for (const c of CHANNELS) {
    const v = g.fields.values[c];
    for (let i = 0; i < n; i++) if (!Number.isFinite(v[i]) || v[i] < 0) { p.push(`field ${c} bad at ${i}`); break; }
  }
  const re = serialize(loadState(serialize(g)));
  if (re !== serialize(g)) p.push("save does not round-trip");
  return p;
}

/** Random player activity from the smoke stream, so runs exercise invalidation paths. */
function fiddle(g: Game) {
  const r = rng(g.state, "smoke");
  const { w, h } = g.state.map;
  const x = r.int(1, w - 2), y = r.int(1, h - 2);
  const roll = r.next();
  if (roll < 0.35) {
    const len = r.int(2, 6), horiz = r.chance(0.5);
    const tiles = Array.from({ length: len }, (_, k) => (horiz ? y * w + Math.min(w - 1, x + k) : Math.min(h - 1, y + k) * w + x));
    g.dispatch({ type: "build", what: "wall", tiles });
  } else if (roll < 0.5) g.dispatch({ type: "build", what: "door", tiles: [y * w + x] });
  else if (roll < 0.7) g.dispatch({ type: "build", what: "demolish", tiles: [y * w + x, y * w + x + 1] });
  else if (roll < 0.9) g.dispatch({ type: "place", kind: r.pick(Object.keys(OBJECTS)), x, y, rot: 0 });
  else if (g.state.objects.length) g.dispatch({ type: "remove", id: r.pick(g.state.objects).id });
}

function run(seed: number, days: number, onDay?: (g: Game, d: number) => void): Game {
  const g = Game.create("sandbox", seed);
  g.dispatch({ type: "spawnWalkers", n: 200 });
  for (let d = 0; d < days; d++) {
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      if (t % 50 === 0) fiddle(g);
      g.step();
    }
    g.bus.flush();
    onDay?.(g, d);
  }
  return g;
}

export function smoke(opts: { days: number; seeds: number[] }): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const seed of opts.seeds) {
    const g = run(seed, opts.days, (g, d) => {
      for (const q of checkInvariants(g)) problems.push(`seed ${seed} day ${d + 1}: ${q}`);
    });
    // Determinism: same seed, same result; and a reloaded save continues identically.
    const again = run(seed, opts.days);
    if (serialize(again) !== serialize(g)) problems.push(`seed ${seed}: two runs with the same seed diverged`);
    const copy = loadState(serialize(g));
    for (let t = 0; t < TICKS_PER_DAY; t++) { g.step(); copy.step(); }
    if (serialize(copy) !== serialize(g)) problems.push(`seed ${seed}: reloaded save diverged from the original`);
  }
  return { ok: problems.length === 0, problems: problems.slice(0, 30) };
}
