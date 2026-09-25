# Books, money scale, and goals (M2)

## Books (`src/sim/finance.ts`)
- `post(g, category, amount)` is the only way cash changes. Categories: starting cash, slot win, bar sales, drink costs, construction, sold objects, wages, upkeep.
- Wages and upkeep are monthly figures accrued every beat, so cash moves smoothly; the month's ledger closes on the 1st (24 months kept) with a log line.
- Σ all-time ledger = cash, checked by the smoke test.
- Worth = cash + resale value (half the price) of everything placed + land − debt (M9). Since M9, loans, emergency credit, gaming tax, insurance and comps are in docs/spec/money.md; cash goes below zero only once emergency credit runs out, and building stops until it recovers.

## Money scale (M11.2: the final balance pass)
Guest-facing money looks real ($0.25–$3 bets, $7 drinks, visit budgets around $60–$180) and was not changed. A
month is 5 real minutes at 1×, so a slot wins about $20–$35 a month in theory on a busy floor. Casino money is game
money tuned to that:
- **Build prices halved** (M11.2): every object, sized amenity, decor piece, cabinet and topper, dealers ($400 a
  spot), walls ($20 a tile), doors, entrances, land, research projects, certification ($750) and conversion kits.
  Running costs (wages, upkeep, drink and food costs) are the same dollars as before. Target: a machine pays for
  itself in 6–12 months on a well-filled floor. Measured (Test Floor, 120 days): theoretical win $21–$24 a machine a
  month against an average price of $285, 14–16 months there (131 machines for ~300 guests, half the seats
  empty); a legacy Liberty Bell ($200) about 10 months.
- **Free Play guest cap 1,500** (was 400; the lot is 8× the tutorial's). At 400 the cap, not the casino, stopped
  growth at about 100 machines. Guest numbers are now set by demand: arrivals × the draw, and seats draw only
  sublinearly (M11.1), so each extra bank earns less than the last.
- **Pace** (a scripted Free Play build: the starting shell filled with banks, a restaurant, decor, a show lounge,
  tables, then a second hall of 120 machines with its own amenities): everything is built by month 10; by month 24
  the casino nets about $5.5K a month with $65K in the bank (before: the first hall only, about $2K a month and
  stuck). A strong casino in about 2 years.
- **No overhead that grows with size** (Claude's call): sublinear draw already makes each extra seat earn less, so
  a big floor's margin shrinks on its own. Revisit if Free Play piles up cash.
- **Measure money over several seeds** and compare theoretical win (coin-in × edge): jackpots and whales swing a
  single run's cash by more than any lever.

## Scenarios and goals (`src/data/scenarios.ts`, `src/sim/goals.ts`)
- Scenario data: map, starting cash, objects and staff, guest mix, starting reputation, arrival rate, guest cap, goals; since M3 also sidewalks, footfall and street mix, and the market of returning people (docs/spec/guests.md).
- Goals: worth at least X and reputation at least Y with one guest type (or all), by the end of a month. Checked each month-end; met → won, deadline passed → lost. Play continues either way.
- (M11.2) Goals may add a second reputation bar for more types (`reps`), shown on its own line in the Goals tab.
- **The Lucky Horseshoe** (tutorial, rebuilt in M11.2 to the owner's vision): **no new games can be built**
  (`noGames`): the 68 machines on the floor (Lucky Cherries and Silver Bells, gentle classics with small jackpots)
  are all there is, so winning means filling them. Everything else is the last owner's mess: litter and vomit
  everywhere (`mess`), broken theming (nine cutouts and dead neon signs, which spoil theming around them), a bar
  pouring free strong drinks to regulars who fight, house rules on Ignore for drunkenness and disorder
  (`rules`), no janitor, one tech. Research starts with Ancient worlds (Rome, Egypt, Medieval: tourists and
  families like them, though Egypt and Medieval clash) and Old Vegas (mostly wrong for them) and the restaurant;
  the show lounge takes research. Tourists and families come in greater numbers and start at reputation 35 and 30.
  $20K cash. Goal: worth $36K, Tourists 55 and Families 50 by the end of December, Year 2. What it teaches through
  setup: read the thoughts (dirty, bad theming, drunks, fights), clean up, throw out the junk, retheme for the
  crowd you want, rein in the bar and hire a guard with stricter rules, add a restaurant and shows. Machines can
  be moved (docs/spec/construction.md).
  Measured with `npm run economy <strategy> 24 1,2,3`: doing nothing ends with Tourists ~33, Families ~32 (worth
  ~$40K, lost); janitors only Tourists ~47, Families ~41–47 (lost); the scripted fix (janitors, a guard and
  Moderate rules, the bar at standard, the junk out, Medieval decor, a restaurant, a family campaign, a show
  lounge) wins in month 13–18 (seeds 1, 2) or by month 24 (seed 3); its slots take $1.5–2.1K a month by then
  against ~$1K idle.
- **Free Play Lot**: empty building, $50K, no goals, a guest cap of 1,500. Old M1 saves load into it.
