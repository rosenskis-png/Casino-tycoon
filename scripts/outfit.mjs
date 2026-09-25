// The Outfit report (M12, owner): plays the Outfit's lot built as a luxury salon (hidden scenario `outfit_built`)
// three ways, over several seeds, and prints the goal bars month by month: the high rollers' gaming win, the lowest
// police standing, and how often a high roller went on tilt. The lesson's proof (docs/spec/scenarios.md rule 6): the
// honest casino and the free-for-all must miss the goal on every seed, the squeeze must meet it. A report, not a check.
// The goal is judged over the months run (the scenario's own deadline is later: building from nothing takes a while).
//   honest   strict house rules, ordinary drinks, caught cheats banned
//   wild     every rule on Ignore, every drink free and strong
//   squeeze  lenient on drink, vice and drugs, strict on fights; the salon bar pours strong and comps half; caught
//            cheats beaten (the town looks away); officers and inspectors paid off
//   blind    the squeeze with no one watching for cheats (cameras, operator and pit bosses gone)
// Usage: node scripts/outfit.mjs [strategies] [months] [seeds]
import { loadSim } from "./sim-bundle.mjs";

const [strats = "honest,wild,squeeze", months = 12, seeds = "1,2,3"] = process.argv.slice(2);
const sim = await loadSim();
const goal = sim.SCENARIOS.outfit.goals;
const usd = (n) => `$${Math.round(n / 1000)}K`;

function setup(g, strat) {
  const s = g.state, cmds = [{ type: "setInsurance", level: 1 }];
  const rules = { honest: [2, 3, 3, 3, 3], wild: [0, 0, 0, 0, 0], squeeze: [1, 3, 2, 1, 1], blind: [1, 3, 2, 1, 1] }[strat];
  ["intox", "disorder", "misconduct", "vice", "drugs"].forEach((cat, k) => cmds.push({ type: "setRule", cat, level: rules[k] }));
  for (const o of s.objects) {
    if (o.kind === "restaurant" || o.kind === "bar") cmds.push({ type: "setGrade", id: o.id, grade: 2 });
    if (!o.bar) continue;
    const salon = o.x < 45 && o.y < 27;
    if (strat === "wild") cmds.push({ type: "setBar", id: o.id, comp: 1, strength: 1.4 });
    else if (strat === "squeeze" || strat === "blind") cmds.push({ type: "setBar", id: o.id, comp: salon ? 1 : 0.5, strength: salon ? 1.4 : 1 });
  }
  cmds.push({ type: "setTreatment", first: strat === "honest" || strat === "wild" ? "ban" : "beat", repeat: strat === "honest" || strat === "wild" ? "ban" : "vanish" });
  // The squeeze keeps the drinks coming: more servers and hosts.
  if (strat === "squeeze" || strat === "blind") for (const role of ["server", "server", "server", "server", "server", "server", "host", "host"]) cmds.push({ type: "hire", role });
  for (const c of cmds) { const why = g.dispatch(c); if (why) console.log(`  ${c.type} refused: ${why}`); }
  g.flushCommands();
  if (strat === "blind") {
    for (const o of s.objects.filter((q) => q.kind === "camera")) g.dispatch({ type: "remove", id: o.id });
    for (const a of s.agents.filter((q) => q.role === "operator" || q.role === "pitboss")) g.dispatch({ type: "fire", id: a.id });
    g.flushCommands();
  }
}

for (const strat of strats.split(",")) {
  console.log(`\n${strat} (goal: high rollers' gaming win averaging ${usd(goal.gaming.min)} a month over ${goal.gaming.months} months; police never below ${goal.police})`);
  for (const seed of String(seeds).split(",").map(Number)) {
    const g = sim.Game.create("outfit_built", seed);
    setup(g, strat);
    const acc = { visits: 0, tilts: 0, hosted: 0, cheatsLost: 0, drinks: 0, theo: 0, peak: 0, tiltLoss: 0 };
    g.bus.on((e) => {
      if (e.type !== "departed" || e.minor || e.guestType !== "highroller") return;
      acc.visits++; acc.tilts += e.tilted; acc.hosted += e.hosted; acc.drinks += e.drinks; acc.theo += e.wagered - e.ev; acc.peak += e.peak; if (e.tilted) acc.tiltLoss += e.wagered - e.won;
      if (e.cheat && !e.caught) acc.cheatsLost += e.won - e.wagered;
    });
    const row = [];
    let low = 100, best = -Infinity, wonAt = "";
    const vals = [];
    // The squeeze pays off any officer or inspector who walks in (the town takes bribes).
    const bribe = strat === "squeeze" || strat === "blind";
    const payOff = () => { for (const a of g.state.agents) if ((a.role === "officer" || a.role === "inspector") && !a.paid && a.act !== "leave") g.dispatch({ type: "bribe", id: a.id }); };
    for (let m = 0; m < months; m++) {
      for (let d = 0; d < 30; d++) {
        for (let t = 0; t < sim.TICKS_PER_DAY; t++) { g.step(); if (bribe && t % 20 === 0) payOff(); }
        g.bus.flush();
        low = Math.min(low, g.state.auth.police.standing);
      }
      // Month boundaries are calendar months: step on until the goals system has closed this one.
      while (g.state.crowdWin.hist.length < m + 1) { for (let t = 0; t < sim.TICKS_PER_DAY; t++) g.step(); g.bus.flush(); low = Math.min(low, g.state.auth.police.standing); }
      const v = g.state.crowdWin.hist[g.state.crowdWin.hist.length - 1].highroller ?? 0;
      vals.push(v);
      const n = goal.gaming.months, avg = vals.length >= n ? vals.slice(-n).reduce((a, b) => a + b, 0) / n : -Infinity;
      best = Math.max(best, avg);
      if (!wonAt && avg >= goal.gaming.min && low >= goal.police) wonAt = `month ${m + 1}`;
      row.push(usd(v));
    }
    const bad = sim.checkInvariants(g);
    if (bad.length) { console.error(`seed ${seed}:`, bad.slice(0, 5).join("; ")); process.exit(1); }
    console.log(`  seed ${seed}: ${row.join(" ")} | police low ${Math.round(low)}, stage ${g.state.auth.police.stage}${g.state.auth.revoked ? " REVOKED" : ""} | ` +
      `HR visits ${acc.visits}, tilt 1 in ${acc.tilts ? Math.round(acc.visits / acc.tilts) : "∞"} (lost ${usd(acc.tiltLoss / Math.max(1, acc.tilts))} each), hosted ${Math.round(100 * acc.hosted / Math.max(1, acc.visits))}%, ${(acc.drinks / Math.max(1, acc.visits)).toFixed(1)} drinks (peak ${(acc.peak / Math.max(1, acc.visits)).toFixed(2)}), theo ${usd(acc.theo / months)}/mo, ` +
      `cheats kept ${usd(acc.cheatsLost)} | rep ${Math.round(g.state.rep.highroller)} | year avg ${usd(vals.reduce((a, b) => a + b, 0) / vals.length)}, best ${goal.gaming.months}-mo avg ${usd(best)} | ${wonAt ? `GOAL MET ${wonAt}` : "missed"}`);
  }
}
