// Construction (FOUNDATIONS §3): walls, doors, demolition, placing and selling objects, naming rooms.
import { BUILD_COST, T } from "../data/terrain";
import { OBJECTS } from "../data/objects";
import { ROOM_PURPOSES, type RoomPurpose } from "../data/rooms";
import { SCENARIOS } from "../data/scenarios";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { PlacedObject } from "./state";
import { objCells, objFootprint, objSeats, priceOf, sizeOk, type Placed } from "./geometry";
import { clearDoor } from "./doors";
import { idx, inBounds } from "./map";
import { post } from "./finance";

declare module "./commands" {
  interface CommandTypes {
    build: { what: "wall" | "door" | "demolish"; tiles: number[] };
    /** w × h: a sized amenity's front width and depth (its own frame); omitted for fixed-size objects. */
    place: { kind: string; x: number; y: number; rot: number; w?: number; h?: number };
    remove: { id: number };
    setRoom: { tile: number; name?: string; purpose?: RoomPurpose };
    /** A restaurant's price multiplier, a show's ticket or a club's cover charge. */
    setPrice: { id: number; price: number };
    /** Buy a land parcel the scenario offers (M6.5). */
    buyParcel: { id: string };
  }
}

function buildable(g: Game, what: "wall" | "door" | "demolish", i: number): boolean {
  const m = g.state.map;
  if (i < 0 || i >= m.terrain.length || m.fixed[i]) return false;
  const t = m.terrain[i];
  if (what === "wall") return t === T.FLOOR && !g.occ[i] && !g.objAt[i] && !g.seatAt[i] && !m.entrances.includes(i);
  if (what === "door") return t === T.WALL;
  return t === T.WALL || t === T.DOOR;
}

/** A placement as a Placed (size only for sized amenities). */
export function placed(kind: string, x: number, y: number, rot: number, w?: number, h?: number): Placed {
  const def = OBJECTS[kind];
  return def?.sized ? { kind, x, y, rot: rot & 3, w: w ?? def.w, h: h ?? def.h } : { kind, x, y, rot: rot & 3 };
}

/** Footprint and seat tiles for a placement, or a player-readable reason it can't go there. */
export function placement(g: Game, p: Placed): { tiles: number[]; seats: number[] } | string {
  const def = OBJECTS[p.kind];
  if (!def) return "Unknown object";
  if (def.sized && !sizeOk(def, p.w!, p.h!)) {
    const z = def.sized;
    return `Size ${z.min[0]}–${z.max[0]} wide, ${z.min[1]}–${z.max[1]} deep`;
  }
  const m = g.state.map;
  const tiles: number[] = [];
  for (const q of objFootprint(p)) {
    if (!inBounds(m, q.x, q.y)) return "Off the map";
    const i = idx(m, q.x, q.y);
    if (m.terrain[i] !== T.FLOOR) return "Needs open floor";
    if (g.occ[i] || g.objAt[i]) return "Something is already there";
    if (g.seatAt[i]) return "That's where someone sits";
    if (m.entrances.includes(i)) return "Keep the entrance clear";
    if (def.place === "indoor" && m.outdoor[i]) return "Indoors only";
    if (def.place === "outdoor" && !m.outdoor[i]) return "Outdoors only";
    tiles.push(i);
  }
  const seatTiles: number[] = [];
  for (const q of objSeats(p)) {
    if (!inBounds(m, q.x, q.y)) return "No room in front";
    const i = idx(m, q.x, q.y);
    if (seatTiles.includes(i)) continue;
    seatTiles.push(i);
    // Seats inside the footprint are the amenity's own open floor.
    if (tiles.includes(i)) continue;
    if (m.terrain[i] !== T.FLOOR || g.occ[i] || g.objAt[i]) return "Needs open floor in front";
    if (g.seatAt[i]) return "Blocks another seat";
    if (m.outdoor[i] !== m.outdoor[tiles[0]]) return "Needs open floor in front";
  }
  return { tiles, seats: seatTiles };
}

export function objectTiles(o: PlacedObject, w: number): number[] {
  return objFootprint(o).map((p) => p.y * w + p.x);
}

/** Blocking cells of an object (for staff standing beside the counter, etc.). */
export const solidTiles = (o: PlacedObject, w: number) => objCells(o).filter((c) => c.c.block).map((c) => c.y * w + c.x);

/** Land the scenario sells that fits this map: its price, size, whether it's bought, and a tile test. */
export function landForSale(g: Game): { id: string; name: string; price: number; tiles: number; owned: boolean; at: (i: number) => boolean }[] {
  const m = g.state.map;
  return (SCENARIOS[g.state.scenario]?.parcels ?? [])
    .filter((p) => p.rects.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= m.w && r.y + r.h <= m.h))
    .map((p) => ({
      id: p.id, name: p.name, price: p.price, owned: g.state.parcels.includes(p.id),
      tiles: p.rects.reduce((a, r) => a + r.w * r.h, 0),
      at: (i: number) => p.rects.some((r) => { const x = i % m.w, y = Math.floor(i / m.w); return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }),
    }));
}

/** Tiles of a parcel that are still unowned land. */
export function parcelTiles(g: Game, id: string): number[] {
  const p = SCENARIOS[g.state.scenario]?.parcels?.find((q) => q.id === id), m = g.state.map, out: number[] = [];
  for (const r of p?.rects ?? []) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++)
    if (inBounds(m, x, y) && m.terrain[idx(m, x, y)] === T.VOID) out.push(idx(m, x, y));
  return out;
}

const commands: CommandTable<"build" | "place" | "remove" | "setRoom" | "setPrice" | "buyParcel"> = {
  build: {
    validate(g, c) {
      const ok = c.tiles.filter((i) => buildable(g, c.what, i));
      if (!ok.length) return c.what === "door" ? "Doors go in walls you built" : c.what === "wall" ? "Can't build a wall there" : "Nothing to demolish there";
      if (ok.length * BUILD_COST[c.what] > g.state.cash) return "Not enough cash";
      return null;
    },
    apply(g, c) {
      const m = g.state.map;
      const tiles = [...new Set(c.tiles)].filter((i) => buildable(g, c.what, i));
      for (const i of tiles) {
        if (m.terrain[i] === T.DOOR) clearDoor(g.state, i);
        m.terrain[i] = c.what === "wall" ? T.WALL : c.what === "door" ? T.DOOR : T.FLOOR;
      }
      post(g, "build", -tiles.length * BUILD_COST[c.what]);
      g.tilesChanged(tiles);
      g.bus.emit({ type: "sound", id: c.what === "demolish" ? "demolish" : "build" });
    },
  },
  place: {
    validate(g, c) {
      const p = placed(c.kind, c.x, c.y, c.rot, c.w, c.h);
      const f = placement(g, p);
      if (typeof f === "string") return f;
      if (priceOf(p).cost > g.state.cash) return "Not enough cash";
      return null;
    },
    apply(g, c) {
      const p = placed(c.kind, c.x, c.y, c.rot, c.w, c.h);
      const f = placement(g, p) as { tiles: number[]; seats: number[] };
      const id = g.state.nextId++;
      g.state.objects.push(newObject(id, c.kind, c.x, c.y, c.rot & 3, g.state.tick, p.w, p.h));
      post(g, "build", -priceOf(p).cost);
      g.rebuildOccupancy();
      g.tilesChanged([...f.tiles, ...f.seats]);
      g.bus.emit({ type: "objectPlaced", id, kind: c.kind, x: c.x, y: c.y });
      g.bus.emit({ type: "sound", id: "place" });
    },
  },
  remove: {
    validate: (g, c) => (g.objById.has(c.id) ? null : "Already gone"),
    apply(g, c) {
      const o = g.objById.get(c.id)!;
      const w = g.state.map.w;
      const tiles = [...objectTiles(o, w), ...objSeats(o).map((s) => s.y * w + s.x)];
      g.state.objects = g.state.objects.filter((x) => x.id !== c.id);
      post(g, "sales", priceOf(o).cost / 2);
      g.rebuildOccupancy();
      g.tilesChanged(tiles);
      g.bus.emit({ type: "objectRemoved", id: o.id, x: o.x, y: o.y });
      g.bus.emit({ type: "sound", id: "demolish" });
    },
  },
  setRoom: {
    validate(g, c) {
      if (g.rooms.roomOf[c.tile] === undefined || g.rooms.roomOf[c.tile] < 0) return "Not a room";
      if (c.purpose && !(c.purpose in ROOM_PURPOSES)) return "Unknown purpose";
      if (c.name !== undefined && c.name.length > 40) return "Name too long";
      return null;
    },
    apply(g, c) {
      const room = g.rooms.rooms[g.rooms.roomOf[c.tile]];
      let meta = room.meta >= 0 ? g.state.roomMeta[room.meta] : null;
      if (!meta) { meta = { anchor: c.tile, name: "", purpose: "floor" }; g.state.roomMeta.push(meta); }
      if (c.name !== undefined) meta.name = c.name.trim();
      const changed = !!c.purpose && c.purpose !== meta.purpose;
      if (c.purpose) meta.purpose = c.purpose;
      g.rooms.detect(g.state);
      // A purpose changes what the room gives off (smoke, prestige) and the tier of amenities inside.
      if (changed) {
        const r = room, w = g.state.map.w;
        g.fields.tilesChanged([r.y0 * w + r.x0, r.y1 * w + r.x1]);
      }
      g.bus.emit({ type: "roomsChanged" });
    },
  },
  setPrice: {
    validate(g, c) {
      const o = g.objById.get(c.id), range = o && OBJECTS[o.kind].priceRange;
      if (!range) return "No price to set";
      return c.price >= range[0] && c.price <= range[1] ? null : "Price out of range";
    },
    apply(g, c) { g.objById.get(c.id)!.price = Math.round(c.price * 100) / 100; },
  },
  buyParcel: {
    validate(g, c) {
      const p = SCENARIOS[g.state.scenario]?.parcels?.find((q) => q.id === c.id);
      if (!p) return "No such land";
      if (g.state.parcels.includes(c.id)) return "Already yours";
      // Saves from before the map grew don't have this land on their map.
      const m = g.state.map;
      if (p.rects.some((r) => r.x < 0 || r.y < 0 || r.x + r.w > m.w || r.y + r.h > m.h) || !parcelTiles(g, c.id).length) return "Not on this map";
      if (p.price > g.state.cash) return "Not enough cash";
      return null;
    },
    apply(g, c) {
      const p = SCENARIOS[g.state.scenario]!.parcels!.find((q) => q.id === c.id)!, m = g.state.map;
      const tiles = parcelTiles(g, c.id);
      // Bought land becomes owned outdoor ground.
      for (const i of tiles) { m.terrain[i] = T.FLOOR; m.outdoor[i] = 1; m.fixed[i] = 0; }
      g.state.parcels.push(c.id);
      post(g, "land", -p.price);
      g.tilesChanged(tiles);
      g.bus.emit({ type: "sound", id: "build" });
    },
  },
};

export function newObject(id: number, kind: string, x: number, y: number, rot: number, built = 0, w?: number, h?: number): PlacedObject {
  const o: PlacedObject = { id, kind, x, y, rot, broken: 0, last: { tick: -1, win: 0 }, st: { rounds: 0, coinIn: 0, paidOut: 0, sessions: 0, playTicks: 0, uses: 0 }, built };
  const def = OBJECTS[kind];
  if (def?.sized) { o.w = w ?? def.w; o.h = h ?? def.h; }
  if (def?.priceRange) o.price = def.serves === "hunger" ? 1 : def.price ?? 0;
  // Bars carry their own drink policy (docs/spec/guests.md §Drinks): standard price, no comps, standard strength, anywhere.
  if (OBJECTS[kind]?.serves === "thirst") o.bar = { price: 1, comp: 0, strength: 1, area: -1 };
  return o;
}

export const buildSystem: System = { id: "build", commands };
