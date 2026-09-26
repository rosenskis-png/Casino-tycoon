// The theme rating (docs/spec/symbols.md): how well a design's symbols hang together, judged from the emoji
// library's hidden tags, plus how well its cabinet, lights, call and colors suit them. Pure and cached; the player
// sees only the number.
import { EMOJI, EMOJI_LIST, KIDDY_TAGS, TAG_CLASHES, TAG_DECOR, TAG_TASTES, hueOf, type EmojiDef } from "../../data/emoji";
import { BODY_COLORS, LIGHT_COLORS, SLOT_THEMES, symSetOf, type SlotDesign, type SlotTheme, type SymbolSet } from "../../data/designer";
import { SYNERGY, THEME_IDS } from "../../data/themes";

/** How rare each tag is across the library: 1 for a tag two emojis share, near 0 for one half of them carry. */
const SPEC: Record<string, number> = (() => {
  const n: Record<string, number> = {};
  for (const e of EMOJI_LIST) for (const [t, s] of Object.entries(e.tags)) n[t] = (n[t] ?? 0) + s;
  const N = EMOJI_LIST.length, out: Record<string, number> = {};
  for (const [t, c] of Object.entries(n)) out[t] = Math.max(0.05, Math.min(1, Math.log(N / Math.max(2, c)) / Math.log(N / 2)));
  return out;
})();
export const tagSpec = (t: string) => SPEC[t] ?? 0;

/** Scoring constants (tuned so the premade sets land 6-8.5 and a random pick well under 3; `npm run headless` checks). */
export const TH = {
  /** A link's worth: rarity^RARE × (members beyond the first)^SIZE. */
  RARE: 2, SIZE: 1.2,
  /** Links per size of the set (weighted symbols / 6)^NORM: a small set needn't link as much as a full one. */
  NORM: 1,
  /** Two links joining the same symbols mostly count once (by overlap²). */
  SAME: 0.85,
  /** Links saturate slowly: Σ / (Σ + LINKS), so a better set always scores a bit more. */
  LINKS: 2.5,
  /** How much a symbol needs to feel woven in; below ORPHAN it belongs to nothing. */
  WOVEN: 0.45, ORPHAN: 0.04,
  /** Links that join the set into one world (rarity^RARE at least UNITE), and what a split set loses (× its unjoined share). */
  UNITE: 0.08, SPLIT: 0.4,
  /** The parts' weights, and the raw range stretched onto 0-10 (a random pick sits near R0). */
  W_LINKS: 0.55, W_BELONG: 0.2, W_SPINE: 0.15, W_ORDER: 0.1, R0: 0.28, R1: 0.86, ORPHAN_PEN: 0.9, CLASH_PEN: 3,
};

interface Sym { d: EmojiDef; w: number; rank: number }
const TREASURE = ["money", "treasure", "gem", "gold", "luck"];

export interface SetScore {
  /** 0-10 from the symbols alone. */
  score: number;
  links: number; belong: number; spine: number; order: number; unity: number; orphans: number; clash: number;
  /** Symbols judged (emoji only; card ranks and WILD aren't). */
  n: number;
  /** Share of the set carrying each tag (strength-weighted). */
  cover: Record<string, number>;
  /** The decor theme the symbols lean to (null: none clearly). */
  lean: SlotTheme | null;
  /** (Owner) The shared tags it earns credit from, most credit first, with the symbols sharing each. */
  shared: { tag: string; syms: string[]; credit: number }[];
  /** Colors, weighted. */
  palette: { hue: string; w: number }[];
  kiddy: number;
}

function symsOf(set: SymbolSet): Sym[] {
  const out: Sym[] = [], seen = new Map<string, Sym>();
  const add = (e: string, w: number, rank: number) => {
    const d = EMOJI[e];
    if (!d) return;
    const had = seen.get(e);
    if (had) { had.w = Math.max(had.w, w); return; }
    const s = { d, w, rank };
    seen.set(e, s); out.push(s);
  };
  set.highs.forEach((e, i) => add(e, 1, i));
  set.lows.forEach((e, i) => add(e, 0.6, 4 + i));
  add(set.scatter, 0.8, -1);
  add(set.jackpot, 0.8, -2);
  return out;
}

const cache = new Map<string, SetScore>();
const keyOf = (s: SymbolSet) => [...s.highs, "|", ...s.lows, "|", s.scatter, s.jackpot].join(",");

/** The symbol set's own score (no presentation). */
export function setScore(set: SymbolSet, fresh = false): SetScore {
  const key = keyOf(set);
  let r = fresh ? undefined : cache.get(key);
  if (r) return r;
  r = scoreSyms(symsOf(set));
  if (cache.size > 2000) cache.clear();
  cache.set(key, r);
  return r;
}

function scoreSyms(syms: Sym[]): SetScore {
  const n = syms.length, W = syms.reduce((a, s) => a + s.w, 0) || 1;
  // Members of each tag.
  const members = new Map<string, number[]>();
  syms.forEach((s, i) => { for (const t of Object.keys(s.d.tags)) { const m = members.get(t); if (m) m.push(i); else members.set(t, [i]); } });
  const cover: Record<string, number> = {};
  for (const [t, m] of members) cover[t] = m.reduce((a, i) => a + syms[i].w * syms[i].d.tags[t], 0) / W;
  // Links: a tag two or more symbols share, worth its rarity and how many it joins.
  const links: { t: string; m: number[]; L: number; sp: number }[] = [];
  for (const [t, m] of members) {
    if (m.length < 2) continue;
    const mass = m.map((i) => syms[i].w * syms[i].d.tags[t]);
    const beyond = mass.reduce((a, v) => a + v, 0) - Math.max(...mass);
    const sp = (SPEC[t] ?? 0) ** TH.RARE;
    links.push({ t, m, sp, L: sp * beyond ** TH.SIZE });
  }
  links.sort((a, b) => b.L - a.L || (a.t < b.t ? -1 : 1));
  // Links joining the same symbols as a stronger one mostly count once; different groupings count in full.
  const counted: { m: Set<number>; c: number; sp: number; t: string }[] = [];
  let total = 0;
  for (const l of links) {
    const ms = new Set(l.m);
    let J = 0;
    for (const c of counted) {
      let inter = 0;
      for (const i of ms) if (c.m.has(i)) inter++;
      J = Math.max(J, inter / (ms.size + c.m.size - inter));
    }
    const c = l.L * (1 - TH.SAME * J * J);
    counted.push({ m: ms, c, sp: l.sp * (l.L > 0 ? c / l.L : 0), t: l.t });
    total += c;
  }
  const dense = total / (W / 6) ** TH.NORM;
  const linkPart = dense / (dense + TH.LINKS);
  // Belonging: every symbol woven in by links of its own.
  let belongW = 0, orphans = 0;
  syms.forEach((s, i) => {
    let b = 0;
    for (const c of counted) if (c.m.has(i)) b += c.sp * s.d.tags[c.t];
    if (b < TH.ORPHAN) orphans += s.w;
    belongW += s.w * (1 - Math.exp(-b / TH.WOVEN));
  });
  const belong = belongW / W;
  // One world, not two: the share of the set in the largest group joined by links that mean something.
  const root = syms.map((_, i) => i), find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  for (const c of counted) if (c.sp >= TH.UNITE) { const [a, ...rest] = [...c.m]; for (const b of rest) root[find(b)] = find(a); }
  const groups = new Map<number, number>();
  syms.forEach((s, i) => groups.set(find(i), (groups.get(find(i)) ?? 0) + s.w));
  // A scatter or jackpot that reads as treasure belongs anywhere (the genre's convention).
  const loose = syms.reduce((a, s, i) => a + (s.rank < 0 && TREASURE.some((t) => s.d.tags[t]) && groups.get(find(i)) !== Math.max(...groups.values()) ? s.w : 0), 0);
  const unity = Math.min(1, (Math.max(...groups.values()) + loose) / W);
  // A through-line: one tag across most of the set.
  let spine = 0;
  for (const [t, c] of Object.entries(cover)) spine = Math.max(spine, (SPEC[t] ?? 0) ** 0.8 * Math.max(0, Math.min(1, (c - 0.35) / 0.5)));
  const order = orderOf(syms);
  let clash = 0;
  for (const [a, b, v] of TAG_CLASHES) if (cover[a] && cover[b]) clash += v * Math.min(1, 2 * Math.sqrt(cover[a] * cover[b]));
  const raw = (TH.W_LINKS * linkPart + TH.W_BELONG * belong + TH.W_SPINE * spine + TH.W_ORDER * order) * (1 - TH.SPLIT * (1 - unity));
  const score = n < 2 ? 0 : Math.max(0, Math.min(10, 10 * (raw - TH.R0) / (TH.R1 - TH.R0) - TH.ORPHAN_PEN * orphans - TH.CLASH_PEN * clash));
  // What the set leans to, its colors, and how kid-friendly it looks.
  const decor: Record<string, number> = {};
  for (const [t, c] of Object.entries(cover)) for (const [th, v] of Object.entries(TAG_DECOR[t] ?? {})) decor[th] = (decor[th] ?? 0) + c * v;
  let lean: SlotTheme | null = null, best = 0.3;
  for (const [th, v] of Object.entries(decor)) if (v > best) { best = v; lean = th as SlotTheme; }
  const pal = new Map<string, number>();
  for (const s of syms) pal.set(s.d.hue, (pal.get(s.d.hue) ?? 0) + s.w / W);
  const palette = [...pal].map(([hue, w]) => ({ hue, w })).sort((a, b) => b.w - a.w);
  let kiddy = 0;
  for (const [t, v] of Object.entries(KIDDY_TAGS)) kiddy += (cover[t] ?? 0) * v;
  const shared = counted.filter((c) => c.c > 0).sort((a, b) => b.c - a.c).map((c) => ({ tag: c.t, syms: [...c.m].sort((a, b) => a - b).map((i) => syms[i].d.e), credit: c.c }));
  return { shared, score, links: linkPart, belong, spine, order, unity, orphans, clash, n, cover, lean, palette, kiddy: Math.min(1, kiddy) };
}

/** Pay order against clout: grander symbols paying more reads right. 0-1. */
function orderOf(syms: Sym[]): number {
  const paying = syms.filter((s) => s.rank >= 0).sort((a, b) => a.rank - b.rank);
  let v = 0, w = 0;
  for (let i = 0; i < paying.length; i++) for (let j = i + 1; j < paying.length; j++) {
    const a = paying[i], b = paying[j], diff = a.d.clout - b.d.clout;
    const wt = a.rank === 0 ? 2 : b.rank < 4 ? 1.5 : a.rank < 4 ? 1 : 0.5;
    v += wt * (diff > 0 ? 1 : diff === 0 ? 0.6 : diff === -1 ? 0.25 : 0);
    w += wt;
  }
  const o = w > 0 ? v / w : 0.5;
  const jp = syms.find((s) => s.rank === -2);
  return 0.85 * o + 0.15 * (jp ? Math.max(0, Math.min(1, (jp.d.clout - 1) / 4)) : 0.5);
}

// ---------------------------------------------------------------------------------------------------------
// Presentation: the cabinet, lights, call and colors against the symbols (a small part of the rating).

const HUE_RING = ["red", "orange", "yellow", "green", "blue", "purple", "pink"];
function hueNear(a: string, b: string): number {
  if (a === b) return 1;
  if ((a === "brown" && (b === "orange" || b === "yellow")) || (b === "brown" && (a === "orange" || a === "yellow"))) return 0.5;
  const i = HUE_RING.indexOf(a), j = HUE_RING.indexOf(b);
  if (i < 0 || j < 0) return 0;
  const d = Math.min(Math.abs(i - j), 7 - Math.abs(i - j));
  return d === 1 ? 0.4 : 0;
}
/** How well one color sits with the symbols' palette, 0-1 (neutral colors are safe, never great). */
function colorFit(hex: string, pal: SetScore["palette"]): number {
  const h = hueOf(hex);
  if (h === "black" || h === "grey" || h === "white") return 0.4 + 0.3 * (pal.find((p) => p.hue === h)?.w ?? 0);
  return Math.min(1, 2 * pal.reduce((a, p) => a + p.w * hueNear(h, p.hue), 0));
}
/** A theme against the set's lean: its own +1, a good pairing up to +0.5, a clash down to -1. */
function themeMatch(t: string | undefined, lean: SlotTheme | null): number {
  if (!t || !lean) return 0;
  if (t === lean) return 1;
  const a = THEME_IDS.indexOf(t as never), b = THEME_IDS.indexOf(lean as never);
  if (a < 0 || b < 0) return 0;
  const s = SYNERGY[a][b];
  return s > 0 ? Math.min(0.5, s) : s < 0 ? Math.max(-1, 2 * s) : 0;
}

export interface ThemeRating { rating: number; set: SetScore; present: number; lean: SlotTheme | null }

/**
 * A design's theme rating, 0-10: its symbols' score plus presentation (-0.5 to +0.5). Premade sets lean to their
 * own theme.
 */
export function themeRating(d: SlotDesign): ThemeRating {
  const set = setScore(symSetOf(d));
  const lean = d.syms ? set.lean : d.theme;
  const body = colorFit(BODY_COLORS[d.cab.body]?.ramp[2] ?? "#888888", set.palette);
  const light = colorFit(LIGHT_COLORS[d.show.light]?.c[0] ?? "#ffffff", set.palette);
  const call = themeMatch(d.show.call.slice(5), lean);
  const look = d.syms ? themeMatch(d.theme, lean) : 1;
  const present = Math.max(-0.5, Math.min(0.5, 0.35 * (body - 0.4) + 0.3 * (light - 0.4) + 0.15 * call + 0.1 * look));
  return { rating: Math.max(0, Math.min(10, set.score + present)), set, present, lean };
}

/** A crowd's hidden taste for the symbols, -1..1. */
export function tasteFor(set: SetScore, type: string): number {
  const t = TAG_TASTES[type];
  if (!t) return 0;
  let v = 0;
  for (const [tag, w] of Object.entries(t)) v += w * (set.cover[tag] ?? 0);
  return Math.max(-1, Math.min(1, v));
}

/** The theme a design counts as on the floor and in pairings: its own, or (custom) what its symbols lean to. */
export const themeOf = (d: SlotDesign): SlotTheme | null => (d.syms ? setScore(symSetOf(d)).lean : d.theme);

/** Kid appeal: the theme's, or a custom set's from its tags. */
export const kiddyOf = (d: SlotDesign) => (d.syms ? setScore(symSetOf(d)).kiddy : SLOT_THEMES[d.theme]?.kiddy ?? 0);
