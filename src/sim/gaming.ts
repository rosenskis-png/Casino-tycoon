// Slot rounds (FOUNDATIONS §7, docs/spec/clock.md): each visible round resolves WAGERS_PER_ROUND real wagers
// drawn from the machine's true paytable. The cabinet shows that round's actual result. The guest system
// starts rounds (sets the timer) and decides between them; this system only runs the math.
import { OBJECTS } from "../data/objects";
import { SLOT_MODELS, WAGERS_PER_ROUND, type SlotModel } from "../data/games";
import type { Game } from "./game";
import type { System } from "./registry";
import type { Agent } from "./state";
import { rng, type Rng } from "./rng";
import { post } from "./finance";
import { TICKS_PER_SECOND } from "./clock";
import { fmtMoney, news } from "./news";

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
  // Bet their usual credits, or fewer when that's all the wallet covers.
  const bet = betOf(m, Math.min(gd.credits, Math.floor(gd.wallet / (m.denom * WAGERS_PER_ROUND) + 1e-9)));
  if (bet * WAGERS_PER_ROUND > gd.wallet + 1e-9) return;
  let won = 0, top = 0;
  for (let k = 0; k < WAGERS_PER_ROUND; k++) {
    const x = drawPay(m, r);
    won += x * bet;
    if (x > top) top = x;
  }
  const wagered = bet * WAGERS_PER_ROUND;
  gd.wallet += won - wagered;
  gd.mem.wagered += wagered;
  gd.mem.won += won;
  o.st.rounds++;
  o.st.coinIn += wagered;
  o.st.paidOut += won;
  post(g, "slots", wagered - won);
  const jackpot = top >= m.jackpotX;
  o.last = { tick: g.state.tick, win: jackpot ? 2 : won > 0 ? 1 : 0 };
  if (jackpot) {
    gd.mem.bigWin++;
    g.bus.emit({ type: "jackpot", obj: o.id, amount: top * bet, x: o.x, y: o.y });
    if (top * bet >= 500) news(g, "good", `Jackpot! ${fmtMoney(top * bet)} on ${m.name}.`);
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
