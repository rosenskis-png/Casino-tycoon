// Fixed-timestep floor clock and the RCT-style calendar (docs/spec/clock.md).
export const TICKS_PER_SECOND = 20;
export const TICKS_PER_DAY = 200;
/** Floor-pace cadence for slow per-agent work (crowd fields, need decay): once per real second at 1×. */
export const TICKS_PER_BEAT = 20;
export const SPEEDS = [0, 1, 2, 4, 8] as const;
export type Speed = (typeof SPEEDS)[number];

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const YEAR_DAYS = 365;

export interface CalendarDate { year: number; month: number; day: number } // year from 1, month 0-11, day from 1

/** Calendar date for a day count since the scenario start (day 0 = 1 Jan, year 1). No leap years. */
export function dateOfDay(dayIndex: number): CalendarDate {
  const year = Math.floor(dayIndex / YEAR_DAYS) + 1;
  let d = dayIndex % YEAR_DAYS;
  let month = 0;
  while (d >= MONTH_DAYS[month]) { d -= MONTH_DAYS[month]; month++; }
  return { year, month, day: d + 1 };
}

export function formatDate(dayIndex: number): string {
  const { year, month, day } = dateOfDay(dayIndex);
  return `${day} ${MONTH_NAMES[month]}, Year ${year}`;
}

export const dayOfTick = (tick: number) => Math.floor(tick / TICKS_PER_DAY);
