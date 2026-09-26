// Theming (FOUNDATIONS §5, docs/spec/themes.md): one hidden field per theme, spread like the other qualities
// (fading with distance, cut by walls), from themed decor; general items quietly add to themes they suit where a
// theme is already present; clashing items weaken themes. Each tile gets a theme score from its dominant theme,
// the hidden pairings, the curated bonus and the muddle of unrelated themes; each room gets a coherence. Guests
// read only the score (sim/guests.ts). Runtime cache, rebuilt on layout and purpose changes; never saved.
import { OBJECTS } from "../data/objects";
import { SYNERGY, THEME_IDS, THEME_PEAK, THEME_RADIUS, type Place } from "../data/themes";
import { designById } from "./design/lookup";
import { themeOf } from "./design/theme";
import { T } from "../data/terrain";
import type { Game } from "./game";
import { objSize } from "./geometry";
import { purposeAt } from "./amenities";
import { wallsBetween } from "./fields";

const K = THEME_IDS.length;
/** Fraction of a theme removed per wall crossed (doors half). M11.1: 0.35 (was 0.6), so a clashing room next door is felt. */
const WALL_CUT = 0.35;
/** A general item only counts toward a theme already this present from themed items. */
const PRESENT = 0.2;
/** How much each unit of an unrelated theme muddles the dominant one. */
const MUDDLE = 0.8;

interface Src { k: number; kind: 0 | 1 | 2 | 3; cx: number; cy: number; s: number; r: number }

export class ThemeField {
  /** True once any themed decor exists; until then every score is 0 and nothing is allocated. */
  active = false;
  themed: Float32Array[] = [];
  gen: Float32Array[] = [];
  clash: Float32Array[] = [];
  /** (M11.2) Broken theming (one field for every theme). */
  junk = new Float32Array(0);
  /** Per-tile quality from the tile's own mix, and the final score guests read (tile + room coherence). */
  q = new Float32Array(0);
  score = new Float32Array(0);
  /** (M8) Dominant theme per tile (index into THEME_IDS, -1 none), kept with `q`. */
  dom = new Int8Array(0);
  /** Per room: dominant theme (-1 none) and coherence. */
  rooms: { dom: number; coh: number }[] = [];
  private sources: Src[] = [];
  /** The widest source's radius. */
  private reach = THEME_RADIUS;

  constructor(private g: Game) {}

  private alloc() {
    const n = this.g.state.map.w * this.g.state.map.h;
    const mk = () => Array.from({ length: K }, () => new Float32Array(n));
    this.themed = mk(); this.gen = mk(); this.clash = mk();
    this.junk = new Float32Array(n);
    this.q = new Float32Array(n);
    this.score = new Float32Array(n);
    this.dom = new Int8Array(n).fill(-1);
  }

  /** Where an object stands, as hidden places: indoors or out, near water, the room's purpose. */
  private placesOf(x: number, y: number): Set<Place> {
    const g = this.g, m = g.state.map, i = y * m.w + x, out = new Set<Place>();
    out.add(m.outdoor[i] ? "outdoor" : "indoor");
    for (let dy = -3; dy <= 3 && !out.has("water"); dy++) for (let dx = -3; dx <= 3; dx++) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= m.w || Y >= m.h) continue;
      const j = Y * m.w + X, o = g.objAt[j] ? g.objById.get(g.objAt[j]) : undefined;
      if (m.terrain[j] === T.WATER || o?.kind === "pool" || o?.kind === "fountain") { out.add("water"); break; }
    }
    const p = purposeAt(g, i);
    if (p === "floor" || p === "bar" || p === "restaurant" || p === "highlimit" || p === "club" || p === "show" || p === "smoking") out.add(p);
    return out;
  }

  private collect() {
    this.sources = [];
    let themedAny = false;
    for (const o of this.g.state.objects) {
      // M8: a designed slot themes its spot a little, like a weak decor piece (docs/spec/designer.md §2).
      if (o.design && OBJECTS[o.kind].slot) {
        const d = designById(this.g.state, o.design), th = d ? themeOf(d) : null, k = th ? THEME_IDS.indexOf(th as never) : -1;
        if (k >= 0) { themedAny = true; this.sources.push({ k, kind: 0, cx: o.x, cy: o.y, s: 0.8 * THEME_PEAK, r: THEME_RADIUS }); }
        continue;
      }
      const tags = OBJECTS[o.kind].tags;
      if (!tags) continue;
      const { w, h } = objSize(o), cx = o.x + (w - 1) / 2, cy = o.y + (h - 1) / 2, r = tags.radius ?? THEME_RADIUS;
      if (tags.junk) { themedAny = true; this.sources.push({ k: 0, kind: 3, cx, cy, s: tags.junk * THEME_PEAK, r }); continue; }
      const at = this.placesOf(Math.round(cx), Math.round(cy));
      // Hidden place fit: suited places strengthen an item, clashing ones weaken it.
      let mult = 1;
      if (tags.suitsPlace?.some((p) => at.has(p))) mult += 0.3;
      if (tags.clashesPlace?.some((p) => at.has(p))) mult -= 0.5;
      if (tags.theme) {
        themedAny = true;
        this.sources.push({ k: THEME_IDS.indexOf(tags.theme), kind: 0, cx, cy, s: (tags.strength ?? 3) * mult * THEME_PEAK, r });
      }
      for (const [t, wgt] of Object.entries(tags.suitsTheme ?? {})) this.sources.push({ k: THEME_IDS.indexOf(t as never), kind: 1, cx, cy, s: 1.5 * (wgt ?? 0) * mult * THEME_PEAK, r });
      for (const [t, wgt] of Object.entries(tags.clashesTheme ?? {})) this.sources.push({ k: THEME_IDS.indexOf(t as never), kind: 2, cx, cy, s: 1.5 * (wgt ?? 0) * THEME_PEAK, r });
    }
    this.reach = this.sources.reduce((m, s) => Math.max(m, s.r), THEME_RADIUS);
    if (themedAny && !this.active) { this.active = true; this.alloc(); }
    if (!themedAny && this.active) { this.active = false; this.themed = []; this.gen = []; this.clash = []; this.junk = new Float32Array(0); this.q = new Float32Array(0); this.score = new Float32Array(0); this.dom = new Int8Array(0); this.rooms = []; }
  }

  /** Recompute everything a change in this box can reach (or the whole map). */
  update(x0: number, y0: number, x1: number, y1: number) {
    // (Batch D) The widest source's reach, before or after (a removed centerpiece's area is cleared too): large
    // decor and centerpieces theme further than THEME_RADIUS.
    const before = this.reach;
    this.collect();
    if (!this.active) return;
    const { w, h, terrain } = this.g.state.map, R = Math.max(before, this.reach) + 1;
    x0 = Math.max(0, x0 - R); y0 = Math.max(0, y0 - R); x1 = Math.min(w - 1, x1 + R); y1 = Math.min(h - 1, y1 + R);
    for (const set of [this.themed, this.gen, this.clash, [this.junk]]) for (const v of set) for (let y = y0; y <= y1; y++) v.fill(0, y * w + x0, y * w + x1 + 1);
    const keep = 1 - WALL_CUT;
    for (const src of this.sources) {
      const r = src.r;
      const sx0 = Math.max(x0, Math.ceil(src.cx - r)), sx1 = Math.min(x1, Math.floor(src.cx + r));
      const sy0 = Math.max(y0, Math.ceil(src.cy - r)), sy1 = Math.min(y1, Math.floor(src.cy + r));
      if (sx0 > sx1 || sy0 > sy1 || src.k < 0) continue;
      const v = src.kind === 3 ? this.junk : (src.kind === 0 ? this.themed : src.kind === 1 ? this.gen : this.clash)[src.k];
      const ox = Math.round(src.cx), oy = Math.round(src.cy);
      for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
        const d = Math.hypot(x - src.cx, y - src.cy);
        if (d > r) continue;
        const walls = wallsBetween(terrain, w, ox, oy, x, y);
        v[y * w + x] += src.s * (1 - d / (r + 0.5)) * (walls ? Math.pow(keep, walls) : 1);
      }
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const tq = this.tileQuality(y * w + x); this.q[y * w + x] = tq.q; this.dom[y * w + x] = tq.dom; }
    this.coherence();
  }

  /** A tile's theme values (general items counted only where their theme is present), dominant theme and quality. */
  tileQuality(i: number): { dom: number; q: number; v: number[] } {
    const v: number[] = new Array(K);
    let d = -1, s = 0;
    for (let k = 0; k < K; k++) {
      const t = this.themed[k][i];
      v[k] = Math.max(0, t + (t > PRESENT ? this.gen[k][i] : 0) - this.clash[k][i]);
      if (v[k] > s) { s = v[k]; d = k; }
    }
    const junk = this.junk[i];
    if (d < 0 || s < 0.05) return { dom: -1, q: junk > 0.05 ? -3 * Math.tanh(junk / 3) : 0, v };
    let bonus = 0, muddle = 0;
    for (let k = 0; k < K; k++) {
      if (k === d || !v[k]) continue;
      const syn = SYNERGY[d][k];
      // Pairs that undermine each other hurt more than good pairs help; unrelated themes just muddle.
      if (syn) bonus += syn * Math.min(v[k], s) * (syn < 0 ? 2.5 : 1);
      else muddle += MUDDLE * v[k];
    }
    // Curated: general items reinforcing the dominant theme alongside themed pieces.
    const gen = this.themed[d][i] > PRESENT ? this.gen[d][i] : 0;
    const curated = 0.3 * Math.min(gen, this.themed[d][i]);
    const Q = s + bonus + curated - muddle - 0.5 * this.clash[d][i] - 1.5 * junk;
    return { dom: d, q: 3 * Math.tanh(Q / 3), v };
  }

  /** Room coherence: the room's average quality × how much of its theming is one theme. Then the final scores. */
  private coherence() {
    const g = this.g, n = this.q.length, rooms = g.rooms.rooms, roomOf = g.rooms.roomOf;
    const sumQ = new Float64Array(rooms.length), cnt = new Float64Array(rooms.length), per = rooms.map(() => new Float64Array(K));
    for (let i = 0; i < n; i++) {
      const r = roomOf[i];
      if (r < 0) continue;
      sumQ[r] += this.q[i];
      cnt[r]++;
      for (let k = 0; k < K; k++) { const t = this.themed[k][i]; if (t) per[r][k] += t; }
    }
    this.rooms = rooms.map((_, r) => {
      let d = -1, best = 0, total = 0;
      for (let k = 0; k < K; k++) { total += per[r][k]; if (per[r][k] > best) { best = per[r][k]; d = k; } }
      return { dom: d, coh: d < 0 || !cnt[r] ? 0 : (sumQ[r] / cnt[r]) * (best / total) };
    });
    for (let i = 0; i < n; i++) {
      const r = roomOf[i];
      this.score[i] = 0.6 * this.q[i] + (r >= 0 ? 0.6 * this.rooms[r].coh : 0);
    }
  }

  /** The theme score guests read at tile i (0 when nothing is themed). */
  at(i: number): number { return this.active ? this.score[i] : 0; }

  /** (M11.1) The dominant theme at tile i (index into THEME_IDS), or -1. */
  domAt(i: number): number { return this.active ? this.dom[i] : -1; }
}
