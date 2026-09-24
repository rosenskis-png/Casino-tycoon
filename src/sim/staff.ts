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
import { objSeats, objSize } from "./geometry";
import { TICKS_PER_SECOND } from "./clock";
import { faceTile } from "./wayfinding";
import { acceptChance, barPolicy, cutoff, handsFull, leastServedBar, rollComp, serveDrink } from "./drinks";
import { OBJECTS } from "../data/objects";

declare module "./commands" {
  interface CommandTypes {
    hire: { role: string };
    fire: { id: number };
  }
}

const MAX_STAFF = 200;
const CLEAN_TICKS = 2 * TICKS_PER_SECOND;
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

export function hireStaff(g: Game, role: string): Agent | null {
  const s = g.state;
  const ents = s.map.entrances.filter((e) => g.walkable(e));
  if (!ents.length || !STAFF_ROLES[role]) return null;
  const r = rng(s, "staff");
  const at = r.pick(ents), w = s.map.w;
  const x = at % w, y = (at - x) / w;
  const a: Agent = {
    // Drink servers move briskly.
    id: s.nextId++, role: role as Agent["role"], x, y, nx: x, ny: y, t: 0, steps: role === "server" || role === "guard" ? r.int(6, 7) : r.int(9, 11), dest: at, look: r.int(0, 1 << 20),
    act: "idle", next: "idle", target: -1, seat: -1, timer: 0, hidden: 0,
  };
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

/** Patrol: a walk to somewhere nearby, sometimes across the floor. */
function wanderStaff(g: Game, a: Agent) {
  const r = rng(g.state, "staff");
  const pts = g.state.wanderPoints;
  const near = r.chance(0.7) ? nearbyTile(g, "staff", a.x, a.y, 12) : -1;
  if (near >= 0) go(a, near, "idle");
  else if (pts.length) go(a, r.pick(pts), "idle");
  a.target = -1;
}

function janitorFindWork(g: Game, a: Agent) {
  const w = g.state.map.w;
  const dirt = g.state.dirt;
  const taken = claimed(g, "janitor");
  const here = a.y * w + a.x;
  let best = -1, bs = -Infinity;
  for (let i = 0; i < dirt.length; i++) {
    if (!dirt[i] || taken.has(i) || !g.walkable(i)) continue;
    const s = dirt[i] * 4 - (Math.abs((i % w) - a.x) + Math.abs(Math.floor(i / w) - a.y)) / 3;
    if (s > bs) { bs = s; best = i; }
  }
  if (best >= 0 && g.paths.reachable(here, best)) { a.target = best; go(a, best, "clean"); return; }
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
    if (!o.broken || taken.has(o.id)) continue;
    const d = Math.abs(o.x - a.x) + Math.abs(o.y - a.y);
    if (d >= bd) continue;
    const t = workSpot(g, o.id);
    if (t < 0 || !g.paths.reachable(here, t)) continue;
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
    if (!gd || b.hidden || handsFull(gd) || gd.why || gd.mem.offerAt > tick || taken.has(b.id) || gd.intox >= cut || b.act === "out" || b.act === "fight") continue;
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
  const near = nearbyTile(g, "staff", t % w, Math.floor(t / w), 5);
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
    if (a.timer === 0) { a.timer = OFFER_TICKS; return; }
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
        if (!gd || b.hidden || handsFull(gd) || gd.why || gd.mem.offerAt > tick || taken.has(b.id) || gd.intox >= cut || b.act === "out" || b.act === "fight") continue;
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
    // The bartender pours one a second.
    if (a.timer === 0) { a.timer = TICKS_PER_SECOND * Math.max(1, a.tray?.length ?? 0); return; }
    if (--a.timer > 0) return;
    return deliverNext(g, a);
  }
  // serve
  if (a.timer === 0) { a.timer = SERVE_TICKS; return; }
  if (--a.timer > 0) return;
  const b = g.state.agents.find((x) => x.id === a.target >> 1);
  if (b?.g) serveDrink(g, b, serverBar(g, a) ?? undefined, "server", (a.target & 1) === 1);
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
    if (a.timer === 0) { a.timer = CLEAN_TICKS; return; }
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
    if (a.timer === 0) { a.timer = REPAIR_TICKS; return; }
    if (--a.timer > 0) return;
    o.broken = 0;
    g.bus.emit({ type: "sound", id: "fixed", x: o.x, y: o.y });
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
      if (g.state.agents.filter(isStaff).length >= MAX_STAFF) return "That's enough staff";
      if (!g.state.map.entrances.some((e) => g.walkable(e))) return "The entrance is blocked";
      return null;
    },
    apply(g, c) { if (hireStaff(g, c.role)) g.bus.emit({ type: "sound", id: "place" }); },
  },
  fire: {
    validate: (g, c) => (g.state.agents.some((a) => a.id === c.id && isStaff(a)) ? null : "Not on staff"),
    apply(g, c) { g.state.agents = g.state.agents.filter((a) => a.id !== c.id); },
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

/** Monthly wage bill by role, for the Staff tab. */
export const wageOf = (role: string) => STAFF_ROLES[role]?.wage ?? 0;
/** On the payroll (not a guest, and not a visiting officer or paramedic). */
export const isStaff = (a: Agent) => a.role in STAFF_ROLES;
