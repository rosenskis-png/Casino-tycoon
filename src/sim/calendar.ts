// The calendar (FOUNDATIONS §19, docs/spec/calendar.md): the year's scheduled events, drawn each 1 January and
// announced a week ahead, and marketing campaigns (§16). Both multiply arrivals by guest type; events also lift
// the sportsbook and poker.
import { CAMPAIGNS, CAMPAIGN_MONTHS, EVENTS } from "../data/events";
import { SCENARIOS } from "../data/scenarios";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { CalEvent, GameState } from "./state";
import { rng } from "./rng";
import { post } from "./finance";
import { news } from "./news";
import { MONTH_NAMES, TICKS_PER_BEAT, TICKS_PER_DAY, dateOfDay, dayOfDate, daysInMonth } from "./clock";

declare module "./commands" {
  interface CommandTypes {
    /** Start (or restart) a marketing campaign for this many months; 0 or less stops it. */
    advertise: { id: string; months: number };
  }
}

const DAY = TICKS_PER_DAY;
export const newCalendar = (): GameState["cal"] => ({ year: 0, events: [] });

/** Whether this scenario gets an event (conventions need Conventioneers in its population). */
function allowed(s: GameState, id: string): boolean {
  const sc = SCENARIOS[s.scenario], def = EVENTS[id];
  if (sc.events && !sc.events.includes(id)) return false;
  return !def.needs || !!sc.population[def.needs];
}

/** Draw a year's events: fixed holidays, and randomly dated ones spread across the year. */
function drawYear(g: Game, year: number) {
  const s = g.state, r = rng(s, "events");
  const out: CalEvent[] = [];
  for (const def of Object.values(EVENTS)) {
    if (!allowed(s, def.id)) continue;
    const len = () => r.int(def.days[0], def.days[1]);
    if (def.at) out.push({ id: def.id, start: dayOfDate(year, def.at.month, def.at.day) * DAY, end: 0, told: 0, len: len() });
    for (let k = 0; k < (def.perYear ?? 0); k++) {
      // Spread across the year: one in each slice, somewhere inside it.
      const slice = Math.floor(365 / def.perYear!), day = k * slice + r.int(3, slice - 8);
      out.push({ id: def.id, start: ((year - 1) * 365 + day) * DAY, end: 0, told: 0, len: len() });
    }
  }
  for (const e of out) { e.end = e.start + e.len * DAY; }
  // Keep anything from last year still running (New Year's Eve).
  s.cal.events = [...s.cal.events.filter((e) => e.end > s.tick), ...out.filter((e) => e.end > s.tick)].sort((a, b) => a.start - b.start);
  s.cal.year = year;
}

/** Events running now. */
export const runningEvents = (s: GameState) => s.cal.events.filter((e) => e.start <= s.tick && s.tick < e.end);

/** Arrival multiplier for a guest type now: running events and marketing campaigns. */
export function demand(s: GameState, type: string): number {
  let m = 1;
  for (const e of runningEvents(s)) { const c = EVENTS[e.id].crowd; m *= (c["*"] ?? 1) * (c[type] ?? 1); }
  for (const a of s.ads) m *= CAMPAIGNS[a.id]?.crowd[type] ?? 1;
  return m;
}

/** Appeal multiplier for a game family now (sports betting and poker surge with events). */
export function gameBoost(s: GameState, fam: string): number {
  if (fam !== "sports" && fam !== "poker") return 1;
  let m = 1;
  for (const e of runningEvents(s)) m *= (fam === "sports" ? EVENTS[e.id].sports : EVENTS[e.id].poker) ?? 1;
  return m;
}

/** Monthly marketing spend now. */
export const adFees = (s: GameState) => s.ads.reduce((a, c) => a + (CAMPAIGNS[c.id]?.fee ?? 0), 0);

const commands: CommandTable<"advertise"> = {
  advertise: {
    validate: (_g, c) => (!CAMPAIGNS[c.id] ? "Unknown campaign" : c.months > 0 && !CAMPAIGN_MONTHS.includes(c.months) ? "Unknown length" : null),
    apply(g, c) {
      const s = g.state;
      s.ads = s.ads.filter((a) => a.id !== c.id);
      if (c.months <= 0) return;
      s.ads.push({ id: c.id, until: s.tick + c.months * 30 * DAY });
      news(g, "info", `${CAMPAIGNS[c.id].name} running for ${c.months} month${c.months > 1 ? "s" : ""}.`);
    },
  },
};

export const calendarSystem: System = {
  id: "calendar",
  deps: ["news"],
  commands,
  beat(g) {
    // Campaign fees accrue like wages.
    const s = g.state, fees = adFees(s);
    if (!fees) return;
    const d = dateOfDay(Math.floor((s.tick - 1) / DAY));
    post(g, "marketing", -fees * (TICKS_PER_BEAT / (daysInMonth(d.month) * DAY)));
  },
  day(g) {
    const s = g.state, date = dateOfDay(Math.floor(s.tick / DAY));
    if (s.cal.year !== date.year) drawYear(g, date.year);
    for (const e of s.cal.events) {
      const def = EVENTS[e.id];
      if (!e.told && s.tick >= e.start - def.notice * DAY && s.tick < e.start) {
        e.told = 1;
        const at = dateOfDay(Math.floor(e.start / DAY));
        news(g, "info", `Coming ${at.day} ${MONTH_NAMES[at.month]}: ${def.name}, ${def.blurb}.`);
      }
      if (e.told < 2 && s.tick >= e.start && s.tick < e.end) { e.told = 2; news(g, "good", `${def.name} starts today: ${def.blurb}.`); }
    }
    s.cal.events = s.cal.events.filter((e) => e.end > s.tick);
    const done = s.ads.filter((a) => a.until <= s.tick);
    if (done.length) {
      s.ads = s.ads.filter((a) => a.until > s.tick);
      for (const a of done) news(g, "info", `${CAMPAIGNS[a.id]?.name ?? a.id} has ended.`);
    }
  },
};
