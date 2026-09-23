// Canvas 2D world renderer. Reads sim state, never writes it. Terrain is drawn once into cached chunks and
// redrawn only when tiles change; objects and people draw per frame, on-screen only, with level of detail.
import { T } from "../data/terrain";
import { OBJECTS } from "../data/objects";
import { CHANNEL_DEFS, type Channel } from "../data/fields";
import { OBJECT_MAP_COLORS, PEOPLE, SLOT_COLORS } from "../data/art";
import { THOUGHTS } from "../data/thoughts";
import { objSeats, objSize, type Agent, type Game, type SimEvent } from "../sim";
import { buildAtlas, type Atlas } from "./atlas";
import type { Camera } from "./camera";

const ART = 16; // art pixels per tile
const MAX_BUBBLES = 24;
const CHUNK = 16; // tiles per chunk side

export interface Ghost { tiles: number[]; seats?: number[]; ok: boolean }
export interface DrawOptions {
  overlay?: Channel | null;
  ghost?: Ghost | null;
  selectedTile?: number;
  selectedAgent?: number;
}
export interface DrawStats { agentsDrawn: number; chunksRedrawn: number }

export class Renderer {
  readonly atlas: Atlas;
  private ctx: CanvasRenderingContext2D;
  // Two chunk caches: terrain only (Close/Default, objects drawn live) and terrain + flat objects (Wide/Overview).
  private chunks = new Map<number, HTMLCanvasElement>();
  private dirty = new Set<number>();
  private farChunks = new Map<number, HTMLCanvasElement>();
  private farDirty = new Set<number>();
  private game: Game | null = null;
  private unsub: (() => void) | null = null;
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
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0) {
          const k = Math.floor(Y / CHUNK) * cw + Math.floor(X / CHUNK);
          this.dirty.add(k);
          this.farDirty.add(k);
        }
      }
    }
  }

  private tileSprite(i: number): string {
    const m = this.game!.state.map;
    switch (m.terrain[i]) {
      case T.FLOOR: return m.outdoor[i] ? "tile:grass" : "tile:carpet";
      case T.WALL: return "tile:wall";
      case T.DOOR: return "tile:door";
      case T.WATER: return "tile:water";
      default: return "tile:void";
    }
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
    const { w, h } = this.game!.state.map;
    g.fillStyle = "#140c09";
    g.fillRect(0, 0, c.width, c.height);
    for (let ty = 0; ty < CHUNK; ty++) for (let tx = 0; tx < CHUNK; tx++) {
      const x = cx * CHUNK + tx, y = cy * CHUNK + ty;
      if (x >= w || y >= h) continue;
      const f = this.atlas.frames.get(this.tileSprite(y * w + x))!;
      g.drawImage(this.atlas.canvas, f.x, f.y, f.w, f.h, tx * ART, ty * ART, ART, ART);
      if (!far) continue;
      const id = this.game!.objAt[y * w + x];
      if (!id) continue;
      const o = this.game!.objById.get(id);
      if (!o) continue;
      const def = OBJECTS[o.kind];
      g.fillStyle = "#120a07";
      g.fillRect(tx * ART, ty * ART, ART, ART);
      g.fillStyle = def.slot ? SLOT_COLORS[def.slot]?.C ?? "#888" : OBJECT_MAP_COLORS[def.sprite] ?? "#888";
      g.fillRect(tx * ART + 2, ty * ART + 2, ART - 4, ART - 4);
    }
    return c;
  }

  /** Draws one frame. alpha = fraction of the next tick elapsed, for smooth movement between ticks. */
  draw(cam: Camera, vw: number, vh: number, dpr: number, alpha: number, opt: DrawOptions = {}) {
    const g = this.game;
    if (!g) return;
    const { canvas, ctx } = this;
    const bw = Math.round(vw * dpr), bh = Math.round(vh * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0b0706";
    ctx.fillRect(0, 0, bw, bh);
    const tp = cam.tilePx * dpr; // device px per tile
    const ox = bw / 2 - cam.cx * tp, oy = bh / 2 - cam.cy * tp; // device px of tile (0,0)
    const s = g.state, { w, h } = s.map;
    const x0 = Math.max(0, Math.floor(-ox / tp)), y0 = Math.max(0, Math.floor(-oy / tp));
    const x1 = Math.min(w - 1, Math.floor((bw - ox) / tp)), y1 = Math.min(h - 1, Math.floor((bh - oy) / tp));
    this.stats = { agentsDrawn: 0, chunksRedrawn: 0 };

    // Static layer.
    const cw = Math.ceil(w / CHUNK);
    for (let cy = Math.floor(y0 / CHUNK); cy <= Math.floor(y1 / CHUNK); cy++)
      for (let cx = Math.floor(x0 / CHUNK); cx <= Math.floor(x1 / CHUNK); cx++) {
        const c = this.chunk(cy * cw + cx, cx, cy, cam.level >= 2);
        ctx.drawImage(c, Math.round(ox + cx * CHUNK * tp), Math.round(oy + cy * CHUNK * tp), Math.ceil(CHUNK * tp), Math.ceil(CHUNK * tp));
      }

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

    // Litter on the floor (under everything that stands).
    if (cam.level <= 2) {
      const lit = this.atlas.frames.get("obj:litter")!, spill = this.atlas.frames.get("obj:spill")!;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = s.dirt[y * w + x];
        if (!d) continue;
        const f = d >= 3 ? spill : lit;
        ctx.drawImage(this.atlas.canvas, f.x, f.y, f.w, f.h, Math.round(ox + x * tp), Math.round(oy + y * tp), tp, tp);
      }
    }

    // Dynamic layer: objects and people, y-sorted, on-screen only.
    type Item = { y: number; draw: () => void };
    const items: Item[] = [];
    const atlas = this.atlas;
    const scale = tp / ART;
    const blit = (key: string, px: number, py: number) => {
      const f = atlas.frames.get(key);
      if (f) ctx.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, Math.round(px), Math.round(py), f.w * scale, f.h * scale);
    };
    const tick = s.tick;
    // Who is playing which machine right now (for reels and lights).
    const playing = new Map<number, Agent>();
    for (const a of s.agents) if (a.act === "play" && a.seat >= 0) playing.set(a.target, a);
    // At Wide and Overview objects are part of the cached floor image.
    if (cam.level < 2) for (const o of s.objects) {
      const def = OBJECTS[o.kind];
      const { w: ow, h: oh } = objSize(o);
      if (o.x + ow < x0 - 1 || o.x > x1 + 1 || o.y + oh < y0 - 2 || o.y > y1 + 1) continue;
      for (const st of objSeats(o)) if (st.kind === "stool") items.push({ y: st.y - 0.05, draw: () => blit("obj:stool", ox + st.x * tp, oy + st.y * tp) });
      if (def.art === "tiled") {
        for (let dy = 0; dy < oh; dy++) for (let dx = 0; dx < ow; dx++)
          items.push({ y: o.y + dy + 0.99, draw: () => blit(`obj:${def.sprite}`, ox + (o.x + dx) * tp, oy + (o.y + dy) * tp) });
        continue;
      }
      if (def.art === "facing" && def.slot) {
        const facing = ["front", "left", "back", "right"][o.rot & 3];
        const key = `slot:${def.slot}:${facing}`;
        const f = atlas.frames.get(key)!;
        const px = ox + o.x * tp, py = oy + (o.y + 1) * tp - f.h * scale;
        const player = playing.get(o.id);
        items.push({
          y: o.y + 0.99,
          draw: () => {
            blit(key, px, py);
            const age = tick - o.last.tick;
            // Lights: a win glows on the topper; a jackpot flashes the whole cabinet.
            if (o.last.tick >= 0 && o.last.win === 2 && age < 120) {
              ctx.globalAlpha = (Math.floor(age / 4) & 1) ? 0.55 : 0.2;
              ctx.fillStyle = ["#ffd23f", "#ff4fa0", "#7df9ff"][Math.floor(age / 8) % 3];
              ctx.fillRect(px + 2 * scale, py, 12 * scale, f.h * scale);
              ctx.globalAlpha = 1;
            } else if (o.last.tick >= 0 && o.last.win === 1 && age < 30) {
              ctx.globalAlpha = 0.6;
              ctx.fillStyle = "#fff6b0";
              ctx.fillRect(px + 4 * scale, py, 8 * scale, 3 * scale);
              ctx.globalAlpha = 1;
            }
            // Spinning reels, visible from the front only.
            if (facing === "front" && player && player.timer > 0 && !o.broken && cam.level <= 1) {
              const phase = (tick + player.id) & 3;
              ctx.fillStyle = phase & 1 ? "#f4efe4" : "#c8c0b0";
              for (let k = 0; k < 3; k++) ctx.fillRect(px + (4 + 3 * k) * scale, py + (6 + ((phase + k) & 1)) * scale, 2 * scale, 2 * scale);
            }
            if (o.broken) blit("obj:broken", px + 4 * scale, py - 9 * scale);
          },
        });
        continue;
      }
      const f = atlas.frames.get(`obj:${def.sprite}`)!;
      items.push({
        y: o.y + oh - 0.01,
        draw: () => ctx.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, Math.round(ox + o.x * tp), Math.round(oy + (o.y + oh) * tp - f.h * scale), f.w * scale, f.h * scale),
      });
    }
    const lod = cam.level; // 0-1 full sprites, 2 simplified, 3 dots
    let bubbles = 0; // at most MAX_BUBBLES on screen, so a packed floor doesn't turn into a wall of speech
    const FACE = ["up", "side", "down", "left"];
    for (const a of s.agents) {
      if (a.hidden) continue;
      const moving = a.nx !== a.x || a.ny !== a.y;
      const p = moving ? Math.min(1, (a.t + alpha) / a.steps) : 0;
      const fx = a.x + (a.nx - a.x) * p, fy = a.y + (a.ny - a.y) * p;
      if (fx < x0 - 1 || fx > x1 + 1 || fy < y0 - 1 || fy > y1 + 1) continue;
      const set = a.role === "guest" ? a.g!.type : a.role;
      const looks = PEOPLE[set] ?? PEOPLE.local;
      const v = a.look % looks.variants;
      const sx = ox + (fx + 0.5) * tp, sy = oy + (fy + 0.5) * tp;
      this.stats.agentsDrawn++;
      if (lod >= 2) {
        const d = lod === 2 ? Math.max(2, tp * 0.35) : Math.max(2, tp * 0.45);
        const color = atlas.lookColor[set]?.[v] ?? "#fff";
        items.push({ y: fy, draw: () => { ctx.fillStyle = color; ctx.fillRect(Math.round(sx - d / 2), Math.round(sy - d), Math.ceil(d), Math.ceil(d)); } });
        continue;
      }
      let dir: string;
      const seated = !moving && a.seat >= 0 && (a.act === "play" || a.act === "drink" || a.act === "cage");
      if (seated) dir = FACE[(g.objById.get(a.target)?.rot ?? 0) & 3];
      else dir = a.nx > a.x ? "side" : a.nx < a.x ? "left" : a.ny < a.y ? "up" : "down";
      const step = moving && (a.t + alpha) / a.steps >= 0.5 ? 1 : 0;
      const f = atlas.frames.get(`p:${set}:${v}:${dir}${step}`)!;
      const gd = a.g;
      const bubble = gd && gd.thought && tick - gd.thoughtTick < 60 ? THOUGHTS[gd.thought] : null;
      let bubbleKey = bubble ? (bubble.bad ? "obj:bubbleBad" : bubble.notable ? "obj:bubbleGood" : null) : null;
      if (bubbleKey && ++bubbles > MAX_BUBBLES) bubbleKey = null;
      items.push({
        y: fy + 0.02,
        draw: () => {
          ctx.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, Math.round(sx - 4 * scale), Math.round(sy + 5 * scale - f.h * scale), f.w * scale, f.h * scale);
          if (bubbleKey) blit(bubbleKey, sx - 1 * scale, sy - 16 * scale);
        },
      });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    // Selection and build ghost.
    ctx.lineWidth = Math.max(1, dpr);
    if (opt.ghost) {
      ctx.fillStyle = opt.ghost.ok ? "rgba(125,255,176,0.35)" : "rgba(229,72,77,0.4)";
      for (const i of opt.ghost.tiles) ctx.fillRect(ox + (i % w) * tp, oy + Math.floor(i / w) * tp, tp, tp);
      ctx.strokeStyle = opt.ghost.ok ? "rgba(125,255,176,0.9)" : "rgba(229,72,77,0.9)";
      for (const i of opt.ghost.seats ?? []) ctx.strokeRect(ox + (i % w) * tp + 2, oy + Math.floor(i / w) * tp + 2, tp - 4, tp - 4);
    }
    if (opt.selectedTile !== undefined && opt.selectedTile >= 0) {
      const i = opt.selectedTile;
      ctx.strokeStyle = "#ffd36b";
      ctx.strokeRect(ox + (i % w) * tp + 1, oy + Math.floor(i / w) * tp + 1, tp - 2, tp - 2);
    }
    if (opt.selectedAgent !== undefined) {
      const a = s.agents.find((a) => a.id === opt.selectedAgent);
      if (a && !a.hidden) {
        const p = a.nx !== a.x || a.ny !== a.y ? Math.min(1, (a.t + alpha) / a.steps) : 0;
        const sx = ox + (a.x + (a.nx - a.x) * p + 0.5) * tp, sy = oy + (a.y + (a.ny - a.y) * p + 0.5) * tp;
        ctx.strokeStyle = "#ffd36b";
        ctx.beginPath();
        ctx.ellipse(sx, sy + 4 * (tp / ART), Math.max(4, tp * 0.35), Math.max(2, tp * 0.15), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
