// Headless checks behind the __ct.smoke debug hook (FOUNDATIONS §1): run N days across seeds with random player
// activity, and verify invariants, save round-trips, and determinism. Never asserts outcomes of random systems;
// exact math (paytables) is checked separately in mathChecks().
import { OBJECTS } from "../data/objects";
import { T } from "../data/terrain";
import { CHANNELS } from "../data/fields";
import { SLOT_MODELS, expectedReturn } from "../data/games";
import { STAFF_ROLES } from "../data/staff";
import { GUEST_TYPES } from "../data/guests";
import { TICKS_PER_DAY } from "./clock";
import { Game } from "./game";
import { rng } from "./rng";
import { loadState, serialize } from "./save";
import { footprint, seats } from "./geometry";

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
  if (s.dirt.length !== n) p.push("dirt wrong length");
  for (let i = 0; i < n; i++) if (s.dirt[i] < 0 || s.dirt[i] !== Math.floor(s.dirt[i])) { p.push(`bad dirt at ${i}`); break; }
  // The books: cash is exactly the sum of everything posted.
  const booked = Object.values(s.finance.total).reduce((a, b) => a + b, 0);
  if (Math.abs(booked - s.cash) > 1e-6 * Math.max(1, Math.abs(s.cash))) p.push(`books ${booked} ≠ cash ${s.cash}`);
  for (const [t, r] of Object.entries(s.rep)) if (r < 0 || r > 100) p.push(`reputation ${t} out of range: ${r}`);
  const seen = new Int32Array(n);
  const seatTile = new Int32Array(n);
  const objIds = new Set<number>();
  for (const o of s.objects) {
    const def = OBJECTS[o.kind];
    if (!def) { p.push(`object ${o.id} unknown kind ${o.kind}`); continue; }
    if (objIds.has(o.id)) p.push(`duplicate object id ${o.id}`);
    objIds.add(o.id);
    for (const q of footprint(def, o.x, o.y, o.rot)) {
      const i = q.y * w + q.x;
      if (q.x < 0 || q.y < 0 || q.x >= w || q.y >= h) { p.push(`object ${o.id} off map`); continue; }
      if (terrain[i] !== T.FLOOR) p.push(`object ${o.id} on non-floor tile`);
      if (seen[i]) p.push(`objects ${seen[i]} and ${o.id} overlap`);
      seen[i] = o.id;
      if (def.blocks && g.occ[i] !== o.id) p.push(`occupancy cache stale at ${i}`);
    }
    for (const q of seats(def, o.x, o.y, o.rot)) {
      const i = q.y * w + q.x;
      if (q.x < 0 || q.y < 0 || q.x >= w || q.y >= h || terrain[i] !== T.FLOOR || g.occ[i]) { p.push(`object ${o.id} seat blocked`); continue; }
      if (seatTile[i]) p.push(`objects ${seatTile[i]} and ${o.id} share a seat tile`);
      seatTile[i] = o.id;
    }
  }
  for (let i = 0; i < n; i++) if (seen[i] && seatTile[i]) { p.push(`seat of ${seatTile[i]} under object ${seen[i]}`); break; }
  const ids = new Set<number>();
  const held = new Map<string, number>();
  for (const a of s.agents) {
    if (ids.has(a.id) || objIds.has(a.id)) p.push(`duplicate id ${a.id}`);
    ids.add(a.id);
    if (!g.walkable(a.y * w + a.x)) p.push(`agent ${a.id} on unwalkable tile ${a.x},${a.y}`);
    if (Math.abs(a.nx - a.x) + Math.abs(a.ny - a.y) > 1) p.push(`agent ${a.id} jumping`);
    if (a.t < 0 || a.t >= a.steps) p.push(`agent ${a.id} bad progress`);
    if (a.role !== "guest" && !STAFF_ROLES[a.role]) p.push(`agent ${a.id} unknown role ${a.role}`);
    if (a.role === "guest") {
      const gd = a.g;
      if (!gd || !GUEST_TYPES[gd.type]) { p.push(`guest ${a.id} missing data`); continue; }
      if (gd.wallet < -1e-9) p.push(`guest ${a.id} negative wallet ${gd.wallet}`);
      if (gd.mood < 0 || gd.mood > 100) p.push(`guest ${a.id} mood out of range`);
      for (const [k, v] of Object.entries(gd.needs)) if (v < 0 || v > 100) p.push(`guest ${a.id} need ${k} out of range`);
      if (a.seat >= 0) {
        const key = `${a.target}:${a.seat}`;
        if (held.has(key)) p.push(`seat conflict: guests ${held.get(key)} and ${a.id} both hold ${key}`);
        held.set(key, a.id);
        const o = s.objects.find((o) => o.id === a.target);
        if (!o) p.push(`guest ${a.id} holds a seat on missing object ${a.target}`);
        else if (a.seat >= OBJECTS[o.kind].seats.length) p.push(`guest ${a.id} holds a seat that doesn't exist`);
      }
      if (a.hidden && a.act !== "restroom") p.push(`guest ${a.id} hidden while ${a.act}`);
      if ((a.act === "play" || a.act === "drink" || a.act === "restroom" || a.act === "cage") && a.seat < 0) p.push(`guest ${a.id} ${a.act} without a seat`);
      if (a.act === "play") {
        const o = s.objects.find((o) => o.id === a.target);
        if (o) {
          const st = seats(OBJECTS[o.kind], o.x, o.y, o.rot)[a.seat];
          if (st && (st.x !== a.x || st.y !== a.y)) p.push(`guest ${a.id} playing away from the machine`);
        }
      }
    }
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

/** Exact math: every paytable's expected return equals its declared target; probabilities are sane. */
export function mathChecks(): string[] {
  const p: string[] = [];
  for (const m of Object.values(SLOT_MODELS)) {
    const rtp = expectedReturn(m);
    if (Math.abs(rtp - m.rtp) > 1e-12) p.push(`${m.id}: paytable returns ${rtp}, declared ${m.rtp}`);
    const total = m.pays.reduce((a, q) => a + q.p, 0);
    if (total <= 0 || total >= 1) p.push(`${m.id}: hit frequency ${total} out of (0, 1)`);
    if (m.pays.some((q) => q.p <= 0 || q.x <= 0)) p.push(`${m.id}: non-positive entry`);
  }
  for (const o of Object.values(OBJECTS)) if (o.slot && !SLOT_MODELS[o.slot]) p.push(`${o.id}: unknown slot model ${o.slot}`);
  return p;
}

/** Random player activity from the smoke stream, so runs exercise invalidation paths and every command. */
function fiddle(g: Game) {
  const r = rng(g.state, "smoke");
  const { w, h } = g.state.map;
  const x = r.int(1, w - 2), y = r.int(1, h - 2);
  const roll = r.next();
  if (roll < 0.25) {
    const len = r.int(2, 6), horiz = r.chance(0.5);
    const tiles = Array.from({ length: len }, (_, k) => (horiz ? y * w + Math.min(w - 1, x + k) : Math.min(h - 1, y + k) * w + x));
    g.dispatch({ type: "build", what: "wall", tiles });
  } else if (roll < 0.35) g.dispatch({ type: "build", what: "door", tiles: [y * w + x] });
  else if (roll < 0.5) g.dispatch({ type: "build", what: "demolish", tiles: [y * w + x, y * w + x + 1] });
  else if (roll < 0.75) g.dispatch({ type: "place", kind: r.pick(Object.keys(OBJECTS)), x, y, rot: r.int(0, 3) });
  else if (roll < 0.85) { if (g.state.objects.length) g.dispatch({ type: "remove", id: r.pick(g.state.objects).id }); }
  else if (roll < 0.93) g.dispatch({ type: "hire", role: r.pick(Object.keys(STAFF_ROLES)) });
  else {
    const staff = g.state.agents.filter((a) => a.role !== "guest");
    if (staff.length) g.dispatch({ type: "fire", id: r.pick(staff).id });
  }
}

function run(scenario: string, seed: number, days: number, onDay?: (g: Game, d: number) => void): Game {
  const g = Game.create(scenario, seed);
  g.dispatch({ type: "spawnGuests", n: 150 });
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

/**
 * Wayfinding guarantees (docs/spec/navigation.md): with every exit walled off, guests who want to leave stay,
 * trapped; once the exits reopen, every one of them finds a way out.
 */
export function exitChecks(): string[] {
  const p: string[] = [];
  const g = Game.create("horseshoe", 9);
  g.dispatch({ type: "spawnGuests", n: 150 });
  for (let t = 0; t < 200; t++) g.step();
  const s = g.state, ents = s.map.entrances, was = ents.map((e) => s.map.terrain[e]);
  const guests = () => s.agents.filter((a) => a.role === "guest");
  for (const a of guests()) Object.assign(a, { act: "idle", seat: -1, target: -1, hidden: 0, timer: 0 }), (a.g!.why = "test");
  for (const e of ents) s.map.terrain[e] = T.WALL;
  g.tilesChanged(ents);
  const n = guests().length;
  for (let t = 0; t < 1500; t++) g.step();
  if (guests().length !== n) p.push(`exits: ${n - guests().length} guests left through walled-off exits`);
  if (!guests().some((a) => a.g!.trapped)) p.push("exits: walled-in guests never noticed they were trapped");
  ents.forEach((e, k) => (s.map.terrain[e] = was[k]));
  g.tilesChanged(ents);
  for (let t = 0; t < 12000 && guests().some((a) => a.g!.why === "test"); t++) g.step();
  const stuck = guests().filter((a) => a.g!.why === "test").length;
  if (stuck) p.push(`exits: ${stuck} guests never found an open exit`);
  p.push(...checkInvariants(g).map((q) => `exits: ${q}`));
  return p;
}

export function smoke(opts: { days: number; seeds: number[]; scenario?: string }): { ok: boolean; problems: string[] } {
  const problems: string[] = [...mathChecks(), ...exitChecks()];
  const sc = opts.scenario ?? "horseshoe";
  for (const seed of opts.seeds) {
    const g = run(sc, seed, opts.days, (g, d) => {
      for (const q of checkInvariants(g)) problems.push(`seed ${seed} day ${d + 1}: ${q}`);
    });
    // Determinism: same seed, same result; and a reloaded save continues identically.
    const again = run(sc, seed, opts.days);
    if (serialize(again) !== serialize(g)) problems.push(`seed ${seed}: two runs with the same seed diverged`);
    const copy = loadState(serialize(g));
    for (let t = 0; t < TICKS_PER_DAY; t++) { g.step(); copy.step(); }
    if (serialize(copy) !== serialize(g)) problems.push(`seed ${seed}: reloaded save diverged from the original`);
  }
  return { ok: problems.length === 0, problems: problems.slice(0, 30) };
}

/** Loads a saved state (any released schema), steps it `days`, and checks invariants throughout. */
export function checkSave(raw: unknown, days = 1): string[] {
  let g: Game;
  try { g = loadState(raw); } catch (e) { return [`won't load: ${(e as Error).message}`]; }
  const p = checkInvariants(g);
  for (let d = 0; d < days && p.length === 0; d++) {
    for (let t = 0; t < TICKS_PER_DAY; t++) g.step();
    g.bus.flush();
    p.push(...checkInvariants(g));
  }
  return p;
}
