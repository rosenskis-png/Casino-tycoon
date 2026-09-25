// Crowd parity report (M11.3, owner): plays each crowd floor (data/scenarios.ts "crowd floors": a mini-casino designed
// for one crowd) with only that crowd coming, and prints what it earns. Owner's goal: whichever crowd a casino is
// built for, catering to it well should earn roughly the same from gambling; only the method differs (locals: volume
// on thin edges; tourists: spectacle; families: temptation between attractions; party: drink and friends; high
// rollers: big tables and vice). A report, not a check: numbers are sanity checks until the v1.0 tuning pass.
// (M11.4, owner, after an outside review) Judged on what the player runs short of: gaming win (theoretical) per game
// seat per day, and per $1K of build cost. Take (gaming win ÷ money the crowd brought) is still shown.
// Usage: node scripts/parity.mjs [days] [seeds]   (the first third of each run is warm-up and not counted)
import { loadSim } from "./sim-bundle.mjs";
const [days = 150, seeds = "1"] = process.argv.slice(2);
const sim = await loadSim();
const crowds = ["local", "retiree", "tourist", "family", "party", "highroller"];
const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const rows = [];
for (const t of crowds) {
  const acc = { seats: 0, built: 0, onFloor: 0, samples: 0, brought: 0, theo: 0, win: 0, wag: 0, visits: 0, other: 0, otherPlayed: 0, planned: 0, spent: 0, score: 0, rep: 0, n: 0 };
  for (const seed of String(seeds).split(",").map(Number)) {
    const g = sim.Game.create(`crowd_${t}`, seed);
    g.dispatch({ type: "setInsurance", level: 1 }); // (M11.4, owner) insured like a sensible player: big payouts over half a month's machine win
    const warm = Math.floor(days / 3);
    let counting = false;
    g.bus.on((e) => {
      if (!counting || e.type !== "departed" || e.minor || e.guestType !== t) return;
      acc.visits++; acc.brought += e.budget + e.withdrawn; acc.theo += e.wagered - e.ev; acc.win += e.wagered - e.won; acc.wag += e.wagered; acc.spent += e.spent; acc.score += e.score;
      if (e.came === "gamble") acc.planned += e.wagered - e.ev;
      else { acc.other++; if (e.wagered > 0) acc.otherPlayed++; }
    });
    for (let d = 0; d < days; d++) {
      counting = d >= warm;
      for (let k = 0; k < sim.TICKS_PER_DAY; k++) {
        g.step();
        if (counting && k % 200 === 0) { acc.samples++; for (const a of g.state.agents) if (a.g && !a.g.minor && a.g.type === t) acc.onFloor++; }
      }
      g.bus.flush();
    }
    const bad = sim.checkInvariants(g);
    if (bad.length) { console.error(`crowd_${t} seed ${seed}:`, bad.slice(0, 5).join("; ")); process.exit(1); }
    acc.rep += g.state.rep[t] ?? 0; acc.n++;
    acc.seats += g.gameSeats;
    acc.built += g.state.objects.reduce((a, o) => a + sim.priceOf(o, g.state).cost, 0);
  }
  const dd = (days - Math.floor(days / 3)) * acc.n;
  rows.push({ t, seatDay: acc.theo / Math.max(1, acc.seats / acc.n) / dd, perK: (1000 * acc.theo) / Math.max(1, acc.built / acc.n) / dd * 30, guestDay: acc.theo / Math.max(1e-9, acc.onFloor / Math.max(1, acc.samples)) / dd,
    seats: acc.seats / acc.n, take: acc.theo / Math.max(1, acc.brought), broughtVisit: acc.brought / Math.max(1, acc.visits), theoDay: acc.theo / dd, winDay: acc.win / dd, perVisit: acc.theo / Math.max(1, acc.visits), edge: acc.theo / Math.max(1, acc.wag),
    visitsDay: acc.visits / dd, conv: acc.otherPlayed / Math.max(1, acc.other), otherShare: acc.other / Math.max(1, acc.visits),
    fromOther: 1 - acc.planned / Math.max(1e-9, acc.theo), amen: acc.spent / dd, score: acc.score / Math.max(1, acc.visits), rep: acc.rep / acc.n });
}
const cols = [["crowd", (r) => sim.GUEST_TYPES[r.t].name], ["per seat/day", (r) => `$${r.seatDay.toFixed(2)}`], ["per $1K built/mo", (r) => `$${r.perK.toFixed(0)}`], ["per guest slot/day", (r) => `$${r.guestDay.toFixed(2)}`], ["seats", (r) => Math.round(r.seats)], ["take", (r) => `${(100 * r.take).toFixed(1)}%`], ["per $1K brought", (r) => usd(1000 * r.take)], ["brought/visit", (r) => usd(r.broughtVisit)], ["gaming/day (theo)", (r) => usd(r.theoDay)], ["actual", (r) => usd(r.winDay)],
  ["per visit", (r) => usd(r.perVisit)], ["edge", (r) => `${(100 * r.edge).toFixed(1)}%`], ["visits/day", (r) => r.visitsDay.toFixed(1)],
  ["came for else, played", (r) => `${Math.round(100 * r.otherShare)}%, ${Math.round(100 * r.conv)}%`], ["theo from them", (r) => `${Math.round(100 * r.fromOther)}%`],
  ["amenities/day", (r) => usd(r.amen)], ["score", (r) => r.score.toFixed(2)], ["rep", (r) => Math.round(r.rep)]];
const w = cols.map(([h, f]) => Math.max(h.length, ...rows.map((r) => String(f(r)).length)) + 2);
console.log(cols.map(([h], k) => h.padEnd(w[k])).join(""));
for (const r of rows) console.log(cols.map(([, f], k) => String(f(r)).padEnd(w[k])).join(""));
// (M11.4) Parity is judged per game seat and per build dollar: floor space, seats and build money are what the player
// runs short of, not guests' wallets. A 2× spread on either is flagged.
const flags = [];
for (const [key, name] of [["seatDay", "win per seat"], ["perK", "win per build dollar"], ["guestDay", "win per guest on the floor"]]) {
  const th = rows.map((r) => r[key]), lo = Math.min(...th), hi = Math.max(...th);
  if (hi > 2 * lo) flags.push(`${name} spread ${(hi / Math.max(1e-9, lo)).toFixed(1)}× (${rows.find((r) => r[key] === hi).t} highest, ${rows.find((r) => r[key] === lo).t} lowest): goal is roughly equal`);
}
for (const r of rows) if (!Number.isFinite(r.theoDay)) flags.push(`${r.t}: non-finite numbers`);
console.log(flags.length ? `\n⚠ ${flags.join("\n⚠ ")}` : "\nno parity flags");
