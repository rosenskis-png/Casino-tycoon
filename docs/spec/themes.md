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
- One field per theme from themed pieces (strength 3, radius 4, fading with distance, cut 60% per wall
  crossed), a second for general items' suited themes, and a third for clashes.
- At each tile: a theme's value = themed + (general, where themed > 0.2) − clash. The dominant theme's value
  `s`, plus each other theme's `pairing × min(its value, s)` (clashing pairs count 2.5×), plus a **curated
  bonus** 0.3 × min(general, themed) for the dominant theme, minus a **muddle** of 0.8 × each unrelated theme's
  value and half the dominant theme's clash. Quality q = 3·tanh(Q/3).
- **Room coherence** = the room's average q × the share of its theming that is its dominant theme.
- **Score** guests read = 0.6 q + 0.6 × the room's coherence. Nothing themed anywhere: everything is 0 and no
  memory is used.

Reference (a 4-piece cluster on an empty floor, score at its middle): one theme 1.9, a good pair (Tiki +
Pirate) 1.7, two themed pieces with a palm and a fountain 1.8, a clashing pair (Egypt + Medieval) 0.3, four
unrelated themes −0.6.

## Guests
- Each type has a `theming` weight: Locals 0.3, Retirees 0.5, Tourists 1.0, Party 0.6.
- The score adds theming × 0.25 × score to how much a spot suits them (theming × 0.4 × score when negative: a
  muddle stings more than good theming pleases). It moves mood, where they browse and settle, and which
  machine they pick, like the other qualities.
- A coherent room also reads as more prestigious: prestige + 0.8 × positive score.
- Thoughts stay generic: "I love the theming in here" and "I don't like the theming in this area".

## Measured (Test Floor, `npm run targets`, 300 days, seed 1)
Test Floor themes: a Deco high-limit room (coherence 1.2), a Riviera diner (1.2), a Rat Pack showroom (0.9), a
Deco + Rat Pack members' bar (0.8), an Atomic club (0.7), Tiki and Pirate pieces by the main floor's fountain
(0.1, a big mixed room). 318 "love the theming" thoughts over the run, none bad (nothing on it is muddled).
