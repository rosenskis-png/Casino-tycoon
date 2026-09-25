// The gaming regulator (FOUNDATIONS §13, docs/spec/money.md): standing, the escalation ladder, and the inspector
// who walks the floor and audits the books (skimming, unpaid winnings, weak controls).
import { BRIBE, REG, SCANDAL_REP, SKIM_FINE_X } from "../data/money";
import { SCENARIOS } from "../data/scenarios";
import { GUEST_TYPES } from "../data/guests";
import type { Game } from "./game";
import type { System } from "./registry";
import type { CommandTable } from "./commands";
import type { Agent, RegulatorState } from "./state";
import { rng } from "./rng";
import { isWalking } from "./agents";
import { post } from "./finance";
import { fmtMoney, newsFor } from "./news";
import { hitReputation } from "./pool";
import { adjustPolice, close, leaveFloor, patrol, spawnVisitor, LADDER, STEP_GAP_DAYS } from "./incidents";
import { GAMING, scaled } from "./bank";
import { TICKS_PER_DAY, TICKS_PER_SECOND } from "./clock";
import { canSee } from "./wayfinding";
import { machinesOf, minRtpOf } from "./design";
const news = newsFor("authorities");

/**
 * (M8) Uncertified slot designs: the base fine and the standing lost when seized. (M11) The inspector has to see a
 * machine to find it (walls and slot banks hide it; sight range in tiles), the first find is a warning with this
 * many days to put it right (and a small standing cost), and a follow-up visit comes then.
 */
const RIG = { fine: 2000, standing: 10, warnStanding: 3, graceDays: 30, sight: 8 };

declare module "./commands" {
  interface CommandTypes {
    /** (M11) Offer a police officer or the gaming inspector on the floor a bribe. */
    bribe: { id: number };
  }
}

export const newRegulator = (): RegulatorState => ({ next: -1, here: -1, suspendAt: -1e9, seen: [], paid: 0 });

export function adjustRegulator(g: Game, delta: number) {
  const r = g.state.auth.regulator;
  r.standing = Math.max(0, Math.min(100, r.standing + delta));
  ladder(g);
}

function ladder(g: Game) {
  const s = g.state, r = s.auth.regulator;
  // M11: like the police, one step a week at most, and the license goes only from the top.
  if (r.standing <= 0 && r.stage >= LADDER.length && s.auth.closedUntil <= s.tick) return revoke(g);
  if (r.stage < LADDER.length && r.standing < LADDER[r.stage] && s.tick - r.stepAt >= STEP_GAP_DAYS * TICKS_PER_DAY) {
    r.stage++;
    r.stepAt = s.tick;
    stepUp(g, r.stage);
  }
  while (r.stage > 0 && r.standing >= LADDER[r.stage - 1] + 5) r.stage--;
}

function stepUp(g: Game, stage: number) {
  const s = g.state;
  if (stage === 1) news(g, "bad", "The gaming regulator has sent a warning letter. Keep the games and the books clean.", { tab: "authorities" });
  // (M11.1) Fines are sized to the casino (sim/bank.ts `scaled`).
  if (stage === 2) { const fine = scaled(g, REG.fine); post(g, "fines", -fine); news(g, "bad", `The gaming regulator fined the casino ${fmtMoney(fine)}.`, { tab: "authorities" }); }
  if (stage === 3) { news(g, "bad", "The gaming regulator will now audit the casino regularly.", { tab: "authorities" }); s.reg.next = s.tick; }
  if (stage === 4 && s.tick - s.reg.suspendAt >= REG.suspendEvery * TICKS_PER_DAY) {
    s.reg.suspendAt = s.tick;
    const fine = scaled(g, REG.suspendFine);
    post(g, "fines", -fine);
    news(g, "urgent", `The gaming license is suspended: closed for ${REG.suspendDays} days and fined ${fmtMoney(fine)}.`);
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
  g.state.reg.seen = [];
  g.state.reg.paid = 0;
  news(g, "info", "An inspector from the gaming regulator is on the floor.", { a: a.id });
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
  // M11: an inspector who took a bribe finds nothing (and says so).
  if (s.reg.paid) { news(g, "good", "The gaming inspector found nothing wrong. (They were paid not to.)"); s.reg.seen = []; return; }
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
  // M8: the inspector tests machines. (M11) Only the uncertified machines they saw: the first time a design is found,
  // a warning and a deadline; found again, its machines are seized and fined (docs/spec/designer.md §10).
  const seen = new Set(s.reg.seen);
  s.reg.seen = [];
  let warned = false;
  for (const [id, rec] of Object.entries(s.designs)) {
    if (!rec.rigged) continue;
    const ms = machinesOf(s, id);
    const spotted = ms.filter((o) => seen.has(o.id));
    if (!spotted.length) continue;
    const sev = Math.max(0, (minRtpOf(s) - rec.d.rtp) * 10) + Math.max(0, rec.d.show.near - 1);
    if (rec.warned === undefined) {
      rec.warned = s.tick;
      delta -= RIG.warnStanding * (1 + sev);
      warned = true;
      found.push(`${spotted.length === 1 ? "an" : spotted.length} uncertified ${rec.d.name} machine${spotted.length === 1 ? "" : "s"}${sev > 0 ? " (rigged)" : ""}: certify ${spotted.length === 1 ? "it" : "them"} or take ${spotted.length === 1 ? "it" : "them"} off the floor within ${RIG.graceDays} days`);
      continue;
    }
    const fine = scaled(g, RIG.fine * (1 + 4 * sev));
    post(g, "fines", -fine);
    delta -= RIG.standing * (1 + sev);
    s.objects = s.objects.filter((o) => !ms.includes(o));
    g.rebuildOccupancy();
    g.tilesChanged(ms.map((o) => o.y * s.map.w + o.x));
    rec.rigged = 0;
    rec.warned = undefined;
    found.push(`${ms.length} uncertified ${rec.d.name} machine${ms.length === 1 ? "" : "s"}${sev > 0 ? " (rigged)" : ""} again: seized, and a fine of ${fmtMoney(fine)}`);
  }
  // A warning brings the inspector back when the deadline is up.
  if (warned) s.reg.next = Math.min(s.reg.next < 0 ? Infinity : s.reg.next, s.tick + RIG.graceDays * TICKS_PER_DAY);
  if (found.length) news(g, "bad", `The gaming inspector found ${found.join("; ")}.`, { tab: "authorities" });
  else { delta += REG.clean; news(g, "good", "The gaming inspector found nothing wrong."); }
  adjustRegulator(g, delta);
}

/** (M11) What the inspector can see from where they stand: uncertified machines within sight, not behind walls or banks. */
function spot(g: Game, a: Agent) {
  const s = g.state, w = s.map.w, here = a.y * w + a.x;
  if (s.reg.paid) return;
  for (const o of s.objects) {
    if (!o.design || !s.designs[o.design]?.rigged || s.reg.seen.includes(o.id)) continue;
    if (Math.abs(o.x - a.x) + Math.abs(o.y - a.y) > RIG.sight * 1.5 || !canSee(g, here, o.y * w + o.x)) continue;
    s.reg.seen.push(o.id);
  }
}

function inspectorTick(g: Game, a: Agent) {
  if (a.act === "leave") { a.hidden = 1; return; }
  if ((g.state.tick + a.id) % TICKS_PER_SECOND === 0 && Object.values(g.state.designs).some((d) => d.rigged)) spot(g, a);
  if (isWalking(a)) return;
  if (g.state.tick >= (a.due ?? 0)) {
    if (a.target !== -2) { audit(g); g.state.reg.here = -1; }
    leaveFloor(g, a);
    a.target = -2;
    return;
  }
  patrol(g, a, rng(g.state, "regulator"));
}

// ---------------------------------------------------------------------------------------------------------
// (M11) Bribes (docs/spec/money.md), where the scenario allows them.

/** Chance an official takes a bribe here (0: nobody can be bribed). */
export const bribeChance = (g: Game) => SCENARIOS[g.state.scenario]?.bribe ?? 0;
/** What a bribe costs for this official (M11.1: sized to the casino). */
export const bribePrice = (g: Game, a: Agent) => scaled(g, a.role === "inspector" ? BRIBE.inspector : BRIBE.officer);

const commands: CommandTable<"bribe"> = {
  bribe: {
    validate(g, c) {
      if (!bribeChance(g)) return "Nobody takes bribes here";
      const a = g.state.agents.find((b) => b.id === c.id);
      if (!a || (a.role !== "inspector" && a.role !== "officer") || a.act === "leave") return "Not an official on the floor";
      if (a.paid) return "Already asked";
      if (g.state.cash < bribePrice(g, a)) return "Not enough cash";
      return null;
    },
    apply(g, c) {
      const s = g.state, a = s.agents.find((b) => b.id === c.id)!, price = bribePrice(g, a), insp = a.role === "inspector";
      const who = insp ? "The gaming inspector" : "The officer";
      if (rng(s, insp ? "regulator" : "police").chance(bribeChance(g))) {
        a.paid = 1;
        post(g, "bribes", -price);
        s.auth.bribed++;
        if (insp) s.reg.paid = 1;
        news(g, "warn", `${who} took ${fmtMoney(price)} to look the other way.`, { a: a.id });
        return;
      }
      a.paid = 2;
      const fine = price * BRIBE.refusedFineX;
      post(g, "fines", -fine);
      if (insp) adjustRegulator(g, -BRIBE.refused);
      else adjustPolice(g, -BRIBE.refused);
      news(g, "urgent", `${who} refused your bribe and reported it: a ${fmtMoney(fine)} fine, and your standing suffers.`, { a: a.id });
    },
  },
};

/** Bribes come out now and then: the more taken lately, the likelier. */
function exposure(g: Game) {
  const s = g.state, au = s.auth;
  if (au.bribed <= 0) return;
  if (rng(s, "regulator").chance(Math.min(0.5, BRIBE.expose * au.bribed))) {
    news(g, "urgent", "It came out that the casino has been paying off officials. A scandal.", { tab: "authorities" });
    adjustPolice(g, -BRIBE.exposed);
    adjustRegulator(g, -BRIBE.exposed);
    for (const t of Object.keys(s.rep)) hitReputation(g, t, SCANDAL_REP * (GUEST_TYPES[t]?.repSensitivity ?? 1));
    au.bribed = 0;
    return;
  }
  au.bribed *= BRIBE.fade;
  if (au.bribed < 0.05) au.bribed = 0;
}

export const regulatorSystem: System = {
  id: "regulator",
  deps: ["incidents", "bank"],
  commands,
  closeMonth(g) { exposure(g); },
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
