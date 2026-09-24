// Movement for everyone on the map (guests and staff): step along cached distance fields toward `dest`, then
// hand over to the role's system by switching `act` to `next`. Also keeps foot traffic and crowd fields.
import type { System } from "./registry";
import type { Game } from "./game";
import type { Activity, Agent } from "./state";
import { rng } from "./rng";
import { stepped } from "./doors";

const WANDER_POINTS = 16;
export const MAX_AGENTS = 20_000;

/** Start walking to `dest`; on arrival the agent's act becomes `next` with timer 0. */
export function go(a: Agent, dest: number, next: Activity) {
  a.dest = dest;
  a.act = next === "idle" ? "wander" : "walk";
  a.next = next;
  a.timer = 0;
}

export function randomWalkable(g: Game, stream: string, indoor = true): number {
  const { w, h } = g.state.map;
  const r = rng(g.state, stream);
  for (let k = 0; k < 400; k++) {
    const i = r.int(0, w * h - 1);
    if (g.walkable(i) && (!indoor || g.state.map.outdoor[i] === 0)) return i;
  }
  for (let i = 0; i < w * h; i++) if (g.walkable(i)) return i;
  return -1;
}

/** A random walkable tile within `r` tiles of (x, y) that `who` (or anyone) can reach from there, or -1. */
export function nearbyTile(g: Game, stream: string, x: number, y: number, r: number, who?: Agent): number {
  const { w, h } = g.state.map;
  const rr = rng(g.state, stream), from = y * w + x;
  for (let k = 0; k < 12; k++) {
    const X = x + rr.int(-r, r), Y = y + rr.int(-r, r);
    if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
    const i = Y * w + X;
    if (g.walkable(i) && !g.seatAt[i] && (who ? g.pathsFor(who) : g.publicPaths).reachable(from, i)) return i;
  }
  return -1;
}

export function ensureWanderPoints(g: Game) {
  const s = g.state;
  s.wanderPoints = s.wanderPoints.filter((i) => g.walkable(i) && !g.seatAt[i]);
  while (s.wanderPoints.length < WANDER_POINTS) {
    const i = randomWalkable(g, "walkers");
    if (i < 0) break;
    s.wanderPoints.push(i);
  }
}

/** Move any agent standing on (or stepping onto) a tile that is no longer walkable to the nearest one. */
function repairAgents(g: Game) {
  const { w, h } = g.state.map;
  for (const a of g.state.agents) {
    if (!g.walkable(a.ny * w + a.nx)) { a.nx = a.x; a.ny = a.y; a.t = 0; }
    if (g.walkable(a.y * w + a.x)) continue;
    const near = nearestWalkable(g, a.x, a.y, w, h);
    if (near < 0) continue;
    a.x = a.nx = near % w;
    a.y = a.ny = (near - a.x) / w;
    a.t = 0;
  }
}

function nearestWalkable(g: Game, x: number, y: number, w: number, h: number): number {
  for (let r = 1; r < Math.max(w, h); r++)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < h && g.walkable(Y * w + X)) return Y * w + X;
    }
  return -1;
}

export const isWalking = (a: Agent) => a.act === "walk" || a.act === "wander";

export const movementSystem: System = {
  id: "movement",
  deps: ["news"],
  init(g) { if (!g.state.wanderPoints.length) ensureWanderPoints(g); },
  layout(g) {
    ensureWanderPoints(g);
    repairAgents(g);
  },
  tick(g) {
    const s = g.state;
    const w = s.map.w;
    for (const a of s.agents) {
      if (a.nx !== a.x || a.ny !== a.y) {
        if (++a.t < a.steps) continue;
        a.x = a.nx; a.y = a.ny; a.t = 0;
        if (g.gates.length) stepped(g, a, a.y * w + a.x);
      }
      if (!isWalking(a)) continue;
      const here = a.y * w + a.x;
      if (here === a.dest) { a.act = a.next; a.timer = 0; continue; }
      const j = g.pathsFor(a).next(here, a.dest, a.id);
      // No way there (walled off, or the layout changed): give up and let the role decide again.
      if (j < 0) { a.act = "idle"; a.next = "idle"; a.timer = 0; continue; }
      a.nx = j % w; a.ny = (j - a.nx) / w;
    }
  },
  beat(g) {
    const s = g.state;
    for (const a of s.agents) if (isWalking(a)) s.traffic[a.y * s.map.w + a.x]++;
    g.fields.updateCrowd();
  },
  day(g) {
    const t = g.state.traffic;
    for (let i = 0; i < t.length; i++) if (t[i]) t[i] >>= 1;
  },
};
