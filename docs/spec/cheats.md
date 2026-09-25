# Cheats, suspicion, enforcement, luck (M5)

Built in `src/sim/cheats.ts` (hidden tags, cheating spells, getting caught, the suspicion estimate, marking,
enforcement jobs, consequences and rumors), with the numbers in `src/data/cheats.ts`, cameras and the dumpster
in `src/data/objects.ts`, operators and enforcers in `src/data/staff.ts`, and the UI in the guest card, the
room card and the Authorities tab. FOUNDATIONS §11 and NORTH_STAR "Leakage, cheats, and enforcement" are the
frame; this is what was built. Numbers are starting values, tuned headless.

## Principles (owner, 2026-09-24)
- **Cheats are about 1% of guests.** Uncommon, but over a scenario the player meets a meaningful number.
- **Nothing distinguishes a cheat** (or a lucky guest) on the floor. Only the player's tools and a catch tell.
- **Dark enforcement is uncensored but clean**: no blood, no nudity, no lingering suffering. Quick animations
  that don't pull punches. Available from the start, as soon as an enforcer is hired.
- **Caught cheats get the house treatment**: the enforcement room sets what happens on a first offense and on
  any later one, from the same four actions the player can order by hand.
- **A ban covers the whole group.**

## Hidden tags
- **Luck**: 3% of people are lucky and 3% unlucky (they cancel out). A lucky guest's payback on any machine is
  exactly +20 points (an 88% machine pays them 108%), an unlucky guest's −20: a lucky guest's losing wager is drawn
  again with chance 0.2 / (payback × (1 − hit rate)); an unlucky guest's win is voided with chance 0.2 / payback
  (`npm run headless` checks both are real probabilities giving exactly ±20). So luck shows as winning more often,
  like cheating does. Pool people keep theirs for life; one-off guests draw per visit.
- **Cheat**: each person is a cheat with their type's `cheat` share (1%; Retirees 0.5%). Kept for life by pool
  people. A cheat who leads a group brings a **crew**: each companion cheats too with chance 0.5.

## Cheating (slots; tables from M7; crooked dealers look away from M9)
- A cheat arrives with a **take**: the most they mean to walk out with, log-normal median $400 (σ 0.5, $150–$2,500).
- They play honestly between **spells**. After 20–60 s of honest play at a machine, a spell starts and lasts
  30–90 s. During a spell they bet the machine's maximum and half their wagers are rigged wins paying 4× the bet;
  the rest play normally (about 245% back). Rigged wins are steady, not jackpots, so a spell reliably pays.
- Up by their take, they stop cheating, cash out and leave ("done"). Until then they ignore the usual quit rules
  (win goal, loss limit, a jackpot) and plan on 1.5× their type's usual floor time. Their group can still take them home.
- A cheat who was warned stops cheating for the rest of that visit.

## Sized to the casino (M11.1)
A cheat's take is the log-normal draw above (median $400) sized to the casino (docs/spec/money.md "Sized to the casino"), never under $20: at a small locals casino a cheat is after tens of dollars, at a big one thousands. Measured on the tutorial (3 seeds, a year): cheats took $620–$830 (was $1,500–$5,000, up to 80% of the slot win).

## Getting caught in the act
Checked once a second during a spell. Chance per second:
- 0.001 by chance (a teller, another player noticing),
- + 0.006 for each security guard in view within 8 tiles (visible surveillance),
- + 0.004 × hidden surveillance (the SRVH field at the seat, from cameras) × camera coverage,
- × 2.5 if the guest is marked.

**Camera coverage**: cameras only catch anything while a surveillance operator is at a desk in a **Back office**
room. Each operator watches up to 8 cameras: coverage = min(1, 8 × operators at a desk / cameras).
A 40-second spell next to a guard is caught ~21% of the time; under a camera with coverage ~25%; unwatched ~4%.

**Caught**: a red ticker item ("Caught cheating: Name at Liberty Bell"), certain. Whatever they are up this visit
is recovered (the ledger's *Recovered* line). Their offense count goes up (kept for life by pool people), and the
house treatment for a first or a repeat offense follows (below). They are held on the spot until it's carried out.

## Suspicion tools (the guest card)
Since M9.5 research raises the tier above the scenario's own (docs/spec/research.md); each scenario sets how many it starts with (`tools`): Lucky Horseshoe 2,
Free Play 4, test floors 4.
1. **Session length**: time on the floor and at this machine.
2. **Win/loss vs expectation**: net result next to what the machines' math expected (±), with a plain reading
   ("about as expected", "well above", "far above").
3. **Wallet vs arrival bankroll**, plus ATM trips and draws.
4. **Cheat estimate**: a probability. Built from how odd their play is, in standard deviations from the math:
   how often they win (rigged wins and luck both show there) plus half of how much (jackpots show there), against
   a model of honest players (the math, 3% lucky, 3% unlucky, a broad tail for hot streaks) and cheats (well above, around 7 SDs,
   or no different yet); the type's prior share; and a noisy factor that shifts every 30 seconds. Capped at 92%
   unless they were caught (then 100%). Lucky honest guests and hot streaks produce real false positives.

## Marking
Any guest can be marked from their card. Marked guests show a red ring on the floor. Options: alert when they
leave, alert when they come back (pool people keep the mark between visits). Marking makes a catch 2.5× likelier.

## Enforcement
- **Enforcer** (new staff role, $150/mo). **Surveillance operator** ($120/mo). **Camera** (Security in the Build
  menu, $400, ceiling dome, doesn't block). **Dumpster** (outdoor, $300).
- The player orders an action on any guest from their card; caught cheats get the house treatment. A free
  enforcer takes the job; the target stops what they're doing and waits.
- **Where**: warnings happen where the guest stands. A ban walks them out the nearest exit. A beating or a
  disappearance happens in an **Enforcement room** if there is one the enforcer can reach (the guest is walked
  there), otherwise on the spot, in front of whoever is watching.
- Without an enforcer, security guards can carry out warnings and bans; a beating or disappearance ordered
  as a house treatment becomes a ban. Nobody on staff: a caught cheat is banned and shown out on the spot.

| Action | What happens (animation) | To the guest |
|---|---|---|
| Warning | a word in their ear (2 s) | mood −, stops cheating this visit, their group minds a little |
| Lifetime ban | walked to the exit | turned away at the door on future visits; covers the whole group (the leader's person) |
| Beating | the enforcer shoves and punches 3 times (2 s): the guest recoils with each hit, then doubles over and limps out slowly | visit ruined, disposition −40 |
| Disappearance | a small gun flashes once, the guest drops, is zipped into a black bag and carried to the dumpster (or out the nearest exit) (3 s + the carry) | gone for good; removed from the pool |

## Consequences
Each action adds to a rolling **enforcement heat** (warning 0.3, ban 0.5, beating 1.5, disappearance 3;
×0.97 a day). Every cost below is × (1 + heat / 4).
- **Base** (a lone guilty cheat, unseen): beating −0.5 police standing, disappearance −1. Warnings and bans: nothing.
- **Witnesses**: guests who see it (in view, 8 tiles): a beating −12 mood, a disappearance −20 ("They dragged
  someone off!"), a ban −3. Each witness of a beating or disappearance tells the police with chance 0.25 ×
  (1 − drama): −2 police standing each (at most 3 per incident); the first one puts a rumor on the ticker.
- **Company**: the target's group. A beating: they are upset (+15 annoyance) and leave with them; 50% they call
  the police (−4). A disappearance: they look for their friend for a minute, then report them missing (−8
  police, red ticker).
- **Innocent** (the sim knows): 2–8 days later a rumor reaches the ticker and the target's type loses reputation:
  warning 0.5, ban 1.5, beating 4, disappearance 8, × the type's `repSensitivity`. An innocent who disappeared
  also costs −6 police standing when the rumor lands.
- **Importance** (VIPs, whales): hook only. Whales arrived in M9 (docs/spec/money.md); enforcement on them has no extra cost yet.
- The regulator has no M5 triggers. M9 gave it skimming, unpaid winnings and weak controls (docs/spec/money.md); rigged machines come with M8.

## On the floor and in the UI
- Marked guests: a red dashed ring. Held guests stand still. Beaten guests walk bent over at half speed.
  The bag is a black body bag carried over the enforcer's shoulder. Enforcers wear a dark leather jacket;
  operators a grey polo and glasses.
- Guest card: the suspicion tools the scenario allows; Mark (with the two alert options); Warn / Ban / Beat /
  Disappear (the last two ask for a second tap). A caught guest shows "Caught cheating".
- Room card for an Enforcement room: the house treatment for a first and a repeat offense (also in the
  Authorities tab, with caught cheats, enforcement heat, cameras and operators).
- Log/ticker: catches red; missing-person reports red; rumors yellow; banned people turned away go to the log.
- Sounds: a three-tone alarm on a catch; three punches timed to the beating; one muffled shot and a thud.

## Measured (headless, `npm run targets` and the tutorial economy run)
- Test Floor, 300 days, seed 1 (two guards, six cameras, an operator in the Security office, an enforcer in the
  Back room): 11 cheats among 1,955 guests, 3 caught (banned), the house lost $1,735 to cheats (median $126 each)
  and recovered $405. Lucky guests' return 0.97, unlucky 0.52 (small samples; jackpots dominate).
- Cheat estimate, sampled every 20 s once a guest has wagered $50: cheats median 75% (p90 86%); honest winners
  median 0.4%, 1 in 100 above 27%; honest losers never above 2%.
- Tutorial (no security at all), a year, seeds 1-3: 10-13 cheats cost $1.5K-2.3K of a $5K-7K slot win.
- Big Floor steady state: 2.2 ms/tick at 5,000 guests, same as M4.

Flags in `npm run targets`: no cheats at all, no cheat ever caught, cheats who got away mostly lost money.

## Save
Schema 7 (migration from 6): people gain `luck`, `cheat` (drawn from a hash of their id at the type's share),
`caught`; guests gain `mark`, `spell`, `spellAt`, `take`, `caught`, `held`, `hurt`, `mem.ev`, `mem.v`,
`mem.hits`, `mem.hexp`, `mem.hvar`, `mem.banned`;
`person.ban` 1 = banned (2 is never used: the disappeared are removed); state gains `enf` (policy, heat, jobs,
rumors, missing-person reports due; counts per day under `_caught`, `_enf`, `_banned`). Enforcers gain `bag`.
New roles: `operator`, `enforcer`. New activities: `held`, `enforce`, `carry`, `watch`. New RNG stream: `cheats`.

## Tables (M7, docs/spec/tables.md)
- Cheats cheat at every house game, not at poker or bingo (they'd be taking other guests' money). At a table, a spell's bets are paced to the take (up to take / 40 per hand).
- A cheat at a table is caught more often: +1.2%/s per pit boss in view (8 tiles, line of sight) and +0.2%/s while the table's dealer is at work, on top of guards, watched cameras and chance.
- Luck works at every game: shared-outcome games turn a losing hand into the bet's win (or a win into a loss) at chances that keep the ±20-point shift exact (`sharedPay`, checked by `npm run headless`).
- Card counters (hidden, for life) are not cheats. A pit boss watching one at blackjack tags them with 1%/s: they're marked and the ticker says so. Warning or banning them is the player's call, with the usual consequences for acting on someone who broke no rule.
