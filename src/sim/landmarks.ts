// (Batch D, owner) Centerpieces as landmarks (docs/spec/themes.md "Large decor and centerpieces"): outdoors they
// draw passers-by at the entrances nearby; anywhere, they add to the whole casino's sights for every crowd, more for
// crowds who like their theme. Cached with the casino's draw until the layout changes; never saved.
import { OBJECTS } from "../data/objects";
import { GUEST_TYPES } from "../data/guests";
import { LANDMARK } from "../data/psych";
import type { Game } from "./game";
import { objSize } from "./geometry";

interface Mark { cx: number; cy: number; draw: number; out: boolean; theme: string }

function marks(g: Game): Mark[] {
  const out: Mark[] = [], m = g.state.map;
  for (const o of g.state.objects) {
    const def = OBJECTS[o.kind];
    if (!def?.landmark) continue;
    const { w, h } = objSize(o), cx = o.x + (w - 1) / 2, cy = o.y + (h - 1) / 2;
    out.push({ cx, cy, draw: def.landmark, out: !!m.outdoor[Math.round(cy) * m.w + Math.round(cx)], theme: def.tags?.theme ?? "" });
  }
  return out;
}

function cache(g: Game): Record<string, number> {
  const f = g.fields;
  if (!f.landmarkCache) {
    const list = marks(g), c: Record<string, number> = {}, m = g.state.map;
    m.entrances.forEach((e, k) => {
      const ex = e % m.w, ey = (e - ex) / m.w;
      let v = 0;
      for (const l of list) {
        const d = Math.hypot(l.cx - ex, l.cy - ey);
        if (l.out && d <= LANDMARK.reach) v += LANDMARK.curb * l.draw * (1 - d / (LANDMARK.reach + 1));
      }
      c[`curb:${k}`] = v;
    });
    for (const t of Object.values(GUEST_TYPES)) {
      let v = 0;
      for (const l of list) v += LANDMARK.sights * l.draw * Math.max(0, Math.min(1.2, 0.6 + 0.6 * (t.themes[l.theme as never] ?? 0)));
      c[`sights:${t.id}`] = v;
    }
    f.landmarkCache = c;
  }
  return f.landmarkCache;
}

/** What outdoor landmarks add to a passer-by's glance in at entrance k. */
export const landmarkCurb = (g: Game, k: number): number => cache(g)[`curb:${k}`] ?? 0;

/** What the casino's landmarks add to a crowd's sights. */
export const landmarkSights = (g: Game, typeId: string): number => cache(g)[`sights:${typeId}`] ?? 0;
