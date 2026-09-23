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
  };
  const fill = (r: { x: number; y: number; w: number; h: number }, f: (i: number, x: number, y: number) => void) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (inBounds(m, x, y)) f(idx(m, x, y), x, y);
  };
  for (const r of def.grounds) fill(r, (i) => { m.terrain[i] = T.FLOOR; });
  for (const b of def.buildings) fill(b, (i, x, y) => {
    m.outdoor[i] = 0;
    const edge = x === b.x || y === b.y || x === b.x + b.w - 1 || y === b.y + b.h - 1;
    m.terrain[i] = edge ? T.WALL : T.FLOOR;
    m.fixed[i] = edge ? 1 : 0;
  });
  for (const r of def.walls) fill(r, (i) => { m.terrain[i] = T.WALL; });
  for (const r of def.water) fill(r, (i) => { m.terrain[i] = T.WATER; m.fixed[i] = 1; });
  for (const [x, y] of def.doors) m.terrain[idx(m, x, y)] = T.DOOR;
  // Unowned land stays VOID but is fixed so nothing can be built there.
  for (let i = 0; i < n; i++) if (m.terrain[i] === T.VOID) m.fixed[i] = 1;
  m.entrances = def.entrances.map(([x, y]) => idx(m, x, y));
  return m;
}
