# Casino Tycoon: Master Foundations Spec

## 0. How to use this document

- `NORTH_STAR.md` governs intent. This document governs implementation. If they conflict, the North Star wins, and the conflict gets flagged.
- Split this document into `docs/spec/<system>.md` files as systems are built, and keep them current. Record each design decision in the relevant spec file when it is made.
- Numbers are starting points for tuning, not promises. Structure and rules are decisions.
- **[LATER]** marks things deliberately left for a dedicated design discussion. Build the structure they need, but do not invent their content.
- v0.2 (single-file JSX prototype) is reference material, not a codebase to refactor. Port what still fits: the pixel art functions, the field math, the game math, the seat and zone layout logic, the thought system.

---

## 1. Architecture and build

- **Stack:** TypeScript, Vite, React for the interface only, Canvas 2D for the world. The simulation is plain TypeScript with no React or DOM dependencies, so it can later move to a Web Worker.
- **Layers:**
  - `data/`: every game, object, theme, guest type, behavior, incident, staff role, research item, scenario, and sound as data entries.
  - `sim/`: one module per system, each registered on the simulation clock.
  - `render/`: reads simulation state and never writes to it.
  - `ui/`: issues commands only.
- **Commands:** the interface never mutates state. Every player action is a command (`place`, `sell`, `rotate`, `hire`, `setPolicy`, `enforce`, and so on), validated and applied by the simulation. This also enables replays and debugging.
- **Determinism:** a seeded random number generator per scenario, with separate streams per system so adding a system doesn't reshuffle the others.
- **Output:** the build produces a readable source repo and one self-contained `index.html` (inlined through a single-file plugin). Netlify deploys the main branch, and every branch gets a preview URL.
- **Verification:** before each push, run a headless smoke check. It builds, loads in a mobile-sized headless browser, simulates N game days at fast speed across a couple of seeds, and fails on errors, non-finite numbers, broken invariants (seat conflicts, negative inventories, orphaned references), or a save that won't reload. Do not write tests that assert outcomes of random systems. Balance is judged by playtesting.

---

## 2. Time

> Superseded entirely by `docs/spec/clock.md` (2026-09-23): RCT-style calendar, no time of day, event-based play. Kept below for history.

**Two clocks, deliberately decoupled.**
- **Calendar clock:** hours, days, months, and years pass quickly, as in RollerCoaster Tycoon. At slow speed, one game day takes about 2 real minutes. A 3-year scenario takes about 36 hours at slow, 4.5 hours at medium, and 70 minutes at fast.
- **Floor clock:** walking, sitting, dealing, and spinning happen at a readable human pace. A guest visit looks like a few real minutes of activity but covers hours of calendar time. All math for that visit (spins, hands, drinks, spending) is computed for the calendar time it covers.

**Speeds:** pause, slow, medium (about 8× slow), and fast (about 30× slow). The simulation runs on a fixed timestep, and faster speeds run more steps per frame, never larger steps.

**Animation is representational.** Each visible action stands for many simulated events.
- A reel spin represents every simulated spin in its window. It lands on a jackpot only if at least one of those spins was a jackpot. Otherwise it shows a result consistent with the net outcome for that window: a win display on net-positive windows, a loss display on net-negative ones.
- Tables work the same way: one dealt hand represents the hands played in that window.
- Cash, statistics, and reputation are always exact. Animation summarizes but never misrepresents.
- At fast speed, animation may loosen to generic motion at roughly the right tempo while the math stays exact.

**Rhythms:** the calendar hour and day of the week drive arrivals by guest type, staffing needs, events, and incident rates. The day/night cycle is visible through window light and outdoor lighting, and through who is on the floor.

---

## 3. Space and world

- The world is a square tile grid. Each tile holds a terrain type (floor, wall, door, water, unowned) and an indoor or outdoor flag. Where the design allows, a tile holds at most one object's footprint.
- **Walls** occupy whole tiles and can be built and demolished by the player, so partitioning costs floor space. **Doors** are wall tiles guests can walk through, with open, staff-only, and locked states. Scenario walls can be marked permanent.
- **Rooms** are regions of floor enclosed by walls and doors, detected by flood fill whenever the layout changes. The player can name a room (flavor only, used in notifications) and assign it a purpose: general floor, bar, restaurant, high-limit room, club, show room, smoking room, enforcement room, or back office. The purpose drives which guests seek the room, the rules applied in it, and eligibility for its tier bonuses.
- **Outdoors:** tiles outside the building exist only where the scenario provides them. Outdoor areas can hold outdoor amenities such as pools, gardens, patios, outdoor bars, and outdoor restaurants. Weather and season matter outdoors.
- **Land parcels:** unowned land is sold in predefined parcels per scenario. Buying a parcel converts it to owned outdoor land. Some scenarios, such as boats, have none.
- **Entrances:** street entrances, a hotel elevator (guests with different intentions), and event entrances (for example, an arena door that opens on fight nights). The player cannot build entrances unless the scenario allows it.
- **Placement is physical.** Objects have footprints, face a direction, and need access tiles (stools, standing spots, service sides). Access tiles can conflict, so aisle width matters. Tall objects block sightlines.
- **Pathfinding:** cache distance fields, one per important destination type, rather than computing a path for each guest. Invalidate only what a layout change affects. Groups share a leader's path.

---

## 4. Hidden quality fields

Every tile carries values for these qualities, computed from the objects, people, and layout around it:

| Code | Quality | Main sources |
|---|---|---|
| TRF | foot traffic | measured from actual guest movement, smoothed over time |
| NRG | noise and energy | loud games, machines, crowds, music, the club |
| PRS | prestige | finishes, theming quality, fine amenities, high limits |
| PRV | privacy | enclosure, partitions, distance from traffic |
| EXV | exit visibility | line of sight to exits |
| SRV-V | visible surveillance | guards, uniformed staff |
| SRV-H | hidden surveillance | cameras, catwalks |
| CRW | crowding | people density |
| CLN | cleanliness | janitors (raise it); dirt, spills, and vomit (lower it) |
| THM | theme strength | one channel per theme; see section 5 |
| SMK | smoke | smoking-permitted areas |

**Propagation:**
- Each source emits a strength and a radius, and the value fades with distance.
- Sources add together with no upper limit on the field itself. Guests' response to each quality levels off, so stacking has diminishing returns in guest behavior.
- Each wall tile a quality passes through cuts it by a fraction, so it is weakened but never fully blocked.
- Walls completely block line of sight for EXV.
- Fields are recomputed only in regions affected by a change. Crowd-driven fields (TRF, CRW) update on a slow cadence.

**Guest response:**
- Each guest type has a preference curve for each quality: its ideal range, its tolerance, and how much it cares.
- Mood, how long a guest stays, how fast they play, and where they choose to go are driven by the weighted fit between their preferences and the fields where they are.
- The player never sees these numbers. They see symptoms: thoughts, paths, session lengths, spending, and whether guests return.
- Overlays that show the fields are earned through research (section 18).

---

## 5. Theming and decoration

- **Decoration items** each belong to one visible category, either a theme (Pirate, Ancient Egypt, Western, Space, Tiki, and so on, unlocked from the start or through research) or General. Each item emits NRG, PRS, CLN, or THM contributions according to its data.
- **Hidden tags on every item**, never shown to the player:
  - `suitsTheme` / `clashesTheme`: a list of themes, each with a weight.
  - `suitsPlace` / `clashesPlace`: indoor, outdoor, water-adjacent, bar, restaurant, high-limit room, and so on.
- **General items** with `suitsTheme: X` count toward theme X's channel. For example, fountains and ponds suit Pirate and Tiki, and clash with Ancient Egypt.
- **Theme pairs** carry a hidden synergy value in data, positive or negative. When two theme channels are both strong in the same area, the synergy is applied to both.
- **Mixing bonus:** an area where general items reinforce a dominant theme gets an extra "curated" bonus, which rewards creative mixing.
- **Clash penalty:** clashing items reduce both the theme channel and their own contribution.
- **Theme coherence** in each room adds to PRS and to overall mood, weighted by how much each guest type cares about theming.
- **Feedback:** thoughts stay generic ("I love the theming in here" / "I don't like the theming in this area"). A single thought is noise; many in the same room is a diagnosis. Never generate thoughts about specific combinations.

---

## 6. Guests

**[LATER]** A dedicated design discussion will finalize the guest roster and parameter values. Build the structure below.

**Guest types (working roster):**
- Retirees
- Locals and regulars
- Tourists
- Chasers
- Party groups (all women, all men, or mixed)
- Families with kids
- Couples
- Convention and business guests
- High rollers
- Whales, handled as events (section 17)

Non-gambling workers on the floor, such as escorts, are separate from guest types. Underage guests are a behavior some guests have, not a type.

Each type is a data entry with:
- **Arrival curves** by season and event (no time of day; see `docs/spec/clock.md`).
- **Group size and makeup.**
- **Budget:** its distribution, ATM behavior, and credit behavior.
- **Game preferences.**
- **Field preference curves.**
- **Drinking profile:** chance of staying sober, typical drinks, and chance of overdoing it.
- **Incident tendencies** and **tolerance for others' incidents.**
- **Reaction to leniency**, for each house-rule category.
- **Sensitivity to reputation.**
- **Comp appetite.**

**Each individual guest has:**
- A type, a group ID, and an **intention**: gamble, eat, drink, watch a show, club, pass through, or go up to their room. Intentions can shift while they're on the floor ("just one quick spin").
- **Betting behavior:**
  - bet size relative to bankroll
  - **pace** (speed multiplier: fast presser, relaxed, chatting)
  - **quit rule** (a win goal, a loss limit, chasing until broke, or leaving on a jackpot)
  - **comp-seeking** (slow-playing cheap machines for free drinks)
  - willingness to use the ATM and a withdrawal cap
- **Intoxication** (0 to high), which raises bet size, ATM use, and incident chances, and lowers self-control on quitting.
- **Needs:** bladder, hunger, thirst, fatigue.
- **Mood**, from fields, luck, company, service, and incidents they see.
- **Hidden tags:** lucky, unlucky, cheat (section 11).
- **Memory of this visit**, which feeds reputation when they leave.

**Groups:**
- A group moves as a unit, with a leader choosing destinations and members splitting briefly for needs.
- Members affect each other's mood and decisions.
- If one member is harmed, removed, or missing, the rest react. They worry, search, complain, may report it to staff, and may leave.

**Social reactions are driven by behavior, not identity.** Guests react to incidents, noise, mess, and conduct, not to who else is present. Each type has a drama appetite: some want none, most enjoy a little, and some want a lot. Behavioral attraction (for example, flirting or someone buying a round) is modeled as incidents with positive valence for some guest types.

**Thoughts:**
- Generated from each guest's biggest current gap, positive or negative, and from events.
- Collected into a per-day summary.
- On the floor, only bad thoughts and notable good ones get bubbles.

---

## 7. Gaming math and games

- **The math is honest.** Every game has an exact house edge (or rake), volatility, and pace. Simulated outcomes are drawn from the true distribution, per guest, over each simulation window.
- **Lucky and unlucky guests:** rare, and equally common so they cancel out overall. A lucky guest's expected return is shifted to slightly above even (for example, a 90% machine returns about 110% for them), and an unlucky guest's is shifted down by the same amount. Nothing about them is visible.
- **Game catalog (data-driven):**
  - Slots: several stock models plus player designs. Denomination affects pace and appeal.
  - Video poker.
  - Blackjack.
  - Roulette.
  - Craps: loud, social, a crowd magnet.
  - Baccarat: low edge, large swings, wants privacy.
  - Poker room: earns a rake, needs at least two players.
  - Keno and bingo: slow, suited to retirees.
  - Sportsbook: surges tied to events.

  Each game defines its edge, volatility, pace, footprint, access seats, staffing, field emissions, how it appeals to each guest type, and its research gate. Two items that differ only in a number count as one item.
- **Table limits** (minimum and maximum) are set per table. They shape who sits down and cap the house's exposure.
- **Jackpots:** progressives are linked across machines, and a jackpot can be larger than the cash on hand, which triggers credit rules (section 14). Jackpot insurance is an optional policy with a premium.

### 7.1 Slot designer (creative centerpiece)

**Parameters the player sets:**
- Target payback percentage.
- Volatility.
- Hit frequency.
- Losses disguised as wins: how often a loss is celebrated with lights and sound.
- Near-miss display: legal only below a threshold; above it, it counts as rigging.
- Bonus feature style.
- Denomination and maximum bet.
- Cabinet: low or tall, which affects sightlines and NRG.
- Light and sound intensity, which affects NRG.
- Theme, which ties into section 5.
- Name.

**Rules:**
- The designer generates a real pay distribution consistent with the chosen payback percentage, volatility, and hit frequency. The interface keeps those three within feasible combinations.
- Payback below the scenario's legal minimum is rigging, which the regulator detects (section 13).
- **Market judgment:** each guest type has preferences over the design parameters. Some want frequent small wins, some want big volatile swings, some chase themes or noise, some can't stand machines that dress up losses.
- **Machine stats page:** usage, average session length, revenue, results by guest type, and thought mentions. The game never grades the design. Guests do.

### 7.2 Table rules

Rules can be tuned per table:
- Blackjack: 3:2 versus 6:5 payout, number of decks, whether the dealer hits soft 17.
- Roulette: single or double zero.
- Craps: odds multiples.
- Baccarat: commission.
- All tables: limits.

Rules change the house edge exactly. Some guest types notice rules changes and react to them; casual guests don't.

---

## 8. Amenities as places

- **Amenities are zones** the player sizes by dragging, with a minimum of 2×2. Their layout (counter against a wall, seats, tables) is generated from their size. Size determines seat count and tier, for example bar → lounge → grand bar, and snack bar → diner → buffet. Higher tiers raise prestige and prices.
- Guests visibly enter, sit, eat, drink, and watch. Staff (bartenders, cooks) appear in each zone, and their cost is folded into upkeep.
- **Types:** bar, restaurant (in tiers), restroom (stalls hidden inside the building; pricing optional), show lounge (scheduled shows that release crowds all at once), nightclub, high-limit room (a room purpose that raises limits, prestige, and privacy), smoking room or area, cashier cage (with tellers), ATM (fee policy), and outdoor amenities (pool, garden, patio bar and restaurant, fountains and water features).
- Amenities earn money, but mainly they shape traffic, mood, and how long guests stay.

---

## 9. Staff

**Roles:**
- Janitor
- Slot tech
- Security guard: adds visible surveillance and responds to incidents
- Enforcer: carries out enforcement actions
- Drink server: serves guests at machines and tables, which is how non-bar guests end up drinking
- Pit boss or floor supervisor: detection at tables
- Surveillance operator: required for cameras to catch anything in the act
- Cashier
- Dealers, bartenders, and cooks: attached to what they serve

**Each staff member has:**
- An optional patrol zone.
- Skill.
- Morale, driven by wage relative to the market, workload, and incidents.
- Hidden honesty. Dishonest staff skim or steal, and are caught by audits, surveillance, or chance.

All staff are visible on the floor doing their jobs.

---

## 10. Incidents, intoxication, and house rules

**Intoxication:**
- Guests get drinks from bars (guests who intend to drink), drink servers on the floor (anyone they reach), and comps.
- **Drink policy:** strength, price or comped, and number of servers.
- Other substances exist as a category the house can tolerate or crack down on.

**The incident catalog (data)** has a category, triggers, the guest types who cause and who are affected, a valence (positive, neutral, or negative), a field effect (CLN, NRG), an animation, and a ticker text. Starting catalog:
- **Intoxication:** loud and drunk, stumbling, spilling a drink, vomiting, passing out.
- **Disorder:** arguments, fights, yelling at staff, a loser breaking down.
- **Vice:** escorts working the floor (they approach guests and may leave with one through the hotel elevator), drug use, couples hooking up in a quiet corner or out back.
- **Misconduct:** littering, urinating in a planter or trash can.
- **Underage:** a minor trying to gamble or get a drink.
- **Celebration** (positive for most): a big winner buying a round, sharing winnings, cheering, party selfies.
- **Social:** flirting, recruiting others to gamble, drink, or head to the club.

**Frequency:** most of the time, most guests are quietly gambling. Base rates come from the guest mix, intoxication, and leniency.

**House rules (leniency):**
- The player sets strictness per category: strict, moderate, lenient, or ignore.
- Strict means security steps in early, ejects people, and cards guests. That drives off party-minded guests, while families and retirees are unaffected or pleased.
- Lenient raises incident rates and appeals to the party crowd. It drives off low-drama guests and draws police attention.
- Each guest type has a reaction curve for each category.

**Reports and escalation:**
- Low-drama guests who witness incidents report them to staff, which shows up as yellow ticker items.
- Unresolved reports accumulate in each area. Past a threshold, guests call the police: a police visit, a hit to standing, and possibly fines.
- Security responding quickly resolves reports.

---

## 11. Cheats, suspicion, and enforcement

**Cheats:**
- A hidden tag any guest can have, in any group, and visually identical to everyone else.
- Target frequency: roughly 10–50 per scenario depending on its size and length. They are a regular part of play. Each one matters, but no single cheat decides a scenario.
- **Behavior:** a cheat alternates between honest play and cheating spells. While cheating, their expected return is sharply positive and they aim to walk out up by a large amount relative to the casino's scale. They may be in a crew, and may collude with a dishonest dealer. They may or may not return.
- **Getting caught:** each cheating window has a chance of being caught in the act, based on SRV-V plus SRV-H (cameras only count with an operator), pit boss coverage, the guest being marked, and staff skill. A catch is certain and shows a red ticker item.

**Suspicion tools (earned through research, in increasing tiers):**
1. Session length.
2. Win and loss record relative to expectation.
3. Wallet versus arrival bankroll, plus ATM history.
4. An estimated probability that the guest is cheating. It is noisy and capped at about 90–95% unless the guest has been caught, in which case it shows 100%.

Lucky honest guests produce real false positives.

**Marking:** any guest can be marked suspicious. Marked guests get a highlight ring. Options: alert on leaving, and alert on returning. Marking also increases security's attention and the chance of a catch.

**Enforcement:** requires enforcers and a room with the enforcement purpose (a back office or alley). Actions on any guest:

- **Warning:** they're intimidated and released. Minor effect on their mood and on their group's.
- **Lifetime ban:** turned away at the door on future visits.
- **Beating:** enforcers push and punch three or four times, and the guest bends over and walks slowly afterward. About 2 seconds, no blood.
- **Disappearance:** a small pixel gun flashes, the guest falls, is bagged, and is dumped in a dumpster. About 3 seconds, no blood.

**Consequences grow with:**
- How often enforcement happens (a rolling rate).
- Whether the target was innocent (known to the simulation, revealed later through rumors).
- Whether the target had company (the group notices, searches, reports, and leaves upset).
- The target's importance (a VIP or whale).
- Witnesses (visibility from the floor, security presence).

Rare enforcement on a lone guest who really was cheating costs very little. Anything else escalates reputation hits, police standing loss, and rumors on the ticker.

**Internal leakage:** dishonest staff skim from tables and the cage, caught by audits, surveillance, and the regulator.

---

## 12. Dark levers

All of these are supported, effective, and costly:
- Blocking exits: guests stay longer and spend more, but anger builds fast.
- Paid restrooms.
- Routing the only exit past an ATM or a paid show.
- Pushing drinks.
- Rigged machines.
- Near-miss abuse.
- Violence.
- Tolerating vice for profit.

Costs flow through mood, reputation, incidents, and the two authorities. Penalties are heavy but recoverable: reputation and standing recover slowly once the cause is removed.

---

## 13. Authorities

There are two separate standings, each from 0 to 100, which recover slowly over time:
- **Police:** disorder, violence, drugs, underage drinking or gambling, vice, reports that escalate to police calls, and disappearances that get noticed.
- **Gaming regulator:** rigged machines (payback below the legal minimum), illegal near-miss settings, skimming, unpaid winnings, cheating by the house, and failed audits.

**Escalation ladder for each authority:** warning → fines → inspections or visits (the officer or inspector walks the floor as a visible figure) → raids and temporary closures → license revocation or shutdown, which loses the scenario.

**Bribery:** a per-scenario flag that is sometimes available. It costs money, carries a risk of exposure, and has a large penalty if exposed.

---

## 14. Money, risk, and credit

**Units:** US dollars, shown abbreviated ($48.2K, $3.1M). Magnitudes below are superseded by `docs/spec/clock.md`: guest-facing prices look real, casino-level money is tuned game money.
- A tutorial casino has a few hundred thousand dollars.
- Mid-game casinos operate in the millions.
- Empire scenarios operate in the hundreds of millions.
- Equipment prices, wages, and guest budgets are in realistic proportion.
- Whale bankrolls reach seven figures.

**Books:**
- Game results, prices, and wages post continuously.
- Upkeep, loan interest, insurance, marketing, and research are charged monthly.
- The finance screen shows day, month, quarter, and year views with graphs. A quarterly report appears as a ticker item.

**Casino worth** = cash + depreciated value of buildings and equipment + land − debt.

**Credit:**
- **Ordinary loans:** borrow up to a share of casino worth at meaningful monthly interest. Repay at any time.
- **Emergency jackpot loans:** triggered automatically when cash can't cover a payout or obligation. They carry a steep interest rate and fee, and a public scandal that hurts reputation with every guest type.
- **If emergency credit is exhausted,** winnings go unpaid. That is a severe regulator violation and the path to losing the scenario.
- **Losing:** sustained insolvency (debt that can't be serviced), or being shut down by either authority. There is no daily cash check.

**Risk tools:** jackpot insurance, table limits, cash on hand, credit.

---

## 15. Reputation

- **Tracked per guest type** from 0 to 100. It is a slow moving average of how satisfied visits were, weighted toward recent visits. It drives arrival rates and word of mouth.
- **What makes a visit good:** how long a guest's money lasted, how good it felt, and whether their needs were met, not whether they won. A floor that empties wallets too fast raises revenue now and lowers reputation later.
- **Scandals** (emergency loans, exposed violence, raids) cause immediate hits to all guest types, weighted by each type's sensitivity.
- **Pivoting:** reputation moves slowly, so changing target markets is a costly commitment with a weak stretch in the middle.

---

## 16. Policies, marketing, and comps

**Policies:**
- Prices: food, drinks, restrooms, ATM fees.
- Drink policy (section 10).
- Comp budget and rules: drinks, meals, and room offers by how much a guest plays.
- House rule leniency (section 10).
- Table limits and rules.
- Jackpot insurance.
- Smoking policy per room.

**Marketing:** campaigns aimed at specific guest types (bus tours, college promotions, mailers to high rollers, a convention partnership). They cost money monthly, have a duration, and raise that guest type's arrivals. Their effect is visible in the guest mix.

**Player's club:** researched. It reveals guest types and each guest's value in the inspector, and enables targeted comps.

---

## 17. Whales and high rollers

- **Whales arrive as events**, announced on the ticker, often with an entourage. They have preferences and requests: a private table, particular limits, a game, a drink, privacy, a type of show.
- **Meeting them is always optional.** If their requests go unmet, they simply leave sooner. There is no reputation penalty. The player just loses their potential losses, and their potential wins.
- Their bankrolls are large enough that a good night for a whale is a real variance event for the casino.

---

## 18. Research and information

- **Monthly research funding** (a slider).
- **Research categories:** games, amenities, themes, staff tools, and information.
- **Information research:**
  - Field overlays for noise, traffic, prestige, privacy, exit visibility, surveillance, cleanliness, and theme.
  - Suspicion tools (section 11).
  - The player's club.
  - Guest-type breakdowns on stat pages.
  - Heatmaps of revenue and guest time spent.

Information is a resource: the player starts with symptoms only.

---

## 19. Calendar and events

- Arrival curves by season and holidays (no time of day; see `docs/spec/clock.md`).
- **Scheduled events:** shows, fight nights, conventions, tournaments, sports events (surges at the sportsbook), and holidays. They are announced in advance on the ticker so the player can prepare staffing and layout.
- Some events are scenario-specific (for example, the arena next door).

---

## 20. Scenarios and progression

> Scenario lengths, population sizes, and money magnitudes superseded by `docs/spec/clock.md` (2026-09-23).

- **Structure:** a few scenarios are open at the start, and completing one unlocks the next. Tiers: early (small, few tools, teach reading symptoms), core (each built around one or two psychology ideas, each with a tempting wrong move that visibly fails), challenge (gimmicks, reversed incentives, extreme scale), and free play (open lot, adjustable conditions).
- **Goals:** most scenarios have both a money goal (cash or worth, at a date) and a reputation goal (overall or for one guest type; checked at a date or held above a threshold over a window of months). Either may be the hard one. Challenge scenarios may use different goals.
- **Scenario data:**
  - map and parcels
  - entrances
  - allowed tools and research tree
  - guest population and mix
  - legal limits (minimum payback, near-miss rules)
  - bribery flag
  - event calendar
  - starting cash, debt, and objects
  - goals
- **Size and length:** tutorial-size maps are about 3× the v0.2 lot, with about 3× the guests. The largest maps are about 20× that or more. Scenarios last from about 6 months to about 3 years.
- **Working titles carried over from v0.2 [LATER]:**
  - The Lucky Horseshoe (tutorial, a locals casino)
  - Boardwalk Frontage
  - Sundowner Club
  - The River Belle (boat, no outdoor space)
  - The Labyrinth
  - Convention Row
  - Big Top Family Resort
  - Fight Night
  - The Pit
  - Salon Privé
  - The Pivot
  - Challenge concepts: a private-equity bust-out, a mob front, a heist
- **The tutorial must teach symptom-reading:** noticing thoughts, noticing patterns across many guests, and using stat pages. It does this through its setup, not through text walls.

---

## 21. Interface (phone first)

- **Top bar:** cash, date and time, and speed controls (pause, slow, medium, fast).
- **Ticker:** a single, always-visible strip directly below the top bar. With nothing to show, it is black with a thin frame in the top bar's color.
  - Text color by importance: yellow for most messages, red for urgent bad news, green for good news. No bold, flashing, or motion effects.
  - Each item shows for at least 1 second and at most 10 seconds.
  - A new item replaces the current one after that item's 1-second minimum. Backlogged items queue, each showing for 1 second, until the queue clears.
  - Red items jump the queue and show for the full 10 seconds. Red is reserved for truly important events.
  - A log button at the right end opens the full log: every item from the last 30 game days, newest first, including items still queued. Opening the log clears the queue. Items older than 30 days drop off.
  - Keep notifications scarce by design, and merge repeats ("3 reports near the bar").
- **Main tabs:**
  - Build: floor, walls, rooms, games, amenities, decoration by theme, outdoor.
  - Staff.
  - Policies.
  - Research.
  - Finance.
  - Guests: list, thought summary, per-type reputation.
  - Authorities.
  - Scenario goals.
- **Inspector:** tap a guest, object, room, or staff member. Guests show visible information and enforcement actions. Objects show their stat page, rotate, sell, and "play" (section 23). Rooms show name, purpose, and a summary.
- **Zoom:** four levels. 1× is close up, for one table or incident. 2× is the default. 4× is a wide view. 8× is an overview, where precise building is not expected.
- **Build interactions:** tap to place, drag to size zones and walls, rotate, and a ghost preview showing footprint, access tiles, and cost.
- **Touch targets** are sized for thumbs. The game world is always the focus of the screen.

---

## 22. Rendering, art, and audio

- **Pixel art** at 16 pixels per tile, scaled up without smoothing. Carry over the v0.2 art direction: patterned carpet, brass, felt, neon, sprites with a 4-direction walk, sitting and drinking poses, reels, dealt cards, a roulette wheel, zone interiors, and visible doors.
- **Everything visible:** every mechanic has an on-floor representation, including incidents, enforcement, staff at work, crowds released from shows, and inspectors on the floor.
- **Tone:** plain and unsoftened. Small, quick, low-resolution animations with no gore, no nudity, and no lingering on suffering. Escorts wear revealing outfits at pixel scale. Hookups are a few seconds of kissing followed by a clothed standing animation.
- **Performance:**
  - Static layers (floor, walls, fixed decoration) are drawn once into cached chunks and redrawn only when changed.
  - Level of detail by zoom: at 4× and 8×, people become simplified sprites or dots and fine animation stops.
  - Only on-screen objects are animated.
- **Audio:**
  - An ambient floor sound that scales with NRG near the camera.
  - Sounds for each game (reels, dice, cards, chips).
  - Jackpot fanfares, crowd noise, incident sounds, and interface clicks.
  - Master and category volume controls, and mute.
  - Haptics on jackpots and placements where supported.

---

## 23. Playing the games yourself

- Any game except player-versus-player games can be played by the player from its inspector. This excludes the poker room.
- Actual bet sizes, limits, rules, and payouts apply, with real game visuals shown full screen. Stakes come from and go to casino cash.
- Not available while paused. The casino keeps running in the background at the chosen speed. The mini-game runs at its own pace, unaffected by the simulation speed.
- The ticker stays visible. Management controls are unavailable while playing.

---

## 24. Saves

- Saves use a versioned schema with a migration chain, autosave, and manual saves. Each scenario has its own progress.
- v0.x prototype saves do not carry into the new engine. Every release from the first new-engine build onward carries saves forward.

---

## 25. Suggested build order

1. **Engine skeleton:** clock, commands, data loading, grid and walls, rooms, fields, distance-field pathfinding, renderer with chunk cache and zoom levels, ticker and log, save and migration, smoke check.
2. **Vertical slice on a tutorial-size map:** slots, bar, restroom, cage, janitors and techs, basic guest types with the section 6 structure, thoughts, finance, a money and reputation goal.
3. **Guest model depth** (after the dedicated guest discussion): groups, intentions, betting behavior, intoxication.
4. **Incidents, house rules, authorities.**
5. **Cheats, suspicion, enforcement, luck tags.**
6. **Construction and outdoor space, land parcels, theming.**
7. **Games catalog and table rules.**
8. **Slot designer.**
9. **Staff depth, policies, marketing, comps, whales, events, research tree.**
10. **Audio, playing the games yourself.**
11. **Scenarios, then balance through playtesting.**

## 26. Open design discussions

- **Guest model:** roster, parameter values, drinking profiles, drama appetites.
- **Per-system detail as each is reached:** incident catalog specifics, suspicion tool tiers, theme list and synergy table, games catalog specifics, slot designer interface, staff roster details, phone interface layout, scenario designs and tutorial, art and audio direction.
- ~~Whether every visible guest is one real guest~~ Decided 2026-09-23: yes, at all scales (iPhone perf test; see DECISIONS).
