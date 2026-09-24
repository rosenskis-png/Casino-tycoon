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
import { MAX_PEDS } from "./street";
import { TRAY } from "./staff";
import { INTOX_CAP, STRENGTHS } from "./drinks";
import { spawnGroup, groupSize } from "./guests";
import { INCIDENTS } from "../data/incidents";

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
    if (def.serves === "thirst" && !o.bar) p.push(`bar ${o.id} has no drink policy`);
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
  const pids = new Set<number>();
  const groups = new Map<number, { n: number; leads: number; type: string }>();
  for (const a of s.agents) {
    if (ids.has(a.id) || objIds.has(a.id)) p.push(`duplicate id ${a.id}`);
    ids.add(a.id);
    if (!g.walkable(a.y * w + a.x)) p.push(`agent ${a.id} on unwalkable tile ${a.x},${a.y}`);
    if (Math.abs(a.nx - a.x) + Math.abs(a.ny - a.y) > 1) p.push(`agent ${a.id} jumping`);
    if (a.t < 0 || a.t >= a.steps) p.push(`agent ${a.id} bad progress`);
    if (a.role !== "guest" && a.role !== "officer" && a.role !== "medic" && !STAFF_ROLES[a.role]) p.push(`agent ${a.id} unknown role ${a.role}`);
    if (a.role === "server" && (a.tray?.length ?? 0) > TRAY) p.push(`server ${a.id} carrying ${a.tray!.length} drinks`);
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
      if (!(gd.drink >= 0 && gd.drink <= 1)) p.push(`guest ${a.id} drink out of range`);
      if (gd.intox < 0 || gd.intox > INTOX_CAP + 1e-9 || gd.intend < 0 || gd.intend > INTOX_CAP + 1e-9) p.push(`guest ${a.id} intoxication out of range`);
      if (gd.withdrawn > gd.withdrawCap + 1e-9) p.push(`guest ${a.id} drew more than they have`);
      if (gd.pid >= 0) {
        const per = s.pool.find((q) => q.id === gd.pid);
        if (!per) p.push(`guest ${a.id} is a missing person ${gd.pid}`);
        else if (!per.here) p.push(`guest ${a.id} on the floor but their person isn't marked here`);
        if (pids.has(gd.pid)) p.push(`person ${gd.pid} on the floor twice`);
        pids.add(gd.pid);
      }
      const grp = groups.get(gd.group) ?? { n: 0, leads: 0, type: gd.type };
      grp.n++;
      grp.leads += gd.lead;
      if (grp.type !== gd.type) p.push(`group ${gd.group} mixes types`);
      groups.set(gd.group, grp);
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
  for (const [id, grp] of groups) if (grp.n > 8 || grp.leads > 1) p.push(`group ${id}: ${grp.n} members, ${grp.leads} leaders`);
  // Incidents: known kinds on the map; nobody passed out or fighting outside one; standings in range.
  const inIncident = new Map<number, string>();
  for (const inc of s.incidents) {
    if (!INCIDENTS[inc.kind]) p.push(`incident ${inc.id} unknown kind ${inc.kind}`);
    if (inc.tile < 0 || inc.tile >= n) p.push(`incident ${inc.id} off the map`);
    inIncident.set(inc.actor, inc.kind);
    if (inc.other >= 0) inIncident.set(inc.other, inc.kind);
  }
  for (const a of s.agents) {
    if (a.act === "out" && inIncident.get(a.id) !== "passout") p.push(`guest ${a.id} passed out with no incident`);
    if (a.act === "fight" && inIncident.get(a.id) !== "fight") p.push(`guest ${a.id} fighting with no incident`);
    if (a.g && (a.g.unans < 0 || a.g.warned < 0 || a.g.buzz < 0 || a.g.buzz > 20)) p.push(`guest ${a.id} incident fields out of range`);
  }
  for (const [k, v] of Object.entries(s.rules)) if (!(Number.isInteger(v) && v >= 0 && v <= 3)) p.push(`house rule ${k} = ${v}`);
  for (const [k, v] of [["police", s.auth.police.standing], ["regulator", s.auth.regulator.standing]] as const) if (!(v >= 0 && v <= 100)) p.push(`${k} standing ${v}`);
  // The pool: money never negative; anyone marked here is on the floor or on the sidewalk.
  if (s.peds.length > MAX_PEDS) p.push(`${s.peds.length} pedestrians (cap ${MAX_PEDS})`);
  for (const q of s.peds) if (q.pid >= 0) { if (pids.has(q.pid)) p.push(`person ${q.pid} both inside and on the sidewalk`); pids.add(q.pid); }
  for (const q of s.pool) {
    if (q.savings < 0 || q.cash < 0) p.push(`person ${q.id} has negative money`);
    if (q.here && !pids.has(q.id)) p.push(`person ${q.id} marked here but nowhere to be seen`);
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

/**
 * Guest generators against their own data (docs/spec/guests.md §Targets): thousands of draws through the real
 * arrival path on a fixed seed, checking that medians and shares come out as the type data says (so a code bug
 * shows, while retuning the data never breaks the check), and that every draw is finite and inside its caps.
 * What guests then *do* is emergent and only reported, by `npm run targets`.
 */
export function generatorChecks(): string[] {
  const p: string[] = [];
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const near = (what: string, got: number, want: number, tol: number) => { if (Math.abs(got - want) > tol) p.push(`${what}: ${got.toFixed(3)}, data says ${want.toFixed(3)}`); };
  for (const [t, type] of Object.entries(GUEST_TYPES)) {
    const g = Game.create("bigfloor", 5);
    const at = g.state.map.entrances[0], r = rng(g.state, "check");
    const sizes: number[] = [];
    for (let k = 0; k < 3000; k++) sizes.push(groupSize(r, type));
    for (let k = 0; k < 3000; k++) spawnGroup(g, t, at, null, 1);
    const gs = g.state.agents.filter((a) => a.g).map((a) => a.g!);
    const b = type.budget, dr = type.drinking, gw = type.group, gsum = gw.reduce((a, x) => a + x, 0);
    near(`${t} budget median`, med(gs.map((x) => x.bankroll)) / Math.max(b.min ?? 0, Math.min(b.cap ?? Infinity, b.median)), 1, 0.08);
    near(`${t} sober share`, gs.filter((x) => x.intend === 0).length / gs.length, dr.sober, 0.03);
    near(`${t} never-ATM share`, gs.filter((x) => !x.atm).length / gs.length, type.atm.never, 0.03);
    // Intent shifts with why they came (drink first +0.1, gamble -0.03).
    const drinkers = gs.filter((x) => x.intend > 0).map((x) => x.intend);
    const wantMean = dr.mean + dr.first * 0.1 - (1 - dr.first) * 0.03;
    near(`${t} drinkers' intended level (mean)`, drinkers.reduce((a, x) => a + x, 0) / drinkers.length, wantMean, 0.05);
    near(`${t} alone`, sizes.filter((n) => n === 1).length / sizes.length, gw[0] / gsum, 0.03);
    near(`${t} in pairs`, sizes.filter((n) => n === 2).length / sizes.length, (gw[1] ?? 0) / gsum, 0.03);
    if (sizes.some((n) => n < 1 || n > 8 || !gw[n - 1])) p.push(`${t}: drew a group size its data rules out`);
    for (const x of gs) {
      if (![x.bankroll, x.stake, x.withdrawCap, x.atm, x.floorTime, x.intend, x.drift, x.browse].every(Number.isFinite)) { p.push(`${t}: non-finite draw`); break; }
      if (x.intend > INTOX_CAP || x.bankroll > (b.cap ?? Infinity) || x.floorTime <= 0 || x.browse < 0) { p.push(`${t}: draw outside its caps`); break; }
    }
  }
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
  else if (roll < 0.945) g.dispatch({ type: "setRule", cat: r.pick(["intox", "disorder", "misconduct"] as const), level: r.int(0, 3) });
  else if (roll < 0.96) {
    const bars = g.amenities.thirst, servers = g.state.agents.filter((a) => a.role === "server");
    if (bars.length) {
      const bar = r.pick(bars).id;
      g.dispatch({ type: "setBar", id: bar, price: r.int(0, 12) / 4, comp: r.int(0, 20) / 20, strength: r.pick(STRENGTHS), area: r.chance(0.5) ? -1 : y * w + x });
      if (servers.length) g.dispatch({ type: "assignServer", id: r.pick(servers).id, bar });
    }
  }
  else {
    const staff = g.state.agents.filter((a) => STAFF_ROLES[a.role]);
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
  const problems: string[] = [...mathChecks(), ...exitChecks(), ...generatorChecks()];
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
