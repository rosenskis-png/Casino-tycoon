// Guest target outcomes (docs/spec/guests.md §Targets): plays a furnished Free Play Lot headless and prints what
// guests actually did per type (medians and shares) next to the starting targets. A report for tuning, not a
// pass/fail check: random outcomes are never asserted. Usage: node scripts/targets.mjs [days] [seed]
import { loadSim } from "./sim-bundle.mjs";

const days = Number(process.argv[2] || 240);
const seed = Number(process.argv[3] || 1);
const sim = await loadSim();
const g = sim.Game.create("sandbox", seed);
const w = g.state.map.w;
const place = (kind, x, y, rot = 0) => g.dispatch({ type: "place", kind, x, y, rot });
// Enough starting money for a full floor (booked as starting cash, so the books still add up).
for (const l of [g.state.finance.total, g.state.finance.month]) l.start += 100_000;
g.state.cash += 100_000;
// A market sized to the floor (about 100 guests on 180 slots), so crowding doesn't swamp the per-type numbers.
g.state.pool = g.state.pool.filter((_, i) => i % 5 < 2);
// A plain, well-equipped floor: three slot banks, a bar, restrooms, a cage and an ATM near the door.
const kinds = ["slot_liberty", "slot_cherry", "slot_thunder"];
// Back-to-back banks with the seats on the aisles, in view of the door.
for (const y0 of [18, 22, 26]) for (const x0 of [8, 20, 32]) for (let k = 0; k < 10; k++) {
  place(kinds[(k + x0) % 3], x0 + k, y0, 2);
  place(kinds[(k + x0 + 1) % 3], x0 + k, y0 + 1);
}
for (const x of [8, 12, 16, 20, 24, 28, 32]) place("bar", x, 14);
place("bar", 16, 29); place("bar", 32, 29); for (const y of [6, 10, 19, 24]) place("restroom", 44, y); place("cage", 12, 29); place("atm", 40, 29);
for (const [x, y] of [[18, 24], [30, 24], [42, 16], [42, 28], [30, 17]]) place("sign", x, y);
for (const r of ["janitor", "janitor", "janitor", "tech", "tech", "server", "server", "server", "server", "server", "server"]) g.dispatch({ type: "hire", role: r }); g.dispatch({ type: "hire", role: "tech" });
g.step();

const dep = {}, arr = {};
g.bus.on((e) => {
  if (e.type === "departed") (dep[e.guestType] ??= []).push(e);
  if (e.type === "arrived") (arr[e.guestType] ??= []).push(e);
});
for (let d = 0; d < days; d++) { for (let t = 0; t < sim.TICKS_PER_DAY; t++) g.step(); g.bus.flush(); }

const med = (xs) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const share = (xs, f) => (xs.length ? xs.filter(f).length / xs.length : NaN);
const pct = (x) => (Number.isNaN(x) ? "–" : `${Math.round(x * 100)}%`);
const f1 = (x) => (Number.isNaN(x) ? "–" : x.toFixed(1));
const f2 = (x) => (Number.isNaN(x) ? "–" : x.toFixed(2));
const usd = (x) => (Number.isNaN(x) ? "–" : `$${Math.round(x)}`);
const types = ["local", "retiree", "tourist", "party"];
const rows = [];
const row = (label, f) => rows.push([label, ...types.map((t) => f(dep[t] ?? [], arr[t] ?? [], t))]);
row("guests seen", (d) => String(d.length));
row("visit length (min)", (d) => f1(med(d.map((e) => e.minutes))));
row("playing (min)", (d) => f1(med(d.map((e) => e.play))));
row("visit budget", (d) => usd(med(d.map((e) => e.budget))));
row("loss per visit", (d) => usd(med(d.map((e) => e.lost))));
row("sober share", (d) => pct(share(d, (e) => e.intend === 0)));
row("drinkers' intent (median)", (d) => f2(med(d.filter((e) => e.intend > 0).map((e) => e.intend))));
row("drinkers' drinks (median)", (d) => f1(med(d.filter((e) => e.intend > 0).map((e) => e.drinks))));
row("drinkers' peak (median)", (d) => f2(med(d.filter((e) => e.intend > 0).map((e) => e.peak))));
row("overshoot >0.3", (d) => pct(share(d.filter((e) => e.intend > 0), (e) => e.peak > e.intend + 0.3)));
row("never ATM", (d) => pct(share(d, (e) => !e.atm)));
row("ATM users who drew", (d) => pct(share(d.filter((e) => e.atm), (e) => e.trips > 0)));
row("draw per trip", (d) => usd(med(d.filter((e) => e.trips).map((e) => e.withdrawn / e.trips))));
row("group 1 / 2 / 3+", (_d, a) => a.length ? `${pct(share(a, (e) => e.n === 1))}/${pct(share(a, (e) => e.n === 2))}/${pct(share(a, (e) => e.n >= 3))}` : "–");
row("regular arrivals", (_d, a) => pct(share(a, (e) => e.regular)));
row("visit score", (d) => f2(med(d.map((e) => e.score))));
row("why leaders left", (d0) => {
  const d = d0.filter((e) => e.lead);
  const c = {};
  for (const e of d) c[e.why] = (c[e.why] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${Math.round((100 * n) / d.length)}%`).join(", ");
});
row("why they left", (d) => {
  const c = {};
  for (const e of d) c[e.why] = (c[e.why] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${Math.round((100 * n) / d.length)}%`).join(", ");
});
const widths = [26, ...types.map(() => 26)];
console.log(["", ...types].map((c, k) => String(c).padEnd(widths[k])).join(""));
for (const r of rows) console.log(r.map((c, k) => String(c).padEnd(widths[k])).join(""));
const s = g.state, pool = sim.poolSummary(g);
console.log(`\nafter ${days} days: ${s.agents.filter((a) => a.role === "guest").length} on the floor, pool ${pool.size}, regulars ${JSON.stringify(pool.regulars)}, chasers ${pool.chasers}`);
console.log(`reputation ${Object.entries(s.rep).map(([t, r]) => `${t} ${r.toFixed(0)}`).join(", ")}; cash ${Math.round(s.cash)}; walked past yesterday ${s.visits.yday.walkedPast}`);
const bad = sim.checkInvariants(g);
if (bad.length) { console.error(bad.slice(0, 10).join("\n")); process.exit(1); }
