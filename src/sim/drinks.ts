// Drinks (docs/spec/guests.md §Drinks): each bar's drink policy, handing a guest a drink, and whether a guest
// takes one a server offers. A guest holds one drink at a time and sips it over a minute or two (sim/guests.ts),
// so intoxication climbs gradually; servers raise it mostly by offering often (more chances to say yes).
import { GUEST_TYPES } from "../data/guests";
import { OBJECTS } from "../data/objects";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Agent, BarPolicy, GuestData, PlacedObject } from "./state";
import { rng } from "./rng";
import { post } from "./finance";
import { think } from "./guests";

declare module "./commands" {
  interface CommandTypes {
    /** Drink policy for one bar (and its servers). */
    setBar: { id: number; price?: number; comp?: number; strength?: number; area?: number };
    /** Put a drink server on a bar. */
    assignServer: { id: number; bar: number };
  }
}

/** Base price of a drink at 1× (real-looking dollars), and what each one costs the house. */
export const DRINK_PRICE = 7;
export const DRINK_COST = 1.5;
/** Intoxication a whole standard drink adds (sipped in over its drinking time), and the M3 ceiling. */
export const DRINK_UNIT = 0.16;
export const INTOX_CAP = 1.3;
export const STRENGTHS = [0.6, 1, 1.4];
export const DEFAULT_BAR: BarPolicy = { price: 1, comp: 0, strength: 1, area: -1 };

export const barPolicy = (o: PlacedObject | undefined): BarPolicy => o?.bar ?? DEFAULT_BAR;

/** Comp-seekers nurse cheap machines, but only while some bar comps drinks. */
export function compSeeking(g: Game, gd: GuestData): boolean {
  if (gd.compSeek !== 1) return false;
  for (const o of g.amenities.thirst) if (barPolicy(o).comp >= 0.25) return true;
  return false;
}

/** Price one drink costs this guest at this bar (soft drinks half). */
export function priceAt(pol: BarPolicy, gd: GuestData): number {
  return Math.round(DRINK_PRICE * pol.price * (gd.intend > 0 ? 1 : 0.5) * 4) / 4;
}

/** Is this drink on the house? Only for guests who've played, at the bar's comp rate. Rolled once per drink. */
export function rollComp(g: Game, gd: GuestData, pol: BarPolicy): boolean {
  return gd.mem.wagered > 0 && rng(g.state, "drinks").chance(pol.comp);
}

/**
 * Chance a guest says yes to a drink a server offers: their type's readiness, more when thirsty, when below
 * the level they mean to drink to, when it's free, and the more they've already had; less when pricey.
 * Sober guests only take soft drinks when thirsty. Nobody takes a second while holding one.
 */
export function acceptChance(gd: GuestData, pol: BarPolicy, comped: boolean): number {
  if (gd.drink > 0 || gd.why) return 0;
  const type = GUEST_TYPES[gd.type];
  const thirst = 0.4 + gd.needs.thirst / 100;
  if (!gd.intend) return Math.min(0.9, type.drinking.accept * 0.5 * thirst * (gd.needs.thirst >= 50 ? 1.5 : 0.4) * (comped ? 1.5 : 1));
  const want = gd.intox < gd.intend ? 1.3 : 0.6;
  const price = comped ? 1.8 : Math.max(0.2, 1.3 - 0.3 * pol.price);
  return Math.min(0.95, type.drinking.accept * thirst * want * price * (1 + gd.intox));
}

/**
 * Hands `a` a drink from bar `o` (at the bar, or brought by one of its servers). Pays unless comped. Returns
 * false when they can't pay (or already hold one).
 */
export function serveDrink(g: Game, a: Agent, o: PlacedObject | undefined, via: "bar" | "server", comped: boolean): boolean {
  const gd = a.g!, pol = barPolicy(o), r = rng(g.state, "drinks");
  if (gd.drink > 0) return false;
  const price = comped ? 0 : priceAt(pol, gd);
  if (price > gd.wallet) return false;
  if (price) { gd.wallet -= price; post(g, "bar", price); }
  post(g, "drinks", -DRINK_COST);
  gd.drink = 1;
  gd.dStr = gd.intend > 0 ? pol.strength : 0;
  gd.mem.drinks++;
  if (via === "server") gd.mem.served++;
  if (comped) gd.mem.comped++;
  if (o) o.st.uses++;
  if (comped && r.chance(0.3)) think(g, a, "freeDrink");
  else if (via === "server" && r.chance(0.25)) think(g, a, "served");
  else if (gd.intend > 0 && pol.strength < 1 && r.chance(0.3)) think(g, a, "weak");
  else if (pol.price > 1.5 && r.chance(0.3)) think(g, a, "pricey");
  else if (r.chance(0.2)) think(g, a, "goodDrink");
  return true;
}

/** Bar with the fewest servers (ties: lowest id), or -1 with no bars. */
export function leastServedBar(g: Game): number {
  const n = new Map<number, number>();
  for (const o of g.amenities.thirst) n.set(o.id, 0);
  for (const a of g.state.agents) if (a.role === "server" && a.bar !== undefined && n.has(a.bar)) n.set(a.bar, n.get(a.bar)! + 1);
  let best = -1, bn = Infinity;
  for (const [id, k] of n) if (k < bn || (k === bn && id < best)) { bn = k; best = id; }
  return best;
}

const isBar = (g: Game, id: number) => OBJECTS[g.objById.get(id)?.kind ?? ""]?.serves === "thirst";

const commands: CommandTable<"setBar" | "assignServer"> = {
  setBar: {
    validate(g, c) {
      if (!isBar(g, c.id)) return "Not a bar";
      if (c.price !== undefined && !(c.price >= 0 && c.price <= 3)) return "Price must be 0–3×";
      if (c.comp !== undefined && !(c.comp >= 0 && c.comp <= 1)) return "Comps must be 0–100%";
      if (c.strength !== undefined && !STRENGTHS.includes(c.strength)) return "Unknown strength";
      if (c.area !== undefined && c.area !== -1 && !(c.area >= 0 && c.area < g.state.map.terrain.length)) return "Unknown area";
      return null;
    },
    apply(g, c) {
      const o = g.objById.get(c.id)!;
      const pol = (o.bar ??= { ...DEFAULT_BAR });
      if (c.price !== undefined) pol.price = c.price;
      if (c.comp !== undefined) pol.comp = c.comp;
      if (c.strength !== undefined) pol.strength = c.strength;
      if (c.area !== undefined) pol.area = c.area;
    },
  },
  assignServer: {
    validate(g, c) {
      if (!g.state.agents.some((a) => a.id === c.id && a.role === "server")) return "Not a drink server";
      return isBar(g, c.bar) ? null : "Not a bar";
    },
    apply(g, c) {
      const a = g.state.agents.find((x) => x.id === c.id)!;
      a.bar = c.bar;
      // Drop the current round; they start taking orders for the new bar.
      a.tray = undefined; a.due = undefined; a.target = -1; a.act = "idle"; a.timer = 0;
    },
  },
};

export const drinkSystem: System = {
  id: "drinks",
  commands,
  layout(g) {
    // Servers whose bar is gone move to the least-served one.
    for (const a of g.state.agents) {
      if (a.role !== "server" || (a.bar !== undefined && isBar(g, a.bar))) continue;
      const b = leastServedBar(g);
      a.bar = b >= 0 ? b : undefined;
      a.tray = undefined; a.due = undefined; a.target = -1; a.act = "idle"; a.timer = 0;
    }
  },
};
