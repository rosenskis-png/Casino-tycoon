// Vice (FOUNDATIONS §10, §12; docs/spec/vice.md): escorts, workers from outside who come in (by the hotel elevator
// where there is one), work the floor and may leave with a guest. How many come depends on the vice rule; guards
// show them out by the same rule. Hookups and drug use start from guests (sim/incidents.ts).
import { GUEST_TYPES } from "../data/guests";
import type { Game } from "./game";
import type { System } from "./registry";
import type { Agent } from "./state";
import { isClosed } from "./state";
import { rng } from "./rng";
import { go, isWalking } from "./agents";
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
    const yes = r.chance(Math.min(0.8, 0.2 * (type?.incidents.vice ?? 0) * (1 + gd.intox) * (up ? 1.5 : 1) * (gd.mood / 70)));
    if (!yes) {
      gd.paid |= ASKED;
      a.act = "idle";
      a.target = -1;
      return;
    }
    // Off they go together: up in the elevator (the room pays the house), or out the door.
    const lift = s.map.lift;
    think(g, b, "leftWithEscort");
    if (lift >= 0 && g.walkable(lift)) { post(g, "rooms", ROOM_FEE); gd.door = lift; }
    news(g, "info", `A guest left the floor with an escort${lift >= 0 ? ` (a room: ${fmtMoney(ROOM_FEE)})` : ""}.`, true);
    sendHome(g, b, "escort");
    a.target = -1;
    if (lift >= 0 && g.walkable(lift)) go(a, lift, "leave");
    else leaveFloor(g, a);
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
