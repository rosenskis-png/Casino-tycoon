// Placeable object catalog. M1 carries only a few decorations to exercise placement, fields and rendering;
// games and amenities arrive in M2.
import type { Emission } from "./fields";

export interface ObjectDef {
  id: string;
  name: string;
  cat: "decor";
  w: number;
  h: number;
  cost: number;
  /** Whether guests can walk through its footprint. */
  blocks: boolean;
  /** Where it may stand. */
  place: "indoor" | "outdoor" | "any";
  emits: Emission[];
  sprite: string;
}

export const OBJECTS: Record<string, ObjectDef> = {
  plant: {
    id: "plant", name: "Potted Palm", cat: "decor", w: 1, h: 1, cost: 500, blocks: true, place: "any",
    emits: [{ channel: "PRS", strength: 2, radius: 3 }, { channel: "CLN", strength: 1, radius: 2 }], sprite: "plant",
  },
  neon: {
    id: "neon", name: "Neon Sign", cat: "decor", w: 1, h: 1, cost: 1200, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 6, radius: 6 }], sprite: "neon",
  },
  fountain: {
    id: "fountain", name: "Fountain", cat: "decor", w: 2, h: 2, cost: 4000, blocks: true, place: "any",
    emits: [{ channel: "PRS", strength: 5, radius: 6 }, { channel: "NRG", strength: 2, radius: 4 }], sprite: "fountain",
  },
};
