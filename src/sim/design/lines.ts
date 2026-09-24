// Paylines for the designer's line games: which sets of lines one symbol can win on together, for a run of k
// reels, without any other line winning through the same positions (sim/design/grid.ts builds reels this way).
import type { LayoutDef } from "../../data/designer";

const cache = new Map<string, number[][]>();
/** Up to 60 sets of m line indexes on which a k-reel run can win alone. */
export function linePatterns(lay: LayoutDef, k: number, m: number): number[][] {
  if (lay.win !== "lines" || k > lay.reels) return [];
  const key = `${lay.id}:${k}:${m}`;
  let out = cache.get(key);
  if (out) return out;
  out = [];
  const L = lay.lines, n = L.length;
  const ok = (set: number[]) => {
    const P = new Set<number>();
    for (const i of set) for (let r = 0; r < k; r++) P.add(r * 8 + L[i][r]);
    for (let j = 0; j < n; j++) {
      let t = 0;
      while (t < lay.reels && P.has(t * 8 + L[j][t])) t++;
      if (set.includes(j) ? t !== k : t >= 3) return false;
    }
    return true;
  };
  const rec = (start: number, set: number[]) => {
    if (out!.length >= 60) return;
    if (set.length === m) { if (ok(set)) out!.push(set.slice()); return; }
    for (let i = start; i < n; i++) { set.push(i); rec(i + 1, set); set.pop(); }
  };
  rec(0, []);
  cache.set(key, out);
  return out;
}
