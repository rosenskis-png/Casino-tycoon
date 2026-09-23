# Navigation and wayfinding (M2.5)

Guests don't know the floor. They act on what they can see, what they remember, and what signs tell them. Layout shapes behavior because it shapes knowledge (NORTH_STAR: a maze or an open floor is a real tradeoff). Staff stay omniscient; they work there. Built in `src/sim/wayfinding.ts` (sight, knowledge, exploring, signs) and the decision code in `src/sim/guests.ts`. **Numbers are provisional.**

## Two layers
1. **Knowing.** Whether a guest is aware of a destination: in view now, a route they know from past visits, or somewhere they saw earlier this visit.
2. **Walking.** Once a guest picks a target it can see or knows the route to, it walks there on the path fields (`src/sim/paths.ts`). Locomotion is unchanged.

## Sight
- Walls, closed or staff doors, and objects flagged `opaque` block sight: slot machines, restrooms, the cage. Bars, plants, fountains, neon and signs don't.
- Sight radius 12 tiles. Line of sight is a short ray cast (Bresenham), done only when a guest decides what to do next, never every tick. Nothing is cached or saved.
- Machines: a guest checks sight lines to at most 40 machines per look (a glance, not a survey), besides any it already knows.

## Deciding where to go
Same priority order as M2 (leave → restroom → bar → cage → machine → browse), but each step only considers what the guest knows:
- **Direct:** a free amenity or machine in view, or one whose route they know, becomes the target: claim a seat and walk there. Machines in view get a small bonus over remembered ones. A far machine in view sometimes gets "Ooh, what's that over there?"
- **Searching:** a need with nothing known that serves it means one hop at a time. Each hop follows a sign in view if one helps. Otherwise the guest explores: it looks along eight sight lines and walks to the end of the best one. Longer views pull, spots near their last four decision points push (so they explore instead of doubling back), and the spot's fit to their tastes biases the choice. If they saw one earlier this visit, progress toward it by straight-line distance counts, weighted by **determination** (bladder / 40 for the restroom, 0.8 for bar and cage, 1 + 0.2 per hop for the exit). Straight-line guessing is what mazes defeat.
- **Browsing** (nothing wanted but a machine, and none known): explore hops. After 3 hops "I can't find a machine I like", and after 8 they give up and leave.
- **Giving up on a need:** after 6 hops they go without ("Where's the restroom?", counted as an unmet need). They leave once the restroom need hits 90; for a drink they settle back to 40 thirst. Spotting that kind of amenity later ends the give-up.
- Every hop spent searching past the first adds annoyance, which lowers mood.

## Signs
- A placeable object (`sign`, $80, no upkeep). No arrows to set. A guest who can see a sign while searching reads it: it points the next 10 steps along the real route toward the Manhattan-nearest destination of what they want, within 40 tiles of the sign. It's rough: 20% of readings don't help, and "nearest" isn't always the best one.
- Guests remember signs they've passed (for future use; nothing reads that yet).

## Knowledge and familiarity
- Each guest has a **floor knowledge** meter, 0–1. It grows while they're on the floor (+0.2% of what's left per beat) and moves their type's **familiarity** with this casino 5% of the way toward it when they leave.
- Arrivals: a share of each type are **regulars** (Locals 80%, Retirees 60%, Tourists 5%). A regular starts with knowledge around their type's familiarity (×0.6–1.3), plus a last-visit date some days back (Locals 2–30, Retirees 3–45, Tourists 60–365). First-timers start at 0.
- A regular knows the route to an object with probability equal to their knowledge, fixed per guest and object (a hash, so it's stable), but only for objects built before their last visit. Anything built or moved since is new to them until they see it. Remodeling therefore disorients your regulars, while rebuilding familiarity takes a stream of returning visitors.
- Knowledge of entrances works the same way (entrances are part of the building, so no build date).
- This is a stand-in until real returning individuals (M3 or later), which will replace familiarity per type with each person's own memory.

## Leaving and being trapped
- An exit in view, or one a regular knows, means walking straight there. Otherwise they head roughly back toward the door they came in by, using signs, and think "I can't find the way out" after 3 hops. After 8 hops lost they find the way anyway ("Finally found the exit.", annoyance). A guest with a walkable path always gets out.
- No walkable path to any exit means **trapped**: "I'm trapped in here!", annoyance every look, and they stay and browse what they can reach. Their needs keep rising and their mood keeps falling. They leave once any exit is reachable again. Police and reputation consequences arrive with M4.
- Cash-out on the way home uses the same search for the cage, and a guest who gives up leaves without cashing out.
- `npm run check` verifies both guarantees (`exitChecks` in `src/sim/debug.ts`): with every exit walled, nobody leaves and guests notice they're trapped; once the exits reopen, everyone gets out.

## Inspector
Walking guests show what they're searching for ("Looking for a restroom", "Looking for the way out", "Trapped inside"). The Debug view adds floor knowledge and regular / first visit.

## Not yet
Crowds and jackpot cheers as things that pull guests, regulars walking to things that were removed (needs real returning individuals), and perf tuning if large floors need it (the 5,000-guest headless tick went from ~1.8 to ~2.2–2.8 ms).
