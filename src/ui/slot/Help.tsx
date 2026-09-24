// A slot's help screens (docs/spec/designer.md §9): the real paytable at the current bet, the features, the lines,
// and the rules, as real machines show them.
import { useState } from "react";
import { FS_COUNTS, FS_ENH, LAYOUTS, SCATTER, SCATTER_PAYS, WILD, levelName } from "../../data/designer";
import type { Compiled } from "../../sim/design/compile";
import { Sym } from "./symbols";

const fmt = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Help({ c, bet, onClose }: { c: Compiled; bet: number; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const d = c.d, lay = LAYOUTS[d.layout], classic = lay.win === "classic";
  const unit = classic ? bet : bet / lay.units;
  const pages = ["Pays", "Features", lay.win === "lines" ? "Lines" : "How it pays", "Rules"];
  return (
    <div className="sm-help" onClick={onClose}>
      <div className="sm-help-in" onClick={(e) => e.stopPropagation()}>
        <div className="tabs">{pages.map((t, k) => <button key={t} className={k === page ? "on" : ""} onClick={() => setPage(k)}>{t}</button>)}<button onClick={onClose}>✕</button></div>
        {page === 0 && (classic ? (
          <div className="pays">
            <p>Awards at {fmt(bet)} on the line.</p>
            {(d.wild !== "none" ? [[[0, 0, 0], c.top]] : []).concat([[[1, 1, 1], d.wild !== "none" ? 100 : c.top], [[2, 2, 2], 40], [[3, 3, 3], 25], [[4, 4, 4], 10], [[2, 3, 4], 5], [[5, 5, 5], 10], [[5, 5, 6], 5], [[5, 6, 6], 2]] as [number[], number][]).map(([syms, pay], k) => (
              <div key={k} className="row"><span>{(syms as number[]).map((s, j) => <Sym key={j} d={d} code={s} size={20} />)}{k === (d.wild !== "none" ? 5 : 4) ? <small> any bars</small> : null}</span><b>{fmt((pay as number) * unit)}</b></div>
            ))}
          </div>
        ) : (
          <div className="pays grid">
            {c.pt.map((pays, s) => (
              <div key={s} className="cellp"><Sym d={d} code={s} size={26} /><div>{pays.slice(0, lay.reels - 2).map((v, k) => <span key={k}><i>{k + 3}×</i> {fmt(v * unit)}</span>)}</div></div>
            ))}
            {d.wild !== "none" && <div className="cellp"><Sym d={d} code={WILD} size={20} /><div><span>Substitutes for all symbols except scatters{lay.reels === 3 ? ` · 3 wilds ${fmt(c.top * unit)}` : ""}</span></div></div>}
          </div>
        ))}
        {page === 1 && (
          <div className="feat">
            {c.q > 0 && d.fs ? (
              <>
                <h4>Free games</h4>
                <p><Sym d={d} code={SCATTER} size={20} /> Scatters pay anywhere: {SCATTER_PAYS.slice(0, c.split.length).map((v, k) => `${k + 3}× ${fmt(v * bet)}`).join(" · ")}.</p>
                <p>{c.split.map((_, k) => `${k + 3} scatters award ${FS_COUNTS[d.fs!.count].n[k]} free games`).join("; ")}.{d.fs.retrigger ? " Free games can be won again during free games." : ""}</p>
                <p>{FS_ENH[d.fs.enh].desc}</p>
              </>
            ) : <p>No free games on this machine.</p>}
            {c.pJ.length > 0 && (
              <>
                <h4>Jackpots</h4>
                {c.pJ.map((_, i) => <p key={i}><b>{levelName(c.pJ.length, i, classic)}</b> {fmt(c.jx[i] * bet)} for {classic ? "3 jackpot symbols on the line" : `${3 + i} jackpot symbols anywhere`}. Jackpots scale with the bet.</p>)}
              </>
            )}
          </div>
        )}
        {page === 2 && (lay.win === "lines" ? (
          <div className="linesmap">
            {lay.lines.map((ln, k) => (
              <div key={k}><small>{k + 1}</small><svg viewBox={`0 0 ${lay.reels * 10} ${lay.rows * 10}`}><polyline points={ln.map((row, r) => `${r * 10 + 5},${row * 10 + 5}`).join(" ")} /></svg></div>
            ))}
          </div>
        ) : (
          <div className="feat"><p>{classic ? "Three symbols on the center line pay. Wilds substitute and multiply." : `${lay.badge}: matching symbols on adjacent reels from the left pay, anywhere in each reel. Every combination counts; wins are multiplied by the number of ways.`}</p></div>
        ))}
        {page === 3 && (
          <div className="feat">
            <p>Theoretical payback {(d.rtp * 100).toFixed(1)}% over the long run.</p>
            <p>Bet {fmt(d.denom * d.minBet)} to {fmt(d.denom * d.maxBet)}. Only the highest win per line{lay.win === "ways" ? " or way" : ""} is paid. Malfunction voids all pays and plays.</p>
            <p>Jackpots of $1,200 or more are paid by an attendant.</p>
          </div>
        )}
      </div>
    </div>
  );
}
