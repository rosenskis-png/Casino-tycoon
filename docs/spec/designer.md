# Slot designer (M8 plan)

**Status: green light 2026-09-24; M8 (part 1) in progress.** Owner's answers and additions in DECISIONS. FOUNDATIONS §7.1; NORTH_STAR "The creative core". All numbers are starting values.

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
  - **Intensity**: how hard it swings (the volatility index on a log scale: 1 → 1, 3 → 3, 6 → 5, 12 → 7, 25 → 9, 40+ → 10). Low, Medium, High, Very high, Extreme. Neither good nor bad: a taste.
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
- **Trends:** each year a **Slot Expo** (calendar event) announces what's hot and what's tired ("Hold & spin is everywhere this year; cascades are the talk of the show"). A mild, real effect on appeal, and a yearly creative prompt.
- **Rival releases:** each year 2–3 new designs from fictional makers appear in the build menu, built by the same compiler, following the trend. Buy them, or **study** them (open the par sheet and ratings) and copy into your library as a starting point. They move the floor average your designs are measured against.
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
- **Per design** (all its machines) and per machine: plays, occupancy (share of time in use), average session, coin-in, hold, **performance index** (win per machine per day ÷ the floor's slot average: the number real slot directors rank games by), share of players who came back to it, thoughts, and results by type (with Guest breakdowns research). A Games list sorts designs by any of these.
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
- Novelty and ageing, boredom and favorites, variety, fans and draw; the yearly Slot Expo; rival releases (buy, study, copy); wishes; records and Evergreens; research projects; Test Floor with designs of every kind; `npm run targets` sanity flags per design; the balance and speed comparison against the last release.
