// Distance-field pathfinding (FOUNDATIONS §3): one cached BFS field per destination, shared by every agent
// heading there. A map change drops only the fields it can affect.
import type { Game } from "./game";

export const UNREACHED = 0xffff;
const MAX_FIELDS = 96;

export class PathCache {
  private fields = new Map<number, Uint16Array>();
  builds = 0;

  constructor(private g: Game) {}

  /** Distance (in steps) from every tile to `dest`; UNREACHED where there is no path. */
  get(dest: number): Uint16Array {
    let f = this.fields.get(dest);
    if (f) {
      this.fields.delete(dest); // refresh LRU position
      this.fields.set(dest, f);
      return f;
    }
    f = this.build(dest);
    this.fields.set(dest, f);
    if (this.fields.size > MAX_FIELDS) this.fields.delete(this.fields.keys().next().value!);
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

  /** Drops fields a change to these tiles could affect: a changed tile, or a neighbor of one, was reached. */
  invalidate(tiles: number[]) {
    const { w, h } = this.g.state.map;
    const n = w * h;
    for (const [dest, f] of this.fields) {
      const hit = tiles.some((i) =>
        f[i] !== UNREACHED ||
        (i % w > 0 && f[i - 1] !== UNREACHED) || (i % w < w - 1 && f[i + 1] !== UNREACHED) ||
        (i >= w && f[i - w] !== UNREACHED) || (i + w < n && f[i + w] !== UNREACHED));
      if (hit) this.fields.delete(dest);
    }
  }

  clear() { this.fields.clear(); }
  get size() { return this.fields.size; }
}
