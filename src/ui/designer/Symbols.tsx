// (Batch E) The custom symbol set (docs/spec/symbols.md): four highs, five lows (or card ranks), a scatter and a
// jackpot symbol, picked from the emoji library in pay order, with the live Theme rating. The tags behind the rating
// stay hidden: the player sees the number, never why.
import { useMemo, useState } from "react";
import { EMOJI, EMOJI_CATS, EMOJI_LIST, tagName, type EmojiCat } from "../../data/emoji";
import { symSetOf, type CustomSyms, type SlotDesign } from "../../data/designer";
import { play } from "../../platform/audio";
import { ratingWord, themeRating } from "../../sim";

type Slot = `h${number}` | `l${number}` | "sc" | "jp";

/** A library symbol as text: an emoji, or a drawn seven or bar. */
export function Glyph({ e }: { e: string }) {
  if (e.startsWith("#7")) return <span className={`dz-glyph seven s${e[2]}`}>7</span>;
  if (e.startsWith("#bar")) return <span className="dz-glyph bars">{Array.from({ length: Number(e[4]) }, (_, k) => <b key={k}>BAR</b>)}</span>;
  if (e.startsWith("#")) return <span className="dz-glyph rank">{e.slice(1)}</span>;
  return <>{e}</>;
}

const SPARE = ["⭐", "💰", "💎", "🔔", "🪙", "🍀", "🍒", "🍋", "🍊", "🍉", "🍇", "🍓", "🍑", "🍐"];
/** A custom set starting from a design's current symbols (library symbols only, all different). */
export function customFrom(d: SlotDesign): CustomSyms {
  const s = symSetOf(d), used = new Set<string>();
  const take = (e: string) => {
    const v = EMOJI[e] && !used.has(e) ? e : SPARE.find((q) => !used.has(q))!;
    used.add(v);
    return v;
  };
  const highs = s.highs.map(take);
  const lows = s.lows.every((e) => EMOJI[e]) ? s.lows.map(take) : null;
  return { highs, lows, scatter: take(s.scatter), jackpot: take(s.jackpot) };
}

const get = (c: CustomSyms, k: Slot) => (k === "sc" ? c.scatter : k === "jp" ? c.jackpot : k[0] === "h" ? c.highs[Number(k.slice(1))] : c.lows?.[Number(k.slice(1))] ?? "");
function put(c: CustomSyms, k: Slot, e: string) {
  if (k === "sc") c.scatter = e; else if (k === "jp") c.jackpot = e;
  else if (k[0] === "h") c.highs[Number(k.slice(1))] = e; else if (c.lows) c.lows[Number(k.slice(1))] = e;
}
/** Pay order: highs then lows, best first. */
const order = (c: CustomSyms): Slot[] => [...c.highs.map((_, i) => `h${i}` as Slot), ...(c.lows ?? []).map((_, i) => `l${i}` as Slot)];

export function ThemeBar({ d }: { d: SlotDesign }) {
  const r = themeRating(d).rating;
  return (
    <div className="dz-rating"><span>Theme</span><div><i style={{ width: `${r * 10}%`, background: "#7ad0ff" }} /></div><b>{r.toFixed(2)}</b><small>{ratingWord(r)}</small></div>
  );
}

/** (Owner) The lab's list of every shared tag the set earns credit from: discovered links, never what's missing. */
export function ThemeBonuses({ d }: { d: SlotDesign }) {
  const shared = themeRating(d).set.shared;
  if (!shared.length) return <p className="dz-hint">None yet: no two symbols have anything in common.</p>;
  return (
    <ul className="dz-bonuses">
      {shared.map((s) => <li key={s.tag}><b>{tagName(s.tag)}</b><span>{s.syms.map((e) => <Glyph key={e} e={e} />)}</span></li>)}
    </ul>
  );
}

export function SymbolEditor({ d, set }: { d: SlotDesign; set: (f: (n: SlotDesign) => void) => void }) {
  const c = d.syms!;
  const [sel, setSel] = useState<Slot>("h0");
  const [cat, setCat] = useState<EmojiCat>("animals");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return EMOJI_LIST.filter((e) => (s ? e.name.toLowerCase().includes(s) : e.cat === cat));
  }, [cat, q]);
  const edit = (f: (c: CustomSyms) => void) => set((n) => { n.syms = structuredClone(n.syms!); f(n.syms); });
  const choose = (e: string) => {
    play("click");
    edit((cs) => {
      const all: Slot[] = [...order(cs), "sc", "jp"], was = all.find((k) => get(cs, k) === e), cur = get(cs, sel);
      if (was) put(cs, was, cur);
      put(cs, sel, e);
    });
  };
  const seq = order(c), at = seq.indexOf(sel);
  const move = (dir: -1 | 1) => {
    const to = seq[at + dir];
    if (!to) return;
    play("click");
    edit((cs) => { const a = get(cs, sel), b = get(cs, to); put(cs, sel, b); put(cs, to, a); });
    setSel(to);
  };
  const tile = (k: Slot, cls = "") => (
    <button key={k} className={`dz-sym ${cls} ${sel === k ? "on" : ""}`} onClick={() => { play("click"); setSel(k); }}><Glyph e={get(c, k)} /></button>
  );
  return (
    <div className="dz-symed">
      <div className="dz-symrow"><small>Pays most</small>{c.highs.map((_, i) => tile(`h${i}`, i === 0 ? "hero" : "hi"))}</div>
      <div className="dz-symrow">
        <small>Lows</small>
        {c.lows ? c.lows.map((_, i) => tile(`l${i}`)) : <span className="dz-cards">A K Q J 10</span>}
        <button className="dz-mini" onClick={() => {
          play("click");
          edit((cs) => {
            if (cs.lows) { cs.lows = null; return; }
            const used = new Set([...cs.highs, cs.scatter, cs.jackpot]);
            cs.lows = SPARE.filter((e) => !used.has(e)).slice(0, 5);
          });
          if (sel[0] === "l") setSel("h0");
        }}>{c.lows ? "Card ranks" : "Symbols"}</button>
      </div>
      <div className="dz-symrow"><small>Scatter</small>{tile("sc", "scat")}<small>Jackpot</small>{tile("jp", "jp")}
        {at >= 0 && <span className="dz-move"><button className="dz-mini" disabled={at === 0} onClick={() => move(-1)}>◀ Pays more</button><button className="dz-mini" disabled={at === seq.length - 1} onClick={() => move(1)}>Pays less ▶</button></span>}
      </div>
      <div className="dz-cats">
        {EMOJI_CATS.map((k) => <button key={k.id} className={!q && k.id === cat ? "on" : ""} title={k.name} onClick={() => { play("click"); setCat(k.id); setQ(""); }}>{k.icon}</button>)}
        <input className="dz-input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="dz-emojis">
        {list.map((e) => <button key={e.e} title={e.name} className={Object.values(c).flat().includes(e.e) ? "used" : ""} onClick={() => choose(e.e)}><Glyph e={e.e} /></button>)}
        {!list.length && <p className="dz-hint">Nothing called that.</p>}
      </div>
    </div>
  );
}
