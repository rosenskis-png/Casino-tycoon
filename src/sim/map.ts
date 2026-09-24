// Tile grid helpers and the scenario map builder (FOUNDATIONS §3).
import { DOOR_STATE, T } from "../data/terrain";
import type { ScenarioDef } from "../data/scenarios";
import type { MapState } from "./state";

export const idx = (m: { w: number }, x: number, y: number) => y * m.w + x;
export const inBounds = (m: { w: number; h: number }, x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h;

export function buildScenarioMap(def: ScenarioDef): MapState {
  const n = def.w * def.h;
  const m: MapState = {
    w: def.w, h: def.h,
    terrain: new Array(n).fill(T.VOID),
    outdoor: new Array(n).fill(1),
    fixed: new Array(n).fill(0),
    door: new Array(n).fill(DOOR_STATE.OPEN),
    entrances: [],
    gates: [],
    lift: -1,
  };
  const fill = (r: { x: number; y: number; w: number; h: number }, f: (i: number, x: number, y: number) => void) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (inBounds(m, x, y)) f(idx(m, x, y), x, y);
  };
  for (const r of def.grounds) fill(r, (i) => { m.terrain[i] = T.FLOOR; });
  for (const b of def.buildings) fill(b, (i, x, y) => {
    m.outdoor[i] = 0;
    const edge = x === b.x || y === b.y || x === b.x + b.w - 1 || y === b.y + b.h - 1;
    m.terrain[i] = edge ? T.WALL : T.FLOOR;
  });
  for (const r of def.walls) fill(r, (i) => { m.terrain[i] = T.WALL; });
  for (const r of def.water) fill(r, (i) => { m.terrain[i] = T.WATER; m.fixed[i] = 1; });
  for (const [x, y] of def.doors) m.terrain[idx(m, x, y)] = T.DOOR;
  for (const sw of def.sidewalks) for (const i of lineTiles(m, sw.from, sw.to)) { m.terrain[i] = T.SIDEWALK; m.fixed[i] = 1; }
  // Unowned land stays VOID but is fixed so nothing can be built there.
  for (let i = 0; i < n; i++) if (m.terrain[i] === T.VOID) m.fixed[i] = 1;
  m.entrances = def.entrances.map(([x, y]) => idx(m, x, y));
  // The hotel elevator (M9.6): an entrance on the floor, fixed so nothing is built over it.
  if (def.elevator) { m.lift = idx(m, def.elevator[0], def.elevator[1]); m.entrances.push(m.lift); m.fixed[m.lift] = 1; }
  for (const q of def.gates ?? []) {
    const i = idx(m, q.x, q.y);
    m.door[i] = q.rule;
    if (q.arg || q.fee) m.gates.push({ i, arg: q.arg ?? "", fee: q.fee ?? 0 });
  }
  recomputeOutdoor(m);
  return m;
}

/**
 * Indoors is floor the open air can't reach (docs/spec/construction.md): flood from unowned land, the sidewalk
 * and the map edge through everything but walls and doors. Enclosing lot ground with walls makes it indoors;
 * opening a building's wall to the lot makes it outdoors. Returns the floor tiles whose flag changed.
 */
export function recomputeOutdoor(m: MapState): number[] {
  const { w, h, terrain } = m, n = w * h, air = new Uint8Array(n), stack: number[] = [];
  const open = (i: number) => terrain[i] !== T.WALL && terrain[i] !== T.DOOR;
  const seed = (i: number) => { if (!air[i] && open(i)) { air[i] = 1; stack.push(i); } };
  for (let i = 0; i < n; i++) if (terrain[i] === T.VOID || terrain[i] === T.SIDEWALK) seed(i);
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop()!, x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i + w < n) seed(i + w);
  }
  const changed: number[] = [];
  for (let i = 0; i < n; i++) if (terrain[i] === T.FLOOR && m.outdoor[i] !== air[i]) { m.outdoor[i] = air[i]; changed.push(i); }
  return changed;
}

/** Floor tiles on the lot's street edge where a new entrance can go: owned, outdoors, beside the sidewalk. */
export function besideSidewalk(m: MapState, i: number): boolean {
  const x = i % m.w;
  return [x > 0 ? i - 1 : -1, x < m.w - 1 ? i + 1 : -1, i - m.w, i + m.w].some((j) => j >= 0 && j < m.terrain.length && m.terrain[j] === T.SIDEWALK);
}

/** Tiles of a straight (horizontal, vertical or diagonal) line, end to end. */
export function lineTiles(m: { w: number; h: number }, [x0, y0]: [number, number], [x1, y1]: [number, number]): number[] {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const out: number[] = [];
  for (let k = 0; k <= n; k++) {
    const x = x0 + Math.round(((x1 - x0) * k) / Math.max(1, n)), y = y0 + Math.round(((y1 - y0) * k) / Math.max(1, n));
    if (inBounds(m, x, y)) out.push(idx(m, x, y));
  }
  return out;
}
