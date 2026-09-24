# Decisions

Newest first. One entry per decision: date, what, why.

## 2026-09-24 · M8 planned: the slot designer in three parts (readiness defaults for the owner)
- Owner: M8 should be a long, complex build: the creative core, as deep and rewarding as RCT's coaster builder, able to make games that play like Buffalo, Lightning Link or Dragon Link, with a rating that rewards good and creative design and punishes poor choices, and never goes stale. Plan in docs/spec/designer.md; parts in ROADMAP.
- **Flagged, NORTH_STAR conflict:** NORTH_STAR says "The game never tells the player whether a creation is good. Guests show them." The owner asked for a rating. Proposed resolution: RCT-style **Excitement / Intensity / Drain**, where Excitement is measured from a test panel of the scenario's own guests (the floor's hidden guest model, run without a room), and Intensity and Drain are plain math. Never labelled good or bad; the floor stays the truth. NORTH_STAR is unchanged until the owner confirms.
- Questions put to the owner:
  1. The ratings above, and amending NORTH_STAR's line to allow them.
  2. **Three parts:** M8 designer and base game (with free spins), M8.5 bonuses and progressives, M8.6 the market (novelty, trends, rival releases, fans).
  3. **Symbols as emoji** on styled tiles in the play screen (they look like real rendered slot symbols on an iPhone, no art cost); the floor stays pixel art.
  4. **Certification:** a new design costs $1,500 and 7 days; running one uncertified (any payback, near misses above chance) is the rigging dark lever the inspector can catch.
  5. **Market churn** (novelty fading, a yearly Slot Expo of trends, rival releases): what keeps the player redesigning. Any of it unwelcome?
- Defaults (from the M8 readiness check, plus Claude's): guests never perceive payback directly, only through outcomes, and regulars build a "tight" name for draining designs; near misses extend play for chasers; small wins celebrated as wins please Tourists, Party and Families and put off Locals and High rollers; excitement makes money lost feel better spent; stock models become editable designs calibrated to today's appeal; one design library on the phone across all saves, with share codes; a Lucky Dragon (Asian fortune) theme; bright cartoon themes draw children; hunters (advantage players) on must-hit-by meters and kept collectors.

## 2026-09-24 · Hotfix: look, layout freedom, bigger Free Play lot (owner; "green light")
- **Play-it-yourself screens look and move like the real games** (owner: more realistic, more satisfying): reel strips, dealt and flipping cards, a real roulette wheel and ball, tumbling dice, keno balls, casino chips, counting wins and a coin shower. See docs/spec/play.md.
- **The whole building is the player's** (owner): the shell and the scenario's doors can be demolished, doors go in any wall, and new street entrances can be built beside the sidewalk ($500). Claude's call: indoors is now derived (floor the open air can't reach), so walling in lot ground makes an extension and a hole to the outside makes a room outdoors until closed. Entrances can't be removed (not asked for; keeps guests' way home simple).
- **Free Play Lot is about 8× bigger** (owner asked 5–10×): 156×108 owned tiles around the same building, with the two land parcels moved east. Existing Free Play saves keep their map.
- **Outdoor ground is Vegas sand, not grass; every room purpose but the general floor has its own floor**, concrete for the enforcement room (owner). See docs/spec/art.md.
- **Janitors sweep in half the time** (owner): 1 s per spot at skill 1.
- No save schema change: indoors is recomputed only when walls change, and old saves' `fixed` shell flags are ignored for walls and doors.

## 2026-09-24 · Main menu from the Game tab (owner)
- Owner asked for a way back to the title screen (scenarios, sound). The Game tab has a **Main menu** button that asks first: **Save and go** (saves over the autosave), **Go without saving** (goes back to the last autosave) or Cancel.

## 2026-09-24 · M10 built (Claude's calls; see docs/spec/audio.md, docs/spec/play.md)
- **Same odds as a guest, checked exactly:** roulette, baccarat (every 8-deck shoe enumerated), craps (real dice) and keno return what the guests' models say, and video poker classifies all 2,598,960 hands correctly.
- **The craps field bet is dropped** (it was in the plan): its edge isn't one a guest faces. Lay odds on don't pass are allowed at true odds.
- **A video poker royal pays 800 at any number of coins**, as the guests' model does. Slots take one wager per spin, where a guest's round is four.
- **You play your own hand:** no seat taken, and the table's shared outcome and guests are untouched. A table must have its dealer and a machine must be working. You can't leave mid-hand, but selling the object refunds what was out.
- **A title screen at every launch** ("Tap to start", because iPhone needs a tap before audio). It pauses the floor until Continue.
- **Nightclub music plays whenever the game runs.** Only the two loudest music sources play at once. The floor goes quiet when paused and drops to half while you play.
- **Door sounds are dropped** (they were in the plan): with doors on every route they'd be constant noise.
- Big Floor headless: ~8.0 ms/tick against m9.6's ~7.9 on the same machine (two runs each; noise).

## 2026-09-24 · Green light for M10
- Owner said "green light for m10".

## 2026-09-24 · M10 plan: owner's answers
- Owner accepts that winnings at your own games come from nowhere.
- **Same odds as guests:** you play the object's real rules and paytable with ordinary luck, never rigged either way. In blackjack and video poker your own decisions still count, as they do for a sharp guest.
- **Only real simulated games:** no sportsbook. Poker and bingo stay out.
- **No vibration.**
- **Generated music** (owner): a main theme on a new title screen, and a pick of tracks for each dance floor that fades with distance. Claude adds show-lounge music and a music volume slider.
- The other readiness defaults stand (blackjack depth, a separate "Owner's play" line in the books, no figure on the floor).

## 2026-09-24 · M10 planned: audio and playing the games yourself (readiness defaults for the owner)
- Plan in ROADMAP. Starting point: 25 synth recipes and one master mute. There's no distance, ambient bed, category volumes or working iPhone haptics yet.
- Defaults put to the owner:
  1. **Which games:** every house game incl. the sportsbook. Poker and bingo are excluded (FOUNDATIONS §23: player vs player).
  2. **Blackjack depth:** hit, stand, double, one split, no insurance or surrender. Shuffled every hand, so no counting.
  3. **Your money:** casino cash, on its own line in the books ("Owner's play"). It's kept out of machine and table stats, the gaming tax, skimming and the regulator.
  4. **On the floor:** you don't appear and don't take a seat. Guests keep playing the same object.
  5. **Haptics:** on for jackpots, placements and your wins. iPhone gets one light tick at most.
  6. **Positional sound and ambient floor:** on.
- Flagged: winning at your own tables pays out of thin air, because the table's bank is treated as outside money (NORTH_STAR: "gamble the house's fictional money as a diversion"). Owner-set rules can give the player an edge (e.g. a >100% video poker paytable with perfect play). That's accepted because hand-by-hand play earns too little to matter next to the casino's profit. Revisit in M11 if it doesn't hold.
- Math tests planned: roulette, baccarat (exhaustive enumeration), keno and craps returns will be checked against their TABLE_GAMES edges. Blackjack and video poker get invariant tests only (hand values, dealer rules, paytable lookups).

## 2026-09-24 · M9.6 built: vice, drugs, the hotel elevator (Claude's calls; see docs/spec/vice.md)
- Owner asked for the cut M9.5 items as their own pass, and for **staff caught stealing to be replaced automatically** (same job, room and bar; the ticker says so). Quits are still not replaced.
- **The elevator is a scenario feature**, a fixed floor tile (Free Play and the Test Floor; not the tutorial): hotel guests come and go by it by type (Conventioneers 80% … Locals never). Old saves have none.
- **Escorts are visitors, not a guest type** (FOUNDATIONS §6). The vice rule sets how many come and whether guards show them out. **The house's profit from vice is the room** ($50 when a guest goes up with one) plus the crowds who enjoy it; the costs are players leaving the floor, reports and police.
- **Drugs:** 0–15% of a type use, only in quiet spots with no guard in view; high = +40% bets and no tiredness for ~90 s; 2% overdose into passing out.
- New house rules default to Moderate. A hotel-room comp (a longer stay, $40) where there's an elevator.
- Test Floor, 300 days (rules on Moderate): 342 guests came by the elevator, 65 escort pitches (19 left with one, $1,000 in rooms), 7 hookups, 37 drug uses, no sanity flags. With both rules on Ignore (150 days): 195 pitches, 44 left with an escort, $2,200 in rooms; police standing didn't move, because vice costs police standing only through reports that go unanswered and officers who see it.

## 2026-09-24 · M9.6 requested: vice, drugs, hotel elevator; thieves auto-replaced
- Owner: "do a m9.6 pass to be its own vice and drug and hotel elevator pass", and auto-hire a replacement for a caught dealer.

## 2026-09-24 · M9.5 built (green light; Claude's calls; see docs/spec/calendar.md, docs/spec/research.md)
- Owner said "green light for m9.5" with no readiness questions, so every design call below is Claude's and starting values only.
- **Vice, the hotel elevator and a drug policy are cut** (the roadmap named them first to cut). They're unscheduled; say if they should come back as their own milestone.
- **Events are short in real time** (a day is 10 s), so their multipliers are strong: a convention brings Conventioneers ×40 for 4–7 days (a few dozen of them). Sportsbook and poker appeal also rise on their nights.
- **Research gates building** in the tutorial only: it starts with no projects done (tables, restaurants, shows, the club, outdoors, themes, cameras and Thunder Jackpot need research). Free Play, the Test Floor and the Big Floor start with every building project; information projects (overlays, heatmaps, the club, extra suspicion tiers) must be researched everywhere. Saves from M9 and earlier keep everything they could build.
- **The player's club** reveals types and value on the guest card, counts the floor by type, lets comps target one type, and relabels card doors. Guest breakdowns (machine and table stats by type) are a separate project after it.
- **Families:** children are a row shorter, carry no money, stay near the adults and aren't scored; underage gambling is a misconduct incident that guards resolve by walking the child back.
- Test Floor: a sportsbook below the pit, an 11th dealer as a spare (a crooked dealer fired early had been leaving roulette closed all run), Families and Conventioneers in the population and street mix.
- Big Floor headless: 7.3 ms/tick against m9's 6.8 on the same machine (one run each, spawn burst included).

## 2026-09-24 · Green light for M9.5
- Owner said "green light for m9.5".

## 2026-09-24 · M9 built (Claude's calls; see docs/spec/staff.md, docs/spec/money.md)
- All numbers are starting values checked only against sanity flags: pay range 60–160%, skill = knack × pay^0.6 × morale, crook share 5% ÷ pay^1.5, theft chances and amounts, catch chances, overwork above 85% busy, quitting below morale 20, tax rates, loan and emergency rates, insurance loading, whale sizes and timing, comp thresholds.
- **Dealers aren't worn down by a busy table** (dealing is the whole job); the first build counted it as overwork and every dealer on the Test Floor went miserable.
- **Crooked guards, pit bosses and operators look away** from cheats and from staff theft; a crooked dealer never catches a cheat at their table (this is dealer collusion, per the M7 decision).
- **Shrinkage is posted at the monthly count**, not as it happens: the books show where money went missing, a month late, never who.
- **Policies tab** now holds insurance, the tax and skim, and comps; loans stay in Finance. Research stays a placeholder until M9.5.
- **Whales** stay 20–30 real minutes (2–3× a high roller; weeks on the calendar) and a host shows them the floor, so they find their game.
- Unpaid winnings under $100 cost 2 regulator points and go to the log only; bigger ones are urgent.
- Test Floor, 300 days: staff morale averages ~44 at market pay, one crooked dealer caught, three whales (the house won $10K, lost $30K, won $500), five inspections, regulator 100, no sanity flags. Tutorial year-end cash $3.9K (m7 on the same seed: $5.0K; the 5% tax is ~$250 of that, the rest is seed noise from reshuffled staff draws). Big Floor timing unchanged against m7 on this machine.
- **Flagged for the owner:** a whale can cost the house several months of profit in one visit (by design: FOUNDATIONS §17); insurance doesn't cover it, table limits do.

## 2026-09-24 · Green light for M9: staff, money and risk, whales (see docs/spec/staff.md, docs/spec/money.md)
- Owner said "green light" and accepted the readiness defaults, with two changes:
  - **No hiring screen.** Staff quality scales with a pay slider per role (Claude: skill = a hidden personal knack × pay^0.6 × morale; better pay also means fewer crooks).
  - **Security catches staff stealing** and they're fired (Claude: guards, pit bosses and watched cameras; crooked guards, pit bosses and operators look away).
- Defaults accepted: one wage per role; ~5% crooks, seen only as monthly shrinkage per area; a gaming tax with skimming as a dark lever; a regulator ladder like the police with a visible inspector; loans at 50% of worth and 2%/month, emergency loans at 6% with a fee and a scandal, unpaid winnings, insolvency after 3 months; whales every 1-2 months where tables exist; comps by play (meal, show, come-back offer).
- Claude's calls: comps key on theoretical loss (what the math expects a guest to lose), as real casinos rate play; the insurance premium is 1.3× the exact expected excess of the month's actual wagers; the tutorial's tax is 5% so its goal barely moves.

## 2026-09-24 · M9 split into M9 and M9.5 (planning; details wait for the green light)
- Owner allowed two parts. Claude's split: M9 is inside the house (staff depth and honesty, the regulator, credit and insurance, whales and comps: leaks and variance); M9.5 is outside it (calendar and events, marketing, research tree and player's club, new crowds, vice). See ROADMAP.
- Why this seam: M9's parts all feed each other (theft needs audits, audits feed the regulator, whales test credit), and M9.5's research tree has to gate things that already exist, including M9's.

## 2026-09-24 · M8 (slot designer) moved after M10
- Owner: build M9 next; the slot designer is mostly standalone. Order is now M9 → M10 → M8 → M11. Milestone names and tags keep their numbers.
- Claude's call: M8 stays before M11, not after it, because balance tuning has to include player designs.
- What the M8 readiness check found, for that chat: guest slot taste is a per-model lookup (`games[model]`) and needs preferences over design parameters (stock models become presets calibrated to today's values); the regulator has a ladder but no detection (an audit inspector is the default). Defaults to put to the owner: guests can't perceive payback directly, only through outcomes; near misses extend play, dressed-up losses please some types and put off Locals and High rollers; a design library shared across saves; bonus features and linked progressives possibly split into M8.5.
- Moving M8 later resolves one conflict: machine stats "by guest type" can use M9's player's club instead of the Debug view.
- M9 builds the regulator's first triggers instead (skimming, unpaid winnings, dealer collusion); rigging and near-miss triggers join them in M8.

## 2026-09-24 · M7 built (Claude's calls; see docs/spec/tables.md)
- All numbers are starting values checked only against sanity flags: costs, wages (dealer $100, pit boss $140), round lengths, limit presets, tastes per type, `tableStake`, skill shares and costs, counter shares and gains, the pit boss and dealer catch rates, the counter-tagging rate, High rollers' data.
- **Every game is unit-risk wagers in the slot paytable shape**, so luck, cheating, the suspicion tools and the books work unchanged. Blackjack draws loss / push / win / natural with the win chance solved for the exact edge (no doubles or splits drawn); craps odds are separate wagers placed only when a point is set.
- **Shared outcomes are real:** one roulette number, craps decision, baccarat coup or keno draw per hand for the whole table; each player's result follows from their own bet. Luck there turns a loss into the bet's win (or a win into a loss) at chances that keep the ±20-point shift exact.
- **Poker and bingo are pools:** the house earns exactly the rake (10%, capped at $10 a pot) or hold (30%); skill decides who wins at poker, cards bought at bingo. No luck and no cheating there.
- **Dealers are hired staff** who walk to an open dealer spot; craps needs two, keno and bingo one each (a writer, a caller). Tables with no dealer are closed and say so on their card.
- **Guests bet more per hand at tables** (stake × `tableStake`), which makes the minimum the lever for who sits: Retirees rarely reach a $5 table and play keno and bingo instead.
- **Rules-aware guests** (Locals 0.6, High rollers 1) add half their weight × the table's rules score to its appeal and may say "Six to five blackjack? No thanks." Counters never sit at 6:5 and prefer fewer decks.
- **High rollers** come at a fifth of their rate to a casino without tables and 1.5× with tables in a high-limit room; they're a recurring pool (Test Floor 25, Free Play 40, none in the tutorial).
- **Table cheats pace their bets to their take** (take / 40 per hand): at a table's maximum, one hand could overshoot a whole take.
- Test Floor: a table pit on the main floor, poker, keno and four video poker machines by the door, a bingo hall in the quiet back room, baccarat in the high-limit room (its Thunder row shortened to four, the Liberty row to six), nine dealers and a pit boss, and three more restrooms (busier floor: Party and High roller guests were leaving for restrooms).
- **Fixed:** the pit boss stood at the door all day in the first build (a tile search started from inside the table); counters were never tagged.
- Tutorial books identical to M6.5; Big Floor steady state unchanged.
- **Flagged for the owner:** a cheat on a high-limit baccarat table still wins faster than one at a slot, and the Test Floor's cheats cost about $2–7K over 300 days depending on the seed (M6.5: ~$1–3K). Pit bosses and dealers are the lever; tuning is M11.

## 2026-09-24 · Green light for M7: games catalog and table rules (see docs/spec/tables.md)
- Owner said "green light" and accepted every readiness default, with one change: **no M7.5**, the whole catalog ships in M7.
- Catalog: blackjack, roulette, craps, baccarat, video poker, poker room (rake), keno and bingo. The sportsbook waits for the M9 event calendar.
- Tables draw each bet from its exact odds, like slots; the cards, wheel and dice shown are that real result. No deck simulation.
- Blackjack skill: guests make realistic mistakes, so the edge depends on who sits; card counters are a hidden trait and read like lucky or cheating guests.
- Tables are social: several seats share one round, a table opens only with a dealer (paid staff), craps draws onlookers and watching counts as fun.
- Limits per table: the minimum decides who can sit, the maximum caps exposure; a high-limit room multiplies both by 5.
- Locals and a new High rollers type notice rule changes; Tourists and Party guests don't.
- Game tastes per type are Claude's call, checked against sanity flags.
- **Dealer collusion moves to M9** with hidden staff honesty (resolves the M5/M9 conflict). Table cheating by guests is in M7.

## 2026-09-24 · M6.5 built (Claude's calls; see docs/spec/themes.md, docs/spec/construction.md)
- Theme math and numbers are starting values checked against sanity only: strength 3 / radius 4 per piece, walls cut 60%, clashing pairs count 2.5× (a clash has to hurt more than a good pair helps), unrelated themes muddle at 0.8, curated bonus 0.3, per-type `theming` 0.3 / 0.5 / 1.0 / 0.6.
- **General items only count toward a theme where that theme is already present** from themed pieces, so a palm alone never "themes" a room; it can only reinforce one (the curated bonus).
- Pieces are all 1×1 in M6.5 (48 new sprites); bigger showpieces can come later.
- Outdoors: pool (people come for it), garden (a rest for sore feet), patio bar and restaurant (the indoor ones, outside). No weather.
- Land: Free Play Lot grows to 80 wide with two lots for sale; land keeps its price in worth. The tutorial has none.
- Test Floor: themed rooms and a front yard (pool, patio bar and restaurant, garden, tiki torches), plus a side door from the yard into the club so pool-goers can reach a restroom.
- Big Floor unchanged (~2.3 ms/tick; nothing themed there, so themes cost nothing).

## 2026-09-24 · Green light for M6.5: themes, outdoors, land parcels (see docs/spec/themes.md, docs/spec/construction.md)
- Owner said "green light for m6.5", built in the same chat as M6.

## 2026-09-24 · M6 built (Claude's calls; see docs/spec/construction.md)
- Numbers are starting values checked only against sanity flags: amenity costs and upkeep (a default bar, restroom and cage cost and run exactly as before), tier thresholds, meal $18 (house cost $6), show every 100 s for 45 s, cover $10, `comeFor` shares, smokers' shares and urge (~4½ min), the high-limit ×5, the 90 s let-out.
- **Amenities draw extra arrivals, and those extras are the people who came for them:** each kind adds `comeFor` × (1 + 0.25 × tier) to a type's arrival rate, and an arriving group's reason is drawn at the same odds. People who came for something head roughly toward it and search a little longer; mazes still defeat them.
- **Fun time counts in the visit score** like play time, and money spent at meals, shows, cover and doors counts like money lost.
- **Existing bars become 3×2 areas** covering their old counter and stool row; restrooms and cages keep their shape. Nothing costs more than before.
- Card holders are returning guests, and their companions come in with them. Staff, police, paramedics and escorted guests pass staff, card and dress-code doors; only that role passes a one-role door (plus guests an enforcer is walking there).
- Trapped guests are let out only if a way out exists past unlocked doors; walls and locks still trap them (the M2.5 guarantee).
- Smokers with nowhere to smoke cut the visit short. Smoke bothers non-smokers only past a low tolerance, so a smoke-free floor changes nothing.
- Test Floor: an east wing (high-limit room, show lounge, club with restrooms, restaurant with restrooms, smoking room, card holders' bar); office and enforcement doors are staff only. **Fixed:** a sign had blocked the office door since M5, so the surveillance operator never reached the desk; M5's catch numbers on the Test Floor came from guards and chance only.
- Big Floor steady state: ~2.1 → ~2.3 ms/tick at 5,000 guests (smokers walking out to the lot is much of it).
- **Flagged for the owner:** the club has no bar of its own on the Test Floor, and party guests there drink less than in M4 (median peak 0.23, was 0.44). It's the kind of layout symptom the game is about, not a bug; a bar in or next to a club is the lever.

## 2026-09-24 · Green light for M6: construction (see docs/spec/construction.md)
- Owner said "green light for m6".
- **Themes** (owner): Ancient Rome, Ancient Egypt, Medieval, Rock & Roll, a few luxury flavors, a few old-school Vegas flavors, and a couple of Claude's picks. Claude's calls: luxury = Gilded Deco, Modern Luxe, Riviera; old Vegas = Rat Pack Lounge, Neon Atomic, Gold Rush; picks = Tropical Tiki, Pirate Cove. Hidden pairings are Claude's call (in the spec).
- **Amenities are sized** (owner) and grow sensibly with size: more stalls, more seats and bartenders, and so on. Every FOUNDATIONS §8 amenity except those tied to M9 systems: bar, restrooms, cage, restaurant, show lounge, nightclub, smoking room and high-limit room now; pool, garden, patio bar and patio restaurant with the outdoors in M6.5.
- **Room purposes:** the owner left the effects to Claude (in the spec).
- **No weather or seasons outdoors** (owner): always hot, sunny pool-party weather; inside is inside.
- **Door rules** (owner): open, staff only, locked, card holders, one guest type, one staff role, plus a fee for walking through. Claude's calls: until the M9 player's club, a "card holder" is a returning guest; a type rule reads as a dress code (types already look different); scenario doors and entrances can't be changed; a guest trapped behind doors they can't pass is let out by staff after 90 s, at 1 police-standing point each.
- **Split** (Claude, from the readiness check): m6 = doors, sized amenities, room purposes, reasons to visit; m6.5 = themes, outdoors, parcels.
- **Deferred to M9:** Families (minors and underage incidents) and the hotel elevator with vice.

## 2026-09-24 · M5 built (Claude's calls; see docs/spec/cheats.md)
- All numbers are starting values tuned against sanity flags: take median $400, spells of 30-90 s after 20-60 s honest, rigged wins on half the wagers at 4× the bet, catch chances (0.1%/s by chance, +0.6%/s per guard in view, +0.4%/s per unit of watched camera field, ×2.5 marked), 8 cameras per operator, heat and consequence costs.
- **Cheating is reliable, not jackpot-shaped**: scaling payouts by a factor left most spells losing on high-volatility machines, so a spell is rigged wins instead.
- **Luck is exact and shows as win frequency**: a lucky guest's losing wager is redrawn, an unlucky guest's win voided, at chances that shift payback by exactly ±20 points (checked by `npm run headless`). This makes lucky guests real false positives for the tools.
- **The cheat estimate reads mostly how often someone wins**, plus half of how much, against honest play with a broad tail. Measured: cheats median 75%, honest winners 1 in 100 above 27%.
- Cheats after their take ignore the usual quit rules and plan 1.5× the usual floor time.
- Suspicion tools per scenario: Lucky Horseshoe 2 (time, result vs expectation), Free Play and the test floors 4.
- Default house treatment: a ban for a first and a repeat offense. Enforcers are $150/mo, operators $120/mo, cameras $400, dumpsters $300.
- Guards can carry out warnings and bans; a beating or disappearance needs an enforcer. Without anyone on staff, a caught cheat is banned and shown out on the spot.
- A disappeared person is removed from the pool; a beaten one loses 40 disposition and their visit scores 0.
- Banned people still try now and then and are turned away at the door (log only).
- **Flagged for the owner:** on the tutorial (no security), cheats cost about $1.5K-2.3K of a $5K-7K yearly slot win. That's the intended pressure (hire a guard; mark the big winners), but it makes the $30K goal a little harder.

## 2026-09-24 · Green light for M5: cheats, suspicion tools, enforcement, luck tags (see docs/spec/cheats.md)
- Owner said "green light" for M5.
- **Cheats are about 1% of guests** (owner): uncommon, not a constant stream.
- **Dark enforcement** (owner): no censorship, but no blood, nudity or suffering: quick, clean animations that don't pull punches. Available from the start once an enforcer is hired (not research-gated).
- **House treatment for caught cheats** (owner): the enforcement room holds a setting for a first offense and for repeat offenses, chosen from the same actions the player can order on any guest (warning, ban, beating, disappearance).
- **Bans cover the whole group** (owner).
- Readiness calls the owner accepted: suspicion tool tiers are set per scenario until the M9 research tree; cameras, a surveillance operator and an enforcer arrive now, pit bosses wait for tables (M7); cheating is slots-only (dealer collusion M7); staff skimming moves to M9 with hidden staff honesty; no regulator triggers in M5 (M8/M9).
- Change from the readiness note (Claude): walled rooms with purposes already exist, so enforcement uses a real **Enforcement room** and cameras a real **Back office** instead of a stand-in object. Without an enforcement room, a beating or disappearance happens where the guest stands, in front of any witnesses.

## 2026-09-24 · M4 built (Claude's calls; see docs/spec/incidents.md)
- Catalog rates, tolerances, `policed` and `drama` values, the police costs and ladder numbers, fines ($100–$1,500), paramedics ($200), closures (3 days; 30 on losing the license) are starting values, tuned only against sanity flags.
- House rules cover the three policed categories (drunkenness, disorder, misconduct); celebration and social aren't policed. Default Moderate. The drunkenness rule also sets the bar/server cut-off (Moderate 0.8+, Strict 0.5+).
- Losing the license marks the scenario lost; the casino reopens after 30 days with standing 30, matching how a missed deadline lets you keep playing.
- The regulator has a standing and a line in the Authorities tab only (its causes are M5/M8).
- Reports: 0.06 × (1 − drama)² per bothered witness, so a busy Test Floor sees about one every ~30 s of real time; only the first report of an incident reaches the ticker (yellow).
- **Flagged for the owner:** incidents cost Tourists and Party guests 0.1–0.4 min of play on the Test Floor (annoyance from what they see, frustration in a bad mood). That's the designed cost of an unruly floor; levers are type `tolerance`, guards, and stricter rules.
- A spill empties the glass. Test Floor: two guards, one strong-drinks bar (a quarter comped), and two more restrooms (the drinking fix filled the old ones: tourists were leaving for lines).
- Police standing recovers 0.2 a day; a call costs 6, a paramedic 5, a fight 3. Tuned so a deliberately unmanaged drunk floor loses its license within ~250 days while the tutorial and a guarded floor never slip.
- Big Floor steady state: 1.92 → 2.01 ms/tick at 5,000 guests.

## 2026-09-24 · Green light for M4: incidents, house rules, police (see docs/spec/incidents.md)
- Owner said "green light" for M4.
- **Incidents come from causes** (owner): each needs a condition the player can see and change (drunk + holding a drink → spill; bad mood next to a drunk → argument → fight; chaser deep in the hole → breakdown; bursting, drunk and no restroom → a planter). Type data only scales how likely a condition turns into an incident.
- **Guests react to being policed and to what they see** (owner), not to the house-rule setting itself. The type field `leniency` becomes `policed` (how much being warned, cut off or ejected bothers them).
- **Police calls** (owner): only a guest who has reported several incidents that all went unanswered calls the police (3 unanswered reports; Claude's number for "multiple"). No per-room tally.
- **Drinking fix** (owner): trays hold 10 and servers ask everyone within 6 tiles. That alone didn't move intoxication (the bottleneck was a dry gap between drinks and 4-5 minute visits), so also (Claude's calls, flagged for the owner): guests order the next drink when down to the last quarter, servers offer again after 30 s (was 45) and head to the bar 12 s after the first order (was 20), readiness to accept grows with how far below their intended level a guest is, one standard drink adds 0.25 (was 0.16), and overshoot medians roughly tripled. Test Floor: 30% of party drinkers now get drunk (0.5+), 9% wasted, ~3% reach pass-out territory; locals and tourists ~7% drunk.
- **Police can lose you the scenario** (owner): standing 0 revokes the license.
- Deferred: vice (needs the hotel elevator, M6), underage (needs minors), drugs (M9 policies), bribery (M11), regulator triggers (M5/M8; M4 shows its standing only).

## 2026-09-24 · M3.1 art pass (Claude's calls; owner delegated style; see docs/spec/art.md)
- **Style "Velvet Night"**: top-down 3/4 pixel art at 16 px/tile, light from the top-left, a compiler-added 1 px ink outline on everything that stands, quiet dark floors, and the brightest pixels reserved for light sources. Written up as rules and a checklist in docs/spec/art.md.
- **People are paper dolls**: pose + outfit + hair/hat + accessories, with shades derived by the compiler. Type silhouettes: locals casual, retirees shorter with grey/puffed hair and cardigans, tourists sun hats, loud shirts and cameras, party guests blazers or short dresses. Staff read by uniform plus a prop (mop, toolbox, tray). Party makeup (sex) now shows. Cheats and chasers look like everyone else.
- **Drink is visible**: a glass or soda in hand while holding a drink, flushed faces from tipsy (0.25) and drunk (0.5), plus the existing stagger.
- **Rotation shows**: bar, cage, ATM and restrooms now have front/back/side art (before, only slots did).
- **Floor light and shade** are baked into the cached chunks: contact shadows, wall shadows, and colored light pools from neon, slots, bar, cage, ATM and fountain. Wide zoom now shows real object sprites instead of flat squares.
- Decor animations (neon flicker, fountain, bartender, slot lamps, palm sway) run on real time so fast-forward doesn't strobe them; sim-driven ones (walking, reels, wins) stay on ticks.
- The build menu shows a picture of each object.
- No gameplay code changed; saves are unaffected.

## 2026-09-23 · M3 revisions after the owner's first look (see docs/spec/guests.md)
- **Browsing, not failing** (owner): new guests sightsee first, pulled by the surroundings their type likes, learning the layout faster and noting machines they like; regulars check their favorite spots in turn. Frustration only builds once they want to sit and can't, slower in a good mood. Replaces "3 failures and they go home".
- **Guest numbers are sanity checks until near v1.0** (owner): the table in guests.md now shows current measurements plus which levers move each number; the agreed M3 targets stay as "design intent" for the tuning pass. Generator checks compare draws with the type data, not with fixed targets.
- **Drinks** (owner): servers are the main source. A guest holds one drink at a time, sipped over a minute or two while doing anything else; intoxication wears off slowly. Guests go to a bar only when thirsty with money, and may have several there. Server offers are accepted by chance (type, thirst, level, price, comps, drink), so more servers and comps mean more chances. Servers carry 6, collect orders until full or time's up, pick up at their bar (a second a drink), deliver, and restart near the bar. Each bar has its own price, comps, strength and service area; servers are assigned to the least-served bar and can be reassigned.
- Service areas are rooms (Claude's call): rooms already have names and M6 makes them purposeful; drawing areas by hand on a phone would be fiddly.
- Servers ask everyone within 2 tiles at a stop and walk faster than other staff (Claude's call: one-guest-per-stop couldn't keep up with a busy floor).
- Test floors must be realistic (owner): a hidden Test Floor scenario with every object, signs and servers is the measuring floor; the Big Floor gained ATMs and signs.

## 2026-09-23 · M3 built (Claude's calls while building; see docs/spec/guests.md)
- **Money scale (flagged for the owner):** the agreed visit lengths and losses can't both hold at 10 wagers per round (a $90 budget lasted under a minute of play). `WAGERS_PER_ROUND` is now 4; running costs came down ~40% to match what a seat earns (wages $70/$110/$90, slot upkeep $2–4, bar $50, cage $35, restroom $15). Tutorial year-end cash with a tech and a bar: ~$7K–$15K (M2: $12K–$17K). Full balance stays M11.
- The Lucky Horseshoe's arrival rates and market were scaled down (visits last ~2.5× longer, so the same arrivals packed the floor): ~60 guests on the floor with a tech and a bar, Locals reputation drifting to ~53.
- Targets are measured by `npm run targets` on a furnished Free Play Lot and reported in guests.md; generator draws are asserted in `npm run check`, emergent outcomes only reported.
- Planned floor time is drawn above the target visit length, since money, quit rules and the group end many visits first.
- Quit rules (win goal, loss limit, jackpot) now send guests home; since M2 they only made guests switch machines.
- A broke or bored leader waits for the group like anyone else; "the leader quits" means a quit rule or their time running out. "Waiting too long" is 2 minutes.
- An ATM object (withdrawals only) joins the cage, so ATM placement is a layout lever.
- Drink servers carry a tray of up to 3 drinks per bar run (one at a time couldn't keep up with a busy floor).
- One-off types: 30% of the M2 arrival formula come on purpose; the rest must be converted from passers-by.
- Guests stay indoors when wandering, and new arrivals head for the open door first (M2.5 guests drifted onto the lot and gave up).
- Party group makeup (all men, all women, mixed) is stored per guest now, for the M3.1 art pass.

## 2026-09-23 · Green light for M3
The owner said "green light for M3" (build the M3 guest design, now docs/spec/guests.md).

## 2026-09-23 · M3 guest design (built; see docs/spec/guests.md)
- A type is who someone is. Group size, play style and chasing are drawn per person. Couples are a group size. Chasing is a hidden per-person level your floor can raise across visits, not a type.
- A population pool of real returning people per scenario. Reputation for recurring types is the pool's memory; one-off types use word of mouth.
- The M3 roster is Locals, Retirees, Tourists and Party groups. The other types wait for the milestone that builds what they want (Claude's call; the owner left it open).
- Sidewalk and entrance threshold (owner): pedestrians decide at the door, and only people who cross the threshold count as guests. Scenarios define their own sidewalks and entrances.
- Drinking is a continuous inhibition spectrum (owner): sober guests at 0, drinkers on a skewed bell shifted by intent, with overshoot. The ATM works the same way (owner): some never use it, the rest are on a skewed bell of what they could and do draw, with repeat trips driven by mood, drink, chasing and luck. The rare tail is someone draining their life savings.
- Group leaves when the leader quits or half the group has waited too long. Hot machine belief is in. House-money and break-even effects are in.
- Drink policy is player-set: price multiplier, comped %, strength (owner).
- Numbers are set as target outcomes with spread, shape and hard caps, then checked headless (owner).
- Thoughts: counts averaged over ~2 in-game days, counted by thought id regardless of wording; wording variants only on the guest's card; floor thought bubbles removed (owner).
- Reports are rare: negative incidents left unaddressed while many low-drama guests are present (owner; M4).
- Jackpots are red and only big ones reach the ticker; fewer notifications overall (owner).
- Types look different, cheats never (owner). All guest visuals wait for an M3.1 art pass after M3 (owner).

## 2026-09-23 · After the external review of M2.5
- Real returning individuals move into M3: a finite, persistent population per scenario, each person with their own visit history and memory. This replaces the per-type familiarity stand-in, and bans, returning cheats and chasers' shrinking bankrolls depend on it.
- Accepted consequence of having no time of day: crowds that don't mix are always on the floor together. Space (rooms, zoning, sightlines, noise) is the only way to separate them, and types are told apart by season, events and marketing, not by hour.
- Guest update cadence: once-a-second work is spread across ticks, and seated guests recompute mood every 5 s. Walking, rounds and timers stay per tick. A machine search considers at most 400 machines. Big Floor, 5,000 guests, headless: average tick 2.5 → 1.3 ms, worst tick 13 → 4 ms.
- Whale bankrolls (M9) are sized to game money, not reality.
- Review claims checked and not needing action: the perf test already uses real guests on Big Floor, and FOUNDATIONS already marks the parts superseded by clock.md. Types don't yet look different on the floor; that's an M3 decision.

## 2026-09-23 · Green light for M2.5; wayfinding built
- Owner said "green light".
- Regulars: no per-object memory for now. Real returning individuals come in a later milestone. Until then each guest has a floor knowledge meter that grows while they're here, and it carries into later visits through a per-type familiarity. A regular only knows things built before their last visit.
- Signs are just objects. The player doesn't set arrows (too much micromanagement). A sign imperfectly points guests toward whatever they're looking for.
- Sight is ray-cast only when a guest decides what to do (no cache): simpler, and cheap enough at 5,000 guests.

## 2026-09-23 · M2.5: navigation and wayfinding before M3 (see docs/spec/navigation.md)
- Owner: guests knowing the path to every destination kills the point of layouts. Inserted M2.5 before M3; the M3 guest discussion resumes after it.
- Guests no longer choose from the whole floor. They act on what they can see, what they remember, and what signs say, then walk known routes on the existing path fields.
- Walls and slot banks block sight. Signs are placeable objects. Regulars remember the floor, and that memory goes stale after a remodel.
- A guest with a walkable path to an exit always finds it eventually; with none, they are truly trapped (replaces "walled-in guests leave anyway").
- Fields bias which visible waypoint wins; they don't steer footsteps (keeps cause readable). Staff stay omniscient.

## 2026-09-23 · Bigger peak crowds; two-level pathfinding
- Owner asked to raise the planned scale: the largest maps now aim for 5,000–8,000 guests at peak (was 2,000–3,000). Mid-size raised to ~500–1,500. Every guest is still one real person.
- Why it's safe: on the owner's iPhone, a tutorial floor with ~100 slots held 60 fps with ~18,000 guests. A new ~20×-size test map (Big Floor, hidden from New game) now drives the perf test, so the ceiling is measured where it matters.
- Pathfinding rebuilt as two levels (local window fields per destination + shared per-room sector anchor fields, exact reachability by components). The single-level cache would have rebuilt full-map fields constantly on big maps.
- Guests consider only machines within ~50 tiles (the nearest 16 free). That makes the search cheap, and it's plausible: nobody surveys a huge floor before sitting down.
- Far zoom draws objects as flat colors baked into the floor image; thought bubbles are capped at 24 on screen.

## 2026-09-23 · Green light for M2; vertical slice built
- Owner said "green light to build m2".
- Engine fixes done first, as planned: per-system commands (module-augmented `CommandTypes`), a `layout` hook, save fixtures (`tests/saves/schema-1.json` is a real M1 save; `schema-2.json` the M2 one).
- Guest roster stays open. M2 uses three placeholder types (Locals, Retirees, Tourists) with provisional numbers on the full §6 structure; the guest design discussion before M3 replaces them.
- Money scale: wagers per round raised from 5 to 10, the knob clock.md names for this. At 5, wallets barely mattered (a visit lost ~$30 of a $150 bankroll) and machines took years to pay back. At 10, guests can go broke, visits last a few minutes, and a busy machine pays for itself in months. Casino prices tuned to match (slots $300–$700). Provisional until playtesting.
- **Flag (FOUNDATIONS §8):** amenities are fixed-size objects (3-stool bar, 2-stall restroom, 2-window cage) in M2, not drag-sized zones with tiers. Zones need the construction work planned for M6.
- Guest types are hidden in the inspector (types are earned through the player's club, §16); the Game tab's Debug view shows them for testing.
- Cash can go below zero (wages, a big jackpot) because loans arrive in M9; building stops while it's negative. Scenario goals are checked at each month-end; a win or a loss doesn't end play.
- Tutorial goal (provisional): worth $30K and Locals reputation 60 by the end of December, Year 1.

## 2026-09-23 · Safety net (post-M1 review)
- `main` protected by a GitHub ruleset: no deletion, no force pushes (owner set it up 2026-09-23).
- Each finished milestone gets a git tag (`m0`, `m1`, …); a workflow attaches that version's playable `index.html` to a GitHub Release.
- Push at every stopping point.
- M2 starts with three engine fixes (per-system commands, layout hook, save fixtures); see ROADMAP.

## 2026-09-23 · Population ceiling from the iPhone perf test
- iPhone results with test walkers: sim 0.09 ms/tick and draw 0.3 ms (Default zoom) / 1.7 ms (Overview) at 5,000 agents. The estimate was ~32–36K at every speed, but that is extrapolated from 5,000. What was actually measured: 20,000 walkers held 60 fps (sim ~1.1 ms, draw ~1.9 ms per frame).
- Result: agent count doesn't limit the planned 2–3K peak. "Every guest is one real guest" holds at all scales (closes that FOUNDATIONS §26 item). The real ceiling will come from guest logic cost; re-run the perf test once M2 guests exist. The perf test now measures up to 20,000 instead of extrapolating.
- Workflow: after merging, don't check or report that Pages is live; the owner checks it.

## 2026-09-23 · Green light; M1 engine skeleton built
- Owner said "green light" and asked for M1.
- Hook cadences are tick / beat (1 s at 1×) / day / month / year, replacing the roadmap's "minute / hour", which predated the no-time-of-day clock. Why: there is no hour to hook.
- Test walkers stand in for guests in M1 so pathing, crowd fields, rendering and the perf test have agents; they spawn indoors and wander. Guests replace them in M2.
- Hidden-value overlays sit behind a Game-tab *Debug view* for engine testing only; the North Star rule (earned through research) holds for real play.
- Population ceiling: see the iPhone perf entry above.

## 2026-09-23 · RCT-style clock (see docs/spec/clock.md)
Replaces the same-day "time and population" decision, which kept time of day.
- No time of day or day of week. Calendar = date counter: 1 day = 10 s at 1×, 1 year ≈ 1 h. Owner's call, modeled on RollerCoaster Tycoon.
- Floor at human pace; guests may gamble for calendar days or weeks.
- Play is event-based: each visible round resolves a small fixed batch of real wagers (default 5). No off-screen simulation.
- Guest-facing prices look real; casino-level money (wages, upkeep, goals) is tuned game money, stated monthly.
- Speeds pause/1×/2×/4×/8×. Scenario deadlines in months and years.
- One guest is always one person.
- North Star skill 5 is now "Running the calendar" (seasons, events, marketing), and its Time section was updated to match.

## 2026-09-23 · Approach review (owner approved all)
- Sprites as palette-indexed text data compiled to atlases at load, not per-frame pixel painting. Why: v0.2's approach won't scale to 20x maps and drains battery; text sprites stay editable and recolorable.
- Procedural Web Audio sound effects defined as data. Why: no asset licensing, tiny build, tweakable.
- Real play build on GitHub Pages, installed to the iPhone home screen. Why: iOS evicts website storage after 7 days without a visit unless the site is on the home screen; also gives fullscreen. Artifacts stay for quick previews.
- Save export/import to a file as a backup.
- One chat per milestone; repo docs carry context.
- `main` is the published branch. Claude manages branches, PRs, and merges; the owner never has to.
- Setup-level code is allowed before the green light; nothing that hard-codes open design questions.

## 2026-09-23 · Project setup
- Stack per FOUNDATIONS §1: TypeScript 5.9, Vite 8, React 19 (UI only), Canvas 2D, `vite-plugin-singlefile` for one self-contained `index.html`.
- Layer rules enforced by a script (`scripts/check-boundaries.mjs`), not just convention.
- Playtest channel: each build published as a private Claude Artifact (playable in the Claude iPhone app). Netlify config included but optional.
- v0.2 prototype archived verbatim under `reference/v0.2/` as reference only.

## Open (need the owner)
- Nothing pending.
