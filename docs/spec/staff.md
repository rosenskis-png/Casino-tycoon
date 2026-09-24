# Staff depth (M9)

`src/sim/crew.ts` (pay, skill, morale, honesty, theft, audits, zones), `src/data/staff.ts` (roles and numbers). Roles and their jobs are in docs/spec/floor.md, incidents.md, cheats.md and tables.md. All numbers are starting values, checked only against sanity flags until M11.

## Pay and skill
- **Pay is set per role** in the Staff tab, from 60% to 160% of the market wage in 10% steps (default 100%). Everyone in the role earns it. There is no hiring screen: a hire walks in at once, as before.
- Each hire has a hidden personal knack (0.8–1.2, uniform). **Skill = knack × pay^0.6 × morale factor** (0.8 at morale 0, 1 at 50, 1.2 at 100), held to 0.4–1.8. The staff card shows it as a word: Poor, Fair, Good, Great, Excellent.
- A janitor sweeps a spot in 1 s at skill 1 (halved by the owner, 2026-09-24).
- What skill does: walking pace (steps ÷ √skill), work time ÷ skill (sweeping, repairs, taking and serving drinks, a guard dealing with an incident), a dealer's round length ÷ √skill, and how likely guards, pit bosses and surveillance operators are to catch someone (× skill; an operator watches 8 × skill cameras).

## Morale (0–100, shown on the card and as a role average)
- Each day it moves a quarter of the way toward its target: **50 + 50 × (pay − 1)**, less overwork and trouble. A new hire starts at the target.
- **Overwork:** the share of the day spent working (not idle, waiting or patrolling) above 85% costs up to 20 points: −(share − 0.85) × 100. Dealing is a dealer's whole job, so dealers aren't worn down by a busy table.
- **Trouble:** guards lose 2 points per fight on the floor that day, divided among the guards (at most 15).
- **Firing someone honest** frightens everyone: −8 morale to all staff at once. Firing a crook costs nothing.
- Below 20, a worker quits with a 5% chance each day (on the ticker).

## Honesty and theft
- A hidden trait drawn at hire, for life: **crooked with chance 5% ÷ pay^1.5** (11% at 60% pay, 2.5% at 160%). Bartenders and cage tellers come with their bar or cage (in its upkeep): each bar and cage is crewed by a crook 5% of the time, re-rolled when one is caught.
- Crooks steal when they get the chance, more when unhappy (× 1.5 − morale / 100):
  - **Slot tech:** 40% of repairs, pockets $20–60 from the machine (machines).
  - **Drink server:** 30% of paid drinks, pockets the price (bar).
  - **Dealer:** half of all rounds, palms 2% of the round's bets, at least $1 (tables). A crooked dealer never catches a cheat at their table.
  - **Bartender:** 30% of paid drinks at the bar (bar). **Teller:** 30% of withdrawals and cash-outs, shorts $5–25 (cage).
  - **Guards, pit bosses and operators who are crooks look away:** they catch neither cheats nor staff.
- **Catching staff:** each theft has a chance to be seen: 2% (the count flags it) + 12% × skill per honest guard within 8 tiles in view + 15% × skill per honest pit boss in view (dealers) + 10% × the watched camera field there. A caught worker is fired on the spot and a replacement is hired automatically (same job, room and bar; M9.6, owner's call), the money is recovered, and the ticker says who caught whom. A caught bartender or teller is replaced.
- **The monthly count** posts what went missing as shrinkage lines in the books (bar, cage, tables, machines) and a log line. That is the symptom: the player learns where money leaks, not who takes it.

## Patrol zones
Janitors, slot techs, guards and pit bosses can be kept to one room (the staff card; "Anywhere" by default). They look for work and patrol only there; guards still run to trouble anywhere. Drink servers keep their bar's service area (docs/spec/guests.md).

## Save
Schema 11: staff gain `st` (knack, crook, morale, busy and counted beats today, zone tile); state gains `crew` (pay per role, shrinkage pending per area); bars and cages gain `crook`.
