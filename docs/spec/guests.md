# Guests (M2)

FOUNDATIONS §6 structure, built in `src/sim/guests.ts` with types in `src/data/guests.ts`. **Everything numeric here is provisional** until the guest design discussion (before M3). The roster is three placeholder types from the working list: Locals, Retirees, Tourists.

## Type entry (data)
Arrival weight + month multipliers, group sizes (unused until M3), budget range, ATM/cage withdrawal chance and cap, credit (M9), appeal per slot model, taste curves, drinking profile, incident/tolerance/leniency tables (M4), reputation sensitivity, comp appetite (M9), play style (credits bias, pace, quit-rule weights, win goal, loss limit, comp-seeking), need growth rates, and `valueSeconds` (how much play feels like good value).

## Individual guest (saved on the agent as `g`)
Type, group, intention (gamble / drink), name, bankroll and wallet, withdrawals and cap, credits, pace, quit rule (win goal, loss limit, until broke, leave on a jackpot), sobriety and intoxication, needs (bladder, thirst, hunger, fatigue, 0-100), mood, hidden luck and cheat tags (M5), visit memory, current and recent thoughts.

## Tastes
- A type's `prefs` give an ideal, tolerance and weight for NRG, CRW, PRS, TRF (fields) and DIRT (litter within 2 tiles).
- Within tolerance: +0.3 × weight. Beyond it: −weight × min(1.5, excess / tolerance). The cap is the saturation rule from §4.
- Mood each beat eases toward 62 + surroundings (fit × 8, clamped −30…+12) + luck (net win vs bankroll, ±15) − needs over 60 − annoyance (broken machine, lines, no seat) ± drink.

## What a guest does
- Arrives at a street entrance, then decides. Order: leave (exhausted, miserable, starving, or already leaving) → restroom when bladder ≥ 70 → bar when thirsty (or came for a drink) → withdraw at the cage when they can't afford any machine and are the ATM type → pick a machine → otherwise wander and retry (3 failures and they go home).
- Guests only know what they can see, remember, or read on signs; finding things is in docs/spec/navigation.md.
- Machine choice: appeal to their type × 2 + surroundings at the seat × 0.5 − distance / 25 + a little randomness. Only machines whose minimum bet they can cover.
- Playing: rounds come from the gaming system. Between rounds they check the quit rule, needs (restroom or bar only when one exists), money, and whether the machine broke.
- Leaving: guests holding $20+ after playing cash out at the cage first; with no cage they complain. Guests with no walkable way out are trapped (docs/spec/navigation.md).
- Litter: walking guests drop litter now and then (more after drinks); drinks spill at the bar.

## Thoughts
- Every 15–30 s a guest voices their biggest gap: worst taste, a pressing need with no amenity, luck, or drink. A compliment only when the whole spot suits them (clean floors are expected, not praised).
- Events voice immediately: machine broke, lines, no machine free, jackpot, no cage, tapped out.
- On leaving: a verdict on the visit (great place / never coming back, money lasted / went fast).
- Counted per day (today + yesterday shown in the Guests tab). Bubbles on the floor only for bad thoughts and notable good ones.
- Guests are shown by name in the inspector, never by type (types are earned, §16). The Game tab's Debug view shows the hidden values.

## Reputation (§15)
- On leaving, satisfaction = 0.4 × average mood + 0.4 × value (play time / `valueSeconds`, capped) + 0.2 × needs met. Winning doesn't enter into it.
- Reputation for that type moves 2% of the way toward satisfaction × 100 per departing guest.

## Arrivals
Per beat, per type: scenario rate × type share × season × reputation factor (0.3 + 1.4 × (rep/100)^1.3) × floor size factor (slots + 6) / 50, capped at 2.5 × room left under the scenario's guest cap. One Bernoulli draw per beat from the `arrivals` stream.
