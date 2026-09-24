// Playing the games yourself (FOUNDATIONS §23; docs/spec/play.md): a full-screen table or machine over the floor.
// The casino keeps running; every move is a `yours` command, and the screen animates the result it brings back.
import { useEffect, useRef, useState } from "react";
import { OBJECTS } from "../data/objects";
import { SLOT_MODELS } from "../data/games";
import { KENO_PAYS, KENO_SPOTS, RED, TABLE_GAMES, oddsAllowed, pockets, ruleOf } from "../data/tables";
import { play } from "../platform/audio";
import { VP_HANDS, bacTotal, betOf, bjTotal, limitsNow, limitsOf, rankOf, stakeMult, vpX, yourMoves, type Game, type PlacedObject, type YourPlay } from "../sim";
import { stake as money } from "./format";
import type { Host } from "./host";

type Send = (c: { act: string; bet?: number; bets?: Record<string, number>; held?: number[]; picks?: number[] }, ms: number, sound?: string) => boolean;
interface GameProps { g: Game; y: YourPlay; o: PlacedObject; send: Send; busy: boolean }

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["♠", "♥", "♦", "♣"];
const SYMBOLS: Record<string, string[]> = {
  cherry: ["·", "🍒", "🍋", "🍊", "🔔", "⭐", "7", "💎"],
  bell: ["·", "🔔", "🍀", "⭐", "BAR", "7", "💎", "👑"],
  bolt: ["·", "⚡", "🌩️", "💰", "7", "💎", "👑", "🔥"],
};
const DICE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function resultSound(y: YourPlay) {
  const { won, wagered, big } = y.last;
  play(big ? "jackpot" : won >= wagered * 10 && won > 0 ? "bigwin" : won > wagered ? "win" : won > 0 ? "chips" : "lose");
}
function resultText(y: YourPlay): string {
  if (!y.last.seq) return "";
  const net = y.last.won - y.last.wagered;
  return y.last.big ? `${y.last.big[0].toUpperCase()}${y.last.big.slice(1)}! You win ${money(y.last.won)}` : net > 0 ? `You win ${money(net)}` : net < 0 ? `You lose ${money(-net)}` : "Push";
}

export function PlayScreen({ host }: { host: Host }) {
  const g = host.game, y = g.state.yours!, o = g.objById.get(y.obj);
  const [busy, setBusy] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
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
  const net = y.total.won - y.total.wagered;
  return (
    <div className="play">
      <div className="play-head">
        <div>
          <b>{def.name}</b>
          <small>{tdef ? tdef.rules.map((r, k) => `${r.name} ${r.opts[ruleOf(o.rules, k)]}`).concat(`${money(limitsNow(g, o)[0])}–${money(limitsNow(g, o)[1])}`).join(" · ") : `${money(SLOT_MODELS[def.slot!].denom * stakeMult(g, o))} a credit`}</small>
        </div>
        <button className="btn" disabled={!!y.out || busy} onClick={() => { play("click"); g.dispatch({ type: "yours", act: "close" }); }}>Leave</button>
      </div>
      <div className="play-body">
        {y.fam === "slot" && <Slots {...props} />}
        {y.fam === "vpoker" && <VideoPoker {...props} />}
        {y.fam === "blackjack" && <Blackjack {...props} />}
        {y.fam === "roulette" && <Roulette {...props} />}
        {y.fam === "craps" && <Craps {...props} />}
        {y.fam === "baccarat" && <Baccarat {...props} />}
        {y.fam === "keno" && <Keno {...props} />}
      </div>
      <div className="play-foot muted num">
        {y.last.seq ? `${y.last.seq} played · ${money(y.total.wagered)} bet · ` : ""}{net >= 0 ? "up" : "down"} {money(Math.abs(net))} · the house's money
      </div>
    </div>
  );
}

function Result({ y, busy }: { y: YourPlay; busy: boolean }) {
  const t = busy ? "" : resultText(y), net = y.last.won - y.last.wagered;
  return <div className={`result ${net > 0 ? "lv-good" : net < 0 ? "neg" : ""}`}>{t || " "}</div>;
}

/** Chips to pick a bet between the table's limits. */
function Chips({ min, max, value, set }: { min: number; max: number; value: number; set: (v: number) => void }) {
  const opts = [...new Set([1, 2, 5, 10, 25, 50, 100].map((k) => min * k).filter((v) => v <= max).concat(max))].slice(0, 7);
  return (
    <div className="chips">
      {opts.map((v) => <button key={v} className={`chip ${value === v ? "on" : ""}`} onClick={() => { play("chips"); set(v); }}>{money(v)}</button>)}
    </div>
  );
}
function useUnit(g: Game, o: PlacedObject): [number, (v: number) => void, number, number] {
  const [min, max] = limitsNow(g, o);
  const [u, set] = useState(min);
  return [Math.min(max, Math.max(min, u)), set, min, max];
}

function Card({ c, back, held, onClick, fresh }: { c?: number; back?: boolean; held?: boolean; onClick?: () => void; fresh?: boolean }) {
  if (c === undefined || back) return <div className={`card back ${fresh ? "deal" : ""}`} />;
  const s = Math.floor(c / 13), red = s === 1 || s === 2;
  return (
    <div className={`card ${red ? "red" : ""} ${held ? "held" : ""} ${fresh ? "deal" : ""}`} onClick={onClick}>
      <span>{RANKS[rankOf(c)]}</span><span className="s">{SUITS[s]}</span>
      {held && <i>HELD</i>}
    </div>
  );
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

// ---- Slots.
function Slots({ g, y, o, send, busy }: GameProps) {
  const m = SLOT_MODELS[OBJECTS[o.kind].slot!], mult = stakeMult(g, o);
  const [credits, setCredits] = useState(m.maxCredits);
  const [t0, setT0] = useState(0);
  useFrames(busy, 70);
  const syms = SYMBOLS[m.look] ?? SYMBOLS.cherry;
  const elapsed = busy ? performance.now() - t0 : 1e9;
  const stops = [650, 950, 1250];
  const shown = stops.map((st, i) => (elapsed < st ? Math.floor((elapsed / 70 + i * 3) % syms.length) : y.reels?.[i] ?? 0));
  const stopped = useRef(3);
  useEffect(() => {
    if (!busy) { stopped.current = 3; return; }
    const k = stops.filter((st) => elapsed >= st).length;
    if (k > stopped.current) play("reelstop");
    else if (Math.floor(elapsed / 70) % 2 === 0 && k < 3) play("reeltick");
    stopped.current = k;
  });
  const bet = betOf(m, credits) * mult;
  const pays = m.pays.map((q, k) => ({ ...q, k })).sort((a, b) => b.x - a.x);
  return (
    <>
      <div className={`reels ${!busy && y.last.won > y.last.wagered ? "win" : ""}`}>
        {shown.map((s, i) => <div key={i} className="reel">{syms[s]}</div>)}
      </div>
      <Result y={y} busy={busy} />
      <div className="row center">
        {Array.from({ length: m.maxCredits }, (_, k) => k + 1).map((c) => (
          <button key={c} className={`pill ${credits === c ? "on" : ""}`} onClick={() => { play("click"); setCredits(c); }}>{c}</button>
        ))}
        <span className="muted">credits · {money(bet)} a spin</span>
      </div>
      <button className="btn big go" disabled={busy} onClick={() => { if (send({ act: "spin", bet: credits }, 1350)) { stopped.current = 0; setT0(performance.now()); } }}>Spin</button>
      <div className="paytable">
        {pays.map((q) => (
          <div key={q.k}><span>{q.x < 1 ? `${syms[q.k + 1]} ${syms[q.k + 1]}` : `${syms[q.k + 1]} ${syms[q.k + 1]} ${syms[q.k + 1]}`}</span><span className="num">{money(q.x * bet)}</span></div>
        ))}
      </div>
    </>
  );
}

// ---- Video poker.
function VideoPoker({ g, y, o, send, busy }: GameProps) {
  const [min, max] = limitsOf(o), mult = stakeMult(g, o), most = Math.max(1, Math.round(max / min));
  const [coins, setCoins] = useState(most);
  const [held, setHeld] = useState<number[]>([]);
  useEffect(() => { if (y.phase === "act") setHeld([]); }, [y.phase]);
  const pay = ruleOf(o.rules, 0), act = y.phase === "act";
  return (
    <>
      <div className="cards">
        {Array.from({ length: 5 }, (_, k) => (
          <Card key={k} c={y.cards?.[k]} back={!y.cards} held={act && held.includes(k)} onClick={act ? () => { play("click"); setHeld((h) => (h.includes(k) ? h.filter((q) => q !== k) : [...h, k])); } : undefined} />
        ))}
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
      <button className="btn big go" disabled={busy} onClick={() => (act ? send({ act: "draw", held }, 450, "cards") : send({ act: "deal", bet: coins }, 350, "cards"))}>{act ? "Draw" : "Deal"}</button>
      <div className="paytable">
        {[9, 8, 7, 6, 5, 4, 3, 2, 1].map((h) => <div key={h}><span>{VP_HANDS[h]}</span><span className="num">{money(vpX(pay, h) * min * (act ? y.out / min / mult : coins) * mult)}</span></div>)}
      </div>
    </>
  );
}

// ---- Blackjack.
function Blackjack({ g, y, o, send, busy }: GameProps) {
  const [u, setU, min, max] = useUnit(g, o);
  const act = y.phase === "act", moves = yourMoves(y);
  const dealer = y.dealer ?? [];
  const cardsOut = (y.hands ?? []).reduce((s, h) => s + h.cards.length, 0) + dealer.length;
  const last = useRef(cardsOut);
  useEffect(() => { if (cardsOut > last.current) play("card"); last.current = cardsOut; }, [cardsOut]);
  const showDealer = !act && !busy;
  const nat = ruleOf(o.rules, 0) === 1 ? "6:5" : "3:2";
  return (
    <>
      <div className="hand-label">Dealer {showDealer && dealer.length ? `· ${bjTotal(dealer).t}` : ""}</div>
      <div className="cards">
        {dealer.length ? dealer.map((c, k) => <Card key={k} c={c} back={k === 1 && !showDealer} />) : <><Card back /><Card back /></>}
      </div>
      {(y.hands ?? [{ cards: [], bet: 0, done: 0 }]).map((h, i) => (
        <div key={i} className={act && i === y.cur ? "hand on" : "hand"}>
          <div className="hand-label">{y.hands && y.hands.length > 1 ? `Hand ${i + 1}` : "You"} {h.cards.length ? `· ${bjTotal(h.cards).t}` : ""} {h.bet ? `· ${money(h.bet)}` : ""}</div>
          <div className="cards">{h.cards.length ? h.cards.map((c, k) => <Card key={k} c={c} />) : <><Card back /><Card back /></>}</div>
        </div>
      ))}
      <Result y={y} busy={busy && !act} />
      {act ? (
        <div className="row center">
          {moves.map((m) => <button key={m} className="btn" disabled={busy} onClick={() => send({ act: m }, m === "stand" || m === "double" ? 500 : 250)}>{m[0].toUpperCase() + m.slice(1)}</button>)}
        </div>
      ) : (
        <>
          <Chips min={min} max={max} value={u} set={setU} />
          <button className="btn big go" disabled={busy} onClick={() => send({ act: "deal", bet: u }, 500, "chips")}>Deal {money(u)}</button>
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
  const n = pockets(o.rules);
  const f = useFrames(busy, 90);
  useEffect(() => { if (!busy && y.pocket !== undefined && y.last.seq) setHist((h) => [y.pocket!, ...h].slice(0, 12)); }, [busy]); // eslint-disable-line
  const total = Object.values(bets).reduce((s, v) => s + v, 0);
  const add = (s: string) => { if (busy) return; play("chips"); setBets((b) => ({ ...b, [s]: (b[s] ?? 0) + u })); };
  const label = (k: number) => (k === 37 ? "00" : String(k));
  const colour = (k: number) => (k === 0 || k === 37 ? "green" : RED.has(k) ? "red" : "black");
  const shown = busy ? (f * 7) % n : y.pocket;
  const spot = (s: string, text: string, cls = "") => (
    <button className={`spot ${cls}`} onClick={() => add(s)}>{text}{bets[s] ? <i>{money(bets[s])}</i> : null}</button>
  );
  return (
    <>
      <div className="row center">
        <div className={`pocket ${shown === undefined ? "" : colour(shown)}`}>{shown === undefined ? "–" : label(shown)}</div>
        <div className="hist">{hist.map((k, i) => <span key={i} className={colour(k)}>{label(k)}</span>)}</div>
      </div>
      <Result y={y} busy={busy} />
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
        <button className="btn big go" disabled={busy || !total} onClick={() => send({ act: "spin", bets }, 2200, "spin")}>Spin {total ? money(total) : ""}</button>
      </div>
    </>
  );
}

// ---- Craps.
function Craps({ g, y, o, send, busy }: GameProps) {
  const [u, setU, min, max] = useUnit(g, o);
  const [side, setSide] = useState<"pass" | "dp">("pass");
  const [odds, setOdds] = useState(0);
  const f = useFrames(busy, 90);
  const point = y.point ?? 0, line = (y.line?.[0] ?? 0) + (y.line?.[1] ?? 0);
  const room = point ? oddsAllowed(o.rules, point) * line - (y.odds ?? 0) : 0;
  useEffect(() => { setOdds(0); }, [point]);
  const dice = busy ? [f % 6, (f * 5 + 2) % 6] : y.dice ? [y.dice[0] - 1, y.dice[1] - 1] : null;
  return (
    <>
      <div className="row center">
        <div className="dice">{dice ? dice.map((d, i) => <span key={i}>{DICE[d]}</span>) : <span>{DICE[5]}{DICE[4]}</span>}</div>
        <div className={`puck ${point ? "on" : ""}`}>{point ? `ON ${point}` : "OFF"}</div>
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
          <button className="btn big go" disabled={busy} onClick={() => { if (send({ act: "roll", bets: odds ? { odds } : {} }, 900, "dice")) setOdds(0); }}>Roll</button>
        </>
      ) : (
        <>
          <div className="row center">
            <button className={`btn ${side === "pass" ? "on" : ""}`} onClick={() => { play("click"); setSide("pass"); }}>Pass line</button>
            <button className={`btn ${side === "dp" ? "on" : ""}`} onClick={() => { play("click"); setSide("dp"); }}>Don't pass</button>
          </div>
          <Chips min={min} max={max} value={u} set={setU} />
          <button className="btn big go" disabled={busy} onClick={() => send({ act: "roll", bets: { [side]: u } }, 900, "dice")}>Come out · {money(u)}</button>
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
  useFrames(busy, 120);
  const dealt = busy ? Math.floor((performance.now() - t0) / 300) : 99;
  const last = useRef(dealt);
  useEffect(() => { if (busy && dealt > last.current && dealt <= 6) play("card"); last.current = dealt; });
  const total = bets.player + bets.banker + bets.tie;
  const comm = ruleOf(o.rules, 0) === 1 ? "4%" : "5%";
  // Deal order: player, banker, player, banker, then the third cards.
  const order: ["p" | "b", number][] = [["p", 0], ["b", 0], ["p", 1], ["b", 1]];
  if ((y.bac?.p.length ?? 0) > 2) order.push(["p", 2]);
  if ((y.bac?.b.length ?? 0) > 2) order.push(["b", 2]);
  const upTo = (who: "p" | "b") => (y.bac?.[who] ?? []).filter((_, k) => order.findIndex(([w, i]) => w === who && i === k) < dealt);
  const P = { shown: upTo("p") }, B = { shown: upTo("b") };
  const bet = (k: string, label: string, pays: string) => (
    <button className={`spot big ${bets[k] ? "on" : ""}`} onClick={() => { if (busy) return; play("chips"); setBets((b) => ({ ...b, [k]: b[k] + u })); }}>
      {label}<small>{pays}</small>{bets[k] ? <i>{money(bets[k])}</i> : null}
    </button>
  );
  return (
    <>
      <div className="bac">
        <div><div className="hand-label">Player {P.shown.length ? `· ${bacTotal(P.shown)}` : ""}</div><div className="cards">{P.shown.length ? P.shown.map((c, k) => <Card key={k} c={c} fresh />) : <><Card back /><Card back /></>}</div></div>
        <div><div className="hand-label">Banker {B.shown.length ? `· ${bacTotal(B.shown)}` : ""}</div><div className="cards">{B.shown.length ? B.shown.map((c, k) => <Card key={k} c={c} fresh />) : <><Card back /><Card back /></>}</div></div>
      </div>
      <Result y={y} busy={busy} />
      <Chips min={min} max={max} value={u} set={setU} />
      <div className="row center">{bet("player", "Player", "1 to 1")}{bet("tie", "Tie", "8 to 1")}{bet("banker", "Banker", `1 to 1, ${comm} off`)}</div>
      <div className="row center">
        <button className="btn" disabled={busy || !total} onClick={() => { play("click"); setBets({ player: 0, banker: 0, tie: 0 }); }}>Clear</button>
        <button className="btn big go" disabled={busy || !total} onClick={() => { if (send({ act: "deal", bets: Object.fromEntries(Object.entries(bets).filter(([, v]) => v > 0)) }, 2000)) setT0(performance.now()); }}>Deal {total ? money(total) : ""}</button>
      </div>
    </>
  );
}

// ---- Keno.
function Keno({ g, y, o, send, busy }: GameProps) {
  const [u, setU, min, max] = useUnit(g, o);
  const [picks, setPicks] = useState<number[]>(y.picks ?? []);
  const [t0, setT0] = useState(0);
  useFrames(busy, 100);
  const shown = busy ? Math.min(20, Math.floor((performance.now() - t0) / 110)) : 20;
  const lastShown = useRef(shown);
  useEffect(() => { if (busy && shown > lastShown.current && shown % 3 === 0) play("ball"); lastShown.current = shown; });
  const drawn = new Set((y.drawn ?? []).slice(0, y.last.seq ? shown : 0));
  const ok = KENO_SPOTS.includes(picks.length);
  const toggle = (k: number) => {
    if (busy) return;
    play("click");
    setPicks((p) => (p.includes(k) ? p.filter((q) => q !== k) : p.length < Math.max(...KENO_SPOTS) ? [...p, k] : p));
  };
  const table = KENO_PAYS[ok ? picks.length : KENO_SPOTS[0]];
  return (
    <>
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
        <button className="btn big go" disabled={busy || !ok} onClick={() => { if (send({ act: "draw", picks, bet: u }, 2500)) setT0(performance.now()); }}>Draw · {money(u)}</button>
      </div>
    </>
  );
}
