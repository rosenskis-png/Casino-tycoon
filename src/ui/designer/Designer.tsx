// The slot designer (docs/spec/designer.md): RCT's coaster builder for slot machines. The top half is the machine
// itself, live: every change shows at once and it can be spun any time on lab credits. Below, the design's eight
// sections and the lab (par sheet, panel, ratings, forced outcomes). Saving, certifying and placing are commands.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BODY_COLORS, CABINETS, CAB_IDS, CALLS, CELEBRATE, DENOMS, FS_COUNTS, FS_ENH, FS_ENH_IDS, JACKPOT_DEFAULTS, LAYOUTS, LAYOUT_IDS,
  LIGHT_COLORS, MAX_FEATURES, RTP_RANGE, RTP_RIGGED, ROLLUPS, SLOT_THEMES, SLOT_THEME_IDS, SPEEDS, TOPPERS, TOPPER_IDS, levelName,
  newDesign, type SlotDesign,
} from "../../data/designer";
import { RESEARCH } from "../../data/research";
import { GUEST_TYPES } from "../../data/guests";
import { play } from "../../platform/audio";
import { designCode, parseCode, saveToLibrary } from "../../platform/library";
import {
  CERT, certFee, certPending, certified, compile, designLocks, forces, illegal, machinesOf, minRtpOf, panel, panelMix, parSheet,
  researched, sanitize, seeded, sessions, spinFull, ratingWord, INTENSITY_WORDS, designPrice, TICKS_PER_DAY, type Compiled, type Force, type Game,
} from "../../sim";
import { Machine } from "../slot/Machine";
import { betLevels } from "../play";
import { money } from "../format";
import "./designer.css";

type Section = "concept" | "reels" | "money" | "math" | "features" | "jackpots" | "show" | "cabinet" | "lab";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "concept", label: "Concept" }, { id: "reels", label: "Reels" }, { id: "money", label: "Money" }, { id: "math", label: "Math" },
  { id: "features", label: "Features" }, { id: "jackpots", label: "Jackpots" }, { id: "show", label: "Show" }, { id: "cabinet", label: "Cabinet" },
  { id: "lab", label: "Lab" },
];

export function Designer({ g, start, onClose, onPlace, toast }: { g: Game; start: SlotDesign | null; onClose: () => void; onPlace: (id: string) => void; toast: (s: string) => void }) {
  const [d, setD] = useState<SlotDesign>(() => sanitize(start ?? newDesign("")));
  const [sec, setSec] = useState<Section>("concept");
  const [big, setBig] = useState(false);
  const [, bump] = useState(0);
  const set = (f: (n: SlotDesign) => void) => setD((p) => { const n = structuredClone(p); f(n); return sanitize(n); });
  const c = useMemo(() => compile(d, `draft:${d.id || "new"}`), [d]);
  const s = g.state;
  const rec = d.id ? s.designs[d.id] : undefined;
  const saved = rec && JSON.stringify(rec.d) === JSON.stringify(d);
  // Lab credits and the machine's bet.
  const [labCredit, setLabCredit] = useState(1000);
  const levels = betLevels(d.minBet, d.maxBet);
  const [lv, setLv] = useState(1);
  const credits = levels[Math.min(lv, levels.length - 1)];
  const bet = d.denom * credits;
  const rngRef = useRef(seeded(Math.floor(Math.random() * 1e9)));
  const force = useRef<Force | null>(null);
  const [kick, setKick] = useState(0);
  const spin = () => {
    const f = force.current;
    force.current = null;
    const out = spinFull(c, rngRef.current, f ?? undefined);
    setLabCredit((cr) => (cr - bet < 0 ? 1000 : cr) - bet + out.x * bet);
    return out;
  };

  // Scale the live machine to its box.
  const box = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.7);
  useEffect(() => {
    const fit = () => {
      if (!box.current || !inner.current) return;
      const h = inner.current.scrollHeight, H = box.current.clientHeight, W = box.current.clientWidth, w = inner.current.scrollWidth;
      setK(Math.max(0.3, Math.min(1, H / h, W / w)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [big]);

  const status = !d.id ? "New design · not saved" : !rec ? "Not in this casino" : rec.rigged ? "Running uncertified" : certified(s, d.id) ? (saved ? "Certified" : "Certified · unsaved changes") : certPending(s, d.id) ? `At the lab · ${Math.ceil((rec.cert - s.tick) / TICKS_PER_DAY)} days left` : saved ? "Saved · not certified" : "Unsaved changes";
  const doSave = () => {
    play("click");
    const e = g.dispatch({ type: "designSave", d });
    if (e) { toast(e); return; }
    g.flushCommands();
    const id = g.lastDesign, nd = g.state.designs[id]?.d;
    if (!nd) return;
    setD(nd);
    toast(id === d.id ? `Saved ${nd.name}` : d.id ? `Saved as a new version: ${nd.name}` : `Saved ${nd.name}`);
  };
  const act = (cmd: Parameters<Game["dispatch"]>[0]) => { const e = g.dispatch(cmd); if (e) toast(e); else { g.flushCommands(); bump((q) => q + 1); } return !e; };
  const locks = designLocks(s, d);
  const bad = illegal(s, d);

  return (
    <div className="dz">
      <div className="dz-head">
        <button className="btn" onClick={() => { play("click"); onClose(); }}>Close</button>
        <div><b>{d.name}</b><small>{status}</small></div>
        <button className="btn" onClick={() => { play("click"); setBig((b) => !b); }}>{big ? "Edit" : "Test"}</button>
      </div>
      <div className={`dz-preview ${big ? "big" : ""}`} ref={box}>
        <div className="dz-scale" ref={inner} style={{ transform: `scale(${k})` } as CSSProperties}>
          <Machine c={c} credit={labCredit} bet={bet} compact={!big} kick={kick}
            onBet={(dir) => setLv((q) => (dir === "max" ? levels.length - 1 : Math.max(0, Math.min(levels.length - 1, q + dir))))}
            spin={spin} />
        </div>
      </div>
      <div className="dz-tabs">
        {SECTIONS.map((q) => <button key={q.id} className={sec === q.id ? "on" : ""} onClick={() => { play("click"); setSec(q.id); }}>{q.label}</button>)}
      </div>
      <div className="dz-body">
        {c.notes.filter((n) => !n.startsWith("internal")).map((n) => <p key={n} className="dz-note">{n}</p>)}
        {locks.length > 0 && <p className="dz-note">Needs research before it can be placed: {locks.map((q) => RESEARCH[q]?.name ?? q).join(", ")}.</p>}
        {sec === "concept" && <Concept d={d} set={set} />}
        {sec === "reels" && <Reels d={d} set={set} g={g} />}
        {sec === "money" && <MoneySec d={d} set={set} />}
        {sec === "math" && <MathSec d={d} c={c} set={set} g={g} />}
        {sec === "features" && <Features d={d} c={c} set={set} g={g} />}
        {sec === "jackpots" && <Jackpots d={d} c={c} set={set} bet={bet} />}
        {sec === "show" && <Show d={d} set={set} />}
        {sec === "cabinet" && <Cabinet d={d} set={set} g={g} />}
        {sec === "lab" && <Lab c={c} g={g} onForce={(f) => { force.current = f; setKick((q) => q + 1); }} onRefill={() => setLabCredit(1000)} />}
      </div>
      <div className="dz-foot">
        <button className="btn on" onClick={doSave}>{saved ? "Saved" : "Save"}</button>
        <button className="btn" disabled={!rec || !saved || certified(s, d.id) || certPending(s, d.id) || bad.length > 0 || rec.rigged > 0 || certFee(s) > s.cash}
          onClick={() => { play("click"); act({ type: "designCertify", id: d.id }); }}>
          Certify<small>{bad.length ? "illegal" : `${money(certFee(s))} · ${researched(s, "fastcert") ? CERT.fastDays : CERT.days} days`}</small>
        </button>
        <button className="btn" disabled={!rec || !saved || locks.length > 0 || !(certified(s, d.id) || rec.rigged)} onClick={() => { play("click"); onPlace(d.id); }}>
          Place<small>{money(designPrice(d).cost)}</small>
        </button>
        <More d={d} rec={!!rec} rigged={!!rec?.rigged} g={g} toast={toast} setD={setD} c={c} act={act} />
      </div>
    </div>
  );
}

/** Library, share codes, and running uncertified. */
function More({ d, rec, rigged, g, toast, setD, c, act }: { d: SlotDesign; rec: boolean; rigged: boolean; g: Game; toast: (s: string) => void; setD: (d: SlotDesign) => void; c: Compiled; act: (cmd: Parameters<Game["dispatch"]>[0]) => boolean }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  return (
    <>
      <button className="btn" onClick={() => { play("click"); setOpen((o) => !o); }}>More</button>
      {open && (
        <div className="dz-more" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <button className="btn" onClick={() => {
              const pn = panel(c, panelMix(g.state));
              saveToLibrary({ d: { ...d, id: "" }, ex: pn.ratings.excitement, int: pn.ratings.intensity, drain: pn.ratings.drain, where: g.state.scenario });
              toast(`${d.name} is in your library`);
            }}>Save to library<small>kept on this phone for every casino</small></button>
            <button className="btn" onClick={async () => {
              const cc = designCode(d);
              try { await navigator.clipboard.writeText(cc); toast("Share code copied"); } catch { setCode(cc); }
            }}>Copy share code</button>
            <div className="dz-code">
              <input value={code} placeholder="Paste a share code" onChange={(e) => setCode(e.target.value)} />
              <button className="btn" onClick={() => { const nd = parseCode(code); if (!nd) { toast("That isn't a design code"); return; } setD(sanitize({ ...nd, id: "" })); setOpen(false); toast(`Loaded ${nd.name}`); }}>Load</button>
            </div>
            <button className={`btn ${rigged ? "on" : "danger"}`} disabled={!rec} onClick={() => { if (act({ type: "designRun", id: d.id, on: !rigged })) toast(rigged ? "Stopped running uncertified" : "Running uncertified: place it any time. The inspector tests machines."); setOpen(false); }}>
              {rigged ? "Stop running uncertified" : "Run uncertified"}<small>skip the lab (illegal: the regulator's inspector tests machines)</small>
            </button>
            <button className="btn" onClick={() => { setD(sanitize({ ...d, id: "", name: `${d.name} copy`.slice(0, 24) })); setOpen(false); }}>Start a copy</button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Controls.

type Set = (f: (n: SlotDesign) => void) => void;

function Row({ label, value, children, hint }: { label: string; value?: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="dz-row">
      <div className="dz-label"><span>{label}</span>{value !== undefined && <b>{value}</b>}</div>
      {children}
      {hint && <p className="dz-hint">{hint}</p>}
    </div>
  );
}
function Chips<T extends string | number>({ opts, value, set, lock }: { opts: { v: T; label: ReactNode; sub?: string }[]; value: T; set: (v: T) => void; lock?: (v: T) => string | null }) {
  return (
    <div className="dz-chips">
      {opts.map((o) => {
        const why = lock?.(o.v) ?? null;
        return <button key={String(o.v)} className={o.v === value ? "on" : ""} disabled={!!why} onClick={() => { play("click"); set(o.v); }}>{o.label}{(why || o.sub) && <small>{why ?? o.sub}</small>}</button>;
      })}
    </div>
  );
}
function Slider({ min, max, step, value, set, marks }: { min: number; max: number; step: number; value: number; set: (v: number) => void; marks?: { at: number; color: string }[] }) {
  return (
    <div className="dz-slider">
      {marks?.map((m, i) => <i key={i} style={{ left: `${((m.at - min) / (max - min)) * 100}%`, background: m.color }} />)}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );
}
const Toggle = ({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) => (
  <button className={`dz-toggle ${on ? "on" : ""}`} onClick={() => { play("click"); set(!on); }}><i />{label}</button>
);
const pct = (v: number, dd = 0) => `${(v * 100).toFixed(dd)}%`;
const needs = (g: Game, id: string | undefined) => (id && !researched(g.state, id) ? `Research: ${RESEARCH[id]?.name ?? id}` : null);

// ---------------------------------------------------------------------------------------------------------
// Sections.

function Concept({ d, set }: { d: SlotDesign; set: Set }) {
  const th = SLOT_THEMES[d.theme];
  return (
    <>
      <Row label="Name">
        <input className="dz-input" value={d.name} maxLength={24} onChange={(e) => { const v = e.target.value; set((n) => { n.name = v; }); }} />
      </Row>
      <Row label="Theme" value={th.name} hint="The theme sets the symbols, colors and call, and counts toward the room's theming.">
        <div className="dz-themes">
          {SLOT_THEME_IDS.map((t) => (
            <button key={t} className={t === d.theme ? "on" : ""} style={{ background: `linear-gradient(${SLOT_THEMES[t].bg[0]}, ${SLOT_THEMES[t].bg[1]})` }}
              onClick={() => { play("click"); set((n) => { if (n.show.call === SLOT_THEMES[n.theme].call) n.show.call = SLOT_THEMES[t].call; n.theme = t; }); }}>
              <span>{SLOT_THEMES[t].sets[0].highs[0].startsWith("#") ? "7️⃣" : SLOT_THEMES[t].sets[0].highs[0]}</span><small>{SLOT_THEMES[t].name}</small>
            </button>
          ))}
        </div>
      </Row>
      <Row label="Symbols">
        <Chips opts={th.sets.map((q, i) => ({ v: i as 0 | 1, label: <>{q.name}<small className="syms">{q.highs.map((h) => (h.startsWith("#") ? "7" : h)).join(" ")}</small></> }))} value={d.set} set={(v) => set((n) => { n.set = v; })} />
      </Row>
    </>
  );
}

function Reels({ d, set, g }: { d: SlotDesign; set: Set; g: Game }) {
  const lay = LAYOUTS[d.layout], three = lay.reels === 3;
  return (
    <>
      <Row label="Layout" value={lay.badge} hint={lay.win === "classic" ? "One line, mechanical reels. Wins pay at least the bet: no dressed-up losses, no bonus features." : lay.win === "ways" ? "Matching symbols on adjacent reels from the left pay anywhere in each reel." : "Wins pay along fixed lines."}>
        <Chips opts={LAYOUT_IDS.map((id) => ({ v: id, label: LAYOUTS[id].name, sub: `hits ${pct(LAYOUTS[id].hit[0])}–${pct(LAYOUTS[id].hit[1])}` }))} value={d.layout}
          lock={(v) => needs(g, LAYOUTS[v].research) ?? (v.startsWith("w") ? needs(g, "video") : null)}
          set={(v) => set((n) => { n.layout = v; if (LAYOUTS[v].reels > 3 && (n.wild === "x2" || n.wild === "x3")) n.wild = "plain"; })} />
      </Row>
      <Row label="Wilds" hint={three ? "On 3-reel games a wild can multiply: two multiply each other (×4 or ×9)." : "Wilds land on the middle reels and stand in for any symbol but scatters. Multiplier wilds come with free spins."}>
        <Chips opts={[{ v: "none" as const, label: "None" }, { v: "plain" as const, label: "Wild" }, ...(three ? [{ v: "x2" as const, label: "Wild ×2" }, { v: "x3" as const, label: "Wild ×3" }] : [])]} value={d.wild} set={(v) => set((n) => { n.wild = v; })} />
      </Row>
      {!three && <Row label="Stacked hero" hint="The top symbol lands in stacks: full reels of it, big ways wins, a swingier game."><Toggle on={d.stacks} set={(v) => set((n) => { n.stacks = v; })} label={d.stacks ? "Stacked" : "Off"} /></Row>}
    </>
  );
}

function MoneySec({ d, set }: { d: SlotDesign; set: Set }) {
  const steps = [1, 2, 3, 4, 5, 10, 20, 25, 30, 40, 50, 60, 80, 88, 100, 120, 150, 200, 250, 300, 400, 500, 800, 1000, 2000, 5000];
  const lo = steps.findIndex((q) => q >= d.minBet), hi = steps.findIndex((q) => q >= d.maxBet);
  const fmt = (credits: number) => money(credits * d.denom).replace(/^\$(\d+)$/, "$$$1") + (credits * d.denom < 10 ? ` (${(credits * d.denom).toFixed(2)})` : "");
  return (
    <>
      <Row label="Denomination" value={d.denom < 1 ? `${Math.round(d.denom * 100)}¢` : `$${d.denom}`} hint="What a credit is worth. Pennies for Retirees, dollars and up for Locals and High rollers.">
        <Chips opts={DENOMS.map((v) => ({ v, label: v < 1 ? `${Math.round(v * 100)}¢` : `$${v}` }))} value={d.denom} set={(v) => set((n) => { n.denom = v; })} />
      </Row>
      <Row label="Smallest bet" value={`${d.minBet} credits · $${(d.minBet * d.denom).toFixed(2)}`}>
        <Slider min={0} max={steps.length - 1} step={1} value={Math.max(0, lo)} set={(i) => set((n) => { n.minBet = steps[i]; if (n.maxBet < n.minBet) n.maxBet = n.minBet; })} />
      </Row>
      <Row label="Largest bet" value={`${d.maxBet} credits · $${(d.maxBet * d.denom).toFixed(2)}`} hint="Guests bet a share of their budget, fitted to this range. A high-limit room multiplies stakes ×5.">
        <Slider min={0} max={steps.length - 1} step={1} value={Math.max(0, hi)} set={(i) => set((n) => { n.maxBet = Math.max(n.minBet, steps[i]); })} />
      </Row>
      {void fmt}
    </>
  );
}

function Budget({ c }: { c: Compiled }) {
  const b = c.budget, T = c.d.rtp;
  const parts = [
    { k: "Small wins", v: b.small, col: "#5ab0ff" }, { k: "Big wins", v: b.big, col: "#a07aff" },
    { k: "Free spins", v: b.fs + b.scatter, col: "#ffb03a" }, { k: "Jackpots", v: b.jackpots, col: "#ff4a5a" },
  ].filter((q) => q.v > 1e-6);
  return (
    <div className="dz-budget">
      <div className="bar">{parts.map((q) => <i key={q.k} style={{ width: `${q.v * 100}%`, background: q.col }} />)}<em style={{ left: `${T * 100}%` }} /></div>
      <div className="legend">{parts.map((q) => <span key={q.k}><i style={{ background: q.col }} />{q.k} {pct(q.v, 1)}</span>)}<span>House keeps {pct(1 - T, 1)}</span></div>
    </div>
  );
}

function MathSec({ d, c, set, g }: { d: SlotDesign; c: Compiled; set: Set; g: Game }) {
  const legal = minRtpOf(g.state);
  const [lo, hi] = c.hitRange;
  return (
    <>
      <Row label="Where the payback goes" hint="Every point of payback goes somewhere. A richer bonus or bigger jackpots squeeze the base game.">
        <Budget c={c} />
      </Row>
      <Row label="Payback" value={pct(d.rtp, 1)} hint={d.rtp < legal ? <span className="neg">Under the legal {pct(legal)}: it can only run uncertified (rigging).</span> : "Guests never see payback; they feel how long their money lasts."}>
        <Slider min={RTP_RIGGED} max={RTP_RANGE[1]} step={0.001} value={d.rtp} set={(v) => set((n) => { n.rtp = Math.round(v * 1000) / 1000; })} marks={[{ at: legal, color: "#ff4a5a" }]} />
      </Row>
      <Row label="Hit rate (any win)" value={`${pct(c.hit, 1)} · 1 in ${(1 / c.hit).toFixed(1)}`} hint={`This design can reach ${pct(lo)}–${pct(hi)}.`}>
        <Slider min={Math.floor(lo * 1000) / 1000} max={Math.ceil(hi * 1000) / 1000} step={0.001} value={Math.min(hi, Math.max(lo, d.hit))} set={(v) => set((n) => { n.hit = v; })} />
      </Row>
      <Row label="Volatility" value={`${["Low", "Medium", "High", "Very high", "Extreme"][Math.min(4, Math.floor(d.vol * 5))]} · big wins ${pct(c.base.big)} of the base game`} hint={`Top award ${Math.round(c.top).toLocaleString()} ${c.lay.win === "classic" ? "coins" : "per line credit"}. More in big wins means rarer, bigger hits.`}>
        <Slider min={0} max={1} step={0.01} value={d.vol} set={(v) => set((n) => { n.vol = v; })} />
      </Row>
    </>
  );
}

function Features({ d, c, set, g }: { d: SlotDesign; c: Compiled; set: Set; g: Game }) {
  const classic = c.lay.win === "classic", fs = d.fs;
  const lockFs = needs(g, "freespins");
  const every = fs?.every ?? 150;
  const logv = Math.log(every);
  return (
    <>
      {classic ? <p className="dz-hint">Classic 3-reel games have no bonus features. Pick a 3×3 or video layout for free spins.</p> : (
        <Row label="Free spins" hint={lockFs ?? "Scatters anywhere trigger free games; 4 or 5 scatters give more."}>
          <Toggle on={!!fs} set={(v) => set((n) => { n.fs = v ? { every: 150, count: 1, retrigger: true, enh: "x2" } : null; })} label={fs ? "On" : "Off"} />
        </Row>
      )}
      {!classic && fs && (
        <>
          <Row label="How often" value={`1 in ${Math.round(1 / Math.max(1e-9, c.q))} spins`} hint={`Pays ${c.fsAvg.toFixed(1)}× the bet on average over ${c.fsSpins.toFixed(1)} spins: ${pct((c.budget.fs + c.budget.scatter) / d.rtp)} of the payback.`}>
            <Slider min={Math.log(60)} max={Math.log(2000)} step={0.01} value={logv} set={(v) => set((n) => { n.fs!.every = Math.round(Math.exp(v)); })} />
          </Row>
          <Row label="Free games">
            <Chips opts={FS_COUNTS.map((q, i) => ({ v: i, label: q.name }))} value={fs.count} set={(v) => set((n) => { n.fs!.count = v; })} />
          </Row>
          <Row label="Retriggers"><Toggle on={fs.retrigger} set={(v) => set((n) => { n.fs!.retrigger = v; })} label={fs.retrigger ? "Can be won again" : "No"} /></Row>
          <Row label="During free spins" hint={FS_ENH[fs.enh].desc}>
            <Chips opts={FS_ENH_IDS.map((id) => ({ v: id, label: FS_ENH[id].name }))} value={fs.enh} set={(v) => set((n) => { n.fs!.enh = v; })} />
          </Row>
        </>
      )}
      <Row label={`More features (${MAX_FEATURES} per game)`} hint="Coming in M8.5: hold & spin, pick bonuses, wheels (and topper wheels), cascades, collectors, take-it-or-leave-it offers, mystery features.">
        <div className="dz-chips">{["Hold & spin", "Pick", "Wheel", "Cascades", "Collector", "Offer", "Mystery"].map((q) => <button key={q} disabled>{q}<small>M8.5</small></button>)}</div>
      </Row>
    </>
  );
}

function Jackpots({ d, c, set, bet }: { d: SlotDesign; c: Compiled; set: Set; bet: number }) {
  const classic = c.lay.win === "classic", max = classic ? 1 : 4, n = d.jackpots.length;
  const X = [2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 25000, 50000, 100000];
  return (
    <>
      <Row label="Jackpot levels" hint={classic ? "Three jackpot symbols on the line." : "Won by 3, 4, 5 or 6 jackpot symbols anywhere. Amounts are multiples of the bet, so every bet has the same payback. Progressive meters come in M8.5."}>
        <Chips opts={Array.from({ length: max + 1 }, (_, i) => ({ v: i, label: i ? `${i}` : "None" }))} value={n}
          set={(v) => set((q) => { q.jackpots = Array.from({ length: v }, (_, i) => q.jackpots[i] ?? JACKPOT_DEFAULTS[4 - v + i]); })} />
      </Row>
      {d.jackpots.map((j, i) => {
        const xi = Math.max(0, X.findIndex((v) => v >= j.x));
        return (
          <div key={i} className="dz-level">
            <b>{levelName(n, i, classic)}</b>
            <Row label="Pays" value={`${j.x}× bet · $${(j.x * bet).toLocaleString("en-US", { maximumFractionDigits: 2 })} now`}>
              <Slider min={0} max={X.length - 1} step={1} value={xi} set={(v) => set((q) => { q.jackpots[i].x = X[v]; })} />
            </Row>
            <Row label="How often" value={`1 in ${Math.round(1 / (c.pJ[i] ?? 1 / j.every)).toLocaleString("en-US")} spins`}>
              <Slider min={Math.log(50)} max={Math.log(1e8)} step={0.01} value={Math.log(j.every)} set={(v) => set((q) => { q.jackpots[i].every = Math.round(Math.exp(v)); })} />
            </Row>
          </div>
        );
      })}
    </>
  );
}

function Show({ d, set }: { d: SlotDesign; set: Set }) {
  const nearTxt = d.show.near > 1 ? "above chance: rigging (uncertified only)" : d.show.near === 1 ? "as often as chance makes them" : d.show.near === 0 ? "never" : `${pct(d.show.near)} of chance`;
  return (
    <>
      <Row label="Lights" value={["Off", "Soft", "Bright", "Blazing"][d.show.lights]}><Slider min={0} max={3} step={1} value={d.show.lights} set={(v) => set((n) => { n.show.lights = v; })} /></Row>
      <Row label="Light color">
        <div className="dz-swatches">{LIGHT_COLORS.map((l, i) => <button key={l.name} className={i === d.show.light ? "on" : ""} style={{ background: l.c[0], boxShadow: `0 0 8px ${l.c[0]}` }} onClick={() => set((n) => { n.show.light = i; })} aria-label={l.name} />)}</div>
      </Row>
      <Row label="Sound" value={["Silent", "Quiet", "Lively", "Loud"][d.show.sound]} hint="Lights and sound add energy around the machine: great for a party floor, bad for a quiet room."><Slider min={0} max={3} step={1} value={d.show.sound} set={(v) => set((n) => { n.show.sound = v; })} /></Row>
      <Row label="Signature call" hint="Plays when free spins start, on the floor too.">
        <div className="dz-chips">{Object.entries(CALLS).map(([id, name]) => <button key={id} className={id === d.show.call ? "on" : ""} onClick={() => { play(id); set((n) => { n.show.call = id; }); }}>{name}</button>)}</div>
      </Row>
      <Row label="Small wins (less than the bet)" hint="How loudly a win smaller than the bet is celebrated. Some guests love it; others see through it.">
        <Chips opts={CELEBRATE.map((q, i) => ({ v: i, label: q.name }))} value={d.show.ldw} set={(v) => set((n) => { n.show.ldw = v; })} />
      </Row>
      <Row label="Near misses" value={nearTxt} hint="Losing spins shown one symbol short. They keep chasers playing. Above chance is illegal.">
        <Slider min={0} max={3} step={0.05} value={d.show.near} set={(v) => set((n) => { n.show.near = Math.abs(v - 1) < 0.04 ? 1 : v; })} marks={[{ at: 1, color: "#ff4a5a" }]} />
      </Row>
      <Row label="Anticipation"><Toggle on={d.show.antic} set={(v) => set((n) => { n.show.antic = v; })} label={d.show.antic ? "Last reels slow down when a feature is one symbol away" : "Off"} /></Row>
      <Row label="Win roll-up"><Chips opts={ROLLUPS.map((q, i) => ({ v: i, label: q.name }))} value={d.show.rollup} set={(v) => set((n) => { n.show.rollup = v; })} /></Row>
      <Row label="Spin speed" hint="Faster spins take money faster; slower ones stretch a guest's time."><Chips opts={SPEEDS.map((q, i) => ({ v: i, label: q.name }))} value={d.show.speed} set={(v) => set((n) => { n.show.speed = v; })} /></Row>
    </>
  );
}

function Cabinet({ d, set, g }: { d: SlotDesign; set: Set; g: Game }) {
  const pr = designPrice(d);
  return (
    <>
      <Row label="Cabinet" value={`${money(pr.cost)} · ${money(pr.upkeep)}/mo`} hint={CABINETS[d.cab.type].desc}>
        <Chips opts={CAB_IDS.map((id) => ({ v: id, label: CABINETS[id].name, sub: money(CABINETS[id].cost) }))} value={d.cab.type} lock={(v) => needs(g, CABINETS[v].research)} set={(v) => set((n) => { n.cab.type = v; })} />
      </Row>
      <Row label="Body color">
        <div className="dz-swatches">{BODY_COLORS.map((b, i) => <button key={b.name} className={i === d.cab.body ? "on" : ""} style={{ background: `linear-gradient(${b.ramp[1]}, ${b.ramp[3]})` }} onClick={() => set((n) => { n.cab.body = i; })} aria-label={b.name} />)}</div>
      </Row>
      <Row label="Topper"><Chips opts={TOPPER_IDS.map((id) => ({ v: id, label: TOPPERS[id].name, sub: TOPPERS[id].cost ? money(TOPPERS[id].cost) : undefined }))} value={d.cab.topper} set={(v) => set((n) => { n.cab.topper = v; })} /></Row>
    </>
  );
}

/** The lab: ratings from a test panel of this casino's own guests, the panel's words, exact numbers, forced outcomes. */
function Lab({ c, g, onForce, onRefill }: { c: Compiled; g: Game; onForce: (f: Force) => void; onRefill: () => void }) {
  const mix = panelMix(g.state);
  const pn = useMemo(() => panel(c, mix), [c]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sess, setSess] = useState<ReturnType<typeof sessions>[] | null>(null);
  useEffect(() => {
    setSess(null);
    const t = setTimeout(() => setSess(Object.keys(mix).filter((q) => mix[q] > 0).map((q) => sessions(c, q, 120))), 250);
    return () => clearTimeout(t);
  }, [c]); // eslint-disable-line react-hooks/exhaustive-deps
  const byType = researched(g.state, "slotlab");
  const r = pn.ratings;
  const bar = (label: string, v: number, word: string, col: string) => (
    <div className="dz-rating"><span>{label}</span><div><i style={{ width: `${v * 10}%`, background: col }} /></div><b>{v.toFixed(2)}</b><small>{word}</small></div>
  );
  return (
    <>
      <Row label="Test it" hint="Force the next spin (lab credits; nothing on the floor changes). Forced outcomes are drawn from the real math within that outcome.">
        <div className="dz-chips">{forces(c).map((f) => <button key={f.id} onClick={() => { play("click"); onForce(f.id); }}>{f.name}</button>)}<button onClick={onRefill}>Refill credits</button></div>
      </Row>
      <Row label="Ratings" hint="Excitement: how a test panel of this casino's own guests felt. Intensity: how hard it swings. Drain: how fast it takes money. None of them is good or bad on its own.">
        {bar("Excitement", r.excitement, ratingWord(r.excitement), "#ffcf3a")}
        {bar("Intensity", r.intensity, ratingWord(r.intensity, INTENSITY_WORDS), "#ff7a3a")}
        {bar("Drain", r.drain, ratingWord(r.drain), "#ff4a6a")}
      </Row>
      <Row label="The panel said">
        {pn.verdict.length ? pn.verdict.map((q) => <p key={q} className="quote">“{q}”</p>) : <p className="dz-hint">Nothing much either way.</p>}
        {byType ? (
          <div className="dz-types">{pn.byType.map((t) => <div key={t.type}><span>{GUEST_TYPES[t.type].name}</span><b>{t.excitement.toFixed(1)}</b><small>{t.appeal >= 0.8 ? "would seek it out" : t.appeal >= 0.45 ? "would play it" : t.appeal > 0.1 ? "might try it" : "not for them"}</small></div>)}</div>
        ) : <p className="dz-hint">Research Slot lab panels to see it by guest type.</p>}
      </Row>
      <Row label="Typical sessions" hint="120 visits by each kind of guest this casino gets, at their usual stakes and budgets.">
        {!sess ? <p className="dz-hint">Running…</p> : (
          <div className="dz-sess">{sess.map((q) => (
            <div key={q.type}>
              <b>{GUEST_TYPES[q.type].name}</b>
              <span>{q.minutes.toFixed(1)} min · {pct(q.sawFeature)} saw a feature · {pct(q.up)} left up</span>
              <Curve pts={q.curve} />
            </div>
          ))}</div>
        )}
      </Row>
      <Row label="Par sheet">
        <div className="kv">{parSheet(c).map((q) => <><b key={`k${q.k}`}>{q.k}</b><span key={`v${q.k}`} className="num">{q.v}</span></>)}</div>
      </Row>
    </>
  );
}

function Curve({ pts }: { pts: number[] }) {
  if (pts.length < 2) return null;
  const max = Math.max(...pts, pts[0] * 1.2), w = 120, h = 28;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return <svg className="dz-curve" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><line x1="0" x2={w} y1={h - (pts[0] / max) * h} y2={h - (pts[0] / max) * h} /><polyline points={d} /></svg>;
}

export { machinesOf };
