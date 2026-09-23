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
