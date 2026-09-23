# Decisions

Newest first. One entry per decision: date, what, why.

## 2026-09-23 · Time and population (see docs/spec/time-and-population.md)
- One guest is always one real person. Casinos are smaller than real ones instead, and goals are tuned to match. Owner's call.
- Slow speed is 1 game hour = 30 s (a day = 12 min) so visits look human; medium 8×, fast 30×, and a new max speed ~120×.
- Per-guest money stays in real dollars; scenario totals scale with the simulated population.
- Scenario lengths: early 2–8 weeks, core 2–6 months, largest up to 1–3 years.

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
