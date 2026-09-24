// Machine rounds (FOUNDATIONS §7, docs/spec/clock.md): each visible round resolves WAGERS_PER_ROUND real wagers
// drawn from the machine's true paytable. The cabinet shows that round's actual result. The guest system
// starts rounds (sets the timer) and decides between them; this system only runs the math. Slots and video
// poker are machines; tables deal their own rounds (sim/tables.ts) and book them through `settle` here.
import { OBJECTS } from "../data/objects";
import { SLOT_MODELS, WAGERS_PER_ROUND, type SlotModel } from "../data/games";
import { TABLE_GAMES, ruleOf, vpModel, type TableDef } from "../data/tables";
import type { Game } from "./game";
import type { System } from "./registry";
import type { Agent, GuestData, PlacedObject } from "./state";
import { rng, type Rng } from "./rng";
import { post } from "./finance";
import { TICKS_PER_SECOND } from "./clock";
import { fmtMoney, news } from "./news";
import { compSeeking } from "./drinks";
import { payStats, wagerPay } from "./cheats";
import { stakeMult } from "./amenities";

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
  if (compSeeking(g, gd)) return 1;
  return Math.max(1, Math.min(m.maxCredits, Math.round(wantBet(gd) / (m.denom * mult))));
}

/** What a guest would like to bet per wager now: their stake, loosened by drink and swung by how it's going. */
export function wantBet(gd: GuestData): number {
  const rel = (gd.mem.won - gd.mem.wagered) / Math.max(1, gd.bankroll + gd.withdrawn);
  const swing = rel > 0 ? 1 + 0.8 * Math.min(1, rel) : 1 + 0.5 * Math.min(1, -rel) * (0.5 + gd.chase);
  return gd.stake * (1 + 0.6 * gd.intox) * swing;
}

/** Payout multiple for one wager: inverse-CDF lookup on the paytable. */
export function drawPay(m: SlotModel, r: Rng): number {
  let u = r.next();
  for (const q of m.pays) {
    if (u < q.p) return q.x;
    u -= q.p;
  }
  return 0;
}

export const betOf = (m: SlotModel, credits: number) => m.denom * Math.max(1, Math.min(m.maxCredits, credits));
export const roundTicks = (m: SlotModel, pace: number) => Math.max(20, Math.round((m.spin * TICKS_PER_SECOND) / pace));

const vpCache = new Map<string, SlotModel>();
/** Video poker for this player: the machine's paytable less their mistakes, at the machine's denomination. */
function vpFor(o: PlacedObject, skill: number): SlotModel {
  const [min, max] = limitsOf(o), base = vpModel(ruleOf(o.rules, 0), skill), id = `${base.id}:${min}`;
  let m = vpCache.get(id);
  if (!m) vpCache.set(id, (m = { ...base, id, denom: min, maxCredits: Math.max(1, Math.round(max / min)) }));
  return m;
}

/** The machine model an object plays for this guest (slots: the model; video poker: by the player's skill). */
export function machineModel(o: PlacedObject, gd?: GuestData): SlotModel | undefined {
  const def = OBJECTS[o.kind];
  if (def?.slot) return SLOT_MODELS[def.slot];
  if (def?.game === "vpoker") return vpFor(o, gd?.skill ?? 1);
  return undefined;
}
/** The slot model behind an object kind (slots only; the UI's paytable figures). */
export const modelOf = (kind: string): SlotModel | undefined => (OBJECTS[kind]?.slot ? SLOT_MODELS[OBJECTS[kind].slot!] : undefined);

/** Least money one round costs at this object, before a high-limit room (Infinity when it isn't a game). */
export function minRoundOf(o: PlacedObject): number {
  const def = OBJECTS[o.kind];
  if (def?.slot) return SLOT_MODELS[def.slot].denom * WAGERS_PER_ROUND;
  if (def?.game) return limitsOf(o)[0] * WAGERS_PER_ROUND;
  return Infinity;
}

/** One wager: the model it was drawn from (for the suspicion tools), the bet, and the payout multiple (negative: rigged). */
export interface Wager { m: SlotModel; bet: number; x: number; ev?: number; v?: number; h?: number }

/**
 * Books a guest's round: wallet, visit memory (money, what the math expected, how it felt), the object's stats,
 * the ledger, and big-win news. Returns what came back and whether it held a jackpot.
 */
export function settle(g: Game, a: Agent, o: PlacedObject, ws: Wager[], ledger: string): { won: number; wagered: number; jackpot: boolean } {
  const gd = a.g!;
  let won = 0, wagered = 0, top = 0, topBet = 0, topM: SlotModel | null = null;
  for (const w of ws) {
    const pay = Math.abs(w.x) * w.bet;
    won += pay;
    wagered += w.bet;
    const st = w.h === undefined ? payStats(w.m) : { v: w.v!, h: w.h };
    gd.mem.ev += w.ev ?? w.bet * w.m.rtp;
    gd.mem.v += w.v !== undefined ? w.v : w.bet * w.bet * st.v;
    gd.mem.hits += w.x !== 0 ? 1 : 0;
    gd.mem.hexp += st.h;
    gd.mem.hvar += st.h * (1 - st.h);
    // A rigged win (negative) is never a jackpot.
    if (w.x > 0 && w.x >= w.m.jackpotX && pay > top * topBet) { top = w.x; topBet = w.bet; topM = w.m; }
  }
  gd.wallet += won - wagered;
  if (gd.wallet < 0 && gd.wallet > -1e-6) gd.wallet = 0;
  gd.mem.wagered += wagered;
  gd.mem.won += won;
  gd.mem.rounds++;
  o.st.rounds++;
  o.st.coinIn += wagered;
  o.st.paidOut += won;
  post(g, ledger, wagered - won);
  const jackpot = top > 0;
  if (jackpot) {
    gd.mem.bigWin++;
    // A big win in the first fifth of the visit: the kind that hooks people.
    if (g.state.tick - gd.mem.arrived < gd.floorTime / 5) gd.mem.early = 1;
    const amount = top * topBet;
    g.bus.emit({ type: "jackpot", obj: o.id, amount, x: o.x, y: o.y });
    // Jackpots are bad news for the house: red, and only the big ones interrupt.
    news(g, "bad", `${OBJECTS[o.kind].cat === "game" ? "Jackpot" : "Big win"}! ${fmtMoney(amount)} paid out on ${topM!.name}.`, amount < TICKER_JACKPOT && top < TICKER_JACKPOT_X);
  }
  return { won, wagered, jackpot };
}

function resolve(g: Game, a: Agent) {
  const o = g.objById.get(a.target);
  const gd = a.g;
  const m = o && machineModel(o, gd);
  if (!o || !m || !gd) return;
  const r = rng(g.state, "gaming");
  // Bet what they'd like to, or less when that's all the wallet covers. A high-limit room multiplies the stakes.
  const mult = stakeMult(g, o);
  const bet = betOf(m, Math.min(creditsFor(g, gd, m, mult), Math.floor(gd.wallet / (m.denom * mult * WAGERS_PER_ROUND) + 1e-9))) * mult;
  if (bet * WAGERS_PER_ROUND > gd.wallet + 1e-9) return;
  // Luck and cheating bend what each wager pays (docs/spec/cheats.md); the suspicion tools compare against the math.
  const ws: Wager[] = [];
  let near = 0;
  for (let k = 0; k < WAGERS_PER_ROUND; k++) {
    const x = wagerPay(g, gd, m, drawPay, r);
    ws.push({ m, bet, x });
    // Near-miss hook (M8 slot designer): some losing spins are shown as just missing.
    if (x === 0 && m.nearMiss && r.chance(m.nearMiss)) near++;
  }
  const { won, wagered, jackpot } = settle(g, a, o, ws, "slots");
  // How the round felt: a real win, a win smaller than the stake (the slot designer's hook), a near miss.
  gd.mem.feel += won >= wagered ? 1 : won > 0 ? (m.ldwFeel ?? 0.3) * (won / wagered) : Math.min(1, near * 0.1);
  o.last = { tick: g.state.tick, win: jackpot ? 2 : won > 0 ? 1 : 0 };
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
