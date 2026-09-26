# Custom symbols and the theme rating (Batch E)

**Status: built 2026-09-26 (schema 28).** Owner's design in DECISIONS (2026-09-26, Batch E). Code:
`src/data/emoji.ts` (the library, hidden tag tables), `src/sim/design/theme.ts` (the score),
`src/ui/designer/Symbols.tsx` (editor, rating bar). Checks: `themeChecks()` in `src/sim/design/checks.ts`.

## The idea
Every theme's two premade symbol sets rank good to great, never perfect. Next to them is **Custom**: pick your own
symbols from a big emoji library and put them in pay order. A custom set can be much worse than a premade or better
than any of them. It's RCT's "one more idea" loop: the player chases a higher **Theme** number without knowing the
rules behind it.

- Every emoji carries **hidden tags**. A tag two or more of your symbols share is a **link**.
- A rare tag is worth much more than a common one ("animal" is nearly worthless, "luau" is gold), and a rare tag
  shared by more symbols is worth more again. Whether two rare links beat one link across four symbols isn't
  obvious from outside, by design.
- Links that join the *same* symbols mostly count once, so ten sea creatures sharing "sea" and "animal" aren't
  rewarded twice. Links that join *different* groups of symbols all count. The owner's Hawaii example: 🐬 🥥 🍧 🌈
  are all tropical, and shaved ice also links to the coconut (food) and to the rainbow (colorful).
- **The player sees the exact rating (two decimals, like RCT's ratings) and never what's wrong.** No hints, no "the
  dolphin doesn't fit". Experimenting is the game.
- **Theming bonuses (owner, same day):** the lab lists every shared tag the set earns credit from, most credit
  first, with the symbols sharing it ("Hawaii 🌺🍍🥥🐢", "Bow 🏹🎻"). Only links earned, never tags a symbol has
  alone or what's missing: the player discovers tags and learns them to build on.

## The set
Four highs (the hero first), five lows (or card ranks A K Q J 10), a scatter and a jackpot symbol, all different.
WILD stays the drawn WILD tile. On 3-reel classics the reels show the hero, the other three highs and the first
low (or the scatter). The design's theme still sets the colors, the frame and the default call. A custom set is
looks only: no new version, no certification.

**Designer (Concept tab):** **Custom** is its own tile at the head of the theme list (owner), starting as a copy
of the current set; picking a theme drops it. With Custom on, a **Colors** row picks which theme's background,
frame and default call the machine wears. Tap a spot, then a symbol. Picking a symbol that's already in the set swaps the two. ◀ Pays more / Pays less ▶
move the selected symbol in pay order. "Card ranks / Symbols" switches the lows. The library is browsed by nine
categories or searched by name. The **Theme rating** bar sits under it, and at the foot of the Show and Cabinet tabs
and in the lab's ratings; the lab also lists the Theming bonuses. Tag names shown there come from `tagName()`
(`TAG_NAMES` overrides, else the id in words).

## The library (`src/data/emoji.ts`)
466 symbols (every emoji the game already used, the drawn sevens and bars, and about 330 more) and about 350 tags.
Each row: emoji, name (shown, searchable), main color as drawn on an iPhone, clout 1-5 (how grand it feels), tags.
A tag ending in `~` is loose (half strength). Every symbol also gets a loose color tag from its main color. Every
tag must be carried by at least two symbols (checked).

**How the tags are written: a mind map, not a taxonomy.** Three layers:
- **Broad** (animal, food, flower, music): nearly worthless alone. They exist so newcomers' obvious sets aren't
  zero.
- **Middle** (sea, reef, farm, desert, jungle, candy, pirate, luxury, space, halloween, breakfast, cocktail): the
  obvious clusters. Within a cluster, members don't all share everything: sharks and turtles are reef, the octopus
  and the dolphin are clever, the dolphin and the otter play.
- **Narrow**: stories, places and puns that cut across clusters, Codenames-style. Carried by 2-12 symbols, so each
  is worth a lot. Examples:
  - Stories: Alice (🐇 🎩 🫖 🦩 🦔 🐛 🍄 🕰️ 🃏 🦤), Beauty and the Beast (🌹 🕰️ 🫖 🕯️ 📚 🏰), three little pigs (🐖 🐺
    🧱 🌾 🪵), hey diddle diddle (🐄 🌙 🥄 🎻 🐈 🍽️), Peter Pan (🐊 🕰️ 🪝 🧚 ⭐), Ice Age (🦣 🦥 🐿️ 🌰 🧊), the toy box
    (🤠 🚀 🦖 🐖 🥔 👽), ninja turtles (🐢 🍕 🐀 🥷).
  - Places and occasions: Hawaii (🌺 🍍 🥥 🐢 🌋 🏄 🍧 🌈), Irish luck (🍀 🌈 🪙 🍺 🥔 🎻), Day of the Dead (💀 🌼
    🕯️ 🦋 🐕 🎸), Aztec (🐍 🦅 🌵 🌽 🍫 🐆 🔺), the mob (🎩 🌹 🐎 🎻 🍝 🍷 🐟 🍊), Pac-Man's bonus items (🍒 🍓 🍊 🍎 🍉
    🔔 🗝️ 👻), the Chinese zodiac, the four guardians (🐉 🐅 🐢), Vegas (🎰 🦩 💒 💃 🃏 🎲).
  - Puns: bow (🏹 🎻 🎀), bat (🦇 ⚾ 🏏), ring (💍 🔔 🥊 🎪 🪐 📞 🍩), crown (👑 🦷 🍍), trunk (🐘 🌳 🧳 🚗), bark
    (🐕 🌲 🌳 🪵), chip (🍟 🍪 🐿️ 🪙), bar (🍫 🎰 and the BARs), mouse (🐁 🖱️), code (🐍 ☕ 🦀 💎 🐫 🐘 💻), eight
    (🐙 🕷️ 🎱), seven (7️⃣ 🌈 🎲), wheel (🎡 🛞 🧀), black and white (🐼 🦓 🐧 🐄 🎹 🎬).
  - Hubs, symbols with many lives: the rabbit, the pig, the rainbow, the bell, the rose, the wolf, the snake, the
    top hat. Hubs are what make surprising sets possible.

Adding to it: write a row, give it 4-9 tags (at least one middle and, where there's one, a narrow tag), run
`npm run headless` (it lists any tag only one symbol carries).

## The score (`src/sim/design/theme.ts`, constants in `TH`)
Symbols judged: highs (weight 1), emoji lows (0.6), scatter and jackpot (0.8). Card ranks aren't judged.
- **Rarity** of a tag: `ln(N / carriers) / ln(N / 2)`, 0.05-1 (N = library size).
- **Link** value: `rarity^2 × (weighted members beyond the first)^1.2`.
- **Overlap:** links sorted by value; each counts `× (1 − 0.85 × J²)`, J = its largest overlap (Jaccard) with a
  stronger link.
- **Links part:** `dense / (dense + 2.5)`, dense = Σ counted / (weight / 6). It saturates slowly, so a better set
  always scores a little more, and a full 11-symbol set needn't link twice as much as a 6-symbol one.
- **Belonging:** each symbol's own counted links (rarity-weighted), `1 − exp(−b / 0.45)`. A symbol with nothing is
  an orphan (−0.9 × its weight).
- **Through-line:** the best `rarity^0.8 × clamp((cover − 0.35) / 0.5)` over tags (cover = share of the set).
- **Pay order:** every pair of paying symbols: the higher-paying one having more clout scores 1, equal 0.6, one less
  0.25, else 0 (pairs with the hero ×2, high-high ×1.5, high-low ×1, low-low ×0.5). 15% is the jackpot symbol's
  clout.
- **One world:** the share of the set in the largest group joined by links with rarity² ≥ 0.08. A scatter or jackpot
  that reads as treasure (money, treasure, gem, gold, luck) always counts as joined. A split set loses 40% × its
  unjoined share.
- **Clashes** (hidden pairs of tags, `TAG_CLASHES`): gross vs food, vice vs innocent, winter vs tropical, and
  others; `3 × v × min(1, 2√(cover_a × cover_b))`.
- **Score** = `10 × (raw − 0.28) / (0.86 − 0.28)` clamped 0-10, raw = (0.55 links + 0.2 belonging + 0.15 through-line
  + 0.1 pay order) × one world, then minus orphans and clashes.

**Presentation** (any design, −0.5 to +0.5 on top): the cabinet body color and the light color against the symbols'
palette (each symbol's main color; neutral black, grey and white are safe, never great), the signature call and
(custom sets) the theme's look against what the symbols lean to (own theme +1, a good pairing up to +0.5, a clash
down to −1). `0.35 (body − 0.4) + 0.3 (light − 0.4) + 0.15 call + 0.1 look`.

**Theme rating** = score + presentation, 0-10.

## What it does
- **Excitement:** `+0.022 × (rating − 7) × (0.5 + the type's taste for theming)` on the raw score
  (`THEME_EX`). Most at the midpoint: about ±1 Excitement for a 10 or a 3 against a 7.
- **Crowds' tag tastes** (`TAG_TASTES`, hidden, −1..1 by how much of the set carries each tag, × 0.07):
  Locals like classic fruit machines, luck, the Wild West, game day and beer, and dislike cute, fancy and glam.
  Retirees like the fifties, flowers, birds, gardens, royalty and tea, and dislike spooky, monsters and gross.
  Tourists like Vegas, travel, New York, treasure and showbiz. Party guests like parties, booze, rock, disco and vice.
  High rollers like luxury, the jet set, gems, gold, royalty and spies, and dislike cute, toys, fast food and farms.
  Conventioneers like tech, code, science, space and (really) the office. Families like cute, candy, fairy tales,
  toys, nursery rhymes, the circus and dinosaurs, and dislike vice, booze, spooky, monsters and weapons.
- **What the set leans to** (`TAG_DECOR`): tags map to decor themes (tropical and Hawaii → Tiki, Wild West → Gold
  Rush, space and the fifties → Neon Atomic…). A custom set counts as the theme it clearly leans to (score ≥ 0.3),
  or none, for room theming (a weak decor piece, as before), the hidden feature pairings, and novelty. Premade sets
  count as their own theme, as before.
- **Kids:** a custom set's kid appeal comes from its tags (`KIDDY_TAGS`).
- The signature call's fit moved from the pairings into the theme rating.

## Calibration (2026-09-26)
| Set | Score |
|---|---|
| Premade sets (32) | 5.2-8.6, median 6.9 (Showgirl lowest, Prospector highest) |
| Stock designs' displayed rating | 6.1 (Treasure) to 9.1 (Prospector) |
| 200 random 6-symbol / 11-symbol picks | mean 0.3 / 1.4 |
| Owner's examples: 4 farm/zoo animals, 4 sea animals, 🐬🥥🍧🌈 | 4.7, 6.8, 6.1 (6.1 loses pay order: the rainbow outranks the dolphin) |
| First tries: full Hawaii, Alice, reef, Pac-Man, the mob | 8.5, 8.3, 8.4, 7.6, 7.8 |
| A greedy optimizer from random starts | 9.4-9.7, always a real theme (the zodiac, wild predators, luxury, "mate for life": 💍 🦢 🕊️ 🐧 🐕 🦁) |

Checks (`npm run headless`): library well formed; premade sets 5-9; a fixed batch of 200 random picks averages
under 2.5; every rating finite and within 0-10. Nothing random is asserted.
