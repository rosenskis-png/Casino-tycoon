# Decisions

Newest first. One entry per decision: date, what, why.

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
- Guest roster and parameters (FOUNDATIONS §26), before M3.
