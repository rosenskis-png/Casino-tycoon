# Decisions

Newest first. One entry per decision: date, what, why.

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
