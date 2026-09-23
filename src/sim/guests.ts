// Guests (FOUNDATIONS §6, docs/spec/guests.md): arrival as a group, needs, mood, thoughts, betting, the ATM,
// drinking, choosing what to do, and leaving. Every guest is one real person (docs/spec/clock.md); pool
// regulars are the same person each visit (sim/pool.ts). What a visit felt like becomes that person's
// disposition, or word of mouth for one-off types (§15).
import { GUEST_TYPES, FIRST_NAMES, type GuestTypeDef, type Pref, type QuitRule, type Taste } from "../data/guests";
import { OBJECTS } from "../data/objects";
import { T } from "../data/terrain";
import { SCENARIOS } from "../data/scenarios";
import { WAGERS_PER_ROUND } from "../data/games";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Agent, GuestData, Person } from "./state";
import { rng, type Rng } from "./rng";
import { logNormal, normal, pickIndex, pickKey, range, skewed } from "./dist";
import { go, isWalking, nearbyTile, randomWalkable, MAX_AGENTS } from "./agents";
import { SIGHT, canSee, explore, faceTile, knowsExit, knowsRoute, remember, signLeg } from "./wayfinding";
import { betOf, modelOf, roundTicks } from "./gaming";
import { serveDrink, compSeeking } from "./drinks";
import { afterVisit, reconcilePool } from "./pool";
import { walkAway } from "./street";
import { TICKS_PER_BEAT, TICKS_PER_DAY, TICKS_PER_SECOND } from "./clock";

declare module "./commands" {
  interface CommandTypes {
    /** Debug/perf: drop guests straight onto the floor. */
    spawnGuests: { n: number };
    clearGuests: {};
  }
}

/** Seconds between mood updates for a guest who is sitting or standing still. */
const MOOD_EVERY = 5;
const THINK_EVERY: [number, number] = [15, 30]; // seconds at 1×
const CASH_OUT_MIN = 20;
/** Hops looking for a machine before giving up on the place. */
const MAX_FAILS = 8;
/** Hops searching for an amenity before going without; hops lost before a leaving guest finds the way anyway. */
const GIVE_UP = 6;
const EXIT_LOST = 8;
/** Floor knowledge gained per beat on the floor. */
const LEARN = 0.002;
/** Seconds a group member waits (broke or done) before counting as waiting too long. */
const WAIT_LONG = 120;
/** How far a group's average mood pulls each member's. */
const GROUP_PULL = 0.2;
/** Intoxication worn off per real minute on the floor. */
const SOBER_PER_MIN = 0.02;
type Need = "thirst" | "bladder" | "cage" | "atm";
const NEED_BIT: Record<Need, number> = { thirst: 1, bladder: 2, cage: 4, atm: 8 };
const WHERE: Record<Need, string> = { thirst: "whereBar", bladder: "whereRestroom", cage: "whereCage", atm: "noAtm" };
const ACT_OF: Record<Need, Agent["act"]> = { thirst: "drink", bladder: "restroom", cage: "cage", atm: "cage" };
const DIRT_CAP = 9;
const TICKS_PER_MIN = 60 * TICKS_PER_SECOND;

// ---------------------------------------------------------------------------------------------------------
// Seat book (runtime): who holds each seat of each object. Rebuilt from agents on load and layout changes.

const books = new WeakMap<Game, Map<number, number[]>>();

function book(g: Game): Map<number, number[]> {
  let b = books.get(g);
  if (!b) { b = rebuildBook(g); }
  return b;
}

function rebuildBook(g: Game): Map<number, number[]> {
  const b = new Map<number, number[]>();
  for (const o of g.state.objects) if (OBJECTS[o.kind].seats.length) b.set(o.id, new Array(OBJECTS[o.kind].seats.length).fill(0));
  for (const a of g.state.agents) {
    if (a.role !== "guest" || a.seat < 0) continue;
    const s = b.get(a.target);
    if (s && !s[a.seat]) s[a.seat] = a.id;
    else { a.seat = -1; a.target = -1; }
  }
  books.set(g, b);
  return b;
}

function freeSeat(g: Game, objId: number): number {
  const s = book(g).get(objId);
  return s ? s.indexOf(0) : -1;
}

function claim(g: Game, a: Agent, objId: number, seat: number) {
  release(g, a);
  book(g).get(objId)![seat] = a.id;
  a.target = objId;
  a.seat = seat;
}

function release(g: Game, a: Agent) {
  if (a.seat >= 0) {
    const s = book(g).get(a.target);
    if (s && s[a.seat] === a.id) s[a.seat] = 0;
  }
  a.seat = -1;
  a.target = -1;
  a.hidden = 0;
}

/** Tile of seat k of an object. */
function seatTile(g: Game, objId: number, k: number): number {
  return g.seatTiles.get(objId)![k];
}

// ---------------------------------------------------------------------------------------------------------
// Groups (runtime): members by group id, rebuilt whenever someone arrives or leaves (a pure function of state,
// so a reloaded save sees the same groups).

interface GroupInfo { members: Agent[]; leader: Agent | null }
const groupMaps = new WeakMap<Game, Map<number, GroupInfo>>();

function groups(g: Game): Map<number, GroupInfo> {
  let m = groupMaps.get(g);
  if (!m) m = refreshGroups(g);
  return m;
}

function refreshGroups(g: Game): Map<number, GroupInfo> {
  const m = new Map<number, GroupInfo>();
  for (const a of g.state.agents) {
    if (a.role !== "guest") continue;
    const gd = a.g!;
    let gi = m.get(gd.group);
    if (!gi) m.set(gd.group, (gi = { members: [], leader: null }));
    gi.members.push(a);
    if (gd.lead) gi.leader = a;
  }
  groupMaps.set(g, m);
  return m;
}

/** Other members of a's group still on the floor. */
function companions(g: Game, a: Agent): Agent[] {
  const gi = groups(g).get(a.g!.group);
  return gi ? gi.members.filter((m) => m !== a && !gone(g).has(m.id)) : [];
}

// ---------------------------------------------------------------------------------------------------------
// Tastes: how a guest type feels about the qualities at a tile.

function localDirt(g: Game, i: number): number {
  const { w, h } = g.state.map;
  const x = i % w, y = (i - x) / w;
  let s = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const X = x + dx, Y = y + dy;
    if (X >= 0 && Y >= 0 && X < w && Y < h) s += g.state.dirt[Y * w + X];
  }
  return s;
}

function tasteAt(g: Game, t: Taste, i: number): number {
  return t === "DIRT" ? localDirt(g, i) : g.fields.get(t, i);
}

interface Fit { score: number; worst: { t: Taste; hi: boolean; mag: number } | null; best: { t: Taste; mag: number } | null }

function prefScore(p: Pref, v: number): number {
  const d = Math.abs(v - p.ideal);
  return d <= p.tol ? 0.3 * p.w : -p.w * Math.min(1.5, (d - p.tol) / p.tol);
}

export function fitAt(g: Game, type: GuestTypeDef, i: number): Fit {
  let score = 0;
  let worst: Fit["worst"] = null, best: Fit["best"] = null;
  for (const [t, p] of Object.entries(type.prefs) as [Taste, Pref][]) {
    const v = tasteAt(g, t, i);
    const s = prefScore(p, v);
    score += s;
    if (s < 0 && (!worst || -s > worst.mag)) worst = { t, hi: v > p.ideal, mag: -s };
    // Clean floors are expected, not remarked on; only the other tastes earn a compliment.
    if (s > 0 && p.w >= 0.8 && t !== "DIRT" && (!best || s > best.mag)) best = { t, mag: s };
  }
  return { score, worst, best };
}

const BAD_THOUGHT: Record<Taste, [string | null, string | null]> = {
  NRG: ["nrgLo", "nrgHi"], CRW: ["crwLo", "crwHi"], PRS: ["prsLo", null], TRF: [null, "trfHi"], DIRT: [null, "dirty"],
};
const GOOD_THOUGHT: Record<Taste, string> = { NRG: "gNRG", CRW: "gCRW", PRS: "gPRS", TRF: "gTRF", DIRT: "gCLN" };

// ---------------------------------------------------------------------------------------------------------
// Thoughts. Counted by id per day (the Guests tab averages the last ~2 days); the wording is the card's business.

export function think(g: Game, a: Agent, id: string) {
  const gd = a.g!;
  gd.thought = id;
  gd.thoughtTick = g.state.tick;
  // The card lists recent thoughts; the same one again just moves to the top.
  const k = gd.recent.indexOf(id);
  if (k >= 0) gd.recent.splice(k, 1);
  gd.recent.push(id);
  if (gd.recent.length > 5) gd.recent.shift();
  const t = g.state.thoughts[0];
  t[id] = (t[id] ?? 0) + 1;
}

const net = (gd: GuestData) => gd.mem.won - gd.mem.wagered;
/** Money in play this visit: the budget plus ATM draws. */
const staked = (gd: GuestData) => Math.max(1, gd.bankroll + gd.withdrawn);

function periodicThought(g: Game, a: Agent, type: GuestTypeDef) {
  const gd = a.g!;
  const here = a.y * g.state.map.w + a.x;
  let id: string | null = null, mag = 2;
  const consider = (tid: string | null, m: number) => { if (tid && m > mag) { id = tid; mag = m; } };
  const fit = fitAt(g, type, here);
  if (fit.worst) consider(BAD_THOUGHT[fit.worst.t][fit.worst.hi ? 1 : 0], fit.worst.mag * 8);
  // A good word only when the whole place suits them, credited to what they like most.
  if (fit.best && fit.score > 0) consider(GOOD_THOUGHT[fit.best.t], fit.score * 4);
  const n = gd.needs;
  if (n.fatigue > 80) consider("tired", (n.fatigue - 70) / 2);
  if (n.hunger > 80) consider("hungry", (n.hunger - 70) / 2);
  if (n.thirst > 80 && !g.has("thirst")) consider("noBar", (n.thirst - 70) / 2);
  if (n.bladder > 80 && !g.has("bladder")) consider("noRestroom", (n.bladder - 60) / 2);
  const rel = net(gd) / staked(gd);
  if (rel >= 0.5) consider("onARoll", 6);
  if (rel <= -0.6) consider("eaten", 6);
  if (rel <= -0.3 && gd.chase > 0.3) consider("winBack", 7);
  if (gd.intox >= 0.8) consider("wasted", 7);
  else if (gd.intox >= 0.5) consider("drunk", 5);
  else if (gd.intox >= 0.25) consider("tipsy", 3);
  if (gd.wait >= 0) consider("waiting", 8);
  if (id) think(g, a, id);
}

// ---------------------------------------------------------------------------------------------------------
// Arrival.

/** A per-person seed for remembered routes, stable across visits. */
const personSeed = (pid: number) => (Math.imul(pid, 0x9e3779b1) ^ 0x5bd1e995) >>> 0 & 0x3fffffff;

/**
 * One guest crosses the threshold at entrance tile `at`. `person` for a pool regular (their money, memory and
 * chasing come along); `leader` for a group member (the leader's floor knowledge is shared).
 */
export function spawnGuest(g: Game, typeId: string, at: number, person: Person | null, leader: Agent | null, sex: number, intent?: GuestData["intent"]): Agent | null {
  const s = g.state;
  const type = GUEST_TYPES[typeId];
  if (!type || at < 0 || s.agents.length >= MAX_AGENTS) return null;
  const r = rng(s, "guests");
  const w = s.map.w;
  const chase = person?.chase ?? 0;
  let bankroll = Math.round(logNormal(r, type.budget) / 5) * 5;
  if (person) { bankroll = Math.max(0, Math.min(bankroll, Math.floor(person.cash / 5) * 5)); person.cash -= bankroll; }
  const lead = leader?.g;
  const came = intent ?? lead?.intent ?? (r.chance(type.drinking.first) ? "drink" : "gamble");
  const dr = type.drinking;
  // Sober guests are exactly 0; drinkers draw a skewed bell, shifted by why they came.
  const intend = r.chance(dr.sober) ? 0 : Math.min(dr.cap, skewed(r, Math.max(0.05, dr.mean + (came === "drink" ? 0.1 : -0.03)), dr.sd, dr.cap));
  const uses = r.chance(type.atm.never) && chase < 0.3 ? 0 : 1;
  const x = at % w, y = (at - x) / w;
  const quit = pickKey(r, type.play.quit);
  const gd: GuestData = {
    type: typeId, pid: person?.id ?? -1, group: 0, lead: leader ? 0 : 1, sex, intent: came,
    name: person?.name ?? r.int(0, FIRST_NAMES.length * 26 - 1),
    bankroll, wallet: bankroll, withdrawn: 0,
    withdrawCap: Math.round(person ? person.savings : logNormal(r, type.tripCap)),
    atm: uses ? Math.round(logNormal(r, type.atm.draw)) : 0, trips: 0,
    stake: bankroll * range(r, type.play.stake) * (1 + chase),
    pace: range(r, type.play.pace), quit,
    winGoal: Math.round(bankroll * range(r, type.play.winGoal)), lossLimit: Math.round(bankroll * range(r, type.play.lossLimit)),
    compSeek: r.chance(type.play.compSeek) ? 1 : 0,
    floorTime: Math.round(normal(r, type.minutes) * TICKS_PER_MIN * (1 + 3 * chase)),
    intend, drift: intend ? logNormal(r, { median: dr.overshoot, sigma: 1.2 }) : 0, intox: 0, chase,
    needs: { bladder: r.int(0, 30), hunger: r.int(0, 30), thirst: r.int(0, 30), fatigue: r.int(0, 10) },
    mood: r.int(60, 75), luck: 0, cheat: 0,
    mem: {
      arrived: s.tick, playTicks: 0, moodSum: 0, moodN: 0, unmet: 0, drinks: 0, bigWin: 0, wagered: 0, won: 0, fails: 0, cashed: 0,
      feel: 0, rounds: 0, served: 0, comped: 0, early: 0, startIntend: intend, peak: 0, atmYes: 0, exitHops: 0, barAt: 0,
    },
    thought: "", thoughtTick: -1, recent: [], nextThink: s.tick + r.int(5, 20) * TICKS_PER_SECOND, annoy: 0, why: "", wait: -1,
    know: person ? person.know : lead ? lead.know : 0,
    kseed: person ? personSeed(person.id) : lead ? lead.kseed : r.int(0, 1 << 30),
    memDate: person ? person.last : lead ? lead.memDate : -1,
    door: at, seen: [], trail: [], seek: "", lost: 0, gaveUp: 0, trapped: 0,
  };
  const a: Agent = {
    id: s.nextId++, role: "guest", x, y, nx: x, ny: y, t: 0, steps: r.int(10, 14), dest: at,
    look: person?.look ?? r.int(0, 1 << 20),
    act: "arrive", next: "idle", target: -1, seat: -1, timer: 0, hidden: 0, g: gd,
  };
  gd.group = leader ? leader.id : a.id;
  s.agents.push(a);
  s.visits.today.arrived++;
  return a;
}

/** A group of `n` of one type walks in; the pool person (if any) leads. Returns the members. */
export function spawnGroup(g: Game, typeId: string, at: number, person: Person | null, n: number, intent?: GuestData["intent"]): Agent[] {
  const type = GUEST_TYPES[typeId];
  const r = rng(g.state, "guests");
  // Party groups are all men, all women, or mixed; otherwise each member is drawn on their own.
  const makeup = type?.sexes ? r.int(0, 2) : 2;
  const sexOf = () => (makeup < 2 ? makeup : r.int(0, 1));
  const out: Agent[] = [];
  const leader = spawnGuest(g, typeId, at, person, null, sexOf(), intent);
  if (!leader) return out;
  out.push(leader);
  for (let k = 1; k < n; k++) {
    const m = spawnGuest(g, typeId, at, null, leader, sexOf());
    if (m) out.push(m);
  }
  g.bus.emit({ type: "arrived", guestType: typeId, n: out.length, regular: person ? 1 : 0 });
  if (out.length > 1) groupMaps.delete(g);
  return out;
}

/** Group size for a new arrival of this type (1..8). */
export function groupSize(r: Rng, type: GuestTypeDef): number {
  return Math.min(8, 1 + pickIndex(r, type.group));
}

// ---------------------------------------------------------------------------------------------------------
// The visit score and departure.

export interface VisitScore { score: number; value: number; feel: number; needs: number; mood: number }

/** How the visit went: how long the money lasted per dollar lost (capped for winners), how good it felt, needs met, mood. */
export function visitScore(a: Agent): VisitScore {
  const gd = a.g!, type = GUEST_TYPES[gd.type];
  const lost = gd.mem.wagered - gd.mem.won;
  const playSec = gd.mem.playTicks / TICKS_PER_SECOND;
  // A trip with (almost) no play was wasted, whatever the money did.
  const value = playSec < 30 ? 0 : lost <= 0 ? 1 : Math.min(1, playSec / lost / type.secPerDollar);
  const feel = gd.mem.rounds ? Math.min(1, 0.2 + (1.6 * gd.mem.feel) / gd.mem.rounds + 0.3 * Math.min(1, gd.mem.bigWin)) : 0.3;
  const mood = (gd.mem.moodN ? gd.mem.moodSum / gd.mem.moodN : gd.mood) / 100;
  const needs = Math.max(0, 1 - gd.mem.unmet / 3);
  const score = Math.max(0, Math.min(1, 0.35 * mood + 0.3 * value + 0.15 * feel + 0.2 * needs));
  return { score, value, feel, needs, mood };
}

/** The guest walks out: their visit becomes the person's memory, or word of mouth. */
function depart(g: Game, a: Agent) {
  const gd = a.g!, s = g.state;
  release(g, a);
  const vs = visitScore(a);
  s.visits.today.left++;
  s.visits.today.satSum += vs.score;
  if (gd.why === "broke") s.visits.today.broke++;
  if (vs.score >= 0.72) think(g, a, "goodTime");
  else if (vs.score < 0.45) think(g, a, "badTime");
  if (gd.why === "broke" && vs.value < 0.5) think(g, a, "badValue");
  else if (vs.value >= 1 && gd.why !== "broke" && gd.mem.wagered > gd.mem.won) think(g, a, "goodValue");
  afterVisit(g, a, vs.score);
  g.bus.emit({
    type: "departed", guestType: gd.type, pid: gd.pid, lead: gd.lead, minutes: (s.tick - gd.mem.arrived) / TICKS_PER_MIN, play: gd.mem.playTicks / TICKS_PER_MIN,
    budget: gd.bankroll, lost: gd.mem.wagered - gd.mem.won, intend: gd.mem.startIntend, peak: gd.mem.peak,
    atm: gd.atm > 0 ? 1 : 0, drinks: gd.mem.drinks, withdrawn: gd.withdrawn, trips: gd.trips, score: vs.score, why: gd.why, chase: gd.chase,
  });
  walkAway(g, a);
  gone(g).add(a.id);
}

const goneSets = new WeakMap<Game, Set<number>>();
function gone(g: Game) { let s = goneSets.get(g); if (!s) goneSets.set(g, (s = new Set())); return s; }

/**
 * Someone wants to go home. A group member who is broke or done waits for the others instead, unless it's
 * urgent; the leader going takes the whole group along.
 */
function wantToLeave(g: Game, a: Agent, why: string) {
  const gd = a.g!;
  const urgent = why === "restroom" || why === "unhappy" || why === "hungry" || why === "tired" || why === "group";
  // Broke or bored: wait for the others (the leader too). Quitting (a quit rule, time up) is the leader's call.
  const waits = why === "broke" || why === "nothing" || (!gd.lead && !urgent);
  const others = companions(g, a);
  if (waits && others.length && others.some((m) => m.g!.wait < 0 && !m.g!.why)) {
    if (gd.wait < 0) { gd.wait = g.state.tick; think(g, a, "waiting"); }
    return standBy(g, a);
  }
  startLeaving(g, a, why);
}

/** A waiting member hangs around near the leader. */
function standBy(g: Game, a: Agent) {
  const r = rng(g.state, "guests");
  release(g, a);
  const lead = groups(g).get(a.g!.group)?.leader;
  const near = lead ? nearbyTile(g, "guests", lead.x, lead.y, 3) : -1;
  if (near >= 0 && near !== a.y * g.state.map.w + a.x) return go(a, near, "wait");
  a.act = "wait";
  a.timer = r.int(5, 10) * TICKS_PER_SECOND;
}

function startLeaving(g: Game, a: Agent, why: string) {
  const gd = a.g!, w = g.state.map.w, r = rng(g.state, "guests");
  if (!gd.why) gd.why = why;
  gd.wait = -1;
  release(g, a);
  // Winners and anyone holding tickets cash out at the cage first, if they can find one.
  if (!gd.mem.cashed && gd.wallet >= CASH_OUT_MIN && gd.mem.wagered > 0) {
    const use = g.has("cage") ? goUse(g, a, "cage") : "unknown";
    if (use === "ok") return;
    if (use === "unknown" && g.has("cage") && seekNeed(g, a, r, "cage", 1)) return;
    if (!g.has("cage")) { think(g, a, "noCage"); gd.mem.unmet++; }
    gd.mem.cashed = 1;
  }
  const here = a.y * w + a.x;
  const ents = g.state.map.entrances;
  const open: number[] = [];
  for (const e of ents) if (g.walkable(e) && g.paths.reachable(here, e)) open.push(e);
  // No walkable way out at all: truly trapped until the layout changes.
  if (!open.length) {
    if (!gd.trapped) { gd.trapped = 1; think(g, a, "trapped"); }
    gd.annoy += 4;
    return wander(g, a, r);
  }
  gd.trapped = 0;
  // An exit in view, or one a regular knows the way to: walk straight there.
  let best = -1, bd = Infinity;
  ents.forEach((e, k) => {
    if (!open.includes(e)) return;
    const d = Math.abs((e % w) - a.x) + Math.abs(Math.floor(e / w) - a.y);
    if (d < bd && (canSee(g, here, e) || knowsExit(gd, k))) { bd = d; best = e; }
  });
  // Lost long enough: they find it anyway (asking around, retracing steps), not happily.
  if (best < 0 && gd.seek === "exit" && gd.lost >= EXIT_LOST) {
    for (const e of open) {
      const d = Math.abs((e % w) - a.x) + Math.abs(Math.floor(e / w) - a.y);
      if (d < bd) { bd = d; best = e; }
    }
    think(g, a, "finallyOut");
    gd.annoy += 6;
  }
  if (best >= 0) { gd.seek = ""; gd.lost = 0; return go(a, best, "leave"); }
  if (gd.seek === "exit" && gd.lost === 3) think(g, a, "lostExit");
  gd.mem.exitHops++;
  // Otherwise head roughly back the way they came in, helped by any sign in view.
  const toward = g.walkable(gd.door) ? gd.door : open[0];
  if (search(g, a, r, "exit", open, toward, 1 + 0.2 * gd.lost)) return;
  go(a, open[0], "leave");
}

// ---------------------------------------------------------------------------------------------------------
// Choosing what to do.

/** Remember amenities in view. Spotting one ends any give-up on that need. */
function lookAround(g: Game, a: Agent) {
  const gd = a.g!, w = g.state.map.w, here = a.y * w + a.x;
  // Cages are on the ATM list too; look at each object once.
  for (const what of ["thirst", "bladder", "cage", "atm"] as Need[])
    for (const o of g.amenities[what]) {
      if (what === "atm" && OBJECTS[o.kind].serves === "cage") continue;
      const t = faceTile(g, o);
      if (Math.abs((t % w) - a.x) + Math.abs(Math.floor(t / w) - a.y) > SIGHT || !canSee(g, here, t)) continue;
      remember(gd, o.id);
      gd.gaveUp &= ~(NEED_BIT[what] | (what === "cage" ? NEED_BIT.atm : 0));
    }
}

/**
 * Walk to the nearest free seat of an amenity serving `what` that the guest can see or knows the way to.
 * "full" when every one they know of is taken; "unknown" when they don't know of any.
 */
function goUse(g: Game, a: Agent, what: Need): "ok" | "full" | "unknown" {
  const gd = a.g!, w = g.state.map.w, here = a.y * w + a.x;
  let best = -1, bestSeat = -1, bd = Infinity, known = false;
  for (const o of g.amenities[what]) {
    const t = faceTile(g, o);
    const d = Math.abs((t % w) - a.x) + Math.abs(Math.floor(t / w) - a.y);
    if (!knowsRoute(gd, o) && (d > SIGHT || !canSee(g, here, t))) continue;
    if (!g.paths.reachable(here, t)) continue;
    known = true;
    const k = freeSeat(g, o.id);
    if (k < 0) continue;
    const st = seatTile(g, o.id, k);
    const ds = Math.abs((st % w) - a.x) + Math.abs(Math.floor(st / w) - a.y);
    if (ds < bd) { bd = ds; best = o.id; bestSeat = k; }
  }
  if (best < 0) return known ? "full" : "unknown";
  if (gd.seek === what) { gd.seek = ""; gd.lost = 0; }
  claim(g, a, best, bestSeat);
  go(a, seatTile(g, best, bestSeat), ACT_OF[what]);
  return "ok";
}

/** One hop of searching: follow a sign in view if one helps, else explore (toward a remembered spot, if any). */
function search(g: Game, a: Agent, r: Rng, goal: string, targets: number[], toward: number, det: number): boolean {
  const gd = a.g!, type = GUEST_TYPES[gd.type];
  if (gd.seek !== goal) { gd.seek = goal; gd.lost = 0; }
  gd.lost++;
  if (gd.lost >= 2) gd.annoy += 2;
  let dest = signLeg(g, a, r, targets);
  if (dest >= 0 && gd.lost >= 2 && r.chance(0.3)) think(g, a, "signHelped");
  if (dest < 0) dest = explore(g, a, r, (i) => fitAt(g, type, i).score, toward, det);
  if (dest < 0) return false;
  go(a, dest, "idle");
  return true;
}

/** Search for an amenity the guest doesn't know the way to. False once they give up (and go without). */
function seekNeed(g: Game, a: Agent, r: Rng, what: Need, det: number): boolean {
  const gd = a.g!;
  if (gd.gaveUp & NEED_BIT[what]) return false;
  if (gd.seek === what && gd.lost >= GIVE_UP) {
    gd.gaveUp |= NEED_BIT[what];
    gd.seek = "";
    gd.lost = 0;
    think(g, a, WHERE[what]);
    gd.mem.unmet++;
    return false;
  }
  if (gd.seek === what && gd.lost === 3) think(g, a, WHERE[what]);
  // Somewhere they saw one earlier this visit: head that way.
  let toward = -1;
  for (let k = gd.seen.length - 1; k >= 0 && toward < 0; k--) {
    const o = g.objById.get(gd.seen[k]);
    const serves = o && OBJECTS[o.kind].serves;
    if (serves === what || (what === "atm" && serves === "cage")) toward = faceTile(g, o!);
  }
  const targets: number[] = [];
  for (const o of g.amenities[what]) targets.push(faceTile(g, o));
  return search(g, a, r, what, targets, toward, det);
}

const MAX_CANDIDATES = 16;
/** Sight-line checks per look for machines: a glance, not a survey. */
const MAX_LOOKS = 40;
/** Machines considered per look at most, so a packed floor can't make one decision expensive. */
const MAX_SCAN = 400;
/** A machine seen paying a jackpot this recently is "hot" (seconds at 1×). */
const HOT_SECONDS = 30;

interface Candidate { o: number; appeal: number; d: number; seen: boolean }

/**
 * Free, working machines a guest would consider: ones in view, or ones a regular knows the way to. Searched in
 * rings of 16×16 sectors outward from the guest, keeping the MAX_CANDIDATES nearest.
 */
function candidates(g: Game, a: Agent, type: GuestTypeDef): Candidate[] {
  const gd = a.g!, { w, h } = g.state.map, here = a.y * w + a.x;
  // Look up to 3 sectors away (~50 tiles): guests don't know about machines across a huge floor.
  // Anything in sight lies within one sector ring; farther rings only hold machines a regular remembers.
  const sx = a.x >> 4, sy = a.y >> 4, maxR = Math.min(gd.memDate >= 0 ? 3 : 1, Math.max(w, h) >> 4);
  const out: Candidate[] = [];
  let looks = MAX_LOOKS, scan = MAX_SCAN;
  for (let r = 0; r <= maxR; r++) {
    for (let y = sy - r; y <= sy + r; y++) for (let x = sx - r; x <= sx + r; x++) {
      if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) !== r || x < 0 || y < 0) continue;
      const list = g.slotSectors.get(y * 4096 + x);
      if (!list) continue;
      for (const o of list) {
        if (--scan < 0) return out;
        if (o.broken) continue;
        const m = modelOf(o.kind)!;
        const appeal = type.games[m.id] ?? 0;
        if (appeal <= 0.05 || betOf(m, 1) * WAGERS_PER_ROUND > gd.wallet || freeSeat(g, o.id) < 0) continue;
        const d = Math.abs(o.x - a.x) + Math.abs(o.y - a.y);
        // Keep the nearest few, sorted by distance (ties by id, so the order is deterministic).
        if (out.length >= MAX_CANDIDATES && d >= out[out.length - 1].d) continue;
        // Known routes first (a cheap hash); sight lines only for the rest, and only so many per look.
        const known = knowsRoute(gd, o);
        const seen = !known && d <= SIGHT + 1 && looks-- > 0 && canSee(g, here, seatTile(g, o.id, 0));
        if (!seen && !known) continue;
        let k = out.length;
        while (k > 0 && (out[k - 1].d > d || (out[k - 1].d === d && out[k - 1].o > o.id))) k--;
        out.splice(k, 0, { o: o.id, appeal, d, seen });
        if (out.length > MAX_CANDIDATES) out.pop();
      }
    }
    // Enough choice close by: stop looking farther.
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

/** Tiles where the rest of the group is sitting, for sitting together. */
function groupSeats(g: Game, a: Agent): number[] {
  const w = g.state.map.w, out: number[] = [];
  for (const m of companions(g, a)) if (m.act === "play" && m.seat >= 0) out.push(m.y * w + m.x);
  return out.slice(0, 3);
}

/** Pick a machine and walk to it. `liked` only considers machines in view they really like (drink-first guests). */
function chooseMachine(g: Game, a: Agent, type: GuestTypeDef, r: Rng, liked = false): boolean {
  const w = g.state.map.w, gd = a.g!, tick = g.state.tick;
  const mates = groupSeats(g, a);
  const cheap = compSeeking(g, gd);
  let best = -1, bestScore = -Infinity, far = false, hot = false;
  for (const c of candidates(g, a, type)) {
    if (liked && (!c.seen || c.appeal < 0.8)) continue;
    const t = seatTile(g, c.o, 0);
    const o = g.objById.get(c.o)!;
    const d = Math.abs((t % w) - a.x) + Math.abs(Math.floor(t / w) - a.y);
    // What's in front of them pulls a little harder than what they remember.
    let score = c.appeal * 2 + fitAt(g, type, t).score * 0.5 - d / 25 + (c.seen ? 0.3 : 0) + r.next() * 0.6;
    // Hot machine belief: one they just saw pay out.
    const isHot = c.seen && o.last.win === 2 && tick - o.last.tick < HOT_SECONDS * TICKS_PER_SECOND;
    if (isHot) score += 1.2;
    // Sit next to the group, or at least within sight of them.
    if (mates.length) {
      let near = 0;
      for (const m of mates) {
        const dm = Math.abs((m % w) - (t % w)) + Math.abs(Math.floor(m / w) - Math.floor(t / w));
        if (dm <= 2) near = Math.max(near, 1.2);
        else if (dm <= SIGHT && near < 0.4 && canSee(g, t, m)) near = 0.4;
      }
      score += near;
    }
    // Comp-seekers nurse the cheapest machine while drinks are free.
    if (cheap) score += modelOf(o.kind)!.denom <= 0.25 ? 1.5 : -0.5;
    if (score > bestScore) { bestScore = score; best = c.o; far = c.seen && d > 6; hot = isHot; }
  }
  if (best < 0) return false;
  if (hot && r.chance(0.5)) think(g, a, "hot");
  else if (far && r.chance(0.15)) think(g, a, "ooh");
  claim(g, a, best, freeSeat(g, best));
  go(a, seatTile(g, best, a.seat), "play");
  return true;
}

function canAffordAnything(g: Game, gd: GuestData): boolean {
  // Nothing to play at all is not a money problem.
  return g.minRound === Infinity || g.minRound <= gd.wallet + 1e-9;
}

/** Browse: walk to the most inviting view nearby (indoors: the casino is inside), then think again. */
function wander(g: Game, a: Agent, r: Rng) {
  const type = GUEST_TYPES[a.g!.type], out = g.state.map.outdoor;
  let dest = explore(g, a, r, (i) => (out[i] ? -2 : fitAt(g, type, i).score));
  if (dest < 0) dest = nearbyTile(g, "guests", a.x, a.y, 8);
  if (dest < 0) dest = a.y * g.state.map.w + a.x;
  go(a, dest, "idle");
}

/**
 * Out of money: go back to the ATM? Rises with chasing a loss back to even, drink, the chasing level and a bad
 * mood; falls after a win and with each trip already made. Decided once per trip.
 */
function wantsAtm(g: Game, a: Agent, r: Rng): boolean {
  const gd = a.g!, type = GUEST_TYPES[gd.type];
  if (!gd.atm || gd.withdrawn >= gd.withdrawCap - 1 || !g.has("atm")) return false;
  if (gd.mem.atmYes === gd.trips + 1) return true;
  const down = Math.max(0, Math.min(1, -net(gd) / staked(gd)));
  let p = type.atm.again + 0.3 * down + 0.5 * gd.intox + 0.6 * gd.chase + (gd.mood < 40 ? 0.1 : 0) - (net(gd) > 0 ? 0.3 : 0);
  p *= gd.trips === 0 ? 1 : Math.pow(0.6, gd.trips) * (1 + 2 * gd.chase);
  if (!r.chance(Math.max(0.01, Math.min(0.97, p)))) return false;
  gd.mem.atmYes = gd.trips + 1;
  return true;
}

/** Seconds a guest who found the bar full puts off trying again (unless really thirsty). */
const BAR_RETRY = 60;

function wantsDrink(g: Game, gd: GuestData): boolean {
  // Drinkers go when they're below where they mean to be; everyone goes when thirsty enough.
  if (gd.needs.thirst >= 70) return true;
  return gd.intend > 0 && gd.intox < gd.intend - 0.03 && gd.needs.thirst >= 20 && g.state.tick >= gd.mem.barAt;
}

function decide(g: Game, a: Agent) {
  const gd = a.g!, type = GUEST_TYPES[gd.type], n = gd.needs;
  const r = rng(g.state, "guests");
  lookAround(g, a);
  if (gd.why) return startLeaving(g, a, gd.why);
  if (n.fatigue >= 100) { think(g, a, "tired"); return startLeaving(g, a, "tired"); }
  if (gd.mood < 15) { think(g, a, "badTime"); return startLeaving(g, a, "unhappy"); }
  if (n.hunger >= 100) { think(g, a, "hungry"); gd.mem.unmet++; return startLeaving(g, a, "hungry"); }
  if (n.bladder >= 70) {
    if (!g.has("bladder") || gd.gaveUp & NEED_BIT.bladder) {
      if (n.bladder >= 90) { think(g, a, "noRestroom"); gd.mem.unmet++; return startLeaving(g, a, "restroom"); }
    } else {
      const use = goUse(g, a, "bladder");
      if (use === "ok") return;
      if (use === "full") { think(g, a, "line"); gd.annoy += 3; return wander(g, a, r); }
      // The more urgent, the more single-minded the search.
      if (seekNeed(g, a, r, "bladder", n.bladder / 40)) return;
    }
  }
  // Waiting on the group: stay put (a restroom trip above is still allowed).
  if (gd.wait >= 0) return standBy(g, a);
  if (g.state.tick - gd.mem.arrived >= gd.floorTime) { think(g, a, "timeToGo"); return wantToLeave(g, a, "time"); }
  const firstDrink = gd.intent === "drink" && gd.mem.drinks === 0;
  // Came for a drink, but a machine they like catches their eye: "just one quick spin".
  if (firstDrink && r.chance(0.25) && chooseMachine(g, a, type, r, true)) { gd.intent = "gamble"; think(g, a, "quickSpin"); return; }
  if (wantsDrink(g, gd) || firstDrink) {
    const use = g.has("thirst") && !(gd.gaveUp & NEED_BIT.thirst) ? goUse(g, a, "thirst") : "none";
    if (use === "ok") return;
    if (use === "unknown" && seekNeed(g, a, r, "thirst", 0.8)) return;
    if (use === "none") { if (!g.has("thirst")) { think(g, a, "noBar"); gd.mem.unmet++; } n.thirst = 40; }
    else if (use === "full") { think(g, a, "line"); gd.annoy += 2; n.thirst = Math.min(n.thirst, 55); gd.mem.barAt = g.state.tick + BAR_RETRY * TICKS_PER_SECOND; }
    else n.thirst = 40;
    gd.intent = "gamble";
  }
  if (!canAffordAnything(g, gd)) {
    if (wantsAtm(g, a, r)) {
      const use = goUse(g, a, "atm");
      if (use === "ok" || (use === "unknown" && seekNeed(g, a, r, "atm", 0.8))) return;
    }
    think(g, a, "broke");
    return wantToLeave(g, a, "broke");
  }
  if (chooseMachine(g, a, type, r)) { gd.mem.fails = 0; return; }
  // Wandered outside: back in through the door.
  if (headInside(g, a)) return;
  if (++gd.mem.fails >= MAX_FAILS) { gd.mem.unmet++; return wantToLeave(g, a, "nothing"); }
  if (gd.mem.fails === 3) think(g, a, "cantFind");
  gd.annoy += 2;
  wander(g, a, r);
}

/** Loss limit and win goal as they stand now: drink loosens both, chasing erodes the limit. */
export function limits(gd: GuestData): { loss: number; win: number } {
  return { loss: gd.lossLimit * (1 + 1.5 * gd.intox) * (1 + 2 * gd.chase), win: gd.winGoal * (1 + gd.intox) * (1 + gd.chase) };
}

/** Between rounds: keep playing, or get up (quit rule, floor time, needs, money, a broken machine, the group). */
function quitReason(g: Game, a: Agent): string | null {
  const gd = a.g!, n = gd.needs;
  const o = g.objById.get(a.target);
  const m = o && modelOf(o.kind);
  if (!o || !m) return "gone";
  if (gd.why) return "leaving";
  if (o.broken) { think(g, a, "broken"); gd.annoy += 10; return "broken"; }
  if (betOf(m, 1) * WAGERS_PER_ROUND > gd.wallet) return "money";
  const nt = net(gd);
  const rule = gd.quit as QuitRule;
  const lim = limits(gd);
  if (rule === "winGoal" && nt >= lim.win) { think(g, a, "quitAhead"); return "done"; }
  if (rule === "lossLimit" && -nt >= lim.loss) { think(g, a, "myLimit"); return "done"; }
  const jackpot = o.last.win === 2 && o.last.tick === g.state.tick;
  if (jackpot) think(g, a, "bigWin");
  if (rule === "jackpot" && jackpot) return "done";
  if (g.state.tick - gd.mem.arrived >= gd.floorTime) { think(g, a, "timeToGo"); return "time"; }
  if (n.fatigue >= 100 || n.hunger >= 100 || gd.mood < 15) return "need";
  if (n.bladder >= (g.has("bladder") ? 75 : 90)) return "need";
  if (wantsDrink(g, gd) && g.has("thirst") && !(gd.gaveUp & NEED_BIT.thirst)) return "need";
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Per-tick activity handling.

function useTicks(g: Game, a: Agent, r: Rng): number {
  const o = g.objById.get(a.target);
  const use = (o && OBJECTS[o.kind].use) || [3, 5];
  return Math.round(range(r, use) * TICKS_PER_SECOND);
}

function finishUse(g: Game, a: Agent, r: Rng) {
  const gd = a.g!;
  const o = g.objById.get(a.target);
  const def = o && OBJECTS[o.kind];
  if (o && def) {
    o.st.uses++;
    if (def.serves === "thirst") {
      serveDrink(g, a, "bar");
      if (r.chance(0.25)) litter(g, a.y * g.state.map.w + a.x);
    } else if (def.serves === "bladder") {
      gd.needs.bladder = 0;
    } else if (def.serves === "cage" && gd.why) {
      gd.mem.cashed = 1;
    } else if (def.serves === "cage" || def.serves === "atm") {
      // A withdrawal: about their usual draw, never more than they have.
      const want = Math.round(logNormal(r, { median: gd.atm || 40, sigma: 0.4, min: 20 }) / 10) * 10;
      const amt = Math.max(0, Math.min(gd.withdrawCap - gd.withdrawn, want));
      if (amt > 0) { gd.wallet += amt; gd.withdrawn += amt; gd.trips++; think(g, a, "atm"); }
      else gd.withdrawn = gd.withdrawCap;
    }
  }
  release(g, a);
  a.act = "idle";
}

function litter(g: Game, i: number) {
  const d = g.state.dirt;
  if (d[i] < DIRT_CAP) d[i]++;
}

/**
 * Just through the gate: outside the building, head for the open door in view (the one they saw from the
 * sidewalk) before looking around. True when they're on their way.
 */
function headInside(g: Game, a: Agent): boolean {
  const m = g.state.map, w = m.w, here = a.y * w + a.x;
  if (!m.outdoor[here] || m.terrain[here] === T.DOOR) return false;
  let best = -1, bd = Infinity;
  for (let y = Math.max(0, a.y - SIGHT); y <= Math.min(m.h - 1, a.y + SIGHT); y++)
    for (let x = Math.max(0, a.x - SIGHT); x <= Math.min(w - 1, a.x + SIGHT); x++) {
      const i = y * w + x, d = Math.abs(x - a.x) + Math.abs(y - a.y);
      if (d >= bd || m.terrain[i] !== T.DOOR || !g.walkable(i) || !canSee(g, here, i) || !g.paths.reachable(here, i)) continue;
      bd = d; best = i;
    }
  if (best < 0) return false;
  go(a, best, "idle");
  return true;
}

function guestTick(g: Game, a: Agent) {
  const gd = a.g!;
  switch (a.act) {
    case "arrive":
      if (headInside(g, a)) return;
      decide(g, a);
      return;
    case "idle":
      decide(g, a);
      return;
    case "wait":
      if (gd.why || --a.timer <= 0) { a.act = "idle"; a.timer = 0; }
      return;
    case "play": {
      if (a.timer === 0) {
        // Just sat down: start the session and the first round.
        const o = g.objById.get(a.target), m = o && modelOf(o.kind);
        if (!o || !m || o.broken || a.seat < 0) { release(g, a); a.act = "idle"; return; }
        o.st.sessions++;
        a.timer = roundTicks(m, gd.pace * (compSeeking(g, gd) ? 0.7 : 1));
      } else if (a.timer === -1) {
        const why = quitReason(g, a);
        if (why) {
          release(g, a);
          a.act = "idle";
          // A quit rule met, or the time they meant to spend is up: they go home (not just to another machine).
          if (why === "done" || why === "time") wantToLeave(g, a, why);
          return;
        }
        a.timer = roundTicks(modelOf(g.objById.get(a.target)!.kind)!, gd.pace * (compSeeking(g, gd) ? 0.7 : 1));
      }
      return;
    }
    case "drink":
    case "restroom":
    case "cage": {
      if (a.seat < 0 || !g.objById.has(a.target)) { release(g, a); a.act = "idle"; return; }
      const r = rng(g.state, "guests");
      if (a.timer === 0) {
        a.timer = useTicks(g, a, r);
        if (a.act === "restroom") a.hidden = 1;
        return;
      }
      if (--a.timer === 0) finishUse(g, a, r);
      return;
    }
    case "leave":
      depart(g, a);
      return;
    default:
      if (!isWalking(a)) { a.act = "idle"; }
  }
}

function guestBeat(g: Game, a: Agent, r: Rng) {
  const gd = a.g!, type = GUEST_TYPES[gd.type], n = gd.needs, rate = type.needs;
  const walking = isWalking(a);
  n.bladder = Math.min(100, n.bladder + rate.bladder * (1 + 0.15 * gd.mem.drinks));
  n.thirst = Math.min(100, n.thirst + rate.thirst);
  n.hunger = Math.min(100, n.hunger + rate.hunger);
  n.fatigue = Math.min(100, n.fatigue + rate.fatigue * (walking ? 1.3 : 0.8));
  gd.annoy = Math.max(0, Math.min(30, gd.annoy - 0.5 + (gd.wait >= 0 ? 0.3 : 0)));
  gd.know += (1 - gd.know) * LEARN;
  // Drink wears off; being drunk nudges the intended level up (inhibition is what drinking erodes).
  if (gd.intox > 0) {
    gd.intend = Math.min(type.drinking.cap, gd.intend + (gd.drift * gd.intox) / 60);
    gd.intox = Math.max(0, gd.intox - SOBER_PER_MIN / 60);
  }
  // Play time is booked once a second, not every tick.
  if (a.act === "play" && a.timer !== 0) {
    const o = g.objById.get(a.target);
    if (o) { gd.mem.playTicks += TICKS_PER_BEAT; o.st.playTicks += TICKS_PER_BEAT; }
  }
  if (a.hidden) return;
  // Mood: every second while walking; every MOOD_EVERY seconds while settled (surroundings don't change much).
  const beatNo = Math.floor(g.state.tick / TICKS_PER_BEAT);
  const span = walking ? 1 : MOOD_EVERY;
  if (!walking && (a.id + beatNo) % MOOD_EVERY !== 0) return thinkIfDue(g, a, type, r);
  const here = a.y * g.state.map.w + a.x;
  const env = Math.max(-30, Math.min(12, fitAt(g, type, here).score * 8));
  const luck = Math.max(-15, Math.min(15, (net(gd) / staked(gd)) * 25));
  let needs = 0;
  for (const v of [n.bladder, n.thirst, n.hunger, n.fatigue]) if (v > 60) needs += (v - 60) / 3;
  const drink = gd.intox > 0.05 && gd.intox < 0.6 ? 4 : gd.intox > 0.9 ? -4 : 0;
  let target = 62 + env + luck - needs - gd.annoy + drink;
  // Company: mood pulls toward the group's.
  const gi = groups(g).get(gd.group);
  if (gi && gi.members.length > 1) {
    let sum = 0;
    for (const m of gi.members) sum += m.g!.mood;
    target = (1 - GROUP_PULL) * target + (GROUP_PULL * sum) / gi.members.length;
  }
  gd.mood = Math.max(0, Math.min(100, gd.mood + (target - gd.mood) * (1 - Math.pow(0.9, span))));
  gd.mem.moodSum += gd.mood * span;
  gd.mem.moodN += span;
  if (walking && r.chance(gd.mem.drinks ? 0.006 : 0.003)) litter(g, here);
  thinkIfDue(g, a, type, r);
}

function thinkIfDue(g: Game, a: Agent, type: GuestTypeDef, r: Rng) {
  const gd = a.g!;
  if (g.state.tick >= gd.nextThink) {
    periodicThought(g, a, type);
    gd.nextThink = g.state.tick + r.int(THINK_EVERY[0], THINK_EVERY[1]) * TICKS_PER_SECOND;
  }
}

/** Once a second: groups whose leader left or quit, or where half the members have waited too long, go home. */
function groupsBeat(g: Game) {
  const tick = g.state.tick;
  for (const gi of refreshGroups(g).values()) {
    if (gi.members.length < 2 && gi.leader) continue;
    const leaderGone = !gi.leader || !!gi.leader.g!.why;
    let long = 0;
    for (const m of gi.members) if (m.g!.wait >= 0 && tick - m.g!.wait >= WAIT_LONG * TICKS_PER_SECOND) long++;
    if (!leaderGone && long * 2 < gi.members.length) continue;
    for (const m of gi.members) if (!m.g!.why) { m.g!.why = "group"; m.g!.wait = -1; }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Arrival rates.

export const repFactor = (rep: number) => 0.3 + 1.4 * Math.pow(Math.max(0, rep) / 100, 1.3);

/** Guests on the floor now, plus people on their way in. */
export function guestCount(g: Game): number {
  let n = 0;
  for (const a of g.state.agents) if (a.role === "guest") n++;
  for (const p of g.state.peds) if (p.goal >= 0) n += p.n;
  return n;
}

/** Floor-size factor on new arrivals: a bigger floor draws more people. */
export function capacity(g: Game): number {
  let seats = 0;
  for (const o of g.state.objects) if (modelOf(o.kind)) seats++;
  return Math.min(2.5, (seats + 6) / 50);
}

/** Room left under the scenario's guest cap, 0-1. */
export function room(g: Game, guestsNow = guestCount(g)): number {
  return Math.max(0, 1 - guestsNow / SCENARIOS[g.state.scenario].maxGuests);
}

// ---------------------------------------------------------------------------------------------------------

const commands: CommandTable<"spawnGuests" | "clearGuests"> = {
  spawnGuests: {
    validate: (_g, c) => (c.n > 0 && c.n <= 5000 ? null : "Bad count"),
    apply(g, c) {
      const types = Object.keys(GUEST_TYPES);
      for (let k = 0; k < c.n; k++) {
        const at = randomWalkable(g, "guests");
        if (!spawnGuest(g, types[k % types.length], at, null, null, k & 1)) break;
      }
      groupMaps.delete(g);
    },
  },
  clearGuests: {
    validate: () => null,
    apply(g) {
      g.state.agents = g.state.agents.filter((a) => a.role !== "guest");
      g.state.peds = [];
      rebuildBook(g);
      refreshGroups(g);
      reconcilePool(g);
      g.fields.updateCrowd();
    },
  },
};

export const guestSystem: System = {
  id: "guests",
  deps: ["movement", "gaming"],
  commands,
  init(g) { rebuildBook(g); refreshGroups(g); },
  layout(g) {
    // Objects may have gone: drop claims on them and send their users back to deciding.
    const before = new Map<number, number>();
    for (const a of g.state.agents) if (a.role === "guest" && a.seat >= 0) before.set(a.id, a.target);
    rebuildBook(g);
    for (const a of g.state.agents) {
      if (a.role !== "guest" || !before.has(a.id)) continue;
      if (a.seat < 0) { a.hidden = 0; a.act = "idle"; a.timer = 0; }
    }
  },
  tick(g) {
    const s = g.state;
    const r = rng(s, "guests");
    // Each guest's once-a-second update falls on its own tick, so 5,000 guests don't all update at once.
    for (const a of s.agents) {
      if (a.role !== "guest") continue;
      if ((a.id + s.tick) % TICKS_PER_BEAT === 0) guestBeat(g, a, r);
      guestTick(g, a);
      const gd = a.g!;
      if (gd.intox > gd.mem.peak) gd.mem.peak = gd.intox;
    }
    const out = gone(g);
    if (out.size) { s.agents = s.agents.filter((a) => !out.has(a.id)); out.clear(); groupMaps.delete(g); }
  },
  beat(g) { groupsBeat(g); },
  day(g) {
    const s = g.state;
    s.thoughts.unshift({});
    if (s.thoughts.length > THOUGHT_DAYS) s.thoughts.length = THOUGHT_DAYS;
    s.visits.yday = s.visits.today;
    s.visits.today = { arrived: 0, left: 0, satSum: 0, broke: 0, walkedPast: 0 };
  },
};

/** Days of thought counts kept (today plus two). */
export const THOUGHT_DAYS = 3;

/** Thought counts per day, averaged over the last ~2 in-game days (the Guests tab). */
export function thoughtRates(g: Game): Record<string, number> {
  const s = g.state, frac = (s.tick % TICKS_PER_DAY) / TICKS_PER_DAY;
  const out: Record<string, number> = {};
  // Today so far, all of yesterday, and the part of the day before that still falls within the last two days.
  const weights = [1, 1, 1 - frac];
  s.thoughts.forEach((day, k) => { for (const [id, n] of Object.entries(day)) out[id] = (out[id] ?? 0) + (n * (weights[k] ?? 0)) / 2; });
  return out;
}
