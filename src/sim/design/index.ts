// Slot designs in the casino (docs/spec/designer.md §10-11): which design a machine plays, the player's designs
// and their certification, what a design costs and needs, per-design numbers, and the commands the designer
// sends. The math is in compile.ts; how guests judge a design in appeal.ts.
import { STOCK_DESIGNS, STOCK_RESEARCH } from "../../data/designs";
import {
  CABINETS, CAP_RANGE, COLLECT_EVERY, COLLECT_SIZES, COLLECT_X, DENOMS, FEAT_EVERY, FEATURE_RESEARCH, FONTS, FS_COUNTS, FS_ENH, FS_EVERY,
  INC_RANGE, JACKPOT_KINDS, LAYOUTS, LOGO_FX, MAX_FEATURES, MYSTERY_EVERY, NEAR_RANGE, RTP_RANGE, RTP_RIGGED, SLOT_THEMES, TOPPERS,
  defaultLook, featuresOf, type CabType, type JackpotHow, type JackpotKind, type SlotDesign,
} from "../../data/designer";
import { OBJECTS } from "../../data/objects";
import { EMOJI } from "../../data/emoji";
import { SCENARIOS } from "../../data/scenarios";
import { GUEST_TYPES } from "../../data/guests";
import { SYNERGY, THEME_IDS } from "../../data/themes";
import type { CommandTable } from "../commands";
import type { System } from "../registry";
import type { DesignStats, GameState, PlacedObject } from "../state";
import { compile, mathKey, type Compiled } from "./compile";
import { hasMeters, maxBetOf, meterValue } from "./meters";
import { themeOf } from "./theme";
import type { Game } from "../game";
import { pruneOpinions } from "../opinions";
import { designById, designIdOf, isStock } from "./lookup";
import { researched } from "../research";
import { post } from "../finance";
import { fmtMoney, newsFor } from "../news";
import { TICKS_PER_DAY } from "../clock";
const news = newsFor("slots");

declare module "../commands" {
  interface CommandTypes {
    /** Save a design (new, or an update: a math change to one that's placed or certified saves a new version). */
    designSave: { d: SlotDesign };
    /** Send a design to the regulator's lab (a fee and some days). */
    designCertify: { id: string };
    /** Run a design without certification (the rigging dark lever), or stop. */
    designRun: { id: string; on: boolean };
    /** Switch a machine to another design with the same cabinet (a conversion kit). */
    designConvert: { obj: number; id: string };
    designDelete: { id: string };
    /** (M8.5) Which game a bank sign shows ("" = the nearest linked game). */
    signShow: { obj: number; id: string };
  }
}

export const CERT = { fee: 750, days: 7, fastFee: 375, fastDays: 3 };
export const CONVERT_FEE = 50;

export { designIdOf, isStock, designById, designPrice, slotPrice } from "./lookup";
const h32 = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
/** Compiled math for a design here (model ids carry the math, so the sim's per-model caches never go stale). */
const byDesign = new WeakMap<SlotDesign, Compiled>();
export function compiledById(s: GameState, id: string): Compiled | undefined {
  const d = designById(s, id);
  if (!d) return undefined;
  // Designs are replaced, never edited in place, so the design object itself keys the cache.
  let c = byDesign.get(d);
  if (!c) byDesign.set(d, (c = compile(d, `${id}~${h32(mathKey(d))}`)));
  return c;
}
/** Per-machine cache (runtime): the design it plays, compiled, and each type's appeal. Checked against the design object. */
interface SlotInfo {
  o: PlacedObject; id: string; d: SlotDesign; c: Compiled; ap: Map<string, number>; ex: Map<string, number>; th: Float32Array; prog: boolean;
  /** (M8.6) Appeal × the market factor by type, valid for market version `mv`. */
  am: Map<string, number>; mv: number;
}
const infos = new Map<number, SlotInfo>();
export function slotInfo(s: GameState, o: PlacedObject): SlotInfo | undefined {
  const inf = infos.get(o.id);
  // The original kinds (no design field) always play the same stock design; designs are replaced, never edited in place.
  if (inf && inf.o === o && (o.design === undefined || (s.designs[o.design]?.d ?? STOCK_DESIGNS[o.design]) === inf.d)) return inf;
  const id = designIdOf(o), c = compiledById(s, id);
  if (!c) return undefined;
  const n: SlotInfo = { o, id, d: designById(s, id)!, c, ap: new Map(), ex: new Map(), th: themeFit(themeOf(c.d) ?? ""), prog: hasMeters(c), am: new Map(), mv: -1 };
  if (infos.size > 50000) infos.clear();
  infos.set(o.id, n);
  return n;
}
export const compiledOf = (s: GameState, o: PlacedObject) => slotInfo(s, o)?.c;

/**
 * How a design's theme sits in a room dominated by each theme (per unit of a type's taste for theming): its own theme
 * pleases, a good pairing helps, a clash hurts; Classic Vegas suits the old-Vegas rooms (docs/spec/designer.md §5).
 */
function themeFit(theme: string): Float32Array {
  const mine = THEME_IDS.indexOf(theme as never), out = new Float32Array(THEME_IDS.length);
  THEME_IDS.forEach((t, dom) => {
    out[dom] = mine === dom ? 0.15 : mine >= 0 ? 0.25 * SYNERGY[mine][dom] : theme === "classic" && (t === "ratpack" || t === "atomic" || t === "deco") ? 0.08 : 0;
  });
  return out;
}

/** The object kind a design's cabinet is placed as (the original machines count as uprights and steppers). */
export const cabKind = (d: SlotDesign) => CABINETS[d.cab.type].kind;
export function cabOfKind(kind: string): CabType | null {
  if (kind === "slot_liberty") return "stepper";
  if (kind === "slot_cherry" || kind === "slot_thunder") return "upright";
  const c = Object.values(CABINETS).find((q) => q.kind === kind);
  return c ? c.id : null;
}

export const minRtpOf = (s: GameState) => SCENARIOS[s.scenario]?.minRtp ?? RTP_RANGE[0];
export const certified = (s: GameState, id: string) => isStock(id) || (!!s.designs[id] && s.designs[id].cert > 0 && s.designs[id].cert <= s.tick);
export const certPending = (s: GameState, id: string) => !!s.designs[id] && s.designs[id].cert > s.tick;
/** Why a design can't be certified: payback under the legal minimum, near misses above chance. */
export function illegal(s: GameState, d: SlotDesign): string[] {
  const out: string[] = [];
  if (d.rtp < minRtpOf(s) - 1e-9) out.push(`payback under the legal ${Math.round(minRtpOf(s) * 100)}%`);
  if (d.show.near > 1 + 1e-9) out.push("near misses above chance");
  return out;
}
/** Research a design still needs here. */
export function designLocks(s: GameState, d: SlotDesign, id?: string): string[] {
  // Stock games come from their makers: only their own project gates them (the original three need none).
  if (id && isStock(id)) return STOCK_RESEARCH[id] && !researched(s, STOCK_RESEARCH[id]) ? [STOCK_RESEARCH[id]] : [];
  const need = new Set<string>();
  const lr = LAYOUTS[d.layout].research;
  if (lr) need.add(lr);
  if (d.layout.startsWith("w")) need.add("video");
  for (const f of featuresOf(d)) need.add(FEATURE_RESEARCH[f]);
  for (const j of d.jackpots) { const r = JACKPOT_KINDS[j.kind ?? "fixed"].research; if (r) need.add(r); }
  const cr = CABINETS[d.cab.type].research;
  if (cr) need.add(cr);
  return [...need].filter((p) => !researched(s, p));
}
/** Why a design can't be placed (or converted to) now, or null. */
export function cantUse(s: GameState, id: string): string | null {
  const d = designById(s, id);
  if (!d) return "Unknown design";
  const locks = designLocks(s, d, id);
  if (locks.length) return "Needs research";
  if (isStock(id)) return null;
  const rec = s.designs[id];
  if (rec.rigged) return null;
  if (certPending(s, id)) return "Certification in progress";
  if (!certified(s, id)) return "Not certified";
  return null;
}

/** Machines of a design on the floor. */
export const machinesOf = (s: GameState, id: string) => s.objects.filter((o) => OBJECTS[o.kind]?.slot && designIdOf(o) === id);

export function statsOf(s: GameState, id: string): DesignStats {
  return (s.dstats[id] ??= { coinIn: 0, paidOut: 0, rounds: 0, sessions: 0, playTicks: 0, machDays: 0, feats: 0, jps: 0, rWin: 0, rDays: 0, theo: 0, born: -1, said: {} });
}
/**
 * Performance index (owner, M8.5): a design's theoretical win (coin-in × its house edge) per machine per day over
 * the lifetime of all its machines here, against the same for every slot on the floor. 1.0 is average. Theoretical,
 * so a jackpot paid out doesn't swing it; real slot directors rank games by it.
 */
export function perfIndex(s: GameState, id: string): number | null {
  const st = s.dstats[id];
  if (!st || st.machDays < 3) return null;
  let w = 0, dd = 0;
  for (const q of Object.values(s.dstats)) { w += q.theo ?? 0; dd += q.machDays; }
  if (dd <= 0 || w <= 0) return null;
  return (st.theo ?? 0) / st.machDays / (w / dd);
}
/** One line that explains the performance index next to it. */
export const PERF_INDEX_HELP = "Performance index: what this game is expected to win per machine per day (its bets × its house edge, over the life of all its machines here), against the average slot on your floor. 1.0 is average; 1.5 means it earns half again as much.";

/** Who a scenario's slot panel is made of: its population by type, weighted by how often each type comes. */
export function panelMix(s: GameState): Record<string, number> {
  const pop = SCENARIOS[s.scenario]?.population ?? { local: 1 };
  const out: Record<string, number> = {};
  for (const [t, w] of Object.entries(pop)) if (GUEST_TYPES[t] && w) out[t] = w * GUEST_TYPES[t].arrival.base * (t === "highroller" ? 0.3 : 1);
  return out;
}

/** A design made safe to compile: known ids, numbers in range (payback down to the rigging floor). The name is kept as typed (trimmed on save). */
export function sanitize(d: SlotDesign): SlotDesign {
  const c = structuredClone(d);
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  const int = (v: unknown, lo: number, hi: number, def: number) => Math.round(num(v, lo, hi, def));
  if (!LAYOUTS[c.layout]) c.layout = "l20";
  if (!SLOT_THEMES[c.theme]) c.theme = "classic";
  c.set = c.set === 1 ? 1 : 0;
  c.name = String(c.name ?? "Untitled").slice(0, 24);
  if (!DENOMS.includes(c.denom)) c.denom = 0.01;
  c.minBet = Math.round(num(c.minBet, 1, 5000, 1));
  c.maxBet = Math.round(num(c.maxBet, c.minBet, 10000, c.minBet));
  c.rtp = num(c.rtp, RTP_RIGGED, RTP_RANGE[1], 0.9);
  c.hit = num(c.hit, 0.02, 0.8, 0.3);
  c.vol = num(c.vol, 0, 1, 0.5);
  if (!["none", "plain", "x2", "x3"].includes(c.wild)) c.wild = "plain";
  c.stacks = !!c.stacks;
  const classic = LAYOUTS[c.layout].win === "classic";
  const obj = (v: unknown) => !classic && !!v && typeof v === "object";
  c.fs = obj(c.fs) ? { every: int(c.fs!.every, FS_EVERY[0], FS_EVERY[1], 150), count: int(c.fs!.count, 0, FS_COUNTS.length - 1, 1), retrigger: !!c.fs!.retrigger, enh: FS_ENH[c.fs!.enh] ? c.fs!.enh : "none" } : null;
  c.hns = obj(c.hns) ? { every: int(c.hns!.every, FEAT_EVERY[0], FEAT_EVERY[1], 120), land: int(c.hns!.land, 0, 2, 1), values: int(c.hns!.values, 0, 2, 1) } : null;
  c.pick = obj(c.pick) ? { every: int(c.pick!.every, FEAT_EVERY[0], FEAT_EVERY[1], 150), mode: c.pick!.mode === "match" ? "match" : "collect", size: int(c.pick!.size, 0, 2, 1) } : null;
  c.wheel = obj(c.wheel) ? { every: int(c.wheel!.every, FEAT_EVERY[0], FEAT_EVERY[1], 200), spread: int(c.wheel!.spread, 0, 2, 1) } : null;
  c.cascade = obj(c.cascade) ? { chain: int(c.cascade!.chain, 0, 2, 1), climb: !!c.cascade!.climb } : null;
  c.collect = obj(c.collect) ? {
    size: int(c.collect!.size, 0, COLLECT_SIZES.length - 1, 1), every: int(c.collect!.every, COLLECT_EVERY[0], COLLECT_EVERY[1], 300),
    prize: c.collect!.prize === "super" ? "super" : "credits", x: COLLECT_X.includes(c.collect!.x) ? c.collect!.x : 50,
  } : null;
  c.offer = obj(c.offer) ? { every: int(c.offer!.every, FEAT_EVERY[0], FEAT_EVERY[1], 200), size: int(c.offer!.size, 0, 2, 1) } : null;
  c.mystery = obj(c.mystery) ? { kind: c.mystery!.kind === "wilds" ? "wilds" : "mult", every: int(c.mystery!.every, MYSTERY_EVERY[0], MYSTERY_EVERY[1], 20) } : null;
  if (c.collect?.prize === "super" && !c.fs) c.collect.prize = "credits";
  // At most MAX_FEATURES: the last ones switched on go first.
  for (const f of featuresOf(c).slice(MAX_FEATURES).reverse()) (c as unknown as Record<string, unknown>)[f] = null;
  const kinds = Object.keys(JACKPOT_KINDS) as JackpotKind[], hows: JackpotHow[] = ["sym", "hns", "wheel", "pick", "mystery"];
  c.jackpots = (Array.isArray(c.jackpots) ? c.jackpots : []).slice(0, classic ? 1 : 4).map((j) => {
    const kind = kinds.includes(j.kind as JackpotKind) ? j.kind! : "fixed";
    const out: SlotDesign["jackpots"][number] = { x: Math.round(num(j.x, 2, 100000, 50)), every: Math.round(num(j.every, 50, 1e8, 1000)) };
    if (kind !== "fixed") { out.kind = kind; out.inc = Math.round(num(j.inc, INC_RANGE[0], INC_RANGE[1], 0.005) * 10000) / 10000; }
    if (kind === "mhb") out.cap = Math.round(num(j.cap, CAP_RANGE[0], CAP_RANGE[1], 2) * 100) / 100;
    const how = hows.includes(j.how as JackpotHow) ? j.how! : "sym";
    if (kind !== "mhb" && how !== "sym" && !classic) out.how = how;
    if (j.max && kind !== "mhb") out.max = true;
    return out;
  });
  const sh = c.show ?? ({} as SlotDesign["show"]);
  c.show = {
    lights: Math.round(num(sh.lights, 0, 3, 2)), light: Math.round(num(sh.light, 0, 7, 0)), sound: Math.round(num(sh.sound, 0, 3, 2)),
    call: typeof sh.call === "string" && sh.call.startsWith("call_") ? sh.call : SLOT_THEMES[c.theme].call,
    ldw: Math.round(num(sh.ldw, 0, 2, 1)), near: num(sh.near, NEAR_RANGE[0], NEAR_RANGE[1], 1), antic: sh.antic !== false,
    rollup: Math.round(num(sh.rollup, 0, 2, 1)), speed: Math.round(num(sh.speed, 0, 2, 1)),
  };
  const cab = c.cab ?? ({} as SlotDesign["cab"]);
  c.cab = { type: CABINETS[cab.type] ? cab.type : "upright", body: Math.round(num(cab.body, 0, 11, 2)), topper: TOPPERS[cab.topper] ? cab.topper : "none" };
  // The topper wheel is the wheel feature, on the cabinet.
  if (c.cab.topper === "wheel" && !c.wheel) c.cab.topper = "none";
  const lk = c.look ?? defaultLook();
  c.look = { font: int(lk.font, 0, FONTS.length - 1, 0), fx: int(lk.fx, 0, LOGO_FX.length - 1, 0), top: int(lk.top, 0, 2, 0), meters: int(lk.meters, 0, 2, 1), reels: int(lk.reels, 0, 2, 1), deck: int(lk.deck, 0, 1, 0) };
  // (Batch E) A custom set: library symbols only, all different; a bad slot takes the theme's symbol.
  if (c.syms && typeof c.syms === "object") {
    const base = SLOT_THEMES[c.theme].sets[c.set], cs = c.syms;
    const ok = (e: unknown, def: string) => (typeof e === "string" && EMOJI[e] ? e : def);
    const list = (v: unknown, def: string[]) => def.map((q, i) => ok(Array.isArray(v) ? v[i] : undefined, q));
    const syms = {
      highs: list(cs.highs, base.highs), lows: cs.lows === null || !Array.isArray(cs.lows) ? null : list(cs.lows, base.lows),
      scatter: ok(cs.scatter, base.scatter), jackpot: ok(cs.jackpot, base.jackpot),
    };
    const all = [...syms.highs, ...(syms.lows ?? []), syms.scatter, syms.jackpot];
    if (syms.lows && syms.lows.some((e) => !EMOJI[e])) syms.lows = null;
    if (new Set(all).size === all.length && all.every((e) => EMOJI[e])) c.syms = syms; else delete c.syms;
  } else delete c.syms;
  c.origin = c.origin === "stock" || c.origin === "rival" || c.origin === "imported" ? c.origin : "own";
  return c;
}

/** Whether two designs differ only in looks (name, theme, colors, lights, sound): no new version, no certification. */
export const sameMath = (a: SlotDesign, b: SlotDesign) => mathKey(a) === mathKey(b);

const commands: CommandTable<"designSave" | "designCertify" | "designRun" | "designConvert" | "designDelete" | "signShow"> = {
  signShow: {
    validate: (g, c) => (g.objById.get(c.obj)?.kind !== "bank_sign" ? "Not a bank sign" : c.id && !designById(g.state, c.id) ? "Unknown game" : null),
    apply(g, c) { const o = g.objById.get(c.obj)!; if (c.id) o.design = c.id; else delete o.design; },
  },
  designSave: {
    validate(g, c) {
      if (!c.d || typeof c.d !== "object") return "No design";
      // (M8.6) A sold design's math belongs to its maker; its looks are still yours.
      const rec = g.state.designs[c.d.id];
      return rec?.sale && !sameMath(rec.d, sanitize(c.d)) ? `Sold to ${rec.sale.maker}: its math and features are theirs now` : null;
    },
    apply(g, c) {
      const s = g.state, d = sanitize(c.d);
      d.name = d.name.trim() || "Untitled";
      const rec = s.designs[d.id];
      if (rec && sameMath(rec.d, d)) { rec.d = d; g.lastDesign = d.id; return; }
      const placed = rec && machinesOf(s, d.id).length > 0;
      if (rec && !placed && rec.cert <= 0) { rec.d = d; rec.cert = 0; g.lastDesign = d.id; return; }
      // A new design, or a new version of one on the floor or certified (those keep running as they are).
      const id = `d${s.nextDesign++}`;
      let name = d.name;
      if (rec && rec.d.name === name) {
        const base = name.replace(/ v\d+$/, "");
        let v = 2;
        while (Object.values(s.designs).some((q) => q.d.name === `${base} v${v}`)) v++;
        name = `${base} v${v}`.slice(0, 24);
      }
      s.designs[id] = { d: { ...d, id, name }, cert: 0, rigged: 0 };
      g.lastDesign = id;
    },
  },
  designCertify: {
    validate(g, c) {
      const s = g.state, rec = s.designs[c.id];
      if (!rec) return "Not one of your designs";
      if (certified(s, c.id)) return "Already certified";
      if (certPending(s, c.id)) return "Already at the lab";
      const bad = illegal(s, rec.d);
      if (bad.length) return `Can't be certified: ${bad.join(", ")}`;
      return (researched(s, "fastcert") ? CERT.fastFee : CERT.fee) > s.cash ? "Not enough cash" : null;
    },
    apply(g, c) {
      const s = g.state, fast = researched(s, "fastcert");
      post(g, "lab", -(fast ? CERT.fastFee : CERT.fee));
      s.designs[c.id].cert = s.tick + (fast ? CERT.fastDays : CERT.days) * TICKS_PER_DAY;
      news(g, "info", `${s.designs[c.id].d.name} went to the regulator's lab: certified in ${fast ? CERT.fastDays : CERT.days} days.`, { tab: "slots" });
    },
  },
  designRun: {
    validate: (g, c) => (g.state.designs[c.id] ? null : "Not one of your designs"),
    apply(g, c) {
      g.state.designs[c.id].rigged = c.on ? 1 : 0;
    },
  },
  designConvert: {
    validate(g, c) {
      const s = g.state, o = g.objById.get(c.obj), d = designById(s, c.id);
      if (!o || !OBJECTS[o.kind]?.slot) return "Not a slot machine";
      if (!d) return "Unknown design";
      if (designIdOf(o) === c.id) return "It already plays that";
      if (cabOfKind(o.kind) !== d.cab.type) return `Needs a ${CABINETS[d.cab.type].name.toLowerCase()} cabinet`;
      if (s.yours?.obj === o.id) return "You're playing it";
      const why = cantUse(s, c.id);
      if (why) return why;
      return CONVERT_FEE > s.cash ? "Not enough cash" : null;
    },
    apply(g, c) {
      const o = g.objById.get(c.obj)!;
      o.design = c.id;
      // A new game starts with fresh meters and an empty collector (what was on them goes with the old game).
      delete o.meter;
      delete o.col;
      post(g, "build", -CONVERT_FEE);
      const st = statsOf(g.state, c.id);
      if (st.born < 0) st.born = Math.floor(g.state.tick / TICKS_PER_DAY);
      g.tilesChanged([o.y * g.state.map.w + o.x]);
    },
  },
  designDelete: {
    validate: (g, c) => (!g.state.designs[c.id] ? "Not one of your designs" : machinesOf(g.state, c.id).length ? "Still on the floor"
      : g.state.designs[c.id].sale ? "Sold designs stay on your books" : g.state.offer?.id === c.id ? "An offer for it is waiting" : null),
    apply(g, c) { delete g.state.designs[c.id]; },
  },
};

export const designSystem: System = {
  id: "designs",
  deps: ["news"],
  commands,
  month(g) { pruneOpinions(g.state); },
  day(g) {
    const s = g.state;
    for (const [id, rec] of Object.entries(s.designs)) {
      // The lab's verdict arrives.
      if (rec.cert > s.tick - TICKS_PER_DAY && rec.cert <= s.tick) news(g, "good", `${rec.d.name} is certified. Place it from the Build menu.`, { tab: "slots" });
      void id;
    }
    for (const st of Object.values(s.dstats)) { st.rWin *= 0.97; st.rDays *= 0.97; }
    // A linked meter with no machines left goes with them (its liability released).
    if (s.meters) for (const id of Object.keys(s.meters)) if (!s.objects.some((o) => OBJECTS[o.kind]?.slot && designIdOf(o) === id)) delete s.meters[id];
    for (const o of s.objects) {
      if (!OBJECTS[o.kind]?.slot) continue;
      const st = statsOf(s, designIdOf(o));
      st.machDays++;
      st.rDays++;
      if (st.born < 0) st.born = Math.floor(s.tick / TICKS_PER_DAY);
    }
  },
};

// ---------------------------------------------------------------------------------------------------------
// (M8.5) Hunters, meters' pull, bank signs.

/** Share of a collector's meter past which playing it is worth it for a hunter (its prize outweighs the edge). */
export function collectHuntAt(c: Compiled): number {
  const Jc = c.budget.collect;
  return Jc > 0 ? 1 - Jc / (1 - c.d.rtp + Jc) : 1;
}
/**
 * How far a machine is past the point where an advantage player profits (0 or less: not worth it): a must-hit-by
 * meter near its cap (the hit point is hidden, so hunters camp once it's 85% of the way), or a collector kept full.
 */
export function huntEdge(s: GameState, o: PlacedObject): number {
  const inf = slotInfo(s, o);
  if (!inf) return 0;
  const c = inf.c;
  let best = -1;
  const m = s.meters?.[inf.id], top = maxBetOf(c);
  c.levels.forEach((l, i) => {
    if (l.kind !== "mhb" || !m) return;
    const seed = l.x * top, cap = l.cap * top;
    best = Math.max(best, (m.v[i] - seed) / Math.max(1e-9, cap - seed) - 0.85);
  });
  if (c.col) best = Math.max(best, (o.col ?? 0) / c.col.N - collectHuntAt(c));
  return best;
}
/** The biggest meter (dollars) a guest betting `stake` can win on a machine. */
export function topMeter(s: GameState, o: PlacedObject, stake: number, info = slotInfo(s, o)): number {
  const inf = info;
  if (!inf || !inf.prog) return 0;
  const c = inf.c, h = { meters: s.meters, own: o, id: inf.id };
  let top = 0;
  c.levels.forEach((l, i) => {
    if (l.kind === "fixed" || (l.max && stake < maxBetOf(c) - 1e-9)) return;
    top = Math.max(top, meterValue(h, c, i));
  });
  return top;
}
/** The design a bank sign shows: its own choice, else the nearest linked game within 6 tiles. */
export function signDesign(g: Game, sign: PlacedObject): string | null {
  const s = g.state;
  if (sign.design && designById(s, sign.design)) return sign.design;
  let best: string | null = null, bd = 7;
  for (const o of s.objects) {
    if (!OBJECTS[o.kind]?.slot) continue;
    const d = Math.max(Math.abs(o.x - sign.x), Math.abs(o.y - sign.y));
    if (d >= bd) continue;
    const c = slotInfo(s, o)?.c;
    if (c && c.levels.some((l) => l.kind === "linked" || l.kind === "mhb")) { best = designIdOf(o); bd = d; }
  }
  return best;
}

/** Fee to certify here now. */
export const certFee = (s: GameState) => (researched(s, "fastcert") ? CERT.fastFee : CERT.fee);
export { fmtMoney };
