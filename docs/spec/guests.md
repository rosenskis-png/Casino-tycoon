# Guests (M3, revised; drinking retuned in M4)

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

## Finding a machine
Real guests new to a place look around first; regulars head for their spots.
- **Browsing:** a first-timer spends their type's browsing time (Locals 40 s, Retirees 50, Tourists 60, Party 25; × 0.5–1.5, less the more they know the floor; regulars about a third) sightseeing: wandering toward the surroundings their type likes (the pull is 2.5× the usual), learning the floor three times as fast while walking, and noting machines they like the look of (appeal 0.5+; up to 12 remembered). Browsing never counts as failing. A real standout (appeal 0.9+ in surroundings they like) can win them over early.
- **Settling:** after browsing they pick from machines in view, routes they know, and machines they noted, weighing appeal, the surroundings at the seat (weight 0.8), distance and a hot machine.
- **Favorite spots:** a regular's best session of a good visit (30 s+, in a good mood) becomes a favorite spot (3 kept, best first). When nothing is free where they are, they walk to each favorite in turn and look again. Spots that were built over are skipped (they can still walk to where one used to be).
- **Frustration:** each fruitless look after that adds 1 (1.5 in a bad mood under 40, 0.5 in a good one over 65); sitting down takes 3 off. At 4 they think "I can't find a machine I like"; at 10 they give up on the place ("nothing", an unmet need). Wandering in between keeps the type's pull (1.5×) and keeps teaching the layout.
- Searching for amenities gives up after 6 hops (9 in a good mood, 4 in a bad one).

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
- Intoxication 0–1.3 (≈0.25 tipsy, 0.5 drunk, 0.8 wasted; 1+ can pass out, docs/spec/incidents.md). It wears off slowly, 0.02 per floor-minute.
- **A drink in hand:** a guest holds one drink at a time and sips it over their type's drinking time (Locals 80 s, Retirees 100, Tourists 70, Party 50) while doing anything else (playing, walking, waiting). Each sip eases thirst and adds its share of 0.25 × strength intoxication (drinkers; sober guests get soft drinks at half price; was 0.16 before M4). Down to the last quarter, they'll take the next one; when it arrives the rest of the old one goes down in one. An empty glass is sometimes dropped as litter.
- Each guest draws an **intended level**: sober guests exactly 0; drinkers a right-skewed bell (mean/sd: Locals 0.35/0.15, Retirees 0.2/0.08, Tourists 0.45/0.2, Party 0.65/0.2), +0.1 if they came to drink, −0.03 if they came to gamble.
- **Overshoot:** each second the intended level rises by drift × intox / 60, with drift log-normal per person (medians 0.1 / 0.03 / 0.12 / 0.15, sigma 1.2; roughly tripled in M4): most stay near their bell, a few run away. Servers and comped drinks exploit that slope.
- Shows as a sideways stagger when walking, flushed faces at 0.25 and 0.5, and thoughts (tipsy, drunk, wasted). Spills, loud drunks, vomiting, passing out and fights are incidents (docs/spec/incidents.md).
- **Cut-off:** the house rule on drunkenness stops bars and servers serving anyone at 0.8+ (Moderate) or 0.5+ (Strict); Lenient and Ignore serve anyone ("They cut me off!").

## Drinks: bars, servers, policy
Servers are the main way drinks reach guests; bars serve whoever walks up.
- **Going to the bar:** only with nothing in hand, money for a drink, and real thirst (70+, or 55+ for a drinker still below their level). Came-to-drink guests head there first. At the bar they sit and drink; when one is finished they order another while still below their level (or thirsty), with money and floor time left, up to 4 a sitting. A full bar, or not being able to pay, puts them off for 60 s.
- **Server offers:** a guest says yes with chance = type readiness (Locals 0.35, Retirees 0.2, Tourists 0.45, Party 0.6) × thirst (0.4 + thirst/100) × (1 + 2 × how far below their level they are) (0.6 at or above it) × price (1.8 if the drink is comped, else 1.3 − 0.3 × price multiplier) × (1 + intox), at most 95%. Sober guests take soft drinks mostly when thirsty. Nobody takes one while holding more than a quarter of one; anyone asked isn't asked again for 30 s. More servers and more comps mean more chances to say yes, which is how they push intoxication up.
- **Server loop** (`staff.ts`): each server works one bar. Take orders: walk to the nearest eligible guest (starting near the bar, settled guests first) and ask everyone within 6 tiles ("Cocktails?"), until the tray holds 10 or 12 s have passed since the first order (owner, M4: was 2 tiles, 6 drinks, 20 s). Fetch: walk to the bar; the bartender pours one a second. Deliver: nearest guest first, skipping anyone who left or already has a drink (servers know where everyone is). Then start again near the bar. Servers walk faster than other staff.
- **Per-bar policy** (tap a bar): price multiplier 0–3× on the $7 base; comped share 0–100% (for guests who've played); strength Light 0.6 / Standard 1 / Strong 1.4; and where its servers work: anywhere, or one room (rooms are named in the room inspector). Each drink costs the house $1.50 ("Drink costs"). Pricey or weak drinks draw complaints.
- **Assignment:** a new server takes the bar with the fewest servers; tap a server to move them to another bar. Servers whose bar is sold move to the least-served one.

## Mood, visit score, thoughts
- Mood as in M2 (surroundings, luck, needs, annoyance, drink), with the group pull.
- **Visit score** = 0.35 × average mood + 0.3 × value + 0.15 × feel + 0.2 × needs met. Value = seconds played per dollar lost against the type's good-value rate (Locals 6 s/$, Retirees 12, Tourists 2.2, Party 3.3), 1 for winners, 0 for a visit with under 30 s of play. Feel = 0.2 + 1.6 × average round feel + 0.3 for a jackpot. Needs = 1 − unmet / 3 (leaving because nothing suited them counts as unmet).
- **Thoughts** are counted by id per day; the Guests tab shows each as a rate per day averaged over the last two days. Each has 2–3 wordings plus type voices (`alt`, `voice`), shown only on the guest's own card, the same wording each time for that guest. **Floor thought bubbles are gone.**
- New thoughts: hot machine, quick spin, time to go, quitting while ahead, my limit, win it back, waiting, drunk/wasted, free drink, served, pricey, weak, no ATM.
- Incident fields in type data (M4, docs/spec/incidents.md): `incidents` and `tolerance` per category, `policed`, `drama`. Groundwork for M5: `cheat` share. Cheats never look any different.
- Mood also gains a short-lived `buzz` from fun things seen (a winner cheering, a free round), the mirror of `annoy`; both decay 0.5 a second.

## Notifications
Jackpots are red ("bad" news level: red but queued normally). Only jackpots of $1,000+ or 500× the bet reach the ticker; the rest go to the log. The monthly "books closed" line is log-only too.

## Money scale (changed in M3)
`WAGERS_PER_ROUND` is 4 (was 10): at 10, a $90 budget lasted under a minute of play, far from the agreed visit lengths and losses. Running costs were scaled down about 40% to match what a seat now earns (wages $70 / $110 / $90; slot upkeep $2–4; bar $50, cage $35, restroom $15). The tutorial with a tech and a bar ends year 1 at about $7K–$15K (M2: $12K–$17K), with ~60 guests on the floor (M2: ~33, because visits are longer).

## Reference numbers and levers (sanity checks)
Until the game is near v1.0 these numbers are **sanity checks, not tuning goals** (owner, 2026-09-23): mechanics still to come will move them. Use them to catch logic errors: a type that never plays, never drinks, always gives up, or a number that jumps for no reason after a change. The "design intent" column is the agreed M3 starting target, kept for the eventual tuning pass.

Measured with `npm run targets` (Test Floor scenario, 300 days, seed 1), M4 build (guards on moderate house rules; one bar pours strong drinks, a quarter comped):

| | Locals | Retirees | Tourists | Party | Levers (↑ raises it) |
|---|---|---|---|---|---|
| Visit length (min) | 4.6 | 4.5 | 4.6 | 4.5 | ↑ `minutes`, ↑ `budget`, ↓ `play.stake`, ↓ quit-rule weights `winGoal`/`lossLimit`, ↑ `WAIT_LONG`, ↓ need rates (`needs`); `WAGERS_PER_ROUND` ↓ |
| Playing (min) | 2.0 | 2.0 | 0.7 | 0.4 | ↓ `browse`, more signs/visible machines, ↑ bar and restroom capacity, fewer incidents in view (↑ `tolerance`, guards, stricter rules) |
| Loss per visit | $55 | $38 | $26 | $0 | ↑ `play.stake`, ↑ `WAGERS_PER_ROUND`, lower paytable `rtp`, ↑ visit length |
| Budget (median) | $90 | $60 | $175 | $135 | `budget.median` / `sigma` / `cap` |
| Sober share | 27% | 61% | 12% | 6% | `drinking.sober` |
| Drinkers' intended level (median) | 0.32 | 0.17 | 0.40 | 0.68 | `drinking.mean` / `sd`, intent shift in `spawnGuest` |
| Drinks per drinker (median) | 1 | 1 | 1 | 2 | ↑ servers, ↑ bar policy `comp`, ↓ `price`, ↑ `drinking.accept`, ↓ `drinking.sip`, ↓ `OFFER_AGAIN`, ↑ `TRAY`, ↑ `OFFER_REACH` |
| Drinks from servers | 79% | 69% | 93% | 89% | ratio of servers to bar stools |
| Drinkers' peak intox (median) | 0.22 | 0.16 | 0.23 | 0.44 | drinks per drinker, ↑ `DRINK_UNIT`, ↑ strength, ↓ `SOBER_PER_MIN`, looser cut-off |
| Overshoot > 0.3 | 8% | 4% | 4% | 2% | ↑ `drinking.overshoot` (drift), more drinks |
| Never uses ATM | 38% | 74% | 31% | 26% | `atm.never` |
| ATM draw per trip | $60 | $60 | $100 | $65 | `atm.draw` |
| Group 1 / 2 / 3+ | 62/33/5% | 46/49/5% | 23/52/25% | 4–8 | `group` weights |
| Visit score | 0.57 | 0.54 | 0.46 | 0.39 | layout, `secPerDollar`, visit score weights in `visitScore`, incidents seen, being policed |

Drunk tails (drinkers, scratch diagnostic): 30% of party drinkers reach 0.5+, 6–9% 0.8+, 1–3% 1.0+; Locals and Tourists 7–19% reach 0.5+. Incidents per 100 guests and warnings/ejections are in the same report (docs/spec/incidents.md). Party numbers rest on ~30 groups per run and swing a lot between seeds; incidents cost Tourists and Party guests 0.1–0.4 min of play on this floor (measured with incidents switched off), the designed cost of an unruly floor.

Design intent (M3 starting targets): visit 6 / 8 / 4 / 5 min; loss $55 / $35 / $110 / $90; overshoot 5 / 1 / 10 / 20%; ATM draw $60 / $40 / $100 / $80; returning 85% every 3–20 days (median 7) / 70% every 7–30 (median 14) / 5% / none; chasing onset on an easy floor 1% / 0.3%.

- **Asserted** in `npm run check` (`generatorChecks` in `sim/debug.ts`): 3,000 draws per type through the real arrival path on a fixed seed, checking that budget medians, sober and never-ATM shares, drinkers' intended level and group sizes come out as **the type data says** (so a code bug fails the check, retuning the data doesn't), and that every draw is finite and within its caps. Invariants add: intoxication ≤ 1.3, a drink in hand between 0 and 1, trays ≤ 6, every bar has a policy, groups ≤ 8 with one leader and one type, no one withdraws more than they have, pool money never negative, and anyone marked "here" is on the floor or the sidewalk.
- **Reported only** (random outcomes are never asserted): `npm run targets` prints the table and ⚠ flags anything that looks like a logic error; `npm run economy` prints the tutorial's books.
- **Test floors must be realistic.** Measure on the Test Floor scenario (at least one of every object, signs, servers), never on the tutorial or an empty lot, or wayfinding failures swamp everything else.

## Save
Schema 6 (M4): see docs/spec/incidents.md.

Schema 5 (migration from 4): drink policy moves from the casino to each bar; guests gain a drink in hand, browsing time, frustration (replacing the fail count), liked machines and favorite-spot tracking; people gain favorite spots; servers gain a bar and start a fresh round.

Schema 4 (migration from 3): guests gain person id, group/leader, stake, floor time, intended level and drift, ATM traits, chasing and waiting; drink counts become intoxication. The per-type familiarity becomes a seeded pool whose regulars know the floor that well. State gains the pool, pedestrians, drink policy, and thought counts by day; the sidewalk is added to the map.
