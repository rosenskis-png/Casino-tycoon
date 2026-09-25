# Scenarios: the teaching ladder (design, 2026-09-25; awaiting the owner)

NORTH_STAR "Progression and scenarios", FOUNDATIONS §20. The tutorial (The Lucky Horseshoe, docs/spec/economy.md)
set the pattern the owner asked every early scenario to follow: **one lesson, taught by the setup, where ignoring the
lesson fails and using it wins.** The tutorial's lesson is *read your target market's psychology*: no new games, so
the only way to win is to make the floor right for tourists and families.

## Rules every teaching scenario follows
1. **One lesson, and the goal measures it.** A worth goal alone can be met a dozen ways; each scenario adds the goal
   that only the lesson moves (walk-ins, gaming win, reputation held, police standing).
2. **Seal the bypasses with setup, not with rules text.** Every other route to the goal is closed by the map, the
   market, the guest cap, the toolset or the money. The player never reads "you can't do that"; it just doesn't work.
3. **The wrong move is the obvious one on day one**, and it fails *visibly*: a stat or a wave of thoughts the player
   can read, well before the deadline, so they can still turn it around.
4. **The right move isn't named.** The blurb describes the situation, never the answer.
5. **Lessons stack.** Each scenario assumes the ones before it (clean, themed, the right rules) and tests one new idea.
6. **Proved by script before it ships.** `npm run ladder <scenario>` plays an idle run, the wrong move and the right
   move on seeds 1–3: idle and wrong must lose on every seed, right must win on every seed, with a margin (not by a
   hair). A lesson that only wins on a lucky seed isn't taught.

## The ladder
Order: **get them in the door → walk them to the games → play to how they play → loosen them, but not too far.**

| # | Scenario | Lesson (NORTH_STAR skill) | Wrong move that fails | Right move that wins |
|---|---|---|---|---|
| 0 | The Lucky Horseshoe (built) | Read the market (1) | Wait; spam nothing (no games to add) | Clean, retheme, rules, attractions for tourists and families |
| 1 | Boardwalk Frontage | The threshold: curb appeal (2) | A nicer interior, more machines, ads | Open up to the boardwalk: an entrance, games and light in view |
| 2 | Big Top Family Resort | Temptation by layout (2) | More and better slots in the slot hall | Games on the paths: show exit, restaurant line, golf gate |
| 3 | Sundowner Club | Savvy crowds: edge vs time (1, 2) | Tight machines, big flashy jackpots | Loose games, video poker, comfort, volume |
| 4 | The River Belle | Inhibition and its price (2, 3) | Strict and dry, *or* free strong drinks and Ignore | Lenient on drink, strict on fights, games at the club door |

---

### 1 · Boardwalk Frontage: "Nobody comes in if they can't see in"
**Lesson:** most guests aren't coming; they're walking past. Whether they step in is decided at the door (the
threshold, guests.md "Sidewalk and the entrance threshold").

**Setup**
- A long, narrow arcade building on a busy boardwalk: the highest footfall in the game (tourists 2, party 1).
- The boardwalk face is a blank wall. The only entrance is at the far end, round a corner, opening into a walled
  entry passage with a closed door: from the sidewalk, nothing is visible inside (curb appeal ≈ 0.2).
- Inside: 24 slots in a back hall, a bar, restrooms, clean and inoffensively themed (Tiki; the lesson isn't theming).
- **No market:** no locals or retirees pool, on-purpose arrivals near zero (`arrivals` 0.02). Nobody knows the
  place. Tourists and party guests are one-off types, so almost all business must come off the boardwalk.
- $15K. Slots only (no table research), the Tiki and Vegas themes, the bar. Street entrances can be built ($500).
- Goal: **walk-ins** (a new goal: guests who stepped in off the street this month ≥ 400) in one month, and worth
  $25K, by the end of Year 1.

**Wrong moves and why they fail**
- More or better machines, more decor inside: curb appeal only reads what's visible from the door, and an unknown
  place gets no on-purpose arrivals. Walk-ins stay ~1 a day.
- Advertising: campaigns multiply on-purpose arrivals, which are near zero here. They cost money and do little.
- **The symptom:** the Guests tab's "walked past" climbs into the thousands while "stepped in" barely moves. The
  lesson is in a stat page, which is what FOUNDATIONS §20 asks early scenarios to teach.

**Right move:** knock a street entrance through the boardwalk wall (or tear out the entry passage), keep it open, and
put games, neon and noise in the doorway's line of sight (up to 12 visible machines count). Appeal ≈ 1.3 makes each
passer-by about 7× as likely to step in (walk-in × (0.2 + appeal)).

**Engine work:** a `walkins` goal (the Guests tab already counts them); nothing else.

---

### 2 · Big Top Family Resort: "They didn't come to gamble"
**Lesson:** families and tourists come for the attractions; they gamble only when a game catches them on the way
(guests.md "Temptation": exposure, waiting, the free hook, flash).

**Setup**
- A resort that is already a success at everything but gaming: mini golf, a show lounge, a restaurant and a pool,
  all built and busy. Families 60, Tourists 55. **The guest cap is reached most days** (`maxGuests` tight).
- The slot hall (40 machines, nicely themed Pirate Cove) is its own wing down a corridor off the lobby, more than 12
  tiles and two walls from every attraction, so nobody walks past a game unless they came to gamble. Almost no one
  has (locals market 0; families' lists don't include gambling).
- $25K. Machines can be moved ($50, construction.md). The Just for fun themes; progressives and big-jackpot slots
  researchable (flash).
- Goal: **gaming win** (a new goal: the casino's gaming win in one month ≥ $X, set by measurement at about the families
  crowd floor's take) and Families **held** ≥ 55 at every month-end of the last 6 months, by the end of June, Year 2.

**Wrong moves and why they fail**
- More slots in the hall, or better ones: seats draw sublinearly and don't draw families at all (arrivals come from
  reasons). The cap is full anyway: more arrivals can't happen, only more of the guests already there gambling.
- More attractions: same wall, the cap. They lift the fun score, not the gaming win.
- Squeezing them (pricier tickets, closing the pool so they "have to" gamble): reasons vanish, arrivals and the
  held Families reputation fall.
- **The symptom:** the hall's seats sit empty (machine stats, and heatmaps if researched) while the show exits spill
  hundreds of adults with nothing to do. "Came for else / of them played" in the Guests tab stays in single digits.

**Right move:** move banks onto the paths: by the show exit and the restaurant line (waiting is exposure), at the
golf and pool gates (the free hook: mom and the kids are busy), flashy games with a meter or recent hit in view.
The families crowd floor already shows it: 72% of adults gamble there.

**Engine work:** `gaming` and `hold` goals. The existing measurement (games near attractions: 54% of party guests
played vs 39% without) must be much wider here; the proof run sets the hall's distance until it is.

---

### 3 · Sundowner Club: "Locals can do the math"
**Lesson:** a savvy crowd seeks thin edges and judges a visit by how long their money lasted (guests.md "Savvy";
visit value = play time per dollar lost). With a finite market, the house edge is a rate you charge for time.
Volume on a thin edge beats margin.

**Setup**
- A small-town locals' club with a **finite market**: locals 140 and retirees 110, most already regulars; no
  tourists or party footfall. They come on their own, which the tutorial never showed.
- The last owner's machines are designs dialed **tight** (84–86% payback) with big, rare top awards: exciting in the
  lab, poison on this floor. The slot designer and conversion kits ($50) are available, video poker researchable.
- $20K, a smoking room, cheap food and drink.
- Goal: Locals ≥ 65 and Retirees ≥ 60 **held** at every month-end from month 7 to month 12, and worth $35K, by the
  end of Year 1.

**Wrong moves and why they fail**
- Keep the tight machines, or add flashy high-edge games: each visit earns more at first, but money goes in minutes,
  visit scores fall, dispositions follow, regulars come back less often and chasers bust out of their savings for
  good. The pool shrinks; the held reputation fails and so, later, does the money.
- Tempting them with spectacle and drinks-as-hooks: locals' hooks are weak (they came to gamble anyway).
- **The symptoms:** "{game} ate my money fast", "That went fast", savvy players crowding the one loose bank while
  the rest sit idle, and the Guests tab's returning count sliding month on month.

**Right move:** convert the floor to loose designs (93–96%), steady hit rates and small jackpots; video poker; the
smoking room and quiet comfort; enough seats for volume. The edge is thin, but they come back weekly for a year.

**Engine work:** `hold` goal. Needs measurement: the right move must out-earn the tight floor by month 12, not just
out-score it. If it doesn't, tune the market (more regulars, faster returns), not guest psychology.

---

### 4 · The River Belle: "Loosen them up, but not too loose"
**Lesson:** drink is the strongest lever on a party crowd (hooks.drink 1.5, savvy eroded by drink), and it has a
price in incidents and the police (incidents.md). Set house rules per category, not all strict or all loose.

**Setup**
- A riverboat: tight decks, no outdoors, no land to buy (space is the constraint). A club on the upper deck, games
  below.
- The party crowd is the market (plus some tourists). Police standing starts at 55 after the last owner's trouble,
  one step from an inspection.
- The last owner overcorrected: every house rule on **Strict**, drinks weak and pricey, guards ejecting anyone tipsy.
  The club's exit stair lets out straight onto the gangway, away from the games.
- $20K. The club, bars, servers, guards; slots and craps (the loud table, flash).
- Goal: Party ≥ 60 and worth $X by the end of Year 1, with police standing **held** ≥ 50 all year.

**Wrong moves and why they fail**
- The tutorial's instinct (rein it all in): Strict drink rules throw out the very crowd the boat exists for,
  "Security's way too uptight here", Party reputation falls, and sober party guests barely play.
- The opposite (free strong drinks, rules on Ignore): fights, reports, police calls; standing drops through 50 and the
  held goal fails, whatever the money says.

**Right move:** Lenient on drink, Strict on disorder, servers on the gaming deck, guards posted where drunks gather,
games at the foot of the club stair (party guests gamble when they leave the club drunk and happy), craps for the
cheering crowd.

**Engine work:** a `standing` hold goal (police). Starting police standing per scenario (small).

---

## Engine work for the ladder (one build chat)
- **Goals** (additive fields on `Goals`, `src/sim/goals.ts`, the Goals tab): `walkins` (in one month), `gaming` (gaming
  win in one month), `hold` (a reputation or police standing kept ≥ X at every month-end in a window). Missing a held
  bar once in the window fails that bar for good (the tab says so).
- **Scenario data:** `researchable` (the projects this scenario can research at all), starting police standing, and a
  starting design library per scenario (Sundowner's tight designs).
- **Unlocks:** the New game list shows the ladder in order, each opened by winning the one before (kept on the device
  across saves, like the design library). The tutorial and Free Play are always open.
- **`npm run ladder <scenario> [strategy] [months] [seeds]`**: idle, wrong and right scripts per scenario, placed
  through the real build commands, reporting the goal bars month by month. The shipping bar is rule 6.
- Save schema bump (new goal progress fields, the hold record) with a migration.

## Next rungs (not designed yet)
- **Leaks:** The Pit (cheats and card counters at tables: ignoring winners bleeds the edge, banning every winner
  hits innocents and brings rumors).
- **Variance:** Salon Privé (a whale with no reserve or insurance sinks you).
- **Calendar:** Convention Row and Fight Night (a floor and staff right for event week, wrong for the slow months).
