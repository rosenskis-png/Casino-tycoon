// Canvas 2D world renderer. Reads sim state, never writes it. Terrain is drawn once into cached chunks and
// redrawn only when tiles change; objects and people draw per frame, on-screen only, with level of detail.
import { T } from "../data/terrain";
import { OBJECTS } from "../data/objects";
import { CHANNEL_DEFS, type Channel } from "../data/fields";
import { LOOK_VARIANTS } from "../data/art";
import type { Game, SimEvent } from "../sim";
import { buildAtlas, type Atlas } from "./atlas";
import type { Camera } from "./camera";

const ART = 16; // art pixels per tile
const CHUNK = 16; // tiles per chunk side

export interface Ghost { tiles: number[]; ok: boolean }
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
  private chunks = new Map<number, HTMLCanvasElement>();
  private dirty = new Set<number>();
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
    this.unsub = g.bus.on((e: SimEvent) => { if (e.type === "tilesChanged") this.invalidate(e.tiles); });
  }

  private invalidate(tiles: number[]) {
    const { w } = this.game!.state.map;
    const cw = Math.ceil(w / CHUNK);
    for (const i of tiles) {
      const x = i % w, y = (i - x) / w;
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0) this.dirty.add(Math.floor(Y / CHUNK) * cw + Math.floor(X / CHUNK));
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

  private chunk(key: number, cx: number, cy: number): HTMLCanvasElement {
    let c = this.chunks.get(key);
    if (c && !this.dirty.has(key)) return c;
    if (!c) {
      c = document.createElement("canvas");
      c.width = c.height = CHUNK * ART;
      this.chunks.set(key, c);
    }
    this.dirty.delete(key);
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
        const c = this.chunk(cy * cw + cx, cx, cy);
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

    // Dynamic layer: objects and people, y-sorted, on-screen only.
    type Item = { y: number; draw: () => void };
    const items: Item[] = [];
    const atlas = this.atlas;
    for (const o of s.objects) {
      const def = OBJECTS[o.kind];
      if (o.x + def.w < x0 || o.x > x1 + 1 || o.y + def.h < y0 || o.y > y1 + 1) continue;
      const f = atlas.frames.get(`obj:${def.sprite}`)!;
      const scale = tp / ART;
      items.push({
        y: o.y + def.h - 0.01,
        draw: () => ctx.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, Math.round(ox + o.x * tp), Math.round(oy + (o.y + def.h) * tp - f.h * scale), f.w * scale, f.h * scale),
      });
    }
    const lod = cam.level; // 0-1 full sprites, 2 simplified, 3 dots
    const scale = tp / ART;
    for (const a of s.agents) {
      const moving = a.nx !== a.x || a.ny !== a.y;
      const p = moving ? Math.min(1, (a.t + alpha) / a.steps) : 0;
      const fx = a.x + (a.nx - a.x) * p, fy = a.y + (a.ny - a.y) * p;
      if (fx < x0 - 1 || fx > x1 + 1 || fy < y0 - 1 || fy > y1 + 1) continue;
      const v = a.look % LOOK_VARIANTS;
      const sx = ox + (fx + 0.5) * tp, sy = oy + (fy + 0.5) * tp;
      this.stats.agentsDrawn++;
      if (lod >= 2) {
        const d = lod === 2 ? Math.max(2, tp * 0.35) : Math.max(2, tp * 0.45);
        items.push({ y: fy, draw: () => { ctx.fillStyle = atlas.lookColor[v]; ctx.fillRect(Math.round(sx - d / 2), Math.round(sy - d), Math.ceil(d), Math.ceil(d)); } });
        continue;
      }
      const dir = a.nx > a.x ? "side" : a.nx < a.x ? "left" : a.ny < a.y ? "up" : "down";
      const step = moving && (a.t + alpha) / a.steps >= 0.5 ? 1 : 0;
      const f = atlas.frames.get(`p:${v}:${dir}${step}`)!;
      items.push({ y: fy, draw: () => ctx.drawImage(atlas.canvas, f.x, f.y, f.w, f.h, Math.round(sx - 4 * scale), Math.round(sy + 5 * scale - f.h * scale), f.w * scale, f.h * scale) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    // Selection and build ghost.
    ctx.lineWidth = Math.max(1, dpr);
    if (opt.ghost) {
      ctx.fillStyle = opt.ghost.ok ? "rgba(125,255,176,0.35)" : "rgba(229,72,77,0.4)";
      for (const i of opt.ghost.tiles) ctx.fillRect(ox + (i % w) * tp, oy + Math.floor(i / w) * tp, tp, tp);
    }
    if (opt.selectedTile !== undefined && opt.selectedTile >= 0) {
      const i = opt.selectedTile;
      ctx.strokeStyle = "#ffd36b";
      ctx.strokeRect(ox + (i % w) * tp + 1, oy + Math.floor(i / w) * tp + 1, tp - 2, tp - 2);
    }
    if (opt.selectedAgent !== undefined) {
      const a = s.agents.find((a) => a.id === opt.selectedAgent);
      if (a) {
        const p = a.nx !== a.x || a.ny !== a.y ? Math.min(1, (a.t + alpha) / a.steps) : 0;
        const sx = ox + (a.x + (a.nx - a.x) * p + 0.5) * tp, sy = oy + (a.y + (a.ny - a.y) * p + 0.5) * tp;
        ctx.strokeStyle = "#ffd36b";
        ctx.beginPath();
        ctx.ellipse(sx, sy + 4 * scale, Math.max(4, tp * 0.35), Math.max(2, tp * 0.15), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
