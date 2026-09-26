// Touch input on the world canvas: one finger pans (or builds, with a build tool), two fingers pan and pinch
// between the four zoom levels, a tap inspects or places. Also mouse wheel zoom for desktop testing.
import { OBJECTS } from "../data/objects";
import { covers, groupPlacements, objFootprint, objSeats, type Command } from "../sim";
import type { Host } from "./host";

/** (2026-09-26) "pick": choose objects for a group (tap one, or drag a box); `group:i` builds saved group i. */
export type Tool = "inspect" | "wall" | "door" | "demolish" | "entrance" | "remove" | "pick" | `place:${string}` | `move:${number}` | `group:${number}`;

export interface InputCallbacks {
  tool(): Tool;
  /** Rotation for placing objects (quarter turns). */
  rot(): number;
  tap(tile: number, tx: number, ty: number): void;
  command(c: Command): void;
  /** The objects picked for a group changed (they live in `host.picked`). */
  picked(): void;
}

/** (2026-09-26, owner) Most copies one drag lays down in a row. */
const MAX_ROW = 40;

const DRAG_PX = 8;

export class WorldInput {
  private pts = new Map<number, { x: number; y: number }>();
  private mode: "none" | "press" | "pan" | "build" | "pinch" | "box" = "none";
  private start = { x: 0, y: 0 };
  private lastMid = { x: 0, y: 0 };
  private pinchBase = 0;
  private ghostCmd: Command | Command[] | null = null;

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

  private setGhost(c: Command | Command[] | null, all = false) {
    this.ghostCmd = c;
    if (!c) { this.host.drawOptions.ghost = null; return; }
    const g = this.host.game;
    const w = g.state.map.w;
    const { h } = g.state.map;
    const onMap = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x < w && p.y < h;
    const shape = (c: Command): { tiles: number[]; seats: number[] } => {
      if (c.type === "build") return { tiles: c.tiles, seats: [] };
      let p: Parameters<typeof objFootprint>[0] | null = null;
      if (c.type === "place") p = c;
      else if (c.type === "move") { const o = g.objById.get(c.id); if (o) p = { kind: o.kind, x: c.x, y: c.y, rot: c.rot }; }
      if (!p) return { tiles: [], seats: [] };
      return { tiles: objFootprint(p).filter(onMap).map((q) => q.y * w + q.x), seats: objSeats(p).filter(onMap).map((q) => q.y * w + q.x) };
    };
    if (!Array.isArray(c)) { const f = shape(c); this.host.drawOptions.ghost = { ...f, ok: g.check(c) === null }; return; }
    // Several pieces: the ones that fit show green, the rest red. A group (`all`) goes down only if every piece fits.
    const good: Command[] = [], ok = { tiles: [] as number[], seats: [] as number[] }, bad = { tiles: [] as number[], seats: [] as number[] };
    for (const k of c) {
      const f = shape(k), fits = g.check(k) === null, to = fits ? ok : bad;
      if (fits) good.push(k);
      to.tiles.push(...f.tiles); to.seats.push(...f.seats);
    }
    const whole = all ? good.length === c.length : good.length > 0;
    this.ghostCmd = whole ? (all ? c : good) : null;
    this.host.drawOptions.ghost = whole ? { ...ok, ok: true, bad: bad.tiles, badSeats: bad.seats } : { tiles: [...ok.tiles, ...bad.tiles], seats: [...ok.seats, ...bad.seats], ok: false };
  }

  /** Copies of `c` from tile a toward b, one footprint-and-seats apart. */
  private row(c: Extract<Command, { type: "place" }>, a: { x: number; y: number }, b: { x: number; y: number }): Command | Command[] {
    if (a.x === b.x && a.y === b.y) return c;
    const cells = [...objFootprint(c), ...objSeats(c)];
    const span = (k: "x" | "y") => Math.max(...cells.map((p) => p[k])) - Math.min(...cells.map((p) => p[k])) + 1;
    const horiz = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y), k = horiz ? "x" : "y";
    const step = span(k) * Math.sign(b[k] - a[k]), n = Math.min(MAX_ROW, Math.floor(Math.abs(b[k] - a[k]) / Math.abs(step)) + 1);
    const out: Command[] = [];
    for (let i = 0; i < n; i++) out.push({ ...c, [k]: c[k] + i * step });
    return out;
  }

  private ghostFor(tool: Tool, a: ReturnType<WorldInput["tileAt"]>, b: ReturnType<WorldInput["tileAt"]>): Command | Command[] | null {
    const w = this.host.game.state.map.w;
    // (2026-09-26, owner) A saved group follows the finger (its middle), turned by Rotate.
    if (tool.startsWith("group:")) {
      const bp = this.host.game.state.groups?.[Number(tool.slice(6))];
      if (!bp) return null;
      const r = this.cb.rot() & 3, W = r & 1 ? bp.h : bp.w, H = r & 1 ? bp.w : bp.h;
      return groupPlacements(bp, b.x - Math.floor(W / 2), b.y - Math.floor(H / 2), r).map((p) => ({ type: "place", ...p }) as Command);
    }
    // (M11.2) Moving an object: its footprint follows the finger; the Rotate button turns it.
    if (tool.startsWith("move:")) return { type: "move", id: Number(tool.slice(5)), x: b.x, y: b.y, rot: this.cb.rot() & 3 };
    if (tool.startsWith("place:")) {
      // M8: a slot design rides along as place:<cabinet kind>@<design>.
      const [kind, design] = tool.slice(6).split("@"), def = OBJECTS[kind], rot = this.cb.rot() & 3;
      // (2026-09-26, owner) Fixed-size objects: a drag lays a row of them along the longer direction, spaced by
      // their footprint and seats (a tap places one).
      if (!def?.sized) return this.row({ type: "place", kind, x: a.x, y: a.y, rot, ...(design ? { design } : {}) }, a, b);
      // Sized amenities: drag out the area from the first tile (a tap gives the default size there). Width runs
      // along the front, so a quarter turn swaps which screen axis is which.
      const z = def.sized, same = a.x === b.x && a.y === b.y;
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const odd = rot & 1;
      const W = same ? (odd ? def.h : def.w) : Math.abs(b.x - a.x) + 1, H = same ? (odd ? def.w : def.h) : Math.abs(b.y - a.y) + 1;
      const w = clamp(odd ? H : W, z.min[0], z.max[0]), h = clamp(odd ? W : H, z.min[1], z.max[1]);
      const SW = odd ? h : w, SH = odd ? w : h;
      const x = b.x < a.x ? a.x - SW + 1 : a.x, y = b.y < a.y ? a.y - SH + 1 : a.y;
      return { type: "place", kind, x, y, rot, w, h };
    }
    if (tool === "wall" || tool === "door" || tool === "demolish" || tool === "entrance") {
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
      if (tool !== "inspect" && tool !== "remove" && tool !== "pick") { this.mode = "build"; this.setGhost(this.ghostFor(tool, t, t), tool.startsWith("group:")); }
      if (tool === "pick") this.mode = "box";
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
      const t0 = this.tileAt(this.start.x, this.start.y), t1 = this.tileAt(p.x, p.y), tool = this.cb.tool();
      this.setGhost(this.ghostFor(tool, t0, t1), tool.startsWith("group:"));
    } else if (this.mode === "box") {
      const t0 = this.tileAt(this.start.x, this.start.y), t1 = this.tileAt(p.x, p.y);
      if (t0.x === t1.x && t0.y === t1.y && Math.hypot(p.x - this.start.x, p.y - this.start.y) <= DRAG_PX) return;
      const tiles: number[] = [];
      for (let y = Math.max(0, Math.min(t0.y, t1.y)); y <= Math.min(h - 1, Math.max(t0.y, t1.y)); y++)
        for (let x = Math.max(0, Math.min(t0.x, t1.x)); x <= Math.min(w - 1, Math.max(t0.x, t1.x)); x++) tiles.push(y * w + x);
      this.ghostCmd = null;
      this.host.drawOptions.ghost = { tiles, ok: true };
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
      const c = this.ghostCmd;
      // Several pieces go down one at a time, each applied before the next is checked (cash runs out in order).
      if (Array.isArray(c)) for (const k of c) { this.cb.command(k); this.host.game.flushCommands(); }
      else if (c) this.cb.command(c);
      this.setGhost(null);
    } else if (this.mode === "box") {
      const t0 = this.tileAt(this.start.x, this.start.y), t1 = this.tileAt(p.x, p.y);
      const picked = this.host.picked;
      if (!this.host.drawOptions.ghost) {
        // A tap: add or take away the object there.
        const o = this.objectAt(t1.x, t1.y);
        if (o !== null) { const k = picked.indexOf(o); if (k >= 0) picked.splice(k, 1); else picked.push(o); }
      } else {
        const x0 = Math.min(t0.x, t1.x), x1 = Math.max(t0.x, t1.x), y0 = Math.min(t0.y, t1.y), y1 = Math.max(t0.y, t1.y);
        for (const o of this.host.game.state.objects)
          if (!picked.includes(o.id) && objFootprint(o).every((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1)) picked.push(o.id);
      }
      this.host.drawOptions.ghost = null;
      this.host.markPicked();
      this.cb.picked();
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
