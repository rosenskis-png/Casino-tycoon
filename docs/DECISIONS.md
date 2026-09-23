# Decisions

Newest first. One entry per decision: date, what, why.

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
