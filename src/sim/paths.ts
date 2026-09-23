// Pathfinding (FOUNDATIONS §3), two-level so it scales to the largest maps and thousands of destinations:
// - Near a destination (within WINDOW tiles, Chebyshev), agents follow a small BFS field built only inside that
//   window: cheap, so every seat can have its own.
// - Farther away, they follow a full-map field toward the destination's anchor: one per room per 16×16 sector,
//   shared by every destination of that room in that sector. Every anchor lies inside the window of every
//   destination in its sector, so an agent reaches the window and switches to the local field.
// - Mode is a function of position only: on a tile the local field reaches, go downhill on it (it never leaves
//   that set); anywhere else, go downhill on the anchor's field. The anchor is itself reached by the local field,
//   so every route is strictly downhill on the anchor field, then strictly downhill on the local one: no loops.
// - A destination whose local field doesn't reach its sector's anchor (walled apart within the window) uses a
//   full-map field of its own instead.
// Reachability is exact via connected-component labels of the walkable grid. All of this is runtime cache,
// rebuilt on demand and dropped on layout changes.
import type { Game } from "./game";

export const UNREACHED = 0xffff;
const SECTOR = 16;
/** Chebyshev radius of a local field; ≥ SECTOR - 1 so a sector's anchor is always inside its destinations' windows. */
const WINDOW = 16;
/** Memory budget for full-map fields (2 bytes per tile each). */
const GLOBAL_BYTES = 24 << 20;
/** Local fields kept (each ≤ 33×33 × 2 bytes ≈ 2 KB): enough for one per walking agent at 8,000 guests. */
const MAX_LOCAL = 8192;

interface Local { x0: number; y0: number; w: number; h: number; d: Uint16Array; /** safe to use hierarchically */ ok: boolean }

export class PathCache {
  private global = new Map<number, Uint16Array>();
  private local = new Map<number, Local>();
  private anchors = new Map<number, number>();
  private comp = new Int32Array(0);
  private compDirty = true;
  builds = 0;
  localBuilds = 0;

  constructor(private g: Game) {}

  private get maxGlobal() {
    const { w, h } = this.g.state.map;
    return Math.max(32, Math.min(1024, Math.floor(GLOBAL_BYTES / (2 * w * h))));
  }

  // --- components -------------------------------------------------------------------------------------

  private components(): Int32Array {
    if (!this.compDirty) return this.comp;
    const { w, h } = this.g.state.map;
    const n = w * h, walk = this.g.walkable;
    const comp = new Int32Array(n).fill(-1);
    const q = new Int32Array(n);
    let label = 0;
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0 || !walk(s)) continue;
      let head = 0, tail = 0;
      comp[s] = label; q[tail++] = s;
      while (head < tail) {
        const i = q[head++], x = i % w;
        if (x > 0 && comp[i - 1] < 0 && walk(i - 1)) { comp[i - 1] = label; q[tail++] = i - 1; }
        if (x < w - 1 && comp[i + 1] < 0 && walk(i + 1)) { comp[i + 1] = label; q[tail++] = i + 1; }
        if (i >= w && comp[i - w] < 0 && walk(i - w)) { comp[i - w] = label; q[tail++] = i - w; }
        if (i < n - w && comp[i + w] < 0 && walk(i + w)) { comp[i + w] = label; q[tail++] = i + w; }
      }
      label++;
    }
    this.comp = comp;
    this.compDirty = false;
    return comp;
  }

  /** True when a walking route exists between two tiles. */
  reachable(from: number, to: number): boolean {
    const c = this.components();
    return c[from] >= 0 && c[from] === c[to];
  }

  // --- full-map fields --------------------------------------------------------------------------------

  /** Distance (in steps) from every tile to `dest`; UNREACHED where there is no path. */
  get(dest: number): Uint16Array {
    let f = this.global.get(dest);
    if (f) {
      this.global.delete(dest); // refresh LRU position
      this.global.set(dest, f);
      return f;
    }
    f = this.build(dest);
    this.global.set(dest, f);
    while (this.global.size > this.maxGlobal) this.global.delete(this.global.keys().next().value!);
    return f;
  }

  private build(dest: number): Uint16Array {
    this.builds++;
    const { w, h } = this.g.state.map;
    const walk = this.g.walkable;
    const dist = new Uint16Array(w * h).fill(UNREACHED);
    if (!walk(dest)) return dist;
    const q = new Int32Array(w * h);
    let head = 0, tail = 0;
    dist[dest] = 0;
    q[tail++] = dest;
    while (head < tail) {
      const i = q[head++];
      const d = dist[i] + 1;
      const x = i % w;
      if (x > 0 && dist[i - 1] === UNREACHED && walk(i - 1)) { dist[i - 1] = d; q[tail++] = i - 1; }
      if (x < w - 1 && dist[i + 1] === UNREACHED && walk(i + 1)) { dist[i + 1] = d; q[tail++] = i + 1; }
      if (i >= w && dist[i - w] === UNREACHED && walk(i - w)) { dist[i - w] = d; q[tail++] = i - w; }
      if (i < w * (h - 1) && dist[i + w] === UNREACHED && walk(i + w)) { dist[i + w] = d; q[tail++] = i + w; }
    }
    return dist;
  }

  // --- anchors and local fields -----------------------------------------------------------------------

  /** A walkable tile of the same room (or, off-room, the same component) near the middle of `tile`'s sector, or -1. */
  private anchorOf(tile: number): number {
    const { w, h } = this.g.state.map;
    const x = tile % w, y = (tile - x) / w;
    const sx = Math.floor(x / SECTOR), sy = Math.floor(y / SECTOR);
    const roomOf = this.g.rooms.roomOf, comp = this.components();
    const room = roomOf[tile];
    // Key by sector and room (doors and other off-room tiles by component instead).
    const key = ((sy * 4096 + sx) * 2 + (room >= 0 ? 0 : 1)) * 1_000_000 + (room >= 0 ? room : comp[tile] + 1);
    let a = this.anchors.get(key);
    if (a !== undefined) return a;
    a = -1;
    let best = Infinity;
    const cx = sx * SECTOR + SECTOR / 2, cy = sy * SECTOR + SECTOR / 2;
    for (let yy = sy * SECTOR; yy < Math.min(h, (sy + 1) * SECTOR); yy++)
      for (let xx = sx * SECTOR; xx < Math.min(w, (sx + 1) * SECTOR); xx++) {
        const i = yy * w + xx;
        if (comp[i] < 0 || (room >= 0 ? roomOf[i] !== room : comp[i] !== comp[tile])) continue;
        const d = Math.abs(xx - cx) + Math.abs(yy - cy);
        if (d < best) { best = d; a = i; }
      }
    this.anchors.set(key, a);
    return a;
  }

  private localField(dest: number): Local {
    let L = this.local.get(dest);
    if (L) return L;
    this.localBuilds++;
    const { w: W, h: H } = this.g.state.map;
    const walk = this.g.walkable;
    const dx = dest % W, dy = (dest - dx) / W;
    const x0 = Math.max(0, dx - WINDOW), y0 = Math.max(0, dy - WINDOW);
    const w = Math.min(W - 1, dx + WINDOW) - x0 + 1, h = Math.min(H - 1, dy + WINDOW) - y0 + 1;
    const d = new Uint16Array(w * h).fill(UNREACHED);
    if (walk(dest)) {
      const q = new Int32Array(w * h);
      let head = 0, tail = 0;
      const s = (dy - y0) * w + (dx - x0);
      d[s] = 0; q[tail++] = s;
      while (head < tail) {
        const i = q[head++], lx = i % w, ly = (i - lx) / w, nd = d[i] + 1;
        const gi = (ly + y0) * W + lx + x0;
        if (lx > 0 && d[i - 1] === UNREACHED && walk(gi - 1)) { d[i - 1] = nd; q[tail++] = i - 1; }
        if (lx < w - 1 && d[i + 1] === UNREACHED && walk(gi + 1)) { d[i + 1] = nd; q[tail++] = i + 1; }
        if (ly > 0 && d[i - w] === UNREACHED && walk(gi - W)) { d[i - w] = nd; q[tail++] = i - w; }
        if (ly < h - 1 && d[i + w] === UNREACHED && walk(gi + W)) { d[i + w] = nd; q[tail++] = i + w; }
      }
    }
    // Hierarchical routing needs the sector anchor to be reached by this local field.
    const a = this.anchorOf(dest);
    const ax = a % W, ay = (a - ax) / W;
    const ok = a >= 0 && ax >= x0 && ay >= y0 && ax < x0 + w && ay < y0 + h && d[(ay - y0) * w + ax - x0] !== UNREACHED;
    L = { x0, y0, w, h, d, ok };
    this.local.set(dest, L);
    if (this.local.size > MAX_LOCAL) this.local.delete(this.local.keys().next().value!);
    return L;
  }

  /**
   * The neighbor to step onto from `here` toward `dest`: `here` itself when arrived, -1 when unreachable.
   * `id` alternates tie order between agents so crowds spread over parallel routes.
   */
  next(here: number, dest: number, id: number): number {
    if (here === dest) return here;
    if (!this.reachable(here, dest)) return -1;
    const W = this.g.state.map.w;
    const hx = here % W, hy = (here - hx) / W;
    const L = this.localField(dest);
    const order = id & 1 ? [1, -1, W, -W] : [W, -W, 1, -1];
    if (L.ok) {
      const lx = hx - L.x0, ly = hy - L.y0;
      const cur = lx >= 0 && ly >= 0 && lx < L.w && ly < L.h ? L.d[ly * L.w + lx] : UNREACHED;
      if (cur !== UNREACHED) {
        for (const o of order) {
          const nx = lx + (o === 1 ? 1 : o === -1 ? -1 : 0), ny = ly + (o === W ? 1 : o === -W ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
          if (L.d[ny * L.w + nx] === cur - 1) return here + o;
        }
        return -1;
      }
      return this.downhill(this.get(this.anchorOf(dest)), here, hx, order);
    }
    return this.downhill(this.get(dest), here, hx, order);
  }

  private downhill(f: Uint16Array, here: number, hx: number, order: number[]): number {
    const W = this.g.state.map.w;
    const d = f[here];
    if (d === UNREACHED) return -1;
    for (const o of order) {
      if ((o === 1 && hx === W - 1) || (o === -1 && hx === 0)) continue;
      const j = here + o;
      if (j >= 0 && j < f.length && f[j] === d - 1) return j;
    }
    return -1;
  }

  /** Drops caches a change to these tiles could affect. Layout changes are rare, so local caches go wholesale. */
  invalidate(tiles: number[]) {
    this.compDirty = true;
    this.anchors.clear();
    this.local.clear();
    const { w, h } = this.g.state.map;
    const n = w * h;
    for (const [dest, f] of this.global) {
      const hit = tiles.some((i) =>
        f[i] !== UNREACHED ||
        (i % w > 0 && f[i - 1] !== UNREACHED) || (i % w < w - 1 && f[i + 1] !== UNREACHED) ||
        (i >= w && f[i - w] !== UNREACHED) || (i + w < n && f[i + w] !== UNREACHED));
      if (hit) this.global.delete(dest);
    }
    // Anchors may move, so any field that was an anchor's may now be unused; LRU clears it out.
  }

  clear() { this.global.clear(); this.local.clear(); this.anchors.clear(); this.compDirty = true; }
  get size() { return this.global.size; }
  get localSize() { return this.local.size; }
}
