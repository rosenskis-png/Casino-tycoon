# Slots (M2)

`src/data/games.ts` (models), `src/sim/gaming.ts` (rounds). Table games arrive in M7, the slot designer in M8.

- A visible round resolves `WAGERS_PER_ROUND` (10) real wagers. Each wager draws a payout multiple from the model's paytable (inverse CDF on the `gaming` stream). The cabinet lights show that round's real result: a glow on a win, a flashing cabinet on a jackpot.
- Bet per wager = denomination × credits (the guest's usual credits, fewer if that's all the wallet covers).
- Every paytable's expected return must equal its declared payback exactly; `npm run headless` checks it.
- Each round may break the machine (`breakChance`). Broken machines show a warning sign, can't be played, and wait for a slot tech.
- Machine stats (per object, saved): rounds, coin in, paid out, sessions, play time, uses. The inspector shows them, plus actual hold.

| Model | Bet | Payback | Hits | Character |
|---|---|---|---|---|
| Cherry Parade | $0.25 × 1–4 | 88% | 42% (many below the bet) | busy, fast, small |
| Liberty Bell | $1 × 1–2 | 92% | 21% | quiet, steady |
| Thunder Jackpot | $1 × 1–3 | 89% | 8% | loud, rare 2,500× top prize |

Jackpots of $500+ go on the ticker. A jackpot can push cash below zero; loans and insurance arrive in M9.
