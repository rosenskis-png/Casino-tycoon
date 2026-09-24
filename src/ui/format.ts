// Money shown abbreviated (FOUNDATIONS §14): $950, $48.2K, $3.1M.
export function money(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? "-" : "";
  if (a < 10_000) return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
  if (a < 1_000_000) return `${sign}$${(a / 1000).toFixed(1)}K`;
  return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
}
/** Money at the tables: cents when they matter ($0.25, $62.50), else as `money`. */
export function stake(n: number): string {
  const a = Math.abs(n);
  if (a < 1000 && Math.abs(a - Math.round(a)) > 1e-9) return `${n < 0 ? "-" : ""}$${a.toFixed(2)}`;
  return money(n);
}
