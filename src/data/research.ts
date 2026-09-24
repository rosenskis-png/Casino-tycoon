// The research tree as data (FOUNDATIONS §18; docs/spec/research.md). Costs are in research points (a dollar of
// funding each). Anything no project unlocks is always available.
import type { Channel } from "./fields";
import type { ThemeId } from "./themes";

export type ResearchCat = "games" | "amenities" | "themes" | "staff" | "info";
export const RESEARCH_CATS: Record<ResearchCat, string> = { games: "Games", amenities: "Amenities", themes: "Themes", staff: "Staff tools", info: "Information" };

export interface ResearchDef {
  id: string;
  name: string;
  cat: ResearchCat;
  cost: number;
  needs?: string[];
  objects?: string[];
  themes?: ThemeId[];
  overlays?: Channel[];
  /** One more suspicion tool tier (above the scenario's own). */
  tier?: number;
  heatmaps?: boolean;
  club?: boolean;
  breakdowns?: boolean;
  desc: string;
}

const R = (d: ResearchDef) => d;
export const RESEARCH: Record<string, ResearchDef> = Object.fromEntries([
  R({ id: "tables", name: "Table games", cat: "games", cost: 3000, objects: ["blackjack", "roulette"], desc: "Blackjack and roulette tables." }),
  R({ id: "tables2", name: "Craps and baccarat", cat: "games", cost: 5000, needs: ["tables"], objects: ["craps", "baccarat"], desc: "The loud table and the quiet one." }),
  R({ id: "poker", name: "Poker room", cat: "games", cost: 4000, needs: ["tables"], objects: ["poker"], desc: "Players against each other; the house takes a rake." }),
  R({ id: "draw", name: "Keno and bingo", cat: "games", cost: 3000, objects: ["keno", "bingo"], desc: "Slow, cheap games with a steep edge." }),
  R({ id: "vpoker", name: "Video poker", cat: "games", cost: 2000, objects: ["vpoker"], desc: "A machine that rewards skill." }),
  R({ id: "sports", name: "Sportsbook", cat: "games", cost: 4000, objects: ["sportsbook"], desc: "Bets on the games, busiest on big nights." }),
  R({ id: "bigslots", name: "Big-jackpot slots", cat: "games", cost: 2500, objects: ["slot_thunder"], desc: "Rare, huge top prizes." }),
  // (M8) The slot designer (docs/spec/designer.md §11): layouts, features and cabinets; the lab's panel by type.
  R({ id: "video", name: "Video reels", cat: "games", cost: 3000, desc: "Five-reel video layouts for your designs: 20 and 40 lines." }),
  R({ id: "ways", name: "Ways to win", cat: "games", cost: 3000, needs: ["video"], desc: "243, 1024 and 4096 ways: wins anywhere left to right." }),
  R({ id: "freespins", name: "Free spins", cat: "games", cost: 3500, desc: "Scatters that trigger free spins, with multipliers, wilds and expanding symbols." }),
  R({ id: "cabinets", name: "Showpiece cabinets", cat: "games", cost: 4000, objects: ["slot_tall", "slot_giant"], desc: "Tall portrait cabinets and 2×2 giants." }),
  R({ id: "fastcert", name: "Fast-track certification", cat: "games", cost: 2500, desc: "Your designs are certified in 3 days for $750." }),
  R({ id: "restaurant", name: "Restaurant", cat: "amenities", cost: 3000, objects: ["restaurant", "patiorestaurant"], desc: "Meals indoors and out." }),
  R({ id: "shows", name: "Show lounge", cat: "amenities", cost: 5000, needs: ["restaurant"], objects: ["showlounge"], desc: "Scheduled shows that draw a crowd." }),
  R({ id: "club", name: "Nightclub", cat: "amenities", cost: 5000, objects: ["club"], desc: "Dancing and a cover charge." }),
  R({ id: "outdoors", name: "Outdoors", cat: "amenities", cost: 6000, objects: ["pool", "garden", "patiobar"], desc: "A pool, a garden and a patio bar." }),
  R({ id: "th_vegas", name: "Old Vegas themes", cat: "themes", cost: 3000, themes: ["ratpack", "atomic", "goldrush"], desc: "Rat Pack Lounge, Neon Atomic, Gold Rush." }),
  R({ id: "th_ancient", name: "Ancient worlds", cat: "themes", cost: 3000, themes: ["rome", "egypt", "medieval"], desc: "Rome, Egypt, Medieval." }),
  R({ id: "th_luxury", name: "Luxury themes", cat: "themes", cost: 4000, themes: ["deco", "luxe", "riviera", "dragon"], desc: "Gilded Deco, Modern Luxe, Riviera, Lucky Dragon." }),
  R({ id: "th_fun", name: "Just for fun", cat: "themes", cost: 3000, themes: ["tiki", "pirate", "rock"], desc: "Tropical Tiki, Pirate Cove, Rock & Roll." }),
  R({ id: "cameras", name: "Cameras", cat: "staff", cost: 3000, objects: ["camera"], desc: "Ceiling cameras for a surveillance operator to watch." }),
  R({ id: "slotlab", name: "Slot lab panels", cat: "info", cost: 3000, desc: "The lab's test panel reports by guest type." }),
  R({ id: "sus2", name: "Suspicion tools 2", cat: "info", cost: 2000, tier: 2, desc: "One more way to read a guest." }),
  R({ id: "sus3", name: "Suspicion tools 3", cat: "info", cost: 4000, tier: 3, needs: ["sus2"], desc: "Another." }),
  R({ id: "sus4", name: "Suspicion tools 4", cat: "info", cost: 6000, tier: 4, needs: ["sus3"], desc: "The best estimate there is." }),
  R({ id: "map_crowd", name: "Crowd maps", cat: "info", cost: 2500, overlays: ["TRF", "CRW", "NRG"], desc: "See foot traffic, crowding and noise." }),
  R({ id: "map_style", name: "Style maps", cat: "info", cost: 2500, overlays: ["PRS", "PRV", "SMK"], desc: "See prestige, privacy and smoke." }),
  R({ id: "map_security", name: "Security maps", cat: "info", cost: 2500, needs: ["cameras"], overlays: ["SRVV", "SRVH", "EXV"], desc: "See surveillance and how visible the exits are." }),
  R({ id: "map_clean", name: "Cleanliness map", cat: "info", cost: 1500, overlays: ["CLN"], desc: "See where the floor is dirty." }),
  R({ id: "heatmaps", name: "Heatmaps", cat: "info", cost: 3000, heatmaps: true, desc: "Revenue and play time over every game." }),
  R({ id: "club", name: "Player's club", cat: "info", cost: 5000, club: true, desc: "Members' cards: who your guests are, what they're worth, targeted comps." }),
  R({ id: "breakdowns", name: "Guest breakdowns", cat: "info", cost: 3000, needs: ["club"], breakdowns: true, desc: "Machine and table stats by guest type." }),
].map((d) => [d.id, d]));

/** Monthly funding choices (dollars = points). */
export const FUNDING = [0, 250, 500, 1000, 2000];
