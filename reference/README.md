# Reference material (not part of the build)

`v0.2/CasinoTycoon.v0.2.jsx` is the single-file React prototype (header says v0.1.0, `VERSION` says 0.2.0), pasted by the owner on 2026-09-23 and stored verbatim.

It is inspiration, not a codebase to refactor. Port pieces only when they fit the new architecture:

| Worth porting | Where it lives in v0.2 |
|---|---|
| Seeded RNG (mulberry32) | `rngNext`, `R` |
| BFS distance maps, path-from-gradient, Bresenham LOS | section 3 |
| Rotation transforms, seat/zone layout generation | `xf`, `xfDir`, `objLayout`, `zoneTier` |
| Field math (radiate, noise BFS, enclosure, crowding) | section 4 |
| Paytable scaling to exact hold | `VOL_TEMPLATES`, `paytable` |
| Thought selection from biggest field gap | `periodicThought`, `FIELD_THOUGHTS` |
| Pixel art: people, slots, tables, zones, buildings | section 8 |
| Palette and UI tokens (oxblood, mahogany, brass, felt) | `CSS` |

Known things NOT to carry over: single mutable module-level canvas context, fields with hard 0-100 caps (spec wants uncapped sources with saturating response), daily cash-reserve loss rule (spec removed it), per-guest BFS every decision (spec wants cached distance fields), one shared RNG stream.
