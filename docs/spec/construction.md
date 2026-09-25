# Construction: doors, amenities as places, room purposes (M6)

FOUNDATIONS §3 (space), §5 (theming), §8 (amenities as places). NORTH_STAR "Amenities as places", "Shaping the
space", "Dark levers". Owner decisions 2026-09-24 (DECISIONS.md). M6.5 adds themes, outdoor amenities and land
parcels (below; themes in docs/spec/themes.md).

## Walls, extensions and entrances (hotfix, 2026-09-24)
- Every wall and door is the player's: the building's shell and the scenario's doors can be demolished, and doors
  go in any wall. Saves from before still mark the shell `fixed`; walls and doors ignore that flag.
- **Indoors is derived:** floor the open air can't reach. After every wall, door or demolish, a flood from unowned
  land, the sidewalk and the map edge runs through everything but walls and doors (`recomputeOutdoor` in
  `src/sim/map.ts`); what it reaches is outdoors. Walling in lot ground makes an extension (indoors, carpet); a hole
  from a room to the lot makes that room outdoors until it's closed again. Doors count as closed.
- **Entrance** (Build, $250 a tile; M11.2 halved every build price, docs/spec/economy.md): a new way in from the street on owned outdoor ground beside the sidewalk.
  Passers-by glance in there and regulars may use it. Entrances can't be removed. They draw as a paved apron.
- The hotel elevator, water, the sidewalk and unowned land stay fixed.
- **Move (M11.2):** any fixed-size object (not a sized amenity) can be picked up and put down elsewhere from its
  card, for $50: its footprint follows the finger, Rotate turns it. It keeps its record (stats, design, meters) under
  a new id, so anyone playing or walking to it treats it as gone, as when it's sold. Built for the tutorial, where
  the machines can't be replaced.

## Doors (`setDoor`)
Tap a door to open its card. Entrances (street and elevator) can't be changed.

| Rule | Who passes |
|---|---|
| Open | everyone |
| Staff only | all staff, police and paramedics, and guests being escorted; never escorts (Batch A, owner: they use any door a guest could, and pay no fees) |
| Locked | nobody |
| Card holders | staff (as above) and returning guests (people who have visited before). With the player's club (M9.5 research) the door reads "Club members"; members are still returning guests. |
| Dress code: *type* | staff (as above) and guests of one type. Types already look different; the card names the look ("Locals"). |
| One staff role | only that role (e.g. enforcers only) |

- **Fee** (guests only, $0–$20; not on Locked or staff-only doors): paid each time a guest walks through, booked
  as "Door fees". Paying annoys a guest in proportion to the fee against their visit budget ("Paying to use a
  door?!"). A guest who can't pay can't pass.
- **Routing:** every rule is real pathfinding. People who can't pass a door route around it or, when there's no
  way around, can't get there. Guests search and give up on needs as before (docs/spec/navigation.md).
- **Trapped guests:** someone with no way out they're allowed through (a fee they can't pay on the only exit, a
  dress-code door that isn't theirs) is trapped, and angry. After 90 seconds staff let them out, if any route out
  exists past unlocked doors: from then on they pass any door except locked ones, without paying. Each guest let
  out this way costs 1 point of police standing (a complaint). Walls are walls: behind locked doors or walls
  they stay trapped, as before (docs/spec/navigation.md).
- Whoever is standing in a doorway can always step off it (a guest who paid the fee and can't afford it again
  isn't stuck in the door).
- **Sight:** any door that isn't Open blocks sight, like a closed door today.
- **Pathfinding (engine):** each rule set is a separate walkability layer. People who can pass the same set of
  restricted doors share one `PathCache`. With no restricted doors, one cache serves everyone, as before.
  Restricted doors are few, so working out each person's key is cheap. The memory budget is split across the
  caches.

## Amenities as places (sized)
Drag out a rectangle with an amenity tool. Rotation sets which side faces front. Layout, seats, staff, cost,
upkeep and tier all come from the size (`src/data/amenities.ts`). Bartenders, cooks, tellers, performers and the
DJ are part of the amenity: they are drawn, and their pay is folded into upkeep (§8).

| Amenity | Size (front × depth) | Layout (row 0 is the back) | Seats | Tiers by seats |
|---|---|---|---|---|
| Bar | 3–12 × 2–6 | counter with bartenders (1 per 4 tiles); a stool row; deeper rows are lounge tables and chairs | stools + chairs | Bar · Lounge (8+) · Grand bar (16+) |
| Restrooms | 2–8 × 2–5 | closed block; stalls open off the front edge | ⌊area/2⌋ stalls | Restrooms · Lounge restrooms (6+ stalls, attendant) |
| Cashier cage | 2–8 × 1 | one window and teller per tile | windows | none |
| Restaurant | 3–12 × 3–10 | kitchen counter with cooks; rows of tables and chairs with aisles between | chairs | Snack bar · Diner (8+) · Buffet (20+) |
| Show lounge | 4–14 × 4–12 | stage (2 rows) with performers; rows of chairs, with an aisle every 5 | chairs | Lounge · Showroom (24+) · Theater (60+) |
| Nightclub | 4–14 × 4–12 | DJ booth and speakers; the rest is dance floor | dance spots | Dance hall · Club (16+) · Superclub (40+) |

- Each tier up raises the amenity's prestige emission, and raises the price guests accept before complaining by
  25%.
- **Bar:** as before (docs/spec/guests.md §Drinks), at any seat. Bartenders speed servers' pickups (pickup time
  ÷ bartenders).
- **Restaurant:** serves hunger. A meal takes 40–80 s, costs $18 × the price multiplier, costs the house $6
  ("Food costs"), resets hunger, eases fatigue by 20, and adds 2 minutes to the guest's planned floor time
  (fed guests stay longer). Guests go when hunger ≥ 70 and they have the money.
- **Show lounge:** a show every 100 s (offset per lounge), lasting 45 s. Guests take seats up to 30 s before it
  starts; when it ends, everyone gets up at once (a crowd release). Ticket $0–$40 (default $0). Watching eases
  fatigue by 40 and lifts the mood.
- **Nightclub:** dance 45–120 s. Cover charge $0–$40 (default $10), paid on entry. Strong NRG, and dancing makes
  guests thirsty. Party guests love it; quiet types feel it through the walls.
- Cage windows and restroom stalls work as before; more of them means shorter lines.
- **Prices** are per amenity (tap it): price multiplier (restaurant), ticket (show), cover (club), plus the bar's
  drink policy. Sales book as "Food sales", "Show tickets" and "Cover charges".

## Why guests come (intent)
- On arrival, some people come *for* something the casino has: a meal, a show, the club (`comeFor` per type).
  They head there first. They don't sightsee first, they know roughly where it is (straight-line guessing
  toward the nearest one, so a maze still defeats them), and they search 6 hops longer before giving up.
  Afterwards some gamble with what's left ("Might as well try my luck"). A group shares the leader's reason.
- Amenities also draw extra arrivals: each kind the casino has adds `comeFor` × (1 + 0.25 × tier) to the type's
  arrival rate (new arrivals and walk-ins).
- **Visit score:** time at a meal, a show or dancing counts as time well spent, next to play time. Value =
  (play + fun seconds) ÷ (money lost + spent on amenities) against `secPerDollar`. A trip with under 30 s of
  either is wasted.

| comeFor | Locals | Retirees | Tourists | Party |
|---|---|---|---|---|
| Meal | 0.12 | 0.20 | 0.15 | 0.05 |
| Show | 0.05 | 0.20 | 0.20 | 0.10 |
| Club | 0.02 | 0 | 0.10 | 0.45 |

## Room purposes (`src/data/rooms.ts`)
A purpose is set on the room card. Effects:
- **General floor:** none.
- **Bar / Restaurant / Show room / Club:** an amenity of that kind inside is one tier finer than its size
  alone would make it.
- **High-limit room:** machines inside take 5× the stakes (the minimum and maximum bet per wager; the paytable is
  unchanged). Adds prestige and privacy throughout the room. Guests only sit there if their usual stake covers
  the minimum. Big bankrolls like it; small ones feel out of place.
- **Smoking room:** smoke throughout the room, leaking through walls and doors. Smokers (a per-person trait:
  Locals 25%, Retirees 15%, Tourists 15%, Party 35%; drawn on their own `smokers` stream) feel the urge build to
  must-smoke about every 4½ minutes. They satisfy it in a smoking room (stay 20 s, or just light up where they
  sit if they're already inside) or out on the lot, if they can get there; butts end up on the floor outside.
  If there's nowhere, they grow annoyed ("I need a smoke") and cut the visit short (90 s more at most). Non-
  smokers dislike smoke past a low tolerance (the SMK taste, a penalty only, so clean air changes nothing);
  smokers barely mind it.
- **Enforcement room, Back office:** as in M5 (docs/spec/cheats.md).

## Saves (schema 8)
- Sized amenities store `w`, `h` (in their own frame: front width × depth). Other objects don't.
- Old bars (3×1 counter plus a stool row in front) become 3×2 bar areas covering the same tiles; seats keep their
  order. Restrooms and cages keep their shape.
- Per-amenity prices (`price`) on restaurants, shows and clubs. Door rules and fees in `map.gates`.
- Guests: new intents, `smoker`, `urge`, `esc` (let out by staff), and `mem.fun` / `mem.spent`.

## Engine notes
- `Game.walkable(i)` is now physical walkability (floor, or any door that isn't locked). Who may pass a door
  is the path cache's business: `Game.pathsFor(agent)` (people), `Game.publicPaths` (nobody in particular),
  `Game.canWalk(agent, i)` (a single step, for wayfinding's sight lines).
- Sized amenities: `src/sim/layout.ts` builds cells (blocking or walkable), seats and staff spots from the size,
  memoized; `src/sim/geometry.ts` rotates them (`objCells`, `objSeats`, `objStaff`, `priceOf`, `seatCount`).
  Seats may lie on the amenity's own walkable cells; restroom stalls and cage windows sit off the front edge as
  before (several stalls can share a tile).
- Amenity helpers in `src/sim/amenities.ts`: tiers, prices, the show schedule, room purposes, the arrival pull
  and intents, and the high-limit stake multiplier (a runtime cache per room list).
- Fields: sized amenities give off more with size (strength × √(area ÷ default area), radius +½ per extra tile,
  capped at 10) and +1.5 prestige per tier; room purposes add sources on a 3-tile grid (smoke 2 / radius 4;
  high-limit prestige and privacy 1.2 / radius 4).

## Measured (Test Floor, `npm run targets`, 300 days, seed 1)
The Test Floor gained an east wing (M6): a high-limit room beside the quiet back room, a 9×7 show lounge
("Theater"), a 9×5 club ("Superclub") with restrooms, then a restaurant ("Buffet") with restrooms, a smoking
room of slots, and a card holders' bar ("Grand bar") behind a card door; the office and enforcement room doors
are staff only.
- Came for a meal / show / club: Locals 16/5/3%, Retirees 18/18/0%, Tourists 12/23/9%, Party 1/3/39%.
- Had some fun (a meal, a show, dancing): 18% / 32% / 39% / 42% of guests, about a minute each.
- 300 days: 220 meals, 308 show seats filled, 282 dances; food $4.1K (cost $1.4K), cover $2.9K; 23% smokers.
- Reputation after 300 days: Locals 63, Retirees 60, Tourists 54, Party 52 (M5 on the old Test Floor: 63 / 58
  / 48 / 46). No sanity flags.
- The diner sits two rooms deep: about a quarter of the people who come for a meal give up finding it, which
  is the maze working as designed.
- Big Floor steady state (5,000 guests): ~2.3 ms/tick (m5: ~2.1). Much of the difference is smokers walking out
  to the lot.
- Fixed on the way: a sign blocked the Test Floor's office door since M5, so its surveillance operator never
  reached the desk (camera catches were never measured there). It now watches.

## Outdoors (M6.5)
Always hot and sunny: no weather or season effects (owner). Outdoor amenities are sized like the indoor ones
and go only on outdoor ground.

| Amenity | Size | Layout | Seats | Tiers |
|---|---|---|---|---|
| Pool | 4–14 × 3–10 | loungers on every other tile of the back row (deck between), water with a deck edge either side, a lifeguard | loungers + swimmers | Pool · Pool deck (20+) · Lagoon (50+) |
| Garden | 4–12 × 3–10 | hedges round the back and sides, a path up the middle and along the open front, benches beside the path, flower beds | benches | Garden · Formal garden (10+) |
| Patio bar | 3–12 × 2–6 | a bar, tables under umbrellas | as the bar | Patio bar · Beach bar · Grand patio |
| Patio restaurant | 3–12 × 3–10 | a grill, tables under umbrellas | as the restaurant | Snack shack · Terrace · Terrace grill |

- **Pool:** some people come for it (`comeFor.pool`: Locals 3%, Retirees 5%, Tourists 15%, Party 20% of the
  pull). A swim (60–120 s) is fun and a little tiring; a lounger rests the feet (fatigue −30). Entry $0–$20
  (default free), paid once a visit ("Pool entry").
- **Garden:** guests with sore feet (fatigue ≥ 70, after trying a show) sit on a bench for 30–60 s (fatigue
  −40). Free. Gives off prestige, privacy and a little cleanliness.
- Patio bars and restaurants work exactly like the indoor ones; their servers work the grounds (an outdoor
  area is a room).
- Guests on the grounds head back inside through the nearest door they can see.

## Land parcels (M6.5)
- A scenario lists parcels (`parcels` in `src/data/scenarios.ts`): name, rects, price. Unowned tiles in them
  show a faint gold border and a For Sale sign.
- **Buy** from Build → Land, or by tapping the land: its unowned tiles become owned outdoor ground (buildable,
  not fixed); "Land" in the books. Land counts toward worth at what was paid.
- Free Play Lot has two: East lot (12×108, $6K) and Far east lot (12×108, $4.5K; M11.2 halved). Since the hotfix of 2026-09-24
  the Free Play map is 184×112 with 156×108 of owned lot (about 8× the old one) around the same building. Saves
  from before keep their own map and street; lots that don't fit a save's map aren't offered.
- Saves: schema 9 adds `parcels` (ids bought).
- **Deferred to M9:** Families (they bring minors and underage incidents) and the hotel elevator, with vice.

## Show tickets (M11.2)
Ticket $0–$100 (was $0–$40). How much a crowd wants to come for the show falls with the price against what a show is
worth to them (docs/spec/guests.md "Why they come").

## Mini golf (M11.2, owner)
- A sized amenity, indoors or out (4×3 to 12×10; $600 + $40 a tile; upkeep $10 + $0.50 a hole): putting greens
  round a windmill, a hole (a player's spot) every third tile. Tiers Putt-putt and Adventure golf (12 holes).
  A round takes 40–70 s, a ticket per round ($0–$20, default $6; over $10 × the tier's tolerance is "steep").
  Fun time the whole round, a lift after. Pull (`comeFor.golf`): families 0.6, tourists 0.15, party 0.1, a little
  for the rest, none for high rollers. Suits Pirate, Medieval and Tiki; outdoors. Research: Mini golf ($1,000);
  unlocked in the tutorial. On the Test Floor's front lawn.
