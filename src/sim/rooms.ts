// Room detection by flood fill (FOUNDATIONS §3). Rooms are derived; only names/purposes are saved (RoomMeta),
// keyed by an anchor tile so they survive re-detection.
import { T } from "../data/terrain";
import type { GameState } from "./state";

export interface Room {
  id: number;
  indoor: boolean;
  size: number;
  /** Lowest tile index in the room. */
  first: number;
  x0: number; y0: number; x1: number; y1: number;
  /** Index into state.roomMeta, or -1. */
  meta: number;
}

export class RoomIndex {
  roomOf = new Int32Array(0);
  rooms: Room[] = [];
  private nearCache: { id: number; d: number }[][] | null = null;
  private reach = 0;

  detect(s: GameState) {
    const { w, h, terrain, outdoor } = s.map;
    const n = w * h;
    const roomOf = new Int32Array(n).fill(-1);
    const rooms: Room[] = [];
    const stack: number[] = [];
    for (let start = 0; start < n; start++) {
      if (terrain[start] !== T.FLOOR || roomOf[start] >= 0) continue;
      const id = rooms.length;
      const out = outdoor[start];
      const r: Room = { id, indoor: out === 0, size: 0, first: start, x0: w, y0: h, x1: 0, y1: 0, meta: -1 };
      roomOf[start] = id;
      stack.push(start);
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % w, y = (i - x) / w;
        r.size++;
        if (x < r.x0) r.x0 = x; if (x > r.x1) r.x1 = x;
        if (y < r.y0) r.y0 = y; if (y > r.y1) r.y1 = y;
        const visit = (j: number) => {
          if (roomOf[j] < 0 && terrain[j] === T.FLOOR && outdoor[j] === out) { roomOf[j] = id; stack.push(j); }
        };
        if (x > 0) visit(i - 1);
        if (x < w - 1) visit(i + 1);
        if (y > 0) visit(i - w);
        if (y < h - 1) visit(i + w);
      }
      rooms.push(r);
    }
    s.roomMeta.forEach((m, k) => {
      const id = roomOf[m.anchor];
      if (id >= 0 && rooms[id].meta < 0) rooms[id].meta = k;
    });
    this.roomOf = roomOf;
    this.rooms = rooms;
    this.nearCache = null;
  }

  /**
   * (M11.1) Rooms within `reach` tiles of each room (walls and other rooms crossed freely), with the distance
   * between their nearest tiles. Built lazily after each detection: a breadth-first search out of each room.
   */
  near(s: GameState, reach: number): { id: number; d: number }[][] {
    if (this.nearCache && this.reach === reach) return this.nearCache;
    const { w, h } = s.map, n = w * h, roomOf = this.roomOf;
    const seen = new Int32Array(n).fill(-1);
    const members: number[][] = this.rooms.map(() => []);
    for (let i = 0; i < n; i++) if (roomOf[i] >= 0) members[roomOf[i]].push(i);
    const out = this.rooms.map(() => [] as { id: number; d: number }[]);
    let q: number[] = [], next: number[] = [];
    for (const r of this.rooms) {
      const best = new Map<number, number>();
      q = members[r.id].slice();
      for (const i of q) seen[i] = r.id;
      for (let d = 1; d <= reach && q.length; d++) {
        next = [];
        for (const i of q) {
          const x = i % w, y = (i - x) / w;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const X = x + dx, Y = y + dy;
            if ((!dx && !dy) || X < 0 || Y < 0 || X >= w || Y >= h) continue;
            const j = Y * w + X;
            if (seen[j] === r.id) continue;
            seen[j] = r.id;
            const o = roomOf[j];
            if (o >= 0 && o !== r.id) { if (!best.has(o)) best.set(o, d); }
            next.push(j);
          }
        }
        q = next;
      }
      for (const [id, d] of best) out[r.id].push({ id, d });
    }
    this.nearCache = out;
    this.reach = reach;
    return out;
  }

  /** Drops saved room metadata whose room vanished or merged into another named room. Mutates state: sim only. */
  reconcile(s: GameState) {
    const keep = s.roomMeta.filter((m, k) => {
      const id = this.roomOf[m.anchor];
      return id >= 0 && this.rooms[id].meta === k;
    });
    if (keep.length !== s.roomMeta.length) { s.roomMeta = keep; this.detect(s); }
  }
}
