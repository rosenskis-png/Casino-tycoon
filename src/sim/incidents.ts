// Incidents, house rules, security and the police (FOUNDATIONS §10, §13; docs/spec/incidents.md). Incidents
// start from causes the player can see (drink, mood, losses, a full bladder and no restroom), witnesses react by
// their type's tolerance, low-drama witnesses report them, and security guards step in by the house rules.
// Reports nobody answers pile up per guest; a guest with several unanswered reports calls the police, whose
// standing drives the escalation ladder (warning, fines, inspections, a raid and closure, losing the license).
// Guards, officers and paramedics are run here, not by sim/staff.ts.
import { GUEST_TYPES } from "../data/guests";
import { INCIDENTS, INCIDENT_CATS, type IncidentDef } from "../data/incidents";
import { ENF_REASONS, type EnfReason } from "../data/cheats";
import { OBJECTS } from "../data/objects";
import { SCENARIOS } from "../data/scenarios";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Agent, GameState, HouseRules, Incident } from "./state";
import { rng, type Rng } from "./rng";
import { go, isWalking } from "./agents";
import { spreadPoint, spreadTile } from "./staff";
import { canSee } from "./wayfinding";
import { companions, depart, release, sendHome, think, THOUGHT_DAYS } from "./guests";
import { cutoff, handsFull, serveDrink, DRINK_PRICE } from "./drinks";
import { post } from "./finance";
import { scaled } from "./bank";
import { inZone, skillOf } from "./crew";
import { fmtMoney, newsFor } from "./news";
import { deterOf } from "./cheats";
import { TICKS_PER_BEAT, TICKS_PER_DAY, TICKS_PER_SECOND } from "./clock";
const news = newsFor("incidents");

declare module "./commands" {
  interface CommandTypes {
    /** House rule for one policed incident category: 0 ignore … 3 strict. */
    setRule: { cat: keyof HouseRules; level: number };
  }
}

const SEC = TICKS_PER_SECOND;
/** Seconds after starting an incident before the same guest starts another. */
const COOLDOWN = 20;
/** Unanswered reports after which a guest calls the police (owner: "multiple"; docs/spec/incidents.md). */
export const CALL_AFTER = 3;
/** Base chance a witness reports a reportable incident, times (1 - drama)². */
const REPORT = 0.06;
/** Seconds a passed-out guest lies there with no guard coming before someone calls the paramedics. */
const PASSOUT_WAIT = 45;
/** How far a guard will go for an incident (tiles, Manhattan). */
const GUARD_REACH = 60;
/** A guard in view within this many tiles makes trouble less likely (×DETER_BY). */
const DETER = 6;
const DETER_BY = 0.4;
/** Extra seconds an incident lasts while a guard is on the way. */
const WAIT_FOR_GUARD = 30;
/** Seconds a guard spends dealing with an incident; a paramedic with a patient. */
const RESOLVE_SECS = 3;
const TREAT_SECS = 4;
/** Intoxication at which a strict drunkenness rule has a guard show the guest out. */
const WASTED = 0.8;
/** Police standing: what each thing costs, the recovery per day, the ladder, fines and closures. */
const COST_CALL = 6, COST_MEDIC = 5, COST_FIGHT = 3;
/** (M11) Standing comes back faster (was 0.2 a day), and the ladder climbs at most one step a week. */
const RECOVER_PER_DAY = 0.5;
export const STEP_GAP_DAYS = 7;
/** Standing below which each step of the ladder is reached; a step is left again 5 points above it. */
export const LADDER = [60, 45, 30, 15];
export const LADDER_NAMES = ["Good standing", "Warned", "Fined", "Under inspection", "Raided"];
// Fines are for a casino winning $10K a month; M11.1 sizes them to this one (sim/bank.ts `scaled`).
const FINE_STAGE = 500, FINE_CALL = 400, FINE_SEEN = 100, FINE_RAID = 1500, MEDIC_COST = 200;
const CLOSE_DAYS = 3, REVOKE_DAYS = 30, RAID_EVERY_DAYS = 30, INSPECT_EVERY_DAYS = 4;
const OFFICER_SECS = 90;

export const DEFAULT_RULES: HouseRules = { intox: 2, disorder: 2, misconduct: 2, vice: 2, drugs: 2 };
export const newAuthorities = (): GameState["auth"] => ({
  police: { standing: 75, stage: 0, calls: 0, raidAt: -1e9, inspectAt: -1, stepAt: -1e9 },
  regulator: { standing: 100, stage: 0, stepAt: -1e9 },
  bribed: 0, closedUntil: -1, revoked: 0,
});

// ---------------------------------------------------------------------------------------------------------
// Runtime: who stands where, rebuilt each beat (never saved).

export interface Grid { head: Int32Array; next: Int32Array; list: Agent[]; byId: Map<number, Agent> }

export function buildGrid(g: Game): Grid {
  const { w, h } = g.state.map, list = g.state.agents;
  const head = new Int32Array(w * h).fill(-1), next = new Int32Array(list.length), byId = new Map<number, Agent>();
  for (let k = 0; k < list.length; k++) {
    const a = list[k], i = a.y * w + a.x;
    next[k] = head[i];
    head[i] = k;
    byId.set(a.id, a);
  }
  return { head, next, list, byId };
}

/** Every agent within r tiles (square) of (x, y). */
function near(g: Game, grid: Grid, x: number, y: number, r: number, fn: (b: Agent, d: number) => void) {
  const { w, h } = g.state.map;
  for (let Y = Math.max(0, y - r); Y <= Math.min(h - 1, y + r); Y++)
    for (let X = Math.max(0, x - r); X <= Math.min(w - 1, x + r); X++)
      for (let k = grid.head[Y * w + X]; k >= 0; k = grid.next[k]) fn(grid.list[k], Math.max(Math.abs(X - x), Math.abs(Y - y)));
}

const busy = (b: Agent) => b.act === "out" || b.act === "fight" || b.hidden === 1 || !!b.g?.held;

/** Nearest other guest within r tiles, not in a's group, free to get into something. */
function partner(g: Game, grid: Grid, a: Agent, r: number, ok: (b: Agent) => boolean = () => true): Agent | null {
  let best: Agent | null = null, bd = Infinity;
  near(g, grid, a.x, a.y, r, (b, d) => {
    if (b === a || !b.g || b.g.group === a.g!.group || busy(b) || b.g.why || d >= bd || !ok(b)) return;
    best = b; bd = d;
  });
  return best;
}

function roomLabel(g: Game, tile: number): string {
  const id = g.rooms.roomOf[tile], room = id >= 0 ? g.rooms.rooms[id] : undefined;
  const name = room && room.meta >= 0 ? g.state.roomMeta[room.meta]?.name : "";
  return name ? ` in ${name}` : "";
}

const count = (s: GameState, key: string) => { const d = s.incidentDays[0]; d[key] = (d[key] ?? 0) + 1; };

// ---------------------------------------------------------------------------------------------------------
// Starting an incident: the scene, the mess, and everyone who sees or hears it.

export function begin(g: Game, grid: Grid, kind: string, a: Agent, other: Agent | null): Incident {
  const s = g.state, def = INCIDENTS[kind], w = s.map.w, r = rng(s, "incidents");
  const inc: Incident = {
    id: s.nextId++, kind, tile: a.y * w + a.x, actor: a.id, other: other?.id ?? -1, start: s.tick,
    end: def.secs ? s.tick + def.secs * SEC : -1, guard: -1, handled: 0, reporters: [], medic: 0, seen: 0,
  };
  s.incidents.push(inc);
  // An escort (M9.6) can start one too: they aren't guests.
  if (a.g) a.g.incAt = s.tick + COOLDOWN * SEC;
  if (other?.g) other.g.incAt = s.tick + COOLDOWN * SEC;
  // (M12) Who really did something security could deal them for (an escort's pitch is the escort's doing, not the mark's).
  const bit = def.cat in ENF_REASONS ? ENF_REASONS[def.cat as EnfReason].bit : 0;
  if (bit) {
    if (a.g) a.g.did = (a.g.did ?? 0) | bit;
    if (other?.g && a.role !== "escort") other.g.did = (other.g.did ?? 0) | bit;
  }
  if (def.hidden) return inc;
  count(s, kind);
  if (def.mess) s.dirt[inc.tile] = Math.max(s.dirt[inc.tile], def.mess);
  if (def.thought && a.g && r.chance(0.6)) think(g, a, def.thought);
  if (kind === "fight") adjustPolice(g, -COST_FIGHT);
  if (kind === "spill") a.g!.drink = 0;
  if (kind === "passout" || kind === "fight") {
    for (const b of other ? [a, other] : [a]) {
      release(g, b);
      b.nx = b.x; b.ny = b.y; b.t = 0; b.dest = b.y * w + b.x;
      b.act = kind === "passout" ? "out" : "fight";
      b.timer = 0;
    }
    a.g!.drink = 0;
  }
  if (kind === "fight" || kind === "passout" || kind === "vomit" || kind === "urinate")
    news(g, "info", def.text.replace("{name}", "A guest") + roomLabel(g, inc.tile), true, { a: a.id });
  witnesses(g, grid, inc, def, r);
  g.bus.emit({ type: "incident", kind, x: a.x, y: a.y, guestType: a.g?.type ?? a.role });
  return inc;
}

function witnesses(g: Game, grid: Grid, inc: Incident, def: IncidentDef, r: Rng) {
  const s = g.state, w = s.map.w, x = inc.tile % w, y = (inc.tile - x) / w;
  let reported = false;
  near(g, grid, x, y, def.reach, (b, d) => {
    const gd = b.g;
    if (!gd || b.id === inc.actor || b.id === inc.other || busy(b)) return;
    const seen = d <= def.reach && canSee(g, b.y * w + b.x, inc.tile);
    if (!seen && d > def.reach / 2) return;
    const type = GUEST_TYPES[gd.type];
    const tol = type.tolerance[def.cat] ?? 0.5;
    // Bad things bother a guest by how little they tolerate them (past 1, they enjoy the show); fun things lift
    // everyone, the drama-lovers most. Heard through a wall: half.
    let eff = def.mood < 0 ? def.mood * (1 - tol) : def.mood * (0.5 + type.drama);
    if (!seen) eff *= 0.5;
    if (eff < 0) gd.annoy = Math.min(30, gd.annoy - eff);
    else gd.buzz = Math.min(20, gd.buzz + eff);
    if (def.seen && Math.abs(eff) >= 3 && r.chance(0.25)) think(g, b, eff < 0 ? def.seen : def.mood > 0 ? def.seen : "partyTime");
    // Low-drama guests tell the staff about what bothered them.
    if (def.reportable && seen && eff < -1 && !gd.why && r.chance(REPORT * (1 - type.drama) ** 2)) {
      inc.reporters.push(b.id);
      think(g, b, "reported");
      count(s, "_reports");
      if (!reported) news(g, "warn", `A guest reported ${def.name.toLowerCase()}${roomLabel(g, inc.tile)}.`, { a: inc.actor });
      reported = true;
    }
  });
}

// ---------------------------------------------------------------------------------------------------------
// Causes: once a second per guest. At most one incident per guest per beat.

function guardNearby(g: Game, guards: Agent[], a: Agent): boolean {
  const w = g.state.map.w;
  for (const q of guards) if (Math.abs(q.x - a.x) + Math.abs(q.y - a.y) <= DETER && canSee(g, a.y * w + a.x, q.y * w + q.x)) return true;
  return false;
}

function plantNear(g: Game, a: Agent, r: number): boolean {
  const { w, h } = g.state.map;
  for (let y = Math.max(0, a.y - r); y <= Math.min(h - 1, a.y + r); y++)
    for (let x = Math.max(0, a.x - r); x <= Math.min(w - 1, a.x + r); x++) {
      const id = g.objAt[y * w + x];
      if (id && g.objById.get(id)?.kind === "plant") return true;
    }
  return false;
}

function causes(g: Game, grid: Grid, guards: Agent[], a: Agent, r: Rng) {
  const s = g.state, gd = a.g!, type = GUEST_TYPES[gd.type], rate = type.incidents, tick = s.tick;
  // The deterrent is looked up only when some cause is live (it costs a few sight lines).
  let deter = -1;
  const roll = (p: number, cat: keyof typeof rate) => {
    if (p <= 0) return false;
    if (deter < 0) deter = guardNearby(g, guards, a) ? DETER_BY : 1;
    // (M12, owner) What security taught this guest, and the chill beatings and disappearances left on everyone.
    const taught = cat in ENF_REASONS ? deterOf(s, gd, cat as EnfReason) : 1;
    return r.chance(p * (rate[cat] ?? 1) * deter * taught * (gd.warned ? 0.4 : 1));
  };
  const x = gd.intox;
  // Children (M9.5): the one thing they get up to is feeding a machine next to them.
  if (gd.minor) {
    if (tick >= gd.incAt && !isWalking(a) && machineNear(g, a) && roll(0.004, "misconduct")) begin(g, grid, "underage", a, null);
    return;
  }
  // Celebration: a jackpot just paid.
  if (a.act === "play" && a.seat >= 0) {
    const o = g.objById.get(a.target);
    if (o && o.last.win === 2 && tick - o.last.tick < TICKS_PER_BEAT) {
      if (gd.intend > 0 && x >= 0.15 && roll(0.5, "celebration")) return buyRound(g, grid, a);
      if (roll(0.8, "celebration")) return void begin(g, grid, "cheer", a, null);
    }
  }
  if (tick < gd.incAt) return;
  // Drunkenness, worst first.
  if (x >= 1 && roll(0.02, "intox")) return void begin(g, grid, "passout", a, null);
  if (x >= 0.9 && roll(0.006, "intox")) return void begin(g, grid, "vomit", a, null);
  // Bursting, drunk, and no restroom to be had (none, can't find one, or stuck in a line): the nearest planter.
  const noRestroom = !g.has("bladder") || (gd.gaveUp & 2) !== 0 || (gd.seek === "bladder" && gd.lost >= 3) || gd.seek === "line" || gd.thought === "restroomLine";
  if (gd.needs.bladder >= 85 && x >= 0.4 && noRestroom && plantNear(g, a, 4) && roll(0.03, "misconduct")) return void begin(g, grid, "urinate", a, null);
  if (x >= 0.5 && roll(0.004 * (x / 0.5), "intox")) return void begin(g, grid, "loud", a, null);
  if (x >= 0.6 && isWalking(a) && roll(0.02, "intox")) return void begin(g, grid, "stumble", a, null);
  if (gd.drink > 0 && x >= 0.3 && roll(0.003 * (x / 0.3), "intox")) return void begin(g, grid, "spill", a, null);
  // Disorder: a bad mood next to a drunk (or drunk themselves).
  if (gd.mood < 35) {
    const other = partner(g, grid, a, 2, (b) => x >= 0.4 || b.g!.intox >= 0.5);
    if (other && roll(0.004 * (1 + x), "disorder")) return void begin(g, grid, "argument", a, other);
  }
  if (x >= 0.5 && gd.annoy >= 12) {
    let staff = false;
    near(g, grid, a.x, a.y, 3, (b) => { if (b.role !== "guest" && b.role !== "officer" && b.role !== "medic") staff = true; });
    if (staff && roll(0.004, "disorder")) return void begin(g, grid, "yell", a, null);
  }
  if (gd.chase >= 0.3 && gd.mem.won - gd.mem.wagered <= -0.7 * Math.max(1, gd.bankroll + gd.withdrawn) && roll(0.002, "disorder"))
    return void begin(g, grid, "breakdown", a, null);
  // Vice and drugs (M9.6): only somewhere quiet.
  if ((gd.drugs && gd.drugs < 3 && !gd.high) || (x >= 0.35 && gd.mood > 60)) {
    const here = a.y * s.map.w + a.x;
    if (quiet(g, here)) {
      if (gd.drugs && gd.drugs < 3 && !gd.high && roll(0.004, "drugs")) {
        gd.drugs++;
        // An overdose now and then: down they go, as with drink.
        if (r.chance(0.02)) return void begin(g, grid, "passout", a, null);
        gd.high = 1;
        gd.mood = Math.min(100, gd.mood + 10);
        return void begin(g, grid, "drugs", a, null);
      }
      if (x >= 0.35 && gd.mood > 60) {
        const other = partner(g, grid, a, 2, (b) => b.g!.intox >= 0.3 && !b.g!.minor);
        if (other && roll(0.01, "vice")) return void begin(g, grid, "hookup", a, other);
      }
    }
  }
  // Social.
  if (x >= 0.25 && gd.mood > 60) {
    const other = partner(g, grid, a, 2);
    if (other && roll(0.002, "social")) return void begin(g, grid, "flirt", a, other);
  }
  if (x >= 0.2 && gd.mood > 65) {
    const other = partner(g, grid, a, 2, (b) => b.g!.intend > 0 && b.g!.intend < 0.5);
    if (other && roll(0.0015, "social")) {
      other.g!.intend = Math.min(GUEST_TYPES[other.g!.type].drinking.cap, other.g!.intend + 0.08);
      other.g!.buzz = Math.min(20, other.g!.buzz + 2);
      return void begin(g, grid, "recruit", a, other);
    }
  }
}

/** Somewhere quiet (M9.6): little foot traffic and no crowd. */
export function quiet(g: Game, i: number): boolean {
  return g.fields.get("TRF", i) < QUIET_TRF && g.fields.get("CRW", i) < QUIET_CRW;
}
const QUIET_TRF = 2, QUIET_CRW = 2;

/** A slot machine or video poker within a tile (a child standing by a parent's machine). */
function machineNear(g: Game, a: Agent): boolean {
  const { w, h } = g.state.map;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = a.x + dx, y = a.y + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const o = g.objById.get(g.objAt[y * w + x]);
    if (o && (OBJECTS[o.kind].slot || OBJECTS[o.kind].game === "vpoker")) return true;
  }
  return false;
}

/** A winner buys a round: up to five drinkers nearby get one, on the winner. */
function buyRound(g: Game, grid: Grid, a: Agent) {
  const gd = a.g!, cut = cutoff(g);
  const lucky: Agent[] = [];
  near(g, grid, a.x, a.y, 3, (b) => {
    const bd = b.g;
    if (b === a || !bd || lucky.length >= 5 || busy(b) || bd.why || bd.intend <= 0 || handsFull(bd) || bd.intox >= cut) return;
    lucky.push(b);
  });
  let n = 0;
  for (const b of lucky) {
    if (gd.wallet < DRINK_PRICE) break;
    if (!serveDrink(g, b, undefined, "bar", true)) continue;
    gd.wallet -= DRINK_PRICE;
    post(g, "bar", DRINK_PRICE);
    b.g!.buzz = Math.min(20, b.g!.buzz + 6);
    think(g, b, "freeRound");
    n++;
  }
  begin(g, grid, n ? "round" : "cheer", a, null);
}

// ---------------------------------------------------------------------------------------------------------
// How it ends: on its own, or dealt with by a guard or a paramedic.

function end(g: Game, grid: Grid, inc: Incident) {
  const s = g.state, r = rng(s, "incidents");
  s.incidents.splice(s.incidents.indexOf(inc), 1);
  const a = grid.byId.get(inc.actor), b = inc.other >= 0 ? grid.byId.get(inc.other) : undefined;
  for (const f of [a, b]) if (f && (f.act === "fight" || f.act === "out")) { f.act = "idle"; f.timer = 0; }
  if (inc.handled) return;
  // Reports nobody answered: the reporter remembers, and enough of them is a call to the police.
  for (const id of inc.reporters) {
    const q = grid.byId.get(id);
    if (!q?.g) continue;
    q.g.unans++;
    q.g.annoy = Math.min(30, q.g.annoy + 5);
    think(g, q, "nobodyCame");
    if (q.g.unans >= CALL_AFTER && !q.g.called) policeCall(g, q);
  }
  if (inc.kind === "argument" && a?.g && b?.g && !a.g.why && !b.g.why && r.chance(0.3 * (1 + Math.max(a.g.intox, b.g.intox)) * GUEST_TYPES[a.g.type].incidents.disorder)) {
    begin(g, grid, "fight", a, b);
    return;
  }
  if (inc.kind === "fight") for (const f of [a, b]) if (f?.g) { f.g.annoy = Math.min(30, f.g.annoy + 10); if (r.chance(0.5) && !f.g.why) sendHome(g, f, "fight"); }
  if (inc.kind === "breakdown" && a?.g && !a.g.why) sendHome(g, a, "ruined");
}

function warn(g: Game, b: Agent) {
  const gd = b.g!, type = GUEST_TYPES[gd.type];
  gd.warned++;
  gd.annoy = Math.min(30, gd.annoy + 8 * type.policed);
  gd.incAt = g.state.tick + 60 * SEC;
  think(g, b, "warned");
}

/** Thrown out: the visit is ruined, and the group minds by how much their type hates being policed. */
function eject(g: Game, b: Agent, why = "ejected") {
  const gd = b.g!, r = rng(g.state, "incidents");
  gd.mem.ejected = 1;
  think(g, b, "ejected");
  for (const m of companions(g, b)) {
    const t = GUEST_TYPES[m.g!.type];
    m.g!.annoy = Math.min(30, m.g!.annoy + 8 * t.policed);
    if (r.chance(t.policed)) think(g, m, "friendEjected");
  }
  count(g.state, "_ejected");
  sendHome(g, b, why);
}

/** A guard reached the scene. What happens follows the house rule for its category. */
function resolve(g: Game, grid: Grid, inc: Incident) {
  const s = g.state, def = INCIDENTS[inc.kind], r = rng(s, "incidents");
  inc.handled = 1;
  const a = grid.byId.get(inc.actor), b = inc.other >= 0 ? grid.byId.get(inc.other) : undefined;
  end(g, grid, inc);
  for (const id of inc.reporters) {
    const q = grid.byId.get(id);
    if (q?.g) { q.g.buzz = Math.min(20, q.g.buzz + 3); if (r.chance(0.5)) think(g, q, "handled"); }
  }
  // An escort (M9.6) is shown out.
  if (a?.role === "escort") { count(s, "_ejected"); return leaveFloor(g, a); }
  if (!a?.g) return;
  const rule = INCIDENT_CATS[def.cat].policed ? s.rules[def.cat as keyof HouseRules] : 0;
  switch (inc.kind) {
    case "passout": return sendHome(g, a, "escorted");
    case "breakdown": a.g.annoy = Math.max(0, a.g.annoy - 5); return sendHome(g, a, "ruined");
    case "escort": return eject(g, a, "cutoff");
    case "fight": for (const f of [a, b]) if (f?.g) eject(g, f); return;
    // A child is walked back to the adults; nobody is warned or thrown out.
    case "underage": return;
  }
  if (a.g.why) return;
  if (rule >= 3 || (rule === 2 && a.g.warned > 0)) eject(g, a);
  else warn(g, a);
}

/** Does security step in on this one unasked (or because someone reported it)? */
function needsGuard(s: GameState, inc: Incident): boolean {
  const def = INCIDENTS[inc.kind];
  if (inc.handled || inc.medic || !def.respond || !INCIDENT_CATS[def.cat].policed) return false;
  const rule = s.rules[def.cat as keyof HouseRules];
  if (rule === 0) return false;
  return rule >= def.respond || inc.reporters.length > 0;
}

// ---------------------------------------------------------------------------------------------------------
// Guards, officers and paramedics.

export function spawnVisitor(g: Game, role: "officer" | "medic" | "inspector" | "escort"): Agent | null {
  // Street doors only: the hotel elevator (M9.6) is for hotel guests and escorts.
  const s = g.state, ents = s.map.entrances.filter((e) => g.walkable(e) && e !== s.map.lift);
  if (!ents.length) return null;
  const r = rng(s, "police"), at = r.pick(ents), w = s.map.w, x = at % w, y = (at - x) / w;
  const a: Agent = {
    id: s.nextId++, role, x, y, nx: x, ny: y, t: 0, steps: role === "medic" ? 7 : r.int(9, 10), dest: at, look: r.int(0, 1 << 20),
    act: "idle", next: "idle", target: -1, seat: -1, timer: 0, hidden: 0,
  };
  s.agents.push(a);
  return a;
}

export function leaveFloor(g: Game, a: Agent) {
  const ents = g.state.map.entrances, w = g.state.map.w;
  let best = -1, bd = Infinity;
  for (const e of ents) {
    const d = Math.abs((e % w) - a.x) + Math.abs(Math.floor(e / w) - a.y);
    if (d < bd && g.walkable(e)) { bd = d; best = e; }
  }
  a.target = -1;
  if (best < 0 || best === a.y * w + a.x) { a.act = "leave"; return; }
  go(a, best, "leave");
}

export function patrol(g: Game, a: Agent, r: Rng) {
  const pts = g.state.wanderPoints;
  // M9: a guard kept to a room patrols there (and still runs to trouble anywhere).
  const zone = a.st?.zone ?? -1;
  if (zone >= 0) {
    const w = g.state.map.w;
    if (!inZone(g, a, a.y * w + a.x)) { if (g.walkable(zone)) go(a, zone, "idle"); return; }
    const t = spreadTile(g, a, "police", a.x, a.y, 6, (q) => inZone(g, a, q));
    if (t >= 0) go(a, t, "idle");
    return;
  }
  // M11: guards spread out (visitors don't care where each other are, but it does them no harm).
  const t = r.chance(0.6) ? spreadTile(g, a, "police", a.x, a.y, 10) : -1;
  if (t >= 0) go(a, t, "idle");
  else if (pts.length) { const p = spreadPoint(g, a, "police"); if (p >= 0) go(a, p, "idle"); }
}

/** A free guard picks the nearest incident that needs security, or shows a wasted guest out under a strict rule. */
function assign(g: Game, grid: Grid, a: Agent): boolean {
  const s = g.state, w = s.map.w, here = a.y * w + a.x;
  let best: Incident | null = null, bd = GUARD_REACH;
  for (const inc of s.incidents) {
    if (inc.guard >= 0 || !needsGuard(s, inc)) continue;
    const who = grid.byId.get(inc.actor);
    if (!who) continue;
    const d = Math.abs(who.x - a.x) + Math.abs(who.y - a.y);
    if (d < bd && g.pathsFor(a).reachable(here, who.y * w + who.x)) { bd = d; best = inc; }
  }
  if (!best) return false;
  best.guard = a.id;
  a.target = best.id;
  const who = grid.byId.get(best.actor)!;
  go(a, who.y * w + who.x, "respond");
  return true;
}

function guardTick(g: Game, grid: () => Grid, a: Agent, r: Rng) {
  const s = g.state, w = s.map.w;
  // Carrying out a warning or a ban (sim/cheats.ts runs that).
  if (a.act === "enforce") return;
  // Patrolling: once a second, look for trouble to deal with.
  if (a.act === "wander" && (a.id + s.tick) % TICKS_PER_BEAT === 0 && s.incidents.length && assign(g, grid(), a)) return;
  if (a.act === "respond") {
    const inc = s.incidents.find((i) => i.id === a.target);
    const who = inc ? grid().byId.get(inc.actor) : undefined;
    if (!inc || !who || inc.handled) { a.act = "idle"; a.target = -1; return; }
    // They moved (a loud drunk wandering off): follow.
    if (Math.abs(who.x - a.x) + Math.abs(who.y - a.y) > 2) { go(a, who.y * w + who.x, "respond"); return; }
    if (a.timer === 0) { a.timer = Math.max(1, Math.round((RESOLVE_SECS * SEC) / skillOf(g, a))); return; }
    if (--a.timer > 0) return;
    resolve(g, grid(), inc);
    a.act = "idle"; a.target = -1; a.timer = 0;
    return;
  }
  if (isWalking(a)) return;
  // Free again (done, or the way there was blocked): let go of any incident so another guard, or a paramedic, can come.
  a.act = "idle";
  a.target = -1;
  if (!s.incidents.length || !assign(g, grid(), a)) patrol(g, a, r);
}

function officerTick(g: Game, a: Agent, r: Rng) {
  if (a.act === "leave") { a.hidden = 1; return; }
  if (isWalking(a)) return;
  if (g.state.tick >= (a.due ?? 0)) return leaveFloor(g, a);
  patrol(g, a, r);
}

function medicTick(g: Game, grid: () => Grid, a: Agent) {
  const s = g.state, w = s.map.w;
  if (a.act === "leave") { a.hidden = 1; return; }
  if (isWalking(a)) return;
  const inc = s.incidents.find((i) => i.id === a.target);
  const who = inc ? grid().byId.get(inc.actor) : undefined;
  if (!inc || !who) return leaveFloor(g, a);
  if (a.act !== "treat") { go(a, who.y * w + who.x, "treat"); return; }
  if (a.timer === 0) { a.timer = TREAT_SECS * SEC; return; }
  if (--a.timer > 0) return;
  // Carried out to the ambulance.
  inc.handled = 1;
  end(g, grid(), inc);
  who.g!.why = "ambulance";
  depart(g, who);
  leaveFloor(g, a);
}

function callMedic(g: Game, inc: Incident) {
  const m = spawnVisitor(g, "medic");
  if (!m) return;
  inc.medic = 1;
  m.target = inc.id;
  post(g, "medical", -MEDIC_COST);
  count(g.state, "_medic");
  adjustPolice(g, -COST_MEDIC);
  news(g, "bad", `Paramedics came for a guest who passed out (${fmtMoney(MEDIC_COST)}).`, { a: inc.actor });
}

function sendOfficer(g: Game) {
  const o = spawnVisitor(g, "officer");
  if (o) o.due = g.state.tick + OFFICER_SECS * SEC;
}

/** An officer on the floor notices trouble in view: each thing seen costs standing and, if serious, a fine. */
function officersWatch(g: Game, officers: Agent[]) {
  const s = g.state, w = s.map.w;
  for (const inc of s.incidents) {
    const def = INCIDENTS[inc.kind];
    if (def.hidden || def.mood >= 0 || inc.seen) continue;
    for (const o of officers) {
      // M11: a paid-off officer sees nothing.
      if (o.act === "leave" || o.paid === 1 || Math.abs((inc.tile % w) - o.x) + Math.abs(Math.floor(inc.tile / w) - o.y) > 8 || !canSee(g, o.y * w + o.x, inc.tile)) continue;
      inc.seen = 1;
      adjustPolice(g, -def.police * 2);
      if (def.police >= 1) { const fine = scaled(g, FINE_SEEN); post(g, "fines", -fine); news(g, "bad", `An officer saw ${def.name.toLowerCase()} on the floor: ${fmtMoney(fine)} fine.`, { a: o.id }); }
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// The police: standing, calls, and the escalation ladder.

function policeCall(g: Game, q: Agent) {
  const s = g.state;
  q.g!.called = 1;
  think(g, q, "calledPolice");
  count(s, "_calls");
  s.auth.police.calls++;
  news(g, "bad", "A guest called the police: nobody answered their reports.", { a: q.id });
  if (s.auth.police.stage >= 2) { const fine = scaled(g, FINE_CALL); post(g, "fines", -fine); news(g, "bad", `Police fine for disorder: ${fmtMoney(fine)}.`); }
  adjustPolice(g, -COST_CALL);
  sendOfficer(g);
}

export function adjustPolice(g: Game, delta: number) {
  const p = g.state.auth.police;
  // (M12) A town that looks the other way (The Outfit) takes a share of the usual offense.
  if (delta < 0) delta *= SCENARIOS[g.state.scenario].policeCost ?? 1;
  p.standing = Math.max(0, Math.min(100, p.standing + delta));
  g.state.lowPolice = Math.min(g.state.lowPolice, p.standing);
  ladder(g);
}

function ladder(g: Game) {
  const s = g.state, p = s.auth.police;
  // M11: the license goes only from the top of the ladder, and the ladder climbs one step a week at most, so a
  // bad day is a warning, not a closure.
  if (p.standing <= 0 && p.stage >= LADDER.length && s.auth.closedUntil <= s.tick) return revoke(g);
  if (p.stage < LADDER.length && p.standing < LADDER[p.stage] && s.tick - p.stepAt >= STEP_GAP_DAYS * TICKS_PER_DAY) {
    p.stage++;
    p.stepAt = s.tick;
    stepUp(g, p.stage);
  }
  while (p.stage > 0 && p.standing >= LADDER[p.stage - 1] + 5) p.stage--;
}

function stepUp(g: Game, stage: number) {
  const s = g.state, p = s.auth.police;
  if (stage === 1) news(g, "bad", "Police warning: too much trouble at the casino. Keep order, or expect fines.", { tab: "authorities" });
  if (stage === 2) { const fine = scaled(g, FINE_STAGE); post(g, "fines", -fine); news(g, "bad", `The police fined the casino ${fmtMoney(fine)} for disorder.`, { tab: "authorities" }); }
  if (stage === 3) { news(g, "bad", "The police will now inspect the floor regularly.", { tab: "authorities" }); p.inspectAt = s.tick + INSPECT_EVERY_DAYS * TICKS_PER_DAY; sendOfficer(g); }
  if (stage === 4 && s.tick - p.raidAt >= RAID_EVERY_DAYS * TICKS_PER_DAY) {
    p.raidAt = s.tick;
    const fine = scaled(g, FINE_RAID);
    post(g, "fines", -fine);
    news(g, "urgent", `Police raid! The casino is closed for ${CLOSE_DAYS} days and fined ${fmtMoney(fine)}.`);
    for (let k = 0; k < 3; k++) sendOfficer(g);
    close(g, CLOSE_DAYS);
  }
}

function revoke(g: Game) {
  const s = g.state;
  s.auth.revoked++;
  if (!s.outcome) s.outcome = "lost";
  news(g, "urgent", `The police shut the casino down and revoked its license. The scenario is lost; it may reopen in ${REVOKE_DAYS} days if you keep playing.`);
  close(g, REVOKE_DAYS);
  s.auth.police.standing = 30;
  s.auth.police.stage = 3;
}

/** Closed: everyone is sent home (the passed out carried out) and nobody comes in until it reopens. */
export function close(g: Game, days: number) {
  const s = g.state;
  s.auth.closedUntil = s.tick + days * TICKS_PER_DAY;
  for (const inc of [...s.incidents]) { inc.handled = 1; s.incidents.splice(s.incidents.indexOf(inc), 1); }
  for (const a of [...s.agents]) {
    if (!a.g) continue;
    if (a.act === "out") { a.act = "idle"; a.g.why = "closed"; depart(g, a); continue; }
    if (a.act === "fight") a.act = "idle";
    sendHome(g, a, "closed");
  }
}

// ---------------------------------------------------------------------------------------------------------

const RULE_CATS = ["intox", "disorder", "misconduct", "vice", "drugs"] as const;

const commands: CommandTable<"setRule"> = {
  setRule: {
    validate: (_g, c) => (!RULE_CATS.includes(c.cat) ? "Unknown rule" : !(Number.isInteger(c.level) && c.level >= 0 && c.level <= 3) ? "Unknown level" : null),
    apply(g, c) { g.state.rules[c.cat] = c.level; },
  },
};

export const incidentSystem: System = {
  id: "incidents",
  deps: ["guests", "staff"],
  commands,
  tick(g) {
    const s = g.state;
    let visitors = false;
    for (const a of s.agents) if (a.role === "guard" || a.role === "officer" || a.role === "medic") { visitors = true; break; }
    if (!visitors) return;
    // The lookup grid is only built if some guard or paramedic needs it this tick.
    let built: Grid | null = null;
    const grid = () => (built ??= buildGrid(g)), r = rng(s, "police");
    for (const a of s.agents) {
      if (a.role === "guard") guardTick(g, grid, a, r);
      else if (a.role === "officer") officerTick(g, a, r);
      else if (a.role === "medic") medicTick(g, grid, a);
    }
    // Officers and paramedics who reached the door have gone.
    if (s.agents.some((a) => a.hidden && (a.role === "officer" || a.role === "medic"))) s.agents = s.agents.filter((a) => !(a.hidden && (a.role === "officer" || a.role === "medic")));
  },
  beat(g) {
    const s = g.state, tick = s.tick;
    const grid = buildGrid(g), r = rng(s, "incidents");
    const guards: Agent[] = [], officers: Agent[] = [];
    for (const a of s.agents) { if (a.role === "guard") guards.push(a); else if (a.role === "officer") officers.push(a); }
    // Incidents in progress: over on their own (a guard on the way keeps it going a while), or a paramedic called.
    for (const inc of [...s.incidents]) {
      const a = grid.byId.get(inc.actor);
      if (!a) { end(g, grid, inc); continue; }
      if (inc.kind === "passout") {
        const guardComing = inc.guard >= 0 && grid.byId.get(inc.guard)?.target === inc.id;
        if (!inc.medic && !guardComing && tick - inc.start >= PASSOUT_WAIT * SEC) callMedic(g, inc);
        continue;
      }
      if (inc.guard >= 0 && grid.byId.get(inc.guard)?.target !== inc.id) inc.guard = -1;
      if (inc.end >= 0 && tick >= inc.end && !(inc.guard >= 0 && tick < inc.end + WAIT_FOR_GUARD * SEC)) end(g, grid, inc);
    }
    // A strict drunkenness rule: guards show wasted guests out before anything happens.
    const strict = s.rules.intox === 3 && guards.length > 0;
    for (const a of s.agents) {
      const gd = a.g;
      if (!gd || busy(a) || gd.why || a.act === "arrive") continue;
      if (strict && gd.intox >= WASTED && tick >= gd.incAt && !s.incidents.some((i) => i.actor === a.id)) { begin(g, grid, "escort", a, null); continue; }
      causes(g, grid, guards, a, r);
    }
    if (officers.length) officersWatch(g, officers);
  },
  day(g) {
    const s = g.state, p = s.auth.police;
    s.incidentDays.unshift({});
    if (s.incidentDays.length > THOUGHT_DAYS) s.incidentDays.length = THOUGHT_DAYS;
    if (s.auth.closedUntil >= 0 && s.tick >= s.auth.closedUntil) { s.auth.closedUntil = -1; news(g, "good", "The casino has reopened."); }
    p.standing = Math.min(100, p.standing + RECOVER_PER_DAY);
    ladder(g);
    if (p.stage >= 3 && p.inspectAt >= 0 && s.tick >= p.inspectAt && s.auth.closedUntil < 0) {
      p.inspectAt = s.tick + INSPECT_EVERY_DAYS * TICKS_PER_DAY;
      news(g, "info", "A police officer is inspecting the floor.", { tab: "authorities" });
      sendOfficer(g);
    }
  },
};

/** Incident counts per day, averaged over the last ~2 days like thoughts (the Authorities tab). */
export function incidentRates(g: Game): Record<string, number> {
  const s = g.state, frac = (s.tick % TICKS_PER_DAY) / TICKS_PER_DAY, weights = [1, 1, 1 - frac], out: Record<string, number> = {};
  s.incidentDays.forEach((day, k) => { for (const [id, n] of Object.entries(day)) out[id] = (out[id] ?? 0) + (n * (weights[k] ?? 0)) / 2; });
  return out;
}

/** The kind of incident a guest is in right now (for the renderer and the guest card), or "". */
export function incidentOf(g: Game, agentId: number): Incident | undefined {
  return g.state.incidents.find((i) => i.actor === agentId || i.other === agentId);
}

