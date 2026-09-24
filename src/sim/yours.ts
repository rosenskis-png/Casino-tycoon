// Playing the games yourself (FOUNDATIONS §23; docs/spec/play.md). The player sits down at one of their own
// machines or tables and plays real hands: that object's model, paytable, rules and limits (×5 in a high-limit
// room), with ordinary luck. Every draw is a command on the "yours" stream; stakes come from casino cash and
// winnings go back to it on their own ledger line, outside the object's stats, the gaming tax and the regulator.
import { OBJECTS } from "../data/objects";
import { SLOT_MODELS } from "../data/games";
import { BAC_BETS, KENO_PAYS, KENO_SPOTS, ODDS_X, RED, bacX, bjDecks, oddsAllowed, pockets, ruleOf, type Rules } from "../data/tables";
import type { CommandTable } from "./commands";
import type { Game } from "./game";
import type { System } from "./registry";
import type { PlacedObject, YourPlay, YourFam } from "./state";
import { rng, type Rng } from "./rng";
import { post } from "./finance";
import { betOf, drawPay, limitsOf } from "./gaming";
import { limitsNow, tableOpen } from "./tables";
import { stakeMult } from "./amenities";
import { fmtMoney, news } from "./news";

declare module "./commands" {
  interface CommandTypes {
    /**
     * One move at your own game. `open` sits down at object `id`; `close` gets up (between hands only). Then per
     * game: slots `spin` (bet = credits); video poker `deal` (bet = coins) and `draw` (held = card positions);
     * blackjack `deal` (bet), `hit`, `stand`, `double`, `split`; roulette `spin` (bets by spot); craps `roll`
     * (bets: pass or dp on the come-out, odds once a point is set); baccarat `deal` (bets: banker, player, tie);
     * keno `draw` (picks, bet).
     */
    yours: { act: string; id?: number; bet?: number; bets?: Record<string, number>; held?: number[]; picks?: number[] };
  }
}

/** Games you can't sit down at: players play each other (poker, bingo), or it isn't a simulated game (sportsbook). */
const EXCLUDED = new Set(["poker", "bingo", "sports"]);

export function yourFam(kind: string): YourFam | null {
  const def = OBJECTS[kind];
  if (def?.slot) return "slot";
  if (!def?.game || EXCLUDED.has(def.game)) return null;
  return def.game as YourFam;
}

/** Why you can't sit down at this object now, or null. */
export function cantPlay(g: Game, o: PlacedObject | undefined): string | null {
  if (!o || !yourFam(o.kind)) return "You can't play this";
  if (o.broken) return "It's broken down";
  if (!tableOpen(g, o)) return "No dealer: the table is closed";
  return null;
}

// ---- Cards: ids 0-51, rank = id % 13 (0 = two … 8 = ten, 9 J, 10 Q, 11 K, 12 A), suit = id / 13.
export const rankOf = (c: number) => c % 13;
/** Deals one card from a freshly shuffled shoe of `decks` decks, less the cards already out this hand. */
export function drawCard(r: Rng, decks: number, used: number[]): number {
  const cnt = new Array(52).fill(decks);
  for (const c of used) cnt[c]--;
  let u = r.int(0, 52 * decks - used.length - 1);
  for (let c = 0; c < 52; c++) {
    if (u < cnt[c]) { used.push(c); return c; }
    u -= cnt[c];
  }
  throw new Error("shoe empty");
}

// ---- Blackjack.
const bjVal = (c: number) => { const k = rankOf(c); return k === 12 ? 11 : k >= 8 ? 10 : k + 2; };
export function bjTotal(cards: number[]): { t: number; soft: boolean } {
  let t = 0, aces = 0;
  for (const c of cards) { t += bjVal(c); if (rankOf(c) === 12) aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { t, soft: aces > 0 };
}
const natural = (cards: number[]) => cards.length === 2 && bjTotal(cards).t === 21;
/** The dealer draws to 17, and hits soft 17 when the table's rule says so. */
export function dealerDone(cards: number[], h17: boolean): boolean {
  const { t, soft } = bjTotal(cards);
  return t > 17 || (t === 17 && !(soft && h17));
}

// ---- Video poker: Jacks or Better, the table's full house / flush pays (data/tables.ts vpModel).
const VP_FH_FL: [number, number][] = [[9, 6], [8, 5], [7, 5], [6, 5]];
export const VP_HANDS = ["Nothing", "Jacks or better", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush", "Royal flush"];
/** Hand class (index into VP_HANDS) of five cards. */
export function vpHand(cards: number[]): number {
  const ranks = cards.map(rankOf).sort((a, b) => a - b);
  const flush = cards.every((c) => Math.floor(c / 13) === Math.floor(cards[0] / 13));
  const counts = new Map<number, number>();
  for (const k of ranks) counts.set(k, (counts.get(k) ?? 0) + 1);
  const n = [...counts.values()].sort((a, b) => b - a);
  const distinct = counts.size === 5;
  const wheel = ranks.join() === "0,1,2,3,12";
  const straight = distinct && (ranks[4] - ranks[0] === 4 || wheel);
  if (straight && flush) return ranks[0] === 8 ? 9 : 8;
  if (n[0] === 4) return 7;
  if (n[0] === 3 && n[1] === 2) return 6;
  if (flush) return 5;
  if (straight) return 4;
  if (n[0] === 3) return 3;
  if (n[0] === 2 && n[1] === 2) return 2;
  if (n[0] === 2) { for (const [k, m] of counts) if (m === 2 && k >= 9) return 1; }
  return 0;
}
/** Payout multiple (stake included) of a hand class on a paytable (0 = 9/6 …). */
export function vpX(pay: number, hand: number): number {
  const [fh, fl] = VP_FH_FL[pay] ?? VP_FH_FL[0];
  return [0, 1, 2, 3, 4, fl, fh, 25, 50, 800][hand];
}

// ---- Baccarat (8 decks): card points and the third-card rule.
const bacPt = (c: number) => { const k = rankOf(c); return k === 12 ? 1 : k >= 8 ? 0 : k + 2; };
export const bacTotal = (cards: number[]) => cards.reduce((s, c) => s + bacPt(c), 0) % 10;
/** Whether the banker draws, given their total and the player's third card's points (-1 = the player stood). */
export function bankerDraws(b: number, p3: number): boolean {
  if (p3 < 0) return b <= 5;
  if (b <= 2) return true;
  if (b === 3) return p3 !== 8;
  if (b === 4) return p3 >= 2 && p3 <= 7;
  if (b === 5) return p3 >= 4 && p3 <= 7;
  if (b === 6) return p3 === 6 || p3 === 7;
  return false;
}
/** Deals a coup: player and banker hands; 0 banker, 1 player, 2 tie. */
export function bacCoup(r: Rng): { p: number[]; b: number[]; coup: number } {
  const used: number[] = [];
  const d = () => drawCard(r, 8, used);
  const p = [d(), 0], b = [0, 0];
  b[0] = d(); p[1] = d(); b[1] = d();
  const pt = bacTotal(p), bt = bacTotal(b);
  if (pt < 8 && bt < 8) {
    let p3 = -1;
    if (pt <= 5) { p.push(d()); p3 = bacPt(p[2]); }
    if (bankerDraws(bt, p3)) b.push(d());
  }
  const P = bacTotal(p), B = bacTotal(b);
  return { p, b, coup: B > P ? 0 : P > B ? 1 : 2 };
}

// ---- Roulette: spots on the board and what each pays (stake included).
export function rouletteX(spot: string, k: number): number {
  const num = k >= 1 && k <= 36;
  switch (spot) {
    case "red": return num && RED.has(k) ? 2 : 0;
    case "black": return num && !RED.has(k) ? 2 : 0;
    case "odd": return num && k % 2 === 1 ? 2 : 0;
    case "even": return num && k % 2 === 0 ? 2 : 0;
    case "low": return num && k <= 18 ? 2 : 0;
    case "high": return num && k >= 19 ? 2 : 0;
    case "d1": case "d2": case "d3": return num && Math.ceil(k / 12) === +spot[1] ? 3 : 0;
    case "c1": case "c2": case "c3": return num && ((k - 1) % 3) + 1 === +spot[1] ? 3 : 0;
  }
  // Straight up: "n0".."n36", "n00" (pocket 37).
  const n = spot === "n00" ? 37 : Number(spot.slice(1));
  return n === k ? 36 : 0;
}
const validSpot = (s: string, rules: Rules | undefined) =>
  ["red", "black", "odd", "even", "low", "high", "d1", "d2", "d3", "c1", "c2", "c3"].includes(s) ||
  (/^n\d{1,2}$/.test(s) && Number(s.slice(1)) <= 36) || (s === "n00" && pockets(rules) === 38);

// ---- Slots: reel symbols that show what was paid (symbol k+1 for the k-th pay line; 0 is blank).
function reelsFor(r: Rng, pays: { x: number }[], x: number): number[] {
  const n = pays.length + 1, k = pays.findIndex((q) => q.x === x);
  if (k >= 0) return x < 1 ? [k + 1, k + 1, (k + 1 + r.int(1, n - 1)) % n] : [k + 1, k + 1, k + 1];
  // A loss: never three alike, never the dressed-up pair.
  const ldw = pays.findIndex((q) => q.x < 1);
  for (;;) {
    const s = [r.int(0, n - 1), r.int(0, n - 1), r.int(0, n - 1)];
    if (s[0] === s[1] && (s[1] === s[2] || s[0] === ldw + 1)) continue;
    return s;
  }
}

function inLimits(g: Game, o: PlacedObject, amount: number): string | null {
  const [min, max] = limitsNow(g, o);
  if (amount < min - 1e-9) return `Table minimum is ${fmtMoney(min)}`;
  if (amount > max + 1e-9) return `Table maximum is ${fmtMoney(max)}`;
  return null;
}
const sumBets = (b: Record<string, number> | undefined) => Object.values(b ?? {}).reduce((s, v) => s + v, 0);

/** The stake a move puts down (validated against cash), or an error. */
function stakeOf(g: Game, y: YourPlay, o: PlacedObject, c: { act: string; bet?: number; bets?: Record<string, number>; picks?: number[] }): number | string {
  const mult = stakeMult(g, o);
  const bad = (v: unknown) => typeof v !== "number" || !isFinite(v) || v < 0;
  switch (`${y.fam}:${c.act}`) {
    case "slot:spin": {
      const m = SLOT_MODELS[OBJECTS[o.kind].slot!];
      if (bad(c.bet) || c.bet! < 1 || c.bet! > m.maxCredits || c.bet! % 1) return `Bet 1 to ${m.maxCredits} credits`;
      return betOf(m, c.bet!) * mult;
    }
    case "vpoker:deal": {
      const [min, max] = limitsOf(o), coins = Math.max(1, Math.round(max / min));
      if (bad(c.bet) || c.bet! < 1 || c.bet! > coins || c.bet! % 1) return `Bet 1 to ${coins} coins`;
      return min * c.bet! * mult;
    }
    case "blackjack:deal": return bad(c.bet) ? "Place a bet" : inLimits(g, o, c.bet!) ?? c.bet!;
    case "blackjack:double": case "blackjack:split": return y.hands![y.cur!].bet;
    case "roulette:spin": case "baccarat:deal": {
      const b = c.bets ?? {};
      if (Object.values(b).some(bad) || !sumBets(b)) return "Place a bet";
      for (const s of Object.keys(b)) {
        if (y.fam === "roulette" ? !validSpot(s, o.rules) : !(BAC_BETS as readonly string[]).includes(s)) return "No such bet";
        const e = y.fam === "baccarat" && b[s] ? inLimits(g, o, b[s]) : null;
        if (e) return e;
      }
      if (y.fam === "roulette") { const e = inLimits(g, o, sumBets(b)); if (e) return e; }
      return sumBets(b);
    }
    case "craps:roll": {
      const b = c.bets ?? {};
      if (Object.values(b).some(bad)) return "No such bet";
      if (!y.point) {
        if (Object.keys(b).some((s) => s !== "pass" && s !== "dp")) return "Bet the pass line or don't pass";
        if ((b.pass ? 1 : 0) + (b.dp ? 1 : 0) !== 1) return "Bet the pass line or don't pass";
        return inLimits(g, o, sumBets(b)) ?? sumBets(b);
      }
      if (Object.keys(b).some((s) => s !== "odds")) return "Only odds once a point is set";
      const odds = b.odds ?? 0, line = y.line![0] + y.line![1], most = oddsAllowed(o.rules, y.point) * line - (y.odds ?? 0);
      if (odds > most + 1e-9) return most > 0 ? `Odds up to ${fmtMoney(most)} more` : "No more odds allowed";
      return odds;
    }
    case "keno:draw": {
      const p = c.picks ?? [];
      if (!KENO_SPOTS.includes(p.length)) return `Pick ${KENO_SPOTS.join(", ")} spots`;
      if (new Set(p).size !== p.length || p.some((k) => !(k >= 1 && k <= 80 && k % 1 === 0))) return "Pick numbers 1 to 80";
      return bad(c.bet) ? "Place a bet" : inLimits(g, o, c.bet!) ?? c.bet!;
    }
  }
  return 0;
}

/** Which moves make sense now (the UI's buttons follow this; commands re-check it). */
export function yourMoves(y: YourPlay): string[] {
  switch (y.fam) {
    case "slot": return ["spin"];
    case "vpoker": return y.phase === "act" ? ["draw"] : ["deal"];
    case "roulette": return ["spin"];
    case "craps": return ["roll"];
    case "baccarat": return ["deal"];
    case "keno": return ["draw"];
    case "blackjack": {
      if (y.phase !== "act") return ["deal"];
      const h = y.hands![y.cur!], m = ["hit", "stand"];
      if (h.cards.length === 2) m.push("double");
      if (y.hands!.length === 1 && h.cards.length === 2 && bjVal(h.cards[0]) === bjVal(h.cards[1])) m.push("split");
      return m;
    }
  }
}

function pay(g: Game, y: YourPlay, wagered: number, won: number, big?: string) {
  post(g, "yours", won);
  y.out = 0;
  y.phase = "bet";
  y.last = { wagered, won, seq: y.last.seq + 1, big: big ?? "" };
  y.total.wagered += wagered;
  y.total.won += won;
  if (big) news(g, "good", `You hit ${big} for ${fmtMoney(won)}.`);
}

function bjAdvance(g: Game, y: YourPlay, o: PlacedObject, r: Rng) {
  const hs = y.hands!;
  while (y.cur! < hs.length && hs[y.cur!].done) y.cur!++;
  if (y.cur! < hs.length) return;
  const decks = bjDecks(o.rules), h17 = ruleOf(o.rules, 2) === 1;
  if (hs.some((h) => bjTotal(h.cards).t <= 21)) while (!dealerDone(y.dealer!, h17)) y.dealer!.push(drawCard(r, decks, y.used!));
  const d = bjTotal(y.dealer!).t;
  let won = 0, wagered = 0;
  for (const h of hs) {
    const t = bjTotal(h.cards).t;
    wagered += h.bet;
    won += t > 21 ? 0 : d > 21 || t > d ? 2 * h.bet : t === d ? h.bet : 0;
  }
  pay(g, y, wagered, won);
}

const commands: CommandTable<"yours"> = {
  yours: {
    validate(g, c) {
      const s = g.state;
      if (c.act === "open") {
        if (s.yours && s.yours.out) return "Finish your hand first";
        return cantPlay(g, g.objById.get(c.id ?? -1));
      }
      const y = s.yours;
      if (!y) return "You're not at a game";
      if (c.act === "close") return y.out ? "Finish your hand first" : null;
      const o = g.objById.get(y.obj);
      if (!o) return "It's gone";
      if (!yourMoves(y).includes(c.act)) return "Not now";
      if (y.phase === "bet" && y.fam !== "craps") { const e = cantPlay(g, o); if (e) return e; }
      const st = stakeOf(g, y, o, c);
      if (typeof st === "string") return st;
      if (st > s.cash + 1e-9) return "Not enough casino cash";
      if (y.fam === "vpoker" && c.act === "draw" && (c.held ?? []).some((k) => !(k >= 0 && k < 5))) return "No such card";
      return null;
    },
    apply(g, c) {
      const s = g.state;
      if (c.act === "open") {
        const o = g.objById.get(c.id!)!;
        s.yours = { obj: o.id, fam: yourFam(o.kind)!, phase: "bet", out: 0, last: { wagered: 0, won: 0, seq: 0, big: "" }, total: { wagered: 0, won: 0 } };
        return;
      }
      if (c.act === "close") { s.yours = null; return; }
      const y = s.yours!, o = g.objById.get(y.obj)!, r = rng(s, "yours");
      const stake = stakeOf(g, y, o, c) as number;
      if (stake) { post(g, "yours", -stake); y.out += stake; }
      switch (y.fam) {
        case "slot": {
          const m = SLOT_MODELS[OBJECTS[o.kind].slot!], x = drawPay(m, r);
          y.reels = reelsFor(r, m.pays, x);
          pay(g, y, stake, x * stake, x >= m.jackpotX ? `a jackpot on ${m.name}` : undefined);
          break;
        }
        case "vpoker": {
          if (c.act === "deal") {
            y.used = [];
            y.cards = Array.from({ length: 5 }, () => drawCard(r, 1, y.used!));
            y.held = [];
            y.phase = "act";
            break;
          }
          y.held = [...new Set(c.held ?? [])];
          for (let k = 0; k < 5; k++) if (!y.held.includes(k)) y.cards![k] = drawCard(r, 1, y.used!);
          const hand = vpHand(y.cards!), x = vpX(ruleOf(o.rules, 0), hand);
          pay(g, y, y.out, x * y.out, hand >= 8 ? `a ${VP_HANDS[hand].toLowerCase()}` : undefined);
          break;
        }
        case "blackjack": {
          const decks = bjDecks(o.rules), d = () => drawCard(r, decks, y.used!);
          if (c.act === "deal") {
            y.used = [];
            const p0 = d(), d0 = d(), p1 = d(), d1 = d();
            y.hands = [{ cards: [p0, p1], bet: stake, done: 0 }];
            y.dealer = [d0, d1];
            y.cur = 0;
            const pn = natural(y.hands[0].cards), dn = natural(y.dealer);
            // The dealer peeks under an ace or a ten: a dealer natural ends the hand before anyone plays.
            if (pn || dn) {
              const nat = ruleOf(o.rules, 0) === 1 ? 1.2 : 1.5;
              pay(g, y, stake, dn ? (pn ? stake : 0) : stake * (1 + nat));
              break;
            }
            y.phase = "act";
            break;
          }
          const h = y.hands![y.cur!];
          if (c.act === "split") {
            const [a, b] = h.cards, aces = rankOf(a) === 12;
            y.hands = [{ cards: [a, d()], bet: h.bet, done: aces ? 1 : 0 }, { cards: [b, d()], bet: h.bet, done: aces ? 1 : 0 }];
          } else if (c.act === "double") {
            h.bet *= 2;
            h.cards.push(d());
            h.done = 1;
          } else if (c.act === "hit") h.cards.push(d());
          else h.done = 1;
          for (const q of y.hands!) if (bjTotal(q.cards).t >= 21) q.done = 1;
          bjAdvance(g, y, o, r);
          break;
        }
        case "roulette": {
          const n = pockets(o.rules), k = r.int(0, n - 1);
          y.pocket = k;
          y.bets = { ...c.bets };
          let won = 0;
          for (const [spot, v] of Object.entries(c.bets!)) won += v * rouletteX(spot, k);
          pay(g, y, stake, won);
          break;
        }
        case "craps": {
          if (!y.point) { y.line = [c.bets!.pass ?? 0, c.bets!.dp ?? 0]; y.odds = 0; }
          else y.odds! += stake;
          const d1 = r.int(1, 6), d2 = r.int(1, 6), t = d1 + d2;
          y.dice = [d1, d2];
          const [ps, dp] = y.line!;
          if (!y.point) {
            if (t === 7 || t === 11) pay(g, y, y.out, 2 * ps);
            else if (t === 2 || t === 3) pay(g, y, y.out, 2 * dp);
            else if (t === 12) pay(g, y, y.out, dp);
            else { y.point = t; y.phase = "act"; }
          } else if (t === y.point || t === 7) {
            const made = t === y.point, oddsX = made ? ODDS_X[y.point] : 1 + 1 / (ODDS_X[y.point] - 1);
            const won = made ? 2 * ps + (ps ? y.odds! * oddsX : 0) : 2 * dp + (dp ? y.odds! * oddsX : 0);
            y.point = 0;
            pay(g, y, y.out, won);
          }
          break;
        }
        case "baccarat": {
          const coup = bacCoup(r);
          y.bac = { p: coup.p, b: coup.b };
          y.bets = { ...c.bets };
          let won = 0;
          BAC_BETS.forEach((b, k) => { won += (c.bets![b] ?? 0) * bacX(o.rules, k, coup.coup); });
          pay(g, y, stake, won);
          break;
        }
        case "keno": {
          const balls: number[] = [];
          while (balls.length < 20) { const b = r.int(1, 80); if (!balls.includes(b)) balls.push(b); }
          y.picks = [...c.picks!];
          y.drawn = balls;
          const hits = y.picks.filter((k) => balls.includes(k)).length, x = KENO_PAYS[y.picks.length][hits] ?? 0;
          pay(g, y, stake, x * stake, x >= 1000 ? `keno for ${hits} of ${y.picks.length}` : undefined);
          break;
        }
      }
    },
  },
};

export const yoursSystem: System = {
  id: "yours",
  deps: ["build"],
  commands,
  tick(g) {
    // The object was sold mid-hand: what's out comes back, and you get up.
    const y = g.state.yours;
    if (y && !g.objById.has(y.obj)) {
      if (y.out) post(g, "yours", y.out);
      g.state.yours = null;
    }
  },
};
