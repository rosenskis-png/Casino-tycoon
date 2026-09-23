# Books, money scale, and goals (M2)

## Books (`src/sim/finance.ts`)
- `post(g, category, amount)` is the only way cash changes. Categories: starting cash, slot win, bar sales, construction, sold objects, wages, upkeep.
- Wages and upkeep are monthly figures accrued every beat, so cash moves smoothly; the month's ledger closes on the 1st (24 months kept) with a ticker line.
- Σ all-time ledger = cash, checked by the smoke test.
- Worth = cash + resale value (half the price) of everything placed. No loans yet (M9), so cash can go below zero from wages or a jackpot; building stops until it recovers (red ticker item).

## Money scale (tuned 2026-09-23, provisional)
Guest-facing money looks real ($0.25–$3 bets, $7 drinks, $50–$400 bankrolls). Casino money is game money tuned to what the floor earns: a busy machine wins roughly $60–$90 a month, so slots cost $300–$700 with $3–$6 upkeep, a janitor is $120 a month and a tech $180. Headless test runs of a simple build-as-you-go strategy grew worth from ~$12.5K to $23K–$60K in the first year; the spread is jackpot variance.

## Scenarios and goals (`src/data/scenarios.ts`, `src/sim/goals.ts`)
- Scenario data: map, starting cash, objects and staff, guest mix, starting reputation, arrival rate, guest cap, goals.
- Goals: worth at least X and reputation at least Y with one guest type (or all), by the end of a month. Checked each month-end; met → won, deadline passed → lost. Play continues either way.
- **The Lucky Horseshoe** (tutorial): a run-down locals casino with 18 slots, a far-corner restroom, a cage, one janitor, no bar, no tech, $8K cash. Goal: worth $30K and Locals reputation 60 by the end of December, Year 1. What it teaches through setup: machines break (hire a tech), guests want a drink (build a bar), the restroom is far, and the floor fills up (build more).
- **Free Play Lot**: empty building, $50K, no goals. Old M1 saves load into it.
