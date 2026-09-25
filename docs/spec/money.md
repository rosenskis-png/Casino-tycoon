# Money, risk, the regulator, whales and comps (M9)

`src/sim/bank.ts` (tax, skim, credit, insurance, comps), `src/sim/regulator.ts`, `src/sim/whales.ts`; numbers in `src/data/money.ts`. FOUNDATIONS §13, §14, §16, §17. All numbers are starting values, checked only against sanity flags until M11.

## Gaming tax and skimming
- Each month-end the casino pays **gaming tax** on the month's gaming win (slots, tables, poker rake, keno and bingo) when it is positive. Rate per scenario: Lucky Horseshoe 5%, Free Play and the Test Floor 8%, Big Floor 0.
- **Skimming** (a dark lever, Policies tab): 0, 10, 20, 30 or 50% of the win kept off the books, so no tax is paid on it. The tax dodged builds up as back taxes owed (hidden), fading 5% a month.
- The gaming inspector finds it with chance 25% + the skim share (while anything is owed). Found: a fine of 3× the back taxes, −(20 + 40 × skim share) regulator standing, and a scandal (−3 reputation with every type).

## Sized to the casino (M11.1)
- `monthlyWin(g)` (sim/bank.ts) = the average monthly gaming win of the last 3 closed months (before any has closed: $30 × game seats). `scaled(g, $)` = the amount × monthlyWin / $10,000, clamped to ×0.1–×10: every flat dollar figure here was tuned for a casino winning about $10K a month.
- Scaled: the regulator's fine and suspension fine, the uncertified-machine fine, bribes (and so the refusal fine), the police fines (stage, call, seen, raid) and cheats' takes (docs/spec/cheats.md). A $1,000 fine is $100 at a small locals casino and $10,000 at a big one.

## Credit
- **Loans:** borrow in $1K steps while total debt stays under half of gross worth (cash, resale value and land). Interest 2% a month. Repay any time, emergency debt first.
- **Emergency loans:** when cash falls below zero (a payout, wages), the bank covers it in $500 steps with a 10% fee and 6% a month interest, up to a quarter of gross worth (at least $2K). The first one each month is a scandal: −3 reputation with every type, on the ticker.
- **Unpaid winnings:** when a payout is bigger than cash plus the emergency credit left, the guest gets what cash covers. −8 regulator standing (−15 at $1K or more, −2 under $100, which only reach the log), the visit scores 0.2 of what it would have, and the person's disposition drops 10.
- **Insolvency:** a month that closes with cash below zero counts; three in a row lose the scenario (play continues).
- **Worth** = cash + resale value + land − debt.

## Jackpot insurance
- Off, or cover every single payout above $1K, $5K or $25K. The insurer pays the part above the line (a ledger line).
- The premium, charged at month-end, is 1.3× the expected excess of that month's actual wagers, exact from each paytable. Insurance costs 30% more than it pays on average and buys survival. Pool games (poker, bingo) aren't covered: their prizes are other players' money.

## The gaming regulator
- Standing 0–100, starts at 100, recovers 0.5 a day (M11). Ladder like the police (M11: one step a week at most; revoked only from the top) (a step at 60, 45, 30, 15, left again 5 above): warned; fined $1,000; under audit (an inspector every 10 days); suspended (closed 3 days, $3,000, at most every 30 days). At 0 the license is revoked: the scenario is lost, closed 30 days, reopens at 30.
- **The inspector** (grey suit, clipboard) comes every 45–75 days and walks the floor for 2 minutes. On leaving, the audit: skimming (above); unpaid winnings since the last visit, −5 each; weak controls, when shrinkage over the last 3 months passed 3% of the gaming win, −5. A clean audit is +3.
- **Uncertified machines (M11):** the inspector has to see a machine to find it: once a second they note every uncertified machine within sight (walls, slot banks and other opaque objects block it; docs/spec/navigation.md). So one hidden in a maze of banks, or behind walls away from where people walk, can go unnoticed. At the audit, a design seen for the first time gets a **warning**: certify it or take it off the floor within 30 days, −3 standing (× the rigging severity), and the inspector comes back when the deadline is up. Seen again while still uncertified: every machine of it is seized, −10 × (1 + severity) standing, and a fine of $2,000 × (1 + 4 × severity). (M8 seized on the first find, 70% of the time, sight or not, at −15.)

## Bribes (M11)
- A scenario says whether officials can be bought (`bribe`: the chance one takes it; Free Play and the Test Floor 60%, the tutorial none). Then the gaming inspector's and a police officer's cards have **Offer a bribe**: $2,000 for the inspector, $500 for an officer (M11.1: sized to the casino, above).
- Taken: booked as "Bribes"; the inspector's audit finds nothing this visit (and says so, knowingly); an officer sees nothing for the rest of their visit. Each bribe taken adds 1 to a hidden tally.
- Refused: reported, a fine of twice the bribe and −20 standing with that authority.
- Each month, a chance of 4% × the tally (at most 50%) that it comes out: a scandal, −10 standing with both authorities and a reputation hit with every type (like skimming exposed); the tally then resets. Otherwise the tally fades 15% a month.

## Whales (FOUNDATIONS §17)
- In scenarios that allow them (Free Play, the Test Floor), once the floor has a banked table game: announced on the ticker 2 days ahead, then every 30–60 days.
- **Bankroll** = 2–4× the average monthly gaming win of the last 3 closed months, at least $10K: several months of the casino's profit. They bet a 25th of it per hand, capped by the table's maximum.
- **Requests:** always a game (baccarat 50%, blackjack 25%, craps 15%, roulette 10%), plus 1–3 of: a table of that game whose maximum covers their bet; privacy (that table in a high-limit room); a show lounge; drinks on the house (a bar comping at least half). Each unmet request cuts the visit by 40%. No reputation penalty: an unhappy whale just leaves sooner.
- They come with 1–3 companions (High rollers), play only their game (a host shows them the way), stay 20–30 minutes (2–3× a high roller), and leave after losing 80% or winning 50% of the bankroll. The ticker reports what the house won or lost.

## Comps
- Per comp (Policies tab): a free meal, a free show, a come-back offer, and (M9.6, where there's a hotel elevator) a hotel room: the stay runs half as long again, for $40. Each is Off or given once a guest's **theoretical loss** (what the math expects them to lose: wagered − expected return) this visit passes $5, $20 or $100.
- Meal and show comps make their next meal or ticket free (the food still costs the house). The come-back offer is given as a regular leaves: $10 of free play (a ledger line), their next visit comes about 40% sooner, and disposition +2.
- A comped guest gets a lift (buzz × their type's taste for comps) and may say so.

## Save
Schema 11: state gains `bank` (loans, tax dodged, insurance, comps policy, counters), `reg` (the regulator's schedule and findings), `whale`; guests gain `vip` and `comp`.
