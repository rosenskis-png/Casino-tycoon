// Command bus (FOUNDATIONS §1): the UI's only way to change the game. Each command validates against current
// state, then applies at the next tick boundary. Results go to the runtime command log.
import { BUILD_COST, T } from "../data/terrain";
import { OBJECTS } from "../data/objects";
import { ROOM_PURPOSES, type RoomPurpose } from "../data/rooms";
import type { Game } from "./game";
import { idx, inBounds } from "./map";
import { spawnWalkers } from "./agents";

export type Command =
  | { type: "build"; what: "wall" | "door" | "demolish"; tiles: number[] }
  | { type: "place"; kind: string; x: number; y: number; rot: number }
  | { type: "remove"; id: number }
  | { type: "setRoom"; tile: number; name?: string; purpose?: RoomPurpose }
  | { type: "spawnWalkers"; n: number }
  | { type: "clearWalkers" };

interface Handler<C extends Command> {
  /** Returns a player-readable reason when the command can't happen, else null. */
  validate(g: Game, c: C): string | null;
  apply(g: Game, c: C): void;
}
type Handlers = { [K in Command["type"]]: Handler<Extract<Command, { type: K }>> };

function buildable(g: Game, what: "wall" | "door" | "demolish", i: number): boolean {
  const m = g.state.map;
  if (i < 0 || i >= m.terrain.length || m.fixed[i]) return false;
  const t = m.terrain[i];
  if (what === "wall") return t === T.FLOOR && !g.occ[i] && !m.entrances.includes(i);
  if (what === "door") return t === T.WALL;
  return t === T.WALL || t === T.DOOR;
}

function footprint(g: Game, kind: string, x: number, y: number): number[] | string {
  const def = OBJECTS[kind];
  if (!def) return "Unknown object";
  const m = g.state.map;
  const tiles: number[] = [];
  for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) {
    if (!inBounds(m, x + dx, y + dy)) return "Off the map";
    const i = idx(m, x + dx, y + dy);
    if (m.terrain[i] !== T.FLOOR) return "Needs open floor";
    if (g.occ[i]) return "Something is already there";
    if (m.entrances.includes(i)) return "Keep the entrance clear";
    if (def.place === "indoor" && m.outdoor[i]) return "Indoors only";
    if (def.place === "outdoor" && !m.outdoor[i]) return "Outdoors only";
    tiles.push(i);
  }
  return tiles;
}

const handlers: Handlers = {
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
      g.state.cash -= tiles.length * BUILD_COST[c.what];
      g.tilesChanged(tiles);
      g.bus.emit({ type: "sound", id: c.what === "demolish" ? "demolish" : "build" });
    },
  },
  place: {
    validate(g, c) {
      const f = footprint(g, c.kind, c.x, c.y);
      if (typeof f === "string") return f;
      if (OBJECTS[c.kind].cost > g.state.cash) return "Not enough cash";
      return null;
    },
    apply(g, c) {
      const tiles = footprint(g, c.kind, c.x, c.y) as number[];
      const id = g.state.nextId++;
      g.state.objects.push({ id, kind: c.kind, x: c.x, y: c.y, rot: c.rot & 3 });
      g.state.cash -= OBJECTS[c.kind].cost;
      g.rebuildOccupancy();
      g.tilesChanged(tiles);
      g.bus.emit({ type: "objectPlaced", id, kind: c.kind, x: c.x, y: c.y });
      g.bus.emit({ type: "sound", id: "place" });
    },
  },
  remove: {
    validate: (g, c) => (g.state.objects.some((o) => o.id === c.id) ? null : "Already gone"),
    apply(g, c) {
      const o = g.state.objects.find((o) => o.id === c.id)!;
      const def = OBJECTS[o.kind];
      const tiles: number[] = [];
      for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) tiles.push(idx(g.state.map, o.x + dx, o.y + dy));
      g.state.objects = g.state.objects.filter((x) => x.id !== c.id);
      g.state.cash += Math.floor(def.cost / 2);
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
  spawnWalkers: {
    validate: (_g, c) => (c.n > 0 && c.n <= 5000 ? null : "Bad count"),
    apply: (g, c) => spawnWalkers(g, c.n),
  },
  clearWalkers: {
    validate: () => null,
    apply(g) { g.state.agents = []; g.fields.updateCrowd(); },
  },
};

export function validateCommand(g: Game, c: Command): string | null {
  const h = handlers[c.type] as Handler<Command> | undefined;
  return h ? h.validate(g, c) : "Unknown command";
}

export function applyCommand(g: Game, c: Command) {
  (handlers[c.type] as Handler<Command>).apply(g, c);
}
