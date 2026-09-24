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
## M9 · Inside the house: staff, money and risk, whales ☐  (skills 3 and 4: leaks and variance)
- Staff depth: skill, morale (wage vs market, workload, incidents), hidden honesty, patrol zones; hiring from candidates.
- Staff theft as leakage (bartender, teller, dealer collusion with a cheat, tech rigging for a friend), found by audits, cameras, pit bosses or chance; shrinkage shows in the books.
- Gaming regulator ladder with a visible inspector: skimming, unpaid winnings, failed audits.
- Credit: ordinary loans, emergency jackpot loans (a scandal), unpaid winnings, insolvency as a way to lose; worth net of debt. Jackpot insurance.
- Whales as announced arrivals with an entourage and requests; comps by how much a guest plays.
Whale bankrolls are sized to game money (a variance crisis means several months of the casino's profit), not real-world millions.
## M9.5 · Outside the house: calendar, marketing, research, new crowds ☐  (skills 1 and 5: the market and the calendar)
- Seasons and scheduled events (conventions, fight nights, tournaments, holidays, sports) announced ahead; a sportsbook.
- Marketing campaigns per guest type; Conventioneers and Families (minors, underage incidents).
- Research: monthly funding, a tree across games, amenities, themes, staff tools and information (overlays, suspicion tools, heatmaps, stat breakdowns); the player's club (reveals types, targeted comps, real card holders).
- Hotel elevator with vice, and a drug policy (first to cut if the milestone runs long).
## M10 · Audio, play-the-games-yourself ☐
## M8 · Slot designer ☐  (moved after M10 on 2026-09-24; readiness notes in DECISIONS)
## M11 · Scenarios, tutorial, balance ☐
