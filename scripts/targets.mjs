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
// M9: staff, whales and the regulator, from the ticker.
const m9 = { caught: 0, quit: 0, whales: [], inspections: 0, audits: 0, found: 0 };
// M9.5: events started, children seen.
const m95 = { events: {}, kids: 0, kidPlayed: 0 };
g.bus.on((e) => {
  if (e.type !== "news") return;
  if (/ caught .* \(\$/.test(e.text)) m9.caught++;
  if (/ quit: /.test(e.text)) m9.quit++;
  const ev = / starts today: /.test(e.text) && e.text.split(" starts today")[0];
  if (ev) m95.events[ev] = (m95.events[ev] ?? 0) + 1;
  if (/^An inspector/.test(e.text)) m9.inspections++;
  if (/^The gaming inspector found/.test(e.text)) { m9.audits++; if (!/nothing wrong/.test(e.text)) m9.found++; }
});
let policeLow = 100, policeHigh = 0;
g.bus.on((e) => {
  if (e.type === "incident") { ((inc[e.guestType] ??= {})[e.kind] = (inc[e.guestType][e.kind] ?? 0) + 1); incAll[e.kind] = (incAll[e.kind] ?? 0) + 1; }
  if (e.type === "departed") { if (e.minor) { m95.kids++; if (e.wagered) m95.kidPlayed++; return; } (dep[e.guestType] ??= []).push(e); }
  if (e.type === "arrived") (arr[e.guestType] ??= []).push(e);
});
const totals = {};
// M7: who plays what, sampled every 5 s: per type, seats taken at machines and at each table game.
const at = {}, fams = new Set();
const occ = { samples: 0, seats: 0, playing: 0, eng: {} };
// M8.6: a new game of your own launches on day 30 (three of the tall Stampede cabinets converted), so word of mouth,
// novelty and fans have something to do; its awareness is sampled monthly.
let launched = "";
const launchCurve = [];
for (let d = 0; d < days; d++) {
  if (d === 20) {
    g.dispatch({ type: "designSave", d: { ...sim.STOCK_DESIGNS.ember, id: "", name: "Test Launch", origin: "own", theme: "pirate" } });
    g.flushCommands?.();
    launched = g.lastDesign;
    g.dispatch({ type: "designCertify", id: launched });
  }
  if (d === 30) for (const o of g.state.objects.filter((q) => q.design === "stampede").slice(0, 3)) g.dispatch({ type: "designConvert", obj: o.id, id: launched });
  if (launched && d > 30 && d % 30 === 0) {
    const st = g.state.dstats[launched], pop = Object.keys(sim.SCENARIOS.testfloor.population);
    launchCurve.push(`${Math.round(pop.reduce((a, t) => a + sim.awareness(st, t), 0) / pop.length * 100)}%`);
  }
  for (let t = 0; t < sim.TICKS_PER_DAY; t++) {
    g.step();
    if (t % 100) continue;
    // M11.1: seat occupancy (guests playing ÷ game seats) and engagement, sampled with the rest.
    occ.samples++; occ.seats += g.gameSeats;
    for (const a of g.state.agents) {
      if (a.role !== "guest" || a.act !== "play" || a.seat < 0) continue;
      occ.playing++;
      (occ.eng[a.g.type] ??= []).push(sim.engagement(g, a));
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
const types = ["local", "retiree", "tourist", "party", "highroller", "family", "conventioneer"];
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
// M11.3: who gambled without coming for it (tempted, or a group member with time to themselves), and the house edge
// each crowd faced (1 − expected return ÷ wagered): seasoned crowds should find the thinner edges.
row("came for else / of them played", (d) => { const o = d.filter((e) => e.came !== "gamble"); return `${pct(o.length / Math.max(1, d.length))} / ${pct(share(o, (e) => e.wagered > 0))}`; });
row("house edge faced", (d) => { const w = d.reduce((a, e) => a + e.wagered, 0); return w ? `${(100 * (1 - d.reduce((a, e) => a + e.ev, 0) / w)).toFixed(1)}%` : "–"; });
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
console.log(`amenities: meals ${(uses.restaurant ?? 0) + (uses.patiorestaurant ?? 0)}, shows seen ${uses.showlounge ?? 0}, dances ${uses.club ?? 0}, pool ${uses.pool ?? 0}, garden ${uses.garden ?? 0}; food ${m("food")} (net of costs), tickets ${m("shows")}, cover ${m("cover")}, door fees ${m("doors")}; smokers ${pct(share(all, (e) => e.smoker))}`);
// Tables (M7): hold per game, by what was bet and paid.
const hold = {};
for (const o of s.objects) {
  const def = sim.OBJECTS[o.kind];
  if (!def.game) continue;
  const h = (hold[def.game] ??= { in: 0, out: 0, n: 0, sessions: 0 });
  h.in += o.st.coinIn; h.out += o.st.paidOut; h.n++; h.sessions += o.st.sessions;
}
console.log(`seats: ${pct(occ.playing / Math.max(1, occ.seats))} of game seats in use on average; engagement median ${Object.entries(occ.eng).map(([t, xs]) => `${t} ${med(xs).toFixed(2)}`).join(", ")}; draw ${Object.keys(sim.SCENARIOS.testfloor.population).map((t) => `${t} ${sim.floorDraw(g, t).toFixed(2)}`).join(", ")}`);
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
  // (M11.2) Only crowds that come to gamble should mostly play; the rest gamble when tempted.
  if (sim.GUEST_TYPES[t].reasons.gamble >= 0.5 && med(d.map((e) => e.play)) < 0.2) flags.push(`${t}: most guests barely play`);
  // (M11.3) Every crowd can be tempted on a floor with every kind of game: one that never is means the hooks are broken.
  const other = d.filter((e) => e.came !== "gamble");
  if (other.length >= 20 && share(other, (e) => e.wagered > 0) < 0.05) flags.push(`${t}: under 5% of those who came for something else ever gamble`);
  if (share(d, (e) => e.why === "nothing") > 0.25) flags.push(`${t}: over a quarter give up finding a machine`);
  const drinkers = d.filter((e) => e.intend > 0);
  if (drinkers.length && share(drinkers, (e) => e.drinks > 0) < 0.3) flags.push(`${t}: under 30% of drinkers get a drink`);
  if (share(d, (e) => e.why === "restroom") > 0.2) flags.push(`${t}: over a fifth leave for a restroom`);
  if (d.some((e) => ![e.minutes, e.lost, e.peak, e.score].every(Number.isFinite))) flags.push(`${t}: non-finite numbers`);
}
// Incidents: every M4 category fires, guards do something, and the police notice anything at all.
// (M11.3) Discipline and taste: seasoned locals should face a thinner edge than tourists and party guests.
const edge = (t) => { const d = dep[t] ?? [], w = d.reduce((a, e) => a + e.wagered, 0); return w ? 1 - d.reduce((a, e) => a + e.ev, 0) / w : NaN; };
for (const t of ["tourist", "party"]) if (edge("local") >= edge(t)) flags.push(`locals face as big a house edge as ${t} (${(100 * edge("local")).toFixed(1)}% vs ${(100 * edge(t)).toFixed(1)}%)`);
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
// M9: staff depth, whales, the regulator.
const staff = s.agents.filter((a) => a.st), avg = (f) => (staff.length ? staff.reduce((a, b) => a + f(b), 0) / staff.length : NaN);
const whales = Object.values(dep).flat().filter((e) => e.vip);
const tot = s.finance.total, shrink = ["bar", "cage", "tables", "machines"].reduce((a, k) => a + (tot[`shrink_${k}`] ?? 0), 0);
console.log(`staff: ${staff.length}, morale ${f1(avg((a) => a.st.morale))}, skill ${f2(avg((a) => sim.skillOf(g, a)))}, crooks ${staff.filter((a) => a.st.crook).length}; caught stealing ${m9.caught}, quit ${m9.quit}; shrinkage ${usd(-shrink)}`);
console.log(`whales: ${whales.length}, house result ${whales.map((e) => usd(e.wagered - e.won)).join(", ") || "–"}; tax ${usd(-(tot.tax ?? 0))}; inspector visits ${m9.inspections} (${m9.found} with findings); regulator ${Math.round(s.auth.regulator.standing)}`);
if (!staff.length || avg((a) => a.st.morale) < 20) flags.push("staff morale is miserable on the Test Floor");
if (m9.quit > staff.length / 2) flags.push("half the staff quit");
if (days >= 120 && !whales.length) flags.push("no whale ever came");
if (whales.some((e) => !e.wagered)) flags.push("a whale never played");
if (days >= 120 && !m9.audits) flags.push("the regulator never audited");
if (s.auth.regulator.standing < 60) flags.push("regulator standing fell on an honest floor");
// M8.6: the slot market, per design: machines, plays per machine-day, fans, performance index, awareness; the launch.
const ids = [...new Set(s.objects.filter((o) => sim.OBJECTS[o.kind].slot).map((o) => sim.designIdOf(o)))];
const drows = ids.map((id) => {
  const st = s.dstats[id], n = sim.machinesOf(s, id).length, idx = sim.perfIndex(s, id), plays = (st.hs ?? []).reduce((a, b) => a + b, 0) + (st.mo ?? 0);
  const md = (st.hm ?? []).reduce((a, b) => a + b, 0) + (st.md ?? 0);
  return { id, name: sim.designById(s, id)?.name ?? id, n, rate: plays / Math.max(1, md), fans: sim.fanCount(g, id), idx };
});
console.log(`slot designs: ${drows.map((r) => `${r.name} ×${r.n} ${f1(r.rate)}/day ${r.fans} fans${r.idx !== null ? ` idx ${f2(r.idx)}` : ""}`).join("; ")}`);
console.log(`launch (Test Launch, 3 machines from day 30): awareness by month ${launchCurve.join(" → ") || "–"}; wishes ${JSON.stringify(sim.wishes(g))}; records ${Object.keys(s.records ?? {}).join(", ") || "none"}`);
const avgRate = drows.reduce((a, r) => a + r.rate * r.n, 0) / Math.max(1, drows.reduce((a, r) => a + r.n, 0));
for (const r of drows) if (days >= 60 && r.rate < 0.1 * avgRate) flags.push(`${r.name} is barely played (${f1(r.rate)} a machine-day)`);
if (days >= 120 && !drows.some((r) => r.fans)) flags.push("no slot design has a single fan");
if (launched && days >= 200 && pop0(launched) < 0.5) flags.push("a new design is still unknown to most guests after half a year");
function pop0(id) { const pop = Object.keys(sim.SCENARIOS.testfloor.population); return pop.reduce((a, t) => a + sim.awareness(s.dstats[id], t), 0) / pop.length; }
// M9.5: the calendar, families.
console.log(`events: ${Object.entries(m95.events).map(([k, n]) => `${k} ${n}`).join(", ") || "none"}; children ${m95.kids}; sportsbook ${usd(tot.sports ?? 0)}`);
if (days >= 60 && !Object.keys(m95.events).length) flags.push("no event ever started");
if (m95.kidPlayed) flags.push("a child wagered money");
if (days >= 60 && !m95.kids) flags.push("no family ever brought children");
// M9.6: vice, drugs, the hotel elevator.
const esc = Object.values(dep).flat().filter((e) => e.why === "escort").length, hotel = Object.values(dep).flat().filter((e) => e.hotel).length;
console.log(`vice: escort pitches ${incAll.solicit ?? 0}, left with an escort ${esc}, hookups ${incAll.hookup ?? 0}, drug use ${incAll.drugs ?? 0}; hotel rooms ${usd(tot.rooms ?? 0)}; came by the elevator ${hotel}`);
if (days >= 60 && !incAll.solicit) flags.push("no escort ever worked the floor");
if (days >= 60 && !hotel) flags.push("nobody came by the hotel elevator");
for (const [k, want] of [["bingo", 0.3]]) { const h = hold[k]; if (h?.in && Math.abs((h.in - h.out) / h.in - want) > 1e-6) flags.push(`${k} hold isn't exactly ${want * 100}%`); }
if (hold.poker?.in && (hold.poker.in - hold.poker.out) / hold.poker.in > 0.1 + 1e-9) flags.push("poker took more than its rake");
if (!Object.values(at).some((m) => Object.keys(m).some((k) => k !== "slots" && k !== "vpoker"))) flags.push("nobody plays tables");
console.log(flags.length ? `\n⚠ ${flags.join("\n⚠ ")}` : "\nno sanity flags");
