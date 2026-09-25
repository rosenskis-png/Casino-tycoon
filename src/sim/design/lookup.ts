// Plain lookups for slot designs (no systems): which design a machine plays, a design by id, and its price.
// Kept apart from design/index.ts so geometry and finance can use them without an import cycle.
import { STOCK_DESIGNS } from "../../data/designs";
import { CABINETS, TOPPERS, featuresOf, type SlotDesign } from "../../data/designer";
import { OBJECTS } from "../../data/objects";
import type { GameState, PlacedObject } from "../state";

/** The design a machine plays. */
export const designIdOf = (o: PlacedObject): string => o.design ?? OBJECTS[o.kind]?.slot ?? "";
export const isStock = (id: string) => !!STOCK_DESIGNS[id];
export const designById = (s: GameState, id: string): SlotDesign | undefined => s.designs?.[id]?.d ?? STOCK_DESIGNS[id];

/** Build price of a design's cabinet, and its monthly upkeep. */
export function designPrice(d: SlotDesign): { cost: number; upkeep: number } {
  const cost = CABINETS[d.cab.type].cost + TOPPERS[d.cab.topper].cost + 25 * featuresOf(d).length + 15 * d.jackpots.length
    + 40 * d.jackpots.filter((j) => j.kind && j.kind !== "fixed").length;
  return { cost, upkeep: Math.max(2, Math.round(cost * 0.012)) };
}
/** Price of a placed (or to-be-placed) slot with a design; null for anything else (the original machines keep theirs). */
export function slotPrice(s: GameState | undefined, kind: string, design: string | undefined): { cost: number; upkeep: number } | null {
  if (!OBJECTS[kind]?.slot || !design || !s) return null;
  const d = designById(s, design);
  return d ? designPrice(d) : null;
}
