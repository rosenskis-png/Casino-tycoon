// Object geometry: footprint and seats after rotation. Rotation r turns the object r quarter-turns clockwise,
// so its front faces down (0), left (1), up (2), right (3).
import { OBJECTS, type ObjectDef, type SeatDef } from "../data/objects";

export interface Seat { x: number; y: number; kind: SeatDef["kind"] }

/** Local (dx, dy) in the rotation-0 frame of a w×h box → offset in the rotated footprint. */
function turn(dx: number, dy: number, w: number, h: number, rot: number): [number, number] {
  switch (rot & 3) {
    case 1: return [h - 1 - dy, dx];
    case 2: return [w - 1 - dx, h - 1 - dy];
    case 3: return [dy, w - 1 - dx];
    default: return [dx, dy];
  }
}

export function size(def: ObjectDef, rot: number): { w: number; h: number } {
  return rot & 1 ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}

export function footprint(def: ObjectDef, x: number, y: number, rot: number): { x: number; y: number }[] {
  const { w, h } = size(def, rot);
  const out: { x: number; y: number }[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: x + dx, y: y + dy });
  return out;
}

export function seats(def: ObjectDef, x: number, y: number, rot: number): Seat[] {
  return def.seats.map((s) => {
    const [dx, dy] = turn(s.dx, s.dy, def.w, def.h, rot);
    return { x: x + dx, y: y + dy, kind: s.kind };
  });
}

export const objSeats = (o: { kind: string; x: number; y: number; rot: number }) => seats(OBJECTS[o.kind], o.x, o.y, o.rot);
export const objSize = (o: { kind: string; rot: number }) => size(OBJECTS[o.kind], o.rot);

/** True when tile (x, y) lies in the object's footprint. */
export function covers(o: { kind: string; x: number; y: number; rot: number }, x: number, y: number): boolean {
  const { w, h } = objSize(o);
  return x >= o.x && y >= o.y && x < o.x + w && y < o.y + h;
}
