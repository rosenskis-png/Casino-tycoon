// A slot machine you play (docs/spec/designer.md §9): built from a design, meant to look and feel like a modern Vegas
// video slot or a mechanical stepper. It shows a spin the sim has already settled: reels stop left to right (longer
// when a feature is one symbol away), wins light up and count up, free spins play out, jackpots ring. The same
// machine is the designer's live preview. UI only; the math is sim/design.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BODY_COLORS, FS_COUNTS, FS_ENH, JACKPOT, LIGHT_COLORS, ROLLUPS, SCATTER, SLOT_THEMES, SPEEDS, levelColor, levelName,
} from "../../data/designer";
import { play } from "../../platform/audio";
import type { Compiled } from "../../sim/design/compile";
import { evaluate, countOf, type Grid, type Win } from "../../sim/design/grid";
import { TIERS, type Outcome } from "../../sim/design/spin";
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
}

interface View {
  grid: Grid;
  pre?: Grid;
  stopped: boolean[];
  antic: boolean[];
  wins: Win[];
  cycle: number;
  msg: string;
  banner: { kind: string; title: string; sub?: string; big?: boolean } | null;
  fs: { n: number; of: number; total: number; mult: number; sym: number } | null;
  win: number;
  paid: number;
  shower: number;
}

const fmt = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const denomLabel = (d: number) => (d < 1 ? `${Math.round(d * 100)}¢` : `$${d}`);
/** Real machines hand-pay jackpots of $1,200 and up (the tax form threshold). */
const HANDPAY = 1200;

/** A believable starting screen: a losing layout from the design's symbols. */
function idleGrid(c: Compiled): Grid {
  const { reels, rows } = c.lay;
  if (c.lay.win === "classic") return [[6, 1, 6], [6, 0, 6], [6, 1, 6]].map((r) => r.slice());
  return Array.from({ length: reels }, (_, r) => Array.from({ length: rows }, (_, k) => (r * 3 + k * 5 + (r % 2)) % 9));
}

export function Machine(p: MachineProps) {
  const { c } = p, d = c.d, lay = c.lay, th = SLOT_THEMES[d.theme];
  const classic = lay.win === "classic";
  const rows = classic ? 3 : lay.rows;
  const [view, setView] = useState<View>(() => ({ grid: idleGrid(c), stopped: Array(lay.reels).fill(true), antic: Array(lay.reels).fill(false), wins: [], cycle: -1, msg: "", banner: null, fs: null, win: 0, paid: 0, shower: 0 }));
  const [busy, setBusyState] = useState(false);
  const [help, setHelp] = useState(false);
  const [auto, setAutoState] = useState(0);
  const autoRef = useRef(0);
  const setAuto = (f: number | ((a: number) => number)) => setAutoState((a) => (autoRef.current = typeof f === "function" ? f(a) : f));
  const timers = useRef<number[]>([]);
  const final = useRef<View | null>(null);
  const busyRef = useRef(false);
  const setBusy = (b: boolean) => { busyRef.current = b; setBusyState(b); p.onBusy?.(b); };
  const at = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };
  const clearAll = () => { for (const t of timers.current) clearTimeout(t); timers.current = []; };
  useEffect(() => () => clearAll(), []);
  // A new design (the designer): a fresh screen in its layout.
  const layoutKey = `${d.layout}:${d.theme}:${d.set}`;
  useEffect(() => {
    clearAll();
    setBusy(false);
    setView({ grid: idleGrid(c), stopped: Array(lay.reels).fill(true), antic: Array(lay.reels).fill(false), wins: [], cycle: -1, msg: "", banner: null, fs: null, win: 0, paid: 0, shower: 0 });
  }, [layoutKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const speed = d.show.speed, base = [720, 560, 430][speed], gap = [260, 190, 140][speed];
  const rollS = ROLLUPS[d.show.rollup]?.s ?? 1.2;
  const trigSym = c.q > 0 ? SCATTER : c.pJ.length ? JACKPOT : -1;

  /** Stop times per reel for a screen, with anticipation (longer, glowing) once two trigger symbols are showing. */
  function schedule(grid: Grid, fast: boolean): { t: number[]; antic: boolean[] } {
    const t: number[] = [], an: boolean[] = [];
    let at0 = fast ? 380 : base, seen = 0;
    for (let r = 0; r < lay.reels; r++) {
      const a = d.show.antic && !classic && trigSym >= 0 && seen >= 2 && r >= 2;
      if (a) at0 += 900;
      an.push(a);
      t.push(at0);
      at0 += fast ? 110 : gap;
      seen += grid[r].filter((v) => v === trigSym).length;
    }
    return { t, antic: an };
  }

  /** Counts the win meter from `from` to `to` over `secs`, with coin ticks. */
  function rollup(from: number, to: number, secs: number, startAt: number) {
    const steps = Math.max(1, Math.min(40, Math.round(secs * 20)));
    for (let k = 1; k <= steps; k++) {
      at(startAt + (secs * 1000 * k) / steps, () => {
        setView((v) => ({ ...v, win: from + ((to - from) * k) / steps }));
        if (k % 2 === 0) play("coin");
      });
    }
    return startAt + secs * 1000;
  }

  /** Shows one screen's result: wins highlighted, sounds by size; returns when it's done. */
  function showWins(grid: Grid, x: number, bet: number, t: number, mult = 1): number {
    const ev = evaluate(c, grid);
    const won = x * bet;
    if (x <= 0 || !ev.wins.length) return t;
    const ldw = x < 1, quiet = ldw && d.show.ldw === 0;
    at(t, () => {
      setView((v) => ({ ...v, wins: quiet ? [] : ev.wins, cycle: -1, msg: quiet ? "" : ldw ? (d.show.ldw === 2 ? "WINNER!" : "") : "THAT'S A WINNER!" }));
      if (!quiet) play(ldw ? (d.show.ldw === 2 ? "win" : "chips") : x >= TIERS.mega ? "tierMega" : x >= TIERS.big ? "bigwin" : "win");
      if (x >= TIERS.big) setView((v) => ({ ...v, banner: { kind: "tier", title: x >= TIERS.epic ? "EPIC WIN" : x >= TIERS.mega ? "MEGA WIN" : "BIG WIN", sub: fmt(won), big: true }, shower: v.shower + 1 }));
    });
    void mult;
    const secs = ldw ? 0.4 : rollS * (1 + Math.log2(1 + x) / 3);
    return rollup(0, won, secs, t + 150) + (x >= TIERS.big ? 900 : 250);
  }

  /** Shows a spin that has settled. `credit0`: the credit meter after the bet; `elapsed`: ms the reels have already spun. */
  function run(out: Outcome, bet: number, credit0: number, elapsed: number) {
    clearAll();
    const g0 = out.pre ?? out.grid;
    const sch = schedule(out.grid, false);
    const lead = Math.max(0, elapsed - 150);
    sch.t = sch.t.map((t) => Math.max(120, t - lead));
    setView((v) => ({ ...v, grid: g0, pre: out.pre }));
    sch.t.forEach((t, r) => {
      if (sch.antic[r]) at(t - 900, () => { setView((v) => ({ ...v, antic: v.antic.map((a, i) => a || i === r) })); play("antic"); });
      at(t, () => {
        setView((v) => ({ ...v, stopped: v.stopped.map((s, i) => s || i === r), antic: v.antic.map((a, i) => (i === r ? false : a)) }));
        play("reelstop");
        if (out.grid[r].some((q) => q === trigSym && trigSym >= 0)) play("scatter");
      });
    });
    let t = sch.t[sch.t.length - 1] + 200;
    // The final state, for a slam-stop.
    const fin: View = { grid: out.grid, stopped: Array(lay.reels).fill(true), antic: Array(lay.reels).fill(false), wins: [], cycle: -1, msg: "", banner: null, fs: null, win: out.x * bet, paid: credit0 + out.x * bet, shower: 0 };
    if (out.kind === "win") {
      fin.wins = evaluate(c, out.grid).wins;
      t = showWins(out.grid, out.x, bet, t);
    } else if (out.kind === "jackpot") {
      const n = c.pJ.length, name = levelName(n, out.level, classic), won = out.x * bet;
      at(t, () => {
        setView((v) => ({ ...v, msg: `${name}!`, banner: { kind: "jp", title: `${name}${classic ? "" : " JACKPOT"}`, sub: fmt(won), big: true }, shower: v.shower + 1 }));
        play("jackpot");
      });
      t = rollup(0, won, 2.2, t + 300) + 800;
      if (won >= HANDPAY) {
        at(t, () => { setView((v) => ({ ...v, banner: { kind: "handpay", title: "JACKPOT — HAND PAY", sub: "Call attendant · verification required" } })); play("handpay"); });
        t += 2600;
        at(t, () => setView((v) => ({ ...v, banner: { kind: "handpay", title: "PAID", sub: fmt(won) } })));
        t += 1000;
      }
    } else if (out.kind === "fs" && out.fs) {
      const fsx = out.fs, n0 = c.spins[out.scat - 3] ?? fsx.spins.length, enh = FS_ENH[d.fs?.enh ?? "none"];
      const scatPay = out.scatPay * bet;
      at(t, () => {
        setView((v) => ({ ...v, msg: "BONUS!", wins: [{ s: SCATTER, k: out.scat, pay: out.scatPay, cells: cellsOf(out.grid, SCATTER) }] }));
        play(d.show.call);
      });
      t += 900;
      at(t, () => { setView((v) => ({ ...v, banner: { kind: "fs", title: `${n0} FREE GAMES`, sub: enh.id === "none" ? "" : enh.name.toUpperCase(), big: true } })); play("fsStart"); });
      t = rollup(0, scatPay, 0.6, t + 400) + 1400;
      if (fsx.sym >= 0) {
        at(t, () => setView((v) => ({ ...v, banner: { kind: "expand", title: "EXPANDING SYMBOL", sub: symbolOf(d, fsx.sym) } })));
        t += 1600;
      }
      let total = scatPay, of = n0;
      at(t, () => setView((v) => ({ ...v, banner: null, wins: [], fs: { n: 0, of, total, mult: 1, sym: fsx.sym } })));
      t += 300;
      fsx.spins.forEach((s, k) => {
        const grid0 = s.pre ?? s.grid, sc = schedule(s.grid, true);
        const ofNow = of;
        at(t, () => {
          setView((v) => ({ ...v, grid: grid0, stopped: Array(lay.reels).fill(false), wins: [], cycle: -1, antic: Array(lay.reels).fill(false), msg: `FREE GAME ${k + 1} OF ${ofNow}`, fs: v.fs && { ...v.fs, n: k + 1, of: ofNow, mult: s.mult } }));
          play("fsSpin");
        });
        sc.t.forEach((tt, r) => at(t + tt, () => { setView((v) => ({ ...v, stopped: v.stopped.map((q, i) => q || i === r) })); play("reelstop"); }));
        let tt = t + sc.t[sc.t.length - 1] + 150;
        if (s.pre) {
          at(tt, () => { setView((v) => ({ ...v, grid: s.grid })); play("expand"); });
          tt += 500;
        }
        if (s.retrig) {
          const add = c.spins[s.retrig - 3] ?? 0;
          of += add;
          const ofAfter = of;
          at(tt, () => { setView((v) => ({ ...v, wins: [{ s: SCATTER, k: s.retrig, pay: 0, cells: cellsOf(s.grid, SCATTER) }], banner: { kind: "fs", title: `+${add} FREE GAMES`, big: true }, fs: v.fs && { ...v.fs, of: ofAfter } })); play("fsStart"); });
          tt += 1500;
          at(tt, () => setView((v) => ({ ...v, banner: null })));
        }
        if (s.x > 0) {
          const before = total;
          total += s.x * bet;
          const after = total;
          const ev = evaluate(c, s.grid);
          at(tt, () => {
            setView((v) => ({ ...v, wins: ev.wins, msg: s.mult > 1 ? `WIN ×${s.mult}` : v.msg, fs: v.fs && { ...v.fs, total: after } }));
            play(s.x >= TIERS.big ? "bigwin" : "win");
          });
          tt = rollup(before, after, Math.min(1.2, 0.35 + Math.log2(1 + s.x) / 6), tt + 100) + 350;
        } else tt += 250;
        t = tt;
      });
      const totalWin = total;
      at(t, () => {
        setView((v) => ({ ...v, banner: { kind: "outro", title: "FEATURE WIN", sub: fmt(totalWin), big: true }, shower: totalWin >= TIERS.big * bet ? v.shower + 1 : v.shower, wins: [] }));
        play(totalWin >= TIERS.mega * bet ? "tierMega" : "bigwin");
      });
      t += 2600;
      at(t, () => setView((v) => ({ ...v, fs: null, banner: null, msg: "" })));
      fin.win = total;
      fin.paid = credit0 + total;
      fin.grid = fsx.spins.length ? fsx.spins[fsx.spins.length - 1].grid : out.grid;
    } else if (out.near) {
      at(t, () => setView((v) => ({ ...v, msg: "" })));
    }
    final.current = fin;
    at(t, () => {
      setView((v) => ({ ...v, stopped: fin.stopped, antic: fin.antic, win: fin.win, paid: fin.paid, banner: v.banner?.kind === "tier" ? null : v.banner }));
      finish(out);
    });
  }

  function finish(out: Outcome) {
    final.current = null;
    setBusy(false);
    if (autoRef.current > 0) {
      const stop = out.kind === "fs" || out.kind === "jackpot";
      if (stop) setAuto(0);
      else window.setTimeout(() => setAuto((a) => a - 1), 350);
    }
  }

  /** Slam-stop: jump to the end of what's showing. */
  function slam() {
    const fin = final.current;
    if (!fin) return;
    clearAll();
    setView((v) => ({ ...fin, shower: v.shower, wins: fin.wins }));
    final.current = null;
    setBusy(false);
    setAuto(0);
  }

  function press() {
    if (busyRef.current) { slam(); return; }
    const bet = p.bet, credit0 = p.credit - bet;
    const res = p.spin();
    if (!res) { setAuto(0); play("deny"); return; }
    // The reels start at once; the stops wait for the result.
    clearAll();
    setBusy(true);
    setView((v) => ({ ...v, stopped: Array(lay.reels).fill(false), antic: Array(lay.reels).fill(false), wins: [], cycle: -1, msg: "GOOD LUCK!", banner: null, fs: null, win: 0, paid: credit0 }));
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
      run(out, bet, credit0, performance.now() - t0);
    });
  }
  // Autoplay: each count down spins again.
  useEffect(() => { if (auto > 0 && !busyRef.current) press(); }, [auto]); // eslint-disable-line react-hooks/exhaustive-deps
  // The designer's forced spins.
  useEffect(() => { if (p.kick) { if (busyRef.current) slam(); press(); } }, [p.kick]); // eslint-disable-line react-hooks/exhaustive-deps
  // Idle: cycle through the last spin's wins.
  useEffect(() => {
    if (busy || view.wins.length < 2) return;
    const t = setInterval(() => setView((v) => ({ ...v, cycle: (v.cycle + 1) % v.wins.length })), 1100);
    return () => clearInterval(t);
  }, [busy, view.wins.length]);

  const body = BODY_COLORS[d.cab.body]?.ramp ?? BODY_COLORS[2].ramp, light = LIGHT_COLORS[d.show.light]?.c ?? LIGHT_COLORS[0].c;
  const style = {
    "--b0": body[0], "--b1": body[1], "--b2": body[2], "--b3": body[3], "--l0": light[0], "--l1": light[1], "--l2": light[2],
    "--bg0": th.bg[0], "--bg1": th.bg[1], "--acc": th.accent, "--lg0": th.logo[0], "--lg1": th.logo[1],
    "--glow": `${4 + d.show.lights * 6}px`, "--cols": lay.reels, "--rows": rows,
  } as CSSProperties;
  const shownWins = view.cycle >= 0 && view.wins[view.cycle] ? [view.wins[view.cycle]] : view.wins;
  const hit = new Set<number>();
  for (const w of shownWins) for (const q of w.cells) hit.add(q);
  const levels = c.pJ.length;
  const topMeter = levels ? { name: levelName(levels, levels - 1, classic), v: c.jx[levels - 1] * p.bet, color: levelColor(levels, levels - 1) } : { name: "TOP AWARD", v: c.base.e.reduce((a, q) => Math.max(a, q.x), 0) * p.bet, color: th.accent };
  const cyc = view.cycle >= 0 ? view.wins[view.cycle] : null;
  const winMsg = !busy && cyc ? (lay.win === "lines" ? `LINE ${(cyc.line ?? 0) + 1} PAYS ${fmt(cyc.pay * p.bet * (view.fs?.mult ?? 1))}` : `${cyc.k} × ${lay.win === "ways" && cyc.ways ? `${cyc.ways} WAYS ` : ""}PAYS ${fmt(cyc.pay * p.bet)}`) : "";
  const credit = busy ? view.paid : p.credit;
  const fsOn = !!view.fs;
  return (
    <div className={`sm ${p.compact ? "compact" : ""} ${busy ? "busy" : ""} ${fsOn ? "infs" : ""} ${classic ? "classic" : "video"} cab-${d.cab.type} lights${d.show.lights}`} style={style}>
      {view.shower > 0 && <Coins seq={view.shower} />}
      <div className="sm-top">
        {d.cab.topper !== "none" && <div className={`sm-topper t-${d.cab.topper}`}>{d.cab.topper === "figure" ? symbolOf(d, 0) : d.cab.topper === "dome" ? "" : d.name}</div>}
        <div className="sm-logo">
          <span className="hero">{classic ? symbolOf(d, 1).startsWith("#") ? "💎" : symbolOf(d, 1) : symbolOf(d, 0)}</span>
          <b>{d.name}</b>
        </div>
        {classic ? <ClassicGlass c={c} bet={p.bet} /> : (
          <div className="sm-bigmeter" style={{ "--mc": topMeter.color } as CSSProperties}><small>{topMeter.name}</small><span>{fmt(topMeter.v)}</span></div>
        )}
      </div>
      {!classic && (
        <div className="sm-meters">
          {levels ? c.pJ.map((_, i) => levels - 1 - i).map((i) => (
            <div key={i} className="meter" style={{ "--mc": levelColor(levels, i) } as CSSProperties}><small>{levelName(levels, i)}</small><b>{fmt(c.jx[i] * p.bet)}</b></div>
          )) : c.q > 0 ? (
            <div className="meter wide"><small>{`3 ${symbolOf(d, SCATTER)} AWARD ${FS_COUNTS[d.fs?.count ?? 1].n[0]} FREE GAMES`}</small><b>{FS_ENH[d.fs?.enh ?? "none"].id === "none" ? "RETRIGGERS" : FS_ENH[d.fs!.enh].name.toUpperCase()}</b></div>
          ) : <div className="meter wide"><small>WILD SUBSTITUTES</small><b>{lay.badge}</b></div>}
        </div>
      )}
      <div className="sm-screen">
        <div className="sm-msg">{view.msg || winMsg || (fsOn ? "" : busy ? "" : "PLAY NOW")}</div>
        <div className="sm-window">
          <div className="sm-side l">{lay.badge.split(" ").map((w, k) => <b key={k}>{w}</b>)}{fsOn && view.fs!.mult > 1 && <i>×{view.fs!.mult}</i>}</div>
          <div className={`sm-reels ${shownWins.length ? "showing" : ""}`}>
            {view.grid.map((col, r) => (
              <div key={r} className={`sm-reel ${view.stopped[r] ? "stop" : "spin"} ${view.antic[r] ? "antic" : ""}`}>
                {view.stopped[r] ? col.slice(0, rows).map((code, row) => (
                  <div key={`${row}-${code}`} className={`sm-cell ${hit.has(r * 8 + row) ? "hit" : ""} ${fsOn && view.fs!.sym >= 0 && code === view.fs!.sym ? "exp" : ""}`}><Sym d={d} code={code} /></div>
                )) : <Blur d={d} r={r} rows={rows} />}
              </div>
            ))}
            {classic && <div className="sm-payline" />}
            {lay.win === "lines" && !busy && shownWins.some((w) => w.line !== undefined) && <Lines lines={shownWins.filter((w) => w.line !== undefined).map((w) => lay.lines[w.line!].slice(0, w.k))} reels={lay.reels} rows={rows} />}
          </div>
          <div className="sm-side r">{lay.badge.split(" ").map((w, k) => <b key={k}>{w}</b>)}{fsOn && view.fs!.mult > 1 && <i>×{view.fs!.mult}</i>}</div>
        </div>
        {view.banner && <div className={`sm-banner k-${view.banner.kind} ${view.banner.big ? "big" : ""}`}><b>{view.banner.title}</b>{view.banner.sub && <span>{view.banner.sub}</span>}</div>}
        {fsOn && <div className="sm-fsbar"><span>FREE GAME {view.fs!.n} OF {view.fs!.of}</span><span>FEATURE WIN {fmt(view.fs!.total)}</span></div>}
        <div className="sm-bar">
          <div><small>CREDIT</small><b>{fmt(credit)}</b></div>
          <div><small>BET</small><b>{fmt(p.bet)}</b></div>
          <div className="w"><small>WIN</small><b>{fmt(busy || view.win ? view.win : 0)}</b></div>
          <div className="denom">{denomLabel(d.denom)}</div>
        </div>
      </div>
      <div className="sm-deck">
        <button className="sm-btn info" onClick={() => { play("click"); setHelp(true); }}>i</button>
        <button className="sm-btn" disabled={busy} onClick={() => { play("click"); p.onBet(-1); }}>BET −</button>
        <button className="sm-btn" disabled={busy} onClick={() => { play("click"); p.onBet(1); }}>BET +</button>
        <button className="sm-btn" disabled={busy} onClick={() => { play("click"); p.onBet("max"); }}>MAX</button>
        <button className={`sm-btn auto ${auto ? "on" : ""}`} onClick={() => { play("click"); setAuto((a) => (a ? 0 : 25)); }}>{auto ? `STOP ${auto}` : "AUTO"}</button>
        <button className="sm-spin" onClick={() => { play("click"); press(); }}>{busy ? "STOP" : "SPIN"}</button>
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
