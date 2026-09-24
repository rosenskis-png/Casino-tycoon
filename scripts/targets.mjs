// Guest sanity report (docs/spec/guests.md §Targets): plays the Test Floor scenario (fully equipped, realistic
// layout) headless and prints what guests actually did per type, next to the current reference numbers, and
// flags anything that looks like a logic error (a type that never plays, never drinks, always gives up...).
// A report, not a pass/fail check: random outcomes are never asserted. Usage: node scripts/targets.mjs [days] [seed]
import { loadSim } from "./sim-bundle.mjs";

const days = Number(process.argv[2] || 300);
const seed = Number(process.argv[3] || 1);
const sim = await loadSim();
const g = sim.Game.create("testfloor", seed);

const dep = {}, arr = {}, inc = {}, incAll = {};
let policeLow = 100, policeHigh = 0;
g.bus.on((e) => {
  if (e.type === "incident") { ((inc[e.guestType] ??= {})[e.kind] = (inc[e.guestType][e.kind] ?? 0) + 1); incAll[e.kind] = (incAll[e.kind] ?? 0) + 1; }
  if (e.type === "departed") (dep[e.guestType] ??= []).push(e);
  if (e.type === "arrived") (arr[e.guestType] ??= []).push(e);
});
const totals = {};
// M7: who plays what, sampled every 5 s: per type, seats taken at machines and at each table game.
const at = {}, fams = new Set();
for (let d = 0; d < days; d++) {
  for (let t = 0; t < sim.TICKS_PER_DAY; t++) {
    g.step();
    if (t % 100) continue;
    for (const a of g.state.agents) {
      if (a.role !== "guest" || a.act !== "play" || a.seat < 0) continue;
      const o = g.objById.get(a.target), def = o && sim.OBJECTS[o.kind];
      if (!def) continue;
      const k = def.cat === "table" ? def.game : def.game === "vpoker" ? "vpoker" : "slots";
      fams.add(k);
      const m = (at[a.g.type] ??= {});
      m[k] = (m[k] ?? 0) + 1;
    }
  }
  g.bus.flush();
  const p = g.state.auth.police.standing;
  policeLow = Math.min(policeLow, p); policeHigh = Math.max(policeHigh, p);
  // Reports, police calls and ejections are counted by the sim per day; add up yesterday's.
  if (d > 0) for (const [k, n] of Object.entries(g.state.incidentDays[1] ?? {})) if (k.startsWith("_")) totals[k] = (totals[k] ?? 0) + n;
  // Thought counts for the day just ended (the day hook has already started a new one).
  for (const k of ["goodTheme", "badTheme"]) totals[k] = (totals[k] ?? 0) + (g.state.thoughts[1]?.[k] ?? 0);
}

const med = (xs) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const share = (xs, f) => (xs.length ? xs.filter(f).length / xs.length : NaN);
const pct = (x) => (Number.isNaN(x) ? "–" : `${Math.round(x * 100)}%`);
const f1 = (x) => (Number.isNaN(x) ? "–" : x.toFixed(1));
const f2 = (x) => (Number.isNaN(x) ? "–" : x.toFixed(2));
const usd = (x) => (Number.isNaN(x) ? "–" : `$${Math.round(x)}`);
const types = ["local", "retiree", "tourist", "party", "highroller"];
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
// M6: why groups came, and the time and money spent at meals, shows and the club.
row("came for meal/show/club/pool", (_d, a) => a.length ? ["dine", "show", "club", "pool"].map((k) => pct(share(a, (e) => e.intent === k))).join("/") : "–");
row("had fun (share, min)", (d) => { const f = d.filter((e) => e.fun > 0); return `${pct(f.length / Math.max(1, d.length))}, ${f1(med(f.map((e) => e.fun)))}`; });
row("spent on amenities", (d) => usd(med(d.filter((e) => e.spent > 0).map((e) => e.spent))));
row("warned / thrown out", (d) => `${pct(share(d, (e) => e.warned > 0))} / ${pct(share(d, (e) => e.ejected))}`);
const CATS = { intox: ["loud", "stumble", "spill", "vomit", "passout"], disorder: ["argument", "fight", "yell", "breakdown"], misconduct: ["urinate"], celebration: ["cheer", "round"], social: ["flirt", "recruit"] };
for (const [cat, kinds] of Object.entries(CATS))
  row(`${cat} per 100 guests`, (d, _a, t) => d.length ? f1((100 * kinds.reduce((x, k) => x + (inc[t]?.[k] ?? 0), 0)) / d.length) : "–");
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
row("plays at (share of seats)", (_d, _a, t) => {
  const m = at[t] ?? {}, n = Object.values(m).reduce((a, b) => a + b, 0);
  return n ? Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round((100 * v) / n)}%`).join(", ") : "–";
});
const widths = [26, ...types.map(() => 26)];
console.log(["", ...types].map((c, k) => String(c).padEnd(widths[k])).join(""));
for (const r of rows) console.log(r.map((c, k) => String(c).padEnd(widths[k])).join(""));
const s = g.state, pool = sim.poolSummary(g);
console.log(`\nafter ${days} days: ${s.agents.filter((a) => a.role === "guest").length} on the floor, pool ${pool.size}, regulars ${JSON.stringify(pool.regulars)}, chasers ${pool.chasers}`);
console.log(`reputation ${Object.entries(s.rep).map(([t, r]) => `${t} ${r.toFixed(0)}`).join(", ")}; cash ${Math.round(s.cash)}; walked past yesterday ${s.visits.yday.walkedPast}`);
console.log(`incidents: ${Object.entries(incAll).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);
const all = Object.values(dep).flat(), cheats = all.filter((e) => e.cheat), lucky = all.filter((e) => !e.cheat && e.luck > 0), unlucky = all.filter((e) => !e.cheat && e.luck < 0);
const ret = (xs) => { const w = xs.reduce((a, e) => a + e.wagered, 0); return w ? (xs.reduce((a, e) => a + e.won, 0) / w).toFixed(2) : "–"; };
console.log(`cheats: ${cheats.length} of ${all.length} guests (${pct(cheats.length / all.length)}), ${cheats.filter((e) => e.caught).length} caught, house lost ${usd(cheats.reduce((a, e) => a + e.won - e.wagered, 0))} to them (${usd(med(cheats.map((e) => e.won - e.wagered)))} median); recovered ${usd(g.state.finance.total.recovered ?? 0)}; lucky ${lucky.length} return ${ret(lucky)}, unlucky ${unlucky.length} return ${ret(unlucky)}; enforcement ${totals._enf ?? 0}, banned ${totals._banned ?? 0}`);
console.log(`reports ${totals._reports ?? 0}, police calls ${totals._calls ?? 0}, thrown out ${totals._ejected ?? 0}, paramedics ${totals._medic ?? 0}; police standing ${Math.round(policeLow)}–${Math.round(policeHigh)}, now ${Math.round(g.state.auth.police.standing)} (${sim.LADDER_NAMES[g.state.auth.police.stage]})`);
const uses = {};
for (const o of s.objects) uses[o.kind] = (uses[o.kind] ?? 0) + o.st.uses;
const L = s.finance.total, m = (k) => usd(L[k] ?? 0);
console.log(`amenities: meals ${(uses.restaurant ?? 0) + (uses.patiorestaurant ?? 0)}, shows seen ${uses.showlounge ?? 0}, dances ${uses.club ?? 0}, pool ${uses.pool ?? 0}, garden ${uses.garden ?? 0}; food ${m("food")} (cost ${m("foodCost")}), tickets ${m("shows")}, cover ${m("cover")}, door fees ${m("doors")}; smokers ${pct(share(all, (e) => e.smoker))}`);
// Tables (M7): hold per game, by what was bet and paid.
const hold = {};
for (const o of s.objects) {
  const def = sim.OBJECTS[o.kind];
  if (!def.game) continue;
  const h = (hold[def.game] ??= { in: 0, out: 0, n: 0, sessions: 0 });
  h.in += o.st.coinIn; h.out += o.st.paidOut; h.n++; h.sessions += o.st.sessions;
}
console.log(`games: ${Object.entries(hold).map(([k, h]) => `${k} ${h.sessions} sessions, hold ${h.in ? ((100 * (h.in - h.out)) / h.in).toFixed(1) : "–"}%`).join("; ")}`);
console.log(`books: tables ${m("tables")}, poker rake ${m("poker")}, keno & bingo ${m("keno")}, slots ${m("slots")}`);
const counters = all.filter((e) => e.counter);
console.log(`card counters: ${counters.length} (${counters.filter((e) => e.marked).length} marked), return ${ret(counters)}; skill poor/typical/sharp ${[0, 1, 2].map((k) => pct(share(all, (e) => e.skill === k))).join("/")}`);
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
// Incidents: every M4 category fires, guards do something, and the police notice anything at all.
for (const [cat, kinds] of Object.entries(CATS)) if (!kinds.some((k) => incAll[k])) flags.push(`no ${cat} incidents at all`);
if (!totals._ejected && !Object.values(dep).flat().some((e) => e.warned)) flags.push("guards never warned or threw anyone out");
if (policeHigh - policeLow < 0.5) flags.push("police standing never moved");
for (const k of ["restaurant", "showlounge", "club", "pool", "garden", "patiobar", "patiorestaurant"]) if (!uses[k]) flags.push(`nobody ever used the ${k}`);
console.log(`theming thoughts: good ${totals.goodTheme ?? 0}, bad ${totals.badTheme ?? 0} (whole run)`);
// Cheats (M5): there are some, the ones who get away win something, and security catches some.
if (!cheats.length) flags.push("no cheats at all");
else {
  if (!cheats.some((e) => e.caught)) flags.push("no cheat was ever caught");
  if (med(cheats.filter((e) => !e.caught).map((e) => e.won - e.wagered)) <= 0) flags.push("cheats who got away mostly lost money");
}
// Tables (M7): every game gets played; the pool games' cut is exact.
for (const [k, h] of Object.entries(hold)) if (!h.sessions) flags.push(`nobody ever played ${k}`);
for (const [k, want] of [["bingo", 0.3]]) { const h = hold[k]; if (h?.in && Math.abs((h.in - h.out) / h.in - want) > 1e-6) flags.push(`${k} hold isn't exactly ${want * 100}%`); }
if (hold.poker?.in && (hold.poker.in - hold.poker.out) / hold.poker.in > 0.1 + 1e-9) flags.push("poker took more than its rake");
if (!Object.values(at).some((m) => Object.keys(m).some((k) => k !== "slots" && k !== "vpoker"))) flags.push("nobody plays tables");
console.log(flags.length ? `\n⚠ ${flags.join("\n⚠ ")}` : "\nno sanity flags");
