# Staff depth (M9)

> **M11.2 (owner's playtest):** wages and upkeep halved (janitor $35, tech $55, server $45, security $60,
> operator $60, pit boss $70, entertainer $45). Security absorbs the enforcer's job (docs/spec/cheats.md).
> **Entertainer** (new): walks to where the crowd is (a guest in their zone, at random), performs 30–45 s, moves
> on. Each beat of an act, guests in view within 5 tiles have fun (0.5 × taste × a beat of fun time, which counts
> toward the visit like a show) and a lift (buzz +1.2 × taste); taste by crowd (`ENTERTAIN`): families 1.5,
> tourists 1.2, party 1, conventioneers 0.8, retirees 0.7, locals 0.6, high rollers 0.2; skill scales it. Can be
> kept to a room. A bright jacket, a bow tie and a shock of curls.

> **M12 (The Outfit): Casino host** ($70). Walks to the nearest guest at a game in their zone whose crowd likes the
> finer things (luxury taste 0.5+: High rollers, Conventioneers, Tourists) or a whale, not yet looked after this
> visit, and spends 6 s with them: a drink on the house (served like a server's, comped), mood +12, a lift (buzz +6)
> and 25% more time on the floor, each × the crowd's taste for luxury × skill. "The host here knows my name."
> A gold dinner jacket, a bow tie and a name badge. Can be kept to a room (the salon).

`src/sim/crew.ts` (pay, skill, morale, honesty, theft, audits, zones), `src/data/staff.ts` (roles and numbers). Roles and their jobs are in docs/spec/floor.md, incidents.md, cheats.md and tables.md. All numbers are starting values, checked only against sanity flags until M11.

## Pay and skill
- **Pay is set per role** in the Staff tab, from 60% to 160% of the market wage in 10% steps (default 100%). Everyone in the role earns it. There is no hiring screen: a hire walks in at once, as before.
- Each hire has a hidden personal knack (0.8–1.2, uniform). **Skill = knack × pay^0.6 × morale factor** (0.7 at morale 0, 1 at 75, 1.1 at 100; M11.4), held to 0.4–1.8. The staff card shows it as a word: Poor, Fair, Good, Great, Excellent.
- A janitor sweeps a spot in 1 s at skill 1 (halved by the owner, 2026-09-24).
- What skill does: walking pace (steps ÷ √skill), work time ÷ skill (sweeping, repairs, taking and serving drinks, a guard dealing with an incident), a dealer's round length ÷ √skill, and how likely guards, pit bosses and surveillance operators are to catch someone (× skill; an operator watches 8 × skill cameras).

## Morale (0–100, shown on the card and as a role average)
- Each day it moves a quarter of the way toward its target: **75 + 100 × (pay − 1)**, less overwork and trouble. A new hire starts at the target. (M11.4, owner: staff on market pay with a normal workload are happy; 60% pay is unhappy, 80% content.) Card words: happy 70+, content 50+, unhappy 30+, miserable.
- **Overwork:** the share of the day spent working (not idle, waiting or patrolling) above 90% costs up to 15 points: −(share − 0.9) × 100. Dealing is a dealer's whole job, so dealers aren't worn down by a busy table.
- **Trouble:** guards lose 2 points per fight on the floor that day, divided among the guards (at most 15).
- **Firing someone honest** frightens everyone: −8 morale to all staff at once. Firing a crook costs nothing.
- Below 20, a worker quits with a 5% chance each day (on the ticker).

## Honesty and theft
- A hidden trait drawn at hire, for life: **crooked with chance 5% ÷ pay^1.5** (11% at 60% pay, 2.5% at 160%). Bartenders and cage tellers come with their bar or cage (in its upkeep): each bar and cage is crewed by a crook 5% of the time, re-rolled when one is caught.
- Crooks steal when they get the chance, more when unhappy (× 1.75 − morale / 100):
  - **Slot tech:** 40% of repairs, pockets $20–60 from the machine (machines).
  - **Drink server:** 30% of paid drinks, pockets the price (bar).
  - **Dealer:** half of all rounds, palms 2% of the round's bets, at least $1 (tables). A crooked dealer never catches a cheat at their table.
  - **Bartender:** 30% of paid drinks at the bar (bar). **Teller:** 30% of withdrawals and cash-outs, shorts $5–25 (cage).
  - **Guards, pit bosses and operators who are crooks look away:** they catch neither cheats nor staff.
- **Catching staff:** each theft has a chance to be seen: 2% (the count flags it) + 12% × skill per honest guard within 8 tiles in view + 15% × skill per honest pit boss in view (dealers) + 10% × the watched camera field there. A caught worker is fired on the spot and a replacement is hired automatically (same job, room and bar; M9.6, owner's call), the money is recovered, and the ticker says who caught whom. A caught bartender or teller is replaced.
- **The monthly count** posts what went missing as shrinkage lines in the books (bar, cage, tables, machines) and a log line. That is the symptom: the player learns where money leaks, not who takes it.

- **(M11.1) A big organization's problem (owner):** every theft chance × (staff − 8) / (40 − 8), clamped 0–1, counting every worker plus one per bar and cage crew. A family-sized casino has no theft; a big one has it at full strength.

## Patrol zones
Janitors, slot techs, guards and pit bosses can be kept to one room (the staff card; "Anywhere" by default). They look for work and patrol only there; guards still run to trouble anywhere. Drink servers keep their bar's service area (docs/spec/guests.md).

## Dealers come with the tables (M11, owner)
- A table's price includes its dealers ($400 per dealer spot (M11.2; was $800), added to each table's cost; craps has two) and there are no wages. Dealers aren't hired, paid or given a pay level (skill is their knack alone); the Staff tab lists them as "come with the tables".
- The table system keeps one dealer per dealer spot: a new table's dealers start at their spots; selling a table lets its dealers go; a dealer caught stealing (or fired) is replaced. Checked as an invariant by `npm run check`.

## Spreading out (M11, owner)
Staff of the same job drift apart like a soft repel field. When a janitor, tech, guard or pit boss picks somewhere to patrol, it tries 4 spots (or 3 wander points) and takes the one with the least colleague pressure: Σ e^(−d/6) over colleagues of the same job, by where each stands or is walking to. A pit boss compares two tables the same way. Work (litter, broken machines, incidents) still goes to whoever is nearest.

## Uniforms (M11, owner)
Every job has a uniform color the player sets in the Staff tab (tap the job's color: 16 swatches, `UNIFORM_COLORS`); it dyes the job's parts (`UNIFORMS`: janitor coverall and cap, tech vest and hard hat, server vest, guard jacket, operator polo, dealer jacket, pit boss jacket, enforcer top). Defaults: janitor teal, tech orange, server black, guard red, operator grey, dealer wine, pit boss charcoal, enforcer black. Silhouettes and props: docs/spec/art.md §6.

## Hand pays (Batch B, owner 2026-09-26)
- A guest who wins a machine's **top prize** is paid by hand: the design's top jackpot level (the Grand, fixed or
  progressive, must-hit-by included), or on a design without jackpots its best base-game pay; on video poker the
  royal flush. Nothing smaller: every other win pays on the machine.
- The machine locks (`PlacedObject.hp`, dollars; `hpAt`) and the winner stays in the seat. The nearest free staff
  member walks over (slot techs first, then casino hosts, then janitors, drink servers with an empty tray and
  entertainers; guards, dealers, pit bosses and operators are never pulled away), counts it out for 5 s, and the
  machine unlocks. A gold $ flashes over the machine meanwhile.
- With nobody on staff who could come, the win pays at once. If nobody gets there within 90 s, a supervisor pays it.
- The celebration: guests on their feet within 10 tiles who can see it stop to watch (60%, as at a hot craps table),
  seated players nearby cheer (a lift), and passers-by keep being drawn for 30 s. The winner gets a bigger lift when
  paid. Measured (Test Floor, 90 days): 8 hand pays, average wait 20 s, longest 35 s.
- The play-it-yourself machine shows its hand-pay banner on the same rule (was: any jackpot of $1,200 and up).

## Save
Schema 25 (Batch B): `PlacedObject.hp`/`hpAt`, `Agent.hp` (the machine a staff member is paying).

Schema 18 (M11): `crew.uniform` (color per job; missing = default). Dealers from older saves are matched to the tables on load.

Schema 11: staff gain `st` (knack, crook, morale, busy and counted beats today, zone tile); state gains `crew` (pay per role, shrinkage pending per area); bars and cages gain `crook`.
