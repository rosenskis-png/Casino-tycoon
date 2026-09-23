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
- Branch: develop on the branch the session names; push with `git push -u origin <branch>`.
- Before every push: `npm run check` (typecheck, layer boundaries, single-file build, headless phone smoke test). Push only when green.
- Playtesting: publish `dist/index.html` as a private Artifact so the owner can play it in the Claude app. Reuse the same artifact URL across builds.
- Don't write tests that assert outcomes of random systems. Test invariants (no seat conflicts, finite numbers, saves reload) and exact math (a paytable's expected return equals its target).
- The owner has a limited token budget: keep chat replies tight, don't re-read big files needlessly, and don't dump code into chat.
