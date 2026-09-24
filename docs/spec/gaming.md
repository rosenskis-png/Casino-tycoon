# Slots (M2)

`src/data/games.ts` (models), `src/sim/gaming.ts` (rounds). Video poker, table games and draw games (M7) are in docs/spec/tables.md; the slot designer arrives in M8.

- A visible round resolves `WAGERS_PER_ROUND` (4 since M3; 10 in M2) real wagers. Each wager draws a payout multiple from the model's paytable (inverse CDF on the `gaming` stream). The cabinet lights show that round's real result: a glow on a win, a flashing cabinet on a jackpot.
- Bet per wager = denomination × credits: the guest's stake fitted to the machine (docs/spec/guests.md §Betting), fewer if that's all the wallet covers.
- Each round also books how it felt for the guest's visit score: a win, a win smaller than the bet (`ldwFeel`), or near misses (`nearMiss`, 0 until the slot designer in M8).
- Every paytable's expected return must equal its declared payback exactly; `npm run headless` checks it.
- Each round may break the machine (`breakChance`). Broken machines show a warning sign, can't be played, and wait for a slot tech.
- Machine stats (per object, saved): rounds, coin in, paid out, sessions, play time, uses. The inspector shows them, plus actual hold.

| Model | Bet | Payback | Hits | Character |
|---|---|---|---|---|
| Cherry Parade | $0.25 × 1–4 | 88% | 42% (many below the bet) | busy, fast, small |
| Liberty Bell | $1 × 1–2 | 92% | 21% | quiet, steady |
| Thunder Jackpot | $1 × 1–3 | 89% | 8% | loud, rare 2,500× top prize |

Jackpots are red (bad news for the house). Only $1,000+ or 500×-the-bet jackpots reach the ticker; the rest go to the log. Since M9 a payout the casino can't cover draws on emergency credit, or goes unpaid; jackpot insurance covers payouts above a line (docs/spec/money.md).
