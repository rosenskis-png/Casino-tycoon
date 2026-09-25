// Cheats, suspicion and enforcement (FOUNDATIONS §11, docs/spec/cheats.md). Hidden luck and cheat tags; cheats
// play honestly between spells and are caught in the act by guards in view, watched cameras, or chance; the
// suspicion tools read a guest's numbers; marked guests draw attention; enforcers (and guards, for warnings and
// bans) carry out the player's orders and the house treatment for caught cheats. Consequences grow with the
// rolling heat, witnesses, company and innocence, which surfaces later as a rumor. Enforcers and surveillance
// operators are run here.
import { GUEST_TYPES, FIRST_NAMES, type GuestTypeDef } from "../data/guests";
import { OBJECTS } from "../data/objects";
import {
  BEAT_GROUP_ANNOY, BEAT_GROUP_CALL, BEAT_GROUP_POLICE, CAMS_PER_OPERATOR, CATCH_BASE, CATCH_CAMERA, CATCH_DEALER, CATCH_GUARD, CATCH_PIT, COUNT_SPOT, PIT_SIGHT,
  CHEAT_HIT, CHEAT_X, CREW, ENF, ENF_ACTIONS, ESTIMATE_CAP, SUSPECT_Z, GUARD_SIGHT, HEAT_DECAY, HEAT_SCALE, HONEST_SECS, INNOCENT_VANISH_POLICE,
  LUCK_SHARE, LUCK_SHIFT, TAKE_MIN, MARKED, MISSING_POLICE, MISSING_SECS, RUMOR_DAYS, SPELL_SECS, TAKE, WITNESS_POLICE, WITNESS_REACH,
  WITNESS_REPORTS, ENF_REASONS, PERSONAL_DETER, CHILL_MAX, CHILL_DECAY, type EnfAction, type EnfReason,
} from "../data/cheats";
import { SCENARIOS } from "../data/scenarios";
import type { SlotModel } from "../data/games";
import type { RoomPurpose } from "../data/rooms";
import { TABLE_GAMES } from "../data/tables";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import { isClosed, type Agent, type EnfJob, type Enforcement, type GameState, type GuestData, type Person } from "./state";
import { rng, type Rng } from "./rng";
import { logNormal } from "./dist";
import { go, isWalking, nearbyTile } from "./agents";
import { canSee } from "./wayfinding";
import { companions, depart, release, sendHome, think } from "./guests";
import { person, hitReputation, removePerson } from "./pool";
import { adjustPolice } from "./incidents";
import { post } from "./finance";
import { scaled } from "./bank";
import { fmtMoney, news } from "./news";
import { TICKS_PER_DAY, TICKS_PER_SECOND } from "./clock";
import { honest, skillOf } from "./crew";

declare module "./commands" {
  interface CommandTypes {
    /** Mark a guest (bits: 1 marked, 2 alert on leaving, 4 alert on returning; 0 unmarks). */
    mark: { id: number; flags: number };
    /** Order an enforcement action on a guest. */
    enforce: { id: number; action: EnfAction; reason?: EnfReason };
    /** The house treatment for caught cheats, first offense and any later one. */
    setTreatment: { first: EnfAction; repeat: EnfAction };
  }
}

const SEC = TICKS_PER_SECOND;

export const newEnforcement = (): Enforcement => ({ policy: { first: "ban", repeat: "ban" }, heat: 0, jobs: [], rumors: [], missing: [], chill: {} });

/** A stable 0-1 number from an id and a salt (hidden tags for life, the estimate's noise). Consumes no stream. */
export function hash01(id: number, salt: number): number {
  let x = Math.imul(id ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** A person's hidden tags for life, from their id: luck shift and cheat flag. */
export function lifeTags(id: number, type: GuestTypeDef, rate = 1): { luck: number; cheat: number } {
  const u = hash01(id, 1);
  return { luck: u < LUCK_SHARE ? LUCK_SHIFT : u < 2 * LUCK_SHARE ? -LUCK_SHIFT : 0, cheat: hash01(id, 2) < type.cheat * rate ? 1 : 0 };
}

/**
 * (M12, owner) How often this guest does a behavior now, 0-1: a quarter as often once security dealt with them for
 * it (this visit, or a pool person on an earlier one), times (1 − the chill) beatings and disappearances left.
 */
export function deterOf(s: GameState, gd: GuestData, reason: EnfReason): number {
  const bit = ENF_REASONS[reason].bit;
  return (gd.dt && gd.dt & bit ? PERSONAL_DETER : 1) * (1 - (s.enf.chill[reason] ?? 0));
}

/** Name as the UI shows it ("Rosa K."), for news items. */
export function guestName(n: number): string {
  return `${FIRST_NAMES[n % FIRST_NAMES.length]} ${String.fromCharCode(65 + (Math.floor(n / FIRST_NAMES.length) % 26))}.`;
}

/**
 * A guest's hidden tags for this visit: a pool person's own (for life); a one-off guest's drawn now. A cheat
 * leading a group brings a crew. Cheats come with a take and a first spell some time after they sit down.
 */
export function tagGuest(g: Game, gd: GuestData, p: Person | null, leader: GuestData | undefined) {
  const s = g.state, r = rng(s, "cheats"), type = GUEST_TYPES[gd.type];
  if (p) { gd.luck = p.luck; gd.cheat = p.cheat; gd.mark = p.mark; }
  else {
    const u = r.next();
    gd.luck = u < LUCK_SHARE ? LUCK_SHIFT : u < 2 * LUCK_SHARE ? -LUCK_SHIFT : 0;
    gd.cheat = r.chance(leader?.cheat ? CREW : type.cheat * (SCENARIOS[s.scenario].cheatRate ?? 1)) ? 1 : 0;
  }
  if (gd.cheat) {
    // Here for the money: they stay longer, and only their take ends the visit early. (M11.1) What they're after is
    // sized to the casino: small change at a small one, serious money at a big one.
    gd.take = Math.max(TAKE_MIN, scaled(g, logNormal(r, TAKE))) * (SCENARIOS[s.scenario].cheatTake ?? 1);
    gd.floorTime = Math.round(gd.floorTime * 1.5);
    gd.spellAt = s.tick + r.int(HONEST_SECS[0], HONEST_SECS[1]) * SEC;
  }
}

// ---------------------------------------------------------------------------------------------------------
// The money: luck and cheating shift what a wager pays; the suspicion tools track what the math expected.

const stats = new Map<string, { v: number; h: number }>();
/** Variance of one wager's payout multiple on this model, and its hit frequency. */
export function payStats(m: SlotModel): { v: number; h: number } {
  // Designed slots carry their exact numbers (M8).
  if (m.stats) return m.stats;
  let st = stats.get(m.id);
  if (!st) {
    let e2 = 0, h = 0;
    for (const q of m.pays) { e2 += q.p * q.x * q.x; h += q.p; }
    stats.set(m.id, (st = { v: e2 - m.rtp * m.rtp, h }));
  }
  return st;
}

/**
 * Luck, exactly: a lucky guest's losing wager is drawn again with chance LUCK_SHIFT / (rtp × (1 − hits)), which
 * adds exactly LUCK_SHIFT to their payback; an unlucky guest's win is voided with chance LUCK_SHIFT / rtp, which
 * takes it away. Luck shows as more (or fewer) wins, like cheating does: the source of honest false positives.
 */
export const luckRedraw = (m: SlotModel) => LUCK_SHIFT / (m.rtp * (1 - payStats(m).h));
export const luckVoid = (m: SlotModel) => LUCK_SHIFT / m.rtp;

/**
 * One wager's payout multiple for this guest: the machine's draw bent by their luck, or a cheat's rigged win
 * (returned negative, so it never counts as a jackpot).
 */
export function wagerPay(g: Game, gd: GuestData, m: SlotModel, draw: (m: SlotModel, r: Rng) => number, r: Rng): number {
  if (gd.spell <= 0 && !gd.luck) return draw(m, r);
  const rc = rng(g.state, "cheats");
  if (gd.spell > 0 && rc.chance(CHEAT_HIT)) return -CHEAT_X;
  let x = draw(m, r);
  if (gd.luck > 0 && x === 0 && rc.chance(luckRedraw(m))) x = draw(m, rc);
  else if (gd.luck < 0 && x > 0 && rc.chance(luckVoid(m))) x = 0;
  return x;
}

/**
 * One wager at a shared-outcome game (roulette, craps, baccarat, keno), where the table's outcome is fixed: a
 * cheat's rigged win; a lucky player's losing hand turned into their bet's win with chance LUCK_SHIFT / ((1 −
 * hits) × win), or an unlucky player's win turned into a loss with chance LUCK_SHIFT / rtp. Both shift payback by
 * exactly LUCK_SHIFT, as at a machine.
 */
export function sharedPay(g: Game, gd: GuestData, m: SlotModel, x: number): number {
  if (gd.spell <= 0 && !gd.luck) return x;
  const rc = rng(g.state, "cheats");
  if (gd.spell > 0 && rc.chance(CHEAT_HIT)) return -CHEAT_X;
  if (gd.luck > 0 && x === 0 && rc.chance(luckConvert(m))) return m.win!;
  if (gd.luck < 0 && x > 0 && rc.chance(luckVoid(m))) return 0;
  return x;
}
export const luckConvert = (m: SlotModel) => LUCK_SHIFT / ((1 - payStats(m).h) * m.win!);

// ---------------------------------------------------------------------------------------------------------
// Runtime lookups.

const byIdOf = (g: Game) => {
  const m = new Map<number, Agent>();
  for (const a of g.state.agents) m.set(a.id, a);
  return m;
};

/** Walkable, unseated tiles of rooms with this purpose. */
export function purposeTiles(g: Game, purpose: RoomPurpose): number[] {
  const out: number[] = [], w = g.state.map.w;
  for (const room of g.rooms.rooms) {
    if (room.meta < 0 || g.state.roomMeta[room.meta]?.purpose !== purpose) continue;
    for (let y = room.y0; y <= room.y1; y++) for (let x = room.x0; x <= room.x1; x++) {
      const i = y * w + x;
      if (g.rooms.roomOf[i] === room.id && g.walkable(i) && !g.seatAt[i]) out.push(i);
    }
  }
  return out;
}

const roomPurpose = (g: Game, i: number): RoomPurpose | "" => {
  const id = g.rooms.roomOf[i], room = id >= 0 ? g.rooms.rooms[id] : undefined;
  return room && room.meta >= 0 ? g.state.roomMeta[room.meta]?.purpose ?? "" : "";
};

function nearestOf(g: Game, who: Agent, from: number, tiles: number[], taken?: Set<number>): number {
  const paths = g.pathsFor(who);
  const w = g.state.map.w, fx = from % w, fy = Math.floor(from / w);
  let best = -1, bd = Infinity;
  for (const t of tiles) {
    if (taken?.has(t)) continue;
    const d = Math.abs((t % w) - fx) + Math.abs(Math.floor(t / w) - fy);
    if (d < bd && paths.reachable(from, t)) { bd = d; best = t; }
  }
  return best;
}

const exits = (g: Game) => g.state.map.entrances.filter((e) => g.walkable(e));

/** Where a bag goes: beside a dumpster if there's one to reach, else the nearest exit. */
function dropSpot(g: Game, who: Agent, from: number): number {
  const { w, h } = g.state.map, spots: number[] = [];
  for (const o of g.state.objects) {
    if (o.kind !== "dumpster") continue;
    for (let y = o.y - 1; y <= o.y + 1; y++) for (let x = o.x - 1; x <= o.x + 2; x++)
      if (x >= 0 && y >= 0 && x < w && y < h && g.walkable(y * w + x)) spots.push(y * w + x);
  }
  const d = nearestOf(g, who, from, spots);
  return d >= 0 ? d : nearestOf(g, who, from, exits(g));
}

/**
 * Share of cameras surveillance operators at a desk are watching, 0-1: each watches CAMS_PER_OPERATOR × their
 * skill (M9). `honestOnly`: what is really watched (a crooked operator looks away); the Authorities tab shows all.
 */
export function coverage(g: Game, honestOnly = false): { cams: number; watching: number; share: number } {
  let cams = 0, watching = 0, eyes = 0;
  for (const o of g.state.objects) if (o.kind === "camera") cams++;
  for (const a of g.state.agents) if (a.role === "operator" && a.act === "watch") {
    watching++;
    if (!honestOnly || honest(a)) eyes += CAMS_PER_OPERATOR * skillOf(g, a);
  }
  return { cams, watching, share: cams ? Math.min(1, eyes / cams) : 0 };
}

// ---------------------------------------------------------------------------------------------------------
// Spells and getting caught.

const count = (s: GameState, key: string) => { const d = s.incidentDays[0]; d[key] = (d[key] ?? 0) + 1; };

function cheatBeat(g: Game, a: Agent, guards: Agent[], camShare: number) {
  const s = g.state, gd = a.g!, r = rng(s, "cheats"), w = s.map.w;
  const seated = a.act === "play" && a.seat >= 0 && a.timer !== 0;
  if (gd.spell > 0) {
    // Got up: the spell is over.
    if (!seated || gd.held) { gd.spell = 0; gd.spellAt = s.tick + r.int(HONEST_SECS[0], HONEST_SECS[1]) * SEC; return; }
    const here = a.y * w + a.x;
    let h = CATCH_BASE + CATCH_CAMERA * g.fields.get("SRVH", here) * camShare;
    for (const q of guards) if (Math.abs(q.x - a.x) + Math.abs(q.y - a.y) <= GUARD_SIGHT && canSee(g, here, q.y * w + q.x)) h += CATCH_GUARD * skillOf(g, q);
    // At a table (M7): pit bosses in view, and the table's own dealer (M9: unless the dealer is a crook).
    const o = g.objById.get(a.target);
    if (o && OBJECTS[o.kind].cat === "table") {
      const dealer = s.agents.find((q) => q.role === "dealer" && q.act === "deal" && q.target === o.id);
      h += CATCH_PIT * pitBossesWatching(g, a) + (dealer && honest(dealer) ? CATCH_DEALER * skillOf(g, dealer) : 0);
    }
    if (gd.mark & 1) h *= MARKED;
    if (r.chance(h)) return caught(g, a);
    if (--gd.spell === 0) gd.spellAt = s.tick + r.int(HONEST_SECS[0], HONEST_SECS[1]) * SEC;
    return;
  }
  if (!seated || !gd.take || gd.warned || gd.caught || gd.why || s.tick < gd.spellAt) return;
  // Poker and bingo pay out of other players' money, not the house's: cheats don't bother there.
  const o = g.objById.get(a.target), fam = o && OBJECTS[o.kind].game;
  if (fam && TABLE_GAMES[fam].pool) return;
  // (M12, owner) Warned before, or word of what happens to cheats here: they may lose their nerve for the night.
  const d = deterOf(s, gd, "cheat");
  if (d < 1 && !r.chance(d)) { gd.take = 0; return; }
  gd.spell = r.int(SPELL_SECS[0], SPELL_SECS[1]);
}

/** Honest pit bosses on the floor with this guest in view (within PIT_SIGHT tiles), each weighed by skill (M9). */
export function pitBossesWatching(g: Game, a: Agent): number {
  const w = g.state.map.w, here = a.y * w + a.x;
  let n = 0;
  for (const q of g.state.agents) {
    if (q.role !== "pitboss" || !honest(q) || Math.abs(q.x - a.x) + Math.abs(q.y - a.y) > PIT_SIGHT) continue;
    if (canSee(g, here, q.y * w + q.x)) n += skillOf(g, q);
  }
  return n;
}

/** A card counter at blackjack in a pit boss's view may get noticed: marked, and the player told. */
function counterBeat(g: Game, a: Agent) {
  const gd = a.g!;
  if (gd.mark & 1 || a.act !== "play" || a.seat < 0) return;
  const o = g.objById.get(a.target);
  if (!o || OBJECTS[o.kind].game !== "blackjack") return;
  const n = pitBossesWatching(g, a);
  if (!n || !rng(g.state, "cheats").chance(1 - Math.pow(1 - COUNT_SPOT, n))) return;
  gd.mark |= 1;
  const p = gd.pid >= 0 ? person(g, gd.pid) : undefined;
  if (p) p.mark |= 1;
  news(g, "warn", `Your pit boss thinks ${guestName(gd.name)} is counting cards at ${OBJECTS[o.kind].name}. Marked.`, { a: a.id });
}

/** Caught in the act: certain, on the ticker, the winnings recovered, and the house treatment follows. */
function caught(g: Game, a: Agent) {
  const s = g.state, gd = a.g!;
  const o = g.objById.get(a.target);
  gd.spell = 0;
  gd.take = 0;
  gd.caught = 1;
  const p = gd.pid >= 0 ? person(g, gd.pid) : undefined;
  const offense = p ? ++p.caught : 1;
  const up = Math.min(gd.wallet, Math.max(0, gd.mem.won - gd.mem.wagered));
  if (up > 0) { gd.wallet -= up; post(g, "recovered", up); }
  count(s, "_caught");
  g.bus.emit({ type: "sound", id: "caught", x: a.x, y: a.y });
  news(g, "bad", `Caught cheating: ${guestName(gd.name)}${o ? ` at ${OBJECTS[o.kind].name}` : ""}${up > 0 ? `; ${fmtMoney(up)} recovered` : ""}.`, { a: a.id });
  const action = offense > 1 ? s.enf.policy.repeat : s.enf.policy.first;
  order(g, a, action, 1, "cheat");
}

// ---------------------------------------------------------------------------------------------------------
// Enforcement jobs.

/** Stops a guest where they stand to wait for staff. */
function hold(g: Game, a: Agent, job: number) {
  release(g, a);
  const gd = a.g!;
  gd.held = job;
  gd.spell = 0;
  a.act = "held";
  a.timer = 0;
  a.nx = a.x; a.ny = a.y; a.t = 0;
  a.dest = a.y * g.state.map.w + a.x;
}

function unhold(a: Agent) {
  if (!a.g) return;
  a.g.held = 0;
  if (a.act === "held" || a.act === "walk") { a.act = "idle"; a.timer = 0; }
}

// (M11.2, owner) One security role does it all: enforcers merged into security.
const enforcers = (g: Game) => g.state.agents.filter((a) => a.role === "guard");
const guardsOf = enforcers;

/** Queues an action on a guest (the player's order, or the house treatment) and holds them. */
function order(g: Game, a: Agent, action: EnfAction, house: number, reason: EnfReason) {
  const s = g.state;
  // With no security at all, a beating or disappearance becomes a ban.
  if (ENF[action].enforcer && !enforcers(g).length) action = "ban";
  if (!enforcers(g).length && !guardsOf(g).length) {
    // Nobody to carry anything out: a caught cheat is banned and shown out on the spot.
    if (house) { banGroup(g, a); sendHome(g, a, "banned"); }
    return;
  }
  const job: EnfJob = { id: s.nextId++, guest: a.id, action, reason, house, staff: -1, stage: 0, tile: -1, at: -1 };
  s.enf.jobs.push(job);
  hold(g, a, job.id);
}

/** Security staff free to take a job. */
function free(g: Game, _job: EnfJob): Agent[] {
  const busy = new Set(g.state.enf.jobs.map((j) => j.staff));
  return g.state.agents.filter((a) => {
    if (busy.has(a.id)) return false;
    if (a.role === "guard") return a.act === "wander" || a.act === "idle" || (a.act === "walk" && a.next === "idle");
    return false;
  });
}

function assignJobs(g: Game, byId: Map<number, Agent>) {
  const w = g.state.map.w;
  for (const job of g.state.enf.jobs) {
    if (job.stage !== 0) continue;
    const t = byId.get(job.guest);
    if (!t) continue;
    if (!enforcers(g).length) {
      if (ENF[job.action].enforcer) job.action = "ban";
      if (!guardsOf(g).length) { finish(g, job, t, null); if (job.house) { banGroup(g, t); sendHome(g, t, "banned"); } continue; }
    }
    let best: Agent | null = null, bd = Infinity;
    for (const q of free(g, job)) {
      const d = Math.abs(q.x - t.x) + Math.abs(q.y - t.y);
      if (d < bd && g.pathsFor(q).reachable(q.y * w + q.x, t.y * w + t.x)) { bd = d; best = q; }
    }
    if (!best) continue;
    job.staff = best.id;
    job.stage = 1;
    best.target = job.id;
    best.bag = undefined;
    go(best, t.y * w + t.x, "enforce");
  }
}

/** Job over (done or called off): the guest is let go, the staff member is free again. */
function finish(g: Game, job: EnfJob, t: Agent | undefined | null, st: Agent | undefined | null) {
  const s = g.state;
  s.enf.jobs.splice(s.enf.jobs.indexOf(job), 1);
  if (t?.g && t.g.held === job.id) unhold(t);
  if (st && st.act !== "carry" && !(isWalking(st) && st.next === "carry")) { st.act = "idle"; st.target = -1; st.timer = 0; }
}

const onTheWay = (a: Agent) => a.act === "enforce" || (isWalking(a) && a.next === "enforce");

function jobTick(g: Game, job: EnfJob, byId: Map<number, Agent>) {
  const s = g.state, w = s.map.w;
  const t = byId.get(job.guest);
  if (!t?.g || t.g.held !== job.id || isClosed(s)) return finish(g, job, t, byId.get(job.staff));
  // A held guest who got knocked off their walk (no route) just stands and waits.
  if (t.act !== "held" && !(isWalking(t) && t.next === "held")) { t.act = "held"; t.timer = 0; }
  if (job.stage === 0) return;
  const st = byId.get(job.staff);
  if (!st || !onTheWay(st)) {
    // Fired, or pulled off the way there: somebody else takes it from here.
    if (st) { st.target = -1; if (st.act === "enforce") st.act = "idle"; }
    job.staff = -1;
    job.stage = 0;
    if (isWalking(t)) { t.act = "held"; t.nx = t.x; t.ny = t.y; t.t = 0; }
    return;
  }
  const here = t.y * w + t.x;
  if (job.stage === 1) {
    if (isWalking(st)) return;
    if (Math.abs(st.x - t.x) + Math.abs(st.y - t.y) > 1) { go(st, here, "enforce"); return; }
    if (job.action === "warn") { job.stage = 3; job.at = s.tick; return; }
    const out = job.action === "ban" || job.action === "kick";
    const dest = out ? nearestOf(g, t, here, exits(g)) : nearestOf(g, t, here, purposeTiles(g, "enforcement"));
    if (dest < 0 || dest === here) { job.stage = 3; job.at = s.tick; job.tile = dest; act(g, job, t); return; }
    job.tile = dest;
    job.stage = 2;
    go(t, dest, "held");
    // The enforcer walks them there and stands beside them.
    const nb = [dest - 1, dest + 1, dest - w, dest + w].filter((i) => i >= 0 && i < w * s.map.h && g.walkable(i) && g.rooms.roomOf[i] === g.rooms.roomOf[dest]);
    go(st, nb.length ? nb[0] : dest, "enforce");
    if (out) witnessed(g, t, job.action);
    return;
  }
  if (job.stage === 2) {
    if (isWalking(t) || isWalking(st)) return;
    if (job.action === "ban" || job.action === "kick") {
      consequences(g, job, t, false);
      if (job.action === "ban") banGroup(g, t);
      else kickOut(g, t);
      finish(g, job, t, st);
      t.g.why = job.action === "ban" ? "banned" : "ejected";
      t.act = "leave";
      return;
    }
    job.stage = 3;
    job.at = s.tick;
    act(g, job, t);
    return;
  }
  // Stage 3: doing it.
  if (s.tick - job.at < ENF[job.action].secs * SEC) return;
  carryOut(g, job, t, st);
}

/** (M12) Did they really do what they're being dealt with for? The sim knows. */
function guilty(gd: GuestData, reason: EnfReason): boolean {
  switch (reason) {
    case "cheat": return !!gd.cheat;
    case "count": return !!gd.counter;
    case "intox": return gd.mem.peak >= 0.5;
    case "none": return false;
    default: return !!((gd.did ?? 0) & ENF_REASONS[reason].bit);
  }
}

/** (M12) The scenario's discount on the rough end (The Outfit's town looks away): heat, base police cost, rumors and the crowd's reputation. */
const roughMult = (g: Game, action: EnfAction) => (ENF[action].enforcer ? SCENARIOS[g.state.scenario].violence ?? 1 : 1);

/**
 * What any action costs: heat, the base police cost, witnesses (unless already counted), and a rumor if innocent.
 * (M12, owner) And what it teaches: warnings, kicks and bans make this guest (and the pool person) do the behavior
 * less; beatings and disappearances chill it for everyone for a while, and cost the target's crowd reputation,
 * guilty or not.
 */
function consequences(g: Game, job: EnfJob, t: Agent, witnesses: boolean): number {
  const s = g.state, gd = t.g!, def = ENF[job.action], rough = roughMult(g, job.action);
  const mult = heat(g, job.action);
  if (witnesses) witnessed(g, t, job.action);
  const reason = job.reason ?? "cheat";
  if (!guilty(gd, reason)) rumor(g, t, job.action, reason, mult * rough);
  if (def.police) adjustPolice(g, -def.police * mult * rough);
  const bit = ENF_REASONS[reason].bit;
  if (bit) {
    gd.dt = (gd.dt ?? 0) | bit;
    const p = gd.pid >= 0 ? person(g, gd.pid) : undefined;
    if (p) p.dt = (p.dt ?? 0) | bit;
    if (def.chill) s.enf.chill[reason] = Math.min(CHILL_MAX, (s.enf.chill[reason] ?? 0) + def.chill);
  }
  if (def.rep) hitReputation(g, gd.type, def.rep * GUEST_TYPES[gd.type].repSensitivity * mult * rough);
  count(s, "_enf");
  return mult;
}

/** (M12) Shown out for tonight (no ban): the visit is over, their group minds, and a pool person remembers. */
function kickOut(g: Game, t: Agent) {
  const gd = t.g!;
  gd.mem.ejected = 1;
  const p = gd.pid >= 0 ? person(g, gd.pid) : undefined;
  if (p) p.ejects++;
  think(g, t, "ejected");
  for (const m of companions(g, t)) {
    m.g!.annoy = Math.min(30, m.g!.annoy + 8 * GUEST_TYPES[m.g!.type].policed);
    think(g, m, "friendEjected");
  }
  count(g.state, "_ejected");
}

/** It starts: the sound of it (the animation is the renderer's, from the job's stage and start tick). */
function act(g: Game, job: EnfJob, t: Agent) {
  if (job.action === "beat" || job.action === "vanish") g.bus.emit({ type: "sound", id: job.action === "beat" ? "punch" : "shot", x: t.x, y: t.y });
}

function carryOut(g: Game, job: EnfJob, t: Agent, st: Agent) {
  const gd = t.g!, s = g.state, w = s.map.w;
  const heatNow = consequences(g, job, t, true);
  switch (job.action) {
    case "warn": {
      const type = GUEST_TYPES[gd.type];
      gd.warned++;
      // (M12) A warning is about something: the cheat stops cheating, the drunk stops drinking, the counter counting.
      const reason = job.reason ?? "cheat";
      if (reason === "cheat") gd.take = 0;
      if (reason === "intox") gd.intend = Math.min(gd.intend, gd.intox);
      if (reason === "count") gd.counter = 0;
      gd.annoy = Math.min(30, gd.annoy + 8 * type.policed);
      think(g, t, "warned");
      for (const m of companions(g, t)) m.g!.annoy = Math.min(30, m.g!.annoy + 3 * GUEST_TYPES[m.g!.type].policed);
      return finish(g, job, t, st);
    }
    case "ban":
      banGroup(g, t);
      finish(g, job, t, st);
      return sendHome(g, t, "banned");
    case "kick":
      kickOut(g, t);
      finish(g, job, t, st);
      return sendHome(g, t, "ejected");
    case "beat": {
      gd.hurt = 1;
      gd.take = 0;
      t.steps = Math.min(40, t.steps * 2);
      think(g, t, "beaten");
      const r = rng(s, "cheats");
      const mates = companions(g, t);
      for (const m of mates) {
        m.g!.annoy = Math.min(30, m.g!.annoy + BEAT_GROUP_ANNOY);
        think(g, m, "friendBeaten");
        if (!m.g!.why) sendHome(g, m, "friendBeaten");
      }
      if (mates.length && r.chance(BEAT_GROUP_CALL)) {
        adjustPolice(g, -BEAT_GROUP_POLICE * heatNow);
        news(g, "bad", "A guest's friends called the police: they say your staff beat them up.", { tab: "authorities" });
      }
      finish(g, job, t, st);
      return sendHome(g, t, "beaten");
    }
    case "vanish": {
      const mates = companions(g, t);
      for (const m of mates) { m.g!.annoy = Math.min(30, m.g!.annoy + BEAT_GROUP_ANNOY); think(g, m, "whereFriend"); }
      if (mates.length) s.enf.missing.push({ at: s.tick + MISSING_SECS * SEC, name: gd.name });
      if (gd.pid >= 0) removePerson(g, gd.pid);
      gd.pid = -1;
      s.enf.jobs.splice(s.enf.jobs.indexOf(job), 1);
      gd.held = 0;
      gd.why = "vanished";
      t.act = "idle";
      depart(g, t, true);
      // Over the shoulder and out to the dumpster.
      st.bag = 1;
      st.target = -1;
      const to = dropSpot(g, st, st.y * w + st.x);
      if (to >= 0 && to !== st.y * w + st.x) go(st, to, "carry");
      else { st.bag = undefined; st.act = "idle"; }
      return;
    }
  }
}

/** The rolling heat, after adding this action: every cost is multiplied by the returned factor. */
function heat(g: Game, action: EnfAction): number {
  const e = g.state.enf;
  e.heat += ENF[action].heat * roughMult(g, action);
  return 1 + e.heat / HEAT_SCALE;
}

/** Everyone who saw it minds; some tell the police. */
function witnessed(g: Game, t: Agent, action: EnfAction) {
  const def = ENF[action], s = g.state, w = s.map.w, r = rng(s, "cheats");
  if (!def.witness) return;
  const here = t.y * w + t.x, group = t.g!.group, mult = 1 + s.enf.heat / HEAT_SCALE;
  const thought = action === "ban" || action === "kick" ? "sawBan" : action === "beat" ? "sawBeating" : "sawVanish";
  let told = 0;
  for (const b of s.agents) {
    const bd = b.g;
    if (!bd || b === t || bd.group === group || bd.held || b.hidden) continue;
    if (Math.abs(b.x - t.x) + Math.abs(b.y - t.y) > WITNESS_REACH || !canSee(g, b.y * w + b.x, here)) continue;
    bd.annoy = Math.min(30, bd.annoy + def.witness);
    if (r.chance(0.5)) think(g, b, thought);
    if (told < WITNESS_REPORTS && def.tell && r.chance(def.tell * (1 - GUEST_TYPES[bd.type].drama))) {
      if (!told) news(g, "warn", `A guest told the police what they saw your ${action === "beat" ? "security do to someone" : "security take someone away"}.`, { t: here });
      told++;
      adjustPolice(g, -WITNESS_POLICE * mult);
    }
  }
}

const RUMOR_TEXT: Record<EnfAction, string> = {
  warn: "Word is the guest your staff warned for {why} never did anything of the sort.",
  kick: "Word is the guest your security threw out for {why} hadn't done a thing.",
  ban: "Word is the guest you banned for life for {why} was innocent.",
  beat: "Rumor: the guest your security beat up for {why} hadn't done it. People are talking.",
  vanish: "Rumor: a guest who vanished from the casino had done nothing wrong. People are scared.",
};
const NO_REASON: Record<EnfAction, string> = {
  warn: "Word is your staff go around warning guests for no reason at all.",
  kick: "Word is your security throws people out for no reason at all.",
  ban: "Word is you ban people for life for no reason at all.",
  beat: "Rumor: your security beat a guest up for no reason. People are talking.",
  vanish: "Rumor: a guest vanished from the casino for no reason anyone knows. People are scared.",
};
/** What the ticker calls each reason in a rumor. */
const WHY_WORD: Record<EnfReason, string> = { cheat: "cheating", count: "counting cards", intox: "being drunk", disorder: "causing trouble", misconduct: "misconduct", vice: "vice", drugs: "drugs", none: "" };

/** The target was innocent: word gets around in a few days. */
function rumor(g: Game, t: Agent, action: EnfAction, reason: EnfReason, mult: number) {
  const s = g.state, r = rng(s, "cheats"), type = GUEST_TYPES[t.g!.type];
  s.enf.rumors.push({
    at: s.tick + r.int(RUMOR_DAYS[0], RUMOR_DAYS[1]) * TICKS_PER_DAY, type: t.g!.type,
    rep: ENF[action].rumorRep * type.repSensitivity * mult, police: action === "vanish" ? INNOCENT_VANISH_POLICE * mult : 0,
    text: reason === "none" ? NO_REASON[action] : RUMOR_TEXT[action].replace("{why}", WHY_WORD[reason]),
  });
}

/** Banned for life with their whole group: the leader's person (and their own) is turned away from now on. */
function banGroup(g: Game, t: Agent) {
  const all = [t, ...companions(g, t)];
  for (const m of all) {
    const md = m.g!;
    md.mem.banned = 1;
    md.mem.ejected = 1;
    if (md.pid >= 0) { const p = person(g, md.pid); if (p) p.ban = 1; }
    if (m !== t) { think(g, m, "friendEjected"); if (!md.held) sendHome(g, m, "banned"); }
  }
  think(g, t, "banned");
  count(g.state, "_banned");
}

// ---------------------------------------------------------------------------------------------------------
// Enforcers and surveillance operators.

function pauseThenGo(g: Game, a: Agent, tiles: number[]) {
  const s = g.state, r = rng(s, "cheats");
  if (s.tick < (a.due ?? 0)) return;
  a.due = s.tick + r.int(6, 15) * SEC;
  const w = s.map.w;
  const t = tiles.length ? tiles[r.int(0, tiles.length - 1)] : nearbyTile(g, "cheats", a.x, a.y, 10, a);
  if (t >= 0 && t !== a.y * w + a.x && g.pathsFor(a).reachable(a.y * w + a.x, t)) go(a, t, "idle");
}

function operatorTick(g: Game, a: Agent) {
  const w = g.state.map.w;
  if (a.act === "watch") {
    // The office was walled over or given another purpose: find another desk.
    if (roomPurpose(g, a.y * w + a.x) !== "office") a.act = "idle";
    return;
  }
  if (isWalking(a) || g.state.tick < (a.due ?? 0)) return;
  const desks = purposeTiles(g, "office");
  if (desks.length) {
    const taken = new Set<number>();
    for (const b of g.state.agents) if (b !== a && b.role === "operator") taken.add(b.act === "watch" ? b.y * w + b.x : b.dest);
    const t = nearestOf(g, a, a.y * w + a.x, desks, taken);
    if (t >= 0) { if (t === a.y * w + a.x) a.act = "watch"; else go(a, t, "watch"); return; }
  }
  // No desk to be had: wander a while and look again.
  a.act = "idle";
  pauseThenGo(g, a, []);
}

// ---------------------------------------------------------------------------------------------------------
// The suspicion tools (docs/spec/cheats.md): what the guest card shows, tier by tier.

export interface Suspicion {
  floorSecs: number;
  machineSecs: number;
  net: number;
  /** What the machines' math expected their result to be by now (usually negative). */
  expected: number;
  reading: string;
  wallet: number;
  brought: number;
  trips: number;
  drawn: number;
  /** Estimated probability they are cheating, 0-1. */
  estimate: number;
}

const t3 = (z: number) => 1 / ((1 + (z * z) / 3) ** 2);
const normal = (z: number) => Math.exp(-0.5 * z * z);

/**
 * How far above the machines' math a guest is, in standard deviations: mostly how often they win (rigged wins and
 * luck both show there), plus half of how much (jackpots show only there).
 */
export function oddness(gd: GuestData): { score: number; money: number; luck: number } {
  const m = gd.mem;
  if (!m.wagered) return { score: 0, money: 0, luck: 0 };
  const sh = Math.sqrt(Math.max(1e-9, m.hvar));
  const money = (m.won - m.ev) / Math.sqrt(Math.max(1e-9, m.v));
  const hits = (m.hits - m.hexp) / sh;
  // Where a lucky (or unlucky) guest's hits would sit.
  const luck = ((LUCK_SHIFT / 0.9) * m.hexp) / sh;
  return { score: hits + 0.5 * Math.max(0, money), money, luck };
}

export function suspicion(g: Game, a: Agent): Suspicion {
  const s = g.state, gd = a.g!, m = gd.mem;
  const net = m.won - m.wagered;
  const { score: z, money: zm, luck: mu } = oddness(gd);
  const reading = !m.wagered ? "hasn't played yet" : zm > 4 ? "far above expectation" : zm > 2.5 ? "well above expectation" : zm > 1.2 ? "above expectation"
    : zm < -2.5 ? "well below expectation" : zm < -1.2 ? "below expectation" : "about as expected";
  // Honest players: mostly the plain math, a few lucky or unlucky, and a broad tail (hot streaks, jackpots). Cheats: well
  // above, or no different yet (they play honestly between spells).
  const honest = 0.89 * normal(z) + 0.03 * normal(z - mu) + 0.03 * normal(z + mu) + (0.05 * t3(z / 2)) / 2;
  const cheat = 0.4 * honest + 0.6 * (t3((z - SUSPECT_Z) / 3) / 3);
  const prior = GUEST_TYPES[gd.type].cheat;
  // Noise that drifts every 30 seconds: no tool is certain.
  const noise = Math.exp(0.9 * (2 * hash01(a.id, Math.floor(s.tick / (30 * SEC))) - 1));
  const odds = (prior / (1 - prior)) * (cheat / Math.max(1e-300, honest)) * noise;
  const estimate = gd.caught ? 1 : Math.min(ESTIMATE_CAP, odds / (1 + odds));
  return {
    floorSecs: (s.tick - m.arrived) / SEC, machineSecs: a.act === "play" ? (s.tick - m.sitAt) / SEC : 0,
    net, expected: m.ev - m.wagered, reading, wallet: gd.wallet, brought: gd.bankroll, trips: gd.trips, drawn: gd.withdrawn, estimate,
  };
}

// ---------------------------------------------------------------------------------------------------------

const validAction = (x: string): x is EnfAction => (ENF_ACTIONS as string[]).includes(x);
const guestById = (g: Game, id: number) => g.state.agents.find((a) => a.id === id && a.role === "guest");

const commands: CommandTable<"mark" | "enforce" | "setTreatment"> = {
  mark: {
    validate: (g, c) => (!guestById(g, c.id) ? "They've left" : !(Number.isInteger(c.flags) && c.flags >= 0 && c.flags <= 7) ? "Bad mark" : null),
    apply(g, c) {
      const a = guestById(g, c.id)!, gd = a.g!;
      // Alerts only make sense on a marked guest.
      gd.mark = c.flags & 1 ? c.flags : 0;
      if (gd.pid >= 0) { const p = person(g, gd.pid); if (p) p.mark = gd.mark; }
    },
  },
  enforce: {
    validate(g, c) {
      const a = guestById(g, c.id);
      if (!a) return "They've left";
      if (!validAction(c.action)) return "Unknown action";
      if (c.reason !== undefined && !(c.reason in ENF_REASONS)) return "Unknown reason";
      if (a.g!.held) return "Already being dealt with";
      if (a.act === "out" || a.act === "fight" || a.act === "leave") return "Not now";
      if (ENF[c.action].enforcer && !enforcers(g).length) return "Hire an enforcer first";
      if (!enforcers(g).length && !guardsOf(g).length) return "Hire an enforcer or a guard first";
      return null;
    },
    apply(g, c) { order(g, guestById(g, c.id)!, c.action, 0, c.reason ?? "cheat"); },
  },
  setTreatment: {
    validate: (_g, c) => (validAction(c.first) && validAction(c.repeat) ? null : "Unknown action"),
    apply(g, c) { g.state.enf.policy = { first: c.first, repeat: c.repeat }; },
  },
};

export const cheatSystem: System = {
  id: "cheats",
  deps: ["incidents"],
  commands,
  tick(g) {
    const s = g.state;
    for (const a of s.agents) {
      if (a.role === "guard" && a.act === "carry") { a.bag = undefined; a.act = "idle"; }
      else if (a.role === "operator") operatorTick(g, a);
    }
    if (s.enf.jobs.length) {
      const byId = byIdOf(g);
      for (const job of [...s.enf.jobs]) jobTick(g, job, byId);
    }
  },
  beat(g) {
    const s = g.state;
    let guards: Agent[] | null = null, share = -1;
    let pits = -1;
    for (const a of s.agents) {
      const gd = a.g;
      if (gd?.counter) {
        if (pits < 0) pits = s.agents.some((q) => q.role === "pitboss") ? 1 : 0;
        if (pits) counterBeat(g, a);
      }
      if (!gd?.cheat || (!gd.spell && !gd.take)) continue;
      guards ??= s.agents.filter((q) => q.role === "guard" && q.act !== "enforce" && honest(q));
      if (share < 0) share = coverage(g, true).share;
      cheatBeat(g, a, guards, share);
    }
    if (s.enf.jobs.some((j) => j.stage === 0)) assignJobs(g, byIdOf(g));
    // Missing-person reports come in after the group has looked for a while.
    while (s.enf.missing.length && s.enf.missing[0].at <= s.tick) {
      const m = s.enf.missing.shift()!;
      adjustPolice(g, -MISSING_POLICE * (1 + s.enf.heat / HEAT_SCALE));
      news(g, "bad", `A group reported their friend ${guestName(m.name)} missing after a night at the casino.`, { tab: "authorities" });
    }
  },
  day(g) {
    const s = g.state, e = s.enf;
    e.heat *= HEAT_DECAY;
    if (e.heat < 0.01) e.heat = 0;
    for (const k of Object.keys(e.chill)) { e.chill[k] *= CHILL_DECAY; if (e.chill[k] < 0.01) delete e.chill[k]; }
    const due = e.rumors.filter((q) => q.at <= s.tick);
    if (!due.length) return;
    e.rumors = e.rumors.filter((q) => q.at > s.tick);
    for (const q of due) {
      news(g, "warn", q.text, { tab: "authorities" });
      hitReputation(g, q.type, q.rep);
      if (q.police) adjustPolice(g, -q.police);
    }
  },
  layout(g) {
    // An operator's desk or a job's destination may have been walled over: rethink.
    for (const a of g.state.agents) if (a.role === "operator" && a.act === "watch" && !g.walkable(a.y * g.state.map.w + a.x)) a.act = "idle";
  },
};

