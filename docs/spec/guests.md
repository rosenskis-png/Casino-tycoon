# Guests (M3)

Built in `src/sim/guests.ts` (behavior), `pool.ts` (returning people), `street.ts` (sidewalk and entrance), `drinks.ts` (drink policy and serving), `dist.ts` (distribution draws), with types in `src/data/guests.ts` and thoughts in `src/data/thoughts.ts`. Design agreed with the owner 2026-09-23 (history in DECISIONS.md); wayfinding is in `navigation.md`.

## Types and the population
- **A type is who someone is**: tastes, budget, seasons, drinking. Group size, play style and chasing are drawn per person from ranges the type sets, so types overlap at the edges. One guest proves nothing; a crowd is the signal.
- **M3 roster:** Locals, Retirees, Tourists, Party groups (all men, all women or mixed). Waiting for the milestone that builds what they want: Families (M6/M9), date-night Couples, Conventioneers (M9), High rollers (M7/M9), Whales (M9). Advantage players are a hidden tag in M7. Couples are a group size, not a type.
- **The pool** (`state.pool`): each scenario's finite market of real people per recurring type (`market` in scenario data: size, and the share who are already regulars on day one). A person carries name, looks, type, savings, monthly income, spending money, floor knowledge and last visit, visit count, disposition (0–100), chasing level, next planned visit, and ban/mark flags (M5). Returning people are the same person.
- **One-off types** (Tourists, Party groups) are generated fresh. A Tourist leader joins the pool with a 5% chance when leaving.
- **Reputation**: for recurring types, the average disposition of their people in the pool (moves only when someone visits). For one-off types, word of mouth: 2% of the way toward each departing guest's visit score.
- **After a visit** a person's disposition moves halfway to the visit score. They plan to come back with chance `returns.share × clamp((score − 0.2) / 0.5, 0, 1.15)`, after a log-normal number of days (Locals median 7, 3–20; Retirees median 14, 7–30; returning Tourists median 150), stretched when the visit went badly. Someone left with under $20 in cash and savings stops coming.
- **Paydays:** on the 1st and 15th, regulars due within 5 days may come today instead (Locals 60%, Retirees 30%).
- **Money:** a regular's visit budget comes out of their spending money; ATM draws come out of savings (the hard cap). What's left in their wallet goes home. Each month spending money gains the monthly income, up to two months' worth.
- **Arrivals:** regulars come when their planned day arrives (postponed a day or three if the floor is at the scenario cap). New and lapsed people come on purpose at the M2 arrival formula (scenario rate × type share × season × reputation factor × floor-size factor × room left); for one-off types that's 30% of the formula, the rest are passers-by who step in.

## Chasing
- A hidden per-person level 0–1, not a type. After each visit the floor's **easiness** is scored 0–1: a hard-to-find exit (hops spent looking), ATM trips, drinks pushed on them (served or comped), and a big win in the first fifth of the visit, a quarter each.
- Onset: chance per visit = type rate (Locals 1%, Retirees 0.3%) × easiness. Once started it grows 0.03 + 0.12 × easiness per visit (shrinks 0.02 on a hard floor).
- Effects: stake × (1 + chase), loss limit × (1 + 2 chase), win goal × (1 + chase), floor time × (1 + 3 chase), more ATM trips; anyone above 0.3 uses the ATM. They draw savings down across visits until they can't come any more. The Guests tab counts people at 0.5+ as "Chasers".

## Sidewalk and the entrance threshold
- Scenario data defines `sidewalks` (straight lines, walked end to end either way) next to the `entrances`, and new terrain code SIDEWALK (5, fixed). Pedestrians are saved in `state.peds`: a whole group walks as one entry. At most 40 on the sidewalk.
- **Passers-by** spawn at the ends by the scenario's `footfall` and `street` mix (× type base and season). Recurring-type passers-by are free people from the pool.
- At each entrance a passer-by **glances in**: curb appeal = an open door in view (+0.3), up to 12 machines visible through it (+0.04 each), noise and prestige at the entrance and door, and a crowd inside. Chance to step in = type walk-in (Locals 0.25, Retirees 0.15, Tourists 0.35, Party 0.3) × (0.2 + appeal) × reputation factor × room left, at most 90%.
- **Only someone who crosses the threshold is a guest**: counted in arrivals, scored, able to move reputation. Passers-by who glanced and walked on only add to "walked past" in the Guests tab.
- People coming on purpose walk from a sidewalk end to their entrance (or appear at it when there's no sidewalk or it's full). Departing guests walk off down the sidewalk when there's room.
- On the lot, a new arrival first heads for the open door in view, and wandering prefers indoor spots, so guests don't drift onto the grass.

## Groups
- One type per group, a leader (their id is the group id; a pool person leads). Group size from the type's weights (≤ 8). Members share the leader's floor knowledge.
- Members prefer a machine within 2 tiles of a member who's playing (+1.2), or at least in sight of one (+0.4).
- Mood eases toward 80% own target + 20% group average.
- **Waiting:** a broke or bored guest (the leader too) waits near the leader instead of leaving ("Are you done yet?"); a member who quits by their own rule also waits. **The group leaves when the leader quits (a quit rule met, or their time is up), or when half the group has been waiting 2 minutes.** Urgent reasons (restroom, miserable, starving, exhausted) leave alone.

## Intentions
Gamble, drink (a per-type share come in for a drink first: Locals 12%, Retirees 8%, Tourists 15%, Party 50%), or pass by (the sidewalk). A drink-first guest who sees a machine they really like may convert: "Just one quick spin".

## Betting and quitting
- **Stake** per wager is a fraction of the visit budget drawn per person (Locals 0.5–1.2%, Retirees 0.4–0.9%, Tourists 1–2.2%, Party 0.9–2%), fitted to the machine's credits (at least 1).
- It rises with drink (× 1 + 0.6 intox), after winning (house money: up to × 1.8) and after losing (break-even: up to × 1.5, more for chasers). Comp-seekers bet 1 credit on cheap machines at 0.7× pace while drinks are comped (≥ 25%).
- **Hot machine belief:** a machine seen hitting a jackpot in the last 30 s gets +1.2 when choosing ("That machine's hot!"), so jackpot visibility is a layout lever.
- **Feel:** each round a win ≥ the stake counts 1, a win smaller than the stake counts `ldwFeel` (0.3) × what it paid back, and near misses (`nearMiss` share of losing spins, 0 until the slot designer, M8) count 0.1 each.
- **Quit rules** (one per guest): win goal, loss limit, until broke, leave on a jackpot. Plus a **floor-time budget** per visit (planned minutes, drawn a bit above the target visit length since money and the group end many visits sooner). Drink loosens the loss limit (× 1 + 1.5 intox) and raises the win goal (× 1 + intox); chasing erodes both. Meeting a quit rule sends the guest home (it used to only switch machines). Fatigue still ends a visit.

## Money and the ATM
- Visit budget: log-normal per type (medians $90 / $60 / $180 / $120), capped ($600 / $200 / $2,000 / $800).
- The ATM object ($600, $6/mo) does withdrawals only; cashier cages do both. Some guests never use one (35% / 75% / 30% / 20%). Everyone else has a usual draw per trip (log-normal, medians $60 / $40 / $100 / $80) and a most-they-could-draw: savings for regulars, a trip cap for one-offs. Nobody draws more than they have.
- Out of money, the chance of another trip = type base (0.2–0.4) + 0.3 × how far down they are + 0.5 × intox + 0.6 × chase (+0.1 in a bad mood, −0.3 after a win), then × 0.6 per trip already made (softened for chasers).

## Drinking: an inhibition spectrum
- Intoxication 0–1.3 (≈0.25 tipsy, 0.5 drunk, 0.8 wasted; above 1 is pass-out territory for M4). A drink adds 0.16 × strength for drinkers; it wears off 0.02 per floor-minute.
- Each guest draws an **intended level**: sober guests exactly 0 (soft drinks, half price); drinkers a right-skewed bell (mean/sd: Locals 0.35/0.15, Retirees 0.2/0.08, Tourists 0.45/0.2, Party 0.65/0.2), +0.1 if they came to drink, −0.03 if they came to gamble.
- **Overshoot:** each second the intended level rises by drift × intox / 60, with drift log-normal per person (medians 0.035 / 0.012 / 0.04 / 0.035, sigma 1.2): most stay near their bell, a few run away. Servers and free drinks exploit that slope.
- Drinkers go for a drink when below their intended level and a little thirsty (thirst ≥ 20); anyone goes at thirst ≥ 70. A full bar puts them off for 60 s.
- Shows as a sideways stagger when walking (renderer) and as thoughts (tipsy, drunk, wasted). Flushed sprites wait for the M3.1 art pass; spills, fights and passing out arrive with M4.

## Drinks, servers, policy
- **Drink policy** (Staff tab, `setDrinks`): price multiplier 0–3× on the $7 base; comped share 0–100% (for guests who've played); strength Light 0.6 / Standard 1 / Strong 1.4. Each drink costs the house $1.50 ("Drink costs"). Above 1.5× some guests refuse ("These drinks cost a fortune"); weak drinks draw complaints from drinkers.
- **Drink servers** ($90/mo): pick the nearest seated player who'd take a drink (below their level + 0.1 and a bit thirsty, or thirsty), add up to two more within 8 tiles to the tray, fetch at the nearest bar (2 s), then serve each at their machine (2 s). Players only; everyone else goes to the bar.

## Mood, visit score, thoughts
- Mood as in M2 (surroundings, luck, needs, annoyance, drink), with the group pull.
- **Visit score** = 0.35 × average mood + 0.3 × value + 0.15 × feel + 0.2 × needs met. Value = seconds played per dollar lost against the type's good-value rate (Locals 6 s/$, Retirees 12, Tourists 2.2, Party 3.3), 1 for winners, 0 for a visit with under 30 s of play. Feel = 0.2 + 1.6 × average round feel + 0.3 for a jackpot. Needs = 1 − unmet / 3 (leaving because nothing suited them counts as unmet).
- **Thoughts** are counted by id per day; the Guests tab shows each as a rate per day averaged over the last two days. Each has 2–3 wordings plus type voices (`alt`, `voice`), shown only on the guest's own card, the same wording each time for that guest. **Floor thought bubbles are gone.**
- New thoughts: hot machine, quick spin, time to go, quitting while ahead, my limit, win it back, waiting, drunk/wasted, free drink, served, pricey, weak, no ATM.
- Groundwork fields in type data for M4/M5: `drama` (low-drama guests will file reports), `leniency`, `incidents`, `tolerance`, `cheat` share. Cheats never look any different.

## Notifications
Jackpots are red ("bad" news level: red but queued normally). Only jackpots of $1,000+ or 500× the bet reach the ticker; the rest go to the log. The monthly "books closed" line is log-only too.

## Money scale (changed in M3)
`WAGERS_PER_ROUND` is 4 (was 10): at 10, a $90 budget lasted under a minute of play, far from the agreed visit lengths and losses. Running costs were scaled down about 40% to match what a seat now earns (wages $70 / $110 / $90; slot upkeep $2–4; bar $50, cage $35, restroom $15). The tutorial with a tech and a bar ends year 1 at about $7K–$15K (M2: $12K–$17K), with ~60 guests on the floor (M2: ~33, because visits are longer).

## Targets and how they're checked
Starting targets (agreed; tuned toward, not hand-set), and what the M3 build measures with `npm run targets` (Free Play Lot furnished with 180 slots, bars, servers, restrooms, signs; 400 days, seed 1):

| | Locals | Retirees | Tourists | Party groups |
|---|---|---|---|---|
| Returning | 85%, every 3–20 days (median 7) | 70%, 7–30 days (median 14) | 5% | none |
| Group size 1 / 2 / 3+ (target) | 60 / 35 / 5% | 40 / 55 / 5% | 25 / 50 / 25% | 4–8 |
| Visit length, target → measured | 6 → 5.0 min | 8 → 6.1 | 4 → 4.5 | 5 → 4.4 |
| Loss per visit, target → measured | $55 → $50 | $35 → $31 | $110 → $86 | $90 → $88 |
| Sober share | 30% | 60% | 15% | 5% |
| Drinkers' intended level (mean, sd) | 0.35, 0.15 | 0.2, 0.08 | 0.45, 0.2 | 0.65, 0.2 (cap 1.3) |
| Overshoot > 0.3, target → measured | 5% → 1% | 1% → 1% | 10% → 0% | 20% → 0% |
| Never uses ATM | 35% | 75% | 30% | 20% |
| ATM draw per trip, target → measured | $60 → $70 | $40 → $40 | $100 → $90 | $80 → $70 |
| Chasing onset (easy floor) | 1% | 0.3% | n/a | n/a |

- **Asserted** in `npm run check` (`generatorChecks` in `sim/debug.ts`): 3,000 draws per type through the real arrival path on a fixed seed, checking budget medians, sober and never-ATM shares, drinkers' intended level and group sizes against the targets within a tolerance, and that every draw is finite and within its caps. Invariants add: intoxication ≤ 1.3, groups ≤ 8 with one leader and one type, no one withdraws more than they have, pool money never negative, and anyone marked "here" is on the floor or the sidewalk.
- **Reported only** (random outcomes are never asserted): `npm run targets` for the table above, `npm run economy` for the tutorial books.
- Known gaps: first-time groups (Tourists, Party) lose a lot of time hunting for bars, restrooms and exits, so they drink little and overshoot rarely; that's wayfinding on the test floor, and layout, signs and servers move it. Locals and Retirees reach their intended level.

## Save
Schema 4 (migration from 3): guests gain person id, group/leader, stake, floor time, intended level and drift, ATM traits, chasing and waiting; drink counts become intoxication. The per-type familiarity becomes a seeded pool whose regulars know the floor that well. State gains the pool, pedestrians, drink policy, and thought counts by day; the sidewalk is added to the map.
