// Construction (FOUNDATIONS §3): walls, doors, demolition, placing and selling objects, naming rooms.
import { BUILD_COST, T } from "../data/terrain";
import { OBJECTS } from "../data/objects";
import { ROOM_PURPOSES, type RoomPurpose } from "../data/rooms";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { PlacedObject } from "./state";
import { footprint, seats } from "./geometry";
import { idx, inBounds } from "./map";
import { post } from "./finance";

declare module "./commands" {
  interface CommandTypes {
    build: { what: "wall" | "door" | "demolish"; tiles: number[] };
    place: { kind: string; x: number; y: number; rot: number };
    remove: { id: number };
    setRoom: { tile: number; name?: string; purpose?: RoomPurpose };
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

/** Footprint tiles for a placement, or a player-readable reason it can't go there. */
export function placement(g: Game, kind: string, x: number, y: number, rot: number): { tiles: number[]; seats: number[] } | string {
  const def = OBJECTS[kind];
  if (!def) return "Unknown object";
  const m = g.state.map;
  const tiles: number[] = [];
  for (const p of footprint(def, x, y, rot)) {
    if (!inBounds(m, p.x, p.y)) return "Off the map";
    const i = idx(m, p.x, p.y);
    if (m.terrain[i] !== T.FLOOR) return "Needs open floor";
    if (g.occ[i] || g.objAt[i]) return "Something is already there";
    if (g.seatAt[i]) return "That's where someone sits";
    if (m.entrances.includes(i)) return "Keep the entrance clear";
    if (def.place === "indoor" && m.outdoor[i]) return "Indoors only";
    if (def.place === "outdoor" && !m.outdoor[i]) return "Outdoors only";
    tiles.push(i);
  }
  const seatTiles: number[] = [];
  for (const s of seats(def, x, y, rot)) {
    if (!inBounds(m, s.x, s.y)) return "No room in front";
    const i = idx(m, s.x, s.y);
    if (m.terrain[i] !== T.FLOOR || g.occ[i] || g.objAt[i] || tiles.includes(i)) return "Needs open floor in front";
    if (g.seatAt[i]) return "Blocks another seat";
    if (m.outdoor[i] !== m.outdoor[tiles[0]]) return "Needs open floor in front";
    seatTiles.push(i);
  }
  return { tiles, seats: seatTiles };
}

export function objectTiles(o: PlacedObject, w: number): number[] {
  return footprint(OBJECTS[o.kind], o.x, o.y, o.rot).map((p) => p.y * w + p.x);
}

const commands: CommandTable<"build" | "place" | "remove" | "setRoom"> = {
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
      for (const i of tiles) m.terrain[i] = c.what === "wall" ? T.WALL : c.what === "door" ? T.DOOR : T.FLOOR;
      post(g, "build", -tiles.length * BUILD_COST[c.what]);
      g.tilesChanged(tiles);
      g.bus.emit({ type: "sound", id: c.what === "demolish" ? "demolish" : "build" });
    },
  },
  place: {
    validate(g, c) {
      const f = placement(g, c.kind, c.x, c.y, c.rot & 3);
      if (typeof f === "string") return f;
      if (OBJECTS[c.kind].cost > g.state.cash) return "Not enough cash";
      return null;
    },
    apply(g, c) {
      const f = placement(g, c.kind, c.x, c.y, c.rot & 3) as { tiles: number[]; seats: number[] };
      const id = g.state.nextId++;
      g.state.objects.push(newObject(id, c.kind, c.x, c.y, c.rot & 3, g.state.tick));
      post(g, "build", -OBJECTS[c.kind].cost);
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
      const def = OBJECTS[o.kind];
      const w = g.state.map.w;
      const tiles = [...objectTiles(o, w), ...seats(def, o.x, o.y, o.rot).map((s) => s.y * w + s.x)];
      g.state.objects = g.state.objects.filter((x) => x.id !== c.id);
      post(g, "sales", def.cost / 2);
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
      if (c.purpose) meta.purpose = c.purpose;
      g.rooms.detect(g.state);
      g.bus.emit({ type: "roomsChanged" });
    },
  },
};

export function newObject(id: number, kind: string, x: number, y: number, rot: number, built = 0): PlacedObject {
  const o: PlacedObject = { id, kind, x, y, rot, broken: 0, last: { tick: -1, win: 0 }, st: { rounds: 0, coinIn: 0, paidOut: 0, sessions: 0, playTicks: 0, uses: 0 }, built };
  // Bars carry their own drink policy (docs/spec/guests.md §Drinks): standard price, no comps, standard strength, anywhere.
  if (OBJECTS[kind]?.serves === "thirst") o.bar = { price: 1, comp: 0, strength: 1, area: -1 };
  return o;
}

export const buildSystem: System = { id: "build", commands };
