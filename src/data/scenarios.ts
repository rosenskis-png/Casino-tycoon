// Scenario maps, starting setups, populations and goals as data (FOUNDATIONS §20).
import type { RoomPurpose } from "./rooms";
export interface Rect { x: number; y: number; w: number; h: number }

export interface Goals {
  /** Casino worth (cash + resale value of everything placed) to reach. */
  worth: number;
  /** Reputation to reach with one guest type (or every type when `type` is omitted). */
  rep: { type?: string; min: number };
  /** Deadline: end of this month (0-11) of this year (from 1). */
  by: { year: number; month: number };
}

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
  objects: { kind: string; x: number; y: number; rot: number; bar?: { price?: number; comp?: number; strength?: number } }[];
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
    population: { local: 1, retiree: 1, tourist: 1, party: 1 }, rep: {}, arrivals: 0, maxGuests: 1, goals: null, tools: 0,
  };
}

/**
 * Test Floor: a realistic, fully equipped casino on the tutorial lot for headless reports (`npm run targets`):
 * slot banks with seats on the aisles in view of the door, a quiet back room, bars, restrooms, a cage and an ATM
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
  objects.push(
    // The back-corner bar pours strong drinks, a quarter of them free: the rowdy end of the floor.
    { kind: "bar", x: 9, y: 14, rot: 0 }, { kind: "bar", x: 19, y: 14, rot: 0 }, { kind: "bar", x: 40, y: 27, rot: 0, bar: { strength: 1.4, comp: 0.25 } },
    { kind: "restroom", x: 13, y: 6, rot: 0 }, { kind: "restroom", x: 25, y: 6, rot: 0 }, { kind: "restroom", x: 7, y: 23, rot: 0 }, { kind: "restroom", x: 44, y: 12, rot: 0 }, { kind: "restroom", x: 31, y: 6, rot: 0 },
    { kind: "cage", x: 14, y: 29, rot: 0 }, { kind: "atm", x: 36, y: 29, rot: 0 },
    { kind: "neon", x: 8, y: 26, rot: 0 }, { kind: "fountain", x: 44, y: 20, rot: 0 },
    { kind: "plant", x: 7, y: 29, rot: 0 }, { kind: "plant", x: 41, y: 30, rot: 0 }, { kind: "plant", x: 33, y: 14, rot: 0 }, { kind: "plant", x: 47, y: 6, rot: 0 },
    { kind: "sign", x: 18, y: 27, rot: 0 }, { kind: "sign", x: 29, y: 16, rot: 0 }, { kind: "sign", x: 43, y: 25, rot: 0 },
    { kind: "sign", x: 7, y: 17, rot: 0 }, { kind: "sign", x: 23, y: 11, rot: 0 }, { kind: "sign", x: 38, y: 12, rot: 0 },
    // Cameras over the slot banks and the back room, watched from the office; a dumpster out back.
    { kind: "camera", x: 8, y: 20, rot: 0 }, { kind: "camera", x: 18, y: 21, rot: 0 }, { kind: "camera", x: 28, y: 21, rot: 0 },
    { kind: "camera", x: 38, y: 21, rot: 0 }, { kind: "camera", x: 28, y: 17, rot: 0 }, { kind: "camera", x: 42, y: 10, rot: 0 },
    { kind: "dumpster", x: 44, y: 34, rot: 0 },
  );
  return {
    id: "testfloor", name: "Test Floor (engine test)", blurb: "A fully equipped casino for measuring guest behavior.", hidden: true,
    ...LOT, startCash: 100_000, objects, staff: { janitor: 3, tech: 2, server: 8, guard: 2, operator: 1, enforcer: 1 },
    // Two small rooms in the front-right corner: a security office and an enforcement room.
    walls: [...LOT.walls, { x: 44, y: 23, w: 1, h: 8 }, { x: 45, y: 23, w: 4, h: 1 }, { x: 45, y: 27, w: 4, h: 1 }],
    doors: [...LOT.doors, [44, 25], [44, 29]],
    rooms: [{ x: 46, y: 25, name: "Security office", purpose: "office" }, { x: 46, y: 29, name: "Back room", purpose: "enforcement" }],
    footfall: 0.3, street: { tourist: 1, party: 1, local: 0.4, retiree: 0.3 },
    market: { local: { size: 90, regulars: 0.3 }, retiree: { size: 60, regulars: 0.3 } },
    population: { local: 1, retiree: 1, tourist: 1, party: 1 }, rep: {}, arrivals: 0.3, maxGuests: 400, goals: null, tools: 4,
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
    tools: 2,
  },
  sandbox: {
    id: "sandbox",
    name: "Free Play Lot",
    blurb: "An empty building and no goals.",
    ...LOT,
    startCash: 50_000,
    objects: [],
    staff: {},
    footfall: 0.5,
    street: { tourist: 1, party: 1, local: 0.4, retiree: 0.3 },
    market: { local: { size: 220, regulars: 0 }, retiree: { size: 140, regulars: 0 } },
    population: { local: 1, retiree: 1, tourist: 1, party: 1 },
    rep: {},
    arrivals: 0.45,
    maxGuests: 400,
    goals: null,
    tools: 4,
  },
  bigfloor: bigFloor(),
  testfloor: testFloor(),
};
export const DEFAULT_SCENARIO = "horseshoe";
