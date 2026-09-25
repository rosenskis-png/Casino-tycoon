// The population pool (docs/spec/guests.md): each scenario's finite market of real people. Recurring types
// (Locals, Retirees) are stored individuals who come back on their own schedule with their own money, floor
// memory, chasing level and disposition; a few one-off guests (Tourists) join them. Reputation for recurring
// types is the pool's collective memory: the average disposition of its people, moved only by visits.
import { GUEST_TYPES, FIRST_NAMES, recurring, type GuestTypeDef } from "../data/guests";
import { SCENARIOS, type ScenarioDef } from "../data/scenarios";
import type { Game } from "./game";
import type { System } from "./registry";
import { isClosed, type Agent, type GameState, type Person } from "./state";
import { demand } from "./calendar";
import { rng, type Rng } from "./rng";
import { logNormal, range } from "./dist";
import { TICKS_PER_DAY, dateOfDay } from "./clock";
import { groupSize, guestCount, repFactor, room } from "./guests";
import { reasonPull } from "./amenities";
import { comeIn } from "./street";
import { lifeTags, guestName } from "./cheats";
import { news } from "./news";
import { BEATEN_SCORE } from "../data/cheats";
import { fanDraw, onFloor } from "./design/market";

/** How much one visit moves a person's disposition. */
const SCORE_RATE = 0.5;
/** Word of mouth per departing one-off guest. */
/** Word of mouth: how far one departing one-off guest moves their crowd's reputation toward their visit (M11.2: 0.04, was 0.02). */
const WOM_RATE = 0.04;
/** Spending money kept between visits, in months of income. */
const CASH_MONTHS = 2;
/** Below this (cash + savings) a person can't afford to come any more. */
const BROKE = 20;

// Runtime index: person by id. Rebuilt when the pool changes size.
const index = new WeakMap<Game, Map<number, Person>>();
export function person(g: Game, id: number): Person | undefined {
  let m = index.get(g);
  if (!m || m.size !== g.state.pool.length) {
    m = new Map(g.state.pool.map((p) => [p.id, p]));
    index.set(g, m);
  }
  return m.get(id);
}

/** A new person of this type. `regular`: they've been before (they know the floor as it is at `last`). */
export function makePerson(s: GameState, type: GuestTypeDef, r: Rng, score: number, regular: boolean, know = 0.5): Person {
  const income = Math.round(logNormal(r, type.income));
  const p: Person = {
    id: s.nextId++, type: type.id, name: r.int(0, FIRST_NAMES.length * 26 - 1), look: r.int(0, 1 << 20),
    savings: Math.round(logNormal(r, type.savings)), income, cash: Math.round(income * range(r, [0.5, CASH_MONTHS])),
    know: regular ? Math.min(1, know * range(r, [0.6, 1.3])) : 0, last: regular ? 0 : -1, visits: regular ? r.int(1, 20) : 0,
    score: Math.max(0, Math.min(100, score + range(r, [-10, 10]))), chase: 0, fav: [],
    // Regulars are already on a schedule: their next visit falls somewhere in their usual interval.
    next: regular ? Math.round(r.next() * type.returns.days.median * 2 * TICKS_PER_DAY) : -1,
    here: 0, ejects: 0, ban: 0, mark: 0, luck: 0, cheat: 0, caught: 0,
  };
  Object.assign(p, lifeTags(p.id, type, SCENARIOS[s.scenario]?.cheatRate ?? 1));
  return p;
}

/** Fills the pool for a new game (or a save from before pools): the scenario's market per recurring type. */
export function seedPool(s: GameState, def: ScenarioDef, know: Record<string, number> = {}) {
  const r = rng(s, "pool");
  for (const [t, m] of Object.entries(def.market)) {
    const type = GUEST_TYPES[t];
    if (!type) continue;
    for (let k = 0; k < m.size; k++) s.pool.push(makePerson(s, type, r, s.rep[t] ?? 50, r.chance(m.regulars), know[t] ?? 0.5));
    s.rep[t] = poolRep(s, t) ?? s.rep[t];
  }
}

/** A scandal lowers a type's reputation: every person of a recurring type thinks a little less of the place. */
export function hitReputation(g: Game, type: string, pts: number) {
  const s = g.state, t = GUEST_TYPES[type];
  if (!t || !pts) return;
  if (recurring(t)) {
    for (const p of s.pool) if (p.type === type) p.score = Math.max(0, p.score - pts);
    s.rep[type] = poolRep(s, type) ?? s.rep[type];
  } else s.rep[type] = Math.max(0, (s.rep[type] ?? 50) - pts);
}

/** Gone for good (docs/spec/cheats.md): out of the pool. */
export function removePerson(g: Game, id: number) {
  const s = g.state, k = s.pool.findIndex((p) => p.id === id);
  if (k < 0) return;
  const type = s.pool[k].type;
  s.pool.splice(k, 1);
  index.delete(g);
  s.rep[type] = poolRep(s, type) ?? s.rep[type];
}

/** Reputation of a recurring type: the average disposition of its people. */
function poolRep(s: GameState, type: string): number | null {
  let sum = 0, n = 0;
  for (const p of s.pool) if (p.type === type) { sum += p.score; n++; }
  return n ? sum / n : null;
}

/**
 * How easy this visit made it to keep playing (0-1): a hard-to-find exit, ATM trips, drinks pushed on them,
 * an early big win. Chasing starts and grows on easy floors.
 */
function easiness(a: Agent): number {
  const m = a.g!.mem;
  return 0.25 * Math.min(1, m.exitHops / 4) + 0.25 * Math.min(1, a.g!.trips / 2) + 0.25 * Math.min(1, (m.served + m.comped) / 3) + 0.25 * m.early;
}

/**
 * A guest has left: their person (if any) takes the visit home. Money, memory and disposition update, and they
 * plan (or don't plan) the next visit. One-off guests move word of mouth; a few of them join the pool.
 */
export function afterVisit(g: Game, a: Agent, score: number) {
  const s = g.state, gd = a.g!, type = GUEST_TYPES[gd.type];
  const r = rng(s, "pool");
  let p = gd.pid >= 0 ? person(g, gd.pid) : undefined;
  if (!p && !recurring(type) && gd.lead && r.chance(type.returns.share)) {
    // One of the few one-off guests who will come back: they join the pool.
    p = makePerson(s, type, r, score * 100, false);
    p.savings = Math.max(p.savings, gd.withdrawCap);
    // They are who they were on this visit.
    Object.assign(p, { luck: gd.luck, cheat: gd.cheat, caught: gd.caught, mark: gd.mark });
    s.pool.push(p);
  }
  if (!recurring(type) && !type.noRep) {
    const cur = s.rep[gd.type] ?? 50;
    s.rep[gd.type] = Math.max(0, Math.min(100, cur + (score * 100 - cur) * WOM_RATE));
  }
  if (!p) return;
  p.here = 0;
  if (gd.pid === p.id) {
    p.savings = Math.max(0, p.savings - gd.withdrawn);
    p.cash = Math.max(0, p.cash + gd.wallet);
  }
  p.know = gd.know;
  p.last = s.tick;
  // A good visit's best seat becomes a favorite spot (best first, three kept).
  if (gd.mem.favSeat >= 0 && score >= 0.5) p.fav = [gd.mem.favSeat, ...p.fav.filter((t) => t !== gd.mem.favSeat)].slice(0, 3);
  p.visits++;
  if (gd.mem.ejected && gd.pid === p.id) p.ejects++;
  if (gd.mem.banned) p.ban = 1;
  p.score += (score * 100 - p.score) * SCORE_RATE;
  if (gd.hurt) p.score = Math.max(0, p.score - BEATEN_SCORE);
  // Chasing: starts rarely, and only on floors that make it easy to keep playing; then grows visit by visit.
  const e = easiness(a);
  if (p.chase === 0) { if (r.chance(type.chase * e)) p.chase = 0.1; }
  else p.chase = Math.max(0, Math.min(1, p.chase + (e < 0.15 ? -0.02 : 0.03 + 0.12 * e)));
  // Coming back: likelier after a good visit; the worse it went, the longer the gap.
  const back = Math.min(0.98, type.returns.share * Math.max(0, Math.min(1.15, (score - 0.2) / 0.5)));
  const broke = p.cash + p.savings < BROKE;
  if (!broke && r.chance(back)) {
    // (M8.6) A fan of a game still on the floor comes back for it a little sooner.
    const days = logNormal(r, type.returns.days) * (1 + Math.max(0, 0.6 - score) * 2) * (p.fan && onFloor(g, p.fan) ? 0.85 : 1);
    p.next = s.tick + Math.round(days * TICKS_PER_DAY);
  } else p.next = -1;
  if (recurring(type)) s.rep[gd.type] = poolRep(s, gd.type) ?? s.rep[gd.type];
}

/** Anyone marked as here with no guest or pedestrian to show for it (guests cleared, old saves) goes home. */
export function reconcilePool(g: Game) {
  const present = new Set<number>();
  for (const a of g.state.agents) if (a.g && a.g.pid >= 0) present.add(a.g.pid);
  for (const p of g.state.peds) if (p.pid >= 0 && p.goal !== -2) present.add(p.pid);
  for (const p of g.state.pool) if (p.here && !present.has(p.id)) { p.here = 0; if (p.next < g.state.tick) p.next = -1; }
}

/** Sends a person in: they walk down the sidewalk to an entrance (or straight in), with company. */
function send(g: Game, p: Person, r: Rng) {
  const type = GUEST_TYPES[p.type];
  p.here = 1;
  p.next = -1;
  comeIn(g, p.type, p.id, groupSize(r, type));
}

/** New and lapsed people who come on purpose, per real second, by type (before the random draw). */
export function newcomerRates(g: Game): Record<string, number> {
  const s = g.state, sc = SCENARIOS[s.scenario];
  const month = dateOfDay(Math.floor(s.tick / TICKS_PER_DAY)).month;
  const rm = room(g);
  let total = 0;
  for (const [t, w] of Object.entries(sc.population)) total += w * (GUEST_TYPES[t]?.arrival.base ?? 0);
  const out: Record<string, number> = {};
  for (const [t, w] of Object.entries(sc.population)) {
    const type = GUEST_TYPES[t];
    if (!type || !total) continue;
    // (M11.2, owner) People come for reasons: to gamble, for a drink, a meal, a show, the club, the pool, mini golf,
    // the sights. Arrivals follow how well the casino offers what each crowd comes for (sim/amenities.ts offers).
    out[t] = sc.arrivals * ((w * type.arrival.base) / total) * type.arrival.season[month] * repFactor(type.noRep ? 50 : s.rep[t] ?? 50) * rm * reasonPull(g, t) * demand(s, t) * (1 + fanDraw(g, t));
  }
  return out;
}

/** A random person of this type free to come (not here, no plans, not banned, with money to spend), or null. */
export function available(g: Game, type: string, r: Rng): Person | null {
  const free: Person[] = [];
  for (const p of g.state.pool) if (p.type === type && !p.here && p.next < 0 && !p.ban && p.cash >= BROKE) free.push(p);
  return free.length ? r.pick(free) : null;
}

export const poolSystem: System = {
  id: "pool",
  deps: ["guests"],
  init(g) { reconcilePool(g); },
  beat(g) {
    const s = g.state, sc = SCENARIOS[s.scenario];
    const r = rng(s, "pool");
    // Closed by the police: nobody comes in (regulars due now try again later).
    const full = guestCount(g) >= sc.maxGuests || isClosed(s);
    // Regulars whose day has come.
    for (const p of s.pool) {
      if (p.here || p.next < 0 || p.next > s.tick) continue;
      // Banned: turned away at the door (the log notes it); they try less and less.
      if (p.ban) { news(g, "info", `${guestName(p.name)}, banned for life, was turned away at the door.`, true); p.next = r.chance(0.5) ? s.tick + r.int(10, 40) * TICKS_PER_DAY : -1; continue; }
      if (full || p.cash < BROKE) { p.next = s.tick + r.int(1, 3) * TICKS_PER_DAY; continue; }
      send(g, p, r);
    }
    // People coming on purpose for the first time (or giving the place another try); one-off types straight
    // from the street, recurring types from the pool's free people.
    if (isClosed(s)) return;
    const ra = rng(s, "arrivals");
    for (const [t, lambda] of Object.entries(newcomerRates(g))) {
      const type = GUEST_TYPES[t];
      // One-off types mostly arrive as passers-by (sim/street.ts); these are the ones who came for you.
      let l = recurring(type) ? lambda : lambda * 0.3;
      while (l > 0) {
        if (ra.chance(Math.min(1, l))) {
          if (recurring(type)) { const p = available(g, t, ra); if (p) send(g, p, ra); }
          else comeIn(g, t, -1, groupSize(ra, type));
        }
        l -= 1;
      }
    }
  },
  day(g) {
    const s = g.state, date = dateOfDay(Math.floor(s.tick / TICKS_PER_DAY));
    reconcilePool(g);
    // Paydays (the 1st and 15th): some regulars due within the week come today instead.
    if (date.day === 1 || date.day === 15) {
      const r = rng(s, "pool");
      for (const p of s.pool) {
        const type = GUEST_TYPES[p.type];
        if (!type?.payday || p.here || p.next < 0 || p.next - s.tick > 5 * TICKS_PER_DAY) continue;
        if (r.chance(type.payday)) p.next = s.tick + r.int(0, TICKS_PER_DAY - 1);
      }
    }
  },
  month(g) {
    // (M11.2) The survey leans on the last month or two.
    for (const row of Object.values(g.state.survey)) {
      row.n /= 2; row.score /= 2;
      for (const m of [row.th, row.like, row.dislike]) for (const k of Object.keys(m)) { m[k] /= 2; if (m[k] < 0.5) delete m[k]; }
    }
    // Monthly disposable income refills spending money (anything beyond a couple of months' worth goes elsewhere).
    for (const p of g.state.pool) p.cash = Math.max(p.cash, Math.min(p.cash + p.income, p.income * CASH_MONTHS));
  },
};

/** Pool summary for the Guests tab: regulars per type, and chasers (their own "type", mostly Locals). */
export function poolSummary(g: Game): { regulars: Record<string, number>; chasers: number; size: number } {
  const regulars: Record<string, number> = {};
  let chasers = 0;
  for (const p of g.state.pool) {
    if (p.visits > 0 && (p.next >= 0 || p.here)) regulars[p.type] = (regulars[p.type] ?? 0) + 1;
    if (p.chase >= 0.5) chasers++;
  }
  return { regulars, chasers, size: g.state.pool.length };
}
