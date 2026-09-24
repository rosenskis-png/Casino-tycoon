// Amenities as places (docs/spec/construction.md): tiers, prices, the show schedule, room purposes, and what the
// casino's amenities do to who comes and why. Pure functions of state; the guest system acts on them.
import { OBJECTS } from "../data/objects";
import { GUEST_TYPES, type GuestTypeDef } from "../data/guests";
import type { RoomPurpose } from "../data/rooms";
import type { Game, Serves } from "./game";
import type { PlacedObject } from "./state";
import type { Rng } from "./rng";
import { sizeTier } from "./geometry";
import { TICKS_PER_SECOND } from "./clock";

/** Purpose of the room tile i is in ("" for none or no room). */
export function purposeAt(g: Game, i: number): RoomPurpose | "" {
  const id = g.rooms.roomOf[i], room = id >= 0 ? g.rooms.rooms[id] : undefined;
  return room && room.meta >= 0 ? g.state.roomMeta[room.meta]?.purpose ?? "" : "";
}

/** Purpose of the room an object stands in: its first open cell or seat, else its own tile. */
export function purposeOf(g: Game, o: PlacedObject): RoomPurpose | "" {
  const st = g.seatTiles.get(o.id);
  return purposeAt(g, st ? st[0] : o.y * g.state.map.w + o.x);
}

/** An amenity's tier: from its seats, one finer inside a room given over to it. */
export function tierOf(g: Game, o: PlacedObject): number {
  const z = OBJECTS[o.kind].sized;
  if (!z) return 0;
  const t = sizeTier(o) + (z.purpose && purposeOf(g, o) === z.purpose ? 1 : 0);
  return Math.min(z.tiers.length - 1, t);
}

export const tierName = (g: Game, o: PlacedObject) => OBJECTS[o.kind].sized?.tiers[tierOf(g, o)] ?? OBJECTS[o.kind].name;

/** What a guest pays per use: a meal (base × multiplier), a show ticket, a club's cover. */
export function priceFor(o: PlacedObject): number {
  const def = OBJECTS[o.kind];
  if (def.serves === "hunger") return Math.round((def.price ?? 0) * (o.price ?? 1) * 100) / 100;
  if (def.serves === "garden") return 0;
  return o.price ?? def.price ?? 0;
}

/** Price guests take without complaint rises 25% per tier. */
export const priceTolerance = (g: Game, o: PlacedObject) => 1 + 0.25 * tierOf(g, o);

// Shows: every lounge runs one every SHOW_EVERY seconds (offset per lounge), SHOW_LENGTH long; seats fill from
// SEATING seconds before.
export const SHOW_EVERY = 100;
export const SHOW_LENGTH = 45;
const SEATING = 30;

/** Where a lounge's show is at: "on", "seating" (about to start), or "off"; and ticks until that phase ends. */
export function showPhase(o: PlacedObject, tick: number): { phase: "on" | "seating" | "off"; left: number } {
  const P = SHOW_EVERY * TICKS_PER_SECOND;
  const t = (tick + ((o.id * 37) % SHOW_EVERY) * TICKS_PER_SECOND) % P;
  if (t < SHOW_LENGTH * TICKS_PER_SECOND) return { phase: "on", left: SHOW_LENGTH * TICKS_PER_SECOND - t };
  if (t >= P - SEATING * TICKS_PER_SECOND) return { phase: "seating", left: P - t };
  return { phase: "off", left: P - SEATING * TICKS_PER_SECOND - t };
}

/** The kinds of place people come for, and what they serve. */
export const DRAWS: { intent: "dine" | "show" | "club" | "pool"; serves: Serves }[] = [
  { intent: "dine", serves: "hunger" }, { intent: "show", serves: "show" }, { intent: "club", serves: "club" }, { intent: "pool", serves: "pool" },
];

/** Each kind the casino has pulls its share of a type (more for a finer one): comeFor × (1 + 0.25 × best tier). */
function pulls(g: Game, type: GuestTypeDef): number[] {
  return DRAWS.map((d) => {
    const list = g.amenities[d.serves];
    if (!list.length || !type.comeFor[d.intent]) return 0;
    let best = 0;
    for (const o of list) best = Math.max(best, tierOf(g, o));
    return type.comeFor[d.intent] * (1 + 0.25 * best);
  });
}

/** Extra arrivals a type makes because of what the casino has (a multiplier: 1 + pull). */
export function amenityPull(g: Game, typeId: string): number {
  const type = GUEST_TYPES[typeId];
  return type ? 1 + pulls(g, type).reduce((a, b) => a + b, 0) : 1;
}

/** Why an arriving group came: a meal, a show, the club (at the share of arrivals those pulls account for), or undefined. */
export function pickIntent(g: Game, typeId: string, r: Rng): "dine" | "show" | "club" | "pool" | undefined {
  const type = GUEST_TYPES[typeId];
  if (!type) return undefined;
  const p = pulls(g, type), total = 1 + p.reduce((a, b) => a + b, 0);
  if (total === 1) return undefined;
  let u = r.next() * total;
  for (let k = 0; k < p.length; k++) { if (u < p[k]) return DRAWS[k].intent; u -= p[k]; }
  return undefined;
}

/**
 * Machines standing in a high-limit room (runtime cache, rebuilt whenever rooms are re-detected: every layout or
 * purpose change makes a new room list).
 */
const highLimit = new WeakMap<Game, { rooms: unknown; ids: Set<number> }>();

/** Stake multiplier for a machine: 5 in a high-limit room. */
export function stakeMult(g: Game, o: PlacedObject): number {
  let c = highLimit.get(g);
  if (!c || c.rooms !== g.rooms.rooms) {
    const ids = new Set<number>();
    if (g.state.roomMeta.some((m) => m.purpose === "highlimit"))
      for (const q of g.state.objects) if (OBJECTS[q.kind].slot && purposeOf(g, q) === "highlimit") ids.add(q.id);
    highLimit.set(g, (c = { rooms: g.rooms.rooms, ids }));
  }
  return c.ids.has(o.id) ? 5 : 1;
}
