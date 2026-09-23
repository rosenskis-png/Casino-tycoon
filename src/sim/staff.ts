// Staff (FOUNDATIONS §9): hiring and firing, and the M2 roles at work. Janitors sweep litter; slot techs fix
// broken machines. Both are visible on the floor. Wages accrue monthly through finance.
import { STAFF_ROLES } from "../data/staff";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Agent } from "./state";
import { rng } from "./rng";
import { go, isWalking, nearbyTile } from "./agents";
import { objSeats, objSize } from "./geometry";
import { TICKS_PER_SECOND } from "./clock";

declare module "./commands" {
  interface CommandTypes {
    hire: { role: string };
    fire: { id: number };
  }
}

const MAX_STAFF = 200;
const CLEAN_TICKS = 2 * TICKS_PER_SECOND;
const REPAIR_TICKS = 6 * TICKS_PER_SECOND;

export function hireStaff(g: Game, role: string): Agent | null {
  const s = g.state;
  const ents = s.map.entrances.filter((e) => g.walkable(e));
  if (!ents.length || !STAFF_ROLES[role]) return null;
  const r = rng(s, "staff");
  const at = r.pick(ents), w = s.map.w;
  const x = at % w, y = (at - x) / w;
  const a: Agent = {
    id: s.nextId++, role: role as Agent["role"], x, y, nx: x, ny: y, t: 0, steps: r.int(9, 11), dest: at, look: r.int(0, 1 << 20),
    act: "idle", next: "idle", target: -1, seat: -1, timer: 0, hidden: 0,
  };
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

function staffTick(g: Game, a: Agent) {
  if (isWalking(a)) return;
  if (a.act === "idle") {
    if (a.role === "janitor") janitorFindWork(g, a);
    else if (a.role === "tech") techFindWork(g, a);
    return;
  }
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
      if (g.state.agents.filter((a) => a.role !== "guest").length >= MAX_STAFF) return "That's enough staff";
      if (!g.state.map.entrances.some((e) => g.walkable(e))) return "The entrance is blocked";
      return null;
    },
    apply(g, c) { if (hireStaff(g, c.role)) g.bus.emit({ type: "sound", id: "place" }); },
  },
  fire: {
    validate: (g, c) => (g.state.agents.some((a) => a.id === c.id && a.role !== "guest") ? null : "Not on staff"),
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
    for (const a of g.state.agents) if (a.role !== "guest") staffTick(g, a);
  },
};

/** Monthly wage bill by role, for the Staff tab. */
export const wageOf = (role: string) => STAFF_ROLES[role]?.wage ?? 0;
export const isStaff = (a: Agent) => a.role !== "guest";
