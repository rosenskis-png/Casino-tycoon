// Slot designs in the casino (docs/spec/designer.md §10-11): which design a machine plays, the player's designs
// and their certification, what a design costs and needs, per-design numbers, and the commands the designer
// sends. The math is in compile.ts; how guests judge a design in appeal.ts.
import { STOCK_RESEARCH } from "../../data/designs";
import {
  CABINETS, DENOMS, FS_COUNTS, FS_ENH, FS_EVERY, LAYOUTS, NEAR_RANGE, RTP_RANGE, RTP_RIGGED, SLOT_THEMES, TOPPERS,
  type CabType, type SlotDesign,
} from "../../data/designer";
import { OBJECTS } from "../../data/objects";
import { SCENARIOS } from "../../data/scenarios";
import { GUEST_TYPES } from "../../data/guests";
import type { CommandTable } from "../commands";
import type { System } from "../registry";
import type { DesignStats, GameState, PlacedObject } from "../state";
import { compile, mathKey, type Compiled } from "./compile";
import { designById, designIdOf, isStock } from "./lookup";
import { researched } from "../research";
import { post } from "../finance";
import { fmtMoney, news } from "../news";
import { TICKS_PER_DAY } from "../clock";

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
  }
}

export const CERT = { fee: 1500, days: 7, fastFee: 750, fastDays: 3 };
export const CONVERT_FEE = 100;

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
export const compiledOf = (s: GameState, o: PlacedObject) => compiledById(s, designIdOf(o));

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
  if (d.fs) need.add("freespins");
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
  return (s.dstats[id] ??= { coinIn: 0, paidOut: 0, rounds: 0, sessions: 0, playTicks: 0, machDays: 0, feats: 0, jps: 0, rWin: 0, rDays: 0, born: -1, said: {} });
}
/** Performance index: a design's recent win per machine-day against the floor's slots (real slot directors' number). */
export function perfIndex(s: GameState, id: string): number | null {
  const st = s.dstats[id];
  if (!st || st.rDays < 3) return null;
  let w = 0, dd = 0;
  for (const q of Object.values(s.dstats)) { w += q.rWin; dd += q.rDays; }
  if (dd <= 0 || w <= 0) return null;
  return st.rWin / st.rDays / (w / dd);
}

/** Who a scenario's slot panel is made of: its population by type, weighted by how often each type comes. */
export function panelMix(s: GameState): Record<string, number> {
  const pop = SCENARIOS[s.scenario]?.population ?? { local: 1 };
  const out: Record<string, number> = {};
  for (const [t, w] of Object.entries(pop)) if (GUEST_TYPES[t] && w) out[t] = w * GUEST_TYPES[t].arrival.base * (t === "highroller" ? 0.3 : 1);
  return out;
}

/** A design made safe to compile: known ids, numbers in range (payback down to the rigging floor). */
export function sanitize(d: SlotDesign): SlotDesign {
  const c = structuredClone(d);
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  if (!LAYOUTS[c.layout]) c.layout = "l20";
  if (!SLOT_THEMES[c.theme]) c.theme = "classic";
  c.set = c.set === 1 ? 1 : 0;
  c.name = String(c.name ?? "Untitled").slice(0, 24).trim() || "Untitled";
  if (!DENOMS.includes(c.denom)) c.denom = 0.01;
  c.minBet = Math.round(num(c.minBet, 1, 5000, 1));
  c.maxBet = Math.round(num(c.maxBet, c.minBet, 10000, c.minBet));
  c.rtp = num(c.rtp, RTP_RIGGED, RTP_RANGE[1], 0.9);
  c.hit = num(c.hit, 0.02, 0.8, 0.3);
  c.vol = num(c.vol, 0, 1, 0.5);
  if (!["none", "plain", "x2", "x3"].includes(c.wild)) c.wild = "plain";
  c.stacks = !!c.stacks;
  if (c.fs) {
    c.fs = { every: Math.round(num(c.fs.every, FS_EVERY[0], FS_EVERY[1], 150)), count: Math.round(num(c.fs.count, 0, FS_COUNTS.length - 1, 1)), retrigger: !!c.fs.retrigger, enh: FS_ENH[c.fs.enh] ? c.fs.enh : "none" };
  }
  if (LAYOUTS[c.layout].win === "classic") c.fs = null;
  c.jackpots = (Array.isArray(c.jackpots) ? c.jackpots : []).slice(0, LAYOUTS[c.layout].win === "classic" ? 1 : 4)
    .map((j) => ({ x: Math.round(num(j.x, 2, 100000, 50)), every: Math.round(num(j.every, 50, 1e8, 1000)) }));
  const sh = c.show ?? ({} as SlotDesign["show"]);
  c.show = {
    lights: Math.round(num(sh.lights, 0, 3, 2)), light: Math.round(num(sh.light, 0, 7, 0)), sound: Math.round(num(sh.sound, 0, 3, 2)),
    call: typeof sh.call === "string" && sh.call.startsWith("call_") ? sh.call : SLOT_THEMES[c.theme].call,
    ldw: Math.round(num(sh.ldw, 0, 2, 1)), near: num(sh.near, NEAR_RANGE[0], NEAR_RANGE[1], 1), antic: sh.antic !== false,
    rollup: Math.round(num(sh.rollup, 0, 2, 1)), speed: Math.round(num(sh.speed, 0, 2, 1)),
  };
  const cab = c.cab ?? ({} as SlotDesign["cab"]);
  c.cab = { type: CABINETS[cab.type] ? cab.type : "upright", body: Math.round(num(cab.body, 0, 11, 2)), topper: TOPPERS[cab.topper] ? cab.topper : "none" };
  return c;
}

/** Whether two designs differ only in looks (name, theme, colors, lights, sound): no new version, no certification. */
export const sameMath = (a: SlotDesign, b: SlotDesign) => mathKey(a) === mathKey(b);

const commands: CommandTable<"designSave" | "designCertify" | "designRun" | "designConvert" | "designDelete"> = {
  designSave: {
    validate: (_g, c) => (c.d && typeof c.d === "object" ? null : "No design"),
    apply(g, c) {
      const s = g.state, d = sanitize(c.d);
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
      news(g, "info", `${s.designs[c.id].d.name} went to the regulator's lab: certified in ${fast ? CERT.fastDays : CERT.days} days.`);
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
      post(g, "build", -CONVERT_FEE);
      const st = statsOf(g.state, c.id);
      if (st.born < 0) st.born = Math.floor(g.state.tick / TICKS_PER_DAY);
      g.tilesChanged([o.y * g.state.map.w + o.x]);
    },
  },
  designDelete: {
    validate: (g, c) => (!g.state.designs[c.id] ? "Not one of your designs" : machinesOf(g.state, c.id).length ? "Still on the floor" : null),
    apply(g, c) { delete g.state.designs[c.id]; },
  },
};

export const designSystem: System = {
  id: "designs",
  deps: ["news"],
  commands,
  day(g) {
    const s = g.state;
    for (const [id, rec] of Object.entries(s.designs)) {
      // The lab's verdict arrives.
      if (rec.cert > s.tick - TICKS_PER_DAY && rec.cert <= s.tick) news(g, "good", `${rec.d.name} is certified. Place it from the Build menu.`);
      void id;
    }
    for (const st of Object.values(s.dstats)) { st.rWin *= 0.97; st.rDays *= 0.97; }
    for (const o of s.objects) {
      if (!OBJECTS[o.kind]?.slot) continue;
      const st = statsOf(s, designIdOf(o));
      st.machDays++;
      st.rDays++;
      if (st.born < 0) st.born = Math.floor(s.tick / TICKS_PER_DAY);
    }
  },
};

/** Fee to certify here now. */
export const certFee = (s: GameState) => (researched(s, "fastcert") ? CERT.fastFee : CERT.fee);
export { fmtMoney };
