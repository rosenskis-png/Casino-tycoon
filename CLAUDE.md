# Casino Tycoon

A RollerCoaster Tycoon–style casino management game for phones. The owner builds it entirely through Claude Code on an iPhone, so everything must be operable from chat: no local tooling, no external apps required to play a build.

## Sources of truth (in precedence order)
1. `docs/NORTH_STAR.md`: intent. Wins every conflict. Flag conflicts, don't silently resolve them.
2. `docs/FOUNDATIONS.md`: implementation spec. Split into `docs/spec/<system>.md` as each system is built, and keep those current.
3. `docs/DECISIONS.md`: dated log of decisions made in chat. Add an entry whenever the owner decides something.
4. `docs/ROADMAP.md`: milestones and current status.
5. `reference/v0.2/`: old prototype. Inspiration only (see `reference/README.md`).

## Gate
No game code until the owner says the literal words "green light" in chat. Tooling, docs, and planning are fine before that. (Record the date in DECISIONS.md when it happens.)

## Architecture rules (enforced by `npm run boundaries`)
- `src/data/`: pure data registries. Imports nothing but `data/`.
- `src/sim/`: plain TypeScript. No React, DOM, canvas, `window`, `Math.random`, `Date.now`, or `performance`. Must run headless in Node or a Worker.
- `src/render/`: reads sim state, never writes it.
- `src/platform/`: browser adapters (storage, audio, haptics, lifecycle).
- `src/ui/`: React. Changes the game only by dispatching commands.
- Systems talk through the event bus and shared state, not by calling each other's internals.
- Every random draw goes through a named RNG stream (`rng(state, "gaming")`), so adding a system never reshuffles others.
- Saved state is plain serializable data. Derived caches live in the runtime and are rebuilt on load, never saved.
- Save shape change = bump schema + add a migration. From the first engine release on, saves must carry forward.

## Workflow
- The owner is new to GitHub and branches. Don't make them manage git: handle branches, PRs, and merges yourself, and explain any GitHub website steps click by click.
- `main` is the live branch; every push to it publishes to GitHub Pages (https://rosenskis-png.github.io/Casino-tycoon/), which the owner plays as a home-screen web app.
- Flow: work on the session's branch → `npm run check` green → push → open a PR to `main` → merge it once CI passes. Don't ask the owner to merge.
- Push at every stopping point, even mid-task. The cloud workspace is wiped when idle; unpushed work is lost.
- When a milestone is finished and merged, run the `release.yml` workflow (workflow_dispatch) with `tag: mN` and `commit: <merge commit sha>`; sessions can't push tags directly. It creates the tag and a GitHub Release with that version's playable `index.html`, so any past milestone can be recovered and played.
- `main` is protected against deletion and force pushes. Never rewrite its history.
- Before every push: `npm run check` (typecheck, layer boundaries, headless Node sim run, single-file build, phone-size browser smoke test). Push only when green.
- Visual changes: `npm run build && npm run shot -- out.png` (iPhone-size screenshot, `--landscape` optional). Look at it before handing off; send it to the owner when useful.
- Don't check or report when a merge goes live on Pages; the owner checks it (propagation takes a while).
- Quick previews may also go out as a private Artifact of `dist/index.html`; the Pages link is the real play build (saves persist there).
- One chat per milestone keeps token costs down; the repo docs carry context between chats. Update ROADMAP.md and DECISIONS.md before ending a milestone.
- Don't write tests that assert outcomes of random systems. Test invariants (no seat conflicts, finite numbers, saves reload) and exact math (a paytable's expected return equals its target).
- The owner has a limited token budget: keep chat replies tight, don't re-read big files needlessly, and don't dump code into chat.

## Engine conventions decided before M1
- Art is data: sprites are palette-indexed text grids compiled into sprite sheets (atlases) at load; frames blit cached images. Never paint sprites pixel by pixel per frame (v0.2 did). The renderer stays swappable for WebGL if a perf test demands it.
- Sound is data: short synth recipes played through Web Audio. No audio files.
- Saves: stored via `src/platform/storage.ts`, with export/import to a file as a backup. Call `requestPersistence()` at startup.
