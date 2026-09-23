// Field engine (FOUNDATIONS §4): object sources radiate qualities that fade with distance and are cut by each
// wall crossed. Fields are uncapped; guests' response saturates (later). A layout change recomputes only the
// region it can reach. Crowd channels (CRW, TRF) come from agents instead of objects.
import { CHANNELS, CHANNEL_DEFS, type Channel } from "../data/fields";
import { OBJECTS } from "../data/objects";
import { T } from "../data/terrain";
import type { Game } from "./game";

interface Source { ch: Channel; cx: number; cy: number; s: number; r: number }

export const MAX_RADIUS = Math.max(1, ...Object.values(OBJECTS).flatMap((o) => o.emits.map((e) => e.radius)));
/** Beats of foot traffic per day, used to normalize TRF. */
const TRF_SCALE = 10;

export class FieldEngine {
  values = {} as Record<Channel, Float32Array>;
  private sources: Source[] = [];
  recomputes = 0;

  constructor(private g: Game) {}

  /** Full rebuild (new game or load). */
  init() {
    const { w, h } = this.g.state.map;
    for (const c of CHANNELS) this.values[c] = new Float32Array(w * h);
    this.collectSources();
    this.recomputeRegion(0, 0, w - 1, h - 1);
    this.updateCrowd();
  }

  collectSources() {
    this.sources = [];
    for (const o of this.g.state.objects) {
      const def = OBJECTS[o.kind];
      for (const e of def.emits) this.sources.push({ ch: e.channel, cx: o.x + (def.w - 1) / 2, cy: o.y + (def.h - 1) / 2, s: e.strength, r: e.radius });
    }
  }

  /** Recompute everything a change at these tiles can reach. */
  tilesChanged(tiles: number[]) {
    if (!tiles.length) return;
    const { w, h } = this.g.state.map;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (const i of tiles) {
      const x = i % w, y = (i - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    this.collectSources();
    const R = MAX_RADIUS + 1;
    this.recomputeRegion(Math.max(0, x0 - R), Math.max(0, y0 - R), Math.min(w - 1, x1 + R), Math.min(h - 1, y1 + R));
  }

  private recomputeRegion(x0: number, y0: number, x1: number, y1: number) {
    this.recomputes++;
    const { w, terrain } = this.g.state.map;
    for (const c of CHANNELS) {
      if (c === "CRW" || c === "TRF") continue;
      const v = this.values[c];
      for (let y = y0; y <= y1; y++) v.fill(0, y * w + x0, y * w + x1 + 1);
    }
    for (const src of this.sources) {
      const sx0 = Math.max(x0, Math.ceil(src.cx - src.r)), sx1 = Math.min(x1, Math.floor(src.cx + src.r));
      const sy0 = Math.max(y0, Math.ceil(src.cy - src.r)), sy1 = Math.min(y1, Math.floor(src.cy + src.r));
      if (sx0 > sx1 || sy0 > sy1) continue;
      const v = this.values[src.ch];
      const keep = 1 - CHANNEL_DEFS[src.ch].wallCut;
      const ox = Math.round(src.cx), oy = Math.round(src.cy);
      for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
        const d = Math.hypot(x - src.cx, y - src.cy);
        if (d > src.r) continue;
        const walls = wallsBetween(terrain, w, ox, oy, x, y);
        v[y * w + x] += src.s * (1 - d / (src.r + 0.5)) * (walls ? Math.pow(keep, walls) : 1);
      }
    }
  }

  /** CRW from agent density (3×3 neighborhood count), run on the beat cadence. */
  updateCrowd() {
    const { w, h } = this.g.state.map;
    const count = new Float32Array(w * h);
    for (const a of this.g.state.agents) if (!a.hidden) count[a.y * w + a.x]++;
    const crw = this.values.CRW;
    crw.fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = count[y * w + x];
      if (!c) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h) crw[Y * w + X] += dx || dy ? c * 0.5 : c;
      }
    }
  }

  get(ch: Channel, i: number): number {
    if (ch === "TRF") return this.g.state.traffic[i] / TRF_SCALE;
    return this.values[ch][i];
  }
}

/** Wall tiles crossed on the Bresenham line between two tiles, endpoints excluded. Doors count half. */
function wallsBetween(terrain: number[], w: number, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (;;) {
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if (x === x1 && y === y1) break;
    const t = terrain[y * w + x];
    if (t === T.WALL) n += 1;
    else if (t === T.DOOR) n += 0.5;
  }
  return n;
}
