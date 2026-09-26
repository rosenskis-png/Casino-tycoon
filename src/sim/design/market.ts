// The slot market (docs/spec/designer.md §6 and "M8.6 additions"): a design's life on the floor and beyond it.
// Word of mouth (awareness by guest type on a Bass curve), the novelty bump, boredom and favorites, fans and the
// guests they draw, variety, wishes, records and Evergreens, and slot makers buying the player's own designs.
// Guests only ever feel the result: how much a machine appeals to them is its judged appeal × this market factor.
import { LAYOUTS, featuresOf, kindOf, type SlotDesign } from "../../data/designer";
import { GUEST_TYPES } from "../../data/guests";
import { OBJECTS } from "../../data/objects";
import { SCENARIOS } from "../../data/scenarios";
import { SLOT_TASTES } from "../../data/slotTastes";
import type { CommandTable } from "../commands";
import type { Game } from "../game";
import type { System } from "../registry";
import type { Agent, DesignStats, GameState, GuestData, PlacedObject, Sale } from "../state";
import { rng } from "../rng";
import { gauss } from "../dist";
import { post } from "../finance";
import { fmtMoney, newsFor } from "../news";
import { researched } from "../research";
import { person } from "../pool";
import { TICKS_PER_DAY } from "../clock";
import { judged, feelOf, sessionOf } from "./appeal";
import { panel } from "./lab";
import { designById, designIdOf, isStock, designPrice } from "./lookup";
import { compiledById, machinesOf, panelMix, perfIndex, statsOf } from "./index";
const news = newsFor("slots");

declare module "../commands" {
  interface CommandTypes {
    /** (M8.6) Answer the slot maker's offer on the table. */
    saleAnswer: { yes: boolean };
  }
}

const DAY = TICKS_PER_DAY;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Fictional slot makers. */
export const MAKERS = ["Silverline Gaming", "Bluestone Interactive", "Starfall Games", "Crowncrest Systems", "Lucky Anvil Studios", "Meridian Reels"];
/** Where outside machines hit their wide-area jackpots. */
const CITIES = ["Laughlin", "Reno", "Atlantic City", "Biloxi", "Lake Tahoe", "Mesquite", "Wendover", "Deadwood", "Black Hawk", "Tunica"];

/** Tuning (docs/spec/designer.md "As built in M8.6"). */
export const MARKET = {
  /** Bass curve per day at full suitability: innovation (being new on the floor) and imitation (word of mouth). */
  p: 0.002, q: 0.028,
  /** Awareness a new design starts with: your own, with Game launches researched, a stock game (a known brand). */
  launch: 0.05, launchParty: 0.25, launchStock: 0.4,
  /** Unaware guests still see the machine: appeal × (base + (1 - base) × awareness). */
  unaware: 0.55,
  /** Novelty bump at launch for a design unlike anything on the floor, and how fast it settles (days). */
  novelty: 0.3, noveltyDays: 100,
  /** Variety: a design's share of the slots, and a mechanic's, beyond which the floor feels samey. */
  cloneShare: 0.35, cloneW: 0.4, mechShare: 0.5, mechW: 0.3, varietyMin: 8,
  /** Boredom after this many sessions, and a favorite's pull. */
  boredAt: 30, bored: 0.25, attached: 0.25,
  /** Fans draw: per doubling of a type's fans past 10, capped. */
  draw: 0.03, drawCap: 0.3,
};

// ---------------------------------------------------------------------------------------------------------
// Runtime cache: rebuilt each day (and after the floor changes). Never saved.

interface Cache {
  /** Market factor by design, by type. */
  f: Map<string, Map<string, number>>;
  /** Fans by design, by type; regulars by type. */
  fans: Map<string, Record<string, number>>;
  regulars: Record<string, number>;
  /** Extra arrivals by type from fans. */
  draw: Record<string, number>;
  /** Share of the floor's slots by design and by mechanic; slots on the floor. */
  share: Map<string, number>;
  mech: Map<string, number>;
  slots: number;
  /** What each type wishes the floor had (a thought id, or none). */
  wishes: Record<string, string>;
}
const caches = new WeakMap<Game, Cache>();
let version = 0, lastG: Game | null = null, lastC: Cache | null = null;

function cache(g: Game): Cache {
  if (g === lastG && lastC) return lastC;
  let c = caches.get(g);
  if (!c) { c = rebuild(g); caches.set(g, c); }
  lastG = g;
  lastC = c;
  return c;
}
/** Changes whenever market factors may have, in any game (per-machine caches compare it). */
export const marketVersion = () => version;

/** The main mechanic a design is sold on (its first feature, else its way of winning). */
const mechanic = (d: SlotDesign) => featuresOf(d)[0] ?? LAYOUTS[d.layout].win;

function rebuild(g: Game): Cache {
  const s = g.state, c: Cache = { f: new Map(), fans: new Map(), regulars: {}, draw: {}, share: new Map(), mech: new Map(), slots: 0, wishes: {} };
  for (const o of s.objects) {
    if (!OBJECTS[o.kind]?.slot) continue;
    const id = designIdOf(o), d = designById(s, id);
    c.slots++;
    c.share.set(id, (c.share.get(id) ?? 0) + 1);
    if (d) c.mech.set(mechanic(d), (c.mech.get(mechanic(d)) ?? 0) + 1);
  }
  for (const [k, v] of c.share) c.share.set(k, v / Math.max(1, c.slots));
  for (const [k, v] of c.mech) c.mech.set(k, v / Math.max(1, c.slots));
  // (M11.4) What was fixed at the last rebuild comes from the saved snapshot, so a reload matches the running game.
  const snap = s.mkt;
  if (snap) c.regulars = snap.regulars;
  for (const p of s.pool) {
    if (!snap && p.visits > 0) c.regulars[p.type] = (c.regulars[p.type] ?? 0) + 1;
    if (!p.fan) continue;
    const m = c.fans.get(p.fan) ?? {};
    m[p.type] = (m[p.type] ?? 0) + 1;
    c.fans.set(p.fan, m);
  }
  // Visitors who became fans count too (rounded).
  for (const [id, st] of Object.entries(s.dstats)) {
    if (!st.ff) continue;
    const m = c.fans.get(id) ?? {};
    for (const [t, n] of Object.entries(st.ff)) if (Math.round(n)) m[t] = (m[t] ?? 0) + Math.round(n);
    c.fans.set(id, m);
  }
  if (snap) {
    c.draw = snap.draw;
    c.wishes = snap.wishes;
    for (const [id, m] of Object.entries(snap.f)) c.f.set(id, new Map(Object.entries(m)));
    return c;
  }
  // A game with a following is a reason to come (only while it's on the floor).
  for (const [id, m] of c.fans) {
    if (!c.share.has(id)) continue;
    for (const [t, n] of Object.entries(m)) if (n > 10) c.draw[t] = Math.min(MARKET.drawCap, (c.draw[t] ?? 0) + MARKET.draw * Math.log2(n / 10));
  }
  s.mkt = { f: {}, draw: c.draw, wishes: {}, regulars: c.regulars };
  s.mkt.wishes = c.wishes = wishesOf(g, c);
  return c;
}
/** Forget the cache (the floor or the pool changed). */
export const marketChanged = (g: Game) => { delete g.state.mkt; caches.delete(g); if (lastG === g) lastC = null; version++; };
/** A fan won or lost: counted now; the draw it adds waits for the day's rebuild. */
function fanDelta(g: Game, id: string | undefined, type: string, d: number) {
  if (!id) return;
  const m = cache(g).fans.get(id) ?? {};
  m[type] = Math.max(0, (m[type] ?? 0) + d);
  cache(g).fans.set(id, m);
}

/** Awareness of a design among a type, 0-1 (designs placed before the market existed are known to all). */
export function awareness(st: DesignStats | undefined, type: string): number {
  if (!st?.aw) return 1;
  return st.aw[type] ?? st.aw["*"] ?? 0;
}
export const ageDays = (s: GameState, st: DesignStats | undefined) => (st && st.born >= 0 ? Math.floor(s.tick / DAY) - st.born : 0);

/**
 * How a design's appeal to a type stands on this floor today, around 1: awareness (unaware guests give it less of a
 * look), the fading novelty bump (novelty seekers feel it more; Evergreens are past it), and a floor of clones.
 */
export function marketFactor(g: Game, id: string, type: string): number {
  const c = cache(g);
  let m = c.f.get(id);
  if (!m) c.f.set(id, (m = new Map()));
  let v = m.get(type);
  if (v !== undefined) return v;
  const s = g.state, st = s.dstats[id], tt = SLOT_TASTES[type] ?? SLOT_TASTES.local;
  const aw = awareness(st, type);
  const nov = st?.ever ? 0 : (st?.nov ?? 0) * Math.exp(-ageDays(s, st) / MARKET.noveltyDays);
  v = (MARKET.unaware + (1 - MARKET.unaware) * aw) * (1 + nov * (0.5 + tt.bore)) * variety(g, id, type);
  m.set(type, v);
  if (s.mkt) (s.mkt.f[id] ??= {})[type] = v;
  return v;
}

/** A floor of one design (or one mechanic) feels monotonous; more so to those who tire quickly. */
export function variety(g: Game, id: string, type: string): number {
  const c = cache(g);
  if (c.slots < MARKET.varietyMin) return 1;
  const d = designById(g.state, id), sd = c.share.get(id) ?? 0, sm = d ? c.mech.get(mechanic(d)) ?? 0 : 0;
  const pen = MARKET.cloneW * Math.max(0, sd - MARKET.cloneShare) + MARKET.mechW * Math.max(0, sm - MARKET.mechShare);
  return Math.max(0.4, 1 - (0.5 + (SLOT_TASTES[type]?.bore ?? 0.5)) * pen);
}
/** Whether a design makes the floor feel samey (for the thought). */
export const samey = (g: Game, id: string) => cache(g).slots >= MARKET.varietyMin && (cache(g).share.get(id) ?? 0) > 0.5;

/** A regular's own feelings about a design: bored of one they've played a lot, attached to their favorite. */
export function personalPull(g: Game, gd: GuestData, id: string): number {
  if (gd.pid < 0) return 0;
  const p = person(g, gd.pid);
  if (!p || (!p.dp && !p.fan)) return 0;
  const tt = SLOT_TASTES[gd.type] ?? SLOT_TASTES.local, ever = g.state.dstats[id]?.ever ? 0.5 : 1;
  let v = -MARKET.bored * tt.bore * ever * Math.min(1, (p.dp?.[id] ?? 0) / MARKET.boredAt);
  if (p.fan === id) v += 0.1 + MARKET.attached * tt.attach;
  return v;
}
/** Whether a design has machines on the floor. */
export const onFloor = (g: Game, id: string) => cache(g).share.has(id);
/** The design a guest is a fan of, if any. */
export const fanOf = (g: Game, gd: GuestData) => (gd.pid >= 0 ? person(g, gd.pid)?.fan : undefined);

/** Extra arrivals of a type drawn by the designs it's a fan of (a multiplier's excess, 0-0.3). */
export const fanDraw = (g: Game, type: string) => cache(g).draw[type] ?? 0;
/** Fans of a design on the pool's books, by type. */
export const fansOf = (g: Game, id: string) => cache(g).fans.get(id) ?? {};
export const fanCount = (g: Game, id: string) => Object.values(fansOf(g, id)).reduce((a, b) => a + b, 0);
/** What each type wishes the floor had. */
export const wishes = (g: Game) => cache(g).wishes;

/**
 * A slot session ended: counted for the design's plays, and for a regular's history with it. A good session can
 * make a fan; a bad one, or being played out, can lose one.
 */
export function marketSession(g: Game, a: Agent, o: PlacedObject, secs: number, think: (id: string) => void) {
  const s = g.state, gd = a.g!, id = designIdOf(o), st = statsOf(s, id);
  st.mo = (st.mo ?? 0) + 1;
  const r = rng(s, "market");
  // Now and then a guest voices what the floor is missing, or that it all plays the same.
  const wish = cache(g).wishes[gd.type];
  if (wish && r.chance(0.04)) think(wish);
  else if (samey(g, id) && r.chance(0.05)) think("slotSame");
  if (secs < 30) return;
  const p = gd.pid >= 0 ? person(g, gd.pid) : undefined;
  if (!p) {
    // A visitor who loved it: a fan out in the world (they tell people back home).
    const c = compiledById(s, id);
    if (c && secs >= 60 && gd.mood >= 60 && r.chance(Math.min(0.2, Math.max(0, judged(c, gd.type).appeal - 0.5) * 0.4))) {
      const before = Math.round((st.ff ??= {})[gd.type] ?? 0);
      st.ff[gd.type] = (st.ff[gd.type] ?? 0) + 1;
      fanDelta(g, id, gd.type, Math.round(st.ff[gd.type]) - before);
      think("slotFan");
    }
    return;
  }
  const dp = (p.dp ??= {});
  dp[id] = (dp[id] ?? 0) + 1;
  const keys = Object.keys(dp);
  if (keys.length > 4) delete dp[keys.reduce((lo, k) => (dp[k] < dp[lo] ? k : lo), keys[0])];
  const c = compiledById(s, id);
  if (!c) return;
  const tt = SLOT_TASTES[gd.type] ?? SLOT_TASTES.local, ap = judged(c, gd.type).appeal;
  if (p.fan === id) {
    if (gd.mood < 35 && r.chance(0.25)) { p.fan = undefined; fanDelta(g, id, p.type, -1); }
    else if (!st.ever && dp[id] >= MARKET.boredAt && r.chance(0.1 * tt.bore)) { p.fan = undefined; fanDelta(g, id, p.type, -1); think("slotPlayedOut"); }
    return;
  }
  if (secs < 60 || gd.mood < 60) return;
  let chance = Math.min(0.2, Math.max(0, ap - 0.5) * 0.4);
  // A fan of another game switches only for one they like clearly better.
  const old = p.fan ? compiledById(s, p.fan) : undefined;
  if (old && machinesOf(s, p.fan!).length) chance = ap > judged(old, gd.type).appeal + 0.15 ? chance / 2 : 0;
  if (chance > 0 && r.chance(chance)) { fanDelta(g, p.fan, p.type, -1); p.fan = id; fanDelta(g, id, p.type, 1); think("slotFan"); }
}

// ---------------------------------------------------------------------------------------------------------
// Launch, word of mouth, novelty.

function tokens(d: SlotDesign): Set<string> {
  const t = new Set<string>([`lay:${d.layout}`, `win:${LAYOUTS[d.layout].win}`, `cab:${d.cab.type}`, `top:${d.cab.topper}`, `th:${d.theme}`, `w:${d.wild}`]);
  for (const f of featuresOf(d)) t.add(`f:${f}`);
  if (d.fs) t.add(`enh:${d.fs.enh}`);
  for (const j of d.jackpots) t.add(`j:${kindOf(j)}`);
  if (d.stacks) t.add("stacks");
  return t;
}
/** How unlike everything else on the floor a design is, 0 (a copy) to 1 (nothing like it). */
export function difference(s: GameState, id: string): number {
  const d = designById(s, id);
  if (!d) return 0;
  const mine = tokens(d);
  let best = 0;
  const seen = new Set<string>([id]);
  for (const o of s.objects) {
    if (!OBJECTS[o.kind]?.slot) continue;
    const oid = designIdOf(o);
    if (seen.has(oid)) continue;
    seen.add(oid);
    const od = designById(s, oid);
    if (!od) continue;
    const t = tokens(od);
    let both = 0;
    for (const k of mine) if (t.has(k)) both++;
    best = Math.max(best, both / (mine.size + t.size - both));
  }
  return 1 - best;
}

/** A design's first day on this floor: who knows it, and its novelty against what's already here. */
function launch(g: Game, id: string) {
  const s = g.state, st = statsOf(s, id);
  if (st.aw) return;
  // What the scenario starts with is the floor everyone already knows.
  if (s.tick < DAY) { st.aw = { "*": 1 }; st.nov = 0; return; }
  const a0 = isStock(id) ? MARKET.launchStock : researched(s, "launches") ? MARKET.launchParty : MARKET.launch;
  st.aw = { "*": a0 };
  st.nov = MARKET.novelty * difference(s, id);
  if (st.born < 0) st.born = Math.floor(s.tick / DAY);
}

/** One day of word of mouth for every design on the floor, by the types this casino gets. */
function spread(g: Game) {
  const s = g.state, c = cache(g), pop = SCENARIOS[s.scenario]?.population ?? {};
  const onFloor = new Set(c.share.keys());
  for (const [id, st] of Object.entries(s.dstats)) {
    if (!st.aw) continue;
    if (!onFloor.has(id)) {
      // Off the floor, it slips from memory.
      for (const k of Object.keys(st.aw)) st.aw[k] *= 0.995;
      continue;
    }
    const comp = compiledById(s, id);
    if (!comp) continue;
    const fans = c.fans.get(id) ?? {};
    for (const t of Object.keys(pop)) {
      if (!GUEST_TYPES[t]) continue;
      const a = awareness(st, t);
      if (a >= 0.999) { st.aw[t] = 1; continue; }
      const suit = Math.max(0.2, Math.min(1.2, judged(comp, t).appeal));
      const fanShare = (fans[t] ?? 0) / Math.max(20, c.regulars[t] ?? 0);
      st.aw[t] = Math.min(1, a + (MARKET.p * suit + MARKET.q * suit * Math.min(1, a + 3 * fanShare)) * (1 - a));
    }
    // The shorthand for "known to everyone" gives way to per-type numbers once any type is below it.
    if (st.aw["*"] !== undefined && Object.keys(pop).some((t) => st.aw![t] !== undefined)) delete st.aw["*"];
  }
}

// ---------------------------------------------------------------------------------------------------------
// Wishes: what guests say is missing (docs/spec/designer.md §6).

function wishesOf(g: Game, c: Cache): Record<string, string> {
  const s = g.state, out: Record<string, string> = {};
  if (c.slots < 3) return out;
  const ids = [...c.share.keys()].filter((id) => compiledById(s, id));
  const pop = SCENARIOS[s.scenario]?.population ?? {};
  const youngest = Math.min(...ids.map((id) => ageDays(s, s.dstats[id])));
  for (const t of Object.keys(pop)) {
    const tt = SLOT_TASTES[t], gt = GUEST_TYPES[t];
    if (!tt || !gt) continue;
    const stake = ((gt.play.stake[0] + gt.play.stake[1]) / 2) * gt.budget.median;
    let exMax = 0, wild = 0, tame = 0, feats = 0, cheap = 0;
    for (const id of ids) {
      const comp = compiledById(s, id)!, f = feelOf(comp), j = judged(comp, t), n = (c.share.get(id) ?? 0);
      exMax = Math.max(exMax, j.excitement);
      if (f.intensity > tt.intensity.ideal + 0.7 * tt.intensity.tol) wild += n;
      if (f.intensity < tt.intensity.ideal - 0.7 * tt.intensity.tol) tame += n;
      if (f.feat > 0) feats += n;
      if (f.minBet <= sessionOf(t, f, comp.d.rtp).stake && f.minBet <= stake * 1.5) cheap += n;
    }
    out[t] = tt.featAppetite >= 0.8 && feats === 0 ? "wishBonus"
      : cheap < 0.25 ? "wishPenny"
      : exMax < 4.5 ? "wishExcite"
      : wild > 0.95 ? "wishTame"
      : tame > 0.95 ? "wishWild"
      : tt.bore >= 0.8 && youngest > 540 ? "wishNew" : "";
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Records and Evergreens.

export function recordJackpot(g: Game, id: string, amount: number) {
  const s = g.state, rec = (s.records ??= {}), old = rec.jackpot;
  if (old && amount <= old.v) return;
  rec.jackpot = { v: amount, id, day: Math.floor(s.tick / DAY) };
  if (old && amount >= 1000) news(g, "info", `A casino record: ${fmtMoney(amount)} on ${designById(s, id)?.name ?? "a slot"}.`);
}

function monthlyRecords(g: Game) {
  const s = g.state, rec = (s.records ??= {}), day = Math.floor(s.tick / DAY);
  for (const [id, st] of Object.entries(s.dstats)) {
    const name = designById(s, id)?.name;
    if (!name) continue;
    const fans = fanCount(g, id);
    st.fans = Math.max(st.fans ?? 0, fans);
    if (fans >= 10 && fans > (rec.fans?.v ?? 0)) rec.fans = { v: fans, id, day };
    const last = st.hs?.[st.hs.length - 1] ?? 0;
    if (last > (rec.month?.v ?? 0)) rec.month = { v: last, id, day };
    const idx = st.machDays >= 90 ? perfIndex(s, id) : null;
    if (idx !== null && idx > (rec.index?.v ?? 0)) rec.index = { v: idx, id, day };
    // An Evergreen: a year on the floor, still earning above average and still played nearly as much as at its peak.
    if (!st.ever && ageDays(s, st) >= 365 && machinesOf(s, id).length && idx !== null && idx >= 1.1 && st.hs && st.hm && st.hs.length >= 6) {
      const rate = st.hs.map((n, i) => n / Math.max(1, st.hm![i]));
      const peak = Math.max(...rate), recent = rate.slice(-3).reduce((a, b) => a + b, 0) / 3;
      if (recent >= 0.75 * peak) { st.ever = 1; news(g, "good", `${name} is an Evergreen: a year on, guests still can't get enough of it.`); }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Selling a design (docs/spec/designer.md "Selling a design to a slot maker").

/**
 * (Batch A, owner) Fans alone decide: a chance of an offer from `fans` fans, one for sure at `sure`. The other numbers
 * only shape how good the offer is (saleScore).
 */
export const SALE_RULES = { fans: 20, sure: 50, excitement: 6, index: 1.2, rtp: 0.97 };

/** Why a design can't get an offer (empty: it qualifies). */
export function saleBlocks(g: Game, id: string): string[] {
  const s = g.state, rec = s.designs[id], out: string[] = [];
  if (!rec || rec.d.origin !== "own") return ["not your own design"];
  if (rec.sale) return ["already sold"];
  if (rec.rigged) out.push("uncertified");
  const st = s.dstats[id];
  if (!machinesOf(s, id).length || !st) out.push("not on the floor");
  if (!compiledById(s, id)) out.push("a working design");
  if (fanCount(g, id) < SALE_RULES.fans) out.push(`${SALE_RULES.fans} fans`);
  return out;
}
/** How good a qualifying design looks to a maker, 0-1: Excitement, performance, fans and hold. */
export function saleScore(g: Game, id: string): number {
  const s = g.state, c = compiledById(s, id)!, ex = panel(c, panelMix(s)).ratings.excitement;
  return clamp01(0.3 * clamp01((ex - 6) / 4) + 0.3 * clamp01(((perfIndex(s, id) ?? 1.2) - 1.2) / 1.3)
    + 0.25 * clamp01(Math.log2(fanCount(g, id) / 20) / 4) + 0.15 * clamp01((0.97 - c.d.rtp) / 0.07));
}

function makeOffer(g: Game, id: string, sc: number) {
  const s = g.state, r = rng(s, "market"), d = s.designs[id].d;
  const j = () => clamp01(sc + (r.next() - 0.5) * 0.4);
  const cash = Math.round((designPrice(d).cost * (10 + 90 * j())) / 100) * 100;
  // (owner, 2026-09-26) Worth it: the maker takes 10-30% of the edge here (was 25-75%) and pays 4-12% royalties (was 1-3%).
  const share = Math.round((0.7 + 0.2 * j()) * 20) / 20, roy = Math.round((0.04 + 0.08 * j()) * 1000) / 1000;
  // (Batch A, owner) The offer waits until answered (`until` is kept for old saves, unused); the UI pauses for it.
  s.offer = { id, maker: r.pick(MAKERS), cash, share, roy, until: s.tick, s: sc };
  news(g, "good", `A letter from ${s.offer.maker}: they want to buy ${d.name}. Answer it in the Slots tab.`, { tab: "slots" });
}

/** Declined or let lapse: maybe another offer in 3-12 months, less likely each time. */
function decline(g: Game, lapsed = false) {
  const s = g.state, o = s.offer!, rec = s.designs[o.id];
  s.offer = null;
  if (!rec) return;
  rec.declined = (rec.declined ?? 0) + 1;
  const r = rng(s, "market");
  rec.reAt = r.chance(0.6 * Math.pow(0.6, rec.declined - 1)) ? s.tick + r.int(90, 360) * DAY : -1;
  news(g, "info", lapsed ? `${o.maker}'s offer for ${rec.d.name} lapsed.` : `You turned down ${o.maker}'s offer for ${rec.d.name}.`);
}

function accept(g: Game) {
  const s = g.state, o = s.offer!, rec = s.designs[o.id], st = statsOf(s, o.id), r = rng(s, "market");
  s.offer = null;
  // The machines it will sell out there: fixed now, never shown. (Owner, 2026-09-26) Dozens to hundreds is normal,
  // thousands to tens of thousands exciting. Sales run on an S-curve with its own pace (months to its plateau).
  const units = Math.max(5, Math.min(50000, Math.round(SALE_UNITS * (0.4 + 1.2 * o.s) * Math.exp(1.3 * gauss(r)))));
  const sale: Sale = { maker: o.maker, share: o.share, roy: o.roy, at: s.tick, units, ramp: 3 + Math.round(r.next() * 60) / 10, peak: 0, paid: 0, win: winPerDay(st), cash: o.cash };
  rec.sale = sale;
  post(g, saleLine(o.id), o.cash);
  news(g, "good", `Sold! ${o.maker} bought ${rec.d.name} for ${fmtMoney(o.cash)}. You keep ${Math.round(o.share * 100)}% of its edge here and earn ${(o.roy * 100).toFixed(1)}% of what it wins elsewhere.`);
}

/**
 * The budget lines of a sold design (owner, 2026-09-26: one mixed line was confusing): the price, what goes to the
 * maker here (its cut of the edge and the meters' increments, less the jackpots it covers), and royalties.
 */
export const saleLine = (id: string) => `sale:${id}`;
export const cutLine = (id: string) => `cut:${id}`;
export const royLine = (id: string) => `roy:${id}`;
/** Theoretical win per machine per day on this floor. */
const winPerDay = (st: DesignStats) => (st.machDays > 0 ? (st.theo ?? 0) / st.machDays : 0);
/** A sold design's deal, if any. */
export const saleOf = (s: GameState, id: string): Sale | undefined => s.designs[id]?.sale;

/** Median machines a sale places out there (× 0.4-1.6 by how good the offer was). */
export const SALE_UNITS = 150;

/**
 * Machines installed elsewhere, months after the sale (owner, 2026-09-26): an S-curve that starts within days,
 * passes half its total in about `ramp` months (3-9) and levels off by 1-2 years; after 3 years they slowly retire
 * (half-life 5 years; an Evergreen stays).
 */
export function installs(s: GameState, id: string, sale: Sale): number {
  const m = Math.max(0, (s.tick - sale.at) / (30 * DAY)), tau = Math.max(0.5, sale.ramp) / Math.pow(Math.LN2, 1 / 1.6);
  const up = 1 - Math.exp(-Math.pow(m / tau, 1.6));
  const fade = m > 36 && !s.dstats[id]?.ever ? Math.pow(0.5, (m - 36) / 60) : 1;
  return Math.round(sale.units * up * fade);
}

/** Game fees on a sold design's own spins: the maker's cut of the theoretical edge, and the meters' increments. */
export function saleFees(g: Game, id: string, sale: Sale, wagered: number, rtp: number, inc: number) {
  post(g, cutLine(id), -wagered * (1 - rtp) * (1 - sale.share) - inc);
}

function royalties(g: Game) {
  const s = g.state;
  for (const [id, rec] of Object.entries(s.designs)) {
    const sale = rec.sale;
    if (!sale) continue;
    const st = statsOf(s, id);
    if (st.machDays > 0) sale.win = winPerDay(st);
    const n = installs(s, id, sale), pay = n * sale.win * 30 * sale.roy;
    sale.peak = Math.max(sale.peak, n);
    sale.paid += pay;
    post(g, royLine(id), pay);
    news(g, "info", `${rec.d.name}: ${n.toLocaleString("en-US")} machine${n === 1 ? "" : "s"} in other casinos (${sale.maker}); royalties ${fmtMoney(pay)} this month.`, pay < 5000, { tab: "slots" });
  }
}

/** Wide-area meters: outside play feeds them and can hit them (the maker pays). */
function outsidePlay(g: Game) {
  const s = g.state, r = rng(s, "market");
  for (const [id, rec] of Object.entries(s.designs)) {
    if (!rec.sale || !s.meters?.[id]) continue;
    const c = compiledById(s, id), st = s.dstats[id];
    if (!c || !st || st.machDays <= 0) continue;
    const coin = installs(s, id, rec.sale) * (st.coinIn / st.machDays), m = s.meters[id], top = c.d.maxBet * c.d.denom;
    if (coin <= 0) continue;
    c.levels.forEach((l, i) => {
      if (l.kind !== "linked" && l.kind !== "mhb") return;
      m.v[i] += l.inc * coin;
      const hit = l.kind === "mhb" ? m.v[i] >= m.hit[i] : r.chance(1 - Math.exp(-(l.p * coin) / top));
      if (!hit) return;
      news(g, "info", `The ${levelWord(c.levels.length, i)} on ${rec.d.name} hit in ${r.pick(CITIES)} for ${fmtMoney(m.v[i])}.`);
      m.v[i] = m.seed[i];
      if (l.kind === "mhb") m.hit[i] = m.seed[i] + r.next() * (l.cap - l.x) * top;
    });
  }
}
const levelWord = (n: number, i: number) => ["Mini", "Minor", "Major", "Grand"][4 - n + i] ?? "jackpot";

/** Meters the house owes (a sold design's belong to its maker). */
export const houseMeters = (s: GameState) => ({
  meters: Object.fromEntries(Object.entries(s.meters ?? {}).filter(([id]) => !s.designs[id]?.sale)),
  objects: s.objects.filter((o) => !(o.meter && s.designs[designIdOf(o)]?.sale)),
});

function offers(g: Game) {
  const s = g.state;
  if (s.offer) return;
  const r = rng(s, "market");
  for (const [id, rec] of Object.entries(s.designs)) {
    if (rec.reAt === -1 || saleBlocks(g, id).length) continue;
    if (rec.reAt && rec.reAt > 0) { if (s.tick >= rec.reAt) { rec.reAt = 0; makeOffer(g, id, saleScore(g, id)); return; } continue; }
    // Checked daily: from 20 fans about 5% a month, rising to 45% a month by 49; at 50, today.
    const sc = saleScore(g, id), f = fanCount(g, id);
    if (f >= SALE_RULES.sure || r.chance(0.0017 + 0.018 * (f - SALE_RULES.fans) / (SALE_RULES.sure - SALE_RULES.fans))) { makeOffer(g, id, sc); return; }
  }
}

// ---------------------------------------------------------------------------------------------------------

const commands: CommandTable<"saleAnswer"> = {
  saleAnswer: {
    validate: (g) => (!g.state.offer ? "No offer waiting" : !g.state.designs[g.state.offer.id] ? "That design is gone" : null),
    apply(g, c) { if (c.yes) accept(g); else decline(g, false); },
  },
};

export const marketSystem: System = {
  id: "market",
  deps: ["designs", "pool"],
  commands,
  init(g) {
    // A loaded game keeps its saved snapshot (M11.4); a new one builds it.
    if (!g.state.mkt) marketChanged(g);
    for (const o of g.state.objects) if (OBJECTS[o.kind]?.slot) launch(g, designIdOf(o));
  },
  layout(g) {
    for (const o of g.state.objects) if (OBJECTS[o.kind]?.slot && !g.state.dstats[designIdOf(o)]?.aw) launch(g, designIdOf(o));
    marketChanged(g);
  },
  day(g) {
    const s = g.state;
    for (const o of s.objects) {
      if (!OBJECTS[o.kind]?.slot) continue;
      const st = statsOf(s, designIdOf(o));
      if (!st.aw) launch(g, designIdOf(o));
      st.md = (st.md ?? 0) + 1;
    }
    spread(g);
    // Days are short: appeal follows awareness weekly (and at once when the floor changes).
    if (Math.floor(s.tick / DAY) % 7 === 0) marketChanged(g);
    offers(g);
    outsidePlay(g);
  },
  closeMonth(g) { royalties(g); },
  month(g) {
    const s = g.state;
    for (const st of Object.values(s.dstats)) {
      if (!st.aw) continue;
      (st.hs ??= []).push(st.mo ?? 0);
      (st.hm ??= []).push(st.md ?? 0);
      if (st.hs.length > 24) { st.hs.shift(); st.hm.shift(); }
      st.mo = 0;
      st.md = 0;
    }
    // Visitors' enthusiasm fades; memories of games played fade (a month away makes an old favorite fresher).
    for (const st of Object.values(s.dstats)) if (st.ff) for (const t of Object.keys(st.ff)) st.ff[t] *= 0.97;
    for (const p of s.pool) {
      if (!p.dp) continue;
      for (const k of Object.keys(p.dp)) if ((p.dp[k] *= 0.85) < 0.5) delete p.dp[k];
      if (!Object.keys(p.dp).length) delete p.dp;
    }
    marketChanged(g);
    monthlyRecords(g);
  },
};
