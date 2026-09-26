// Guests (FOUNDATIONS §6, docs/spec/guests.md): arrival as a group, needs, mood, thoughts, betting, the ATM,
// drinking, choosing what to do, and leaving. Every guest is one real person (docs/spec/clock.md); pool
// regulars are the same person each visit (sim/pool.ts). What a visit felt like becomes that person's
// disposition, or word of mouth for one-off types (§15).
import { GUEST_TYPES, FIRST_NAMES, type GuestTypeDef, type Pref, type QuitRule, type Reason, type Taste } from "../data/guests";
import { OBJECTS } from "../data/objects";
import { T } from "../data/terrain";
import { SCENARIOS } from "../data/scenarios";
import { WAGERS_PER_ROUND } from "../data/games";
import { THEME_IDS } from "../data/themes";
import { DRAW, ENGAGE, ENV_MOOD, THEME_TASTE, TIME_FLIES } from "../data/psych";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Agent, GameState, GuestData, Person, PlacedObject, SurveyRow } from "./state";
import { rng, type Rng } from "./rng";
import { logNormal, normal, pickIndex, pickKey, range, skewed } from "./dist";
import { go, isWalking, nearbyTile, randomWalkable, MAX_AGENTS } from "./agents";
import { SIGHT, canSee, doorLeg, explore, faceTile, knowsExit, knowsRoute, remember, signLeg } from "./wayfinding";
import { betOf, isGame, isTable, machineModel, minRoundOf, roundTicks } from "./gaming";
import { canSit, tableAppeal, tableOpen, limitsNow, tableWant } from "./tables";
import { TABLE_GAMES, bjEdge, pockets, rulesScore } from "../data/tables";
import { serveDrink, compSeeking, rollComp, barPolicy, priceAt, DRINK_PRICE, DRINK_UNIT, INTOX_CAP } from "./drinks";
import { afterVisit, reconcilePool, person as personOf } from "./pool";
import { walkAway } from "./street";
import { tagGuest, guestName, hash01, deterOf } from "./cheats";
import { fmtMoney, newsFor } from "./news";
import { TICKS_PER_BEAT, TICKS_PER_DAY, TICKS_PER_SECOND } from "./clock";
import { covers, objSeats, objSize, seatCount } from "./geometry";
import { gradeOf, offers, pickIntent, priceFor, priceTolerance, purposeAt, servingCost, showPhase, stakeMult, tierOf, worthTo } from "./amenities";
import { gradeWorth } from "../data/grades";
import { adjustPolice } from "./incidents";
import { post } from "./finance";
import { THEFT } from "../data/staff";
import { greed, steal } from "./crew";
import { comeBack, useComp } from "./bank";
import { whaleLeft } from "./whales";
import { compiledOf, huntEdge, signDesign, slotInfo, statsOf, topMeter } from "./design";
import { judged } from "./design/appeal";
import { SLOT_TASTES } from "../data/slotTastes";
import { gameKey, noteSessionEnd, noteThought } from "./opinions";
import { fanOf, marketFactor, marketSession, marketVersion, personalPull } from "./design/market";
const news = newsFor("guests");

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
/**
 * Frustration at which a guest who wants to sit and can't find a machine gives up on the place. Each fruitless
 * look adds 1 (1.5 in a bad mood, 0.5 in a good one); browsing never counts.
 */
const FRUSTRATED = 10;
/** Hops searching for an amenity before going without; hops lost before a leaving guest finds the way anyway. */
const GIVE_UP = 6;
const EXIT_LOST = 8;
/** Floor knowledge gained per beat on the floor (three times that while walking around). */
const LEARN = 0.002;
/** Machines a guest remembers liking the look of this visit. */
const LIKED_CAP = 12;
/** Bar stays: drinks at most per sitting. */
const BAR_ROUNDS = 4;
/** Seconds a group member waits (broke or done) before counting as waiting too long. */
const WAIT_LONG = 120;
/** How far a group's average mood pulls each member's. */
const GROUP_PULL = 0.2;
/** Intoxication worn off per real minute on the floor. */
const SOBER_PER_MIN = 0.02;
type Need = "thirst" | "bladder" | "cage" | "atm" | "hunger" | "show" | "club" | "pool" | "garden" | "golf";
const NEED_BIT: Record<Need, number> = { thirst: 1, bladder: 2, cage: 4, atm: 8, hunger: 16, show: 32, club: 64, pool: 256, garden: 512, golf: 1024 };
/** (M11.2) The visit's to-do list: places a guest means to go before leaving, in the order they try them. */
const TODO: Need[] = ["show", "golf", "pool", "club", "hunger"];
/** Set once a guest stayed on past their time to finish their list (once a visit). */
const TODO_EXT = 1 << 14;
/**
 * (M11.2, owner) Other to-do bits: came for drinks, plans to gamble (who came for it, or drew it as an extra; the rest
 * gamble only if tempted), wants to look around. A place done this visit is its need bit << DONE_SHIFT.
 */
const DRINK_BIT = 1 << 11, GAMBLE_BIT = 1 << 12, SIGHTS_BIT = 1 << 13, DONE_SHIFT = 16;
/**
 * (M11.3, owner) Temptation = exposure × match × state × hooks (docs/spec/guests.md "Temptation"). Chance per decision
 * at a game in view they like 1.0, with no hook working and a fair mood: the same for every crowd.
 */
const TEMPT = 0.08;
/** Exposure: games they've walked past and liked this visit add this much each, up to TEMPT_SEEN of them. */
const TEMPT_EXPOSE = 0.12, TEMPT_SEEN = 8;
/** The highest a game's pull can be (appeal plus flash), for the cheap first roll. */
const TEMPT_MAX_WANT = 2.5;
/** × the type's `free` hook: chance another adult in a group that came for something else leaves it to the rest. */
const SPLIT = 0.25;
/** The least appeal a game needs to tempt someone. */
const TEMPT_APPEAL = 0.4;
/** Chance a drink-first guest who sees a game they really like has "just one quick spin" first. */
const QUICK_SPIN = 0.2;
/** Chance per decision, × the type's reason weight, that a place they've seen gets added to the list. */
const IMPULSE = 0.08;
/** Legs of looking around that satisfy "the sights"; strolls on the way out once the list is done. */
const SIGHT_LEGS = 8;
const STROLL_LEGS = 3;
/** (M11.2) The least a visit scores when they leave up. */
const WINNER_SCORE = 0.8;
/** A wish that isn't why they came waits until this share of the visit has gone. */
const TODO_LATER = 0.25;
/** Seconds a guest stays on past their time to finish their list. */
const TODO_STAY = 120;
const WHERE: Record<Need, string> = {
  thirst: "whereBar", bladder: "whereRestroom", cage: "whereCage", atm: "noAtm", hunger: "whereFood", show: "whereShow", club: "whereClub", pool: "wherePool", garden: "whereSit", golf: "whereGolf",
};
const ACT_OF: Record<Need, Agent["act"]> = { thirst: "drink", bladder: "restroom", cage: "cage", atm: "cage", hunger: "dine", show: "show", club: "dance", pool: "swim", garden: "rest", golf: "golf" };
/** Why someone came → what serves it. */
const INTENT_NEED: Record<string, Need> = { dine: "hunger", show: "show", club: "club", pool: "pool", golf: "golf" };
const COME_FOR: Partial<Record<Need, "dine" | "show" | "club" | "pool" | "golf">> = { hunger: "dine", show: "show", club: "club", pool: "pool", golf: "golf" };
/** Smoke: how smokers and everyone else take it (penalty only; clean air isn't remarked on). */
const SMOKE_PREF = { smoker: { tol: 4, w: 0.1 }, other: { tol: 0.8, w: 0.8 } };
/** Smokers' urge per second (100 = must smoke; every 3-6 minutes) and seconds a smoke takes. */
const URGE_PER_SEC = 100 / 270;
const SMOKE_SECS = 20;
/** What a meal costs the house, and the ticket and cover guests find fair at a first-tier place (dollars). */
const COVER_FAIR = 15;
/** Seconds trapped before staff let a guest out (docs/spec/construction.md). */
const LET_OUT = 90;
/** gaveUp bit: a smoker who found nowhere to smoke this visit. */
const SMOKE_BIT = 128;
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
  for (const o of g.state.objects) {
    const n = seatCount(o);
    if (!n) continue;
    // Dealer spots (M7) are never a guest's: marked taken.
    const seats = new Array(n).fill(0);
    if (OBJECTS[o.kind].game) objSeats(o).forEach((st, k) => { if (st.kind === "dealer") seats[k] = -1; });
    b.set(o.id, seats);
  }
  for (const a of g.state.agents) {
    if (a.role !== "guest" || a.seat < 0) continue;
    const s = b.get(a.target);
    if (s && !s[a.seat]) s[a.seat] = a.id;
    else { a.seat = -1; a.target = -1; }
  }
  books.set(g, b);
  return b;
}

/** Who holds each seat of an object (guest agent ids; 0 free, -1 a dealer's spot). */
export const seatHolders = (g: Game, objId: number): number[] | undefined => book(g).get(objId);

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

export function release(g: Game, a: Agent) {
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
export function companions(g: Game, a: Agent): Agent[] {
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

function tasteAt(g: Game, t: Taste, i: number, layoutOnly = false): number {
  // (M11.1) The layout alone (for the casino's draw): no crowd, traffic, litter or crowd noise.
  if (layoutOnly && (t === "DIRT" || t === "CRW" || t === "TRF")) return NaN;
  if (layoutOnly && t === "NRG") return g.fields.get("NRG", i);
  if (t === "DIRT") return localDirt(g, i);
  if (t === "THM") return g.fields.themes.at(i);
  // A coherent themed room reads as more prestigious (M6.5).
  if (t === "PRS") return g.fields.get("PRS", i) + 0.8 * Math.max(0, g.fields.themes.at(i));
  // (M11.1) Noise: the objects' energy plus the noise the crowd is making in this room and the rooms around it.
  if (t === "NRG") return g.fields.get("NRG", i) + g.fields.noiseAt(i);
  return g.fields.get(t, i);
}

interface Fit { score: number; worst: { t: Taste; hi: boolean; mag: number } | null; best: { t: Taste; mag: number } | null }

function prefScore(p: Pref, v: number): number {
  const d = Math.abs(v - p.ideal);
  return d <= p.tol ? 0.3 * p.w : -p.w * Math.min(1.5, (d - p.tol) / p.tol);
}

export function fitAt(g: Game, type: GuestTypeDef, i: number, gd?: GuestData, layoutOnly = false): Fit {
  let score = 0;
  let worst: Fit["worst"] = null, best: Fit["best"] = null;
  // Smoke (M6): a penalty past tolerance only, so smoke-free air changes nothing; smokers barely mind it.
  const smk = g.fields.get("SMK", i);
  if (smk > 0) {
    const p = gd?.smoker ? SMOKE_PREF.smoker : SMOKE_PREF.other;
    if (smk > p.tol) {
      const s = -p.w * Math.min(1.5, (smk - p.tol) / p.tol);
      score += s;
      worst = { t: "SMK", hi: true, mag: -s };
    }
  }
  // Theming (M6.5): weighted by how much the type cares; a muddle stings more than good theming pleases.
  const th = g.fields.themes.active ? g.fields.themes.at(i) : 0;
  if (th) {
    // (M11.1) A coherent spot pleases by how much they like its theme: one they dislike can put them off.
    const d = th > 0 ? g.fields.themes.domAt(i) : -1, taste = d >= 0 ? type.themes[THEME_IDS[d]] ?? 0 : 0;
    const c = type.theming * (th > 0 ? (0.25 + THEME_TASTE * taste) * th : 0.4 * th);
    score += c;
    if (c < 0 && (!worst || -c > worst.mag)) worst = { t: "THM", hi: false, mag: -c };
    else if (c >= 0.15 && type.theming >= 0.5) best = { t: "THM", mag: c };
  }
  for (const [t, p] of Object.entries(type.prefs) as [Taste, Pref][]) {
    const v = tasteAt(g, t, i, layoutOnly);
    if (Number.isNaN(v)) continue;
    const s = prefScore(p, v);
    score += s;
    if (s < 0 && (!worst || -s > worst.mag)) worst = { t, hi: v > p.ideal, mag: -s };
    // Clean floors are expected, not remarked on; only the other tastes earn a compliment.
    if (s > 0 && p.w >= 0.8 && t !== "DIRT" && (!best || s > best.mag)) best = { t, mag: s };
  }
  return { score, worst, best };
}

const BAD_THOUGHT: Record<Taste, [string | null, string | null]> = {
  NRG: ["nrgLo", "nrgHi"], CRW: ["crwLo", "crwHi"], PRS: ["prsLo", null], TRF: [null, "trfHi"], DIRT: [null, "dirty"], SMK: [null, "smoky"], THM: ["badTheme", null],
};
const GOOD_THOUGHT: Record<Taste, string> = { NRG: "gNRG", CRW: "gCRW", PRS: "gPRS", TRF: "gTRF", DIRT: "gCLN", SMK: "gCLN", THM: "goodTheme" };

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
  if (!gd.minor) surveyThought(g, a, id);
  // (M8.5) A thought had at a game counts toward what guests think of that game.
  if (a.act === "play" && a.target >= 0) noteThought(g.state, gameKey(g.objById.get(a.target)), id);
}

/** (M11.2) The survey row for a crowd. */
export function surveyRow(s: GameState, type: string): SurveyRow {
  return (s.survey[type] ??= { n: 0, score: 0, th: {}, like: {}, dislike: {} });
}

/** (M11.2) A thought goes into the crowd's survey; theming thoughts note the theme where they were. */
function surveyThought(g: Game, a: Agent, id: string) {
  const row = surveyRow(g.state, a.g!.type);
  row.th[id] = (row.th[id] ?? 0) + 1;
  if (id !== "goodTheme" && id !== "badTheme") return;
  const d = g.fields.themes.domAt(a.y * g.state.map.w + a.x), k = d >= 0 ? THEME_IDS[d] : "none";
  const m = id === "goodTheme" ? row.like : row.dislike;
  m[k] = (m[k] ?? 0) + 1;
}

const net = (gd: GuestData) => gd.mem.won - gd.mem.wagered;
/** Money in play this visit: the budget plus ATM draws. */
const staked = (gd: GuestData) => Math.max(1, gd.bankroll + gd.withdrawn);

function periodicThought(g: Game, a: Agent, type: GuestTypeDef) {
  const gd = a.g!;
  const here = a.y * g.state.map.w + a.x;
  let id: string | null = null, mag = 2;
  const consider = (tid: string | null, m: number) => { if (tid && m > mag) { id = tid; mag = m; } };
  const fit = fitAt(g, type, here, gd);
  if (fit.worst) consider(BAD_THOUGHT[fit.worst.t][fit.worst.hi ? 1 : 0], fit.worst.mag * 8);
  // A good word only when the whole place suits them, credited to what they like most.
  if (fit.best && fit.score > 0) consider(GOOD_THOUGHT[fit.best.t], fit.score * 4);
  const n = gd.needs;
  if (n.fatigue > 80) consider("tired", (n.fatigue - 70) / 2);
  if (n.hunger > 80) consider("hungry", (n.hunger - 70) / 2);
  if (gd.smoker && gd.urge >= 100) consider("needSmoke", 6);
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
  // A returning guest carries a card (until the M9 player's club); their companions come in on it.
  const card = person ? (person.visits > 0 ? 1 : 0) : lead ? lead.card : 0;
  const dr = type.drinking;
  // Sober guests are exactly 0; drinkers draw a skewed bell, shifted by why they came.
  const intend = r.chance(dr.sober) ? 0 : Math.min(dr.cap, skewed(r, Math.max(0.05, dr.mean + (came === "drink" ? 0.1 : -0.03)), dr.sd, dr.cap));
  const uses = r.chance(type.atm.never) && chase < 0.3 ? 0 : 1;
  const x = at % w, y = (at - x) / w;
  const quit = pickKey(r, type.play.quit);
  const gd: GuestData = {
    type: typeId, pid: person?.id ?? -1, group: 0, lead: leader ? 0 : 1, sex, intent: came, card, todo: 0,
    smoker: 0, urge: 0, trapAt: -1, esc: 0, paid: 0,
    name: person?.name ?? r.int(0, FIRST_NAMES.length * 26 - 1),
    bankroll, wallet: bankroll, withdrawn: 0,
    withdrawCap: Math.round(person ? person.savings : logNormal(r, type.tripCap)),
    atm: uses ? Math.round(logNormal(r, type.atm.draw)) : 0, trips: 0,
    stake: bankroll * range(r, type.play.stake) * (1 + chase),
    pace: range(r, type.play.pace), quit,
    winGoal: Math.round(bankroll * range(r, type.play.winGoal)), lossLimit: Math.round(bankroll * range(r, type.play.lossLimit)),
    compSeek: r.chance(type.play.compSeek) ? 1 : 0,
    floorTime: Math.round(normal(r, type.minutes) * TICKS_PER_MIN * (1 + 3 * chase)),
    drink: 0, dStr: 0,
    intend, drift: intend ? logNormal(r, { median: dr.overshoot, sigma: 1.2 }) : 0, intox: 0, chase,
    needs: { bladder: r.int(0, 30), hunger: r.int(0, 30), thirst: r.int(0, 30), fatigue: r.int(0, 10) },
    mood: r.int(60, 75), luck: 0, cheat: 0, spell: 0, spellAt: 0, take: 0, caught: 0, mark: 0, held: 0, hurt: 0,
    mem: {
      arrived: s.tick, playTicks: 0, moodSum: 0, moodN: 0, unmet: 0, drinks: 0, bigWin: 0, wagered: 0, won: 0, cashed: 0,
      feel: 0, rounds: 0, served: 0, comped: 0, early: 0, startIntend: intend, peak: 0, atmYes: 0, exitHops: 0, barAt: 0,
      offerAt: 0, sitAt: 0, favSeat: -1, favScore: 0, ejected: 0, ev: 0, v: 0, hits: 0, hexp: 0, hvar: 0, banned: 0, fun: 0, spent: 0, eatAt: 0, thrill: 0,
    },
    // First-timers sightsee before settling; regulars less, the better they know the place.
    browse: 0, frus: 0, liked: [], favAt: 0,
    thought: "", thoughtTick: -1, recent: [], nextThink: s.tick + r.int(5, 20) * TICKS_PER_SECOND, annoy: 0, buzz: 0, why: "", wait: -1,
    warned: 0, unans: 0, called: 0, incAt: 0,
    know: person ? person.know : lead ? lead.know : 0,
    kseed: person ? personSeed(person.id) : lead ? lead.kseed : r.int(0, 1 << 30),
    memDate: person ? person.last : lead ? lead.memDate : -1,
    door: at, seen: [], trail: [], seek: "", lost: 0, gaveUp: 0, trapped: 0, skill: 1, counter: 0, vip: 0, comp: 0, unpaid: 0, minor: 0, drugs: 0, high: 0,
    // Set later in a visit; made here so every guest has the same shape (hot loops stay fast).
    extra: 0, game: "", sf: 0, voided: 0, hunter: 0, sfk: "", look: 0, sight: 0,
  };
  // (M8.5) A share of Locals are advantage players: always the same people (from their seed), never an extra draw.
  if (typeId === "local" && gd.kseed % 10 === 3) gd.hunter = 1;
  const a: Agent = {
    id: s.nextId++, role: "guest", x, y, nx: x, ny: y, t: 0, steps: r.int(10, 14), dest: at,
    look: person?.look ?? r.int(0, 1 << 20),
    act: "arrive", next: "idle", target: -1, seat: -1, timer: 0, hidden: 0, g: gd,
  };
  gd.group = leader ? leader.id : a.id;
  tagGuest(g, gd, person, lead);
  // Skill and card counting (M7): a pool person's for life (from their id); a one-off's drawn on its own stream.
  const u = person ? hash01(person.id, 5) : rng(s, "tables").next();
  gd.skill = u < type.skill[0] ? 0 : u < type.skill[0] + type.skill[1] ? 1 : 2;
  gd.counter = (person ? hash01(person.id, 6) : rng(s, "tables").next()) < type.counters ? 1 : 0;
  if (gd.counter) gd.skill = 2;
  gd.browse = Math.round(type.browse * range(r, [0.5, 1.5]) * (1 - gd.know) * (gd.memDate >= 0 ? 0.3 : 1));
  // Drug users (M9.6): a pool person's for life (from their id); a one-off's on its own stream.
  if ((person ? hash01(person.id, 8) : rng(s, "vice").next()) < type.drugs) gd.drugs = 1;
  // Smokers (M6), drawn on their own stream so adding them left every other draw where it was.
  const rs = rng(s, "smokers");
  if (rs.chance(type.smokers)) { gd.smoker = 1; gd.urge = rs.int(0, 60); }
  // People who came for a meal, a show or the club don't sightsee first.
  if (INTENT_NEED[came]) gd.browse = 0;
  if (!gd.minor) gd.todo = todoFor(g, type, came);
  // (M11.3, owner) In a group that came for something else, another adult may leave it to the rest (mom takes the
  // kids to the show). They don't plan to gamble: they have time to themselves, and what's in view does the rest.
  if (lead && !gd.minor && came !== "gamble" && rng(s, "todo").chance(Math.min(0.8, type.hooks.free * SPLIT))) {
    const primary = INTENT_NEED[came] ? NEED_BIT[INTENT_NEED[came]] : 0;
    gd.todo &= ~primary;
  }
  // (M12, owner) What security taught: a pool person remembers what they were dealt with for, and beatings and
  // disappearances chill everyone for a while. They drink less, and a counter may not count tonight.
  if (person?.dt) gd.dt = person.dt;
  if (!gd.minor) {
    gd.intend *= deterOf(s, gd, "intox");
    if (gd.counter && !rng(s, "deter").chance(deterOf(s, gd, "count"))) gd.counter = 0;
  }
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
  const leader = spawnGuest(g, typeId, at, person, null, sexOf(), intent ?? pickIntent(g, typeId, rng(g.state, "arrivals")));
  if (!leader) return out;
  out.push(leader);
  // Families (M9.5): the first one or two are adults, the rest children.
  const adults = type?.kids ? r.int(type.kids.adults[0], type.kids.adults[1]) : n;
  for (let k = 1; k < n; k++) {
    const m = spawnGuest(g, typeId, at, null, leader, sexOf());
    if (!m) continue;
    if (k >= adults) makeMinor(m.g!);
    out.push(m);
  }
  g.bus.emit({ type: "arrived", guestType: typeId, n: out.length, regular: person ? 1 : 0, intent: leader.g!.intent });
  if (person && person.mark & 4) news(g, "warn", `Marked guest ${guestName(person.name)} is back.`, { a: leader.id });
  if (out.length > 1) groupMaps.delete(g);
  return out;
}

/** A child: no money, no drinking, no gambling, no hidden tags. */
function makeMinor(gd: GuestData) {
  Object.assign(gd, {
    minor: 1, drugs: 0, bankroll: 0, wallet: 0, withdrawCap: 0, atm: 0, stake: 0, intend: 0, drift: 0, smoker: 0, urge: 0,
    cheat: 0, luck: 0, take: 0, counter: 0, skill: 0, compSeek: 0, browse: 0, intent: "gamble",
  });
  gd.mem.startIntend = 0;
}

/** Group size for a new arrival of this type (1..8). */
export function groupSize(r: Rng, type: GuestTypeDef): number {
  return Math.min(8, 1 + pickIndex(r, type.group));
}

/**
 * (M11.2, owner) The visit's to-do list: what drew them, plus a chance at each other reason their type has that the
 * casino offers (1.5 × its weight, at most 60%). Gambling is on it only for those who came to gamble or drew it as an
 * extra; anyone else gambles only if something tempts them. Each adult draws their own extras. On its own stream.
 */
function todoFor(g: Game, type: GuestTypeDef, came: GuestData["intent"]): number {
  const r = rng(g.state, "todo"), off = offers(g, type);
  const bit = (k: string) => (k === "gamble" ? GAMBLE_BIT : k === "drink" ? DRINK_BIT : k === "sights" ? SIGHTS_BIT : INTENT_NEED[k] ? NEED_BIT[INTENT_NEED[k]] : 0);
  let t = bit(came);
  for (const k of Object.keys(type.reasons) as Reason[]) {
    if (k === came || off[k] <= 0) continue;
    if (r.chance(Math.min(0.6, 1.5 * type.reasons[k]))) t |= bit(k);
  }
  return t;
}

/** (M11.2) To-do items still possible here (the place exists, and they haven't given up finding it). */
function pendingTodo(g: Game, gd: GuestData): Need[] {
  if (!gd.todo) return [];
  return TODO.filter((w) => gd.todo & NEED_BIT[w] && g.has(w) && !(gd.gaveUp & NEED_BIT[w]));
}

/**
 * (M11.2, owner) Someone who didn't come to gamble: temptation first (a game they like on the way past, likelier the
 * more they're enjoying themselves, the drunker, the higher), a place they've seen that they'd like to try, then
 * looking around if they came for the sights, waiting on their list, a last stroll past the games, and home.
 */
function notGambling(g: Game, a: Agent, type: GuestTypeDef, r: Rng): void {
  const gd = a.g!;
  if (tempted(g, a, type, r)) return;
  impulse(g, a, type, r);
  if (gd.todo & SIGHTS_BIT) return sightsee(g, a, r);
  const drinking = gd.todo & DRINK_BIT && gd.intend > 0 && gd.intox < 0.8 * gd.intend && gd.mem.drinks < 4;
  if (drinking || pendingTodo(g, gd).length) return wander(g, a, r);
  if (gd.frus < STROLL_LEGS) { gd.frus++; return wander(g, a, r); }
  // (M11.3) Nothing left to do while the rest are at the show, the pool or golf: kill time on the floor.
  if (freeTime(g, a)) { if (r.chance(0.1)) think(g, a, "freeTime"); return wander(g, a, r); }
  wantToLeave(g, a, "done");
}

/** (M11.3) The rest of their group are busy at a show, the pool, golf, a meal or the club: time to themselves. */
function freeTime(g: Game, a: Agent): boolean {
  const others = companions(g, a);
  if (!others.length) return false;
  let busy = 0;
  for (const m of others) {
    if (m.act === "play" || m.g!.wait >= 0) return false;
    // At (or on the way to) something on the list: a show, a meal, golf, the pool, the club.
    const o = m.target >= 0 ? g.objById.get(m.target) : undefined;
    const serves = o && (OBJECTS[o.kind].serves as Need | undefined);
    if (serves && TODO.includes(serves)) busy++;
  }
  return busy > 0;
}

/**
 * (M11.3, owner) What's working on them right now, each 0..~2: drink, a good time (a show, the club, mood, a win
 * cheered nearby), time to themselves, and company playing in view. Flash is per game (`flashOf`).
 */
function hookPull(g: Game, a: Agent, type: GuestTypeDef): number {
  const gd = a.g!, h = type.hooks;
  const buzz = Math.min(2, gd.high + gd.buzz / 20 + Math.max(0, (gd.mood - 60) / 40) + Math.min(1, gd.mem.fun / (120 * TICKS_PER_SECOND)));
  const social = groupSeats(g, a).length ? 1 : 0;
  return 1 + h.drink * Math.min(2, 2 * gd.intox) + h.buzz * buzz + h.free * (freeTime(g, a) ? 1 : 0) + h.social * social;
}

/** (M11.3) Flash at a game, 0..~1.5: just paid a jackpot or a bonus, a big meter over it, a craps table in full swing. */
function flashOf(g: Game, gd: GuestData, o: import("./state").PlacedObject): number {
  let f = 0;
  if ((o.last.win === 2 || o.last.win === 3) && g.state.tick - o.last.tick < HOT_SECONDS * TICKS_PER_SECOND) f += 1;
  if (OBJECTS[o.kind].slot) f += Math.min(0.5, 4 * meterPull(g, gd.type, gd.stake, o));
  else if (isTable(o.kind) && (seatHolders(g, o.id) ?? []).filter((id) => id > 0).length >= LOOK_PLAYERS) f += 0.5;
  return f;
}

/**
 * (M11.3, owner) Someone who didn't plan to gamble: exposure (games they've liked on the way past this visit: the
 * layout's work) × match (how much they like the best game in view, and its flash, weighted by their `flash` hook) ×
 * state (mood) × what's working on them (hooks). A cheap first roll against the most it could be, then the real one.
 */
function tempted(g: Game, a: Agent, type: GuestTypeDef, r: Rng): boolean {
  const gd = a.g!;
  if (!canAffordAnything(g, gd)) return false;
  const expose = 0.6 + TEMPT_EXPOSE * Math.min(TEMPT_SEEN, gd.liked.length);
  const hooks = hookPull(g, a, type), state = 0.5 + gd.mood / 100;
  const pMax = TEMPT * expose * state * hooks * (TEMPT_MAX_WANT + type.hooks.flash * 1.5);
  const u = r.next();
  if (u >= Math.min(0.9, pMax)) return false;
  const seen = candidates(g, a, type, BROWSE_LOOKS);
  let want = 0;
  for (const c of seen) if (c.seen && c.appeal >= TEMPT_APPEAL) want = Math.max(want, Math.min(TEMPT_MAX_WANT, c.appeal) + type.hooks.flash * flashOf(g, gd, g.objById.get(c.o)!));
  if (want <= 0 || u >= Math.min(0.9, TEMPT * expose * state * hooks * want)) return false;
  if (!chooseMachine(g, a, type, r, TEMPT_APPEAL, seen)) return false;
  gd.todo |= GAMBLE_BIT;
  gd.wait = -1;
  think(g, a, "tempted");
  return true;
}

/** A place they've seen this visit that their type likes (and they haven't done yet) may go on the list. */
function impulse(g: Game, a: Agent, type: GuestTypeDef, r: Rng) {
  const gd = a.g!;
  for (const id of gd.seen) {
    const serves = OBJECTS[g.objById.get(id)?.kind ?? ""]?.serves as Need | undefined;
    if (!serves || !TODO.includes(serves)) continue;
    const bit = NEED_BIT[serves], k = COME_FOR[serves]!;
    if (gd.todo & (bit | (bit << DONE_SHIFT))) continue;
    if (serves === "hunger" && gd.needs.hunger < 40) continue;
    if (r.chance(IMPULSE * type.reasons[k])) { gd.todo |= bit; return; }
  }
}

/** Looking around: legs of wandering that are fun where the theming suits them; after SIGHT_LEGS, done. */
function sightsee(g: Game, a: Agent, r: Rng) {
  const gd = a.g!, type = GUEST_TYPES[gd.type], i = a.y * g.state.map.w + a.x;
  const sc = g.fields.themes.at(i), d = sc > 0 ? g.fields.themes.domAt(i) : -1;
  const like = sc > 0 ? sc * Math.max(0, 0.25 + THEME_TASTE * (d >= 0 ? type.themes[THEME_IDS[d]] ?? 0 : 0)) : 0;
  gd.mem.fun += Math.round(Math.min(2, like) * 3 * TICKS_PER_SECOND);
  gd.sight += like;
  if (++gd.frus >= SIGHT_LEGS) {
    gd.todo &= ~SIGHTS_BIT;
    gd.frus = 0;
    think(g, a, gd.sight >= 3 ? "niceSights" : "nothingToSee");
    if (gd.sight < 1) gd.mem.unmet++;
  }
  wander(g, a, r);
}


// ---------------------------------------------------------------------------------------------------------
// The visit score and departure.

export interface VisitScore { score: number; value: number; feel: number; needs: number; mood: number }

/** How the visit went: how long the money lasted per dollar lost (capped for winners), how good it felt, needs met, mood. */
export function visitScore(a: Agent): VisitScore {
  const gd = a.g!, type = GUEST_TYPES[gd.type];
  // Money gone on play, meals, shows, cover and doors, against time spent playing or having fun (M6).
  const lost = gd.mem.wagered - gd.mem.won + gd.mem.spent;
  // M8: time on thrilling machines counts for more, on dull ones for less (never below half the time played).
  const playSec = (gd.mem.playTicks + gd.mem.fun + Math.max(-0.5 * gd.mem.playTicks, gd.mem.thrill ?? 0)) / TICKS_PER_SECOND;
  // A trip with (almost) nothing done was wasted, whatever the money did.
  const value = playSec < 30 ? 0 : lost <= 0 ? 1 : Math.min(1, playSec / lost / type.secPerDollar);
  // (M11.2) Someone who never gambled judges the visit by the fun they had (a show, golf, the sights).
  const feel = gd.mem.rounds ? Math.min(1, 0.2 + (1.6 * gd.mem.feel) / gd.mem.rounds + 0.3 * Math.min(1, gd.mem.bigWin)) : Math.min(1, 0.3 + gd.mem.fun / (120 * TICKS_PER_SECOND));
  const mood = (gd.mem.moodN ? gd.mem.moodSum / gd.mem.moodN : gd.mood) / 100;
  const needs = Math.max(0, 1 - gd.mem.unmet / 3);
  // Thrown out by security: whatever else happened, the visit ended badly.
  // Beaten up: nothing else about the visit counts.
  // Stiffed on their winnings (M9): little else matters.
  let score = Math.max(0, Math.min(1, 0.35 * mood + 0.3 * value + 0.15 * feel + 0.2 * needs)) * (gd.hurt ? 0 : gd.mem.ejected ? 0.4 : 1) * (gd.unpaid ? 0.2 : 1);
  // (M11.2, owner) Leaving up is a good night, whatever else happened (unless they were hurt, thrown out or stiffed).
  if (gd.mem.won > gd.mem.wagered && !gd.hurt && !gd.mem.ejected && !gd.unpaid) score = Math.max(score, WINNER_SCORE);
  return { score, value, feel, needs, mood };
}

/**
 * The guest walks out (or is carried out): their visit becomes the person's memory, or word of mouth.
 * `vanished`: made to disappear (docs/spec/cheats.md): counted, but nobody takes anything home.
 */
export function depart(g: Game, a: Agent, vanished = false) {
  const gd = a.g!, s = g.state;
  release(g, a);
  // (M11.2) Leaving with the list unfinished: whatever they didn't get to do counts against the visit.
  // (Giving up finding it counts too: the want was real.)
  if (!gd.minor && !vanished && gd.todo) for (const w of TODO) if (gd.todo & NEED_BIT[w] && g.has(w)) { gd.mem.unmet++; think(g, a, `missed_${w}`); }
  const vs = visitScore(a);
  s.visits.today.left++;
  // Children tag along: the adults' visit is the family's.
  if (gd.minor) { g.bus.emit({ type: "departed", ...departedFields(g, a, vs.score), minor: 1 }); if (!vanished) walkAway(g, a); gone(g).add(a.id); return; }
  s.visits.today.satSum += vs.score;
  const row = surveyRow(s, gd.type);
  row.n++;
  row.score += vs.score;
  if (gd.why === "broke") s.visits.today.broke++;
  if (vs.score >= 0.72) think(g, a, "goodTime");
  else if (vs.score < 0.45) think(g, a, "badTime");
  if (gd.why === "broke" && vs.value < 0.5) think(g, a, "badValue");
  else if (vs.value >= 1 && gd.why !== "broke" && gd.mem.wagered > gd.mem.won) think(g, a, "goodValue");
  if (!vanished) { afterVisit(g, a, vs.score); comeBack(g, a); }
  if (gd.vip) whaleLeft(g, a);
  if (gd.mark & 2 && !vanished) news(g, "warn", `Marked guest ${guestName(gd.name)} is leaving.`, { a: a.id });
  g.bus.emit({ type: "departed", ...departedFields(g, a, vs.score), minor: 0 });
  if (!vanished) walkAway(g, a);
  gone(g).add(a.id);
}

/** What the "departed" event reports about a guest (reports and tests read it). */
function departedFields(g: Game, a: Agent, score: number) {
  const gd = a.g!, s = g.state;
  return {
    guestType: gd.type, pid: gd.pid, lead: gd.lead, minutes: (s.tick - gd.mem.arrived) / TICKS_PER_MIN, play: gd.mem.playTicks / TICKS_PER_MIN,
    budget: gd.bankroll, lost: gd.mem.wagered - gd.mem.won, intend: gd.mem.startIntend, peak: gd.mem.peak,
    atm: gd.atm > 0 ? 1 : 0, drinks: gd.mem.drinks, served: gd.mem.served, withdrawn: gd.withdrawn, trips: gd.trips, score, why: gd.why, chase: gd.chase,
    warned: gd.warned, ejected: gd.mem.ejected, cheat: gd.cheat, luck: gd.luck, caught: gd.caught, won: gd.mem.won, wagered: gd.mem.wagered,
    fun: gd.mem.fun / TICKS_PER_MIN, spent: gd.mem.spent, smoker: gd.smoker, skill: gd.skill, counter: gd.counter, marked: gd.mark & 1,
    vip: gd.vip, comp: gd.comp, unpaid: gd.unpaid, hotel: gd.door === s.map.lift ? 1 : 0, ev: gd.mem.ev, came: gd.intent, tilted: gd.tilted ?? 0, hosted: gd.hosted ? 1 : 0, drugs: gd.drugs,
  };
}

const goneSets = new WeakMap<Game, Set<number>>();
function gone(g: Game) { let s = goneSets.get(g); if (!s) goneSets.set(g, (s = new Set())); return s; }
/** (M12) Departed this tick (paramedics, a closure) and removed at the guests' next tick: not on the floor any more. */
export const isGone = (g: Game, id: number) => gone(g).has(id);

/**
 * Someone wants to go home. A group member (the leader too) waits for the others instead, unless it's urgent;
 * the leader leaving for an urgent reason takes the whole group along.
 */
function wantToLeave(g: Game, a: Agent, why: string) {
  const gd = a.g!;
  const urgent = why === "restroom" || why === "unhappy" || why === "hungry" || why === "tired" || why === "group";
  // Anything but urgent: wait for the others, the leader too (M11.2: a leader done or out of time used to take
  // everyone home mid-game). The group goes once everyone is ready, or half have waited WAIT_LONG.
  const waits = !urgent;
  // (M11.2) Not before they've done what they came to do: they stay on a while for it (once a visit).
  if (!urgent && why !== "broke" && !(gd.todo & TODO_EXT) && !gd.minor && pendingTodo(g, gd).length) {
    gd.todo |= TODO_EXT;
    // Done at the games (a quit rule): on to the rest of the list.
    if (why === "done") gd.todo &= ~GAMBLE_BIT;
    gd.floorTime = Math.max(gd.floorTime, g.state.tick - gd.mem.arrived + TODO_STAY * TICKS_PER_SECOND);
    think(g, a, "notYet");
    a.act = "idle";
    return;
  }
  const others = companions(g, a);
  // Children follow the adults: only an adult still playing is worth waiting for.
  if (waits && others.length && others.some((m) => !m.g!.minor && m.g!.wait < 0 && !m.g!.why)) {
    if (gd.wait < 0) { gd.wait = g.state.tick; think(g, a, "waiting"); }
    return standBy(g, a);
  }
  startLeaving(g, a, why);
}

/** A waiting member hangs around near the leader. */
function standBy(g: Game, a: Agent) {
  const r = rng(g.state, "guests");
  release(g, a);
  // (M11.2) Children stay with an adult who isn't gambling (at the show with mom while dad plays), if there is one.
  const gi = groups(g).get(a.g!.group);
  const lead = a.g!.minor ? gi?.members.find((m) => !m.g!.minor && m.act !== "play") ?? gi?.leader : gi?.leader;
  const near = lead ? nearbyTile(g, "guests", lead.x, lead.y, 3, a) : -1;
  if (near >= 0 && near !== a.y * g.state.map.w + a.x) return go(a, near, "wait");
  a.act = "wait";
  a.timer = r.int(5, 10) * TICKS_PER_SECOND;
}

/** Heads for the exit now (thrown out, escorted, the casino closing): no waiting for the group. */
export function sendHome(g: Game, a: Agent, why: string) {
  a.g!.why = why;
  a.act = "idle";
  a.timer = 0;
  startLeaving(g, a, why);
}

/** Could staff walk this guest out (past any door but a locked one, without a fee)? Walls are walls. */
function escapable(g: Game, a: Agent): boolean {
  const gd = a.g!, here = a.y * g.state.map.w + a.x;
  gd.esc = 1;
  const paths = g.pathsFor(a);
  gd.esc = 0;
  return g.state.map.entrances.some((e) => g.walkable(e) && paths.reachable(here, e));
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
  const paths = g.pathsFor(a);
  for (const e of ents) if (g.walkable(e) && paths.reachable(here, e)) open.push(e);
  // No way out they're allowed through: trapped, until the layout changes or staff come and let them out
  // (docs/spec/construction.md), which the police hear about.
  if (!open.length) {
    if (!gd.trapped) { gd.trapped = 1; gd.trapAt = g.state.tick; think(g, a, "trapped"); }
    gd.annoy += 4;
    if (!gd.esc && gd.trapAt >= 0 && g.state.tick - gd.trapAt >= LET_OUT * TICKS_PER_SECOND && escapable(g, a)) {
      gd.esc = 1;
      think(g, a, "letOut");
      adjustPolice(g, -1);
      news(g, "warn", "Staff let out a guest who was trapped behind your doors.", true);
      return startLeaving(g, a, why);
    }
    return wander(g, a, r);
  }
  gd.trapped = 0;
  gd.trapAt = -1;
  // An exit in view, or one a regular knows the way to: walk straight there. Hotel guests go back up the elevator.
  let best = -1, bd = Infinity;
  const lift = g.state.map.lift;
  if (lift >= 0 && gd.door === lift && open.includes(lift)) return go(a, lift, "leave");
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
  for (const what of ["thirst", "bladder", "cage", "atm", "hunger", "show", "club", "pool", "garden", "golf"] as Need[])
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
/** (Batch A) Waiting for a restroom: stand near the nearest one they know (a short hop there, then idle). */
function queueFor(g: Game, a: Agent, r: Rng) {
  const w = g.state.map.w, gd = a.g!;
  let best = -1, bd = Infinity;
  for (const o of g.amenities.bladder) {
    if (!gd.seen.includes(o.id) && !knowsRoute(gd, o)) continue;
    const t = faceTile(g, o), d = Math.abs((t % w) - a.x) + Math.abs(Math.floor(t / w) - a.y);
    if (d < bd) { bd = d; best = t; }
  }
  if (best < 0 || bd <= 2) return standBy(g, a);
  const paths = g.pathsFor(a), here = a.y * w + a.x;
  if (!paths.reachable(here, best)) return wander(g, a, r);
  go(a, best, "idle");
}

function goUse(g: Game, a: Agent, what: Need): "ok" | "full" | "unknown" {
  const gd = a.g!, w = g.state.map.w, here = a.y * w + a.x;
  let best = -1, bestSeat = -1, bd = Infinity, known = false;
  const paths = g.pathsFor(a);
  for (const o of g.amenities[what]) {
    const t = faceTile(g, o);
    const d = Math.abs((t % w) - a.x) + Math.abs(Math.floor(t / w) - a.y);
    // (M11.2) One they saw earlier this visit counts as known: they remember where it was.
    // (M11.2, owner) Somewhere on their to-do list: they know where it is (it's why they came, or on the plan).
    if (!knowsRoute(gd, o) && !gd.seen.includes(o.id) && !(gd.todo & NEED_BIT[what]) && (d > SIGHT || !canSee(g, here, t))) continue;
    if (!paths.reachable(here, t)) continue;
    known = true;
    // Priced places (a meal, a show, a club's cover): only if they can pay.
    if ((what === "hunger" || what === "show" || what === "pool" || (what === "club" && !(gd.paid & 1))) && priceFor(o) > gd.wallet + 1e-9) continue;
    const k = freeSeat(g, o.id);
    if (k < 0) continue;
    const st = seatTile(g, o.id, k);
    const ds = Math.abs((st % w) - a.x) + Math.abs(Math.floor(st / w) - a.y);
    if (ds < bd) { bd = ds; best = o.id; bestSeat = k; }
  }
  if (best < 0) return known ? "full" : "unknown";
  if (gd.seek === what || (gd.seek === "line" && what === "bladder")) { gd.seek = ""; gd.lost = 0; }
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
  // (M11.2) A door onto the room it's in reads like a sign.
  if (dest < 0) dest = doorLeg(g, a, targets);
  if (dest >= 0 && gd.lost >= 2 && r.chance(0.3)) think(g, a, "signHelped");
  if (dest < 0) dest = explore(g, a, r, (i) => fitAt(g, type, i, gd).score, toward, det);
  if (dest < 0) return false;
  go(a, dest, "idle");
  return true;
}

/** Hops a guest searches before giving up: longer in a good mood, shorter in a bad one. */
const giveUpAfter = (gd: GuestData) => (gd.mood > 65 ? GIVE_UP + 3 : gd.mood < 40 ? GIVE_UP - 2 : GIVE_UP);

/**
 * Search for an amenity the guest doesn't know the way to. False once they give up (and go without). Someone
 * who came for it (a meal, a show, the club) knows roughly where it is and keeps at it longer, but a maze still
 * defeats straight-line guessing.
 */
function seekNeed(g: Game, a: Agent, r: Rng, what: Need, det: number): boolean {
  const gd = a.g!;
  if (gd.gaveUp & NEED_BIT[what]) return false;
  const cameFor = INTENT_NEED[gd.intent] === what;
  if (gd.seek === what && gd.lost >= giveUpAfter(gd) + (cameFor ? 6 : 0) + (what === "bladder" ? 6 : 0)) {
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
  if (toward < 0 && cameFor) {
    const w = g.state.map.w;
    let bd = Infinity;
    for (const o of g.amenities[what]) {
      const t = faceTile(g, o), d = Math.abs((t % w) - a.x) + Math.abs(Math.floor(t / w) - a.y);
      if (d < bd) { bd = d; toward = t; }
    }
  }
  const targets: number[] = [];
  for (const o of g.amenities[what]) targets.push(faceTile(g, o));
  return search(g, a, r, what, targets, toward, det);
}

const MAX_CANDIDATES = 16;
/** Sight-line checks per look for machines: a glance, not a survey (fewer while just browsing). */
const MAX_LOOKS = 40;
const BROWSE_LOOKS = 16;
/** Machines considered per look at most, so a packed floor can't make one decision expensive. */
const MAX_SCAN = 400;
/** A machine seen paying a jackpot this recently is "hot" (seconds at 1×). */
const HOT_SECONDS = 30;

interface Candidate { o: number; appeal: number; d: number; seen: boolean }

/**
 * How much a guest wants to play at this game object, 0 or less for "not for me": the type's taste for the slot
 * model or the table game, and whether they can afford it (high-limit machines, M6: only for guests whose usual
 * stake covers the minimum). Tables (M7): open, within their limits, and the rules if they notice them.
 */
function gameAppeal(g: Game, type: GuestTypeDef, gd: GuestData, o: import("./state").PlacedObject): number {
  const def = OBJECTS[o.kind];
  // A whale (M9) plays only their game.
  if (gd.vip) return isTable(o.kind) && def.game === g.state.whale.game && tableOpen(g, o) && canSit(g, gd, o) ? 3 : 0;
  const v = tasteFor(g, type, gd, o);
  // (M11.3, owner) The seasoned look for the thinnest house edge; novices hardly notice it.
  // (M12) Each crowd's idea of a fair edge (High rollers: thinner than most; EDGE_REF for the rest).
  const ref = type.edgeRef ?? EDGE_REF;
  return v > 0.05 ? v + SAVVY_EDGE * savvyNow(gd) * Math.max(-1.5, Math.min(1, (ref - edgeOf(g, gd, o)) / ref)) : v;
}

/**
 * (M11.3, owner) Savvy as it stands now: drink and drugs override experience. A high roller on their third drink
 * with an escort on their arm stops picking thin edges and holding their limit.
 */
export function savvyNow(gd: GuestData): number {
  if (gd.tilt) return 0;
  return GUEST_TYPES[gd.type].savvy * Math.max(0, 1 - SAVVY_INTOX * gd.intox - SAVVY_HIGH * gd.high - (gd.arm ? SAVVY_ESCORT : 0));
}
/** (M12) An escort on their arm counts like SAVVY_ESCORT of discipline gone (about two drinks), and as ARM_INHIBIT toward tilt. */
const SAVVY_INTOX = 0.8, SAVVY_HIGH = 0.5, SAVVY_ESCORT = 0.35, ARM_INHIBIT = 0.3, TILT_REF = 0.3;

/**
 * (M11.3, owner) Showing off: with friends around, a guest bets bigger, by their crowd's `social` hook (party groups
 * most). Up to SHOW_OFF × the hook with two or more of the group within SHOW_REACH tiles.
 */
export function showOff(g: Game, a: Agent): number {
  const gd = a.g!, h = GUEST_TYPES[gd.type].hooks.social;
  // (M12) Showing off for the escort on their arm: bets as with a crowd of friends watching, whatever the crowd.
  if (gd.arm) return 1 + SHOW_OFF * Math.max(1, h);
  if (!h) return 1;
  let n = 0;
  for (const m of companions(g, a)) if (!m.g!.minor && Math.abs(m.x - a.x) + Math.abs(m.y - a.y) <= SHOW_REACH && ++n >= 2) break;
  return 1 + SHOW_OFF * h * (n / 2);
}
const SHOW_OFF = 0.25, SHOW_REACH = 4;

/** (M11.3) How much a savvy guest's eye for the house edge moves appeal, and the edge they call fair. */
const SAVVY_EDGE = 0.6, EDGE_REF = 0.06;
/** Table games' usual edge where it doesn't depend on the table's rules or the player (poker: the rake). */
const GAME_EDGE: Record<string, number> = { craps: 0.014, baccarat: 0.011, poker: 0.05, keno: 0.25, bingo: 0.3, sports: 0.045 };

/** (M11.3) The house edge against this guest at this game, as a seasoned player would reckon it. */
export function edgeOf(g: Game, gd: GuestData, o: import("./state").PlacedObject): number {
  const m = machineModel(g.state, o, gd);
  if (m) return 1 - m.rtp;
  const game = OBJECTS[o.kind].game ?? "";
  if (game === "blackjack") return bjEdge(o.rules, gd.skill, gd.counter);
  if (game === "roulette") return 1 - 36 / pockets(o.rules);
  return GAME_EDGE[game] ?? EDGE_REF;
}

/** Taste for the game before the house edge: the model or table game, and whether they can afford it. */
function tasteFor(g: Game, type: GuestTypeDef, gd: GuestData, o: import("./state").PlacedObject): number {
  const def = OBJECTS[o.kind];
  if (isTable(o.kind)) return tableOpen(g, o) && canSit(g, gd, o) ? tableAppeal(g, gd, o) : 0;
  const inf = def.slot ? slotInfo(g.state, o) : undefined;
  const m = inf ? inf.c.model : machineModel(g.state, o, gd);
  if (!m) return 0;
  const mult = stakeMult(g, o);
  if (betOf(m, 1) * mult * WAGERS_PER_ROUND > gd.wallet || (mult > 1 && gd.stake < m.denom * (m.minCredits ?? 1) * mult)) return 0;
  if (def.game) return (type.games[def.game] ?? 0) + type.rules * rulesScore(def.game, o.rules) * 0.5;
  // (M8.6) A regular's own history with the design: bored of it, or a fan.
  return slotAppeal(g, gd.type, o, inf) + (inf?.prog ? meterPull(g, gd.type, gd.stake, o, inf) : 0) + (inf ? personalPull(g, gd, inf.id) : 0);
}

/**
 * (M11.1) Engagement at the game they're sitting at (docs/spec/guests.md "Engagement and draw"): how well the spot
 * suits them and how much they like the game. Above 1 they play faster, bet more, stay longer and lose more before
 * they stop; below 1, the reverse. Pure (recomputed where it's used), so nothing extra is saved.
 */
export function engagement(g: Game, a: Agent): number {
  const c = engageParts(g, a);
  return c ? Math.max(ENGAGE.min, Math.min(ENGAGE.max, 1 + ENGAGE.fit * (c.fit - ENGAGE.fitMid) + ENGAGE.game * (c.app - ENGAGE.gameMid))) : 1;
}

/** The two parts of engagement: how well the spot suits them and how much they like the game (reports read these). */
export function engageParts(g: Game, a: Agent): { fit: number; app: number } | null {
  const gd = a.g, o = gd && g.objById.get(a.target);
  if (!gd || !o || gd.vip) return null;
  const type = GUEST_TYPES[gd.type];
  return { fit: fitAt(g, type, a.y * g.state.map.w + a.x, gd).score, app: gameAppeal(g, type, gd, o) };
}

/**
 * (M8.5) A big progressive meter pulls guests in (owner): each doubling of the biggest meter they could win, against
 * their own bet, adds the same, so every dollar counts for less; a bank sign showing it nearby carries it further.
 */
export function meterPull(g: Game, type: string, stake: number, o: import("./state").PlacedObject, info = slotInfo(g.state, o)): number {
  const top = topMeter(g.state, o, stake, info);
  if (top <= 0) return 0;
  const dbl = Math.min(6, Math.log2(top / (Math.max(0.01, stake) * 200)));
  if (dbl <= 0) return 0;
  const id = info?.id;
  const signed = g.bankSigns.some((b) => Math.max(Math.abs(b.x - o.x), Math.abs(b.y - o.y)) <= 10 && signDesign(g, b) === id);
  return 0.025 * Math.min(1.5, SLOT_TASTES[type]?.dream ?? 0.5) * dbl * (signed ? 1.6 : 1);
}

/**
 * (M8) A slot design's appeal to a type (docs/spec/designer.md §5), and how it sits in its room: a design whose theme
 * matches the room's (or pairs well with it) pleases guests who care about theming; a clash puts them off.
 */
export function slotAppeal(g: Game, type: string, o: import("./state").PlacedObject, info = slotInfo(g.state, o)): number {
  if (!info) return 0;
  // (M8.6) Word of mouth, novelty and variety: how the design stands on this floor today.
  const ver = marketVersion();
  if (info.mv !== ver) { info.am.clear(); info.mv = ver; }
  let v = info.am.get(type);
  if (v === undefined) {
    let base = info.ap.get(type);
    if (base === undefined) info.ap.set(type, (base = judged(info.c, type).appeal));
    info.am.set(type, (v = base * marketFactor(g, info.id, type)));
  }
  const th = g.fields.themes;
  if (th.active) {
    const dom = th.dom[o.y * g.state.map.w + o.x];
    if (dom >= 0) v += GUEST_TYPES[type].theming * info.th[dom];
  }
  return v;
}

/** The cheapest games (quarter slots and video poker) are where comp-seekers sit. */
const cheapGame = (g: Game, o: import("./state").PlacedObject) => !isTable(o.kind) && minRoundOf(g.state, o) <= 0.25 * WAGERS_PER_ROUND + 1e-9;

/**
 * Free, working machines a guest would consider: ones in view, or ones a regular knows the way to. Searched in
 * rings of 16×16 sectors outward from the guest, keeping the MAX_CANDIDATES nearest.
 */
function candidates(g: Game, a: Agent, type: GuestTypeDef, maxLooks = MAX_LOOKS): Candidate[] {
  const gd = a.g!, { w, h } = g.state.map, here = a.y * w + a.x;
  // Look up to 3 sectors away (~50 tiles): guests don't know about machines across a huge floor.
  // Anything in sight lies within one sector ring; farther rings only hold machines a regular remembers.
  const sx = a.x >> 4, sy = a.y >> 4, maxR = Math.min(gd.memDate >= 0 || gd.liked.length ? 3 : 1, Math.max(w, h) >> 4);
  const out: Candidate[] = [];
  let looks = maxLooks, scan = MAX_SCAN;
  for (let r = 0; r <= maxR; r++) {
    for (let y = sy - r; y <= sy + r; y++) for (let x = sx - r; x <= sx + r; x++) {
      if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) !== r || x < 0 || y < 0) continue;
      const list = g.slotSectors.get(y * 4096 + x);
      if (!list) continue;
      for (const o of list) {
        if (--scan < 0) return out;
        if (o.broken) continue;
        const appeal = gameAppeal(g, type, gd, o);
        if (appeal <= 0.05 || freeSeat(g, o.id) < 0) continue;
        const d = Math.abs(o.x - a.x) + Math.abs(o.y - a.y);
        // Keep the nearest few, sorted by distance (ties by id, so the order is deterministic).
        if (out.length >= MAX_CANDIDATES && d >= out[out.length - 1].d) continue;
        // Known routes first (a cheap hash); sight lines only for the rest, and only so many per look.
        // Known: a regular's remembered route, or one they saw and liked earlier this visit.
        const known = knowsRoute(gd, o) || gd.liked.includes(o.id);
        const seen = !known && d <= SIGHT + 1 && looks-- > 0 && canSee(g, here, seatTile(g, o.id, 0));
        if (!seen && !known) continue;
        if (seen && appeal >= 0.5) { gd.liked.push(o.id); if (gd.liked.length > LIKED_CAP) gd.liked.shift(); }
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
/** `liked`: only one in view they really like (true: appeal 0.9+; a number: at least that appeal) in a spot they don't mind. */
function chooseMachine(g: Game, a: Agent, type: GuestTypeDef, r: Rng, liked: boolean | number = false, found?: Candidate[]): boolean {
  const w = g.state.map.w, gd = a.g!, tick = g.state.tick;
  const mates = groupSeats(g, a);
  const cheap = compSeeking(g, gd), fan = fanOf(g, gd);
  let best = -1, bestScore = -Infinity, far = false, hot = false, badRules = false;
  for (const c of found ?? candidates(g, a, type)) {
    if (liked && !c.seen) continue;
    const t = seatTile(g, c.o, 0);
    const o = g.objById.get(c.o)!;
    const d = Math.abs((t % w) - a.x) + Math.abs(Math.floor(t / w) - a.y);
    // What's in front of them pulls a little harder than what they remember.
    // The spot matters as much as the machine: guests settle where they like the surroundings.
    const fit = fitAt(g, type, t, gd).score;
    let score = c.appeal * 2 + fit * 0.8 - d / 25 + (c.seen ? 0.3 : 0) + r.next() * 0.6;
    if (liked !== false && (c.appeal < (liked === true ? 0.9 : liked) || fit < 0)) continue;
    // Hot machine belief: one they just saw pay out.
    // M8: a machine seen in a free spins feature looks hot too.
    const isHot = c.seen && (o.last.win === 2 || o.last.win === 3) && tick - o.last.tick < HOT_SECONDS * TICKS_PER_SECOND;
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
    if (cheap) score += cheapGame(g, o) ? 1.5 : -0.5;
    // (M8.5) Hunters look for a meter about to pop or a collector someone left nearly full.
    if (gd.hunter && OBJECTS[o.kind].slot) score += huntEdge(g.state, o) > 0 ? 4 : -1.2;
    // (M8.6) A fan heads for their game.
    if (fan && OBJECTS[o.kind].slot && slotInfo(g.state, o)?.id === fan) score += 0.8;
    // Rules-aware guests (M7) remark on a table's rules when they see bad ones.
    if (c.seen && type.rules && OBJECTS[o.kind].game && rulesScore(OBJECTS[o.kind].game!, o.rules) <= -0.5) badRules = true;
    if (score > bestScore) { bestScore = score; best = c.o; far = c.seen && d > 6; hot = isHot; }
  }
  if (badRules && r.chance(0.15)) think(g, a, "badRules");
  if (best < 0) return false;
  const bo = g.objById.get(best)!, bg = OBJECTS[bo.kind].game;
  const pull = OBJECTS[bo.kind].slot ? meterPull(g, gd.type, gd.stake, bo) : 0;
  if (gd.hunter && OBJECTS[bo.kind].slot && huntEdge(g.state, bo) > 0) {
    gd.game = slotInfo(g.state, bo)?.id;
    if (r.chance(0.5)) { think(g, a, "slotHunt"); noteThought(g.state, gameKey(bo), "slotHunt"); }
  } else if (fan && gd.mem.rounds === 0 && OBJECTS[bo.kind].slot && slotInfo(g.state, bo)?.id === fan && r.chance(0.5)) {
    gd.game = fan;
    think(g, a, "slotCameFor");
    noteThought(g.state, fan, "slotCameFor");
  } else if (pull > 0.12 && r.chance(0.3)) { gd.game = slotInfo(g.state, bo)?.id; think(g, a, "slotMeter"); noteThought(g.state, gameKey(bo), "slotMeter"); }
  else if (hot && r.chance(0.5)) think(g, a, "hot");
  else if (bg && type.rules && rulesScore(bg, bo.rules) >= 0.5 && r.chance(0.2)) think(g, a, "goodRules");
  else if (bg && isTable(bo.kind) && !TABLE_GAMES[bg].pool && tableWant(gd) > limitsNow(g, bo)[1] * 1.5 && r.chance(0.3)) think(g, a, "lowLimits");
  else if (far && r.chance(0.15)) think(g, a, "ooh");
  claim(g, a, best, freeSeat(g, best));
  go(a, seatTile(g, best, a.seat), "play");
  return true;
}

function canAffordAnything(g: Game, gd: GuestData): boolean {
  // Nothing to play at all is not a money problem.
  return g.minRound === Infinity || g.minRound <= gd.wallet + 1e-9;
}

/**
 * Browse: walk to the most inviting view nearby (indoors: the casino is inside), then think again. The kinds of
 * surroundings a type likes pull harder while sightseeing.
 */
function wander(g: Game, a: Agent, r: Rng) {
  const type = GUEST_TYPES[a.g!.type], out = g.state.map.outdoor, pull = a.g!.browse > 0 ? 2.5 : 1.5;
  let dest = explore(g, a, r, (i) => (out[i] ? -2 : fitAt(g, type, i, a.g).score * pull));
  if (dest < 0) dest = nearbyTile(g, "guests", a.x, a.y, 8, a);
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
  // (M11.4) On tilt: back to the machine for more, every time, until it's gone.
  if (gd.tilt) { gd.mem.atmYes = gd.trips + 1; return true; }
  const down = Math.max(0, Math.min(1, -net(gd) / staked(gd)));
  // (M11.3) Novices go back for more; the disciplined rarely do.
  let p = type.atm.again + (0.1 + 0.4 * (1 - savvyNow(gd))) * down + 0.5 * gd.intox + 0.6 * gd.chase + (gd.mood < 40 ? 0.1 : 0) - (net(gd) > 0 ? 0.3 : 0);
  p *= gd.trips === 0 ? 1 : Math.pow(0.6, gd.trips) * (1 + 2 * gd.chase);
  if (!r.chance(Math.max(0.01, Math.min(0.97, p)))) return false;
  gd.mem.atmYes = gd.trips + 1;
  return true;
}

/** Seconds a guest who found the bar full (or couldn't pay) puts off trying again. */
const BAR_RETRY = 60;

/**
 * A trip to the bar: only with nothing in hand, money for a drink, and real thirst (a little less for drinkers
 * still below the level they mean to reach). Most drinks come from servers instead.
 */
function wantsDrink(g: Game, gd: GuestData): boolean {
  if (gd.drink > 0 || gd.wallet < DRINK_PRICE || g.state.tick < gd.mem.barAt) return false;
  return gd.needs.thirst >= 70 || (gd.intend > 0 && gd.intox < gd.intend - 0.05 && gd.needs.thirst >= 55);
}

/** At the bar: order a drink from the bartender. False when they can't (can't pay, or already holding one). */
function orderAtBar(g: Game, a: Agent): boolean {
  const o = g.objById.get(a.target), gd = a.g!;
  if (!o) return false;
  const pol = barPolicy(o);
  const ok = serveDrink(g, a, o, "bar", rollComp(g, gd, pol));
  if (!ok) gd.mem.barAt = g.state.tick + BAR_RETRY * TICKS_PER_SECOND;
  if (ok && rng(g.state, "guests").chance(0.1)) litter(g, a.y * g.state.map.w + a.x, a);
  return ok;
}

/** Finished one at the bar: another? While below their level (or still thirsty), with money and time left. */
function anotherRound(g: Game, a: Agent): boolean {
  const gd = a.g!, o = g.objById.get(a.target);
  if (!o || gd.why || a.timer > BAR_ROUNDS || g.state.tick - gd.mem.arrived >= gd.floorTime) return false;
  if (gd.wallet < priceAt(barPolicy(o), gd)) return false;
  return (gd.intend > 0 && gd.intox < gd.intend) || gd.needs.thirst >= 50;
}

/** Pay for a meal, a ticket, a cover charge. */
function pay(g: Game, gd: GuestData, amount: number, cat: string) {
  if (amount <= 0) return;
  gd.wallet -= amount;
  gd.mem.spent += amount;
  post(g, cat, amount);
}

/** Try to use an amenity serving `what`: true when on the way, or searching for it. */
function tryAmenity(g: Game, a: Agent, r: Rng, what: Need, det: number): boolean {
  const gd = a.g!;
  if (!g.has(what) || gd.gaveUp & NEED_BIT[what] || g.state.tick < gd.mem.eatAt) return false;
  const use = goUse(g, a, what);
  if (use === "ok") return true;
  if (use === "unknown") return seekNeed(g, a, r, what, det);
  // (M11.2) Which place was full, so the survey can say what there's too little of.
  think(g, a, what === "hunger" ? "foodLine" : what === "show" ? "showFull" : what === "golf" ? "golfLine" : "line");
  gd.annoy += 2;
  gd.mem.eatAt = g.state.tick + 60 * TICKS_PER_SECOND;
  return false;
}

/**
 * Tiles where a smoker can light up: smoking rooms, then the outdoor lot, by 16×16 sector. Runtime cache; rooms
 * are re-detected on every layout or purpose change, so a new room list means a stale cache.
 */
const smokeSpots = new WeakMap<Game, { rooms: unknown; by: Map<number, number[]> }>();
function spotsToSmoke(g: Game): Map<number, number[]> {
  const c = smokeSpots.get(g);
  if (c && c.rooms === g.rooms.rooms) return c.by;
  const m = g.state.map, by = new Map<number, number[]>();
  for (let i = 0; i < m.terrain.length; i++) {
    if (!g.walkable(i) || g.seatAt[i] || m.terrain[i] !== T.FLOOR) continue;
    if (purposeAt(g, i) !== "smoking" && !m.outdoor[i]) continue;
    const x = i % m.w, key = (((i - x) / m.w) >> 4) * 4096 + (x >> 4);
    let L = by.get(key);
    if (!L) by.set(key, (L = []));
    L.push(i);
  }
  smokeSpots.set(g, { rooms: g.rooms.rooms, by });
  return by;
}

/** A smoker who needs one walks to the nearest spot they can reach (smoking room or outside), searching outward. */
function goSmoke(g: Game, a: Agent): boolean {
  const { w, h } = g.state.map, here = a.y * w + a.x, paths = g.pathsFor(a), by = spotsToSmoke(g);
  if (!by.size) return false;
  const sx = a.x >> 4, sy = a.y >> 4, maxR = Math.max(w, h) >> 4;
  for (let r = 0; r <= maxR; r++) {
    let best = -1, bd = Infinity, checks = 0;
    for (let y = sy - r; y <= sy + r; y++) for (let x = sx - r; x <= sx + r; x++) {
      if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) !== r || x < 0 || y < 0) continue;
      for (const t of by.get(y * 4096 + x) ?? []) {
        const d = Math.abs((t % w) - a.x) + Math.abs(Math.floor(t / w) - a.y);
        // Reachability checks are the expensive part: only for closer candidates, a few per ring.
        if (d >= bd || checks > 16) continue;
        checks++;
        if (paths.reachable(here, t)) { bd = d; best = t; }
      }
    }
    if (best >= 0) { go(a, best, "smoke"); return true; }
  }
  return false;
}

/**
 * Before the machines (M6): what they came for (a meal, a show, the club), then hunger with a restaurant to go
 * to, sore feet with a show to sit through, and a smoker's urge. True when that's what they're doing now.
 */
function amenityFirst(g: Game, a: Agent, r: Rng): boolean {
  const gd = a.g!, n = gd.needs;
  // (M11.2) The to-do list: what drew them first, the rest once they've settled in. A full place or a line keeps
  // the item for later; a place that's gone, or that they gave up finding, comes off the list.
  const want = INTENT_NEED[gd.intent], since = g.state.tick - gd.mem.arrived;
  for (const what of want ? [want, ...TODO.filter((w) => w !== want)] : TODO) {
    const bit = NEED_BIT[what];
    if (!(gd.todo & bit)) continue;
    if (!g.has(what)) { gd.todo &= ~bit; continue; }
    if (gd.gaveUp & bit) continue;
    if (what !== want && since < TODO_LATER * gd.floorTime) continue;
    if (what === "hunger" && what !== want && n.hunger < 40) continue;
    if (tryAmenity(g, a, r, what, what === want ? 0.9 : 0.6)) return true;
  }
  if (n.hunger >= 70 && tryAmenity(g, a, r, "hunger", n.hunger / 50)) return true;
  if (n.fatigue >= 80 && tryAmenity(g, a, r, "show", 0.6)) return true;
  // M6.5: sore feet, and a garden bench to sit on.
  if (n.fatigue >= 70 && tryAmenity(g, a, r, "garden", 0.6)) return true;
  if (gd.smoker && gd.urge >= 100 && !(gd.gaveUp & SMOKE_BIT)) {
    if (goSmoke(g, a)) return true;
    // Nowhere to smoke: they cut the visit short.
    gd.gaveUp |= SMOKE_BIT;
    think(g, a, "needSmoke");
    gd.annoy += 4;
    gd.floorTime = Math.min(gd.floorTime, g.state.tick - gd.mem.arrived + 90 * TICKS_PER_SECOND);
  }
  return false;
}

/** Finished a meal, a show or dancing: whatever they came for is done; some go on to gamble. */
function doneWith(g: Game, a: Agent, _r: Rng) {
  const gd = a.g!;
  const o = g.objById.get(a.target);
  // (M11.2) Off the list.
  const serves = o && OBJECTS[o.kind].serves;
  if (serves && serves in NEED_BIT) { gd.todo &= ~NEED_BIT[serves as Need]; gd.todo |= NEED_BIT[serves as Need] << DONE_SHIFT; }
  // (M11.2) A good time makes a game look tempting on the way out (buzz and mood feed `tempted`).
  if (o) o.st.uses++;
  release(g, a);
  a.act = "idle";
}

function decide(g: Game, a: Agent) {
  const gd = a.g!, type = GUEST_TYPES[gd.type], n = gd.needs;
  const r = rng(g.state, "guests");
  lookAround(g, a);
  if (gd.why) return startLeaving(g, a, gd.why);
  // Children (M9.5) stay near the adults; a restroom trip is the only thing they do on their own.
  if (gd.minor) {
    if (n.bladder >= 70 && g.has("bladder") && !(gd.gaveUp & NEED_BIT.bladder) && goUse(g, a, "bladder") === "ok") return;
    return standBy(g, a);
  }
  if (n.fatigue >= 100) { think(g, a, "tired"); return startLeaving(g, a, "tired"); }
  if (gd.mood < 15) { think(g, a, "badTime"); return startLeaving(g, a, "unhappy"); }
  if (n.hunger >= 100) { think(g, a, "hungry"); gd.mem.unmet++; return startLeaving(g, a, "hungry"); }
  if (n.bladder >= 70) {
    if (!g.has("bladder") || gd.gaveUp & NEED_BIT.bladder) {
      if (n.bladder >= 90) { think(g, a, "noRestroom"); gd.mem.unmet++; return startLeaving(g, a, "restroom"); }
    } else {
      const use = goUse(g, a, "bladder");
      if (use === "ok") return;
      // (Batch A, owner: "everyone's complaining about lines") Every restroom they know is full. Before, they
      // complained and wandered off at every decision (thousands of complaints for a few dozen real waits). Now: go
      // look for one they haven't found while it isn't urgent; else wait by the nearest, grumbling once per wait.
      if (use === "full") {
        if (n.bladder < 85 && gd.seek !== "line" && !(gd.seek === "bladder" && gd.lost >= 2) && g.amenities.bladder.some((o) => !gd.seen.includes(o.id) && !knowsRoute(gd, o)) && seekNeed(g, a, r, "bladder", n.bladder / 40)) return;
        if (gd.seek !== "line") { gd.seek = "line"; gd.lost = 0; }
        if (++gd.lost === 3) { think(g, a, "restroomLine"); gd.annoy += 3; }
        if (gd.lost >= 12 && n.bladder >= 95) { think(g, a, "restroomLine"); gd.mem.unmet++; return startLeaving(g, a, "restroom"); }
        return queueFor(g, a, r);
      }
      // The more urgent, the more single-minded the search.
      if (seekNeed(g, a, r, "bladder", n.bladder / 40)) return;
    }
  }
  // Waiting on the group: stay put (a restroom trip above is still allowed). (M11.3) Someone who hasn't gambled yet
  // can be tempted by a game where they wait: what's by the show exit or the pool gate is a layout lever.
  if (gd.wait >= 0) {
    if (!gd.mem.rounds && gd.why !== "broke" && !gd.minor && tempted(g, a, type, r)) return;
    return standBy(g, a);
  }
  if (g.state.tick - gd.mem.arrived >= gd.floorTime && !gd.tilt) { think(g, a, "timeToGo"); return wantToLeave(g, a, "time"); }
  if (amenityFirst(g, a, r)) return;
  const firstDrink = gd.intent === "drink" && gd.mem.drinks === 0 && gd.drink === 0 && gd.wallet >= DRINK_PRICE;
  // Came for a drink, but a machine they like catches their eye: "just one quick spin".
  if (firstDrink && r.chance(QUICK_SPIN) && chooseMachine(g, a, type, r, true)) { gd.todo |= GAMBLE_BIT; think(g, a, "quickSpin"); return; }
  if (wantsDrink(g, gd) || firstDrink) {
    const use = g.has("thirst") && !(gd.gaveUp & NEED_BIT.thirst) ? goUse(g, a, "thirst") : "none";
    if (use === "ok") return;
    if (use === "unknown" && seekNeed(g, a, r, "thirst", 0.8)) return;
    if (use === "none") { if (!g.has("thirst")) { think(g, a, "noBar"); gd.mem.unmet++; } gd.mem.barAt = g.state.tick + BAR_RETRY * TICKS_PER_SECOND; }
    else if (use === "full") { think(g, a, "barLine"); gd.annoy += 2; gd.mem.barAt = g.state.tick + BAR_RETRY * TICKS_PER_SECOND; }
    else gd.mem.barAt = g.state.tick + BAR_RETRY * TICKS_PER_SECOND;
  }
  if (!canAffordAnything(g, gd)) {
    if (wantsAtm(g, a, r)) {
      const use = goUse(g, a, "atm");
      if (use === "ok" || (use === "unknown" && seekNeed(g, a, r, "atm", 0.8))) return;
    }
    think(g, a, "broke");
    return wantToLeave(g, a, "broke");
  }
  // Wandered outside: back in through the door.
  if (headInside(g, a)) return;
  // (M11.2, owner) Not here to gamble: they gamble only if something tempts them.
  if (!(gd.todo & GAMBLE_BIT)) return notGambling(g, a, type, r);
  impulse(g, a, type, r);
  // Sightseeing first: get a feel for the place, noting machines they like; a real standout can win them over early.
  if (gd.browse > 0) {
    // A lighter glance while sightseeing; one look serves both noting machines and spotting a standout.
    const seen = candidates(g, a, type, BROWSE_LOOKS);
    if (r.chance(0.2) && chooseMachine(g, a, type, r, true, seen)) { think(g, a, "ooh"); return; }
    return wander(g, a, r);
  }
  // A craps table in full swing draws a crowd (M7): some stop to watch.
  if (watchTable(g, a, r)) return;
  if (chooseMachine(g, a, type, r)) { gd.frus = Math.max(0, gd.frus - 3); return; }
  // Regulars check their favorite spots one by one.
  if (goToFavorite(g, a)) return;
  // (M11.2) Nothing free in view: walk down the nearest aisle with a free game, as anyone does in a casino.
  if (r.chance(AISLE_LOOK) && walkTheAisles(g, a)) return;
  gd.frus += gd.mood < 40 ? 1.5 : gd.mood > 65 ? 0.5 : 1;
  if (gd.frus >= FRUSTRATED) { gd.mem.unmet++; return wantToLeave(g, a, "nothing"); }
  if (gd.frus >= 4 && gd.frus - 1.5 < 4) think(g, a, "cantFind");
  if (gd.frus >= 4) gd.annoy += 1;
  wander(g, a, r);
}

/** (M11.2) Chance a gambler with nothing free in view walks toward the nearest free game instead of wandering; how far they look (tiles). */
const AISLE_LOOK = 0.7;
const AISLE_REACH = 30;

/** Heads for the nearest free game seat within AISLE_REACH they can walk to (they'll see it when they get there). */
function walkTheAisles(g: Game, a: Agent): boolean {
  const w = g.state.map.w, here = a.y * w + a.x, paths = g.pathsFor(a);
  let best = -1, bd = AISLE_REACH + 1;
  for (const [id, tiles] of g.seatTiles) {
    const o = g.objById.get(id);
    if (!o || o.broken || !isGame(o.kind)) continue;
    const t = tiles[0], d = Math.abs((t % w) - a.x) + Math.abs(Math.floor(t / w) - a.y);
    if (d >= bd || freeSeat(g, id) < 0 || !paths.reachable(here, t)) continue;
    best = t; bd = d;
  }
  if (best < 0 || best === here) return false;
  go(a, best, "idle");
  return true;
}

/** Seconds onlookers watch a craps table; players it takes to draw them; chance a passer-by stops to look. */
const LOOK_SECS: [number, number] = [20, 40];
const LOOK_PLAYERS = 3;
const LOOK_CHANCE = 0.3;

/** A guest who sees a busy craps table nearby may stop at its rail to watch (docs/spec/tables.md §Onlookers). */
function watchTable(g: Game, a: Agent, r: Rng): boolean {
  const gd = a.g!;
  if (gd.mem.fun > 0 && r.chance(0.5)) return false;
  const w = g.state.map.w, here = a.y * w + a.x;
  // (M8.5) A slot in a big bonus draws a crowd too.
  // In id order, so a reloaded game (whose index is rebuilt) draws the same.
  for (const [id, until] of [...g.bonusNow].sort((p, q) => p[0] - q[0])) {
    const o = g.objById.get(id);
    if (until <= g.state.tick) { g.bonusNow.delete(id); if (o) delete o.bonus; continue; }
    if (!o || Math.abs(o.x - a.x) + Math.abs(o.y - a.y) > SIGHT || !canSee(g, here, o.y * w + o.x) || !r.chance(LOOK_CHANCE)) continue;
    if (lookSpot(g, a, o, r, here)) { gd.look = 1; return true; }
  }
  for (const o of g.tables) {
    const fam = OBJECTS[o.kind].game!;
    if (!TABLE_GAMES[fam].onlookers || Math.abs(o.x - a.x) + Math.abs(o.y - a.y) > SIGHT) continue;
    const n = (seatHolders(g, o.id) ?? []).filter((id) => id > 0).length;
    if (n < LOOK_PLAYERS || !canSee(g, here, o.y * w + o.x) || !r.chance(LOOK_CHANCE)) continue;
    // A spot at the rail: a free tile just beyond the players.
    if (lookSpot(g, a, o, r, here)) { gd.look = 0; return true; }
  }
  return false;
}
/** Walks to a free tile just beyond a game's players to watch it. */
function lookSpot(g: Game, a: Agent, o: import("./state").PlacedObject, r: Rng, here: number): boolean {
  const w = g.state.map.w, { w: ow, h: oh } = objSize(o);
  for (let k = 0; k < 8; k++) {
    const x = o.x - 2 + r.int(0, ow + 3), y = o.y - 2 + r.int(0, oh + 3), t = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= g.state.map.h) continue;
    if (covers(o, x, y) || !g.walkable(t) || g.seatAt[t] || !g.pathsFor(a).reachable(here, t)) continue;
    go(a, t, "look");
    a.target = o.id;
    return true;
  }
  return false;
}

/** Walk to the next of a regular's favorite spots that they haven't checked yet this round. */
function goToFavorite(g: Game, a: Agent): boolean {
  const gd = a.g!, w = g.state.map.w, here = a.y * w + a.x;
  const fav = gd.pid >= 0 ? personOf(g, gd.pid)?.fav ?? [] : [];
  while (gd.favAt < fav.length) {
    const t = fav[gd.favAt++];
    if (t === here || !g.walkable(t) || !g.pathsFor(a).reachable(here, t)) continue;
    go(a, t, "idle");
    return true;
  }
  return false;
}

/** A session ends: the seat of their best one this visit (long, and in a good mood) may become a favorite spot. */
function noteSession(g: Game, a: Agent) {
  const gd = a.g!;
  const secs = (g.state.tick - gd.mem.sitAt) / TICKS_PER_SECOND;
  const score = secs * (gd.mood / 100);
  if (secs >= 30 && gd.mood >= 55 && score > gd.mem.favScore) { gd.mem.favScore = score; gd.mem.favSeat = a.y * g.state.map.w + a.x; }
  const o = g.objById.get(a.target);
  if (o && OBJECTS[o.kind].slot) {
    slotRemark(g, a, o, secs);
    // Wishes are about the floor, not this game: only a game's own remarks count toward its opinions.
    marketSession(g, a, o, secs, (id) => { think(g, a, id); if (id.startsWith("slot")) noteThought(g.state, gameKey(o), id); });
  }
  noteSessionEnd(g.state, gameKey(o), gd.mood);
}

/** Reasons a guest gives for a design (appeal.ts) → what they say, naming it (docs/spec/designer.md §5). */
const REMARKS: Record<string, string> = {
  "Loved the bonus": "slotBonus", "Everything about it fits": "slotLove", "That top prize!": "slotTop", "Never saw the bonus": "slotNoBonus",
  "The bonus pays nothing": "slotWeak", "It ate my money fast": "slotAte", "Too wild for me": "slotWild", "Too tame": "slotTame",
  "Too loud and flashy": "slotLoud", "A bit dull to look at": "slotDull", "Too complicated": "slotComplex", "Stop celebrating when I lose": "slotLdw",
  "No bonus to play for": "slotNoBonusAt",
};
/** (M8.5) What a guest says about the feature they just saw, by its kind. */
const FEATURE_REMARKS: Record<string, string> = { fs: "slotFree", hns: "slotOrbs", wheel: "slotWheel", pick: "slotPick", offer: "slotOffer", collect: "slotCollect" };
/** After a slot session, sometimes a remark about the design: counted per design for its card. */
function slotRemark(g: Game, a: Agent, o: import("./state").PlacedObject, secs: number) {
  const gd = a.g!, c = compiledOf(g.state, o);
  const saw = gd.sf ?? 0, kind = gd.sfk ?? "", voided = gd.voided ?? 0;
  gd.sf = 0;
  gd.sfk = "";
  gd.voided = 0;
  if (!c || secs < 30) return;
  const r = rng(g.state, "guests");
  const st = statsOf(g.state, gd.game ?? "");
  const say = (id: string) => { think(g, a, id); st.said[id] = (st.said[id] ?? 0) + 1; };
  // A jackpot hit on too small a bet is never forgotten.
  if (voided && r.chance(0.8)) { say("slotMaxBet"); st.sessions++; return; }
  if (!r.chance(0.35)) return;
  // What this session showed them, then their type's standing reasons.
  const reasons = judged(c, gd.type).reasons.filter((q) => (q === "Loved the bonus" ? saw > 0 : q === "Never saw the bonus" ? saw === 0 : true));
  if (saw > 0 && !reasons.includes("Loved the bonus") && !reasons.includes("The bonus pays nothing")) reasons.unshift("Loved the bonus");
  let id = REMARKS[reasons.length ? reasons[r.int(0, reasons.length - 1)] : ""];
  if (id === "slotBonus" && FEATURE_REMARKS[kind] && r.chance(0.7)) id = FEATURE_REMARKS[kind];
  if (!id && c.cas && r.chance(0.3)) id = "slotTumble";
  if (!id) return;
  say(id);
  st.sessions++;
}

/** Loss limit and win goal as they stand now: drink loosens both, chasing erodes the limit, engagement (M11.1) stretches the limit. */
export function limits(gd: GuestData, eng = 1): { loss: number; win: number } {
  // (M11.3, owner) Discipline: seasoned players hold their limit; novices get carried away by drink, a game they
  // love and a good session (up to twice the old stretch for the least disciplined).
  const loose = 2 * (1 - savvyNow(gd));
  const fun = Math.min(1, gd.mem.rounds ? (1.6 * gd.mem.feel) / gd.mem.rounds : 0);
  const stretch = 1 + loose * (Math.max(0, eng - 1) + 1.5 * gd.intox + 0.5 * fun);
  return { loss: gd.lossLimit * Math.min(1, eng) * stretch * (1 + 2 * gd.chase), win: gd.winGoal * (1 + loose * gd.intox) * (1 + gd.chase) };
}

/** Ticks until the next round: a machine's spin at the player's pace; at a table, 1 (waiting for the deal). */
function nextRound(g: Game, a: Agent): number {
  const o = g.objById.get(a.target)!, gd = a.g!;
  if (isTable(o.kind)) return 1;
  // A free spins feature last round (M8) holds the seat a little longer.
  const extra = gd.extra ?? 0;
  gd.extra = 0;
  // (M11.1) Engaged players play faster, and time flies: the round counts for less (or more) of their floor time.
  const eng = engagement(g, a);
  const ticks = roundTicks(machineModel(g.state, o, gd)!, gd.pace * Math.sqrt(eng) * (compSeeking(g, gd) ? 0.7 : 1)) + extra;
  gd.floorTime += Math.round(ticks * (eng - 1) * TIME_FLIES);
  return ticks;
}

/** Between rounds: keep playing, or get up (quit rule, floor time, needs, money, a broken machine, the group). */
function quitReason(g: Game, a: Agent): string | null {
  const gd = a.g!, n = gd.needs;
  const o = g.objById.get(a.target);
  if (!o || !isGame(o.kind)) return "gone";
  if (gd.why) return "leaving";
  // A cheat up by their take stops while they're ahead.
  if (gd.take && gd.mem.won - gd.mem.wagered >= gd.take) { gd.take = 0; gd.spell = 0; return "done"; }
  if (o.broken) { think(g, a, "broken"); gd.annoy += 10; return "broken"; }
  // Tables (M7): the dealer left, or a poker game nobody else joins.
  if (!tableOpen(g, o)) { think(g, a, "noDealer"); return "closed"; }
  if (minRoundOf(g.state, o) * stakeMult(g, o) > gd.wallet + 1e-9) return "money";
  const def = OBJECTS[o.kind].game && TABLE_GAMES[OBJECTS[o.kind].game!];
  if (def && def.minPlayers > 1 && (seatHolders(g, o.id) ?? []).filter((id) => id > 0).length < def.minPlayers && rng(g.state, "guests").chance(0.25)) return "empty";
  // (M8.5) A hunter stops the moment the edge is gone (the meter hit, the collector paid).
  if (gd.hunter && OBJECTS[o.kind].slot && huntEdge(g.state, o) <= 0 && gd.mem.rounds > 0) { think(g, a, "slotHunted"); return "hunted"; }
  const nt = net(gd);
  // (M11.4, owner) Tilt: drunk or high and deep in the hole, a disciplined player snaps. From then on they ignore
  // their limit and the clock, and play until they're back to even or out of money.
  const tt = GUEST_TYPES[gd.type].tilt ?? 0;
  // (M12, owner) Inhibition compounds: the chance grows with the square of how loose they are, the same as before
  // at TILT_REF (a few drinks), less for one, far more for a drunk, high player with an escort on their arm.
  const loose = gd.intox + gd.high + (gd.arm ? ARM_INHIBIT : 0);
  if (tt && !gd.tilt && !gd.vip && nt < 0 && loose > 0.1 && rng(g.state, "guests").chance(tt * (loose * loose / TILT_REF) * Math.min(1, -nt / staked(gd)))) {
    gd.tilt = 1;
    gd.tilted = 1;
    if (!gd.atm) gd.atm = 500;
    think(g, a, "tilt");
    news(g, "warn", `A high roller is on tilt, chasing ${fmtMoney(-nt)} back.`, { a: a.id });
  }
  if (gd.tilt) {
    if (nt >= 0) { gd.tilt = 0; think(g, a, "backEven"); return "done"; }
    if (minRoundOf(g.state, o) * stakeMult(g, o) > gd.wallet + 1e-9) return "money";
    if (n.bladder >= 95) return "need";
    return null;
  }
  // A cheat still after their take ignores the usual quit rules.
  const rule = (gd.take ? "broke" : gd.quit) as QuitRule;
  const lim = limits(gd, rule === "lossLimit" ? engagement(g, a) : 1);
  if (rule === "winGoal" && nt >= lim.win) { think(g, a, "quitAhead"); return "done"; }
  if (rule === "lossLimit" && -nt >= lim.loss) { think(g, a, "myLimit"); return "done"; }
  const jackpot = o.last.win === 2 && o.last.tick === g.state.tick;
  if (jackpot) think(g, a, "bigWin");
  if (rule === "jackpot" && jackpot) return "done";
  if (g.state.tick - gd.mem.arrived >= gd.floorTime) { think(g, a, "timeToGo"); return "time"; }
  if (n.fatigue >= 100 || n.hunger >= 100 || gd.mood < 15) return "need";
  if (n.bladder >= (g.has("bladder") ? 75 : 90)) return "need";
  // M6: hungry with a restaurant to go to; a smoker whose urge has come, outside a smoking area.
  if (n.hunger >= 70 && g.has("hunger") && !(gd.gaveUp & NEED_BIT.hunger) && g.state.tick >= gd.mem.eatAt) return "need";
  if (gd.smoker && gd.urge >= 100 && !(gd.gaveUp & SMOKE_BIT)) return "need";
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
    if (def.serves === "bladder") {
      gd.needs.bladder = 0;
    } else if (def.serves === "cage" && gd.why) {
      gd.mem.cashed = 1;
    } else if (def.serves === "cage" || def.serves === "atm") {
      // A withdrawal: about their usual draw, never more than they have.
      let want = Math.round(logNormal(r, { median: gd.atm || 40, sigma: 0.4, min: 20 }) / 10) * 10;
      // (M11.4) On tilt: big draws, a quarter of what's left of their savings at a time.
      if (gd.tilt) want = Math.max(want, Math.round((gd.withdrawCap - gd.withdrawn) / 40) * 10);
      const amt = Math.max(0, Math.min(gd.withdrawCap - gd.withdrawn, want));
      if (amt > 0) { gd.wallet += amt; gd.withdrawn += amt; gd.trips++; think(g, a, "atm"); }
      else gd.withdrawn = gd.withdrawCap;
    }
    // M9: a crooked teller shorts the drawer now and then.
    if (def.serves === "cage" && o.crook) {
      const cr = rng(g.state, "crew");
      if (cr.chance(greed(g, null, THEFT.teller.p))) steal(g, "cage", cr.int(THEFT.teller.amount[0], THEFT.teller.amount[1]), a.y * g.state.map.w + a.x, "shorting the cage drawer", null, o);
    }
  }
  release(g, a);
  a.act = "idle";
}

// (M11) Litter bins: a guest with a bin this close (Manhattan tiles) uses it, unless they're drunk.
const BIN_REACH = 6;
const BIN_DRUNK = 0.5;
const bins = new WeakMap<Game, { objs: PlacedObject[]; n: number; at: number[] }>();
function binTiles(g: Game): number[] {
  const objs = g.state.objects;
  let c = bins.get(g);
  if (!c || c.objs !== objs || c.n !== objs.length) {
    c = { objs, n: objs.length, at: objs.filter((o) => o.kind === "bin").map((o) => o.y * g.state.map.w + o.x) };
    bins.set(g, c);
  }
  return c.at;
}

/** A guest drops rubbish at tile i: in a bin if one is near (and they're sober enough to care), else on the floor. */
function litter(g: Game, i: number, a?: Agent) {
  if (a?.g && a.g.intox < BIN_DRUNK) {
    const w = g.state.map.w, x = i % w, y = (i - x) / w;
    for (const b of binTiles(g)) if (Math.abs((b % w) - x) + Math.abs(Math.floor(b / w) - y) <= BIN_REACH) return;
  }
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
      if (d >= bd || m.terrain[i] !== T.DOOR || !g.walkable(i) || !canSee(g, here, i) || !g.pathsFor(a).reachable(here, i)) continue;
      bd = d; best = i;
    }
  // (2026-09-26, owner: guests came in off the street and wandered the lot) Nothing in view: they still know the
  // way to the building. The nearest door between the open air and indoors they can reach.
  if (best < 0) {
    const p = g.pathsFor(a);
    for (const i of outerDoors(g)) {
      const x = i % w, d = Math.abs(x - a.x) + Math.abs((i - x) / w - a.y);
      if (d < bd && g.walkable(i) && p.reachable(here, i)) { bd = d; best = i; }
    }
  }
  if (best < 0) return false;
  go(a, best, "idle");
  return true;
}

/** Doors between the open air and indoors (rebuilt when the layout changes). */
function outerDoors(g: Game): number[] {
  if (g.outerDoors) return g.outerDoors;
  const m = g.state.map, w = m.w, out: number[] = [];
  for (let i = 0; i < m.terrain.length; i++) {
    if (m.terrain[i] !== T.DOOR) continue;
    let air = false, inside = false;
    for (const j of [i - 1, i + 1, i - w, i + w]) {
      if (j < 0 || j >= m.terrain.length || m.terrain[j] !== T.FLOOR) continue;
      if (m.outdoor[j]) air = true; else inside = true;
    }
    if (air && inside) out.push(i);
  }
  return (g.outerDoors = out);
}

function guestTick(g: Game, a: Agent) {
  const gd = a.g!;
  // Held for security: they wait, whatever else they had in mind.
  if (gd.held && !isWalking(a)) { a.act = "held"; return; }
  switch (a.act) {
    case "out":
    case "fight":
      // Passed out or in a fight: the incident system decides when it's over (sim/incidents.ts).
      return;
    case "held":
      // Waiting on (or being walked by) security: the enforcement job decides (sim/cheats.ts).
      return;
    case "arrive":
      if (headInside(g, a)) return;
      decide(g, a);
      return;
    case "idle":
      decide(g, a);
      return;
    case "wait":
      // Stand a few seconds, then look around again.
      if (a.timer === 0 && !gd.why) { a.timer = rng(g.state, "guests").int(5, 10) * TICKS_PER_SECOND; return; }
      if (gd.why || --a.timer <= 0) { a.act = "idle"; a.timer = 0; }
      return;
    case "play": {
      if (a.timer === 0) {
        // Just sat down: start the session and the first round.
        const o = g.objById.get(a.target);
        if (!o || !isGame(o.kind) || o.broken || a.seat < 0) { release(g, a); a.act = "idle"; return; }
        o.st.sessions++;
        gd.mem.sitAt = g.state.tick;
        gd.sf = 0;
        gd.favAt = 0;
        a.timer = nextRound(g, a);
      } else if (a.timer === -1) {
        const why = quitReason(g, a);
        if (why) {
          noteSession(g, a);
          release(g, a);
          a.act = "idle";
          // A quit rule met, or the time they meant to spend is up: they go home (not just to another machine).
          if (why === "done" || why === "time") wantToLeave(g, a, why);
          return;
        }
        a.timer = nextRound(g, a);
      }
      return;
    }
    case "drink": {
      // At the bar: one drink at a time, sipped (guestBeat); maybe another round, then back to the floor.
      if (a.seat < 0 || !g.objById.has(a.target)) { release(g, a); a.act = "idle"; return; }
      if (a.timer === 0) {
        a.timer = 1;
        if (gd.drink > 0 || !orderAtBar(g, a)) { release(g, a); a.act = "idle"; }
        return;
      }
      if (gd.drink > 0) return;
      if (anotherRound(g, a) && orderAtBar(g, a)) { a.timer++; return; }
      release(g, a);
      a.act = "idle";
      return;
    }
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
    case "dine": {
      // A meal (M6): paid on sitting down; hunger gone, a little rest, and they mean to stay a bit longer.
      const o = g.objById.get(a.target);
      if (a.seat < 0 || !o) { release(g, a); a.act = "idle"; return; }
      const r = rng(g.state, "guests");
      if (a.timer === 0) {
        // A comped meal (M9) is on the house.
        const free = useComp(gd, "meal"), price = free ? 0 : priceFor(o);
        if (gd.wallet + 1e-9 < price) { gd.mem.eatAt = g.state.tick + 60 * TICKS_PER_SECOND; release(g, a); a.act = "idle"; return; }
        pay(g, gd, price, "food");
        post(g, "food", -servingCost(o));
        // (M11.4) Fair is the standard meal at this tier, worth more or less to them by its grade.
        const fair = (OBJECTS[o.kind].price ?? 0) * priceTolerance(g, o) * gradeWorth(GUEST_TYPES[gd.type].luxe, gradeOf(o));
        if (price > 1.2 * fair) { think(g, a, "steepFood"); gd.annoy += 4; }
        else if (!free && price < 0.5 * fair && r.chance(0.3)) think(g, a, "bargain");
        a.timer = useTicks(g, a, r);
        return;
      }
      gd.mem.fun++;
      if (--a.timer > 0) return;
      gd.needs.hunger = 0;
      gd.needs.fatigue = Math.max(0, gd.needs.fatigue - 20);
      gd.floorTime += 2 * TICKS_PER_MIN;
      // (M11.2) Crowds used to finer places notice a plain one (a snack bar); the rest just enjoy it.
      if ((((GUEST_TYPES[gd.type].prefs.PRS?.ideal ?? 0) >= 5 && tierOf(g, o) === 0) || (GUEST_TYPES[gd.type].luxe >= 0.6 && gradeOf(o) === 0)) && r.chance(0.5)) think(g, a, "plainFood");
      else if (r.chance(0.4)) think(g, a, "goodMeal");
      if (r.chance(0.08)) litter(g, a.y * g.state.map.w + a.x, a);
      return doneWith(g, a, r);
    }
    case "show": {
      // A show (M6): seated early, the ticket paid as it starts, and everyone up at once when it ends.
      const o = g.objById.get(a.target);
      if (a.seat < 0 || !o) { release(g, a); a.act = "idle"; return; }
      const ph = showPhase(o, g.state.tick);
      if (a.timer === 0) { a.timer = 1; return; }
      if (ph.phase === "on") {
        if (a.timer === 1) {
          const free = useComp(gd, "show"), price = free ? 0 : priceFor(o);
          if (gd.wallet + 1e-9 < price) { gd.mem.eatAt = g.state.tick + 60 * TICKS_PER_SECOND; release(g, a); a.act = "idle"; return; }
          pay(g, gd, price, "shows");
          post(g, "shows", -servingCost(o));
          const worth = worthTo(GUEST_TYPES[gd.type], "show", tierOf(g, o), gradeOf(o));
          if (price > worth) { think(g, a, "steepShow"); gd.annoy += 4; }
          else if (!free && price < 0.4 * worth && rng(g.state, "guests").chance(0.3)) think(g, a, "bargain");
          a.timer = 2;
        }
        gd.mem.fun++;
        return;
      }
      if (a.timer >= 2) {
        const r = rng(g.state, "guests");
        gd.needs.fatigue = Math.max(0, gd.needs.fatigue - 40);
        gd.buzz = Math.min(20, gd.buzz + 6);
        if (r.chance(0.4)) think(g, a, "goodShow");
        return doneWith(g, a, r);
      }
      // Waiting for it to start: an urgent need or the group leaving gets them up.
      if (gd.why || gd.needs.bladder >= 85) { release(g, a); a.act = "idle"; }
      return;
    }
    case "dance": {
      // The club (M6): the cover once a visit, then a stretch on the dance floor.
      const o = g.objById.get(a.target);
      if (a.seat < 0 || !o) { release(g, a); a.act = "idle"; return; }
      const r = rng(g.state, "guests");
      if (a.timer === 0) {
        if (!(gd.paid & 1)) {
          const price = priceFor(o);
          if (gd.wallet + 1e-9 < price) { gd.gaveUp |= NEED_BIT.club; release(g, a); a.act = "idle"; return; }
          pay(g, gd, price, "cover");
          post(g, "cover", -servingCost(o));
          gd.paid |= 1;
          if (price > COVER_FAIR * priceTolerance(g, o) * gradeWorth(GUEST_TYPES[gd.type].luxe, gradeOf(o))) { think(g, a, "steep"); gd.annoy += 4; }
        }
        a.timer = useTicks(g, a, r);
        return;
      }
      gd.mem.fun++;
      if (--a.timer > 0) return;
      gd.buzz = Math.min(20, gd.buzz + 5);
      if (r.chance(0.4)) think(g, a, "danced");
      return doneWith(g, a, r);
    }
    case "swim": {
      // The pool (M6.5): a swim (fun, a little tiring) or a stretch on a lounger (a rest); entry paid once a visit.
      const o = g.objById.get(a.target);
      if (a.seat < 0 || !o) { release(g, a); a.act = "idle"; return; }
      const r = rng(g.state, "guests");
      if (a.timer === 0) {
        if (!(gd.paid & 2)) {
          const price = priceFor(o);
          if (gd.wallet + 1e-9 < price) { gd.gaveUp |= NEED_BIT.pool; release(g, a); a.act = "idle"; return; }
          pay(g, gd, price, "poolFees");
          post(g, "poolFees", -servingCost(o));
          gd.paid |= 2;
        }
        a.timer = useTicks(g, a, r);
        return;
      }
      gd.mem.fun++;
      if (--a.timer > 0) return;
      const lounging = objSeats(o)[a.seat]?.kind === "lounger";
      if (lounging) gd.needs.fatigue = Math.max(0, gd.needs.fatigue - 30);
      else { gd.buzz = Math.min(20, gd.buzz + 5); gd.needs.fatigue = Math.min(100, gd.needs.fatigue + 5); }
      if (r.chance(0.4)) think(g, a, lounging ? "sunbathing" : "swim");
      return doneWith(g, a, r);
    }
    case "rest": {
      // A garden bench (M6.5): quiet, and the feet stop hurting.
      if (a.seat < 0 || !g.objById.has(a.target)) { release(g, a); a.act = "idle"; return; }
      const r = rng(g.state, "guests");
      if (a.timer === 0) { a.timer = useTicks(g, a, r); return; }
      if (--a.timer > 0) return;
      gd.needs.fatigue = Math.max(0, gd.needs.fatigue - 40);
      if (r.chance(0.4)) think(g, a, "garden");
      return doneWith(g, a, r);
    }
    case "golf": {
      // (M11.2) A round of mini golf: the ticket at the first hole, fun the whole way round; kids love it.
      const o = g.objById.get(a.target);
      if (a.seat < 0 || !o) { release(g, a); a.act = "idle"; return; }
      const r = rng(g.state, "guests");
      if (a.timer === 0) {
        const price = priceFor(o);
        if (gd.wallet + 1e-9 < price) { gd.gaveUp |= NEED_BIT.golf; release(g, a); a.act = "idle"; return; }
        pay(g, gd, price, "golfFees");
        post(g, "golfFees", -servingCost(o));
        if (price > worthTo(GUEST_TYPES[gd.type], "golf", tierOf(g, o), gradeOf(o))) { think(g, a, "steepGolf"); gd.annoy += 4; }
        a.timer = useTicks(g, a, r);
        return;
      }
      gd.mem.fun++;
      if (--a.timer > 0) return;
      gd.buzz = Math.min(20, gd.buzz + 6);
      gd.needs.fatigue = Math.min(100, gd.needs.fatigue + 4);
      if (r.chance(0.5)) think(g, a, "golfed");
      return doneWith(g, a, r);
    }
    case "look": {
      // Watching a craps table (M7): fun time; the table's wins lift them (sim/tables.ts). Some want in after.
      const o = g.objById.get(a.target);
      if (!o || gd.why) { a.target = -1; a.act = "idle"; return; }
      const r = rng(g.state, "guests");
      if (a.timer === 0) { a.timer = r.int(LOOK_SECS[0], LOOK_SECS[1]) * TICKS_PER_SECOND; if (r.chance(0.3)) think(g, a, gd.look ? "slotWatch" : "watching"); return; }
      gd.mem.fun++;
      if (--a.timer > 0) return;
      a.act = "idle";
      a.target = -1;
      const k = freeSeat(g, o.id);
      if (k >= 0 && gameAppeal(g, GUEST_TYPES[gd.type], gd, o) > 0.05 && r.chance(0.4)) { claim(g, a, o.id, k); go(a, seatTile(g, o.id, k), "play"); }
      return;
    }
    case "smoke": {
      // A cigarette, where they stand (a smoking room, or out on the lot); butts end up on the floor outside.
      if (a.timer === 0) { a.timer = SMOKE_SECS * TICKS_PER_SECOND; return; }
      if (--a.timer > 0) return;
      gd.urge = 0;
      const here = a.y * g.state.map.w + a.x;
      if (purposeAt(g, here) !== "smoking" && rng(g.state, "guests").chance(0.15)) litter(g, here, a);
      a.act = "idle";
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
  // Dancing is thirsty, tiring work; sitting through a show or a meal rests the feet.
  const dancing = a.act === "dance" && a.timer > 0, resting = a.act === "show" || a.act === "dine" || a.act === "rest";
  if (dancing) n.thirst = Math.min(100, n.thirst + rate.thirst);
  // High (M9.6): no tiredness, fading over about 90 s.
  if (gd.high > 0) gd.high = Math.max(0, gd.high - 1 / 90);
  else n.fatigue = Math.min(100, n.fatigue + rate.fatigue * (walking ? 1.3 : dancing ? 2 : resting ? 0.3 : 0.8));
  // Smokers: the urge builds; inside a smoking room they light up where they are.
  if (gd.smoker) {
    if (purposeAt(g, a.y * g.state.map.w + a.x) === "smoking") gd.urge = 0;
    else if (a.act !== "smoke") gd.urge = Math.min(100, gd.urge + URGE_PER_SEC);
    if (gd.urge >= 100) gd.annoy = Math.min(30, gd.annoy + 0.3);
  }
  gd.annoy = Math.max(0, Math.min(30, gd.annoy - 0.5 + (gd.wait >= 0 ? 0.3 : 0)));
  gd.buzz = Math.max(0, Math.min(20, gd.buzz - 0.5));
  gd.know += (1 - gd.know) * LEARN * (walking ? 3 : 1);
  if (gd.browse > 0) gd.browse--;
  // The drink in hand: sipped over the type's drinking time, easing thirst and adding intoxication as it goes.
  if (gd.drink > 0) {
    const sip = Math.min(gd.drink, 1 / type.drinking.sip);
    gd.drink = Math.max(0, gd.drink - sip);
    if (gd.drink < 1e-9) gd.drink = 0;
    gd.intox = Math.min(INTOX_CAP, gd.intox + sip * gd.dStr * DRINK_UNIT);
    n.thirst = Math.max(0, n.thirst - sip * 90);
    if (!gd.drink && a.act !== "drink" && r.chance(0.05)) litter(g, a.y * g.state.map.w + a.x, a);
  }
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
  const env = Math.max(ENV_MOOD[0], Math.min(ENV_MOOD[1], fitAt(g, type, here, gd).score * 8));
  const luck = Math.max(-15, Math.min(15, (net(gd) / staked(gd)) * 25));
  let needs = 0;
  for (const v of [n.bladder, n.thirst, n.hunger, n.fatigue]) if (v > 60) needs += (v - 60) / 3;
  const drink = gd.intox > 0.05 && gd.intox < 0.6 ? 4 : gd.intox > 0.9 ? -4 : 0;
  let target = 62 + env + luck - needs - gd.annoy + gd.buzz + drink;
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
  if (walking && r.chance(gd.mem.drinks ? 0.003 : 0.0015)) litter(g, here, a);
  thinkIfDue(g, a, type, r);
}

function thinkIfDue(g: Game, a: Agent, type: GuestTypeDef, r: Rng) {
  const gd = a.g!;
  if (g.state.tick >= gd.nextThink) {
    periodicThought(g, a, type);
    gd.nextThink = g.state.tick + r.int(THINK_EVERY[0], THINK_EVERY[1]) * TICKS_PER_SECOND;
  }
}

/** Once a second: groups whose leader left, where everyone is ready, or where half have waited too long, go home. */
function groupsBeat(g: Game) {
  const tick = g.state.tick;
  for (const gi of refreshGroups(g).values()) {
    if (gi.members.length < 2 && gi.leader) continue;
    const leaderGone = !gi.leader || !!gi.leader.g!.why;
    let long = 0, ready = 0;
    for (const m of gi.members) {
      if (m.g!.wait >= 0 || m.g!.why || m.g!.minor) ready++;
      if (m.g!.wait >= 0 && tick - m.g!.wait >= WAIT_LONG * TICKS_PER_SECOND) long++;
    }
    if (!leaderGone && long * 2 < gi.members.length && ready < gi.members.length) continue;
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

/** Floor-size factor on new arrivals: a bigger floor draws more people (M11.1: only sublinearly). */
export function capacity(g: Game): number {
  return Math.min(DRAW.sizeCap, Math.pow((g.gameSeats + 6) / 50, DRAW.sizePow));
}

/**
 * (M11.1) The casino's draw for a crowd: how well its game seats suit that type on average, by the layout alone
 * (qualities and theming, not the crowd of the moment). A floor split between crowds suits each less well than
 * one made for a crowd. Cached until the layout changes.
 */
export function floorDraw(g: Game, typeId: string): number {
  const f = g.fields;
  if (!f.drawCache) {
    const seats: [number, PlacedObject][] = [];
    for (const [id, tiles] of g.seatTiles) { const o = g.objById.get(id); if (o && isGame(o.kind)) for (const t of tiles) seats.push([t, o]); }
    f.drawCache = {};
    for (const [t, type] of Object.entries(GUEST_TYPES)) {
      // Each seat counts by the crowd's standing taste for its game: a crowd judges a casino by where it would play.
      let sum = 0, wsum = 0;
      for (const [i, o] of seats) {
        const wt = Math.max(0, seatWeight(g, t, o));
        sum += wt * fitAt(g, type, i, undefined, true).score;
        wsum += wt;
      }
      const avg = wsum ? sum / wsum : 0;
      f.drawCache[t] = Math.max(DRAW.min, Math.min(DRAW.max, 1 + DRAW.fit * (avg - DRAW.fitMid)));
    }
  }
  return f.drawCache[typeId] ?? 1;
}


/**
 * (M11.2) The sights: how much a crowd would come just to look around. The average over the open floor of the
 * theming they like (a theme's score × their taste for it; bad theming counts against it), × SIGHTS_K, 0-2.
 * Cached with the draw until the layout changes.
 */
export function sightsDraw(g: Game, typeId: string): number {
  const f = g.fields;
  floorDraw(g, typeId);
  const key = `sights:${typeId}`;
  if (f.drawCache![key] === undefined) {
    const { terrain } = g.state.map, th = f.themes, types = Object.values(GUEST_TYPES), sums = new Float64Array(types.length);
    let n = 0;
    for (let i = 0; i < terrain.length; i++) {
      if (terrain[i] !== T.FLOOR || g.occ[i] || g.objAt[i]) continue;
      n++;
      const sc = th.at(i);
      if (!sc) continue;
      const d = sc > 0 ? th.domAt(i) : -1;
      for (let k = 0; k < types.length; k++) {
        const taste = d >= 0 ? types[k].themes[THEME_IDS[d]] ?? 0 : 0;
        sums[k] += sc > 0 ? sc * Math.max(0, 0.25 + THEME_TASTE * taste) : 0.5 * sc;
      }
    }
    types.forEach((t, k) => { f.drawCache![`sights:${t.id}`] = n ? Math.max(0, Math.min(2, (SIGHTS_K * sums[k]) / n)) : 0; });
  }
  return f.drawCache![key];
}
/** (M11.2) Scales the average liked theming on the floor into the sights' pull (a well-themed floor ≈ 1). */
const SIGHTS_K = 3.5;

/** (M11.1) A type's standing taste for the game at an object: its design's judged appeal, or the table game's. Static. */
function seatWeight(g: Game, type: string, o: PlacedObject): number {
  const def = OBJECTS[o.kind];
  if (def.game) return GUEST_TYPES[type].games[def.game] ?? 0;
  const info = slotInfo(g.state, o);
  if (!info) return 0;
  let v = info.ap.get(type);
  if (v === undefined) info.ap.set(type, (v = judged(info.c, type).appeal));
  return v;
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
    const out = gone(g);
    for (const a of s.agents) {
      // Carried out by paramedics (or the casino closed) since last tick: already gone.
      if (a.role !== "guest" || out.has(a.id)) continue;
      if ((a.id + s.tick) % TICKS_PER_BEAT === 0) guestBeat(g, a, r);
      guestTick(g, a);
      const gd = a.g!;
      if (gd.intox > gd.mem.peak) gd.mem.peak = gd.intox;
    }
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
