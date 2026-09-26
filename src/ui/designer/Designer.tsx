// The slot designer (docs/spec/designer.md): RCT's coaster builder for slot machines. The top half is the machine
// itself, live: every change shows at once and it can be spun any time on lab credits. Below, the design's eight
// sections and the lab (par sheet, panel, ratings, forced outcomes). Saving, certifying and placing are commands.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BODY_COLORS, CABINETS, CAB_IDS, CALLS, CAP_RANGE, CASCADE_CHAIN, CELEBRATE, COLLECT_EVERY, COLLECT_SIZES, COLLECT_X, DENOMS, FEAT_EVERY,
  FEATURE_NAMES, FEATURE_RESEARCH, FONTS, FS_COUNTS, FS_ENH, FS_ENH_IDS, HNS_LAND, INC_RANGE, JACKPOT_DEFAULTS, JACKPOT_HOWS, JACKPOT_KINDS,
  LAYOUTS, LAYOUT_IDS, LIGHT_COLORS, LOGO_FX, LOOK_DECK, LOOK_METERS, LOOK_REELS, LOOK_TOP, MAX_FEATURES, MYSTERY_EVERY, OFFER_SIZES,
  ORB_SPREAD, PICK_PRIZES, RTP_RANGE, RTP_RIGGED, ROLLUPS, SLOT_THEMES, SLOT_THEME_IDS, SPEEDS, TOPPERS, TOPPER_IDS, WHEEL_SEGS,
  defaultLook, featuresOf, howOf, kindOf, levelName, newDesign, type FeatureId, type JackpotHow, type JackpotKind, type Look, type SlotDesign,
} from "../../data/designer";
import { RESEARCH } from "../../data/research";
import { GUEST_TYPES } from "../../data/guests";
import { play } from "../../platform/audio";
import { designCode, parseCode, saveToLibrary } from "../../platform/library";
import {
  CERT, certFee, certPending, certified, compile, designLocks, forces, illegal, machinesOf, minRtpOf, panel, panelMix, parSheet,
  researched, sanitize, seeded, sessions, spinFull, ratingWord, INTENSITY_WORDS, designPrice, TICKS_PER_DAY, hasMeters, prepSpin, afterSpin,
  meterValue, type Compiled, type Force, type Game, type MeterHost,
} from "../../sim";
import type { Meter } from "../../sim/state";
import { Machine } from "../slot/Machine";
import { SymbolEditor, ThemeBar, customFrom } from "./Symbols";
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
  // M8.5: the lab machine's own meters and collector, fresh whenever the math changes.
  const lab = useRef<{ key: string; meters: Record<string, Meter>; own: { meter?: Meter; col?: number } }>({ key: "", meters: {}, own: {} });
  if (lab.current.key !== c.model.id + JSON.stringify(d.jackpots) + JSON.stringify(d.collect ?? null)) lab.current = { key: c.model.id + JSON.stringify(d.jackpots) + JSON.stringify(d.collect ?? null), meters: {}, own: {} };
  const labHost: MeterHost = { meters: lab.current.meters, own: lab.current.own, id: "lab" };
  const spin = () => {
    const f = force.current;
    force.current = null;
    const live = hasMeters(c) || !!c.col, r = rngRef.current;
    if (live) prepSpin(labHost, c, bet, r);
    const out = spinFull(c, r, f ?? undefined);
    if (live) {
      const a = afterSpin(labHost, c, bet, out.x > 0 ? out.level : -1, r);
      if (a.x) { out.mhb = { level: a.level, x: a.x }; out.x += a.x; }
    }
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
          <Machine c={c} credit={labCredit} bet={bet} compact={!big} kick={kick} meters={c.levels.map((_, i) => meterValue(labHost, c, i))} col={lab.current.own.col ?? 0}
            onOffer={(_, pay) => { if (pay !== null) setLabCredit((cr) => cr + pay * bet); }}
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
        {sec === "jackpots" && <Jackpots d={d} c={c} set={set} bet={bet} g={g} />}
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
              <button className="btn" onClick={() => { const nd = parseCode(code); if (!nd) { toast("That isn't a design code"); return; } setD(sanitize({ ...nd, id: "", origin: "imported" })); setOpen(false); toast(`Loaded ${nd.name}`); }}>Load</button>
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
  const th = SLOT_THEMES[d.theme], look = d.look ?? defaultLook();
  const setLook = (f: (l: Look) => void) => set((n) => { n.look = { ...(n.look ?? defaultLook()) }; f(n.look); });
  return (
    <>
      <Row label="Name">
        <input className="dz-input" value={d.name} maxLength={24} onChange={(e) => { const v = e.target.value; set((n) => { n.name = v; }); }} />
      </Row>
      <Row label="Logo" hint="The name's lettering on the top box. Looks only: free, no certification.">
        <div className="dz-chips fonts">{FONTS.map((f, i) => <button key={f.name} className={i === look.font ? "on" : ""} style={{ fontFamily: f.css }} onClick={() => { play("click"); setLook((l) => { l.font = i; }); }}>{f.name}</button>)}</div>
        <Chips opts={LOGO_FX.map((name, i) => ({ v: i, label: name }))} value={look.fx} set={(v) => setLook((l) => { l.fx = v; })} />
      </Row>
      <Row label="Theme" value={th.name} hint={d.syms ? "With custom symbols the theme sets only the colors, frame and call." : "The theme sets the symbols, colors and call, and counts toward the room's theming."}>
        <div className="dz-themes">
          {SLOT_THEME_IDS.map((t) => (
            <button key={t} className={t === d.theme ? "on" : ""} style={{ background: `linear-gradient(${SLOT_THEMES[t].bg[0]}, ${SLOT_THEMES[t].bg[1]})` }}
              onClick={() => { play("click"); set((n) => { if (n.show.call === SLOT_THEMES[n.theme].call) n.show.call = SLOT_THEMES[t].call; n.theme = t; }); }}>
              <span>{SLOT_THEMES[t].sets[0].highs[0].startsWith("#") ? "7️⃣" : SLOT_THEMES[t].sets[0].highs[0]}</span><small>{SLOT_THEMES[t].name}</small>
            </button>
          ))}
        </div>
      </Row>
      <Row label="Symbols" hint={d.syms ? "Pick each symbol from the library, best-paying first. Tap a spot, then a symbol; ◀ ▶ change what pays more." : undefined}>
        <Chips opts={[...th.sets.map((q, i) => ({ v: i as 0 | 1 | 2, label: <>{q.name}<small className="syms">{q.highs.map((h) => (h.startsWith("#") ? "7" : h)).join(" ")}</small></> })), { v: 2 as const, label: <>Custom<small className="syms">your own</small></> }]}
          value={d.syms ? 2 : d.set} set={(v) => set((n) => { if (v === 2) { if (!n.syms) n.syms = customFrom(n); } else { delete n.syms; n.set = v; } })} />
        {d.syms && <SymbolEditor d={d} set={set} />}
      </Row>
      <Row label="Theme rating" hint="How well the symbols go together, and how the colors, lights and call suit them. Guests who care about theming feel it.">
        <ThemeBar d={d} />
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
    { k: "Small wins", v: b.small, col: "#5ab0ff" }, { k: "Big wins", v: b.big, col: "#a07aff" }, { k: "Cascades", v: b.cascade, col: "#3ad0c0" },
    { k: "Mystery", v: b.mystery, col: "#c0e03a" }, { k: "Free spins", v: b.fs + b.scatter, col: "#ffb03a" }, { k: "Hold & spin", v: b.hns, col: "#ff7a3a" },
    { k: "Pick", v: b.pick, col: "#ff5ab0" }, { k: "Wheel", v: b.wheel, col: "#ffd23f" }, { k: "Offer", v: b.offer, col: "#7aff8a" },
    { k: "Collector", v: b.collect, col: "#e8a33a" }, { k: "Jackpots", v: b.jackpots, col: "#ff4a5a" },
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

/** A log slider for "1 in N spins". */
function Every({ v, lo, hi, set }: { v: number; lo: number; hi: number; set: (v: number) => void }) {
  return <Slider min={Math.log(lo)} max={Math.log(hi)} step={0.01} value={Math.log(v)} set={(q) => set(Math.round(Math.exp(q)))} />;
}
const FEATURE_DESC: Record<FeatureId, string> = {
  fs: "Scatters anywhere trigger free games; 4 or 5 scatters give more.",
  hns: "Six orbs (four on 3×3) lock in place and the rest respin; every new orb resets the respins to three. Orbs carry credits or jackpots; filling the screen can win the top jackpot.",
  pick: "Pick tiles until one says collect, or pick to match three jackpots. The prize is set when the feature starts, as in real games.",
  wheel: "A wheel of credit prizes and jackpots. Put it on top of the cabinet (Cabinet → Topper wheel): it's seen and heard across the floor.",
  cascade: "Winning symbols vanish and new ones drop in; a drop can win again. A climbing multiplier (×1, ×2, ×3, ×5) makes long chains thrilling.",
  collect: "Pieces land on some spins and fill a meter kept on the machine; a full meter pays its prize. Hunters look for machines left nearly full.",
  offer: "Up to four offers: take it or leave it for the next. Every offer is worth what refusing it is, so choices change the ride, not the payback.",
  mystery: "Base-game spice: a random multiplier on some wins, or a wild storm on some spins.",
};
const featDefault = (id: FeatureId, n: SlotDesign): Partial<SlotDesign> => {
  switch (id) {
    case "fs": return { fs: { every: 150, count: 1, retrigger: true, enh: "x2" } };
    case "hns": return { hns: { every: 120, land: 1, values: 1 } };
    case "pick": return { pick: { every: 180, mode: n.jackpots.some((j) => j.how === "pick") ? "match" : "collect", size: 1 } };
    case "wheel": return { wheel: { every: 220, spread: 1 } };
    case "cascade": return { cascade: { chain: 1, climb: true } };
    case "collect": return { collect: { size: 1, every: 300, prize: n.fs ? "super" : "credits", x: 50 } };
    case "offer": return { offer: { every: 200, size: 1 } };
    case "mystery": return { mystery: { kind: "mult", every: 20 } };
  }
};

function Features({ d, c, set, g }: { d: SlotDesign; c: Compiled; set: Set; g: Game }) {
  const classic = c.lay.win === "classic", on = featuresOf(d), full = on.length >= MAX_FEATURES;
  const info = (id: string) => c.feats.find((f) => f.id === id);
  const stat = (id: string, share: number) => {
    const f = info(id);
    if (!f || f.q <= 0) return "Never triggers as set";
    const avg = f.v + f.lv.reduce((a, i, k) => a + f.lc[k] * c.levels[i].xbar, 0);
    return `1 in ${Math.round(1 / ((1 - c.PJ) * f.q)).toLocaleString("en-US")} spins · pays ${avg.toFixed(1)}× the bet on average · ${pct(share / d.rtp)} of the payback`;
  };
  if (classic) return <p className="dz-hint">Classic 3-reel games have no bonus features. Pick a 3×3 or video layout for features.</p>;
  const card = (id: FeatureId, body: ReactNode, share?: number) => {
    const has = on.includes(id), lock = needs(g, FEATURE_RESEARCH[id]);
    return (
      <div key={id} className={`dz-feat ${has ? "on" : ""}`}>
        <div className="head">
          <b>{FEATURE_NAMES[id]}</b>
          <Toggle on={has} set={(v) => { if (v && full) { play("deny"); return; } set((n) => { if (v) Object.assign(n, featDefault(id, n)); else (n as unknown as Record<string, unknown>)[id] = null; if (!v && id === "wheel" && n.cab.topper === "wheel") n.cab.topper = "sign"; }); }} label={has ? "On" : full ? "Max 3" : lock ?? "Off"} />
        </div>
        <p className="dz-hint">{FEATURE_DESC[id]}</p>
        {has && share !== undefined && <p className="dz-stat">{stat(id, share)}</p>}
        {has && body}
      </div>
    );
  };
  const fs = d.fs, b = c.budget;
  return (
    <>
      <p className="dz-hint">Up to {MAX_FEATURES} features per game ({on.length} on). Each one's payback comes out of the base game: watch the budget bar in Math.</p>
      {card("fs", fs && (
        <>
          <Row label="How often"><Every v={fs.every} lo={60} hi={2000} set={(v) => set((n) => { n.fs!.every = v; })} /></Row>
          <Row label="Free games"><Chips opts={FS_COUNTS.map((q, i) => ({ v: i, label: q.name }))} value={fs.count} set={(v) => set((n) => { n.fs!.count = v; })} /></Row>
          <Row label="Retriggers"><Toggle on={fs.retrigger} set={(v) => set((n) => { n.fs!.retrigger = v; })} label={fs.retrigger ? "Can be won again" : "No"} /></Row>
          <Row label="During free spins" hint={FS_ENH[fs.enh].desc}><Chips opts={FS_ENH_IDS.map((id) => ({ v: id, label: FS_ENH[id].name }))} value={fs.enh} set={(v) => set((n) => { n.fs!.enh = v; })} /></Row>
        </>
      ), b.fs + b.scatter)}
      {card("hns", d.hns && (
        <>
          <Row label="How often"><Every v={d.hns.every} lo={FEAT_EVERY[0]} hi={FEAT_EVERY[1]} set={(v) => set((n) => { n.hns!.every = v; })} /></Row>
          <Row label="Orbs land" hint="How readily a respin lands an orb: generous means longer features and fuller screens."><Chips opts={HNS_LAND.map((q, i) => ({ v: i, label: q.name }))} value={d.hns.land} set={(v) => set((n) => { n.hns!.land = v; })} /></Row>
          <Row label="Orb values" hint="Steady orbs are mostly small; wild ones now and then carry 10× or 25×."><Chips opts={ORB_SPREAD.map((q, i) => ({ v: i, label: q.name }))} value={d.hns.values} set={(v) => set((n) => { n.hns!.values = v; })} /></Row>
        </>
      ), b.hns)}
      {card("pick", d.pick && (
        <>
          <Row label="Kind"><Chips opts={[{ v: "collect" as const, label: "Pick until collect" }, { v: "match" as const, label: "Pick to match (jackpots)" }]} value={d.pick.mode} set={(v) => set((n) => { n.pick!.mode = v; })} /></Row>
          {d.pick.mode === "collect" ? <>
            <Row label="How often"><Every v={d.pick.every} lo={FEAT_EVERY[0]} hi={FEAT_EVERY[1]} set={(v) => set((n) => { n.pick!.every = v; })} /></Row>
            <Row label="Prizes"><Chips opts={PICK_PRIZES.map((q, i) => ({ v: i, label: q.name }))} value={d.pick.size} set={(v) => set((n) => { n.pick!.size = v; })} /></Row>
          </> : <p className="dz-hint">It comes exactly as often as the jackpots won by picking (Jackpots tab: set a level to "Pick to match").</p>}
        </>
      ), b.pick)}
      {card("wheel", d.wheel && (
        <>
          <Row label="How often"><Every v={d.wheel.every} lo={FEAT_EVERY[0]} hi={FEAT_EVERY[1]} set={(v) => set((n) => { n.wheel!.every = v; })} /></Row>
          <Row label="Segments" hint="Jackpots won on the wheel get segments of their own (Jackpots tab)."><Chips opts={WHEEL_SEGS.map((q, i) => ({ v: i, label: q.name }))} value={d.wheel.spread} set={(v) => set((n) => { n.wheel!.spread = v; })} /></Row>
        </>
      ), b.wheel)}
      {card("cascade", d.cascade && (
        <>
          <Row label="Chains"><Chips opts={CASCADE_CHAIN.map((q, i) => ({ v: i, label: q.name }))} value={d.cascade.chain} set={(v) => set((n) => { n.cascade!.chain = v; })} /></Row>
          <Row label="Climbing multiplier"><Toggle on={d.cascade.climb} set={(v) => set((n) => { n.cascade!.climb = v; })} label={d.cascade.climb ? "×1, ×2, ×3, ×5" : "Off"} /></Row>
        </>
      ), b.cascade)}
      {card("collect", d.collect && (
        <>
          <Row label="Meter"><Chips opts={COLLECT_SIZES.map((q, i) => ({ v: i, label: `${q} pieces` }))} value={d.collect.size} set={(v) => set((n) => { n.collect!.size = v; })} /></Row>
          <Row label="Fills about every" value={`${d.collect.every} spins`}><Every v={d.collect.every} lo={COLLECT_EVERY[0]} hi={COLLECT_EVERY[1]} set={(v) => set((n) => { n.collect!.every = v; })} /></Row>
          <Row label="Prize"><Chips opts={[...COLLECT_X.map((x) => ({ v: `c${x}`, label: `${x}× bet` })), ...(d.fs ? [{ v: "super", label: "Super free games (×3)" }] : [])]} value={d.collect.prize === "super" ? "super" : `c${d.collect.x}`}
            set={(v) => set((n) => { if (v === "super") n.collect!.prize = "super"; else { n.collect!.prize = "credits"; n.collect!.x = Number(v.slice(1)); } })} /></Row>
        </>
      ), b.collect)}
      {card("offer", d.offer && (
        <>
          <Row label="How often"><Every v={d.offer.every} lo={FEAT_EVERY[0]} hi={FEAT_EVERY[1]} set={(v) => set((n) => { n.offer!.every = v; })} /></Row>
          <Row label="Offers"><Chips opts={OFFER_SIZES.map((q, i) => ({ v: i, label: `${q.name} (${q.v}×)` }))} value={d.offer.size} set={(v) => set((n) => { n.offer!.size = v; })} /></Row>
        </>
      ), b.offer)}
      {card("mystery", d.mystery && (
        <>
          <Row label="Kind"><Chips opts={[{ v: "mult" as const, label: "Mystery multiplier" }, { v: "wilds" as const, label: "Wild storm" }]} value={d.mystery.kind} set={(v) => set((n) => { n.mystery!.kind = v; })} /></Row>
          <Row label="How often" value={d.mystery.kind === "mult" ? `1 in ${d.mystery.every} wins` : `1 in ${d.mystery.every} spins`}><Every v={d.mystery.every} lo={MYSTERY_EVERY[0]} hi={MYSTERY_EVERY[1]} set={(v) => set((n) => { n.mystery!.every = v; })} /></Row>
        </>
      ), b.mystery)}
    </>
  );
}

function Jackpots({ d, c, set, bet, g }: { d: SlotDesign; c: Compiled; set: Set; bet: number; g: Game }) {
  const classic = c.lay.win === "classic", max = classic ? 1 : 4, n = d.jackpots.length;
  const X = [2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 25000, 50000, 100000];
  const top = d.maxBet * d.denom;
  const hows: JackpotHow[] = ["sym", ...(d.hns ? ["hns" as const] : []), ...(d.wheel ? ["wheel" as const] : []), ...(d.pick?.mode === "match" ? ["pick" as const] : []), "mystery"];
  const $ = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return (
    <>
      <Row label="Jackpot levels" hint={classic ? "Three jackpot symbols on the line." : "Fixed amounts are multiples of the bet. Progressives grow with every bet; their seed is a multiple of the largest bet, and a smaller bet wins them less often (same payback at every bet)."}>
        <Chips opts={Array.from({ length: max + 1 }, (_, i) => ({ v: i, label: i ? `${i}` : "None" }))} value={n}
          set={(v) => set((q) => { q.jackpots = Array.from({ length: v }, (_, i) => q.jackpots[i] ?? JACKPOT_DEFAULTS[4 - v + i]); })} />
      </Row>
      {d.jackpots.map((j, i) => {
        const xi = Math.max(0, X.findIndex((v) => v >= j.x)), kind = kindOf(j), how = howOf(j), l = c.levels[i];
        const prog = kind !== "fixed";
        return (
          <div key={i} className="dz-level">
            <b>{levelName(n, i, classic)}</b>
            <Row label="Kind" hint={JACKPOT_KINDS[kind].desc}>
              <Chips opts={(Object.keys(JACKPOT_KINDS) as JackpotKind[]).map((k) => ({ v: k, label: JACKPOT_KINDS[k].name }))} value={kind} lock={(k) => needs(g, JACKPOT_KINDS[k].research)}
                set={(k) => set((q) => { const lv = q.jackpots[i]; if (k === "fixed") { delete lv.kind; delete lv.inc; delete lv.cap; } else { lv.kind = k; lv.inc = lv.inc ?? 0.005; if (k === "mhb") { lv.cap = lv.cap ?? 2; delete lv.how; delete lv.max; } } })} />
            </Row>
            <Row label={prog ? "Seed" : "Pays"} value={prog ? `${j.x}× the largest bet · ${$(j.x * top)}` : `${j.x}× bet · ${$(j.x * bet)} now`}>
              <Slider min={0} max={X.length - 1} step={1} value={xi} set={(v) => set((q) => { q.jackpots[i].x = X[v]; })} />
            </Row>
            {kind !== "mhb" && (
              <Row label="How often" value={`1 in ${Math.round(1 / (l?.p ?? 1 / j.every)).toLocaleString("en-US")} spins${prog ? " at the largest bet" : ""}`}>
                <Slider min={Math.log(50)} max={Math.log(1e8)} step={0.01} value={Math.log(j.every)} set={(v) => set((q) => { q.jackpots[i].every = Math.round(Math.exp(v)); })} />
              </Row>
            )}
            {prog && (
              <Row label="Increment" value={`${((j.inc ?? 0.005) * 100).toFixed(2)}% of every bet`} hint={l ? `Pays ${$(l.xbar * top)} on average (seed plus what the meter gathers)${kind === "mhb" ? `, about once every ${Math.round(1 / l.p).toLocaleString("en-US")} largest bets` : ""}.` : undefined}>
                <Slider min={INC_RANGE[0]} max={INC_RANGE[1]} step={0.0005} value={j.inc ?? 0.005} set={(v) => set((q) => { q.jackpots[i].inc = v; })} />
              </Row>
            )}
            {kind === "mhb" && (
              <Row label="Must hit by" value={`${(j.cap ?? 2).toFixed(2)}× the seed · ${$((j.cap ?? 2) * j.x * top)}`} hint="It always hits somewhere between the seed and this cap. Hunters camp on it as it nears the cap: a higher cap keeps them guessing.">
                <Slider min={CAP_RANGE[0]} max={CAP_RANGE[1]} step={0.05} value={j.cap ?? 2} set={(v) => set((q) => { q.jackpots[i].cap = Math.round(v * 100) / 100; })} />
              </Row>
            )}
            {!classic && kind !== "mhb" && (
              <Row label="Won by" hint={how === "hns" && i === n - 1 ? "The top level in a hold & spin is won by filling the screen." : undefined}>
                <Chips opts={hows.map((h) => ({ v: h, label: JACKPOT_HOWS[h] }))} value={hows.includes(how) ? how : "sym"} set={(v) => set((q) => { if (v === "sym") delete q.jackpots[i].how; else q.jackpots[i].how = v; })} />
              </Row>
            )}
            {kind !== "mhb" && (
              <Row label="Bets" hint={j.max ? "A hit on a smaller bet pays nothing (real, profitable, and guests remember it)." : undefined}>
                <Toggle on={!!j.max} set={(v) => set((q) => { if (v) q.jackpots[i].max = true; else delete q.jackpots[i].max; })} label={j.max ? "Largest bet only" : "Any bet"} />
              </Row>
            )}
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
      <Row label="Theme rating"><ThemeBar d={d} /></Row>
    </>
  );
}

function Cabinet({ d, set, g }: { d: SlotDesign; set: Set; g: Game }) {
  const pr = designPrice(d), look = d.look ?? defaultLook();
  const setLook = (f: (l: Look) => void) => set((n) => { n.look = { ...(n.look ?? defaultLook()) }; f(n.look); });
  return (
    <>
      <Row label="Cabinet" value={`${money(pr.cost)} · ${money(pr.upkeep)}/mo`} hint={CABINETS[d.cab.type].desc}>
        <Chips opts={CAB_IDS.map((id) => ({ v: id, label: CABINETS[id].name, sub: money(CABINETS[id].cost) }))} value={d.cab.type} lock={(v) => needs(g, CABINETS[v].research)} set={(v) => set((n) => { n.cab.type = v; })} />
      </Row>
      <Row label="Body color">
        <div className="dz-swatches">{BODY_COLORS.map((b, i) => <button key={b.name} className={i === d.cab.body ? "on" : ""} style={{ background: `linear-gradient(${b.ramp[1]}, ${b.ramp[3]})` }} onClick={() => set((n) => { n.cab.body = i; })} aria-label={b.name} />)}</div>
      </Row>
      <Row label="Topper" hint={d.cab.topper === "wheel" ? "The wheel feature spins on top of the cabinet: seen and heard across the floor." : "A topper wheel needs the wheel feature."}>
        <Chips opts={TOPPER_IDS.map((id) => ({ v: id, label: TOPPERS[id].name, sub: TOPPERS[id].cost ? money(TOPPERS[id].cost) : undefined }))} value={d.cab.topper}
          lock={(v) => (v === "wheel" && !d.wheel ? "Needs a wheel" : null)} set={(v) => set((n) => { n.cab.topper = v; })} />
      </Row>
      <Row label="Top box" hint="The machine's face: looks only, free, no certification."><Chips opts={LOOK_TOP.map((q, i) => ({ v: i, label: q }))} value={look.top} set={(v) => setLook((l) => { l.top = v; })} /></Row>
      <Row label="Jackpot meters"><Chips opts={LOOK_METERS.map((q, i) => ({ v: i, label: q }))} value={look.meters} set={(v) => setLook((l) => { l.meters = v; })} /></Row>
      <Row label="Reel window"><Chips opts={LOOK_REELS.map((q, i) => ({ v: i, label: q }))} value={look.reels} set={(v) => setLook((l) => { l.reels = v; })} /></Row>
      <Row label="Buttons"><Chips opts={LOOK_DECK.map((q, i) => ({ v: i, label: q }))} value={look.deck} set={(v) => setLook((l) => { l.deck = v; })} /></Row>
      <Row label="Theme rating"><ThemeBar d={d} /></Row>
    </>
  );
}

/** The lab: ratings from a test panel of this casino's own guests, the panel's words, exact numbers, forced outcomes. */
function Lab({ c, g, onForce, onRefill }: { c: Compiled; g: Game; onForce: (f: Force) => void; onRefill: () => void }) {
  const mix = panelMix(g.state);
  // c keeps its identity through looks-only changes; c.d doesn't (symbols and colors move the panel too).
  const pn = useMemo(() => panel(c, mix), [c, c.d]); // eslint-disable-line react-hooks/exhaustive-deps
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
      <Row label="Ratings" hint="Excitement: how a test panel of this casino's own guests felt. Intensity: how hard it swings. Drain: how fast it takes money. None of them is good or bad on its own. Theme: how well its symbols and looks go together.">
        {bar("Excitement", r.excitement, ratingWord(r.excitement), "#ffcf3a")}
        {bar("Intensity", r.intensity, ratingWord(r.intensity, INTENSITY_WORDS), "#ff7a3a")}
        {bar("Drain", r.drain, ratingWord(r.drain), "#ff4a6a")}
        <ThemeBar d={c.d} />
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
