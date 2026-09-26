# Pixel-art kit (tools/pixelart)

**Use this for any new sprite bigger than a 1×1 prop** (and for small ones too if it helps). Built in Batch D for the
large decor and centerpieces. Python 3 only, no packages to install.

## Why it exists
Sprites are text grids of palette letters (docs/spec/art.md). Typing a 16×20 grid by hand is fine; typing an 80×96
volcano with three animation frames is not: every row must be the same width, shapes must be round, and shading must
run light-left to dark-right. You also can't see what you typed. This kit fixes both:
- **Draw with shapes, not characters.** `C(w, h)` is a canvas; `rect`, `ell` (ellipse), `poly`, `line`, `cyl` (a box
  shaded left to right) and `ramp` (pick a shade by position) fill it with palette letters. A fill can be a function
  of (x, y), so stripes, bricks and shading are one line each. Frames are the same function with a frame number.
- **Look before exporting.** `preview.py` renders sprites to a PNG with the ink outline on the carpet color; open it
  with the Read tool and fix what looks wrong. Screenshot in the game afterwards (`npm run build && npm run shot`).
- **Export is exact.** `emit.py` writes the rows into a `src/data/*.ts` file, checks the widths, and stores animation
  frames as only the rows that change. The game never runs Python: it only sees the text rows.

## Files
- `px.py`: the canvas, shape tools, `cyl`, `ramp`, palette loading (reads `PALETTE` from src/data/art.ts) and PNG writer.
- `sprites/<module>.py`: sprite sources. Each defines `S = {key: (rows, local_palette)}` (keys as in the atlas:
  `name`, frames `name~1`, `name~2`) and `PALS = {"NAME": local_palette}` naming any local colors it uses.
  - `large.py`: the 14 large decor pieces (`big_*`). `centerpieces.py`: the 6 centerpieces (`cp_*`).
- `preview.py`, `emit.py`: see below.

## Workflow (run from the repo root)
1. Write or edit a sprite function in `sprites/<module>.py` (copy a similar one). Palette letters: art.md §3. Local
   colors (`pal`) only from unused letters (`A B D I J W o`) and named in `PALS`.
2. `python3 tools/pixelart/preview.py <module> <scratchpad>/p.png [keys...] [--scale N]`, then Read the PNG. Iterate.
3. `python3 tools/pixelart/emit.py src/data/artLarge.ts LARGE_SPRITES large centerpieces` (or a new output file and
   export name for a new module; register a new export once in `src/render/atlas.ts`).
4. Add `ANIMS` (frame timing) and `LIGHTS` (light pools) entries in `src/data/art.ts` if needed.
5. `npm run build`, screenshot the object in the game, `npm run check`.

Generated files say so in their first line: edit the sprite source and re-export; never hand-edit them.

## Drawing tips (what worked)
- Draw back to front: later shapes cover earlier ones (a figure's plinth, then its body, then its head).
- Light from the top-left: `ramp(["T", "t", "S", "s"], x, x0, x1)` or `cyl(...)` for anything round or boxy; lit
  top faces one or two rows of the lightest shade.
- Bottom of the canvas is the footprint's bottom edge; the sprite is centered on the footprint. Keep the top of the
  canvas free and let `rows()` trim it.
- Scatter texture with a deterministic formula (`(k * 37) % w`), never `random`, so re-exports don't change the art.
