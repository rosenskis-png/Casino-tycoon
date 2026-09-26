// Hand pays (Batch B, owner 2026-09-26; docs/spec/staff.md): a guest who wins a machine's top prize or its Grand
// is paid in person, for the celebration. The machine locks and the winner stays in the seat until a staff member
// walks over and counts it out; people nearby stop to watch and cheer. With no one on staff who could come, the
// machine pays at once. Guards, dealers and the office are never pulled away; slot techs go first.
import type { Game } from "./game";
import type { System } from "./registry";
import type { Agent, PlacedObject } from "./state";
import { rng } from "./rng";
import { go, isWalking } from "./agents";
import { objSize } from "./geometry";
import { canSee, SIGHT } from "./wayfinding";
import { think } from "./guests";
import { TICKS_PER_SECOND } from "./clock";

/** Who can hand pay, in order of preference (a slot tech's job first; anyone free on the floor after). */
const PAYERS: Record<string, number> = { tech: 0, host: 1, janitor: 2, server: 2, entertainer: 2 };
/** Seconds counting it out; how long a win waits before a supervisor pays it anyway (no one could get there). */
const PAY_SECS = 5;
const GIVE_UP_SECS = 90;
/** Onlookers: how far away guests notice, and the chance a guest on their feet stops to watch. */
const CHEER_REACH = 10;
const STOP_CHANCE = 0.6;

const payers = (g: Game) => g.state.agents.filter((a) => PAYERS[a.role] !== undefined);
/** Free to come over: not mid-task, nothing on a tray, not performing. */
const free = (a: Agent) => a.hp === undefined && a.target < 0 && (a.act === "idle" || a.act === "wander") && !(a.tray?.length);

/** A top prize just paid on `o` to `winner`: lock it for a hand pay (unless no one could come) and draw a crowd. */
export function startHandPay(g: Game, winner: Agent, o: PlacedObject, amount: number) {
  const s = g.state;
  g.bus.emit({ type: "sound", id: "handpay", x: o.x, y: o.y });
  g.bus.emit({ type: "sound", id: "cheer", x: o.x, y: o.y });
  if (payers(g).length) { o.hp = (o.hp ?? 0) + amount; o.hpAt = s.tick; think(g, winner, "handpayWait"); }
  // The celebration: passers-by stop to watch, nearby players cheer, and more are drawn while it lasts.
  const until = s.tick + 30 * TICKS_PER_SECOND;
  o.bonus = Math.max(o.bonus ?? 0, until);
  g.bonusNow.set(o.id, o.bonus);
  const r = rng(s, "handpay"), w = s.map.w, at = o.y * w + o.x;
  for (const b of s.agents) {
    const gd = b.g;
    if (!gd || b === winner || gd.why || Math.abs(b.x - o.x) + Math.abs(b.y - o.y) > Math.min(CHEER_REACH, SIGHT)) continue;
    const here = b.y * w + b.x;
    if (!canSee(g, here, at)) continue;
    if (b.act === "play" || b.act === "look") { think(g, b, "cheer"); gd.buzz = Math.min(20, gd.buzz + 4); continue; }
    if ((b.act === "wander" || b.act === "idle" || b.act === "wait") && r.chance(STOP_CHANCE)) {
      const t = standBy(g, b, o);
      if (t >= 0) { go(b, t, "look"); b.target = o.id; gd.look = 1; think(g, b, "cheer"); }
    }
  }
}

/** A free tile around the machine (not a seat) that `a` can walk to; -1 if none. */
function standBy(g: Game, a: Agent, o: PlacedObject): number {
  const { w, h } = g.state.map, { w: ow, h: oh } = objSize(o), here = a.y * w + a.x, paths = g.pathsFor(a);
  for (let ring = 1; ring <= 3; ring++) {
    for (let y = o.y - ring; y <= o.y + oh - 1 + ring; y++) for (let x = o.x - ring; x <= o.x + ow - 1 + ring; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (x > o.x - ring && x < o.x + ow - 1 + ring && y > o.y - ring && y < o.y + oh - 1 + ring) continue;
      const t = y * w + x;
      if (!g.walkable(t) || g.seatAt[t] || !paths.reachable(here, t)) continue;
      return t;
    }
  }
  return -1;
}

/** Sends the best free payer to each waiting hand pay; pays out wins nobody could reach in time. */
function dispatch(g: Game) {
  const s = g.state;
  const coming = new Set<number>();
  for (const a of s.agents) if (a.hp !== undefined) coming.add(a.hp);
  for (const o of s.objects) {
    if (!o.hp || coming.has(o.id)) continue;
    if (s.tick - (o.hpAt ?? s.tick) > GIVE_UP_SECS * TICKS_PER_SECOND || !payers(g).length) { paid(g, o); continue; }
    let best: Agent | null = null, bt = -1, bk = Infinity;
    for (const a of s.agents) {
      const rank = PAYERS[a.role];
      if (rank === undefined || !free(a)) continue;
      const k = rank * 1000 + Math.abs(a.x - o.x) + Math.abs(a.y - o.y);
      if (k >= bk) continue;
      const t = standBy(g, a, o);
      if (t < 0) continue;
      best = a; bt = t; bk = k;
    }
    if (!best) continue;
    best.hp = o.id;
    coming.add(o.id);
    go(best, bt, "handpay");
  }
}

function paid(g: Game, o: PlacedObject) {
  delete o.hp;
  delete o.hpAt;
  for (const a of g.state.agents) if (a.g && a.act === "play" && a.target === o.id) { think(g, a, "handpaid"); a.g.buzz = Math.min(20, a.g.buzz + 8); }
  g.bus.emit({ type: "sound", id: "cheer", x: o.x, y: o.y });
}

/** A payer at work: walking over, then counting it out. Returns true while the hand pay has them. */
export function handPayTick(g: Game, a: Agent): boolean {
  if (a.hp === undefined) return false;
  const o = g.objById.get(a.hp);
  if (!o || !o.hp) { a.hp = undefined; a.act = "idle"; a.target = -1; return false; }
  if (isWalking(a)) return true;
  if (a.act !== "handpay") { go(a, a.y * g.state.map.w + a.x, "handpay"); a.act = "handpay"; a.timer = 0; }
  if (a.timer === 0) { a.timer = PAY_SECS * TICKS_PER_SECOND; return true; }
  if (--a.timer > 0) return true;
  paid(g, o);
  a.hp = undefined;
  a.act = "idle";
  a.target = -1;
  return true;
}

export const handPaySystem: System = {
  id: "handpay",
  deps: ["staff"],
  tick(g) {
    if (g.state.tick % TICKS_PER_SECOND === 0) dispatch(g);
  },
};
