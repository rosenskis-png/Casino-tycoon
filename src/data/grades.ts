// (M11.4, owner) What a priced place serves, from cheap to fancy, separate from its price: the grade sets what each
// serving costs the house and what it's worth to each crowd, so any grade can be fairly priced, a bargain or a
// rip-off. Crowds with a taste for luxury (`luxe` in guests.ts) value fancy far above cheap; the rest barely care.
export const GRADES = ["Cheap", "Standard", "Fancy"] as const;
export const GRADE_DEFAULT = 1;
/** What one serving costs the house at each grade, × the standard cost below. */
export const GRADE_COST = [0.4, 1, 2.2];
/** What one serving costs the house at Standard: a drink, a meal, a show seat, a club entry, a swim, a round of golf. */
export const UNIT_COST: Record<string, number> = { thirst: 1.5, hunger: 6, show: 6, club: 2, pool: 1, golf: 1 };
/** How much a grade is worth to a crowd, × the standard worth: cheap loses what luxury-lovers want; fancy adds it. */
export function gradeWorth(luxe: number, grade: number): number {
  return grade <= 0 ? 1 - 0.5 * luxe : grade >= 2 ? 0.7 + 1.3 * luxe : 1;
}
export const unitCost = (serves: string, grade: number) => (UNIT_COST[serves] ?? 0) * GRADE_COST[Math.max(0, Math.min(2, grade))];
