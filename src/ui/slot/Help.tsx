// A slot's help screens (docs/spec/designer.md §9): the real paytable at the current bet, the features, the lines,
// and the rules, as real machines show them.
import { useState } from "react";
import {
  BONUS_OFFER, BONUS_PICK, BONUS_WHEEL, CASCADE_LADDER, COLLECT_SIZES, FS_COUNTS, FS_ENH, LAYOUTS, ORB, PIECE, SCATTER, SCATTER_PAYS, WILD, levelName,
} from "../../data/designer";
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
            ) : null}
            {d.hns && c.hns && (
              <>
                <h4>Hold & spin</h4>
                <p><Sym d={d} code={ORB} size={18} /> {c.hns.start} or more orbs start the feature with 3 respins. Orbs lock in place; each new orb resets the respins to 3. Orbs show credits{c.feats.find((f) => f.id === "hns")?.lv.length ? " or a jackpot" : ""}.{c.hns.grand >= 0 ? ` Fill all ${c.hns.spots} spots to win the ${levelName(c.levels.length, c.hns.grand)}.` : ""}</p>
              </>
            )}
            {d.pick && c.pick && (
              <>
                <h4>Pick bonus</h4>
                <p><Sym d={d} code={BONUS_PICK} size={18} /> 3 bonus symbols start it. {c.pick.mode === "match" ? "Pick tiles until three of a jackpot match; that jackpot is won." : "Pick tiles to reveal prizes until you find collect."}</p>
              </>
            )}
            {d.wheel && (
              <>
                <h4>Wheel bonus</h4>
                <p><Sym d={d} code={BONUS_WHEEL} size={18} /> 3 wheel symbols spin the {d.cab.topper === "wheel" ? "wheel on top of the machine" : "wheel"}; it awards the segment it lands on.</p>
              </>
            )}
            {d.offer && (
              <>
                <h4>Offer bonus</h4>
                <p><Sym d={d} code={BONUS_OFFER} size={18} /> 3 case symbols start it: up to four offers, take one or play on for the next. Refuse them all and you win the final prize. Every offer is worth, on average, what refusing it is.</p>
              </>
            )}
            {d.cascade && c.cas && <><h4>Cascades</h4><p>Winning symbols vanish and new ones drop in; a new win pays again{d.cascade.climb ? `, with the multiplier climbing ${CASCADE_LADDER.map((m) => `×${m}`).join(", ")}` : ""}.</p></>}
            {d.collect && c.col && <><h4>Collector</h4><p><Sym d={d} code={PIECE} size={18} /> Pieces land now and then and fill the meter on this machine ({COLLECT_SIZES[d.collect.size]} to fill). It stays with the machine between players. A full meter pays {c.col.prize === "super" ? "super free games with every win ×3" : fmt(c.col.x * bet)}.</p></>}
            {d.mystery && c.mys && <><h4>Mystery</h4><p>{c.mys.kind === "mult" ? "Now and then a win is multiplied ×2, ×3 or ×5 at random." : "Now and then a wild storm sweeps extra wilds onto the reels."}</p></>}
            {c.levels.length > 0 && (
              <>
                <h4>Jackpots</h4>
                {c.levels.map((l, i) => (
                  <p key={i}><b>{levelName(c.levels.length, i, classic)}</b> {l.kind === "fixed" ? `${fmt(l.x * bet)} for ` : l.kind === "mhb" ? `a mystery progressive (starts at ${fmt(l.x * d.maxBet * d.denom)}; must hit by ${fmt(l.cap * d.maxBet * d.denom)}), won at random on any bet. ` : `a ${l.kind === "linked" ? "linked progressive shared by every machine of this game" : "progressive on this machine"} (starts at ${fmt(l.x * d.maxBet * d.denom)}), won by `}
                    {l.kind !== "mhb" && (l.how === "hns" ? (i === c.hns?.grand ? "filling the hold & spin screen" : "a jackpot orb in hold & spin") : l.how === "wheel" ? "its segment on the wheel" : l.how === "pick" ? "matching three in the pick bonus" : l.how === "mystery" ? "chance, on any spin" : classic ? "3 jackpot symbols on the line" : `${3 + i} jackpot symbols anywhere`)}
                    {l.kind === "fixed" ? ". Jackpots scale with the bet." : l.kind !== "mhb" ? (l.max ? ". Largest bet only." : ". A smaller bet wins it less often.") : ""}</p>
                ))}
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
