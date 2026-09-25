// Staff (FOUNDATIONS §9): hiring and firing, and the roles at work. Janitors sweep litter; slot techs fix
// broken machines; drink servers (M3) carry drinks from a bar to players at their machines. All are visible on
// the floor. Wages accrue monthly through finance.
import { STAFF_ROLES } from "../data/staff";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Agent, PlacedObject } from "./state";
import { rng } from "./rng";
import { go, isWalking, nearbyTile } from "./agents";
import { objSeats, objSize, objStaff } from "./geometry";
import { TICKS_PER_SECOND } from "./clock";
import { faceTile } from "./wayfinding";
import { acceptChance, barPolicy, cutoff, handsFull, leastServedBar, rollComp, serveDrink } from "./drinks";
import { OBJECTS } from "../data/objects";
import { THEFT } from "../data/staff";
import { firedWorker, greed, inZone, newStaffData, setPace, skillOf, steal } from "./crew";

declare module "./commands" {
  interface CommandTypes {
    hire: { role: string };
    fire: { id: number };
  }
}

const MAX_STAFF = 200;
const CLEAN_TICKS = TICKS_PER_SECOND;
const REPAIR_TICKS = 6 * TICKS_PER_SECOND;
const OFFER_TICKS = TICKS_PER_SECOND / 2;
const SERVE_TICKS = TICKS_PER_SECOND / 2;
/** How far from the bar (or their last stop) a server looks for guests (tiles, Manhattan, with a penalty for walkers). */
const SERVER_REACH = 30;
/** Drinks a server carries; seconds of order-taking after the first order before heading to the bar. */
export const TRAY = 10;
const COLLECT_TICKS = 12 * TICKS_PER_SECOND;
/** Guests this close to a server's stop get asked too (a row of players). */
const OFFER_REACH = 6;
/** A guest isn't offered again for this long after saying yes or no. */
const OFFER_AGAIN = 30 * TICKS_PER_SECOND;

/** A new worker, walking in from the street (or, `at`, starting on that tile: a dealer who comes with a table). */
export function hireStaff(g: Game, role: string, spot = -1): Agent | null {
  const s = g.state;
  const ents = s.map.entrances.filter((e) => g.walkable(e) && e !== s.map.lift);
  if ((!ents.length && spot < 0) || !STAFF_ROLES[role]) return null;
  const r = rng(s, "staff");
  const at = spot >= 0 ? spot : r.pick(ents), w = s.map.w;
  const x = at % w, y = (at - x) / w;
  const a: Agent = {
    // Drink servers move briskly.
    id: s.nextId++, role: role as Agent["role"], x, y, nx: x, ny: y, t: 0, steps: 10, dest: at, look: r.int(0, 1 << 20),
    act: "idle", next: "idle", target: -1, seat: -1, timer: 0, hidden: 0,
    // M9: a hidden knack and honesty; skill sets the walking pace.
    st: newStaffData(g, role),
  };
  setPace(g, a);
  if (role === "server") { const b = leastServedBar(g); if (b >= 0) a.bar = b; }
  s.agents.push(a);
  return a;
}

/** Targets other staff already have: tiles for janitors, object ids for techs. */
function claimed(g: Game, role: string): Set<number> {
  const out = new Set<number>();
  for (const a of g.state.agents) if (a.role === role && a.target >= 0) out.add(a.target);
  return out;
}

// (M11) Staff of the same job drift apart: where a worker patrols to is picked from a few candidates, the one
// least crowded by colleagues (where they stand, or where they're walking to). A soft push, not a rule.
const REPEL_TILES = 6;
const REPEL_TRIES = 4;

/** How crowded a tile is with `a`'s colleagues (same job): 0 for nobody near, about 1 per colleague on it. */
export function colleaguesNear(g: Game, a: Agent, tile: number): number {
  const w = g.state.map.w, x = tile % w, y = (tile - x) / w;
  let v = 0;
  for (const b of g.state.agents) {
    if (b === a || b.role !== a.role) continue;
    const at = isWalking(b) ? b.dest : b.y * w + b.x, bx = at % w, by = (at - bx) / w;
    const d = Math.abs(bx - x) + Math.abs(by - y);
    if (d < REPEL_TILES * 3) v += Math.exp(-d / REPEL_TILES);
  }
  return v;
}

/** A tile to walk to within `r` of (x, y): of a few tries, the one with the fewest colleagues around it (-1: none). */
export function spreadTile(g: Game, a: Agent, stream: string, x: number, y: number, r: number, ok: (t: number) => boolean = () => true): number {
  let best = -1, bv = Infinity;
  for (let k = 0; k < REPEL_TRIES; k++) {
    const t = nearbyTile(g, stream, x, y, r, a);
    if (t < 0 || !ok(t)) continue;
    const v = colleaguesNear(g, a, t);
    if (v < bv) { bv = v; best = t; }
  }
  return best;
}

/** Of a few wander points, the one with the fewest colleagues around it. */
export function spreadPoint(g: Game, a: Agent, stream: string): number {
  const pts = g.state.wanderPoints, r = rng(g.state, stream);
  let best = -1, bv = Infinity;
  for (let k = 0; k < 3 && pts.length; k++) {
    const t = r.pick(pts), v = colleaguesNear(g, a, t);
    if (v < bv) { bv = v; best = t; }
  }
  return best;
}

/** Patrol: a walk to somewhere nearby, sometimes across the floor, away from colleagues. */
function wanderStaff(g: Game, a: Agent) {
  const r = rng(g.state, "staff");
  a.target = -1;
  // M9: a worker kept to a room patrols inside it, and heads back there first.
  const zone = a.st?.zone ?? -1, w = g.state.map.w;
  if (zone >= 0 && !inZone(g, a, a.y * w + a.x)) { if (g.walkable(zone)) go(a, zone, "idle"); return; }
  const near = r.chance(0.7) || zone >= 0 ? spreadTile(g, a, "staff", a.x, a.y, zone >= 0 ? 6 : 12, (t) => inZone(g, a, t)) : -1;
  if (near >= 0) go(a, near, "idle");
  else if (zone < 0) { const p = spreadPoint(g, a, "staff"); if (p >= 0) go(a, p, "idle"); }
}

function janitorFindWork(g: Game, a: Agent) {
  const w = g.state.map.w;
  const dirt = g.state.dirt;
  const taken = claimed(g, "janitor");
  const here = a.y * w + a.x;
  // (M11) The nearest mess first (a sweep clears the tiles around it); a bigger pile only breaks a near tie, and
  // mess a free janitor is closer to is left to them.
  const others = g.state.agents.filter((b) => b !== a && b.role === "janitor" && b.target < 0);
  let best = -1, bs = Infinity;
  for (let i = 0; i < dirt.length; i++) {
    if (!dirt[i] || taken.has(i) || !g.walkable(i) || !inZone(g, a, i)) continue;
    const x = i % w, y = (i - x) / w, d = Math.abs(x - a.x) + Math.abs(y - a.y);
    const s = d - Math.min(dirt[i], 4) * 0.5;
    if (s >= bs) continue;
    if (others.some((b) => Math.abs(x - b.x) + Math.abs(y - b.y) + 2 < d && (b.st?.zone ?? -1) < 0)) continue;
    bs = s; best = i;
  }
  if (best >= 0 && g.pathsFor(a).reachable(here, best)) { a.target = best; go(a, best, "clean"); return; }
  wanderStaff(g, a);
}

/** A walkable tile next to (or the seat of) an object, for a tech to stand on. */
function workSpot(g: Game, objId: number): number {
  const o = g.objById.get(objId);
  if (!o) return -1;
  const w = g.state.map.w, h = g.state.map.h;
  for (const s of objSeats(o)) if (g.walkable(s.y * w + s.x)) return s.y * w + s.x;
  const { w: ow, h: oh } = objSize(o);
  for (let y = o.y - 1; y <= o.y + oh; y++) for (let x = o.x - 1; x <= o.x + ow; x++) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    if (g.walkable(y * w + x)) return y * w + x;
  }
  return -1;
}

function techFindWork(g: Game, a: Agent) {
  const w = g.state.map.w;
  const taken = claimed(g, "tech");
  const here = a.y * w + a.x;
  let best = -1, spot = -1, bd = Infinity;
  for (const o of g.state.objects) {
    if (!o.broken || taken.has(o.id) || !inZone(g, a, o.y * w + o.x)) continue;
    const d = Math.abs(o.x - a.x) + Math.abs(o.y - a.y);
    if (d >= bd) continue;
    const t = workSpot(g, o.id);
    if (t < 0 || !g.pathsFor(a).reachable(here, t)) continue;
    bd = d; best = o.id; spot = t;
  }
  if (best >= 0) { a.target = best; go(a, spot, "repair"); return; }
  wanderStaff(g, a);
}

// Drink servers (docs/spec/guests.md §Servers): each works one bar. Loop: take orders from guests nearby
// (starting near the bar, or in its service area), until the tray is full or time is up; pick the drinks up at
// the bar (the bartender pours one a second); hand them out; start again near the bar. Tray entries are
// guest id × 2 + 1 when the drink is on the house.

function serverBar(g: Game, a: Agent): PlacedObject | null {
  let o = a.bar !== undefined ? g.objById.get(a.bar) : undefined;
  if (!o || OBJECTS[o.kind].serves !== "thirst") {
    const b = leastServedBar(g);
    a.bar = b >= 0 ? b : undefined;
    o = b >= 0 ? g.objById.get(b) : undefined;
  }
  return o ?? null;
}

/** Guests already on some server's tray (or being offered one right now). */
function ordered(g: Game): Set<number> {
  const out = new Set<number>();
  for (const a of g.state.agents) if (a.role === "server") {
    for (const e of a.tray ?? []) out.add(e >> 1);
    if (a.act === "offer" || (a.next === "offer" && a.target >= 0)) out.add(a.target);
  }
  return out;
}

/** Nearest guest to offer a drink to: no drink in hand, not offered lately, in the bar's area. Settled guests first. */
function nextCustomer(g: Game, a: Agent, bar: PlacedObject): Agent | null {
  const w = g.state.map.w, tick = g.state.tick, pol = barPolicy(bar);
  const from = a.tray?.length ? a.y * w + a.x : faceTile(g, bar);
  const fx = from % w, fy = Math.floor(from / w);
  const room = pol.area >= 0 ? g.rooms.roomOf[pol.area] : -2;
  const taken = ordered(g), cut = cutoff(g);
  let best: Agent | null = null, bs = SERVER_REACH;
  for (const b of g.state.agents) {
    const gd = b.g;
    if (!gd || gd.minor || b.hidden || handsFull(gd) || gd.why || gd.mem.offerAt > tick || taken.has(b.id) || gd.intox >= cut || b.act === "out" || b.act === "fight" || gd.held) continue;
    if (room !== -2 && g.rooms.roomOf[b.y * w + b.x] !== room) continue;
    const s = Math.abs(b.x - fx) + Math.abs(b.y - fy) + (isWalking(b) ? 6 : 0);
    if (s < bs) { bs = s; best = b; }
  }
  return best;
}

function takeOrders(g: Game, a: Agent) {
  const bar = serverBar(g, a);
  if (!bar) { a.tray = undefined; return wanderStaff(g, a); }
  a.tray ??= [];
  const c = nextCustomer(g, a, bar);
  if (c) { a.target = c.id; go(a, c.y * g.state.map.w + c.x, "offer"); return; }
  if (a.tray.length) return fetchDrinks(g, a, bar);
  // Nobody to serve: wait around the bar.
  a.tray = undefined;
  a.target = -1;
  const t = faceTile(g, bar), w = g.state.map.w;
  const near = nearbyTile(g, "staff", t % w, Math.floor(t / w), 5, a);
  if (near >= 0) go(a, near, "idle");
}

function fetchDrinks(g: Game, a: Agent, bar: PlacedObject) {
  a.target = -1;
  a.due = undefined;
  go(a, faceTile(g, bar), "fetch");
}

/** Hand out the next drink: to the nearest guest still on the tray (skipping anyone who left or has one). */
function deliverNext(g: Game, a: Agent) {
  const w = g.state.map.w;
  while (a.tray && a.tray.length) {
    let k = -1, bd = Infinity, who: Agent | null = null;
    a.tray.forEach((e, i) => {
      const b = g.state.agents.find((x) => x.id === e >> 1);
      if (!b?.g || handsFull(b.g)) return;
      const d = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (d < bd) { bd = d; k = i; who = b; }
    });
    if (k < 0) break;
    a.target = a.tray.splice(k, 1)[0];
    go(a, who!.y * w + who!.x, "serve");
    return;
  }
  a.tray = undefined;
  a.target = -1;
  a.act = "idle";
}

function serverTick(g: Game, a: Agent) {
  const r = rng(g.state, "staff");
  if (a.act === "offer") {
    if (a.timer === 0) { a.timer = Math.max(1, Math.round(OFFER_TICKS / skillOf(g, a))); return; }
    if (--a.timer > 0) return;
    const bar = serverBar(g, a);
    a.target = -1;
    // "Cocktails?": everyone within reach at this stop gets asked, until the tray is full.
    if (bar) {
      const pol = barPolicy(bar), tick = g.state.tick, taken = ordered(g), w = g.state.map.w, cut = cutoff(g);
      const room = pol.area >= 0 ? g.rooms.roomOf[pol.area] : -2;
      for (const b of g.state.agents) {
        if (a.tray!.length >= TRAY) break;
        const gd = b.g;
        if (!gd || gd.minor || b.hidden || handsFull(gd) || gd.why || gd.mem.offerAt > tick || taken.has(b.id) || gd.intox >= cut || b.act === "out" || b.act === "fight" || gd.held) continue;
        if (Math.abs(b.x - a.x) + Math.abs(b.y - a.y) > OFFER_REACH) continue;
        if (room !== -2 && g.rooms.roomOf[b.y * w + b.x] !== room) continue;
        const comped = rollComp(g, gd, pol);
        gd.mem.offerAt = tick + OFFER_AGAIN;
        if (!r.chance(acceptChance(gd, pol, comped))) continue;
        a.tray!.push(b.id * 2 + (comped ? 1 : 0));
        taken.add(b.id);
        if (a.tray!.length === 1) a.due = tick + COLLECT_TICKS;
      }
    }
    if (bar && a.tray!.length && (a.tray!.length >= TRAY || g.state.tick >= (a.due ?? 0))) return fetchDrinks(g, a, bar);
    return takeOrders(g, a);
  }
  if (a.act === "fetch") {
    // Each bartender pours one a second: a bigger bar has more of them.
    if (a.timer === 0) {
      const bar = serverBar(g, a), n = bar ? Math.max(1, objStaff(bar).length) : 1;
      a.timer = Math.max(1, Math.round((TICKS_PER_SECOND * Math.max(1, a.tray?.length ?? 0)) / n));
      return;
    }
    if (--a.timer > 0) return;
    return deliverNext(g, a);
  }
  // serve
  if (a.timer === 0) { a.timer = Math.max(1, Math.round(SERVE_TICKS / skillOf(g, a))); return; }
  if (--a.timer > 0) return;
  const b = g.state.agents.find((x) => x.id === a.target >> 1);
  if (b?.g) serveDrink(g, b, serverBar(g, a) ?? undefined, "server", (a.target & 1) === 1, a);
  deliverNext(g, a);
}

function staffTick(g: Game, a: Agent) {
  if (isWalking(a)) return;
  if (a.act === "idle") {
    if (a.role === "janitor") janitorFindWork(g, a);
    else if (a.role === "tech") techFindWork(g, a);
    else if (a.role === "server") takeOrders(g, a);
    return;
  }
  if (a.act === "offer" || a.act === "fetch" || a.act === "serve") return serverTick(g, a);
  if (a.act === "clean") {
    if (a.timer === 0) { a.timer = Math.max(1, Math.round(CLEAN_TICKS / skillOf(g, a))); return; }
    if (--a.timer > 0) return;
    const { w, h } = g.state.map;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = a.x + dx, Y = a.y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h) g.state.dirt[Y * w + X] = 0;
    }
    a.target = -1;
    a.act = "idle";
    return;
  }
  if (a.act === "repair") {
    const o = g.objById.get(a.target);
    if (!o || !o.broken) { a.target = -1; a.act = "idle"; return; }
    if (a.timer === 0) { a.timer = Math.max(1, Math.round(REPAIR_TICKS / skillOf(g, a))); return; }
    if (--a.timer > 0) return;
    o.broken = 0;
    g.bus.emit({ type: "sound", id: "fixed", x: o.x, y: o.y });
    // M9: a crooked tech helps themselves from the machine's hopper.
    const r = rng(g.state, "crew");
    if (a.st?.crook && r.chance(greed(g, a, THEFT.tech.p))) {
      steal(g, "machines", r.int(THEFT.tech.amount[0], THEFT.tech.amount[1]), a.y * g.state.map.w + a.x, `pocketing coins from ${OBJECTS[o.kind].name}`, a);
    }
    a.target = -1;
    a.act = "idle";
    return;
  }
  a.act = "idle";
}

const commands: CommandTable<"hire" | "fire"> = {
  hire: {
    validate(g, c) {
      if (!STAFF_ROLES[c.role]) return "Unknown job";
      if (STAFF_ROLES[c.role].builtIn) return "They come with the tables";
      if (g.state.agents.filter(isStaff).length >= MAX_STAFF) return "That's enough staff";
      if (!g.state.map.entrances.some((e) => g.walkable(e))) return "The entrance is blocked";
      return null;
    },
    apply(g, c) { if (hireStaff(g, c.role)) g.bus.emit({ type: "sound", id: "place" }); },
  },
  fire: {
    validate: (g, c) => (g.state.agents.some((a) => a.id === c.id && isStaff(a)) ? null : "Not on staff"),
    apply(g, c) {
      const a = g.state.agents.find((b) => b.id === c.id);
      if (a) firedWorker(g, a);
      g.state.agents = g.state.agents.filter((b) => b.id !== c.id);
    },
  },
};

export const staffSystem: System = {
  id: "staff",
  deps: ["movement"],
  commands,
  layout(g) {
    // A target may have gone (object sold, dirt walled over): rethink.
    for (const a of g.state.agents) {
      if (a.role === "guest" || a.target < 0) continue;
      if (a.role === "tech" && !g.objById.has(a.target)) { a.target = -1; a.act = "idle"; }
      if (a.role === "janitor" && !g.walkable(a.target)) { a.target = -1; a.act = "idle"; }

    }
  },
  tick(g) {
    // Guards and visitors (police, paramedics) are run by the incident system (sim/incidents.ts).
    for (const a of g.state.agents) if (a.role === "janitor" || a.role === "tech" || a.role === "server") staffTick(g, a);
  },
};

/** On the payroll (not a guest, and not a visiting officer or paramedic). */
export const isStaff = (a: Agent) => a.role in STAFF_ROLES;
