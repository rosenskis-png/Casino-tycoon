// Drinks (docs/spec/guests.md): the player's drink policy and serving a drink, at the bar or by a drink server.
// Intoxication is continuous: each drink adds DRINK_UNIT × strength for drinkers (sober guests order soft drinks).
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Agent, GuestData } from "./state";
import { rng } from "./rng";
import { post } from "./finance";
import { think } from "./guests";

declare module "./commands" {
  interface CommandTypes {
    setDrinks: { price?: number; comp?: number; strength?: number };
  }
}

/** Base price of a drink at 1× (real-looking dollars), and what each one costs the house. */
export const DRINK_PRICE = 7;
export const DRINK_COST = 1.5;
/** Intoxication one standard drink adds, and the M3 ceiling (above 1 is pass-out territory for M4). */
export const DRINK_UNIT = 0.16;
export const INTOX_CAP = 1.3;
export const STRENGTHS = [0.6, 1, 1.4];

/** Comp-seekers nurse cheap machines, but only while drinks are comped. */
export const compSeeking = (g: Game, gd: GuestData) => gd.compSeek === 1 && g.state.drinks.comp >= 0.25;

/** Price a guest pays for one drink now (0 when comped). Players get comped at the policy's rate. */
function priceFor(g: Game, gd: GuestData, comped: boolean): number {
  if (comped) return 0;
  const p = DRINK_PRICE * g.state.drinks.price * (gd.intend > 0 ? 1 : 0.5);
  return Math.round(p * 4) / 4;
}

/**
 * Hands `a` a drink (at the bar, or brought by a server). Returns false when they turn it down: too pricey
 * for their taste, or they can't pay.
 */
export function serveDrink(g: Game, a: Agent, via: "bar" | "server"): boolean {
  const gd = a.g!, pol = g.state.drinks, r = rng(g.state, "drinks");
  const comped = gd.mem.wagered > 0 && r.chance(pol.comp);
  const price = priceFor(g, gd, comped);
  // Steep prices put some off (more so the pricier it gets).
  if (price > DRINK_PRICE * 1.5 && r.chance(Math.min(0.8, (pol.price - 1.5) * 0.5))) {
    think(g, a, "pricey");
    gd.needs.thirst = Math.min(gd.needs.thirst, 40);
    return false;
  }
  if (price > gd.wallet) return false;
  if (price) { gd.wallet -= price; post(g, "bar", price); }
  post(g, "drinks", -DRINK_COST);
  gd.needs.thirst = 0;
  gd.mem.drinks++;
  if (via === "server") gd.mem.served++;
  if (comped) gd.mem.comped++;
  if (gd.intend > 0) gd.intox = Math.min(INTOX_CAP, gd.intox + DRINK_UNIT * pol.strength);
  if (comped && r.chance(0.3)) think(g, a, "freeDrink");
  else if (via === "server" && r.chance(0.25)) think(g, a, "served");
  else if (gd.intend > 0 && pol.strength < 1 && r.chance(0.3)) think(g, a, "weak");
  else if (price > DRINK_PRICE * 1.5 && r.chance(0.3)) think(g, a, "pricey");
  else if (r.chance(0.3)) think(g, a, "goodDrink");
  return true;
}

const commands: CommandTable<"setDrinks"> = {
  setDrinks: {
    validate(_g, c) {
      if (c.price !== undefined && !(c.price >= 0 && c.price <= 3)) return "Price must be 0–3×";
      if (c.comp !== undefined && !(c.comp >= 0 && c.comp <= 1)) return "Comps must be 0–100%";
      if (c.strength !== undefined && !STRENGTHS.includes(c.strength)) return "Unknown strength";
      return null;
    },
    apply(g, c) {
      const d = g.state.drinks;
      if (c.price !== undefined) d.price = c.price;
      if (c.comp !== undefined) d.comp = c.comp;
      if (c.strength !== undefined) d.strength = c.strength;
    },
  },
};

export const drinkSystem: System = { id: "drinks", commands };
