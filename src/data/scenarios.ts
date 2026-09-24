// Scenario maps, starting setups, populations and goals as data (FOUNDATIONS §20).
import type { RoomPurpose } from "./rooms";
import { DOOR_STATE } from "./terrain";
export interface Rect { x: number; y: number; w: number; h: number }

export interface Goals {
  /** Casino worth (cash + resale value of everything placed) to reach. */
  worth: number;
  /** Reputation to reach with one guest type (or every type when `type` is omitted). */
  rep: { type?: string; min: number };
  /** Deadline: end of this month (0-11) of this year (from 1). */
  by: { year: number; month: number };
}

export interface Parcel { id: string; name: string; rects: Rect[]; price: number }

export interface ScenarioDef {
  id: string;
  name: string;
  blurb: string;
  w: number;
  h: number;
  startCash: number;
  /** Owned outdoor land. Everything else is unowned. */
  grounds: Rect[];
  /** Building shells: walls on the edge (permanent), floor inside, indoors. */
  buildings: Rect[];
  /** Interior walls the player may demolish, as rects filled with wall. */
  walls: Rect[];
  /** Door tiles in walls: [x, y]. */
  doors: [number, number][];
  water: Rect[];
  /** Tiles where guests arrive from the street. */
  entrances: [number, number][];
  /** Sidewalks: straight lines of tiles pedestrians walk end to end (either way), past the entrances. */
  sidewalks: { from: [number, number]; to: [number, number] }[];
  /** Passers-by per real second at 1×, and their mix by guest type (times the type's arrival base and season). */
  footfall: number;
  street: Record<string, number>;
  /**
   * The finite market of real returning people per recurring type: how many, and the share who are already
   * regulars on day one (they know the floor as it is at the start).
   */
  market: Record<string, { size: number; regulars: number }>;
  /** Starting objects; a bar may start with its own drink policy (price multiplier, comped share, strength). */
  objects: { kind: string; x: number; y: number; rot: number; w?: number; h?: number; bar?: { price?: number; comp?: number; strength?: number } }[];
  /** Land for sale (M6.5): unowned tiles in these rects become owned outdoor ground when bought. */
  parcels?: Parcel[];
  /** Door rules set by the scenario (data/terrain DOOR_STATE; docs/spec/construction.md). */
  gates?: { x: number; y: number; rule: number; arg?: string; fee?: number }[];
  staff: Record<string, number>;
  /** Guests who come on purpose: weight per guest type (multiplies the type's own base). */
  population: Record<string, number>;
  /** Starting reputation per guest type (default 50). */
  rep: Record<string, number>;
  /** New guests coming on purpose per real second at 1× for an average-reputation casino of normal size (regulars come on their own schedule). */
  arrivals: number;
  /** Most guests on the floor at once. */
  maxGuests: number;
  goals: Goals | null;
  /** Suspicion tool tiers available, 0-4 (docs/spec/cheats.md; research raises it from M9). */
  tools: number;
  /** (M9) Gaming tax on the month's gaming win, 0-1; whether whales come (docs/spec/money.md). */
  tax: number;
  whales?: boolean;
  /** Named rooms with a purpose, by any tile inside them. */
  rooms?: { x: number; y: number; name: string; purpose: RoomPurpose }[];
  /** Not offered in the New game list (engine test maps). */
  hidden?: boolean;
}

// Shared lot: a tutorial-size building (~3× the v0.2 lot) with a back room, front doors, and a street entrance.
const LOT = {
  w: 56, h: 44,
  grounds: [{ x: 2, y: 2, w: 52, h: 40 }],
  buildings: [{ x: 6, y: 4, w: 44, h: 28 }],
  walls: [{ x: 36, y: 5, w: 1, h: 12 }, { x: 37, y: 16, w: 12, h: 1 }],
  doors: [[27, 31], [28, 31], [36, 10], [42, 16]] as [number, number][],
  water: [{ x: 8, y: 35, w: 6, h: 4 }],
  entrances: [[27, 41], [28, 41]] as [number, number][],
  sidewalks: [{ from: [0, 42] as [number, number], to: [55, 42] as [number, number] }],
};

const row = (kind: string, x0: number, y: number, n: number, rot = 0) => Array.from({ length: n }, (_, k) => ({ kind, x: x0 + k, y, rot }));

/** Largest-scale test floor (~20× the tutorial lot): banks of slots with bars, restrooms and cages, for the perf test. */
function bigFloor(): ScenarioDef {
  const w = 240, h = 200, bx = 4, by = 4, bw = 232, bh = 184;
  const objects: ScenarioDef["objects"] = [];
  // Slot banks: machine row facing down, two seat rows, machine row facing up, aisle. Banks 12 wide, 3-tile gaps.
  for (let y = by + 3; y + 4 < by + bh - 6; y += 6)
    for (let x = bx + 3; x + 12 < bx + bw - 2; x += 15) {
      const amenity = (Math.floor((x - bx) / 15) + Math.floor((y - by) / 6)) % 7 === 3;
      if (amenity) {
        objects.push({ kind: "bar", x, y, rot: 0 }, { kind: "bar", x: x + 4, y, rot: 0 }, { kind: "restroom", x: x + 8, y: y + 2, rot: 2 });
        objects.push({ kind: "cage", x, y: y + 3, rot: 2 }, { kind: "atm", x: x + 11, y: y + 3, rot: 2 }, { kind: "sign", x: x + 11, y, rot: 0 });
        continue;
      }
      const kinds = ["slot_liberty", "slot_cherry", "slot_thunder"];
      for (let k = 0; k < 12; k++) {
        objects.push({ kind: kinds[(k + y) % 3], x: x + k, y, rot: 0 });
        objects.push({ kind: kinds[(k + y + 1) % 3], x: x + k, y: y + 3, rot: 2 });
      }
    }
  const doors: [number, number][] = [];
  const entrances: [number, number][] = [];
  for (let x = bx + 20; x < bx + bw - 20; x += 40) {
    doors.push([x, by + bh - 1], [x + 1, by + bh - 1]);
    entrances.push([x, h - 3], [x + 1, h - 3]);
  }
  return {
    id: "bigfloor", name: "Big Floor (engine test)", blurb: "A huge test floor for measuring performance.", hidden: true,
    w, h, startCash: 1_000_000, grounds: [{ x: 1, y: 1, w: w - 2, h: h - 2 }], buildings: [{ x: bx, y: by, w: bw, h: bh }],
    walls: [], doors, water: [], entrances, sidewalks: [], objects, staff: { janitor: 20, tech: 20 },
    footfall: 0, street: {}, market: {},
    population: { local: 1, retiree: 1, tourist: 1, party: 1 }, rep: {}, arrivals: 0, maxGuests: 1, goals: null, tools: 0, tax: 0,
  };
}

/**
 * Test Floor: a realistic, fully equipped casino on the tutorial lot for headless reports (`npm run targets`):
 * slot banks with seats on the aisles in view of the door, a table pit (M7), a quiet back room, bars, restrooms, a cage and an ATM
 * near the door, decor (planters included), scattered signs, a strong-drinks bar, and staff including drink servers
 * and security guards. Measure guest behavior here, never
 * on a bare or deliberately flawed floor (docs/spec/guests.md §Targets).
 */
function testFloor(): ScenarioDef {
  const objects: ScenarioDef["objects"] = [];
  const kinds = ["slot_liberty", "slot_cherry", "slot_thunder"];
  // Back-to-back banks: machines face both aisles.
  for (const y0 of [19, 23]) for (const x0 of [9, 19, 29]) for (let k = 0; k < 8; k++) {
    objects.push({ kind: kinds[(k + x0) % 3], x: x0 + k, y: y0, rot: 2 }, { kind: kinds[(k + x0 + 1) % 3], x: x0 + k, y: y0 + 1, rot: 0 });
  }
  // A quiet back room of quarter machines.
  objects.push(...row("slot_cherry", 39, 8, 8));
  // The east wing (M6): a high-limit room (next to the quiet back room), a show lounge and a club off the floor;
  // a restaurant, a smoking room and a card holders' lounge bar beyond them, with restrooms.
  objects.push(
    ...row("slot_liberty", 51, 7, 6, 0), { kind: "restroom", x: 57, y: 5, rot: 0, w: 3, h: 2 }, { kind: "baccarat", x: 52, y: 10, rot: 0 }, ...row("slot_thunder", 57, 10, 4, 2), { kind: "plant", x: 59, y: 12, rot: 0 },
    { kind: "showlounge", x: 51, y: 14, rot: 0, w: 9, h: 7 },
    { kind: "club", x: 51, y: 23, rot: 0, w: 9, h: 5 }, { kind: "restroom", x: 51, y: 28, rot: 0, w: 3, h: 2 },
    { kind: "restroom", x: 69, y: 10, rot: 0, w: 3, h: 2 }, { kind: "restroom", x: 69, y: 28, rot: 0, w: 3, h: 2 },
    { kind: "restaurant", x: 63, y: 6, rot: 0, w: 6, h: 4 },
    ...row("slot_cherry", 63, 16, 8, 0), ...row("slot_liberty", 63, 19, 8, 2),
    { kind: "bar", x: 64, y: 24, rot: 0, w: 5, h: 3 }, { kind: "plant", x: 72, y: 24, rot: 0 },
    { kind: "sign", x: 60, y: 20, rot: 0 }, { kind: "sign", x: 47, y: 19, rot: 0 }, { kind: "sign", x: 47, y: 7, rot: 0 },
  );
  // Tables (M7): a pit across the top of the main floor (two blackjack tables, roulette, craps), poker, a keno
  // lounge and video poker near the door, and a bingo hall in the quiet back room. Baccarat is in the high-limit room.
  objects.push(
    { kind: "blackjack", x: 9, y: 10, rot: 0 }, { kind: "blackjack", x: 14, y: 10, rot: 0 }, { kind: "roulette", x: 19, y: 10, rot: 0 },
    { kind: "craps", x: 25, y: 10, rot: 0 }, { kind: "poker", x: 29, y: 27, rot: 0 }, { kind: "keno", x: 20, y: 27, rot: 0 },
    ...row("vpoker", 9, 27, 4), { kind: "bingo", x: 38, y: 11, rot: 0 },
  );
  // Themes (M6.5): a Deco high-limit room, a Rat Pack showroom, an Atomic club, a Riviera diner, a Deco and Rat
  // Pack members' bar, and Tiki and Pirate pieces by the fountain on the main floor.
  const d = (kind: string, x: number, y: number) => ({ kind, x, y, rot: 0 });
  objects.push(
    d("deco_lamp", 50, 5), d("deco_lamp", 60, 5), d("deco_statue", 50, 11), d("deco_urn", 60, 11),
    d("rat_marquee", 60, 16), d("rat_mic", 50, 15),
    d("atom_star", 60, 23), d("rock_amps", 55, 29), d("atom_lava", 57, 29),
    d("rat_chair", 62, 29), d("deco_urn", 72, 27), d("rat_lamp", 70, 24),
    d("riv_lemon", 70, 6), d("riv_amphora", 71, 8), d("riv_cypress", 62, 11),
    d("pirate_chest", 47, 21), d("tiki_idol", 42, 21),
  );
  // Outdoors (M6.5): a garden, a pool with a patio bar and a patio restaurant, tiki torches and a parasol.
  objects.push(
    { kind: "garden", x: 34, y: 33, rot: 0, w: 6, h: 5 },
    { kind: "pool", x: 50, y: 33, rot: 0, w: 8, h: 6 },
    { kind: "patiobar", x: 59, y: 33, rot: 0, w: 4, h: 3 },
    { kind: "patiorestaurant", x: 64, y: 33, rot: 0, w: 5, h: 4 },
    d("tiki_torch", 49, 33), d("tiki_torch", 58, 39), d("tiki_idol", 58, 33), d("riv_parasol", 60, 38), d("riv_lemon", 69, 33),
  );
  objects.push(
    // The back-corner bar pours strong drinks, a quarter of them free: the rowdy end of the floor.
    { kind: "bar", x: 9, y: 14, rot: 0 }, { kind: "bar", x: 19, y: 14, rot: 0 }, { kind: "bar", x: 40, y: 27, rot: 0, bar: { strength: 1.4, comp: 0.25 } },
    { kind: "restroom", x: 13, y: 6, rot: 0 }, { kind: "restroom", x: 25, y: 6, rot: 0 }, { kind: "restroom", x: 7, y: 23, rot: 0 }, { kind: "restroom", x: 44, y: 12, rot: 0 }, { kind: "restroom", x: 31, y: 6, rot: 0 }, { kind: "restroom", x: 33, y: 6, rot: 0 }, { kind: "restroom", x: 25, y: 29, rot: 2 },
    { kind: "cage", x: 14, y: 29, rot: 0 }, { kind: "atm", x: 36, y: 29, rot: 0 },
    { kind: "neon", x: 8, y: 26, rot: 0 }, { kind: "fountain", x: 44, y: 20, rot: 0 },
    { kind: "plant", x: 7, y: 29, rot: 0 }, { kind: "plant", x: 41, y: 30, rot: 0 }, { kind: "plant", x: 33, y: 14, rot: 0 }, { kind: "plant", x: 47, y: 6, rot: 0 },
    { kind: "sign", x: 18, y: 27, rot: 0 }, { kind: "sign", x: 29, y: 16, rot: 0 }, { kind: "sign", x: 43, y: 23, rot: 0 },
    { kind: "sign", x: 7, y: 17, rot: 0 }, { kind: "sign", x: 23, y: 11, rot: 0 }, { kind: "sign", x: 46, y: 11, rot: 0 },
    // Cameras over the slot banks and the back room, watched from the office; a dumpster out back.
    { kind: "camera", x: 8, y: 20, rot: 0 }, { kind: "camera", x: 18, y: 21, rot: 0 }, { kind: "camera", x: 28, y: 21, rot: 0 },
    { kind: "camera", x: 38, y: 21, rot: 0 }, { kind: "camera", x: 28, y: 17, rot: 0 }, { kind: "camera", x: 42, y: 10, rot: 0 },
    { kind: "dumpster", x: 44, y: 34, rot: 0 },
  );
  return {
    id: "testfloor", name: "Test Floor (engine test)", blurb: "A fully equipped casino for measuring guest behavior.", hidden: true,
    ...LOT, startCash: 100_000, objects, staff: { janitor: 4, tech: 2, server: 8, guard: 2, operator: 1, enforcer: 1, dealer: 9, pitboss: 1 },
    // The tutorial lot, widened for the east wing.
    w: 80, grounds: [{ x: 2, y: 2, w: 76, h: 40 }], buildings: [...LOT.buildings, { x: 49, y: 4, w: 25, h: 28 }],
    sidewalks: [{ from: [0, 42], to: [79, 42] }],
    // Two small rooms in the front-right corner: a security office and an enforcement room (staff only). The
    // east wing splits into six rooms.
    walls: [...LOT.walls, { x: 44, y: 23, w: 1, h: 8 }, { x: 45, y: 23, w: 4, h: 1 }, { x: 45, y: 27, w: 4, h: 1 },
      { x: 61, y: 5, w: 1, h: 26 }, { x: 50, y: 13, w: 11, h: 1 }, { x: 50, y: 21, w: 11, h: 1 }, { x: 62, y: 13, w: 11, h: 1 }, { x: 62, y: 22, w: 11, h: 1 }],
    doors: [...LOT.doors, [44, 25], [44, 29], [49, 9], [49, 18], [49, 22], [61, 9], [61, 18], [61, 27], [60, 13], [67, 13], [56, 31]],
    gates: [{ x: 44, y: 25, rule: DOOR_STATE.STAFF }, { x: 44, y: 29, rule: DOOR_STATE.STAFF }, { x: 61, y: 27, rule: DOOR_STATE.CARD }],
    rooms: [
      { x: 46, y: 25, name: "Security office", purpose: "office" }, { x: 46, y: 29, name: "Back room", purpose: "enforcement" },
      { x: 50, y: 11, name: "High limit", purpose: "highlimit" }, { x: 50, y: 20, name: "Showroom", purpose: "show" },
      { x: 50, y: 24, name: "Club", purpose: "club" }, { x: 62, y: 12, name: "Diner", purpose: "restaurant" },
      { x: 62, y: 15, name: "Smoking lounge", purpose: "smoking" }, { x: 62, y: 23, name: "Members' bar", purpose: "bar" },
    ],
    footfall: 0.3, street: { tourist: 1, party: 1, local: 0.4, retiree: 0.3 },
    market: { local: { size: 90, regulars: 0.3 }, retiree: { size: 60, regulars: 0.3 }, highroller: { size: 25, regulars: 0.3 } },
    population: { local: 1, retiree: 1, tourist: 1, party: 1, highroller: 1 }, rep: {}, arrivals: 0.3, maxGuests: 500, goals: null, tools: 4, tax: 0.08, whales: true,
  };
}

export const SCENARIOS: Record<string, ScenarioDef> = {
  horseshoe: {
    id: "horseshoe",
    name: "The Lucky Horseshoe",
    blurb: "A small locals casino that has seen better days. Win the neighborhood back.",
    ...LOT,
    startCash: 8_000,
    objects: [
      ...row("slot_liberty", 12, 11, 5), ...row("slot_liberty", 12, 14, 5, 2),
      ...row("slot_cherry", 20, 11, 4), ...row("slot_cherry", 20, 14, 4, 2),
      { kind: "cage", x: 24, y: 25, rot: 0 },
      { kind: "restroom", x: 8, y: 5, rot: 0 },
      { kind: "plant", x: 7, y: 30, rot: 0 },
    ],
    staff: { janitor: 1 },
    footfall: 0.15,
    street: { tourist: 1, party: 1, local: 0.4, retiree: 0.3 },
    market: { local: { size: 70, regulars: 0.2 }, retiree: { size: 45, regulars: 0.2 } },
    population: { local: 1, retiree: 1, tourist: 0.3, party: 0.2 },
    rep: { local: 40, retiree: 50, tourist: 45, party: 45 },
    arrivals: 0.12,
    maxGuests: 300,
    goals: { worth: 30_000, rep: { type: "local", min: 60 }, by: { year: 1, month: 11 } },
    tools: 2, tax: 0.05,
  },
  sandbox: {
    id: "sandbox",
    name: "Free Play Lot",
    blurb: "An empty building and no goals.",
    ...LOT,
    // Two neighboring lots for sale to the east (M6.5).
    w: 80, sidewalks: [{ from: [0, 42], to: [79, 42] }],
    parcels: [
      { id: "east", name: "East lot", rects: [{ x: 54, y: 2, w: 12, h: 40 }], price: 12_000 },
      { id: "fareast", name: "Far east lot", rects: [{ x: 66, y: 2, w: 12, h: 40 }], price: 9_000 },
    ],
    startCash: 50_000,
    objects: [],
    staff: {},
    footfall: 0.5,
    street: { tourist: 1, party: 1, local: 0.4, retiree: 0.3 },
    market: { local: { size: 220, regulars: 0 }, retiree: { size: 140, regulars: 0 }, highroller: { size: 40, regulars: 0 } },
    population: { local: 1, retiree: 1, tourist: 1, party: 1, highroller: 1 },
    rep: {},
    arrivals: 0.45,
    maxGuests: 400,
    goals: null,
    tools: 4, tax: 0.08, whales: true,
  },
  bigfloor: bigFloor(),
  testfloor: testFloor(),
};
export const DEFAULT_SCENARIO = "horseshoe";
