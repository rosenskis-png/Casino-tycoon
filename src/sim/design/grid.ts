// Reels a player sees (docs/spec/designer.md §3, §9): the evaluator (what a screen of symbols pays, by the
// design's real paytable) and the builder that lays out a screen showing exactly a drawn result. Every screen
// is checked with the evaluator before it's shown, so the display never pays anything other than what was drawn.
import { C_BLANK, C_WILD, JACKPOT, ORB, PAYING, PIECE, SCATTER, WILD, type LayoutDef } from "../../data/designer";
import type { Rng } from "../rng";
import { classicPay, wildReel, type Compiled, type Entry } from "./compile";
import { linePatterns } from "./lines";

/** Symbol codes on video reels beyond data/designer.ts: wilds carrying a multiplier. */
export const WILD2 = 12, WILD3 = 13;
/** Classic reels: the jackpot symbol. */
export const C_JP = 7;
export const isWild = (v: number) => v === WILD || v === WILD2 || v === WILD3;
const wildVal = (v: number) => (v === WILD2 ? 2 : v === WILD3 ? 3 : 1);

/** A screen: grid[reel][row]. Classic screens have three rows: above the line, the line, below. */
export type Grid = number[][];
export interface Win { s: number; k: number; pay: number; cells: number[]; line?: number; ways?: number }

const cell = (r: number, row: number) => r * 8 + row;

/** What a screen pays (× bet), before a free spin multiplier. */
export function evaluate(c: Compiled, g: Grid): { total: number; wins: Win[] } {
  const lay = c.lay, wins: Win[] = [];
  if (lay.win === "classic") {
    const [a, b, d] = [g[0][1], g[1][1], g[2][1]];
    if (a === C_JP || b === C_JP || d === C_JP) return { total: 0, wins };
    const wm = c.d.wild === "x3" ? 3 : c.d.wild === "x2" ? 2 : 1;
    const pay = classicPay(a, b, d, wm, c.top, c.d.wild !== "none");
    if (pay > 0) wins.push({ s: a * 49 + b * 7 + d, k: 3, pay, cells: [0, 1, 2].filter((r) => g[r][1] !== C_BLANK).map((r) => cell(r, 1)) });
    return { total: pay, wins };
  }
  const U = lay.units;
  if (lay.win === "lines") {
    lay.lines.forEach((ln, li) => {
      let target = -1, k = 0, mult = 1;
      const cells: number[] = [];
      for (let r = 0; r < lay.reels; r++) {
        const v = g[r][ln[r]];
        if (isWild(v)) { mult *= wildVal(v); k++; cells.push(cell(r, ln[r])); continue; }
        if (v >= PAYING) break;
        if (target < 0) target = v;
        if (v !== target) break;
        k++; cells.push(cell(r, ln[r]));
      }
      if (k < 3) return;
      // Wild multipliers count only within the run (recount: the loop above may have passed wilds after a break).
      mult = 1;
      for (let r = 0; r < k; r++) mult *= wildVal(g[r][ln[r]]);
      let pay: number;
      if (target < 0) pay = lay.reels === 3 ? c.top : c.pt[0][k - 3] * mult;
      else pay = c.pt[target][Math.min(k, c.pt[target].length + 2) - 3] * mult;
      if (target < 0 && lay.reels === 3) wins.push({ s: WILD, k, pay: pay / U, cells, line: li });
      else wins.push({ s: Math.max(0, target), k, pay: pay / U, cells, line: li });
    });
  } else {
    for (let s = 0; s < PAYING; s++) {
      let prod = 1, k = 0;
      const cells: number[] = [];
      for (let r = 0; r < lay.reels; r++) {
        let w = 0;
        for (let row = 0; row < lay.rows; row++) {
          const v = g[r][row];
          if (v === s || isWild(v)) { w += v === s ? 1 : wildVal(v); cells.push(cell(r, row)); }
        }
        if (!w) break;
        prod *= w; k++;
      }
      if (k < 3) continue;
      // Cells past the run don't count.
      const inRun = cells.filter((q) => Math.floor(q / 8) < k);
      wins.push({ s, k, pay: (c.pt[s][k - 3] * prod) / U, cells: inRun, ways: prod });
    }
  }
  return { total: wins.reduce((a, w) => a + w.pay, 0), wins };
}

export const countOf = (g: Grid, v: number) => g.reduce((a, reel) => a + reel.filter((q) => q === v).length, 0);

/** What a screen must show. */
export interface Show {
  e: Entry | null;
  /** Scatters on screen (3+ trigger or retrigger; 2 on a near miss). */
  scat: number;
  /** Jackpot symbols on screen. */
  jp: number;
  near: boolean;
  /** Free spins: more wilds on the reels ("extra"), wilds with multipliers ("wildx"). */
  fs?: "extra" | "wildx" | "plain";
  /** (M8.5) Three bonus symbols of this code (a pick, a wheel, an offer); two on a near miss. */
  bonus?: number;
  bonusN?: number;
  /** Hold & spin orbs at these spots (reel × rows + row). */
  orbs?: number[];
  /** A wild storm: extra wilds standing in. */
  storm?: boolean;
}

/** Builds a screen that pays exactly `sh.e` (or nothing), with the scatters and jackpot symbols asked for. */
export function build(c: Compiled, sh: Show, r: Rng): { grid: Grid; pre?: Grid } {
  if (c.lay.win === "classic") return { grid: classicGrid(c, sh, r) };
  // A near miss shows a trigger one short: two scatters, two bonus symbols, one orb too few, or two jackpot symbols.
  if (sh.near && !sh.scat && !sh.jp && !sh.bonus && !sh.orbs) {
    const opts: Show[] = [];
    if (c.q > 0) opts.push({ ...sh, scat: 2 });
    for (const f of c.feats) {
      if (f.q <= 0) continue;
      if (f.id === "pick" || f.id === "wheel" || f.id === "offer") opts.push({ ...sh, bonus: f.id === "pick" ? 15 : f.id === "wheel" ? 16 : 17, bonusN: 2 });
      if (f.id === "hns" && c.hns) opts.push({ ...sh, orbs: pickCells(c.lay, c.hns.start - 1, r) });
    }
    if (!opts.length && c.levels.some((l) => l.how === "sym")) opts.push({ ...sh, jp: 2 });
    if (opts.length) sh = opts[r.int(0, opts.length - 1)];
  }
  for (let t = 0; t < 80; t++) {
    const out = attempt(c, sh, r, t);
    if (out && ok(c, sh, out.grid)) return out;
  }
  // Last resort: a plain losing screen (never shown for a win: every ladder entry is buildable; checked headless).
  const g = emptyGrid(c.lay);
  fillers(c, g, r, -1, -1);
  return { grid: g };
}

function ok(c: Compiled, sh: Show, g: Grid): boolean {
  const { total, wins } = evaluate(c, g);
  if (Math.abs(total - (sh.e?.x ?? 0)) > 1e-9) return false;
  if (sh.e && wins.some((w) => w.s !== sh.e!.s)) return false;
  if (sh.bonus !== undefined && countOf(g, sh.bonus) !== (sh.bonusN ?? 3)) return false;
  if (countOf(g, ORB) !== (sh.orbs?.length ?? 0)) return false;
  return countOf(g, SCATTER) === sh.scat && countOf(g, JACKPOT) === sh.jp;
}

/** n distinct spots (reel × rows + row) on a layout. */
function pickCells(lay: LayoutDef, n: number, r: Rng): number[] {
  const all = shuffle([...Array(lay.reels * lay.rows).keys()], r);
  return all.slice(0, Math.max(0, n));
}

/**
 * A collector piece on a cell outside every win (never on a scatter, orb or bonus symbol): it's not a paying
 * symbol, so it can't make a win, and outside the wins it can't break one. Checked with the evaluator.
 */
export function addPiece(c: Compiled, g: Grid, r: Rng): Grid {
  if (c.lay.win === "classic" || !g.length) return g;
  const ev = evaluate(c, g), used = new Set(ev.wins.flatMap((w) => w.cells));
  const free: number[] = [];
  g.forEach((reel, ri) => reel.forEach((v, row) => { if (v >= 0 && v < PAYING && !used.has(cell(ri, row))) free.push(cell(ri, row)); }));
  if (!free.length) return g;
  const out = g.map((reel) => reel.slice()), at = r.pick(free);
  out[Math.floor(at / 8)][at % 8] = PIECE;
  return Math.abs(evaluate(c, out).total - ev.total) < 1e-9 ? out : g;
}

const emptyGrid = (lay: LayoutDef): Grid => Array.from({ length: lay.reels }, () => new Array(lay.rows).fill(-1));

function shuffle<T>(a: T[], r: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = r.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function attempt(c: Compiled, sh: Show, r: Rng, t: number): { grid: Grid; pre?: Grid } | null {
  const lay = c.lay, g = emptyGrid(lay), e = sh.e;
  let pre: Grid | undefined;
  // Plain wilds shown standing in for the symbol: often in "extra wilds" free spins, sometimes otherwise.
  const pw = sh.storm ? 0.7 : !c.d.wild || c.d.wild === "none" ? (sh.fs === "extra" ? 0.35 : 0) : sh.fs === "extra" ? 0.4 : 0.12;
  if (e) {
    if (e.full) {
      for (let k = 0; k < e.k; k++) g[k].fill(e.s);
      pre = g.map((reel) => reel.slice());
      for (let k = 0; k < e.k; k++) { const keep = r.int(0, lay.rows - 1); for (let row = 0; row < lay.rows; row++) if (row !== keep) pre[k][row] = -2; }
    } else if (lay.win === "ways") {
      if (!placeWays(c, g, e, r, sh.fs === "wildx", t < 40 ? pw : 0)) return null;
    } else if (!placeLines(c, g, e, r, sh.fs === "wildx", t < 40 ? pw : 0)) return null;
  }
  // Scatters and jackpot symbols go in empty cells: scatters one per reel (a near miss's on the early reels).
  const all = shuffle([...Array(lay.reels).keys()], r);
  const reels = sh.near ? all.filter((q) => q < lay.reels - 1).concat(all.filter((q) => q === lay.reels - 1)) : all;
  let placed = 0;
  for (const reel of reels) {
    if (placed >= sh.scat) break;
    const free = g[reel].map((v, row) => (v === -1 ? row : -1)).filter((q) => q >= 0);
    if (!free.length) continue;
    g[reel][r.pick(free)] = SCATTER;
    placed++;
  }
  if (placed < sh.scat) return null;
  // Bonus symbols, one per reel, like scatters (a near miss's on the early reels).
  if (sh.bonus !== undefined) {
    let nb = 0;
    for (const reel of reels) {
      if (nb >= (sh.bonusN ?? 3)) break;
      const free = g[reel].map((v, row) => (v === -1 ? row : -1)).filter((q) => q >= 0);
      if (!free.length) continue;
      g[reel][r.pick(free)] = sh.bonus;
      nb++;
    }
    if (nb < (sh.bonusN ?? 3)) return null;
  }
  // Hold & spin orbs at their spots.
  for (const at of sh.orbs ?? []) {
    const ri = Math.floor(at / lay.rows), row = at % lay.rows;
    if (g[ri][row] !== -1) return null;
    g[ri][row] = ORB;
  }
  for (let n = 0; n < sh.jp; n++) {
    const free: number[] = [];
    g.forEach((reel, ri) => reel.forEach((v, row) => { if (v === -1 && !(sh.near && ri === lay.reels - 1)) free.push(cell(ri, row)); }));
    if (!free.length) return null;
    const f = r.pick(free);
    g[Math.floor(f / 8)][f % 8] = JACKPOT;
  }
  fillers(c, g, r, e ? e.s : -1, e ? e.k : -1);
  if (pre) for (let k = 0; k < pre.length; k++) for (let row = 0; row < lay.rows; row++) if (pre[k][row] === -2) pre[k][row] = g[k][row] === e!.s ? r.int(4, 8) : g[k][row];
  return { grid: g, pre };
}

/** Ways: per-reel weights whose product is the entry's ways, then symbols (and wilds) placed in each reel. */
function placeWays(c: Compiled, g: Grid, e: Entry, r: Rng, wildx: boolean, pw: number): boolean {
  const lay = c.lay, rows = lay.rows;
  // Options per reel: [weight, s count, wild multipliers].
  const optsFor = (reel: number): [number, number, number[]][] => {
    const out: [number, number, number[]][] = [];
    for (let n = 0; n <= rows; n++) {
      if (!wildx || !wildReel(lay, reel)) { if (n >= 1) out.push([n, n, []]); continue; }
      for (let nw = 0; n + nw <= rows; nw++) {
        if (n + nw === 0) continue;
        for (let n3 = 0; n3 <= nw; n3++) out.push([n + 2 * (nw - n3) + 3 * n3, n, [...Array(nw - n3).fill(2), ...Array(n3).fill(3)]]);
      }
    }
    return out;
  };
  const pick: [number, number, number[]][] = [];
  const dfs = (reel: number, left: number, w1: boolean, w2: boolean, full0: boolean): boolean => {
    if (reel === e.k) return left === 1;
    const opts = shuffle(optsFor(reel).filter(([w]) => left % w === 0), r);
    for (const o of opts) {
      const hasW = o[2].length > 0;
      const nw1 = w1 || (reel === 1 && hasW), nw2 = w2 || (reel === 2 && hasW);
      if (nw1 && nw2 && !full0) continue;
      pick.push(o);
      if (dfs(reel + 1, left / o[0], nw1, nw2, reel === 0 ? o[1] === rows : full0)) return true;
      pick.pop();
    }
    return false;
  };
  if (!dfs(0, e.m, false, false, false)) return false;
  let w1 = false, w2 = false;
  pick.forEach(([, n, wm], reel) => {
    const rowsIdx = c.d.stacks && e.s === 0 ? stackRows(rows, n + wm.length, r) : shuffle([...Array(rows).keys()], r);
    let i = 0;
    for (let j = 0; j < n; j++) g[reel][rowsIdx[i++]] = e.s;
    for (const m of wm) g[reel][rowsIdx[i++]] = m === 3 ? WILD3 : WILD2;
    if (wm.length && reel === 1) w1 = true;
    if (wm.length && reel === 2) w2 = true;
  });
  // Plain wilds standing in for the symbol (never on reel 0, never making reels 1 and 2 both wild unless reel 0 is full).
  if (pw > 0) {
    const full0 = g[0].every((v) => v === e.s);
    for (let reel = 1; reel < e.k; reel++) {
      if (!wildReel(lay, reel) || !r.chance(pw)) continue;
      if ((reel === 1 && w2 && !full0) || (reel === 2 && w1 && !full0)) continue;
      const rowsS = g[reel].map((v, row) => (v === e.s ? row : -1)).filter((q) => q >= 0);
      if (!rowsS.length) continue;
      g[reel][r.pick(rowsS)] = WILD;
      if (reel === 1) w1 = true;
      if (reel === 2) w2 = true;
    }
  }
  return true;
}
function stackRows(rows: number, n: number, r: Rng): number[] {
  const start = r.int(0, rows - n);
  const out = [...Array(n).keys()].map((i) => start + i);
  for (let row = 0; row < rows; row++) if (!out.includes(row)) out.push(row);
  return out;
}

/** Lines: a set of lines for the win, wilds (with multipliers) on eligible positions of a one-line win. */
function placeLines(c: Compiled, g: Grid, e: Entry, r: Rng, wildx: boolean, pw: number): boolean {
  const lay = c.lay;
  if (e.s === WILD) {
    const ln = r.pick(lay.lines);
    for (let k = 0; k < 3; k++) g[k][ln[k]] = WILD;
    return true;
  }
  const pats = linePatterns(lay, e.k, e.m);
  if (!pats.length) return false;
  const set = r.pick(pats);
  for (const li of set) for (let k = 0; k < e.k; k++) g[k][lay.lines[li][k]] = e.s;
  const ln = lay.lines[set[0]];
  const elig = [...Array(e.k).keys()].filter((k) => (lay.reels === 3 ? true : k >= 1 && wildReel(lay, k)));
  if (e.w > 1) {
    // Factor the multiplier into wilds: ×2s and ×3s (3-reel games: the design's one multiplier).
    let w = e.w, twos = 0, threes = 0;
    while (w % 3 === 0) { w /= 3; threes++; }
    while (w % 2 === 0) { w /= 2; twos++; }
    const mults = [...Array(twos).fill(2), ...Array(threes).fill(3)];
    if (lay.reels === 3 && !wildx) { const M = c.d.wild === "x3" ? 3 : 2; mults.length = 0; let q = e.w; while (q > 1) { mults.push(M); q /= M; } }
    const spots = shuffle(elig.slice(), r);
    // Five-reel lines: never both reels 1 and 2.
    const pickSpots: number[] = [];
    for (const k of spots) {
      if (pickSpots.length >= mults.length) break;
      if (lay.reels > 3 && ((k === 1 && pickSpots.includes(2)) || (k === 2 && pickSpots.includes(1)))) continue;
      pickSpots.push(k);
    }
    if (pickSpots.length < mults.length || mults.length >= e.k) return false;
    pickSpots.forEach((k, i) => { g[k][ln[k]] = mults[i] === 3 ? WILD3 : WILD2; });
  } else if (pw > 0 && e.m === 1 && r.chance(pw)) {
    const k = r.pick(elig.filter((q) => q < e.k - 0));
    if (k !== undefined && (lay.reels === 3 || k >= 1)) g[k][ln[k]] = WILD;
  }
  return true;
}

/**
 * Fills the empty cells with paying symbols (never the winning symbol on reels up to and including the end of its
 * run) so no other symbol wins. Ways: reel 0 and reel 1 share no symbol (and reel 2 none with reel 0 when reel 1
 * shows a wild). Lines: no line's first three cells match.
 */
function fillers(c: Compiled, g: Grid, r: Rng, s: number, k: number) {
  const lay = c.lay;
  const pool = (reel: number) => [...Array(PAYING).keys()].filter((q) => !(q === s && reel <= k));
  if (lay.win === "ways") {
    const used0 = new Set<number>(g[0].filter((v) => v >= 0 && v < PAYING));
    const hasW1 = g[1].some(isWild);
    for (let reel = 0; reel < lay.reels; reel++) {
      let opts = pool(reel);
      if (reel === 1 || (reel === 2 && hasW1)) opts = opts.filter((q) => !used0.has(q));
      if (reel >= 1 && reel <= 2 && !opts.length) opts = pool(reel);
      for (let row = 0; row < lay.rows; row++) {
        if (g[reel][row] !== -1) continue;
        const v = r.pick(opts);
        g[reel][row] = v;
        if (reel === 0) used0.add(v);
      }
      // After reel 0 is set, reel 1's options must avoid all of reel 0's fillers.
    }
    return;
  }
  // Lines: reel by reel, avoiding any line whose first three cells would match.
  const matches = (a: number, b: number, d: number) => {
    const xs = [a, b, d].filter((v) => !isWild(v));
    if (xs.some((v) => v >= PAYING || v < 0)) return false;
    if (!xs.length) return true;
    return xs.every((v) => v === xs[0]);
  };
  for (let reel = 0; reel < lay.reels; reel++) {
    for (let row = 0; row < lay.rows; row++) {
      if (g[reel][row] !== -1) continue;
      const opts = shuffle(pool(reel), r);
      let chosen = opts[0];
      for (const v of opts) {
        g[reel][row] = v;
        let bad = false;
        if (reel <= 2) for (const ln of lay.lines) {
          if (ln[reel] !== row) continue;
          const a = g[0][ln[0]], b = g[1][ln[1]], d = g[2][ln[2]];
          if (a === -1 || b === -1 || d === -1) continue;
          // The win's own lines are meant to match.
          if (s >= 0 && a !== -1 && [a, b, d].every((q) => q === s || isWild(q))) continue;
          if (matches(a, b, d)) { bad = true; break; }
        }
        if (!bad) { chosen = v; break; }
      }
      g[reel][row] = chosen;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Classic reels: the drawn line, with symbols above and below it (a near miss puts the top symbol just off it).

const OFF_W = [0.3, 0.6, 1.2, 1.6, 2.2, 1, 6];
function classicSym(r: Rng, noWild: boolean): number {
  const w = OFF_W.map((v, i) => (noWild && i === C_WILD ? 0 : v));
  let u = r.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { if (u < w[i]) return i; u -= w[i]; }
  return C_BLANK;
}
function classicGrid(c: Compiled, sh: Show, r: Rng): Grid {
  const noWild = c.d.wild === "none";
  const g: Grid = [0, 1, 2].map(() => [classicSym(r, noWild), 0, classicSym(r, noWild)]);
  if (sh.jp) { for (let k = 0; k < 3; k++) g[k][1] = C_JP; return g; }
  if (sh.e) {
    const code = sh.e.s;
    g[0][1] = Math.floor(code / 49); g[1][1] = Math.floor(code / 7) % 7; g[2][1] = code % 7;
    return g;
  }
  const wm = c.d.wild === "x3" ? 3 : c.d.wild === "x2" ? 2 : 1;
  if (sh.near) {
    const top = noWild ? 1 : r.chance(0.6) ? C_WILD : 1;
    g[0][1] = top; g[1][1] = top; g[2][1] = C_BLANK;
    g[2][r.chance(0.5) ? 0 : 2] = top;
    return g;
  }
  for (;;) {
    const line = [classicSym(r, noWild), classicSym(r, noWild), classicSym(r, noWild)];
    if (classicPay(line[0], line[1], line[2], wm, c.top, !noWild) > 0) continue;
    // Not a near miss by accident.
    if (line[0] === line[1] && (line[0] === C_WILD || line[0] === 1)) continue;
    for (let k = 0; k < 3; k++) g[k][1] = line[k];
    return g;
  }
}
