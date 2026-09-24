// Headless checks for the slot designer (docs/spec/designer.md §3): exact payback for every stock design and a fixed
// set of fuzzed designs, luck staying exact, every win and screen buildable and paying exactly what was drawn, and the
// original machines keeping their appeal per type. Invariants and exact math only; nothing random is asserted.
import { STOCK_DESIGNS } from "../../data/designs";
import { FS_ENH_IDS, LAYOUT_IDS, SLOT_THEME_IDS, newDesign, type SlotDesign } from "../../data/designer";
import { LUCK_SHIFT } from "../../data/cheats";
import { GUEST_TYPES } from "../../data/guests";
import { OBJECTS } from "../../data/objects";
import { seeded } from "../rng";
import { luckRedraw, luckVoid } from "../cheats";
import { compile, hnsChain, type Compiled } from "./compile";
import { build, countOf, evaluate } from "./grid";
import { forces, spinFull } from "./spin";
import { judge } from "./appeal";
import { SCATTER, JACKPOT } from "../../data/designer";
import { sanitize } from "./index";

export function fuzzDesigns(n: number, seed = 99): SlotDesign[] {
  const r = seeded(seed), out: SlotDesign[] = [];
  for (let i = 0; i < n; i++) {
    const d = newDesign(`fz${i}`);
    d.layout = r.pick(LAYOUT_IDS); d.theme = r.pick(SLOT_THEME_IDS);
    d.rtp = 0.8 + r.next() * 0.19; d.hit = 0.05 + r.next() * 0.55; d.vol = r.next();
    d.wild = r.pick(["none", "plain", "x2", "x3"] as const); d.stacks = r.chance(0.4);
    d.fs = r.chance(0.7) ? { every: r.int(60, 2000), count: r.int(0, 3), retrigger: r.chance(0.5), enh: r.pick(FS_ENH_IDS) } : null;
    d.jackpots = r.chance(0.5) ? Array.from({ length: r.int(1, 4) }, (_, k) => ({ x: [10, 50, 250, 2000][k], every: [400, 3000, 40000, 1e6][k] })) : [];
    // (M8.5) Bonus features and progressives.
    if (r.chance(0.35)) d.hns = { every: r.int(40, 400), land: r.int(0, 2), values: r.int(0, 2) };
    if (r.chance(0.25)) d.pick = { every: r.int(60, 600), mode: r.chance(0.5) ? "match" : "collect", size: r.int(0, 2) };
    if (r.chance(0.25)) d.wheel = { every: r.int(60, 800), spread: r.int(0, 2) };
    if (r.chance(0.25)) d.cascade = { chain: r.int(0, 2), climb: r.chance(0.5) };
    if (r.chance(0.2)) d.collect = { size: r.int(0, 3), every: r.int(80, 1000), prize: r.chance(0.5) ? "super" : "credits", x: r.pick([25, 50, 100, 200]) };
    if (r.chance(0.2)) d.offer = { every: r.int(60, 800), size: r.int(0, 2) };
    if (r.chance(0.2)) d.mystery = { kind: r.chance(0.5) ? "mult" : "wilds", every: r.int(5, 100) };
    const hows = ["sym", "hns", "wheel", "pick", "mystery"] as const, kinds = ["fixed", "sa", "linked", "mhb"] as const;
    for (const j of d.jackpots) {
      if (r.chance(0.5)) j.kind = r.pick(kinds);
      if (j.kind && j.kind !== "fixed") j.inc = 0.002 + r.next() * 0.01;
      if (j.kind === "mhb") j.cap = 1.3 + r.next() * 3;
      if (r.chance(0.5)) j.how = r.pick(hows);
      if (r.chance(0.15)) j.max = true;
    }
    if (d.wheel && r.chance(0.3)) d.cab.topper = "wheel";
    out.push(sanitize(d));
  }
  return out;
}

function checkOne(c: Compiled, p: string[], entries: number) {
  const d = c.d, id = d.id, b = c.budget;
  const sum = b.small + b.big + b.scatter + b.fs + b.jackpots + b.hns + b.pick + b.wheel + b.offer + b.collect + b.cascade + b.mystery;
  if (Math.abs(sum - d.rtp) > 1e-9) p.push(`${id}: payback budget adds to ${sum}, target ${d.rtp}`);
  if (c.notes.some((n) => n.startsWith("internal"))) p.push(`${id}: ${c.notes.join("; ")}`);
  const m = c.model, h = m.stats!.h;
  if (!(h > 0 && h < 1) || !(m.stats!.v > 0)) p.push(`${id}: bad stats`);
  const up = luckRedraw(m), down = luckVoid(m);
  if (!(up > 0 && up <= 1 + 1e-12 && down > 0 && down <= 1)) p.push(`${id}: luck chances out of range (${up}, ${down})`);
  if (Math.abs(m.rtp + (1 - h) * up * m.rtp - (m.rtp + LUCK_SHIFT)) > 1e-12) p.push(`${id}: lucky payback off`);
  // Every win (a sample for fuzzed designs) has a screen that pays exactly it.
  const r = seeded(5);
  const kind = d.fs?.enh === "extra" ? "extra" : d.fs?.enh === "wildx" ? "wildx" : "plain";
  const lads = [c.base, ...(c.fsL[0] !== c.base ? c.fsL : [])];
  lads.forEach((l, li) => {
    const step = Math.max(1, Math.floor(l.e.length / entries));
    for (let i = 0; i < l.e.length; i += step) {
      const e = l.e[i], g = build(c, { e, scat: 0, jp: 0, near: false, fs: li ? kind : undefined }, r).grid;
      if (Math.abs(evaluate(c, g).total - e.x) > 1e-9) { p.push(`${id}: no screen for a ${e.x}× win (ladder ${li})`); return; }
    }
  });
  // Every forced outcome shows what it pays.
  for (const f of forces(c)) {
    const o = spinFull(c, r, f.id);
    if (o.kind === "win") {
      const first = evaluate(c, o.grid).total, chain = (o.e?.x ?? 0) + (o.casc ?? []).reduce((a, q) => a + q.x, 0);
      if (Math.abs(first - (o.e?.x ?? 0)) > 1e-9 || Math.abs(chain * (o.mm ?? 1) - o.x) > 1e-9) p.push(`${id}: forced ${f.id} screen pays wrong`);
    }
    if (o.kind === "fs") {
      if (c.lay.win !== "classic" && countOf(o.grid, SCATTER) !== o.scat) p.push(`${id}: free spins trigger shows ${countOf(o.grid, SCATTER)} scatters`);
      for (const s of o.fs!.spins) if (!s.retrig && Math.abs(evaluate(c, s.grid).total * s.mult - s.x) > 1e-9) p.push(`${id}: a free spin's screen pays wrong`);
    }
    if (o.kind === "jackpot" && !o.myst && c.lay.win !== "classic" && countOf(o.grid, JACKPOT) !== 3 + o.level) p.push(`${id}: jackpot screen wrong`);
    if (o.casc) for (const q of o.casc) if (Math.abs(evaluate(c, q.grid).total * q.m - q.x) > 1e-9) p.push(`${id}: a cascade's screen pays wrong`);
    if (o.hns) {
      const orbs = [...o.hns.start, ...o.hns.steps.flat()];
      if (new Set(orbs.map((q) => q.at)).size !== orbs.length || orbs.some((q) => q.at < 0 || q.at >= o.hns!.spots)) p.push(`${id}: hold & spin orbs overlap`);
      if (Math.abs(orbs.reduce((a, q) => a + q.x, 0) - o.hns.credits) > 1e-9) p.push(`${id}: hold & spin credits don't add up`);
    }
    if (o.pick?.mode === "collect" && Math.abs(o.pick.reveals.reduce((a, q) => a + q.x, 0) - o.x) > 1e-9) p.push(`${id}: pick reveals don't add up`);
    if (o.wheel && (o.wheel.at < 0 || (o.wheel.segs[o.wheel.at].lv < 0 && Math.abs(o.wheel.segs[o.wheel.at].x - o.x) > 1e-9))) p.push(`${id}: the wheel lands wrong`);
    if (o.kind === "loss" && evaluate(c, o.grid).total > 0) p.push(`${id}: a losing screen pays`);
  }
}

export function designChecks(): string[] {
  const p: string[] = [];
  for (const [id, d] of Object.entries(STOCK_DESIGNS)) {
    if (d.id !== id) p.push(`stock design ${id} has id ${d.id}`);
    checkOne(compile(d, `check:${id}`), p, 100000);
  }
  for (const d of fuzzDesigns(120)) checkOne(compile(d, `check:${d.id}`), p, 120);
  p.push(...featureChecks());
  for (const o of Object.values(OBJECTS)) if (o.slot && !STOCK_DESIGNS[o.slot]) p.push(`${o.id}: unknown stock design ${o.slot}`);
  // The original machines keep (about) their old appeal to each type.
  for (const t of Object.keys(GUEST_TYPES)) for (const id of ["cherry", "liberty", "thunder"]) {
    const want = GUEST_TYPES[t].games[id], got = judge(compile(STOCK_DESIGNS[id], `check:${id}`), t).appeal;
    if (want !== undefined && Math.abs(got - want) > 0.15) p.push(`${id} appeal to ${t}: ${got.toFixed(2)}, was ${want}`);
  }
  return p;
}

/** (M8.5) Each feature's exact value against its tables: hold & spin's chain sums to 1; features' budgets add up. */
function featureChecks(): string[] {
  const p: string[] = [];
  for (const [spots, start] of [[9, 4], [15, 6], [20, 6], [24, 6]]) for (const land of [0.045, 0.065, 0.09]) {
    const dist = hnsChain(spots, start, land), tot = dist.reduce((a, b) => a + b, 0);
    if (Math.abs(tot - 1) > 1e-9) p.push(`hold & spin chain (${spots}, ${land}) sums to ${tot}`);
    if (dist.slice(0, start).some((v) => v > 0)) p.push(`hold & spin chain ends below its start`);
  }
  return p;
}
