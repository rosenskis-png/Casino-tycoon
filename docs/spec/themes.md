# Themes (M6.5)

FOUNDATIONS §4 (THM channels) and §5 (theming and decoration); NORTH_STAR "The hidden psychology layer". Owner
decisions 2026-09-24 (DECISIONS.md). Everything here is hidden: the player sees a theme category in the build
menu and hears generic thoughts; nothing else.

## Themes and pieces (`src/data/themes.ts`, `src/data/objects.ts`)
Twelve themes, four 1×1 pieces each (build menu → Decoration, theme picker):

| Theme | Pieces |
|---|---|
| Ancient Rome | Marble Column, Emperor Bust, Laurel Urn, Legion Standard |
| Ancient Egypt | Obelisk, Pharaoh Head, Papyrus Planter, Cat Statue |
| Medieval | Suit of Armor, Heraldic Banner, Iron Brazier, Shield and Swords |
| Rock & Roll | Giant Guitar, Amp Stack, Jukebox, Gold Record Stand |
| Gilded Deco | Gilded Torchère, Deco Statue, Sunburst Screen, Lacquer Urn |
| Modern Luxe | Chrome Sculpture, Orchid Cube, Glass Panel, Arc Lamp |
| Riviera | Cypress Tree, Lemon Tree, Amphora, Striped Parasol |
| Rat Pack Lounge | Crooner's Mic, Cocktail Lamp, Velvet Lounge Chair, Marquee Sign |
| Neon Atomic | Rocket, Starburst Sign, Atom Sculpture, Lava Lamp |
| Gold Rush | Mine Cart, Whiskey Barrel, Saguaro Cactus, Wanted Poster |
| Tropical Tiki | Tiki Idol, Tiki Torch, Bamboo Screen, Carved Drum |
| Pirate Cove | Ship's Wheel, Treasure Chest, Anchor, Cannon |
| Monte Carlo (M12) | Crystal Chandelier, Grand Piano, Champagne Tower, Velvet Rope |

**Monte Carlo (M12, owner: "high class luxury stuff" for The Outfit):** Belle Époque grandeur, the grandest pieces
in the catalog (Chandelier $600, prestige 4 and a warm light pool; Piano $500; Champagne Tower $350; Velvet Rope
$150), in the Luxury themes research with a matching slot theme ("Belle Époque", "Casino Royale"). Pairs well with
Deco (+0.4), Riviera (+0.5) and Rat Pack (+0.2); clashes with Rock, Tiki (−0.5), Pirate, Gold Rush (−0.4) and
Atomic (−0.3). Hidden tastes: High rollers 1 (their favorite), Conventioneers 0.4, Retirees and Tourists 0.3,
Party −0.2, Locals and Families −0.3.

Each piece also gives off its own prestige and/or energy (luxury themes more prestige; Rock, Atomic and Tiki more
energy). Costs $200–$900; upkeep about 0.5% of cost a month.

## Hidden tags
- **Pairings** (applied to both themes when strong in the same area). Good: Rome + Riviera, Rome + Egypt,
  Deco + Rat Pack, Tiki + Pirate, Tiki + Atomic, Rock + Atomic. Clashes: Egypt + Medieval, Rock + Modern Luxe,
  Gold Rush + Riviera, Medieval + Atomic. Everything else is neutral, and muddles.
- **General items** quietly count toward themes they suit, only where that theme is already present from
  themed pieces: potted palm (Tiki, Riviera, Pirate; clashes Medieval, Luxe), neon sign (Atomic, Rock, Rat Pack;
  clashes Rome, Egypt, Medieval, Luxe), fountain (Pirate, Tiki, Riviera, Rome; clashes Egypt), pool (Tiki,
  Riviera, Pirate, Atomic; clashes Medieval, Egypt), garden (Riviera, Rome, Medieval; clashes Atomic, Rock),
  patio bar and restaurant (Tiki, Riviera).
- **Places:** each piece suits or clashes with places (indoors, outdoors, near water, and room purposes: floor,
  bar, restaurant, high-limit, club, show, smoking). A suited place strengthens a piece ×1.3, a clashing one
  weakens it ×0.5 (e.g. a Suit of Armor outdoors or in a club, a Glass Panel outside, a parasol indoors).

## The math (`src/sim/themes.ts`)
- **(M11.3, owner) Decor is a wide, mild, stacking field**, not one intense piece beside a couple of slots: themed
  pieces theme 11 tiles at 0.4× the strength (THEME_RADIUS, THEME_PEAK: each piece 1.2 at its tile, fading linearly),
  so a room's pieces add up at every seat and a well-dressed room is what saturates. All theme sources (designed
  slots, general items, clashes, junk) scale by the same 0.4. Decor's prestige and energy reach 2.2× as far at 0.4×
  the strength (DECOR_REACH, DECOR_PEAK in data/objects.ts; a statue's prestige 3 over 3 tiles is now 1.2 over 7).
- One field per theme from themed pieces (strength 3, radius 7 (M11.1; was 4), fading with distance, cut 35% per
  wall crossed (M11.1; was 60%)), a second for general items' suited themes, and a third for clashes.
- At each tile: a theme's value = themed + (general, where themed > 0.2) − clash. The dominant theme's value
  `s`, plus each other theme's `pairing × min(its value, s)` (clashing pairs count 2.5×), plus a **curated
  bonus** 0.3 × min(general, themed) for the dominant theme, minus a **muddle** of 0.8 × each unrelated theme's
  value and half the dominant theme's clash. Quality q = 3·tanh(Q/3).
- **Room coherence** = the room's average q × the share of its theming that is its dominant theme.
- **Score** guests read = 0.6 q + 0.6 × the room's coherence. Nothing themed anywhere: everything is 0 and no
  memory is used.

**Broken theming (M11.2, the tutorial):** a piece tagged `junk` (Faded Cowboy Cutout, Dead Neon Sign; only a
scenario places them, the player throws them out for free) spreads a junk field like a theme (strength 3,
radius 7). Where nothing is themed, the tile's quality is −3·tanh(junk/3) (bad theming: guests who care about
theming mind it, "badTheme" thoughts); where something is, 1.5 × junk comes off Q, so new decor near it barely
registers until it's gone.

Reference (a 4-piece cluster on an empty floor, score at its middle): one theme 1.9, a good pair (Tiki +
Pirate) 1.7, two themed pieces with a palm and a fountain 1.8, a clashing pair (Egypt + Medieval) 0.3, four
unrelated themes −0.6.

## Large decor and centerpieces (Batch D, owner)
- **Large decor** (`LARGE` in data/objects.ts): one piece per theme, 2×2 or 3×3, no monthly fee. A themed source of
  strength 6 over 15 tiles (tags `strength`, `radius`; sim/themes.ts reads a radius per source).
- **Centerpieces** (`CENTER`): six, 4×4 or 5×5, one of each per casino (`unique`, refused by the place command),
  $10-15K with a monthly fee. Strength 9 over 20 tiles. Each is a **landmark** (`landmark` ≈ 1; sim/landmarks.ts,
  LANDMARK in data/psych.ts): outdoors it adds 0.5 × draw × (1 − distance ÷ 19) to the curb appeal of every entrance
  within 18 tiles; anywhere it adds 0.5 × draw × (0.6 + 0.6 × the crowd's theme taste, 0-1.2) to each crowd's sights
  (capped at 3). Cached with the draw; never saved.
- Wide reach cuts both ways: a centerpiece whose theme doesn't pair with its neighbors muddles a big area.

## Guests
- Each type has a `theming` weight: Locals 0.3, Retirees 0.5, Tourists 1.0, Party 0.6.
- **(M11.1) Each type has hidden theme tastes** (−1..1, `themes` in data/guests.ts): Locals Gold Rush, Rat Pack,
  Rock; Retirees Rat Pack, Deco, Riviera (dislike Atomic, Rock); Tourists Rome, Egypt, Pirate, Tiki; Party Atomic,
  Rock, Tiki (dislike Rat Pack, Deco); High rollers Luxe, Deco, Dragon (dislike Pirate, Gold Rush, Tiki);
  Conventioneers Luxe, Rome, Riviera; Families Pirate, Tiki, Medieval (dislike Rat Pack).
- The score adds theming × (0.25 + 0.6 × taste for the spot's dominant theme) × score to how much a spot suits
  them (theming × 0.4 × score when negative: a muddle stings more than good theming pleases). A well-done theme
  a crowd dislikes puts them off: "I don't like the theming in this area".
- **(M11.1) Spillover (owner):** themes reach 7 tiles (was 4) and lose 35% per wall (was 60%), so a room is felt
  next door. Clashing rooms side by side muddle each other and lower both rooms' coherence: a casino of
  differently themed rooms for each crowd reads as disjointed unless the rooms are far enough apart. It moves mood, where they browse and settle, and which
  machine they pick, like the other qualities.
- A coherent room also reads as more prestigious: prestige + 0.8 × positive score.
- Thoughts stay generic: "I love the theming in here" and "I don't like the theming in this area".

## Measured (Test Floor, `npm run targets`, 300 days, seed 1)
Test Floor themes: a Deco high-limit room (coherence 1.2), a Riviera diner (1.2), a Rat Pack showroom (0.9), a
Deco + Rat Pack members' bar (0.8), an Atomic club (0.7), Tiki and Pirate pieces by the main floor's fountain
(0.1, a big mixed room). 318 "love the theming" thoughts over the run, none bad (nothing on it is muddled).
