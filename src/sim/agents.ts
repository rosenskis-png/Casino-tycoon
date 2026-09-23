// Agent movement on distance fields. In M1 the only agents are test walkers that wander between points,
// used to exercise pathing, crowd fields, rendering and the performance test. Guests build on this in M2.
import type { System } from "./registry";
import type { Game } from "./game";
import type { Agent } from "./state";
import { rng } from "./rng";
import { UNREACHED } from "./paths";

const WANDER_POINTS = 12;
export const MAX_AGENTS = 20_000;

function pickDest(g: Game, a: Agent) {
  const pts = g.state.wanderPoints;
  a.dest = pts.length ? rng(g.state, "walkers").pick(pts) : a.y * g.state.map.w + a.x;
}

function randomWalkable(g: Game): number {
  const { w, h } = g.state.map;
  const r = rng(g.state, "walkers");
  for (let k = 0; k < 400; k++) {
    const i = r.int(0, w * h - 1);
    if (g.walkable(i) && g.state.map.outdoor[i] === 0) return i;
  }
  for (let i = 0; i < w * h; i++) if (g.walkable(i)) return i;
  return -1;
}

export function ensureWanderPoints(g: Game) {
  const s = g.state;
  s.wanderPoints = s.wanderPoints.filter((i) => g.walkable(i));
  while (s.wanderPoints.length < WANDER_POINTS) {
    const i = randomWalkable(g);
    if (i < 0) break;
    s.wanderPoints.push(i);
  }
}

export function spawnWalkers(g: Game, n: number) {
  const s = g.state;
  ensureWanderPoints(g);
  const r = rng(s, "walkers");
  // Test walkers appear anywhere indoors; guests will arrive through entrances.
  for (let k = 0; k < n && s.agents.length < MAX_AGENTS; k++) {
    const i = randomWalkable(g);
    if (i < 0) return;
    const x = i % s.map.w, y = (i - x) / s.map.w;
    const a: Agent = { id: s.nextId++, x, y, nx: x, ny: y, t: 0, steps: r.int(10, 14), dest: i, look: r.int(0, 1 << 20) };
    pickDest(g, a);
    s.agents.push(a);
  }
}

/** After a layout change: move any agent standing on a tile that is no longer walkable to the nearest one. */
export function repairAgents(g: Game) {
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

export const agentSystem: System = {
  id: "agents",
  deps: ["news"],
  tick(g) {
    const s = g.state;
    const w = s.map.w;
    for (const a of s.agents) {
      if (a.nx !== a.x || a.ny !== a.y) {
        if (++a.t < a.steps) continue;
        a.x = a.nx; a.y = a.ny; a.t = 0;
      }
      const here = a.y * w + a.x;
      if (here === a.dest) { pickDest(g, a); continue; }
      const f = g.paths.get(a.dest);
      const d = f[here];
      if (d === UNREACHED) { pickDest(g, a); continue; }
      // Step to the neighbor that is one closer; agents alternate tie order by id to spread out.
      const order = a.id & 1 ? [1, -1, w, -w] : [w, -w, 1, -1];
      for (const o of order) {
        const j = here + o;
        if ((o === 1 && a.x === w - 1) || (o === -1 && a.x === 0)) continue;
        if (j >= 0 && j < f.length && f[j] === d - 1) { a.nx = j % w; a.ny = (j - a.nx) / w; break; }
      }
    }
  },
  beat(g) {
    const s = g.state;
    for (const a of s.agents) s.traffic[a.y * s.map.w + a.x]++;
    g.fields.updateCrowd();
  },
  day(g) {
    const t = g.state.traffic;
    for (let i = 0; i < t.length; i++) if (t[i]) t[i] >>= 1;
  },
};
