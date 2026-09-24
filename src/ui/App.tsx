// App shell (FOUNDATIONS §21): top bar, ticker + log, world, tab bar, panels, inspector.
// Changes the game only through host.game.dispatch(command).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatDate, SPEEDS, TICKS_PER_DAY, type Command, type Game, type Speed } from "../sim";
import { play, unlockAudio } from "../platform/audio";
import { onHidden } from "../platform/lifecycle";
import { Host } from "./host";
import { WorldInput, type Tool } from "./input";
import { Ticker, type TickerItem } from "./ticker";
import { money } from "./format";
import { save } from "./saves";
import { AuthoritiesPanel, BuildPanel, FinancePanel, PoliciesPanel, GamePanel, GoalsPanel, GuestsPanel, Inspector, LogSheet, Placeholder, StaffPanel, type Selection } from "./panels";

const TABS = [
  { id: "build", icon: "🔨", label: "Build" },
  { id: "staff", icon: "🧹", label: "Staff" },
  { id: "guests", icon: "🧑", label: "Guests" },
  { id: "finance", icon: "💰", label: "Finance" },
  { id: "policies", icon: "📜", label: "Policies" },
  { id: "research", icon: "🔬", label: "Research", when: "M9.5" },
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
  const tickerRef = useRef(new Ticker());
  const [, force] = useState(0);

  useEffect(() => {
    const h = new Host(canvasRef.current!, initial);
    setHost(h);
    const ticker = tickerRef.current;
    let toastTimer = 0;
    const lastSound = new Map<string, number>();
    const sound = (id: string) => {
      const now = performance.now();
      if (now - (lastSound.get(id) ?? 0) < 60) return;
      lastSound.set(id, now);
      play(id);
    };
    let unsub = () => {};
    const attach = (g: Game) => {
      unsub();
      unsub = g.bus.on((e) => {
        if (e.type === "sound") sound(e.id);
        else if (e.type === "jackpot") sound("jackpot");
        else if (e.type === "broken") sound("broken");
        else if (e.type === "incident" && INCIDENT_SOUND[e.kind]) sound(INCIDENT_SOUND[e.kind]);
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
    window.addEventListener("pointerdown", unlock);
    h.start();
    (window as unknown as { __ctHost?: Host }).__ctHost = h;
    return () => {
      h.stop(); input.dispose(); unsub(); offGame(); offHidden();
      clearInterval(tickT); clearInterval(autosave);
      window.removeEventListener("pointerdown", unlock);
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
        <div className="speeds">
          {SPEEDS.map((s) => (
            <button key={s} className={host?.speed === s ? "on" : ""} onClick={() => { host?.setSpeed(s); play("click"); }} aria-label={s ? `Speed ${s}` : "Pause"}>
              {SPEED_LABEL[s]}
            </button>
          ))}
        </div>
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
        {toast && <div className="toast">{toast}</div>}
      </div>
      {host && showLog && <LogSheet game={host.game} onClose={() => setShowLog(false)} />}
      {host && !showLog && sel && <Inspector host={host} sel={sel} onClose={() => setSel(null)} />}
      {host && !showLog && !sel && tab && (
        <div className="sheet">
          <h3>{TABS.find((t) => t.id === tab)!.label}<button className="x" onClick={() => { setTab(null); setTool("inspect"); }}>✕</button></h3>
          {tab === "build" ? <BuildPanel host={host} tool={tool} setTool={setTool} rot={rot} setRot={setRot} thumb={(k) => host.renderer.thumbnail(k)} /> :
            tab === "game" ? <GamePanel host={host} /> :
            tab === "staff" ? <StaffPanel host={host} /> :
            tab === "guests" ? <GuestsPanel host={host} /> :
            tab === "finance" ? <FinancePanel host={host} /> :
            tab === "policies" ? <PoliciesPanel host={host} /> :
            tab === "goals" ? <GoalsPanel host={host} /> :
            tab === "authorities" ? <AuthoritiesPanel host={host} /> :
            <Placeholder when={(TABS.find((t) => t.id === tab) as { when?: string }).when ?? ""} />}
        </div>
      )}
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => openTab(t.id)}>
            <span className="i">{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

const noopSub = () => () => {};

function toolHint(t: Tool): string {
  if (t === "wall") return "Drag to draw a wall · two fingers to move";
  if (t === "door") return "Tap a wall you built to add a door";
  if (t === "demolish") return "Drag over walls or doors to remove them";
  if (t === "remove") return "Tap an object to sell it (half price back)";
  return "Tap to place · drag to position · Rotate in the Build tab";
}
