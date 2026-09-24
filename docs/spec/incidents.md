# Incidents, house rules, authorities (M4)

Built in `src/sim/incidents.ts` (causes, witnesses, reports, guards, police, paramedics), with the catalog and rules in `src/data/incidents.ts`, type reactions in `src/data/guests.ts`, the cut-off in `src/sim/drinks.ts`, and the Authorities tab in `src/ui/panels.tsx`. FOUNDATIONS §10 and §13 are the frame; this is what was built. Numbers are starting values, tuned headless.

## Principles (owner, 2026-09-24)
- **Incidents come from causes** the player can see and change. Type data only scales how often a cause becomes an incident.
- **Guests react to what they see and to being policed**, never to the house-rule setting itself.
- **Only a guest whose own reports went unanswered calls the police**: 3 unanswered reports (`CALL_AFTER`). No per-room tally.
- **Police standing 0 loses the scenario** (the license is revoked).

## The catalog (data)
Each entry: category, witness mood effect, duration, reach (tiles, in view; half that heard through walls), mess left, whether it can be reported, the lowest house rule at which security steps in unasked, police weight, thoughts, and log text.

| Incident | Cause (checked once a second per guest) | Base chance/s | Witness mood | Notes |
|---|---|---|---|---|
| Loud drunk | intox ≥ 0.5 | 0.004 × intox/0.5 | −4 | 8 s, reportable |
| Stumbling | intox ≥ 0.6, walking | 0.02 | −1 | |
| Spilled drink | holding a drink, intox ≥ 0.3 | 0.003 × intox/0.3 | −2 | empties the glass, leaves a spill |
| Vomiting | intox ≥ 0.9 | 0.006 | −10 | leaves vomit (litter 12; janitors go for it first) |
| Passing out | intox ≥ 1.0 | 0.02 | −6 | lies on the floor until a guard or paramedic comes |
| Argument | mood < 35 next to another guest (2 tiles, not their group), one of them drunk | 0.004 × (1 + intox) | −5 | two guests; unanswered, 30% × (1 + worse intox) × type becomes a fight |
| Fight | an argument nobody stopped | — | −14 | two guests stop and fight; −3 police standing |
| Yelling at staff | intox ≥ 0.5, annoyance ≥ 12, staff within 3 tiles | 0.004 | −4 | |
| Breakdown | chaser (≥ 0.3) down 70%+ of their money | 0.002 | −3 | then they go home |
| Planter | bladder ≥ 85, intox ≥ 0.4, no restroom to be had (none, gave up, lost, or in a line), a planter within 4 tiles | 0.03 | −9 | leaves a puddle |
| Cheering | a jackpot just paid | 0.8 | +4 | |
| Buying a round | a jackpot, the winner a drinker at intox ≥ 0.15 | 0.5 | +8 | up to 5 drinkers nearby get a drink on the winner |
| Flirting | intox ≥ 0.25, mood > 60, someone nearby | 0.002 | +1 | |
| Another round? | intox ≥ 0.2, mood > 65, a light drinker nearby | 0.0015 | +2 | the other's intended level +0.08 |

- Chances are × the type's `incidents[category]`, × 0.4 with a guard in view within 6 tiles, × 0.4 for a guest already warned. A guest who starts one waits 20 s before the next (60 s after a warning).
- **Deferred:** vice (escorts, couples; needs the hotel elevator, now M9), underage guests (needs minors), drugs (M9 policies), bribery (M11).

## Types
| | Locals | Retirees | Tourists | Party |
|---|---|---|---|---|
| `incidents` intox / disorder / misconduct / celebration / social | 1 / 1 / 0.8 / 1 / 0.6 | 0.5 / 0.4 / 0.3 / 0.8 / 0.3 | 1.1 / 0.8 / 0.8 / 1.3 / 1 | 1.5 / 1.3 / 1.4 / 1.5 / 1.6 |
| `tolerance` (same order) | 0.4 / 0.2 / 0.1 / 1 / 0.8 | 0.1 / 0 / 0 / 0.8 / 0.5 | 0.6 / 0.3 / 0.2 / 1 / 1 | 1.1 / 0.6 / 0.5 / 1.2 / 1.2 |
| `policed` (minds being warned or thrown out) | 0.5 | 0.1 | 0.6 | 1 |
| `drama` (low = reports) | 0.4 | 0.1 | 0.5 | 0.9 |

## Witnesses
- Everyone within reach who sees it (sight line) or hears it (within half the reach, through walls) reacts once: a bad incident adds annoyance `−mood × (1 − tolerance)` (past tolerance 1 they enjoy it instead); a good one adds buzz `mood × (0.5 + drama)`. Heard only: half. Annoyance caps at 30, buzz at 20; both fade 0.5 a second and feed mood.
- A witness bothered by a reportable incident in view reports it with chance 0.06 × (1 − drama)²: "I told the staff about that." The first report of an incident shows on the ticker in yellow.

## House rules and security
- Per policed category (Drunkenness, Disorder, Misconduct): **Ignore, Lenient, Moderate, Strict**. Default Moderate.
- **Security guard** (new staff role, $100/mo, walks briskly): patrols; free guards take the nearest incident that needs them. An incident needs a guard when its rule is not Ignore and either the rule is at or above the incident's `respond` level (fights and passing out: Lenient; most others: Moderate; spills, stumbling, breakdowns: Strict) or someone reported it. An incident with a guard on the way lasts up to 30 s longer, so they arrive to it.
- Dealing with it (3 s): passed out → escorted home; breakdown → walked out gently; fight → both thrown out; anything else: Strict throws them out, Moderate warns first and throws out on a second offense, Lenient only warns.
- **Strict drunkenness**: guards also show wasted guests (0.8+) out before anything happens.
- **Cut-off**: bars and servers stop serving at 0.8+ (Moderate) or 0.5+ (Strict).
- **Being policed**: a warning adds 8 × `policed` annoyance ("Buzzkill."). Thrown out: the visit score × 0.4, the person's `ejects` count +1 (bans: docs/spec/cheats.md), and each companion gets 8 × `policed` annoyance ("They threw my friend out!"). A thrown-out leader takes the group.
- Reporters whose report was answered get a small lift ("Security sorted that out fast.").

## Reports and police calls
- An incident that ends with nobody dealing with it counts as unanswered for each reporter still here: "I told the staff and nobody came." At 3 unanswered, that guest calls the police (once per visit).
- **Passed out and nobody comes** within 45 s: someone calls the paramedics. A paramedic walks in and carries them out ($200, −5 police standing).

## Police
- Standing 0–100, starts at 75, recovers 0.2 a day. Costs: a police call −6, a paramedic −5, a fight −3, and anything an officer on the floor sees −2 × its police weight (plus a $100 fine for the serious ones).
- **Ladder** (a step is reached below its line, and left again 5 points above it):
  - below 60: a warning.
  - below 45: a $500 fine, and every police call from then on costs $400.
  - below 30: an officer inspects the floor every 4 days.
  - below 15: a raid. Three officers come in, the casino is fined $1,500 and closed for 3 days (at most once every 30 days).
  - at 0: the license is revoked and the scenario is lost. The casino closes for 30 days, then reopens with standing 30 if you keep playing.
- **Officers** walk the floor for 90 s after a call or an inspection. **Closed**: everyone is sent home (anyone passed out is carried out) and nobody comes in until it reopens, while costs keep running.
- **Regulator**: its own ladder and inspector since M9 (docs/spec/money.md); rigged machines join in M8.

## On the floor and in the UI
- Marks over heads: a music note (loud), red "!!" (arguments, yelling, fights), a scuffle cloud at fighters' feet, tears (breakdown), a green face (vomiting), confetti (cheering, a round), a heart (flirting), a raised glass (another round). Passed-out guests lie on the floor with a "Z". Vomit and spills stay on the floor until swept. Guards wear black suits with a radio, officers navy with a cap, paramedics white.
- Sounds: fight scuffle, cheer, retch, thud (passing out).
- Ticker: reports in yellow; police calls, fines, paramedics and warnings in red; raids and license loss urgent. Individual incidents stay off the ticker; fights, passing out, vomiting and planters go to the log.
- **Authorities tab**: police and regulator standing with the step reached, the three house rules with what each level does, the current cut-off, reports, police calls and ejections a day, and incidents a day (over the last two).
- Guest card: the incident they're in, warnings, unanswered reports and whether they called the police.

## Measured (Test Floor, 300 days, seed 1; `npm run targets`)
Two guards, Moderate rules, one strong-drinks bar (a quarter comped). Incidents per 100 guests, drunkenness / disorder / misconduct / celebration / social: Locals 15.5 / 0.6 / 0.9 / 12.1 / 3.3, Retirees 0.7 / 0.7 / 0.2 / 7.6 / 0.2, Tourists 7.3 / 0.3 / 1.7 / 6.3 / 1.7, Party 33.7 / 1.1 / 7.4 / 3.2 / 7.9. About 3% of guests warned and under 1% thrown out; police standing stays at the top. With no guards, every rule on Ignore and strong free drinks, the ladder runs its whole course within ~250 days, about 40 minutes of real play (paramedics, warning, fine, inspections, a raid, the license revoked). The tutorial (a strong half-comped bar, no guards) saw no police calls in a year.

Flags in `npm run targets`: a category that never fires, guards that never warn or throw anyone out, a police standing that never moves.

## Save
Schema 6 (migration from 5): state gains `incidents` (in progress), `incidentDays` (counts per day, with `_reports`, `_calls`, `_ejected`, `_medic`), `rules`, and `auth` (police standing, step, calls, last raid, next inspection; regulator; closed-until; revoked count). Guests gain `buzz`, `warned`, `unans`, `called`, `incAt` and `mem.ejected`; people gain `ejects`. New roles: `guard` (staff), `officer` and `medic` (visitors, not on the payroll).
