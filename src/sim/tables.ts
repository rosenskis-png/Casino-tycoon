// Table games and draw games (FOUNDATIONS §7, §7.2; docs/spec/tables.md). A table deals a round for everyone
// seated and waiting once its dealers are in place: shared outcomes (roulette, craps, baccarat, keno) are drawn
// once per hand for the whole table, blackjack per player, and the pool games (poker, bingo) pay one winner out
// of what everyone put in, less the house's cut. Dealers and pit bosses are run here; the table rules command too.
import { OBJECTS } from "../data/objects";
import { GUEST_TYPES } from "../data/guests";
import { WAGERS_PER_ROUND, type SlotModel } from "../data/games";
import {
  BAC_P, COUNT_SPREAD, CRAPS_OUTCOMES, KENO_PAYS, KENO_SPOTS, ODDS_X, POKER_WEIGHT, RAKE_CAP, ROULETTE_BETS, TABLE_GAMES,
  bacModel, bacX, bingoHold, sportsModel, bjModel, kenoModel, lineModel, lineX, oddsAllowed, oddsModel, pockets, pokerRake, rouletteModel,
  rouletteWins, rulesScore, type Family,
} from "../data/tables";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Agent, GuestData, PlacedObject, TableRound } from "./state";
import { gameBoost } from "./calendar";
import { rng, type Rng } from "./rng";
import { TICKS_PER_SECOND } from "./clock";
import { go, isWalking, nearbyTile } from "./agents";
import { objSeats, objSize } from "./geometry";
import { drawPay, isTable, limitsOf, settle, tableDefOf, wantBet, type Wager } from "./gaming";
import { THEFT } from "../data/staff";
import { greed, inZone, skillOf, steal } from "./crew";
import { hash01, sharedPay, wagerPay } from "./cheats";
import { stakeMult, purposeOf } from "./amenities";
import { engagement, seatHolders } from "./guests";
import { TIME_FLIES } from "../data/psych";
import { colleaguesNear, hireStaff, spreadTile } from "./staff";

declare module "./commands" {
  interface CommandTypes {
    /** A table's (or video poker machine's) rules, one option index per rule, and its limit preset. */
    setTable: { id: number; rules?: number[]; lim?: number };
  }
}

const SEC = TICKS_PER_SECOND;
const HANDS = WAGERS_PER_ROUND;
/** How often a closed or short-handed table lets its waiting players reconsider (seconds). */
const RECHECK = 5;

// ---------------------------------------------------------------------------------------------------------
// Dealers: which tables are open (runtime, recomputed each tick from where the dealers stand).

/** Seat indices where a dealer stands. */
export function dealerSeats(o: PlacedObject): number[] {
  const out: number[] = [];
  objSeats(o).forEach((s, k) => { if (s.kind === "dealer") out.push(k); });
  return out;
}

const openSets = new WeakMap<Game, { tick: number; open: Set<number>; at: Map<number, Agent[]> }>();
function dealing(g: Game) {
  let c = openSets.get(g);
  if (c && c.tick === g.state.tick) return c;
  const at = new Map<number, Agent[]>();
  for (const a of g.state.agents) if (a.role === "dealer" && a.act === "deal" && a.target >= 0) {
    const l = at.get(a.target);
    if (l) l.push(a); else at.set(a.target, [a]);
  }
  const open = new Set<number>();
  for (const o of g.tables) if ((at.get(o.id)?.length ?? 0) >= dealerSeats(o).length) open.add(o.id);
  openSets.set(g, (c = { tick: g.state.tick, open, at }));
  return c;
}
/** Tables whose every dealer spot has a dealer at work. */
export const openTables = (g: Game): Set<number> => dealing(g).open;
/** The dealers working a table now. */
export const dealersAt = (g: Game, o: PlacedObject): Agent[] => dealing(g).at.get(o.id) ?? [];
export const tableOpen = (g: Game, o: PlacedObject) => !isTable(o.kind) || openTables(g).has(o.id);

function dealerTick(g: Game, a: Agent) {
  if (isWalking(a)) return;
  const w = g.state.map.w;
  if (a.act === "deal") {
    const o = g.objById.get(a.target), st = o && objSeats(o)[a.seat];
    if (st && st.kind === "dealer" && st.y * w + st.x === a.y * w + a.x) return;
    a.act = "idle"; a.target = -1; a.seat = -1;
  }
  if (a.act === "wait") {
    if (a.timer === 0) a.timer = RECHECK * SEC;
    if (--a.timer > 0) return;
  }
  // Find the nearest dealer spot nobody is working.
  const taken = new Set<number>();
  for (const q of g.state.agents) if (q !== a && q.role === "dealer" && q.target >= 0) taken.add(q.target * 64 + q.seat);
  const here = a.y * w + a.x;
  let best: PlacedObject | null = null, seat = -1, tile = -1, bd = Infinity;
  for (const o of g.tables) {
    const d = Math.abs(o.x - a.x) + Math.abs(o.y - a.y);
    if (d >= bd) continue;
    const seats = objSeats(o);
    for (const k of dealerSeats(o)) {
      if (taken.has(o.id * 64 + k)) continue;
      const t = seats[k].y * w + seats[k].x;
      if (!g.walkable(t) || !g.pathsFor(a).reachable(here, t)) continue;
      best = o; seat = k; tile = t; bd = d;
      break;
    }
  }
  if (best) { a.target = best.id; a.seat = seat; go(a, tile, "deal"); return; }
  a.target = -1; a.seat = -1;
  const t = nearbyTile(g, "staff", a.x, a.y, 6, a);
  if (t >= 0) go(a, t, "wait");
  else { a.act = "wait"; a.timer = RECHECK * SEC; }
}

/** A free floor tile within a couple of tiles of a table that this person can walk to, or -1. */
function spotNear(g: Game, a: Agent, o: PlacedObject, r: Rng): number {
  const { w, h } = g.state.map, { w: ow, h: oh } = objSize(o), here = a.y * w + a.x;
  for (let k = 0; k < 12; k++) {
    const x = o.x - 2 + r.int(0, ow + 3), y = o.y - 2 + r.int(0, oh + 3), i = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= h || !g.walkable(i) || g.seatAt[i]) continue;
    if (g.pathsFor(a).reachable(here, i)) return i;
  }
  return -1;
}

/** Pit bosses walk among the tables, stopping to watch a while at each. */
function pitTick(g: Game, a: Agent) {
  if (isWalking(a)) return;
  if (a.act === "wait") {
    if (a.timer === 0) a.timer = rng(g.state, "staff").int(6, 14) * SEC;
    if (--a.timer > 0) return;
  }
  const r = rng(g.state, "staff");
  // M9: a pit boss kept to a room watches only the tables in it.
  const w = g.state.map.w, mine = a.st && a.st.zone >= 0 ? g.tables.filter((t) => inZone(g, a, t.y * w + t.x)) : g.tables;
  // M11: of two tables, the one fewer other pit bosses are watching.
  let o = mine.length ? mine[r.int(0, mine.length - 1)] : null;
  if (mine.length > 1) {
    const o2 = mine[r.int(0, mine.length - 1)];
    if (colleaguesNear(g, a, o2.y * w + o2.x) < colleaguesNear(g, a, o!.y * w + o!.x)) o = o2;
  }
  const t = o ? spotNear(g, a, o, r) : spreadTile(g, a, "staff", a.x, a.y, 10);
  if (t >= 0) go(a, t, "wait");
  else { a.act = "wait"; a.timer = RECHECK * SEC; }
}

// ---------------------------------------------------------------------------------------------------------
// Who sits where, and what they bet.

/** Stable per-visit choices from a hash of the agent (no stream draws): 0-1. */
const pickOf = (a: Agent, salt: number) => hash01(a.id, 40 + salt);

/** Roulette bet kind: bolder players (who like volatile slots) go for dozens and single numbers. */
function rouletteBet(a: Agent): number {
  const vol = GUEST_TYPES[a.g!.type].games.thunder ?? 0.5, u = pickOf(a, 1);
  return u < vol * 0.35 ? 2 : u < vol * 0.35 + 0.25 ? 1 : 0;
}
/** Craps: don't pass (a few; more among sharp players), and how much odds they take (a multiple, or "all"). */
const crapsDont = (a: Agent) => pickOf(a, 2) < [0.05, 0.1, 0.2][a.g!.skill];
const crapsOdds = (a: Agent, allowed: number) => [0, Math.min(1, allowed), allowed][a.g!.skill];
/** Baccarat: banker, player or tie. */
function bacBet(a: Agent): number {
  const u = pickOf(a, 3), tie = [0.12, 0.05, 0.02][a.g!.skill];
  return u < tie ? 2 : u < tie + 0.6 * (1 - tie) ? 0 : 1;
}
const kenoSpots = (a: Agent) => KENO_SPOTS[Math.floor(pickOf(a, 4) * KENO_SPOTS.length)];

/** A table's limits for this object now, with a high-limit room's multiplier. */
export function limitsNow(g: Game, o: PlacedObject): [number, number] {
  const [min, max] = limitsOf(o), k = stakeMult(g, o);
  return [min * k, max * k];
}

/** What a guest would like to bet per hand at a table, before the limits. */
export const tableWant = (gd: GuestData) => wantBet(gd) * GUEST_TYPES[gd.type].tableStake;

/**
 * Whether a guest will sit at this table: the wish to bet reaches half the minimum and the wallet covers a couple
 * of rounds at it. Pool games take a fixed stake.
 */
export function canSit(g: Game, gd: GuestData, o: PlacedObject): boolean {
  const [lo] = limitsNow(g, o);
  return tableWant(gd) >= lo * 0.5 && gd.wallet >= lo * HANDS * 2;
}

/** The bet per hand for a guest at a table: their wish within the limits, rounded to chips, covered by the wallet. */
function tableBet(g: Game, gd: GuestData, o: PlacedObject, r: Rng, eng = 1): number {
  const [lo, hi] = limitsNow(g, o);
  // A cheat mid-spell presses (docs/spec/cheats.md), but paces it to their take, as at a machine: a slot cheat's
  // take comes in over some forty rigged wagers. (M11.1) Engaged players bet more.
  let want = gd.spell > 0 ? Math.max(tableWant(gd), gd.take / 40) : tableWant(gd) * Math.sqrt(eng);
  // A counter spreads their bets with the count.
  if (gd.counter && OBJECTS[o.kind].game === "blackjack" && gd.spell <= 0) want = lo * r.pick(COUNT_SPREAD) * Math.max(1, want / lo / 2);
  const chip = lo >= 25 ? 5 : lo >= 1 ? 1 : 0.25;
  let bet = Math.max(lo, Math.min(hi, Math.round(want / chip) * chip));
  if (bet * HANDS > gd.wallet + 1e-9) bet = Math.floor(gd.wallet / HANDS / chip) * chip;
  return bet >= lo - 1e-9 ? bet : 0;
}

/**
 * How much a guest of this type wants a table: taste for the game, the rules if they notice them, a counter's
 * eye for a beatable game, the room, and the limits. ≤ 0 means no.
 */
export function tableAppeal(g: Game, gd: GuestData, o: PlacedObject): number {
  const type = GUEST_TYPES[gd.type], fam = OBJECTS[o.kind].game!, def = TABLE_GAMES[fam];
  // M9.5: big nights lift the sportsbook and poker.
  let appeal = (type.games[fam] ?? 0) * gameBoost(g.state, fam);
  if (fam === "blackjack" && gd.counter) {
    // Counters read the rules closely: 6:5 isn't worth it; fewer decks are gold.
    if ((o.rules?.[0] ?? 0) === 1) return 0;
    appeal = Math.max(appeal, 1) + ((o.rules?.[1] ?? 0) >= 2 ? 0.3 : 0);
  }
  if (appeal <= 0.05) return 0;
  appeal += type.rules * rulesScore(fam, o.rules) * 0.5;
  const hl = purposeOf(g, o) === "highlimit";
  if (hl && (def.privacy || type.tableDraw > 0)) appeal += 0.4;
  // The limits: a high roller at a table whose maximum is far below what they'd like likes it less.
  if (!def.pool && tableWant(gd) > limitsNow(g, o)[1] * 1.5) appeal -= 0.3;
  return appeal;
}

// ---------------------------------------------------------------------------------------------------------
// Dealing.

interface Player { a: Agent; k: number; bet: number; ws: Wager[]; eng: number }

function drawIndex(r: Rng, ps: number[]): number {
  let u = r.next();
  for (let k = 0; k < ps.length; k++) { if (u < ps[k]) return k; u -= ps[k]; }
  return ps.length - 1;
}
const CRAPS_P = CRAPS_OUTCOMES.map((o) => o.p);

/** Pool games: one winner, weighted, takes the pot less the house's cut; the suspicion tools get the fair share. */
function poolHand(name: string, ps: Player[], stakes: number[], weights: number[], cut: number, r: Rng): { winner: number; prize: number } {
  const pot = stakes.reduce((a, b) => a + b, 0), prize = pot - cut;
  let tw = 0;
  for (const w of weights) tw += w;
  let u = r.next() * tw, winner = ps.length - 1;
  for (let k = 0; k < ps.length; k++) { if (u < weights[k]) { winner = k; break; } u -= weights[k]; }
  ps.forEach((p, k) => {
    const h = stakes[k] / pot, ev = prize * h;
    const m: SlotModel = { id: "pool", name, denom: 1, maxCredits: 1, spin: 1, rtp: ev / stakes[k], pays: [], jackpotX: 1e9, breakChance: 0, look: "cherry" };
    p.ws.push({ m, bet: stakes[k], x: k === winner ? prize / stakes[k] : 0, ev, v: prize * prize * h - ev * ev, h });
  });
  return { winner, prize };
}

function deal(g: Game, o: PlacedObject, byId: Map<number, Agent>) {
  const s = g.state, fam = OBJECTS[o.kind].game as Family, def = TABLE_GAMES[fam], tick = s.tick;
  const tbl: TableRound = (o.tbl ??= { next: tick, at: -1, out: [], seats: [] });
  const w = s.map.w, seats = objSeats(o);
  const waiting: { a: Agent; k: number }[] = [];
  (seatHolders(g, o.id) ?? []).forEach((id, k) => {
    const a = id > 0 ? byId.get(id) : undefined;
    if (a?.g && a.act === "play" && a.timer === 1 && a.y * w + a.x === seats[k].y * w + seats[k].x) waiting.push({ a, k });
  });
  if (!waiting.length) { tbl.next = tick + SEC; return; }
  const open = openTables(g).has(o.id);
  if (!open || waiting.length < def.minPlayers) {
    // Closed or short-handed: the waiting players reconsider now and then.
    for (const p of waiting) p.a.timer = -1;
    tbl.next = tick + RECHECK * SEC;
    return;
  }
  const r = rng(s, "gaming");
  const players: Player[] = [];
  for (const p of waiting) {
    const eng = engagement(g, p.a);
    const bet = tableBet(g, p.a.g!, o, r, eng);
    if (bet > 0) players.push({ ...p, bet, ws: [], eng });
    else p.a.timer = -1;
  }
  if (players.length < def.minPlayers) { for (const p of players) p.a.timer = -1; tbl.next = tick + RECHECK * SEC; return; }
  const out: number[] = [];
  const rules = o.rules;
  for (let hand = 0; hand < HANDS; hand++) {
    const last = hand === HANDS - 1;
    switch (fam) {
      case "blackjack": {
        for (const p of players) {
          const m = bjModel(rules, p.a.g!.skill, p.a.g!.counter);
          p.ws.push({ m, bet: p.bet, x: wagerPay(g, p.a.g!, m, drawPay, r) });
        }
        if (last) out.push(r.int(17, 22));
        break;
      }
      case "roulette": {
        const n = pockets(rules), pocket = r.int(0, n - 1);
        for (const p of players) {
          const b = rouletteBet(p.a), m = rouletteModel(rules, b), pick = Math.floor(pickOf(p.a, 5 + hand) * 1e6);
          p.ws.push({ m, bet: p.bet, x: sharedPay(g, p.a.g!, m, rouletteWins(b, pick, pocket) ? ROULETTE_BETS[b].x : 0) });
        }
        if (last) out.push(pocket);
        break;
      }
      case "craps": {
        const i = drawIndex(r, CRAPS_P), oc = CRAPS_OUTCOMES[i];
        for (const p of players) {
          const gd = p.a.g!, bet = crapsDont(p.a) ? 1 : 0, lm = lineModel(bet);
          p.ws.push({ m: lm, bet: p.bet, x: sharedPay(g, gd, lm, lineX(bet, oc)) });
          // A point set: pass-line players take odds, if the wallet covers them.
          if (bet === 0 && (oc.kind === "made" || oc.kind === "out")) {
            const k = crapsOdds(p.a, oddsAllowed(rules, oc.point));
            const staked = p.ws.reduce((a, q) => a + q.bet, 0), room = gd.wallet - staked - p.bet * (HANDS - 1 - hand);
            const odds = Math.min(k * p.bet, Math.max(0, Math.floor(room)));
            if (odds >= 1) { const om = oddsModel(oc.point); p.ws.push({ m: om, bet: odds, x: sharedPay(g, gd, om, oc.kind === "made" ? ODDS_X[oc.point] : 0) }); }
          }
        }
        if (last) out.push(i, r.int(1, 6), r.int(1, 6));
        break;
      }
      case "baccarat": {
        const coup = drawIndex(r, [BAC_P.banker, BAC_P.player, BAC_P.tie]);
        for (const p of players) {
          const b = bacBet(p.a), m = bacModel(rules, b);
          p.ws.push({ m, bet: p.bet, x: sharedPay(g, p.a.g!, m, bacX(rules, b, coup)) });
        }
        if (last) {
          // Totals consistent with the coup, for the cards on the felt.
          const lo = r.int(0, 8), hi = r.int(lo + 1, 9);
          out.push(coup, coup === 0 ? lo : coup === 1 ? hi : lo, coup === 0 ? hi : lo);
        }
        break;
      }
      case "keno": {
        const balls = Array.from({ length: 80 }, (_, k) => k + 1);
        for (let k = 0; k < 20; k++) { const j = r.int(k, 79); [balls[k], balls[j]] = [balls[j], balls[k]]; }
        const drawn = new Set(balls.slice(0, 20));
        for (const p of players) {
          const n = kenoSpots(p.a), m = kenoModel(n), pool = Array.from({ length: 80 }, (_, k) => k + 1);
          let caught = 0;
          for (let k = 0; k < n; k++) { const j = r.int(k, 79); [pool[k], pool[j]] = [pool[j], pool[k]]; if (drawn.has(pool[k])) caught++; }
          p.ws.push({ m, bet: p.bet, x: sharedPay(g, p.a.g!, m, KENO_PAYS[n][caught] ?? 0) });
        }
        if (last) out.push(...balls.slice(0, 20));
        break;
      }
      case "poker": {
        const stakes = players.map((p) => p.bet), pot = stakes.reduce((a, b) => a + b, 0);
        const cut = Math.min(pot * pokerRake(rules), RAKE_CAP * stakeMult(g, o));
        const { winner } = poolHand("Poker", players, stakes, players.map((p) => POKER_WEIGHT[p.a.g!.skill]), cut, r);
        if (last) out.push(players[winner].k);
        break;
      }
      case "sports": {
        // One game settles the whole book: each bettor backed a side (a stable pick per visit).
        const winner = r.int(0, 1), m = sportsModel(rules);
        for (const p of players) p.ws.push({ m, bet: p.bet, x: sharedPay(g, p.a.g!, m, (pickOf(p.a, 7) < 0.5 ? 0 : 1) === winner ? m.win! : 0) });
        if (last) out.push(winner, r.int(0, 40), r.int(0, 40));
        break;
      }
      case "bingo": {
        const cards = players.map((p) => Math.max(1, Math.min(4, Math.round(tableWant(p.a.g!) / p.bet))));
        const stakes = players.map((p, k) => Math.max(p.bet, Math.min(cards[k] * p.bet, Math.floor(p.a.g!.wallet / HANDS / p.bet) * p.bet)));
        const pot = stakes.reduce((a, b) => a + b, 0);
        const { winner } = poolHand("Bingo", players, stakes, stakes, pot * bingoHold(rules), r);
        if (last) out.push(players[winner].k);
        break;
      }
    }
  }
  const result = new Array(seats.length).fill(0);
  let anyWin = false, anyBig = false, bets = 0;
  for (const p of players) {
    const gd = p.a.g!;
    const { won, wagered, jackpot } = settle(g, p.a, o, p.ws, def.ledger);
    bets += wagered;
    gd.mem.feel += won >= wagered ? 1 : (0.3 * won) / wagered;
    result[p.k] = won > wagered + 1e-9 ? 2 : 1;
    anyWin ||= won > wagered;
    anyBig ||= jackpot;
    p.a.timer = -1;
  }
  tbl.at = tick;
  tbl.out = out;
  tbl.seats = result;
  // M9: a skilled dealer deals faster; a crooked one palms chips now and then.
  const dealers = dealersAt(g, o);
  let skill = 0;
  for (const d of dealers) skill += skillOf(g, d);
  tbl.next = tick + Math.round((def.round * SEC) / Math.sqrt(dealers.length ? skill / dealers.length : 1));
  // (M11.1) Time flies for engaged players (as at a machine).
  for (const p of players) p.a.g!.floorTime += Math.round((tbl.next - tick) * (p.eng - 1) * TIME_FLIES);
  const cr = rng(s, "crew");
  for (const d of dealers) {
    if (!d.st?.crook || !cr.chance(greed(g, d, THEFT.dealer.p))) continue;
    steal(g, "tables", Math.max(1, Math.round(bets * THEFT.dealer.share)), d.y * w + d.x, `palming chips at ${OBJECTS[o.kind].name}`, d, undefined, true);
    break;
  }
  o.last = { tick, win: anyBig ? 2 : anyWin ? 1 : 0 };
  // The whole craps table wins together: players and onlookers cheer.
  if (fam === "craps") {
    const oc = CRAPS_OUTCOMES[out[0]];
    if (oc.kind === "made" || oc.kind === "natural") {
      for (const q of g.state.agents) if (q.g && q.target === o.id && (q.act === "play" || q.act === "look")) q.g.buzz = Math.min(20, q.g.buzz + 4);
      g.bus.emit({ type: "sound", id: "cheer", x: o.x, y: o.y });
    } else g.bus.emit({ type: "sound", id: "dice", x: o.x, y: o.y });
  } else if (fam === "roulette") g.bus.emit({ type: "sound", id: "wheel", x: o.x, y: o.y });
  else if (anyBig) g.bus.emit({ type: "sound", id: "win", x: o.x, y: o.y });
}

// ---------------------------------------------------------------------------------------------------------

const commands: CommandTable<"setTable"> = {
  setTable: {
    validate(g, c) {
      const o = g.objById.get(c.id), def = o && tableDefOf(o.kind);
      if (!o || !def) return "Not a table game";
      if (c.rules && (c.rules.length > def.rules.length || c.rules.some((v, k) => !Number.isInteger(v) || v < 0 || v >= def.rules[k].opts.length))) return "Unknown rule";
      if (c.lim !== undefined && (!Number.isInteger(c.lim) || c.lim < 0 || c.lim >= def.limits.length)) return "Unknown limits";
      return null;
    },
    apply(g, c) {
      const o = g.objById.get(c.id)!;
      if (c.rules) o.rules = c.rules.slice();
      if (c.lim !== undefined) o.lim = c.lim;
    },
  },
};

/**
 * (M11) Dealers come with the tables: one per dealer spot, starting at their spot when a table is built, and gone
 * with it when it's sold. A dealer fired for stealing is replaced the same way.
 */
function syncDealers(g: Game) {
  const s = g.state, w = s.map.w;
  let need = 0;
  for (const o of g.tables) need += dealerSeats(o).length;
  const dealers = s.agents.filter((a) => a.role === "dealer");
  if (dealers.length > need) {
    // Let go of the ones not at a table first.
    const out = new Set([...dealers].sort((a, b) => Number(a.act === "deal") - Number(b.act === "deal")).slice(0, dealers.length - need));
    s.agents = s.agents.filter((a) => !out.has(a));
    return;
  }
  if (dealers.length === need) return;
  const taken = new Set<number>();
  for (const a of dealers) if (a.target >= 0) taken.add(a.target * 64 + a.seat);
  let missing = need - dealers.length;
  for (const o of g.tables) {
    const seats = objSeats(o);
    for (const k of dealerSeats(o)) {
      if (!missing) return;
      if (taken.has(o.id * 64 + k)) continue;
      const t = seats[k].y * w + seats[k].x;
      if (!g.walkable(t)) continue;
      const a = hireStaff(g, "dealer", t);
      if (!a) continue;
      a.target = o.id; a.seat = k; a.act = "deal";
      taken.add(o.id * 64 + k);
      missing--;
    }
  }
}

export const tableSystem: System = {
  id: "tables",
  deps: ["gaming"],
  commands,
  init(g) { syncDealers(g); },
  layout(g) {
    // A dealer's table may have gone or moved.
    for (const a of g.state.agents) if (a.role === "dealer" && a.target >= 0 && !g.objById.has(a.target)) { a.act = "idle"; a.target = -1; a.seat = -1; }
    syncDealers(g);
  },
  day(g) { syncDealers(g); },
  tick(g) {
    const s = g.state;
    for (const a of s.agents) {
      if (a.role === "dealer") dealerTick(g, a);
      else if (a.role === "pitboss") pitTick(g, a);
    }
    let byId: Map<number, Agent> | null = null;
    for (const o of g.tables) {
      if (o.tbl && o.tbl.next > s.tick) continue;
      if (!byId) { byId = new Map(); for (const a of s.agents) byId.set(a.id, a); }
      deal(g, o, byId);
    }
  },
};
