# Slot designer (M8 plan)

**Status: M8 built 2026-09-24; M8.5 built 2026-09-24 ("As built in M8.5" below); M8.6 to come ("M8.6 additions").** Owner's answers and additions in DECISIONS. Code: `src/data/designer.ts` (vocabulary), `src/data/designs.ts` (stock), `src/data/slotTastes.ts` (hidden tastes, pairings), `src/sim/design/` (compile, grid, spin, meters, appeal, lab, checks, index), `src/sim/opinions.ts`, `src/ui/slot/` (the machine), `src/ui/designer/` (designer, Slots tab, opinions), `src/platform/library.ts`, `src/platform/display.ts`. FOUNDATIONS §7.1; NORTH_STAR "The creative core". All numbers are starting values.

## The idea
RollerCoaster Tycoon's coaster builder works because it has **physics** (a coaster can't climb a hill it lacks the speed for), **pieces** (drops, loops, helixes, each with a feel), a **test run** you watch, **three ratings** that are measurements rather than verdicts (Excitement, Intensity, Nausea), and a **park full of guests** who ride it or don't. The slot designer copies that shape:

| RCT | Slot designer |
|---|---|
| Physics: speed, gravity | **The payback budget.** Every cent of payback goes somewhere: small base wins, big base wins, free spins, the hold & spin bonus, the jackpots. A richer bonus means a stingier base game. |
| Track pieces | Reel layouts, wilds, features (free spins, hold & spin, pick, wheel, cascades, collectors, offers) and jackpot levels, each with options |
| Scenery near the track | Theme, symbols, sound, cabinet and the room it stands in; hidden pairings between them |
| Test run | The **lab**: an exact par sheet, a panel of the scenario's own guests, a test run you watch with free credits |
| Excitement / Intensity / Nausea | **Excitement / Intensity / Drain** (§4) |
| Guests queueing (or not) | The floor: who sits, how long, what they think, whether they come back for it |
| Ride age, ride-type popularity | Novelty wearing off, trends, rival releases (§6) |
| Saved track designs | A design library kept on the phone across every save, with share codes |

The player never sees a formula. They see exact math (the par sheet), what a panel of guests made of it, and then the floor.

## 1. What real slots are made of
The designer must be able to build a game that plays like each of these (in-game names are always original):

| Real game | Its parts |
|---|---|
| Buffalo | 5×4 reels, 1,024 ways, stacked hero symbol, wild sun on the middle reels that multiplies 2× or 3× in free games, 8/15/20 free games for 3/4/5 scatter coins with retriggers, a signature call on the trigger |
| Lightning Link, Dragon Link | 5×3 lines; **hold & spin**: 6+ orbs lock, 3 respins that reset on every new orb, orbs carry credit prizes or Mini/Minor; filling all 15 spots wins the Grand; Major and Grand are **linked progressives** shown on a sign over a bank of machines; a secondary free games feature |
| Dancing Drums, 88 Fortunes | 243 ways, Asian fortune theme, free games, a **pick-till-you-match-3** jackpot feature; a higher bet unlocks more jackpots |
| Double / Triple Diamond, Blazing 7s | 3 mechanical reels, 1 line, blanks, bars and sevens, a wild that doubles (two of them: ×4); low hit rate, no bonus, big top award; loved by regulars |
| Wheel of Fortune | 3-reel game with a real **wheel on top of the cabinet**, wide-area progressive; the wheel's sound carries across the floor |
| Cleopatra, Book-of-Ra style | 5×3 lines, free spins with every win tripled, or one symbol that **expands** to fill its reel during free spins |
| Top Dollar | an **offer** bonus: take it or leave it for up to 4 offers |
| Huff N' Puff, Buffalo Gold | **collection and upgrades**: collect pieces during play to upgrade symbols or the bonus; some keep progress on the machine between players |
| Megabucks | a tiny-chance, life-changing progressive on a low-payback 3-reel game |
| Quick Hit, mystery "must-hit-by" jackpots | a jackpot that must hit before its meter reaches a cap: players and hunters watch the meter |
| Invaders, Gonzo-style | **cascading reels**: wins vanish, new symbols drop, a multiplier climbs |

Presentation that sells these games, and the designer offers: anticipation (the last reels slow down and glow when a trigger is one symbol away), win celebrations in tiers (Big / Mega / Epic Win, roll-up counters, coin showers), small wins celebrated like real wins, near misses, jackpot meters, cabinets from low slant-tops to giant 2×2 attractors, toppers, bank signs, a signature sound.

## 2. What the player controls
A design has eight sections (tabs in the designer). Each control lists what it changes: the math, the floor, the play screen, and guests.

### Concept
- **Name** (typed), **theme** and **symbol set**. Themes are the 12 decor themes plus **Classic Vegas** (sevens, bars, cherries, diamonds; slot-only) and **Lucky Dragon** (Asian fortune: dragons, lanterns, coins, envelopes; also a new 13th decor theme with 4 pieces, since it's the biggest real slot genre). Each theme has two symbol sets (Gold Rush: Prospector or Stampede; Egypt: Pharaoh or Tomb; Classic: Sevens & Bars or Fruit; …) and a **hero symbol** (the top-paying one).
- Floor: the theme counts in the room's theming like a decor piece (weaker), and suits or clashes with the room (docs/spec/themes.md). Play screen: symbols, background, colors, logo. Guests: theming weight per type; kids are drawn to bright cartoon themes (underage incidents, docs/spec/calendar.md).

### Reels
- **Layout:** 3×1 classic (1 line, mechanical-reel look), 3×3 (5 lines), 5×3 (20 or 40 lines, or 243 ways), 5×4 (1,024 ways), 6×4 (4,096 ways).
- The layout bounds the math: the smallest possible win (a classic pays at least the bet, so it **can't** dress up losses; line and ways games can pay 0.1× the bet) and the hit rate range (classic 5–20%, 3×3 10–30%, lines 20–45%, 243 ways 25–50%, 1,024 ways 30–55%, 4,096 ways 35–60%).
- **Wilds:** none, plain, stacked, multiplier (2× or 3×; on a classic two multiply: ×4, ×9), expanding (fills its reel). **Stacked symbols** (the hero or all highs). **Scatter pays** on or off.
- Guests: complexity (more reels and ways read as busier), classic vs video taste.

### Money
- **Denomination** ($0.01, $0.05, $0.25, $1, $5, $25) and **bet range** (e.g. penny: 50–500 credits = $0.50–$5). A high-limit room still multiplies stakes ×5.
- Guests: whether their stake fits (existing), and denomination taste (Retirees pennies, Locals quarters to dollars, High rollers $5+).

### Math (the physics)
- **Payback** (the scenario's legal minimum to 99%; below the minimum only when uncertified, §10).
- **Hit rate** (inside the layout's range and what the base budget allows).
- **Volatility**: the share of the base game's payback in big wins (10× and up), from Low to Extreme.
- **The budget bar**, always on screen: one stacked bar showing where every point of payback goes (small wins, big wins, each feature, each jackpot) against the target. Adding a feature or jackpot visibly squeezes the base game; when the base game can't carry the chosen hit rate the bar turns red and the hit rate slider clamps. This is the thing the player learns to "feel", like speed on a lift hill.

### Features (up to 3)
Each is a card with a **trigger frequency** (1 in 60 to 1 in 2,000 spins) and options. What the feature costs in payback follows from them.

| Feature | Options | Notes |
|---|---|---|
| Free spins | count (5–25; or by scatters: 3/4/5 give more); retrigger; enhancer: all wins ×2/×3, random multiplier 2–5×, sticky wilds, extra wilds, one expanding symbol, symbol upgrades | the workhorse; Buffalo, Cleopatra, Book-style |
| Hold & spin | orbs to trigger (5–7); grid 15 or 20; respins (3); orb values (spread); jackpot orbs (Mini/Minor/Major); fill-the-screen Grand; extras: multiplier orb, collector orb, extra row | Lightning/Dragon Link, Cash Eruption; tension from the respin reset |
| Pick | pick until a "collect", or match 3 (jackpots); board size | 88 Fortunes, Dancing Drums; the pick is cosmetic (the prize is set when the feature starts, as in real games) |
| Wheel | segments (credits, jackpots, free spins, spin again); on screen or a **topper wheel** on the cabinet (costs more, seen and heard across the floor) | Wheel of Fortune |
| Cascades | base-game modifier: chain chance, multiplier ladder (1-2-3-5) | Invaders, Gonzo |
| Collector | pieces land on some spins, a meter (10–50) fills to a super feature; progress kept on the machine or reset per player | Huff N' Puff, Buffalo Gold; a kept meter attracts hunters (§5) |
| Offer | up to 4 offers, take it or leave it | Top Dollar; every offer is fair (§3), so choices change swings, not payback |
| Mystery | random wilds or a random multiplier on base spins | common base-game spice |

### Jackpots (up to 4 levels: Mini, Minor, Major, Grand)
- **Kind:** fixed amount (× bet), standalone progressive (a meter on the machine), **linked** progressive (one meter shared by a bank of 4–8 of this design standing side by side, shown on a sign above them), or **must-hit-by** mystery (the meter must hit before a cap).
- **Seed**, **increment** (0.2–2% of coin-in), **cap** (must-hit-by), and **how it's won**: a symbol combination, hold & spin orbs or a full grid, a wheel segment, a pick match, or mystery.
- **Eligibility:** any bet (the chance scales with the bet, which keeps payback exact at every bet) or max bet only (real, profitable, and a source of furious thoughts: "Hit the Grand symbols on a small bet").

### Show
- **Lights** (0–3) and a light color; **sound** (0–3) and a **signature call** (a short synth motif per theme: a stampede roar, a gong, tiki drums, a trumpet fanfare, a theremin).
- **Small-win celebration** (none, modest, full): how loudly a win smaller than the bet is celebrated. Legal. Pleases some types, annoys others.
- **Near misses** (0 up to the design's natural rate, or beyond it: rigging, §10).
- **Anticipation** on or off (the last reels slow and glow when a trigger is one symbol away: an honest, real chance; slows the game a little).
- **Roll-up** (quick, standard, long) and **spin speed** (relaxed, standard, fast): long roll-ups and slow spins mean fewer spins an hour (less drain, more time on device).
- Floor: lights and sound add NRG around the machine (existing field system); loud machines bother quiet rooms. Play screen: all of it.

### Cabinet
- **Type:** slant-top (low: doesn't block sight lines, seated, prestige), upright, stepper (mechanical reels, for classics), tall portrait (curved screen, seen from farther), **giant** (2×2, an attractor seen across the floor; expensive).
- **Colors** (body, trim; palette-limited per docs/spec/art.md) and **topper**: none, sign, dome light, theme figure, wheel (needs a wheel feature or segment).
- Floor: its own sprite, footprint, sight lines, NRG, price and upkeep. Play screen: the frame around the reels.

## 3. The math
Honest and exact, per FOUNDATIONS §7: every spin is drawn from its true distribution, and the display shows exactly what was drawn.

- **Units:** pays are multiples of the total bet per spin.
- **Closed form for the base game.** With target payback T, jackpot share J, and features whose payback per trigger is proportional to the base game's return b (free spins: count × enhancer uplift × multiplier × b), `b = (T − J − F₀) / (1 + Σ qᵢ·kᵢ)` where qᵢ is a feature's trigger chance, kᵢ its multiple of the base spin, and F₀ what features pay independent of b (hold & spin orbs, picks, wheels, offers). The budget bar is this equation drawn.
- **Base game:** a ladder of pay tiers per layout (classic from 1×; video from 0.1×). Two parts: small wins (under 10×) and big wins (10× and up). Volatility sets the big part's share of b; the hit rate sets how many spins win. Each part's shape is solved (a one-parameter tilt, monotone, bisection) so its mean is exactly what's needed; the last tier absorbs rounding so Σ x·p equals b to 1e-12. Infeasible settings (the small wins can't average low or high enough) are what the sliders prevent.
- **Features are exact by construction:** free spins (a random count with retriggers: E = n / (1 − r·n)); hold & spin (a Markov chain over locked orbs × respins left, solved exactly; orb values from their table); pick and wheel (finite tables); cascades (a geometric chain); collector (the fill rate × the super feature); offers (each offer equals the expected value of refusing it, so any strategy returns the same); mystery (a fixed rate × a table).
- **Progressives:** the increment is booked as paid out when wagered (a liability on the meter, as real casinos book it), so payback is exact over the meter's life. Must-hit-by: the hit point is drawn uniformly between seed and cap, so its share of payback is `inc × (cap + seed) / (cap − seed)`. The chance of winning scales with the bet unless eligibility is max-bet-only.
- **Draws are procedural:** a spin draws its base result, then any feature is played out step by step (each free spin, each respin) from its exact parts. The result carries its **events** (reel result, feature, each free spin, each orb), which the play screen shows exactly. Guests on the floor get the same draw; only the total, the events' length and whether a feature ran are used.
- **Luck and cheating keep working:** a design compiles to the `SlotModel` shape (payback, analytic hit chance and variance, a draw function), so luck's exact ±20 points, cheats, insurance, the suspicion tools and the books are unchanged. Constraint from luck: payback × (1 − hit rate) ≥ 0.2 (the designer enforces it).
- **Pace:** a feature adds its own time to the round (free spins about a second each at 1×; hold & spin about 1.5 s per respin; roll-ups by setting). Bonus-heavy games spin fewer times an hour, as real ones do.
- **Checks (`npm run headless`):** every stock design and 300 fuzzed designs (fixed seed) return their target exactly (1e-12); luck's shifts stay exact; progressive meters balance (every increment paid or still on a meter); every event list's shown pays add up to what was paid; pure functions, no state RNG used by the compiler. No test asserts random outcomes.

## 4. The lab: test, par sheet, ratings
The designer's Test tab, free and instant, re-run on every change.

- **Par sheet** (exact, from the math): payback and its split, hit rate, real-win rate (≥ the bet), small-wins-dressed-as-wins rate, volatility index (SD per spin, in bets), each feature's frequency and average pay, the chance of seeing a feature in 100 spins, top award, jackpot odds, spins per hour, drain per hour at the minimum and maximum bet.
- **Session simulator** (per type in this scenario, 200 sessions each on common random numbers, so a small change moves the result smoothly instead of reshuffling it): median time on device, share who saw a feature, share who walked away up, typical best moment, longest dry spell. Shown as a small chart of credits over time for a typical session.
- **Three ratings, 0–10 with words**, like RCT:
  - **Excitement**: how thrilling a session felt to a **test panel of this scenario's own guests** (weighted by who comes here and plays slots). It is the floor's own guest model (§5) run without a room, neighbors or novelty. So the same machine rates differently in a retiree town and on a party strip, and there's no universal best.
  - **Intensity**: how hard it swings (the volatility index on a log scale; M8.5: 1.2 → 0, 2 → 1.5, 3 → 3, 6 → 5, 12 → 7, 25 → 9, 40+ → 10). Low, Medium, High, Very high, Extreme. Neither good nor bad: a taste.
  - **Drain**: how fast it takes money: bets lost per minute of play at its pace, (1 − payback) × spins per minute (2 → 1, 5 → 3, 8 → 5, 12 → 7, 20+ → 10). Most guests mind it, some don't.
- **Panel verdict:** a few lines in guests' words ("Loved the free spins", "Too wild for me", "It ate my money fast"). By type only with research (Slot lab project, §11; it follows the player's club and guest breakdowns).
- **Test run:** play it yourself on the real play screen with free lab credits (casino cash untouched), or autoplay 200 spins at speed and watch the credit line. This is RCT's empty test train.
- **Force an outcome** (owner): buttons to make the next spin a loss, a near miss, a dressed-up loss, a small, big, mega or epic win, free spins, each jackpot level or the top award, however rare. The forced spin is drawn from the real distribution *within* that outcome, so it's exactly what a real one looks like.
- **Live preview** (owner): the designer's top half is the machine itself, the same view as playing it; every change (theme, layout, colors, meters, lights) shows at once, and a spin can be taken any time.
- The lab never says good or bad. The floor is the truth: the same design can rate 7 in the lab and die in a quiet high-limit room with its sound at 3.

## 5. How guests judge a design (hidden)
- **Guests never see payback.** They feel it through outcomes: how long their money lasted, how often they won, whether they saw the bonus. Regulars remember: a design that drained them builds a "tight" name among that type's regulars (noisy, slow, shared by word of mouth), which lowers its appeal to them.
- **A feel vector** per design, computed once (cached per design version): hit rate, real-win rate, dressed-up-loss rate and how loudly it's celebrated, feature frequency, feature average and spread, tension mechanics (respin resets, retriggers, wheels, reveals), top prize in dollars, intensity, drain, spectacle (lights, sound, cabinet, celebration), complexity (layout, feature count, rules), near misses, theme, classic vs video, denomination.
- **Per-type preferences** over it (the `Pref` shape: ideal, tolerance, weight), replacing today's per-model lookup `games[model]`. Starting directions:

| Type | Hit rate | Intensity | Features | Dream (top prize) | Spectacle | Complexity | Dressed-up losses | Novelty | Denomination |
|---|---|---|---|---|---|---|---|---|---|
| Locals | medium | 3 | some | medium | low | low (classics) | dislike | low: loyal to favorites | quarters–dollars |
| Retirees | high | 2 | lots | high | medium | low–medium | like | medium | pennies |
| Tourists | medium–high | 5 | lots | high | high | medium | like | high | pennies–quarters |
| Party | medium | 7 | lots | medium | very high | low | like | high | quarters–dollars |
| High rollers | low | 8 | some | high | low (quiet) | medium | dislike | medium | $5+ |
| Conventioneers | medium | 4 | some | medium | medium | medium | neutral | high | quarters |
| Families (adults) | high | 3 | lots | medium | high | low | like | high | pennies |

  The three stock models become designs whose appeal reproduces today's values within ±0.1 per type (calibration check), so balance doesn't jump.
- **Context on the floor:** the room's theme (suits or clashes with the design's), noise and prestige around the seat (existing), a linked bank's meters (a big Grand pulls people in: +appeal by the meter against the type's budget), a machine seen in a bonus or a jackpot recently (the existing hot-machine belief, now also for bonuses), giant cabinets and toppers seen from farther.
- **While playing:** each round's feel adds a feature's thrill (anticipation, tension, the pay against the bet) to today's win / dressed-up / near-miss feel. Guests with a chase streak keep playing when a bonus feels "due" (gambler's fallacy); a long dry spell makes others hop machines. "Never saw the bonus" is a thought and a measurable symptom.
- **Excitement buys hold.** Time on an exciting machine counts for more in the visit score's value (a play second is worth 0.7 + 0.06 × that type's excitement), so a thrilling 88% machine can leave guests as happy as a dull 94% one. This is RCT's "excitement lets you charge more", and it's what makes Excitement worth money.
- **Near misses** extend play for chasers and are what regulators hunt (§10). Dressed-up losses please Tourists, Party and Families, and put off Locals and High rollers.
- **Hunters** (M8.5): a share of Locals are advantage players. They scout must-hit-by meters near their cap and collectors with kept progress, play only while it's worth it, and leave. Pure cost to the house; designing around them (higher caps, no kept progress) is the lever.
- **Poor designs fail where the player can see it:** a bonus too rare for the crowd's wallets ("Never saw the bonus", short sessions); too wild for the crowd (quick busts, "It ate my money"); too tight (a tight name among regulars, fewer come back); a starved bonus (the budget split three ways so each feature pays 8×: "The bonus pays nothing"); clutter; a loud cabinet in a quiet room; max-bet-only jackpots on a penny crowd; hunters bleeding a kept collector; a floor of clones.
- **Thoughts** name the design ("Love the free spins on Stampede Gold", "The Grand on Lantern Link is huge!", "Lantern Link eats money", "Too complicated", "Never saw the bonus", "Played out on Stampede Gold", "Came here to play Stampede Gold"). They're the main diagnosis tool, and the design's card lists them.

## 6. Why it never goes stale
The goal is RCT's pull: always one more tweak, one more idea, never "solved".
- **Market-relative ratings:** every scenario's crowd wants different machines (§4), so there's no single best design.
- **Novelty and age:** a design's appeal = its quality plateau + a novelty boost that fades over months. The boost is bigger the more different it is from what's already on this floor (a reskin gets little). Designs whose plateau stays high are **evergreens** (a Buffalo, a Double Diamond); most fade. Regulars who've played one a lot get bored of it (novelty seekers faster; Locals slower, and they grow attached to favorites instead). RCT's ride ageing, grounded in how real games' performance decays after launch.
- **Variety:** a floor full of one design, or one mechanic, feels monotonous ("These all play the same"). A portfolio beats a clone army, like a park needs different rides.
- ~~**Trends** (a yearly Slot Expo) and **rival releases**~~: dropped by the owner on 2026-09-24, before M8.6 was built.
- **Fans and draw:** a design that performs well builds a following among a type's regulars; enough fans and it becomes a reason to come ("Came here to play Stampede Gold", extra arrivals of that type), like a great coaster drawing guests to the park.
- **Unlocks:** research opens new layouts, features, jackpot kinds and cabinets through a scenario (like new coaster types).
- **Hidden pairings (§7)** reward knowing real slots and experimenting.
- **Wishes:** guests say what's missing from the floor ("Nothing exciting enough here", "Everything here is too wild for me", "Wish there were more penny games"), like RCT's "I want something more intense".
- **Goals** (M11): scenarios can ask for designs ("a machine Retirees keep coming back for", "a floor of your own games").

## 7. Hidden pairings (never listed in game)
Like theme pairings (docs/spec/themes.md), each strong pairing adds to Excitement; a clash takes away; a design with more than two features and no pairing between them reads as cluttered. Starting table (each based on a real hit):
- **Theme + feature:** Lucky Dragon + hold & spin or pick-to-match; Gold Rush (Stampede) + ways + multiplier wilds in free spins; Egypt + expanding symbol or ×3 free spins; Tiki + hold & spin (fire orbs); Pirate + pick (treasure chests); Gold Rush (Prospector) + collector; Rome or Gilded Deco + topper wheel; Neon Atomic + cascades; Rat Pack or Classic + a 3-reel stepper with multiplier wilds; Modern Luxe + slant-top at $5+; Rock & Roll + loud show and long roll-ups.
- **Feature + feature:** hold & spin + linked Major/Grand; free spins + multiplier wilds + ways; collector + upgrades in free spins; cascades + a climbing multiplier; wheel + progressive segment; mystery jackpots + must-hit-by meters.
- **Clashes:** a classic stepper with 4,096 ways-style clutter (more than one feature); a giant loud cabinet at a $25 denomination; Medieval + cascades; small-win celebration on a classic (it can't happen: the control is off).
- Coherence also counts symbol set, signature call and cabinet colors matching the theme's palette.

## 8. The floor
- **Cabinets** are compiled sprites (docs/spec/art.md pipeline): the slot cabinet redrawn per type (slant 16×14, upright 16×20, stepper, tall 16×24, giant 32×32 on 2×2) recolored with the design's palette, with its topper. Lamp chase, reel scroll and a bonus pattern (a distinct flash and topper animation while a feature runs) as animation frames.
- **Banks:** 4–8 machines of one linked design in a row form a bank; a sign above them shows the live Major and Grand. Placing a bank is a floor-building decision (a landmark, a crowd, a sight line).
- **Onlookers** gather behind a machine in a big bonus, as at craps (M7). A topper wheel spin and a Grand are heard across the floor.
- Lights and sound are NRG sources; giant and tall cabinets are seen from farther; slant-tops don't block sight lines.
- **Costs:** cabinet (slant $500, upright $400, stepper $450, tall $800, giant $3,000) + topper (sign $100, dome $150, figure $300, wheel $600) + $50 per feature; a bank's sign and controller $1,000. Upkeep ~0.6% of price a month. **Conversion kit:** switching a placed machine to another design of the same cabinet type, $100, instant.

## 9. Playing it yourself
The M10 slot screen is replaced by one built from the design, meant to look and feel like a modern Vegas slot or a real 3-reel stepper (owner's reference screenshots: Dragon Link, Buffalo Gold, Megabucks Mega Vault):
- A cabinet with a **top box** (the logo and the biggest meter), a **meter row** (Grand, Major, Minor, Mini), the **reel screen** with side badges ("20 LINES", "1024 WAYS") and messages ("THAT'S A WINNER", "BONUS REELS IN PLAY"), a **bar** with CREDIT, BET and WIN and a denomination badge, a **button deck**, LED edge light in the design's light color. Jackpots at or above $1,200 show a hand-pay notice ("JACKPOT — CALL ATTENDANT"), as real machines do.
- Themed background and frame, the design's name as a lit logo, jackpot meters across the top (live for progressives, the bank's for linked).
- Reels in the design's layout. **Symbols are emoji on styled tiles** (glossy gradient frames, gold for highs, themed card ranks or bars for lows): they look like real rendered slot symbols on an iPhone at no art cost. The floor stays pixel art.
- Spinning strips with motion blur, staggered stops with a bounce, anticipation (longer spin, glowing frame, rising sound), winning lines or ways drawn and cycled, symbols pulsing.
- Win tiers: counted roll-ups; Big / Mega / Epic Win banners and coin showers by multiple of the bet.
- Features on their own screens: free spins intro ("12 FREE GAMES"), counter and total; hold & spin grid with orbs locking, the respin counter resetting to 3, jackpot orbs, the Grand fill; pick boards; a big wheel (the M10 roulette wheel's motion); cascades dropping; offers with Take / Leave.
- Bet panel: denomination, bet up/down, credits, win meter, Spin, autoplay (10/25/50), and **help screens with the design's real paytable and feature rules**.
- Sound: reel stops, win ticks by tier, the signature call on a trigger, a bonus loop from the music sequencer.
- Everything from M10 still holds: casino cash on the "Owner's play" line, same odds as a guest, one wager per spin.

## 10. Money, the law and the regulator
- **Certification:** a new design, or a change to its math or features, goes to the lab for 7 days and $1,500 before it can be placed (research can halve both). Cosmetic changes (name, colors, lights, sound) are free and instant. The library keeps certified versions per scenario.
- **Legal limits per scenario:** minimum payback (80% by default) and near misses no more often than the design's natural rate. A design outside them can't be certified.
- **Uncertified (dark lever):** the player can place a design without certifying it, instantly, with any settings (payback down to 50%, near misses above chance). It works. The regulator's inspector (M9) now also tests machines on each visit; an uncertified machine found is seized (removed, no refund), a large standing hit and a fine that grows with how rigged it was; repeat finds climb the ladder quickly.
- **Progressives in the books:** meters are liabilities (shown in Finance), seeds are posted when a meter resets, and a jackpot the casino can't cover uses the M9 credit rules. Jackpot insurance covers payouts above its line, as now.

## 11. Stats, records and the library
- **Per design** (all its machines) and per machine: plays, occupancy (share of time in use), average session, coin-in, hold, **performance index** (M8.5, owner: theoretical win, coin-in × house edge, per machine per day over the lifetime of all the design's machines here, ÷ the same for every slot on the floor; explained in game next to it; a jackpot never swings it), share of players who came back to it, thoughts, and results by type (with Guest breakdowns research). A Games list sorts designs by any of these.
- **Library:** every design is kept on the phone across all saves (platform storage), with its career: lab ratings, best performance index and in which scenario, lifetime win, biggest jackpot paid, and **Evergreen** (index 1.5+ for two years). Records are measurements, not grades.
- **Share codes:** a design exports as a short text code and imports from one (paste it into chat, send it to a friend).
- A design placed in a save is copied into the save, so saves never depend on the library.
- **Research** adds (open scenarios start with the building ones, per M9.5; the tutorial with none): 5-reel video, Ways, Free spins, Hold & spin, Pick and wheel, Cascades and collectors, Progressives, Linked banks, Giant cabinets, Fast certification; information: Slot lab (panel verdict by type).

## 12. Architecture and saves
- `src/data/designer/`: vocabulary as data (layouts and pay tiers, features and options, themes' symbol sets and calls, cabinets, pairings, per-type preferences). `src/data/designs.ts`: stock designs.
- `src/sim/design/`: the compiler (design → exact par sheet → `SlotModel` + draw function + feel vector), the lab (par sheet, session simulator on its own seeded generator, never a state stream), appeal and feel. Pure TypeScript, headless.
- `src/ui/designer/`: the designer screens; they compile and test through pure functions and change the game only by commands (`design.save`, `design.certify`, `design.convert`).
- Slot objects become one generic kind with `design: id` (stock designs are data, not saved). Compiled designs, feel vectors and per-type appeal are runtime caches, rebuilt on load. `payStats`' cache key becomes the design version.
- **Save schema 15** (migration from 14): `state.designs` (the player's designs used in this save, with certification), `o.design` on slot objects (Cherry Parade, Liberty Bell and Thunder Jackpot map to their stock designs), `state.meters` (progressives), per-design stats and novelty. Later parts bump again.
- **Performance:** a spin is a binary search on the base table plus, rarely, a feature; appeal is a cached lookup per design × type (refreshed monthly for novelty). The Big Floor's ms/tick must stay within noise of m10.

## 13. Parts
Three chats and three releases (each playable; the docs carry context).

**M8 · The designer and the base game**
- Design model, compiler and lab; layouts, lines and ways, wilds and stacks, the math sliders and budget bar; **free spins** with every enhancer; fixed jackpots; the Show and Cabinet sections.
- Ratings (Excitement, Intensity, Drain), par sheet, session simulator, panel verdict, test run with free credits.
- Guests judge designs by the feel vector (calibrated to today's stock models); excitement buys hold; feature feel; thoughts naming designs.
- Floor: slot objects become designs; compiled cabinets (all five types, toppers), bonus animation.
- The new play-it-yourself slot screen (classic and video, free spins, help screens).
- Stock designs: the three current ones plus a Buffalo-style, a Cleopatra-style and a Double Diamond-style game.
- Certification, legal limits, uncertified machines and the inspector's machine test; stats and performance index; the library and share codes; Lucky Dragon and Classic Vegas themes. Schema 15.

**M8.5 · Bonuses and progressives**
- Hold & spin, pick, wheel (with the topper wheel), cascades, collector, offers, mystery; their play screens.
- Progressives: standalone, linked banks with signs, must-hit-by, eligibility, liabilities in the books, hunters.
- Onlookers at big bonuses; hidden pairings table complete. Stock: a Lightning Link-style and a wheel-topper game.

**M8.6 · The market**
- Novelty and ageing, boredom and favorites, variety, fans and draw; wishes; records and Evergreens; research projects; Test Floor with designs of every kind; `npm run targets` sanity flags per design; the balance and speed comparison against the last release. (The Slot Expo and rival releases were dropped by the owner.)

## As built in M8 (differences from the plan above)
- **Layouts:** 3×1 classic, 3×3 5 lines, 5×3 20 lines, 5×4 40 lines, 243 / 1,024 / 4,096 ways. Multiplier wilds (×2/×3) in the base game only on 3-reel games; on 5- and 6-reel games they come with free spins ("Multiplier wilds").
- **Free spins enhancers:** plain, all wins ×2 or ×3, random ×2–×5, multiplier wilds, extra wilds, expanding symbol. Sticky wilds and symbol upgrades moved to M8.5 (with collectors). Scatter pays always come with free spins (2× / 5× / 20× / 50× the bet for 3–6).
- **Trigger spins are exclusive** of line wins (a trigger screen shows scatters only), which keeps P(any pay) exact for luck.
- **Jackpots (M8):** fixed amounts × the bet, won by 3 + level jackpot symbols anywhere (classic: 3 on the line); a level's name takes the top of Mini/Minor/Major/Grand. At most 35% of payback.
- **The original three machines** keep their old top prize as a jackpot at the same payback share, so they swing as before (SD ≈ 12, 12, 28 × bet). Their calibrated appeal is within ±0.15 of the old values (checked headless).
- **Intensity** uses the swings a player feels: variance without jackpots (jackpots count toward the top prize instead). The par sheet's volatility index includes everything.
- **Excitement buys hold:** each round on a design adds (0.06 × Excitement − 0.3) × the round's time to the visit's value time (never below half the time played).
- **Stock designs:** Cherry Parade, Liberty Bell, Thunder Jackpot, Stampede Gold (Buffalo-style), Sphinx Treasures (Book/Cleopatra-style), Diamond Sevens (Double Diamond-style), Platinum Reserve ($5 slant-top), Lantern Fortune (Dragon Link-style giant with four meters). Stock games need only their own research.
- **Commands apply at once in the designer** (`Game.flushCommands`), so it works while paused.
- **Floor:** designs place as `slot_slant`, `slot_upright`, `slot_stepper`, `slot_tall`, `slot_giant` (2×2, one seat) with `o.design`; the original three kinds keep their sprites and prices. A designed slot themes its tile weakly (0.8) and its energy comes from lights, sound and cabinet.
- **Research:** Video reels, Ways to win, Free spins, Showpiece cabinets (tall, giant), Fast-track certification; information: Slot lab panels. Lucky Dragon joined the Luxury themes project (its decor pieces wait for M8.6).
- **Not yet:** bank signs, hunters, onlookers at bonuses (M8.5); novelty, trends, rivals, fans, records and Evergreens (M8.6).

## M8.5 plan with the owner's notes (2026-09-24)
The M8.5 part of §13 stands. Added from the owner's notes after playing M8 (numbers are starting values):

### A. Fixes and polish from playing M8
- **Spaces in names.** Cause: `sanitize` trims the name on every keystroke, so a typed space vanishes at once. Trim only when the design is saved. Applies to every typed name.
- **Logo font** (Concept section): about ten styles as data, each an iOS system font stack with a fallback (no font files, so the single-file build stays small): e.g. Impact, Futura condensed, Didot, Copperplate, Rockwell, American Typewriter, Marker Felt, Chalkduster, Snell Roundhand, Papyrus. Plus a logo effect: glow, gold, chrome, outline.
- **Machine face layout** (Cabinet section; Claude's reading of "change layout and size of screen elements"): top box large / small / none, the meter row in the top box or above the reels or hidden, the reel window's size, and the button deck's size. Cosmetic: free and instant, no certification. Also a game-wide **interface size** setting (small, normal, large) kept on the device.
- **Slam-stop keeps the win.** A tap while reels spin stops them and goes straight to the win: lines drawn, a quick roll-up, the tier banner and coins. A second tap finishes the roll-up. In a feature, a tap stops the current spin only; a Skip button jumps to the feature's end, which still shows FEATURE WIN.
- **No spoilers.** The sim still settles each spin at once (honest), but nothing on screen reveals the result early: the credit meter, the casino cash in the top bar and the "up/down … the house's money" line under the game hold their old values until the reveal. Found cause: that line reads the settled totals immediately, for slots and every table game. Feature intros never show a total; FEATURE WIN rolls up from the last shown total instead of appearing as a finished number.

### B. Progressives (revised)
- **Linked means every machine of the design on the floor** (owner: "shared over all of a similar type of machine"), not just a bank standing side by side. One set of meters per design, fed by all its machines. A **bank sign** becomes an optional decor object that shows a chosen design's live meters wherever it's placed (above a row of them, at a room entrance).
- **Standalone** (a meter per machine) and **must-hit-by** stay as planned; the kind is per jackpot level.
- **Pull of a big meter:** a guest's appeal for a machine rises with its biggest meter they can win, measured against their own bet: `+w × clamp(log2(meter ÷ (bet × 200)), 0, 6)`. Every doubling adds the same amount, so each extra dollar counts for less (owner's diminishing returns). `w` follows the type's taste for a big top prize (Retirees and Tourists high, High rollers moderate, Locals low). The sign carries the pull across the room.
- Eligibility, meters as liabilities, seeds posted on reset, hunters: as planned (§2, §5, §10).

### C. What guests think of each game (owner)
- Every game kind on the floor (each slot design; each table game, e.g. all blackjack tables) keeps a **thought history**: counts of every thought its players had, per month, for the last **6 months**, plus plays and average visit score.
- Its card and the Games list show "What guests say (last 6 months)": the top likes and complaints with their share, and a trend arrow against the month before. By guest type only with the Guest breakdowns research (types stay earned).
- Saved as plain counts, capped at 6 months (small: a few dozen thought ids per game kind).

### D. Provenance (groundwork for M8.6's sale offers)
- Every design records its **origin**: `own` (designed in this save, including edits of your own), `stock`, `rival` (M8.6), or `imported` (share code or library from another save). Copies inherit the source's origin. Designs already in saves migrate as `own`.

### E. Saves
- Schema 16 (migration from 15): meters per design (linked) or per machine (standalone), bank signs, thought history per game kind, design `origin`, logo font and face layout. Hunters and onlookers are runtime.

## As built in M8.5 (differences from the plan above)
- **Features (§2):** hold & spin (orbs to start: 6, or 4 on 3×3; the grid is the layout's; three respins reset by any new orb; orb landing Tight/Standard/Generous, values Steady/Standard/Wild; jackpot orbs; the top level fills the screen), pick (until collect, or pick-to-match that comes exactly as often as its jackpots), wheel (16 credit segments plus a segment per jackpot won on it; on the cabinet with the topper wheel, $600), cascades (chain Short/Standard/Long, climbing ×1-×2-×3-×5), collector (10/20/30/50 pieces, fills about every 80-1,500 spins, pays credits or super free games with everything ×3), offer (four offers and a final prize, each step ×0.4 or ×1.5 so every offer is fair), mystery (a ×2/×3/×5 multiplier on some wins, or a wild storm on some spins drawn from a richer ladder). Up to three per game, free spins included. Research: Hold & spin, Pick and wheel bonuses, Cascades and collectors, Progressive jackpots, Linked progressives.
- **Exact math:** every triggered feature is worth A + B × the base return per trigger (free spins and super free spins scale with the base game; the rest are fixed tables), cascades and mystery multiply the base game; the closed form solves the base return; hold & spin's final orb count is an exact Markov chain (conditioned so only the Grand fills the screen, drawn by rejection so the shown path is exactly that distribution). Checked headless: 120 fuzzed designs with every feature and jackpot kind return their target to 1e-9 and every recorded screen pays what was drawn; a scratch Monte Carlo confirmed the draws.
- **Jackpots:** kinds Fixed, Progressive (standalone: a meter on each machine), Linked (one meter per design, fed and won by every machine of it; owner) and Must-hit-by (linked too: one mystery meter per design, the hit point hidden and drawn evenly between seed and cap). Won by symbols, in a hold & spin, on the wheel, by pick-to-match, or at random. Progressive seeds are multiples of the largest bet; a smaller bet wins them in proportion to its size (payback the same at every bet, within 0.01%); "largest bet only" makes a smaller bet's hit pay nothing (a remembered complaint). In the lab a progressive pays its mean; on a machine, its live meter. Meters beyond their seeds count against worth (Finance shows them); a design's linked meter goes when its last machine does.
- **The pull of a big meter (owner):** + 0.025 × the type's taste for a big prize (capped at 1.5) × doublings of the biggest meter they can win over 200× their bet (up to 6), × 1.6 with a bank sign showing it within 10 tiles. A sign alone does nothing: the meter pulls either way.
- **Hunters:** one Local in ten (always the same people, from their seed) hunts: they seek a must-hit-by meter 85% of the way to its cap, or a collector past the point where its prize outweighs the edge (1 − share ÷ (edge + share)), and stop the moment the edge is gone.
- **Onlookers** gather at a slot playing a big bonus (a hold & spin, pick, wheel or offer, or a feature paying 50× and up), like at a hot craps table ("Someone's in a huge bonus over there!").
- **Ratings widened (owner):** big wins' share of the base game runs from none (volatility 0) to 90% (volatility 1), the top awards reach 12,000 per line credit (video), 6,000 (3×3) and 25,000 coins (classic), and past half the return big wins thin out less steeply; Intensity's scale starts at 0 (swing under 1.2× the bet). Excitement's curve is steeper (slope 6.5 about 0.6) and the panel leans toward the guests who'd sit down (weight × (0.4 + appeal)); hidden pairings count twice as much. Measured over 400 fuzzed designs: Excitement 2.5 to 8.4 on a mixed panel (0 to 10 per type), Intensity 1.3 to 10, Drain 0.4 to 8.6. The stock designs' volatility values were re-expressed so each keeps its M8 base game; the per-type calibration was refitted (the original three within ±0.15).
- **Pairings added:** Lucky Dragon + hold & spin or pick-to-match, Tiki + hold & spin, Pirate + pick, Gold Rush (Prospector) + collector, Rome or Deco (or a classic) + topper wheel, Neon Atomic + cascades, Rock + wheel, Luxe or Riviera + offer; hold & spin + linked jackpots in it, climbing cascades, wheel + a progressive segment, mystery + must-hit-by, collector + free spins. Clashes: Medieval + cascades, a stepper with more than one feature, Luxe or Deco + cascades.
- **Opinions (owner):** every thought a guest has while playing counts toward that game kind (a slot design, or a table or video game by kind) per month, six months kept, with sessions and the mood they got up in. The machine's card shows the likes and complaints with their shares and a trend; the Slots tab shows each design's top like and complaint. Not split by guest type (the plan's by-type view needs a per-type count; left for later).
- **Collectors** always keep their progress on the machine (no "reset per player" option: forfeited progress would make the payback inexact); a design change resets it.
- **Play screen:** each spin plays as a run of steps; a tap ends only the step on screen (stopping the reels goes straight to the win), Skip ends a feature and counts its total up. The credit meter, the meters, the collector and (your own play) the top bar's cash and the session line hold until each result is shown. Feature screens: the hold & spin board, a pick board, a wheel (on the top box with a topper wheel), the offer with Take / No deal. Help screens describe every feature and jackpot.
- **Face (owner):** 12 logo fonts (iOS system fonts with fallbacks) and five logo effects; top box large/small/none; meters in the top box, above the reels or hidden; reel window compact/standard/large; buttons standard/compact. Cosmetic: free, no certification. A game-wide interface size (small/normal/large) is kept on the device (Game tab and title screen).
- **Stock:** Ember Link (Lightning Link-style hold & spin with linked Major and Grand), Grand Wheel (a 3×3 Deco game with a topper wheel and a linked jackpot on it), Neon Tumble (cascades, mystery multiplier), Prospector's Haul (collector with super free games), Treasure Cove (pick-to-match jackpots, an offer, a must-hit-by meter). The Test Floor has all five and a bank sign.
- **Provenance:** stock designs and copies of them are "stock"; designs loaded from a share code or the library are "imported"; everything else is "own".
- **Save schema 16:** meters per design, standalone meters and collector progress on machines, bank signs (`design` = the game shown; missing = the nearest linked game), opinions by month, lifetime theoretical win per design.
- **Speed:** new guest fields are made at spawn so every guest keeps the same shape (a first version lost ~18% on the Big Floor to hidden-class churn); the meter pull is skipped for games without meters. Big Floor steady state within ~5% of m8.

## M8.6 additions (owner, 2026-09-24)
Kept in M8.6 because both need fans and novelty, which are that part's core. The owner can pull either forward.

### Word of mouth: a design's life curve
- A new design isn't known on day one. Players come from **awareness × appeal**, per guest type:
  - **Awareness** grows like real product adoption (a Bass curve): a small start from being new on the floor, then word of mouth from its fans. An S-curve over roughly 2–6 months, faster for a type the design suits.
  - **Novelty bump:** appeal starts higher than the design's plateau and settles over 6–12 months (as planned in §6; bigger the more different it is from the floor).
  - **Fans:** good sessions turn regulars into fans (as planned); fans come back for it and tell others, which feeds awareness.
- Result: plays climb, peak a little above steady state while it's new, then settle where its quality puts it. The design card draws the curve (plays per day by month).

### Selling a design to a slot maker
The rare jackpot of design: a game good enough that a maker buys it.
- **Who can get an offer:** a design of origin `own` (not stock, rival, imported or a copy of one), on the floor at least 6 months, with Excitement ≥ 6, a (lifetime) performance index ≥ 1.2, at least 50 fans, and payback ≤ 97% (it has to make money, not just be loved at 99%).
- **Chance:** each month a qualifying design scores s from 0 to 1 (Excitement, performance index, fans, hold); an offer comes with chance 0.5% + 3% × s a month. Even the best design waits a year or so on average.
- **The offer** (from one of M8.6's fictional makers, a letter with Accept / Decline, open 30 days), each term jittered around s:
  - **One-time cash:** 10–100× the design's cabinet price.
  - **Your share of the house edge** on your own machines of it: 25–75%.
  - **Royalty:** 1–3% of what its machines win in other casinos, paid monthly.
- **Declining:** there's a 60% chance of another, different offer 3–12 months later if it still qualifies; each further decline cuts that chance by 40%.
- **After a sale:**
  - **Your own machines:** each spin sends bet × (1 − payback) × (1 − your share) to the maker, booked as "Game fees". Theoretical, not actual, so a jackpot month never makes the fee negative. Guests see no change.
  - **Outside casinos (owner's revision):** the total units the maker will sell is a hidden number fixed at the sale: most 10–30, some 100+, very rarely thousands (lognormal around ~20 × (0.5 + s), heavy tail). Installs climb to it along an S-curve of random length (roughly 4–24 months), so royalties rise month by month while the player wonders how big it gets; after that they hold, fading slowly with age (half-life ~3 years; Evergreens barely fade).
  - **Royalty each month** = installs × its average win per machine on your own floor × 30 days × royalty rate. The median sale pays a trickle; one sale in a thousand or so pays enough a month to win most scenarios (owner's intent).
  - **Progressives become wide-area** and the maker's liability: you no longer pay its jackpots (not from cash, not through insurance), and the increment from your machines goes to the maker as a fee. The meters also grow from outside play (in proportion to reach) and can be hit outside (chance in proportion to outside coin-in), reset to seed, with a news line ("The Grand on Stampede Gold hit in Laughlin"). A huge meter pulls guests (§B above).
  - The design's math and features are locked (the maker owns them); cosmetics stay free. You can still place more of it; all fall under the deal.
- Each sold design is its own line in the budget (royalties in, fees out); the monthly statement lists its installs; the library records "Sold to …" and peak installs.
- Scenario goals (M11) may exclude royalties where a scenario wants the casino itself to earn the win.

## As built in M8.6 (differences from the plan above)
Code: `src/sim/design/market.ts` (sim), `src/ui/designer/Market.tsx` (panels). Tuning in `MARKET` and `SALE_RULES`.
- **Dropped (owner, before the build):** the yearly Slot Expo and rival makers' releases. The `rival` origin stays in the data but nothing makes one.
- **Market factor:** a machine's appeal to a type = its judged appeal × (0.55 + 0.45 × awareness) × (1 + novelty × e^(−age/100 days) × (0.5 + the type's boredom rate)) × variety. At full awareness, no novelty and a varied floor it is exactly 1, so the calibration of stock games is untouched. Refreshed weekly (days are 200 ticks), and at once when the floor changes.
- **Awareness (word of mouth):** per design and guest type, a Bass curve each day: += (0.002 × suit + 0.028 × suit × min(1, awareness + 3 × fans' share of the type's regulars)) × (1 − awareness), suit = the type's appeal for it (0.2–1.2). A new own design starts at 5% (25% with Game launches research), a stock game at 40% (a known brand); everything on the floor when a scenario starts, or when an old save loads, is known to all. Off the floor it slips 0.5% a day. Measured on the Test Floor: 44% → 62% → 75% → 83% → 88% → 94% over eight months for a game that suits most of the crowd (a type it doesn't suit takes twice as long).
- **Novelty:** 0.3 × how unlike the floor it is at launch (1 − the best token overlap with any other design here: layout, win kind, features, free spins enhancer, jackpot kinds, cabinet, topper, theme, wild, stacks). A reskin gets little, an exact copy none. Evergreens have none.
- **Boredom and favorites:** each regular remembers sessions per design (four designs, fading 15% a month). Their appeal for it drops by up to 0.25 × the type's boredom rate (Tourists and Party 1, Families and Conventioneers 0.8, High rollers 0.5, Retirees 0.4, Locals 0.3; half for an Evergreen) over 30 sessions. A fan's own game gains 0.1 + 0.25 × the type's attachment (Locals 0.8, Retirees 0.6, High rollers 0.4, Families 0.2).
- **Fans:** a session of a minute or more that ends in a good mood (60+) makes a fan with chance 0.4 × (appeal − 0.5), at most 20%. A regular is a fan of one game (they switch only for one they like 0.15 better, at half the chance); a bad session (mood under 35) can lose them, and a fan played out on a non-Evergreen says so and leaves it. **Visitors who don't come back count too** (they tell people back home): kept per design and type, fading 3% a month. Fans head for their game (+0.8 when choosing a machine; "Came here to play …"), come back 15% sooner while it's on the floor, and feed its awareness.
- **Draw:** fans of a game on the floor bring extra arrivals of their type: +3% per doubling past 10 fans, at most +30% per type.
- **Variety:** with 8+ slots, a design over 35% of the floor and a mechanic (a design's first feature, else its way of winning) over 50% lose appeal, more for types that tire quickly; "These slots all play the same".
- **Wishes** (per type, daily): no game with a bonus (bonus-hungry types), under a quarter of the floor at their stakes ("Wish there were more penny games"), nothing above Excitement 4.5 for them, everything too wild or too tame for them, or (novelty seekers) nothing newer than 18 months. Voiced now and then after a slot session; listed in the Slots tab with Market research.
- **Records** (Slots tab): biggest slot jackpot, most plays in a month, most fans, best performance index (90+ machine-days); a new jackpot record over $1,000 makes the news. **Evergreens:** a year on the floor, performance index 1.1+, and the last three months' plays per machine-day at least 75% of its best month.
- **Life curve:** each design's card (machine card and the Slots tab's More) draws plays per day by month, with fans, age, awareness by type (Market research) and what an own design still needs for an offer.
- **Research:** Game launches (games, $3,000), Market research (information, $3,000).
- **Offers:** checked monthly as planned (6 months on the floor, Excitement 6+, performance index 1.2+, 50 fans, payback 97% or less; own, certified, on the floor). Score s = 0.3 × Excitement (6→10) + 0.3 × index (1.2→2.5) + 0.25 × fans (50→400, log) + 0.15 × hold (97%→90%). One letter at a time, open 30 days, in the Slots tab. A lapsed letter counts as a decline. After a decline the next offer can only come on its re-offer date (60% × 0.6^(declines − 1), 3–12 months later); if that roll fails there are no more.
- **After a sale:** hidden units = 20 × (0.5 + s) × e^(1.3 × normal), 3 to 20,000; S-curve over 4–24 months, then a 3-year half-life (10 years for an Evergreen). Royalty each month (booked at month's close) = installs × its lifetime theoretical win per machine-day here × 30 × the rate. On your own spins: bet × (1 − payback) × (1 − your share) and each meter increment go to the maker; its jackpots on progressive levels (standalone, linked, must-hit-by) are paid by the maker (not your cash, not your insurance), and its meters no longer count against worth. Linked and must-hit-by meters grow with outside coin-in and can hit elsewhere ("The Grand on … hit in Reno"). Math edits are refused; looks stay free; a sold design can't be deleted. Each sold design is its own budget line ("Sold: …": the cash, royalties, fees and the jackpots the maker covered). The library notes "Sold to …", peak installs and Evergreens on entries with the same math.
- **Scale note:** the royalty formula is the plan's, so it scales with this floor's win per machine: a median sale (~20 machines) pays a trickle, a few thousand installs pay about what your whole slot floor wins.
- **Lucky Dragon decor** (owed since M8): Red Lantern (a light), Guardian Lion, Porcelain Vase, Lacquer Screen; in the Luxury themes project; on the Test Floor.
- **Test Floor and targets:** `npm run targets` now launches an own design on day 30 (three machines), prints each design's plays per machine-day, fans and index, the launch's awareness by month, wishes and records, and flags a barely played design, a floor without a single fan, or a launch still unknown after half a year.
- **Save schema 17:** offers, records, per-design market numbers, regulars' play history and fan.
