// Scenario maps, starting setups, populations and goals as data (FOUNDATIONS §20).
import type { RoomPurpose } from "./rooms";
import { DOOR_STATE } from "./terrain";
export interface Rect { x: number; y: number; w: number; h: number }

export interface Goals {
  /** Casino worth (cash + resale value of everything placed) to reach. */
  worth: number;
  /** Reputation to reach with one guest type (or every type when `type` is omitted). */
  rep: { type?: string; min: number };
  /** (M11.2) Reputation to reach with each of these types too (the tutorial: tourists and families). */
  reps?: { types: string[]; min: number };
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
  objects: { kind: string; x: number; y: number; rot: number; w?: number; h?: number; bar?: { price?: number; comp?: number; strength?: number }; design?: string }[];
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
  /** (M8) Legal minimum payback for slots (default 0.8, docs/spec/designer.md §10). */
  minRtp?: number;
  whales?: boolean;
  /** (M11) Chance a police officer or gaming inspector takes a bribe (0 or missing: nobody can be bribed here). */
  bribe?: number;
  /** (M9.5) Scheduled events allowed (default: all that fit its population); research projects done at the start. */
  events?: string[];
  /** (M9.6) The hotel elevator: a floor tile against a wall (an entrance for hotel guests and escorts). */
  elevator?: [number, number];
  research?: string[] | "build";
  /** Named rooms with a purpose, by any tile inside them. */
  rooms?: { x: number; y: number; name: string; purpose: RoomPurpose }[];
  /** (M11.2) No new games may be built (the tutorial): the ones on the floor at the start are all there is. */
  noGames?: boolean;
  /** (M11.2) The floor as the last owner left it: tiles of litter and of vomit, scattered over the indoor floor. */
  mess?: { litter: number; vomit: number };
  /** (M11.2) House rules to start with (the rest default). */
  rules?: Partial<Record<"intox" | "disorder" | "misconduct" | "vice" | "drugs", number>>;
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

/** The shared lot moved by (dx, dy) on a bigger map: the building, its doors and walls, the pond and the entrances. */
function movedLot(dx: number, dy: number) {
  const r = (q: Rect) => ({ ...q, x: q.x + dx, y: q.y + dy });
  const p = ([x, y]: [number, number]): [number, number] => [x + dx, y + dy];
  return { buildings: LOT.buildings.map(r), walls: LOT.walls.map(r), water: LOT.water.map(r), doors: LOT.doors.map(p), entrances: LOT.entrances.map(p) };
}

const row = (kind: string, x0: number, y: number, n: number, rot = 0) => Array.from({ length: n }, (_, k) => ({ kind, x: x0 + k, y, rot }));
/** (M11.2) A tutorial bank: two rows of n facing each other across a two-tile aisle of seats (rows y and y + 3), the gentle classics mixed. */
const tutorialBank = (x0: number, y: number, n: number): ScenarioDef["objects"] => [0, 3].flatMap((dy) =>
  Array.from({ length: n }, (_, k) => (k + dy) % 2 === 0
    ? { kind: "slot_stepper", design: "bells", x: x0 + k, y: y + dy, rot: dy ? 2 : 0 }
    : { kind: "slot_upright", design: "cherries", x: x0 + k, y: y + dy, rot: dy ? 2 : 0 }));

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
    population: { local: 1, retiree: 1, tourist: 1, party: 1 }, rep: {}, arrivals: 0, maxGuests: 1, goals: null, tools: 0, tax: 0, research: "build",
  };
}

/**
 * Test Floor: a realistic, fully equipped casino on the tutorial lot for headless reports (`npm run targets`):
 * slot banks with seats on the aisles in view of the door, a table pit (M7), a quiet back room, bars, restrooms, a cage and an ATM
 * near the door, decor (planters included), scattered signs, a strong-drinks bar, and staff including drink servers
 * and security guards. Measure guest behavior here, never
 * on a bare or deliberately flawed floor (docs/spec/guests.md §Targets).
 */
/** A row of slots playing one design (M8), like `row`. */
const designed = (kind: string, design: string, x: number, y: number, n: number, rot = 0): ScenarioDef["objects"] =>
  row(kind, x, y, n, rot).map((o) => ({ ...o, design }));

function testFloor(): ScenarioDef {
  const objects: ScenarioDef["objects"] = [];
  const kinds = ["slot_liberty", "slot_cherry", "slot_thunder"];
  // Back-to-back banks: machines face both aisles.
  for (const y0 of [19, 23]) for (const x0 of [9, 19, 29]) for (let k = 0; k < 8; k++) {
    objects.push({ kind: kinds[(k + x0) % 3], x: x0 + k, y: y0, rot: 2 }, { kind: kinds[(k + x0 + 1) % 3], x: x0 + k, y: y0 + 1, rot: 0 });
  }
  // A quiet back room of quarter machines, and (M8) a few classic steppers.
  objects.push(...designed("slot_upright", "tumble", 39, 8, 2), ...designed("slot_upright", "prospector", 41, 8, 2), ...designed("slot_stepper", "diamond", 43, 8, 4));
  // The east wing (M6): a high-limit room (next to the quiet back room), a show lounge and a club off the floor;
  // a restaurant, a smoking room and a card holders' lounge bar beyond them, with restrooms.
  objects.push(
    ...row("slot_liberty", 51, 7, 3, 0), ...designed("slot_slant", "platinum", 54, 7, 3, 0), { kind: "restroom", x: 57, y: 5, rot: 0, w: 3, h: 2 }, { kind: "baccarat", x: 52, y: 10, rot: 0 }, ...row("slot_thunder", 57, 10, 4, 2), { kind: "plant", x: 59, y: 12, rot: 0 },
    { kind: "showlounge", x: 51, y: 14, rot: 0, w: 9, h: 7 },
    { kind: "club", x: 51, y: 23, rot: 0, w: 9, h: 5 }, { kind: "restroom", x: 51, y: 28, rot: 0, w: 3, h: 2 },
    { kind: "restroom", x: 69, y: 10, rot: 0, w: 3, h: 2 }, { kind: "restroom", x: 69, y: 28, rot: 0, w: 3, h: 2 },
    { kind: "restaurant", x: 63, y: 6, rot: 0, w: 6, h: 4 },
    ...designed("slot_tall", "stampede", 63, 16, 4, 0), ...designed("slot_upright", "sphinx", 67, 16, 4, 0),
    // M8.5: a linked hold & spin bank with its sign, a topper-wheel game, a pick-and-offer game.
    ...designed("slot_tall", "ember", 63, 19, 3, 2), ...designed("slot_upright", "grandwheel", 66, 19, 3, 2), ...designed("slot_upright", "treasure", 69, 19, 2, 2),
    { kind: "bank_sign", x: 63, y: 20, rot: 0, design: "ember" },
    { kind: "bar", x: 64, y: 24, rot: 0, w: 5, h: 3 }, { kind: "plant", x: 72, y: 24, rot: 0 },
    { kind: "sign", x: 60, y: 20, rot: 0 }, { kind: "sign", x: 47, y: 19, rot: 0 }, { kind: "sign", x: 47, y: 7, rot: 0 },
  );
  // Tables (M7): a pit across the top of the main floor (two blackjack tables, roulette, craps), poker, a keno
  // lounge and video poker near the door, and a bingo hall in the quiet back room. Baccarat is in the high-limit room.
  objects.push(
    { kind: "blackjack", x: 9, y: 10, rot: 0 }, { kind: "blackjack", x: 14, y: 10, rot: 0 }, { kind: "roulette", x: 19, y: 10, rot: 0 },
    { kind: "craps", x: 25, y: 10, rot: 0 }, { kind: "poker", x: 29, y: 27, rot: 0 }, { kind: "keno", x: 20, y: 27, rot: 0 },
    ...row("vpoker", 9, 27, 4), { kind: "bingo", x: 38, y: 11, rot: 0 },
    // M9.5: a sportsbook facing the slot banks, below the pit.
    { kind: "sportsbook", x: 24, y: 14, rot: 0 },
    // M8: a giant cabinet by the door, seen across the floor.
    { kind: "slot_giant", x: 33, y: 15, rot: 0, design: "lantern" },
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
    // M8.6: Lucky Dragon pieces along the bingo room's outer wall (its door at x 42 kept clear).
    d("dragon_lantern", 37, 17), d("dragon_lion", 39, 17), d("dragon_vase", 45, 17), d("dragon_screen", 47, 17),
  );
  // Outdoors (M6.5): a garden, a pool with a patio bar and a patio restaurant, tiki torches and a parasol.
  objects.push(
    { kind: "garden", x: 34, y: 33, rot: 0, w: 6, h: 5 }, { kind: "minigolf", x: 15, y: 33, rot: 0, w: 6, h: 4 },
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
    { kind: "bin", x: 23, y: 6, rot: 0 }, { kind: "bin", x: 17, y: 13, rot: 0 }, { kind: "bin", x: 31, y: 15, rot: 0 }, { kind: "bin", x: 39, y: 22, rot: 0 }, { kind: "plant", x: 7, y: 29, rot: 0 }, { kind: "plant", x: 41, y: 30, rot: 0 }, { kind: "plant", x: 33, y: 14, rot: 0 }, { kind: "plant", x: 47, y: 6, rot: 0 },
    { kind: "sign", x: 18, y: 27, rot: 0 }, { kind: "sign", x: 29, y: 16, rot: 0 }, { kind: "sign", x: 43, y: 23, rot: 0 },
    { kind: "sign", x: 7, y: 17, rot: 0 }, { kind: "sign", x: 23, y: 11, rot: 0 }, { kind: "sign", x: 46, y: 11, rot: 0 },
    // Cameras over the slot banks and the back room, watched from the office; a dumpster out back.
    { kind: "camera", x: 8, y: 20, rot: 0 }, { kind: "camera", x: 18, y: 21, rot: 0 }, { kind: "camera", x: 28, y: 21, rot: 0 },
    { kind: "camera", x: 38, y: 21, rot: 0 }, { kind: "camera", x: 28, y: 17, rot: 0 }, { kind: "camera", x: 42, y: 10, rot: 0 },
    { kind: "dumpster", x: 44, y: 34, rot: 0 },
  );
  return {
    id: "testfloor", name: "Test Floor (engine test)", blurb: "A fully equipped casino for measuring guest behavior.", hidden: true,
    elevator: [20, 5],
    ...LOT, startCash: 100_000, objects, staff: { janitor: 4, tech: 2, server: 8, guard: 3, operator: 1, pitboss: 1, entertainer: 2 },
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
    footfall: 0.3, street: { tourist: 1, party: 1, local: 0.4, retiree: 0.3, family: 0.4, conventioneer: 0.2 },
    market: { local: { size: 90, regulars: 0.3 }, retiree: { size: 60, regulars: 0.3 }, highroller: { size: 25, regulars: 0.3 } },
    population: { local: 1, retiree: 1, tourist: 1, party: 1, highroller: 1, family: 1, conventioneer: 1 }, rep: {}, arrivals: 0.3, maxGuests: 500, goals: null, tools: 4, tax: 0.08, whales: true, research: "build", bribe: 0.6,
  };
}


// ---------------------------------------------------------------------------------------------------------
// (M11.3, owner) Crowd floors: six mini-casinos on the tutorial lot, each designed for one crowd in layout, games,
// amenities, decor, rooms and house rules, for `npm run parity`: a casino that caters well to its crowd should earn
// roughly the same from gambling whichever crowd it is; only how differs. Hidden; one crowd each.
// ---------------------------------------------------------------------------------------------------------

type Obj = ScenarioDef["objects"][number];
const at = (kind: string, x: number, y: number, extra: Partial<Obj> = {}): Obj => ({ kind, x, y, rot: 0, ...extra });
/** A back-to-back bank: n machines facing up at y (seats y − 1) and n facing down at y + 1 (seats y + 2), cycling games. */
const bank = (games: [kind: string, design: string][], x0: number, y: number, n: number): Obj[] =>
  [0, 1].flatMap((dy) => Array.from({ length: n }, (_, k) => {
    const [kind, design] = games[(k + dy) % games.length];
    return { kind, design, x: x0 + k, y: y + dy, rot: dy ? 0 : 2 };
  }));
/** Decor pieces, one tile each. */
const decor = (list: [string, number, number][]): Obj[] => list.map(([kind, x, y]) => at(kind, x, y));

/** What every crowd floor has: restrooms, a cage and an ATM by the door, bins and signs. */
const shell = (): Obj[] => [
  at("restroom", 7, 5, { w: 2, h: 2 }), at("restroom", 44, 28, { w: 3, h: 2 }),
  at("cage", 31, 29, { w: 2, h: 1 }), at("atm", 24, 29),
  at("bin", 22, 15), at("bin", 33, 20), at("sign", 25, 27), at("sign", 35, 15),
];

function crowdFloor(t: string, name: string, blurb: string, objects: Obj[], extra: Partial<ScenarioDef>): ScenarioDef {
  return {
    id: `crowd_${t}`, name: `${name} (crowd test)`, blurb, hidden: true, ...LOT, startCash: 100_000,
    objects: [...shell(), ...objects],
    staff: { janitor: 2, tech: 2, server: 3, guard: 1 },
    footfall: 0.2, street: { [t]: 1 }, market: {}, population: { [t]: 1 }, rep: {}, arrivals: 0.3, maxGuests: 300,
    goals: null, tools: 4, tax: 0.08, research: "build",
    ...extra,
  };
}

const S = (d: string): [string, string] => ["slot_stepper", d], U = (d: string): [string, string] => ["slot_upright", d], TL = (d: string): [string, string] => ["slot_tall", d];

/** Locals: the thinnest edges (good-rules blackjack, video poker, steppers they know), a smoking room, cheap drinks and food, Gold Rush. */
function localsFloor(): ScenarioDef {
  return crowdFloor("local", "The Regular", "A locals' joint done right.", [
    ...bank([S("liberty"), S("diamond"), S("bells")], 9, 7, 12), ...bank([S("bells"), S("liberty"), S("diamond")], 9, 11, 12),
    ...bank([S("diamond"), S("bells"), S("liberty")], 23, 7, 12), ...bank([S("liberty"), S("bells"), S("diamond")], 23, 11, 12),
    ...row("vpoker", 9, 17, 10, 0), ...row("vpoker", 9, 20, 10, 2),
    at("blackjack", 9, 25), at("blackjack", 14, 25), at("craps", 19, 24),
    // The back room is for smokers, with its own steppers.
    ...bank([S("liberty"), S("diamond")], 38, 7, 10), ...bank([S("bells"), S("liberty")], 38, 12, 10),
    at("bar", 31, 22, { w: 3, h: 2, bar: { price: 0.7, comp: 0.25 } }), at("restaurant", 38, 20, { w: 4, h: 4 }),
    ...decor([["gold_cart", 7, 9], ["gold_wanted", 7, 13], ["gold_cart", 35, 9], ["gold_barrel", 35, 13], ["gold_wanted", 22, 18], ["gold_barrel", 30, 18], ["gold_cart", 46, 19], ["gold_wanted", 43, 25]]),
  ], {
    rooms: [{ x: 40, y: 9, name: "Smoking room", purpose: "smoking" }],
    market: { local: { size: 250, regulars: 0.5 } }, staff: { janitor: 2, tech: 2, server: 3, guard: 1, pitboss: 1 },
  });
}

/** Retirees: penny slots and bingo, quiet, a buffet and a lounge show, a smoking room, Rat Pack and Deco. */
function retireesFloor(): ScenarioDef {
  return crowdFloor("retiree", "Sunset Lanes", "Bingo, buffet and a crooner.", [
    ...bank([U("cherries"), U("cherry"), U("sphinx")], 9, 7, 12), ...bank([U("cherry"), TL("ember"), U("cherries")], 9, 11, 12),
    ...bank([U("sphinx"), U("cherries"), U("cherry")], 23, 7, 12), ...bank([TL("ember"), U("cherry"), U("cherries")], 23, 11, 12),
    at("bingo", 38, 7), at("bingo", 38, 12), at("keno", 9, 27),
    at("showlounge", 9, 19, { w: 7, h: 6 }), at("restaurant", 18, 20, { w: 5, h: 5 }),
    at("bar", 31, 21, { w: 3, h: 2 }),
    ...row("slot_upright", 38, 26, 5, 0).map((o) => ({ ...o, design: "cherry" })),
    at("garden", 34, 33, { w: 6, h: 5 }),
    ...decor([["rat_chair", 7, 9], ["rat_lamp", 7, 13], ["deco_lamp", 35, 9], ["deco_urn", 35, 13], ["rat_mic", 16, 22], ["deco_screen", 24, 19], ["rat_chair", 47, 6], ["deco_lamp", 47, 14], ["rat_lamp", 30, 18]]),
  ], {
    walls: [...LOT.walls, { x: 37, y: 24, w: 12, h: 1 }], doors: [...LOT.doors, [40, 24]],
    rooms: [{ x: 40, y: 9, name: "Bingo hall", purpose: "floor" }, { x: 40, y: 27, name: "Smoking room", purpose: "smoking" }],
    market: { retiree: { size: 250, regulars: 0.5 } }, staff: { janitor: 2, tech: 2, server: 3, guard: 1, pitboss: 1, entertainer: 1 },
  });
}

/** Tourists: spectacle (a giant cabinet, flashy themed games, roulette and craps), a showroom, a pool, Rome all through. */
function touristsFloor(): ScenarioDef {
  return crowdFloor("tourist", "The Colosseum", "Rome, bigger.", [
    ...bank([U("thunder"), U("grandwheel"), TL("stampede")], 9, 7, 12), ...bank([U("tumble"), U("thunder"), U("treasure")], 9, 11, 12),
    ...bank([U("grandwheel"), U("thunder"), U("sphinx")], 23, 7, 12), ...bank([TL("stampede"), U("tumble"), U("thunder")], 23, 11, 12),
    at("slot_giant", 30, 17, { design: "lantern" }),
    at("roulette", 9, 25), at("craps", 15, 24), at("blackjack", 22, 25),
    at("showlounge", 38, 6, { w: 10, h: 9 }), at("restaurant", 38, 20, { w: 5, h: 4 }), at("bar", 31, 22, { w: 3, h: 2 }),
    at("fountain", 20, 17), at("pool", 40, 33, { w: 8, h: 6 }), at("patiorestaurant", 30, 34, { w: 4, h: 4 }),
    ...decor([["rome_column", 7, 9], ["rome_bust", 7, 13], ["rome_standard", 35, 9], ["rome_column", 35, 13], ["rome_bust", 21, 6], ["rome_standard", 22, 13], ["rome_column", 24, 19], ["rome_bust", 37, 26],
      ["rome_urn", 26, 35], ["riv_cypress", 20, 36], ["rome_column", 47, 17]]),
  ], {
    rooms: [{ x: 42, y: 10, name: "Showroom", purpose: "show" }], staff: { janitor: 2, tech: 2, server: 3, guard: 1, pitboss: 1, entertainer: 2 },
  });
}

/** Families: the show, a cheap restaurant, mini golf and a pool, with their favorite games on the way between; strict rules; a hotel. */
function familiesFloor(): ScenarioDef {
  return crowdFloor("family", "Treasure Cove", "Pirates, putt-putt and a show.", [
    ...bank([TL("ember"), U("treasure"), U("sphinx")], 23, 11, 12), ...bank([U("prospector"), TL("ember"), U("treasure")], 9, 11, 12),
    ...bank([U("sphinx"), U("treasure"), TL("ember")], 30, 17, 6),
    ...row("slot_upright", 43, 18, 5, 0).map((o) => ({ ...o, design: "sphinx" })),
    at("slot_giant", 23, 22, { design: "lantern" }),
    at("showlounge", 38, 6, { w: 10, h: 9 }), at("restaurant", 38, 20, { w: 5, h: 5, }), at("bar", 9, 22, { w: 3, h: 2 }),
    at("minigolf", 15, 33, { w: 7, h: 5 }), at("pool", 40, 33, { w: 8, h: 6 }), at("garden", 30, 34, { w: 5, h: 4 }),
    ...decor([["pirate_chest", 7, 9], ["pirate_wheel", 7, 14], ["tiki_idol", 35, 9], ["pirate_anchor", 35, 14], ["pirate_cannon", 21, 17], ["tiki_drum", 29, 23], ["pirate_chest", 47, 25],
      ["tiki_torch", 39, 32], ["tiki_idol", 49, 32], ["pirate_anchor", 23, 36]]),
  ], {
    elevator: [30, 5], rules: { intox: 3, disorder: 3, misconduct: 3, vice: 3, drugs: 3 },
    rooms: [{ x: 42, y: 10, name: "Showroom", purpose: "show" }], staff: { janitor: 3, tech: 2, server: 2, guard: 2, entertainer: 2 },
  });
}

/** Party groups: a big club, strong drinks, loud games and craps, a pool bar, lenient rules, Atomic and Rock; a hotel. */
function partyFloor(): ScenarioDef {
  return crowdFloor("party", "Neon Nights", "Loud, late and lenient.", [
    // The club and its bar in the back room, with the loudest games between them and the door: out of the club
    // drunk and happy, the games are right there.
    at("club", 42, 5, { w: 7, h: 6 }), at("bar", 38, 5, { w: 3, h: 2, bar: { strength: 1.4, comp: 0.3 } }),
    ...bank([TL("stampede"), U("tumble"), U("grandwheel")], 38, 12, 10),
    at("craps", 30, 8), at("craps", 30, 12), at("slot_giant", 33, 17, { design: "lantern" }),
    ...bank([U("thunder"), TL("stampede"), U("tumble")], 9, 7, 12), ...bank([U("grandwheel"), U("tumble"), TL("stampede")], 9, 11, 12),
    at("roulette", 22, 25), at("craps", 9, 24),
    at("bar", 24, 20, { w: 4, h: 2, bar: { strength: 1.4, comp: 0.3 } }), ...bank([TL("stampede"), U("thunder")], 17, 17, 6),
    at("pool", 40, 33, { w: 8, h: 6 }), at("patiobar", 33, 34, { w: 3, h: 3 }),
    ...decor([["neon", 7, 13], ["neon", 35, 7], ["rock_amps", 47, 15], ["atom_star", 37, 15], ["rock_guitar", 21, 12], ["atom_rocket", 29, 18], ["atom_lava", 34, 21], ["neon", 7, 9]]),
  ], {
    elevator: [30, 5], rules: { intox: 1, disorder: 1, misconduct: 1, vice: 1, drugs: 1 },
    staff: { janitor: 3, tech: 2, server: 5, guard: 1, pitboss: 1 },
  });
}

/** High rollers: a high-limit salon (baccarat, good-rules blackjack, craps, $5 slots), a fine restaurant, a members' bar, lenient on vice, strict on fights; Luxe, Deco and Dragon; a hotel. */
function highrollersFloor(): ScenarioDef {
  return crowdFloor("highroller", "The Monarch", "Quiet money.", [
    at("baccarat", 9, 8), at("baccarat", 15, 8), at("baccarat", 21, 8), at("craps", 29, 8),
    at("blackjack", 9, 13), at("blackjack", 14, 13), at("blackjack", 19, 13), at("roulette", 29, 13),
    ...designed("slot_slant", "platinum", 9, 24, 8, 0), ...designed("slot_stepper", "diamond", 9, 27, 8, 2),
    at("restaurant", 38, 6, { w: 10, h: 9 }), at("showlounge", 38, 19, { w: 6, h: 6 }), at("bar", 31, 22, { w: 3, h: 2, bar: { price: 1.5 } }),
    ...decor([["luxe_sculpture", 7, 11], ["deco_statue", 35, 11], ["dragon_lion", 25, 11], ["luxe_orchid", 20, 17], ["deco_lamp", 7, 19], ["luxe_lamp", 30, 19], ["dragon_vase", 47, 17], ["deco_urn", 19, 25], ["luxe_glass", 37, 26]]),
  ], {
    elevator: [30, 5], whales: true, rules: { intox: 1, disorder: 3, misconduct: 2, vice: 1, drugs: 1 },
    rooms: [{ x: 20, y: 10, name: "Salon", purpose: "highlimit" }, { x: 42, y: 10, name: "Dining room", purpose: "restaurant" }],
    market: { highroller: { size: 250, regulars: 0.5 } }, staff: { janitor: 2, tech: 2, server: 3, guard: 2, pitboss: 1 },
  });
}

/** The crowd floors by crowd, for `npm run parity`. */
export const CROWD_FLOORS: Record<string, string> = { local: "crowd_local", retiree: "crowd_retiree", tourist: "crowd_tourist", family: "crowd_family", party: "crowd_party", highroller: "crowd_highroller" };

export const SCENARIOS: Record<string, ScenarioDef> = {
  horseshoe: {
    id: "horseshoe",
    name: "The Lucky Horseshoe",
    blurb: "A run-down locals' joint: sticky floors, tired decor, free drinks and fights. You can't add a single machine. Make the ones you have pay by turning it into a place tourists and families want to visit.",
    ...LOT,
    // (M11.2, owner) The tutorial: a floor packed with machines and no way to add games. Everything else is
    // the last owner's mess: litter and vomit, broken theming, a free-pour bar, drunk regulars who fight, and
    // house rules that ignore it all. Fix the symptoms and draw a new crowd.
    startCash: 20_000,
    noGames: true,
    objects: [
      // Two long banks on the main floor, a short one below, and a quiet pair in the back room (68 machines).
      ...tutorialBank(11, 7, 10), ...tutorialBank(23, 7, 10), ...tutorialBank(11, 14, 10), ...tutorialBank(39, 7, 4),
      { kind: "cage", x: 24, y: 25, rot: 0 },
      { kind: "restroom", x: 8, y: 5, rot: 0 }, { kind: "restroom", x: 46, y: 28, rot: 0 },
      // The regulars' bar: every drink free and strong.
      { kind: "bar", x: 12, y: 22, rot: 0, bar: { comp: 1, strength: 1.4 } },
      { kind: "plant", x: 7, y: 30, rot: 0 },
      // The last owner's theming.
      { kind: "junk_cutout", x: 34, y: 6, rot: 0 }, { kind: "junk_neon", x: 7, y: 16, rot: 0 }, { kind: "junk_cutout", x: 21, y: 21, rot: 0 },
      { kind: "junk_neon", x: 34, y: 20, rot: 0 }, { kind: "junk_cutout", x: 40, y: 21, rot: 0 }, { kind: "junk_neon", x: 47, y: 6, rot: 0 },
      { kind: "junk_cutout", x: 47, y: 14, rot: 0 }, { kind: "junk_neon", x: 17, y: 28, rot: 0 }, { kind: "junk_cutout", x: 38, y: 28, rot: 0 },
    ],
    mess: { litter: 70, vomit: 8 },
    rules: { intox: 0, disorder: 0 },
    staff: { tech: 1 },
    footfall: 0.15,
    street: { tourist: 1.5, party: 0.6, local: 0.4, retiree: 0.3, family: 1.5 },
    market: { local: { size: 35, regulars: 0.4 }, retiree: { size: 30, regulars: 0.2 } },
    // (M11.2) Tourists and families are the market to win: plenty of them nearby, coming only for reasons you give them.
    population: { local: 1, retiree: 0.6, tourist: 2, family: 4, party: 0.4 },
    rep: { local: 55, retiree: 45, tourist: 35, family: 30, party: 45 },
    arrivals: 0.16,
    maxGuests: 300,
    // Starting themes: Ancient worlds suit tourists and families (Egypt and Medieval clash, though); Old Vegas
    // mostly doesn't. The restaurant and mini golf are ready to build; the show lounge takes research.
    research: ["th_ancient", "th_vegas", "restaurant", "minigolf"],
    goals: { worth: 40_000, rep: { type: "tourist", min: 55 }, reps: { types: ["family"], min: 50 }, by: { year: 2, month: 11 } },
    tools: 2, tax: 0.05,
  },
  sandbox: {
    id: "sandbox",
    name: "Free Play Lot",
    blurb: "An empty building and no goals.",
    // The tutorial-size building on a lot about 8× the tutorial's (owner, 2026-09-24): room to grow on every side.
    w: 184, h: 112,
    grounds: [{ x: 2, y: 2, w: 156, h: 108 }],
    ...movedLot(56, 68),
    elevator: [76, 73],
    sidewalks: [{ from: [0, 110], to: [183, 110] }],
    // Two neighboring lots for sale to the east (M6.5).
    parcels: [
      { id: "east", name: "East lot", rects: [{ x: 158, y: 2, w: 12, h: 108 }], price: 6_000 },
      { id: "fareast", name: "Far east lot", rects: [{ x: 170, y: 2, w: 12, h: 108 }], price: 4_500 },
    ],
    startCash: 50_000,
    objects: [],
    staff: {},
    footfall: 0.5,
    street: { tourist: 1, party: 1, local: 0.4, retiree: 0.3, family: 0.4, conventioneer: 0.2 },
    market: { local: { size: 220, regulars: 0 }, retiree: { size: 140, regulars: 0 }, highroller: { size: 40, regulars: 0 } },
    population: { local: 1, retiree: 1, tourist: 1, party: 1, highroller: 1, family: 1, conventioneer: 1 },
    rep: {},
    arrivals: 0.45,
    maxGuests: 1500,
    goals: null,
    tools: 4, tax: 0.08, whales: true, research: "build", bribe: 0.6,
  },
  bigfloor: bigFloor(),
  testfloor: testFloor(),
  crowd_local: localsFloor(), crowd_retiree: retireesFloor(), crowd_tourist: touristsFloor(),
  crowd_family: familiesFloor(), crowd_party: partyFloor(), crowd_highroller: highrollersFloor(),
};
export const DEFAULT_SCENARIO = "horseshoe";
