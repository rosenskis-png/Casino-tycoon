# Engine

What the engine provides (M1, with the M2 fixes) and the rules for extending it. See `docs/spec/clock.md` for time and pace.

## State and runtime
- `src/sim/state.ts` `GameState` is everything saved: plain JSON (numbers, strings, arrays, objects). Bump `SCHEMA_VERSION` and add a `MIGRATIONS[n]` entry in `src/sim/save.ts` on any shape change.
- `Game` (`src/sim/game.ts`) owns runtime caches rebuilt from state on construction: occupancy grid, rooms, path fields, quality fields. Never save them.
- Foot traffic (`state.traffic`) is history, so it is saved (integers: +1 per agent per beat, halved daily).

## Clock and systems
- `Game.step()` = one tick (20/s at 1×). Order: queued commands apply → every system's `tick` → `beat` every 20 ticks → `day` every 200 → `month` on day 1 → `year` on 1 Jan.
- Hook cadences are tick / beat / day / month / year. (The pre-green-light roadmap said "minute / hour"; there is no time of day, so the floor-pace cadence is the 1-second *beat*.)
- Systems register in `SYSTEMS` in `game.ts` with `deps`; `orderSystems` sorts them and rejects cycles or missing deps.
- The host (`src/ui/host.ts`) runs whole ticks per frame at the chosen speed (max 40/frame) and interpolates movement between ticks. Results are identical at every speed.

## Commands and events
- Each system brings its own commands (M2 fix). It declares their shapes by augmenting `CommandTypes` (`declare module "./commands" { interface CommandTypes { hire: { role: string } } }`) and lists handlers in its `commands` table (`CommandTable<"hire" | "fire">`). `Game` collects every system's table at construction; a type claimed twice throws.
- Current owners: `build` (build, place, remove, setRoom), `guests` (spawnGuests, clearGuests: debug/perf), `staff` (hire, fire), `incidents` (setRule), `cheats` (mark, enforce, setTreatment; docs/spec/cheats.md).
- Each handler has `validate` (returns a player-readable reason) and `apply`. `dispatch` validates immediately and queues; the queue applies at the next tick after re-validating. The last 200 results are kept in `game.commandLog` (runtime). `game.check(cmd)` validates without queuing (build ghosts).
- Events (`src/sim/events.ts`) are emitted during steps and delivered on `bus.flush()` (once per frame): tile changes, news, sounds, jackpots, breakdowns, day/month, command rejections. Never saved.

## Layout changes
- Commands that change terrain or objects call `game.tilesChanged(tiles)`. It refreshes the engine caches (rooms, path fields, quality fields), then calls every system's `layout(g, tiles)` hook (M2 fix), then emits `tilesChanged`. Systems repair their own state there: movement moves agents off newly blocked tiles, guests drop seats on objects that vanished, staff drop targets.

## RNG
- `rng(state, "name")` returns a stream whose position is saved in `state.rng[name]`, seeded from the scenario seed and the name. Streams so far: `walkers` (wander points), `guests`, `arrivals`, `gaming`, `staff`, `smoke`, plus `pool`, `street`, `incidents`, `police`, and `cheats` (luck, cheating spells, catches, enforcement; M5).
- `npm run boundaries` fails if `sim/` uses `Math.random`, `Date.now`, `new Date(`, or browser globals.

## Grid and rooms
- Terrain per tile: `VOID` (unowned), `FLOOR`, `WALL`, `DOOR`, `WATER` (`src/data/terrain.ts`), plus `outdoor`, `fixed` (scenario-owned, can't be changed) and `door` state (open / staff / locked).
- Players build walls on floor, doors in non-fixed walls, and demolish non-fixed walls/doors. Entrance tiles stay clear.
- Rooms are detected by 4-way flood fill over floor, split by walls, doors, and the indoor/outdoor edge. Names and purposes live in `state.roomMeta`, keyed by an anchor tile; a room keeps the first meta whose anchor lies inside it, and metas whose room vanished or merged are dropped.

## Pathfinding
Two levels (`src/sim/paths.ts`, rebuilt after M2 for the 8,000-guest target), all runtime cache:
- **Local fields**: a BFS limited to a 33×33 window around each destination (every seat gets one; ~2 KB each, 8,192 kept).
- **Anchor fields**: full-map BFS fields toward one anchor per room per 16×16 sector, shared by every destination of that room in that sector (memory-budgeted at 24 MB, so ~260 on the largest maps).
- `paths.next(here, dest, id)` gives the next step. On a tile the destination's local field reaches, go downhill on it; anywhere else, go downhill on the anchor's field. The anchor is itself reached by the local field, so routes are strictly downhill on one field and then the other: they can't loop. A destination whose local field can't reach its anchor gets a full-map field of its own.
- `paths.reachable(a, b)` is exact, from connected-component labels of the walkable grid.
- A layout change drops components, anchors and local fields wholesale (they're cheap), and full-map fields that reached a changed tile or its neighbor.
- Walkable = floor without a blocking object, or an open door. Tie order between equal steps alternates by agent id, so crowds spread over parallel routes.
- Guests look for machines within 3 sectors (~50 tiles), nearest 16 free ones considered, using a per-sector index of slots.

## Quality fields
- Channels and per-channel wall cut are data (`src/data/fields.ts`); objects list emissions `{ channel, strength, radius }`.
- Value = strength × (1 − d / (r + 0.5)) × (1 − cut)^walls crossed (Bresenham line; doors count half). Sources add without a cap.
- A tile change recomputes only the bounding box of the change grown by the largest emission radius.
- CRW is rebuilt each beat from agent positions; TRF reads saved traffic.
- Overlays and per-tile values show only in the Game tab's *Debug view* (engine testing). Players earn them through research later.

## Rendering
- Sprites are text grids in `src/data/art.ts`, compiled once into an atlas (`src/render/atlas.ts`). People are recolored into 16 looks at compile time.
- Terrain draws into cached 16×16-tile chunks, redrawn only when a `tilesChanged` event touches them.
- Objects and people draw per frame, on screen only, y-sorted. Zoom levels are 64 / 32 / 16 / 8 CSS px per tile (Close / Default / Wide / Overview). At Wide, people become simplified blocks; at Overview, dots.

## Sound
- Recipes in `src/data/sounds.ts` (oscillator or filtered noise voices), played by `src/platform/audio.ts`. Audio unlocks on the first touch (iOS rule).

## UI shell
- Top bar (cash, date, pause/1×/2×/4×/8×), ticker with the §21 display rules (`src/ui/ticker.ts`) and a Log sheet (last 30 game days), world canvas with zoom buttons, a scrolling tab bar, a bottom sheet per tab, and an inspector sheet. Only Build and Game do anything in M1. The phone layout stays provisional until its design discussion (FOUNDATIONS §26).
- Touch: one finger pans (or draws with a build tool), two fingers pan and pinch between zoom levels, tap inspects or places.

## Saves
- Autosave every 30 s while running and whenever the app is hidden (`ct.save.auto`); one manual slot (`ct.save.manual`); export/import to a JSON file. A save that fails to load is set aside under `ct.save.broken`, never deleted.
- Save fixtures (M2 fix): `tests/saves/schema-<N>.json` holds one real save per released schema. `npm run headless` loads every fixture through the migration chain, steps it a day, and checks invariants; it fails if the current schema has no fixture. A schema bump therefore needs a migration in `src/sim/save.ts` and `npm run fixture` (writes the new schema's fixture once; never regenerate a released one).

## Checks
- `npm run headless` bundles `src/sim` and runs it in Node: smoke over 7 days × 2 seeds on the tutorial, exact-math checks (every paytable returns its declared payback), every save fixture, plus a timing line.
- The smoke check (`window.__ct.smoke`, also run in the phone-size browser by `npm run smoke`) builds and demolishes at random from the `smoke` stream and checks each day: finite numbers, array lengths, the books add up to cash exactly, objects and their seats on open floor without overlaps, occupancy in sync, agents on walkable tiles and never jumping, no two guests holding one seat, players at their machine, wallets and needs in range, reputation 0-100, room index matches terrain, fields finite and non-negative, save round-trips exactly. Random player activity covers every command. After the run: two runs with one seed match exactly, and a reloaded save continues identically to the original.

## Performance test
- Game tab → *Perf test* runs on the hidden **Big Floor** test map (240×200, ~20× the tutorial lot, ~9,000 slots plus bars, restrooms, cages, 20 janitors, 20 techs). It times sim ms/tick and draw ms/frame with real guests at 500 / 1,000 / 2,500 / 5,000 / 8,000 / 12,000 (Default and Overview zoom) and estimates the most guests that fit a 12 ms frame budget at each speed. Before this change (M1 and the first M2 build) it used walkers, then guests, on the small empty lot.
- At Wide and Overview zoom, objects are baked into the cached floor image as flat colors; only people draw per frame. (Floor thought bubbles were removed in M3.)
- Headless Chromium on the dev container (2026-09-23): sim ~0.12 ms/tick at 5,000 agents; drawing dominates (~19 ms at Default zoom with 5,000 on screen), giving ~3,200 agents at every speed.
- Owner's iPhone (2026-09-23): 5,000 agents cost sim 0.09 ms/tick and draw 0.3 / 1.7 ms. 20,000 walkers ran at a real 60 fps (sim ~1.1 ms, draw ~1.9 ms per frame). Walkers are cheap; re-measure with M2 guests.
- Owner's iPhone, first M2 build (2026-09-23): the old test (guests on the empty lot) estimated 25,853 / 25,087 / 23,684 / 21,302 guests at 1× / 2× / 4× / 8× (sim 0.85 ms/tick and draw 3.9 / 9.0 ms at 20,000). A real tutorial-size floor with ~100 slots, a bar and restrooms held 60 fps with ~18,000 guests at 1× (sim 0.73 ms, draw 2.1 ms per frame), with the path cache at its old 96-field cap.
- Before the two-level pathfinding, the Big Floor cost 11 ms/tick with 2,000 guests in headless Node (full-map field per seat, every guest scanning every machine). After (2026-09-23, headless Node): 2,000 guests 0.5 ms/tick, 5,000 1.2 ms, 8,000 2.2 ms, 12,000 3.7 ms. Headless Chromium (software drawing, slower than the phone) estimates ~20,000 / 16,000 / 10,800 / 6,900 guests at 1× / 2× / 4× / 8×. The iPhone ran the sim ~3× faster than this container on the old test. Owner to re-run on the iPhone.
- `npm run headless` also runs 5,000 guests on the Big Floor, checks invariants, and prints ms/tick.
