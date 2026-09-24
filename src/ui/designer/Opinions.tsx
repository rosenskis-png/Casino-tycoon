// What guests think of a game kind (owner, M8.5): the last six months of thoughts had at every machine of a slot
// design, or every table of a game, with the likes and complaints apart; the performance index explained; a
// machine's live meters and collector; and the bank sign's choice of game.
import { Fragment } from "react";
import { THOUGHTS } from "../../data/thoughts";
import { OBJECTS } from "../../data/objects";
import { levelName } from "../../data/designer";
import {
  compiledOf, designById, designIdOf, gameKey, meterValue, opinionsOf, perfIndex, signDesign, PERF_INDEX_HELP, OPINION_MONTHS,
  type Game, type PlacedObject,
} from "../../sim";
import { money } from "../format";

const say = (id: string, name: string) => (THOUGHTS[id]?.text ?? id).replace("{game}", name);

/** The last six months of what guests said at this game kind. */
export function Opinions({ g, o }: { g: Game; o: PlacedObject }) {
  const key = gameKey(o);
  if (!key) return null;
  const sum = opinionsOf(g.state, key);
  const name = OBJECTS[o.kind].slot ? compiledOf(g.state, o)?.d.name ?? "" : OBJECTS[o.kind].name;
  const what = OBJECTS[o.kind].slot ? `every ${name} on the floor` : `every ${OBJECTS[o.kind].name.toLowerCase()}`;
  if (!sum || (!sum.likes.length && !sum.complaints.length && !sum.sessions)) return <p className="muted" style={{ margin: "8px 0 0" }}>What guests say at {what} shows here once they've played it.</p>;
  const row = (q: { id: string; share: number }) => <Fragment key={q.id}><b className="num">{Math.round(q.share * 100)}%</b><span>“{say(q.id, name)}”</span></Fragment>;
  const arrow = (v: number) => (v > 0.5 ? "▲" : v < -0.5 ? "▼" : "●");
  return (
    <>
      <p className="muted" style={{ margin: "8px 0 4px" }}>What guests say at {what} (last {Math.min(OPINION_MONTHS, sum.months)} month{sum.months === 1 ? "" : "s"})</p>
      <div className="kv">
        <b>Sessions</b><span className="num">{sum.sessions.toLocaleString()} · mood {Math.round(sum.mood)} when they got up{sum.trend ? ` · ${arrow(sum.trend.mood)} ${sum.trend.mood >= 0 ? "+" : ""}${sum.trend.mood.toFixed(0)} this month` : ""}</span>
        {sum.likes.length > 0 && <><b className="pos">Likes</b><span /></>}
        {sum.likes.slice(0, 4).map(row)}
        {sum.complaints.length > 0 && <><b className="neg">Complaints</b><span /></>}
        {sum.complaints.slice(0, 4).map(row)}
      </div>
    </>
  );
}

/** A designed slot's live meters, collector and performance index (with what the index means). */
export function SlotLive({ g, o }: { g: Game; o: PlacedObject }) {
  const c = compiledOf(g.state, o);
  if (!c) return null;
  const id = designIdOf(o), idx = perfIndex(g.state, id), host = { meters: g.state.meters, own: o, id };
  const n = c.levels.length, prog = c.levels.map((l, i) => ({ l, i })).filter((q) => q.l.kind !== "fixed");
  return (
    <>
      <div className="kv">
        {prog.map(({ l, i }) => <Fragment key={i}><b>{levelName(n, i)}</b><span className="num">{money(meterValue(host, c, i))} {l.kind === "linked" ? "linked" : l.kind === "mhb" ? `must hit by ${money(l.cap * c.d.maxBet * c.d.denom)}` : "on this machine"}</span></Fragment>)}
        {c.col && <><b>Collector</b><span className="num">{o.col ?? 0} / {c.col.N}</span></>}
        {idx !== null && <><b>Performance index</b><span className="num">{idx.toFixed(2)}</span></>}
      </div>
      {idx !== null && <p className="muted" style={{ margin: "4px 0 0" }}>{PERF_INDEX_HELP}</p>}
    </>
  );
}

/** A bank sign: which game it shows (the nearest linked game unless chosen). */
export function BankSignCard({ g, o }: { g: Game; o: PlacedObject }) {
  if (o.kind !== "bank_sign") return null;
  const s = g.state, shown = signDesign(g, o);
  const linked = [...new Set(s.objects.filter((q) => OBJECTS[q.kind].slot && compiledOf(s, q)?.levels.some((l) => l.kind === "linked" || l.kind === "mhb")).map(designIdOf))];
  const c = shown ? s.objects.map((q) => (designIdOf(q) === shown && OBJECTS[q.kind].slot ? compiledOf(s, q) : undefined)).find(Boolean) : undefined;
  const host = { meters: s.meters, own: {}, id: shown ?? "" };
  return (
    <>
      <div className="kv">
        <b>Shows</b><span>{shown ? designById(s, shown)?.name : "No linked game nearby"}{!o.design && shown ? " (nearest)" : ""}</span>
        {c && c.levels.map((l, i) => (l.kind === "linked" || l.kind === "mhb") && <Fragment key={i}><b>{levelName(c.levels.length, i)}</b><span className="num">{money(meterValue(host, c, i))}</span></Fragment>)}
      </div>
      <div className="dz-chips" style={{ marginTop: 6 }}>
        <button className={!o.design ? "on" : ""} onClick={() => g.dispatch({ type: "signShow", obj: o.id, id: "" })}>Nearest</button>
        {linked.map((id) => <button key={id} className={o.design === id ? "on" : ""} onClick={() => g.dispatch({ type: "signShow", obj: o.id, id })}>{designById(s, id)?.name}</button>)}
      </div>
      <p className="muted" style={{ margin: "6px 0 0" }}>A big meter pulls guests even without a sign; a sign nearby pulls them harder.</p>
    </>
  );
}

/** One line for the Slots tab: the design's top like and complaint lately. */
export function opinionLine(g: Game, id: string, name: string): string {
  const sum = opinionsOf(g.state, id);
  if (!sum) return "";
  const parts = [sum.likes[0], sum.complaints[0]].filter(Boolean).map((q) => `“${say(q!.id, name)}” ${Math.round(q!.share * 100)}%`);
  return parts.join(" · ");
}
