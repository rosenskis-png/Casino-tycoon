// Canvas 2D world renderer. Reads sim state, never writes it (docs/spec/art.md). Terrain, wall shading, contact
// shadows and light pools are baked into cached chunks and redrawn only when tiles change; at Wide and
// Overview the object sprites are baked too. Objects and people draw per frame, on-screen only.
import { T } from "../data/terrain";
import { OBJECTS } from "../data/objects";
import { CHANNEL_DEFS, type Channel } from "../data/fields";
import { ANIMS, LIGHTS, PEOPLE, SIT_DROP, SLOT_REELS } from "../data/art";
import { objSeats, objSize, pedSpot, type Agent, type Game, type PlacedObject, type SimEvent } from "../sim";
import { buildAtlas, PAD, type Atlas } from "./atlas";
import type { Camera } from "./camera";

const ART = 16; // art pixels per tile
const CHUNK = 16; // tiles per chunk side
const REACH = 4; // tiles a change can affect around it (light pools, tall sprites)
const FACING = ["front", "left", "back", "right"] as const;
const FRONT_VEC = [[0, 1], [-1, 0], [0, -1], [1, 0]];
/** Sprites whose contact shadow is a small ellipse at the base rather than the footprint. */
const BASE_SHADOW = new Set(["plant", "neon", "sign"]);

export interface Ghost { tiles: number[]; seats?: number[]; ok: boolean }
export interface DrawOptions {
  overlay?: Channel | null;
  ghost?: Ghost | null;
  selectedTile?: number;
  selectedAgent?: number;
}
export interface DrawStats { agentsDrawn: number; chunksRedrawn: number }

/** One object sprite placed in world art pixels (top-left of the unpadded sprite). */
interface Spr { key: string; x: number; y: number; sort: number; anim?: string }

export class Renderer {
  readonly atlas: Atlas;
  private ctx: CanvasRenderingContext2D;
  // Two chunk caches: terrain + shading only (Close/Default, objects live) and with objects baked (Wide/Overview).
  private chunks = new Map<number, HTMLCanvasElement>();
  private dirty = new Set<number>();
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

  setGame(g: Game) {
    this.unsub?.();
    this.game = g;
    this.chunks.clear();
    this.dirty.clear();
    this.farChunks.clear();
    this.farDirty.clear();
    this.unsub = g.bus.on((e: SimEvent) => { if (e.type === "tilesChanged") this.invalidate(e.tiles); });
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
      case T.FLOOR: return m.outdoor[i] ? ((x * 7 + y * 13) % 5 ? "tile:grass" : "tile:grass2") : (x + y) & 1 ? "tile:carpet2" : "tile:carpet";
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
    // Contact shadows under objects.
    const near = this.objectsIn(X0 - 2, Y0 - 2, X0 + CHUNK + 1, Y0 + CHUNK + 1);
    g.fillStyle = "rgba(12,4,8,0.34)";
    for (const o of near) {
      const def = OBJECTS[o.kind], { w: ow, h: oh } = objSize(o);
      const px = (o.x - X0) * ART, py = (o.y - Y0) * ART;
      if (BASE_SHADOW.has(def.sprite)) {
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
    for (const st of objSeats(o)) if (st.kind === "stool") out.push({ key: "obj:stool", x: st.x * ART, y: st.y * ART, sort: st.y - 0.05 });
    if (def.slot) {
      const key = `slot:${def.slot}:${facing}`, f = A.get(key)!;
      out.push({ key, x: o.x * ART, y: (o.y + 1) * ART - f.h, sort: o.y + 0.99, anim: "slot" });
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

  private thumbs = new Map<string, { url: string; w: number; h: number }>();
  /** A build-menu picture of an object (front view), as a data URL with its size in art pixels. */
  thumbnail(kind: string): { url: string; w: number; h: number } {
    let t = this.thumbs.get(kind);
    if (t) return t;
    const sprites = this.objectSprites({ id: 0, kind, x: 0, y: 0, rot: 0 } as PlacedObject).filter((s) => s.key !== "obj:stool");
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
    this.thumbs.set(kind, t);
    return t;
  }

  /** Draws one frame. alpha = fraction of the next tick elapsed, for smooth movement between ticks. */
  draw(cam: Camera, vw: number, vh: number, dpr: number, alpha: number, opt: DrawOptions = {}) {
    const g = this.game;
    if (!g) return;
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
        if (d) blit(d >= 3 ? "obj:spill" : "obj:litter", ox + x * tp, oy + y * tp);
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
        if (!def.slot || sp.key === "obj:stool") { items.push({ y: sp.sort, draw: () => blit(key, px, py) }); continue; }
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
              const strip = F.get(`reel:${def.slot}`)!, R = SLOT_REELS;
              for (let k = 0; k < 3; k++) {
                if (player.timer <= k * 2) continue;
                const off = Math.floor(now / 45 + k * 5 + o.id) % 12;
                ctx.drawImage(atlas.canvas, strip.x, strip.y + off, R.w, R.h, Math.round(px + R.x[k] * scale), Math.round(py + R.y * scale), R.w * scale, R.h * scale);
              }
            }
            // Wins light the topper; a jackpot floods the cabinet with cycling color.
            if (o.last.tick >= 0 && o.last.win === 2 && age < 160) {
              ctx.globalCompositeOperation = "lighter";
              ctx.globalAlpha = (Math.floor(now / 90) & 1) ? 0.5 : 0.22;
              ctx.fillStyle = ["#ffd23f", "#ff4fa0", "#3ff2ff"][Math.floor(now / 180) % 3];
              ctx.fillRect(px + 2 * scale, py, 12 * scale, f.h * scale);
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

    // People. set = look set (guest type or staff role), fx/fy = tile position, dir/step = pose frame.
    const WALK = [1, 0, 2, 0];
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
      const seated = pose === "s";
      const key = `p:${set}:${sex}:${v}:${dir}${pose}`;
      const px = sx - 4 * scale, py = sy + (5 - 15 + (seated ? SIT_DROP : 0)) * scale;
      items.push({
        y: fy + 0.02,
        draw: () => {
          if (!seated) blit("obj:shadow", px, sy + 3 * scale);
          blit(key, px, py);
          if (lod >= 2 || !a) return;
          const face = dir === "left" ? "left" : dir === "up" ? "" : dir === "down" ? "down" : "side";
          const intox = a.g?.intox ?? 0;
          if (face && intox >= 0.25) blit(`obj:flush${intox >= 0.5 ? 2 : 1}:${face}`, px, py);
          const [hx, hy] = HAND[dir];
          const at = (k: string, dx = 0, dy = 0) => blit(k, px + (hx + dx) * scale, py + (hy + dy) * scale);
          if (a.g && a.g.drink > 0) at(a.g.dStr > 0 ? "obj:glass" : "obj:soda", 0, 1);
          else if (a.role === "server") at(a.act === "serve" ? "obj:tray:full" : "obj:tray", dir === "left" ? -3 : dir === "up" ? -1 : 0, a.act === "serve" ? -6 : -4);
          else if (a.role === "janitor") at(a.act === "clean" && Math.floor(now / 220) & 1 ? "obj:mop~1" : "obj:mop", dir === "left" ? -2 : 1, -1);
          else if (a.role === "tech") at("obj:toolbox", 0, 3);
        },
      });
      if (a?.role === "tech" && a.act === "repair" && lod < 2) {
        const o = g.objById.get(a.target);
        if (o) items.push({ y: o.y + 1, draw: () => blit(Math.floor(now / 90) & 1 ? "obj:spark~1" : "obj:spark", ox + (o.x + 0.3) * tp, oy + (o.y - 0.1) * tp) });
      }
    };
    const FACE = ["up", "side", "down", "left"];
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
      const set = a.role === "guest" ? a.g!.type : a.role;
      const sex = a.g ? a.g.sex & 1 : (a.look >> 2) & 1;
      let dir: string, pose: string;
      const seated = !moving && a.seat >= 0 && (a.act === "play" || a.act === "drink" || a.act === "cage");
      if (seated) dir = FACE[(g.objById.get(a.target)?.rot ?? 0) & 3];
      else dir = a.nx > a.x ? "side" : a.nx < a.x ? "left" : a.ny < a.y ? "up" : "down";
      if (seated && a.act !== "cage") pose = "s";
      else pose = String(moving ? WALK[Math.min(1, Math.floor(2 * p)) + 2 * ((a.x + a.y) & 1)] : 0);
      person(a, set, sex, a.look, fx, fy, dir, pose);
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
