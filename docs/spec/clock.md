# Clock, pace, and money scale

Supersedes FOUNDATIONS §2 (time), the hour and day-of-week parts of §6, §10, §19, and the scenario lengths and money magnitudes in §14 and §20. Decided 2026-09-23, replacing an earlier same-day draft that kept time of day.

## The RollerCoaster Tycoon model
RCT runs two clocks that never have to agree:
- **The park moves at human pace.** Guests walk, queue, ride, eat, and get hungry in real seconds. Everything they do is an event: one ride = one ticket, one burger = one sale.
- **The calendar is just a counter.** It advances a fixed amount per tick, shows only a date, and drives slow things: monthly bills, weather and season, marketing campaigns, awards, the scenario deadline. There is no time of day, so a guest can stay for what the calendar calls weeks and nothing cares.
- **Money is game money tuned for fun.** Ticket prices look like real prices, but wages and running costs are monthly figures chosen so the books balance against what guests actually spend at floor pace. No real-world economy is simulated behind the scenes.

Casino Tycoon copies all three.

## Floor clock (everything guests and staff do)
- Fixed simulation step: 20 ticks per real second at 1× speed.
- Guests, staff, needs, drinks, incidents, cheating, and play all run on ticks at human pace. A typical visit lasts a few real minutes at 1×.
- **Play is event-based.** A slot round takes about 3 real seconds at 1×. Each round resolves a small fixed batch of real wagers, drawn from the machine's true distribution (batch: 4 wagers since M3, 10 in M2; `WAGERS_PER_ROUND` in `src/data/games.ts`, a single tuning constant). Tables deal a visible hand that resolves a batch the same way. The animation shows that round's actual result, including a jackpot only if one hit. Nothing is ever simulated off-screen.

## Calendar
- 1 game day = 200 ticks (10 real seconds at 1×). A month is about 5 minutes; a year about 1 hour, as the owner asked.
- The calendar shows day, month, and year. No clock time, no day of the week, no day/night cycle.
- Monthly: wages, upkeep, loan interest, insurance, marketing, and research are stated as monthly figures. They accrue every tick so cash moves smoothly, and the books close each month.
- Seasons: months carry seasonal demand (spring break, summer tourists, holiday season) that shifts the guest mix and arrival volume.
- Events: shows, fight nights, conventions, tournaments, and holidays are calendar entries lasting days to weeks, announced ahead on the ticker.

## Speeds
Pause, 1×, 2×, 4×, 8×. Faster speeds run more ticks per frame, never bigger ticks, so results are identical at every speed. Guests visibly move faster at higher speeds (as in RCT's fast-forward). At 8× on big maps, animation may drop detail while the math stays exact.

| Speed | 1 day | 1 month | 1 year |
|---|---|---|---|
| 1× | 10 s | 5 min | 1 h |
| 2× | 5 s | 2.5 min | 30 min |
| 4× | 2.5 s | 75 s | 15 min |
| 8× | 1.25 s | 38 s | 7.5 min |

## Population
- Every guest is one real person, always.
- Arrivals depend on reputation per guest type, marketing, season, events, and how crowded the floor already is, not on the hour.
- Peak guests on the floor: tutorial ~150–300, mid-size ~500–1,500, largest ~5,000–8,000 (raised 2026-09-23 from 2,000–3,000; the Big Floor perf test checks it).

## Money
- What guests see stays real-looking: $1 slot bets, $5–$25 table minimums, $7 drinks.
- Casino-level money is game money: wages, upkeep, prices of equipment, loan sizes, and scenario goals are tuned against what the simulated floor actually earns per game month. Totals will land in RCT-like ranges (thousands to low millions), not real casino billions.
- The wagers-per-round batch is the main knob for overall money scale. Since guest budgets are real-looking dollars (M3), changing it also changes how long guests' money lasts, so running costs are retuned alongside it.

## Scenario lengths
Deadlines are in months and years, like RCT: early scenarios about 1 year, core 1–2 years, large and challenge up to 3–5 years. At 4× a 2-year scenario takes about 30 minutes; at 1× about 2 hours.
