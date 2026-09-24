// Tab panels and the inspector.
import { Fragment, useState } from "react";
import { OBJECTS, OBJECT_CATS } from "../data/objects";
import { BUILD_COST, DOOR_RULES, DOOR_STATE, MAX_DOOR_FEE, T } from "../data/terrain";
import { ROOM_HELP, ROOM_PURPOSES, type RoomPurpose } from "../data/rooms";
import { CHANNELS, CHANNEL_DEFS, type Channel } from "../data/fields";
import { STAFF_ROLES } from "../data/staff";
import { GUEST_TYPES, FIRST_NAMES } from "../data/guests";
import { THOUGHTS, wording } from "../data/thoughts";
import { SCENARIOS } from "../data/scenarios";
import { SLOT_MODELS, WAGERS_PER_ROUND, expectedReturn } from "../data/games";
import { INCIDENTS, INCIDENT_CATS, RULE_LEVELS, RULE_HELP, CUTOFF } from "../data/incidents";
import { ENF, ENF_ACTIONS, type EnfAction } from "../data/cheats";
import {
  formatDate, describeGoals, goalStatus, monthlyCosts, worth, modelOf, covers, LEDGER_LABELS, MONTH_NAMES,
  Game, TICKS_PER_DAY, TICKS_PER_SECOND, thoughtRates, poolSummary, person, guestCount, DRINK_PRICE, STRENGTHS,
  incidentRates, incidentOf, isStaff, LADDER_NAMES, CALL_AFTER, suspicion, coverage, purposeTiles,
  priceOf, dims, seatCount, objStaff, tierName, priceFor, showPhase,
  type Agent, type Ledger, type HouseRules,
} from "../sim";
import { isMuted, setMuted } from "../platform/audio";
import type { Host } from "./host";
import type { Tool } from "./input";
import { money } from "./format";
import { AUTO_KEY, MANUAL_KEY, exportSave, hasSave, importSave, load, newGame, save } from "./saves";
import { perfTest, type PerfResult } from "./perf";

export type Selection = { kind: "tile"; tile: number } | { kind: "agent"; id: number } | null;

const TERRAIN_NAME: Record<number, string> = { [T.VOID]: "Unowned land", [T.FLOOR]: "Floor", [T.WALL]: "Wall", [T.DOOR]: "Door", [T.WATER]: "Water", [T.SIDEWALK]: "Sidewalk" };
const FACING = ["down", "left", "up", "right"];

export function BuildPanel({ tool, setTool, rot, setRot, thumb }: { tool: Tool; setTool: (t: Tool) => void; rot: number; setRot: (r: number) => void; thumb?: (kind: string) => { url: string; w: number; h: number } }) {
  const b = (t: Tool, label: string, sub?: string, img?: { url: string; w: number; h: number }) => (
    <button key={t} className={`btn ${tool === t ? "on" : ""}`} onClick={() => setTool(tool === t ? "inspect" : t)}>
      {img && <img className="thumb" src={img.url} width={img.w * 2} height={img.h * 2} alt="" />}{label}{sub && <small>{sub}</small>}
    </button>
  );
  return (
    <>
      <div className="grid">
        {b("wall", "Wall", `${money(BUILD_COST.wall)}/tile`)}
        {b("door", "Door", money(BUILD_COST.door))}
        {b("demolish", "Demolish", `${money(BUILD_COST.demolish)}/tile`)}
        {b("remove", "Sell object")}
        <button className="btn" onClick={() => setRot((rot + 1) & 3)}>Rotate<small>faces {FACING[rot & 3]}</small></button>
      </div>
      {OBJECT_CATS.map((c) => (
        <Fragment key={c.id}>
          <p className="muted" style={{ margin: "10px 0 6px" }}>{c.label}</p>
          <div className="grid">{Object.values(OBJECTS).filter((o) => o.cat === c.id).map((o) => b(`place:${o.id}`, o.name, `${o.sized ? "from " : ""}${money(o.sized ? priceOf({ kind: o.id, x: 0, y: 0, rot: 0, w: o.sized.min[0], h: o.sized.min[1] }).cost : o.cost)} · ${money(o.upkeep)}/mo`, thumb?.(o.id)))}</div>
        </Fragment>
      ))}
      {tool.startsWith("place:") && <p className="muted" style={{ marginTop: 8 }}>{OBJECTS[tool.slice(6)]?.desc}{OBJECTS[tool.slice(6)]?.sized && (() => {
        const z = OBJECTS[tool.slice(6)].sized!;
        return ` Drag to size it: ${z.min[0]}–${z.max[0]} wide, ${z.min[1]}–${z.max[1]} deep (the front is the side it faces). Tap for ${OBJECTS[tool.slice(6)].w}×${OBJECTS[tool.slice(6)].h}.`;
      })()}</p>}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------

const SEEKING: Record<string, string> = {
  bladder: "Looking for a restroom", thirst: "Looking for a bar", cage: "Looking for the cage", atm: "Looking for an ATM", exit: "Looking for the way out",
  hunger: "Looking for somewhere to eat", show: "Looking for the show", club: "Looking for the club",
};

function roleDoing(g: Game, a: Agent): string {
  const obj = a.target >= 0 ? g.objById.get(a.target) : undefined;
  const name = obj ? OBJECTS[obj.kind].name : "";
  switch (a.act) {
    case "play": return `Playing ${name}`;
    case "drink": return "Having a drink";
    case "restroom": return "In the restroom";
    case "cage": return obj?.kind === "atm" ? "At the ATM" : "At the cashier cage";
    case "clean": return "Sweeping up";
    case "repair": return `Fixing ${name}`;
    case "offer": return "Taking an order";
    case "fetch": return `Picking up ${a.tray?.length ?? 0} drinks`;
    case "serve": return "Serving a drink";
    case "out": return "Passed out";
    case "fight": return "In a fight!";
    case "respond": return "Dealing with trouble";
    case "treat": return "Treating a guest";
    case "wait": return "Waiting for the others";
    case "held": return a.g?.caught ? "Caught cheating: held by security" : "Held by security";
    case "enforce": return "Dealing with a guest";
    case "carry": return "Taking something out back";
    case "watch": return "Watching the cameras";
    case "dine": return "Having a meal";
    case "show": return obj && showPhase(obj, g.state.tick).phase === "on" ? "Watching the show" : "Waiting for the show";
    case "dance": return "Dancing";
    case "smoke": return "Having a smoke";
    case "walk":
      if (a.next === "held") return "Being walked away by security";
      if (a.next === "enforce") return "On the way to a guest";
      if (a.next === "carry") return "Carrying a bag out back";
      if (a.next === "watch") return "Going to the camera desk";
      if (a.next === "leave") return a.role === "guest" ? "Heading home" : "Leaving";
      if (a.next === "clean") return "Off to sweep up";
      if (a.next === "repair") return `On the way to fix ${name}`;
      if (a.next === "play") return `Walking to ${name}`;
      if (a.next === "drink") return "Going for a drink";
      if (a.next === "restroom") return "Going to the restroom";
      if (a.next === "cage") return obj?.kind === "atm" ? "Going to the ATM" : "Going to the cage";
      if (a.next === "dine") return "Going to eat";
      if (a.next === "show") return "Going to the show";
      if (a.next === "dance") return "Heading to the dance floor";
      if (a.next === "smoke") return "Stepping out for a smoke";
      if (a.next === "offer") return `Taking orders (${a.tray?.length ?? 0} so far)`;
      if (a.next === "fetch") return "Off to the bar";
      if (a.next === "serve") return "Bringing a drink";
      if (a.next === "wait") return "Waiting for the others";
      if (a.next === "respond") return "Heading to trouble";
      if (a.next === "treat") return "Rushing to a guest";
      return "Walking";
    case "wander": {
      if (a.role === "officer") return "Inspecting the floor";
      if (a.role !== "guest") return "Patrolling";
      if (a.g!.trapped) return "Trapped inside";
      return SEEKING[a.g!.seek] ?? "Looking around";
    }
    case "arrive": return "Just arrived";
    default: return "Thinking";
  }
}

export function guestName(n: number): string {
  return `${FIRST_NAMES[n % FIRST_NAMES.length]} ${String.fromCharCode(65 + (Math.floor(n / FIRST_NAMES.length) % 26))}.`;
}

const moodFace = (m: number) => (m > 75 ? "😀" : m > 55 ? "🙂" : m > 40 ? "😐" : m > 25 ? "🙁" : "😠");

export function StaffPanel({ host }: { host: Host }) {
  const g = host.game;
  const staff = g.state.agents.filter(isStaff);
  return (
    <>
      <div className="grid">
        {Object.values(STAFF_ROLES).map((r) => (
          <button key={r.id} className="btn" onClick={() => g.dispatch({ type: "hire", role: r.id })}>
            Hire {r.name}<small>{money(r.wage)}/mo · {staff.filter((a) => a.role === r.id).length} on staff</small>
          </button>
        ))}
      </div>
      <p className="muted" style={{ margin: "8px 0" }}>{Object.values(STAFF_ROLES).map((r) => `${r.name}: ${r.desc}`).join(" ")}</p>
      <p className="muted" style={{ margin: "8px 0" }}>Drink prices, comps, strength and where servers work are set per bar: tap a bar.</p>
      {staff.length === 0 && <p className="muted">Nobody on staff.</p>}
      {staff.map((a) => (
        <div className="row" key={a.id} style={{ alignItems: "center" }}>
          <span style={{ flex: 1 }}>{STAFF_ROLES[a.role].name} #{a.id}{a.role === "server" ? ` · ${barName(g, a.bar ?? -1)}` : ""}<br /><small className="muted">{roleDoing(g, a)}</small></span>
          <button className="btn danger" onClick={() => g.dispatch({ type: "fire", id: a.id })}>Fire</button>
        </div>
      ))}
    </>
  );
}

const STRENGTH_NAMES = ["Light", "Standard", "Strong"];

/** Rooms a bar's servers can be limited to: indoor rooms, by name (value: a tile in the room). */
function roomChoices(g: Game): { tile: number; name: string }[] {
  return g.rooms.rooms.filter((r) => r.indoor).map((r, k) => ({ tile: r.first, name: (r.meta >= 0 ? g.state.roomMeta[r.meta].name : "") || `Room ${k + 1}` }));
}

const barName = (g: Game, id: number) => {
  const k = g.amenities.thirst.findIndex((o) => o.id === id);
  return k >= 0 ? `Bar ${k + 1}` : "no bar";
};

/** Drink policy for one bar and its servers (in the bar's inspector). */
function BarPolicyEditor({ g, id }: { g: Game; id: number }) {
  const o = g.objById.get(id);
  if (!o?.bar) return null;
  const d = o.bar;
  const set = (c: { price?: number; comp?: number; strength?: number; area?: number }) => g.dispatch({ type: "setBar", id, ...c });
  const rooms = roomChoices(g);
  const areaRoom = d.area >= 0 ? g.rooms.roomOf[d.area] : -1;
  const cur = rooms.find((r) => g.rooms.roomOf[r.tile] === areaRoom)?.tile ?? -1;
  const servers = g.state.agents.filter((a) => a.role === "server" && a.bar === id).length;
  return (
    <>
      <p className="muted" style={{ margin: "10px 0 6px" }}>{barName(g, id)}: drinks here and from its servers ({servers} assigned)</p>
      <div className="kv">
        <b>Price</b>
        <span className="num"><input type="range" min={0} max={3} step={0.25} value={d.price} onChange={(e) => set({ price: Number(e.target.value) })} /> {d.price.toFixed(2)}× ({money(DRINK_PRICE * d.price)})</span>
        <b>Comped</b>
        <span className="num"><input type="range" min={0} max={1} step={0.05} value={d.comp} onChange={(e) => set({ comp: Number(e.target.value) })} /> {Math.round(d.comp * 100)}% free to players</span>
        <b>Strength</b>
        <span>
          <select value={d.strength} onChange={(e) => set({ strength: Number(e.target.value) })}>
            {STRENGTHS.map((v, k) => <option key={v} value={v}>{STRENGTH_NAMES[k]}</option>)}
          </select>
        </span>
        <b>Servers work</b>
        <span>
          <select value={cur} onChange={(e) => set({ area: Number(e.target.value) })}>
            <option value={-1}>Anywhere</option>
            {rooms.map((r) => <option key={r.tile} value={r.tile}>{r.name}</option>)}
          </select>
        </span>
      </div>
    </>
  );
}

/** Which bar a drink server works (in the server's inspector and the Staff tab). */
function ServerBar({ g, a }: { g: Game; a: Agent }) {
  if (a.role !== "server") return null;
  if (!g.amenities.thirst.length) return <p className="muted">No bar to work from yet.</p>;
  return (
    <div className="row">
      <span className="muted">Works</span>
      <select value={a.bar ?? -1} onChange={(e) => g.dispatch({ type: "assignServer", id: a.id, bar: Number(e.target.value) })}>
        {g.amenities.thirst.map((o) => <option key={o.id} value={o.id}>{barName(g, o.id)}</option>)}
      </select>
    </div>
  );
}

export function GuestsPanel({ host }: { host: Host }) {
  const g = host.game, s = g.state;
  const onFloor = s.agents.filter((a) => a.role === "guest").length;
  const v = s.visits.yday;
  const pool = poolSummary(g);
  const rates = thoughtRates(g);
  const list = Object.entries(rates).filter(([k, n]) => THOUGHTS[k] && n >= 0.5).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const regulars = Object.entries(pool.regulars).map(([t, n]) => `${n} ${GUEST_TYPES[t]?.name.toLowerCase() ?? t}`).join(" · ");
  return (
    <>
      <div className="kv">
        <b>On the floor</b><span className="num">{onFloor} guests{guestCount(g) > onFloor ? ` · ${guestCount(g) - onFloor} on the way` : ""}</span>
        <b>Yesterday</b><span className="num">{v.arrived} came · {v.left} left · {v.broke} went broke</span>
        <b>Walked past</b><span className="num">{v.walkedPast} yesterday · {s.visits.today.walkedPast} today</span>
        <b>Regulars</b><span className="num">{regulars || "none yet"}</span>
        {pool.chasers > 0 && <><b>Chasers</b><span className="num">{pool.chasers}</span></>}
      </div>
      <p className="muted" style={{ margin: "10px 0 6px" }}>Reputation</p>
      {Object.entries(s.rep).map(([t, r]) => (
        <div className="bar" key={t}>
          <span>{GUEST_TYPES[t]?.name ?? t}</span>
          <div><i style={{ width: `${Math.round(r)}%` }} /></div>
          <span className="num">{Math.round(r)}</span>
        </div>
      ))}
      <p className="muted" style={{ margin: "10px 0 6px" }}>What guests are saying (a day, over the last two)</p>
      {list.length === 0 && <p className="muted">Nothing yet.</p>}
      {list.map(([k, n]) => (
        <div className={`thought ${THOUGHTS[k].bad ? "bad" : "good"}`} key={k}><span className="c num">{Math.round(n)}</span><span>{THOUGHTS[k].text}</span></div>
      ))}
    </>
  );
}

function LedgerRows({ l }: { l: Ledger }) {
  const rows = Object.entries(l).filter(([, v]) => Math.abs(v) >= 0.5);
  const net = rows.filter(([k]) => k !== "start").reduce((a, [, v]) => a + v, 0);
  return (
    <div className="kv">
      {rows.map(([k, v]) => <Fragment key={k}><b>{LEDGER_LABELS[k] ?? k}</b><span className={`num ${v < 0 ? "neg" : ""}`}>{money(v)}</span></Fragment>)}
      <b>Net</b><span className={`num ${net < 0 ? "neg" : ""}`}>{money(net)}</span>
    </div>
  );
}

export function FinancePanel({ host }: { host: Host }) {
  const g = host.game, f = g.state.finance;
  const c = monthlyCosts(g);
  const d = Math.floor(g.state.tick / TICKS_PER_DAY);
  const date = formatDate(d).split(", ");
  return (
    <>
      <div className="kv">
        <b>Cash</b><span className={`num ${g.state.cash < 0 ? "neg" : ""}`}>{money(g.state.cash)}</span>
        <b>Casino worth</b><span className="num">{money(worth(g))}</span>
        <b>Monthly bills</b><span className="num">{money(c.wages)} wages · {money(c.upkeep)} upkeep</span>
      </div>
      <p className="muted" style={{ margin: "10px 0 6px" }}>This month ({date[0].split(" ")[1]}, {date[1]})</p>
      <LedgerRows l={f.month} />
      {[...f.history].reverse().slice(0, 3).map((h) => (
        <Fragment key={`${h.year}-${h.month}`}>
          <p className="muted" style={{ margin: "10px 0 6px" }}>{MONTH_NAMES[h.month]}, Year {h.year}</p>
          <LedgerRows l={h.l} />
        </Fragment>
      ))}
    </>
  );
}

export function GoalsPanel({ host }: { host: Host }) {
  const g = host.game, sc = SCENARIOS[g.state.scenario];
  const st = goalStatus(g);
  return (
    <>
      <p><b>{sc.name}</b></p>
      <p className="muted">{sc.blurb}</p>
      {!st && <p className="muted">No goals here. Build whatever you like.</p>}
      {st && (
        <>
          <p style={{ margin: "10px 0" }}>{describeGoals(st.goals)}</p>
          <div className="kv">
            <b>Worth</b><span className="num">{money(st.worth)} of {money(st.goals.worth)} {st.worthOk ? "✅" : ""}</span>
            <b>Reputation</b><span className="num">{Math.round(st.rep)} of {st.goals.rep.min} {st.repOk ? "✅" : ""}</span>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>Checked at the end of each month.</p>
        </>
      )}
      {g.state.outcome === "won" && <p className="lv-good">Scenario complete!</p>}
      {g.state.outcome === "lost" && <p className="lv-urgent">The deadline passed. Keep playing if you like.</p>}
    </>
  );
}

const RULE_CATS = ["intox", "disorder", "misconduct"] as const;

/** Standing with the police and the regulator, the house rules, and what's been happening (docs/spec/incidents.md). */
export function AuthoritiesPanel({ host }: { host: Host }) {
  const g = host.game, s = g.state, p = s.auth.police;
  const rates = incidentRates(g);
  const closed = s.auth.closedUntil > s.tick;
  const guards = s.agents.filter((a) => a.role === "guard").length;
  const list = Object.entries(rates).filter(([k, n]) => INCIDENTS[k] && !INCIDENTS[k].hidden && n >= 0.5).sort((a, b) => b[1] - a[1]);
  const cut = CUTOFF[s.rules.intox];
  const per = (k: string) => Math.round(rates[k] ?? 0);
  return (
    <>
      {closed && <p className="lv-urgent">Closed by the police until {formatDate(Math.floor(s.auth.closedUntil / TICKS_PER_DAY))}.</p>}
      <div className="bar"><span>Police</span><div><i style={{ width: `${Math.round(p.standing)}%` }} /></div><span className="num">{Math.round(p.standing)}</span></div>
      <p className="muted" style={{ margin: "2px 0 8px" }}>{LADDER_NAMES[p.stage]} · {p.calls} police call{p.calls === 1 ? "" : "s"} so far. Trouble, unanswered reports and paramedics cost standing; it recovers slowly. At 0 the license is revoked.</p>
      <div className="bar"><span>Regulator</span><div><i style={{ width: `${Math.round(s.auth.regulator.standing)}%` }} /></div><span className="num">{Math.round(s.auth.regulator.standing)}</span></div>
      <p className="muted" style={{ margin: "2px 0 8px" }}>The gaming regulator watches the games themselves. No concerns.</p>
      <p className="muted" style={{ margin: "10px 0 6px" }}>House rules: how strictly security steps in ({guards} guard{guards === 1 ? "" : "s"} on staff)</p>
      <div className="kv">
        {RULE_CATS.map((c) => (
          <Fragment key={c}>
            <b>{INCIDENT_CATS[c].name}</b>
            <span>
              <select value={s.rules[c]} onChange={(e) => g.dispatch({ type: "setRule", cat: c as keyof HouseRules, level: Number(e.target.value) })}>
                {RULE_LEVELS.map((l, k) => <option key={l} value={k}>{l}</option>)}
              </select>
            </span>
          </Fragment>
        ))}
      </div>
      {RULE_LEVELS.map((l, k) => <p key={l} className="muted" style={{ margin: "4px 0" }}><b>{l}:</b> {RULE_HELP[k]}</p>)}
      <p className="muted" style={{ margin: "4px 0" }}>{cut === Infinity ? "Bars and servers serve anyone." : `Bars and servers cut off anyone ${cut >= 0.8 ? "wasted" : "drunk"}.`} A guest whose reports go unanswered {CALL_AFTER} times calls the police.</p>
      <p className="muted" style={{ margin: "10px 0 6px" }}>Incidents (a day, over the last two)</p>
      <div className="kv">
        <b>Reports</b><span className="num">{per("_reports")} · {per("_calls")} police calls</span>
        <b>Thrown out</b><span className="num">{per("_ejected")}</span>
      </div>
      {list.length === 0 && <p className="muted">All quiet.</p>}
      {list.map(([k, n]) => (
        <div className={`thought ${INCIDENTS[k].mood < 0 ? "bad" : "good"}`} key={k}><span className="c num">{Math.round(n)}</span><span>{INCIDENTS[k].name}</span></div>
      ))}
      <EnforcementSummary g={g} rates={rates} />
    </>
  );
}

function EnforcementSummary({ g, rates }: { g: Game; rates: Record<string, number> }) {
  const s = g.state, cov = coverage(g);
  const enforcers = s.agents.filter((a) => a.role === "enforcer").length;
  const room = purposeTiles(g, "enforcement").length > 0, office = purposeTiles(g, "office").length > 0;
  const heat = s.enf.heat;
  return (
    <>
      <p className="muted" style={{ margin: "10px 0 6px" }}>Cheats and enforcement</p>
      <div className="kv">
        <b>Caught</b><span className="num">{Math.round(rates._caught ?? 0)} a day · {Math.round(rates._enf ?? 0)} dealt with · {Math.round(rates._banned ?? 0)} banned</span>
        <b>Cameras</b><span className="num">{cov.cams} · {cov.watching} operator{cov.watching === 1 ? "" : "s"} watching{cov.cams ? ` (${Math.round(cov.share * 100)}% covered)` : ""}{cov.cams && !office ? " · no Back office" : ""}</span>
        <b>Enforcers</b><span className="num">{enforcers}{room ? "" : " · no enforcement room (it happens on the floor)"}</span>
        <b>Heat</b><span className={`num ${heat >= 4 ? "neg" : ""}`}>{heat < 0.5 ? "None" : heat < 2 ? "Low" : heat < 4 ? "Talked about" : heat < 8 ? "High" : "Notorious"}</span>
      </div>
      <p className="muted" style={{ margin: "6px 0 0" }}>What happens to a cheat your staff catch:</p>
      <TreatmentEditor g={g} />
    </>
  );
}

export function Placeholder({ when }: { when: string }) {
  return <p className="muted">Arrives in {when}.</p>;
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

// ---------------------------------------------------------------------------------------------------------

function AgentInspector({ host, a, onClose }: { host: Host; a: Agent; onClose: () => void }) {
  const g = host.game;
  if (a.role === "officer" || a.role === "medic") {
    return (
      <div className="sheet">
        <h3>{a.role === "officer" ? "Police officer" : "Paramedic"}<button className="x" onClick={onClose}>✕</button></h3>
        <p>{roleDoing(g, a)}</p>
        <p className="muted">{a.role === "officer" ? "Anything they see going wrong on the floor costs you standing with the police." : "Here for a guest who passed out."}</p>
      </div>
    );
  }
  if (a.role !== "guest") {
    return (
      <div className="sheet">
        <h3>{STAFF_ROLES[a.role].name} #{a.id}<button className="x" onClick={onClose}>✕</button></h3>
        <p>{roleDoing(g, a)}</p>
        <ServerBar g={g} a={a} />
        <div className="row"><button className="btn danger" onClick={() => { g.dispatch({ type: "fire", id: a.id }); onClose(); }}>Fire</button></div>
      </div>
    );
  }
  const gd = a.g!;
  const days = Math.floor((g.state.tick - gd.mem.arrived) / TICKS_PER_DAY);
  return (
    <div className="sheet">
      <h3>{moodFace(gd.mood)} {guestName(gd.name)}<button className="x" onClick={onClose}>✕</button></h3>
      <p>{roleDoing(g, a)}</p>
      <p className="muted">Here {days < 1 ? "since today" : `for ${days} day${days === 1 ? "" : "s"}`}.</p>
      {companionsText(g, a) && <p className="muted">{companionsText(g, a)}</p>}
      {incidentOf(g, a.id) && !INCIDENTS[incidentOf(g, a.id)!.kind].hidden && <p className="lv-warn">{INCIDENTS[incidentOf(g, a.id)!.kind].name}</p>}
      {(gd.warned > 0 || gd.unans > 0) && <p className="muted">{gd.warned > 0 ? `Warned by security${gd.warned > 1 ? ` ${gd.warned} times` : ""}. ` : ""}{gd.unans > 0 ? `${gd.unans} of their reports went unanswered${gd.called ? "; they called the police" : ""}.` : ""}</p>}
      {gd.caught > 0 && <p className="lv-bad">Caught cheating.</p>}
      {[...gd.recent].reverse().map((t, k) => THOUGHTS[t] && (
        <p key={k} className={`quote ${THOUGHTS[t].bad ? "bad" : ""}`}>“{wording(t, gd.type, gd.name)}”</p>
      ))}
      <SuspicionTools g={g} a={a} />
      <MarkAndAct g={g} a={a} />
      {host.debug && <GuestDebug g={g} a={a} />}
    </div>
  );
}

const mins = (secs: number) => (secs < 60 ? `${Math.round(secs)} s` : `${(secs / 60).toFixed(1)} min`);

/** The suspicion tools this scenario allows (docs/spec/cheats.md), tier by tier. */
function SuspicionTools({ g, a }: { g: Game; a: Agent }) {
  const tier = SCENARIOS[g.state.scenario].tools;
  if (!tier) return null;
  const q = suspicion(g, a);
  const sign = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n))}`;
  return (
    <div className="kv" style={{ marginTop: 8 }}>
      <b>Time</b><span className="num">{mins(q.floorSecs)} here{q.machineSecs ? ` · ${mins(q.machineSecs)} at this machine` : ""}</span>
      {tier >= 2 && <><b>Result</b><span className="num">{sign(q.net)} vs {sign(q.expected)} expected · {q.reading}</span></>}
      {tier >= 3 && <><b>Money</b><span className="num">{money(q.wallet)} now · brought {money(q.brought)}{q.trips ? ` · ATM ${money(q.drawn)} (${q.trips} trip${q.trips === 1 ? "" : "s"})` : " · no ATM"}</span></>}
      {tier >= 4 && <><b>Cheat estimate</b><span className={`num ${q.estimate >= 0.5 ? "neg" : ""}`}>{Math.round(q.estimate * 100)}%</span></>}
    </div>
  );
}

const ACTION_VERB: Record<EnfAction, string> = { warn: "Warn", ban: "Ban for life", beat: "Beat up", vanish: "Make disappear" };

/** Mark a guest (with alerts), and order enforcement: the dark two ask for a second tap. */
function MarkAndAct({ g, a }: { g: Game; a: Agent }) {
  const [armed, setArmed] = useState<EnfAction | "">("");
  const gd = a.g!, mark = gd.mark;
  const job = g.state.enf.jobs.find((j) => j.id === gd.held);
  const setMark = (flags: number) => g.dispatch({ type: "mark", id: a.id, flags });
  return (
    <>
      <div className="row">
        <label><input type="checkbox" checked={!!(mark & 1)} onChange={(e) => setMark(e.target.checked ? 1 | (mark & 6) : 0)} /> Marked</label>
        {mark & 1 ? <label><input type="checkbox" checked={!!(mark & 2)} onChange={(e) => setMark((mark & ~2) | (e.target.checked ? 2 : 0))} /> Alert when leaving</label> : null}
        {mark & 1 ? <label><input type="checkbox" checked={!!(mark & 4)} onChange={(e) => setMark((mark & ~4) | (e.target.checked ? 4 : 0))} /> Alert when back</label> : null}
      </div>
      {job ? <p className="lv-warn">{ENF[job.action].name}{job.house ? " (house treatment)" : ""}: {job.stage === 0 ? "waiting for staff" : "under way"}.</p> : (
        <div className="row">
          {ENF_ACTIONS.map((k) => {
            const why = g.check({ type: "enforce", id: a.id, action: k });
            const dark = k === "beat" || k === "vanish";
            return (
              <button key={k} className={`btn ${dark ? "danger" : ""}`} disabled={!!why} title={why ?? ENF[k].desc}
                onClick={() => { if (dark && armed !== k) return setArmed(k); setArmed(""); g.dispatch({ type: "enforce", id: a.id, action: k }); }}>
                {armed === k ? "Tap again" : ACTION_VERB[k]}{why ? <small>{why}</small> : null}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/** The house treatment for caught cheats: first offense and any later one (the enforcement room's setting). */
function TreatmentEditor({ g }: { g: Game }) {
  const p = g.state.enf.policy;
  const pick = (which: "first" | "repeat", v: EnfAction) => g.dispatch({ type: "setTreatment", ...p, [which]: v });
  return (
    <div className="kv" style={{ marginTop: 6 }}>
      {(["first", "repeat"] as const).map((w) => (
        <Fragment key={w}>
          <b>{w === "first" ? "Caught once" : "Caught again"}</b>
          <span>
            <select value={p[w]} onChange={(e) => pick(w, e.target.value as EnfAction)}>
              {ENF_ACTIONS.map((k) => <option key={k} value={k}>{ENF[k].name}</option>)}
            </select>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function companionsText(g: Game, a: Agent): string {
  const gd = a.g!;
  const with_ = g.state.agents.filter((b) => b !== a && b.g && b.g.group === gd.group);
  if (!with_.length) return "";
  const names = with_.slice(0, 3).map((b) => guestName(b.g!.name).split(" ")[0]);
  return `Here with ${names.join(", ")}${with_.length > 3 ? ` and ${with_.length - 3} more` : ""}.`;
}

function GuestDebug({ g, a }: { g: Game; a: Agent }) {
  const gd = a.g!, p = gd.pid >= 0 ? person(g, gd.pid) : undefined;
  const left = Math.max(0, (gd.floorTime - (g.state.tick - gd.mem.arrived)) / TICKS_PER_SECOND / 60);
  return (
    <div className="kv" style={{ marginTop: 8 }}>
      <b>Type</b><span>{GUEST_TYPES[gd.type].name}{gd.lead ? "" : " · group member"}</span>
      <b>Wallet</b><span className="num">{money(gd.wallet)} of {money(gd.bankroll)}{gd.withdrawn ? ` + ${money(gd.withdrawn)} ATM` : ""}</span>
      <b>ATM</b><span className="num">{gd.atm ? `draws ~${money(gd.atm)} · ${gd.trips} trips · can draw ${money(gd.withdrawCap)}` : "never uses one"}</span>
      <b>Stake</b><span className="num">{money(gd.stake)} a spin · rule {gd.quit}</span>
      <b>Drink</b><span className="num">{gd.intox.toFixed(2)} now · means {gd.intend.toFixed(2)} (came {gd.mem.startIntend.toFixed(2)})</span>
      <b>Mood</b><span className="num">{gd.mood.toFixed(0)}</span>
      <b>Needs</b><span className="num">B{gd.needs.bladder.toFixed(0)} T{gd.needs.thirst.toFixed(0)} H{gd.needs.hunger.toFixed(0)} F{gd.needs.fatigue.toFixed(0)}</span>
      <b>Time left</b><span className="num">{left.toFixed(1)} min</span>
      <b>Hidden</b><span className="num">{gd.cheat ? `cheat · take ${money(gd.take)}${gd.spell ? ` · cheating (${gd.spell}s left)` : ""}` : "honest"}{gd.luck ? ` · ${gd.luck > 0 ? "lucky" : "unlucky"}` : ""}</span>
      <b>Knows floor</b><span className="num">{(gd.know * 100).toFixed(0)}%{gd.memDate >= 0 ? " · regular" : " · first visit"}</span>
      {p && <><b>Person</b><span className="num">visit {p.visits + 1} · savings {money(p.savings)} · feels {p.score.toFixed(0)} · chase {p.chase.toFixed(2)}</span></>}
    </div>
  );
}

function ObjectStats({ host, id }: { host: Host; id: number }) {
  const o = host.game.objById.get(id)!;
  const m = modelOf(o.kind);
  if (!m) return o.st.uses ? <div className="kv"><b>Visits</b><span className="num">{o.st.uses}</span></div> : null;
  const hold = o.st.coinIn ? (o.st.coinIn - o.st.paidOut) / o.st.coinIn : 0;
  const avg = o.st.sessions ? o.st.playTicks / o.st.sessions / TICKS_PER_SECOND : 0;
  const bets = `${money(m.denom)}–${money(m.denom * m.maxCredits)}`;
  return (
    <div className="kv">
      <b>Status</b><span>{o.broken ? "Broken down" : "Working"}</span>
      <b>Bets</b><span className="num">{bets} a spin</span>
      <b>Payback</b><span className="num">{(expectedReturn(SLOT_MODELS[m.id]) * 100).toFixed(0)}% by design</span>
      <b>Played</b><span className="num">{o.st.sessions} sessions · avg {avg.toFixed(0)} s</span>
      <b>Coin in</b><span className="num">{money(o.st.coinIn)} ({(o.st.rounds * WAGERS_PER_ROUND).toLocaleString()} spins)</span>
      <b>House won</b><span className={`num ${hold < 0 ? "neg" : ""}`}>{money(o.st.coinIn - o.st.paidOut)} ({(hold * 100).toFixed(1)}%)</span>
    </div>
  );
}

export function Inspector({ host, sel, onClose }: { host: Host; sel: NonNullable<Selection>; onClose: () => void }) {
  const g = host.game;
  const s = g.state;
  const w = s.map.w;
  if (sel.kind === "agent") {
    const a = s.agents.find((a) => a.id === sel.id);
    if (!a) return <div className="sheet"><h3>Gone<button className="x" onClick={onClose}>✕</button></h3><p className="muted">They've left.</p></div>;
    return <AgentInspector host={host} a={a} onClose={onClose} />;
  }
  const i = sel.tile;
  const x = i % w, y = Math.floor(i / w);
  const room = g.rooms.rooms[g.rooms.roomOf[i]];
  const meta = room && room.meta >= 0 ? s.roomMeta[room.meta] : null;
  const obj = s.objects.find((o) => covers(o, x, y));
  return (
    <div className="sheet">
      <h3>{obj ? (OBJECTS[obj.kind].sized ? tierName(g, obj) : OBJECTS[obj.kind].name) : room ? meta?.name || (room.indoor ? "Room" : "Grounds") : TERRAIN_NAME[s.map.terrain[i]]}
        <button className="x" onClick={onClose}>✕</button></h3>
      {obj && (
        <>
          <p className="muted">{OBJECTS[obj.kind].desc}</p>
          <AmenityCard g={g} id={obj.id} />
          <ObjectStats host={host} id={obj.id} />
          <BarPolicyEditor g={g} id={obj.id} />
          <div className="row">
            <button className="btn danger" onClick={() => { g.dispatch({ type: "remove", id: obj.id }); onClose(); }}>Sell <small>{money(priceOf(obj).cost / 2)} back</small></button>
          </div>
        </>
      )}
      {room && !obj && (
        <>
          <div className="kv">
            <b>Area</b><span>{room.size} tiles, {room.indoor ? "indoors" : "outdoors"}</span>
            <b>Purpose</b><span>{ROOM_PURPOSES[meta?.purpose ?? "floor"]}</span>
          </div>
          <p className="muted" style={{ margin: "6px 0" }}>{ROOM_HELP[meta?.purpose ?? "floor"]}</p>
          {room.indoor && <RoomEditor key={room.first} host={host} tile={i} name={meta?.name ?? ""} purpose={meta?.purpose ?? "floor"} />}
          {meta?.purpose === "enforcement" && (
            <>
              <p className="muted" style={{ margin: "8px 0 0" }}>Enforcers wait here, and beatings and disappearances happen here, out of sight. What happens to a cheat your staff catch:</p>
              <TreatmentEditor g={g} />
            </>
          )}
          {meta?.purpose === "office" && <p className="muted">Surveillance operators watch the cameras from here ({coverage(g).watching} at a desk, {coverage(g).cams} cameras).</p>}
        </>
      )}
      {!room && !obj && s.map.terrain[i] === T.DOOR && <DoorCard g={g} tile={i} />}
      {!room && !obj && s.map.terrain[i] !== T.DOOR && <p className="muted">{TERRAIN_NAME[s.map.terrain[i]]}{s.map.fixed[i] ? " (part of the building)" : ""}</p>}
      {host.debug && <HiddenValues g={g} tile={i} />}
    </div>
  );
}

/** A sized amenity (docs/spec/construction.md): tier, size, seats, staff and running cost; its price. */
function AmenityCard({ g, id }: { g: Game; id: number }) {
  const o = g.objById.get(id), def = o && OBJECTS[o.kind];
  if (!o || !def?.sized) return null;
  const d = dims(o), staff = objStaff(o).length, pr = def.priceRange;
  const what = def.serves === "hunger" ? "Meal price" : def.serves === "show" ? "Ticket" : def.serves === "club" ? "Cover charge" : "";
  const seats = def.serves === "bladder" ? "stalls" : def.serves === "cage" ? "windows" : def.serves === "club" ? "dance spots" : "seats";
  return (
    <>
      <div className="kv">
        <b>Size</b><span className="num">{d.w} × {d.h}: {seatCount(o)} {seats}{staff ? `, ${staff} staff` : ""}</span>
        <b>Running cost</b><span className="num">{money(priceOf(o).upkeep)}/mo</span>
        {def.serves === "show" && <><b>Show</b><span>{(() => { const p = showPhase(o, g.state.tick); return p.phase === "on" ? "On now" : `Next in ${Math.ceil(p.left / TICKS_PER_SECOND + (p.phase === "off" ? 30 : 0))} s`; })()}</span></>}
      </div>
      {pr && (
        <div className="kv">
          <b>{what}</b>
          <span className="num">
            <input type="range" min={pr[0]} max={pr[1]} step={def.serves === "hunger" ? 0.25 : 1} value={o.price ?? pr[0]} onChange={(e) => g.dispatch({ type: "setPrice", id, price: Number(e.target.value) })} />
            {" "}{money(priceFor(o))}
          </span>
        </div>
      )}
    </>
  );
}

/** A door's rule (docs/spec/construction.md): who may pass, and a fee for guests. */
function DoorCard({ g, tile }: { g: Game; tile: number }) {
  const m = g.state.map, rule = m.door[tile], gate = m.gates.find((q) => q.i === tile);
  const def = DOOR_RULES.find((r) => r.id === rule) ?? DOOR_RULES[0];
  if (m.fixed[tile] || m.entrances.includes(tile)) return <p className="muted">{def.name}. Part of the building: this door stays as it is.</p>;
  const set = (r: number, arg?: string, fee?: number) => {
    const d = DOOR_RULES.find((x) => x.id === r)!;
    const a = d.arg === "type" ? (arg && GUEST_TYPES[arg] ? arg : Object.keys(GUEST_TYPES)[0]) : d.arg === "role" ? (arg && STAFF_ROLES[arg] ? arg : Object.keys(STAFF_ROLES)[0]) : undefined;
    g.dispatch({ type: "setDoor", tile, rule: r, arg: a, fee: d.fee ? fee ?? 0 : 0 });
  };
  const fee = gate?.fee ?? 0;
  return (
    <>
      <div className="kv">
        <b>Who passes</b>
        <span>
          <select value={rule} onChange={(e) => set(Number(e.target.value), gate?.arg, fee)}>
            {DOOR_RULES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </span>
        {def.arg === "type" && <><b>Dressed as</b><span><select value={gate?.arg} onChange={(e) => set(rule, e.target.value, fee)}>{Object.values(GUEST_TYPES).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></span></>}
        {def.arg === "role" && <><b>Role</b><span><select value={gate?.arg} onChange={(e) => set(rule, e.target.value)}>{Object.values(STAFF_ROLES).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></span></>}
        {def.fee && <><b>Fee</b><span className="num"><input type="range" min={0} max={MAX_DOOR_FEE} step={1} value={fee} onChange={(e) => set(rule, gate?.arg, Number(e.target.value))} /> {fee ? money(fee) : "free"}</span></>}
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        {rule === DOOR_STATE.CARD ? "Card holders are guests who've been here before; their companions come in with them. " : ""}
        {rule !== DOOR_STATE.OPEN && rule !== DOOR_STATE.ROLE ? "Staff, police and paramedics always pass. " : ""}
        Guests who can't pass go around, or can't get there at all. Anyone trapped gets let out by staff, eventually, and the police hear about it.
      </p>
    </>
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
      <b>Dirt</b><span className="num">{g.state.dirt[tile]}</span>
    </div>
  );
}

export function GamePanel({ host }: { host: Host }) {
  const [, force] = useState(0);
  const [perf, setPerf] = useState<PerfResult | null>(null);
  const [perfMsg, setPerfMsg] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [scenario, setScenario] = useState(host.game.state.scenario);
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
  const guests = g.state.agents.filter((a) => a.role === "guest").length;
  return (
    <>
      <div className="grid">
        <button className="btn" onClick={() => { save(g, MANUAL_KEY); setNote("Saved."); }}>Save</button>
        <button className="btn" disabled={!hasSave(MANUAL_KEY)} onClick={() => { const r = load(MANUAL_KEY); replace(r.game, r.error); }}>Load save</button>
        <button className="btn" onClick={() => exportSave(g)}>Export<small>backup file</small></button>
        <button className="btn" onClick={async () => { const r = await importSave(); replace(r.game, r.error, "Imported."); }}>Import<small>backup file</small></button>
        <button className="btn" onClick={() => { setMuted(!isMuted()); refresh(); }}>{isMuted() ? "Sound off" : "Sound on"}</button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <select value={scenario} onChange={(e) => setScenario(e.target.value)} style={{ flex: 1 }}>
          {Object.values(SCENARIOS).filter((s) => !s.hidden).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="btn danger" onClick={() => { if (confirm("Start a new game? The autosave will be replaced.")) { const n = newGame(Date.now(), scenario); host.setGame(n); save(n, AUTO_KEY); } }}>New game</button>
      </div>
      {note && <p className="muted">{note}</p>}
      <p className="muted" style={{ margin: "12px 0 6px" }}>Engine test tools</p>
      <div className="grid">
        <button className="btn" onClick={() => g.dispatch({ type: "spawnGuests", n: 100 })}>+100 guests</button>
        <button className="btn" onClick={() => g.dispatch({ type: "clearGuests" })}>Clear guests</button>
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
          {[1, 2, 4, 8].map((s) => <Fragment key={s}><b>Max at {s}×</b><span className="num">{perf.maxAgents[s].toLocaleString()} guests</span></Fragment>)}
          {perf.samples.map((p) => <Fragment key={p.agents}><b>{p.agents}</b><span className="num">sim {p.simMsPerTick.toFixed(2)} ms/tick · draw {p.drawMsClose.toFixed(1)}/{p.drawMsFar.toFixed(1)} ms</span></Fragment>)}
        </div>
      )}
      <div className="kv" style={{ marginTop: 8 }}>
        <b>Frame</b><span className="num">{st.fps.toFixed(0)} fps · sim {st.simMs.toFixed(2)} ms · draw {st.drawMs.toFixed(2)} ms</span>
        <b>World</b><span className="num">{guests} guests · {g.rooms.rooms.length} rooms · {g.publicPaths.size} + {g.publicPaths.localSize} path fields</span>
        <b>Day</b><span className="num">{Math.floor(g.state.tick / TICKS_PER_DAY) + 1} · tick {g.state.tick}</span>
      </div>
    </>
  );
}
