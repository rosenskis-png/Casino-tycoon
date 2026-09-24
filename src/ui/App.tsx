// App shell (FOUNDATIONS §21): top bar, ticker + log, world, tab bar, panels, inspector.
// Changes the game only through host.game.dispatch(command).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatDate, SPEEDS, TICKS_PER_DAY, type Command, type Game, type Speed } from "../sim";
import { play, unlockAudio } from "../platform/audio";
import { FloorAudio } from "./floorAudio";
import { TitleScreen } from "./title";
import { PlayScreen } from "./play";
import { Designer } from "./designer/Designer";
import { SlotsPanel } from "./designer/SlotsPanel";
import type { SlotDesign } from "../data/designer";
import { onHidden } from "../platform/lifecycle";
import { Host } from "./host";
import { WorldInput, type Tool } from "./input";
import { Ticker, type TickerItem } from "./ticker";
import { money } from "./format";
import { AUTO_KEY, load, newGame, save } from "./saves";
import { newDesign } from "../data/designer";
import { placeTool } from "./panels";
import { AuthoritiesPanel, BuildPanel, FinancePanel, PoliciesPanel, ResearchPanel, GamePanel, GoalsPanel, GuestsPanel, Inspector, LogSheet, Placeholder, StaffPanel, type Selection } from "./panels";

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
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const [rot, setRot] = useState(0);
  const rotRef = useRef(rot);
  rotRef.current = rot;
  const [sel, setSel] = useState<Selection>(null);
  const [showLog, setShowLog] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
        else if (e.type === "news") { ticker.push({ level: e.level, text: e.text }, performance.now()); sound(e.level === "urgent" ? "urgent" : "news"); }
        else if (e.type === "commandRejected") {
          setToast(e.reason);
          clearTimeout(toastTimer);
          toastTimer = window.setTimeout(() => setToast(null), 1800);
        }
      });
    };
    attach(initial);
    const offGame = h.onGame((g) => { attach(g); setSel(null); });
    if (bootNote) ticker.push(bootNote, performance.now());
    else ticker.push({ level: "info", text: initial.state.log.at(-1)?.text ?? "Welcome." }, performance.now());
    const input = new WorldInput(h, canvasRef.current!, {
      tool: () => toolRef.current,
      rot: () => rotRef.current,
      command: (c: Command) => h.game.dispatch(c),
      tap: (tile, fx, fy) => {
        const g = h.game;
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
    const autosave = setInterval(() => { if (h.speed > 0) save(h.game); }, 30_000);
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

  // Keep selection highlight in the renderer.
  if (host) {
    host.drawOptions.selectedTile = sel?.kind === "tile" ? sel.tile : undefined;
    host.drawOptions.selectedAgent = sel?.kind === "agent" ? sel.id : undefined;
  }

  const g = host?.game;
  const cur = tickerRef.current.current;
  const playing = !!g?.state.yours && !title;
  if (floorRef.current) floorRef.current.duck = playing ? 0.5 : 1;
  /** Back to the title screen (Game tab): save first, or go back to the last save. */
  const toMenu = (keep: boolean) => {
    if (!host) return;
    if (keep) save(host.game, AUTO_KEY);
    else { const r = load(AUTO_KEY); if (r.game) host.setGame(r.game); }
    host.setSpeed(0);
    if (floorRef.current) floorRef.current.enabled = false;
    setTab(null);
    setSel(null);
    titleAwake.current = true;
    setTitle(true);
  };
  const leaveTitle = () => {
    titleAwake.current = true;
    setTitle(false);
    if (floorRef.current) floorRef.current.enabled = true;
    host?.setSpeed(1);
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
  const zoom = (d: number) => {
    if (!host) return;
    const r = canvasRef.current!.getBoundingClientRect();
    host.camera.zoomAt(host.camera.level + d, r.width / 2, r.height / 2, r.width, r.height);
    host.notify();
  };

  return (
    <div className="ct">
      <div className="top">
        <span className="cash num">{g ? money(g.state.cash) : ""}</span>
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
        <span className={`msg lv-${cur?.level ?? "info"}`}>{cur?.text ?? ""}</span>
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
      </div>
      {host && showLog && <LogSheet game={host.game} onClose={() => setShowLog(false)} />}
      {host && !showLog && !playing && sel && <Inspector host={host} sel={sel} onClose={() => setSel(null)} />}
      {host && !showLog && !playing && !designing && !sel && tab && (
        <div className="sheet">
          <h3>{TABS.find((t) => t.id === tab)!.label}<button className="x" onClick={() => { setTab(null); setTool("inspect"); }}>✕</button></h3>
          {tab === "build" ? <BuildPanel host={host} tool={tool} setTool={setTool} rot={rot} setRot={setRot} thumb={(k) => host.renderer.thumbnail(k)} onDesigner={() => setDesigning(newDesignFor())} /> :
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
      {host && title && <TitleScreen awake={titleAwake.current} hasGame={host.game.state.tick > 0} scenario={host.game.state.scenario} onContinue={leaveTitle}
        onNew={(id) => { const n = newGame(Date.now(), id); host.setGame(n); save(n, AUTO_KEY); leaveTitle(); }} />}
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
  return "Tap to place · drag to position · Rotate in the Build tab";
}
