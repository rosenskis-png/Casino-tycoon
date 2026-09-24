# Books, money scale, and goals (M2)

## Books (`src/sim/finance.ts`)
- `post(g, category, amount)` is the only way cash changes. Categories: starting cash, slot win, bar sales, drink costs, construction, sold objects, wages, upkeep.
- Wages and upkeep are monthly figures accrued every beat, so cash moves smoothly; the month's ledger closes on the 1st (24 months kept) with a log line.
- Σ all-time ledger = cash, checked by the smoke test.
- Worth = cash + resale value (half the price) of everything placed + land − debt (M9). Since M9, loans, emergency credit, gaming tax, insurance and comps are in docs/spec/money.md; cash goes below zero only once emergency credit runs out, and building stops until it recovers.

## Money scale (retuned for M3, provisional until M11)
Guest-facing money looks real ($0.25–$3 bets, $7 drinks, visit budgets around $60–$180). Casino money is game money tuned to what the floor earns. M3 cut a round to 4 wagers (from 10) so visits and losses land near the guest targets, which cut what a seat earns, so running costs came down about 40%: slots cost $300–$700 with $2–$4 upkeep, a janitor is $70 a month, a tech $110, a drink server $90; each drink costs the house $1.50. `npm run economy` plays the tutorial for a year with a tech and a bar: year-end cash about $7K–$15K (M2: $12K–$17K), jackpot variance being most of the spread.

## Scenarios and goals (`src/data/scenarios.ts`, `src/sim/goals.ts`)
- Scenario data: map, starting cash, objects and staff, guest mix, starting reputation, arrival rate, guest cap, goals; since M3 also sidewalks, footfall and street mix, and the market of returning people (docs/spec/guests.md).
- Goals: worth at least X and reputation at least Y with one guest type (or all), by the end of a month. Checked each month-end; met → won, deadline passed → lost. Play continues either way.
- **The Lucky Horseshoe** (tutorial): a run-down locals casino with 18 slots, a far-corner restroom, a cage, one janitor, no bar, no tech, $8K cash. Goal: worth $30K and Locals reputation 60 by the end of December, Year 1. What it teaches through setup: machines break (hire a tech), guests want a drink (build a bar), the restroom is far, and the floor fills up (build more).
- **Free Play Lot**: empty building, $50K, no goals. Old M1 saves load into it.
