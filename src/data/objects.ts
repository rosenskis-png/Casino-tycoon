// Placeable object catalog. Geometry is given for rotation 0, where the object's front faces down (+y);
// seats (access tiles) may lie outside the footprint on the floor around it. sim/geometry.ts rotates both.
import type { Emission } from "./fields";
import type { RoomPurpose } from "./rooms";
import type { ThemeId, ThemeTags } from "./themes";
import type { Family } from "./tables";

/**
 * stool/stand: a guest sits or stands there, visible; hidden: inside (restroom stalls); chair: a table or show
 * seat (drawn as a chair facing `f`); dance: a spot on a dance floor. `f` is a facing in the rotation-0 frame
 * (0 down, 1 left, 2 up, 3 right). dealer (M7): where a dealer stands to run a table; guests never take it.
 */
export interface SeatDef { dx: number; dy: number; kind: "stool" | "stand" | "hidden" | "chair" | "dance" | "lounger" | "swim" | "bench" | "dealer"; f?: number }

/**
 * Amenities as places (FOUNDATIONS §8, docs/spec/construction.md): dragged to a size, with the layout, seats,
 * staff, price and tier generated from it (sim/layout.ts). w is the front width, h the depth, in the object's own
 * frame (row 0 is the back).
 */
export interface SizedDef {
  layout: "bar" | "restroom" | "cage" | "restaurant" | "show" | "club" | "pool" | "garden" | "golf";
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
  cat: "game" | "table" | "amenity" | "outdoor" | "decor" | "security";
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
  /** (M7) Video poker, table games and the draw games (data/tables.ts; docs/spec/tables.md). */
  game?: Family;
  /** Sized amenities (M6): w and h above are the default size. */
  sized?: SizedDef;
  /** What using it does for a guest. */
  serves?: "thirst" | "bladder" | "cage" | "atm" | "hunger" | "show" | "club" | "pool" | "garden" | "golf";
  /** Hidden theming tags (docs/spec/themes.md); `theme` is also the item's visible category. */
  tags?: ThemeTags;
  /** Seconds a visit takes at 1×. */
  use?: [number, number];
  /** Guest-facing price per use, in real-looking dollars (the default for a player-set price). */
  price?: number;
  /** Player-set price range per use (tickets, cover charges, the restaurant's multiplier). */
  priceRange?: [number, number];
  /** (M11.2) Only a scenario places it (the tutorial's broken theming): never in the Build list; thrown out for free. */
  scenarioOnly?: boolean;
  /** (Batch D) A centerpiece: only one of this kind per casino. */
  unique?: boolean;
  /** (Batch D) A landmark's draw (about 1): passers-by at entrances nearby (outdoors) and the casino's sights. */
  landmark?: number;
  desc: string;
}


/**
 * Themed decor (M6.5, docs/spec/themes.md): four pieces per theme, each theming the area around it and giving off
 * its own prestige or energy. Tags are hidden; `desc` is what the player reads.
 */
type DecorRow = [id: string, theme: ThemeId, name: string, cost: number, prs: number, nrg: number, tags: Omit<ThemeTags, "theme">, desc: string];
const DECOR_ROWS: DecorRow[] = [
  ["rome_column", "rome", "Marble Column", 300, 2.5, 0, { suitsPlace: ["highlimit", "show"] }, "A fluted column. Nothing holds it up but ambition."],
  ["rome_bust", "rome", "Emperor Bust", 225, 2, 0, { suitsPlace: ["highlimit", "indoor"] }, "Some emperor or other, on a plinth."],
  ["rome_urn", "rome", "Laurel Urn", 125, 1.5, 0, { suitsTheme: { riviera: 0.5 }, suitsPlace: ["outdoor", "restaurant"] }, "A stone urn with a laurel bush."],
  ["rome_standard", "rome", "Legion Standard", 175, 1.5, 0.5, { suitsPlace: ["floor"] }, "An eagle on a pole, gold and crimson."],
  ["egypt_obelisk", "egypt", "Obelisk", 350, 2.5, 0, { suitsPlace: ["outdoor", "highlimit"] }, "A slim stone obelisk, carved all over."],
  ["egypt_pharaoh", "egypt", "Pharaoh Head", 300, 2, 0, { suitsPlace: ["show", "floor"] }, "A giant striped headdress and a stern stare."],
  ["egypt_papyrus", "egypt", "Papyrus Planter", 125, 1, 0, { suitsPlace: ["water"], clashesPlace: ["club"] }, "Reeds in a painted jar."],
  ["egypt_cat", "egypt", "Cat Statue", 175, 1.5, 0, { suitsPlace: ["indoor"] }, "A sleek black cat with a gold earring."],
  ["med_armor", "medieval", "Suit of Armor", 275, 1.5, 0, { suitsPlace: ["indoor", "highlimit"], clashesPlace: ["outdoor", "club"] }, "Empty, probably."],
  ["med_banner", "medieval", "Heraldic Banner", 125, 1, 0, { suitsPlace: ["bar", "restaurant"] }, "A lion rampant on crimson and gold."],
  ["med_brazier", "medieval", "Iron Brazier", 150, 1, 1, { suitsPlace: ["bar", "outdoor"], clashesPlace: ["water"] }, "Flames in an iron basket. Very safe."],
  ["med_shield", "medieval", "Shield and Swords", 200, 1.5, 0, { suitsPlace: ["indoor"] }, "Crossed swords behind a painted shield."],
  ["rock_guitar", "rock", "Giant Guitar", 350, 0.5, 3, { suitsPlace: ["club", "bar"], clashesPlace: ["restaurant", "highlimit"] }, "A red electric guitar the size of a man."],
  ["rock_amps", "rock", "Amp Stack", 225, 0, 4, { suitsPlace: ["club"], clashesPlace: ["restaurant"] }, "Turned up to eleven. Plays itself."],
  ["rock_jukebox", "rock", "Jukebox", 300, 1, 2.5, { suitsTheme: { ratpack: 0.4, atomic: 0.3 }, suitsPlace: ["bar"] }, "Chrome, bubbles and a hundred singles."],
  ["rock_record", "rock", "Gold Record Stand", 175, 1, 1, { suitsPlace: ["floor", "bar"] }, "A framed gold record, signed by somebody."],
  ["deco_lamp", "deco", "Gilded Torchère", 225, 2.5, 0, { suitsTheme: { ratpack: 0.4 }, suitsPlace: ["highlimit", "bar"] }, "A tall gold lamp throwing light at the ceiling."],
  ["deco_statue", "deco", "Deco Statue", 400, 3, 0, { suitsPlace: ["highlimit", "show"] }, "A gilded dancer, mid-leap, on black marble."],
  ["deco_screen", "deco", "Sunburst Screen", 275, 2.5, 0, { suitsPlace: ["indoor", "restaurant"], clashesPlace: ["outdoor"] }, "Black lacquer and a gold sunburst."],
  ["deco_urn", "deco", "Lacquer Urn", 200, 2, 0, { suitsPlace: ["indoor"] }, "Black and gold, with palm fronds."],
  ["luxe_sculpture", "luxe", "Chrome Sculpture", 450, 3, 0, { suitsPlace: ["highlimit"], clashesPlace: ["club", "smoking"] }, "A polished loop that means something to someone."],
  ["luxe_orchid", "luxe", "Orchid Cube", 175, 2, 0, { suitsPlace: ["restaurant", "highlimit"] }, "One white orchid in a glass cube."],
  ["luxe_glass", "luxe", "Glass Panel", 250, 2, 0, { suitsPlace: ["indoor"], clashesPlace: ["outdoor", "club"] }, "Frosted glass with a thin steel frame."],
  ["luxe_lamp", "luxe", "Arc Lamp", 225, 2, 0, { suitsPlace: ["bar", "restaurant"] }, "A long steel arc ending in a white globe."],
  ["riv_cypress", "riviera", "Cypress Tree", 200, 2, 0, { suitsTheme: { rome: 0.4 }, suitsPlace: ["outdoor", "water"] }, "Tall, dark and Mediterranean."],
  ["riv_lemon", "riviera", "Lemon Tree", 175, 2, 0, { suitsPlace: ["outdoor", "restaurant"] }, "A potted lemon tree heavy with fruit."],
  ["riv_amphora", "riviera", "Amphora", 150, 1.5, 0, { suitsTheme: { rome: 0.5 }, suitsPlace: ["water", "restaurant"] }, "A terracotta amphora, artfully chipped."],
  ["riv_parasol", "riviera", "Striped Parasol", 125, 1.5, 0.5, { suitsTheme: { tiki: 0.3 }, suitsPlace: ["outdoor", "water"], clashesPlace: ["indoor"] }, "Blue and white stripes over a café table."],
  ["rat_mic", "ratpack", "Crooner's Mic", 150, 1.5, 1, { suitsPlace: ["show", "bar"] }, "A chrome microphone waiting for somebody smooth."],
  ["rat_lamp", "ratpack", "Cocktail Lamp", 125, 1.5, 0, { suitsPlace: ["bar"] }, "A red shade on a walnut table. Low light."],
  ["rat_chair", "ratpack", "Velvet Lounge Chair", 225, 2, 0, { suitsTheme: { deco: 0.3 }, suitsPlace: ["bar", "highlimit"] }, "Deep red velvet. Pure 1962."],
  ["rat_marquee", "ratpack", "Marquee Sign", 300, 1.5, 2.5, { suitsTheme: { atomic: 0.3 }, suitsPlace: ["show", "floor"] }, "Chaser bulbs around a name you'd know."],
  ["atom_rocket", "atomic", "Rocket", 350, 1, 2.5, { suitsPlace: ["floor", "outdoor"] }, "Silver fins and a tail of neon flame."],
  ["atom_star", "atomic", "Starburst Sign", 250, 1, 3.5, { suitsPlace: ["club", "floor"], clashesPlace: ["highlimit"] }, "A spiky neon star on a pole."],
  ["atom_atom", "atomic", "Atom Sculpture", 225, 1.5, 1, { suitsPlace: ["floor"] }, "Chrome orbits around a glowing nucleus."],
  ["atom_lava", "atomic", "Lava Lamp", 100, 0.5, 1.5, { suitsPlace: ["bar", "club"] }, "Blobs rising and falling, forever."],
  ["gold_cart", "goldrush", "Mine Cart", 225, 1, 1, { suitsPlace: ["floor", "outdoor"] }, "Brimming with fool's gold."],
  ["gold_barrel", "goldrush", "Whiskey Barrel", 125, 0.5, 0.5, { suitsPlace: ["bar"], clashesPlace: ["highlimit"] }, "Oak, iron hoops and a tap."],
  ["gold_cactus", "goldrush", "Saguaro Cactus", 150, 1, 0, { suitsPlace: ["outdoor"], clashesPlace: ["water"] }, "Arms up, like it just hit a jackpot."],
  ["gold_wanted", "goldrush", "Wanted Poster", 100, 0.5, 0.5, { suitsPlace: ["bar", "floor"] }, "Dead or alive. Mostly alive."],
  ["tiki_idol", "tiki", "Tiki Idol", 250, 1.5, 1, { suitsTheme: { pirate: 0.3 }, suitsPlace: ["water", "outdoor", "bar"] }, "A carved grinning god. Probably friendly."],
  ["tiki_torch", "tiki", "Tiki Torch", 100, 1, 1.5, { suitsPlace: ["outdoor", "water"], clashesPlace: ["highlimit"] }, "A bamboo torch with a real flame."],
  ["tiki_bamboo", "tiki", "Bamboo Screen", 150, 1, 0, { suitsPlace: ["bar", "outdoor"] }, "Lashed bamboo, for a little privacy."],
  ["tiki_drum", "tiki", "Carved Drum", 175, 1, 2, { suitsPlace: ["club", "bar"] }, "A painted log drum. Somebody always plays it."],
  ["pirate_wheel", "pirate", "Ship's Wheel", 200, 1.5, 0.5, { suitsPlace: ["water", "bar"] }, "Hard a-port, toward the slots."],
  ["pirate_chest", "pirate", "Treasure Chest", 275, 2, 0.5, { suitsTheme: { goldrush: 0.3 }, suitsPlace: ["highlimit", "floor"] }, "Overflowing with gold. Bolted to the floor."],
  ["pirate_anchor", "pirate", "Anchor", 175, 1, 0, { suitsPlace: ["water", "outdoor"] }, "A barnacled iron anchor on a coil of rope."],
  // (M8.6) Lucky Dragon: red lacquer, bronze and porcelain.
  ["dragon_lantern", "dragon", "Red Lantern", 150, 1, 1.5, { suitsPlace: ["floor", "bar", "restaurant"] }, "A red silk lantern glowing gold inside."],
  ["dragon_lion", "dragon", "Guardian Lion", 350, 2.5, 0, { suitsTheme: { deco: 0.3 }, suitsPlace: ["highlimit", "floor"] }, "A bronze lion guarding the house's good fortune."],
  ["dragon_vase", "dragon", "Porcelain Vase", 225, 2, 0, { suitsTheme: { luxe: 0.3 }, suitsPlace: ["restaurant", "highlimit"] }, "Blue and white, older than the building."],
  ["dragon_screen", "dragon", "Lacquer Screen", 275, 2, 0.5, { suitsPlace: ["indoor", "restaurant"], clashesPlace: ["outdoor"] }, "Red lacquer with a golden dragon coiling across it."],
  // (M12) Monte Carlo: the grandest pieces in the catalog, for the big money.
  ["mc_chandelier", "monaco", "Crystal Chandelier", 600, 4, 0.5, { suitsTheme: { deco: 0.3 }, suitsPlace: ["highlimit", "restaurant", "show"], clashesPlace: ["outdoor", "club"] }, "A thousand crystal drops and a hundred small flames."],
  ["mc_piano", "monaco", "Grand Piano", 500, 3, 1, { suitsTheme: { ratpack: 0.3 }, suitsPlace: ["bar", "restaurant", "highlimit"], clashesPlace: ["club", "outdoor"] }, "A black concert grand. Someone plays it, somehow."],
  ["mc_champagne", "monaco", "Champagne Tower", 350, 2.5, 1.5, { suitsPlace: ["bar", "highlimit", "club"], clashesPlace: ["restaurant"] }, "Coupes stacked in a pyramid, poured from the top."],
  ["mc_rope", "monaco", "Velvet Rope", 150, 2, 0, { suitsPlace: ["highlimit", "indoor"], clashesPlace: ["outdoor"] }, "Brass posts and red velvet. Not everyone gets in."],
  ["pirate_cannon", "pirate", "Cannon", 225, 1, 1, { suitsPlace: ["outdoor", "floor"], clashesPlace: ["restaurant"] }, "Loaded with confetti, reportedly."],
];

const THEMED_DECOR: Record<string, ObjectDef> = Object.fromEntries(DECOR_ROWS.map(([id, theme, name, cost, prs, nrg, tags, desc]) => [id, {
  id, name, cat: "decor", w: 1, h: 1, cost, upkeep: 0, blocks: true, place: "any",
  emits: [...(prs ? [{ channel: "PRS" as const, strength: prs, radius: 3 }] : []), ...(nrg ? [{ channel: "NRG" as const, strength: nrg, radius: 4 }] : [])],
  sprite: id, art: "whole", seats: [], tags: { theme, ...tags }, desc,
} satisfies ObjectDef]));

/**
 * (Batch D, owner) Large decor: one 2×2 or 3×3 piece per theme, theming LARGE.strength over LARGE.radius tiles (a
 * 1×1 piece: 3 over THEME_RADIUS), with prestige and energy to match. No monthly fee, like the rest of the decor.
 */
export const LARGE = { strength: 6, radius: 15 };
type LargeRow = [id: string, theme: ThemeId, name: string, size: number, cost: number, prs: number, nrg: number, tags: Omit<ThemeTags, "theme">, desc: string];
const LARGE_ROWS: LargeRow[] = [
  ["big_arch", "rome", "Triumphal Arch", 3, 1600, 4, 0, { suitsPlace: ["outdoor", "floor"] }, "A marble arch for a triumph nobody has won yet."],
  ["big_anubis", "egypt", "Anubis Statue", 2, 1100, 3.5, 0, { suitsPlace: ["indoor", "show", "highlimit"] }, "The jackal god, twice a man's height, weighing hearts."],
  ["big_turret", "medieval", "Castle Turret", 3, 1500, 3, 0.5, { suitsPlace: ["outdoor", "bar"], clashesPlace: ["club"] }, "A stone tower with a pennant on top. Nobody lives in it."],
  ["big_drums", "rock", "Giant Drum Kit", 2, 1100, 1, 5, { suitsPlace: ["club", "bar"], clashesPlace: ["restaurant", "highlimit"] }, "A drum kit for a giant, sticks crossed on the snare."],
  ["big_spire", "deco", "Skyscraper Spire", 2, 1300, 4.5, 0, { suitsTheme: { ratpack: 0.3 }, suitsPlace: ["highlimit", "indoor"] }, "A gilded tower in stepped tiers, lit from inside."],
  ["big_cube", "luxe", "Mirror Cube", 2, 1400, 4.5, 0, { suitsPlace: ["highlimit", "restaurant"], clashesPlace: ["club", "smoking"] }, "A polished steel cube. You look richer in it."],
  ["big_pergola", "riviera", "Vine Pergola", 3, 1200, 3.5, 0, { suitsTheme: { rome: 0.4 }, suitsPlace: ["outdoor", "restaurant", "water"], clashesPlace: ["indoor"] }, "Grapevines over a white pergola, and a café table in the shade."],
  ["big_martini", "ratpack", "Martini Sign", 2, 1000, 2, 3.5, { suitsTheme: { atomic: 0.3 }, suitsPlace: ["bar", "show"] }, "A neon martini, olive and all, taller than the bar."],
  ["big_saucer", "atomic", "Flying Saucer", 3, 1500, 1.5, 4, { suitsPlace: ["floor", "outdoor", "club"], clashesPlace: ["highlimit"] }, "Landed on three legs, portholes glowing. Take me to your cashier."],
  ["big_mine", "goldrush", "Mine Entrance", 3, 1200, 1, 1.5, { suitsPlace: ["outdoor", "floor"], clashesPlace: ["highlimit", "water"] }, "Timber props, a lantern and rails running into the dark."],
  ["big_totems", "tiki", "Totem Trio", 2, 1000, 2, 2, { suitsTheme: { pirate: 0.3 }, suitsPlace: ["outdoor", "water", "bar"] }, "Three carved gods, the tallest in the middle. They seem to be smiling."],
  ["big_wreck", "pirate", "Shipwreck Bow", 3, 1400, 2.5, 1, { suitsTheme: { tiki: 0.3 }, suitsPlace: ["water", "outdoor", "floor"] }, "The front of a galleon run aground, figurehead still grinning."],
  ["big_pagoda", "dragon", "Pagoda Shrine", 2, 1200, 3.5, 0.5, { suitsTheme: { luxe: 0.2 }, suitsPlace: ["floor", "restaurant", "highlimit"] }, "Three red roofs stacked up, with golden bells at the corners."],
  ["big_clock", "monaco", "Belle Époque Clock", 2, 1500, 5, 0, { suitsTheme: { deco: 0.3 }, suitsPlace: ["highlimit", "restaurant", "indoor"], clashesPlace: ["club", "outdoor"] }, "A gilded clock on a marble column. It never says how late it is."],
];

/**
 * (Batch D, owner) Centerpieces: 4×4 and up, very expensive, with a monthly fee, one of each per casino. They theme
 * CENTER.strength over CENTER.radius tiles, and as landmarks (`landmark`) they draw: outdoors, passers-by at the
 * entrances nearby; anywhere, the whole casino's sights (sim/street.ts curbAppeal, sim/guests.ts sightsDraw).
 */
export const CENTER = { strength: 9, radius: 20 };
type CenterRow = [id: string, theme: ThemeId, name: string, size: number, cost: number, upkeep: number, place: ObjectDef["place"], prs: number, nrg: number, landmark: number, tags: Omit<ThemeTags, "theme">, desc: string];
const CENTER_ROWS: CenterRow[] = [
  ["cp_volcano", "tiki", "Volcano", 5, 15000, 120, "outdoor", 4, 8, 1.2, { suitsTheme: { pirate: 0.4 }, suitsPlace: ["outdoor", "water"] }, "A rumbling volcano out front, glowing at the top. People cross the street to see it."],
  ["cp_fountains", "riviera", "Dancing Fountains", 5, 14000, 110, "outdoor", 7, 4, 1.1, { suitsTheme: { rome: 0.4, monaco: 0.4 }, suitsPlace: ["outdoor", "water"] }, "Jets that dance to music across a pool the size of a lobby."],
  ["cp_sphinx", "egypt", "Great Sphinx", 4, 11000, 80, "any", 6, 0, 1, { suitsPlace: ["outdoor", "floor"] }, "A sphinx guarding the house, paws out, a riddle on its lips."],
  ["cp_ship", "pirate", "Pirate Galleon", 4, 12000, 90, "any", 3, 5, 1, { suitsTheme: { tiki: 0.4 }, suitsPlace: ["water", "outdoor", "floor"] }, "A full-size galleon, bow first, sails furled and cannons out."],
  ["cp_dragon", "dragon", "Golden Dragon", 4, 12000, 90, "any", 6, 2, 1, { suitsTheme: { luxe: 0.3 }, suitsPlace: ["indoor", "floor", "highlimit"] }, "A golden dragon coiled round a pearl, breathing incense smoke."],
  ["cp_carousel", "monaco", "Grand Carousel", 4, 10000, 80, "indoor", 5, 3, 0.9, { suitsTheme: { deco: 0.3 }, suitsPlace: ["indoor", "floor", "restaurant"], clashesPlace: ["club"] }, "A gilded Belle Époque carousel, horses and mirrors, turning to a waltz."],
];

/** Prestige and energy out to r tiles (before DECOR_REACH; kept within the widest emitter so field updates stay cheap). */
const emitsOf = (prs: number, nrg: number, r: number): Emission[] =>
  [...(prs ? [{ channel: "PRS" as const, strength: prs, radius: r }] : []), ...(nrg ? [{ channel: "NRG" as const, strength: nrg, radius: r }] : [])];
const LARGE_DECOR: Record<string, ObjectDef> = Object.fromEntries(LARGE_ROWS.map(([id, theme, name, n, cost, prs, nrg, tags, desc]) => [id, {
  id, name, cat: "decor", w: n, h: n, cost, upkeep: 0, blocks: true, place: "any", emits: emitsOf(prs, nrg, 3 + n / 2),
  sprite: id, art: "whole", seats: [], tags: { theme, strength: LARGE.strength, radius: LARGE.radius, ...tags }, desc,
} satisfies ObjectDef]));
const CENTERPIECES: Record<string, ObjectDef> = Object.fromEntries(CENTER_ROWS.map(([id, theme, name, n, cost, upkeep, place, prs, nrg, landmark, tags, desc]) => [id, {
  id, name, cat: "decor", w: n, h: n, cost, upkeep, blocks: true, place, emits: emitsOf(prs, nrg, 3 + n / 2),
  sprite: id, art: "whole", seats: [], tags: { theme, strength: CENTER.strength, radius: CENTER.radius, ...tags }, landmark, unique: true,
  desc: `${desc} A centerpiece: one per casino.`,
} satisfies ObjectDef]));

const FRONT: SeatDef[] = [{ dx: 0, dy: 1, kind: "stool" }];


/** Seats in a row along the front (dy), facing up at the table, from dx a to b. */
const front = (a: number, b: number, dy: number, kind: SeatDef["kind"]): SeatDef[] => Array.from({ length: b - a + 1 }, (_, k) => ({ dx: a + k, dy, kind, f: 2 }));
/** A dealer's spot. (M11) Dealers come with the table: its cost below includes DEALER_COST per dealer, and there are no wages. */
export const DEALER_COST = 400;
const dealer = (dx: number, dy = -1): SeatDef => ({ dx, dy, kind: "dealer", f: 0 });
const sides = (w: number, dy: number, kind: SeatDef["kind"]): SeatDef[] => [{ dx: -1, dy, kind, f: 3 }, { dx: w, dy, kind, f: 1 }];

/** Table games and draw games (M7, docs/spec/tables.md). Tables are low: people see over them. */
const TABLES: Record<string, ObjectDef> = {
  vpoker: {
    id: "vpoker", name: "Video Poker", cat: "game", w: 1, h: 1, cost: 250, upkeep: 1, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 0.8, radius: 2 }], sprite: "vpoker", art: "facing", seats: FRONT, game: "vpoker",
    desc: "Jacks or Better. The best payback in the house for a player who knows the game; mistakes cost them.",
  },
  blackjack: {
    id: "blackjack", name: "Blackjack", cat: "table", w: 3, h: 1, cost: 1150, upkeep: 5, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 1, radius: 2 }, { channel: "PRS", strength: 1, radius: 3 }], sprite: "felt", art: "whole",
    seats: [...front(0, 2, 1, "stool"), ...sides(3, 0, "stool"), dealer(1)], game: "blackjack",
    desc: "Five stools and a dealer. A low edge, if the players know what they're doing.",
  },
  roulette: {
    id: "roulette", name: "Roulette", cat: "table", w: 4, h: 1, cost: 1650, upkeep: 6, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 1.5, radius: 3 }, { channel: "PRS", strength: 1.5, radius: 3 }], sprite: "felt", art: "whole",
    seats: [...front(0, 3, 1, "stool"), { dx: 4, dy: 0, kind: "stool", f: 1 }, dealer(1)], game: "roulette",
    desc: "A wheel and five stools. Slow, social, and every bet carries the same edge.",
  },
  craps: {
    id: "craps", name: "Craps", cat: "table", w: 5, h: 2, cost: 2550, upkeep: 7.5, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 4, radius: 5 }], sprite: "felt", art: "whole",
    seats: [...front(0, 4, 2, "stand"), ...sides(5, 0, "stand"), ...sides(5, 1, "stand"), dealer(1), dealer(3)], game: "craps",
    desc: "Nine players standing and two dealers. Loud: the whole table wins together, and a crowd gathers.",
  },
  baccarat: {
    id: "baccarat", name: "Baccarat", cat: "table", w: 4, h: 2, cost: 1900, upkeep: 6, blocks: true, place: "indoor",
    emits: [{ channel: "PRS", strength: 2.5, radius: 3 }], sprite: "felt", art: "whole",
    seats: [...front(0, 3, 2, "chair"), ...sides(4, 1, "chair"), dealer(1)], game: "baccarat",
    desc: "Six chairs and big bets. A low edge and large swings; its players like privacy.",
  },
  poker: {
    id: "poker", name: "Poker Table", cat: "table", w: 4, h: 2, cost: 1300, upkeep: 4, blocks: true, place: "indoor",
    emits: [{ channel: "PRS", strength: 1, radius: 2 }], sprite: "felt", art: "whole",
    seats: [...front(0, 3, 2, "chair"), ...sides(4, 1, "chair"), dealer(1)], game: "poker",
    desc: "Players against each other; the house takes a rake from every pot. Needs two players.",
  },
  keno: {
    id: "keno", name: "Keno Lounge", cat: "table", w: 4, h: 1, cost: 1400, upkeep: 5, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 0.5, radius: 3 }], sprite: "keno", art: "facing",
    seats: [...front(0, 3, 1, "chair"), ...front(0, 3, 2, "chair"), dealer(-1, 0)], game: "keno",
    desc: "A board of 80 numbers and eight chairs. A draw every so often; cheap tickets, a steep edge.",
  },
  sportsbook: {
    id: "sportsbook", name: "Sportsbook", cat: "table", w: 4, h: 1, cost: 1650, upkeep: 6, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 1.5, radius: 3 }], sprite: "sports", art: "facing",
    seats: [...front(0, 3, 1, "stool"), ...front(0, 3, 2, "chair"), dealer(-1, 0)], game: "sports",
    desc: "A wall of screens and a writer taking bets on the games: a small, steady edge, and a crowd on big nights.",
  },
  bingo: {
    id: "bingo", name: "Bingo Hall", cat: "table", w: 6, h: 1, cost: 2150, upkeep: 7.5, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 2, radius: 4 }], sprite: "bingo", art: "facing",
    seats: [...front(0, 5, 1, "chair"), ...front(0, 5, 2, "chair"), ...front(0, 5, 3, "chair"), dealer(-1, 0)], game: "bingo",
    desc: "A caller and eighteen chairs. The prize is the cards sold less the house's hold: the fuller the room, the bigger it gets.",
  },
};

export const OBJECTS: Record<string, ObjectDef> = {
  slot_cherry: {
    id: "slot_cherry", name: "Cherry Parade", cat: "game", w: 1, h: 1, cost: 150, upkeep: 1, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 1.5, radius: 3 }], sprite: "slot_cherry", art: "facing", seats: FRONT, slot: "cherry",
    desc: "Quarter video slot. Lots of small hits, some smaller than the bet.",
  },
  slot_liberty: {
    id: "slot_liberty", name: "Liberty Bell", cat: "game", w: 1, h: 1, cost: 200, upkeep: 1, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 1, radius: 2 }], sprite: "slot_liberty", art: "facing", seats: FRONT, slot: "liberty",
    desc: "Dollar three-reel. Quiet, steady, and the best payback on the floor.",
  },
  slot_thunder: {
    id: "slot_thunder", name: "Thunder Jackpot", cat: "game", w: 1, h: 1, cost: 350, upkeep: 2, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 3, radius: 4 }], sprite: "slot_thunder", art: "facing", seats: FRONT, slot: "thunder",
    desc: "Loud, rare, huge wins. A jackpot here can dent your cash.",
  },
  // (M8) Cabinets for designed slots (docs/spec/designer.md §2, §8): the design sets the look, sound, price and math.
  slot_slant: {
    id: "slot_slant", name: "Slant-top slot", cat: "game", w: 1, h: 1, cost: 250, upkeep: 1.5, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 1, radius: 2 }], sprite: "slot_slant", art: "facing", seats: FRONT, slot: "diamond",
    desc: "A low, seated cabinet. Guests can see over it.",
  },
  slot_upright: {
    id: "slot_upright", name: "Upright slot", cat: "game", w: 1, h: 1, cost: 200, upkeep: 1, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 1.5, radius: 3 }], sprite: "slot_upright", art: "facing", seats: FRONT, slot: "cherry",
    desc: "The standard video cabinet.",
  },
  slot_stepper: {
    id: "slot_stepper", name: "Stepper slot", cat: "game", w: 1, h: 1, cost: 225, upkeep: 1.5, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 1, radius: 2 }], sprite: "slot_stepper", art: "facing", seats: FRONT, slot: "liberty",
    desc: "Mechanical reels behind glass.",
  },
  slot_tall: {
    id: "slot_tall", name: "Tall slot", cat: "game", w: 1, h: 1, cost: 400, upkeep: 2.5, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 2, radius: 3 }], sprite: "slot_tall", art: "facing", seats: FRONT, slot: "stampede",
    desc: "A curved portrait screen, seen from farther away.",
  },
  slot_giant: {
    id: "slot_giant", name: "Giant slot", cat: "game", w: 2, h: 2, cost: 1500, upkeep: 9, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 3.5, radius: 5 }], sprite: "slot_giant", art: "whole", seats: [{ dx: 0, dy: 2, kind: "stool" }], slot: "stampede",
    desc: "A 2×2 attraction, seen and heard across the floor.",
  },
  bar: {
    id: "bar", name: "Bar", cat: "amenity", w: 3, h: 2, cost: 1000, upkeep: 25, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 2, radius: 4 }, { channel: "PRS", strength: 1, radius: 3 }], sprite: "counter", art: "zone",
    seats: [], serves: "thirst", use: [8, 15], price: 7,
    sized: { layout: "bar", min: [3, 2], max: [12, 6], cost: [400, 100], upkeep: [13, 2, 6], tiers: ["Bar", "Lounge", "Grand bar"], tierAt: [8, 16], staffEvery: 4, purpose: "bar" },
    desc: "A counter with stools; deeper bars get lounge tables. Drinks loosen bets. Messy.",
  },
  restroom: {
    id: "restroom", name: "Restrooms", cat: "amenity", w: 2, h: 2, cost: 450, upkeep: 7.5, blocks: true, opaque: true, place: "indoor",
    emits: [], sprite: "restroom", art: "zone",
    seats: [], serves: "bladder", use: [4, 7], // (Batch A) was 5-9 s
    sized: { layout: "restroom", min: [2, 2], max: [8, 5], cost: [150, 75], upkeep: [3.5, 2, 0], tiers: ["Restrooms", "Lounge restrooms"], tierAt: [6], staffEvery: 0 },
    desc: "A stall for every two tiles. The doors face the front.",
  },
  cage: {
    id: "cage", name: "Cashier Cage", cat: "amenity", w: 2, h: 1, cost: 750, upkeep: 17.5, blocks: true, opaque: true, place: "indoor",
    emits: [{ channel: "PRS", strength: 1, radius: 2 }], sprite: "cage", art: "zone",
    seats: [], serves: "cage", use: [3, 5],
    sized: { layout: "cage", min: [2, 1], max: [8, 1], cost: [250, 250], upkeep: [2.5, 0, 7.5], tiers: ["Cashier cage"], tierAt: [], staffEvery: 1 },
    desc: "A window and a teller per tile. Winners cash out here; guests who ran dry draw more money.",
  },
  restaurant: {
    id: "restaurant", name: "Restaurant", cat: "amenity", w: 4, h: 4, cost: 1950, upkeep: 30, blocks: true, place: "indoor",
    emits: [{ channel: "PRS", strength: 1.5, radius: 4 }, { channel: "PRV", strength: 1, radius: 3 }], sprite: "kitchen", art: "zone",
    seats: [], serves: "hunger", use: [40, 80], price: 18, priceRange: [0.5, 3],
    sized: { layout: "restaurant", min: [3, 3], max: [12, 10], cost: [750, 75], upkeep: [15, 0.75, 6], tiers: ["Snack bar", "Diner", "Buffet"], tierAt: [8, 20], staffEvery: 4, purpose: "restaurant" },
    desc: "A kitchen and tables. Fed guests stay longer. Some come just to eat.",
  },
  showlounge: {
    id: "showlounge", name: "Show Lounge", cat: "amenity", w: 5, h: 5, cost: 3375, upkeep: 45, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 3, radius: 5 }, { channel: "PRS", strength: 2, radius: 4 }], sprite: "stage", art: "zone",
    seats: [], serves: "show", use: [45, 45], price: 0, priceRange: [0, 100],
    sized: { layout: "show", min: [4, 4], max: [14, 12], cost: [1500, 75], upkeep: [25, 0.75, 0], tiers: ["Lounge", "Showroom", "Theater"], tierAt: [24, 60], staffEvery: 0, purpose: "show" },
    desc: "A stage and rows of seats. A show every so often, then the whole crowd gets up at once.",
  },
  club: {
    id: "club", name: "Nightclub", cat: "amenity", w: 5, h: 5, cost: 3125, upkeep: 40, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 8, radius: 7 }, { channel: "PRV", strength: 1, radius: 3 }], sprite: "djbooth", art: "zone",
    seats: [], serves: "club", use: [45, 120], price: 10, priceRange: [0, 40],
    sized: { layout: "club", min: [4, 4], max: [14, 12], cost: [1250, 75], upkeep: [20, 1, 0], tiers: ["Dance hall", "Club", "Superclub"], tierAt: [16, 40], staffEvery: 0, purpose: "club" },
    desc: "A DJ and a dance floor. Loud through the walls. Party crowds come for it; dancing is thirsty work.",
  },
  ...TABLES,
  atm: {
    id: "atm", name: "ATM", cat: "amenity", w: 1, h: 1, cost: 300, upkeep: 3, blocks: true, opaque: true, place: "indoor",
    emits: [], sprite: "atm", art: "whole", seats: FRONT.map((s) => ({ ...s, kind: "stand" as const })),
    serves: "atm", use: [3, 5],
    desc: "Cash withdrawals only. The easier it is to find, the more guests come back to it.",
  },
  plant: {
    id: "plant", name: "Potted Palm", cat: "decor", w: 1, h: 1, cost: 75, upkeep: 0, blocks: true, place: "any",
    emits: [{ channel: "PRS", strength: 2, radius: 3 }, { channel: "CLN", strength: 1, radius: 2 }], sprite: "plant", art: "whole", seats: [],
    tags: { suitsTheme: { tiki: 1, riviera: 0.8, pirate: 0.5 }, clashesTheme: { medieval: 0.5, luxe: 0.3 }, suitsPlace: ["outdoor", "water"] },
    desc: "Raises prestige nearby.",
  },
  neon: {
    id: "neon", name: "Neon Sign", cat: "decor", w: 1, h: 1, cost: 150, upkeep: 0, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 6, radius: 6 }], sprite: "neon", art: "whole", seats: [],
    tags: { suitsTheme: { atomic: 1, rock: 0.8, ratpack: 0.5 }, clashesTheme: { rome: 0.6, egypt: 0.6, medieval: 0.8, luxe: 0.4 }, suitsPlace: ["club", "bar"], clashesPlace: ["restaurant", "highlimit"] },
    desc: "Loud light. Energy for some, a headache for others.",
  },
  sign: {
    id: "sign", name: "Sign", cat: "decor", w: 1, h: 1, cost: 40, upkeep: 0, blocks: true, guide: true, place: "any",
    emits: [], sprite: "sign", art: "whole", seats: [],
    desc: "Points guests toward whatever they're looking for, roughly. Guests have to see it.",
  },
  bin: {
    id: "bin", name: "Litter Bin", cat: "decor", w: 1, h: 1, cost: 30, upkeep: 0, blocks: true, place: "any",
    emits: [], sprite: "bin", art: "whole", seats: [],
    desc: "Guests nearby drop their rubbish in it instead of on the floor (unless they're drunk). Fewer janitors needed.",
  },
  bank_sign: {
    id: "bank_sign", name: "Bank sign", cat: "decor", w: 2, h: 1, cost: 500, upkeep: 3, blocks: true, place: "indoor",
    emits: [{ channel: "NRG", strength: 1.5, radius: 3 }], sprite: "bank_sign", art: "whole", seats: [],
    desc: "Shows a linked game's live jackpot meters. A big meter on a sign pulls players from across the room.",
  },
  fountain: {
    id: "fountain", name: "Fountain", cat: "decor", w: 2, h: 2, cost: 750, upkeep: 0, blocks: true, place: "any",
    emits: [{ channel: "PRS", strength: 5, radius: 6 }, { channel: "NRG", strength: 2, radius: 4 }], sprite: "fountain", art: "whole", seats: [],
    tags: { suitsTheme: { pirate: 1, tiki: 1, riviera: 0.8, rome: 0.6 }, clashesTheme: { egypt: 0.8 }, suitsPlace: ["outdoor", "water"] },
    desc: "A showpiece. Prestige for the whole area.",
  },
  // Outdoors (M6.5): always hot and sunny pool weather. Sized like the indoor amenities.
  pool: {
    id: "pool", name: "Pool", cat: "outdoor", w: 6, h: 5, cost: 3500, upkeep: 45, blocks: true, place: "outdoor",
    emits: [{ channel: "NRG", strength: 3, radius: 5 }, { channel: "PRS", strength: 3, radius: 5 }], sprite: "pool", art: "zone",
    seats: [], serves: "pool", use: [60, 120], price: 0, priceRange: [0, 20],
    sized: { layout: "pool", min: [4, 3], max: [14, 10], cost: [1250, 75], upkeep: [22.5, 0.75, 0], tiers: ["Pool", "Pool deck", "Lagoon"], tierAt: [20, 50], staffEvery: 0 },
    tags: { suitsTheme: { tiki: 1, riviera: 1, pirate: 0.6, atomic: 0.4 }, clashesTheme: { medieval: 0.6, egypt: 0.4 } },
    desc: "Loungers along the back and water to swim in. Pool weather, always. Party crowds and tourists come for it.",
  },
  // (M11.2, owner) Mini golf: a draw for families above all (kids love it), tourists too. Indoors or out.
  minigolf: {
    id: "minigolf", name: "Mini Golf", cat: "amenity", w: 5, h: 4, cost: 1400, upkeep: 20, blocks: true, place: "any",
    emits: [{ channel: "NRG", strength: 1.5, radius: 4 }, { channel: "PRS", strength: 0.5, radius: 3 }], sprite: "windmill", art: "zone",
    seats: [], serves: "golf", use: [40, 70], price: 6, priceRange: [0, 20],
    sized: { layout: "golf", min: [4, 3], max: [12, 10], cost: [600, 40], upkeep: [10, 0.5, 0], tiers: ["Putt-putt", "Adventure golf"], tierAt: [12], staffEvery: 0 },
    tags: { suitsTheme: { pirate: 1, medieval: 0.6, tiki: 0.6 }, clashesTheme: { luxe: 0.6, deco: 0.4 }, suitsPlace: ["outdoor"], clashesPlace: ["highlimit"] },
    desc: "Putting greens round a windmill. Families come for it; kids beg for another round. A ticket per round.",
  },
  garden: {
    id: "garden", name: "Garden", cat: "outdoor", w: 5, h: 4, cost: 1300, upkeep: 12.5, blocks: true, place: "outdoor",
    emits: [{ channel: "PRS", strength: 2, radius: 4 }, { channel: "PRV", strength: 2, radius: 3 }, { channel: "CLN", strength: 1, radius: 3 }], sprite: "hedge", art: "zone",
    seats: [], serves: "garden", use: [30, 60],
    sized: { layout: "garden", min: [4, 3], max: [12, 10], cost: [500, 40], upkeep: [5, 0.5, 0], tiers: ["Garden", "Formal garden"], tierAt: [10], staffEvery: 0 },
    tags: { suitsTheme: { riviera: 1, rome: 0.6, medieval: 0.4 }, clashesTheme: { atomic: 0.4, rock: 0.4 } },
    desc: "Hedges, flower beds and benches. A quiet sit for tired feet.",
  },
  patiobar: {
    id: "patiobar", name: "Patio Bar", cat: "outdoor", w: 3, h: 3, cost: 1300, upkeep: 25, blocks: true, place: "outdoor",
    emits: [{ channel: "NRG", strength: 2, radius: 4 }, { channel: "PRS", strength: 1, radius: 3 }], sprite: "counter", art: "zone",
    seats: [], serves: "thirst", use: [8, 15], price: 7,
    sized: { layout: "bar", min: [3, 2], max: [12, 6], cost: [400, 100], upkeep: [13, 2, 6], tiers: ["Patio bar", "Beach bar", "Grand patio"], tierAt: [8, 16], staffEvery: 4, purpose: "bar" },
    tags: { suitsTheme: { tiki: 0.8, riviera: 0.6, pirate: 0.4 } },
    desc: "A bar out in the sun, with shaded tables. Its servers work the grounds.",
  },
  patiorestaurant: {
    id: "patiorestaurant", name: "Patio Restaurant", cat: "outdoor", w: 4, h: 4, cost: 1950, upkeep: 30, blocks: true, place: "outdoor",
    emits: [{ channel: "PRS", strength: 1.5, radius: 4 }, { channel: "PRV", strength: 1, radius: 3 }], sprite: "kitchen", art: "zone",
    seats: [], serves: "hunger", use: [40, 80], price: 18, priceRange: [0.5, 3],
    sized: { layout: "restaurant", min: [3, 3], max: [12, 10], cost: [750, 75], upkeep: [15, 0.75, 6], tiers: ["Snack shack", "Terrace", "Terrace grill"], tierAt: [8, 20], staffEvery: 4, purpose: "restaurant" },
    tags: { suitsTheme: { riviera: 0.8, tiki: 0.6 } },
    desc: "A grill and shaded tables outside. Fed guests stay longer.",
  },
  ...THEMED_DECOR,
  ...LARGE_DECOR,
  ...CENTERPIECES,
  camera: {
    id: "camera", name: "Camera", cat: "security", w: 1, h: 1, cost: 200, upkeep: 1.5, blocks: false, place: "indoor",
    emits: [{ channel: "SRVH", strength: 3, radius: 6 }], sprite: "camera", art: "whole", seats: [],
    desc: "A ceiling dome. Catches cheats in the act, but only while a surveillance operator watches from a Back office.",
  },
  // (M11.2) Broken theming (the tutorial): bad theming around it, and it spoils any theme nearby, so new decor
  // there barely registers until it's thrown out (sim/themes.ts).
  junk_cutout: {
    id: "junk_cutout", name: "Faded Cowboy Cutout", cat: "decor", w: 1, h: 1, cost: 0, upkeep: 0, blocks: true, place: "any", scenarioOnly: true,
    emits: [], sprite: "junk_cutout", art: "whole", seats: [], tags: { junk: 3 },
    desc: "The old owner's idea of theming. Peeling, chipped and a little sad. Throw it out before theming around it.",
  },
  junk_neon: {
    id: "junk_neon", name: "Dead Neon Sign", cat: "decor", w: 1, h: 1, cost: 0, upkeep: 0, blocks: true, place: "any", scenarioOnly: true,
    emits: [], sprite: "junk_neon", art: "whole", seats: [], tags: { junk: 3 },
    desc: "Cracked tubes, half of them dangling. It hasn't lit since the nineties. Throw it out before theming around it.",
  },
  dumpster: {
    id: "dumpster", name: "Dumpster", cat: "security", w: 2, h: 1, cost: 150, upkeep: 0.5, blocks: true, place: "outdoor",
    emits: [], sprite: "dumpster", art: "whole", seats: [],
    desc: "Out back. Where your enforcers take what's left after a disappearance.",
  },
};

/**
 * (M11.3, owner) Decor works as a wide, mild, stacking field: a room's decor adds up at every seat, fading slowly
 * with distance, instead of one piece next to a couple of slots doing everything. Decor's prestige and energy reach
 * DECOR_REACH × as far at DECOR_PEAK × the strength (docs/spec/themes.md). Litter bins and signs emit nothing.
 */
export const DECOR_REACH = 2.2, DECOR_PEAK = 0.4;
for (const o of Object.values(OBJECTS)) {
  if (o.cat !== "decor") continue;
  o.emits = o.emits.map((e) => (e.channel === "CLN" ? e : { ...e, strength: +(e.strength * DECOR_PEAK).toFixed(2), radius: Math.round(e.radius * DECOR_REACH) }));
}

export const OBJECT_CATS: { id: ObjectDef["cat"]; label: string }[] = [
  { id: "game", label: "Games" },
  { id: "table", label: "Tables" },
  { id: "amenity", label: "Amenities" },
  { id: "outdoor", label: "Outdoors" },
  { id: "decor", label: "Decoration" },
  { id: "security", label: "Security" },
];
