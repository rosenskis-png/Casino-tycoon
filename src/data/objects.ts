// Placeable object catalog. Geometry is given for rotation 0, where the object's front faces down (+y);
// seats (access tiles) may lie outside the footprint on the floor around it. sim/geometry.ts rotates both.
import type { Emission } from "./fields";
import type { RoomPurpose } from "./rooms";

/**
 * stool/stand: a guest sits or stands there, visible; hidden: inside (restroom stalls); chair: a table or show
 * seat (drawn as a chair facing `f`); dance: a spot on a dance floor. `f` is a facing in the rotation-0 frame
 * (0 down, 1 left, 2 up, 3 right).
 */
export interface SeatDef { dx: number; dy: number; kind: "stool" | "stand" | "hidden" | "chair" | "dance"; f?: number }

/**
 * Amenities as places (FOUNDATIONS §8, docs/spec/construction.md): dragged to a size, with the layout, seats,
 * staff, price and tier generated from it (sim/layout.ts). w is the front width, h the depth, in the object's own
 * frame (row 0 is the back).
 */
export interface SizedDef {
  layout: "bar" | "restroom" | "cage" | "restaurant" | "show" | "club";
  min: [number, number];
  max: [number, number];
  /** Build cost: base + per tile of area. */
  cost: [number, number];
  /** Monthly upkeep: base + per seat + per staff member behind the counter (folded in, §8). */
  upkeep: [number, number, number];
  /** Tier names, and the seats each tier above the first needs. */
  tiers: string[];
  tierAt: number[];
  /** Front tiles per bartender, cook or teller. */
  staffEvery: number;
  /** A room with this purpose makes the amenity one tier finer. */
  purpose?: RoomPurpose;
}

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
  art: "whole" | "facing" | "tiled" | "zone";
  seats: SeatDef[];
  /** Slot model id (data/games.ts). */
  slot?: string;
  /** Sized amenities (M6): w and h above are the default size. */
  sized?: SizedDef;
  /** What using it does for a guest. */
  serves?: "thirst" | "bladder" | "cage" | "atm" | "hunger" | "show" | "club";
  /** Seconds a visit takes at 1×. */
  use?: [number, number];
  /** Guest-facing price per use, in real-looking dollars (the default for a player-set price). */
  price?: number;
  /** Player-set price range per use (tickets, cover charges, the restaurant's multiplier). */
  priceRange?: [number, number];
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
    id: "bar", name: "Bar", cat: "amenity", w: 3, h: 2, cost: 2000, upkeep: 50, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 2, radius: 4 }, { channel: "PRS", strength: 1, radius: 3 }], sprite: "counter", art: "zone",
    seats: [], serves: "thirst", use: [8, 15], price: 7,
    sized: { layout: "bar", min: [3, 2], max: [12, 6], cost: [800, 200], upkeep: [26, 4, 12], tiers: ["Bar", "Lounge", "Grand bar"], tierAt: [8, 16], staffEvery: 4, purpose: "bar" },
    desc: "A counter with stools; deeper bars get lounge tables. Drinks loosen bets. Messy.",
  },
  restroom: {
    id: "restroom", name: "Restrooms", cat: "amenity", w: 2, h: 2, cost: 900, upkeep: 15, blocks: true, opaque: true, place: "indoor",
    emits: [], sprite: "restroom", art: "zone",
    seats: [], serves: "bladder", use: [5, 9],
    sized: { layout: "restroom", min: [2, 2], max: [8, 5], cost: [300, 150], upkeep: [7, 4, 0], tiers: ["Restrooms", "Lounge restrooms"], tierAt: [6], staffEvery: 0 },
    desc: "A stall for every two tiles. The doors face the front.",
  },
  cage: {
    id: "cage", name: "Cashier Cage", cat: "amenity", w: 2, h: 1, cost: 1500, upkeep: 35, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "PRS", strength: 1, radius: 2 }], sprite: "cage", art: "zone",
    seats: [], serves: "cage", use: [3, 5],
    sized: { layout: "cage", min: [2, 1], max: [8, 1], cost: [500, 500], upkeep: [5, 0, 15], tiers: ["Cashier cage"], tierAt: [], staffEvery: 1 },
    desc: "A window and a teller per tile. Winners cash out here; guests who ran dry draw more money.",
  },
  restaurant: {
    id: "restaurant", name: "Restaurant", cat: "amenity", w: 4, h: 4, cost: 3900, upkeep: 60, blocks: true, place: "indoor",
    emits: [{ channel: "PRS", strength: 1.5, radius: 4 }, { channel: "PRV", strength: 1, radius: 3 }], sprite: "kitchen", art: "zone",
    seats: [], serves: "hunger", use: [40, 80], price: 18, priceRange: [0.5, 3],
    sized: { layout: "restaurant", min: [3, 3], max: [12, 10], cost: [1500, 150], upkeep: [30, 1.5, 12], tiers: ["Snack bar", "Diner", "Buffet"], tierAt: [8, 20], staffEvery: 4, purpose: "restaurant" },
    desc: "A kitchen and tables. Fed guests stay longer. Some come just to eat.",
  },
  showlounge: {
    id: "showlounge", name: "Show Lounge", cat: "amenity", w: 5, h: 5, cost: 6750, upkeep: 90, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 3, radius: 5 }, { channel: "PRS", strength: 2, radius: 4 }], sprite: "stage", art: "zone",
    seats: [], serves: "show", use: [45, 45], price: 0, priceRange: [0, 40],
    sized: { layout: "show", min: [4, 4], max: [14, 12], cost: [3000, 150], upkeep: [50, 1.5, 0], tiers: ["Lounge", "Showroom", "Theater"], tierAt: [24, 60], staffEvery: 0, purpose: "show" },
    desc: "A stage and rows of seats. A show every so often, then the whole crowd gets up at once.",
  },
  club: {
    id: "club", name: "Nightclub", cat: "amenity", w: 5, h: 5, cost: 6250, upkeep: 80, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 8, radius: 7 }, { channel: "PRV", strength: 1, radius: 3 }], sprite: "djbooth", art: "zone",
    seats: [], serves: "club", use: [45, 120], price: 10, priceRange: [0, 40],
    sized: { layout: "club", min: [4, 4], max: [14, 12], cost: [2500, 150], upkeep: [40, 2, 0], tiers: ["Dance hall", "Club", "Superclub"], tierAt: [16, 40], staffEvery: 0, purpose: "club" },
    desc: "A DJ and a dance floor. Loud through the walls. Party crowds come for it; dancing is thirsty work.",
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
