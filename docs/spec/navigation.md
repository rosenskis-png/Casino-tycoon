# Navigation and wayfinding (M2.5)

Guests don't know the floor. They know what they can see, what they remember, and what signs tell them. Layout shapes behavior because it shapes knowledge (NORTH_STAR: maze vs. open floor is a real tradeoff). Staff stay omniscient; they work there.

**Status: design agreed 2026-09-23, not built. Numbers are provisional.**

## Two layers
1. **Knowing (new).** Which destinations a guest is aware of: seen this visit, remembered from past visits (regulars), or pointed to by a sign.
2. **Walking (existing).** Once a guest has picked a target it knows, it walks there on the M1/M2 path fields (`src/sim/paths.ts`). No change to locomotion.

## Sight
- Walls and objects flagged `opaque` block sight. Slot banks, pillars and partitions are opaque. Low objects (stools, planters, signs) are not.
- Sight radius is limited (~12 tiles, provisional) and fades: far things are less attractive.
- What each tile can see is a runtime cache, rebuilt only for regions a layout change touches. Never saved.
- Guests look around only at decision points (on arrival, on reaching a waypoint, every few tiles while wandering), never every tick.

## Waypoint hopping
At each decision point the guest scores the candidates it knows or can see and walks to the winner, then looks again.
- **Candidates:** visible attractions (machines, bar, cage, restrooms, a crowd or jackpot), visible openings (aisle ends, doorways, gaps between banks), visible signs, remembered targets.
- **Score** = determination × progress toward the current goal + visible appeal (fades with distance) + field fit along the way + crowd pull/push + small noise.
- **Determination** comes from urgency: a pressing need or leaving means a beeline for anything known that serves it. A casual browser drifts from one appealing sight to the next and can be caught by a machine it never set out to play.
- Fields bias which waypoint wins and how long a guest lingers. They don't steer individual footsteps: movement stays readable.
- Guests don't reverse to where they just came from unless nothing else is available (momentum), so wandering explores.

## Signs
- A new placeable object. The player places a sign and picks a category (restrooms, bar, cage, exit, or a game area later). Its arrow points along the real shortest route to the nearest destination of that category and updates when the layout changes.
- A guest who can see a sign for its goal gets a waypoint in that direction. Signs don't reveal the destination itself, only the next leg.
- Without signs, guests with an unmet goal wander and explore.

## Memory
- **This visit:** every destination a guest has seen is remembered until the guest leaves (saved on the guest).
- **Regulars:** returning guests remember the floor from their last visit. That visit memory goes stale when the floor is rebuilt: they head for things that have since been moved or removed, then have to look around again. Mechanism: see the open question below.
- Tourists and first-timers start knowing only what they can see from the entrance.

## Leaving and being trapped
- A guest who wants to leave and has a walkable path to an exit always finds it eventually. Being lost raises determination over time until it falls back to the true path. Time spent lost costs mood and shows up in thoughts.
- A guest with no walkable path to any exit is truly trapped. They stay on the floor, their needs and mood keep falling, and they think about it. (Replaces the M2 rule "walled-in guests leave anyway." Police and reputation consequences come in M4.)
- Guests trying to reach an unknown need (restroom, bar, cage) give up after a while and either go without (mood hit, and later M4 incidents like using a planter) or leave.

## Symptoms (thoughts)
"Where's the restroom?", "I can't find the way out", "I'm trapped in here!", "Ooh, what's that?", "Someone moved everything around" (regulars after a remodel).

## Open
- How regulars carry memory: M2 has no returning individuals. Proposed: each object stores the day it was built; a regular draws a "last visit" day and knows every object built by then. A short list of recently removed objects lets them walk to where something used to be.
