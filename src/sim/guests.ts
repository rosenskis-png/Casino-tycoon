// Guests (FOUNDATIONS §6): arrivals, needs, mood, thoughts, choosing what to do, and leaving. Every guest is
// one real person (docs/spec/clock.md). What a visit felt like becomes reputation for that guest type (§15).
// PROVISIONAL behavior numbers until the guest design discussion (FOUNDATIONS §26).
import { GUEST_TYPES, FIRST_NAMES, type GuestTypeDef, type Pref, type QuitRule, type Taste } from "../data/guests";
import { OBJECTS } from "../data/objects";
import { SCENARIOS } from "../data/scenarios";
import { WAGERS_PER_ROUND } from "../data/games";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Agent, GuestData } from "./state";
import { rng, type Rng } from "./rng";
import { go, isWalking, nearbyTile, randomWalkable, MAX_AGENTS } from "./agents";
import { betOf, modelOf, roundTicks } from "./gaming";
import { post } from "./finance";
import { TICKS_PER_DAY, TICKS_PER_SECOND, dateOfDay } from "./clock";

declare module "./commands" {
  interface CommandTypes {
    /** Debug/perf: drop guests straight onto the floor. */
    spawnGuests: { n: number };
    clearGuests: {};
  }
}

const REP_RATE = 0.02;
const THINK_EVERY: [number, number] = [15, 30]; // seconds at 1×
const CASH_OUT_MIN = 20;
const MAX_FAILS = 3;
const DIRT_CAP = 9;

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
// Thoughts.

export function think(g: Game, a: Agent, id: string) {
  const gd = a.g!;
  gd.thought = id;
  gd.thoughtTick = g.state.tick;
  gd.recent.push(id);
  if (gd.recent.length > 5) gd.recent.shift();
  const t = g.state.thoughts.today;
  t[id] = (t[id] ?? 0) + 1;
}

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
  const rel = (gd.mem.won - gd.mem.wagered) / Math.max(1, gd.bankroll);
  if (rel >= 0.5) consider("onARoll", 6);
  if (rel <= -0.6) consider("eaten", 6);
  if (gd.intox >= 3) consider("tipsy", 4);
  if (id) think(g, a, id);
}

// ---------------------------------------------------------------------------------------------------------
// Arrival and departure.

function pickWeighted<T extends string>(r: Rng, w: Record<T, number>): T {
  const keys = Object.keys(w) as T[];
  let total = 0;
  for (const k of keys) total += w[k];
  let u = r.next() * total;
  for (const k of keys) { u -= w[k]; if (u < 0) return k; }
  return keys[keys.length - 1];
}

const range = (r: Rng, [lo, hi]: [number, number]) => lo + r.next() * (hi - lo);

export function spawnGuest(g: Game, typeId: string, at: number): Agent | null {
  const s = g.state;
  const type = GUEST_TYPES[typeId];
  if (!type || at < 0 || s.agents.length >= MAX_AGENTS) return null;
  const r = rng(s, "guests");
  const w = s.map.w;
  const bankroll = Math.round(range(r, type.budget) / 5) * 5;
  const x = at % w, y = (at - x) / w;
  const gd: GuestData = {
    type: typeId, group: 0, intent: r.chance(0.12) ? "drink" : "gamble", name: r.int(0, FIRST_NAMES.length * 26 - 1),
    bankroll, wallet: bankroll, withdrawn: 0,
    withdrawCap: Math.round(range(r, type.atm.cap) / 10) * 10, atm: r.chance(type.atm.chance) ? 1 : 0,
    credits: 1 + Math.floor(r.next() * (1 + type.play.credits * 3)),
    pace: range(r, type.play.pace), quit: pickWeighted(r, type.play.quit),
    winGoal: Math.round(bankroll * range(r, type.play.winGoal)), lossLimit: Math.round(bankroll * range(r, type.play.lossLimit)),
    compSeek: r.chance(type.play.compSeek) ? 1 : 0,
    sober: r.chance(type.drinking.sober) ? 1 : 0, intox: 0,
    needs: { bladder: r.int(0, 30), hunger: r.int(0, 30), thirst: r.int(0, 30), fatigue: r.int(0, 10) },
    mood: r.int(60, 75), luck: 0, cheat: 0,
    mem: { arrived: s.tick, playTicks: 0, moodSum: 0, moodN: 0, unmet: 0, drinks: 0, bigWin: 0, wagered: 0, won: 0, fails: 0, cashed: 0 },
    thought: "", thoughtTick: -1, recent: [], nextThink: s.tick + r.int(5, 20) * TICKS_PER_SECOND, annoy: 0, why: "",
  };
  gd.group = s.nextId;
  const a: Agent = {
    id: s.nextId++, role: "guest", x, y, nx: x, ny: y, t: 0, steps: r.int(10, 14), dest: at, look: r.int(0, 1 << 20),
    act: "arrive", next: "idle", target: -1, seat: -1, timer: 0, hidden: 0, g: gd,
  };
  s.agents.push(a);
  s.visits.today.arrived++;
  return a;
}

function satisfaction(a: Agent): number {
  const gd = a.g!, type = GUEST_TYPES[gd.type];
  const value = Math.min(1, gd.mem.playTicks / TICKS_PER_SECOND / type.valueSeconds);
  const mood = gd.mem.moodN ? gd.mem.moodSum / gd.mem.moodN : gd.mood;
  const needs = Math.max(0, 1 - gd.mem.unmet / 3);
  return Math.max(0, Math.min(1, 0.4 * (mood / 100) + 0.4 * value + 0.2 * needs));
}

/** The guest walks out: their visit becomes reputation for their type. */
function depart(g: Game, a: Agent) {
  const gd = a.g!, s = g.state;
  release(g, a);
  const sat = satisfaction(a);
  const cur = s.rep[gd.type] ?? 50;
  s.rep[gd.type] = Math.max(0, Math.min(100, cur + (sat * 100 - cur) * REP_RATE));
  s.visits.today.left++;
  s.visits.today.satSum += sat;
  if (gd.why === "broke") s.visits.today.broke++;
  const value = gd.mem.playTicks / TICKS_PER_SECOND / GUEST_TYPES[gd.type].valueSeconds;
  if (sat >= 0.72) think(g, a, "goodTime");
  else if (sat < 0.45) think(g, a, "badTime");
  if (gd.why === "broke" && value < 0.5) think(g, a, "badValue");
  else if (value >= 1 && gd.why !== "broke") think(g, a, "goodValue");
  gone(g).add(a.id);
}

const goneSets = new WeakMap<Game, Set<number>>();
function gone(g: Game) { let s = goneSets.get(g); if (!s) goneSets.set(g, (s = new Set())); return s; }

function nearestExit(g: Game, a: Agent): number {
  const w = g.state.map.w;
  let best = -1, bd = Infinity;
  for (const e of g.state.map.entrances) {
    const d = Math.abs((e % w) - a.x) + Math.abs(Math.floor(e / w) - a.y);
    if (d < bd && g.walkable(e)) { bd = d; best = e; }
  }
  return best;
}

function startLeaving(g: Game, a: Agent, why: string) {
  const gd = a.g!;
  if (!gd.why) gd.why = why;
  release(g, a);
  // Winners and anyone holding tickets cash out at the cage first, if there is one.
  if (!gd.mem.cashed && gd.wallet >= CASH_OUT_MIN && gd.mem.wagered > 0) {
    if (goUse(g, a, "cage")) return;
    if (!g.has("cage")) { think(g, a, "noCage"); gd.mem.unmet++; }
    gd.mem.cashed = 1;
  }
  const exit = nearestExit(g, a);
  // Walled in with no way out: they leave anyway rather than haunt the floor.
  if (exit < 0 || !g.paths.reachable(a.y * g.state.map.w + a.x, exit)) return depart(g, a);
  go(a, exit, "leave");
}

// ---------------------------------------------------------------------------------------------------------
// Choosing what to do.

/** Walk to the nearest free seat of an amenity serving `what`. Returns false when none is free. */
function goUse(g: Game, a: Agent, what: "thirst" | "bladder" | "cage"): boolean {
  const w = g.state.map.w;
  let best = -1, bestSeat = -1, bd = Infinity;
  for (const o of g.amenities[what]) {
    const k = freeSeat(g, o.id);
    if (k < 0) continue;
    const t = seatTile(g, o.id, k);
    const d = Math.abs((t % w) - a.x) + Math.abs(Math.floor(t / w) - a.y);
    if (d < bd) { bd = d; best = o.id; bestSeat = k; }
  }
  if (best < 0) return false;
  claim(g, a, best, bestSeat);
  go(a, seatTile(g, best, bestSeat), what === "thirst" ? "drink" : what === "bladder" ? "restroom" : "cage");
  return true;
}

const MAX_CANDIDATES = 16;

/**
 * Free, working machines a guest would consider: searched in rings of 16×16 sectors outward from the guest,
 * keeping the MAX_CANDIDATES nearest. Guests look around them, not across the whole map.
 */
function candidates(g: Game, a: Agent, type: GuestTypeDef): { o: number; appeal: number; d: number }[] {
  const gd = a.g!, { w, h } = g.state.map;
  // Look up to 3 sectors away (~50 tiles): guests don't know about machines across a huge floor.
  const sx = a.x >> 4, sy = a.y >> 4, maxR = Math.min(3, Math.max(w, h) >> 4);
  const out: { o: number; appeal: number; d: number }[] = [];
  for (let r = 0; r <= maxR; r++) {
    for (let y = sy - r; y <= sy + r; y++) for (let x = sx - r; x <= sx + r; x++) {
      if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) !== r || x < 0 || y < 0) continue;
      const list = g.slotSectors.get(y * 4096 + x);
      if (!list) continue;
      for (const o of list) {
        if (o.broken) continue;
        const m = modelOf(o.kind)!;
        const appeal = type.games[m.id] ?? 0;
        if (appeal <= 0.05 || betOf(m, 1) * WAGERS_PER_ROUND > gd.wallet || freeSeat(g, o.id) < 0) continue;
        const d = Math.abs(o.x - a.x) + Math.abs(o.y - a.y);
        // Keep the nearest few, sorted by distance (ties by id, so the order is deterministic).
        if (out.length >= MAX_CANDIDATES && d >= out[out.length - 1].d) continue;
        let k = out.length;
        while (k > 0 && (out[k - 1].d > d || (out[k - 1].d === d && out[k - 1].o > o.id))) k--;
        out.splice(k, 0, { o: o.id, appeal, d });
        if (out.length > MAX_CANDIDATES) out.pop();
      }
    }
    // Enough choice close by: stop looking farther.
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

function chooseMachine(g: Game, a: Agent, type: GuestTypeDef, r: Rng): boolean {
  const w = g.state.map.w;
  let best = -1, bestScore = -Infinity;
  for (const c of candidates(g, a, type)) {
    const t = seatTile(g, c.o, 0);
    const d = Math.abs((t % w) - a.x) + Math.abs(Math.floor(t / w) - a.y);
    const score = c.appeal * 2 + fitAt(g, type, t).score * 0.5 - d / 25 + r.next() * 0.6;
    if (score > bestScore) { bestScore = score; best = c.o; }
  }
  if (best < 0) return false;
  claim(g, a, best, freeSeat(g, best));
  go(a, seatTile(g, best, a.seat), "play");
  return true;
}

function canAffordAnything(g: Game, gd: GuestData): boolean {
  // Nothing to play at all is not a money problem.
  return g.minRound === Infinity || g.minRound <= gd.wallet + 1e-9;
}

/** Browse the floor nearby for a bit, then think again. */
function wander(g: Game, a: Agent, r: Rng) {
  let dest = nearbyTile(g, "guests", a.x, a.y, 8);
  if (dest < 0) { const pts = g.state.wanderPoints; dest = pts.length ? r.pick(pts) : a.y * g.state.map.w + a.x; }
  go(a, dest, "idle");
}

function decide(g: Game, a: Agent) {
  const gd = a.g!, type = GUEST_TYPES[gd.type], n = gd.needs;
  const r = rng(g.state, "guests");
  if (gd.why) return startLeaving(g, a, gd.why);
  if (n.fatigue >= 100) { think(g, a, "tired"); return startLeaving(g, a, "tired"); }
  if (gd.mood < 15) { think(g, a, "badTime"); return startLeaving(g, a, "unhappy"); }
  if (n.hunger >= 100) { think(g, a, "hungry"); gd.mem.unmet++; return startLeaving(g, a, "hungry"); }
  if (n.bladder >= 70) {
    if (goUse(g, a, "bladder")) return;
    if (!g.has("bladder")) {
      if (n.bladder >= 90) { think(g, a, "noRestroom"); gd.mem.unmet++; return startLeaving(g, a, "restroom"); }
    } else { think(g, a, "line"); gd.annoy += 3; return wander(g, a, r); }
  }
  if (n.thirst >= 70 || (gd.intent === "drink" && gd.mem.drinks === 0)) {
    if (goUse(g, a, "thirst")) return;
    if (!g.has("thirst")) { think(g, a, "noBar"); gd.mem.unmet++; n.thirst = 40; }
    else { think(g, a, "line"); gd.annoy += 2; n.thirst = 55; }
    gd.intent = "gamble";
  }
  if (!canAffordAnything(g, gd)) {
    if (gd.atm && gd.withdrawn < gd.withdrawCap && goUse(g, a, "cage")) return;
    think(g, a, "broke");
    return startLeaving(g, a, "broke");
  }
  if (chooseMachine(g, a, type, r)) { gd.mem.fails = 0; return; }
  if (++gd.mem.fails >= MAX_FAILS) return startLeaving(g, a, "nothing");
  if (gd.mem.fails === 1) think(g, a, "noMachine");
  gd.annoy += 6;
  wander(g, a, r);
}

/** Between rounds: keep playing, or get up (quit rule, needs, money, a broken machine). */
function quitReason(g: Game, a: Agent): string | null {
  const gd = a.g!, n = gd.needs;
  const o = g.objById.get(a.target);
  const m = o && modelOf(o.kind);
  if (!o || !m) return "gone";
  if (o.broken) { think(g, a, "broken"); gd.annoy += 10; return "broken"; }
  if (betOf(m, 1) * WAGERS_PER_ROUND > gd.wallet) return "money";
  const net = gd.mem.won - gd.mem.wagered;
  const rule = gd.quit as QuitRule;
  const control = 1 + 0.3 * gd.intox; // drink loosens the loss limit
  if (rule === "winGoal" && net >= gd.winGoal) return "done";
  if (rule === "lossLimit" && -net >= gd.lossLimit * control) return "done";
  const jackpot = o.last.win === 2 && o.last.tick === g.state.tick;
  if (jackpot) think(g, a, "bigWin");
  if (rule === "jackpot" && jackpot) return "done";
  if (n.fatigue >= 100 || n.hunger >= 100 || gd.mood < 15) return "need";
  if (n.bladder >= (g.has("bladder") ? 75 : 90)) return "need";
  if (n.thirst >= 75 && g.has("thirst")) return "need";
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
      gd.needs.thirst = 0;
      gd.mem.drinks++;
      if (!gd.sober) gd.intox++;
      if (gd.intox >= 2) gd.credits = Math.min(4, gd.credits + 1);
      const price = def.price ?? 0;
      if (price && gd.wallet >= price) { gd.wallet -= price; post(g, "bar", price); }
      if (r.chance(0.25)) litter(g, a.y * g.state.map.w + a.x);
      if (r.chance(0.3)) think(g, a, "goodDrink");
    } else if (def.serves === "bladder") {
      gd.needs.bladder = 0;
    } else if (def.serves === "cage") {
      if (gd.why) gd.mem.cashed = 1;
      else {
        const amt = Math.min(gd.withdrawCap - gd.withdrawn, Math.round(range(r, [20, gd.withdrawCap]) / 10) * 10);
        if (amt > 0) { gd.wallet += amt; gd.withdrawn += amt; think(g, a, "atm"); }
        else gd.withdrawn = gd.withdrawCap;
      }
    }
  }
  release(g, a);
  a.act = "idle";
}

function litter(g: Game, i: number) {
  const d = g.state.dirt;
  if (d[i] < DIRT_CAP) d[i]++;
}

function guestTick(g: Game, a: Agent) {
  const gd = a.g!;
  switch (a.act) {
    case "arrive":
    case "idle":
      decide(g, a);
      return;
    case "play": {
      if (a.timer === 0) {
        // Just sat down: start the session and the first round.
        const o = g.objById.get(a.target), m = o && modelOf(o.kind);
        if (!o || !m || o.broken || a.seat < 0) { release(g, a); a.act = "idle"; return; }
        o.st.sessions++;
        a.timer = roundTicks(m, gd.pace);
      } else if (a.timer === -1) {
        const why = quitReason(g, a);
        if (why) { release(g, a); a.act = "idle"; return; }
        a.timer = roundTicks(modelOf(g.objById.get(a.target)!.kind)!, gd.pace);
      }
      gd.mem.playTicks++;
      g.objById.get(a.target)!.st.playTicks++;
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
  gd.annoy = Math.max(0, Math.min(30, gd.annoy - 0.5));
  if (a.hidden) return;
  const here = a.y * g.state.map.w + a.x;
  const env = Math.max(-30, Math.min(12, fitAt(g, type, here).score * 8));
  const luck = Math.max(-15, Math.min(15, ((gd.mem.won - gd.mem.wagered) / Math.max(1, gd.bankroll)) * 25));
  let needs = 0;
  for (const v of [n.bladder, n.thirst, n.hunger, n.fatigue]) if (v > 60) needs += (v - 60) / 3;
  const drink = gd.intox > 0 && gd.intox <= 2 ? 4 : gd.intox > 3 ? -4 : 0;
  const target = 62 + env + luck - needs - gd.annoy + drink;
  gd.mood = Math.max(0, Math.min(100, gd.mood + (target - gd.mood) * 0.1));
  gd.mem.moodSum += gd.mood;
  gd.mem.moodN++;
  if (walking && r.chance(gd.mem.drinks ? 0.006 : 0.003)) litter(g, here);
  if (g.state.tick >= gd.nextThink) {
    periodicThought(g, a, type);
    gd.nextThink = g.state.tick + r.int(THINK_EVERY[0], THINK_EVERY[1]) * TICKS_PER_SECOND;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Arrivals.

const repFactor = (rep: number) => 0.3 + 1.4 * Math.pow(Math.max(0, rep) / 100, 1.3);

/** Guests per second arriving now, by type (before the random draw). */
export function arrivalRates(g: Game, guestsNow: number): Record<string, number> {
  const s = g.state, sc = SCENARIOS[s.scenario];
  const month = dateOfDay(Math.floor(s.tick / TICKS_PER_DAY)).month;
  let seats = 0;
  for (const o of s.objects) if (modelOf(o.kind)) seats++;
  const capacity = Math.min(2.5, (seats + 6) / 50);
  const room = Math.max(0, 1 - guestsNow / sc.maxGuests);
  let total = 0;
  for (const [t, w] of Object.entries(sc.population)) total += w * (GUEST_TYPES[t]?.arrival.base ?? 0);
  const out: Record<string, number> = {};
  for (const [t, w] of Object.entries(sc.population)) {
    const type = GUEST_TYPES[t];
    if (!type || !total) continue;
    out[t] = sc.arrivals * ((w * type.arrival.base) / total) * type.arrival.season[month] * repFactor(s.rep[t] ?? 50) * capacity * room;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------

const commands: CommandTable<"spawnGuests" | "clearGuests"> = {
  spawnGuests: {
    validate: (_g, c) => (c.n > 0 && c.n <= 5000 ? null : "Bad count"),
    apply(g, c) {
      const types = Object.keys(GUEST_TYPES);
      for (let k = 0; k < c.n; k++) {
        const at = randomWalkable(g, "guests");
        if (!spawnGuest(g, types[k % types.length], at)) break;
      }
    },
  },
  clearGuests: {
    validate: () => null,
    apply(g) {
      g.state.agents = g.state.agents.filter((a) => a.role !== "guest");
      rebuildBook(g);
      g.fields.updateCrowd();
    },
  },
};

export const guestSystem: System = {
  id: "guests",
  deps: ["movement", "gaming"],
  commands,
  init(g) { rebuildBook(g); },
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
    for (const a of s.agents) if (a.role === "guest") guestTick(g, a);
    const out = gone(g);
    if (out.size) { s.agents = s.agents.filter((a) => !out.has(a.id)); out.clear(); }
  },
  beat(g) {
    const s = g.state;
    const r = rng(s, "guests");
    let n = 0;
    for (const a of s.agents) if (a.role === "guest") { n++; guestBeat(g, a, r); }
    // Arrivals from the street.
    const ra = rng(s, "arrivals");
    const rates = arrivalRates(g, n);
    for (const [t, lambda] of Object.entries(rates)) {
      let l = lambda;
      while (l > 0) {
        if (ra.chance(Math.min(1, l))) {
          const ents = s.map.entrances.filter((e) => g.walkable(e));
          if (ents.length) spawnGuest(g, t, ra.pick(ents));
        }
        l -= 1;
      }
    }
  },
  day(g) {
    const s = g.state;
    s.thoughts.yday = s.thoughts.today;
    s.thoughts.today = {};
    s.visits.yday = s.visits.today;
    s.visits.today = { arrived: 0, left: 0, satSum: 0, broke: 0 };
  },
};

