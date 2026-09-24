// Playing the games yourself (FOUNDATIONS §23; docs/spec/play.md): a full-screen table or machine over the floor.
// The casino keeps running; every move is a `yours` command, and the screen animates the result it brings back.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { OBJECTS } from "../data/objects";
import { Machine } from "./slot/Machine";
import { KENO_PAYS, KENO_SPOTS, RED, TABLE_GAMES, oddsAllowed, pockets, ruleOf } from "../data/tables";
import { play } from "../platform/audio";
import {
  VP_HANDS, vpHand, bacTotal, betOf, bjTotal, compiledOf, designIdOf, limitsNow, limitsOf, meterValue, rankOf, stakeMult, vpX, yourMoves,
  type Game, type PlacedObject, type YourPlay,
} from "../sim";
import { reveal } from "./reveal";
import { stake as money } from "./format";
import type { Host } from "./host";

type Send = (c: { act: string; bet?: number; bets?: Record<string, number>; held?: number[]; picks?: number[] }, ms: number, sound?: string) => boolean;
interface GameProps { g: Game; y: YourPlay; o: PlacedObject; send: Send; busy: boolean }

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["♠", "♥", "♦", "♣"];
/** Real wheel orders, from 0 clockwise (pocket 37 is 00). */
const WHEEL: Record<number, number[]> = {
  37: [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26],
  38: [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, 37, 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2],
};
/** How long each game's animation runs, ms (the result shows when it ends). */
const SPIN_MS = { reels: [900, 1300, 1750], wheel: 4300, dice: 1000 };

function resultSound(y: YourPlay) {
  const { won, wagered, big } = y.last;
  play(big ? "jackpot" : won >= wagered * 10 && won > 0 ? "bigwin" : won > wagered ? "win" : won > 0 ? "chips" : "lose");
}
function resultText(y: YourPlay): string {
  if (!y.last.seq) return "";
  const net = y.last.won - y.last.wagered;
  return y.last.big ? `${y.last.big[0].toUpperCase()}${y.last.big.slice(1)}! You win ${money(y.last.won)}` : net > 0 ? `You win ${money(net)}` : net < 0 ? `You lose ${money(-net)}` : "Push";
}

/** A slot's line under its name: its layout, denomination and bets. */
function slotLine(g: Game, o: PlacedObject): string {
  const c = compiledOf(g.state, o);
  if (!c) return "";
  const m = c.model, mult = stakeMult(g, o);
  return `${c.lay.name} · ${money(m.denom * (m.minCredits ?? 1) * mult)}–${money(m.denom * m.maxCredits * mult)} a spin`;
}

export function PlayScreen({ host }: { host: Host }) {
  const g = host.game, y = g.state.yours!, o = g.objById.get(y.obj);
  const [busy, setBusyState] = useState(false);
  const timer = useRef(0);
  // M8.5: while a result is on its way, the cash and the session line hold what they showed before it (no spoilers).
  const hold = useRef<{ cash: number; total: YourPlay["total"]; seq: number } | null>(null);
  const setBusy = (b: boolean, bet = 0) => {
    if (b && !hold.current) hold.current = { cash: g.state.cash - bet, total: { ...y.total }, seq: y.last.seq };
    if (!b) hold.current = null;
    reveal.cash = hold.current?.cash ?? null;
    setBusyState(b);
  };
  useEffect(() => () => { clearTimeout(timer.current); reveal.cash = null; }, []);
  if (!o) return null;
  const def = OBJECTS[o.kind], tdef = def.game ? TABLE_GAMES[def.game] : null;
  const send: Send = (c, ms, sound) => {
    if (busy) return false;
    const seq = y.last.seq;
    if (g.dispatch({ type: "yours", ...c })) return false;
    if (sound) play(sound);
    setBusy(true);
    timer.current = window.setTimeout(() => {
      setBusy(false);
      const now = host.game.state.yours;
      if (now && now.last.seq > seq) resultSound(now);
    }, ms);
    return true;
  };
  const props: GameProps = { g, y, o, send, busy };
  const tot = hold.current?.total ?? y.total;
  const net = tot.won - tot.wagered;
  // A settled win lights the room up; a big one rains coins.
  const won = y.fam !== "slot" && !busy && y.last.seq > 0 && y.last.won > y.last.wagered;
  const big = won && (!!y.last.big || y.last.won >= y.last.wagered * 10);
  return (
    <div className={`play ${won ? "won" : ""}`}>
      {big && <Shower seq={y.last.seq} />}
      <div className="play-head">
        <div>
          <b>{def.slot ? compiledOf(g.state, o)?.d.name ?? def.name : def.name}</b>
          <small>{tdef ? tdef.rules.map((r, k) => `${r.name} ${r.opts[ruleOf(o.rules, k)]}`).concat(`${money(limitsNow(g, o)[0])}–${money(limitsNow(g, o)[1])}`).join(" · ") : slotLine(g, o)}</small>
        </div>
        <button className="btn" disabled={!!y.out || busy} onClick={() => { play("click"); g.dispatch({ type: "yours", act: "close" }); }}>Leave</button>
      </div>
      <div className="play-body">
        {y.fam === "slot" && <Slots g={g} o={o} onBusy={setBusy} />}
        {y.fam === "vpoker" && <VideoPoker {...props} />}
        {y.fam === "blackjack" && <Blackjack {...props} />}
        {y.fam === "roulette" && <Roulette {...props} />}
        {y.fam === "craps" && <Craps {...props} />}
        {y.fam === "baccarat" && <Baccarat {...props} />}
        {y.fam === "keno" && <Keno {...props} />}
      </div>
      <div className="play-foot muted num">
        {(hold.current?.seq ?? y.last.seq) ? `${hold.current?.seq ?? y.last.seq} played · ${money(tot.wagered)} bet · ` : ""}{net >= 0 ? "up" : "down"} {money(Math.abs(net))} · the house's money
      </div>
    </div>
  );
}

/** The outcome line; a win counts up with a patter of coins. */
function Result({ y, busy }: { y: YourPlay; busy: boolean }) {
  const net = y.last.won - y.last.wagered;
  const shown = useCount(!busy && net > 0 ? net : 0, y.last.seq);
  if (busy || !y.last.seq) return <div className="result"> </div>;
  if (net > 0) {
    const t = y.last.big ? `${y.last.big[0].toUpperCase()}${y.last.big.slice(1)}! ` : "";
    return <div className="result lv-good win-pop">{t}You win {money(shown)}</div>;
  }
  return <div className={`result ${net < 0 ? "neg" : ""}`}>{resultText(y)}</div>;
}

/** Counts from 0 to `to` over about a second (restarts per `key`), ticking coins as it goes. */
function useCount(to: number, key: number): number {
  const [v, set] = useState(to);
  useEffect(() => {
    if (to <= 0) { set(to); return; }
    const t0 = performance.now(), dur = Math.min(1600, 500 + 120 * Math.log2(1 + to));
    let raf = 0, ticks = 0;
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / dur);
      set(to * (1 - (1 - u) ** 3));
      if (u * 10 > ticks) { ticks++; play("coin"); }
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, key]);
  return v;
}

/** Gold coins raining down over the table (a big win). */
function Shower({ seq }: { seq: number }) {
  const coins = useMemo(() => Array.from({ length: 36 }, () => ({
    left: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 0.9}s`, animationDuration: `${1.4 + Math.random() * 1.2}s`,
    width: `${14 + Math.random() * 12}px`,
  })), [seq]);
  return <div className="shower" aria-hidden>{coins.map((c, k) => <i key={k} style={{ ...c, height: c.width }} />)}</div>;
}

/** Real chip colors by size, smallest first. */
const CHIP_COLORS = ["#e8e2d4", "#c1121f", "#1d4fb8", "#12803f", "#1a1a1a", "#6a2ea0", "#e07a12"];

/** Chips to pick a bet between the table's limits. */
function Chips({ min, max, value, set }: { min: number; max: number; value: number; set: (v: number) => void }) {
  const opts = [...new Set([1, 2, 5, 10, 25, 50, 100].map((k) => min * k).filter((v) => v <= max).concat(max))].slice(0, 7);
  return (
    <div className="chips">
      {opts.map((v, k) => (
        <button key={v} className={`chip ${value === v ? "on" : ""} ${k === 0 ? "light" : ""}`} style={{ "--c": CHIP_COLORS[k] } as CSSProperties} onClick={() => { play("chips"); set(v); }}>
          <span>{money(v)}</span>
        </button>
      ))}
    </div>
  );
}
function useUnit(g: Game, o: PlacedObject): [number, (v: number) => void, number, number] {
  const [min, max] = limitsNow(g, o);
  const [u, set] = useState(min);
  return [Math.min(max, Math.max(min, u)), set, min, max];
}

/**
 * A playing card. It slides in from the shoe after `delay` ms and turns face up; a card that stays face down
 * (the dealer's hole card) turns over in place when it's shown.
 */
function Card({ c, back, held, onClick, delay = 0 }: { c: number; back?: boolean; held?: boolean; onClick?: () => void; delay?: number }) {
  useEffect(() => {
    const t = setTimeout(() => play("card"), delay);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const s = Math.floor(c / 13), r = RANKS[rankOf(c)], red = s === 1 || s === 2, face = rankOf(c) >= 9 && rankOf(c) <= 11;
  const corner = <><span>{r}</span><span>{SUITS[s]}</span></>;
  return (
    <div className={`card ${held ? "held" : ""}`} style={{ animationDelay: `${delay}ms` }} onClick={onClick}>
      <div className={`card-in ${back ? "down" : "up"}`} style={{ animationDelay: `${delay}ms` }}>
        <div className={`face front ${red ? "red" : ""}`}>
          <b className="tl">{corner}</b>
          {face ? <div className="court"><span>{r}</span><small>{SUITS[s]}</small></div> : <div className="pip">{SUITS[s]}</div>}
          <b className="br">{corner}</b>
        </div>
        <div className="face back" />
      </div>
      {held && <i>HELD</i>}
    </div>
  );
}
/** An empty place where a card will go. */
const Slot = () => <div className="card slot" />;

/** Re-renders every animation frame while `on`. */
function useRaf(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const step = () => { set((k) => k + 1); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on]);
}

/** When the result of the move in progress arrived (performance.now()), or 0 while it's still coming. */
function useArrival(y: YourPlay, busy: boolean): number {
  const at = useRef({ seq: y.last.seq, t: 0 });
  if (!busy) at.current = { seq: y.last.seq, t: 0 };
  else if (y.last.seq !== at.current.seq && !at.current.t) at.current.t = performance.now();
  return at.current.t;
}

/** Re-renders every `ms` while `on`, for animations. */
function useFrames(on: boolean, ms = 80): number {
  const [n, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => set((k) => k + 1), ms);
    return () => clearInterval(t);
  }, [on, ms]);
  return n;
}

// ---- Slots (M8): the design's own machine (ui/slot/Machine.tsx).
/** Bet levels a design offers, in credits: its minimum, a few steps up, and its maximum. */
export function betLevels(min: number, max: number): number[] {
  const out = new Set<number>([min]);
  for (const k of [2, 3, 5, 10, 15, 20, 25, 50, 100]) if (min * k < max) out.add(min * k);
  out.add(max);
  return [...out].sort((a, b) => a - b);
}
function Slots({ g, o, onBusy }: { g: Game; o: PlacedObject; onBusy: (b: boolean, bet?: number) => void }) {
  const c = compiledOf(g.state, o)!, m = c.model, mult = stakeMult(g, o);
  const levels = betLevels(m.minCredits ?? 1, m.maxCredits);
  const [lv, setLv] = useState(Math.min(levels.length - 1, 1));
  const [err, setErr] = useState("");
  const credits = levels[Math.min(lv, levels.length - 1)];
  const bet = betOf(m, credits) * mult;
  // M8.5: the machine's own live meters and collector.
  const host = { meters: g.state.meters, own: o, id: designIdOf(o) };
  const meters = c.levels.map((_, i) => meterValue(host, c, i));
  return (
    <>
      <Machine c={c} credit={g.state.cash} bet={bet} onBusy={(b) => onBusy(b, bet)} meters={meters} col={o.col ?? 0}
        onBet={(dir) => setLv((k) => (dir === "max" ? levels.length - 1 : Math.max(0, Math.min(levels.length - 1, k + dir))))}
        onOffer={(act) => { const e = g.dispatch({ type: "yours", act }); if (e) setErr(e); }}
        spin={() => {
          // The command applies on the sim's next tick: wait for the spin to come back.
          const before = g.state.yours?.spin;
          const e = g.dispatch({ type: "yours", act: "spin", bet: credits });
          setErr(e ?? "");
          if (e) return null;
          return new Promise((done) => {
            const t0 = performance.now();
            const poll = () => {
              const y = g.state.yours;
              if (y && y.spin && y.spin !== before) done(y.spin);
              else if (!y || performance.now() - t0 > 5000) done(null);
              else requestAnimationFrame(poll);
            };
            poll();
          });
        }} />
      {err && <div className="result neg">{err}</div>}
    </>
  );
}

// ---- Video poker.
function VideoPoker({ g, y, o, send, busy }: GameProps) {
  const [min, max] = limitsOf(o), mult = stakeMult(g, o), most = Math.max(1, Math.round(max / min));
  const [coins, setCoins] = useState(most);
  const [held, setHeld] = useState<number[]>([]);
  const prev = useRef<number[] | undefined>(undefined);
  useEffect(() => { if (y.phase === "act") setHeld([]); }, [y.phase]);
  const pay = ruleOf(o.rules, 0), act = y.phase === "act";
  // Cards that changed since the last screen are dealt in turn.
  const cards = y.cards, was = prev.current;
  useEffect(() => { prev.current = cards?.slice(); });
  let order = 0;
  const hand = !act && !busy && cards && y.last.seq ? vpHand(cards) : -1;
  return (
    <>
      <div className="cards vp">
        {Array.from({ length: 5 }, (_, k) => {
          const c = cards?.[k];
          if (c === undefined) return <Slot key={`s${k}`} />;
          const fresh = !was || was[k] !== c;
          return <Card key={`${k}-${c}`} c={c} delay={fresh ? 110 * order++ : 0} held={act && held.includes(k)} onClick={act ? () => { play("click"); setHeld((h) => (h.includes(k) ? h.filter((q) => q !== k) : [...h, k])); } : undefined} />;
        })}
      </div>
      <Result y={y} busy={busy} />
      {act ? <p className="muted center">Tap the cards to hold, then draw.</p> : (
        <div className="row center">
          {Array.from({ length: most }, (_, k) => k + 1).map((c) => (
            <button key={c} className={`pill ${coins === c ? "on" : ""}`} onClick={() => { play("click"); setCoins(c); }}>{c}</button>
          ))}
          <span className="muted">coins · {money(min * coins * mult)}</span>
        </div>
      )}
      <button className="btn big go" disabled={busy} onClick={() => (act ? send({ act: "draw", held }, 650) : send({ act: "deal", bet: coins }, 700))}>{act ? "Draw" : "Deal"}</button>
      <div className="paytable">
        {[9, 8, 7, 6, 5, 4, 3, 2, 1].map((h) => <div key={h} className={h === hand ? "on" : ""}><span>{VP_HANDS[h]}</span><span className="num">{money(vpX(pay, h) * min * (act ? y.out / min / mult : coins) * mult)}</span></div>)}
      </div>
    </>
  );
}

// ---- Blackjack.
function Blackjack({ g, y, o, send, busy }: GameProps) {
  const [u, setU, min, max] = useUnit(g, o);
  const act = y.phase === "act", moves = yourMoves(y);
  const dealer = y.dealer ?? [];
  const showDealer = !act;
  const nat = ruleOf(o.rules, 0) === 1 ? "6:5" : "3:2";
  // The opening deal goes player, dealer, player, dealer; the dealer's later cards come one by one after the hole card turns.
  const pDelay = (k: number) => (k < 2 ? 2 * k * 170 : 0), dDelay = (k: number) => (k < 2 ? (2 * k + 1) * 170 : 350 + (k - 2) * 350);
  return (
    <>
      <div className="felt-arc">
        <div className="hand-label">Dealer {showDealer && dealer.length && !busy ? `· ${bjTotal(dealer).t}` : ""}</div>
        <div className="cards">
          {dealer.length ? dealer.map((c, k) => <Card key={`${k}-${c}`} c={c} back={k === 1 && !showDealer} delay={dDelay(k)} />) : <><Slot /><Slot /></>}
        </div>
        <div className="shoe" aria-hidden />
      </div>
      {(y.hands ?? [{ cards: [], bet: 0, done: 0 }]).map((h, i) => (
        <div key={i} className={act && i === y.cur ? "hand on" : "hand"}>
          <div className="hand-label">{y.hands && y.hands.length > 1 ? `Hand ${i + 1}` : "You"} {h.cards.length ? `· ${bjTotal(h.cards).t}` : ""} {h.bet ? `· ${money(h.bet)}` : ""}</div>
          <div className="cards">{h.cards.length ? h.cards.map((c, k) => <Card key={`${k}-${c}`} c={c} delay={y.hands!.length > 1 ? 0 : pDelay(k)} />) : <><Slot /><Slot /></>}</div>
        </div>
      ))}
      <Result y={y} busy={busy && !act} />
      {act ? (
        <div className="row center">
          {moves.map((m) => <button key={m} className="btn" disabled={busy} onClick={() => send({ act: m }, m === "stand" || m === "double" ? 1500 : 350)}>{m[0].toUpperCase() + m.slice(1)}</button>)}
        </div>
      ) : (
        <>
          <Chips min={min} max={max} value={u} set={setU} />
          <button className="btn big go" disabled={busy} onClick={() => send({ act: "deal", bet: u }, 900, "chips")}>Deal {money(u)}</button>
        </>
      )}
      <p className="muted center">Blackjack pays {nat}. Dealer {ruleOf(o.rules, 2) ? "hits" : "stands on"} soft 17. Double any two cards; split once.</p>
    </>
  );
}

// ---- Roulette.
function Roulette({ g, y, o, send, busy }: GameProps) {
  const [u, setU, min, max] = useUnit(g, o);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [hist, setHist] = useState<number[]>([]);
  const n = pockets(o.rules), order = WHEEL[n] ?? WHEEL[38];
  const arrived = useArrival(y, busy);
  useRaf(busy);
  // The wheel turns; the ball runs the other way round the track, drops and bounces into the result's pocket.
  const anim = useRef({ w: 0, r: 0, t: performance.now(), w0: 0, r0: 0, clacks: 0 });
  const a = anim.current, now = performance.now(), dt = Math.min(0.05, (now - a.t) / 1000), step = 360 / n;
  a.t = now;
  let ballR = 0.74;
  if (busy && !arrived) {
    // The croupier spins the wheel; the ball is launched once the result is known (a tick later).
    a.w += 90 * dt;
    a.w0 = a.w; a.r0 = a.r; a.clacks = 0;
    ballR = 0.97;
  } else if (busy) {
    const u = Math.min(1, (now - arrived) / SPIN_MS.wheel), target = order.indexOf(y.pocket ?? 0) * step;
    a.w = a.w0 + 420 * (1 - (1 - u) ** 2);
    // Relative to the wheel, the ball runs four-plus turns backwards and ends on the result's pocket.
    const rf = target - 360 * Math.ceil((target - a.r0 + 1440) / 360);
    a.r = a.r0 + (rf - a.r0) * (1 - (1 - u) ** 3);
    const drop = Math.max(0, Math.min(1, (u - 0.62) / 0.3));
    ballR = 0.97 - 0.23 * drop + (drop > 0 && drop < 1 ? 0.06 * Math.abs(Math.sin(drop * Math.PI * 3)) * (1 - drop) : 0);
    const c = [0.66, 0.74, 0.8, 0.9].filter((q) => u >= q).length;
    if (c > a.clacks) { a.clacks = c; play("ball"); }
  }
  const showBall = busy || y.last.seq > 0;
  const ballAng = ((a.w + a.r) * Math.PI) / 180;
  useEffect(() => { if (!busy && y.pocket !== undefined && y.last.seq) setHist((h) => [y.pocket!, ...h].slice(0, 12)); }, [busy]); // eslint-disable-line
  const total = Object.values(bets).reduce((s, v) => s + v, 0);
  const add = (s: string) => { if (busy) return; play("chips"); setBets((b) => ({ ...b, [s]: (b[s] ?? 0) + u })); };
  const label = (k: number) => (k === 37 ? "00" : String(k));
  const colour = (k: number) => (k === 0 || k === 37 ? "green" : RED.has(k) ? "red" : "black");
  const fill = { green: "#0d7a3e", red: "#b3141c", black: "#161616" };
  const settled = !busy && y.pocket !== undefined && y.last.seq;
  const spot = (s: string, text: string, cls = "") => (
    <button className={`spot ${cls} ${settled && rouletteHit(s, y.pocket!) ? "hit" : ""}`} onClick={() => add(s)}>{text}{bets[s] ? <i>{money(bets[s])}</i> : null}</button>
  );
  const R = 100, wedge = (j: number) => {
    const a0 = ((j - 0.5) * step - 90) * (Math.PI / 180), a1 = ((j + 0.5) * step - 90) * (Math.PI / 180), ro = 96, ri = 70;
    return `M${R + ro * Math.cos(a0)} ${R + ro * Math.sin(a0)} A${ro} ${ro} 0 0 1 ${R + ro * Math.cos(a1)} ${R + ro * Math.sin(a1)} L${R + ri * Math.cos(a1)} ${R + ri * Math.sin(a1)} A${ri} ${ri} 0 0 0 ${R + ri * Math.cos(a0)} ${R + ri * Math.sin(a0)}Z`;
  };
  const face = useMemo(() => (
    <>
      {order.map((k, j) => <path key={j} d={wedge(j)} fill={fill[colour(k)]} stroke="#c99a3e" strokeWidth=".6" />)}
      {order.map((k, j) => (
        <text key={`t${j}`} x={R} y={R - 84} transform={`rotate(${j * step} ${R} ${R})`} fill="#fff" fontSize="7.5" fontWeight="700" textAnchor="middle" dominantBaseline="middle">{label(k)}</text>
      ))}
      <circle cx={R} cy={R} r="70" fill="url(#cone)" stroke="#c99a3e" />
      <circle cx={R} cy={R} r="46" fill="#5a3a1c" opacity=".55" />
      <path d={`M${R - 30} ${R}H${R + 30}M${R} ${R - 30}V${R + 30}`} stroke="#f2d27a" strokeWidth="4" strokeLinecap="round" />
      <circle cx={R} cy={R} r="8" fill="#f2d27a" stroke="#8a6424" />
    </>
  ), [n]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {/* The wheel and the result stay in view over the board as it scrolls. */}
      <div className="row center wheel-row pinned">
        <svg className="wheel" viewBox="0 0 200 200" width="190" height="190">
          <defs>
            <radialGradient id="wood" cx="40%" cy="35%"><stop offset="0" stopColor="#8a5c3a" /><stop offset="1" stopColor="#3a2014" /></radialGradient>
            <radialGradient id="cone" cx="40%" cy="35%"><stop offset="0" stopColor="#f2d27a" /><stop offset=".5" stopColor="#8a6424" /><stop offset="1" stopColor="#3a2410" /></radialGradient>
          </defs>
          <circle cx={R} cy={R} r="100" fill="url(#wood)" />
          <circle cx={R} cy={R} r="97" fill="#1b0e14" />
          <g transform={`rotate(${a.w} ${R} ${R})`}>{face}</g>
          {showBall && <circle cx={R + R * ballR * Math.cos(ballAng - Math.PI / 2)} cy={R + R * ballR * Math.sin(ballAng - Math.PI / 2)} r="4.2" fill="#fbfbf6" stroke="#999" strokeWidth=".6" />}
        </svg>
        <div className="wheel-side">
          <div className={`pocket ${settled ? colour(y.pocket!) : ""} ${settled ? "land" : ""}`} key={settled ? `p${y.last.seq}` : "x"}>{settled ? label(y.pocket!) : "–"}</div>
          <div className="hist">{hist.map((k, i) => <span key={i} className={colour(k)}>{label(k)}</span>)}</div>
          <Result y={y} busy={busy} />
        </div>
      </div>
      <Chips min={min} max={max} value={u} set={setU} />
      <div className="board">
        <div className="zeros">{spot("n0", "0", "green")}{n === 38 && spot("n00", "00", "green")}</div>
        <div className="nums">
          {Array.from({ length: 36 }, (_, i) => i + 1).map((k) => spot(`n${k}`, String(k), colour(k)))}
          {spot("c1", "2:1")}{spot("c2", "2:1")}{spot("c3", "2:1")}
        </div>
        <div className="outs3">{spot("d1", "1st 12")}{spot("d2", "2nd 12")}{spot("d3", "3rd 12")}</div>
        <div className="outs6">{spot("low", "1-18")}{spot("even", "Even")}{spot("red", "Red", "red")}{spot("black", "Black", "black")}{spot("odd", "Odd")}{spot("high", "19-36")}</div>
      </div>
      <div className="row center">
        <button className="btn" disabled={busy || !total} onClick={() => { play("click"); setBets({}); }}>Clear</button>
        <button className="btn big go" disabled={busy || !total} onClick={() => send({ act: "spin", bets }, SPIN_MS.wheel + 250, "spin")}>Spin {total ? money(total) : ""}</button>
      </div>
    </>
  );
}

/** Whether a board spot covers pocket k (for lighting the winning spots). */
function rouletteHit(s: string, k: number): boolean {
  if (s[0] === "n") return (s === "n00" ? 37 : Number(s.slice(1))) === k;
  if (k === 0 || k === 37) return false;
  if (s === "red") return RED.has(k);
  if (s === "black") return !RED.has(k);
  if (s === "odd") return k % 2 === 1;
  if (s === "even") return k % 2 === 0;
  if (s === "low") return k <= 18;
  if (s === "high") return k >= 19;
  if (s[0] === "d") return Math.ceil(k / 12) === Number(s[1]);
  if (s[0] === "c") return ((k - 1) % 3) + 1 === Number(s[1]);
  return false;
}

/** A die with real pips. */
function Die({ v, roll, i }: { v: number; roll: boolean; i: number }) {
  const PIPS = [[4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]][v];
  return (
    <div className={`die ${roll ? "roll" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
      {Array.from({ length: 9 }, (_, k) => <i key={k} className={PIPS.includes(k) ? "on" : ""} />)}
    </div>
  );
}

// ---- Craps.
function Craps({ g, y, o, send, busy }: GameProps) {
  const [u, setU, min, max] = useUnit(g, o);
  const [side, setSide] = useState<"pass" | "dp">("pass");
  const [odds, setOdds] = useState(0);
  const [t0, setT0] = useState(0);
  useRaf(busy);
  const arrived = useArrival(y, busy);
  const point = y.point ?? 0, line = (y.line?.[0] ?? 0) + (y.line?.[1] ?? 0);
  const room = point ? oddsAllowed(o.rules, point) * line - (y.odds ?? 0) : 0;
  useEffect(() => { setOdds(0); }, [point]);
  // The dice tumble across the felt, bounce off the back wall and settle on the result.
  const tumbling = busy && (!arrived || performance.now() - t0 < SPIN_MS.dice - 150);
  const f = Math.floor(performance.now() / 70);
  const dice = tumbling ? [f % 6, (f * 5 + 2) % 6] : y.dice ? [y.dice[0] - 1, y.dice[1] - 1] : [5, 4];
  const landed = useRef(false);
  useEffect(() => {
    if (tumbling) landed.current = false;
    else if (!landed.current && busy) { landed.current = true; play("dice"); }
  });
  const roll = (bets: Record<string, number>) => { if (send({ act: "roll", bets }, SPIN_MS.dice + 100, "dice")) { setT0(performance.now()); return true; } return false; };
  return (
    <>
      <div className="craps-felt">
        <div className="dice" key={busy ? `r${t0}` : "idle"}>{dice.map((d, i) => <Die key={i} v={d} roll={busy} i={i} />)}</div>
        <div className={`puck ${point ? "on" : ""}`}>{point ? `ON ${point}` : "OFF"}</div>
        {!busy && y.dice && y.last.seq > 0 && <div className="sum">{y.dice[0] + y.dice[1]}</div>}
      </div>
      <Result y={y} busy={busy || !!point} />
      {point ? (
        <>
          <p className="center">{y.line?.[0] ? "Pass line" : "Don't pass"} {money(line)}{y.odds ? ` · odds ${money(y.odds)}` : ""}. {y.line?.[0] ? `Roll a ${point} before a 7.` : `A 7 before the ${point}.`}</p>
          {room > 0 && (
            <div className="row center">
              <button className="btn" disabled={busy || odds + u > room + 1e-9} onClick={() => { play("chips"); setOdds(odds + u); }}>Odds +{money(u)}</button>
              <span className="muted">{odds ? `${money(odds)} more on this roll · ` : ""}up to {money(room)} (true odds, no edge)</span>
            </div>
          )}
          <Chips min={min} max={max} value={u} set={setU} />
          <button className="btn big go" disabled={busy} onClick={() => { if (roll(odds ? { odds } : {})) setOdds(0); }}>Roll</button>
        </>
      ) : (
        <>
          <div className="row center">
            <button className={`btn ${side === "pass" ? "on" : ""}`} onClick={() => { play("click"); setSide("pass"); }}>Pass line</button>
            <button className={`btn ${side === "dp" ? "on" : ""}`} onClick={() => { play("click"); setSide("dp"); }}>Don't pass</button>
          </div>
          <Chips min={min} max={max} value={u} set={setU} />
          <button className="btn big go" disabled={busy} onClick={() => roll({ [side]: u })}>Come out · {money(u)}</button>
        </>
      )}
    </>
  );
}

// ---- Baccarat.
function Baccarat({ g, y, o, send, busy }: GameProps) {
  const [u, setU, min, max] = useUnit(g, o);
  const [bets, setBets] = useState<Record<string, number>>({ player: 0, banker: 0, tie: 0 });
  const [t0, setT0] = useState(0);
  useFrames(busy, 60);
  const dealt = busy ? Math.floor((performance.now() - t0) / 380) : 99;
  const total = bets.player + bets.banker + bets.tie;
  const comm = ruleOf(o.rules, 0) === 1 ? "4%" : "5%";
  // Deal order: player, banker, player, banker, then the third cards.
  const order: ["p" | "b", number][] = [["p", 0], ["b", 0], ["p", 1], ["b", 1]];
  if ((y.bac?.p.length ?? 0) > 2) order.push(["p", 2]);
  if ((y.bac?.b.length ?? 0) > 2) order.push(["b", 2]);
  const upTo = (who: "p" | "b") => (y.bac?.[who] ?? []).filter((_, k) => order.findIndex(([w, i]) => w === who && i === k) < dealt);
  const P = upTo("p"), B = upTo("b");
  const done = !busy && y.last.seq > 0 && y.bac, pt = y.bac ? bacTotal(y.bac.p) : 0, bt = y.bac ? bacTotal(y.bac.b) : 0;
  const bet = (k: string, label: string, pays: string) => (
    <button className={`spot big ${bets[k] ? "on" : ""} ${done && (k === "player" ? pt > bt : k === "banker" ? bt > pt : pt === bt) ? "hit" : ""}`} onClick={() => { if (busy) return; play("chips"); setBets((b) => ({ ...b, [k]: b[k] + u })); }}>
      {label}<small>{pays}</small>{bets[k] ? <i>{money(bets[k])}</i> : null}
    </button>
  );
  const side = (name: string, cards: number[], winner: boolean) => (
    <div className={winner ? "bac-side won" : "bac-side"}>
      <div className="hand-label">{name} {cards.length ? `· ${bacTotal(cards)}` : ""}</div>
      <div className="cards">{cards.length ? cards.map((c, k) => <Card key={`${k}-${c}-${y.last.seq}`} c={c} />) : <><Slot /><Slot /></>}</div>
    </div>
  );
  return (
    <>
      <div className="bac">
        {side("Player", P, !!done && pt > bt)}
        {side("Banker", B, !!done && bt > pt)}
      </div>
      <Result y={y} busy={busy} />
      <Chips min={min} max={max} value={u} set={setU} />
      <div className="row center">{bet("player", "Player", "1 to 1")}{bet("tie", "Tie", "8 to 1")}{bet("banker", "Banker", `1 to 1, ${comm} off`)}</div>
      <div className="row center">
        <button className="btn" disabled={busy || !total} onClick={() => { play("click"); setBets({ player: 0, banker: 0, tie: 0 }); }}>Clear</button>
        <button className="btn big go" disabled={busy || !total} onClick={() => { if (send({ act: "deal", bets: Object.fromEntries(Object.entries(bets).filter(([, v]) => v > 0)) }, 2500)) setT0(performance.now()); }}>Deal {total ? money(total) : ""}</button>
      </div>
    </>
  );
}

// ---- Keno.
function Keno({ g, y, o, send, busy }: GameProps) {
  const [u, setU, min, max] = useUnit(g, o);
  const [picks, setPicks] = useState<number[]>(y.picks ?? []);
  const [t0, setT0] = useState(0);
  useFrames(busy, 50);
  const shown = busy ? Math.min(20, Math.floor((performance.now() - t0) / 130)) : 20;
  const lastShown = useRef(shown);
  const balls = (y.drawn ?? []).slice(0, y.last.seq ? shown : 0);
  useEffect(() => { if (busy && shown > lastShown.current) play(picks.includes(balls[balls.length - 1]) ? "chime" : "ball"); lastShown.current = shown; });
  const drawn = new Set(balls);
  const ok = KENO_SPOTS.includes(picks.length);
  const toggle = (k: number) => {
    if (busy) return;
    play("click");
    setPicks((p) => (p.includes(k) ? p.filter((q) => q !== k) : p.length < Math.max(...KENO_SPOTS) ? [...p, k] : p));
  };
  const table = KENO_PAYS[ok ? picks.length : KENO_SPOTS[0]];
  const hits = balls.filter((b) => picks.includes(b)).length;
  return (
    <>
      <div className="keno-tray">
        {balls.length ? balls.slice(-8).map((b) => <span key={b} className={`kball ${picks.includes(b) ? "hit" : ""}`}>{b}</span>) : <span className="muted">20 balls are drawn</span>}
        {y.last.seq > 0 && <b className="catch">{hits} caught</b>}
      </div>
      <div className="keno">
        {Array.from({ length: 80 }, (_, i) => i + 1).map((k) => (
          <button key={k} className={`${picks.includes(k) ? "pick" : ""} ${drawn.has(k) ? (picks.includes(k) ? "hit" : "drawn") : ""}`} onClick={() => toggle(k)}>{k}</button>
        ))}
      </div>
      <Result y={y} busy={busy} />
      <p className="muted center">{ok ? `${picks.length} spots` : `Pick ${KENO_SPOTS.join(", ")} numbers`} · {Object.entries(table).map(([c, x]) => `${c} catch ${x}×`).join(" · ")}</p>
      <Chips min={min} max={max} value={u} set={setU} />
      <div className="row center">
        <button className="btn" disabled={busy || !picks.length} onClick={() => { play("click"); setPicks([]); }}>Clear</button>
        <button className="btn big go" disabled={busy || !ok} onClick={() => { if (send({ act: "draw", picks, bet: u }, 2900)) setT0(performance.now()); }}>Draw · {money(u)}</button>
      </div>
    </>
  );
}
