# Art: style guide and pipeline ("Velvet Night")

Built in M3.1. Every new sprite, tile, prop and effect follows this page. Data lives in `src/data/art.ts`; the compiler is `src/render/atlas.ts`; drawing is `src/render/renderer.ts`.

## 1. The look in one paragraph
Late-night casino, seen as a toybox. Warm, dim burgundy carpet and walnut; brass trim that catches the light; felt and cream as quiet accents; and saturated neon, screens and lamps as the only truly bright things. Chunky pixel art with a dark ink outline, chibi people with big readable heads, soft light pools on the floor. Classic tycoon scale: you should be able to read a crowd at Default zoom and a single guest's outfit at Close.

## 2. Hard rules
1. **Grid.** 16 art px per tile. Sprites are whole pixels, drawn at integer scale at Close/Default. No anti-aliasing, no sub-pixel art, no smooth gradients inside sprites.
2. **View.** Top-down 3/4. An object's footprint is its floor contact; it rises *upward* on screen from the footprint's bottom edge. Show a 1-2 px lit top face, then the front (south) face. Tall things may rise up to ~6 px above their footprint (slot toppers 4, bar back shelf 6, restroom roof 4).
3. **Light** comes from the **top-left**. Lit edge on the left/top, shade on the right/bottom. Shadows fall down-right.
4. **Outline.** Never draw the outer outline in the grid. The compiler adds a 1 px ink outline (`k` #1b0e14) around every object, prop and person. Tiles have none. Pieces that join (bar and cage segments) outline only their open sides (`outline: "tbl"` etc.).
5. **Value budget.** Floors are the darkest, lowest-contrast layer; objects are mid-value and more saturated; **the brightest, most saturated pixels on screen are light sources only** (neon, screens, lamps, win flashes). If something that isn't a light is brighter than a slot's screen, it's wrong.
6. **Palette.** Use the shared ramps in `PALETTE` (see §3). A sprite may add local colors through `pal`, but pick them from the same families (hue-shifted: shades lean violet, highlights lean yellow). No pure black, no pure white except specular pixels.
7. **Readability first.** Every object must be identifiable by silhouette + one color at Default zoom (32 px/tile). Test at Default before Close.
8. **Truthful visuals.** Visuals only show real sim state (NORTH_STAR). Reels spin only while a round is in play; a jackpot flash only after a real jackpot; a glass in hand only while `drink > 0`; flushed faces follow `intox`. Decorative loops (neon flicker, fountain, bartender, lamps) never imply state.
9. **Never distinguishable:** cheats, chasers, luck tags, or any hidden trait. Looks come only from type, sex and a look number.
10. **Art is data.** Sprites are text grids; helpers (`mir`, `patch`, `recolor`, `shift`) may build grids at load. Nothing is painted pixel by pixel per frame.

## 3. Palette ("Velvet Night")
| Family | Letters | Use |
|---|---|---|
| Ink | `k` `K` | Outline (auto), deep interior lines, screen bezels |
| Carpet | `d` `a` `b` · `c` `C` | Harlequin base, lattice, dim gold motif. Keep motif contrast low |
| Walnut | `1`–`5` | Walls, counters, panels, pot soil |
| Brass | `6`–`9`, `0` specular | Trim, rails, posts, cornices |
| Steel | `m` `M` `n` `N` | ATM, trays, locks |
| Cream / velvet / felt | `p` `P` · `r` `R` `O` · `f` `F` | Paper, stucco · stools, runners · tables (M7) |
| Water | `u` `U` `v` `V` `Q` | Deep → foam |
| Neon | `x` `X` pink · `z` `Z` cyan · `q` gold | Emissive only |
| Grass, leaves | `g` `G` `h` `H` · `l` `L` `j` | Outdoors, plants |
| Stone | `s` `S` `t` `T` | Sidewalk, plinths |
| Void | `e` `E` `i` | Unowned land |
| Screens, white | `y` `Y` · `w` | Screen black/glass, lettering |

Slot models recolor `A E B D J I o F` (top face, lit edge, body, shade, topper, lamp on, lamp off, symbol). A new model is one entry in `SLOT_COLORS` plus a light in `LIGHTS`.

## 4. Sizes and anchors
| Thing | Grid (before outline) | Anchor |
|---|---|---|
| Tile | 16×16 | Tile origin |
| Slot cabinet | 16×20 | Bottom on footprint bottom |
| 1×1 prop (ATM, neon, sign, plant) | 16×21-22 | Bottom on footprint bottom, centered |
| Tiled piece (bar, cage) | 16×21-22 per tile, parts `a` `b` `c` | Each on its tile's bottom |
| 2×2 (restroom, fountain) | 32×36 | Bottom on footprint bottom |
| Sized amenity piece (M6: table, chair, kitchen, stage, booth, speaker, backdrop, dance floor) | 16×16-22 per cell | Each on its cell's bottom; floor pieces (stage, dance) sort under people |
| Restroom of any size (M6) | slices of the 2×2 block: face `rr:door`/`rr:wall` 16×24, roof bands `rr:top` / `rr:roof` / `rr:eave`, each `l` `m` `r` | Face bottom on the footprint bottom; roof fills up to 4 px above the top row |
| Door rule marker (M6) | ≤16×16 | Drawn over the door tile in the static chunk |
| Person | 8×15 | Feet 5 px below tile center; seated drops 2 px |
| Hand prop | ≤6×8 | Hand anchor per facing (renderer `HAND`) |

## 5. Facings
Rotation 0 faces down (front). Sprite keys: `obj:<sprite>:front|back|side`, where **object `side` art faces left** and the compiler mirrors it for `right`. People are the opposite: pose `side` faces right, `left` is mirrored. Tiled objects add `:a|b|c` (start, middle, end along the long axis; top to bottom for side views). Sized amenities (M6) lay out cell by cell (`Renderer.zoneSprites`): counters and cage windows run `a` / middle / `c` in screen order (the bar's middle is `b` with a bartender, `m` without; the cage's middle `b` has a teller); chairs use the seat's facing (`chair:front|back|side`); a 2×2 restroom keeps its whole sprite, other sizes use the slices. Cooks, performers (during a show) and the DJ are paper-doll people at the amenity's staff spots, drawn just behind their counter or booth. Anything without a facing key falls back to `obj:<sprite>`.

## 6. People (paper dolls)
A person frame = **pose** (region letters) → **outfit** (region → color letter) → **overlays** (outfit extras, accessories, then hair/hat) → optional **short** (retirees drop a torso row).
- Regions: `s/S` skin, `e` eyes, `u/U` torso, `c` chest center, `a/A` upper arms, `w/W` forearms, `x` hands, `l/L` hips, `g/G` shins, `f` feet.
- Final letters: `t/T` top, `j/J` jacket or accent, `n/N` bottoms, `h/H` hair, `q/Q` hat, `f` shoes, `w/P` white, `o` lens, `y` red detail. Uppercase shades are **derived** by the compiler (cloth cools, skin warms); never list shades in look data.
- Poses: `down0-2`, `up0-2`, `side0-2` (0 stand, 1-2 strides; walk cycle 1-0-2-0), and seated `downs`, `ups`, `sides`.
- **Type silhouettes** (the M3.1 brief): Locals casual (tees, jeans, caps). Retirees one row shorter, puffed grey/lavender hair or bald, cardigans, pastels, glasses. Tourists wide sun hats, loud patterned shirts, shorts, cameras. Party guests dark blazers and quiffs, or bright short dresses. Staff read by uniform and a prop: janitor grey coverall + mop, tech orange vest + toolbox, server black vest + bow tie + tray, security guard black suit + radio. Visitors: police officer navy with a cap and belt, paramedic white with a red belt.
- A new type = one `PEOPLE` entry (colors + styles per sex). A new outfit = one `OUTFITS` line. A new hat or hairstyle = one `HAIR` entry with down/up/side.
- Drink shows three ways: glass or soda in hand (`drink > 0`), flushed face overlay at `intox` ≥ 0.25 and ≥ 0.5, and the existing stagger.

## 7. Floor, walls, light (renderer, baked into chunk caches)
- Carpet alternates two tiles in a checkerboard (motif / plain) so the repeat is 32 px.
- Walls autotile: cap only when another wall is below; interior `wallface` (damask + wainscot) when the tile below is indoor floor; exterior `wallout` (stucco + stone) when it's outdoors. Ink edges where a wall meets non-wall. Walls shade the floor below (4 px) and to the right (2 px).
- Contact shadows under every object (footprint offset down-right; ellipse for poles and round things). People get a small alpha shadow.
- **Light pools**: objects listed in `LIGHTS` add a colored pool (radius in tiles, strength, optional offset toward the front), computed per art pixel in 12 steps. Only light sources get one.

## 8. Animation
- Decor loops run on real time (`ANIMS`, ms per step, optional `seq`), so fast-forward doesn't strobe them. Frames are `<key>~1`, `<key>~2`.
- Sim-driven motion runs on ticks: walking (interpolated), reels (spin while `timer > 0`, stop left to right), win and jackpot flashes (from `o.last`), broken screens.
- Keep loops slow and small: 2-3 frames, 1-2 px of movement. Neon flickers briefly, rarely.

## 9. Zoom levels
| Level | px/tile | What draws |
|---|---|---|
| Close, Default | 64, 32 | Live objects with animation, people with props and overlays |
| Wide | 16 | Object sprites baked into chunks (static), people as full sprites without props |
| Overview | 8 | Baked chunks drawn smoothed, people as clothing-colored dots |

## 10. Adding an asset: checklist
1. Pick the footprint and facings; draw `front` (and `back`/`side` if it rotates meaningfully). Use `mir()` for symmetric art.
2. Colors from §3; lit left/top, shade right/bottom; no outer outline.
3. Add a `LIGHTS` entry only if it emits light; add `ANIMS` only for decor loops.
4. Add it to the Test Floor scenario (CLAUDE.md).
5. `npm run build`, then screenshot at Default and Close. Check: readable silhouette at Default, not brighter than the lights, outline clean against carpet, sits on its footprint.

## Not yet done (candidates for later)
- UI tab icons are still emoji; a pixel icon set drawn from the atlas would match the world.
- Water tiles are static; a 2-frame ripple would need animated terrain.
- M7 tables are generated per kind and rotation (`tableRows` in `src/data/art.ts`): a felt top in a walnut rail with a 3 px front lip, the dealer's chip rack on the dealer's side, betting spots on the players' side (brass rings on baccarat's navy felt), the craps pass line and box, roulette's layout grid and a 13 px wheel (3 spinning frames) over one end, and a padded oval for poker. Keno and bingo boards are tall lit panels (front, back, edge-on side) whose cells light per number drawn (`BOARD_CELLS`). Small props: cards face up (red, black) and down, a chip and a chip stack, six dice faces. Video poker reuses the slot cabinet in green. Looks: dealers in a burgundy blazer and bow tie, pit bosses in a dark suit, High rollers in dark suits and gowns. What a table shows is the last real round: chips on each player's spot (a stack for a winner), cards, the final dice, the lit numbers.
- Themes (M6.5) and tables (M7) follow these rules. M6 added the sized-amenity pieces above (cocktail and dining tables, velvet chairs, a steel kitchen pass, stage planks and curtain, DJ booth, speakers, a neon backdrop, an animated dance floor), restroom slices and door rule markers (staff plaque, padlock, card reader, velvet rope, role plaque, fee coin). M6.5 added 48 themed decor pieces (`DECOR_SPRITES`: 1×1, 16 wide, symmetric ones mirrored from left halves), pool water (2 frames) and deck, loungers, hedges, flower beds, benches, garden path, umbrellas over outdoor tables, a For Sale sign, and swimmers (the standing figure sunk to the chest). Lights: tiki torch, brazier, starburst, marquee, jukebox, torchère, lava lamp. Incidents (M4) drew marks over heads (`inc:*` in EXTRA_SPRITES), a lying pose (the standing frame rotated), vomit, and guard/officer/paramedic looks. M5 added a ceiling camera dome (no floor shadow: non-blocking objects cast none), a dumpster, a body bag (on the floor and over the shoulder), a small pistol and muzzle flash, enforcer (dark leather jacket) and surveillance operator (grey polo, glasses) looks, the marked guest's red dashed ring, and enforcement motion (punch lunge and recoil with the scuffle cloud; lying, then bagged); beaten guests draw doubled over (2 px lower). M9.6 added escorts (short bright dresses or open shirts), the hotel lift doors (brass, a lit floor indicator), a sparkle over a guest using and hearts over hookups and an escort's pitch. M9.5 added the sportsbook's screen wall (three game screens), families (casual colors), children (a row shorter, bright tees and caps), conventioneers (suits with a name badge) and the underage coin mark. M9 added the gaming inspector (grey suit, glasses) and whales (white and gold suit or dress, the one guest look that stands out on purpose: whales are announced).
