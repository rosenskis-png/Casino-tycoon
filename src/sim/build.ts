// Construction (FOUNDATIONS §3): walls, doors, demolition, placing and selling objects, naming rooms.
import { GRADES } from "../data/grades";
import { BUILD_COST, T } from "../data/terrain";
import { OBJECTS } from "../data/objects";
import { ROOM_PURPOSES, type RoomPurpose } from "../data/rooms";
import { SCENARIOS } from "../data/scenarios";
import type { Game } from "./game";
import { cabKind, cabOfKind, cantUse, designById, designLocks } from "./design";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Blueprint, BlueprintPiece, PlacedObject } from "./state";
import { objCells, objFootprint, objSeats, objSize, priceOf, sizeOk, type Placed } from "./geometry";
import { clearDoor } from "./doors";
import { besideSidewalk, idx, inBounds, recomputeOutdoor } from "./map";
import { post } from "./finance";
import { crewAmenity } from "./crew";
import { locked, projectFor } from "./research";
import { RESEARCH } from "../data/research";
import { CLUB_TRACKS } from "../data/music";

declare module "./commands" {
  interface CommandTypes {
    /** entrance: a new way in from the sidewalk, on lot ground beside it. */
    build: { what: "wall" | "door" | "demolish" | "entrance"; tiles: number[] };
    /** w × h: a sized amenity's front width and depth (its own frame); omitted for fixed-size objects. */
    place: { kind: string; x: number; y: number; rot: number; w?: number; h?: number; design?: string };
    remove: { id: number };
    /** (M11.2) Pick an object up and put it down elsewhere (fixed-size objects only), for a small fee. */
    move: { id: number; x: number; y: number; rot: number };
    setRoom: { tile: number; name?: string; purpose?: RoomPurpose };
    /** A restaurant's price multiplier, a show's ticket or a club's cover charge. */
    setPrice: { id: number; price: number };
    setGrade: { id: number; grade: number };
    /** Buy a land parcel the scenario offers (M6.5). */
    buyParcel: { id: string };
    /** (M10) The track a nightclub plays (data/music.ts CLUB_TRACKS). */
    setTrack: { id: number; track: number };
    /** (2026-09-26, owner) Keep these objects' layout as a named group, to build again elsewhere; forget one. */
    saveGroup: { name: string; ids: number[] };
    dropGroup: { i: number };
  }
}

/** How many groups a casino keeps, and pieces in one. */
export const MAX_GROUPS = 24, MAX_GROUP_PIECES = 120;

/** A group of placed objects as a blueprint: each piece from the group's top-left corner (footprints only). */
export function blueprintOf(objs: PlacedObject[], name: string): Blueprint {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of objs) for (const p of objFootprint(o)) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const items: BlueprintPiece[] = objs.map((o) => {
    const it: BlueprintPiece = { kind: o.kind, dx: o.x - x0, dy: o.y - y0, rot: o.rot & 3 };
    if (OBJECTS[o.kind].sized) { it.w = o.w; it.h = o.h; }
    if (o.design !== undefined) it.design = o.design;
    return it;
  });
  return { name, w: x1 - x0 + 1, h: y1 - y0 + 1, items };
}

/**
 * The place commands that build group `bp` with its top-left corner at (x, y), turned `rot` quarter turns clockwise
 * as a whole (each piece's box turns with it, and each piece turns with it).
 */
export function groupPlacements(bp: Blueprint, x: number, y: number, rot: number): Placed[] {
  let items = bp.items.map((it) => ({ ...it })), W = bp.w, H = bp.h;
  for (let k = 0; k < (rot & 3); k++) {
    items = items.map((it) => {
      const sz = objSize({ kind: it.kind, x: 0, y: 0, rot: it.rot, w: it.w, h: it.h });
      return { ...it, dx: H - it.dy - sz.h, dy: it.dx, rot: (it.rot + 1) & 3 };
    });
    [W, H] = [H, W];
  }
  return items.map((it) => {
    const p: Placed = { kind: it.kind, x: x + it.dx, y: y + it.dy, rot: it.rot };
    if (it.w !== undefined) { p.w = it.w; p.h = it.h; }
    if (it.design !== undefined) p.design = it.design;
    return p;
  });
}

type Build = "wall" | "door" | "demolish" | "entrance";

function buildable(g: Game, what: Build, i: number): boolean {
  const m = g.state.map;
  if (i < 0 || i >= m.terrain.length) return false;
  const t = m.terrain[i];
  // Every wall and door is the player's to change, the building's shell included (saves from before kept it fixed).
  if (m.fixed[i] && t !== T.WALL && t !== T.DOOR) return false;
  const clear = !g.occ[i] && !g.objAt[i] && !g.seatAt[i] && !m.entrances.includes(i);
  if (what === "wall") return t === T.FLOOR && clear;
  if (what === "entrance") return t === T.FLOOR && !!m.outdoor[i] && clear && besideSidewalk(m, i);
  if (what === "door") return t === T.WALL;
  return t === T.WALL || t === T.DOOR;
}

const REFUSED: Record<Build, string> = {
  wall: "Can't build a wall there", door: "Doors go in walls", demolish: "Nothing to demolish there",
  entrance: "Entrances go on your land beside the sidewalk",
};

/** A placement as a Placed (size only for sized amenities). */
export function placed(kind: string, x: number, y: number, rot: number, w?: number, h?: number, design?: string): Placed {
  const def = OBJECTS[kind];
  return def?.sized ? { kind, x, y, rot: rot & 3, w: w ?? def.w, h: h ?? def.h } : design !== undefined ? { kind, x, y, rot: rot & 3, design } : { kind, x, y, rot: rot & 3 };
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

/** (M11.2) Anything guests gamble at: slots, video poker, tables, the draw games, the sportsbook. */
export const isGameKind = (kind: string) => { const d = OBJECTS[kind]; return !!d && (d.cat === "game" || d.cat === "table" || !!d.slot || !!d.game); };

/** (M11.2) What moving an object costs. */
export const MOVE_COST = 50;

/** Where a moved object would stand: checked with the object itself lifted off the floor. */
function movedPlacement(g: Game, o: PlacedObject, x: number, y: number, rot: number) {
  const p: Placed = o.design !== undefined ? { kind: o.kind, x, y, rot: rot & 3, design: o.design } : { kind: o.kind, x, y, rot: rot & 3 };
  const all = g.state.objects;
  g.state.objects = all.filter((q) => q !== o);
  g.rebuildOccupancy();
  const f = placement(g, p);
  g.state.objects = all;
  g.rebuildOccupancy();
  return { p, f };
}

const commands: CommandTable<"build" | "place" | "remove" | "move" | "setRoom" | "setPrice" | "setGrade" | "buyParcel" | "setTrack" | "saveGroup" | "dropGroup"> = {
  saveGroup: {
    validate(g, c) {
      const ids = [...new Set(c.ids)];
      if (!ids.length) return "Pick something first";
      if (ids.length > MAX_GROUP_PIECES) return `At most ${MAX_GROUP_PIECES} pieces in a group`;
      if (ids.some((id) => !g.objById.has(id))) return "Something picked is gone";
      if (ids.some((id) => OBJECTS[g.objById.get(id)!.kind].scenarioOnly)) return "Scenario pieces can't be copied";
      if ((g.state.groups ?? []).length >= MAX_GROUPS) return `At most ${MAX_GROUPS} groups: delete one first`;
      return null;
    },
    apply(g, c) {
      const objs = [...new Set(c.ids)].map((id) => g.objById.get(id)!);
      const name = c.name.trim().slice(0, 30) || `Group ${(g.state.groups ?? []).length + 1}`;
      (g.state.groups ??= []).push(blueprintOf(objs, name));
    },
  },
  dropGroup: {
    validate: (g, c) => (g.state.groups?.[c.i] ? null : "No such group"),
    apply(g, c) { g.state.groups.splice(c.i, 1); },
  },
  build: {
    validate(g, c) {
      const ok = c.tiles.filter((i) => buildable(g, c.what, i));
      if (!ok.length) return REFUSED[c.what] ?? "Can't build that";
      if (ok.length * BUILD_COST[c.what] > g.state.cash) return "Not enough cash";
      return null;
    },
    apply(g, c) {
      const m = g.state.map;
      const tiles = [...new Set(c.tiles)].filter((i) => buildable(g, c.what, i));
      if (c.what === "entrance") m.entrances.push(...tiles);
      else for (const i of tiles) {
        if (m.terrain[i] === T.DOOR) clearDoor(g.state, i);
        m.terrain[i] = c.what === "wall" ? T.WALL : c.what === "door" ? T.DOOR : T.FLOOR;
        m.fixed[i] = 0;
      }
      post(g, "build", -tiles.length * BUILD_COST[c.what]);
      // Walls that close in lot ground make it indoors; a gap to the lot makes a room outdoors.
      g.tilesChanged(c.what === "entrance" ? tiles : [...tiles, ...recomputeOutdoor(m)]);
      g.bus.emit({ type: "sound", id: c.what === "demolish" ? "demolish" : "build" });
    },
  },
  place: {
    validate(g, c) {
      if (OBJECTS[c.kind]?.scenarioOnly) return "Can't build that";
      // (M11.2) The tutorial: the games you start with are all you get.
      if (SCENARIOS[g.state.scenario]?.noGames && isGameKind(c.kind)) return "No new games here: make the most of the ones you have";
      // M9.5: some things need research first.
      if (locked(g.state, c.kind)) return `Needs research: ${RESEARCH[projectFor(c.kind)].name}`;
      // M8: a slot cabinet plays a design (certified, or run uncertified), placed as its own cabinet.
      if (c.design !== undefined) {
        const d = designById(g.state, c.design);
        if (!d || !OBJECTS[c.kind]?.slot) return "Unknown design";
        if (cabKind(d) !== c.kind) return "Wrong cabinet for that design";
        const locks = designLocks(g.state, d, c.design);
        if (locks.length) return `Needs research: ${RESEARCH[locks[0]]?.name ?? locks[0]}`;
        const why = cantUse(g.state, c.design);
        if (why) return why;
      } else if (OBJECTS[c.kind]?.slot && cabOfKind(c.kind) && !["slot_cherry", "slot_liberty", "slot_thunder"].includes(c.kind)) return "Pick a design";
      const p = placed(c.kind, c.x, c.y, c.rot, c.w, c.h, c.design);
      const f = placement(g, p);
      if (typeof f === "string") return f;
      if (priceOf(p, g.state).cost > g.state.cash) return "Not enough cash";
      return null;
    },
    apply(g, c) {
      const p = placed(c.kind, c.x, c.y, c.rot, c.w, c.h, c.design);
      const f = placement(g, p) as { tiles: number[]; seats: number[] };
      const id = g.state.nextId++;
      const o = newObject(id, c.kind, c.x, c.y, c.rot & 3, g.state.tick, p.w, p.h);
      if (c.design !== undefined) o.design = c.design;
      crewAmenity(g, o);
      g.state.objects.push(o);
      post(g, "build", -priceOf(p, g.state).cost);
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
      post(g, "sales", priceOf(o, g.state).cost / 2);
      g.rebuildOccupancy();
      g.tilesChanged(tiles);
      g.bus.emit({ type: "objectRemoved", id: o.id, x: o.x, y: o.y });
      g.bus.emit({ type: "sound", id: "demolish" });
    },
  },
  move: {
    validate(g, c) {
      const o = g.objById.get(c.id);
      if (!o) return "Already gone";
      if (OBJECTS[o.kind].sized) return "Rooms and counters can't be moved";
      if (g.state.yours?.obj === o.id) return "Finish your own game first";
      if (MOVE_COST > g.state.cash) return "Not enough cash";
      if (o.x === c.x && o.y === c.y && (o.rot & 3) === (c.rot & 3)) return "Already there";
      const { f } = movedPlacement(g, o, c.x, c.y, c.rot);
      return typeof f === "string" ? f : null;
    },
    apply(g, c) {
      const o = g.objById.get(c.id)!, w = g.state.map.w;
      const old = [...objectTiles(o, w), ...objSeats(o).map((s) => s.y * w + s.x)];
      const { f } = movedPlacement(g, o, c.x, c.y, c.rot) as { f: { tiles: number[]; seats: number[] } };
      // A new id: anyone playing or walking to it treats it as gone, as when it's sold; its record comes along.
      const id = g.state.nextId++;
      const n: PlacedObject = { ...o, id, x: c.x, y: c.y, rot: c.rot & 3 };
      delete n.tbl;
      g.state.objects = g.state.objects.map((q) => (q === o ? n : q));
      post(g, "build", -MOVE_COST);
      g.rebuildOccupancy();
      g.tilesChanged([...old, ...f.tiles, ...f.seats]);
      g.bus.emit({ type: "objectRemoved", id: o.id, x: o.x, y: o.y });
      g.bus.emit({ type: "objectPlaced", id, kind: n.kind, x: n.x, y: n.y });
      g.bus.emit({ type: "sound", id: "place" });
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
  setGrade: {
    validate(g, c) {
      const o = g.objById.get(c.id);
      if (!o || !(OBJECTS[o.kind].priceRange || o.bar)) return "Nothing served here";
      return c.grade >= 0 && c.grade < GRADES.length && c.grade % 1 === 0 ? null : "No such grade";
    },
    apply(g, c) { g.objById.get(c.id)!.grade = c.grade; },
  },
  setTrack: {
    validate(g, c) {
      const o = g.objById.get(c.id);
      if (!o || OBJECTS[o.kind].serves !== "club") return "Only a nightclub plays music";
      return c.track >= 0 && c.track < CLUB_TRACKS.length && c.track % 1 === 0 ? null : "No such track";
    },
    apply(g, c) { g.objById.get(c.id)!.track = c.track; },
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
  if (OBJECTS[kind]?.serves === "thirst") o.bar = { price: 1, comp: 0, strength: 1, area: [] };
  return o;
}

export const buildSystem: System = { id: "build", commands };
