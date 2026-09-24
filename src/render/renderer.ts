// Canvas 2D world renderer. Reads sim state, never writes it (docs/spec/art.md). Terrain, wall shading, contact
// shadows and light pools are baked into cached chunks and redrawn only when tiles change; at Wide and
// Overview the object sprites are baked too. Objects and people draw per frame, on-screen only.
import { DOOR_STATE, T } from "../data/terrain";
import { OBJECTS } from "../data/objects";
import { CHANNEL_DEFS, type Channel } from "../data/fields";
import { ANIMS, BOARD_CELLS, CAB_REELS, LIGHTS, PEOPLE, SIT_DROP, SLOT_REELS, WHEEL_AT, topperHeight, type CabShape } from "../data/art";
import { LIGHT_COLORS } from "../data/designer";
import { CRAPS_OUTCOMES, TABLE_GAMES } from "../data/tables";
import { ENF } from "../data/cheats";
import { SCENARIOS } from "../data/scenarios";
import { designById, dims, purposeAt, objCells, objSeats, objSize, objStaff, pedSpot, showPhase, TICKS_PER_SECOND, type Agent, type EnfJob, type Game, type PlacedObject, type SimEvent } from "../sim";
import { buildAtlas, PAD, type Atlas } from "./atlas";
import type { Camera } from "./camera";

const ART = 16; // art pixels per tile
/** (M8) A design's cabinet look key (render/atlas.ts): cabinet type, body color, light color, topper. */
const lookOf = (d: { cab: { type: string; body: number; topper: string }; show: { light: number } }) => `${d.cab.type}.${d.cab.body}.${d.show.light}.${d.cab.topper}`;
const CHUNK = 16; // tiles per chunk side
const REACH = 4; // tiles a change can affect around it (light pools, tall sprites)
const FACING = ["front", "left", "back", "right"] as const;
const FRONT_VEC = [[0, 1], [-1, 0], [0, -1], [1, 0]];
/** Sprites whose contact shadow is a small ellipse at the base rather than the footprint. */
const BASE_SHADOW = new Set(["plant", "neon", "sign"]);
/** Chair sprite and a seated guest's facing, by seat facing (0 down, 1 left, 2 up, 3 right). */
const CHAIR = ["front", "left", "back", "right"];
const SEAT_DIR = ["down", "left", "up", "side"];
/** Door rule markers (docs/spec/construction.md). */
/** Which tiles of a room floor use its second design. */
const FLOOR_ALT: Record<string, (x: number, y: number) => boolean> = {
  bar: (x, y) => (x * 3 + y * 5) % 7 === 0,
  restaurant: (x, y) => ((x + y) & 1) === 1,
  highlimit: (x, y) => ((x + y) & 1) === 1,
  club: (x, y) => (x * 5 + y * 3) % 3 === 0,
  smoking: (x, y) => (x * 7 + y * 5) % 9 === 0,
  enforcement: (x, y) => (x * 7 + y * 11) % 13 === 0,
};
const DOOR_MARK: Record<number, string> = { [DOOR_STATE.STAFF]: "door:staff", [DOOR_STATE.LOCKED]: "door:locked", [DOOR_STATE.CARD]: "door:card", [DOOR_STATE.DRESS]: "door:dress", [DOOR_STATE.ROLE]: "door:role" };

export interface Ghost { tiles: number[]; seats?: number[]; ok: boolean }
export interface DrawOptions {
  overlay?: Channel | null;
  /** (M9.5) Heatmap over the games: what each has won for the house, or how long it's been played. */
  heat?: "revenue" | "play" | null;
  ghost?: Ghost | null;
  selectedTile?: number;
  selectedAgent?: number;
}
export interface DrawStats { agentsDrawn: number; chunksRedrawn: number }

/** One object sprite placed in world art pixels (top-left of the unpadded sprite). */
interface Spr { key: string; x: number; y: number; sort: number; anim?: string }

export class Renderer {
  atlas: Atlas;
  /** Designed cabinet looks compiled into the atlas (M8), and extra ones asked for (build menu pictures). */
  private looks = new Set<string>();
  private wantLooks = new Set<string>();
  private looksAt = -1;
  private ctx: CanvasRenderingContext2D;
  // Two chunk caches: terrain + shading only (Close/Default, objects live) and with objects baked (Wide/Overview).
  private chunks = new Map<number, HTMLCanvasElement>();
  private dirty = new Set<number>();
  private purposes = "";
  private farChunks = new Map<number, HTMLCanvasElement>();
  private farDirty = new Set<number>();
  private game: Game | null = null;
  private unsub: (() => void) | null = null;
  private lightLayer: HTMLCanvasElement | null = null;
  stats: DrawStats = { agentsDrawn: 0, chunksRedrawn: 0 };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.atlas = buildAtlas();
  }

  /** The cabinet a machine draws with: a design's look, the original slot models, or the video poker cabinet. */
  private cabinet(o: { kind: string; design?: string }): string | undefined {
    const def = OBJECTS[o.kind];
    if (def?.slot && o.design && this.game) {
      const d = designById(this.game.state, o.design);
      if (d) return `L${lookOf(d)}`;
    }
    return def?.slot ?? (def?.game === "vpoker" ? "vpoker" : undefined);
  }

  /** (M8) Compiles any designed cabinet look the floor needs that the atlas doesn't have yet. */
  private ensureLooks(force = false) {
    const g = this.game;
    if (!g) return;
    if (!force && g.state.tick === this.looksAt) return;
    this.looksAt = g.state.tick;
    const need = new Set(this.wantLooks);
    for (const o of g.state.objects) if (o.design && OBJECTS[o.kind]?.slot) { const d = designById(g.state, o.design); if (d) need.add(lookOf(d)); }
    let missing = false;
    for (const l of need) if (!this.looks.has(l)) { missing = true; break; }
    if (!missing) return;
    for (const l of this.looks) need.add(l);
    this.looks = need;
    this.atlas = buildAtlas([...need].sort());
    this.chunks.clear(); this.farChunks.clear(); this.thumbs.clear();
  }

  setGame(g: Game) {
    this.unsub?.();
    this.game = g;
    this.looksAt = -1;
    this.chunks.clear();
    this.dirty.clear();
    this.farChunks.clear();
    this.farDirty.clear();
    this.purposes = "";
    this.unsub = g.bus.on((e: SimEvent) => {
      if (e.type === "tilesChanged") this.invalidate(e.tiles);
      // A room given a new purpose gets a new floor: redraw when any room's purpose changes.
      else if (e.type === "roomsChanged") {
        const key = g.rooms.rooms.filter((r) => r.meta >= 0).map((r) => `${r.first}:${r.size}:${g.state.roomMeta[r.meta]?.purpose}`).join();
        if (key !== this.purposes) { this.purposes = key; this.chunks.clear(); this.farChunks.clear(); }
      }
    });
  }

  private invalidate(tiles: number[]) {
    const { w } = this.game!.state.map;
    const cw = Math.ceil(w / CHUNK);
    for (const i of tiles) {
      const x = i % w, y = (i - x) / w;
      for (let cy = Math.floor(Math.max(0, y - REACH) / CHUNK); cy <= Math.floor((y + REACH) / CHUNK); cy++)
        for (let cx = Math.floor(Math.max(0, x - REACH) / CHUNK); cx <= Math.floor((x + REACH) / CHUNK); cx++) {
          const k = cy * cw + cx;
          this.dirty.add(k);
          this.farDirty.add(k);
        }
    }
  }

  // ---- Terrain -------------------------------------------------------------------------------------------

  private isWall(x: number, y: number) {
    const m = this.game!.state.map;
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
    const t = m.terrain[y * m.w + x];
    return t === T.WALL || t === T.DOOR;
  }

  private tileSprite(x: number, y: number): string {
    const m = this.game!.state.map, i = y * m.w + x;
    switch (m.terrain[i]) {
      case T.FLOOR: {
        if (m.entrances.includes(i) && i !== m.lift) return "tile:entry";
        if (m.outdoor[i]) { const r = (x * 7 + y * 13) % 11; return r === 3 ? "tile:sand2" : r === 8 && (x ^ y) & 4 ? "tile:sand3" : "tile:sand"; }
        // Each room purpose has its own floor (the general floor, and rooms with none, keep the harlequin).
        const p = purposeAt(this.game!, i);
        if (!p || p === "floor") return (x + y) & 1 ? "tile:carpet2" : "tile:carpet";
        const two = FLOOR_ALT[p];
        return two && two(x, y) ? `tile:${p}2` : `tile:${p}`;
      }
      case T.WALL: {
        if (y + 1 >= m.h) return "tile:wall";
        const b = m.terrain[i + m.w];
        if (b === T.WALL) return "tile:wall";
        return b === T.FLOOR && !m.outdoor[i + m.w] || b === T.DOOR ? "tile:wallface" : "tile:wallout";
      }
      case T.DOOR: return this.isWall(x - 1, y) || this.isWall(x + 1, y) || !(this.isWall(x, y - 1) && this.isWall(x, y + 1)) ? "tile:door" : "tile:doorV";
      case T.WATER: return "tile:water";
      case T.SIDEWALK: return "tile:sidewalk";
      default: return "tile:void";
    }
  }

  /** Objects whose footprint touches the tile rectangle. */
  private objectsIn(x0: number, y0: number, x1: number, y1: number): PlacedObject[] {
    const g = this.game!, { w, h } = g.state.map;
    const seen = new Set<number>(), out: PlacedObject[] = [];
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
      const id = g.objAt[y * w + x];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const o = g.objById.get(id);
      if (o) out.push(o);
    }
    return out;
  }

  private chunk(key: number, cx: number, cy: number, far: boolean): HTMLCanvasElement {
    const cache = far ? this.farChunks : this.chunks, dirty = far ? this.farDirty : this.dirty;
    let c = cache.get(key);
    if (c && !dirty.has(key)) return c;
    if (!c) {
      c = document.createElement("canvas");
      c.width = c.height = CHUNK * ART;
      cache.set(key, c);
    }
    dirty.delete(key);
    this.stats.chunksRedrawn++;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    const m = this.game!.state.map, { w, h } = m;
    const X0 = cx * CHUNK, Y0 = cy * CHUNK;
    g.fillStyle = "#0d0809";
    g.fillRect(0, 0, c.width, c.height);
    const A = this.atlas;
    for (let ty = 0; ty < CHUNK; ty++) for (let tx = 0; tx < CHUNK; tx++) {
      const x = X0 + tx, y = Y0 + ty;
      if (x >= w || y >= h) continue;
      const f = A.frames.get(this.tileSprite(x, y))!;
      g.drawImage(A.canvas, f.x, f.y, f.w, f.h, tx * ART, ty * ART, ART, ART);
    }
    // Wall edges (ink where a wall meets a non-wall) and the shadows walls cast down and right.
    for (let ty = -1; ty <= CHUNK; ty++) for (let tx = -1; tx <= CHUNK; tx++) {
      const x = X0 + tx, y = Y0 + ty;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const t = m.terrain[y * w + x], px = tx * ART, py = ty * ART;
      if (t === T.WALL) {
        g.fillStyle = "#1b0e14";
        if (!this.isWall(x - 1, y)) g.fillRect(px, py, 1, ART);
        if (!this.isWall(x + 1, y)) g.fillRect(px + ART - 1, py, 1, ART);
        if (!this.isWall(x, y - 1)) g.fillRect(px, py, ART, 1);
      } else if (t !== T.DOOR) {
        g.fillStyle = "rgba(12,4,8,0.38)";
        if (this.isWall(x, y - 1)) { g.fillRect(px, py, ART, 2); g.fillStyle = "rgba(12,4,8,0.2)"; g.fillRect(px, py + 2, ART, 3); }
        g.fillStyle = "rgba(12,4,8,0.22)";
        if (this.isWall(x - 1, y)) g.fillRect(px, py, 2, ART);
      }
    }
    // Land for sale (M6.5): a lighter tint over the parcel and a sign in the middle.
    for (const p of SCENARIOS[this.game!.state.scenario]?.parcels ?? []) {
      if (this.game!.state.parcels.includes(p.id) || p.rects.some((r) => r.x + r.w > w || r.y + r.h > h)) continue;
      for (const r of p.rects) {
        g.fillStyle = "rgba(242,210,122,0.06)";
        g.fillRect((r.x - X0) * ART, (r.y - Y0) * ART, r.w * ART, r.h * ART);
        g.fillStyle = "rgba(242,210,122,0.35)";
        g.fillRect((r.x - X0) * ART, (r.y - Y0) * ART, r.w * ART, 1);
        g.fillRect((r.x - X0) * ART, (r.y + r.h - Y0) * ART - 1, r.w * ART, 1);
        g.fillRect((r.x - X0) * ART, (r.y - Y0) * ART, 1, r.h * ART);
        g.fillRect((r.x + r.w - X0) * ART - 1, (r.y - Y0) * ART, 1, r.h * ART);
        const f = A.frames.get("obj:forsale"), cx = r.x + Math.floor(r.w / 2), cy = r.y + Math.floor(r.h / 2);
        if (f) g.drawImage(A.canvas, f.x - PAD, f.y - PAD, f.w + 2 * PAD, f.h + 2 * PAD, (cx - X0) * ART - PAD, (cy + 1 - Y0) * ART - f.h - PAD, f.w + 2 * PAD, f.h + 2 * PAD);
      }
    }
    // Door rules: a marker on each restricted door (a fee shows as a coin).
    const fees = new Map(m.gates.map((q) => [q.i, q.fee]));
    for (let ty = 0; ty < CHUNK; ty++) for (let tx = 0; tx < CHUNK; tx++) {
      const x = X0 + tx, y = Y0 + ty;
      if (x >= w || y >= h || m.terrain[y * w + x] !== T.DOOR) continue;
      const mark = DOOR_MARK[m.door[y * w + x]];
      for (const k of [mark, (fees.get(y * w + x) ?? 0) > 0 ? "door:fee" : ""]) {
        const f = k && A.frames.get(`obj:${k}`);
        if (f) g.drawImage(A.canvas, f.x - PAD, f.y - PAD, f.w + 2 * PAD, f.h + 2 * PAD, tx * ART - PAD, ty * ART + (k === "door:dress" ? 0 : 1) - PAD, f.w + 2 * PAD, f.h + 2 * PAD);
      }
    }
    // The hotel elevator (M9.6): brass lift doors against the wall behind its tile.
    if (m.lift >= 0) {
      const lx = m.lift % w, ly = Math.floor(m.lift / w), f = A.frames.get("obj:lift");
      if (f && lx >= X0 && lx < X0 + CHUNK && ly >= Y0 && ly < Y0 + CHUNK)
        g.drawImage(A.canvas, f.x - PAD, f.y - PAD, f.w + 2 * PAD, f.h + 2 * PAD, (lx - X0) * ART - PAD, (ly + 1 - Y0) * ART - f.h - PAD, f.w + 2 * PAD, f.h + 2 * PAD);
    }
    // Contact shadows under objects.
    const near = this.objectsIn(X0 - 2, Y0 - 2, X0 + CHUNK + 1, Y0 + CHUNK + 1);
    g.fillStyle = "rgba(12,4,8,0.34)";
    for (const o of near) {
      const def = OBJECTS[o.kind], { w: ow, h: oh } = objSize(o);
      const px = (o.x - X0) * ART, py = (o.y - Y0) * ART;
      // Ceiling fixtures (cameras) cast no shadow on the floor.
      if (!def.blocks) continue;
      if (def.art === "zone") {
        for (const c of objCells(o)) if (c.c.block && c.c.k !== "stage") g.fillRect((c.x - X0) * ART + 2, (c.y - Y0) * ART + 3, ART, ART);
      } else if (BASE_SHADOW.has(def.sprite) || def.tags?.theme) {
        const bx = px + ART / 2, by = py + oh * ART - 1;
        g.fillRect(bx - 3, by - 2, 7, 1); g.fillRect(bx - 5, by - 1, 11, 2); g.fillRect(bx - 3, by + 1, 7, 1);
      } else if (def.sprite === "fountain") {
        const rx = (ow * ART) / 2, ry = (oh * ART) / 2;
        for (let r = 0; r < oh * ART; r++) {
          const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - ((r + 0.5 - ry) / ry) ** 2)));
          g.fillRect(px + 2 + rx - hw, py + 3 + r, hw * 2, 1);
        }
      } else g.fillRect(px + 2, py + 3, ow * ART, oh * ART);
    }
    this.bakeLights(g, X0, Y0);
    if (far) {
      const sprites: Spr[] = [];
      for (const o of this.objectsIn(X0 - 1, Y0 - 1, X0 + CHUNK, Y0 + CHUNK + 1)) sprites.push(...this.objectSprites(o));
      sprites.sort((a, b) => a.sort - b.sort);
      for (const s of sprites) {
        const f = A.frames.get(s.key);
        if (f) g.drawImage(A.canvas, f.x - PAD, f.y - PAD, f.w + 2 * PAD, f.h + 2 * PAD, s.x - X0 * ART - PAD, s.y - Y0 * ART - PAD, f.w + 2 * PAD, f.h + 2 * PAD);
      }
    }
    return c;
  }

  /** Light pools from lit objects, added onto the chunk per art pixel in 12 steps. */
  private bakeLights(g: CanvasRenderingContext2D, X0: number, Y0: number) {
    const lights: { x: number; y: number; r: number; k: number; c: number[] }[] = [];
    for (const o of this.objectsIn(X0 - REACH, Y0 - REACH, X0 + CHUNK + REACH, Y0 + CHUNK + REACH)) {
      const def = OBJECTS[o.kind], L = LIGHTS[def.sprite];
      if (!L) continue;
      const { w: ow, h: oh } = objSize(o), fv = FRONT_VEC[o.rot & 3];
      const n = parseInt(L.color.slice(1), 16);
      lights.push({
        x: (o.x + ow / 2 + fv[0] * (L.front ?? 0)) * ART - X0 * ART, y: (o.y + oh / 2 + fv[1] * (L.front ?? 0)) * ART - Y0 * ART,
        r: L.r * ART, k: L.k, c: [n >> 16, (n >> 8) & 255, n & 255],
      });
    }
    if (!lights.length) return;
    // Accumulate into a light layer and add it with "lighter": no pixel readback from the chunk (slow on phones).
    const S = CHUNK * ART;
    if (!this.lightLayer) { this.lightLayer = document.createElement("canvas"); this.lightLayer.width = this.lightLayer.height = S; }
    const lc = this.lightLayer.getContext("2d")!, img = lc.createImageData(S, S), D = img.data;
    for (const L of lights) {
      const xa = Math.max(0, Math.floor(L.x - L.r)), xb = Math.min(S - 1, Math.ceil(L.x + L.r));
      const ya = Math.max(0, Math.floor(L.y - L.r)), yb = Math.min(S - 1, Math.ceil(L.y + L.r));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
        const dx = x + 0.5 - L.x, dy = (y + 0.5 - L.y) * 1.15, d = Math.sqrt(dx * dx + dy * dy) / L.r;
        if (d >= 1) continue;
        const q = Math.round(L.k * (1 - d) * (1 - d) * 12) / 12;
        if (q <= 0) continue;
        const p = (y * S + x) * 4;
        D[p] = Math.min(255, D[p] + L.c[0] * q * 0.5);
        D[p + 1] = Math.min(255, D[p + 1] + L.c[1] * q * 0.5);
        D[p + 2] = Math.min(255, D[p + 2] + L.c[2] * q * 0.5);
        D[p + 3] = 255;
      }
    }
    lc.putImageData(img, 0, 0);
    g.globalCompositeOperation = "lighter";
    g.drawImage(this.lightLayer, 0, 0);
    g.globalCompositeOperation = "source-over";
  }

  // ---- Objects -------------------------------------------------------------------------------------------

  private frameKey(key: string, anim: string | undefined, now: number, seed: number) {
    if (!anim) return key;
    const A = ANIMS[anim];
    if (!A) return key;
    const seq = A.seq, step = Math.floor((now + seed * 137) / A.ms);
    const n = seq ? seq[step % seq.length] : step % 3;
    if (n && this.atlas.frames.has(`${key}~${n}`)) return `${key}~${n}`;
    if (!seq && n === 2 && this.atlas.frames.has(`${key}~1`)) return `${key}~1`;
    return key;
  }

  /** Every sprite an object shows (stools included), in world art pixels. */
  private objectSprites(o: PlacedObject): Spr[] {
    const def = OBJECTS[o.kind], A = this.atlas.frames;
    const { w: ow, h: oh } = objSize(o), facing = FACING[o.rot & 3];
    const out: Spr[] = [];
    for (const st of objSeats(o)) {
      if (st.kind === "stool") out.push({ key: "obj:stool", x: st.x * ART, y: st.y * ART, sort: st.y - 0.05 });
      // A chair seen from behind sits in front of whoever is on it.
      else if (st.kind === "chair") out.push({ key: `obj:chair:${CHAIR[st.f]}`, x: st.x * ART, y: st.y * ART, sort: st.y + (st.f === 2 ? 0.05 : -0.05) });
    }
    const cab = this.cabinet(o);
    if (def.art === "zone") {
      out.push(...this.zoneSprites(o));
    } else if (def.cat === "table" && A.has(`obj:tbl_${o.kind}_${o.rot & 3}`)) {
      // Tables (M7): a flat felt top; the roulette wheel sits over one end.
      out.push({ key: `obj:tbl_${o.kind}_${o.rot & 3}`, x: o.x * ART, y: o.y * ART, sort: o.y + oh - 0.1 });
      if (o.kind === "roulette") {
        const at = WHEEL_AT[o.rot & 3], ex = at === "r" ? ow - 1 : 0, ey = at === "b" ? oh - 1 : 0;
        out.push({ key: "obj:wheel", x: (o.x + ex) * ART + 2, y: (o.y + ey) * ART + 1, sort: o.y + oh - 0.09, anim: "wheel" });
      }
    } else if (cab) {
      const key = `slot:${cab}:${facing}`, f = A.get(key) ?? A.get("slot:cherry:front")!;
      out.push({ key: A.has(key) ? key : "slot:cherry:front", x: o.x * ART, y: (o.y + oh) * ART - f.h, sort: o.y + oh - 0.01, anim: "slot" });
    } else if (def.art === "tiled") {
      const n = Math.max(ow, oh), alongX = ow >= oh;
      for (let i = 0; i < n; i++) {
        const part = i === 0 ? "a" : i === n - 1 ? "c" : "b";
        const tx = o.x + (alongX ? i : 0), ty = o.y + (alongX ? 0 : i);
        const key = [`obj:${def.sprite}:${facing}:${part}`, `obj:${def.sprite}:${facing}:a`, `obj:${def.sprite}`].find((k) => A.has(k))!;
        const f = A.get(key)!;
        out.push({ key, x: tx * ART, y: (ty + 1) * ART - f.h, sort: ty + 0.99, anim: def.sprite });
      }
    } else {
      const key = A.has(`obj:${def.sprite}:${facing}`) ? `obj:${def.sprite}:${facing}` : `obj:${def.sprite}`;
      const f = A.get(key)!;
      out.push({ key, x: o.x * ART + Math.round((ow * ART - f.w) / 2), y: (o.y + oh) * ART - f.h, sort: o.y + oh - 0.01, anim: def.sprite });
    }
    return out;
  }

  /**
   * A sized amenity (docs/spec/construction.md), piece by piece from its cells: counters and cage windows run
   * a / middle / c along the screen (bartenders and tellers baked into their pieces), restrooms of any size are
   * built from the 2×2 block's slices, and stages, booths and dance floors are per-tile pieces.
   */
  private zoneSprites(o: PlacedObject): Spr[] {
    const def = OBJECTS[o.kind], A = this.atlas.frames, F = FACING[o.rot & 3];
    const out: Spr[] = [];
    const { w: ow, h: oh } = objSize(o);
    const put = (keys: string[], tx: number, ty: number, sort: number, anim?: string) => {
      const key = keys.find((k) => A.has(k));
      if (!key) return;
      const f = A.get(key)!;
      out.push({ key, x: tx * ART, y: (ty + 1) * ART - f.h, sort, anim });
    };
    const cells = objCells(o);
    if (def.sized!.layout === "restroom") {
      const d = dims(o);
      if (d.w === 2 && d.h === 2) {
        const key = A.has(`obj:restroom:${F}`) ? `obj:restroom:${F}` : "obj:restroom:front", f = A.get(key)!;
        out.push({ key, x: o.x * ART + Math.round((ow * ART - f.w) / 2), y: (o.y + oh) * ART - f.h, sort: o.y + oh - 0.01 });
        return out;
      }
      const face = F === "front" ? "door" : "wall", sort = o.y + oh - 0.01;
      const faceTop = (o.y + oh) * ART - 24, top = o.y * ART - 4;
      for (let cx = 0; cx < ow; cx++) {
        const part = cx === 0 ? "l" : cx === ow - 1 ? "r" : "m", x = (o.x + cx) * ART;
        for (let y = faceTop - 2 - 16; y > top + 2 - 16; y -= 16) out.push({ key: `obj:rr:roof:${part}`, x, y: Math.max(top + 2, y), sort });
        out.push({ key: `obj:rr:top:${part}`, x, y: top, sort }, { key: `obj:rr:eave:${part}`, x, y: faceTop - 2, sort }, { key: `obj:rr:${face}:${part}`, x, y: faceTop, sort });
      }
      return out;
    }
    // Counters (bar, kitchen, cage): pieces in screen order along the row.
    const staff = new Set(objStaff(o).map((s) => s.y * 100000 + s.x));
    const run = cells.filter((c) => c.c.k === "counter" || c.c.k === "kitchen" || c.c.k === "window").sort((a, b) => a.x - b.x || a.y - b.y);
    run.forEach((c, i) => {
      const end = i === 0 ? "a" : i === run.length - 1 ? "c" : "", manned = staff.has(c.y * 100000 + c.x);
      const sp = c.c.k === "window" ? "cage" : c.c.k;
      const part = end || (sp === "counter" ? (manned ? "b" : "m") : "b");
      const keys = sp === "kitchen" && F !== "front" ? ["obj:kitchen:top"] : [`obj:${sp}:${F}:${part}`, `obj:${sp}:${F}:b`, `obj:${sp}:${F}:a`, `obj:${sp}:front:${part}`];
      put(keys, c.x, c.y, c.y + 0.99, sp);
    });
    const outdoor = def.place === "outdoor";
    for (const c of cells) {
      const k = c.c.k;
      if (k === "table" || k === "dtable") {
        put([`obj:${k}`], c.x, c.y, c.y + 0.5);
        // Outdoor tables get a striped umbrella.
        if (outdoor) { const f = A.get("obj:umbrella")!; out.push({ key: "obj:umbrella", x: c.x * ART, y: c.y * ART - f.h + 2, sort: c.y + 0.6 }); }
      }
      else if (k === "water") put(["obj:water"], c.x, c.y, c.y - 0.46, "water");
      else if (k === "deck") put(["obj:deck"], c.x, c.y, c.y - 0.46);
      else if (k === "lounger") { put(["obj:deck"], c.x, c.y, c.y - 0.46); put(["obj:lounger"], c.x, c.y, c.y - 0.1); }
      else if (k === "hedge") put(["obj:hedge"], c.x, c.y, c.y + 0.99);
      else if (k === "flowers") put(["obj:flowers"], c.x, c.y, c.y + 0.5);
      else if (k === "path") put(["obj:path"], c.x, c.y, c.y - 0.46);
      else if (k === "bench") { put(["obj:path"], c.x, c.y, c.y - 0.46); put(["obj:bench"], c.x, c.y, c.y - 0.05); }
      else if (k === "stage") {
        put(["obj:stage"], c.x, c.y, c.y - 0.45);
        if (c.dy === 0) put(["obj:stage:curtain"], c.x, c.y, c.y - 0.4);
      } else if (k === "booth") put(["obj:djbooth"], c.x, c.y, c.y + 0.99, "djbooth");
      else if (k === "speaker") put(["obj:speaker"], c.x, c.y, c.y + 0.99, "speaker");
      else if (k === "backdrop") put(["obj:backdrop"], c.x, c.y, c.y + 0.99, "backdrop");
      else if (k === "dance") put(["obj:dance"], c.x, c.y, c.y - 0.45, "dance");
    }
    return out;
  }

  private thumbs = new Map<string, { url: string; w: number; h: number }>();
  /** A build-menu picture of an object (front view), as a data URL with its size in art pixels. */
  thumbnail(kind: string, design?: string): { url: string; w: number; h: number } {
    const tk = design ? `${kind}@${design}` : kind;
    let t = this.thumbs.get(tk);
    if (t) return t;
    if (design && this.game) {
      const d = designById(this.game.state, design);
      if (d && !this.looks.has(lookOf(d))) { this.wantLooks.add(lookOf(d)); this.ensureLooks(true); }
    }
    const sprites = this.objectSprites({ id: 0, kind, x: 0, y: 0, rot: 0, design } as PlacedObject).filter((s) => s.key !== "obj:stool" && !s.key.startsWith("obj:chair") && s.key !== "obj:dance");
    const F = this.atlas.frames;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of sprites) {
      const f = F.get(s.key)!;
      x0 = Math.min(x0, s.x - PAD); y0 = Math.min(y0, s.y - PAD); x1 = Math.max(x1, s.x + f.w + PAD); y1 = Math.max(y1, s.y + f.h + PAD);
    }
    const c = document.createElement("canvas");
    c.width = x1 - x0; c.height = y1 - y0;
    const g = c.getContext("2d")!;
    for (const s of sprites) {
      const f = F.get(s.key)!;
      g.drawImage(this.atlas.canvas, f.x - PAD, f.y - PAD, f.w + 2 * PAD, f.h + 2 * PAD, s.x - PAD - x0, s.y - PAD - y0, f.w + 2 * PAD, f.h + 2 * PAD);
    }
    t = { url: c.toDataURL(), w: c.width, h: c.height };
    this.thumbs.set(tk, t);
    return t;
  }

  /** Draws one frame. alpha = fraction of the next tick elapsed, for smooth movement between ticks. */
  draw(cam: Camera, vw: number, vh: number, dpr: number, alpha: number, opt: DrawOptions = {}) {
    const g = this.game;
    if (!g) return;
    this.ensureLooks();
    const { canvas, ctx } = this;
    const now = performance.now();
    const bw = Math.round(vw * dpr), bh = Math.round(vh * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0b0608";
    ctx.fillRect(0, 0, bw, bh);
    const tp = cam.tilePx * dpr; // device px per tile
    const ox = bw / 2 - cam.cx * tp, oy = bh / 2 - cam.cy * tp; // device px of tile (0,0)
    const s = g.state, { w, h } = s.map;
    const x0 = Math.max(0, Math.floor(-ox / tp)), y0 = Math.max(0, Math.floor(-oy / tp));
    const x1 = Math.min(w - 1, Math.floor((bw - ox) / tp)), y1 = Math.min(h - 1, Math.floor((bh - oy) / tp));
    this.stats = { agentsDrawn: 0, chunksRedrawn: 0 };
    const lod = cam.level; // 0-1 live sprites, 2 baked objects, 3 baked and smoothed, people as dots

    // Static layer.
    const cw = Math.ceil(w / CHUNK);
    ctx.imageSmoothingEnabled = lod >= 3;
    for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++)
      for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
        const c = this.chunk(cy * cw + cx, cx, cy, lod >= 2);
        ctx.drawImage(c, Math.round(ox + cx * CHUNK * tp), Math.round(oy + cy * CHUNK * tp), Math.ceil(CHUNK * tp), Math.ceil(CHUNK * tp));
      }
    ctx.imageSmoothingEnabled = false;

    // Hidden-quality overlay (debug now; earned through research later).
    if (opt.overlay) {
      const ch = opt.overlay;
      ctx.fillStyle = CHANNEL_DEFS[ch].color;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const v = g.fields.get(ch, y * w + x);
        if (v <= 0.05) continue;
        ctx.globalAlpha = Math.min(0.75, v / 8);
        ctx.fillRect(ox + x * tp, oy + y * tp, tp + 0.5, tp + 0.5);
      }
      ctx.globalAlpha = 1;
    }
    if (opt.heat) {
      const val = (o: (typeof s.objects)[number]) => (opt.heat === "revenue" ? o.st.coinIn - o.st.paidOut : o.st.playTicks);
      let max = 0;
      for (const o of s.objects) if (OBJECTS[o.kind].slot || OBJECTS[o.kind].game) max = Math.max(max, val(o));
      if (max > 0) for (const o of s.objects) {
        if (!OBJECTS[o.kind].slot && !OBJECTS[o.kind].game) continue;
        const v = val(o) / max, { w: ow, h: oh } = objSize(o);
        ctx.fillStyle = v < 0 ? "#3f8fff" : `hsl(${Math.round(60 - 60 * v)}, 100%, 50%)`;
        ctx.globalAlpha = 0.25 + 0.5 * Math.min(1, Math.abs(v));
        ctx.fillRect(ox + (o.x - 0.5) * tp, oy + (o.y - 0.5) * tp, (ow + 1) * tp, (oh + 1) * tp);
      }
      ctx.globalAlpha = 1;
    }

    const atlas = this.atlas, F = atlas.frames;
    const scale = tp / ART;
    /** Blit a sprite by the top-left of its unpadded rect, in device px. */
    const blit = (key: string, px: number, py: number) => {
      const f = F.get(key);
      if (f) ctx.drawImage(atlas.canvas, f.x - PAD, f.y - PAD, f.w + 2 * PAD, f.h + 2 * PAD, Math.round(px - PAD * scale), Math.round(py - PAD * scale), (f.w + 2 * PAD) * scale, (f.h + 2 * PAD) * scale);
    };

    // Litter on the floor (under everything that stands).
    if (lod <= 2) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = s.dirt[y * w + x];
        if (d) blit(d >= 10 ? "obj:vomit" : d >= 3 ? "obj:spill" : "obj:litter", ox + x * tp, oy + y * tp);
      }
    }

    // Dynamic layer: objects and people, y-sorted, on-screen only.
    type Item = { y: number; draw: () => void };
    const items: Item[] = [];
    const tick = s.tick;
    const playing = new Map<number, Agent>();
    for (const a of s.agents) if (a.act === "play" && a.seat >= 0) playing.set(a.target, a);
    if (lod < 2) for (const o of s.objects) {
      const { w: ow, h: oh } = objSize(o);
      if (o.x + ow < x0 - 1 || o.x > x1 + 1 || o.y + oh < y0 - 1 || o.y > y1 + 2) continue;
      const def = OBJECTS[o.kind];
      for (const sp of this.objectSprites(o)) {
        const key = this.frameKey(sp.key, sp.anim, now, o.id);
        const px = ox + (sp.x / ART) * tp, py = oy + (sp.y / ART) * tp;
        if (def.cat === "table") {
          // The wheel spins while a round is on; it stops for a while after each spin.
          const k2 = sp.key === "obj:wheel" ? (o.tbl && tick - o.tbl.at > 60 ? key : "obj:wheel") : key;
          items.push({ y: sp.sort, draw: () => blit(k2, px, py) });
          continue;
        }
        const cabK = this.cabinet(o);
        if (!cabK || sp.key === "obj:stool") { items.push({ y: sp.sort, draw: () => blit(key, px, py) }); continue; }
        const dsg = cabK.startsWith("L") ? designById(s, o.design!) : undefined;
        const facing = FACING[o.rot & 3], f = F.get(sp.key)!;
        const player = playing.get(o.id);
        items.push({
          y: sp.sort,
          draw: () => {
            blit(o.broken ? sp.key : key, px, py);
            const age = tick - o.last.tick;
            if (o.broken) {
              if (facing === "front") { ctx.fillStyle = "#0e0a14"; ctx.fillRect(px + 3 * scale, py + 6 * scale, 10 * scale, 5 * scale); }
              blit("obj:broken", px + 4.5 * scale, py - (9 + (Math.floor(now / 400) & 1)) * scale);
              return;
            }
            // Spinning reels, visible from the front only; they stop left to right.
            if (facing === "front" && player && player.timer > 0) {
              const strip = F.get(`reel:${cabK}`)!;
              const R = dsg ? { ...CAB_REELS[dsg.cab.type as CabShape], y: CAB_REELS[dsg.cab.type as CabShape].y + topperHeight(dsg.cab.topper, dsg.cab.type === "giant") } : SLOT_REELS;
              for (let k = 0; k < 3 && strip; k++) {
                if (player.timer <= k * 2) continue;
                const off = Math.floor(now / 45 + k * 5 + o.id) % 12;
                ctx.drawImage(atlas.canvas, strip.x, strip.y + off, R.w, R.h, Math.round(px + R.x[k] * scale), Math.round(py + R.y * scale), R.w * scale, R.h * scale);
              }
            }
            // A free spins feature (M8): the cabinet pulses in its light color and the topper strobes.
            if (dsg && o.last.tick >= 0 && o.last.win === 3 && age < 200) {
              ctx.globalCompositeOperation = "lighter";
              ctx.globalAlpha = (Math.floor(now / 110) & 1) ? 0.45 : 0.15;
              ctx.fillStyle = LIGHT_COLORS[dsg.show.light]?.c[0] ?? "#ffd23f";
              ctx.fillRect(px + 2 * scale, py, (f.w - 4) * scale, f.h * scale);
              ctx.globalAlpha = 1;
              ctx.globalCompositeOperation = "source-over";
            }
            // Wins light the topper; a jackpot floods the cabinet with cycling color.
            if (o.last.tick >= 0 && o.last.win === 2 && age < 160) {
              ctx.globalCompositeOperation = "lighter";
              ctx.globalAlpha = (Math.floor(now / 90) & 1) ? 0.5 : 0.22;
              ctx.fillStyle = ["#ffd23f", "#ff4fa0", "#3ff2ff"][Math.floor(now / 180) % 3];
              ctx.fillRect(px + 2 * scale, py, (f.w - 4) * scale, f.h * scale);
              ctx.globalAlpha = 1;
              ctx.globalCompositeOperation = "source-over";
            } else if (o.last.tick >= 0 && o.last.win === 1 && age < 30 && (Math.floor(now / 120) & 1)) {
              ctx.globalCompositeOperation = "lighter";
              ctx.fillStyle = "rgba(255,240,170,0.6)";
              ctx.fillRect(px + 3 * scale, py, 10 * scale, 4 * scale);
              ctx.globalCompositeOperation = "source-over";
            }
          },
        });
      }
    }

    // Tables (M7, docs/spec/tables.md): what the last round showed. Chips on each player's spot (a stack for a
    // winner), cards for blackjack, baccarat and poker, the dice after a roll, the keno and bingo boards lit.
    if (lod < 2) {
      const seatedAt = new Map<number, Agent[]>();
      for (const a of s.agents) if (a.act === "play" && a.seat >= 0 && a.x === a.nx && a.y === a.ny && g.objById.get(a.target)?.kind && OBJECTS[g.objById.get(a.target)!.kind].game) {
        const l = seatedAt.get(a.target);
        if (l) l.push(a); else seatedAt.set(a.target, [a]);
      }
      for (const o of s.objects) {
        const def = OBJECTS[o.kind];
        if (def.cat !== "table" || !o.tbl) continue;
        const { w: ow, h: oh } = objSize(o);
        if (o.x + ow < x0 - 1 || o.x > x1 + 1 || o.y + oh < y0 - 1 || o.y > y1 + 2) continue;
        const tb = o.tbl, age = tick - tb.at, seats = objSeats(o), fam = def.game!;
        const at = (fx: number, fy: number) => [ox + fx * tp, oy + fy * tp] as const;
        const cx = o.x + ow / 2, cy = o.y + oh / 2;
        const players = seatedAt.get(o.id) ?? [];
        // Boards: lit numbers on the face (front view only).
        if (fam === "keno" || fam === "bingo" || fam === "sports") {
          if ((o.rot & 3) !== 0 || fam === "sports") continue;
          const c = BOARD_CELLS[fam], f = F.get(`obj:${def.sprite}:front`);
          if (!f) continue;
          const bx = o.x * ART + Math.round((ow * ART - f.w) / 2), by = (o.y + oh) * ART - f.h;
          const lit: number[] = fam === "keno" ? tb.out.slice(0, Math.min(20, Math.floor(age / 4) + 1)) : [];
          if (fam === "bingo") { const n = Math.min(40, Math.floor(age / 12) + 3); for (let k = 0; k < n; k++) lit.push(((tb.at * 7 + k * 37 + o.id) % 75) + 1); }
          items.push({
            y: o.y + oh - 0.005,
            draw: () => {
              ctx.fillStyle = fam === "keno" ? "#ffd23f" : "#3ff2ff";
              for (const n of lit) {
                const col = (n - 1) % c.cols, row = Math.floor((n - 1) / c.cols);
                if (row >= c.rows) continue;
                ctx.fillRect(ox + ((bx + c.x0 + col * c.dx) / ART) * tp, oy + ((by + c.y0 + row * c.dy) / ART) * tp, 3 * scale, scale);
              }
            },
          });
          continue;
        }
        const top = o.y + oh - 0.08;
        // Each player's spot: a chip while they play, a stack for a win just paid.
        for (const a of players) {
          const st = seats[a.seat];
          if (!st) continue;
          const v = FRONT_VEC[st.f], sx = st.x + 0.5 + v[0] * 0.62, sy = st.y + 0.5 + v[1] * 0.62;
          const won = age < 50 && tb.seats[a.seat] === 2;
          const [px, py] = at(sx, sy);
          items.push({ y: top, draw: () => blit(won ? "obj:chips" : "obj:chip", px - 1.5 * scale, py - 2 * scale) });
          if (fam === "blackjack" || fam === "poker") {
            const k = (a.id + tb.at) & 3;
            items.push({ y: top + 0.001, draw: () => { blit(k & 1 ? "obj:card:r" : "obj:card:k", px + (fam === "poker" ? -3 : 2) * scale, py - 3 * scale); blit(k & 2 ? "obj:card:k" : "obj:card:r", px + (fam === "poker" ? -1 : 4) * scale, py - 2.5 * scale); } });
          }
        }
        if (!players.length) continue;
        // The dealer's side: blackjack's hand, baccarat's two hands, poker's board cards, the dice.
        const dv = FRONT_VEC[seats.find((q) => q.kind === "dealer")?.f ?? 0];
        const dx0 = cx - dv[0] * (ow / 2 - 0.45), dy0 = cy - dv[1] * (oh / 2 - 0.45);
        const [qx, qy] = at(dx0, dy0);
        if (fam === "blackjack") items.push({ y: top, draw: () => { blit("obj:card:r", qx - 3 * scale, qy - 2 * scale); blit(age < 40 ? "obj:card:k" : "obj:cardback", qx + scale, qy - 2 * scale); } });
        else if (fam === "baccarat") {
          const coup = tb.out[0] ?? 0;
          items.push({ y: top, draw: () => {
            const [ax, ay] = at(cx, cy);
            blit("obj:card:r", ax - 8 * scale, ay - 2 * scale); blit("obj:card:k", ax - 5 * scale, ay - 2 * scale);
            blit("obj:card:k", ax + 2 * scale, ay - 2 * scale); blit("obj:card:r", ax + 5 * scale, ay - 2 * scale);
            if (age < 50 && coup < 2) blit("obj:chips", ax + (coup === 0 ? 6 : -7) * scale, ay + 3 * scale);
          } });
        } else if (fam === "poker") {
          items.push({ y: top, draw: () => { const [ax, ay] = at(cx, cy); for (let k = 0; k < 5; k++) blit(k < 3 || age > 20 ? (k & 1 ? "obj:card:k" : "obj:card:r") : "obj:cardback", ax + (k * 4 - 10) * scale, ay - 3 * scale); if (age > 50) blit("obj:chips", ax - 1.5 * scale, ay + 2 * scale); } });
        } else if (fam === "craps" && age < 90) {
          const oc = CRAPS_OUTCOMES[tb.out[0] ?? 0], tumble = age < 12;
          const d1 = tumble ? 1 + ((now >> 6) % 6) : oc.dice[0], d2 = tumble ? 1 + ((now >> 6) + 3) % 6 : oc.dice[1];
          const [ax, ay] = at(cx + dv[0] * (ow / 2 - 1), cy + dv[1] * (oh / 2 - 0.8));
          items.push({ y: top, draw: () => { blit(`obj:die${d1}`, ax - 6 * scale, ay - 3 * scale); blit(`obj:die${d2}`, ax + scale, ay - 2 * scale); } });
        }
        // Poker and bingo: a sparkle over the winner of the last hand.
        if (TABLE_GAMES[fam].pool && age < 60) {
          const st = seats[tb.out[0] ?? -1];
          if (st) { const [ax, ay] = at(st.x + 0.2, st.y - 0.9); items.push({ y: st.y + 0.5, draw: () => blit(Math.floor(now / 90) & 1 ? "obj:spark~1" : "obj:spark", ax, ay) }); }
        }
      }
    }

    // Incidents in progress, by the guests in them (docs/spec/incidents.md): marks over heads, poses, the scuffle cloud.
    const incBy = new Map<number, string>(), incStarter = new Set<number>();
    for (const inc of s.incidents) {
      if (inc.kind === "escort") continue;
      incBy.set(inc.actor, inc.kind);
      incStarter.add(inc.actor);
      if (inc.other >= 0) incBy.set(inc.other, inc.kind === "recruit" || inc.kind === "flirt" ? "" : inc.kind);
    }
    const anim = (key: string) => this.frameKey(key, key.slice(4), now, 0);
    // Enforcement in progress (docs/spec/cheats.md): who is doing what to whom, and how far along (0-1).
    const acting = new Map<number, { job: EnfJob; p: number; other: Agent | undefined; staff: boolean }>();
    for (const job of s.enf.jobs) {
      if (job.stage !== 3) continue;
      const p = Math.min(1, (tick + alpha - job.at) / (ENF[job.action].secs * TICKS_PER_SECOND));
      const st = s.agents.find((a) => a.id === job.staff), gt = s.agents.find((a) => a.id === job.guest);
      if (st) acting.set(st.id, { job, p, other: gt, staff: true });
      if (gt) acting.set(gt.id, { job, p, other: st, staff: false });
    }
    // People. set = look set (guest type or staff role), fx/fy = tile position, dir/step = pose frame.
    const WALK = [1, 0, 2, 0];
    // Three punches over a beating.
    const hitNow = (p: number) => (p > 0.1 && p < 0.22) || (p > 0.4 && p < 0.52) || (p > 0.7 && p < 0.82);
    const HAND: Record<string, [number, number]> = { down: [6, 8], up: [-1, 8], side: [5, 8], left: [0, 8] };
    const person = (a: Agent | null, set: string, sex: number, look: number, fx: number, fy: number, dir: string, pose: string) => {
      if (fx < x0 - 1 || fx > x1 + 1 || fy < y0 - 1 || fy > y1 + 2) return;
      const looks = PEOPLE[set] ?? PEOPLE.local;
      set = PEOPLE[set] ? set : "local";
      const v = look % looks.variants;
      const sx = ox + (fx + 0.5) * tp, sy = oy + (fy + 0.5) * tp;
      this.stats.agentsDrawn++;
      if (lod >= 3) {
        const d = Math.max(2, tp * 0.45), color = atlas.lookColor[set][sex][v];
        items.push({ y: fy, draw: () => { ctx.fillStyle = color; ctx.fillRect(Math.round(sx - d / 2), Math.round(sy - d), Math.ceil(d), Math.ceil(d)); } });
        return;
      }
      if (pose === "bag") {
        items.push({ y: fy + 0.02, draw: () => blit("obj:bag", sx - 6 * scale, sy + 1 * scale) });
        return;
      }
      if (pose === "lie") {
        // Passed out: the standing figure laid on its side, head to the left.
        const f = F.get(`p:${set}:${sex}:${v}:down0`);
        items.push({
          y: fy + 0.02,
          draw: () => {
            if (!f) return;
            ctx.save();
            ctx.translate(Math.round(sx), Math.round(sy + 2 * scale));
            ctx.rotate(-Math.PI / 2);
            ctx.drawImage(atlas.canvas, f.x - PAD, f.y - PAD, f.w + 2 * PAD, f.h + 2 * PAD, (-f.w / 2 - PAD) * scale, (-f.h / 2 - PAD) * scale, (f.w + 2 * PAD) * scale, (f.h + 2 * PAD) * scale);
            ctx.restore();
            if (lod < 2) blit("obj:inc:zzz", sx + 4 * scale, sy - (9 + (Math.floor(now / 500) & 1)) * scale);
          },
        });
        return;
      }
      // Swimming: the standing figure, sunk to the chest in water.
      const swim = pose === "swim";
      if (swim) pose = String(Math.floor(now / 500 + (a?.id ?? 0)) & 1);
      const seated = pose === "s";
      const key = `p:${set}:${sex}:${v}:${dir}${pose}`;
      // Beaten guests walk doubled over.
      const bent = a?.g?.hurt ? SIT_DROP : 0;
      const px = sx - 4 * scale, py = sy + (5 - 15 + (seated ? SIT_DROP : 0) + bent) * scale;
      items.push({
        y: fy + 0.02,
        draw: () => {
          // Marked guests: a red dashed ring at their feet.
          if (a?.g && a.g.mark & 1 && lod < 3) {
            ctx.save();
            ctx.strokeStyle = "#ff4d5e";
            ctx.lineWidth = Math.max(1, scale);
            ctx.setLineDash([2 * scale, 2 * scale]);
            ctx.beginPath();
            ctx.ellipse(sx, sy + 4 * scale, Math.max(4, tp * 0.36), Math.max(2, tp * 0.16), 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          if (!seated && !swim) blit("obj:shadow", px, sy + 3 * scale);
          blit(key, px, py);
          if (swim) { ctx.fillStyle = "rgba(28,94,140,0.92)"; ctx.fillRect(Math.round(px - 2 * scale), Math.round(py + 8 * scale), Math.ceil(12 * scale), Math.ceil(8 * scale)); ctx.fillStyle = "rgba(154,216,242,0.8)"; ctx.fillRect(Math.round(px - 2 * scale), Math.round(py + 8 * scale), Math.ceil(12 * scale), Math.max(1, Math.round(scale))); }
          if (lod >= 2 || !a) return;
          const face = dir === "left" ? "left" : dir === "up" ? "" : dir === "down" ? "down" : "side";
          const intox = a.g?.intox ?? 0;
          if (face && intox >= 0.25) blit(`obj:flush${intox >= 0.5 ? 2 : 1}:${face}`, px, py);
          const inc = incBy.get(a.id);
          if (inc) {
            const over = (k: string, dx: number, dy: number) => blit(anim(k), px + dx * scale, py - dy * scale);
            if (inc === "loud") over("obj:inc:loud", 5, 6);
            else if (inc === "argument" || inc === "yell") over("obj:inc:angry", 2.5, 7 + (Math.floor(now / 300) & 1));
            else if (inc === "underage") over("obj:inc:coin", 3, 5 + (Math.floor(now / 300) & 1));
            else if (inc === "breakdown" && face) blit("obj:inc:sob", px, py + (Math.floor(now / 400) & 1) * scale);
            else if (inc === "vomit") blit("obj:inc:sick", px, py);
            else if (inc === "cheer" || inc === "round") over("obj:inc:cheer", 1.5, 7);
            else if (inc === "flirt" || inc === "hookup" || inc === "solicit") over("obj:inc:heart", 2.5, 5 + (Math.floor(now / 350) & 1));
            else if (inc === "drugs") over("obj:inc:high", 2, 6 + (Math.floor(now / 250) & 1));
            else if (inc === "recruit") over("obj:glass", 2.5, 5);
            else if (inc === "fight") {
              over("obj:inc:angry", 2.5, 7 + (Math.floor(now / 200 + a.id) & 1));
              // Dust kicked up at their feet (drawn once, by the one who started it, between the two).
              if (incStarter.has(a.id)) blit(anim("obj:inc:fight"), px + 2 * scale, py + 11 * scale);
            }
          }
          const [hx, hy] = HAND[dir];
          const at = (k: string, dx = 0, dy = 0) => blit(k, px + (hx + dx) * scale, py + (hy + dy) * scale);
          if (a.g && a.g.drink > 0) at(a.g.dStr > 0 ? "obj:glass" : "obj:soda", 0, 1);
          else if (a.role === "server") at(a.act === "serve" ? "obj:tray:full" : "obj:tray", dir === "left" ? -3 : dir === "up" ? -1 : 0, a.act === "serve" ? -6 : -4);
          else if (a.role === "janitor") at(a.act === "clean" && Math.floor(now / 120) & 1 ? "obj:mop~1" : "obj:mop", dir === "left" ? -2 : 1, -1);
          else if (a.role === "tech") at("obj:toolbox", 0, 3);
          else if (a.role === "guard") at("obj:radio", dir === "left" ? -1 : 0, 1);
          if (a.bag) blit("obj:bag:carry", px + (dir === "left" ? 5 : -1) * scale, py + 4 * scale);
          const act = acting.get(a.id);
          if (act?.staff && act.job.action === "vanish" && act.p > 0.1 && act.p < 0.35) {
            at("obj:gun", dir === "left" ? -3 : 0, -2);
            if (act.p > 0.2 && act.p < 0.27) at("obj:flash", dir === "left" ? -5 : 3, -3);
          }
          // The scuffle, between the two of them.
          if (act?.staff && act.job.action === "beat" && hitNow(act.p) && lod < 2 && act.other)
            blit(anim("obj:inc:fight"), px + 2 * scale + ((act.other.x - a.x) * tp) / 2, py + 11 * scale + ((act.other.y - a.y) * tp) / 2);
        },
      });
      if (a?.role === "tech" && a.act === "repair" && lod < 2) {
        const o = g.objById.get(a.target);
        if (o) items.push({ y: o.y + 1, draw: () => blit(Math.floor(now / 90) & 1 ? "obj:spark~1" : "obj:spark", ox + (o.x + 0.3) * tp, oy + (o.y - 0.1) * tp) });
      }
    };
    const FACE = ["up", "side", "down", "left"];
    const so0 = (a: Agent) => (a.target >= 0 ? g.objById.get(a.target) : undefined);
    // People who come with an amenity: cooks behind the kitchen, performers on stage during a show, the DJ.
    if (lod < 3) for (const o of s.objects) {
      const L = OBJECTS[o.kind].sized?.layout;
      if (L !== "restaurant" && L !== "show" && L !== "club" && L !== "pool") continue;
      const { w: ow, h: oh } = objSize(o);
      if (o.x + ow < x0 - 1 || o.x > x1 + 1 || o.y + oh < y0 - 1 || o.y > y1 + 2) continue;
      const on = L !== "show" || showPhase(o, tick).phase === "on";
      if (!on) continue;
      const face = FACE[(o.rot + 2) & 3];
      objStaff(o).forEach((st, k) => {
        const look = o.id * 7 + k * 13;
        const set = L === "restaurant" ? "server" : L === "pool" ? "guard" : "party";
        const beat = L === "restaurant" || L === "pool" ? "0" : String(WALK[Math.floor(now / (L === "club" ? 200 : 320) + k) & 3]);
        // Drawn just behind the counter or booth they work at, so it covers their lower half.
        person(null, set, L === "club" ? 0 : (look >> 1) & 1, look, st.x, st.y - (L === "show" || L === "pool" ? 0 : 0.3), face, beat);
      });
    }
    for (const a of s.agents) {
      if (a.hidden) continue;
      const moving = a.nx !== a.x || a.ny !== a.y;
      const p = moving ? Math.min(1, (a.t + alpha) / a.steps) : 0;
      let fx = a.x + (a.nx - a.x) * p, fy = a.y + (a.ny - a.y) * p;
      // Drink shows in the walk: a sideways stagger that grows with intoxication.
      const intox = a.g?.intox ?? 0;
      if (moving && intox > 0.2) {
        const sway = Math.min(0.35, (intox - 0.2) * 0.5) * Math.sin((tick + alpha) * 0.25 + a.id);
        if (a.nx !== a.x) fy += sway; else fx += sway;
      }
      const set = a.role === "guest" ? (a.g!.vip ? "whale" : a.g!.minor ? "kid" : a.g!.type) : a.role;
      const sex = a.g ? a.g.sex & 1 : (a.look >> 2) & 1;
      let dir: string, pose: string;
      const atSeat = !moving && a.seat >= 0 && (a.act === "play" || a.act === "drink" || a.act === "cage" || a.act === "dine" || a.act === "show" || a.act === "dance" || a.act === "swim" || a.act === "rest" || a.act === "deal");
      const swimming = a.act === "swim" && atSeat && !!so0(a) && objSeats(so0(a)!)[a.seat]?.kind === "swim";
      const so = atSeat ? g.objById.get(a.target) : undefined;
      const seatKind = so ? objSeats(so)[a.seat]?.kind : undefined;
      if (so && (OBJECTS[so.kind].sized || OBJECTS[so.kind].cat === "table")) dir = SEAT_DIR[objSeats(so)[a.seat]?.f ?? 0];
      else if (atSeat) dir = FACE[(so?.rot ?? 0) & 3];
      else dir = a.nx > a.x ? "side" : a.nx < a.x ? "left" : a.ny < a.y ? "up" : "down";
      // Onlookers (M7) face the table they're watching.
      if (a.act === "look" && !moving) {
        const t = g.objById.get(a.target);
        if (t) { const { w: tw, h: th } = objSize(t), ddx = t.x + tw / 2 - (a.x + 0.5), ddy = t.y + th / 2 - (a.y + 0.5); dir = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? "side" : "left") : ddy < 0 ? "up" : "down"; }
      }
      if (atSeat && a.act !== "cage" && a.act !== "dance" && !swimming && seatKind !== "stand" && seatKind !== "dealer") pose = "s";
      else pose = String(moving ? WALK[Math.min(1, Math.floor(2 * p)) + 2 * ((a.x + a.y) & 1)] : 0);
      // Dancing: stepping in place, turning now and then.
      if (a.act === "dance" && !moving) {
        pose = String(WALK[Math.floor(now / 180 + a.id) & 3]);
        dir = ["down", "side", "down", "left"][Math.floor(now / 1400 + a.id * 0.37) & 3];
      }
      if (a.act === "out") pose = "lie";
      // Fighting: squared up and shoving back and forth.
      if (a.act === "fight") { fx += 0.12 * Math.sin(now / 70 + a.id); pose = String(1 + (Math.floor(now / 140 + a.id) & 1)); }
      // Enforcement: face each other; the enforcer lunges on each punch and the guest reels back; a disappearance
      // ends lying down, then in a bag.
      const act = acting.get(a.id);
      if (act?.other) {
        const o = act.other, dx = o.x - a.x, dy = o.y - a.y;
        dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "side" : dx < 0 ? "left" : dir) : dy < 0 ? "up" : "down";
        if (act.job.action === "beat" && hitNow(act.p)) {
          const k = act.staff ? 0.18 : -0.14, n = Math.max(1, Math.abs(dx) + Math.abs(dy));
          fx += (k * dx) / n; fy += (k * dy) / n;
          pose = act.staff ? "1" : "2";
        }
        if (!act.staff && act.job.action === "vanish") pose = act.p >= 0.6 ? "bag" : act.p >= 0.3 ? "lie" : pose;
      }
      person(a, set, sex, a.look, fx, fy, dir, swimming ? "swim" : pose);
    }
    // Pedestrians on the sidewalk.
    for (const pd of s.peds) {
      const s0 = pedSpot(g, pd, 0), s1 = pedSpot(g, pd, 1);
      if (!s0) continue;
      const hx = s1 ? s0.x - s1.x : 0, hy = s1 ? s0.y - s1.y : 0;
      const dir = Math.abs(hx) >= Math.abs(hy) ? (hx >= 0 ? "side" : "left") : hy < 0 ? "up" : "down";
      for (let k = 0; k < pd.n; k++) {
        const sp = pedSpot(g, { ...pd, s: pd.s + pd.dir * pd.spd * alpha }, k)!;
        const look = pd.look + k * 7;
        person(null, pd.type, (look >> 1) & 1, look, sp.x, sp.y, dir, String(WALK[Math.floor((tick + k * 3) / 5) & 3]));
      }
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    // Selection and build ghost.
    ctx.lineWidth = Math.max(1, dpr);
    if (opt.ghost) {
      ctx.fillStyle = opt.ghost.ok ? "rgba(125,255,176,0.3)" : "rgba(229,72,77,0.38)";
      for (const i of opt.ghost.tiles) ctx.fillRect(ox + (i % w) * tp, oy + Math.floor(i / w) * tp, tp, tp);
      ctx.strokeStyle = opt.ghost.ok ? "rgba(125,255,176,0.9)" : "rgba(229,72,77,0.9)";
      for (const i of opt.ghost.seats ?? []) ctx.strokeRect(ox + (i % w) * tp + 2, oy + Math.floor(i / w) * tp + 2, tp - 4, tp - 4);
    }
    if (opt.selectedTile !== undefined && opt.selectedTile >= 0) {
      const i = opt.selectedTile;
      ctx.strokeStyle = "#f2d27a";
      ctx.strokeRect(ox + (i % w) * tp + 1, oy + Math.floor(i / w) * tp + 1, tp - 2, tp - 2);
    }
    if (opt.selectedAgent !== undefined) {
      const a = s.agents.find((a) => a.id === opt.selectedAgent);
      if (a && !a.hidden) {
        const p = a.nx !== a.x || a.ny !== a.y ? Math.min(1, (a.t + alpha) / a.steps) : 0;
        const sx = ox + (a.x + (a.nx - a.x) * p + 0.5) * tp, sy = oy + (a.y + (a.ny - a.y) * p + 0.5) * tp;
        ctx.strokeStyle = "#f2d27a";
        ctx.beginPath();
        ctx.ellipse(sx, sy + 4 * scale, Math.max(4, tp * 0.35), Math.max(2, tp * 0.15), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
