// Checks for playing the games yourself (docs/spec/play.md). Exact math: the real games you play return what
// the guests' models say (roulette, baccarat by full enumeration of an 8-deck shoe, craps with real dice, keno),
// and the video poker evaluator counts every five-card hand right. Invariants: a scripted session at every kind
// of game on the Test Floor keeps the books, never leaves money out between hands, and the dealer plays by rule.
import { BAC_P, CRAPS_OUTCOMES, KENO_PAYS, KENO_SPOTS, kenoCatch, kenoModel, lineModel, lineX, pockets, vpModel } from "../data/tables";
import { OBJECTS } from "../data/objects";
import { Game } from "./game";
import { bankerDraws, bjTotal, dealerDone, rouletteX, vpHand, vpX, yourFam, yourMoves } from "./yours";
import { cantPlay } from "./yours";
import { ruleOf } from "../data/tables";
import { limitsNow } from "./tables";

const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps;

export function yoursMathChecks(): string[] {
  const p: string[] = [];
  // Roulette: every spot on the board returns 36 / pockets, as the guests' bets do.
  for (const rules of [[0], [1]]) {
    const n = pockets(rules);
    const spots = ["red", "black", "odd", "even", "low", "high", "d1", "d2", "d3", "c1", "c2", "c3", ...Array.from({ length: 37 }, (_, k) => `n${k}`), ...(n === 38 ? ["n00"] : [])];
    for (const s of spots) {
      let ev = 0;
      for (let k = 0; k < n; k++) ev += rouletteX(s, k) / n;
      if (!near(ev, 36 / n, 1e-12)) p.push(`roulette ${s} (${n} pockets) returns ${ev}`);
    }
  }
  // Baccarat: the third-card rule over a full 8-deck shoe gives the guests' banker/player/tie chances.
  const cnt = [128, 32, 32, 32, 32, 32, 32, 32, 32, 32];
  const pr = [0, 0, 0];
  let left = 416;
  const take = (v: number) => { const q = cnt[v] / left; cnt[v]--; left--; return q; };
  const put = (v: number) => { cnt[v]++; left++; };
  for (let p1 = 0; p1 < 10; p1++) { const w1 = take(p1);
    for (let b1 = 0; b1 < 10; b1++) { const w2 = w1 * take(b1);
      for (let p2 = 0; p2 < 10; p2++) { const w3 = w2 * take(p2);
        for (let b2 = 0; b2 < 10; b2++) { const w4 = w3 * take(b2);
          const pt = (p1 + p2) % 10, bt = (b1 + b2) % 10;
          const end = (P: number, B: number, w: number) => { pr[B > P ? 0 : P > B ? 1 : 2] += w; };
          if (pt >= 8 || bt >= 8) end(pt, bt, w4);
          else if (pt <= 5) {
            for (let p3 = 0; p3 < 10; p3++) { const w5 = w4 * take(p3);
              const P = (pt + p3) % 10;
              if (bankerDraws(bt, p3)) for (let b3 = 0; b3 < 10; b3++) { const w6 = w5 * take(b3); end(P, (bt + b3) % 10, w6); put(b3); }
              else end(P, bt, w5);
              put(p3); }
          } else if (bankerDraws(bt, -1)) for (let b3 = 0; b3 < 10; b3++) { const w6 = w4 * take(b3); end(pt, (bt + b3) % 10, w6); put(b3); }
          else end(pt, bt, w4);
          put(b2); }
        put(p2); }
      put(b1); }
    put(p1); }
  if (!near(pr[0], BAC_P.banker, 5e-7) || !near(pr[1], BAC_P.player, 5e-7)) p.push(`baccarat: the shoe gives banker ${pr[0]}, player ${pr[1]}; guests use ${BAC_P.banker}, ${BAC_P.player}`);
  // Craps: real dice give the line bets' chances.
  let pass = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    const t = a + b;
    if (t === 7 || t === 11) pass += 1 / 36;
    else if (t >= 4 && t <= 10) { const ways = 6 - Math.abs(t - 7); pass += (1 / 36) * (ways / (ways + 6)); }
  }
  const pl = lineModel(0).pays[0].p;
  if (!near(pass, pl, 1e-12) || !near(pass, 244 / 495, 1e-12)) p.push(`craps: real dice make the pass line ${pass}, guests use ${pl}`);
  const dp = CRAPS_OUTCOMES.reduce((s, o) => s + o.p * lineX(1, o), 0);
  if (!near(dp, 2 * (1 - pass - 1 / 36) + 1 / 36, 1e-12)) p.push(`craps: don't pass returns ${dp}`);
  // Keno: the ticket pays what the guests' model pays; catches sum to 1.
  for (const n of KENO_SPOTS) {
    let tot = 0, ev = 0;
    for (let k = 0; k <= n; k++) { tot += kenoCatch(n, k); ev += kenoCatch(n, k) * (KENO_PAYS[n][k] ?? 0); }
    if (!near(tot, 1, 1e-12) || !near(ev, kenoModel(n).rtp, 1e-12)) p.push(`keno ${n}-spot: catches sum to ${tot}, returns ${ev}`);
  }
  // Video poker: every five-card hand classified once; the known counts; pays match the guests' paytable.
  const want = [0, 337920, 123552, 54912, 10200, 5108, 3744, 624, 36, 4];
  const got = new Array(10).fill(0), h = [0, 0, 0, 0, 0];
  for (h[0] = 0; h[0] < 52; h[0]++) for (h[1] = h[0] + 1; h[1] < 52; h[1]++) for (h[2] = h[1] + 1; h[2] < 52; h[2]++)
    for (h[3] = h[2] + 1; h[3] < 52; h[3]++) for (h[4] = h[3] + 1; h[4] < 52; h[4]++) got[vpHand(h)]++;
  for (let k = 1; k < 10; k++) if (got[k] !== want[k]) p.push(`video poker: ${got[k]} hands of class ${k}, want ${want[k]}`);
  for (let pay = 0; pay < 4; pay++) {
    const xs = vpModel(pay, 1).pays.map((q) => q.x).sort((a, b) => a - b).join();
    const mine = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => vpX(pay, k)).sort((a, b) => a - b).join();
    if (xs !== mine) p.push(`video poker paytable ${pay}: pays ${mine}, guests' model ${xs}`);
  }
  return p;
}

/** Plays every kind of game on the Test Floor with a simple script; checks the books and the rules. */
export function yoursPlayChecks(seed = 3): string[] {
  const p: string[] = [];
  const g = Game.create("testfloor", seed);
  g.state.cash += 1e6;
  g.state.finance.total.start += 1e6;
  for (let t = 0; t < 1200; t++) g.step();
  const seen = new Set<string>();
  for (const o of g.state.objects) {
    const fam = yourFam(o.kind);
    if (!fam || seen.has(fam) || o.broken || cantPlay(g, o)) continue;
    seen.add(fam);
    const cash0 = g.state.cash, led0 = g.state.finance.total.yours ?? 0;
    const u = OBJECTS[o.kind].game ? limitsNow(g, o)[0] : 1;
    const run = (c: Parameters<Game["dispatch"]>[0]) => { const e = g.dispatch(c); g.step(); return e; };
    if (run({ type: "yours", act: "open", id: o.id })) { p.push(`${o.kind}: couldn't sit down`); continue; }
    for (let k = 0; k < 40; k++) {
      const y = g.state.yours!;
      // Breakdowns are random and not what this checks: keep the machine running.
      o.broken = 0;
      const e = (() => {
        switch (fam) {
          case "slot": return run({ type: "yours", act: "spin", bet: 1 });
          case "vpoker": run({ type: "yours", act: "deal", bet: 5 }); return run({ type: "yours", act: "draw", held: [0, 1] });
          case "roulette": return run({ type: "yours", act: "spin", bets: { red: 2 * u, n17: u } });
          case "baccarat": return run({ type: "yours", act: "deal", bets: { banker: u, tie: u } });
          case "keno": return run({ type: "yours", act: "draw", picks: [1, 2, 3, 4, 5, 6], bet: u });
          case "craps": {
            const e1 = run({ type: "yours", act: "roll", bets: { [k % 2 ? "dp" : "pass"]: u } });
            for (let q = 0; q < 200 && g.state.yours!.point; q++) run({ type: "yours", act: "roll", bets: q ? {} : { odds: u } });
            return e1;
          }
          case "blackjack": {
            const e1 = run({ type: "yours", act: "deal", bet: u });
            for (let q = 0; q < 20 && g.state.yours!.phase === "act"; q++) {
              const mv = yourMoves(g.state.yours!), h = g.state.yours!.hands![g.state.yours!.cur!];
              run({ type: "yours", act: mv.includes("split") && k % 3 === 0 ? "split" : mv.includes("double") && k % 5 === 0 ? "double" : bjTotal(h.cards).t < 17 ? "hit" : "stand" });
            }
            const yy = g.state.yours!, h17 = ruleOf(o.rules, 2) === 1, d = yy.dealer!;
            if (yy.phase !== "bet") p.push("blackjack: a hand never finished");
            else if (d.length > 2 && dealerDone(d.slice(0, -1), h17)) p.push("blackjack: the dealer drew past 17");
            else if (d.length > 2 && !dealerDone(d, h17)) p.push(`blackjack: the dealer stopped on ${bjTotal(d).t}`);
            return e1;
          }
        }
      })();
      if (e) { p.push(`${o.kind} (${fam}): ${e}`); break; }
      if (y.out) p.push(`${fam}: money left out between hands`);
    }
    if (g.state.yours!.last.seq < 20) p.push(`${fam}: only ${g.state.yours!.last.seq} hands settled`);
    const led = (g.state.finance.total.yours ?? 0) - led0;
    const tot = g.state.yours!.total;
    if (!near(led, tot.won - tot.wagered, 1e-6)) p.push(`${fam}: books show ${led}, hands ${tot.won - tot.wagered}`);
    if (!Number.isFinite(g.state.cash) || !Number.isFinite(cash0)) p.push(`${fam}: cash not finite`);
    if (run({ type: "yours", act: "close" })) p.push(`${fam}: couldn't get up`);
  }
  for (const f of ["slot", "vpoker", "blackjack", "roulette", "craps", "baccarat", "keno"]) if (!seen.has(f)) p.push(`Test Floor has no playable ${f}`);
  // Poker, bingo and the sportsbook can't be played.
  for (const [kind, d] of Object.entries(OBJECTS)) if (d.game && ["poker", "bingo", "sports"].includes(d.game) && yourFam(kind)) p.push(`${kind} is playable`);
  return p;
}
