# Calendar, events, marketing, the sportsbook, new crowds (M9.5)

`src/data/events.ts`, `src/data/marketing.ts`, `src/sim/calendar.ts`. FOUNDATIONS §6, §16, §19; docs/spec/clock.md. All numbers are starting values, checked only against sanity flags until M11.

## Seasons
Each type's arrivals follow its month curve (`arrival.season`, since M2): Retirees come in winter (snowbirds), Tourists and Families in summer, Party guests at spring break and New Year, High rollers and Conventioneers evenly. Locals are flat. Passers-by follow the same curves.

## Scheduled events
- **The year's calendar** is drawn on 1 January (and when a game starts): fixed holidays plus randomly dated events, on the `events` stream. Each is announced on the ticker a week ahead ("Next week: …"), again when it starts, and listed in the Guests tab under **Coming up**.
- While an event runs, arrivals of each type it names are multiplied (walk-ins and people coming on purpose alike):

| Event | When | Days | Crowd |
|---|---|---|---|
| New Year's Eve | 30 Dec | 3 | everyone ×1.5, Party ×2.5 |
| Holiday season | 20 Dec | 10 | Retirees ×1.3, Families ×1.5, High rollers ×1.5 |
| Spring break | 10 Mar | 14 | Party ×2, Tourists ×1.3 |
| Summer holiday | 3 Jul | 3 | Tourists ×1.8, Families ×2 |
| The big game | 5 Feb | 1 | Locals and Party ×1.5, sports betting ×4 |
| Playoffs | 15 Mar | 21 | Locals ×1.2, sports betting ×2 |
| Fight night | 3 a year | 1 | Party and High rollers ×2, Locals ×1.3, sports betting ×3 |
| Convention | 4 a year | 4–7 | Conventioneers ×40 (a day is 10 real seconds: a convention is under a minute of play, so the wave has to be strong to show) |
| Poker tournament | 2 a year | 2 | Locals ×1.3, High rollers ×1.5, poker ×3 (only with a poker table) |

- Every scenario gets every event its population fits: the tutorial has no Conventioneers, so no conventions.

## Marketing (Policies tab)
Campaigns run for 1, 3 or 6 months, cost a monthly fee (accrued like wages, a ledger line) and multiply one or two types' arrivals while they run. The effect shows in who comes, nothing else.

| Campaign | Types | Fee |
|---|---|---|
| Radio spots | Locals ×1.4 | $300/mo |
| Bus tours | Retirees ×1.6, Tourists ×1.2 | $400/mo |
| Travel ads | Tourists ×1.5, Families ×1.3 | $500/mo |
| College promotion | Party ×1.8 | $300/mo |
| High-roller mailers | High rollers ×1.5 | $600/mo |
| Convention partnership | Conventioneers ×2 | $500/mo |
| Family fun deals | Families ×1.8 | $350/mo |

## Sportsbook
A counter with a wall of screens and eight stools, run by one writer (a dealer). Bets at −110 on one of two sides: a win pays 1 + 10/11, so the house keeps 4.55% of the bets. One game resolves a round every 30 s, the whole book at once (a shared outcome, like keno). Limits $5–500, $10–1,000 or $25–2,500. During sports events its appeal is multiplied (above). Tastes: Locals 0.7, Retirees 0.1, Tourists 0.4, Party 0.8, High rollers 0.4, Conventioneers 0.6, Families 0.

## Conventioneers
One-off business visitors in groups of 2–4 colleagues with name badges: $150 budgets, 5-minute visits, fond of the bar (a third come in for a drink first), blackjack, craps and the sportsbook, mildly rowdy, comp-happy. Few come without a convention; a convention brings a wave.

## Save
Schema 12: state gains `cal` (this year's events: id, start and end ticks, announced) and `ads` (campaigns running: id, until).
