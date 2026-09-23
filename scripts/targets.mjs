// Guest sanity report (docs/spec/guests.md §Targets): plays the Test Floor scenario (fully equipped, realistic
// layout) headless and prints what guests actually did per type, next to the current reference numbers, and
// flags anything that looks like a logic error (a type that never plays, never drinks, always gives up...).
// A report, not a pass/fail check: random outcomes are never asserted. Usage: node scripts/targets.mjs [days] [seed]
import { loadSim } from "./sim-bundle.mjs";

const days = Number(process.argv[2] || 300);
const seed = Number(process.argv[3] || 1);
const sim = await loadSim();
const g = sim.Game.create("testfloor", seed);

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
row("served by servers", (d) => { const dr = d.reduce((a, e) => a + e.drinks, 0); return dr ? pct(d.reduce((a, e) => a + e.served, 0) / dr) : "–"; });
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

// Sanity flags: things that should never happen on a well-run floor, whatever the tuning.
const flags = [];
for (const t of types) {
  const d = dep[t] ?? [];
  if (d.length < 20) { flags.push(`${t}: only ${d.length} visits`); continue; }
  if (med(d.map((e) => e.play)) < 0.2) flags.push(`${t}: most guests barely play`);
  if (share(d, (e) => e.why === "nothing") > 0.25) flags.push(`${t}: over a quarter give up finding a machine`);
  const drinkers = d.filter((e) => e.intend > 0);
  if (drinkers.length && share(drinkers, (e) => e.drinks > 0) < 0.3) flags.push(`${t}: under 30% of drinkers get a drink`);
  if (share(d, (e) => e.why === "restroom") > 0.2) flags.push(`${t}: over a fifth leave for a restroom`);
  if (d.some((e) => ![e.minutes, e.lost, e.peak, e.score].every(Number.isFinite))) flags.push(`${t}: non-finite numbers`);
}
console.log(flags.length ? `\n⚠ ${flags.join("\n⚠ ")}` : "\nno sanity flags");
