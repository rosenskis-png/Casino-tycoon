// A slot machine you play (docs/spec/designer.md §9): built from a design, meant to look and feel like a modern Vegas
// video slot or a mechanical stepper. It shows a spin the sim has already settled, as a run of steps: the reels stop
// left to right (longer when a feature is one symbol away), wins light up and count up, cascades drop, features play
// out (free games, hold & spin, pick, wheel, offer), meters and the collector fill, jackpots ring. A tap stops only the
// step on screen (M8.5: stopping the reels never skips the win; a feature plays on); Skip ends a feature. Nothing
// shows a result before its step: credit, meters and the collector hold until then. The same machine is the
// designer's live preview. UI only; the math is sim/design.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BODY_COLORS, BONUS_OFFER, BONUS_PICK, BONUS_WHEEL, FONTS, FS_COUNTS, FS_ENH, JACKPOT, LIGHT_COLORS, ORB, ROLLUPS, SCATTER,
  SLOT_THEMES, SPEEDS, defaultLook, levelColor, levelName,
} from "../../data/designer";
import { play } from "../../platform/audio";
import type { Compiled } from "../../sim/design/compile";
import { evaluate, countOf, type Grid, type Win } from "../../sim/design/grid";
import { TIERS, type FreeRec, type Outcome } from "../../sim/design/spin";
import { Sym, symbolOf } from "./symbols";
import { Help } from "./Help";
import "./slot.css";

export interface MachineProps {
  c: Compiled;
  /** Dollars on the credit meter before the next spin, and the bet per spin. */
  credit: number;
  bet: number;
  onBet(dir: -1 | 1 | "max"): void;
  /** Take a spin now: the settled outcome to show (now, or when the sim gets to it), or null when refused. */
  spin(): Outcome | null | Promise<Outcome | null>;
  onBusy?(busy: boolean): void;
  /** Designer preview: a smaller machine. */
  compact?: boolean;
  /** Bumped by the parent to spin (the designer's forced outcomes). */
  kick?: number;
  /** (M8.5) Live meters in dollars per jackpot level (progressives), and the collector's progress. */
  meters?: number[];
  col?: number;
  /** (M8.5) An offer answered: take it or leave it; `pay` (× bet) once it's settled. */
  onOffer?(act: "take" | "leave", pay: number | null): void;
}

interface Orb2 { x: number; lv: number; fresh?: boolean }
interface View {
  grid: Grid;
  pre?: Grid;
  stopped: boolean[];
  antic: boolean[];
  wins: Win[];
  cycle: number;
  msg: string;
  banner: { kind: string; title: string; sub?: string; big?: boolean } | null;
  fs: { n: number; of: number; total: number; mult: number; sym: number; x3?: boolean } | null;
  /** The win meter (this spin so far). */
  win: number;
  shower: number;
  /** (M8.5) Which screen is up, and each feature's own state. */
  mode: "reels" | "hns" | "pick" | "wheel" | "offer";
  hns?: { orbs: Record<number, Orb2>; left: number; spinning: boolean; spots: number };
  pick?: { tiles: ({ x: number; lv: number } | null)[]; mode: "collect" | "match"; level: number };
  wheel?: { segs: { x: number; lv: number }[]; turn: number; spinning: boolean; at: number };
  offer?: { vals: number[]; k: number; state: "ask" | "took" | "final" };
  col: number;
  drop: boolean;
  storm: boolean;
  mark: string;
}
/** One step of a spin's presentation: `run` schedules it (compressed after a tap) and returns its length in ms; `end` jumps to its last frame. */
interface Phase { run(quick: boolean): number; end?(): void; feat?: boolean; wait?: boolean }

const fmt = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const denomLabel = (d: number) => (d < 1 ? `${Math.round(d * 100)}¢` : `$${d}`);
/** Real machines hand-pay jackpots of $1,200 and up (the tax form threshold). */
const HANDPAY = 1200;
const TRIGGERS = [SCATTER, BONUS_PICK, BONUS_WHEEL, BONUS_OFFER];

/** A believable starting screen: a losing layout from the design's symbols. */
function idleGrid(c: Compiled): Grid {
  const { reels, rows } = c.lay;
  if (c.lay.win === "classic") return [[6, 1, 6], [6, 0, 6], [6, 1, 6]].map((r) => r.slice());
  return Array.from({ length: reels }, (_, r) => Array.from({ length: rows }, (_, k) => (r * 3 + k * 5 + (r % 2)) % 9));
}
const blankView = (c: Compiled, col: number): View => ({
  grid: idleGrid(c), stopped: Array(c.lay.reels).fill(true), antic: Array(c.lay.reels).fill(false), wins: [], cycle: -1, msg: "", banner: null, fs: null,
  win: 0, shower: 0, mode: "reels", col, drop: false, storm: false, mark: "",
});

export function Machine(p: MachineProps) {
  const { c } = p, d = c.d, lay = c.lay, th = SLOT_THEMES[d.theme], look = d.look ?? defaultLook();
  const classic = lay.win === "classic";
  const rows = classic ? 3 : lay.rows;
  const [view, setView] = useState<View>(() => blankView(c, p.col ?? 0));
  const [busy, setBusyState] = useState(false);
  const [help, setHelp] = useState(false);
  const [auto, setAutoState] = useState(0);
  const autoRef = useRef(0);
  const setAuto = (f: number | ((a: number) => number)) => setAutoState((a) => (autoRef.current = typeof f === "function" ? f(a) : f));
  const timers = useRef<number[]>([]);
  const busyRef = useRef(false);
  const phases = useRef<Phase[]>([]);
  const pi = useRef(-1);
  const outRef = useRef<Outcome | null>(null);
  /** The credit meter after the bet, the win meter so far, the meters as they stood when the spin started. */
  const credit0 = useRef(0);
  const winRef = useRef(0);
  const frozen = useRef<number[] | undefined>(undefined);
  const setBusy = (b: boolean) => { busyRef.current = b; setBusyState(b); p.onBusy?.(b); };
  const at = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
  const clearAll = () => { for (const t of timers.current) clearTimeout(t); timers.current = []; };
  useEffect(() => () => clearAll(), []);
  // A new design (the designer): a fresh screen in its layout.
  const layoutKey = `${d.layout}:${d.theme}:${d.set}`;
  useEffect(() => {
    clearAll();
    phases.current = [];
    setBusy(false);
    setView(blankView(c, p.col ?? 0));
  }, [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const speed = d.show.speed, base = [720, 560, 430][speed], gap = [260, 190, 140][speed];
  const rollS = ROLLUPS[d.show.rollup]?.s ?? 1.2;
  const hnsStart = c.hns?.start ?? 99;

  /** Stop times per reel for a screen, with anticipation (longer, glowing) once a trigger is one symbol away. */
  function schedule(grid: Grid, fast: boolean): { t: number[]; antic: boolean[] } {
    const t: number[] = [], an: boolean[] = [];
    let at0 = fast ? 380 : base, seen = 0, orbs = 0;
    for (let r = 0; r < lay.reels; r++) {
      const a = d.show.antic && !classic && r >= 2 && (seen >= 2 || (c.hns && orbs >= hnsStart - 2));
      if (a) at0 += 900;
      an.push(!!a);
      t.push(at0);
      at0 += fast ? 110 : gap;
      seen += grid[r].filter((v) => TRIGGERS.includes(v) || (v === JACKPOT && !c.q)).length;
      orbs += grid[r].filter((v) => v === ORB).length;
    }
    return { t, antic: an };
  }

  /** Counts the win meter to `to` over `secs` from `startAt` ms; returns when it's done. */
  function rollup(to: number, secs: number, startAt: number) {
    const from = winRef.current;
    winRef.current = to;
    const steps = Math.max(1, Math.min(40, Math.round(secs * 20)));
    for (let k = 1; k <= steps; k++) {
      at(startAt + (secs * 1000 * k) / steps, () => {
        setView((v) => ({ ...v, win: from + ((to - from) * k) / steps }));
        if (k % 2 === 0) play("coin");
      });
    }
    return startAt + secs * 1000;
  }
  const setWin = (to: number) => { winRef.current = to; setView((v) => ({ ...v, win: to })); };
  const rollSecs = (x: number, quick: boolean) => (quick ? 0.3 : rollS * (1 + Math.log2(1 + x) / 3));

  // ---- The step runner.
  function go(i: number, quick = false) {
    clearAll();
    pi.current = i;
    const ph = phases.current[i];
    if (!ph) { done(); return; }
    const dur = ph.run(quick);
    if (!ph.wait) at(Math.max(0, dur), () => go(i + 1));
  }
  /** A tap: the step on screen jumps to its end; the next one plays (quickly). A waiting step (an offer) stays. */
  function slam() {
    const ph = phases.current[pi.current];
    if (!ph || ph.wait) return;
    clearAll();
    ph.end?.();
    go(pi.current + 1, true);
  }
  /** Skip: every step of the feature jumps to its end; its total then counts up. */
  function skipFeature() {
    let i = pi.current;
    clearAll();
    while (phases.current[i]?.feat && !phases.current[i]?.wait) { phases.current[i].end?.(); i++; }
    go(i, true);
  }
  function done() {
    const out = outRef.current;
    phases.current = [];
    pi.current = -1;
    setBusy(false);
    setView((v) => ({ ...v, banner: v.banner?.kind === "tier" || v.banner?.kind === "small" ? null : v.banner }));
    if (autoRef.current > 0) {
      const stop = !out || out.kind !== "win" && out.kind !== "loss" || out.level >= 0 || !!out.mhb || !!out.col?.full;
      if (stop) setAuto(0);
      else window.setTimeout(() => setAuto((a) => a - 1), 350);
    }
  }

  // ---- Steps.
  function reelsStep(grid: Grid, pre: Grid | undefined, lead: number, fast = false, onStop?: (r: number) => void): Phase {
    const fin = () => setView((v) => ({ ...v, grid, pre: undefined, stopped: Array(lay.reels).fill(true), antic: Array(lay.reels).fill(false) }));
    return {
      run(quick) {
        const sch = schedule(grid, fast || quick);
        const t = sch.t.map((q) => Math.max(quick ? 60 : 120, q - lead));
        setView((v) => ({ ...v, grid: pre ?? grid, pre, stopped: v.stopped.every((s) => !s) ? v.stopped : Array(lay.reels).fill(false), wins: [], cycle: -1 }));
        t.forEach((tt, r) => {
          if (sch.antic[r] && !quick) at(tt - 900, () => { setView((v) => ({ ...v, antic: v.antic.map((a, i) => a || i === r) })); play("antic"); });
          at(tt, () => {
            setView((v) => ({ ...v, stopped: v.stopped.map((s, i) => s || i === r), antic: v.antic.map((a, i) => (i === r ? false : a)) }));
            play("reelstop");
            if (grid[r].some((q) => TRIGGERS.includes(q) || q === ORB)) play("scatter");
            onStop?.(r);
          });
        });
        const end = t[t.length - 1] + 150;
        at(end, fin);
        return end;
      },
      end: fin,
    };
  }
  /** A screen's wins lit and counted onto the win meter (`add` × bet more), with tier banners. */
  function winStep(grid: Grid, add: number, bet: number, opts: { mult?: number; label?: string; feat?: boolean } = {}): Phase {
    const ev = evaluate(c, grid);
    const ldw = add < 1 && !opts.feat, quiet = ldw && d.show.ldw === 0;
    const target = () => winRef.current + add * bet;
    let to = 0;
    const fin = () => { setWin(to); setView((v) => ({ ...v, wins: quiet ? [] : ev.wins, banner: v.banner?.kind === "tier" ? null : v.banner })); };
    return {
      feat: opts.feat,
      run(quick) {
        to = target();
        if (add <= 0) { return 0; }
        setView((v) => ({ ...v, wins: quiet ? [] : ev.wins, cycle: -1, msg: opts.label ?? (quiet ? "" : ldw ? (d.show.ldw === 2 ? "WINNER!" : "") : "THAT'S A WINNER!") }));
        if (!quiet) play(ldw ? (d.show.ldw === 2 ? "win" : "chips") : add >= TIERS.mega ? "tierMega" : add >= TIERS.big ? "bigwin" : "win");
        if (add >= TIERS.big && !opts.feat) setView((v) => ({ ...v, banner: { kind: "tier", title: add >= TIERS.epic ? "EPIC WIN" : add >= TIERS.mega ? "MEGA WIN" : "BIG WIN", sub: fmt(add * bet), big: true }, shower: v.shower + 1 }));
        const secs = ldw ? 0.4 : rollSecs(add, quick);
        const end = rollup(to, secs, 150) + (add >= TIERS.big && !quick ? 900 : 250);
        at(end - 10, fin);
        return end;
      },
      end: () => { to = to || target(); fin(); },
    };
  }
  const banner = (kind: string, title: string, sub?: string, big = true) => setView((v) => ({ ...v, banner: { kind, title, sub, big } }));
  /** A banner that stays up for `ms` (a feature intro, a jackpot) while the win meter counts up by `add` × bet. */
  function awardStep(kind: string, title: string, add: number, bet: number, ms: number, sound: string, opts: { feat?: boolean; sub?: string } = {}): Phase {
    let to = 0;
    const fin = () => { setWin(to); };
    return {
      feat: opts.feat,
      run(quick) {
        to = winRef.current + add * bet;
        banner(kind, title, opts.sub ?? (add > 0 ? fmt(add * bet) : undefined));
        play(sound);
        if (add >= TIERS.big) setView((v) => ({ ...v, shower: v.shower + 1 }));
        const end = add > 0 ? rollup(to, quick ? 0.4 : Math.min(3, 0.8 + Math.log2(1 + add) / 3), 300) + (quick ? 300 : 700) : quick ? 500 : ms;
        at(end, fin);
        return Math.max(end, quick ? 500 : ms);
      },
      end: fin,
    };
  }
  const clearBanner: Phase = { run: () => { setView((v) => ({ ...v, banner: null })); return 0; } };

  /** Free games: the spins, each its own step; `x3` for a collector's super free games. */
  function freeSteps(fsx: FreeRec, bet: number, n0: number, x3: boolean): Phase[] {
    const out: Phase[] = [];
    let of = n0;
    out.push({ feat: true, run: () => { setView((v) => ({ ...v, banner: null, wins: [], fs: { n: 0, of: n0, total: winRef.current, mult: x3 ? 3 : 1, sym: fsx.sym, x3 } })); return 300; } });
    fsx.spins.forEach((s, k) => {
      const grid0 = s.pre ?? s.grid, ofNow = of + (s.retrig ? c.spins[s.retrig - 3] ?? 0 : 0);
      const n = k + 1, ofShown = of;
      out.push({
        feat: true,
        run(quick) {
          setView((v) => ({ ...v, grid: grid0, stopped: Array(lay.reels).fill(false), wins: [], cycle: -1, antic: Array(lay.reels).fill(false), msg: `FREE GAME ${n} OF ${ofShown}`, fs: v.fs && { ...v.fs, n, of: ofShown, mult: s.mult * (x3 ? 3 : 1) } }));
          play("fsSpin");
          const sch = schedule(s.grid, true);
          sch.t.forEach((tt, r) => at(quick ? 60 + r * 40 : tt, () => { setView((v) => ({ ...v, stopped: v.stopped.map((q, i) => q || i === r) })); play("reelstop"); }));
          let t = (quick ? 60 + lay.reels * 40 : sch.t[sch.t.length - 1]) + 150;
          if (s.pre) { at(t, () => { setView((v) => ({ ...v, grid: s.grid })); play("expand"); }); t += quick ? 200 : 500; }
          return t;
        },
        end: () => setView((v) => ({ ...v, grid: s.grid, stopped: Array(lay.reels).fill(true) })),
      });
      if (s.retrig) {
        const add = c.spins[s.retrig - 3] ?? 0;
        of += add;
        const ofAfter = of;
        out.push({
          feat: true,
          run: (quick) => { setView((v) => ({ ...v, wins: [{ s: SCATTER, k: s.retrig, pay: 0, cells: cellsOf(s.grid, SCATTER) }], banner: { kind: "fs", title: `+${add} FREE GAMES`, big: true }, fs: v.fs && { ...v.fs, of: ofAfter } })); play("fsStart"); return quick ? 500 : 1500; },
          end: () => setView((v) => ({ ...v, fs: v.fs && { ...v.fs, of: ofAfter } })),
        }, { ...clearBanner, feat: true });
      }
      if (s.x > 0 && !s.retrig) {
        const w = winStep(s.grid, s.x * (x3 ? 3 : 1), bet, { feat: true, label: s.mult > 1 || x3 ? `WIN ×${s.mult * (x3 ? 3 : 1)}` : undefined });
        out.push({ ...w, run: (q) => { const t = w.run(q); at(t, () => setView((v) => ({ ...v, fs: v.fs && { ...v.fs, total: winRef.current } }))); return t; }, end: () => { w.end?.(); setView((v) => ({ ...v, fs: v.fs && { ...v.fs, total: winRef.current } })); } });
      } else if (s.retrig && s.x > 0) {
        out.push({ feat: true, run: () => { setWin(winRef.current + s.x * bet); setView((v) => ({ ...v, fs: v.fs && { ...v.fs, total: winRef.current } })); return 0; } });
      }
      void ofNow;
    });
    return out;
  }
  /** The feature's total, counted up from what's shown (the reveal: never shown before the feature has played). */
  function outroStep(total: number, bet: number): Phase {
    return {
      run(quick) {
        const shownBefore = winRef.current;
        banner("outro", "FEATURE WIN", fmt(shownBefore));
        const to = Math.max(shownBefore, total * bet + credit0Win.current);
        const steps = 20, secs = quick ? 0.6 : 1.4;
        for (let k = 1; k <= steps; k++) at((secs * 1000 * k) / steps, () => setView((v) => ({ ...v, banner: v.banner && { ...v.banner, sub: fmt(shownBefore + ((to - shownBefore) * k) / steps) } })));
        winRef.current = to;
        rollupTo(shownBefore, to, secs);
        play(total >= TIERS.mega ? "tierMega" : "bigwin");
        if (total >= TIERS.big) setView((v) => ({ ...v, shower: v.shower + 1 }));
        const end = secs * 1000 + (quick ? 700 : 1600);
        at(end, () => setView((v) => ({ ...v, fs: null, banner: null, msg: "", mode: "reels", hns: undefined, pick: undefined, wheel: undefined, offer: undefined })));
        return end;
      },
    };
  }
  /** The win meter before a feature started (its outro counts the feature on top). */
  const credit0Win = useRef(0);
  function rollupTo(from: number, to: number, secs: number) {
    const steps = Math.max(1, Math.round(secs * 20));
    for (let k = 1; k <= steps; k++) at((secs * 1000 * k) / steps, () => setView((v) => ({ ...v, win: from + ((to - from) * k) / steps })));
  }

  /** Hold & spin: orbs lock; empty spots respin; any new orb resets the respins to three. */
  function hnsSteps(out: Outcome, bet: number): Phase[] {
    const h = out.hns!, P: Phase[] = [];
    const orbs: Record<number, Orb2> = {};
    for (const o of h.start) orbs[o.at] = { x: o.x, lv: o.lv };
    P.push({
      feat: true,
      run(quick) {
        setView((v) => ({ ...v, wins: [{ s: ORB, k: h.start.length, pay: 0, cells: cellsOf(out.grid, ORB) }], msg: "HOLD & SPIN!" }));
        play(d.show.call);
        at(quick ? 300 : 1000, () => { banner("hns", "HOLD & SPIN", `${h.start.length} ORBS · ${3} RESPINS`); play("fsStart"); });
        at(quick ? 900 : 2600, () => setView((v) => ({ ...v, banner: null, wins: [], mode: "hns", hns: { orbs: { ...orbs }, left: 3, spinning: false, spots: h.spots } })));
        return quick ? 1000 : 2800;
      },
      end: () => setView((v) => ({ ...v, banner: null, wins: [], mode: "hns", hns: { orbs: { ...orbs }, left: 3, spinning: false, spots: h.spots } })),
    });
    let left = 3;
    h.steps.forEach((got) => {
      const before = { ...orbs };
      for (const o of got) orbs[o.at] = { x: o.x, lv: o.lv };
      left = got.length ? 3 : left - 1;
      const after = { ...orbs }, leftNow = left;
      const fin = () => setView((v) => ({ ...v, hns: v.hns && { ...v.hns, orbs: Object.fromEntries(Object.entries(after).map(([k, o]) => [k, { ...o, fresh: false }])), left: leftNow, spinning: false }, msg: `${leftNow} RESPIN${leftNow === 1 ? "" : "S"} LEFT` }));
      P.push({
        feat: true,
        run(quick) {
          setView((v) => ({ ...v, hns: v.hns && { ...v.hns, orbs: before, spinning: true }, msg: "" }));
          play("respin");
          const t0 = quick ? 150 : 700;
          got.forEach((o, k) => at(t0 + k * (quick ? 40 : 160), () => { setView((v) => ({ ...v, hns: v.hns && { ...v.hns, orbs: { ...v.hns.orbs, [o.at]: { x: o.x, lv: o.lv, fresh: true } } } })); play("orb"); }));
          const t = t0 + got.length * (quick ? 40 : 160) + (quick ? 150 : 450);
          at(t, fin);
          return t;
        },
        end: fin,
      });
    });
    // Collect: every orb's credits, then the jackpot (the top level fills the screen).
    P.push({
      feat: true,
      run(quick) {
        const full = Object.keys(orbs).length >= h.spots;
        setView((v) => ({ ...v, msg: full ? "FULL SCREEN!" : "COLLECT", hns: v.hns && { ...v.hns, left: 0 } }));
        const to = winRef.current + h.credits * bet;
        const end = rollup(to, quick ? 0.4 : Math.min(3, 0.6 + Math.log2(1 + h.credits) / 3), 200) + 300;
        return end;
      },
      end: () => setWin(winRef.current),
    });
    if (h.level >= 0) {
      const name = levelName(c.levels.length, h.level, classic);
      P.push(awardStep("jp", `${name}!`, out.x - h.credits, bet, 2400, "jackpot", { feat: true }));
    }
    return P;
  }

  /** Pick: tiles turn over; until "collect", or until three of a jackpot match. */
  function pickSteps(out: Outcome, bet: number): Phase[] {
    const pk = out.pick!, P: Phase[] = [];
    const order = tileOrder(pk.board, pk.reveals.length);
    P.push({
      feat: true,
      run(quick) {
        setView((v) => ({ ...v, wins: [{ s: BONUS_PICK, k: 3, pay: 0, cells: cellsOf(out.grid, BONUS_PICK) }], msg: "BONUS!" }));
        play(d.show.call);
        at(quick ? 300 : 900, () => { banner("pick", pk.mode === "match" ? "PICK TO MATCH" : "PICK A PRIZE", pk.mode === "match" ? "MATCH 3 TO WIN" : "UNTIL COLLECT"); play("fsStart"); });
        at(quick ? 900 : 2400, () => setView((v) => ({ ...v, banner: null, wins: [], mode: "pick", pick: { tiles: Array(pk.board).fill(null), mode: pk.mode, level: pk.level } })));
        return quick ? 1000 : 2600;
      },
      end: () => setView((v) => ({ ...v, banner: null, wins: [], mode: "pick", pick: { tiles: Array(pk.board).fill(null), mode: pk.mode, level: pk.level } })),
    });
    let sum = 0;
    const tiles: ({ x: number; lv: number } | null)[] = Array(pk.board).fill(null);
    pk.reveals.forEach((rv, k) => {
      tiles[order[k]] = rv;
      sum += rv.x;
      const snap = tiles.slice(), total = sum;
      const fin = () => setView((v) => ({ ...v, pick: v.pick && { ...v.pick, tiles: snap }, msg: pk.mode === "collect" ? (rv.lv === -2 ? "COLLECT!" : `+${fmt(rv.x * bet)}`) : v.msg }));
      P.push({
        feat: true,
        run(quick) {
          at(quick ? 80 : 650, () => { fin(); play(rv.lv === -2 ? "wheelStop" : "pick"); if (pk.mode === "collect") setWin(credit0Win.current + total * bet); });
          return quick ? 120 : 750;
        },
        end: () => { fin(); if (pk.mode === "collect") setWin(credit0Win.current + total * bet); },
      });
    });
    if (pk.mode === "match" && pk.level >= 0) P.push(awardStep("jp", `${levelName(c.levels.length, pk.level, classic)}!`, out.x, bet, 2400, "jackpot", { feat: true }));
    else if (pk.mode === "match") P.push(awardStep("small", "NO MATCH", 0, bet, 1400, "deny", { feat: true, sub: "Jackpots need a bigger bet" }));
    return P;
  }
  /** The pick board's tile order (UI only; the prize was settled when the feature started). */
  function tileOrder(n: number, k: number): number[] {
    const a = [...Array(n).keys()];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, k);
  }

  /** The wheel: it spins and lands on the segment the math drew. */
  function wheelSteps(out: Outcome, bet: number): Phase[] {
    const w = out.wheel!, P: Phase[] = [];
    const n = w.segs.length, seg = 360 / n;
    const turn = 360 * 6 + (360 - (w.at * seg + seg / 2));
    P.push({
      feat: true,
      run(quick) {
        setView((v) => ({ ...v, wins: [{ s: BONUS_WHEEL, k: 3, pay: 0, cells: cellsOf(out.grid, BONUS_WHEEL) }], msg: "SPIN THE WHEEL!" }));
        play(d.show.call);
        at(quick ? 300 : 1100, () => setView((v) => ({ ...v, wins: [], mode: "wheel", wheel: { segs: w.segs, turn: 0, spinning: false, at: w.at } })));
        return quick ? 400 : 1400;
      },
      end: () => setView((v) => ({ ...v, wins: [], mode: "wheel", wheel: { segs: w.segs, turn: 0, spinning: false, at: w.at } })),
    });
    const fin = () => setView((v) => ({ ...v, wheel: v.wheel && { ...v.wheel, turn, spinning: false } }));
    P.push({
      feat: true,
      run(quick) {
        const ms = quick ? 900 : 4800;
        at(30, () => setView((v) => ({ ...v, wheel: v.wheel && { ...v.wheel, turn, spinning: true } })));
        for (let k = 0; k < 28 && !quick; k++) at(ms * (1 - Math.pow(1 - k / 28, 0.5)), () => play("wheelTick"));
        at(ms, () => { fin(); play("wheelStop"); });
        return ms + 300;
      },
      end: fin,
    });
    const lv = w.level;
    P.push(lv >= 0 ? awardStep("jp", `${levelName(c.levels.length, lv, classic)}!`, out.x, bet, 2400, "jackpot", { feat: true })
      : awardStep("fs", "WHEEL WIN", out.x, bet, 1800, "bigwin", { feat: true }));
    return P;
  }

  /** The offer: take it or leave it, one at a time (the player's choice; every offer is fair). */
  const offerRef = useRef<{ vals: number[]; bet: number } | null>(null);
  function offerSteps(out: Outcome, bet: number): Phase[] {
    const vals = out.offer!;
    offerRef.current = { vals, bet };
    return [{
      run(quick) {
        setView((v) => ({ ...v, wins: [{ s: BONUS_OFFER, k: 3, pay: 0, cells: cellsOf(out.grid, BONUS_OFFER) }], msg: "BONUS!" }));
        play(d.show.call);
        at(quick ? 300 : 1000, () => { setView((v) => ({ ...v, wins: [], mode: "offer", offer: { vals, k: 0, state: "ask" } })); play("offer"); });
        return quick ? 400 : 1200;
      },
      end: () => setView((v) => ({ ...v, wins: [], mode: "offer", offer: { vals, k: 0, state: "ask" } })),
    }, { wait: true, run: () => { setAuto(0); return 0; } }];
  }
  function answerOffer(act: "take" | "leave") {
    const o = view.offer, info = offerRef.current;
    if (!o || o.state !== "ask" || !info) return;
    play("click");
    const last = o.k >= info.vals.length - 2;
    if (act === "leave" && !last) {
      p.onOffer?.("leave", null);
      setView((v) => ({ ...v, offer: v.offer && { ...v.offer, k: v.offer.k + 1 } }));
      play("offer");
      return;
    }
    const k = act === "take" ? o.k : info.vals.length - 1, pay = info.vals[k];
    p.onOffer?.(act, pay);
    setView((v) => ({ ...v, offer: v.offer && { ...v.offer, k, state: act === "take" ? "took" : "final" } }));
    // The award, then on with the spin.
    clearAll();
    const to = winRef.current + pay * info.bet;
    const end = rollup(to, 1.2, 400) + 1400;
    banner("fs", act === "take" ? "DEAL!" : "YOUR PRIZE", fmt(pay * info.bet));
    play(pay >= TIERS.big ? "bigwin" : "win");
    at(end, () => { setView((v) => ({ ...v, banner: null, mode: "reels", offer: undefined })); go(pi.current + 1); });
  }

  /** Builds and starts the steps for a settled spin. */
  function run(out: Outcome, bet: number, elapsed: number) {
    clearAll();
    outRef.current = out;
    winRef.current = 0;
    credit0Win.current = 0;
    const P: Phase[] = [];
    const lead = Math.max(0, elapsed - 150);
    P.push(reelsStep(out.grid, out.pre, lead, false));
    if (out.storm) P.unshift({ run: () => { setView((v) => ({ ...v, msg: "WILD STORM!", storm: true })); play("mystery"); return 0; } });
    switch (out.kind) {
      case "win": {
        P.push(winStep(out.grid, out.e?.x ?? 0, bet));
        for (const q of out.casc ?? []) {
          P.push({
            run(quick) {
              setView((v) => ({ ...v, drop: true }));
              play("cascade");
              at(quick ? 120 : 380, () => setView((v) => ({ ...v, drop: false, grid: q.grid, wins: [], stopped: Array(lay.reels).fill(false) })));
              at(quick ? 200 : 620, () => setView((v) => ({ ...v, stopped: Array(lay.reels).fill(true) })));
              return quick ? 240 : 760;
            },
            end: () => setView((v) => ({ ...v, drop: false, grid: q.grid, stopped: Array(lay.reels).fill(true) })),
          });
          P.push(winStep(q.grid, q.x, bet, { label: q.m > 1 ? `CASCADE ×${q.m}` : "CASCADE!" }));
        }
        if (out.mm) {
          const add = out.x - (out.e?.x ?? 0) - (out.casc ?? []).reduce((a, q) => a + q.x, 0);
          P.push(awardStep("fs", `MYSTERY ×${out.mm}!`, add, bet, 1800, "mystery"));
          P.push(clearBanner);
        }
        break;
      }
      case "jackpot": {
        const name = levelName(c.levels.length, out.level, classic);
        P.push(awardStep("jp", out.myst ? `MYSTERY ${name}!` : `${name}${classic ? "" : " JACKPOT"}`, out.x, bet, 2600, "jackpot"));
        break;
      }
      case "fs": {
        const fsx = out.fs!, n0 = c.spins[out.scat - 3] ?? fsx.spins.length, enh = FS_ENH[d.fs?.enh ?? "none"];
        P.push({
          feat: true,
          run(quick) {
            setView((v) => ({ ...v, msg: "BONUS!", wins: [{ s: SCATTER, k: out.scat, pay: out.scatPay, cells: cellsOf(out.grid, SCATTER) }] }));
            play(d.show.call);
            at(quick ? 200 : 900, () => { banner("fs", `${n0} FREE GAMES`, enh.id === "none" ? "" : enh.name.toUpperCase()); play("fsStart"); });
            return quick ? 400 : 1300;
          },
          end: () => banner("fs", `${n0} FREE GAMES`, enh.id === "none" ? "" : enh.name.toUpperCase()),
        });
        P.push({ ...awardStep("fs", `${n0} FREE GAMES`, out.scatPay, bet, 1400, "coin", { feat: true, sub: enh.id === "none" ? "" : enh.name.toUpperCase() }) });
        if (fsx.sym >= 0) P.push({ feat: true, run: (q) => { banner("expand", "EXPANDING SYMBOL", symbolOf(d, fsx.sym), false); return q ? 400 : 1600; } });
        P.push(...freeSteps(fsx, bet, n0, false));
        P.push(outroStep(out.x, bet));
        break;
      }
      case "hns": P.push(...hnsSteps(out, bet), outroStep(out.x, bet)); break;
      case "pick": P.push(...pickSteps(out, bet), outroStep(out.x, bet)); break;
      case "wheel": P.push(...wheelSteps(out, bet), outroStep(out.x, bet)); break;
      case "offer": P.push(...offerSteps(out, bet)); break;
      case "collect": P.push(awardStep("fs", "COLLECTOR PRIZE", out.x, bet, 1800, "bigwin")); break;
      default: break;
    }
    // The collector: a piece fills the meter; a full meter pays (credits, or super free games with everything ×3).
    if (out.col?.piece) {
      const cl = out.col;
      P.push({ run: (quick) => { setView((v) => ({ ...v, col: cl.full ? c.col!.N : cl.before + 1 })); play("collect"); return quick ? 150 : 500; }, end: () => setView((v) => ({ ...v, col: cl.full ? c.col!.N : cl.before + 1 })) });
      if (cl.full) {
        P.push({ run: (q) => { banner("fs", "COLLECTOR FULL!", c.col!.prize === "super" ? "SUPER FREE GAMES · ALL WINS ×3" : fmt(cl.credits * bet)); play("fsStart"); credit0Win.current = winRef.current; return q ? 600 : 2000; } });
        if (cl.super) {
          const n0 = cl.super.spins.filter((s) => !s.retrig).length;
          P.push(...freeSteps(cl.super, bet, n0, true), outroStep(cl.credits, bet));
        } else P.push(awardStep("fs", "COLLECTOR PRIZE", cl.credits, bet, 1800, "bigwin"));
        P.push({ run: () => { setView((v) => ({ ...v, col: 0, banner: null })); return 0; } });
      }
    }
    // A must-hit-by meter crossed its point on this spin.
    if (out.mhb) {
      const name = levelName(c.levels.length, out.mhb.level, classic);
      P.push(awardStep("jp", `MUST-HIT-BY ${name}!`, out.mhb.x, bet, 2600, "jackpot"));
    }
    // A hand pay for a big jackpot.
    const jpPay = (out.level >= 0 ? (out.kind === "jackpot" ? out.x : out.x) : 0) * bet + (out.mhb ? out.mhb.x * bet : 0);
    if ((out.level >= 0 || out.mhb) && jpPay >= HANDPAY) {
      P.push({ run: (q) => { banner("handpay", "JACKPOT — HAND PAY", "Call attendant · verification required"); play("handpay"); return q ? 800 : 2600; } });
      P.push({ run: (q) => { banner("handpay", "PAID", fmt(jpPay)); return q ? 400 : 1000; } });
    }
    if (out.voided !== undefined && out.voided >= 0) {
      const name = levelName(c.levels.length, out.voided, classic);
      P.push({ run: (q) => { banner("small", `${name} SYMBOLS`, "Only paid on the largest bet", false); play("deny"); return q ? 600 : 1800; } });
    }
    if (out.kind !== "loss" || out.near) P.push({ run: () => { setView((v) => ({ ...v, msg: out.near && out.kind === "loss" ? "" : v.msg })); return 0; } });
    phases.current = P;
    go(0);
  }

  function press() {
    if (busyRef.current) { slam(); return; }
    const bet = p.bet;
    credit0.current = p.credit - bet;
    frozen.current = p.meters?.slice();
    const res = p.spin();
    if (!res) { setAuto(0); play("deny"); return; }
    // The reels start at once; the stops wait for the result.
    clearAll();
    setBusy(true);
    winRef.current = 0;
    setView((v) => ({ ...v, stopped: Array(lay.reels).fill(false), antic: Array(lay.reels).fill(false), wins: [], cycle: -1, msg: "GOOD LUCK!", banner: null, fs: null, win: 0, mode: "reels", hns: undefined, pick: undefined, wheel: undefined, offer: undefined, col: p.col ?? v.col, storm: false, drop: false }));
    play("spin");
    const t0 = performance.now();
    Promise.resolve(res).then((out) => {
      if (!out) {
        setView((v) => ({ ...v, stopped: Array(lay.reels).fill(true), msg: "" }));
        setBusy(false);
        setAuto(0);
        play("deny");
        return;
      }
      run(out, bet, performance.now() - t0);
    });
  }
  // Autoplay: each count down spins again.
  useEffect(() => { if (auto > 0 && !busyRef.current) press(); }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps
  // The designer's forced spins.
  useEffect(() => { if (p.kick) { if (busyRef.current) { clearAll(); for (let i = pi.current; i < phases.current.length; i++) phases.current[i]?.end?.(); phases.current = []; setBusy(false); } press(); } }, [p.kick]); // eslint-disable-line react-hooks/exhaustive-deps
  // Idle: cycle through the last spin's wins.
  useEffect(() => {
    if (busy || view.wins.length < 2) return;
    const t = setInterval(() => setView((v) => ({ ...v, cycle: (v.cycle + 1) % v.wins.length })), 1100);
    return () => clearInterval(t);
  }, [busy, view.wins.length]);
  // Idle: the collector shows the machine's own progress.
  useEffect(() => { if (!busy) setView((v) => ({ ...v, col: p.col ?? 0 })); }, [p.col, busy]);

  const body = BODY_COLORS[d.cab.body]?.ramp ?? BODY_COLORS[2].ramp, light = LIGHT_COLORS[d.show.light]?.c ?? LIGHT_COLORS[0].c;
  const style = {
    "--b0": body[0], "--b1": body[1], "--b2": body[2], "--b3": body[3], "--l0": light[0], "--l1": light[1], "--l2": light[2],
    "--bg0": th.bg[0], "--bg1": th.bg[1], "--acc": th.accent, "--lg0": th.logo[0], "--lg1": th.logo[1],
    "--glow": `${4 + d.show.lights * 6}px`, "--cols": lay.reels, "--rows": rows, "--k": [0.84, 1, 1.14][look.reels] ?? 1,
  } as CSSProperties;
  const shownWins = view.cycle >= 0 && view.wins[view.cycle] ? [view.wins[view.cycle]] : view.wins;
  const hit = new Set<number>();
  for (const w of shownWins) for (const q of w.cells) hit.add(q);
  const levels = c.levels.length;
  // Meters: live progressives (held at their values from the start of a spin until it's shown), fixed amounts × the bet.
  const meters = busy ? frozen.current : p.meters;
  const meterOf = (i: number) => { const l = c.levels[i]; return l.kind === "fixed" ? l.x * p.bet : meters?.[i] ?? l.x * d.maxBet * d.denom; };
  const topMeter = levels ? { name: levelName(levels, levels - 1, classic), v: meterOf(levels - 1), color: levelColor(levels, levels - 1), kind: c.levels[levels - 1].kind } : { name: "TOP AWARD", v: c.base.e.reduce((a, q) => Math.max(a, q.x), 0) * p.bet, color: th.accent, kind: "fixed" };
  const cyc = view.cycle >= 0 ? view.wins[view.cycle] : null;
  const winMsg = !busy && cyc && cyc.pay > 0 ? (lay.win === "lines" ? `LINE ${(cyc.line ?? 0) + 1} PAYS ${fmt(cyc.pay * p.bet * (view.fs?.mult ?? 1))}` : `${cyc.k} × ${lay.win === "ways" && cyc.ways ? `${cyc.ways} WAYS ` : ""}PAYS ${fmt(cyc.pay * p.bet)}`) : "";
  const credit = busy ? credit0.current + view.win : p.credit;
  const fsOn = !!view.fs, inFeature = busy && (fsOn || view.mode !== "reels") && view.mode !== "offer";
  const orbAt = useMemo(() => {
    const m = new Map<number, number>();
    const o = outRef.current;
    if (o?.hns) for (const q of o.hns.start) m.set(q.at, q.x);
    return m;
  }, [view.grid]); // eslint-disable-line react-hooks/exhaustive-deps
  const meterRow = !classic && look.meters !== 2 && (
    <div className="sm-meters">
      {levels ? c.levels.map((_, i) => levels - 1 - i).map((i) => {
        const l = c.levels[i];
        return (
          <div key={i} className={`meter ${l.kind !== "fixed" ? "prog" : ""}`} style={{ "--mc": levelColor(levels, i) } as CSSProperties}>
            <small>{levelName(levels, i)}{l.kind === "linked" ? " 🔗" : ""}</small>
            <b>{fmt(meterOf(i))}</b>
            {l.kind === "mhb" && <em>MUST HIT BY {fmt(l.cap * d.maxBet * d.denom).replace(".00", "")}</em>}
          </div>
        );
      }) : c.q > 0 ? (
        <div className="meter wide"><small>{`3 ${symbolOf(d, SCATTER)} AWARD ${FS_COUNTS[d.fs?.count ?? 1].n[0]} FREE GAMES`}</small><b>{FS_ENH[d.fs?.enh ?? "none"].id === "none" ? "RETRIGGERS" : FS_ENH[d.fs!.enh].name.toUpperCase()}</b></div>
      ) : <div className="meter wide"><small>WILD SUBSTITUTES</small><b>{lay.badge}</b></div>}
    </div>
  );
  const colBar = c.col && (
    <div className="sm-col"><small>COLLECT {c.col.prize === "super" ? "· SUPER FREE GAMES" : `· ${fmt(c.col.x * p.bet)}`}</small>
      <div><i style={{ width: `${(Math.min(c.col.N, view.col) / c.col.N) * 100}%` }} /></div><b>{Math.min(c.col.N, view.col)}/{c.col.N}</b></div>
  );
  const topperWheel = d.cab.topper === "wheel" && c.wheel;
  return (
    <div className={`sm ${p.compact ? "compact" : ""} ${busy ? "busy" : ""} ${fsOn || inFeature ? "infs" : ""} ${classic ? "classic" : "video"} cab-${d.cab.type} lights${d.show.lights} top${look.top} deck${look.deck} ${view.storm ? "storm" : ""}`} style={style}>
      {view.shower > 0 && <Coins seq={view.shower} />}
      {topperWheel ? (
        <div className="sm-topwheel"><WheelDisk segs={view.wheel?.segs ?? c.wheel!.x.map((x) => ({ x, lv: -1 }))} turn={view.wheel?.turn ?? 0} spinning={!!view.wheel?.spinning} bet={p.bet} c={c} small /></div>
      ) : d.cab.topper !== "none" && <div className={`sm-topper t-${d.cab.topper}`}>{d.cab.topper === "figure" ? symbolOf(d, 0) : d.cab.topper === "dome" ? "" : d.name}</div>}
      <div className="sm-top">
        <div className={`sm-logo fx${look.fx}`}>
          {look.top !== 2 && <span className="hero">{classic ? symbolOf(d, 1).startsWith("#") ? "💎" : symbolOf(d, 1) : symbolOf(d, 0)}</span>}
          <b style={{ fontFamily: FONTS[look.font]?.css }}>{d.name}</b>
        </div>
        {look.top !== 2 && (classic ? <ClassicGlass c={c} bet={p.bet} /> : (
          <div className="sm-bigmeter" style={{ "--mc": topMeter.color } as CSSProperties}><small>{topMeter.name}{topMeter.kind !== "fixed" ? " · PROGRESSIVE" : ""}</small><span>{fmt(topMeter.v)}</span></div>
        ))}
        {look.meters === 0 && meterRow}
      </div>
      {look.meters === 1 && meterRow}
      {colBar}
      <div className="sm-screen">
        <div className="sm-msg">{view.msg || winMsg || (fsOn ? "" : busy ? "" : "PLAY NOW")}</div>
        <div className="sm-window">
          <div className="sm-side l">{lay.badge.split(" ").map((w, k) => <b key={k}>{w}</b>)}{fsOn && view.fs!.mult > 1 && <i>×{view.fs!.mult}</i>}</div>
          {view.mode === "hns" && view.hns ? <HnsBoard v={view.hns} reels={lay.reels} rows={rows} bet={p.bet} c={c} />
            : view.mode === "pick" && view.pick ? <PickBoard v={view.pick} bet={p.bet} c={c} />
            : view.mode === "wheel" && view.wheel && !topperWheel ? <div className="sm-wheelbox"><WheelDisk segs={view.wheel.segs} turn={view.wheel.turn} spinning={view.wheel.spinning} bet={p.bet} c={c} /></div>
            : view.mode === "offer" && view.offer ? <OfferBoard v={view.offer} bet={p.bet} onAnswer={answerOffer} />
            : (
            <div className={`sm-reels ${shownWins.length ? "showing" : ""} ${view.drop ? "drop" : ""}`}>
              {view.grid.map((col, r) => (
                <div key={r} className={`sm-reel ${view.stopped[r] ? "stop" : "spin"} ${view.antic[r] ? "antic" : ""}`}>
                  {view.stopped[r] ? col.slice(0, rows).map((code, row) => (
                    <div key={`${row}-${code}`} className={`sm-cell ${hit.has(r * 8 + row) ? "hit" : ""} ${fsOn && view.fs!.sym >= 0 && code === view.fs!.sym ? "exp" : ""}`}>
                      <Sym d={d} code={code} label={code === ORB && orbAt.has(r * rows + row) ? fmt(orbAt.get(r * rows + row)! * p.bet).replace(".00", "") : undefined} />
                    </div>
                  )) : <Blur d={d} r={r} rows={rows} />}
                </div>
              ))}
              {classic && <div className="sm-payline" />}
              {lay.win === "lines" && !busy && shownWins.some((w) => w.line !== undefined) && <Lines lines={shownWins.filter((w) => w.line !== undefined).map((w) => lay.lines[w.line!].slice(0, w.k))} reels={lay.reels} rows={rows} />}
            </div>
          )}
          <div className="sm-side r">{lay.badge.split(" ").map((w, k) => <b key={k}>{w}</b>)}{fsOn && view.fs!.mult > 1 && <i>×{view.fs!.mult}</i>}</div>
        </div>
        {view.banner && <div className={`sm-banner k-${view.banner.kind} ${view.banner.big ? "big" : ""}`}><b>{view.banner.title}</b>{view.banner.sub && <span>{view.banner.sub}</span>}</div>}
        {fsOn && <div className="sm-fsbar"><span>FREE GAME {view.fs!.n} OF {view.fs!.of}{view.fs!.x3 ? " · ×3" : ""}</span><span>FEATURE WIN {fmt(view.fs!.total)}</span></div>}
        {view.mode === "hns" && view.hns && <div className="sm-fsbar"><span>RESPINS {view.hns.left}</span><span>{Object.keys(view.hns.orbs).length} / {view.hns.spots}</span></div>}
        <div className="sm-bar">
          <div><small>CREDIT</small><b>{fmt(credit)}</b></div>
          <div><small>BET</small><b>{fmt(p.bet)}</b></div>
          <div className="w"><small>WIN</small><b>{fmt(busy || view.win ? view.win : 0)}</b></div>
          <div className="denom">{denomLabel(d.denom)}</div>
        </div>
      </div>
      <div className="sm-deck">
        <button className="sm-btn info" onClick={() => { play("click"); setHelp(true); }}>i</button>
        {inFeature ? <button className="sm-btn skip" onClick={() => { play("click"); skipFeature(); }}>SKIP</button> : <>
          <button className="sm-btn" disabled={busy} onClick={() => { play("click"); p.onBet(-1); }}>BET −</button>
          <button className="sm-btn" disabled={busy} onClick={() => { play("click"); p.onBet(1); }}>BET +</button>
          <button className="sm-btn" disabled={busy} onClick={() => { play("click"); p.onBet("max"); }}>MAX</button>
        </>}
        <button className={`sm-btn auto ${auto ? "on" : ""}`} onClick={() => { play("click"); setAuto((a) => (a ? 0 : 25)); }}>{auto ? `STOP ${auto}` : "AUTO"}</button>
        <button className="sm-spin" disabled={view.mode === "offer" && view.offer?.state === "ask"} onClick={() => { play("click"); press(); }}>{busy ? "STOP" : "SPIN"}</button>
      </div>
      {help && <Help c={c} bet={p.bet} onClose={() => setHelp(false)} />}
    </div>
  );
}

const cellsOf = (g: Grid, v: number) => {
  const out: number[] = [];
  g.forEach((col, r) => col.forEach((q, row) => { if (q === v) out.push(r * 8 + row); }));
  return out;
};

/** Hold & spin: the grid of spots, orbs locked with their values (or a jackpot), empty spots respinning. */
function HnsBoard({ v, reels, rows, bet, c }: { v: NonNullable<View["hns"]>; reels: number; rows: number; bet: number; c: Compiled }) {
  return (
    <div className="sm-hns" style={{ "--cols": reels } as CSSProperties}>
      {Array.from({ length: reels }, (_, r) => (
        <div key={r} className="col">
          {Array.from({ length: rows }, (_, row) => {
            const o = v.orbs[r * rows + row];
            return (
              <div key={row} className={`spot ${o ? "orb" : v.spinning ? "spin" : ""} ${o?.fresh ? "fresh" : ""} ${o && o.lv >= 0 ? "jp" : ""}`}>
                {o ? (o.lv >= 0 ? <b>{levelName(c.levels.length, o.lv)}</b> : <b>{fmt(o.x * bet).replace(".00", "")}</b>) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
/** Pick: a board of tiles; turned ones show their prize, "COLLECT", or a jackpot name. */
function PickBoard({ v, bet, c }: { v: NonNullable<View["pick"]>; bet: number; c: Compiled }) {
  return (
    <div className="sm-pick">
      {v.tiles.map((t, k) => (
        <div key={k} className={`tile ${t ? "open" : ""} ${t && t.lv >= 0 ? "jp" : ""} ${t && t.lv >= 0 && t.lv === v.level ? "match" : ""}`}>
          {!t ? <span>?</span> : t.lv === -2 ? <b>COLLECT</b> : t.lv >= 0 ? <b style={{ color: levelColor(c.levels.length, t.lv) }}>{levelName(c.levels.length, t.lv)}</b> : <b>{fmt(t.x * bet)}</b>}
        </div>
      ))}
    </div>
  );
}
/** The wheel: segments with credits (× bet) and jackpots, turned by `turn` degrees. */
function WheelDisk({ segs, turn, spinning, bet, c, small }: { segs: { x: number; lv: number }[]; turn: number; spinning: boolean; bet: number; c: Compiled; small?: boolean }) {
  const n = segs.length, a = (2 * Math.PI) / n, R = 100;
  const hues = ["#c01a2a", "#1a3aa8", "#128a3a", "#b0701a", "#7a1ab0", "#1a8aa8"];
  return (
    <div className={`sm-wheel ${small ? "small" : ""}`}>
      <svg viewBox="-110 -110 220 220" style={{ transform: `rotate(${turn}deg)`, transition: spinning ? "transform 4.8s cubic-bezier(.12,.8,.18,1)" : "none" }}>
        {segs.map((s, k) => {
          const a0 = k * a - Math.PI / 2, a1 = a0 + a, mid = (a0 + a1) / 2;
          const path = `M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`;
          const label = s.lv >= 0 ? levelName(c.levels.length, s.lv) : `$${Math.round(s.x * bet).toLocaleString("en-US")}`;
          return (
            <g key={k}>
              <path d={path} fill={s.lv >= 0 ? "#111" : hues[k % hues.length]} stroke="#ffd23f" strokeWidth="1.5" />
              <text x={62 * Math.cos(mid)} y={62 * Math.sin(mid)} transform={`rotate(${(mid * 180) / Math.PI + 90} ${62 * Math.cos(mid)} ${62 * Math.sin(mid)})`}
                fill={s.lv >= 0 ? levelColor(c.levels.length, s.lv) : "#fff"} fontSize={n > 18 ? 8 : 10} fontWeight="900" textAnchor="middle" dominantBaseline="middle">{label}</text>
            </g>
          );
        })}
        <circle r="16" fill="#ffd23f" stroke="#8a5a10" strokeWidth="3" />
      </svg>
      <i className="pointer" />
    </div>
  );
}
/** The offer: this one, or leave it for the next. */
function OfferBoard({ v, bet, onAnswer }: { v: NonNullable<View["offer"]>; bet: number; onAnswer: (a: "take" | "leave") => void }) {
  const last = v.k >= v.vals.length - 2;
  return (
    <div className="sm-offer">
      <small>{v.state === "ask" ? `OFFER ${v.k + 1} OF ${v.vals.length - 1}` : v.state === "took" ? "YOU TOOK" : "YOUR PRIZE"}</small>
      <b>{fmt(v.vals[v.k] * bet)}</b>
      {v.state === "ask" ? (
        <div className="btns">
          <button className="take" onClick={() => onAnswer("take")}>TAKE IT</button>
          <button className="leave" onClick={() => onAnswer("leave")}>{last ? "PLAY FOR THE PRIZE" : "NO DEAL"}</button>
        </div>
      ) : v.state === "took" && v.k < v.vals.length - 1 ? <em>The prize would have been {fmt(v.vals[v.vals.length - 1] * bet)}</em> : null}
    </div>
  );
}

/** A spinning reel: a blurred strip of the design's symbols. */
function Blur({ d, r, rows }: { d: Compiled["d"]; r: number; rows: number }) {
  const strip = useMemo(() => {
    const codes = d.layout === "c3" ? [1, 6, 2, 6, 3, 0, 6, 4, 5, 6] : [0, 5, 1, 6, 2, 7, 3, 8, 4, 9, 10];
    return Array.from({ length: 12 }, (_, k) => codes[(k * 7 + r * 3) % codes.length]);
  }, [d.layout, r]);
  return (
    <div className="sm-blur" style={{ animationDuration: `${0.16 + r * 0.015}s`, "--rows": rows } as CSSProperties}>
      {[...strip, ...strip].map((code, k) => <div key={k} className="sm-cell"><Sym d={d} code={code} /></div>)}
    </div>
  );
}

/** Winning paylines drawn across the reels. */
function Lines({ lines, reels, rows }: { lines: number[][]; reels: number; rows: number }) {
  return (
    <svg className="sm-lines" viewBox={`0 0 ${reels * 10} ${rows * 10}`} preserveAspectRatio="none">
      {lines.map((ln, k) => <polyline key={k} points={ln.map((row, r) => `${r * 10 + 5},${row * 10 + 5}`).join(" ")} />)}
    </svg>
  );
}

/** A stepper's glass: its awards, as real mechanical machines show them. */
function ClassicGlass({ c, bet }: { c: Compiled; bet: number }) {
  const d = c.d, coins = bet / d.denom;
  const rows: [number[], number][] = [];
  const wild = d.wild !== "none";
  if (wild) rows.push([[0, 0, 0], c.top]);
  rows.push([[1, 1, 1], wild ? 100 : c.top], [[2, 2, 2], 40], [[3, 3, 3], 25], [[4, 4, 4], 10], [[5, 5, 5], 10], [[5, 5, 6], 5], [[5, 6, 6], 2]);
  return (
    <div className="sm-glass">
      {rows.map(([syms, pay], k) => (
        <div key={k}><span>{syms.map((s, j) => <Sym key={j} d={d} code={s} size={14} />)}</span><b>{fmt(pay * coins * d.denom)}</b></div>
      ))}
      {wild && d.wild !== "plain" && <em>{d.wild === "x2" ? "WILD DOUBLES · TWO WILDS ×4" : "WILD TRIPLES · TWO WILDS ×9"}</em>}
    </div>
  );
}

/** Coins raining down on a big win. */
function Coins({ seq }: { seq: number }) {
  const coins = useMemo(() => Array.from({ length: 40 }, (_, k) => ({
    left: `${(k * 37) % 100}%`, animationDelay: `${((k * 13) % 10) / 10}s`, animationDuration: `${1.3 + ((k * 7) % 10) / 8}s`, width: `${14 + ((k * 5) % 12)}px`,
  })), [seq]);
  return <div className="sm-coins" key={seq} aria-hidden>{coins.map((s, k) => <i key={k} style={{ ...s, height: s.width }} />)}</div>;
}

export { countOf, SPEEDS };
