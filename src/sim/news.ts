// Ticker news. The log (last 30 game days) is saved; what shows on the ticker right now is the UI's business.
import type { System } from "./registry";
import type { Game } from "./game";
import type { NewsLevel } from "./events";
import { TICKS_PER_DAY } from "./clock";

export const LOG_DAYS = 30;

export function news(g: Game, level: NewsLevel, text: string) {
  g.state.log.push({ tick: g.state.tick, level, text });
  g.bus.emit({ type: "news", level, text });
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
