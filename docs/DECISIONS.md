# Decisions

Newest first. One entry per decision: date, what, why.

## 2026-09-25 · M12: The Outfit built first; enforcement reasons; luxury (owner)
- **Green light** (owner, 2026-09-25): build The Outfit (rung 5) before rungs 1–4, "and any associated ideas and
  mechanics (eg adding any other high class luxury stuff)".
- **Enforcement reasons and the kick-out (owner):** every order carries a reason (cheating, card counting,
  drunkenness, fighting, misconduct, vice, drugs, or "just because"), which deters that behavior whether or not the
  guest was doing it. Ladder: warn > kick out = beat up > lifetime ban > disappear. Warn, kick out and ban teach only
  that guest (and the pool person, for later visits); beat up and disappear put a global chill on the behavior and
  cost the target's crowd reputation. "Just because" deters nothing. docs/spec/cheats.md.
- **The Outfit, built:** the letter (a scenario intro screen), goals by crowd and a police line, town settings (police
  start, a town that takes 40% of the offense, 95% bribes, violence at a quarter, 3× cheats taking 1.5×), all as
  scenario data. Proved by `npm run outfit` on 3 seeds × 24 months: honest, greedy and the free-for-all miss; the
  squeeze meets it (scenarios.md "As built").
- **Luxury (owner's ask):** the Monte Carlo theme (Crystal Chandelier, Grand Piano, Champagne Tower, Velvet Rope, and
  a slot theme), the casino host (looks after big players, tops up their glass on the house), escorts on the arm.
- **Claude's calls, flagged:**
  - **The goal counts the take, not the actual win:** each wager's edge as played, less what cheats' rigged wins took,
    whales excluded. Actual high-roller wins swung ±$40K a month against a ~$25K mean; no lever could be read
    through that. The Goals tab explains it.
  - **High rollers call a 3% edge fair** (`edgeRef`; 6% for everyone else, unchanged). Without it an honest salon
    and a squeezed one earned the same, and tight games on sober high rollers earned the most, the opposite of the
    rung's premise. With it: honest ~$20K, greedy ~$24K, squeeze ~$36K best 3-month take. It moves high rollers on
    every floor (parity numbers below).
  - **Inhibition compounds:** tilt chance × loose² / 0.3 (same as before at a few drinks). Squeezed: 1 in ~55 visits
    (target was 1 in 10; tilts mostly chase back to even, so they add play, not a windfall).
  - **Comped drinks nudge** intended drinking by 0.1 × the crowd's taste for luxury.
  - **Escorts on the arm stay for the rest of the visit** (they used to take a player off the floor at once): savvy
    −0.35, 0.3 toward tilt, bets as if friends were watching; up together at the end (the room).
  - Scenario numbers: $250K, market 400 high rollers at reputation 30, goal $30K over 3 months by the end of Year 2,
    police line 25, policeCost 0.4 (without it every squeeze lost its license to drunk-incident reports), bribes
    0.95, cheatTake 1.5 (2 made cheats the whole story).
  - Two old bugs found in long runs: a guest turned away at a full door could come back by the hotel while their
    figure was still walking off (a person "both inside and on the sidewalk"); guests carried out by paramedics
    counted as on the floor until the next tick. Both fixed.
  - Save schema 22 (migration from 21): enforcement reason and chill, take by crowd, lowest police standing.
- **Open (owner):** rungs 1–4 and the ladder unlocks (The Outfit is simply in the New game list); whether the take is
  the right measure for later crowd goals; how hard the squeeze should be to sustain past the goal.

## 2026-09-25 · Parity gap closed, tilt 1 in 100, The Outfit (owner)
- **Owner:** close the parity gap; the high rollers' crash-out was too frequent for the payout ("maybe 1 in 100 is better?").
- **Tilt** 0.35 → 0.02: 3 tilts in 364 high-roller visits on the Test Floor (was ~16%). It scales with drink and highs, so pushing them raises it.
- **Parity, numbers only:** high rollers bet 0.4× at tables (was 1.5×); locals, retirees and party groups bet more. Per guest on the floor the spread is 3.3× (was 12×): high rollers ~2× the middle crowds, retirees and locals lowest. Per seat and per build dollar high rollers stay ~10× ahead; Claude recommends judging parity per guest slot (flagged). Tutorial worth goal $60K (money rose again); idle still loses on reputation, "good" wins by month 18, "big" by month 24.
- **Bugs found on the way (older than M11.4, exposed by the new numbers):** a reloaded save played on differently. Slots in a big bonus lost their onlookers (runtime-only, now saved on the machine); the slot market's cached appeal and fan draw were recomputed fresh on load (now saved as a snapshot, `state.mkt`, cleared at each rebuild). A day's new staff pace could leave a walker past the end of their step (clamped).
- **The Outfit (owner's dark-lever rung, from scratch):** mob money, an empty lot, rich New Yorkers to draw with luxury and then crack with drink, drugs and escorts while keeping the police off; high-stakes cheats to deal with, violence cheaper. Designed in docs/spec/scenarios.md (rung 5); needs an intro screen, a goal by crowd, scenario multipliers for cheats and violence, and escorts eroding savvy.

## 2026-09-25 · M11.4 quick fixes (owner) after an outside review of the code base
- **Outside review** (the v0.2 designer's agent): luck swings too large for the money scale; parity measured on the wrong thing; freeze guest psychology before building the ladder; phone perf at 8× on big maps; the duplicate `club` research id; stale FOUNDATIONS sections; three ladder concerns (Boardwalk solvable in one move, too many "fix the mess" rungs, the designer at rung 3). The owner took the fixes below; the ladder revisions and the freeze wait.
- **Nightclub research** has its own id (`nightclub`); the player's club's entry had overwritten it, so nightclubs needed no research. Saves that could build one (open scenarios, or a club already placed) keep it. Both show in the Research tab, the build menu and the club features.
- **Staff happy on market pay (owner):** morale target 75 + 100 × (pay − 1), overwork from 90% busy (up to −15); skill and theft centered on 75. Test Floor staff average 71 ("happy").
- **Serving grades and margins (owner):** every priced place has Cheap / Standard / Fancy with a serving cost and a worth by each crowd's taste for luxury; the card shows the margin per serving; serving costs are netted into each place's line in the books (no separate cost lines). docs/spec/economy.md.
- **Richer guests (owner):** 8 wagers a round (was 4) and budgets, ATM draws, savings and income ×2 with stakes halved: bets look the same, each visit cycles twice the coin, relative swings shrink. Players now expect to lose ~$60 a visit (tourists), ~$340 (high rollers); locals and retirees ~$25 by design (thin edges, penny games).
- **High rollers tilt (owner):** the most disciplined crowd (savvy 0.95) until drink or drugs and a heavy loss break them; then no discipline, bets sized to claw back a quarter of the deficit, no limit or clock, the ATM against their savings until even or broke. About 1 visit in 11. docs/spec/guests.md "Tilt".
- **Jackpot insurance, not capped awards (owner):** "buy the jackpot insurance in the test suites, tuned to be affordable and effective without being too cheap". Lines follow the casino (half a month's, a month's or two months' expected machine win), machines only (tables have limits); load stays 1.3. The report scripts buy "Big payouts". Eight seeds confirmed the machines pay their math on average: the swings were variance. docs/spec/money.md.
- **Parity per seat, build dollar and guest slot (owner):** `npm run parity` reports and flags all three. High rollers earn 32× retirees per seat and 12× per guest slot: the high-roller problem reverses.
- **Claude's calls, flagged:** grade costs (0.4 / 1 / 2.2×) and worths, the `luxe` values, show/club/pool/golf serving costs; the tilt rate (0.35) and draw size; High rollers' savings $25K median (game money: a tilted regular can lose about a whale's worth, not $200K); locals' visit 10 min (was 8); insurance levels and the $250 floor; the tutorial worth goal $55K (was $40K; money about doubled); a slot's "dream" judged against the old money scale so stock games keep their appeal. Big Floor steady state 3.7 ms/tick against 3.55 on the same machine (+4%). Save schema 21 (migration from 20).
- **Open (owner):** which parity measure to aim for (per seat, per guest slot or per build dollar), and whether to close the gap (high rollers far ahead; retirees, locals and party behind). The guest-psychology freeze and the ladder revisions (Boardwalk's second half, one build-from-scratch rung, loose stock games at Sundowner, keeping cheats and whales small before their rungs).

## 2026-09-25 · M11.3 guest psychology (owner): tempt by design, savvy, stacking decor, crowd parity
- **Green light** (owner, 2026-09-25) to fix where M11.2 went wrong: it treated demographics as *how much* someone gambles (families' urge 0.45, locals 1; "families barely play" was declared intended and its warning silenced). **Owner:** families can gamble as hard as locals, locals can see as many shows as families; the game is understanding your market and working its psychology through layout, design, planning and pricing. Locals aren't an easy win: they seek low house edges and walk away at their limit; a novice you do tempt plays bad odds and blows through their money.
- **Built:** no per-crowd ceiling: temptation = exposure (games they've liked on the way past) × want (appeal plus flash: a hit, a meter, a busy craps table) × mood × hooks (drink, buzz, free time, friends playing; weights per crowd). Guests waiting for their group can be tempted where they wait. An adult who leaves the group's plan to the others no longer auto-gambles: they have time to themselves. **Savvy** per crowd: the seasoned seek thin edges, hold their limits and bet flat; novices stretch limits with drink, a game they love and a good session, swing bets and go back to the ATM. Drink and drugs erode savvy. Bets rise with friends watching (party most).
- **Decor (owner):** a wide, mild, stacking field instead of one intense piece beside a couple of slots: themes reach 11 tiles at 0.4× strength, decor prestige and energy 2.2× as far at 0.4×.
- **Roster (owner):** Locals, Retirees, Tourists, Families, Party groups, High rollers (the business crowd: luxury, vice, drugs, escorts, lenient rules except fights). Conventioneers stay an event crowd with no reputation tracked. Traits tuned to match (smokers, party tolerance of incidents, high rollers' vice).
- **Parity goal (owner):** catering well to any crowd should earn roughly the same from gambling; only the method differs. Measured on six crowd-designed mini-casinos (owner: never on one mixed floor), `npm run parity`, judged on take (gaming win ÷ money brought). Locals 10%, Retirees 11%, Tourists 13%, Families 17%, Party 7%, High rollers 4%.
- **Claude's calls, flagged:** every hook weight, savvy value and constant (TEMPT 0.08 anchored to the old average rate; split 0.25 × free hook; SAVVY_EDGE 0.6 around a 6% edge; decor 2.2× / 0.4×); take as the parity measure; the six floors' designs. No save shape change (schema 20).
- **Open (owner):** high rollers' take (~4%): thin edges and a 10-minute visit cap them. Candidates: longer hotel stays with luxury and comps, vice keeping them in the building, side bets. The tutorial's "big spender" script now wins 1 of 3 seeds (was reliably by months 13–18); "good" and the new "tempt" (families' machines moved by the attractions) win all 3.

## 2026-09-25 · Why they come (owner): get people in the door, then tempt them
- **Owner:** the goal was misread. Guests were arriving in droves and waiting for full slots, so the game became "make the machines they sit at nicer and hoard cash". It should be close to the opposite: **the challenge is getting people in the door.** Locals and pros come to gamble at their preferred game and spot. Most others don't: families come for the decorations, a show, a buffet, mini golf or a hotel room, and while mom and the kids see the show, dad gambles; party crowds come to drink, dance and hook up, and gamble when they leave the club drunk and happy. It isn't "show vs gambling": without the show they wouldn't have come; since they're here, they see the show and maybe gamble if you entice them. Checklists aren't hard-coded: anyone may try any amenity they pass; types tend to come for particular (often non-gambling) reasons, and gambling may or may not be on the list, with optional items. Guests know where everything on their list is. Show demand depends on price: expensive shows ($70 tickets) as a non-gambling money maker, or cheap shows to pull crowds and hope they gamble. Anyone who leaves up is happy. This tuning carries forward.
- **Built:** reasons per type and arrivals from how well the casino offers each; to-do lists with gambling only when planned; temptation, impulse, sights, strolling out past the games; adults peeling off to gamble; children with a non-gambling adult; known routes to listed places; gamblers walk the aisles to free seats; show tickets to $100 against each crowd's worth; winners score at least 0.8; the tutorial's market reshaped (few locals, many potential tourists and families). docs/spec/guests.md "Why they come". Save schema 20 (migration from 19).
- **Claude's calls, flagged:** every weight, urge and ticket worth; `REASON_K` = 3 (a good place draws like a big floor); temptation 0.15 × urge; 60% × urge for an adult to split off; "sights" as eight legs of looking around; the aisle walk. Test Floor families now 29 visits in 200 days (was 44 before this pass), conventioneers few (they come with conventions).

## 2026-09-25 · M11.2 playtest feedback (owner): tutorial money, security, entertainers, mini golf, to-do lists, survey
- **Owner's playtest:** met both reputation goals but couldn't make enough money (worth ~$30K at the deadline). Also asked for: security and enforcer combined; a new Entertainer; a better draw for families (mini golf); reputation a little faster and clearer about what each crowd wants; wages and upkeep halved; no monthly fee on standard decor (only future centerpieces); more feedback on likes and dislikes (another restaurant? fancy or cheap? is the theming helping or too spread out? is a show a draw or a money maker?); shows barely attended even when nearly free; doors should count as signs; guests too bad at finding restrooms; guests should have a checklist, and if the show drew them, see it before they leave.
- **Built:** wages and upkeep halved; decor upkeep 0. Security (one role, $60) does the enforcer's job; old enforcers become security. Entertainers ($45) perform where the crowd is: fun time and a lift, most for families and tourists. Mini golf (sized amenity, any lot, $6 a round default; families' strongest pull). A to-do list per visit (what drew them plus a chance of other places they like): kept when a place is full, a 2-minute stay-on to finish it, "Never got to…" and an unmet need if they leave without. Remembered places count as known, and doors onto a room lead guests to what's in it (restroom exits on the Test Floor fell from 25 to 1 in 40 days). A crowd survey in the Guests tab (praise, complaints, themes enjoyed and disliked, visit score), with thoughts that name which place was full or pricey and a "plain food" complaint from crowds used to finer places. Word of mouth twice as fast.
- **Tutorial:** worth goal $40K (was $36K; money is easier now), mini golf unlocked. Measured: idle never wins (reputation), sensible play by month 12, big spending by month 13–18.
- **Claude's calls, flagged:** the entertainer's numbers and tastes; mini golf's numbers; which places go on a to-do list and the 2-minute stay-on; attractions now take time from gambling (Test Floor tourists lose ~$54 a visit, was ~$80; families barely gamble), which is the draw-vs-money-maker trade-off the survey shows. Save schema 19 (migration from 18).

## 2026-09-25 · M11.2: the tutorial rebuilt (owner's vision) and the final balance pass
- **Owner's tutorial vision (built):** "this is all the slots you're gonna get, so if you want to win you need to maximize those slots." The Lucky Horseshoe starts with 68 machines (was 18) and **no new games can be built**; a run-down locals' joint to turn into a place for tourists and families: litter and vomit everywhere, **broken theming** (cutouts and dead neon that spoil theming around them; throw them out before theming), drunk regulars who fight, a bar pouring free strong drinks, house rules ignoring drunkenness and disorder, no janitor. Starting themes: Ancient worlds (good for tourists and families, though Egypt and Medieval clash) and Old Vegas (mostly not); the restaurant is unlocked, shows take research. Goal: worth $36K, Tourists 55 and Families 50 by the end of Year 2. docs/spec/economy.md.
- **Supersedes** the M11.1 direction "spamming slots must still be able to win the tutorial": with no new games, it can't. Spamming still can't win any later scenario.
- **Claude's calls:** machines can be **moved** ($50, from their card; any fixed-size object), since they can't be replaced; the tutorial's machines are two new stock games with small jackpots (Lucky Cherries, Silver Bells: 150× every 2,500 spins), the owner's "smaller jackpots"; a second reputation bar in goals (`reps`); nine junk pieces, 70 litter, 8 vomit; $20K cash. Old tutorial saves pick up the new rules and goals.
- **Money scale (Claude's calls; the M11.1 part 2 numbers pass, done here):** build prices halved everywhere (objects, decor, cabinets, dealers, walls, land, research, certification); running costs unchanged. Machines pay back in about 10–16 months on the busy Test Floor (was 24–48), less on a fuller floor. Free Play guest cap 1,500 (was 400, which stopped growth at ~100 machines). A scripted Free Play build reaches two full halls (~224 machines, restaurant, shows, tables) by month 10 and nets ~$5.5K a month by month 24 (was ~$2K and stuck): a strong casino in about 2 years.
- **Guests:** a group's leader who is done or out of time now waits for the others (groups ended most visits); luck is ±10 points (was ±20: lucky players at 108% leaked money); a guest who can't find a restroom searches longer before going home. Test Floor visits 0.3–0.9 min longer, losses per visit up (tourists ~$81, party ~$44); no sanity flags.
- **Not done, flagged:** no running cost that grows with size (sublinear draw already shrinks a big floor's margin; revisit if Free Play piles up cash). Party groups still leave for the restroom 14–23% of the time on the Test Floor (its restrooms are in corners; a layout symptom).
- `npm run economy` is now the tutorial strategies report (idle, janitor, good; several seeds); `npm run dark` is the new dark-lever report (docs/spec/money.md).

## 2026-09-25 · M11.1 part 1 built: the functions (owner's caveats; Claude's calls)
- **Green light** for M11.1 (owner). Two chats: this one changes functions, the next tunes numbers.
- **One correct casino per crowd, not one room per crowd (owner):** a casino of differently themed rooms for each crowd should read as disjointed, and crowds next door annoy each other unless far enough apart. Built as: theming reaches 7 tiles and loses 35% per wall (was 4 and 60%), so clashing neighbors muddle each other; crowd noise per room carries to rooms within 10 tiles; the casino's draw for a crowd averages its fit over every seat, so a split floor suits each crowd less.
- **Hidden theme tastes per crowd** (Claude): the theming score used to be the same for everyone, so theming was pure upside (0 bad thoughts). Now each type loves some themes and dislikes others (docs/spec/themes.md).
- **Engagement** (Claude): the fit of the spot and the taste for the game move pace, stake, loss limit and time on the floor. Mood from surroundings reaches +25 (was +12).
- **Draw** (Claude): seats draw sublinearly (square root; was linear), times each crowd's draw from the layout.
- **Sized to the casino** (owner agreed): fines, bribes and cheats' takes × the monthly gaming win / $10K (×0.1–×10). **Staff theft by organization size** (owner): none up to 8 staff, full at 40.
- **Whale bets stay capped by the table maximum** (Claude): table limits are one of the North Star's variance tools, so whales stay a threat the player chooses to take on. Flagged for the owner.
- Measurement note for the numbers pass: slot results swing far more than expected on every floor, including the Test Floor (120 days: $0.1K and $33.6K won against about $14K expected), so single-seed comparisons of money mean little. Compare theoretical win (coin-in × edge) or several seeds.

## 2026-09-25 · M11.1 balance direction (owner + Claude's review)
- **Dominant strategy (owner):** "build a thoughtful layout, theming and non-gambling attractions to draw lots of the guests you want, then use casino psychology to get the most out of the games in each place." Spamming slots must still be able to win the tutorial, but no scenario after it.
- **Why it isn't today (measured):** arrivals scale with game seats (`capacity()` in guests.ts, up to 2.5×), so seats summon guests. Surroundings reach guests only through mood (capped at +12, down to −30), and mood moves money only slowly, through reputation. They never touch stake, pace or session length.
- **Threats scale with the casino (owner agreed to Claude's proposal):** cheat takes, fines, bribes and jackpot risk get sized to the floor's stakes and earnings, not flat dollars. Staff theft belongs to big organizations, not small family ones (owner).
- **Tutorial too hard (owner):** too much variance (one $1K jackpot wrecks it). Start with many more machines and more cash, and raise the goal to match.
- **Too slow (owner):** building a good casino can take 10+ in-game years. Scale must make a meaningful casino reachable in 1–3 years.
- Also to fix (Claude's review, owner agreed): the tutorial's expected profit is about zero; the Test Floor piles up cash with nothing to spend it on; lucky guests (+20%) are a money leak; tourists and the party crowd lose far below their targets and play about 20% of their visit; groups end most visits; whales can't threaten a big floor; theming has no downside (0 bad thoughts); no dark-lever run exists.

## 2026-09-25 · Road to alpha: M11 → M11.1 → M11.2 = v0.8 (owner)
- Owner: what's left is **M11** (missing features), **M11.1** (general balance pass) and **M11.2** (scenario build and level redesign). After those the game is an alpha build, **Casino Tycoon v0.8**.
- Cut (owner): scenario goals that ask for slot designs; scenario goals that exclude royalties; the flagged "cheats win faster at high-limit baccarat" item (M6.5), which is no longer a tuning target.

## 2026-09-25 · M11 built: the owner's feature notes (see the specs named)
- **Litter** (floor.md): every litter chance halved, and a **litter bin** (1×1, $60) that sober guests within 6 tiles use. Janitors go to the **nearest** mess (they used to prefer the dirtiest, across the floor) and leave mess a free colleague is closer to.
- **Staff spread out** (staff.md): a soft repel between colleagues of the same job when picking where to patrol (janitors, techs, guards, pit bosses).
- **Uniforms** (staff.md, art.md): a color per job set in the Staff tab, and a distinct head silhouette and prop for every job (hard hat, peaked cap and badge, visor, headset, dark glasses, clipboard, a bucket while sweeping).
- **Dealers come with the tables** (staff.md): $800 per dealer added to each table's price, no wages, no hiring; one dealer per dealer spot, kept in step with the tables.
- **Tap a notice** (engine.md): the ticker and the Log go to the person or place a notice is about and open its card (or its tab).
- **Punishment slower and gentler** (incidents.md, money.md): police and regulator standing recover 0.5 a day (was 0.2); the ladders climb at most one step a week; the license goes only from the top step.
- **Uncertified machines viable, at a risk** (money.md, designer.md §10): the inspector must see a machine to find it (sight lines, so a maze hides it); the first find is a warning with 30 days to fix it and a follow-up visit, the second seizes and fines.
- **Bribes** (money.md; bribery was deferred to M11 in M4): a scenario flag (Free Play and the Test Floor 60%, the tutorial none). Offer an inspector $2,000 or an officer $500 from their card: taken, they look away this visit; refused, a fine of 2× and −20 standing; bribes taken can come out as a scandal (4% a month each, fading).
- Claude's calls: the numbers above; bins need no research; the check harness now skips random breakdowns when it plays games itself (the M11 changes shifted RNG draws enough to break a slot mid-test). Save schema 18 (migration from 17).

## 2026-09-24 · M8.6 built: the market (Claude's calls; see docs/spec/designer.md "As built in M8.6")
- Word of mouth (awareness by guest type on a Bass curve), a novelty bump by how different a design is from the floor, boredom and favorites per regular, fans who come for their game and draw more of their type, floor variety, wishes, records and Evergreens, Game launches and Market research projects, the life curve on each design's card, and slot makers' offers with everything after a sale (fees on theoretical edge, hidden units on an S-curve, royalties, wide-area meters the maker pays, math locked, its own budget line, the library remembers).
- **Flagged for the owner: fans.** A scenario's whole pool of regulars is 100–400 people, so "50 fans" from regulars alone was out of reach. Visitors who fall for a game now count as fans too (they fade as they forget). The 50-fan bar is unchanged.
- **Flagged: royalties follow the plan's formula**, so they scale with this floor's win per machine: a median sale pays a trickle, thousands of installs pay about what the whole slot floor wins. The one-time cash (10–100× the cabinet price) is large next to that. Easy to retune in `SALE_RULES`/`makeOffer` if it plays wrong.
- A declined (or lapsed) offer's re-offer roll failing means no more offers for that design; appeal follows awareness weekly (a game day is 200 ticks); awareness starts at 5% (25% with Game launches), 40% for stock games, full for everything already on the floor.
- The Lucky Dragon decor owed since M8: lantern, guardian lion, porcelain vase, lacquer screen.
- Test Floor: no sanity flags; guest numbers within run-to-run noise of m8.5; Big Floor steady state within ~2% of m8.5. Tutorial year-end cash moves with jackpot luck as before.
- Save schema 17 (migration from 16).
- Noticed, not fixed: two research projects share the id `club` (Nightclub and Player's club), so the later one wins and the nightclub needs no research.

## 2026-09-24 · Slot Expo and rival releases dropped (owner)
- Owner, at the start of the M8.6 build: get rid of the Slot Expo (yearly trends) and rival makers' releases. Everything else in M8.6 stays.

## 2026-09-24 · Green light for M8.6
- Owner said "green light on m8.6". Plan: docs/spec/designer.md §6, §13 (M8.6) and "M8.6 additions" (word of mouth, sale offers with the owner's revisions in the M8.5 green-light entry). Built in its own chat (one chat per milestone).

## 2026-09-24 · M8.5 built: bonuses and progressives (Claude's calls; see docs/spec/designer.md "As built in M8.5")
- Everything in the M8.5 plan and the owner's notes: hold & spin, pick, wheel (and the topper wheel), cascades, collector, offer and mystery, each exact and with its own screen; standalone, linked and must-hit-by progressives; bank signs; hunters; onlookers; the pull of big meters; opinions by game kind for six months; a lifetime performance index explained in game; logo fonts and the machine's face; interface size; spaces in names; the slam-stop and no-spoiler fixes.
- **Found causes of the owner's bugs:** names lost their spaces because every keystroke trimmed the name; a tap during free spins jumped to the end of the whole feature (showing its total), and the "up/down" line and the top bar showed a result as soon as the sim settled it.
- **Ratings (owner):** volatility now spans Intensity ~1 to 10 (big wins' share 0-90%, higher top awards, flatter at the top); Excitement is steeper and the panel leans toward the guests who'd sit down, so a game made for its crowd rates high and a clumsy one low (2.5-8.4 on a mixed panel; 0-10 per type). The stock designs keep their M8 math (volatility values re-expressed); slot appeal was refitted and the original three stay within ±0.15.
- **Must-hit-by meters are per design (linked)**, like real mystery banks; collectors always keep progress on the machine (a per-player reset would make payback inexact); opinions are not yet split by guest type. Flagged for the owner in the hand-off.
- **Progressive chance scales with the bet** (payback the same at every bet within 0.01%); in the lab a progressive pays its average.
- Five stock bonus games (Ember Link, Grand Wheel, Neon Tumble, Prospector's Haul, Treasure Cove) replace eight old machines on the Test Floor; numbers stay close to M8 (docs/spec/guests.md), no sanity flags. Tutorial year-end cash moves with seed luck (one seed hit an early big jackpot). Big Floor steady state within ~5% of m8.
- Save schema 16 (migration from 15).

## 2026-09-24 · Green light for M8.5 (owner's answers)
- Owner said "green light for m8.5" and agreed to the plan, with changes:
  - **Big meters draw guests even without a bank sign**, just less; a sign strengthens the pull.
  - **More ability to move the ratings:** today most designs land at Excitement 3–6 and Intensity 2–5 (Drain already spans 0–10). Designs should be able to reach the whole 0–10 scale on both.
  - **Performance index** gets a short in-game explanation next to it, and it should be a lifetime figure over every machine of that design in the casino (theoretical win), not one that swings with each jackpot.
  - **Design sales (M8.6):** total units sold is a hidden number fixed at the sale, reached along an S-curve of random length, so royalties climb while the player wonders how big it gets. Most sell 10–30, some 100+, very rarely thousands (the scenario winner). Each sold design is its own budget line.
  - Word of mouth and sales stay in M8.6; the maker's cut on theoretical edge is agreed; offer thresholds agreed.

## 2026-09-24 · M8.5 planned with the owner's notes (see docs/spec/designer.md, last two sections)
- Owner's notes after playing M8 folded into the plan: spaces in names, logo fonts, face layout, slam-stop keeps the win, no early reveal (slots and tables), word of mouth, linked progressives shared by every machine of a design with a pull that grows per doubling of meter ÷ bet, thought history per game kind for 6 months, and slot makers buying the player's own designs (one-time cash 10–100× cabinet price, 25–75% of the edge kept, 1–3% royalties on outside wins, wide-area progressives after a sale, a decent chance of a new offer after a decline).
- **Claude's calls (owner can overrule):** word of mouth and sale offers go in M8.6 (they need fans and novelty); M8.5 records design origin so they work later. After a sale the maker's cut is on theoretical edge, not actual win. "Layout and size of screen elements" read as the machine face (designer) plus a game-wide interface size. Linked banks no longer need to stand together; the bank sign becomes a placeable display.
- Waiting on the owner's green light for M8.5.

## 2026-09-24 · M8 built: the designer and the base game (Claude's calls; see docs/spec/designer.md "As built")
- Everything in the M8 part of the plan, plus the owner's additions: forced outcomes in the lab (any win tier, free spins, every jackpot, the top award, near misses, dressed-up losses), a live machine preview while designing, and a play screen modeled on the reference screenshots (top box, meters, side badges, credit/bet/win bar, button deck, hand pays).
- **The original three machines keep their old top prize as a jackpot** (same payback share), so they swing as before; guests' appeal for them is calibrated within ±0.15 of the old per-type values (the plan said ±0.1: two type/machine pairs land at 0.12–0.13 with starting tastes).
- **Intensity is felt swing** (jackpots excluded; they count as the top prize), so a penny game with a rare big jackpot still reads as gentle.
- Two more stock games so every cabinet has one: Platinum Reserve ($5 slant-top) and Lantern Fortune (a Dragon Link-style giant with four meters). Lucky Dragon is a slot theme now and a decor theme in the Luxury project; its four decor pieces are M8.6 art.
- Designer commands apply immediately (works while paused).
- Test Floor, 300 days: no sanity flags; numbers close to M9.6 (docs/spec/guests.md). Tutorial year-end cash moved with the new draws (seed luck), reputation unchanged. Big Floor steady state ~3.2 ms/tick against m10's ~3.0 on the same machine (+5%, the per-machine design lookups).
- Save schema 15 (migration from 14).

## 2026-09-24 · Green light for M8 (owner's answers)
- Owner said "green light" and accepted every default and all five proposals: panel-measured ratings (NORTH_STAR's creative-core line amended), three parts (M8, M8.5, M8.6), emoji symbols on styled tiles, certification ($1,500, 7 days; uncertified = rigging), and market churn.
- **Owner additions:**
  - **Test runs can force any outcome**: free spins, each win tier, each jackpot level, the top award, a near miss, a dressed-up loss, including ones nearly impossible in normal play. A forced outcome is drawn from the real distribution within that outcome, so it looks exactly like the real thing.
  - **The designer shows a live play screen**: every change appears at once in the same machine view the player plays.
  - **Playing it should feel like a modern Vegas slot**, with fake money. Reference screenshots (Dragon Link, Buffalo Gold, Megabucks Mega Vault) set the look: a top box with the logo and the big meter, a row of jackpot meters, the reel screen with side badges (lines or ways), a credit / bet / win bar with a denomination badge, a button deck, jackpot hand-pay notices, cabinets with LED edge light.

## 2026-09-24 · M8 planned: the slot designer in three parts (readiness defaults for the owner)
- Owner: M8 should be a long, complex build: the creative core, as deep and rewarding as RCT's coaster builder, able to make games that play like Buffalo, Lightning Link or Dragon Link, with a rating that rewards good and creative design and punishes poor choices, and never goes stale. Plan in docs/spec/designer.md; parts in ROADMAP.
- **Flagged, NORTH_STAR conflict:** NORTH_STAR says "The game never tells the player whether a creation is good. Guests show them." The owner asked for a rating. Proposed resolution: RCT-style **Excitement / Intensity / Drain**, where Excitement is measured from a test panel of the scenario's own guests (the floor's hidden guest model, run without a room), and Intensity and Drain are plain math. Never labelled good or bad; the floor stays the truth. NORTH_STAR is unchanged until the owner confirms.
- Questions put to the owner:
  1. The ratings above, and amending NORTH_STAR's line to allow them.
  2. **Three parts:** M8 designer and base game (with free spins), M8.5 bonuses and progressives, M8.6 the market (novelty, trends, rival releases, fans).
  3. **Symbols as emoji** on styled tiles in the play screen (they look like real rendered slot symbols on an iPhone, no art cost); the floor stays pixel art.
  4. **Certification:** a new design costs $1,500 and 7 days; running one uncertified (any payback, near misses above chance) is the rigging dark lever the inspector can catch.
  5. **Market churn** (novelty fading, a yearly Slot Expo of trends, rival releases): what keeps the player redesigning. Any of it unwelcome?
- Defaults (from the M8 readiness check, plus Claude's): guests never perceive payback directly, only through outcomes, and regulars build a "tight" name for draining designs; near misses extend play for chasers; small wins celebrated as wins please Tourists, Party and Families and put off Locals and High rollers; excitement makes money lost feel better spent; stock models become editable designs calibrated to today's appeal; one design library on the phone across all saves, with share codes; a Lucky Dragon (Asian fortune) theme; bright cartoon themes draw children; hunters (advantage players) on must-hit-by meters and kept collectors.

## 2026-09-24 · Hotfix: look, layout freedom, bigger Free Play lot (owner; "green light")
- **Play-it-yourself screens look and move like the real games** (owner: more realistic, more satisfying): reel strips, dealt and flipping cards, a real roulette wheel and ball, tumbling dice, keno balls, casino chips, counting wins and a coin shower. See docs/spec/play.md.
- **The whole building is the player's** (owner): the shell and the scenario's doors can be demolished, doors go in any wall, and new street entrances can be built beside the sidewalk ($500). Claude's call: indoors is now derived (floor the open air can't reach), so walling in lot ground makes an extension and a hole to the outside makes a room outdoors until closed. Entrances can't be removed (not asked for; keeps guests' way home simple).
- **Free Play Lot is about 8× bigger** (owner asked 5–10×): 156×108 owned tiles around the same building, with the two land parcels moved east. Existing Free Play saves keep their map.
- **Outdoor ground is Vegas sand, not grass; every room purpose but the general floor has its own floor**, concrete for the enforcement room (owner). See docs/spec/art.md.
- **Janitors sweep in half the time** (owner): 1 s per spot at skill 1.
- No save schema change: indoors is recomputed only when walls change, and old saves' `fixed` shell flags are ignored for walls and doors.

## 2026-09-24 · Main menu from the Game tab (owner)
- Owner asked for a way back to the title screen (scenarios, sound). The Game tab has a **Main menu** button that asks first: **Save and go** (saves over the autosave), **Go without saving** (goes back to the last autosave) or Cancel.

## 2026-09-24 · M10 built (Claude's calls; see docs/spec/audio.md, docs/spec/play.md)
- **Same odds as a guest, checked exactly:** roulette, baccarat (every 8-deck shoe enumerated), craps (real dice) and keno return what the guests' models say, and video poker classifies all 2,598,960 hands correctly.
- **The craps field bet is dropped** (it was in the plan): its edge isn't one a guest faces. Lay odds on don't pass are allowed at true odds.
- **A video poker royal pays 800 at any number of coins**, as the guests' model does. Slots take one wager per spin, where a guest's round is four.
- **You play your own hand:** no seat taken, and the table's shared outcome and guests are untouched. A table must have its dealer and a machine must be working. You can't leave mid-hand, but selling the object refunds what was out.
- **A title screen at every launch** ("Tap to start", because iPhone needs a tap before audio). It pauses the floor until Continue.
- **Nightclub music plays whenever the game runs.** Only the two loudest music sources play at once. The floor goes quiet when paused and drops to half while you play.
- **Door sounds are dropped** (they were in the plan): with doors on every route they'd be constant noise.
- Big Floor headless: ~8.0 ms/tick against m9.6's ~7.9 on the same machine (two runs each; noise).

## 2026-09-24 · Green light for M10
- Owner said "green light for m10".

## 2026-09-24 · M10 plan: owner's answers
- Owner accepts that winnings at your own games come from nowhere.
- **Same odds as guests:** you play the object's real rules and paytable with ordinary luck, never rigged either way. In blackjack and video poker your own decisions still count, as they do for a sharp guest.
- **Only real simulated games:** no sportsbook. Poker and bingo stay out.
- **No vibration.**
- **Generated music** (owner): a main theme on a new title screen, and a pick of tracks for each dance floor that fades with distance. Claude adds show-lounge music and a music volume slider.
- The other readiness defaults stand (blackjack depth, a separate "Owner's play" line in the books, no figure on the floor).

## 2026-09-24 · M10 planned: audio and playing the games yourself (readiness defaults for the owner)
- Plan in ROADMAP. Starting point: 25 synth recipes and one master mute. There's no distance, ambient bed, category volumes or working iPhone haptics yet.
- Defaults put to the owner:
  1. **Which games:** every house game incl. the sportsbook. Poker and bingo are excluded (FOUNDATIONS §23: player vs player).
  2. **Blackjack depth:** hit, stand, double, one split, no insurance or surrender. Shuffled every hand, so no counting.
  3. **Your money:** casino cash, on its own line in the books ("Owner's play"). It's kept out of machine and table stats, the gaming tax, skimming and the regulator.
  4. **On the floor:** you don't appear and don't take a seat. Guests keep playing the same object.
  5. **Haptics:** on for jackpots, placements and your wins. iPhone gets one light tick at most.
  6. **Positional sound and ambient floor:** on.
- Flagged: winning at your own tables pays out of thin air, because the table's bank is treated as outside money (NORTH_STAR: "gamble the house's fictional money as a diversion"). Owner-set rules can give the player an edge (e.g. a >100% video poker paytable with perfect play). That's accepted because hand-by-hand play earns too little to matter next to the casino's profit. Revisit in M11 if it doesn't hold.
- Math tests planned: roulette, baccarat (exhaustive enumeration), keno and craps returns will be checked against their TABLE_GAMES edges. Blackjack and video poker get invariant tests only (hand values, dealer rules, paytable lookups).

## 2026-09-24 · M9.6 built: vice, drugs, the hotel elevator (Claude's calls; see docs/spec/vice.md)
- Owner asked for the cut M9.5 items as their own pass, and for **staff caught stealing to be replaced automatically** (same job, room and bar; the ticker says so). Quits are still not replaced.
- **The elevator is a scenario feature**, a fixed floor tile (Free Play and the Test Floor; not the tutorial): hotel guests come and go by it by type (Conventioneers 80% … Locals never). Old saves have none.
- **Escorts are visitors, not a guest type** (FOUNDATIONS §6). The vice rule sets how many come and whether guards show them out. **The house's profit from vice is the room** ($50 when a guest goes up with one) plus the crowds who enjoy it; the costs are players leaving the floor, reports and police.
- **Drugs:** 0–15% of a type use, only in quiet spots with no guard in view; high = +40% bets and no tiredness for ~90 s; 2% overdose into passing out.
- New house rules default to Moderate. A hotel-room comp (a longer stay, $40) where there's an elevator.
- Test Floor, 300 days (rules on Moderate): 342 guests came by the elevator, 65 escort pitches (19 left with one, $1,000 in rooms), 7 hookups, 37 drug uses, no sanity flags. With both rules on Ignore (150 days): 195 pitches, 44 left with an escort, $2,200 in rooms; police standing didn't move, because vice costs police standing only through reports that go unanswered and officers who see it.

## 2026-09-24 · M9.6 requested: vice, drugs, hotel elevator; thieves auto-replaced
- Owner: "do a m9.6 pass to be its own vice and drug and hotel elevator pass", and auto-hire a replacement for a caught dealer.

## 2026-09-24 · M9.5 built (green light; Claude's calls; see docs/spec/calendar.md, docs/spec/research.md)
- Owner said "green light for m9.5" with no readiness questions, so every design call below is Claude's and starting values only.
- **Vice, the hotel elevator and a drug policy are cut** (the roadmap named them first to cut). They're unscheduled; say if they should come back as their own milestone.
- **Events are short in real time** (a day is 10 s), so their multipliers are strong: a convention brings Conventioneers ×40 for 4–7 days (a few dozen of them). Sportsbook and poker appeal also rise on their nights.
- **Research gates building** in the tutorial only: it starts with no projects done (tables, restaurants, shows, the club, outdoors, themes, cameras and Thunder Jackpot need research). Free Play, the Test Floor and the Big Floor start with every building project; information projects (overlays, heatmaps, the club, extra suspicion tiers) must be researched everywhere. Saves from M9 and earlier keep everything they could build.
- **The player's club** reveals types and value on the guest card, counts the floor by type, lets comps target one type, and relabels card doors. Guest breakdowns (machine and table stats by type) are a separate project after it.
- **Families:** children are a row shorter, carry no money, stay near the adults and aren't scored; underage gambling is a misconduct incident that guards resolve by walking the child back.
- Test Floor: a sportsbook below the pit, an 11th dealer as a spare (a crooked dealer fired early had been leaving roulette closed all run), Families and Conventioneers in the population and street mix.
- Big Floor headless: 7.3 ms/tick against m9's 6.8 on the same machine (one run each, spawn burst included).

## 2026-09-24 · Green light for M9.5
- Owner said "green light for m9.5".

## 2026-09-24 · M9 built (Claude's calls; see docs/spec/staff.md, docs/spec/money.md)
- All numbers are starting values checked only against sanity flags: pay range 60–160%, skill = knack × pay^0.6 × morale, crook share 5% ÷ pay^1.5, theft chances and amounts, catch chances, overwork above 85% busy, quitting below morale 20, tax rates, loan and emergency rates, insurance loading, whale sizes and timing, comp thresholds.
- **Dealers aren't worn down by a busy table** (dealing is the whole job); the first build counted it as overwork and every dealer on the Test Floor went miserable.
- **Crooked guards, pit bosses and operators look away** from cheats and from staff theft; a crooked dealer never catches a cheat at their table (this is dealer collusion, per the M7 decision).
- **Shrinkage is posted at the monthly count**, not as it happens: the books show where money went missing, a month late, never who.
- **Policies tab** now holds insurance, the tax and skim, and comps; loans stay in Finance. Research stays a placeholder until M9.5.
- **Whales** stay 20–30 real minutes (2–3× a high roller; weeks on the calendar) and a host shows them the floor, so they find their game.
- Unpaid winnings under $100 cost 2 regulator points and go to the log only; bigger ones are urgent.
- Test Floor, 300 days: staff morale averages ~44 at market pay, one crooked dealer caught, three whales (the house won $10K, lost $30K, won $500), five inspections, regulator 100, no sanity flags. Tutorial year-end cash $3.9K (m7 on the same seed: $5.0K; the 5% tax is ~$250 of that, the rest is seed noise from reshuffled staff draws). Big Floor timing unchanged against m7 on this machine.
- **Flagged for the owner:** a whale can cost the house several months of profit in one visit (by design: FOUNDATIONS §17); insurance doesn't cover it, table limits do.

## 2026-09-24 · Green light for M9: staff, money and risk, whales (see docs/spec/staff.md, docs/spec/money.md)
- Owner said "green light" and accepted the readiness defaults, with two changes:
  - **No hiring screen.** Staff quality scales with a pay slider per role (Claude: skill = a hidden personal knack × pay^0.6 × morale; better pay also means fewer crooks).
  - **Security catches staff stealing** and they're fired (Claude: guards, pit bosses and watched cameras; crooked guards, pit bosses and operators look away).
- Defaults accepted: one wage per role; ~5% crooks, seen only as monthly shrinkage per area; a gaming tax with skimming as a dark lever; a regulator ladder like the police with a visible inspector; loans at 50% of worth and 2%/month, emergency loans at 6% with a fee and a scandal, unpaid winnings, insolvency after 3 months; whales every 1-2 months where tables exist; comps by play (meal, show, come-back offer).
- Claude's calls: comps key on theoretical loss (what the math expects a guest to lose), as real casinos rate play; the insurance premium is 1.3× the exact expected excess of the month's actual wagers; the tutorial's tax is 5% so its goal barely moves.

## 2026-09-24 · M9 split into M9 and M9.5 (planning; details wait for the green light)
- Owner allowed two parts. Claude's split: M9 is inside the house (staff depth and honesty, the regulator, credit and insurance, whales and comps: leaks and variance); M9.5 is outside it (calendar and events, marketing, research tree and player's club, new crowds, vice). See ROADMAP.
- Why this seam: M9's parts all feed each other (theft needs audits, audits feed the regulator, whales test credit), and M9.5's research tree has to gate things that already exist, including M9's.

## 2026-09-24 · M8 (slot designer) moved after M10
- Owner: build M9 next; the slot designer is mostly standalone. Order is now M9 → M10 → M8 → M11. Milestone names and tags keep their numbers.
- Claude's call: M8 stays before M11, not after it, because balance tuning has to include player designs.
- What the M8 readiness check found, for that chat: guest slot taste is a per-model lookup (`games[model]`) and needs preferences over design parameters (stock models become presets calibrated to today's values); the regulator has a ladder but no detection (an audit inspector is the default). Defaults to put to the owner: guests can't perceive payback directly, only through outcomes; near misses extend play, dressed-up losses please some types and put off Locals and High rollers; a design library shared across saves; bonus features and linked progressives possibly split into M8.5.
- Moving M8 later resolves one conflict: machine stats "by guest type" can use M9's player's club instead of the Debug view.
- M9 builds the regulator's first triggers instead (skimming, unpaid winnings, dealer collusion); rigging and near-miss triggers join them in M8.

## 2026-09-24 · M7 built (Claude's calls; see docs/spec/tables.md)
- All numbers are starting values checked only against sanity flags: costs, wages (dealer $100, pit boss $140), round lengths, limit presets, tastes per type, `tableStake`, skill shares and costs, counter shares and gains, the pit boss and dealer catch rates, the counter-tagging rate, High rollers' data.
- **Every game is unit-risk wagers in the slot paytable shape**, so luck, cheating, the suspicion tools and the books work unchanged. Blackjack draws loss / push / win / natural with the win chance solved for the exact edge (no doubles or splits drawn); craps odds are separate wagers placed only when a point is set.
- **Shared outcomes are real:** one roulette number, craps decision, baccarat coup or keno draw per hand for the whole table; each player's result follows from their own bet. Luck there turns a loss into the bet's win (or a win into a loss) at chances that keep the ±20-point shift exact.
- **Poker and bingo are pools:** the house earns exactly the rake (10%, capped at $10 a pot) or hold (30%); skill decides who wins at poker, cards bought at bingo. No luck and no cheating there.
- **Dealers are hired staff** who walk to an open dealer spot; craps needs two, keno and bingo one each (a writer, a caller). Tables with no dealer are closed and say so on their card.
- **Guests bet more per hand at tables** (stake × `tableStake`), which makes the minimum the lever for who sits: Retirees rarely reach a $5 table and play keno and bingo instead.
- **Rules-aware guests** (Locals 0.6, High rollers 1) add half their weight × the table's rules score to its appeal and may say "Six to five blackjack? No thanks." Counters never sit at 6:5 and prefer fewer decks.
- **High rollers** come at a fifth of their rate to a casino without tables and 1.5× with tables in a high-limit room; they're a recurring pool (Test Floor 25, Free Play 40, none in the tutorial).
- **Table cheats pace their bets to their take** (take / 40 per hand): at a table's maximum, one hand could overshoot a whole take.
- Test Floor: a table pit on the main floor, poker, keno and four video poker machines by the door, a bingo hall in the quiet back room, baccarat in the high-limit room (its Thunder row shortened to four, the Liberty row to six), nine dealers and a pit boss, and three more restrooms (busier floor: Party and High roller guests were leaving for restrooms).
- **Fixed:** the pit boss stood at the door all day in the first build (a tile search started from inside the table); counters were never tagged.
- Tutorial books identical to M6.5; Big Floor steady state unchanged.
- **Flagged for the owner:** a cheat on a high-limit baccarat table still wins faster than one at a slot, and the Test Floor's cheats cost about $2–7K over 300 days depending on the seed (M6.5: ~$1–3K). Pit bosses and dealers are the lever; tuning is M11.

## 2026-09-24 · Green light for M7: games catalog and table rules (see docs/spec/tables.md)
- Owner said "green light" and accepted every readiness default, with one change: **no M7.5**, the whole catalog ships in M7.
- Catalog: blackjack, roulette, craps, baccarat, video poker, poker room (rake), keno and bingo. The sportsbook waits for the M9 event calendar.
- Tables draw each bet from its exact odds, like slots; the cards, wheel and dice shown are that real result. No deck simulation.
- Blackjack skill: guests make realistic mistakes, so the edge depends on who sits; card counters are a hidden trait and read like lucky or cheating guests.
- Tables are social: several seats share one round, a table opens only with a dealer (paid staff), craps draws onlookers and watching counts as fun.
- Limits per table: the minimum decides who can sit, the maximum caps exposure; a high-limit room multiplies both by 5.
- Locals and a new High rollers type notice rule changes; Tourists and Party guests don't.
- Game tastes per type are Claude's call, checked against sanity flags.
- **Dealer collusion moves to M9** with hidden staff honesty (resolves the M5/M9 conflict). Table cheating by guests is in M7.

## 2026-09-24 · M6.5 built (Claude's calls; see docs/spec/themes.md, docs/spec/construction.md)
- Theme math and numbers are starting values checked against sanity only: strength 3 / radius 4 per piece, walls cut 60%, clashing pairs count 2.5× (a clash has to hurt more than a good pair helps), unrelated themes muddle at 0.8, curated bonus 0.3, per-type `theming` 0.3 / 0.5 / 1.0 / 0.6.
- **General items only count toward a theme where that theme is already present** from themed pieces, so a palm alone never "themes" a room; it can only reinforce one (the curated bonus).
- Pieces are all 1×1 in M6.5 (48 new sprites); bigger showpieces can come later.
- Outdoors: pool (people come for it), garden (a rest for sore feet), patio bar and restaurant (the indoor ones, outside). No weather.
- Land: Free Play Lot grows to 80 wide with two lots for sale; land keeps its price in worth. The tutorial has none.
- Test Floor: themed rooms and a front yard (pool, patio bar and restaurant, garden, tiki torches), plus a side door from the yard into the club so pool-goers can reach a restroom.
- Big Floor unchanged (~2.3 ms/tick; nothing themed there, so themes cost nothing).

## 2026-09-24 · Green light for M6.5: themes, outdoors, land parcels (see docs/spec/themes.md, docs/spec/construction.md)
- Owner said "green light for m6.5", built in the same chat as M6.

## 2026-09-24 · M6 built (Claude's calls; see docs/spec/construction.md)
- Numbers are starting values checked only against sanity flags: amenity costs and upkeep (a default bar, restroom and cage cost and run exactly as before), tier thresholds, meal $18 (house cost $6), show every 100 s for 45 s, cover $10, `comeFor` shares, smokers' shares and urge (~4½ min), the high-limit ×5, the 90 s let-out.
- **Amenities draw extra arrivals, and those extras are the people who came for them:** each kind adds `comeFor` × (1 + 0.25 × tier) to a type's arrival rate, and an arriving group's reason is drawn at the same odds. People who came for something head roughly toward it and search a little longer; mazes still defeat them.
- **Fun time counts in the visit score** like play time, and money spent at meals, shows, cover and doors counts like money lost.
- **Existing bars become 3×2 areas** covering their old counter and stool row; restrooms and cages keep their shape. Nothing costs more than before.
- Card holders are returning guests, and their companions come in with them. Staff, police, paramedics and escorted guests pass staff, card and dress-code doors; only that role passes a one-role door (plus guests an enforcer is walking there).
- Trapped guests are let out only if a way out exists past unlocked doors; walls and locks still trap them (the M2.5 guarantee).
- Smokers with nowhere to smoke cut the visit short. Smoke bothers non-smokers only past a low tolerance, so a smoke-free floor changes nothing.
- Test Floor: an east wing (high-limit room, show lounge, club with restrooms, restaurant with restrooms, smoking room, card holders' bar); office and enforcement doors are staff only. **Fixed:** a sign had blocked the office door since M5, so the surveillance operator never reached the desk; M5's catch numbers on the Test Floor came from guards and chance only.
- Big Floor steady state: ~2.1 → ~2.3 ms/tick at 5,000 guests (smokers walking out to the lot is much of it).
- **Flagged for the owner:** the club has no bar of its own on the Test Floor, and party guests there drink less than in M4 (median peak 0.23, was 0.44). It's the kind of layout symptom the game is about, not a bug; a bar in or next to a club is the lever.

## 2026-09-24 · Green light for M6: construction (see docs/spec/construction.md)
- Owner said "green light for m6".
- **Themes** (owner): Ancient Rome, Ancient Egypt, Medieval, Rock & Roll, a few luxury flavors, a few old-school Vegas flavors, and a couple of Claude's picks. Claude's calls: luxury = Gilded Deco, Modern Luxe, Riviera; old Vegas = Rat Pack Lounge, Neon Atomic, Gold Rush; picks = Tropical Tiki, Pirate Cove. Hidden pairings are Claude's call (in the spec).
- **Amenities are sized** (owner) and grow sensibly with size: more stalls, more seats and bartenders, and so on. Every FOUNDATIONS §8 amenity except those tied to M9 systems: bar, restrooms, cage, restaurant, show lounge, nightclub, smoking room and high-limit room now; pool, garden, patio bar and patio restaurant with the outdoors in M6.5.
- **Room purposes:** the owner left the effects to Claude (in the spec).
- **No weather or seasons outdoors** (owner): always hot, sunny pool-party weather; inside is inside.
- **Door rules** (owner): open, staff only, locked, card holders, one guest type, one staff role, plus a fee for walking through. Claude's calls: until the M9 player's club, a "card holder" is a returning guest; a type rule reads as a dress code (types already look different); scenario doors and entrances can't be changed; a guest trapped behind doors they can't pass is let out by staff after 90 s, at 1 police-standing point each.
- **Split** (Claude, from the readiness check): m6 = doors, sized amenities, room purposes, reasons to visit; m6.5 = themes, outdoors, parcels.
- **Deferred to M9:** Families (minors and underage incidents) and the hotel elevator with vice.

## 2026-09-24 · M5 built (Claude's calls; see docs/spec/cheats.md)
- All numbers are starting values tuned against sanity flags: take median $400, spells of 30-90 s after 20-60 s honest, rigged wins on half the wagers at 4× the bet, catch chances (0.1%/s by chance, +0.6%/s per guard in view, +0.4%/s per unit of watched camera field, ×2.5 marked), 8 cameras per operator, heat and consequence costs.
- **Cheating is reliable, not jackpot-shaped**: scaling payouts by a factor left most spells losing on high-volatility machines, so a spell is rigged wins instead.
- **Luck is exact and shows as win frequency**: a lucky guest's losing wager is redrawn, an unlucky guest's win voided, at chances that shift payback by exactly ±20 points (checked by `npm run headless`). This makes lucky guests real false positives for the tools.
- **The cheat estimate reads mostly how often someone wins**, plus half of how much, against honest play with a broad tail. Measured: cheats median 75%, honest winners 1 in 100 above 27%.
- Cheats after their take ignore the usual quit rules and plan 1.5× the usual floor time.
- Suspicion tools per scenario: Lucky Horseshoe 2 (time, result vs expectation), Free Play and the test floors 4.
- Default house treatment: a ban for a first and a repeat offense. Enforcers are $150/mo, operators $120/mo, cameras $400, dumpsters $300.
- Guards can carry out warnings and bans; a beating or disappearance needs an enforcer. Without anyone on staff, a caught cheat is banned and shown out on the spot.
- A disappeared person is removed from the pool; a beaten one loses 40 disposition and their visit scores 0.
- Banned people still try now and then and are turned away at the door (log only).
- **Flagged for the owner:** on the tutorial (no security), cheats cost about $1.5K-2.3K of a $5K-7K yearly slot win. That's the intended pressure (hire a guard; mark the big winners), but it makes the $30K goal a little harder.

## 2026-09-24 · Green light for M5: cheats, suspicion tools, enforcement, luck tags (see docs/spec/cheats.md)
- Owner said "green light" for M5.
- **Cheats are about 1% of guests** (owner): uncommon, not a constant stream.
- **Dark enforcement** (owner): no censorship, but no blood, nudity or suffering: quick, clean animations that don't pull punches. Available from the start once an enforcer is hired (not research-gated).
- **House treatment for caught cheats** (owner): the enforcement room holds a setting for a first offense and for repeat offenses, chosen from the same actions the player can order on any guest (warning, ban, beating, disappearance).
- **Bans cover the whole group** (owner).
- Readiness calls the owner accepted: suspicion tool tiers are set per scenario until the M9 research tree; cameras, a surveillance operator and an enforcer arrive now, pit bosses wait for tables (M7); cheating is slots-only (dealer collusion M7); staff skimming moves to M9 with hidden staff honesty; no regulator triggers in M5 (M8/M9).
- Change from the readiness note (Claude): walled rooms with purposes already exist, so enforcement uses a real **Enforcement room** and cameras a real **Back office** instead of a stand-in object. Without an enforcement room, a beating or disappearance happens where the guest stands, in front of any witnesses.

## 2026-09-24 · M4 built (Claude's calls; see docs/spec/incidents.md)
- Catalog rates, tolerances, `policed` and `drama` values, the police costs and ladder numbers, fines ($100–$1,500), paramedics ($200), closures (3 days; 30 on losing the license) are starting values, tuned only against sanity flags.
- House rules cover the three policed categories (drunkenness, disorder, misconduct); celebration and social aren't policed. Default Moderate. The drunkenness rule also sets the bar/server cut-off (Moderate 0.8+, Strict 0.5+).
- Losing the license marks the scenario lost; the casino reopens after 30 days with standing 30, matching how a missed deadline lets you keep playing.
- The regulator has a standing and a line in the Authorities tab only (its causes are M5/M8).
- Reports: 0.06 × (1 − drama)² per bothered witness, so a busy Test Floor sees about one every ~30 s of real time; only the first report of an incident reaches the ticker (yellow).
- **Flagged for the owner:** incidents cost Tourists and Party guests 0.1–0.4 min of play on the Test Floor (annoyance from what they see, frustration in a bad mood). That's the designed cost of an unruly floor; levers are type `tolerance`, guards, and stricter rules.
- A spill empties the glass. Test Floor: two guards, one strong-drinks bar (a quarter comped), and two more restrooms (the drinking fix filled the old ones: tourists were leaving for lines).
- Police standing recovers 0.2 a day; a call costs 6, a paramedic 5, a fight 3. Tuned so a deliberately unmanaged drunk floor loses its license within ~250 days while the tutorial and a guarded floor never slip.
- Big Floor steady state: 1.92 → 2.01 ms/tick at 5,000 guests.

## 2026-09-24 · Green light for M4: incidents, house rules, police (see docs/spec/incidents.md)
- Owner said "green light" for M4.
- **Incidents come from causes** (owner): each needs a condition the player can see and change (drunk + holding a drink → spill; bad mood next to a drunk → argument → fight; chaser deep in the hole → breakdown; bursting, drunk and no restroom → a planter). Type data only scales how likely a condition turns into an incident.
- **Guests react to being policed and to what they see** (owner), not to the house-rule setting itself. The type field `leniency` becomes `policed` (how much being warned, cut off or ejected bothers them).
- **Police calls** (owner): only a guest who has reported several incidents that all went unanswered calls the police (3 unanswered reports; Claude's number for "multiple"). No per-room tally.
- **Drinking fix** (owner): trays hold 10 and servers ask everyone within 6 tiles. That alone didn't move intoxication (the bottleneck was a dry gap between drinks and 4-5 minute visits), so also (Claude's calls, flagged for the owner): guests order the next drink when down to the last quarter, servers offer again after 30 s (was 45) and head to the bar 12 s after the first order (was 20), readiness to accept grows with how far below their intended level a guest is, one standard drink adds 0.25 (was 0.16), and overshoot medians roughly tripled. Test Floor: 30% of party drinkers now get drunk (0.5+), 9% wasted, ~3% reach pass-out territory; locals and tourists ~7% drunk.
- **Police can lose you the scenario** (owner): standing 0 revokes the license.
- Deferred: vice (needs the hotel elevator, M6), underage (needs minors), drugs (M9 policies), bribery (M11), regulator triggers (M5/M8; M4 shows its standing only).

## 2026-09-24 · M3.1 art pass (Claude's calls; owner delegated style; see docs/spec/art.md)
- **Style "Velvet Night"**: top-down 3/4 pixel art at 16 px/tile, light from the top-left, a compiler-added 1 px ink outline on everything that stands, quiet dark floors, and the brightest pixels reserved for light sources. Written up as rules and a checklist in docs/spec/art.md.
- **People are paper dolls**: pose + outfit + hair/hat + accessories, with shades derived by the compiler. Type silhouettes: locals casual, retirees shorter with grey/puffed hair and cardigans, tourists sun hats, loud shirts and cameras, party guests blazers or short dresses. Staff read by uniform plus a prop (mop, toolbox, tray). Party makeup (sex) now shows. Cheats and chasers look like everyone else.
- **Drink is visible**: a glass or soda in hand while holding a drink, flushed faces from tipsy (0.25) and drunk (0.5), plus the existing stagger.
- **Rotation shows**: bar, cage, ATM and restrooms now have front/back/side art (before, only slots did).
- **Floor light and shade** are baked into the cached chunks: contact shadows, wall shadows, and colored light pools from neon, slots, bar, cage, ATM and fountain. Wide zoom now shows real object sprites instead of flat squares.
- Decor animations (neon flicker, fountain, bartender, slot lamps, palm sway) run on real time so fast-forward doesn't strobe them; sim-driven ones (walking, reels, wins) stay on ticks.
- The build menu shows a picture of each object.
- No gameplay code changed; saves are unaffected.

## 2026-09-23 · M3 revisions after the owner's first look (see docs/spec/guests.md)
- **Browsing, not failing** (owner): new guests sightsee first, pulled by the surroundings their type likes, learning the layout faster and noting machines they like; regulars check their favorite spots in turn. Frustration only builds once they want to sit and can't, slower in a good mood. Replaces "3 failures and they go home".
- **Guest numbers are sanity checks until near v1.0** (owner): the table in guests.md now shows current measurements plus which levers move each number; the agreed M3 targets stay as "design intent" for the tuning pass. Generator checks compare draws with the type data, not with fixed targets.
- **Drinks** (owner): servers are the main source. A guest holds one drink at a time, sipped over a minute or two while doing anything else; intoxication wears off slowly. Guests go to a bar only when thirsty with money, and may have several there. Server offers are accepted by chance (type, thirst, level, price, comps, drink), so more servers and comps mean more chances. Servers carry 6, collect orders until full or time's up, pick up at their bar (a second a drink), deliver, and restart near the bar. Each bar has its own price, comps, strength and service area; servers are assigned to the least-served bar and can be reassigned.
- Service areas are rooms (Claude's call): rooms already have names and M6 makes them purposeful; drawing areas by hand on a phone would be fiddly.
- Servers ask everyone within 2 tiles at a stop and walk faster than other staff (Claude's call: one-guest-per-stop couldn't keep up with a busy floor).
- Test floors must be realistic (owner): a hidden Test Floor scenario with every object, signs and servers is the measuring floor; the Big Floor gained ATMs and signs.

## 2026-09-23 · M3 built (Claude's calls while building; see docs/spec/guests.md)
- **Money scale (flagged for the owner):** the agreed visit lengths and losses can't both hold at 10 wagers per round (a $90 budget lasted under a minute of play). `WAGERS_PER_ROUND` is now 4; running costs came down ~40% to match what a seat earns (wages $70/$110/$90, slot upkeep $2–4, bar $50, cage $35, restroom $15). Tutorial year-end cash with a tech and a bar: ~$7K–$15K (M2: $12K–$17K). Full balance stays M11.
- The Lucky Horseshoe's arrival rates and market were scaled down (visits last ~2.5× longer, so the same arrivals packed the floor): ~60 guests on the floor with a tech and a bar, Locals reputation drifting to ~53.
- Targets are measured by `npm run targets` on a furnished Free Play Lot and reported in guests.md; generator draws are asserted in `npm run check`, emergent outcomes only reported.
- Planned floor time is drawn above the target visit length, since money, quit rules and the group end many visits first.
- Quit rules (win goal, loss limit, jackpot) now send guests home; since M2 they only made guests switch machines.
- A broke or bored leader waits for the group like anyone else; "the leader quits" means a quit rule or their time running out. "Waiting too long" is 2 minutes.
- An ATM object (withdrawals only) joins the cage, so ATM placement is a layout lever.
- Drink servers carry a tray of up to 3 drinks per bar run (one at a time couldn't keep up with a busy floor).
- One-off types: 30% of the M2 arrival formula come on purpose; the rest must be converted from passers-by.
- Guests stay indoors when wandering, and new arrivals head for the open door first (M2.5 guests drifted onto the lot and gave up).
- Party group makeup (all men, all women, mixed) is stored per guest now, for the M3.1 art pass.

## 2026-09-23 · Green light for M3
The owner said "green light for M3" (build the M3 guest design, now docs/spec/guests.md).

## 2026-09-23 · M3 guest design (built; see docs/spec/guests.md)
- A type is who someone is. Group size, play style and chasing are drawn per person. Couples are a group size. Chasing is a hidden per-person level your floor can raise across visits, not a type.
- A population pool of real returning people per scenario. Reputation for recurring types is the pool's memory; one-off types use word of mouth.
- The M3 roster is Locals, Retirees, Tourists and Party groups. The other types wait for the milestone that builds what they want (Claude's call; the owner left it open).
- Sidewalk and entrance threshold (owner): pedestrians decide at the door, and only people who cross the threshold count as guests. Scenarios define their own sidewalks and entrances.
- Drinking is a continuous inhibition spectrum (owner): sober guests at 0, drinkers on a skewed bell shifted by intent, with overshoot. The ATM works the same way (owner): some never use it, the rest are on a skewed bell of what they could and do draw, with repeat trips driven by mood, drink, chasing and luck. The rare tail is someone draining their life savings.
- Group leaves when the leader quits or half the group has waited too long. Hot machine belief is in. House-money and break-even effects are in.
- Drink policy is player-set: price multiplier, comped %, strength (owner).
- Numbers are set as target outcomes with spread, shape and hard caps, then checked headless (owner).
- Thoughts: counts averaged over ~2 in-game days, counted by thought id regardless of wording; wording variants only on the guest's card; floor thought bubbles removed (owner).
- Reports are rare: negative incidents left unaddressed while many low-drama guests are present (owner; M4).
- Jackpots are red and only big ones reach the ticker; fewer notifications overall (owner).
- Types look different, cheats never (owner). All guest visuals wait for an M3.1 art pass after M3 (owner).

## 2026-09-23 · After the external review of M2.5
- Real returning individuals move into M3: a finite, persistent population per scenario, each person with their own visit history and memory. This replaces the per-type familiarity stand-in, and bans, returning cheats and chasers' shrinking bankrolls depend on it.
- Accepted consequence of having no time of day: crowds that don't mix are always on the floor together. Space (rooms, zoning, sightlines, noise) is the only way to separate them, and types are told apart by season, events and marketing, not by hour.
- Guest update cadence: once-a-second work is spread across ticks, and seated guests recompute mood every 5 s. Walking, rounds and timers stay per tick. A machine search considers at most 400 machines. Big Floor, 5,000 guests, headless: average tick 2.5 → 1.3 ms, worst tick 13 → 4 ms.
- Whale bankrolls (M9) are sized to game money, not reality.
- Review claims checked and not needing action: the perf test already uses real guests on Big Floor, and FOUNDATIONS already marks the parts superseded by clock.md. Types don't yet look different on the floor; that's an M3 decision.

## 2026-09-23 · Green light for M2.5; wayfinding built
- Owner said "green light".
- Regulars: no per-object memory for now. Real returning individuals come in a later milestone. Until then each guest has a floor knowledge meter that grows while they're here, and it carries into later visits through a per-type familiarity. A regular only knows things built before their last visit.
- Signs are just objects. The player doesn't set arrows (too much micromanagement). A sign imperfectly points guests toward whatever they're looking for.
- Sight is ray-cast only when a guest decides what to do (no cache): simpler, and cheap enough at 5,000 guests.

## 2026-09-23 · M2.5: navigation and wayfinding before M3 (see docs/spec/navigation.md)
- Owner: guests knowing the path to every destination kills the point of layouts. Inserted M2.5 before M3; the M3 guest discussion resumes after it.
- Guests no longer choose from the whole floor. They act on what they can see, what they remember, and what signs say, then walk known routes on the existing path fields.
- Walls and slot banks block sight. Signs are placeable objects. Regulars remember the floor, and that memory goes stale after a remodel.
- A guest with a walkable path to an exit always finds it eventually; with none, they are truly trapped (replaces "walled-in guests leave anyway").
- Fields bias which visible waypoint wins; they don't steer footsteps (keeps cause readable). Staff stay omniscient.

## 2026-09-23 · Bigger peak crowds; two-level pathfinding
- Owner asked to raise the planned scale: the largest maps now aim for 5,000–8,000 guests at peak (was 2,000–3,000). Mid-size raised to ~500–1,500. Every guest is still one real person.
- Why it's safe: on the owner's iPhone, a tutorial floor with ~100 slots held 60 fps with ~18,000 guests. A new ~20×-size test map (Big Floor, hidden from New game) now drives the perf test, so the ceiling is measured where it matters.
- Pathfinding rebuilt as two levels (local window fields per destination + shared per-room sector anchor fields, exact reachability by components). The single-level cache would have rebuilt full-map fields constantly on big maps.
- Guests consider only machines within ~50 tiles (the nearest 16 free). That makes the search cheap, and it's plausible: nobody surveys a huge floor before sitting down.
- Far zoom draws objects as flat colors baked into the floor image; thought bubbles are capped at 24 on screen.

## 2026-09-23 · Green light for M2; vertical slice built
- Owner said "green light to build m2".
- Engine fixes done first, as planned: per-system commands (module-augmented `CommandTypes`), a `layout` hook, save fixtures (`tests/saves/schema-1.json` is a real M1 save; `schema-2.json` the M2 one).
- Guest roster stays open. M2 uses three placeholder types (Locals, Retirees, Tourists) with provisional numbers on the full §6 structure; the guest design discussion before M3 replaces them.
- Money scale: wagers per round raised from 5 to 10, the knob clock.md names for this. At 5, wallets barely mattered (a visit lost ~$30 of a $150 bankroll) and machines took years to pay back. At 10, guests can go broke, visits last a few minutes, and a busy machine pays for itself in months. Casino prices tuned to match (slots $300–$700). Provisional until playtesting.
- **Flag (FOUNDATIONS §8):** amenities are fixed-size objects (3-stool bar, 2-stall restroom, 2-window cage) in M2, not drag-sized zones with tiers. Zones need the construction work planned for M6.
- Guest types are hidden in the inspector (types are earned through the player's club, §16); the Game tab's Debug view shows them for testing.
- Cash can go below zero (wages, a big jackpot) because loans arrive in M9; building stops while it's negative. Scenario goals are checked at each month-end; a win or a loss doesn't end play.
- Tutorial goal (provisional): worth $30K and Locals reputation 60 by the end of December, Year 1.

## 2026-09-23 · Safety net (post-M1 review)
- `main` protected by a GitHub ruleset: no deletion, no force pushes (owner set it up 2026-09-23).
- Each finished milestone gets a git tag (`m0`, `m1`, …); a workflow attaches that version's playable `index.html` to a GitHub Release.
- Push at every stopping point.
- M2 starts with three engine fixes (per-system commands, layout hook, save fixtures); see ROADMAP.

## 2026-09-23 · Population ceiling from the iPhone perf test
- iPhone results with test walkers: sim 0.09 ms/tick and draw 0.3 ms (Default zoom) / 1.7 ms (Overview) at 5,000 agents. The estimate was ~32–36K at every speed, but that is extrapolated from 5,000. What was actually measured: 20,000 walkers held 60 fps (sim ~1.1 ms, draw ~1.9 ms per frame).
- Result: agent count doesn't limit the planned 2–3K peak. "Every guest is one real guest" holds at all scales (closes that FOUNDATIONS §26 item). The real ceiling will come from guest logic cost; re-run the perf test once M2 guests exist. The perf test now measures up to 20,000 instead of extrapolating.
- Workflow: after merging, don't check or report that Pages is live; the owner checks it.

## 2026-09-23 · Green light; M1 engine skeleton built
- Owner said "green light" and asked for M1.
- Hook cadences are tick / beat (1 s at 1×) / day / month / year, replacing the roadmap's "minute / hour", which predated the no-time-of-day clock. Why: there is no hour to hook.
- Test walkers stand in for guests in M1 so pathing, crowd fields, rendering and the perf test have agents; they spawn indoors and wander. Guests replace them in M2.
- Hidden-value overlays sit behind a Game-tab *Debug view* for engine testing only; the North Star rule (earned through research) holds for real play.
- Population ceiling: see the iPhone perf entry above.

## 2026-09-23 · RCT-style clock (see docs/spec/clock.md)
Replaces the same-day "time and population" decision, which kept time of day.
- No time of day or day of week. Calendar = date counter: 1 day = 10 s at 1×, 1 year ≈ 1 h. Owner's call, modeled on RollerCoaster Tycoon.
- Floor at human pace; guests may gamble for calendar days or weeks.
- Play is event-based: each visible round resolves a small fixed batch of real wagers (default 5). No off-screen simulation.
- Guest-facing prices look real; casino-level money (wages, upkeep, goals) is tuned game money, stated monthly.
- Speeds pause/1×/2×/4×/8×. Scenario deadlines in months and years.
- One guest is always one person.
- North Star skill 5 is now "Running the calendar" (seasons, events, marketing), and its Time section was updated to match.

## 2026-09-23 · Approach review (owner approved all)
- Sprites as palette-indexed text data compiled to atlases at load, not per-frame pixel painting. Why: v0.2's approach won't scale to 20x maps and drains battery; text sprites stay editable and recolorable.
- Procedural Web Audio sound effects defined as data. Why: no asset licensing, tiny build, tweakable.
- Real play build on GitHub Pages, installed to the iPhone home screen. Why: iOS evicts website storage after 7 days without a visit unless the site is on the home screen; also gives fullscreen. Artifacts stay for quick previews.
- Save export/import to a file as a backup.
- One chat per milestone; repo docs carry context.
- `main` is the published branch. Claude manages branches, PRs, and merges; the owner never has to.
- Setup-level code is allowed before the green light; nothing that hard-codes open design questions.

## 2026-09-23 · Project setup
- Stack per FOUNDATIONS §1: TypeScript 5.9, Vite 8, React 19 (UI only), Canvas 2D, `vite-plugin-singlefile` for one self-contained `index.html`.
- Layer rules enforced by a script (`scripts/check-boundaries.mjs`), not just convention.
- Playtest channel: each build published as a private Claude Artifact (playable in the Claude iPhone app). Netlify config included but optional.
- v0.2 prototype archived verbatim under `reference/v0.2/` as reference only.

## Open (need the owner)
- Parity target measure and the psychology freeze (M11.4 entry above).
- Teaching scenarios (owner asked 2026-09-25: each built like the tutorial, where not embracing the lesson fails and embracing it wins): Claude's draft in docs/spec/scenarios.md (four scenarios, their lessons, wrong moves, goals and a script-proved shipping bar). Needs the owner's yes, changes or cuts before the build chat.
