# Research, information and the player's club (M9.5)

`src/data/research.ts`, `src/sim/research.ts`, the Research tab. FOUNDATIONS §18, §16. All numbers are starting values.

## Funding and projects
- **Monthly funding** (Research tab): $0, $250, $500, $1,000 or $2,000 a month, accrued like wages (a ledger line). Each dollar is a research point.
- The player picks the **project**; points go into it until it's done (on the ticker), then into the next one they pick. With no project picked, funding is still spent but nothing progresses (the tab says so).
- Projects need their prerequisites. Each scenario lists what it starts with: the Lucky Horseshoe starts with none; Free Play, the Test Floor and the Big Floor start with every building project (games, amenities, themes, staff tools), not the information ones.

## The tree

| Category | Project | Cost | Needs | Unlocks |
|---|---|---|---|---|
| Games | Table games | $3,000 | | blackjack, roulette |
| Games | Craps and baccarat | $5,000 | Table games | craps, baccarat |
| Games | Poker room | $4,000 | Table games | poker |
| Games | Keno and bingo | $3,000 | | keno, bingo |
| Games | Video poker | $2,000 | | video poker |
| Games | Sportsbook | $4,000 | | sportsbook |
| Games | Big-jackpot slots | $2,500 | | Thunder Jackpot |
| Amenities | Restaurant | $3,000 | | restaurant, patio restaurant |
| Amenities | Show lounge | $5,000 | Restaurant | show lounge |
| Amenities | Nightclub | $5,000 | | nightclub |
| Amenities | Outdoors | $6,000 | | pool, garden, patio bar |
| Themes | Old Vegas | $3,000 | | Rat Pack Lounge, Neon Atomic, Gold Rush |
| Themes | Ancient worlds | $3,000 | | Ancient Rome, Ancient Egypt, Medieval |
| Themes | Luxury | $4,000 | | Gilded Deco, Modern Luxe, Riviera, Lucky Dragon (its decor since M8.6) |
| Themes | Just for fun | $3,000 | | Tropical Tiki, Pirate Cove, Rock & Roll |
| Games | Game launches (M8.6) | $3,000 | | a new game you place starts known to a quarter of your guests, not a handful |
| Staff tools | Cameras | $3,000 | | cameras |
| Information | Suspicion tools 2 / 3 / 4 | $2,000 / $4,000 / $6,000 | the tier before | one more suspicion tool tier (above the scenario's own) |
| Information | Crowd maps | $2,500 | | overlays: foot traffic, crowding, noise and energy |
| Information | Style maps | $2,500 | | overlays: prestige, privacy, smoke |
| Information | Security maps | $2,500 | Cameras | overlays: visible and hidden surveillance, exit visibility |
| Information | Cleanliness map | $1,500 | | overlay: cleanliness |
| Information | Heatmaps | $3,000 | | revenue and play-time heatmaps over the games |
| Information | Player's club | $5,000 | | the club (below) |
| Information | Guest breakdowns | $3,000 | Player's club | machine and table stats by guest type |
| Information | Market research (M8.6) | $3,000 | | each design's awareness and fans by guest type; what each type wishes the floor had |

- Anything not in the tree (slots Cherry Parade and Liberty Bell, the bar, restrooms, cage, ATM, plain decor, signs, dumpsters) is always available. A locked item shows in the Build menu with its project's name and can't be placed. Already-placed items stay.
- Overlays are chosen in the Game tab; the Debug view still shows everything.

## The player's club
- Reveals guest types: the guest card names their type and what they're worth to the house (their theoretical loss this visit), and the Guests tab counts who's on the floor by type.
- Card holders are members from now on (returning guests, as before; the door reads "Club members").
- Targeted comps: each comp can go to everyone or one type (Policies tab).

## Save
Schema 12: state gains `research` (funding, project, points per project, done list).
