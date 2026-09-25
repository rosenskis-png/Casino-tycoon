// Amenities as places (docs/spec/construction.md): tiers, prices, the show schedule, room purposes, and what the
// casino's amenities do to who comes and why. Pure functions of state; the guest system acts on them.
import { GRADE_DEFAULT, gradeWorth, unitCost } from "../data/grades";
import { OBJECTS } from "../data/objects";
import { GUEST_TYPES, type GuestTypeDef, type Reason } from "../data/guests";
import { capacity, floorDraw, sightsDraw } from "./guests";
import type { RoomPurpose } from "../data/rooms";
import type { Game, Serves } from "./game";
import type { GuestData, PlacedObject } from "./state";
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
export const DRAWS: { intent: "dine" | "show" | "club" | "pool" | "golf"; serves: Serves }[] = [
  { intent: "dine", serves: "hunger" }, { intent: "show", serves: "show" }, { intent: "club", serves: "club" }, { intent: "pool", serves: "pool" },
  { intent: "golf", serves: "golf" },
];

/** (M11.2) A price against what it's worth to them: 1.5 when free, 0.55 at its worth, 0.2 at twice it. */
export const priceDraw = (price: number, worth: number) => 1.5 * Math.exp(-price / Math.max(1, worth));

/** (M11.2) What a place is worth to a type: a show ticket's worth, 30% of it for mini golf, the pool or a cover, 80% for a meal; a finer place is worth more. */
export function worthTo(type: GuestTypeDef, serves: Serves, tier: number, grade = GRADE_DEFAULT): number {
  const k = serves === "show" ? 1 : serves === "hunger" ? 0.8 : 0.3;
  return type.ticket * k * (1 + 0.25 * tier) * gradeWorth(type.luxe, grade);
}
/** (M11.4) What a priced place or bar serves: 0 cheap, 1 standard, 2 fancy. */
export const gradeOf = (o: PlacedObject | undefined) => o?.grade ?? GRADE_DEFAULT;
/** (M11.4) What one serving here costs the house (a drink, a meal, a show seat, a club entry, a swim, a round). */
export const servingCost = (o: PlacedObject) => unitCost(OBJECTS[o.kind].serves ?? "", gradeOf(o));

/**
 * (M11.2, owner) How well the casino offers each reason a type has to come: the gambling floor (seats, sublinearly,
 * times how well they suit the type, and tables for those who want them), a bar (more if the drinks are free), each
 * kind of place (finer is better, and the best price-for-worth one counts), and the sights (theming they like).
 */
export function offers(g: Game, type: GuestTypeDef): Record<Reason, number> {
  const out = { gamble: 0, drink: 0, dine: 0, show: 0, club: 0, pool: 0, golf: 0, sights: 0 } as Record<Reason, number>;
  out.gamble = g.gameSeats ? capacity(g) * floorDraw(g, type.id) * tablePull(g, type) : 0;
  let comp = 0;
  for (const o of g.amenities.thirst) comp = Math.max(comp, o.bar?.comp ?? 0);
  out.drink = g.amenities.thirst.length ? REASON_K * (1 + comp) / 2 : 0;
  for (const d of DRAWS) {
    let best = 0;
    for (const o of g.amenities[d.serves]) {
      const tier = tierOf(g, o);
      best = Math.max(best, REASON_K * (1 + 0.25 * tier) * priceDraw(priceFor(o), worthTo(type, d.serves, tier, gradeOf(o))) / 1.5);
    }
    out[d.intent] = best;
  }
  out.sights = REASON_K * sightsDraw(g, type.id);
  return out;
}
/** (M11.2) How much a good place, a bar or good theming draws next to the gambling floor (whose pull is its seats, about 1-2.5). */
const REASON_K = 3;

/** (M11.2) The casino's pull for a type: its reasons weighted by how well each is offered. Multiplies arrivals. */
export function reasonPull(g: Game, typeId: string): number {
  const type = GUEST_TYPES[typeId];
  if (!type) return 0;
  const o = offers(g, type);
  let sum = 0;
  for (const k of Object.keys(type.reasons) as Reason[]) sum += type.reasons[k] * o[k];
  return sum;
}

/**
 * Types that come for the tables (High rollers, docs/spec/tables.md) come far less to a casino without any, and
 * more to one with tables in a high-limit room.
 */
function tablePull(g: Game, type: GuestTypeDef): number {
  const d = type.tableDraw;
  if (!d) return 1;
  if (!g.tables.length) return 1 - d + d * 0.2;
  const hl = g.tables.some((o) => stakeMult(g, o) > 1);
  return 1 - d + d * (hl ? 1.5 : 1);
}

/** (M11.2) Why an arriving group came: a reason, in proportion to how much it draws them here (gambling if nothing does). */
export function pickIntent(g: Game, typeId: string, r: Rng): GuestData["intent"] {
  const type = GUEST_TYPES[typeId];
  if (!type) return "gamble";
  const o = offers(g, type), keys = Object.keys(type.reasons) as Reason[];
  let total = 0;
  for (const k of keys) total += type.reasons[k] * o[k];
  if (total <= 0) return "gamble";
  let u = r.next() * total;
  for (const k of keys) { const w = type.reasons[k] * o[k]; if (u < w) return k === "gamble" ? "gamble" : k === "dine" ? "dine" : k; u -= w; }
  return "gamble";
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
      for (const q of g.state.objects) if ((OBJECTS[q.kind].slot || OBJECTS[q.kind].game) && purposeOf(g, q) === "highlimit") ids.add(q.id);
    highLimit.set(g, (c = { rooms: g.rooms.rooms, ids }));
  }
  return c.ids.has(o.id) ? 5 : 1;
}
