// Machine rounds (FOUNDATIONS §7, docs/spec/clock.md): each visible round resolves WAGERS_PER_ROUND real wagers
// drawn from the machine's true paytable. The cabinet shows that round's actual result. The guest system
// starts rounds (sets the timer) and decides between them; this system only runs the math. Slots and video
// poker are machines; tables deal their own rounds (sim/tables.ts) and book them through `settle` here.
import { OBJECTS } from "../data/objects";
import { WAGERS_PER_ROUND, type SlotModel } from "../data/games";
import { TABLE_GAMES, ruleOf, vpModel, type TableDef } from "../data/tables";
import type { Game } from "./game";
import type { System } from "./registry";
import type { Agent, GameState, GuestData, PlacedObject } from "./state";
import { slotInfo, statsOf } from "./design";
import { lastSpin, spinCtx } from "./design/compile";
import { recordJackpot, saleFees, saleLine, saleOf } from "./design/market";
import { afterSpin, hasMeters, prepSpin, type MeterHost } from "./design/meters";
import { judged } from "./design/appeal";
import { rng, type Rng } from "./rng";
import { post } from "./finance";
import { TICKS_PER_SECOND } from "./clock";
import { fmtMoney, news } from "./news";
import { compSeeking } from "./drinks";
import { payStats, wagerPay } from "./cheats";
import { stakeMult } from "./amenities";
import { earnComps, ensureCash, expectedExcess, stiff } from "./bank";

/** Jackpots at least this big (or this multiple of the bet) reach the ticker; smaller ones only the log. */
const TICKER_JACKPOT = 1000;
const TICKER_JACKPOT_X = 500;

/** Any game object: a slot, video poker, a table or a draw game. */
export const isGame = (kind: string) => !!(OBJECTS[kind]?.slot || OBJECTS[kind]?.game);
/** The table-game definition of an object (video poker included), if it has one. */
export const tableDefOf = (kind: string): TableDef | undefined => (OBJECTS[kind]?.game ? TABLE_GAMES[OBJECTS[kind].game!] : undefined);
/** Tables and draw games: dealt rounds shared by every seat (everything except slots and video poker). */
export const isTable = (kind: string) => OBJECTS[kind]?.cat === "table";
/** A table's limits per hand before a high-limit room's multiplier: [min, max]. */
export const limitsOf = (o: PlacedObject): [number, number] => {
  const d = tableDefOf(o.kind)!;
  return d.limits[o.lim ?? 0] ?? d.limits[0];
};

/**
 * Credits a guest bets per wager on this model: their usual stake, raised by drink, by winning (house money)
 * and by losing (chasing it back to even), then fitted to the machine. Comp-seekers bet the minimum.
 */
export function creditsFor(g: Game, gd: GuestData, m: SlotModel, mult = 1): number {
  // A cheat mid-spell bets the most the machine takes.
  if (gd.spell > 0) return m.maxCredits;
  const lo = m.minCredits ?? 1;
  if (compSeeking(g, gd)) return lo;
  return Math.max(lo, Math.min(m.maxCredits, Math.round(wantBet(gd) / (m.denom * mult))));
}

/** What a guest would like to bet per wager now: their stake, loosened by drink and swung by how it's going. */
export function wantBet(gd: GuestData): number {
  const rel = (gd.mem.won - gd.mem.wagered) / Math.max(1, gd.bankroll + gd.withdrawn);
  const swing = rel > 0 ? 1 + 0.8 * Math.min(1, rel) : 1 + 0.5 * Math.min(1, -rel) * (0.5 + gd.chase);
  // High (M9.6): up to 40% more.
  return gd.stake * (1 + 0.6 * gd.intox) * (1 + 0.4 * gd.high) * swing;
}

/** Payout multiple for one wager: inverse-CDF lookup on the paytable (M8 designs: one spin played out). */
export function drawPay(m: SlotModel, r: Rng): number {
  if (m.draw) return m.draw(r);
  let u = r.next();
  for (const q of m.pays) {
    if (u < q.p) return q.x;
    u -= q.p;
  }
  return 0;
}

export const betOf = (m: SlotModel, credits: number) => m.denom * Math.max(m.minCredits ?? 1, Math.min(m.maxCredits, credits));
export const roundTicks = (m: SlotModel, pace: number) => Math.max(20, Math.round((m.spin * TICKS_PER_SECOND) / pace));

const vpCache = new Map<string, SlotModel>();
/** Video poker for this player: the machine's paytable less their mistakes, at the machine's denomination. */
function vpFor(o: PlacedObject, skill: number): SlotModel {
  const [min, max] = limitsOf(o), base = vpModel(ruleOf(o.rules, 0), skill), id = `${base.id}:${min}`;
  let m = vpCache.get(id);
  if (!m) vpCache.set(id, (m = { ...base, id, denom: min, maxCredits: Math.max(1, Math.round(max / min)) }));
  return m;
}

/** The machine model an object plays for this guest (slots: its design's; video poker: by the player's skill). */
export function machineModel(s: GameState, o: PlacedObject, gd?: GuestData): SlotModel | undefined {
  const def = OBJECTS[o.kind];
  if (def?.slot) return slotInfo(s, o)?.c.model;
  if (def?.game === "vpoker") return vpFor(o, gd?.skill ?? 1);
  return undefined;
}

/** Least money one round costs at this object, before a high-limit room (Infinity when it isn't a game). */
export function minRoundOf(s: GameState, o: PlacedObject): number {
  const def = OBJECTS[o.kind];
  if (def?.slot) { const m = machineModel(s, o); return m ? m.denom * (m.minCredits ?? 1) * WAGERS_PER_ROUND : Infinity; }
  if (def?.game) return limitsOf(o)[0] * WAGERS_PER_ROUND;
  return Infinity;
}

/** One wager: the model it was drawn from (for the suspicion tools), the bet, and the payout multiple (negative: rigged). */
export interface Wager { m: SlotModel; bet: number; x: number; ev?: number; v?: number; h?: number; cov?: number }

/**
 * Books a guest's round: wallet, visit memory (money, what the math expected, how it felt), the object's stats,
 * the ledger, and big-win news. Returns what came back and whether it held a jackpot.
 */
export function settle(g: Game, a: Agent, o: PlacedObject, ws: Wager[], ledger: string): { won: number; wagered: number; jackpot: boolean } {
  const gd = a.g!, bank = g.state.bank;
  // M9: jackpot insurance covers each payout above the line (not pool prizes: those are other players' money).
  const pool = !!tableDefOf(o.kind)?.pool, over = pool ? 0 : bank.insure;
  let won = 0, wagered = 0, top = 0, topBet = 0, topM: SlotModel | null = null, claim = 0;
  for (const w of ws) {
    const pay = Math.abs(w.x) * w.bet;
    won += pay;
    wagered += w.bet;
    // (M8.6) A wide-area jackpot on a sold design is the maker's to pay (posted before this), not the insurer's.
    if (over) {
      bank.insExp += expectedExcess(w.m, w.bet, over);
      if (pay - (w.cov ?? 0) > over) claim += pay - (w.cov ?? 0) - over;
    }
    const st = w.h === undefined ? payStats(w.m) : { v: w.v!, h: w.h };
    gd.mem.ev += w.ev ?? w.bet * w.m.rtp;
    gd.mem.v += w.v !== undefined ? w.v : w.bet * w.bet * st.v;
    gd.mem.hits += w.x !== 0 ? 1 : 0;
    gd.mem.hexp += st.h;
    gd.mem.hvar += st.h * (1 - st.h);
    // A rigged win (negative) is never a jackpot.
    if (w.x > 0 && w.x >= w.m.jackpotX && pay > top * topBet) { top = w.x; topBet = w.bet; topM = w.m; }
  }
  // M9: a payout the house can't cover, even with emergency credit, goes unpaid (what cash covers is paid).
  if (won > wagered && !pool) {
    const short = ensureCash(g, won - wagered - claim);
    if (short > 0) { won -= short; stiff(g, a, short); }
  }
  gd.wallet += won - wagered;
  if (gd.wallet < 0 && gd.wallet > -1e-6) gd.wallet = 0;
  gd.mem.wagered += wagered;
  gd.mem.won += won;
  gd.mem.rounds++;
  o.st.rounds++;
  o.st.coinIn += wagered;
  o.st.paidOut += won;
  const bt = ((o.st.byType ??= {})[gd.type] ??= [0, 0]);
  bt[0] += wagered;
  bt[1] += won;
  post(g, ledger, wagered - won);
  if (claim) post(g, "insurance", claim);
  earnComps(g, a);
  const jackpot = top > 0;
  if (jackpot) {
    gd.mem.bigWin++;
    // A big win in the first fifth of the visit: the kind that hooks people.
    if (g.state.tick - gd.mem.arrived < gd.floorTime / 5) gd.mem.early = 1;
    const amount = top * topBet;
    g.bus.emit({ type: "jackpot", obj: o.id, amount, x: o.x, y: o.y });
    // Jackpots are bad news for the house: red, and only the big ones interrupt.
    news(g, "bad", `${OBJECTS[o.kind].cat === "game" ? "Jackpot" : "Big win"}! ${fmtMoney(amount)} paid out on ${topM!.name}.`, amount < TICKER_JACKPOT && top < TICKER_JACKPOT_X, { t: o.y * g.state.map.w + o.x });
  }
  return { won, wagered, jackpot };
}

/** Seconds a free spin takes on the floor, as a share of a round (one wager's time). */
const FS_SPIN = 1 / WAGERS_PER_ROUND;

function resolve(g: Game, a: Agent) {
  const o = g.objById.get(a.target);
  const gd = a.g;
  const m = o && machineModel(g.state, o, gd);
  if (!o || !m || !gd) return;
  const slot = !!OBJECTS[o.kind].slot;
  const r = rng(g.state, "gaming");
  // Bet what they'd like to, or less when that's all the wallet covers. A high-limit room multiplies the stakes.
  const mult = stakeMult(g, o);
  const bet = betOf(m, Math.min(creditsFor(g, gd, m, mult), Math.floor(gd.wallet / (m.denom * mult * WAGERS_PER_ROUND) + 1e-9))) * mult;
  if (bet * WAGERS_PER_ROUND > gd.wallet + 1e-9) return;
  // Luck and cheating bend what each wager pays (docs/spec/cheats.md); the suspicion tools compare against the math.
  // (M8.5) A designed slot's progressive meters and collector are live: each wager feeds them and can win them.
  const inf = slot ? slotInfo(g.state, o) : undefined;
  const host: MeterHost | null = inf && (hasMeters(inf.c) || inf.c.col) ? { meters: g.state.meters, own: o, id: inf.id } : null;
  const ws: Wager[] = [];
  // (M8.6) A sold design: the maker takes its cut and the meters' increments, and pays their jackpots.
  const sale = inf ? saleOf(g.state, inf.id) : undefined;
  let inc = 0, covered = 0;
  let near = 0, feats = 0, extra = 0, jps = 0, voided = 0, big = false, seen = "";
  for (let k = 0; k < WAGERS_PER_ROUND; k++) {
    if (host) prepSpin(host, inf!.c, bet, r);
    lastSpin.kind = 0; lastSpin.level = -1; lastSpin.voided = -1; lastSpin.secs = 0; lastSpin.spins = 0; lastSpin.feat = "";
    let x = wagerPay(g, gd, m, drawPay, r);
    const kind = lastSpin.kind as number, feat = lastSpin.feat as string;
    let mhb = 0;
    if (host) {
      const a = afterSpin(host, inf!.c, bet, x !== 0 ? lastSpin.level : -1, r);
      if (a.x) { x = x < 0 ? x - a.x : x + a.x; jps++; mhb = a.x * bet; }
    }
    let cv = sale ? mhb : 0;
    if (sale && host) {
      for (const l of inf!.c.levels) if (l.kind !== "fixed") inc += l.inc * bet;
      const lv = lastSpin.level as number, l = inf!.c.levels[lv];
      if (x > 0 && lv >= 0 && lastSpin.voided < 0 && l && (l.kind === "sa" || l.kind === "linked")) cv += (spinCtx.mx[lv] ?? 0) * bet;
    }
    ws.push({ m, bet, x, cov: cv || undefined });
    covered += cv;
    // A design's features (and named jackpots) that actually paid this guest, and the time they take to play out.
    if (x > 0 && kind === 1) {
      feats++;
      seen = feat;
      extra += feat === "fs" ? lastSpin.spins * FS_SPIN * m.spin * TICKS_PER_SECOND : lastSpin.secs * 0.5 * TICKS_PER_SECOND;
      if ((feat !== "fs" && feat !== "collect") || x >= 50) big = true;
    } else if (lastSpin.secs > 0) extra += lastSpin.secs * 0.5 * TICKS_PER_SECOND;
    if (x > 0 && (kind === 2 || lastSpin.level >= 0)) jps++;
    if (lastSpin.voided >= 0) voided++;
    // Near misses: some losing spins are shown as just missing (docs/spec/designer.md §2).
    if (x === 0 && m.nearMiss && r.chance(m.nearMiss)) near++;
  }
  if (sale && covered) post(g, saleLine(inf!.id), covered);
  const { won, wagered, jackpot } = settle(g, a, o, ws, "slots");
  if (sale) saleFees(g, inf!.id, sale, wagered, inf!.c.d.rtp, inc);
  if (jackpot && inf) recordJackpot(g, inf.id, won);
  // How the round felt: a feature, a real win, a win smaller than the stake, a near miss.
  gd.mem.feel += feats ? 1.5 : won >= wagered ? 1 : won > 0 ? (m.ldwFeel ?? 0.3) * (won / wagered) : Math.min(1, near * 0.1);
  o.last = { tick: g.state.tick, win: jackpot ? 2 : feats ? 3 : won > 0 ? 1 : 0 };
  if (inf) {
    const st = statsOf(g.state, inf.id);
    st.coinIn += wagered; st.paidOut += won; st.rounds++; st.feats += feats; st.jps += jps; st.rWin += wagered - won;
    st.theo = (st.theo ?? 0) + wagered * (1 - inf.c.d.rtp);
    gd.game = inf.id;
    if (feats) {
      gd.sf = (gd.sf ?? 0) + feats;
      gd.sfk = seen;
      g.bus.emit({ type: "sound", id: inf.d.show.call, x: o.x, y: o.y });
      // A big bonus draws a crowd (onlookers, like a hot craps table).
      if (big) g.bonusNow.set(o.id, g.state.tick + Math.max(extra, 8 * TICKS_PER_SECOND));
    }
    gd.extra = (gd.extra ?? 0) + Math.round(extra);
    if (voided) gd.voided = (gd.voided ?? 0) + voided;
    // Excitement buys hold: time on a thrilling machine counts for more in the visit's value (docs/spec/designer.md §5).
    let ex = inf.ex.get(gd.type);
    if (ex === undefined) inf.ex.set(gd.type, (ex = judged(inf.c, gd.type).excitement));
    gd.mem.thrill = (gd.mem.thrill ?? 0) + (m.spin * TICKS_PER_SECOND) * (0.06 * ex - 0.3);
  }
  if (!jackpot && won >= wagered * 4) g.bus.emit({ type: "sound", id: "win", x: o.x, y: o.y });
  if (!o.broken && r.chance(m.breakChance)) {
    o.broken = 1;
    g.bus.emit({ type: "broken", obj: o.id });
  }
}

export const gamingSystem: System = {
  id: "gaming",
  deps: ["movement"],
  tick(g) {
    for (const a of g.state.agents) {
      if (a.act !== "play" || a.timer <= 0) continue;
      // Tables deal their own rounds (sim/tables.ts): their players wait with timer 1.
      const o = g.objById.get(a.target);
      if (o && isTable(o.kind)) continue;
      if (--a.timer === 0) { resolve(g, a); a.timer = -1; }
    }
  },
};
