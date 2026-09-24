// The Slots tab (docs/spec/designer.md §11): this casino's designs with their status and numbers, the stock games,
// the library on this phone, and the way into the designer.
import { useState } from "react";
import { STOCK_DESIGNS } from "../../data/designs";
import { LAYOUTS, newDesign, type SlotDesign } from "../../data/designer";
import { RESEARCH } from "../../data/research";
import { play } from "../../platform/audio";
import { loadLibrary, parseCode, removeFromLibrary } from "../../platform/library";
import { cantUse, certPending, certified, designLocks, machinesOf, perfIndex, sanitize, TICKS_PER_DAY, type Game } from "../../sim";
import { money } from "../format";
import { opinionLine } from "./Opinions";
import { PERF_INDEX_HELP } from "../../sim";

export function SlotsPanel({ g, open, place }: { g: Game; open: (d: SlotDesign) => void; place: (id: string) => void }) {
  const s = g.state;
  const [lib, setLib] = useState(loadLibrary);
  const [code, setCode] = useState("");
  const status = (id: string) => {
    const rec = s.designs[id];
    if (!rec) return "Stock";
    if (rec.rigged) return "Uncertified";
    if (certified(s, id)) return "Certified";
    if (certPending(s, id)) return `At the lab · ${Math.ceil((rec.cert - s.tick) / TICKS_PER_DAY)} d`;
    return "Not certified";
  };
  const row = (id: string, d: SlotDesign) => {
    const n = machinesOf(s, id).length, idx = perfIndex(s, id), st = s.dstats[id];
    const why = cantUse(s, id), locks = designLocks(s, d, id);
    return (
      <div key={id} className="dz-list-row">
        <div>
          <b>{d.name}</b>
          <small>{LAYOUTS[d.layout].name} · {(d.rtp * 100).toFixed(1)}% · {status(id)}{n ? ` · ${n} on the floor` : ""}{idx !== null ? ` · index ${idx.toFixed(2)}` : ""}{st?.coinIn ? ` · won ${money(st.coinIn - st.paidOut)}` : ""}</small>
          {locks.length > 0 && <small className="neg">Research: {locks.map((q) => RESEARCH[q]?.name ?? q).join(", ")}</small>}
          {opinionLine(g, id, d.name) && <small className="muted">{opinionLine(g, id, d.name)}</small>}
        </div>
        <button className="btn" onClick={() => { play("click"); open(s.designs[id] ? d : { ...d, id: "", name: `${d.name} copy`.slice(0, 24) }); }}>{s.designs[id] ? "Open" : "Copy"}</button>
        <button className="btn on" disabled={!!why} onClick={() => { play("click"); place(id); }}>Place</button>
      </div>
    );
  };
  return (
    <>
      <p className="muted">Design your own machines: the math, the features, the look and the sound. Test them in the lab, certify them, and let the floor decide.</p>
      <div className="grid"><button className="btn on" onClick={() => { play("click"); open(newDesign("")); }}>New design<small>starts in the slot designer</small></button></div>
      <p className="muted" style={{ margin: "10px 0 6px" }}>Your designs</p>
      <p className="muted small">{PERF_INDEX_HELP}</p>
      {Object.keys(s.designs).length ? Object.entries(s.designs).map(([id, rec]) => row(id, rec.d)) : <p className="muted">None yet.</p>}
      <p className="muted" style={{ margin: "10px 0 6px" }}>Stock games</p>
      {Object.entries(STOCK_DESIGNS).map(([id, d]) => row(id, d))}
      <p className="muted" style={{ margin: "10px 0 6px" }}>Library (this phone)</p>
      {lib.length ? lib.map((e) => (
        <div key={e.key} className="dz-list-row">
          <div><b>{e.d.name}</b><small>{LAYOUTS[e.d.layout]?.name} · {(e.d.rtp * 100).toFixed(1)}%{e.ex !== undefined ? ` · Excitement ${e.ex.toFixed(1)} · Intensity ${e.int?.toFixed(1)}` : ""}</small></div>
          <button className="btn" onClick={() => { play("click"); open(sanitize({ ...e.d, id: "", origin: "imported" })); }}>Use</button>
          <button className="btn" onClick={() => setLib(removeFromLibrary(e.key))}>✕</button>
        </div>
      )) : <p className="muted">Save a design to the library from the designer's More menu.</p>}
      <div className="dz-code" style={{ marginTop: 8 }}>
        <input value={code} placeholder="Paste a share code" onChange={(e) => setCode(e.target.value)} />
        <button className="btn" onClick={() => { const d = parseCode(code); if (d) { setCode(""); open(sanitize({ ...d, id: "", origin: "imported" })); } else play("deny"); }}>Open</button>
      </div>
    </>
  );
}
