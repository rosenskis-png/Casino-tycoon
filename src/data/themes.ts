// Themes (FOUNDATIONS §5, docs/spec/themes.md). Twelve visible theme categories, the hidden pairings between
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
} as const;
export type ThemeId = keyof typeof THEMES;
export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/**
 * Hidden synergy between two themes strong in the same area (applied to both): positive pairs combine into
 * something better, negative ones undermine each other. Unlisted pairs are neutral (and muddle each other).
 */
const PAIRS: [ThemeId, ThemeId, number][] = [
  ["rome", "riviera", 0.5], ["rome", "egypt", 0.4], ["deco", "ratpack", 0.5], ["tiki", "pirate", 0.5],
  ["tiki", "atomic", 0.4], ["rock", "atomic", 0.4],
  ["egypt", "medieval", -0.5], ["rock", "luxe", -0.5], ["goldrush", "riviera", -0.4], ["medieval", "atomic", -0.5],
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
  /** General items: themes they quietly count toward, with a weight. Themed items may add neighbors too. */
  suitsTheme?: Partial<Record<ThemeId, number>>;
  /** Themes it clashes with (weight): it weakens them nearby and is weakened where they're strong. */
  clashesTheme?: Partial<Record<ThemeId, number>>;
  suitsPlace?: Place[];
  clashesPlace?: Place[];
}

/** Radius a decor item themes, in tiles. */
export const THEME_RADIUS = 4;
