# Amenities, staff, and litter (M2)

## Objects
- `src/data/objects.ts`: footprint, cost, monthly upkeep, blocking, emissions, seats (access tiles) and what using it does. Geometry is given for rotation 0 (front faces down); `src/sim/geometry.ts` rotates footprint and seats. Rotation is picked in the Build tab.
- Seats must be open floor, may not sit under another object or on another object's seat, and nothing may be built on a seat. Seat kinds: stool, stand, hidden (restroom stalls).
- Since M6 the bar, restrooms and cage are sized amenities (docs/spec/construction.md), along with the restaurant, show lounge and nightclub. Bartender and teller cost is folded into upkeep.
  - Bar (3×2 by default: counter and three stools): $7 a drink, resets thirst, may intoxicate, may spill.
  - Restrooms (2×2 by default, two stalls): 5–9 s out of sight.
  - Cashier cage (2 windows by default): cash-outs on the way home, withdrawals for guests who ran dry.

## Staff (`src/sim/staff.ts`)
- Hired from the Staff tab; they walk in from the street entrance. Fired staff leave at once. Wages are monthly.
- Janitor: goes to the dirtiest reachable litter (weighed against distance), sweeps a 3×3 area in 2 s, else patrols.
- Slot tech: goes to the nearest broken machine, fixes it in 6 s, else patrols.
- Patrol zones, skill, morale and honesty come later (§9, M9).

## Litter
Saved integer per tile (`state.dirt`, capped at 9), drawn as cups and spills. Guests feel it within 2 tiles (the DIRT taste).
