# Guests, M3 design (agreed 2026-09-23, not built)

This file is the M3 plan, decided in chat with the owner. `docs/spec/guests.md` describes what is built now (M2 + M2.5). When M3 ships, this merges into guests.md and this file goes away. **Target numbers are starting targets to tune toward, checked headless; they are not hand-set knobs.**

## 1. Types and the population

- **A type is who someone is**, with its own tastes, budget, seasons and drinking. Group makeup, play style and whether they chase are drawn per person from ranges the type sets. Types overlap at the edges, so one guest proves nothing and a crowd is the signal.
- **Every type earns its slot by wanting something different** that the current game can express. A type whose wants aren't built yet waits for that milestone.
- **M3 roster:** Locals, Retirees, Tourists, Party groups (all men, all women, or mixed).
- **Flagged for later:** Families (shows and food, M6/M9), date-night Couples (dinner, shows, privacy), Conventioneers (events, M9), High rollers (tables and high-limit rooms, M7/M9), Whales (events, M9, bankrolls sized to game money). Advantage players (card counters) are a hidden tag in M7 with tables.
- **Couples are a group size, not a type.** Each type sets its own chance of arriving as a pair.
- **The population is a pool of real people.** Each scenario has a finite market.
  - **Recurring types** (Locals and Retirees in M3) are stored individuals with a small record each: name, looks seed, type, savings, monthly disposable income, floor memory (knowledge + last visit date), last visit score, chasing level, and ban/marked flags (M5). Returning people are the same person.
  - **One-off types** (Tourists and Party groups) are generated fresh. A small share of tourists come back (kept in the pool).
  - Reputation for recurring types is the pool's collective memory: the average disposition of its people, which updates only when someone visits. One-off types keep a word-of-mouth number per type, moved by departing guests.
  - This replaces the M2.5 per-type familiarity stand-in: each person carries their own floor knowledge and last-visit date.
- **Chasing is a hidden per-person level, not a type.** Floors that make it easy to keep playing raise it over repeated visits: low exit visibility, easy ATMs, pushed drinks, an early big win. A high chaser plays fast and long, ignores limits, and draws down savings across visits until they stop coming. They're counted as their own type (mostly Locals).
- **No time of day:** types are told apart by season, events, marketing and payday. Locals surge around the 1st and 15th of each month.

## 2. Sidewalk and the entrance threshold

- Scenario data defines **sidewalks** (tiles, plus spawn/despawn ends) and **entrances**. New terrain code for sidewalk, appended. A cruise ship can use a corridor and a hatch the same way.
- **Pedestrians** walk the sidewalk. At each entrance they glance in using the M2.5 sight rules (open doors, what's visible inside, noise and prestige near the door, a crowd) and either enter or walk on.
- **Pool regulars come on purpose** and head for an entrance. **One-off types are mostly passers-by** you convert, plus some who came for you (reputation / word of mouth).
- **Only someone who crosses the threshold is a guest:** counted in arrivals, scored, and able to move reputation. Passers-by only add to a "walked past today" counter, a symptom with no reason given.
- Pedestrians on screen are capped for performance.

## 3. Groups

- One type per group. There's a leader. Each member has their own budget.
- They try to sit next to each other, or else within sight of each other. Members split briefly for needs and meet back up.
- Mood pulls about 20% toward the group average. The leader's floor knowledge is shared.
- A broke or bored member waits nearby ("Are you done yet?"). **The group leaves when the leader quits, or when half the group has been waiting too long.**
- If a member is removed, the rest react (M5).

## 4. Intentions

Gamble, drink, or pass by (the sidewalk). A drink-first guest who sees a machine they like can convert ("just one quick spin").

## 5. Betting

- **Bet size is a fraction of this visit's budget** (credits chosen to match).
- **House-money effect:** after winning, bets rise and winnings feel like loose money. **Break-even effect:** after losing, bets rise to get back to even.
- **Hot machine belief:** guests are drawn to a machine they just saw pay out. That makes jackpot visibility a layout lever.
- A hook for near-misses and small wins that pay back less than the bet, to be filled by the slot designer (M8).
- **Quit rules:** win goal, loss limit, until broke, leave on a jackpot, plus a **floor-time budget** per visit. Fatigue means leaving (no hotel in M3).
  - Intoxication loosens the loss limit and raises the win goal, continuously.
  - Chasing erodes limits across visits.

## 6. Money and the ATM

- **Recurring guests:** savings, plus a monthly disposable income that refills their spending money between visits. A visit budget is drawn from what they have.
- **One-off guests:** a trip budget.
- **ATM curve:**
  - Some guests (per type) never touch the ATM (the "sober analogues").
  - Everyone else has a skewed bell of **how much they could draw** (savings for regulars, a trip cap for one-offs) and **how much they actually draw** each trip.
  - The **chance of going back** rises with break-even chasing, intoxication, chasing level, and bad mood from losing, and falls after a win.
  - The long tail is rare but real: a regular who drains their entire savings across visits.
  - Hard cap: nobody draws more than they have.
- Credit waits for M9.

## 7. Drinking: an inhibition spectrum

- Intoxication is continuous (0 = sober, ~0.25 tipsy, ~0.5 drunk, ~0.8 wasted; above 1 is pass-out territory for M4). It rises per drink × drink strength and wears off over floor time.
- Each guest draws an **intended level**:
  - Sober guests are exactly 0.
  - Drinkers draw from a skewed bell, centered by type and shifted up by intent (came to drink or party) and down by came to gamble.
- **Overshoot:** being intoxicated nudges the intended level upward, since inhibition is what drinking erodes. Most land near their bell and a few run away. Free drinks and servers exploit that slope.
- Effects scale smoothly with intoxication: bet size, how loose their limits get, ATM odds, and walk wobble.
- **Visible in M3 as a stagger walk plus thoughts.** Flushed sprites wait for the M3.1 art pass. Spills, fights, vomiting and passing out arrive with incidents in M4.

## 8. Drinks, servers, policy

- **Drink servers** are hireable staff who walk the floor and serve guests (seated players first).
- **Drink policy (player-set):**
  - a price multiplier, 0–3×, on the base drink prices
  - a comped percentage, 0–100% of drinks served free to players
  - drink strength
- Comp-seekers nurse cheap machines only when drinks are comped.

## 9. Mood, visit score, thoughts, reports

- **Visit score** = how long their money lasted per dollar lost (capped for winners), how good it felt, and needs met.
- **Thoughts panel:**
  - Counts are averaged over a rolling window of the last ~2 in-game days instead of instant counts.
  - Counted by thought id: different wordings of the same thought count as one.
  - Each thought has 2–3 wordings, shown only on the guest's own card.
  - Each type has a slightly different voice.
- **Floor thought bubbles are removed.** The Guests tab is where thoughts are read.
- **Reports** (M4) are rare. They come from negative incidents left unaddressed while many low-drama guests are present.
- Groundwork fields in the type data now, used in M4/M5: drama appetite, reaction to house-rule leniency, incident tendencies, and the cheat tag. Cheats never look any different.

## 10. Notifications

- **Jackpots are red (bad news for the house), not green.**
- **Fewer ticker items:** only big jackpots (≥ $1,000 or ≥ 500× the bet) reach the ticker. Smaller ones go to the log only.
- Other routine notices are reviewed against the same "would the owner want to be interrupted" bar.

## 11. Target outcomes (starting targets; tuned headless)

Floor-minutes are real minutes at 1×. Money is what guests see. **Shape** says how values spread: log-normal (long right tail), normal, uniform, bimodal, or a point mass plus a curve.

| | Locals | Retirees | Tourists | Party groups |
|---|---|---|---|---|
| In the pool (return) | 85%, every 3–20 days (log-normal, median 7) | 70%, every 7–30 days (median 14) | 5% return | none |
| Group size | 1: 60%, 2: 35%, 3–4: 5% | 1: 40%, 2: 55%, 3–6: 5% | 1: 25%, 2: 50%, 3–5: 25% | 4–8, uniform |
| Visit budget | log-normal, median $90, cap $600 before ATM | log-normal, median $60 (tight), cap $200 | log-normal, median $180, cap $2,000 | log-normal, median $120 each, cap $800 |
| Visit length | normal 6 ± 2 min, min 1; chasers far longer | normal 8 ± 3 min | normal 4 ± 1.5 min | normal 5 ± 2 min |
| Typical loss per visit | median $55 | median $35 | median $110 | median $90 |
| Sober share | 30% | 60% | 15% | 5% |
| Drinkers' intended level | skewed bell, mean 0.35, sd 0.15 | mean 0.2, sd 0.08 | mean 0.45, sd 0.2 | mean 0.65, sd 0.2, cap 1.3 |
| Overshoot (ends > 0.3 above intent) | ~5% | ~1% | ~10% | ~20% |
| Never uses ATM | 35% | 75% | 30% | 20% |
| ATM users: draw per trip | log-normal, median $60 | median $40 | median $100 | median $80 |
| Chasing onset (per visit, on an easy floor) | ~1% | ~0.3% | n/a (one-off) | n/a |

- **Savings** (regulars): log-normal with a long tail, e.g. Locals median $2,500 and Retirees median $8,000. Monthly disposable income: Locals median $300, Retirees $200.
- **Hard caps:** nobody draws more than they have; intoxication ≤ 1.3 in M3; group size ≤ 8; pedestrian count on screen is capped.
- **Checked headless:** medians, the proportions above, and that every tail stays finite. We never assert a single random outcome.

## 12. Save and performance

- Save schema bump with a migration: M2.5 per-type familiarity becomes a seeded pool; guests gain person ids, intended level, ATM traits and chasing; state gains the pool, sidewalk data and drink policy.
- Pool records are small. Pedestrians and groups count against the perf budget, and the Big Floor perf test is re-run once M3 is built.

## Not in M3
Type outfits and silhouettes, flushed drunk sprites, and a real sidewalk tile look are all the **M3.1 art pass**. Families, Couples, Conventioneers and High rollers come later as listed above. So do incidents and reports (M4), and bans, marks and removed-member reactions (M5).
