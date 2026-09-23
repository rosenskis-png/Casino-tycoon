// Saved game state: plain serializable data only. Derived caches live in Runtime (game.ts) and are rebuilt on load.
import type { RoomPurpose } from "../data/rooms";
import type { NewsLevel } from "./events";

export const SCHEMA_VERSION = 1;

export interface MapState {
  w: number;
  h: number;
  /** Terrain code per tile (data/terrain T). */
  terrain: number[];
  /** 1 = outdoor, 0 = indoor. */
  outdoor: number[];
  /** 1 = scenario-fixed, cannot be demolished. */
  fixed: number[];
  /** Door state per tile (data/terrain DOOR_STATE); ignored for non-doors. */
  door: number[];
  entrances: number[];
}

export interface PlacedObject { id: number; kind: string; x: number; y: number; rot: number }

/** Test walker (M1): wanders between wander points. Guests replace these in M2 on the same movement model. */
export interface Agent {
  id: number;
  /** Tile the agent is leaving and tile it is entering; progress t of steps ticks. */
  x: number; y: number;
  nx: number; ny: number;
  t: number;
  steps: number;
  /** Destination tile index. */
  dest: number;
  look: number;
}

export interface RoomMeta { anchor: number; name: string; purpose: RoomPurpose }

export interface NewsItem { tick: number; level: NewsLevel; text: string }

export interface GameState {
  schema: number;
  scenario: string;
  seed: number;
  tick: number;
  rng: Record<string, number>;
  nextId: number;
  cash: number;
  map: MapState;
  objects: PlacedObject[];
  agents: Agent[];
  wanderPoints: number[];
  /** Foot traffic per tile: +1 per agent per beat, halved each day. Integers, so saves stay exact. */
  traffic: number[];
  roomMeta: RoomMeta[];
  log: NewsItem[];
}
