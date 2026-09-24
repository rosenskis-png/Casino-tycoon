// Slot rounds (FOUNDATIONS §7, docs/spec/clock.md): each visible round resolves WAGERS_PER_ROUND real wagers
// drawn from the machine's true paytable. The cabinet shows that round's actual result. The guest system
// starts rounds (sets the timer) and decides between them; this system only runs the math.
import { OBJECTS } from "../data/objects";
import { SLOT_MODELS, WAGERS_PER_ROUND, type SlotModel } from "../data/games";
import type { Game } from "./game";
import type { System } from "./registry";
import type { Agent, GuestData } from "./state";
import { rng, type Rng } from "./rng";
import { post } from "./finance";
import { TICKS_PER_SECOND } from "./clock";
import { fmtMoney, news } from "./news";
import { compSeeking } from "./drinks";
import { payStats, wagerPay } from "./cheats";

/** Jackpots at least this big (or this multiple of the bet) reach the ticker; smaller ones only the log. */
const TICKER_JACKPOT = 1000;
const TICKER_JACKPOT_X = 500;

/**
 * Credits a guest bets per wager on this model: their usual stake, raised by drink, by winning (house money)
 * and by losing (chasing it back to even), then fitted to the machine. Comp-seekers bet the minimum.
 */
export function creditsFor(g: Game, gd: GuestData, m: SlotModel): number {
  // A cheat mid-spell bets the most the machine takes.
  if (gd.spell > 0) return m.maxCredits;
  if (compSeeking(g, gd)) return 1;
  const rel = (gd.mem.won - gd.mem.wagered) / Math.max(1, gd.bankroll + gd.withdrawn);
  const swing = rel > 0 ? 1 + 0.8 * Math.min(1, rel) : 1 + 0.5 * Math.min(1, -rel) * (0.5 + gd.chase);
  const want = gd.stake * (1 + 0.6 * gd.intox) * swing;
  return Math.max(1, Math.min(m.maxCredits, Math.round(want / m.denom)));
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
export const modelOf = (kind: string): SlotModel | undefined => (OBJECTS[kind]?.slot ? SLOT_MODELS[OBJECTS[kind].slot!] : undefined);

function resolve(g: Game, a: Agent) {
  const o = g.objById.get(a.target);
  const m = o && modelOf(o.kind);
  const gd = a.g;
  if (!o || !m || !gd) return;
  const r = rng(g.state, "gaming");
  // Bet what they'd like to, or less when that's all the wallet covers.
  const bet = betOf(m, Math.min(creditsFor(g, gd, m), Math.floor(gd.wallet / (m.denom * WAGERS_PER_ROUND) + 1e-9)));
  if (bet * WAGERS_PER_ROUND > gd.wallet + 1e-9) return;
  let won = 0, top = 0, near = 0;
  // Luck and cheating bend what each wager pays (docs/spec/cheats.md); the suspicion tools compare against the math.
  const st = payStats(m);
  for (let k = 0; k < WAGERS_PER_ROUND; k++) {
    const x = wagerPay(g, gd, m, drawPay, r);
    won += Math.abs(x) * bet;
    gd.mem.ev += bet * m.rtp;
    gd.mem.v += bet * bet * st.v;
    gd.mem.hits += x !== 0 ? 1 : 0;
    gd.mem.hexp += st.h;
    gd.mem.hvar += st.h * (1 - st.h);
    // A rigged win (negative) is never a jackpot.
    if (x < 0) continue;
    if (x > top) top = x;
    // Near-miss hook (M8 slot designer): some losing spins are shown as just missing.
    else if (x === 0 && m.nearMiss && r.chance(m.nearMiss)) near++;
  }
  const wagered = bet * WAGERS_PER_ROUND;
  gd.wallet += won - wagered;
  gd.mem.wagered += wagered;
  gd.mem.won += won;
  // How the round felt: a real win, a win smaller than the stake (the slot designer's hook), a near miss.
  gd.mem.rounds++;
  gd.mem.feel += won >= wagered ? 1 : won > 0 ? (m.ldwFeel ?? 0.3) * (won / wagered) : Math.min(1, near * 0.1);
  o.st.rounds++;
  o.st.coinIn += wagered;
  o.st.paidOut += won;
  post(g, "slots", wagered - won);
  const jackpot = top >= m.jackpotX;
  o.last = { tick: g.state.tick, win: jackpot ? 2 : won > 0 ? 1 : 0 };
  if (jackpot) {
    gd.mem.bigWin++;
    // A big win in the first fifth of the visit: the kind that hooks people.
    if (g.state.tick - gd.mem.arrived < gd.floorTime / 5) gd.mem.early = 1;
    const amount = top * bet;
    g.bus.emit({ type: "jackpot", obj: o.id, amount, x: o.x, y: o.y });
    // Jackpots are bad news for the house: red, and only the big ones interrupt.
    news(g, "bad", `Jackpot! ${fmtMoney(amount)} paid out on ${m.name}.`, amount < TICKER_JACKPOT && top < TICKER_JACKPOT_X);
  } else if (won >= wagered * 4) g.bus.emit({ type: "sound", id: "win", x: o.x, y: o.y });
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
      if (--a.timer === 0) { resolve(g, a); a.timer = -1; }
    }
  },
};
