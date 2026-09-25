# Roadmap

Status key: ☐ not started · ◐ in progress · ☑ done. Each milestone ends with a playable (or at least watchable) build published as an Artifact.

## M0 · Prep ☑
Repo, toolchain (Vite + TS + React + single-file build), layer-boundary check, headless phone smoke test, CI, docs, v0.2 reference archived, `main` branch, GitHub Pages publishing, home-screen web app manifest and icon, storage adapter with save export/import, screenshot tool, session-start dependency hook.

## M1 · Engine skeleton ☑  (see docs/spec/engine.md; iPhone perf: 20K walkers at 60 fps)
- State, runtime caches, save/load + migration chain, autosave
- Fixed-timestep clock and speeds per `docs/spec/clock.md`, hook cadence (tick / beat / day / month / year), dependency-ordered system registry
- Command bus (validate → apply → log), event bus (sim → ticker, audio, fx, stats)
- Named RNG streams
- Grid: terrain, walls, doors, indoor/outdoor; room detection by flood fill
- Distance-field pathfinding cache with targeted invalidation
- Field engine: sources, falloff, wall attenuation, dirty-region recompute
- Sprite pipeline: text sprites → atlas; procedural sound pipeline
- Renderer: chunked static layers, 4 zoom levels, camera, touch pan/pinch
- UI shell: top bar, ticker + log, tab bar, inspector frame
- Perf test: max agents at 60 fps on a phone at each speed (sets the population ceiling)
- `window.__ct` debug hook: headless N-day runner + invariant checks used by the smoke test

## M2 · Vertical slice ☑  (see docs/spec/guests.md, gaming.md, floor.md, economy.md)
- Engine fixes: commands register per system; layout changes reach systems through a `layout` hook; save fixtures per released schema in `tests/saves/`, loaded and stepped by `npm run check`.
- Tutorial scenario (The Lucky Horseshoe) with a worth + Locals reputation goal; Free Play Lot.
- Three slot models with exact paytables, 10-wager rounds, breakdowns, machine stats. Bar, restrooms, cashier cage. Rotation.
- Janitors and slot techs; litter.
- Guests on the full §6 structure (3 provisional types), tastes, needs, mood, thoughts with floor bubbles and a daily summary, reputation per type, arrivals.
- Books by category, monthly close, worth. Staff, Guests, Finance and Goals tabs; guest, staff and machine inspectors.
- Save schema 2 (migration from 1; M1 walkers retire).

## M2.5 · Navigation and wayfinding ☑  (see docs/spec/navigation.md)
- Guests know only what they see, remember, or read on signs; sight lines blocked by walls, closed doors and slot machines.
- Searching by exploring along sight lines, weighted by determination; giving up on needs; lost guests always find an open exit; walled-in guests are trapped.
- Signs (imperfect, no arrows to set). Floor knowledge per guest and familiarity per type, stale for anything built since a regular's last visit.
- Save schema 3 (migration from 2). Exit guarantees checked by `npm run check`.

## M3 · Guest model depth ☑  (see docs/spec/guests.md)
- Population pool of real returning people per scenario (reputation for recurring types = their average disposition); chasing as a hidden per-person level.
- Roster: Locals, Retirees, Tourists, Party groups. Groups with leaders, sitting together, mood pull, waiting and leaving rules.
- Sidewalk and entrance threshold: passers-by glance in and step inside or walk past; regulars come on purpose.
- Bets as a fraction of budget with house-money, break-even and hot-machine effects; quit rules and a floor-time budget; ATM curve and an ATM object.
- Continuous intoxication with overshoot; drink servers (trays) and drink policy (price, comps, strength); stagger walk.
- Visit score; thoughts averaged over ~2 days with per-guest wordings; no floor bubbles; red, rarer jackpot notices.
- Money scale: 4 wagers per round, running costs retuned. Save schema 4 (migration from 3). `npm run targets` and `npm run economy` reports.
- Big Floor headless: ~1.9 ms/tick at 5,000 guests (M2.5: ~1.4). Re-run the in-app Perf test on the phone.
- Revisions after the owner's first look: browsing and favorite spots instead of fail counts; drinks in hand, per-bar policy and service areas, server order rounds (trays of 6); guest numbers reframed as sanity checks with levers; realistic Test Floor scenario. Save schema 5.

## M3.1 · Art pass ☑
Type outfits and silhouettes (cheats and chasers never distinguishable), flushed drunk sprites, sidewalk look, and a general art review.
- Style guide and pipeline in docs/spec/art.md ("Velvet Night"): palette ramps, 3/4 view, top-left light, auto outline, value budget, sizes, facings, animation and zoom rules, and an add-an-asset checklist.
- Every sprite redrawn: carpet, walls (interior and exterior faces, autotiled edges), doors, grass, sidewalk, slots (3 facings, lamp chase, scrolling reels), bar with bartender, cage with teller, restrooms, ATM, palm, neon, sign, fountain (animated), stools, litter.
- Paper-doll people with type silhouettes, staff props, drinks in hand, flushed faces, 4-step walk and seated poses.
- Baked contact shadows, wall shadows and light pools; real sprites at Wide zoom; build-menu pictures.

## M4 · Incidents, house rules, authorities ☑  (see docs/spec/incidents.md)
- Incident catalog as data, each from a cause the player can see: drunkenness (loud, stumbling, spills, vomiting, passing out), disorder (arguments that turn into fights, yelling at staff, breakdowns), misconduct (planters), celebration (cheering, buying a round), social (flirting, another round). Vice, underage and drugs deferred.
- Witnesses react by type tolerance; low-drama guests report; a guest with 3 unanswered reports calls the police.
- House rules per category (Ignore / Lenient / Moderate / Strict); security guards warn or throw people out; bars and servers cut off drunk guests; guests mind being policed.
- Police standing and ladder: warning, fines, inspections, raid and closure, license revoked (scenario lost). Officers and paramedics walk the floor. Regulator standing shown (triggers in M9 and M8).
- Drinking fix: trays of 10, servers ask within 6 tiles, the next drink ordered at the last quarter, stronger drink unit; people now actually get drunk.
- Authorities tab, incident art (marks, lying down, scuffles, vomit), guard/officer/paramedic figures, sounds. Save schema 6 (migration from 5).
## M5 · Cheats, suspicion tools, enforcement, luck tags ☑  (see docs/spec/cheats.md)
- Hidden luck (3% lucky, 3% unlucky, exactly ±20 points of payback, shown as winning more or less often) and cheats (~1% of guests, for life; crews). Cheats play honestly between spells of rigged wins and leave once up by their take.
- Caught in the act by guards in view, cameras watched by a surveillance operator in a Back office, or chance; marking makes a catch likelier. A catch is certain, recovers what they were up, and triggers the house treatment.
- Suspicion tools on the guest card (session length, result vs expectation, wallet vs bankroll and ATM, a noisy cheat estimate), tiers set per scenario until the M9 research tree.
- Marking with leave/return alerts; warn, ban (whole group), beating, disappearance by enforcers (guards warn and ban); an Enforcement room hides the dark two; house treatment for first and repeat offenses.
- Consequences: rolling heat, witnesses, company (missing-person reports), innocent targets surfacing as rumors that cost reputation and police standing.
- Cameras, dumpster, enforcer and operator figures, body bag, gun flash, punches, marked-guest ring, sounds. Save schema 7 (migration from 6).
## M6 · Construction: doors, amenities as places, room purposes ☑  (see docs/spec/construction.md)
- Door rules (open, staff only, locked, card holders, dress code, one staff role) and fees, routed for real: one path cache per set of doors a person may pass. Trapped guests are let out by staff after 90 s, at a cost in police standing.
- Sized amenities, dragged out on the floor: bar (stools, lounge tables, bartenders), restrooms (stalls), cage (windows), plus a restaurant, show lounge (scheduled shows, crowd release) and nightclub (cover, dancing). Tiers by size, one finer in a matching room; per-amenity prices.
- Room purposes with effects: high-limit (5× stakes, prestige, privacy), smoking (smoke through walls; smokers with an urge), bar/restaurant/show/club rooms raise their amenity's tier.
- Why guests come: a meal, a show or the club, drawing extra arrivals; fun time counts in the visit score.
- Door, amenity and room cards; drag-to-size building; new art pieces. Test Floor east wing. Save schema 8 (migration from 7).
## M6.5 · Themes, outdoors, land parcels ☑  (see docs/spec/themes.md, docs/spec/construction.md)
- 12 themes with 4 pieces each, hidden pairings, general items and places that suit or clash; theme fields, a curated bonus, muddle, and per-room coherence; guests feel it by type and say so generically.
- Outdoors (always pool weather): pool, garden, patio bar, patio restaurant, sized like indoor amenities; people come for the pool.
- Land parcels bought per scenario (Free Play Lot has two). Save schema 9 (migration from 8).
## M7 · Games catalog and table rules ☑  (see docs/spec/tables.md)
- Video poker, blackjack, roulette, craps, baccarat, poker (rake), keno and bingo, each with exact math checked headless; shared outcomes per table, pool games paying one winner less the house's cut.
- Rules per table (blackjack payout, decks and soft 17; single or double zero; craps odds; baccarat commission; video poker paytables; rake; bingo hold) and limit presets; a high-limit room ×5.
- Dealers (a table opens only with its dealers) and pit bosses (table catches, tagging card counters). Onlookers at craps; the whole table cheers.
- Hidden skill and card counters; rules-aware Locals and a new High rollers type who come for tables. Luck and cheating at every house game.
- Table art generated per rotation, live cards, chips, dice and lit boards; a table card with rules and limits. Save schema 10 (migration from 9).
## M9 · Inside the house: staff, money and risk, whales ☑  (see docs/spec/staff.md, docs/spec/money.md)
- Pay per role (60–160%) sets skill, morale and honesty; no hiring screen. Skill speeds work, walking, dealing and catching; morale follows pay, overwork and fights; miserable staff quit. Patrol zones for janitors, techs, guards and pit bosses.
- Hidden crooks (~5%) skim: techs from hoppers, servers and bartenders drink money, dealers chips, tellers the drawer. Honest guards, pit bosses and watched cameras catch them (fired); crooked watchers look away. The monthly count shows shrinkage per area.
- Gaming tax per scenario and skimming as a dark lever; the regulator's ladder and a visible inspector who audits (skimming, unpaid winnings, weak controls).
- Loans, emergency credit (fee, steep rate, a scandal), unpaid winnings, insolvency; worth net of debt. Jackpot insurance priced at 1.3× the exact expected excess.
- Whales announced 2 days ahead with requests and companions (several months of profit on the line); comps (meal, show, come-back offer) by theoretical loss.
- Finance and Staff tab controls, inspector and whale looks. Save schema 11 (migration from 10).
Whale bankrolls are sized to game money (a variance crisis means several months of the casino's profit), not real-world millions.
## M9.5 · Outside the house: calendar, marketing, research, new crowds ☑  (see docs/spec/calendar.md, docs/spec/research.md)
- A yearly calendar of events (New Year, holidays, spring break, summer, the big game, playoffs, fight nights, conventions, poker tournaments), announced a week ahead, multiplying arrivals by type; seasons per type.
- Marketing campaigns per guest type (1, 3 or 6 months, a monthly fee). A sportsbook (−110 vig, busiest on sports nights).
- Conventioneers (waves with conventions) and Families (children who never gamble or drink, stay with the adults, and sometimes feed a machine: underage gambling).
- Research: monthly funding and a tree of 26 projects (games, amenities, themes, cameras, suspicion tiers, overlays, heatmaps, the player's club, guest breakdowns). The tutorial starts with none; the open scenarios start with every building project.
- Player's club: guest types and value on the card, who's on the floor by type, targeted comps. Research and Policies tabs. Save schema 12 (migration from 11).
- Vice, the hotel elevator and drugs moved to M9.6.
## M9.6 · Vice, drugs, the hotel elevator ☑  (see docs/spec/vice.md)
- A hotel elevator in Free Play and the Test Floor: hotel guests arrive and leave by it; a hotel-room comp.
- Vice and Drugs house rules. Escorts work the floor (more the laxer the rule), pitch guests and may leave with one, up in the elevator for a room fee; hookups in quiet spots; drug use (high: bigger bets, no tiredness; overdoses). Guests react by type; police and reports as for other incidents.
- Staff caught stealing are replaced automatically (owner). Save schema 13 (migration from 12).

## M10 · Audio, music, play-the-games-yourself ☑  (see docs/spec/audio.md, docs/spec/play.md)
- A mixer (master, music, games, floor, crowd, interface, mute) kept on the device. Floor sounds fade with distance and zoom and pan left or right, with a voice cap.
- An ambient murmur follows the crowd in view. Rounds in view make their sounds, plus chimes, glassware and show applause. New game sounds and a bigger win fanfare.
- Generated music from data through a small sequencer: a title screen with the main theme, five nightclub tracks (picked per club, heard from the dance floor), and show-lounge music during shows.
- Play it yourself: slots, video poker, blackjack, roulette, craps, baccarat and keno, full screen, with the object's real rules, paytables and limits, casino cash on an "Owner's play" line, and a guest's odds (checked exactly). No poker, bingo or sportsbook; no vibration.
- Save schema 14 (migration from 13): a hand in progress, a club's track.
## M8 · Slot designer: the designer and the base game ☑  (see docs/spec/designer.md)
Moved after M10 on 2026-09-24. The creative core, RCT's coaster builder for slot machines, in three parts (one chat and release each).
- A design's eight sections: concept (name, theme, symbols), reels (3×1 classic to 6×4 ways; wilds, stacks), money (denomination, bets), math (payback, hit rate, volatility, with a budget bar showing where every point of payback goes), features, jackpots, show (lights, sound, signature call, small-win celebration, near misses, anticipation, roll-up, speed), cabinet (slant, upright, stepper, tall, giant 2×2; colors; toppers).
- Exact math: a closed-form payback budget, base games solved exactly, features exact by construction and drawn step by step, events the play screen shows as drawn. Free spins with every enhancer; fixed jackpots.
- The lab: par sheet, session simulator, **Excitement / Intensity / Drain** ratings from a test panel of the scenario's own guests, panel verdict, a test run with free credits.
- Guests judge designs by what they can feel, never payback directly; excitement buys hold; thoughts name designs. Stock models become designs (calibrated), plus Buffalo-, Cleopatra- and Double Diamond-style stock games.
- Compiled cabinet sprites; a new realistic play-it-yourself slot screen; certification, legal limits, uncertified machines and the inspector; stats and performance index; a design library across saves with share codes; Lucky Dragon and Classic Vegas themes. Save schema 15.
## M8.5 · Slot designer: bonuses and progressives ☑  (see docs/spec/designer.md "As built in M8.5")
- Hold & spin, pick, wheel (and the topper wheel), cascades, collectors, offers, mystery features, each with its own play screen.
- Standalone, linked (banks with a sign of live meters) and must-hit-by progressives; bet eligibility; meters as liabilities; hunters. Onlookers at big bonuses; hidden pairings. Lightning Link- and wheel-style stock games.
- Owner's notes (designer.md, "M8.5 plan with the owner's notes"): linked meters shared by every machine of a design, with a doubling-based pull; what guests think of each game over 6 months; logo fonts and face layout; spaces in names; slam-stop keeps the win; no early reveal of results. Save schema 16.
- Built: every feature with exact math and its own play screen; standalone, linked and must-hit-by progressives (bank signs, hunters, meters in the books); onlookers; wider ratings; a lifetime performance index; five stock bonus games; interface size.
## M8.6 · Slot designer: the market ☑  (see docs/spec/designer.md "As built in M8.6")
- Novelty and ageing, boredom and favorites, floor variety, fans who come for a design; guests' wishes; records and Evergreens; research projects; Test Floor and sanity flags per design. (Slot Expo and rival releases dropped by the owner.)
- Owner's notes (designer.md, "M8.6 additions"): word of mouth (awareness curve, novelty bump, fans, steady state); slot makers' offers to buy your own designs (cash, a share of the edge, royalties with a long tail, wide-area progressives).
- Built: awareness by guest type, novelty, boredom, fans (visitors count too) and their draw, variety, wishes, records, Evergreens, Game launches and Market research, the life curve, offers and sales, Lucky Dragon decor. Save schema 17.
## M11 · Missing features ☑  (owner's notes, 2026-09-25; see DECISIONS)
- Litter halved and litter bins; janitors take the nearest mess; staff of a job spread out; uniform colors per job and a distinct silhouette and prop for every job.
- Dealers come with the tables (in the price, no wages).
- Tap a notice to go to the person or place (or tab) it's about.
- Gentler authorities: faster recovery, one ladder step a week, the license lost only from the top. Uncertified machines found only by sight, warned first; bribes for inspectors and officers where a scenario allows. Save schema 18.
- Cut (owner): design goals, royalty-excluding goals, the high-limit baccarat cheat flag.

## M11.1 · General balance pass ☑  (two chats, owner 2026-09-25; direction in DECISIONS)
**Part 1, the functions ☑** (docs/spec/guests.md "Engagement and draw", themes.md, money.md "Sized to the casino", cheats.md, staff.md)
- Engagement at a game (how well the spot suits the guest + how much they like the game) moves pace, stake, loss limit and time on the floor ("time flies"). Mood from surroundings gains a real upside (+25).
- Draw: each crowd's arrivals follow how well the casino's seats suit it (weighted by the crowd's taste for each game); seats draw only sublinearly.
- Hidden per-crowd theme tastes; theming carries further and through walls, so clashing rooms side by side read as disjointed (owner: one correct casino per crowd, not one room per crowd).
- Crowd noise per room (drink, drugs, dancing) that carries into rooms nearby.
- Fines, bribes and cheats' takes sized to the casino's monthly win; staff theft only in big organizations (owner).
**Part 2, the numbers ☑**: done in the M11.2 chat (below).

## M11.2 · Tutorial rebuild and final balance pass ◐  (owner 2026-09-25; see DECISIONS, docs/spec/economy.md)
- **Tutorial ☑** (owner's vision): 68 machines and no new games; litter and vomit, broken theming, a free strong-drinks bar, fighting regulars and lax rules to fix; starting themes some good and some not; a restaurant ready, shows by research; goal worth $36K with Tourists 55 and Families 50 by the end of Year 2. Machines can be moved. Gentle classics with small jackpots.
- **Owner's playtest ☑:** running costs halved, decor free to keep, security and enforcers merged, entertainers, mini golf, visit to-do lists, doors as signs and remembered places, a crowd survey, faster word of mouth. Save schema 19.
- **Why they come ☑** (owner): arrivals from reasons (gamble, drink, food, shows, club, pool, golf, sights), to-do lists with gambling only when planned, temptation along the way, show prices by worth, winners happy. Save schema 20.
- **Balance ☑:** build prices halved (machines pay back in about a year or less), Free Play guest cap 1,500 (a strong casino in about 2 years), groups wait for each other, luck ±10, restroom search, dark-lever and tutorial reports, multi-seed measurement.
- **Scenario ladder ☐** (FOUNDATIONS §20: early, core, challenge, free play; unlocks; the working titles as real maps with goals). Open: part of v0.8 or after it (DECISIONS, Open).

**After M11.2: alpha build, Casino Tycoon v0.8.**
