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
  Running costs were left alone at first; after the owner's tutorial playtest (below) **wages and upkeep were
  halved too, and standard decor has no monthly fee** (only an upfront price; future centerpieces may have one).
  Drink and food costs per serving are unchanged. Target: a machine pays for
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

## Serving grades and margins (M11.4, owner)
Every place with a price (bars, restaurants, the show lounge, the nightclub, the pool, mini golf) also has a **grade**:
Cheap, Standard or Fancy (`data/grades.ts`). The grade sets what each serving costs the house (Standard: a drink $1.50,
a meal $6, a show seat $6, a club entry $2, a swim or a round $1; Cheap 0.4×, Fancy 2.2×) and what it's worth to each
crowd by its taste for luxury (`luxe`: Locals 0.1, Families 0.15, Retirees 0.3, Party 0.4, Tourists 0.5,
Conventioneers 0.6, High rollers 1): Cheap is worth 1 − 0.5 × luxe of Standard, Fancy 0.7 + 1.3 × luxe. So any grade
can be fairly priced, a bargain or a rip-off, and the right grade depends on the crowd: families barely value fancy;
high rollers value it twice as much and grumble about cheap food.
- The card shows price, grade and the **margin per serving** (price − cost, and as a share of the price; a free show
  shows what each seat costs you). Guests say so: "Pricey food for what it is" over 1.2× fair, "What a bargain!" under
  half of it.
- The books net each place's serving costs into its line ("Bar (less drink costs)", "Restaurants (less food costs)",
  "Shows (less show costs)"...), so there are no separate cost lines. Shows, the club, the pool and golf now have a
  serving cost too, so a free show is a visible loss leader (Test Floor: shows −$1.6K over 120 days at free tickets).

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
  $20K cash. Goal: worth $55K (M11.4; was $40K), Tourists 55 and Families 50 by the end of December, Year 2. Mini golf is unlocked
  from the start (families' favorite), and entertainers can be hired. What it teaches through
  setup: read the thoughts (dirty, bad theming, drunks, fights), clean up, throw out the junk, retheme for the
  crowd you want, rein in the bar and hire a guard with stricter rules, add a restaurant and shows. Machines can
  be moved (docs/spec/construction.md).
  **After the owner's playtest (M11.2, second pass):** the owner met both reputation goals but could only reach a
  worth of about $30K by the deadline. With wages and upkeep halved and decor free to keep, `npm run economy`
  (seeds 1, 2): idle Tourists ~38, Families ~35 (lost; worth ~$47–50K, which is why worth alone can't win it);
  "good" (now with mini golf and an entertainer) wins by month 12; "big" (21 decor pieces at once, a 6×4
  restaurant, a 6×6 show lounge, 7×5 mini golf, three janitors, two security, an entertainer, two ad campaigns)
  wins in month 13–18 with worth $49–55K by month 24. The earlier (first pass) measurements:
  Measured with `npm run economy <strategy> 24 1,2,3`: doing nothing ends with Tourists ~33, Families ~32 (worth
  ~$40K, lost); janitors only Tourists ~47, Families ~41–47 (lost); the scripted fix (janitors, a guard and
  Moderate rules, the bar at standard, the junk out, Medieval decor, a restaurant, a family campaign, a show
  lounge) wins in month 13–18 (seeds 1, 2) or by month 24 (seed 3); its slots take $1.5–2.1K a month by then
  against ~$1K idle.
  **The owner's "why they come" pass (M11.2, third):** guests come for reasons, gambling is planned only by those who
  came for it (docs/spec/guests.md "Why they come"). The tutorial's locals market shrank to 35 (regulars 40%),
  tourists and families are the big market (population 2 and 4), and its banks alternate Cherries and Bells. Measured
  (`npm run economy <s> 24 1,2,3`): idle is mostly locals, 40–54% of seats in use, slots $500–$760 a month, Families
  stay at 30 (lost); "good" and "big" draw 40–60 tourists and 11–19 family adults on the floor, 16–25% and 9–14% of them
  playing, slots $1.3–$1.6K a month, and win between month 12 and month 24 (worth $45–54K at month 24).
  **M11.4 (richer guests, 8 wagers a round):** the tutorial's slots take about twice as much ($2.0–3.0K a month on
  "good", $0.9–1.7K idle), so the worth goal rose from $40K to $55K (Claude's call, flagged). Measured (`npm run economy
  <s> 24 1,2,3`, insured): idle worth $51–54K at month 24 but Families stay at 30 (lost); "good" meets both reputations
  by month 12 and worth ~$55K around month 18 (was a win between months 12 and 24); "big" ~$49–55K at month 18,
  $64–70K at month 24 (was 1 seed of 3).
- **Free Play Lot**: empty building, $50K, no goals, a guest cap of 1,500. Old M1 saves load into it.
