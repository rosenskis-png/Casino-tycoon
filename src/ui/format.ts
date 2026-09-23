// Money shown abbreviated (FOUNDATIONS §14): $950, $48.2K, $3.1M.
export function money(n: number): string {
  const a = Math.abs(n), sign = n < 0 ? "-" : "";
  if (a < 10_000) return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
  if (a < 1_000_000) return `${sign}$${(a / 1000).toFixed(1)}K`;
  return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
}
