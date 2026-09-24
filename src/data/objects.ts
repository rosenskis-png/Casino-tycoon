// Placeable object catalog. Geometry is given for rotation 0, where the object's front faces down (+y);
// seats (access tiles) may lie outside the footprint on the floor around it. sim/geometry.ts rotates both.
import type { Emission } from "./fields";

/** stool/stand: a guest sits or stands there, visible; hidden: inside (restroom stalls). */
export interface SeatDef { dx: number; dy: number; kind: "stool" | "stand" | "hidden" }

export interface ObjectDef {
  id: string;
  name: string;
  cat: "game" | "amenity" | "decor" | "security";
  w: number;
  h: number;
  cost: number;
  /** Monthly running cost (game money; docs/spec/clock.md). Staff behind a counter are folded in (§8). */
  upkeep: number;
  /** Whether guests can walk through its footprint. */
  blocks: boolean;
  /** Blocks guests' line of sight (slot banks, closed-in amenities). Walls always do (docs/spec/navigation.md). */
  opaque?: boolean;
  /** A wayfinding sign: roughly points guests toward whatever they are looking for. */
  guide?: boolean;
  /** Where it may stand. */
  place: "indoor" | "outdoor" | "any";
  emits: Emission[];
  /** Directional sprites (front/back/side) or one sprite drawn per footprint tile ("tile:<id>"), or one whole sprite. */
  sprite: string;
  art: "whole" | "facing" | "tiled";
  seats: SeatDef[];
  /** Slot model id (data/games.ts). */
  slot?: string;
  /** What using it does for a guest. */
  serves?: "thirst" | "bladder" | "cage" | "atm";
  /** Seconds a visit takes at 1×. */
  use?: [number, number];
  /** Guest-facing price per use, in real-looking dollars. */
  price?: number;
  desc: string;
}

const FRONT: SeatDef[] = [{ dx: 0, dy: 1, kind: "stool" }];

export const OBJECTS: Record<string, ObjectDef> = {
  slot_cherry: {
    id: "slot_cherry", name: "Cherry Parade", cat: "game", w: 1, h: 1, cost: 300, upkeep: 2, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 1.5, radius: 3 }], sprite: "slot_cherry", art: "facing", seats: FRONT, slot: "cherry",
    desc: "Quarter video slot. Lots of small hits, some smaller than the bet.",
  },
  slot_liberty: {
    id: "slot_liberty", name: "Liberty Bell", cat: "game", w: 1, h: 1, cost: 400, upkeep: 2, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 1, radius: 2 }], sprite: "slot_liberty", art: "facing", seats: FRONT, slot: "liberty",
    desc: "Dollar three-reel. Quiet, steady, and the best payback on the floor.",
  },
  slot_thunder: {
    id: "slot_thunder", name: "Thunder Jackpot", cat: "game", w: 1, h: 1, cost: 700, upkeep: 4, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 3, radius: 4 }], sprite: "slot_thunder", art: "facing", seats: FRONT, slot: "thunder",
    desc: "Loud, rare, huge wins. A jackpot here can dent your cash.",
  },
  bar: {
    id: "bar", name: "Bar", cat: "amenity", w: 3, h: 1, cost: 2000, upkeep: 50, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 2, radius: 4 }, { channel: "PRS", strength: 1, radius: 3 }], sprite: "counter", art: "tiled",
    seats: [{ dx: 0, dy: 1, kind: "stool" }, { dx: 1, dy: 1, kind: "stool" }, { dx: 2, dy: 1, kind: "stool" }],
    serves: "thirst", use: [8, 15], price: 7,
    desc: "Three stools and a bartender. Drinks loosen bets. Messy.",
  },
  restroom: {
    id: "restroom", name: "Restrooms", cat: "amenity", w: 2, h: 2, cost: 900, upkeep: 15, blocks: true, opaque: true, place: "indoor",
    emits: [], sprite: "restroom", art: "whole",
    seats: [{ dx: 0, dy: 2, kind: "hidden" }, { dx: 1, dy: 2, kind: "hidden" }],
    serves: "bladder", use: [5, 9],
    desc: "Two stalls. The doors face the front.",
  },
  cage: {
    id: "cage", name: "Cashier Cage", cat: "amenity", w: 2, h: 1, cost: 1500, upkeep: 35, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "PRS", strength: 1, radius: 2 }], sprite: "cage", art: "tiled",
    seats: [{ dx: 0, dy: 1, kind: "stand" }, { dx: 1, dy: 1, kind: "stand" }],
    serves: "cage", use: [3, 5],
    desc: "Winners cash out here, and guests who ran dry draw more money. A teller is included.",
  },
  atm: {
    id: "atm", name: "ATM", cat: "amenity", w: 1, h: 1, cost: 600, upkeep: 6, blocks: true, opaque: true, place: "indoor",
    emits: [], sprite: "atm", art: "whole", seats: FRONT.map((s) => ({ ...s, kind: "stand" as const })),
    serves: "atm", use: [3, 5],
    desc: "Cash withdrawals only. The easier it is to find, the more guests come back to it.",
  },
  plant: {
    id: "plant", name: "Potted Palm", cat: "decor", w: 1, h: 1, cost: 150, upkeep: 1, blocks: true, place: "any",
    emits: [{ channel: "PRS", strength: 2, radius: 3 }, { channel: "CLN", strength: 1, radius: 2 }], sprite: "plant", art: "whole", seats: [],
    desc: "Raises prestige nearby.",
  },
  neon: {
    id: "neon", name: "Neon Sign", cat: "decor", w: 1, h: 1, cost: 300, upkeep: 2, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 6, radius: 6 }], sprite: "neon", art: "whole", seats: [],
    desc: "Loud light. Energy for some, a headache for others.",
  },
  sign: {
    id: "sign", name: "Sign", cat: "decor", w: 1, h: 1, cost: 80, upkeep: 0, blocks: true, guide: true, place: "any",
    emits: [], sprite: "sign", art: "whole", seats: [],
    desc: "Points guests toward whatever they're looking for, roughly. Guests have to see it.",
  },
  fountain: {
    id: "fountain", name: "Fountain", cat: "decor", w: 2, h: 2, cost: 1500, upkeep: 5, blocks: true, place: "any",
    emits: [{ channel: "PRS", strength: 5, radius: 6 }, { channel: "NRG", strength: 2, radius: 4 }], sprite: "fountain", art: "whole", seats: [],
    desc: "A showpiece. Prestige for the whole area.",
  },
  camera: {
    id: "camera", name: "Camera", cat: "security", w: 1, h: 1, cost: 400, upkeep: 3, blocks: false, place: "indoor",
    emits: [{ channel: "SRVH", strength: 3, radius: 6 }], sprite: "camera", art: "whole", seats: [],
    desc: "A ceiling dome. Catches cheats in the act, but only while a surveillance operator watches from a Back office.",
  },
  dumpster: {
    id: "dumpster", name: "Dumpster", cat: "security", w: 2, h: 1, cost: 300, upkeep: 1, blocks: true, place: "outdoor",
    emits: [], sprite: "dumpster", art: "whole", seats: [],
    desc: "Out back. Where your enforcers take what's left after a disappearance.",
  },
};

export const OBJECT_CATS: { id: ObjectDef["cat"]; label: string }[] = [
  { id: "game", label: "Slots" },
  { id: "amenity", label: "Amenities" },
  { id: "decor", label: "Decoration" },
  { id: "security", label: "Security" },
];
