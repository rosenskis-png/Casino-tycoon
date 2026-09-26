// App shell (FOUNDATIONS §21): top bar, ticker + log, world, tab bar, panels, inspector.
// Changes the game only through host.game.dispatch(command).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatDate, SPEEDS, TICKS_PER_DAY, type Command, type Game, type NewsRef, type Speed } from "../sim";
import { play, unlockAudio } from "../platform/audio";
import { FloorAudio } from "./floorAudio";
import { TitleScreen } from "./title";
import { PlayScreen } from "./play";
import { reveal } from "./reveal";
import { Designer } from "./designer/Designer";
import { SlotsPanel } from "./designer/SlotsPanel";
import { OfferLetter } from "./designer/Market";
import type { SlotDesign } from "../data/designer";
import { SCENARIOS } from "../data/scenarios";
import { onHidden } from "../platform/lifecycle";
import { Host } from "./host";
import { WorldInput, type Tool } from "./input";
import { Ticker, type TickerItem } from "./ticker";
import { money } from "./format";
import { AUTO_KEY, load, newGame, save } from "./saves";
import { noticeOn } from "./notices";
import { newDesign } from "../data/designer";
import { placeTool } from "./panels";
import { Letter, AuthoritiesPanel, BuildPanel, FinancePanel, PoliciesPanel, ResearchPanel, GamePanel, GoalsPanel, GuestsPanel, Inspector, LogSheet, Placeholder, StaffPanel, selArea, type Selection } from "./panels";

const TABS = [
  { id: "build", icon: "🔨", label: "Build" },
  { id: "slots", icon: "🎰", label: "Slots" },
  { id: "staff", icon: "🧹", label: "Staff" },
  { id: "guests", icon: "🧑", label: "Guests" },
  { id: "finance", icon: "💰", label: "Finance" },
  { id: "policies", icon: "📜", label: "Policies" },
  { id: "research", icon: "🔬", label: "Research" },
  { id: "authorities", icon: "⚖️", label: "Authorities" },
  { id: "goals", icon: "🏆", label: "Goals" },
  { id: "game", icon: "⚙️", label: "Game" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Incidents loud enough to hear from anywhere on the floor. */
const INCIDENT_SOUND: Record<string, string> = { fight: "fight", cheer: "cheer", round: "cheer", vomit: "retch", passout: "thud" };

const SPEED_LABEL: Record<Speed, string> = { 0: "❚❚", 1: "1×", 2: "2×", 4: "4×", 8: "8×" };

export function App({ initial, bootNote }: { initial: Game; bootNote?: TickerItem }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [host, setHost] = useState<Host | null>(null);
  const [tab, setTab] = useState<TabId | null>(null);
  const [tool, setTool] = useState<Tool>("inspect");
  // (2026-09-26) Bumped when the objects picked for a group change, so the Build tab redraws.
  const [, setPickN] = useState(0);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const [rot, setRot] = useState(0);
  const rotRef = useRef(rot);
  rotRef.current = rot;
  const [sel, setSel] = useState<Selection>(null);
  /** (Batch C) Someone picked up: the next tap on the floor sets them down. */
  const [lifted, setLifted] = useState<number | null>(null);
  const liftRef = useRef<number | null>(null);
  liftRef.current = lifted;
  const [showLog, setShowLog] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** (M12) A new game's letter (the scenario's intro), shown until dismissed. */
  const [letter, setLetter] = useState(false);
  /** (Batch A) A pop-up that paused the game: the scenario won or lost, or a slot maker's offer. */
  const [alert, setAlert] = useState<"won" | "lost" | "offer" | null>(null);
  /** What the pop-ups have already shown for the game in play (a loaded game's standing outcome isn't news). */
  const seen = useRef({ outcome: initial.state.outcome as string, offer: !!initial.state.offer });
  const toastTimer = useRef(0);
  const showToast = (t: string) => { setToast(t); clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 2200); };
  /** (M8) The slot designer, open on a design. */
  const [designing, setDesigning] = useState<SlotDesign | null>(null);
  // The title screen shows at launch (skipped with #play, for the screenshot tool). The floor waits behind it.
  const [title, setTitle] = useState(() => !location.hash.includes("play"));
  const titleRef = useRef(title);
  titleRef.current = title;
  const floorRef = useRef<FloorAudio | null>(null);
  /** Audio is unlocked after the first title screen, so a return to it plays the theme straight away. */
  const titleAwake = useRef(false);
  const tickerRef = useRef(new Ticker());
  const [, force] = useState(0);

  useEffect(() => {
    const h = new Host(canvasRef.current!, initial);
    setHost(h);
    const ticker = tickerRef.current;
    let toastTimer = 0;
    const floor = new FloorAudio(h);
    floorRef.current = floor;
    if (titleRef.current) { floor.enabled = false; h.setSpeed(0); }
    const lastSound = new Map<string, number>();
    // Sounds with a place on the floor are heard from the camera; a jackpot carries across the floor.
    const sound = (id: string, x?: number, y?: number) => {
      const now = performance.now();
      if (now - (lastSound.get(id) ?? 0) < 60) return;
      lastSound.set(id, now);
      if (x === undefined || y === undefined) { play(id); return; }
      const p = floor.place(x + 0.5, y + 0.5);
      play(id, { gain: id === "jackpot" ? Math.max(0.4, p.gain) : p.gain, pan: p.pan });
    };
    let unsub = () => {};
    const attach = (g: Game) => {
      unsub();
      unsub = g.bus.on((e) => {
        if (e.type === "sound") sound(e.id, e.x, e.y);
        else if (e.type === "jackpot") sound("jackpot", e.x, e.y);
        else if (e.type === "broken") { const o = g.objById.get(e.obj); sound("broken", o?.x, o?.y); }
        else if (e.type === "incident" && INCIDENT_SOUND[e.kind]) sound(INCIDENT_SOUND[e.kind], e.x, e.y);
        else if (e.type === "news") {
          if (e.level !== "urgent" && e.cat && !noticeOn(e.cat)) return;
          ticker.push({ level: e.level, text: e.text, ref: e.ref }, performance.now()); sound(e.level === "urgent" ? "urgent" : "news"); }
        else if (e.type === "commandRejected") {
          setToast(e.reason);
          clearTimeout(toastTimer);
          toastTimer = window.setTimeout(() => setToast(null), 1800);
        }
      });
    };
    attach(initial);
    const offGame = h.onGame((g) => { attach(g); setSel(null); setAlert(null); seen.current = { outcome: g.state.outcome, offer: !!g.state.offer }; });
    if (bootNote) ticker.push(bootNote, performance.now());
    else ticker.push({ level: "info", text: initial.state.log.at(-1)?.text ?? "Welcome." }, performance.now());
    const input = new WorldInput(h, canvasRef.current!, {
      tool: () => toolRef.current,
      rot: () => rotRef.current,
      command: (c: Command) => { h.game.dispatch(c); if (c.type === "move") setTool("inspect"); },
      picked: () => setPickN((n) => n + 1),
      tap: (tile, fx, fy) => {
        const g = h.game;
        if (liftRef.current !== null) {
          const id = liftRef.current;
          if (tile < 0 || !g.walkable(tile)) { play("deny"); return; }
          g.dispatch({ type: "placeAgent", id, tile });
          setLifted(null);
          if (g.state.agents.some((a) => a.id === id)) setSel({ kind: "agent", id });
          return;
        }
        let best: number | null = null, bd = 0.7;
        for (const a of g.state.agents) {
          if (a.hidden) continue;
          const d = Math.hypot(a.x + 0.5 - fx, a.y + 0.2 - fy);
          if (d < bd) { bd = d; best = a.id; }
        }
        setSel(best !== null ? { kind: "agent", id: best } : tile >= 0 ? { kind: "tile", tile } : null);
      },
    });
    const tickT = setInterval(() => { if (ticker.update(performance.now())) force((n) => n + 1); }, 100);
    const autosave = setInterval(() => { if (!titleRef.current) save(h.game); }, 30_000); // paused building counts too
    const offHidden = onHidden(() => save(h.game));
    const unlock = () => unlockAudio();
    // iPhone Safari only starts audio from these (not pointerdown): try on every one until it's running.
    const UNLOCK_EVENTS = ["pointerdown", "touchend", "click", "keydown"];
    for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, unlock, true);
    h.start();
    (window as unknown as { __ctHost?: Host }).__ctHost = h;
    return () => {
      h.stop(); input.dispose(); unsub(); offGame(); offHidden(); floor.dispose();
      clearInterval(tickT); clearInterval(autosave);
      for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, unlock, true);
    };
  }, [initial, bootNote]);

  const sub = host?.subscribe ?? noopSub;
  useSyncExternalStore(sub, () => (host ? `${host.game.state.tick}|${host.game.state.cash}|${host.speed}|${host.camera.level}` : ""));

  // (Batch A, owner) Winning, losing and a maker's offer pause the game for a pop-up.
  useEffect(() => {
    if (!host || title) return;
    const s = host.game.state, sn = seen.current;
    let pop: typeof alert = null;
    if (s.outcome && s.outcome !== sn.outcome) pop = s.outcome;
    else if (s.offer && !sn.offer) pop = "offer";
    sn.outcome = s.outcome;
    sn.offer = !!s.offer;
    if (pop && !alert) { host.setSpeed(0); setAlert(pop); play(pop === "lost" ? "urgent" : "news"); }
  });

  // (2026-09-26) Objects picked for a group are let go once the pick tool is put away.
  useEffect(() => { if (host && tool !== "pick" && host.picked.length) { host.picked = []; host.markPicked(); } }, [host, tool]);

  // Keep selection highlight in the renderer.
  if (host) {
    host.drawOptions.selectedTile = sel?.kind === "tile" ? sel.tile : undefined;
    host.drawOptions.selectedAgent = sel?.kind === "agent" ? sel.id : undefined;
    host.drawOptions.liftedAgent = lifted ?? undefined;
    host.drawOptions.areaRooms = selArea(host.game, sel);
  }

  const g = host?.game;
  const cur = tickerRef.current.current;
  const playing = !!g?.state.yours && !title;
  if (floorRef.current) floorRef.current.duck = playing ? 0.5 : 1;
  /** Back to the title screen (Game tab): save first, or go back to the last save. */
  const toMenu = (keep: boolean) => {
    if (!host) return;
    if (keep && !save(host.game, AUTO_KEY)) showToast("Saved for this session only: this browser blocked storage.");
    else { const r = load(AUTO_KEY); if (r.game) host.setGame(r.game); }
    host.setSpeed(0);
    if (floorRef.current) floorRef.current.enabled = false;
    setTab(null);
    setSel(null);
    titleAwake.current = true;
    setTitle(true);
  };
  /** (Batch A, owner) A new scenario starts paused; a continued game picks up at 1×. */
  const leaveTitle = (paused = false) => {
    titleAwake.current = true;
    setTitle(false);
    if (floorRef.current) floorRef.current.enabled = true;
    host?.setSpeed(paused ? 0 : 1);
  };
  /** Pick up a slot design to place from the Build tab. */
  const placeDesign = (id: string) => {
    const t = placeTool(host!.game.state, id);
    if (!t) return;
    setTab("build");
    setTool(t as Tool);
    setSel(null);
  };
  const newDesignFor = () => newDesign("");
  const openTab = (id: TabId) => {
    play("click");
    setTab((t) => (t === id ? null : id));
    if (id !== "build") setTool("inspect");
  };
  /** (M11) Tapping a notice: go to what it's about (the person, else the place) and open its card, or open its tab. */
  const focus = (ref?: NewsRef) => {
    if (!host || !ref) return;
    play("click");
    setShowLog(false);
    const g = host.game, w = g.state.map.w;
    if (ref.tab && TABS.some((t) => t.id === ref.tab)) { setSel(null); setTool("inspect"); setTab(ref.tab as TabId); return; }
    const a = ref.a !== undefined ? g.state.agents.find((b) => b.id === ref.a && !b.hidden) : undefined;
    const tile = a ? a.y * w + a.x : ref.t;
    if (tile === undefined) return;
    const cam = host.camera;
    cam.cx = (tile % w) + 0.5;
    cam.cy = Math.floor(tile / w) + 0.5;
    if (cam.level > 1) cam.level = 1;
    host.notify();
    setTab(null);
    setTool("inspect");
    setSel(a ? { kind: "agent", id: a.id } : { kind: "tile", tile });
  };
  const zoom = (d: number) => {
    if (!host) return;
    const r = canvasRef.current!.getBoundingClientRect();
    host.camera.zoomAt(host.camera.level + d, r.width / 2, r.height / 2, r.width, r.height);
    host.notify();
  };

  return (
    <div className="ct">
      <div className="top">
        <span className="cash num">{g ? (SCENARIOS[g.state.scenario]?.unlimited ? "Unlimited" : money(playing && reveal.cash !== null ? reveal.cash : g.state.cash)) : ""}</span>
        <span className="date num">{g ? formatDate(Math.floor(g.state.tick / TICKS_PER_DAY)) : ""}</span>
        {!playing && <div className="speeds">
          {SPEEDS.map((s) => (
            <button key={s} className={host?.speed === s ? "on" : ""} onClick={() => { host?.setSpeed(s); play("click"); }} aria-label={s ? `Speed ${s}` : "Pause"}>
              {SPEED_LABEL[s]}
            </button>
          ))}
        </div>}
      </div>
      <div className="ticker">
        <span className={`msg lv-${cur?.level ?? "info"}${cur?.ref ? " go" : ""}`} onClick={() => focus(cur?.ref)}>{cur?.text ?? ""}</span>
        <button className="log" onClick={() => { setShowLog(true); tickerRef.current.clearQueue(); }}>Log</button>
      </div>
      <div className="world">
        <canvas ref={canvasRef} />
        {tool !== "inspect" && <div className="tools-hint">{toolHint(tool)}</div>}
        <div className="zoom">
          <button className="fab" onClick={() => zoom(-1)} aria-label="Zoom in">+</button>
          <button className="fab" onClick={() => zoom(1)} aria-label="Zoom out">−</button>
        </div>
        {host && playing && <PlayScreen host={host} />}
        {host && designing && !playing && <Designer g={host.game} start={designing} toast={showToast} onClose={() => setDesigning(null)}
          onPlace={(id) => { setDesigning(null); placeDesign(id); }} />}
        {toast && <div className="toast">{toast}</div>}
        {host && letter && SCENARIOS[host.game.state.scenario].intro && (
          <div className="letter-wrap">
            <Letter intro={SCENARIOS[host.game.state.scenario].intro!} />
            <button className="btn big" onClick={() => { setLetter(false); showToast("Paused: build as much as you like, then press 1× to open."); }}>Understood</button>
          </div>
        )}
        {host && !letter && alert && alert !== "offer" && (
          <div className="letter-wrap">
            <div className="letter">
              <p><b>{alert === "won" ? "Scenario complete!" : "Scenario lost."}</b></p>
              <p>{alert === "won" ? "You met every goal. Keep playing as long as you like." : host.game.state.log.filter((l) => l.level === "urgent").at(-1)?.text ?? "The goals weren't met."}</p>
            </div>
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn big" onClick={() => { setAlert(null); setTab("goals"); }}>See goals</button>
              <button className="btn big" onClick={() => setAlert(null)}>Keep playing</button>
            </div>
          </div>
        )}
        {host && !letter && alert === "offer" && host.game.state.offer && (
          <div className="letter-wrap">
            <OfferLetter g={host.game} onAnswer={() => setAlert(null)} />
            <button className="btn big" onClick={() => setAlert(null)}>Decide later<small>it waits in the Slots tab</small></button>
          </div>
        )}
      </div>
      {host && showLog && <LogSheet game={host.game} onClose={() => setShowLog(false)} onGo={focus} />}
      {host && !showLog && !playing && sel && <Inspector host={host} sel={sel} onClose={() => setSel(null)} onMove={(id, r) => { setRot(r); setTool(`move:${id}`); }} onLift={(id) => { setSel(null); setTab(null); setTool("inspect"); setLifted(id); }} />}
      {host && lifted !== null && (
        <div className="sheet lift-bar">
          <span>Tap where to set them down.</span>
          <button className="btn" onClick={() => setLifted(null)}>Put back</button>
        </div>
      )}
      {host && !showLog && !playing && !designing && !sel && tab && (
        <div className="sheet">
          <h3>{TABS.find((t) => t.id === tab)!.label}<button className="x" onClick={() => { setTab(null); setTool("inspect"); }}>✕</button></h3>
          {tab === "build" ? <BuildPanel host={host} tool={tool} setTool={setTool} rot={rot} setRot={setRot} thumb={(k, d) => host.renderer.thumbnail(k, d)} onDesigner={() => setDesigning(newDesignFor())} /> :
            tab === "slots" ? <SlotsPanel g={host.game} open={(d) => setDesigning(d)} place={placeDesign} /> :
            tab === "game" ? <GamePanel host={host} onMenu={toMenu} /> :
            tab === "staff" ? <StaffPanel host={host} /> :
            tab === "guests" ? <GuestsPanel host={host} /> :
            tab === "finance" ? <FinancePanel host={host} /> :
            tab === "policies" ? <PoliciesPanel host={host} /> :
            tab === "research" ? <ResearchPanel host={host} /> :
            tab === "goals" ? <GoalsPanel host={host} /> :
            tab === "authorities" ? <AuthoritiesPanel host={host} /> :
            <Placeholder when={(TABS.find((t) => t.id === tab) as { when?: string }).when ?? ""} />}
        </div>
      )}
      {!playing && !designing && <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => openTab(t.id)}>
            <span className="i">{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>}
      {host && title && <TitleScreen awake={titleAwake.current} hasGame={host.game.state.tick > 0} scenario={host.game.state.scenario} onContinue={() => leaveTitle()}
        onNew={(id) => { const n = newGame(Date.now(), id); host.setGame(n); save(n, AUTO_KEY); leaveTitle(true); setLetter(!!SCENARIOS[id].intro); }} />}
    </div>
  );
}

const noopSub = () => () => {};

function toolHint(t: Tool): string {
  if (t === "wall") return "Drag to draw a wall · two fingers to move";
  if (t === "door") return "Tap a wall to add a door";
  if (t === "demolish") return "Drag over walls or doors to remove them";
  if (t === "entrance") return "Tap your land beside the sidewalk to open a way in";
  if (t === "remove") return "Tap an object to sell it (half price back)";
  if (t.startsWith("move:")) return "Tap where it should go · Rotate in the Build tab";
  if (t === "pick") return "Tap objects to add or take away · drag a box around several";
  if (t.startsWith("group:")) return "Tap to build the group there · drag to position · Rotate in the Build tab";
  return "Tap to place · drag for a row · Rotate in the Build tab";
}
