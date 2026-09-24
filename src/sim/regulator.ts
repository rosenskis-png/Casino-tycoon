// The gaming regulator (FOUNDATIONS §13, docs/spec/money.md): standing, the escalation ladder, and the inspector
// who walks the floor and audits the books (skimming, unpaid winnings, weak controls).
import { REG, SCANDAL_REP, SKIM_FINE_X } from "../data/money";
import { GUEST_TYPES } from "../data/guests";
import type { Game } from "./game";
import type { System } from "./registry";
import type { Agent, RegulatorState } from "./state";
import { rng } from "./rng";
import { isWalking } from "./agents";
import { post } from "./finance";
import { fmtMoney, news } from "./news";
import { hitReputation } from "./pool";
import { close, leaveFloor, patrol, spawnVisitor, LADDER } from "./incidents";
import { GAMING } from "./bank";
import { TICKS_PER_DAY, TICKS_PER_SECOND } from "./clock";

export const newRegulator = (): RegulatorState => ({ next: -1, here: -1, suspendAt: -1e9 });

export function adjustRegulator(g: Game, delta: number) {
  const r = g.state.auth.regulator;
  r.standing = Math.max(0, Math.min(100, r.standing + delta));
  ladder(g);
}

function ladder(g: Game) {
  const s = g.state, r = s.auth.regulator;
  if (r.standing <= 0 && s.auth.closedUntil <= s.tick) return revoke(g);
  while (r.stage < LADDER.length && r.standing < LADDER[r.stage]) { r.stage++; stepUp(g, r.stage); }
  while (r.stage > 0 && r.standing >= LADDER[r.stage - 1] + 5) r.stage--;
}

function stepUp(g: Game, stage: number) {
  const s = g.state;
  if (stage === 1) news(g, "bad", "The gaming regulator has sent a warning letter. Keep the games and the books clean.");
  if (stage === 2) { post(g, "fines", -REG.fine); news(g, "bad", `The gaming regulator fined the casino ${fmtMoney(REG.fine)}.`); }
  if (stage === 3) { news(g, "bad", "The gaming regulator will now audit the casino regularly."); s.reg.next = s.tick; }
  if (stage === 4 && s.tick - s.reg.suspendAt >= REG.suspendEvery * TICKS_PER_DAY) {
    s.reg.suspendAt = s.tick;
    post(g, "fines", -REG.suspendFine);
    news(g, "urgent", `The gaming license is suspended: closed for ${REG.suspendDays} days and fined ${fmtMoney(REG.suspendFine)}.`);
    close(g, REG.suspendDays);
  }
}

function revoke(g: Game) {
  const s = g.state;
  s.auth.revoked++;
  if (!s.outcome) s.outcome = "lost";
  news(g, "urgent", `The gaming regulator revoked the casino's license. The scenario is lost; it may reopen in ${REG.revokeDays} days if you keep playing.`);
  close(g, REG.revokeDays);
  s.auth.regulator.standing = 30;
  s.auth.regulator.stage = 3;
}

const visitGap = (g: Game) => {
  const r = rng(g.state, "regulator");
  return (g.state.auth.regulator.stage >= 3 ? REG.auditEvery : r.int(REG.visitDays[0], REG.visitDays[1])) * TICKS_PER_DAY;
};

function sendInspector(g: Game) {
  const a = spawnVisitor(g, "inspector");
  if (!a) return;
  a.due = g.state.tick + REG.visitSecs * TICKS_PER_SECOND;
  g.state.reg.here = a.id;
  news(g, "info", "An inspector from the gaming regulator is on the floor.");
}

/** Gaming win over the last three closed months. */
function recentWin(g: Game): number {
  let v = 0;
  for (const h of g.state.finance.history.slice(-3)) for (const k of GAMING) v += h.l[k] ?? 0;
  return v;
}

/** The inspector's findings as they leave. */
function audit(g: Game) {
  const s = g.state, b = s.bank, r = rng(s, "regulator");
  const found: string[] = [];
  let delta = 0;
  if (b.evaded >= 1 && r.chance(REG.skimBase + b.skim)) {
    const fine = SKIM_FINE_X * b.evaded;
    post(g, "fines", -fine);
    delta -= REG.skimFound + REG.skimFoundPerShare * b.skim;
    found.push(`skimming (back taxes and a fine of ${fmtMoney(fine)})`);
    b.evaded = 0;
    for (const t of Object.keys(s.rep)) hitReputation(g, t, SCANDAL_REP * (GUEST_TYPES[t]?.repSensitivity ?? 1));
  }
  if (b.unpaid > 0) {
    delta -= REG.auditUnpaid * b.unpaid;
    found.push(`${b.unpaid} unpaid win${b.unpaid === 1 ? "" : "s"}`);
    b.unpaid = 0;
  }
  const shrink = s.crew.hist.reduce((a, v) => a + v, 0), win = recentWin(g);
  if (win > 0 && shrink > REG.weakShare * win) {
    delta -= REG.weakControls;
    found.push("weak controls (money going missing)");
  }
  if (found.length) news(g, "bad", `The gaming inspector found ${found.join(", ")}.`);
  else { delta += REG.clean; news(g, "good", "The gaming inspector found nothing wrong."); }
  adjustRegulator(g, delta);
}

function inspectorTick(g: Game, a: Agent) {
  if (a.act === "leave") { a.hidden = 1; return; }
  if (isWalking(a)) return;
  if (g.state.tick >= (a.due ?? 0)) {
    if (a.target !== -2) { audit(g); g.state.reg.here = -1; }
    leaveFloor(g, a);
    a.target = -2;
    return;
  }
  patrol(g, a, rng(g.state, "regulator"));
}

export const regulatorSystem: System = {
  id: "regulator",
  deps: ["incidents", "bank"],
  tick(g) {
    const s = g.state;
    if (s.reg.here < 0 && !s.agents.some((a) => a.role === "inspector")) return;
    for (const a of s.agents) if (a.role === "inspector") inspectorTick(g, a);
    if (s.agents.some((a) => a.hidden && a.role === "inspector")) s.agents = s.agents.filter((a) => !(a.hidden && a.role === "inspector"));
  },
  day(g) {
    const s = g.state, reg = s.reg, r = s.auth.regulator;
    r.standing = Math.min(100, r.standing + REG.recover);
    ladder(g);
    if (reg.here >= 0 && !s.agents.some((a) => a.id === reg.here)) reg.here = -1;
    if (reg.next < 0) reg.next = s.tick + visitGap(g);
    if (s.tick >= reg.next && s.auth.closedUntil < 0 && reg.here < 0) {
      reg.next = s.tick + visitGap(g);
      sendInspector(g);
    }
  },
};
