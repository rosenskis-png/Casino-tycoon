// Wayfinding (docs/spec/navigation.md): guests don't know the floor. They act on what they can see, what they
// remember, and what signs tell them; once they pick a target they know, the path fields walk them there.
// Sight is checked only at decision points, by short ray casts, so nothing here is cached or saved.
// PROVISIONAL numbers until tuned.
import { T, DOOR_STATE } from "../data/terrain";
import type { Game } from "./game";
import type { Agent, GuestData, PlacedObject } from "./state";
import type { Rng } from "./rng";

/** How far a guest can make things out, in tiles. */
export const SIGHT = 12;
const SEEN_CAP = 16;
const TRAIL_CAP = 4;
/** Share of sign readings that don't help (misread, or the arrow is ambiguous). */
const SIGN_MISS = 0.2;
/** A sign points along the route for this many steps: the next leg, not the whole way. */
const SIGN_LEG = 10;
/** Signs only know about destinations this close (Manhattan). */
const SIGN_REACH = 40;

export function blocksSight(g: Game, i: number): boolean {
  const t = g.state.map.terrain[i];
  if (t === T.WALL || t === T.VOID) return true;
  if (t === T.DOOR && g.state.map.door[i] !== DOOR_STATE.OPEN) return true;
  return g.opaque[i] === 1;
}

/** Line of sight between two tiles within SIGHT; the end tiles themselves never block. */
export function canSee(g: Game, from: number, to: number): boolean {
  const w = g.state.map.w;
  let x = from % w, y = (from - x) / w;
  const x1 = to % w, y1 = (to - x1) / w;
  const dx = Math.abs(x1 - x), dy = Math.abs(y1 - y);
  if (dx * dx + dy * dy > SIGHT * SIGHT) return false;
  const sx = x < x1 ? 1 : -1, sy = y < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if (x === x1 && y === y1) return true;
    if (blocksSight(g, y * w + x)) return false;
  }
}

/** Deterministic 0-1 value per guest and thing (not a random draw: the same guest always knows the same routes). */
function hash01(seed: number, id: number): number {
  let h = Math.imul(seed ^ Math.imul(id, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A regular who knows the way to this object from past visits. Objects built since then are new to them. */
export function knowsRoute(gd: GuestData, o: PlacedObject): boolean {
  return gd.memDate >= 0 && o.built <= gd.memDate && hash01(gd.kseed, o.id) < gd.know;
}

/** Same, for entrance k (entrances are part of the building, so any regular may know them). */
export function knowsExit(gd: GuestData, k: number): boolean {
  return gd.memDate >= 0 && hash01(gd.kseed, -1 - k) < gd.know;
}

export function remember(gd: GuestData, id: number) {
  const k = gd.seen.indexOf(id);
  if (k >= 0) gd.seen.splice(k, 1);
  gd.seen.push(id);
  if (gd.seen.length > SEEN_CAP) gd.seen.shift();
}

/** The tile guests stand on to see or use an object: its first seat, else the object's own tile. */
export function faceTile(g: Game, o: PlacedObject): number {
  const st = g.seatTiles.get(o.id);
  return st ? st[0] : o.y * g.state.map.w + o.x;
}

const dist = (w: number, a: number, b: number) => Math.abs((a % w) - (b % w)) + Math.abs(Math.floor(a / w) - Math.floor(b / w));

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/**
 * Where to walk next when there is nothing to go straight to: the end of one of eight sight lines. Longer views
 * pull, recent spots push (so guests explore), the fit of the spot to their tastes biases it, and with a
 * remembered `toward` tile, `det` weights progress toward it by straight-line distance (mazes defeat that).
 */
export function explore(g: Game, a: Agent, r: Rng, fit: (i: number) => number, toward = -1, det = 0): number {
  const gd = a.g!, { w, h } = g.state.map;
  const here = a.y * w + a.x;
  let best = -1, bestScore = -Infinity;
  for (const [dx, dy] of DIRS) {
    let x = a.x, y = a.y, end = -1, len = 0;
    for (let k = 1; k <= SIGHT; k++) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= w || Y >= h) break;
      const i = Y * w + X;
      // Diagonals can't squeeze between two blocked tiles.
      if (dx && dy && !g.walkable(y * w + X) && !g.walkable(Y * w + x)) break;
      if (!g.walkable(i) || blocksSight(g, i)) break;
      x = X; y = Y;
      if (!g.seatAt[i]) { end = i; len = k; }
    }
    if (end < 0 || len < 2) continue;
    let score = (len / SIGHT) * 0.6 + fit(end) * 0.3 + r.next() * 0.5;
    for (const t of gd.trail) if (dist(w, t, end) <= 3) score -= 1;
    if (toward >= 0) score += (det * (dist(w, here, toward) - dist(w, end, toward))) / SIGHT;
    if (score > bestScore) { bestScore = score; best = end; }
  }
  gd.trail.push(here);
  if (gd.trail.length > TRAIL_CAP) gd.trail.shift();
  return best;
}

/**
 * Reading a visible sign: a tile SIGN_LEG steps along the real route from the sign toward the nearest of
 * `targets` (Manhattan-nearest, so signs are rough). -1 when no sign in view helps.
 */
export function signLeg(g: Game, a: Agent, r: Rng, targets: number[]): number {
  const gd = a.g!, w = g.state.map.w;
  const here = a.y * w + a.x;
  for (const s of g.signs) {
    const st = s.y * w + s.x;
    if (dist(w, here, st) > SIGHT || !canSee(g, here, st)) continue;
    remember(gd, s.id);
    if (r.chance(SIGN_MISS)) continue;
    const from = besideSign(g, s);
    if (from < 0) continue;
    let dest = -1, bd = SIGN_REACH + 1;
    for (const t of targets) {
      const d = dist(w, from, t);
      if (d < bd && g.paths.reachable(from, t)) { bd = d; dest = t; }
    }
    if (dest < 0) continue;
    let p = from;
    for (let k = 0; k < SIGN_LEG && p !== dest; k++) {
      const j = g.paths.next(p, dest, a.id);
      if (j < 0) break;
      p = j;
    }
    if (p !== here && g.paths.reachable(here, p)) return p;
  }
  return -1;
}

function besideSign(g: Game, s: PlacedObject): number {
  const { w, h } = g.state.map;
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
    const X = s.x + dx, Y = s.y + dy;
    if (X >= 0 && Y >= 0 && X < w && Y < h && g.walkable(Y * w + X)) return Y * w + X;
  }
  return -1;
}
