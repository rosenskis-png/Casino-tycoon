// Tab panels and the inspector.
import { Fragment, useState } from "react";
import { OBJECTS } from "../data/objects";
import { BUILD_COST, T } from "../data/terrain";
import { ROOM_PURPOSES, type RoomPurpose } from "../data/rooms";
import { CHANNELS, CHANNEL_DEFS, type Channel } from "../data/fields";
import { formatDate, Game, TICKS_PER_DAY } from "../sim";
import { isMuted, setMuted } from "../platform/audio";
import type { Host } from "./host";
import type { Tool } from "./input";
import { money } from "./format";
import { AUTO_KEY, MANUAL_KEY, exportSave, hasSave, importSave, load, newGame, save } from "./saves";
import { perfTest, type PerfResult } from "./perf";

export type Selection = { kind: "tile"; tile: number } | { kind: "agent"; id: number } | null;

const TERRAIN_NAME: Record<number, string> = { [T.VOID]: "Unowned land", [T.FLOOR]: "Floor", [T.WALL]: "Wall", [T.DOOR]: "Door", [T.WATER]: "Water" };

export function BuildPanel({ tool, setTool }: { tool: Tool; setTool: (t: Tool) => void }) {
  const b = (t: Tool, label: string, sub?: string) => (
    <button key={t} className={`btn ${tool === t ? "on" : ""}`} onClick={() => setTool(tool === t ? "inspect" : t)}>
      {label}{sub && <small>{sub}</small>}
    </button>
  );
  return (
    <>
      <div className="grid">
        {b("wall", "Wall", `${money(BUILD_COST.wall)}/tile`)}
        {b("door", "Door", money(BUILD_COST.door))}
        {b("demolish", "Demolish", `${money(BUILD_COST.demolish)}/tile`)}
        {b("remove", "Sell object")}
      </div>
      <p className="muted" style={{ margin: "10px 0 6px" }}>Decoration</p>
      <div className="grid">{Object.values(OBJECTS).map((o) => b(`place:${o.id}`, o.name, money(o.cost)))}</div>
    </>
  );
}

export function Placeholder({ when }: { when: string }) {
  return <p className="muted">Arrives in {when}. This build is the engine skeleton (M1).</p>;
}

export function LogSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const items = [...game.state.log].reverse();
  return (
    <div className="sheet">
      <h3>Log · last 30 days<button className="x" onClick={onClose}>✕</button></h3>
      {items.length === 0 && <p className="muted">Nothing yet.</p>}
      {items.map((it, k) => (
        <div className="logitem" key={k}>
          <div className="d">{formatDate(Math.floor(it.tick / TICKS_PER_DAY))}</div>
          <div className={`lv-${it.level}`}>{it.text}</div>
        </div>
      ))}
    </div>
  );
}

export function Inspector({ host, sel, onClose }: { host: Host; sel: NonNullable<Selection>; onClose: () => void }) {
  const g = host.game;
  const s = g.state;
  const w = s.map.w;
  if (sel.kind === "agent") {
    const a = s.agents.find((a) => a.id === sel.id);
    return (
      <div className="sheet">
        <h3>Test walker #{sel.id}<button className="x" onClick={onClose}>✕</button></h3>
        {a ? <p className="muted">Wandering the floor so the engine has someone to move. Real guests arrive in M2.</p> : <p className="muted">Gone.</p>}
      </div>
    );
  }
  const i = sel.tile;
  const x = i % w, y = Math.floor(i / w);
  const room = g.rooms.rooms[g.rooms.roomOf[i]];
  const meta = room && room.meta >= 0 ? s.roomMeta[room.meta] : null;
  const obj = s.objects.find((o) => { const d = OBJECTS[o.kind]; return x >= o.x && y >= o.y && x < o.x + d.w && y < o.y + d.h; });
  return (
    <div className="sheet">
      <h3>{obj ? OBJECTS[obj.kind].name : room ? meta?.name || (room.indoor ? "Room" : "Grounds") : TERRAIN_NAME[s.map.terrain[i]]}
        <button className="x" onClick={onClose}>✕</button></h3>
      {obj && (
        <div className="row">
          <button className="btn danger" onClick={() => { g.dispatch({ type: "remove", id: obj.id }); onClose(); }}>Sell <small>{money(OBJECTS[obj.kind].cost / 2)} back</small></button>
        </div>
      )}
      {room && !obj && (
        <>
          <div className="kv">
            <b>Area</b><span>{room.size} tiles, {room.indoor ? "indoors" : "outdoors"}</span>
            <b>Purpose</b><span>{ROOM_PURPOSES[meta?.purpose ?? "floor"]}</span>
          </div>
          {room.indoor && <RoomEditor key={room.first} host={host} tile={i} name={meta?.name ?? ""} purpose={meta?.purpose ?? "floor"} />}
        </>
      )}
      {!room && !obj && <p className="muted">{TERRAIN_NAME[s.map.terrain[i]]}{s.map.fixed[i] ? " (part of the building)" : ""}</p>}
      {host.debug && <HiddenValues g={g} tile={i} />}
    </div>
  );
}

function RoomEditor({ host, tile, name, purpose }: { host: Host; tile: number; name: string; purpose: RoomPurpose }) {
  const [n, setN] = useState(name);
  return (
    <div className="row">
      <input type="text" placeholder="Room name" value={n} maxLength={40} onChange={(e) => setN(e.target.value)}
        onBlur={() => n !== name && host.game.dispatch({ type: "setRoom", tile, name: n })} style={{ flex: 1, minWidth: 120 }} />
      <select value={purpose} onChange={(e) => host.game.dispatch({ type: "setRoom", tile, purpose: e.target.value as RoomPurpose })}>
        {Object.entries(ROOM_PURPOSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}

function HiddenValues({ g, tile }: { g: Game; tile: number }) {
  return (
    <div className="kv" style={{ marginTop: 8 }}>
      {CHANNELS.map((c) => <Fragment key={c}><b>{c}</b><span className="num">{g.fields.get(c, tile).toFixed(2)}</span></Fragment>)}
    </div>
  );
}

export function GamePanel({ host }: { host: Host }) {
  const [, force] = useState(0);
  const [perf, setPerf] = useState<PerfResult | null>(null);
  const [perfMsg, setPerfMsg] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const g = host.game;
  const st = host.stats;
  const refresh = () => force((n) => n + 1);
  const replace = (next: Game | null, error?: string, ok?: string) => {
    if (next) { host.setGame(next); setNote(ok ?? "Loaded."); } else if (error) setNote(`Couldn't load: ${error}`);
  };
  const runPerf = async () => {
    const was = host.speed;
    host.setSpeed(0);
    const r = host.canvas.getBoundingClientRect();
    setPerf(await perfTest(r.width, r.height, setPerfMsg));
    setPerfMsg(null);
    host.setSpeed(was);
  };
  return (
    <>
      <div className="grid">
        <button className="btn" onClick={() => { save(g, MANUAL_KEY); setNote("Saved."); }}>Save</button>
        <button className="btn" disabled={!hasSave(MANUAL_KEY)} onClick={() => { const r = load(MANUAL_KEY); replace(r.game, r.error); }}>Load save</button>
        <button className="btn" onClick={() => exportSave(g)}>Export<small>backup file</small></button>
        <button className="btn" onClick={async () => { const r = await importSave(); replace(r.game, r.error, "Imported."); }}>Import<small>backup file</small></button>
        <button className="btn danger" onClick={() => { if (confirm("Start a new game? The autosave will be replaced.")) { const n = newGame(Date.now()); host.setGame(n); save(n, AUTO_KEY); } }}>New game</button>
        <button className="btn" onClick={() => { setMuted(!isMuted()); refresh(); }}>{isMuted() ? "Sound off" : "Sound on"}</button>
      </div>
      {note && <p className="muted">{note}</p>}
      <p className="muted" style={{ margin: "12px 0 6px" }}>Engine test tools</p>
      <div className="grid">
        <button className="btn" onClick={() => g.dispatch({ type: "spawnWalkers", n: 100 })}>+100 walkers</button>
        <button className="btn" onClick={() => g.dispatch({ type: "spawnWalkers", n: 1000 })}>+1000 walkers</button>
        <button className="btn" onClick={() => g.dispatch({ type: "clearWalkers" })}>Clear walkers</button>
        <button className={`btn ${host.debug ? "on" : ""}`} onClick={() => { host.debug = !host.debug; if (!host.debug) host.drawOptions.overlay = null; refresh(); }}>Debug view</button>
        <button className="btn" disabled={!!perfMsg} onClick={runPerf}>{perfMsg ?? "Perf test"}</button>
      </div>
      {host.debug && (
        <div className="row">
          <select value={host.drawOptions.overlay ?? ""} onChange={(e) => { host.drawOptions.overlay = (e.target.value || null) as Channel | null; refresh(); }}>
            <option value="">No overlay</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_DEFS[c].name}</option>)}
          </select>
        </div>
      )}
      {perf && (
        <div className="kv" style={{ marginTop: 8 }}>
          {[1, 2, 4, 8].map((s) => <Fragment key={s}><b>Max at {s}×</b><span className="num">{perf.maxAgents[s].toLocaleString()} agents</span></Fragment>)}
          {perf.samples.map((p) => <Fragment key={p.agents}><b>{p.agents}</b><span className="num">sim {p.simMsPerTick.toFixed(2)} ms/tick · draw {p.drawMsClose.toFixed(1)}/{p.drawMsFar.toFixed(1)} ms</span></Fragment>)}
        </div>
      )}
      <div className="kv" style={{ marginTop: 8 }}>
        <b>Frame</b><span className="num">{st.fps.toFixed(0)} fps · sim {st.simMs.toFixed(2)} ms · draw {st.drawMs.toFixed(2)} ms</span>
        <b>World</b><span className="num">{g.state.agents.length} walkers · {g.rooms.rooms.length} rooms · {g.paths.size} path fields</span>
        <b>Day</b><span className="num">{Math.floor(g.state.tick / TICKS_PER_DAY) + 1} · tick {g.state.tick}</span>
      </div>
    </>
  );
}
