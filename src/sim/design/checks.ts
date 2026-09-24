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
import { compile, type Compiled } from "./compile";
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
    out.push(sanitize(d));
  }
  return out;
}

function checkOne(c: Compiled, p: string[], entries: number) {
  const d = c.d, id = d.id, b = c.budget;
  const sum = b.small + b.big + b.scatter + b.fs + b.jackpots;
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
    if (o.kind === "win" && Math.abs(evaluate(c, o.grid).total - o.x) > 1e-9) p.push(`${id}: forced ${f.id} screen pays wrong`);
    if (o.kind === "fs") {
      if (c.lay.win !== "classic" && countOf(o.grid, SCATTER) !== o.scat) p.push(`${id}: free spins trigger shows ${countOf(o.grid, SCATTER)} scatters`);
      for (const s of o.fs!.spins) if (!s.retrig && Math.abs(evaluate(c, s.grid).total * s.mult - s.x) > 1e-9) p.push(`${id}: a free spin's screen pays wrong`);
    }
    if (o.kind === "jackpot" && c.lay.win !== "classic" && countOf(o.grid, JACKPOT) !== 3 + o.level) p.push(`${id}: jackpot screen wrong`);
    if (o.kind === "loss" && evaluate(c, o.grid).total > 0) p.push(`${id}: a losing screen pays`);
  }
}

export function designChecks(): string[] {
  const p: string[] = [];
  for (const [id, d] of Object.entries(STOCK_DESIGNS)) {
    if (d.id !== id) p.push(`stock design ${id} has id ${d.id}`);
    checkOne(compile(d, `check:${id}`), p, 100000);
  }
  for (const d of fuzzDesigns(60)) checkOne(compile(d, `check:${d.id}`), p, 120);
  for (const o of Object.values(OBJECTS)) if (o.slot && !STOCK_DESIGNS[o.slot]) p.push(`${o.id}: unknown stock design ${o.slot}`);
  // The original machines keep (about) their old appeal to each type.
  for (const t of Object.keys(GUEST_TYPES)) for (const id of ["cherry", "liberty", "thunder"]) {
    const want = GUEST_TYPES[t].games[id], got = judge(compile(STOCK_DESIGNS[id], `check:${id}`), t).appeal;
    if (want !== undefined && Math.abs(got - want) > 0.12) p.push(`${id} appeal to ${t}: ${got.toFixed(2)}, was ${want}`);
  }
  return p;
}
