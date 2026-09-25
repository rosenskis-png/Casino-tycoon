// Whales (FOUNDATIONS §17, docs/spec/money.md): announced ahead with requests, rich enough that a good night for
// them is a real variance event for the casino. Meeting requests is optional: unmet ones only shorten the visit.
import { WHALE, WHALE_REQUESTS, type WhaleRequest } from "../data/money";
import { FIRST_NAMES, GUEST_TYPES } from "../data/guests";
import { OBJECTS } from "../data/objects";
import { SCENARIOS } from "../data/scenarios";
import { TABLE_GAMES } from "../data/tables";
import type { Game } from "./game";
import type { System } from "./registry";
import { isClosed, type Agent, type WhaleState } from "./state";
import { rng } from "./rng";
import { pickKey, range } from "./dist";
import { fmtMoney, newsFor } from "./news";
import { guestName } from "./cheats";
import { spawnGroup } from "./guests";
import { limitsNow, tableOpen } from "./tables";
import { purposeOf } from "./amenities";
import { GAMING } from "./bank";
import { TICKS_PER_DAY, TICKS_PER_SECOND } from "./clock";
const news = newsFor("guests");

export const newWhale = (): WhaleState => ({ next: -1, due: null, id: -1, game: "", bankroll: 0, name: 0, bet: 0 });

const DAY = TICKS_PER_DAY;
const gameName = (fam: string) => TABLE_GAMES[fam as keyof typeof TABLE_GAMES]?.name.toLowerCase() ?? fam;

/** Banked table games on the floor (not poker or bingo, whose prizes are other players' money). */
function bankedTables(g: Game, fam?: string) {
  return g.tables.filter((o) => {
    const f = OBJECTS[o.kind].game;
    return f && !TABLE_GAMES[f].pool && (!fam || f === fam);
  });
}

/** Whether a whale's request is met right now. */
export function requestMet(g: Game, req: WhaleRequest, fam: string, bet: number): boolean {
  const mine = bankedTables(g, fam);
  switch (req) {
    case "game": return mine.some((o) => tableOpen(g, o));
    case "limit": return mine.some((o) => limitsNow(g, o)[1] >= bet);
    case "private": return mine.some((o) => purposeOf(g, o) === "highlimit");
    case "show": return g.has("show");
    case "comp": return g.amenities.thirst.some((o) => (o.bar?.comp ?? 0) >= 0.5);
  }
}

function announce(g: Game) {
  const s = g.state, w = s.whale, r = rng(s, "whales");
  const hist = s.finance.history.slice(-3);
  const monthly = hist.length ? hist.reduce((a, h) => a + GAMING.reduce((b, k) => b + (h.l[k] ?? 0), 0), 0) / hist.length : 0;
  const bankroll = Math.max(WHALE.bankrollMin, Math.round((Math.max(0, monthly) * range(r, WHALE.bankrollX)) / 1000) * 1000);
  const game = pickKey(r, WHALE.games);
  const extra: WhaleRequest[] = ["limit", "private", "show", "comp"];
  for (let k = extra.length - 1; k > 0; k--) { const j = r.int(0, k); [extra[k], extra[j]] = [extra[j], extra[k]]; }
  const reqs: WhaleRequest[] = ["game", ...extra.slice(0, r.int(1, 3))];
  const name = r.int(0, FIRST_NAMES.length * 26 - 1);
  w.due = { at: s.tick + WHALE.noticeDays * DAY, name, game, reqs, bankroll };
  const bet = Math.round(bankroll * WHALE.betShare);
  news(g, "warn", `A whale is coming in ${WHALE.noticeDays} days: ${guestName(name)} plays ${gameName(game)} at about ${fmtMoney(bet)} a hand, with ${fmtMoney(bankroll)} to spend, and wants ${reqs.map((q) => WHALE_REQUESTS[q]).join(", ")}.`);
}

function arrive(g: Game) {
  const s = g.state, w = s.whale, due = w.due!, r = rng(s, "whales");
  const at = s.map.entrances.find((e) => g.walkable(e)) ?? -1;
  // Closed or unreachable: they come a day later.
  if (at < 0 || isClosed(s)) { due.at = s.tick + DAY; return; }
  const bet = Math.round(due.bankroll * WHALE.betShare);
  const group = spawnGroup(g, "highroller", at, null, 1 + r.int(WHALE.companions[0], WHALE.companions[1]), "gamble");
  const lead = group[0];
  w.due = null;
  w.next = s.tick + r.int(WHALE.everyDays[0], WHALE.everyDays[1]) * DAY;
  if (!lead) return;
  const gd = lead.g!;
  const met = due.reqs.filter((q) => requestMet(g, q as WhaleRequest, due.game, bet)).length;
  Object.assign(gd, {
    vip: 1, name: due.name, bankroll: due.bankroll, wallet: due.bankroll, withdrawCap: 0, atm: 0, compSeek: 0, chase: 0,
    cheat: 0, luck: 0, take: 0, counter: 0,
    // A host shows them around: they know the floor as it is today.
    know: 1, memDate: s.tick, quit: r.chance(0.5) ? "winGoal" : "lossLimit",
    stake: bet / GUEST_TYPES.highroller.tableStake, winGoal: Math.round(due.bankroll * WHALE.winQuit), lossLimit: Math.round(due.bankroll * WHALE.lossQuit), browse: 0,
    floorTime: Math.round(range(r, WHALE.minutes) * 60 * TICKS_PER_SECOND * Math.pow(WHALE.unmetCut, due.reqs.length - met)),
  });
  Object.assign(w, { id: lead.id, game: due.game, bankroll: due.bankroll, name: due.name, bet });
  news(g, "info", `The whale ${guestName(due.name)} has arrived${group.length > 1 ? ` with ${group.length - 1} companion${group.length > 2 ? "s" : ""}` : ""}. Requests met: ${met} of ${due.reqs.length}.`, { a: lead.id });
}

/** The whale walks out: what the house won or lost. */
export function whaleLeft(g: Game, a: Agent) {
  const w = g.state.whale, gd = a.g!;
  if (a.id !== w.id) return;
  const net = gd.mem.wagered - gd.mem.won;
  if (net >= 0) news(g, "good", `The whale ${guestName(gd.name)} left. The house won ${fmtMoney(net)}.`);
  else news(g, "bad", `The whale ${guestName(gd.name)} left. The house lost ${fmtMoney(-net)}.`);
  w.id = -1;
}

export const whaleSystem: System = {
  id: "whales",
  deps: ["guests", "tables", "bank"],
  day(g) {
    const s = g.state, w = s.whale;
    if (!SCENARIOS[s.scenario]?.whales) return;
    if (w.id >= 0 && !s.agents.some((a) => a.id === w.id)) w.id = -1;
    if (w.due) { if (s.tick >= w.due.at) arrive(g); return; }
    if (w.id >= 0) return;
    if (w.next < 0) { w.next = s.tick + rng(s, "whales").int(WHALE.everyDays[0], WHALE.everyDays[1]) * DAY; return; }
    if (s.tick >= w.next && bankedTables(g).length) announce(g);
  },
};
