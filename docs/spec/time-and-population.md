# Time and population

Supersedes the clock numbers in FOUNDATIONS §2 and the scenario lengths in §20. Decided 2026-09-23.

## Principle: one guest is one person
Every guest on the floor is exactly one real person with their own budget, bets, needs, and memory. No guest ever stands for a crowd, and no statistics are simulated off-screen. Casinos are simply smaller than real ones, and scenario goals are tuned to the population the game actually simulates.

## Why the spec's clock had to change
RollerCoaster Tycoon had no time of day: a guest could wander the park for what the calendar called weeks, and it never mattered. This game makes the hour matter (Saturday night vs. Tuesday morning is one of the five skills), so a visit has to last a few calendar hours. The spec's slow speed (1 day ≈ 2 real minutes) would make a 3-hour visit last 15 real seconds, with guests sprinting. So the calendar at slow speed is slowed until a visit looks human, and faster speeds do the work of getting through months and years.

## Clock
| Speed | 1 game hour | 1 game day | 1 game month | Floor animation |
|---|---|---|---|---|
| Pause | – | – | – | frozen |
| Slow (1×) | 30 s | 12 min | 6 h | full, human pace (v0.2 used this rate) |
| Medium (8×) | 3.75 s | 90 s | 45 min | full, brisk |
| Fast (30×) | 1 s | 24 s | 12 min | loosened (generic motion, correct tempo) |
| Max (~120×) | 0.25 s | 6 s | 3 min | minimal (low-detail sprites, fx skipped) |

- One fixed simulation step (a quarter game minute to start). Speeds run more steps per frame, never bigger steps, so results are identical at every speed.
- Max speed may drop frames on large maps; it stays deterministic because only rendering is skipped.
- The expected rhythm: build and watch at slow or medium, let quiet stretches run at fast or max.

## Visits and population
- A typical visit lasts 1–5 game hours depending on guest type; whales and grinders can stay much longer.
- Peak guests on the floor at once, by scenario size (a performance test in M1 confirms the top end):
  - tutorial: ~150–300
  - mid-size: ~500–1,000
  - largest: ~2,000–3,000
- With visits measured in hours, that works out to about 5–8 visits per peak guest per day. A tutorial casino sees roughly 1,000–2,000 visits a day, which is realistic for a small locals casino, so very little scaling is needed at the small end.

## Money
- Per-guest money stays real: bet sizes, budgets, drink prices, and wages use real-world dollars, so a $5 blackjack bet looks like $5.
- Casino-level totals (daily win, worth, goals) come out of that population. Big scenarios have far fewer guests than a real megaresort; they make up some of the gap with a richer guest mix (high-limit play, whales), and scenario targets are tuned to what the simulated population can earn, not to real megaresort revenue.
- If big scenarios feel too small, fix it by changing the guest mix or adding more guests, never by making one guest count as several.

## Scenario lengths (replaces FOUNDATIONS §20)
- Early: 2–8 weeks (about 25 min–1.5 h at fast).
- Core: 2–6 months.
- Large and challenge: up to 1–3 years, meant to be played mostly at fast or max speed. A year at max is about 45 min.
- Seasons and holidays still apply; short scenarios just see only one or two of them.

## North Star check
- "Calendar moves quickly while the floor moves at a human pace": the calendar is still quick at the speeds most of a scenario is played at, and the floor is human at slow. The trade is that one speed can't do both at once.
- "Across seasons and years": kept for the large scenarios.
- "Numbers are always exact; animation may become more approximate at the fastest speeds": that's how fast and max work.
