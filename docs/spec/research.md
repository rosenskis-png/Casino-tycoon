# Research, information and the player's club (M9.5)

`src/data/research.ts`, `src/sim/research.ts`, the Research tab. FOUNDATIONS §18, §16. All numbers are starting values.

## Funding and projects
- **Monthly funding** (Research tab): $0, $250, $500, $1,000 or $2,000 a month, accrued like wages (a ledger line). Each dollar is a research point.
- The player picks the **project**; points go into it until it's done (on the ticker), then into the next one in the **queue** (Batch A): tap a project to research it now, or to queue it behind the current one; tap again to take it off. A queued project whose prerequisites aren't done yet waits its turn.
- (Batch A, owner) **No project, no spending:** funding only goes out while something is being researched.
- Projects need their prerequisites. Each scenario lists what it starts with: the Lucky Horseshoe starts with none; Free Play, the Test Floor and the Big Floor start with every building project (games, amenities, themes, staff tools), not the information ones.

## The tree
Costs halved in M11.2 (the money scale, docs/spec/economy.md), and **halved again in Batch A** (owner: too expensive and slow): the table lists the M11.2 costs; the game charges half (`COST_SCALE` in `src/data/research.ts`).

| Category | Project | Cost | Needs | Unlocks |
|---|---|---|---|---|
| Games | Table games | $1,500 | | blackjack, roulette |
| Games | Craps and baccarat | $2,500 | Table games | craps, baccarat |
| Games | Poker room | $2,000 | Table games | poker |
| Games | Keno and bingo | $1,500 | | keno, bingo |
| Games | Video poker | $1,000 | | video poker |
| Games | Sportsbook | $2,000 | | sportsbook |
| Games | Big-jackpot slots | $1,250 | | Thunder Jackpot |
| Amenities | Restaurant | $1,500 | | restaurant, patio restaurant |
| Amenities | Show lounge | $2,500 | Restaurant | show lounge |
| Amenities | Mini golf (M11.2) | $1,000 | | mini golf |
| Amenities | Nightclub | $2,500 | | nightclub (id `nightclub`; M11.4 fixed it sharing `club` with the player's club, which let nightclubs skip research) |
| Amenities | Outdoors | $3,000 | | pool, garden, patio bar |
| Themes | Old Vegas | $1,500 | | Rat Pack Lounge, Neon Atomic, Gold Rush |
| Themes | Ancient worlds | $1,500 | | Ancient Rome, Ancient Egypt, Medieval |
| Themes | Luxury | $2,000 | | Gilded Deco, Modern Luxe, Riviera, Lucky Dragon (its decor since M8.6) |
| Themes | Just for fun | $1,500 | | Tropical Tiki, Pirate Cove, Rock & Roll |
| Games | Game launches (M8.6) | $1,500 | | a new game you place starts known to a quarter of your guests, not a handful |
| Staff tools | Cameras | $1,500 | | cameras |
| Information | Suspicion tools 2 / 3 / 4 | $1,000 / $2,000 / $3,000 | the tier before | one more suspicion tool tier (above the scenario's own) |
| Information | Crowd maps | $1,250 | | overlays: foot traffic, crowding, noise and energy |
| Information | Style maps | $1,250 | | overlays: prestige, privacy, smoke |
| Information | Security maps | $1,250 | Cameras | overlays: visible and hidden surveillance, exit visibility |
| Information | Cleanliness map | $750 | | overlay: cleanliness |
| Information | Heatmaps | $1,500 | | revenue and play-time heatmaps over the games |
| Information | Player's club | $2,500 | | the club (below) |
| Information | Guest breakdowns | $1,500 | Player's club | machine and table stats by guest type |
| Information | Market research (M8.6) | $1,500 | | each design's awareness and fans by guest type; what each type wishes the floor had |

- Anything not in the tree (slots Cherry Parade and Liberty Bell, the bar, restrooms, cage, ATM, plain decor, signs, dumpsters) is always available. A locked item shows in the Build menu with its project's name and can't be placed. Already-placed items stay.
- Overlays are chosen in the Game tab; the Debug view still shows everything.

## The player's club
- Reveals guest types: the guest card names their type and what they're worth to the house (their theoretical loss this visit), and the Guests tab counts who's on the floor by type.
- Card holders are members from now on (returning guests, as before; the door reads "Club members").
- Targeted comps: each comp can go to everyone or one type (Policies tab).

## Save
Schema 12: state gains `research` (funding, project, points per project, done list).
