// Object geometry: footprint, cells and seats after rotation. Rotation r turns the object r quarter-turns
// clockwise, so its front faces down (0), left (1), up (2), right (3). Sized amenities (M6) carry their own
// w × h (front width × depth, in their own frame) and get cells and seats from sim/layout.ts; fixed objects use
// their definition's size and seats.
import { OBJECTS, type ObjectDef, type SeatDef } from "../data/objects";
import { sizedLayout, tierFor, type Cell } from "./layout";
import { slotPrice } from "./design/lookup";
import type { GameState } from "./state";

export interface Seat { x: number; y: number; kind: SeatDef["kind"]; /** Facing after rotation (0 down, 1 left, 2 up, 3 right). */ f: number }

/** Anything with a kind, position, rotation and (for sized amenities) a size. */
export interface Placed { kind: string; x: number; y: number; rot: number; w?: number; h?: number; design?: string }

/** Local (dx, dy) in the rotation-0 frame of a w×h box → offset in the rotated footprint. */
function turn(dx: number, dy: number, w: number, h: number, rot: number): [number, number] {
  switch (rot & 3) {
    case 1: return [h - 1 - dy, dx];
    case 2: return [w - 1 - dx, h - 1 - dy];
    case 3: return [dy, w - 1 - dx];
    default: return [dx, dy];
  }
}

/** Size in the object's own frame (front width × depth). */
export function dims(p: Placed): { w: number; h: number } {
  const def = OBJECTS[p.kind];
  return def.sized ? { w: p.w ?? def.w, h: p.h ?? def.h } : { w: def.w, h: def.h };
}

const FIXED_SOLID: Cell = { k: "solid", block: true, opaque: false };

function frame(p: Placed) {
  const def = OBJECTS[p.kind], d = dims(p);
  const L = def.sized ? sizedLayout(def.sized, d.w, d.h) : null;
  return { def, d, L };
}

export function objSize(p: Placed): { w: number; h: number } {
  const d = dims(p);
  return p.rot & 1 ? { w: d.h, h: d.w } : d;
}

export function objFootprint(p: Placed): { x: number; y: number }[] {
  const { w, h } = objSize(p);
  const out: { x: number; y: number }[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: p.x + dx, y: p.y + dy });
  return out;
}

/** Every footprint tile with what stands there: walkable cells of sized amenities have block false. */
export function objCells(p: Placed): { x: number; y: number; dx: number; dy: number; c: Cell }[] {
  const { def, d, L } = frame(p);
  const solidCell: Cell = def.blocks ? { ...FIXED_SOLID, opaque: !!def.opaque } : { k: "solid", block: false, opaque: false };
  const out: { x: number; y: number; dx: number; dy: number; c: Cell }[] = [];
  for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) {
    const [ox, oy] = turn(dx, dy, d.w, d.h, p.rot);
    out.push({ x: p.x + ox, y: p.y + oy, dx, dy, c: L ? L.cells[dy * d.w + dx] : solidCell });
  }
  return out;
}

export function objSeats(p: Placed): Seat[] {
  const { def, d, L } = frame(p);
  return (L ? L.seats : def.seats).map((s) => {
    const [dx, dy] = turn(s.dx, s.dy, d.w, d.h, p.rot);
    return { x: p.x + dx, y: p.y + dy, kind: s.kind, f: ((s.f ?? 0) + p.rot) & 3 };
  });
}

/** Staff behind the counter (bartenders, cooks, tellers, performers, the DJ), rotated. */
export function objStaff(p: Placed): { x: number; y: number; k: string }[] {
  const { d, L } = frame(p);
  if (!L) return [];
  return L.staff.map((s) => {
    const [dx, dy] = turn(s.dx, s.dy, d.w, d.h, p.rot);
    return { x: p.x + dx, y: p.y + dy, k: s.k };
  });
}

export function seatCount(p: Placed): number {
  const { def, L } = frame(p);
  return L ? L.seats.length : def.seats.length;
}

/** Tier of a sized amenity from its seats (a matching room purpose adds one: sim/rooms.ts), else 0. */
export function sizeTier(p: Placed): number {
  const def = OBJECTS[p.kind];
  return def.sized ? tierFor(def.sized, seatCount(p)) : 0;
}

/** Build cost and monthly upkeep for an object at its size. */
/** Build price and monthly upkeep. Slots (M8) cost what their design's cabinet does; pass the state to look it up. */
export function priceOf(p: Placed, s?: GameState): { cost: number; upkeep: number } {
  const sp = slotPrice(s, p.kind, p.design);
  if (sp) return sp;
  const { def, d, L } = frame(p);
  if (!def.sized || !L) return { cost: def.cost, upkeep: def.upkeep };
  const [cb, ct] = def.sized.cost, [ub, us, uf] = def.sized.upkeep;
  return { cost: cb + ct * d.w * d.h, upkeep: ub + us * L.seats.length + uf * L.staff.length };
}

/** Whether a size is allowed for this kind. */
export function sizeOk(def: ObjectDef, w: number, h: number): boolean {
  const z = def.sized;
  if (!z) return w === def.w && h === def.h;
  return Number.isInteger(w) && Number.isInteger(h) && w >= z.min[0] && h >= z.min[1] && w <= z.max[0] && h <= z.max[1];
}

/** True when tile (x, y) lies in the object's footprint. */
export function covers(p: Placed, x: number, y: number): boolean {
  const { w, h } = objSize(p);
  return x >= p.x && y >= p.y && x < p.x + w && y < p.y + h;
}
