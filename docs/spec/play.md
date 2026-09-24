# Playing the games yourself (M10)

FOUNDATIONS §23. Code: `src/sim/yours.ts` (rules and commands), `src/ui/play.tsx` (screens), checks in `src/sim/yourschecks.ts`.

## Where and when
- There's a **Play it yourself** button on the card of every slot machine, video poker machine, blackjack, roulette, craps and baccarat table, and keno lounge.
- It's off for poker and bingo (players play each other) and the sportsbook (not a simulated game). It's also off while paused, when the machine is broken down, or when the table has no dealer.
- The game opens full screen over the floor. The top bar (cash, date) and ticker stay; the speed buttons, tabs and cards are hidden. The casino keeps running at its speed, and the game runs at its own pace.
- **Leave** works only between hands. If the object is sold mid-hand, whatever you had out comes back. A hand in progress is saved (`GameState.yours`, schema 14).

## Money
- Stakes come from casino cash and winnings go back to it, on their own ledger line (**Owner's play**). You need the cash to cover a bet. Winnings come from nowhere: the table's bank is treated as outside money (owner, 2026-09-24).
- Your play isn't counted in the object's stats, the gaming tax, skimming, jackpot insurance or the regulator. Guests at the table aren't affected: you play your own hand, and you don't take a seat.
- A jackpot of your own goes to the ticker as good news.

## Same odds as a guest
You play the object's real model, paytable, rules and limits (×5 in a high-limit room), with ordinary luck and never rigged either way. `npm run headless` checks that each real game returns what the guests' model says:
- **Slots:** one wager per spin, from 1 to the model's credit maximum, drawn from its paytable. The reels show that pay (three of the k-th symbol; a pair for a win smaller than the bet).
- **Video poker:** Jacks or Better from a fresh deck each hand: deal, hold, draw. Coins run from 1 to max/min at the limit's minimum. The paytable is the machine's 9/6, 8/5, 7/5 or 6/5, with a royal at 800 for any number of coins, as for guests. All 2,598,960 hands are classified correctly.
- **Blackjack:** the table's natural pay, decks and soft-17 rule, reshuffled every hand (no counting). The dealer peeks under an ace or a ten. You can hit, stand, double any two cards (after a split too), and split once; split aces get one card each. No insurance or surrender.
- **Roulette:** the full board (straight numbers, 0 and 00, red/black, odd/even, low/high, dozens, columns). The total bet must fall within the limits. Every spot returns 36/pockets.
- **Craps:** pass or don't pass on the come-out, then odds up to the table's multiple of the line bet at true odds (lay odds for don't pass). No field bet, since its edge isn't a guest's. Real dice give the pass line exactly 244/495.
- **Baccarat:** a fresh 8-deck shoe each coup with the real third-card rule; bets on player, banker (less the table's commission) and tie (8 to 1), each within the limits. Enumerating the whole shoe gives the guests' banker and player chances.
- **Keno:** pick 4, 6 or 8 of 80; 20 balls; the guests' paytable.
- In blackjack and video poker, your decisions count. Perfect play does better than an average guest, as a sharp guest does. An owner-set rule that gives the player an edge is accepted (see DECISIONS).

## Look and feel (hotfix, 2026-09-24)
Animation is UI only: the sim result is the same, and it shows when the animation ends.
- **Slots:** a cabinet with marquee lamps that chase while spinning and flash on a win; three reel windows with blurred strips that stop left to right with a bounce, showing the symbols above and below; a payline; winning symbols and the paytable row pulse.
- **Cards:** dealt from the shoe in turn (blackjack: player, dealer, player, dealer), sliding in and turning face up in 3D; the dealer's hole card turns over when shown and later cards come one by one. Real faces (corner indexes, a big pip, framed court cards). In video poker only the replaced cards are dealt again; the made hand lights up in the paytable.
- **Roulette:** a real wheel (single- or double-zero order) turns while the ball runs the other way, drops and bounces into the result's pocket (about 4 s). The wheel, result and history stay pinned over the board; winning spots light up.
- **Craps:** real dice tumble across the felt, bounce off the back wall and settle; the total shows.
- **Baccarat:** cards dealt in order with the third-card draws; the winning side glows. **Keno:** balls pop out into a tray (a chime on a catch) and light the board.
- **Chips** look like casino chips (edge spots, a color per size). A win counts up with coin ticks and a gold glow; a big win (10× the bet, or a named jackpot) rains coins.
