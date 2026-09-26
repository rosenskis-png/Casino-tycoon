# Games catalog and table rules (M7)

FOUNDATIONS §7 and §7.2 are the frame; this is what M7 builds. Owner's calls are in DECISIONS (2026-09-24, green light for M7); the numbers are starting values, tuned only against sanity flags.

## Catalog

| Game | Footprint | Seats | Staff | Round (1×) | Edge (default rules) | Character |
|---|---|---|---|---|---|---|
| Video poker | 1×1 machine | 1 | none (breaks, slot tech) | 3 s | 0.5–4.5% (9/6), by skill | quiet, a thinking player's machine |
| Blackjack | 3×1 table | 5 stools | 1 dealer | 7 s | ~0.4% + the player's mistakes | the table everyone knows |
| Roulette | 4×1 table (wheel at one end) | 5 stools | 1 dealer | 10 s | 5.26% (double zero) | slow, social, every bet the same edge |
| Craps | 5×2 table | 9 standing | 2 dealers | 8 s | 1.41% pass (less with odds) | loud, the whole table wins together; onlookers |
| Baccarat | 4×2 table | 6 chairs | 1 dealer | 8 s | 1.06% banker, 1.24% player, 14.4% tie | low edge, big bets, wants privacy |
| Poker | 4×2 table | 6 chairs | 1 dealer | 12 s | none: a rake of each pot | player against player; needs 2 |
| Keno lounge | 4×1 board | 8 chairs | 1 dealer (writer) | 20 s | 27.7% / 28.6% / 28.7% (4 / 6 / 8 spots) | slow, cheap, retirees |
| Bingo hall | 6×1 board | 18 chairs | 1 dealer (caller) | 25 s | the hold (30%) | a crowd game; the prize grows with the room |

Build menu: machines under **Games**, tables and lounges under **Tables**. Tapping one opens its card: open or waiting on dealers, the house edge its rules give, the limits and rules (dropdowns), and what it has taken. The sportsbook arrived in M9.5 with the event calendar (docs/spec/calendar.md).

Code: `src/data/tables.ts` (rules, limits, the math), `src/sim/tables.ts` (dealing, dealers, pit bosses, `setTable`), `src/sim/gaming.ts` (machines, and `settle`, which books every round), objects in `src/data/objects.ts`.

## The math (exact, like slots)

- A visible round resolves `WAGERS_PER_ROUND` (4) hands. Each hand is one wager drawn from its true distribution. What the table shows (cards, the wheel's number, the dice, the keno board) is that round's last real hand; each seat shows whether its own round won.
- **Shared outcomes.** Roulette, craps, baccarat and keno draw one outcome per hand for the whole table (the number, the decision, the coup, the 20 balls); each player's result follows from their own bet. Blackjack and video poker draw per player.
- **Pool games.** Poker and bingo take nothing from the house's pocket: every player puts in, one winner takes the pot less the rake (poker) or the hold (bingo). The house earns exactly the rake or hold.
- `npm run headless` checks each model's expected return equals its analytic value: roulette 36/38 or 36/37 for every bet, pass line 488/495, don't pass 1 − 3/220 (bar 12), odds 1, baccarat from the 8-deck coup odds, keno from the hypergeometric, blackjack and video poker from their edge formulas.
- Hands are unit-risk (no doubles or splits drawn): a blackjack hand loses, pushes, wins or hits a natural. The win chance is solved so the expected return is exactly 1 − edge for those rules and that player.

### Bets people make
Drawn per person from a stable hash: how adventurous they are follows their type's taste for volatile slots (Thunder Jackpot appeal).
- Roulette: red/black (even money), a dozen (2:1) or a straight-up number (35:1).
- Craps: pass line (most), don't pass (a few, more among sharp players). Once a point is set, players take odds up to the table's multiple: sharp players take the full multiple, typical ones 1×, poor ones none. Odds pay true odds (4/10 2:1, 5/9 3:2, 6/8 6:5) and carry no edge.
- Baccarat: banker (60%), player (35%), tie (5%; 12% for poor players).
- Keno: a 4, 6 or 8-spot ticket.
- Bingo: 1–4 cards, by stake.

## Rules per table (§7.2)

| Game | Rule | Options (default first) | Edge effect |
|---|---|---|---|
| Blackjack | Natural pays | 3:2, 6:5 | 6:5 +1.39% |
| | Decks | 6, 8, 2, 1 | 8 +0.02%, 2 −0.19%, 1 −0.48% |
| | Dealer soft 17 | stands, hits | hits +0.22% |
| Roulette | Wheel | double zero, single zero | 5.26% → 2.70% |
| Craps | Odds | 2×, none, 1×, 3-4-5×, 10× | more odds = lower edge per dollar, bigger swings |
| Baccarat | Commission | 5%, 4% | banker 1.06% → 0.60% |
| Video poker | Paytable | 9/6, 8/5, 7/5, 6/5 | 99.5% → 97.3% → 96.1% → 95.0% (perfect play) |
| Poker | Rake | 10%, 5% | the house's cut of each pot (cap $10 per pot) |
| Bingo | Hold | 30%, 20%, 40% | the house's cut of the cards sold |

**Who notices rules:** each type has a `rules` weight (Locals 0.6, High rollers 1; Tourists, Party groups and Retirees 0). A table's rules score (−1 bad … +1 generous) adds `rules × score` to its appeal, and a rules-aware guest who sees a bad table may say so ("Six to five blackjack? No thanks."). Casual guests play anything.

## Limits

- Each table has a minimum and a maximum bet per hand (player-set from a list; defaults: blackjack, roulette and craps $5–$250, baccarat $25–$1,000, poker a $5 stake, keno $1–$20 tickets, bingo $2 cards). A high-limit room multiplies both by 5, as it does for machines.
- Guests bet more per hand at tables than per wager at slots: their stake × the type's `tableStake` (Locals 6, Retirees 4, Tourists 5, Party 6, High rollers 1.5), rounded to $1 chips ($5 from a $25 minimum). They sit only if that reaches at least half the minimum and their wallet covers a few rounds at it. The minimum decides who sits.
- The maximum caps the house's exposure (a straight-up hit pays 35× the bet). A guest who'd like to bet much more than the maximum (high rollers) likes the table less and may say "The limits here are too low."

## Staff

- **Dealer** ($100/mo): walks to a table that needs one and stands at its dealer spot; a table (or keno board, bingo caller's stand) opens only when all its dealer spots are filled. Craps needs two. Guests don't sit at a closed table. Since M9 dealers have skill (faster rounds) and hidden honesty: a crook palms chips and never catches a cheat (docs/spec/staff.md).
- **Pit boss** ($140/mo): patrols the tables. A cheat at a table in a pit boss's view (8 tiles, line of sight) is caught much more often (+1.2%/s, on top of guards, cameras and chance); a dealer watches their own table (+0.2%/s). A pit boss watching a card counter may tag them: the counter is marked and a yellow ticker item says so. What to do about it is the player's call.

## Guests

- **Skill** (hidden, per person, drawn per type): poor, typical or sharp. It costs blackjack players 2.5 / 1.2 / 0.3 points of edge and video poker players 3 / 1.5 / 0.4 points, and weights who wins at poker (0.7 / 1 / 1.35). The other games have no skill.
- **Card counters** (hidden, for life: Locals 1%, High rollers 2%, Tourists 0.3%): sharp players who gain 1.5 / 1.0 / 0.8 / 0.6 points at 1 / 2 / 6 / 8 decks and spread their bets (1–8×). At 6:5 they lose anyway and stop sitting down. They are not cheats: they win honestly, show up on the suspicion tools like lucky guests or cheats, and backing them off (a warning or a ban) is the player's call.
- **Luck** works at every game, exactly: per-player games redraw a losing hand or void a win as for slots; shared-outcome games turn a losing hand into their bet's win, or a win into a loss, at chances that shift payback by exactly ±20 points. Pool games have no luck.
- **Cheats** cheat at tables too (rigged wins, as at a machine), but not at pool games (poker, bingo), where the money would be other guests'. Mid-spell a table cheat bets up to a fortieth of their take per hand (within the limits), so a table pays out a take about as fast as a machine does.
- **Tastes** (Claude's call): Locals like blackjack, video poker and craps; Retirees keno, bingo and video poker; Tourists roulette and craps; Party groups craps; High rollers baccarat and blackjack, and anything in a high-limit room.
- **Onlookers:** a guest walking past a craps table with 3+ players in view may stop to watch for 20–40 s (fun time, like a show). When the shooter makes a point, players and onlookers cheer (a lift in mood). Some onlookers then want to play.

### High rollers (new type)
A recurring type with a pool of its own: few, rich (visit budget median $2,000), sharp, rules-aware, fond of prestige and privacy, and uninterested in cheap machines. They come more when the casino has tables, and more again when it has a high-limit room. Whales (M9) are events on top of this.

## Card description (Batch B)
Each game's card starts with one line (`TableDef.blurb`): how it plays, how it swings, who it suits, with no crowd names.

## Books

New ledger lines: **Tables** (blackjack, roulette, craps, baccarat), **Poker rake**, **Keno & bingo**. Video poker books under Slots.

## Measured (Test Floor, `npm run targets`, 300 days, seed 1)
- Share of seats by type: Locals 83% slots, blackjack 5%, video poker 4%; Retirees 63% slots, bingo 19%, keno 14%; Tourists 74% slots, roulette 8%, craps 8%; Party 70% slots, craps 25%; High rollers 31% slots, baccarat 21%, blackjack 18%.
- Hold: blackjack 0.3%, roulette 6.0%, craps 4.6%, baccarat 1.8%, video poker −5.1% (four machines: noise), keno 26.7%, poker 10.0% and bingo 30.0% (exact, as the rake and hold are). Books over the run: tables $29K, poker rake $2.1K, keno and bingo $5.6K, slots $59K.
- High rollers: visits 10.2 min, $2,090 budgets, $340 lost per visit, visit score 0.61, reputation 61; 21 of 25 now regulars.
- Card counters: 17 visits, 1 tagged by the pit boss, return 0.98 (6 decks: they only just break even). Skill: 36% poor, 51% typical, 14% sharp.
- Tutorial books are identical to M6.5 (it has no tables). Big Floor steady state unchanged (~3.0 ms/tick on this container, both builds).

## Save schema 10
Tables keep their rules, limits and last round on the object; guests carry `skill` and `counter`. Migration from 9 gives current guests typical skill and no counting.
