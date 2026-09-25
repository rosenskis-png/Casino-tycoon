// Vice (FOUNDATIONS §10, §12; docs/spec/vice.md): escorts, workers from outside who come in (by the hotel elevator
// where there is one), work the floor and may leave with a guest. How many come depends on the vice rule; guards
// show them out by the same rule. Hookups and drug use start from guests (sim/incidents.ts).
import { GUEST_TYPES } from "../data/guests";
import type { Game } from "./game";
import type { System } from "./registry";
import type { Agent } from "./state";
import { isClosed } from "./state";
import { rng } from "./rng";
import { go, isWalking, nearbyTile } from "./agents";
import { deterOf } from "./cheats";
import { ENF_REASONS } from "../data/cheats";
import { begin, buildGrid, leaveFloor, patrol, spawnVisitor } from "./incidents";
import { sendHome, think } from "./guests";
import { post } from "./finance";
import { fmtMoney, news } from "./news";
import { TICKS_PER_SECOND } from "./clock";

const SEC = TICKS_PER_SECOND;
/** Escorts arriving per real second per 100 guests on the floor, by the vice rule (Ignore … Strict). */
const RATE = [1 / 60, 1 / 90, 1 / 180, 1 / 600];
/** At most one per this many guests, and never more than MAX. */
const PER_GUESTS = 60, MAX = 6;
/** Seconds an escort stays; seconds of talk; tiles they look around; the room money when they go up. */
const STAY = 180, TALK = 8, LOOK = 10, ROOM_FEE = 50;
/** `GuestData.paid` bit: an escort already asked them this visit. */
const ASKED = 4;

/** The escort's next mark: an adult guest nearby, winners and the drunk first. */
function pickMark(g: Game, a: Agent): Agent | null {
  let best: Agent | null = null, bs = 0;
  for (const b of g.state.agents) {
    const gd = b.g;
    if (!gd || gd.minor || gd.why || b.hidden || gd.held || b.act === "out" || b.act === "fight" || b.act === "arrive") continue;
    const d = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (d > LOOK || gd.paid & ASKED) continue;
    const up = gd.mem.won - gd.mem.wagered;
    const s = (1 + (up > 0 ? 1 : 0) + gd.intox * 2 + (GUEST_TYPES[gd.type]?.incidents.vice ?? 0)) / (1 + d / 4);
    if (s > bs) { bs = s; best = b; }
  }
  return best;
}

/** Off they go together: up in the elevator (the room pays the house), or out the door. */
function goUp(g: Game, a: Agent, b: Agent) {
  const s = g.state, gd = b.g!, lift = s.map.lift;
  think(g, b, "leftWithEscort");
  if (lift >= 0 && g.walkable(lift)) { post(g, "rooms", ROOM_FEE); gd.door = lift; }
  news(g, "info", `A guest left the floor with an escort${lift >= 0 ? ` (a room: ${fmtMoney(ROOM_FEE)})` : ""}.`, true);
  sendHome(g, b, "escort");
  a.target = -1;
  if (lift >= 0 && g.walkable(lift)) go(a, lift, "leave");
  else leaveFloor(g, a);
}

function escortTick(g: Game, a: Agent) {
  const s = g.state, r = rng(s, "vice");
  if (a.act === "leave") { a.hidden = 1; return; }
  if (isWalking(a)) return;
  if (s.tick >= (a.due ?? 0) || isClosed(s)) return leaveFloor(g, a);
  // Talking to a mark (the pitch is a vice incident everyone nearby sees).
  if (a.act === "offer") {
    const b = s.agents.find((q) => q.id === a.target), gd = b?.g;
    if (!b || !gd || gd.why || !s.incidents.some((i) => i.actor === a.id)) { a.act = "idle"; a.target = -1; return; }
    if (a.timer > 1) { a.timer--; return; }
    a.timer = 0;
    const type = GUEST_TYPES[gd.type], up = gd.mem.won - gd.mem.wagered > 0;
    // (M12) Security dealing with vice (this guest before, or a beating everyone heard about) makes them say no.
    const yes = r.chance(Math.min(0.8, 0.2 * (type?.incidents.vice ?? 0) * (1 + gd.intox) * (up ? 1.5 : 1) * (gd.mood / 70)) * deterOf(s, gd, "vice"));
    gd.paid |= ASKED;
    if (!yes) {
      a.act = "idle";
      a.target = -1;
      return;
    }
    gd.did = (gd.did ?? 0) | ENF_REASONS.vice.bit;
    // (M12, owner) A player at a game keeps the escort on their arm for the rest of the visit: company erodes savvy
    // like a drink or two (sim/guests.ts savvyNow), they bet to impress, and tilt comes easier. Then they go up together.
    if (b.act === "play" && !gd.vip) {
      gd.arm = a.id;
      a.act = "company";
      a.due = Math.max(a.due ?? 0, s.tick + 30 * SEC);
      think(g, b, "escortCompany");
      return;
    }
    return goUp(g, a, b);
  }
  // Keeping a player company: at their side for the rest of their visit, then up together.
  if (a.act === "company") {
    const b = s.agents.find((q) => q.id === a.target), gd = b?.g;
    if (!b || !gd || gd.arm !== a.id || gd.held) { if (gd?.arm === a.id) gd.arm = 0; a.act = "idle"; a.target = -1; return; }
    // Company for the rest of the visit; when they call it a night, they go up together (the room pays the house).
    if (gd.why) {
      gd.arm = 0;
      a.target = -1;
      const lift = s.map.lift;
      think(g, b, "leftWithEscort");
      if (lift >= 0 && g.walkable(lift)) { post(g, "rooms", ROOM_FEE); go(a, lift, "leave"); }
      else leaveFloor(g, a);
      return;
    }
    a.due = Math.max(a.due ?? 0, s.tick + 30 * SEC);
    if (Math.abs(b.x - a.x) + Math.abs(b.y - a.y) > 1 && s.tick % SEC === 0) {
      const t = nearbyTile(g, "vice", b.x, b.y, 1, a);
      if (t >= 0) go(a, t, "company");
    }
    return;
  }
  const b = pickMark(g, a);
  if (b) {
    const w = s.map.w;
    if (Math.abs(b.x - a.x) + Math.abs(b.y - a.y) <= 1) {
      a.act = "offer";
      a.target = b.id;
      a.timer = TALK * SEC;
      begin(g, buildGrid(g), "solicit", a, b);
      return;
    }
    a.target = b.id;
    go(a, b.y * w + b.x, "idle");
    return;
  }
  patrol(g, a, r);
}

export const viceSystem: System = {
  id: "vice",
  deps: ["incidents", "guests"],
  tick(g) {
    const s = g.state;
    let any = false;
    for (const a of s.agents) if (a.role === "escort") { any = true; escortTick(g, a); }
    if (any && s.agents.some((a) => a.hidden && a.role === "escort")) s.agents = s.agents.filter((a) => !(a.hidden && a.role === "escort"));
  },
  beat(g) {
    const s = g.state;
    if (isClosed(s)) return;
    let guests = 0, escorts = 0;
    for (const a of s.agents) { if (a.g && !a.g.minor) guests++; else if (a.role === "escort") escorts++; }
    // (M12) An escort shown out (or gone) no longer keeps anyone company.
    for (const a of s.agents) if (a.g?.arm && !s.agents.some((e) => e.id === a.g!.arm && e.role === "escort" && (e.act === "company" || e.next === "company") && e.target === a.id)) a.g.arm = 0;
    if (escorts >= Math.min(MAX, Math.floor(guests / PER_GUESTS))) return;
    if (!rng(s, "vice").chance(RATE[s.rules.vice] * (guests / 100))) return;
    // In by the elevator where there is one.
    const a = spawnVisitor(g, "escort");
    if (!a) return;
    const lift = s.map.lift;
    if (lift >= 0 && g.walkable(lift)) { a.x = a.nx = lift % s.map.w; a.y = a.ny = Math.floor(lift / s.map.w); a.dest = lift; }
    a.due = s.tick + STAY * SEC;
  },
};
