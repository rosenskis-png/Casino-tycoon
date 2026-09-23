// Scenario maps, starting setups, populations and goals as data (FOUNDATIONS §20).
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
  objects: { kind: string; x: number; y: number; rot: number }[];
  staff: Record<string, number>;
  /** Guest mix: arrival weight per guest type (multiplies the type's own base). */
  population: Record<string, number>;
  /** Starting reputation per guest type (default 50). */
  rep: Record<string, number>;
  /** Guests arriving per real second at 1× for an average-reputation casino of normal size. */
  arrivals: number;
  /** Most guests on the floor at once. */
  maxGuests: number;
  goals: Goals | null;
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
        objects.push({ kind: "cage", x, y: y + 3, rot: 2 });
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
    walls: [], doors, water: [], entrances, objects, staff: { janitor: 20, tech: 20 },
    population: { local: 1, retiree: 1, tourist: 1 }, rep: {}, arrivals: 0, maxGuests: 1, goals: null,
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
    population: { local: 1, retiree: 1, tourist: 0.3 },
    rep: { local: 40, retiree: 50, tourist: 45 },
    arrivals: 0.45,
    maxGuests: 300,
    goals: { worth: 30_000, rep: { type: "local", min: 60 }, by: { year: 1, month: 11 } },
  },
  sandbox: {
    id: "sandbox",
    name: "Free Play Lot",
    blurb: "An empty building and no goals.",
    ...LOT,
    startCash: 50_000,
    objects: [],
    staff: {},
    population: { local: 1, retiree: 1, tourist: 1 },
    rep: {},
    arrivals: 0.6,
    maxGuests: 400,
    goals: null,
  },
  bigfloor: bigFloor(),
};
export const DEFAULT_SCENARIO = "horseshoe";
