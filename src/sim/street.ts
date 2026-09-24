// The sidewalk and the entrance threshold (docs/spec/guests.md): pedestrians walk the scenario's sidewalks.
// At each entrance a passer-by glances in (open doors, what's visible inside, noise and prestige near the door,
// a crowd) and either steps inside or walks on. Regulars come on purpose and head straight for an entrance.
// Only someone who crosses the threshold becomes a guest; passers-by only count as "walked past".
import { GUEST_TYPES, recurring } from "../data/guests";
import { SCENARIOS } from "../data/scenarios";
import { DOOR_STATE, T } from "../data/terrain";
import type { Game } from "./game";
import type { System } from "./registry";
import { isClosed, type Agent, type Ped } from "./state";
import { demand } from "./calendar";
import { rng } from "./rng";
import { TICKS_PER_DAY, dateOfDay } from "./clock";
import { SIGHT, canSee } from "./wayfinding";
import { groupSize, repFactor, room, spawnGroup } from "./guests";
import { amenityPull } from "./amenities";
import { available, person } from "./pool";

/** Most groups on the sidewalk at once (performance). */
export const MAX_PEDS = 40;
/** Walking speed on the sidewalk, tiles per tick (about a guest's pace). */
const PED_SPEED = 1 / 12;

interface Walk { x0: number; y0: number; dx: number; dy: number; len: number }
/** Where passers-by on a walk glance into entrance `ent`: position `s` along the walk. */
interface Gate { walk: number; s: number; ent: number }
interface Street { walks: Walk[]; gates: Gate[] }

const streets = new WeakMap<Game, Street>();

function street(g: Game): Street {
  let st = streets.get(g);
  if (!st) { st = buildStreet(g); streets.set(g, st); }
  return st;
}

function buildStreet(g: Game): Street {
  const sc = SCENARIOS[g.state.scenario], w = g.state.map.w;
  const walks: Walk[] = sc.sidewalks.map(({ from: [x0, y0], to: [x1, y1] }) => ({
    x0, y0, dx: Math.sign(x1 - x0), dy: Math.sign(y1 - y0), len: Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)),
  }));
  const gates: Gate[] = [];
  g.state.map.entrances.forEach((e, ent) => {
    const ex = e % w, ey = (e - ex) / w;
    let best: Gate | null = null, bd = 3;
    walks.forEach((wk, walk) => {
      for (let s = 0; s <= wk.len; s++) {
        const d = Math.max(Math.abs(wk.x0 + wk.dx * s - ex), Math.abs(wk.y0 + wk.dy * s - ey));
        if (d < bd) { bd = d; best = { walk, s, ent }; }
      }
    });
    if (best) gates.push(best);
  });
  return { walks, gates };
}

/**
 * What a passer-by sees glancing in at entrance k, about 0-1.5 (read fresh at each glance): an open door in view, machines visible
 * through it, noise and prestige near the door, and a crowd inside.
 */
export function curbAppeal(g: Game, k: number): number {
  const m = g.state.map, w = m.w, h = m.h, e = m.entrances[k];
  const ex = e % w, ey = (e - ex) / w;
  let score = Math.min(0.15, g.fields.get("NRG", e) / 30) + Math.min(0.15, g.fields.get("PRS", e) / 30);
  let open = 0, machines = 0, crowd = 0;
  for (let y = Math.max(0, ey - SIGHT); y <= Math.min(h - 1, ey + SIGHT); y++)
    for (let x = Math.max(0, ex - SIGHT); x <= Math.min(w - 1, ex + SIGHT); x++) {
      const d = y * w + x;
      if (m.terrain[d] !== T.DOOR || m.door[d] !== DOOR_STATE.OPEN || !canSee(g, e, d)) continue;
      open++;
      crowd = Math.max(crowd, g.fields.get("CRW", d));
      score += Math.min(0.2, g.fields.get("NRG", d) / 20) * (open === 1 ? 1 : 0);
      // Machines visible through the door.
      const sx = x >> 4, sy = y >> 4;
      for (let yy = sy - 1; yy <= sy + 1; yy++) for (let xx = sx - 1; xx <= sx + 1; xx++) {
        for (const o of g.slotSectors.get(yy * 4096 + xx) ?? []) {
          if (machines >= 12) break;
          if (Math.abs(o.x - x) + Math.abs(o.y - y) <= SIGHT && canSee(g, d, o.y * w + o.x)) machines++;
        }
      }
    }
  if (open) score += 0.3;
  return score + 0.04 * machines + Math.min(0.2, crowd / 10);
}

/** Tile position (floats) of member k of a pedestrian group, for drawing. */
export function pedSpot(g: Game, p: Ped, k: number): { x: number; y: number } | null {
  const wk = street(g).walks[p.walk];
  if (!wk) return null;
  const s = p.s - p.dir * 0.7 * k;
  return { x: wk.x0 + wk.dx * s + (k & 1 ? 0.15 : -0.1) * wk.dy, y: wk.y0 + wk.dy * s + (k & 1 ? 0.3 : 0) * (wk.dx ? 1 : 0) };
}

/** The walkable entrance tile for entrance k, or another walkable one; -1 when every entrance is blocked. */
function entranceTile(g: Game, k: number): number {
  const ents = g.state.map.entrances;
  if (k >= 0 && k < ents.length && g.walkable(ents[k])) return ents[k];
  for (const e of ents) if (g.walkable(e)) return e;
  return -1;
}

/** Someone who can't get in (every entrance blocked, or the floor is full) goes home and tries another day. */
function turnAway(g: Game, pid: number) {
  const p = pid >= 0 ? person(g, pid) : undefined;
  if (p) { p.here = 0; p.next = g.state.tick + TICKS_PER_DAY; }
}

function enter(g: Game, type: string, pid: number, n: number, k: number): boolean {
  const at = entranceTile(g, k);
  // Closed by the police: nobody gets in.
  if (at < 0 || isClosed(g.state)) return false;
  const p = pid >= 0 ? person(g, pid) ?? null : null;
  if (p) p.here = 1;
  spawnGroup(g, type, at, p, n);
  return true;
}

/**
 * Someone coming on purpose: they walk down the sidewalk to an entrance, or straight in when there's no
 * sidewalk (or it's too busy to draw them).
 */
export function comeIn(g: Game, type: string, pid: number, n: number) {
  const s = g.state, st = street(g), r = rng(s, "street");
  // Hotel guests (M9.6) come down the elevator.
  const lift = s.map.lift;
  if (lift >= 0 && g.walkable(lift) && rng(s, "hotel").chance(GUEST_TYPES[type]?.hotel ?? 0)) {
    const k = s.map.entrances.indexOf(lift);
    if (enter(g, type, pid, n, k)) return;
  }
  const gates = st.gates.filter((gt) => g.walkable(s.map.entrances[gt.ent]));
  if (gates.length && s.peds.length < MAX_PEDS) {
    const gate = r.pick(gates), wk = st.walks[gate.walk];
    const dir = gate.s === 0 ? 1 : gate.s === wk.len ? -1 : r.chance(0.5) ? 1 : -1;
    s.peds.push({ id: s.nextId++, type, walk: gate.walk, s: dir > 0 ? 0 : wk.len, dir, spd: PED_SPEED * (0.9 + 0.2 * r.next()), n, pid, goal: gate.ent, glanced: 0, look: r.int(0, 1 << 20) });
    return;
  }
  if (!enter(g, type, pid, n, r.int(0, s.map.entrances.length - 1))) turnAway(g, pid);
}

/** A departing guest walks off down the sidewalk (just for show; capped). */
export function walkAway(g: Game, a: Agent) {
  const s = g.state, st = street(g);
  if (s.peds.length >= MAX_PEDS) return;
  const here = a.y * s.map.w + a.x;
  const gate = st.gates.find((gt) => s.map.entrances[gt.ent] === here);
  if (!gate) return;
  const r = rng(s, "street"), wk = st.walks[gate.walk];
  const dir = gate.s === 0 ? 1 : gate.s === wk.len ? -1 : r.chance(0.5) ? 1 : -1;
  s.peds.push({ id: s.nextId++, type: a.g!.type, walk: gate.walk, s: gate.s, dir, spd: PED_SPEED * (0.9 + 0.2 * r.next()), n: 1, pid: -1, goal: -2, glanced: 0, look: a.look });
}

/** Chance a passer-by of this type steps in at entrance k. */
function walkInChance(g: Game, type: string, k: number): number {
  const t = GUEST_TYPES[type];
  return Math.min(0.9, t.walkIn * (0.2 + curbAppeal(g, k)) * repFactor(g.state.rep[type] ?? 50) * room(g) * amenityPull(g, type));
}

function spawnPasserBy(g: Game, type: string) {
  const s = g.state, st = street(g), r = rng(s, "street");
  if (!st.walks.length || s.peds.length >= MAX_PEDS) return;
  const t = GUEST_TYPES[type];
  // Recurring types on the sidewalk are people from the pool who happen to walk by.
  let pid = -1;
  if (recurring(t)) {
    const p = available(g, type, r);
    if (!p) return;
    pid = p.id;
    p.here = 1;
  }
  const walk = r.int(0, st.walks.length - 1), wk = st.walks[walk], dir = r.chance(0.5) ? 1 : -1;
  s.peds.push({ id: s.nextId++, type, walk, s: dir > 0 ? 0 : wk.len, dir, spd: PED_SPEED * (0.85 + 0.3 * r.next()), n: groupSize(r, t), pid, goal: -1, glanced: 0, look: r.int(0, 1 << 20) });
}

export const streetSystem: System = {
  id: "street",
  deps: ["guests"],
  init(g) { streets.delete(g); },
  layout(g) { streets.delete(g); },
  tick(g) {
    const s = g.state;
    if (!s.peds.length) return;
    const st = street(g), r = rng(s, "street");
    let removed = false;
    for (const p of s.peds) {
      const wk = st.walks[p.walk];
      if (!wk) { p.n = 0; removed = true; continue; }
      const prev = p.s;
      p.s += p.dir * p.spd;
      for (const gate of st.gates) {
        if (gate.walk !== p.walk || p.glanced & (1 << (gate.ent % 31)) || (prev - gate.s) * (p.s - gate.s) > 0) continue;
        p.glanced |= 1 << (gate.ent % 31);
        if (p.goal === gate.ent || (p.goal === -1 && r.chance(walkInChance(g, p.type, gate.ent)))) {
          if (enter(g, p.type, p.pid, p.n, gate.ent)) { p.n = 0; removed = true; break; }
          if (p.goal >= 0) { turnAway(g, p.pid); p.goal = -2; }
        }
      }
      if (p.n && (p.s < 0 || p.s > wk.len)) {
        // Walked off the end: a passer-by who glanced in and kept going counts as walked past.
        if (p.goal === -1 && p.glanced) s.visits.today.walkedPast += p.n;
        // Someone who meant to come in but never reached their entrance tries another day.
        if (p.goal >= 0) turnAway(g, p.pid);
        else if (p.pid >= 0) { const q = person(g, p.pid); if (q) q.here = 0; }
        p.n = 0;
        removed = true;
      }
    }
    if (removed) s.peds = s.peds.filter((p) => p.n > 0);
  },
  beat(g) {
    const s = g.state, sc = SCENARIOS[s.scenario];
    const st = street(g);
    if (!sc.footfall || !st.walks.length) return;
    // Passers-by, by the street's mix and the season.
    const month = dateOfDay(Math.floor(s.tick / TICKS_PER_DAY)).month;
    const r = rng(s, "street");
    let total = 0;
    for (const [t, w] of Object.entries(sc.street)) total += w * (GUEST_TYPES[t]?.arrival.base ?? 0);
    for (const [t, w] of Object.entries(sc.street)) {
      const type = GUEST_TYPES[t];
      if (!type || !total) continue;
      if (r.chance(Math.min(1, (sc.footfall * w * type.arrival.base * type.arrival.season[month] * demand(s, t)) / total))) spawnPasserBy(g, t);
    }
  },
};
