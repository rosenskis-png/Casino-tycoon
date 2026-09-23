# Roadmap

Status key: ☐ not started · ◐ in progress · ☑ done. Each milestone ends with a playable (or at least watchable) build published as an Artifact.

## M0 · Prep ☑
Repo, toolchain (Vite + TS + React + single-file build), layer-boundary check, headless phone smoke test, CI, docs, v0.2 reference archived, `main` branch, GitHub Pages publishing, home-screen web app manifest and icon, storage adapter with save export/import, screenshot tool, session-start dependency hook.

## M1 · Engine skeleton ☑  (see docs/spec/engine.md; iPhone perf: 20K walkers at 60 fps)
- State, runtime caches, save/load + migration chain, autosave
- Fixed-timestep clock and speeds per `docs/spec/clock.md`, hook cadence (tick / beat / day / month / year), dependency-ordered system registry
- Command bus (validate → apply → log), event bus (sim → ticker, audio, fx, stats)
- Named RNG streams
- Grid: terrain, walls, doors, indoor/outdoor; room detection by flood fill
- Distance-field pathfinding cache with targeted invalidation
- Field engine: sources, falloff, wall attenuation, dirty-region recompute
- Sprite pipeline: text sprites → atlas; procedural sound pipeline
- Renderer: chunked static layers, 4 zoom levels, camera, touch pan/pinch
- UI shell: top bar, ticker + log, tab bar, inspector frame
- Perf test: max agents at 60 fps on a phone at each speed (sets the population ceiling)
- `window.__ct` debug hook: headless N-day runner + invariant checks used by the smoke test

## M2 · Vertical slice ☑  (see docs/spec/guests.md, gaming.md, floor.md, economy.md)
- Engine fixes: commands register per system; layout changes reach systems through a `layout` hook; save fixtures per released schema in `tests/saves/`, loaded and stepped by `npm run check`.
- Tutorial scenario (The Lucky Horseshoe) with a worth + Locals reputation goal; Free Play Lot.
- Three slot models with exact paytables, 10-wager rounds, breakdowns, machine stats. Bar, restrooms, cashier cage. Rotation.
- Janitors and slot techs; litter.
- Guests on the full §6 structure (3 provisional types), tastes, needs, mood, thoughts with floor bubbles and a daily summary, reputation per type, arrivals.
- Books by category, monthly close, worth. Staff, Guests, Finance and Goals tabs; guest, staff and machine inspectors.
- Save schema 2 (migration from 1; M1 walkers retire).

## M2.5 · Navigation and wayfinding ☐  (see docs/spec/navigation.md; design agreed, awaiting green light)
Guests know only what they see, remember, or are pointed to by signs. Sight lines (walls and slot banks block), waypoint hopping weighted by determination, signs as objects, regulars' stale memory, truly trapped guests.

## M3 · Guest model depth ☐  (needs guest design discussion)
Groups, intentions, betting behavior, quit rules, intoxication, drink servers.

## M4 · Incidents, house rules, authorities ☐
## M5 · Cheats, suspicion tools, enforcement, luck tags ☐
## M6 · Construction: walls, rooms with purposes, outdoors, parcels, theming ☐
## M7 · Games catalog and table rules ☐
## M8 · Slot designer ☐
## M9 · Staff depth, policies, marketing, comps, whales, events, research tree ☐
## M10 · Audio, play-the-games-yourself ☐
## M11 · Scenarios, tutorial, balance ☐
