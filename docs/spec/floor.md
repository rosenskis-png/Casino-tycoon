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
- Janitor: goes to the nearest reachable litter (M11; a bigger pile only breaks a near tie, and mess a free janitor is closer to is left to them), sweeps a 3×3 area in 1 s ÷ skill, else patrols. A bucket stands by them while they sweep.
- Slot tech: goes to the nearest broken machine, fixes it in 6 s, else patrols.
- Pay, skill, morale, honesty, theft and patrol zones (M9), uniforms and spreading out (M11): docs/spec/staff.md.

## Litter
Saved integer per tile (`state.dirt`, capped at 9), drawn as cups and spills. Guests feel it within 2 tiles (the DIRT taste).
- **Dropping it (M11, owner: "too much litter, too many janitors"):** every chance halved: a finished drink 5%, a bar drink 10%, a meal 8%, a cigarette outside a smoking room 15%, and walking 0.15% a beat (0.3% after drinking).
- **Litter bins (M11):** a 1×1 decor object ($60, $1/mo, no research). A guest with a bin within 6 tiles (Manhattan) uses it instead of the floor, unless their intoxication is 0.5 or more. Spills, vomit and planters are incidents, not litter, and bins don't help with them.
- Measured (60 days, 2 seeds, vs M8.6): Test Floor (4 janitors, 4 bins) average litter on the floor 46–57 → 10–16 units, janitors busy 96–99% → 68–92%; the tutorial (1 janitor, no bins) 9–16 → 3–7.
