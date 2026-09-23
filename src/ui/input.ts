// Touch input on the world canvas: one finger pans (or builds, with a build tool), two fingers pan and pinch
// between the four zoom levels, a tap inspects or places. Also mouse wheel zoom for desktop testing.
import { OBJECTS } from "../data/objects";
import { covers, footprint, seats, type Command } from "../sim";
import type { Host } from "./host";

export type Tool = "inspect" | "wall" | "door" | "demolish" | "remove" | `place:${string}`;

export interface InputCallbacks {
  tool(): Tool;
  /** Rotation for placing objects (quarter turns). */
  rot(): number;
  tap(tile: number, tx: number, ty: number): void;
  command(c: Command): void;
}

const DRAG_PX = 8;

export class WorldInput {
  private pts = new Map<number, { x: number; y: number }>();
  private mode: "none" | "press" | "pan" | "build" | "pinch" = "none";
  private start = { x: 0, y: 0 };
  private lastMid = { x: 0, y: 0 };
  private pinchBase = 0;
  private ghostCmd: Command | null = null;

  constructor(private host: Host, private el: HTMLCanvasElement, private cb: InputCallbacks) {
    el.addEventListener("pointerdown", this.down);
    el.addEventListener("pointermove", this.move);
    el.addEventListener("pointerup", this.up);
    el.addEventListener("pointercancel", this.cancel);
    el.addEventListener("wheel", this.wheel, { passive: false });
  }

  dispose() {
    const el = this.el;
    el.removeEventListener("pointerdown", this.down);
    el.removeEventListener("pointermove", this.move);
    el.removeEventListener("pointerup", this.up);
    el.removeEventListener("pointercancel", this.cancel);
    el.removeEventListener("wheel", this.wheel);
  }

  private local(e: PointerEvent | WheelEvent) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  }

  private tileAt(sx: number, sy: number) {
    const r = this.el.getBoundingClientRect();
    const p = this.host.camera.toTile(sx, sy, r.width, r.height);
    const { w, h } = this.host.game.state.map;
    const x = Math.floor(p.x), y = Math.floor(p.y);
    return { i: x >= 0 && y >= 0 && x < w && y < h ? y * w + x : -1, x, y, fx: p.x, fy: p.y };
  }

  private setGhost(c: Command | null) {
    this.ghostCmd = c;
    if (!c) { this.host.drawOptions.ghost = null; return; }
    const g = this.host.game;
    const w = g.state.map.w;
    let tiles: number[] = [], seatTiles: number[] = [];
    const { h } = g.state.map;
    const onMap = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x < w && p.y < h;
    if (c.type === "build") tiles = c.tiles;
    else if (c.type === "place") {
      const d = OBJECTS[c.kind];
      tiles = footprint(d, c.x, c.y, c.rot).filter(onMap).map((p) => p.y * w + p.x);
      seatTiles = seats(d, c.x, c.y, c.rot).filter(onMap).map((p) => p.y * w + p.x);
    }
    this.host.drawOptions.ghost = { tiles, seats: seatTiles, ok: g.check(c) === null };
  }

  private ghostFor(tool: Tool, a: ReturnType<WorldInput["tileAt"]>, b: ReturnType<WorldInput["tileAt"]>): Command | null {
    const w = this.host.game.state.map.w;
    if (tool.startsWith("place:")) return { type: "place", kind: tool.slice(6), x: b.x, y: b.y, rot: this.cb.rot() & 3 };
    if (tool === "wall" || tool === "door" || tool === "demolish") {
      if (a.i < 0) return null;
      const tiles: number[] = [];
      const { w: mw, h: mh } = this.host.game.state.map;
      if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
        for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) if (x >= 0 && x < mw) tiles.push(a.y * w + x);
      } else {
        for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) if (y >= 0 && y < mh) tiles.push(y * w + a.x);
      }
      return { type: "build", what: tool, tiles };
    }
    return null;
  }

  private down = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pts.set(e.pointerId, p);
    if (this.pts.size === 1) {
      this.mode = "press";
      this.start = p;
      this.lastMid = p;
      const t = this.tileAt(p.x, p.y);
      const tool = this.cb.tool();
      if (tool !== "inspect" && tool !== "remove") { this.mode = "build"; this.setGhost(this.ghostFor(tool, t, t)); }
    } else if (this.pts.size === 2) {
      this.mode = "pinch";
      this.setGhost(null);
      const [a, b] = [...this.pts.values()];
      this.pinchBase = Math.hypot(a.x - b.x, a.y - b.y);
      this.lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  };

  private move = (e: PointerEvent) => {
    if (!this.pts.has(e.pointerId)) return;
    const p = this.local(e);
    this.pts.set(e.pointerId, p);
    const cam = this.host.camera;
    const { w, h } = this.host.game.state.map;
    if (this.mode === "press" && Math.hypot(p.x - this.start.x, p.y - this.start.y) > DRAG_PX) this.mode = "pan";
    if (this.mode === "pan") {
      cam.cx -= (p.x - this.lastMid.x) / cam.tilePx;
      cam.cy -= (p.y - this.lastMid.y) / cam.tilePx;
      cam.clamp(w, h);
      this.lastMid = p;
    } else if (this.mode === "build") {
      const t0 = this.tileAt(this.start.x, this.start.y), t1 = this.tileAt(p.x, p.y);
      this.setGhost(this.ghostFor(this.cb.tool(), t0, t1));
    } else if (this.mode === "pinch" && this.pts.size >= 2) {
      const [a, b] = [...this.pts.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      cam.cx -= (mid.x - this.lastMid.x) / cam.tilePx;
      cam.cy -= (mid.y - this.lastMid.y) / cam.tilePx;
      this.lastMid = mid;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = d / this.pinchBase;
      if (r > 1.5 || r < 0.66) {
        cam.zoomAt(cam.level + (r > 1 ? -1 : 1), mid.x, mid.y, p.w, p.h);
        this.pinchBase = d;
      }
      cam.clamp(w, h);
    }
  };

  private up = (e: PointerEvent) => {
    if (!this.pts.has(e.pointerId)) return;
    const p = this.local(e);
    this.pts.delete(e.pointerId);
    if (this.mode === "pinch") { if (this.pts.size === 0) this.mode = "none"; return; }
    if (this.mode === "build") {
      if (this.ghostCmd) this.cb.command(this.ghostCmd);
      this.setGhost(null);
    } else if (this.mode === "press") {
      const t = this.tileAt(p.x, p.y);
      if (this.cb.tool() === "remove") {
        const o = this.objectAt(t.x, t.y);
        if (o) this.cb.command({ type: "remove", id: o });
      } else this.cb.tap(t.i, t.fx, t.fy);
    }
    this.mode = "none";
  };

  private cancel = (e: PointerEvent) => {
    this.pts.delete(e.pointerId);
    this.setGhost(null);
    this.mode = "none";
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.local(e);
    const cam = this.host.camera;
    cam.zoomAt(cam.level + (e.deltaY > 0 ? 1 : -1), p.x, p.y, p.w, p.h);
    cam.clamp(this.host.game.state.map.w, this.host.game.state.map.h);
  };

  objectAt(x: number, y: number): number | null {
    for (const o of this.host.game.state.objects) if (covers(o, x, y)) return o.id;
    return null;
  }
}
