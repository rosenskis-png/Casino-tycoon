// Slot symbols on the play screen (docs/spec/designer.md §9): emoji on styled tiles, plus the tokens a real slot
// draws itself (card ranks, sevens, bars, WILD). UI only: the floor stays pixel art.
import { C_BAR1, C_BAR2, C_BAR3, C_BLANK, C_CHERRY, C_TOP, C_WILD, JACKPOT, SCATTER, SLOT_THEMES, WILD, type SlotDesign } from "../../data/designer";

/** Symbol codes beyond data/designer.ts (sim/design/grid.ts): wilds with multipliers; the classic jackpot symbol. */
const WILD2 = 12, WILD3 = 13, C_JP = 7;

const RANK_COLORS: Record<string, [string, string]> = {
  "#A": ["#ff5a5a", "#8a0a0a"], "#K": ["#5aa0ff", "#0a2a8a"], "#Q": ["#e070ff", "#5a0a7a"], "#J": ["#5aff8a", "#0a6a2a"],
  "#10": ["#ffb03a", "#7a3a00"], "#9": ["#3af0e0", "#0a5a5a"],
};

/** What a symbol code shows for a design: a token or an emoji. */
export function symbolOf(d: SlotDesign, code: number): string {
  const set = SLOT_THEMES[d.theme].sets[d.set];
  if (d.layout === "c3") {
    if (code === C_WILD) return "#wild";
    if (code === C_TOP) return set.classic[0];
    if (code === C_BAR3) return set.classic[1];
    if (code === C_BAR2) return set.classic[2];
    if (code === C_BAR1) return set.classic[3];
    if (code === C_CHERRY) return set.classic[4];
    if (code === C_JP) return set.jackpot;
    return "";
  }
  if (code < 4) return set.highs[code];
  if (code < 9) return set.lows[code - 4];
  if (code === WILD || code === WILD2 || code === WILD3) return "#wild";
  if (code === SCATTER) return set.scatter;
  if (code === JACKPOT) return set.jackpot;
  return "";
}

/** One symbol, drawn. `kind` styles the tile (high, low, wild, scatter, jackpot). */
export function Sym({ d, code, size }: { d: SlotDesign; code: number; size?: number }) {
  const s = symbolOf(d, code);
  const th = SLOT_THEMES[d.theme];
  const style = size ? { fontSize: size } : undefined;
  if (!s || (d.layout === "c3" && code === C_BLANK)) return <span className="sy blank" />;
  if (s === "#wild") {
    const m = code === WILD2 ? "×2" : code === WILD3 ? "×3" : d.layout === "c3" && (d.wild === "x2" || d.wild === "x3") ? (d.wild === "x2" ? "×2" : "×3") : "";
    return <span className="sy wild" style={{ ...style, background: `linear-gradient(160deg, ${th.logo[0]}, ${th.accent} 45%, ${th.logo[1]})` }}><b>WILD</b>{m && <i>{m}</i>}</span>;
  }
  if (s.startsWith("#7")) return <span className={`sy seven s${s[2]}`} style={style}>7</span>;
  if (s.startsWith("#bar")) {
    const n = Number(s[4]);
    return <span className="sy bars" style={style}>{Array.from({ length: n }, (_, k) => <b key={k}>BAR</b>)}</span>;
  }
  if (s.startsWith("#")) {
    const [a, b] = RANK_COLORS[s] ?? ["#fff", "#333"];
    return <span className="sy rank" style={{ ...style, backgroundImage: `linear-gradient(180deg, #fff 8%, ${a} 40%, ${b} 100%)` }}>{s.slice(1)}</span>;
  }
  const cls = d.layout !== "c3" && code === SCATTER ? "scat" : code === JACKPOT || (d.layout === "c3" && code === C_JP) ? "jp" : d.layout !== "c3" && code < 4 ? "hi" : "";
  return <span className={`sy emo ${cls}`} style={style}>{s}</span>;
}
