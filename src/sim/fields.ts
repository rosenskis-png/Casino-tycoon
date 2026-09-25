// Field engine (FOUNDATIONS §4): object sources radiate qualities that fade with distance and are cut by each
// wall crossed. Fields are uncapped; guests' response saturates (later). A layout change recomputes only the
// region it can reach. Crowd channels (CRW, TRF) come from agents instead of objects.
import { CHANNELS, CHANNEL_DEFS, type Channel } from "../data/fields";
import { OBJECTS } from "../data/objects";
import { T } from "../data/terrain";
import type { Game } from "./game";
import { dims, objSize } from "./geometry";
import { tierOf } from "./amenities";
import { ThemeField } from "./themes";
import { designById } from "./design/lookup";
import { energyOf } from "./design/appeal";
import { NOISE } from "../data/psych";

/** Room purposes that give off a quality throughout the room (docs/spec/construction.md): sources on a grid. */
const ROOM_EMITS: Record<string, { ch: Channel; s: number; r: number }[]> = {
  smoking: [{ ch: "SMK", s: 2, r: 4 }],
  highlimit: [{ ch: "PRS", s: 1.2, r: 4 }, { ch: "PRV", s: 1.2, r: 4 }],
};
const ROOM_GRID = 3;
/** Sized amenities: emissions grow with size (radius capped) and prestige with tier. */
const MAX_SIZED_RADIUS = 10;

interface Source { ch: Channel; cx: number; cy: number; s: number; r: number }

export const MAX_RADIUS = Math.max(MAX_SIZED_RADIUS, ...Object.values(OBJECTS).flatMap((o) => o.emits.map((e) => e.radius)));
/** Beats of foot traffic per day, used to normalize TRF. */
const TRF_SCALE = 10;

export class FieldEngine {
  values = {} as Record<Channel, Float32Array>;
  private sources: Source[] = [];
  recomputes = 0;
  /** Theme fields and scores (M6.5, docs/spec/themes.md). */
  readonly themes: ThemeField;
  /** (M11.1) Crowd noise per room (its own plus what carries in from rooms nearby), refreshed with the crowd. */
  noise = new Float32Array(0);
  /** (M11.1) The casino's draw by guest type (sim/guests.ts `floorDraw`), dropped on every layout change. */
  drawCache: Record<string, number> | null = null;

  constructor(private g: Game) { this.themes = new ThemeField(g); }

  /** Full rebuild (new game or load). */
  init() {
    this.drawCache = null;
    const { w, h } = this.g.state.map;
    for (const c of CHANNELS) this.values[c] = new Float32Array(w * h);
    this.collectSources();
    this.recomputeRegion(0, 0, w - 1, h - 1);
    this.themes.update(0, 0, w - 1, h - 1);
    this.updateCrowd();
  }

  collectSources() {
    this.sources = [];
    const g = this.g, s = g.state, w = s.map.w;
    for (const o of s.objects) {
      const def = OBJECTS[o.kind], { w: ow, h: oh } = objSize(o);
      const cx = o.x + (ow - 1) / 2, cy = o.y + (oh - 1) / 2;
      if (!def.sized) {
        // M8: a slot's energy comes from its design's lights, sound and cabinet (the original machines keep theirs).
        const d = def.slot && o.design ? designById(s, o.design) : undefined;
        if (d) { const e = energyOf(d); this.sources.push({ ch: "NRG", cx, cy, s: e.strength, r: e.radius }); continue; }
        for (const e of def.emits) this.sources.push({ ch: e.channel, cx, cy, s: e.strength, r: e.radius });
        continue;
      }
      // Bigger places give off more, farther; finer ones more prestige.
      const d = dims(o), k = Math.sqrt((d.w * d.h) / (def.w * def.h)), grow = Math.round((Math.max(d.w, d.h) - Math.max(def.w, def.h)) / 2);
      const tier = tierOf(g, o);
      for (const e of def.emits) this.sources.push({ ch: e.channel, cx, cy, s: e.strength * k, r: Math.min(MAX_SIZED_RADIUS, e.radius + Math.max(0, grow)) });
      if (tier) this.sources.push({ ch: "PRS", cx, cy, s: 1.5 * tier, r: Math.min(MAX_SIZED_RADIUS, 4 + Math.max(0, grow)) });
    }
    // Room purposes: sources on a grid over the room's floor.
    for (const room of g.rooms.rooms) {
      const em = room.meta >= 0 ? ROOM_EMITS[s.roomMeta[room.meta]?.purpose ?? ""] : undefined;
      if (!em) continue;
      for (let y = room.y0 + 1; y <= room.y1; y += ROOM_GRID) for (let x = room.x0 + 1; x <= room.x1; x += ROOM_GRID) {
        if (g.rooms.roomOf[y * w + x] !== room.id) continue;
        for (const e of em) this.sources.push({ ch: e.ch, cx: x, cy: y, s: e.s, r: e.r });
      }
    }
  }

  /** Recompute everything a change at these tiles can reach. */
  tilesChanged(tiles: number[]) {
    if (!tiles.length) return;
    this.drawCache = null;
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
    // Themes: a purpose change or new walls can change a whole room's coherence, so scores refresh map-wide.
    this.themes.update(x0, y0, x1, y1);
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

  /** CRW from agent density (3×3 neighborhood count), run on the beat cadence; crowd noise per room with it. */
  updateCrowd() {
    const { w, h } = this.g.state.map;
    const count = new Float32Array(w * h);
    for (const a of this.g.state.agents) if (!a.hidden) count[a.y * w + a.x]++;
    this.updateNoise();
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

  /**
   * (M11.1) Noise by room: guests make it (more when drunk, high or dancing), a room's level is its total over
   * its size, and it carries into rooms nearby, cut by the wall between and fading with distance.
   */
  private updateNoise() {
    const g = this.g, rooms = g.rooms.rooms, roomOf = g.rooms.roomOf, w = g.state.map.w;
    const own = new Float32Array(rooms.length);
    for (const a of g.state.agents) {
      const gd = a.g;
      if (!gd || a.hidden) continue;
      const r = roomOf[a.y * w + a.x];
      if (r < 0) continue;
      own[r] += NOISE.base + NOISE.drunk * Math.max(0, gd.intox - 0.2) + NOISE.high * gd.high + (a.act === "dance" ? NOISE.dance : 0);
    }
    for (let r = 0; r < rooms.length; r++) own[r] = own[r] ? (NOISE.scale * own[r]) / Math.max(20, rooms[r].size) : 0;
    const near = g.rooms.near(g.state, NOISE.reach), eff = new Float32Array(rooms.length);
    for (let r = 0; r < rooms.length; r++) {
      let v = own[r];
      for (const nb of near[r]) if (own[nb.id]) v += own[nb.id] * NOISE.wall * (1 - nb.d / (NOISE.reach + 1));
      eff[r] = v;
    }
    this.noise = eff;
  }

  /** (M11.1) Crowd noise at tile i (0 outside rooms). */
  noiseAt(i: number): number {
    const r = this.g.rooms.roomOf[i];
    return r >= 0 && r < this.noise.length ? this.noise[r] : 0;
  }

  get(ch: Channel, i: number): number {
    if (ch === "TRF") return this.g.state.traffic[i] / TRF_SCALE;
    return this.values[ch][i];
  }
}

/** Wall tiles crossed on the Bresenham line between two tiles, endpoints excluded. Doors count half. */
export function wallsBetween(terrain: number[], w: number, x0: number, y0: number, x1: number, y1: number): number {
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
