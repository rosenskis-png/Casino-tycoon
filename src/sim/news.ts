// Ticker news. The log (last 30 game days) is saved; what shows on the ticker right now is the UI's business.
import type { System } from "./registry";
import type { Game } from "./game";
import type { NewsLevel } from "./events";
import type { NewsRef } from "./state";
import { TICKS_PER_DAY } from "./clock";

export const LOG_DAYS = 30;

/**
 * Logs an item; `quiet` keeps it off the ticker (routine notices the owner wouldn't want to be interrupted by).
 * (M11) `ref` says what it's about (a person, a place, a tab): tapping the notice goes there. A person's tile is
 * kept too, for when they've left.
 */
/**
 * (Batch A) What a notice is about, for the Game tab's notice switches. "general" (goals, welcome) can't be
 * switched off; urgent notices always reach the ticker.
 */
export type NewsCat = "general" | "wins" | "incidents" | "security" | "authorities" | "staff" | "money" | "guests" | "calendar" | "slots" | "research";
export const NEWS_CATS: { id: Exclude<NewsCat, "general">; name: string }[] = [
  { id: "wins", name: "Big wins and jackpots" }, { id: "incidents", name: "Incidents on the floor" },
  { id: "security", name: "Cheats and enforcement" }, { id: "authorities", name: "Police and regulator" },
  { id: "staff", name: "Staff" }, { id: "money", name: "Money and loans" }, { id: "guests", name: "Guests and whales" },
  { id: "calendar", name: "Events and marketing" }, { id: "slots", name: "Slot designs and makers" }, { id: "research", name: "Research" },
];

/** `news` for one category (each system's file makes its own). */
export const newsFor = (cat: NewsCat) =>
  (g: Game, level: NewsLevel, text: string, quiet: boolean | NewsRef = false, ref?: NewsRef) => news(g, level, text, quiet, ref, cat);

export function news(g: Game, level: NewsLevel, text: string, quiet: boolean | NewsRef = false, ref?: NewsRef, cat: NewsCat = "general") {
  if (typeof quiet === "object") { ref = quiet; quiet = false; }
  if (ref?.a !== undefined && ref.t === undefined) {
    const a = g.state.agents.find((b) => b.id === ref!.a);
    if (a) ref = { ...ref, t: a.y * g.state.map.w + a.x };
  }
  g.state.log.push(ref ? { tick: g.state.tick, level, text, ref } : { tick: g.state.tick, level, text });
  if (!quiet) g.bus.emit({ type: "news", level, text, ref, cat });
}

/** A notice about an object: its tile. */
export const at = (g: Game, o: { x: number; y: number }): NewsRef => ({ t: o.y * g.state.map.w + o.x });

/** Money for news text, abbreviated like the UI: $950, $48.2K, $3.1M. */
export function fmtMoney(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? "-" : "";
  if (a < 10_000) return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
  if (a < 1_000_000) return `${sign}$${(a / 1000).toFixed(1)}K`;
  return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
}

export const newsSystem: System = {
  id: "news",
  day(g) {
    const cutoff = g.state.tick - LOG_DAYS * TICKS_PER_DAY;
    const log = g.state.log;
    let k = 0;
    while (k < log.length && log[k].tick < cutoff) k++;
    if (k) log.splice(0, k);
  },
};
