// The slot market in the game's panels (docs/spec/designer.md §6, "M8.6 additions"): a design's life curve, fans,
// awareness (with Market research), Evergreens, the maker's offer letter, a sold design's deal, records and wishes.
import { Fragment } from "react";
import { GUEST_TYPES } from "../../data/guests";
import { SCENARIOS } from "../../data/scenarios";
import { THOUGHTS } from "../../data/thoughts";
import {
  ageDays, awareness, designById, fanCount, fansOf, installs, machinesOf, researched, saleBlocks, wishes, MONTH_NAMES, TICKS_PER_DAY,
  dateOfDay, type Game,
} from "../../sim";
import { play } from "../../platform/audio";
import { money } from "../format";

const typeName = (t: string) => GUEST_TYPES[t]?.name ?? t;

/** Plays per day, month by month (closed months, then this month so far): a single-series bar chart. */
function LifeCurve({ g, id }: { g: Game; id: string }) {
  const s = g.state, st = s.dstats[id];
  if (!st?.hs?.length && !st?.mo) return null;
  const today = Math.floor(s.tick / TICKS_PER_DAY), dom = dateOfDay(today).day;
  const vals = [...(st.hs ?? []).map((n) => n / 30), (st.mo ?? 0) / Math.max(1, dom)];
  const max = Math.max(1e-9, ...vals), W = 280, H = 64, gap = 2, bw = Math.max(3, Math.min(18, (W - gap * vals.length) / vals.length));
  const monthOf = (k: number) => MONTH_NAMES[((dateOfDay(today).month - (vals.length - 1 - k)) % 12 + 12) % 12];
  const peak = vals.indexOf(max);
  return (
    <div className="mk-curve">
      <small className="muted">Plays per day, by month</small>
      <svg viewBox={`0 0 ${W} ${H + 12}`} width="100%" role="img" aria-label="Plays per day by month">
        <line x1="0" y1={H} x2={W} y2={H} className="mk-axis" />
        {vals.map((v, k) => {
          const h = Math.max(1, (v / max) * (H - 12)), x = k * (bw + gap);
          return (
            <g key={k}>
              <path d={`M${x},${H} v${-(h - 2)} q0,-2 2,-2 h${bw - 4} q2,0 2,2 v${h - 2} z`} className={k === vals.length - 1 ? "mk-bar now" : "mk-bar"}>
                <title>{`${monthOf(k)}${k === vals.length - 1 ? " (so far)" : ""}: ${v.toFixed(1)} plays a day`}</title>
              </path>
              {(k === peak || k === vals.length - 1) && <text x={x + bw / 2} y={H - h - 2} className="mk-lbl">{v.toFixed(v < 10 ? 1 : 0)}</text>}
            </g>
          );
        })}
        <text x="1" y={H + 11} className="mk-lbl start">{monthOf(0)}</text>
        <text x={W} y={H + 11} className="mk-lbl end">now</text>
      </svg>
    </div>
  );
}

/** A design's life on the floor and beyond: age, fans, who knows it, Evergreen, the sale. */
export function DesignMarket({ g, id }: { g: Game; id: string }) {
  const s = g.state, st = s.dstats[id], rec = s.designs[id];
  if (!st || st.born < 0) return null;
  const age = ageDays(s, st), fans = fansOf(g, id), nFans = fanCount(g, id), deep = researched(s, "market");
  const types = Object.keys(fans);
  const pop = Object.keys(SCENARIOS[s.scenario]?.population ?? {}).filter((t) => GUEST_TYPES[t]);
  const known = (st.nov ?? 0) * Math.exp(-age / 100) > 0.03;
  const sale = rec?.sale;
  const blocks = rec && !sale && rec.d.origin === "own" ? saleBlocks(g, id) : [];
  return (
    <>
      <div className="kv">
        <b>On the floor</b><span>{age < 60 ? `${age} days` : `${Math.floor(age / 30)} months`}{st.ever ? " · Evergreen 🌲" : known ? " · still new to guests" : ""}</span>
        <b>Fans</b><span className="num">{nFans}{st.fans && st.fans > nFans ? ` (peak ${st.fans})` : ""}{deep && types.length ? ` · ${types.map((t) => `${typeName(t)} ${fans[t]}`).join(", ")}` : ""}</span>
        {deep && pop.length > 0 && <><b>Known to</b><span className="num">{pop.map((t) => `${typeName(t)} ${Math.round(awareness(st, t) * 100)}%`).join(", ")}</span></>}
        {sale && <><b>Sold to</b><span>{sale.maker} for {money(sale.cash)} · you keep {Math.round(sale.share * 100)}% of its edge here · {(sale.roy * 100).toFixed(1)}% royalty</span></>}
        {sale && <><b>Out there</b><span className="num">{installs(s, id, sale).toLocaleString("en-US")} machines (peak {Math.max(sale.peak, installs(s, id, sale)).toLocaleString("en-US")}) · royalties so far {money(sale.paid)}</span></>}
      </div>
      <LifeCurve g={g} id={id} />
      {!deep && <p className="muted small">Market research shows who knows this game and who its fans are.</p>}
      {sale && <p className="muted small">Its math and features belong to {sale.maker}; its looks are still yours. Its jackpots are wide-area: the maker pays them.</p>}
      {blocks.length > 0 && <p className="muted small">A slot maker might want to buy it once it has: {blocks.join(", ")}.</p>}
    </>
  );
}

/** The maker's letter, while an offer waits. */
export function OfferLetter({ g }: { g: Game }) {
  const s = g.state, o = s.offer;
  if (!o) return null;
  const d = designById(s, o.id), days = Math.max(0, Math.ceil((o.until - s.tick) / TICKS_PER_DAY));
  return (
    <div className="mk-letter">
      <b>A letter from {o.maker}</b>
      <p>We'd like to buy <b>{d?.name}</b> and build it for casinos everywhere. We offer:</p>
      <div className="kv">
        <b>Now</b><span className="num">{money(o.cash)}</span>
        <b>Your machines</b><span>you keep {Math.round(o.share * 100)}% of the house edge on your own {d?.name}; the rest is our fee</span>
        <b>Royalty</b><span>{(o.roy * 100).toFixed(1)}% of what it wins in other casinos, every month</span>
      </div>
      <p className="muted small">After a sale its math is ours (you can still restyle it), its progressives go wide-area and we pay them. Nobody knows how many we'll sell. Open {days} more day{days === 1 ? "" : "s"}.</p>
      <div className="row">
        <button className="btn on" onClick={() => { play("click"); g.dispatch({ type: "saleAnswer", yes: true }); }}>Accept</button>
        <button className="btn" onClick={() => { play("click"); g.dispatch({ type: "saleAnswer", yes: false }); }}>Decline</button>
      </div>
    </div>
  );
}

/** One line for a design's row in the Slots tab. */
export function marketLine(g: Game, id: string): string {
  const s = g.state, st = s.dstats[id], rec = s.designs[id], out: string[] = [];
  if (!st || st.born < 0 || !machinesOf(s, id).length && !rec?.sale) return "";
  const n = fanCount(g, id);
  if (n) out.push(`${n} fan${n === 1 ? "" : "s"}`);
  if (st.ever) out.push("Evergreen");
  if (rec?.sale) out.push(`sold to ${rec.sale.maker}: ${installs(s, id, rec.sale).toLocaleString("en-US")} out there`);
  return out.join(" · ");
}

/** The casino's slot records and, with Market research, what each kind of guest wishes the floor had. */
export function RecordsAndWishes({ g }: { g: Game }) {
  const s = g.state, r = s.records ?? {}, name = (id: string) => designById(s, id)?.name ?? "a retired game";
  const rows: [string, string][] = [];
  if (r.jackpot) rows.push(["Biggest jackpot", `${money(r.jackpot.v)} on ${name(r.jackpot.id)}`]);
  if (r.month) rows.push(["Most plays in a month", `${r.month.v.toLocaleString("en-US")} on ${name(r.month.id)}`]);
  if (r.fans) rows.push(["Most fans", `${r.fans.v} for ${name(r.fans.id)}`]);
  if (r.index) rows.push(["Best performance index", `${r.index.v.toFixed(2)}, ${name(r.index.id)}`]);
  const ever = Object.entries(s.dstats).filter(([, st]) => st.ever).map(([id]) => name(id));
  if (ever.length) rows.push(["Evergreens", ever.join(", ")]);
  const w = researched(s, "market") ? Object.entries(wishes(g)).filter(([, v]) => v) : [];
  if (!rows.length && !w.length) return null;
  return (
    <>
      {rows.length > 0 && <><p className="muted" style={{ margin: "10px 0 6px" }}>Records</p>
        <div className="kv">{rows.map(([k, v]) => <Fragment key={k}><b>{k}</b><span>{v}</span></Fragment>)}</div></>}
      {w.length > 0 && <><p className="muted" style={{ margin: "10px 0 6px" }}>What guests wish for</p>
        <div className="kv">{w.map(([t, id]) => <Fragment key={t}><b>{typeName(t)}</b><span>“{THOUGHTS[id]?.text ?? id}”</span></Fragment>)}</div></>}
    </>
  );
}
