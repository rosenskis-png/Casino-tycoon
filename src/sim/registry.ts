// System registry: each system plugs into the clock with hooks at its cadence and runs after its dependencies.
import type { Game } from "./game";

export interface System {
  id: string;
  deps?: string[];
  /** Build runtime caches from saved state (new game and load). */
  init?(g: Game): void;
  tick?(g: Game): void;
  /** Once per real second at 1× (TICKS_PER_BEAT). */
  beat?(g: Game): void;
  day?(g: Game): void;
  month?(g: Game): void;
  year?(g: Game): void;
}

export function orderSystems(systems: System[]): System[] {
  const byId = new Map(systems.map((s) => [s.id, s]));
  const out: System[] = [];
  const state = new Map<string, 1 | 2>();
  const visit = (s: System, trail: string[]) => {
    const st = state.get(s.id);
    if (st === 2) return;
    if (st === 1) throw new Error(`system dependency cycle: ${[...trail, s.id].join(" → ")}`);
    state.set(s.id, 1);
    for (const d of s.deps ?? []) {
      const dep = byId.get(d);
      if (!dep) throw new Error(`system ${s.id} depends on missing ${d}`);
      visit(dep, [...trail, s.id]);
    }
    state.set(s.id, 2);
    out.push(s);
  };
  for (const s of systems) visit(s, []);
  return out;
}
