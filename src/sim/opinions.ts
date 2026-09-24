// What guests think of each game kind (owner, M8.5; docs/spec/designer.md "M8.5 plan"): every thought a guest has
// while playing is counted against the game kind they're at (each slot design; each table or video game by kind),
// by month, for the last six months, with sessions and how the players felt when they got up.
import { OBJECTS } from "../data/objects";
import { THOUGHTS } from "../data/thoughts";
import { TICKS_PER_DAY, dateOfDay } from "./clock";
import { designIdOf } from "./design/lookup";
import type { GameState, OpinionMonth, PlacedObject } from "./state";

export const OPINION_MONTHS = 6;

/** The game kind an object counts toward: a slot's design, or a game's object kind. */
export function gameKey(o: PlacedObject | undefined): string | null {
  if (!o) return null;
  const def = OBJECTS[o.kind];
  if (def?.slot) return designIdOf(o);
  if (def?.game) return `k:${o.kind}`;
  return null;
}
const monthOf = (tick: number) => { const d = dateOfDay(Math.floor(tick / TICKS_PER_DAY)); return (d.year - 1) * 12 + d.month; };

function bucket(s: GameState, key: string): OpinionMonth {
  const arr = ((s.ohist ??= {})[key] ??= []), mo = monthOf(s.tick);
  let b = arr[arr.length - 1];
  if (!b || b.mo !== mo) {
    arr.push((b = { mo, t: {}, n: 0, s: 0 }));
    while (arr.length && arr[0].mo <= mo - OPINION_MONTHS) arr.shift();
  }
  return b;
}
export function noteThought(s: GameState, key: string | null, id: string) {
  if (!key || !THOUGHTS[id]) return;
  const b = bucket(s, key);
  b.t[id] = (b.t[id] ?? 0) + 1;
}
/** A session ended at a game: counted, with the player's mood (0-100) as they got up. */
export function noteSessionEnd(s: GameState, key: string | null, mood: number) {
  if (!key) return;
  const b = bucket(s, key);
  b.n++;
  b.s += mood;
}
/** Drops months older than six (and game kinds with nothing left). */
export function pruneOpinions(s: GameState) {
  const mo = monthOf(s.tick);
  for (const [k, arr] of Object.entries(s.ohist ?? {})) {
    while (arr.length && arr[0].mo <= mo - OPINION_MONTHS) arr.shift();
    if (!arr.length) delete s.ohist[k];
  }
}

export interface OpinionSummary {
  /** Sessions and average mood at the end of them, over the months kept. */
  sessions: number; mood: number;
  /** Thoughts by id with their share of all thoughts here, likes and complaints apart, most common first. */
  likes: { id: string; n: number; share: number }[];
  complaints: { id: string; n: number; share: number }[];
  /** Change against the month before: sessions and mood (null when there's no month before). */
  trend: { sessions: number; mood: number } | null;
  months: number;
}
/** A game kind's last six months, for its card and the Games list. */
export function opinionsOf(s: GameState, key: string): OpinionSummary | null {
  const arr = s.ohist?.[key];
  if (!arr?.length) return null;
  const tot: Record<string, number> = {};
  let n = 0, ms = 0, all = 0;
  for (const b of arr) {
    n += b.n; ms += b.s;
    for (const [id, c] of Object.entries(b.t)) { tot[id] = (tot[id] ?? 0) + c; all += c; }
  }
  const rows = Object.entries(tot).map(([id, c]) => ({ id, n: c, share: all ? c / all : 0 })).sort((a, b) => b.n - a.n);
  const last = arr[arr.length - 1], prev = arr.length > 1 ? arr[arr.length - 2] : null;
  const avg = (b: OpinionMonth) => (b.n ? b.s / b.n : 0);
  return {
    sessions: n, mood: n ? ms / n : 0,
    likes: rows.filter((q) => !THOUGHTS[q.id]?.bad), complaints: rows.filter((q) => THOUGHTS[q.id]?.bad),
    trend: prev && prev.n ? { sessions: last.n - prev.n, mood: avg(last) - avg(prev) } : null,
    months: arr.length,
  };
}
