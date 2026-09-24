# Construction: doors, amenities as places, room purposes (M6)

FOUNDATIONS §3 (space), §5 (theming), §8 (amenities as places). NORTH_STAR "Amenities as places", "Shaping the
space", "Dark levers". Owner decisions 2026-09-24 (DECISIONS.md). M6.5 adds themes, outdoor amenities and land
parcels (below).

## Doors (`setDoor`)
Tap a door the player built to open its card. Scenario doors and entrances can't be changed.

| Rule | Who passes |
|---|---|
| Open | everyone |
| Staff only | all staff, police and paramedics, and guests being escorted |
| Locked | nobody |
| Card holders | staff (as above) and returning guests (people who have visited before). M9's player's club replaces "returning" with membership. |
| Dress code: *type* | staff (as above) and guests of one type. Types already look different; the card names the look ("Locals"). |
| One staff role | only that role (e.g. enforcers only) |

- **Fee** (guests only, $0–$20; not on Locked or staff-only doors): paid each time a guest walks through, booked
  as "Door fees". Paying annoys a guest in proportion to the fee against their visit budget ("Paying to use a
  door?!"). A guest who can't pay can't pass.
- **Routing:** every rule is real pathfinding. People who can't pass a door route around it or, when there's no
  way around, can't get there. Guests search and give up on needs as before (docs/spec/navigation.md).
- **Trapped guests:** someone with no way out they're allowed through (a fee they can't pay on the only exit, a
  dress-code door that isn't theirs) is trapped, and angry. After 90 seconds staff let them out: from then on
  they pass any door except locked ones, without paying. Each guest let out this way costs 1 point of police
  standing (a complaint).
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
  They head there first. Afterwards some gamble with what's left ("Might as well try my luck").
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
  Locals 25%, Retirees 15%, Tourists 15%, Party 35%) get an urge every 3–6 minutes. They satisfy it in a smoking
  room (stay 20 s, or keep playing if they're already inside) or outdoors, if they can get there. If they can't,
  they grow annoyed ("I need a smoke"), and leave early at the end. Non-smokers dislike smoke (the SMK taste);
  smokers barely mind it.
- **Enforcement room, Back office:** as in M5 (docs/spec/cheats.md).

## Saves (schema 8)
- Sized amenities store `w`, `h` (in their own frame: front width × depth). Other objects don't.
- Old bars (3×1 counter plus a stool row in front) become 3×2 bar areas covering the same tiles; seats keep their
  order. Restrooms and cages keep their shape.
- Per-amenity prices (`price`) on restaurants, shows and clubs. Door rules and fees in `map.gates`.
- Guests: new intents, `smoker`, `urge`, `esc` (let out by staff), and `mem.fun` / `mem.spent`.

## M6.5 (next): themes, outdoors, parcels
- **12 themes:** Ancient Rome, Ancient Egypt, Medieval, Rock & Roll; luxury: Gilded Deco, Modern Luxe,
  Riviera; old Vegas: Rat Pack Lounge, Neon Atomic, Gold Rush; plus Tropical Tiki and Pirate Cove. About 4
  decor pieces each; general decor quietly counts toward the themes it suits.
- **Hidden theme pairings.** Good pairs: Rome + Riviera, Rome + Egypt, Deco + Rat Pack, Tiki + Pirate,
  Tiki + Neon Atomic, Rock + Neon Atomic. Clashes: Egypt + Medieval, Rock + Modern Luxe, Gold Rush + Riviera,
  Medieval + Neon Atomic. Everything else is neutral. THM channels, a curated bonus, clash penalties and
  per-room coherence follow §5.
- **Outdoors:** always hot and sunny, pool-party weather (no weather or season effects). Pool, garden, patio bar
  and patio restaurant as sized amenities.
- **Land parcels:** bought per scenario, turning into owned outdoor land.
- **Deferred to M9:** Families (they bring minors and underage incidents) and the hotel elevator, with vice.
