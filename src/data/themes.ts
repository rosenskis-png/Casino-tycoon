// Themes (FOUNDATIONS §5, docs/spec/themes.md). Thirteen visible theme categories (Lucky Dragon since M8), the hidden pairings between
// them, and where things suit. Decor items (data/objects.ts) belong to a theme or to General; every item carries
// hidden tags the player never sees. Guests only ever say generic things about theming.

export const THEMES = {
  rome: "Ancient Rome",
  egypt: "Ancient Egypt",
  medieval: "Medieval",
  rock: "Rock & Roll",
  deco: "Gilded Deco",
  luxe: "Modern Luxe",
  riviera: "Riviera",
  ratpack: "Rat Pack Lounge",
  atomic: "Neon Atomic",
  goldrush: "Gold Rush",
  tiki: "Tropical Tiki",
  pirate: "Pirate Cove",
  dragon: "Lucky Dragon",
  // (M12) Belle Époque grandeur for the big money: crystal, red velvet, gilt and a grand piano.
  monaco: "Monte Carlo",
} as const;
export type ThemeId = keyof typeof THEMES;
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/**
 * Hidden synergy between two themes strong in the same area (applied to both): positive pairs combine into
 * something better, negative ones undermine each other. Unlisted pairs are neutral (and muddle each other).
 */
const PAIRS: [ThemeId, ThemeId, number][] = [
  ["rome", "riviera", 0.5], ["rome", "egypt", 0.4], ["deco", "ratpack", 0.5], ["tiki", "pirate", 0.5],
  ["tiki", "atomic", 0.4], ["rock", "atomic", 0.4], ["dragon", "luxe", 0.4], ["dragon", "deco", 0.3],
  ["egypt", "medieval", -0.5], ["rock", "luxe", -0.5], ["goldrush", "riviera", -0.4], ["medieval", "atomic", -0.5],
  ["dragon", "goldrush", -0.4], ["dragon", "medieval", -0.4],
  ["monaco", "deco", 0.4], ["monaco", "riviera", 0.5], ["monaco", "ratpack", 0.2], ["monaco", "rock", -0.5], ["monaco", "tiki", -0.5],
  ["monaco", "pirate", -0.4], ["monaco", "goldrush", -0.4], ["monaco", "atomic", -0.3],
];
export const SYNERGY: number[][] = THEME_IDS.map((a) => THEME_IDS.map((b) => {
  const p = PAIRS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return p ? p[2] : 0;
}));

/** Places an item can suit or clash with (hidden). Room purposes count as places too. */
export type Place = "indoor" | "outdoor" | "water" | "bar" | "restaurant" | "highlimit" | "club" | "show" | "smoking" | "floor";

/** Hidden theming tags on a decor item. */
export interface ThemeTags {
  /** Its visible category (omit for General). */
  theme?: ThemeId;
  /** How strongly it themes the area (default 3 for themed items). */
  strength?: number;
  /** (Batch D) How far it themes, in tiles (default THEME_RADIUS): large decor and centerpieces reach further. */
  radius?: number;
  /** General items: themes they quietly count toward, with a weight. Themed items may add neighbors too. */
  suitsTheme?: Partial<Record<ThemeId, number>>;
  /** Themes it clashes with (weight): it weakens them nearby and is weakened where they're strong. */
  clashesTheme?: Partial<Record<ThemeId, number>>;
  suitsPlace?: Place[];
  clashesPlace?: Place[];
  /** (M11.2) Broken theming: this much bad theming at the item, fading like a theme; it spoils any theme there too. */
  junk?: number;
}

/**
 * Radius a decor item themes, in tiles. M11.1: 7 (was 4): theming carries into neighboring rooms, so a floor of
 * clashing rooms reads as disjointed. M11.3 (owner): 11, at THEME_PEAK × the strength, so a room's pieces stack
 * into its theming instead of one piece saturating the seats beside it.
 */
export const THEME_RADIUS = 11, THEME_PEAK = 0.4;
