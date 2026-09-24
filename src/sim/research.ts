// Research (FOUNDATIONS §18, docs/spec/research.md): monthly funding goes into the project the player picked;
// finished projects unlock games, amenities, themes, cameras, and information (suspicion tool tiers, overlays,
// heatmaps, the player's club, guest breakdowns). Anything no project unlocks is always available.
import { FUNDING, RESEARCH } from "../data/research";
import { OBJECTS } from "../data/objects";
import { SCENARIOS, type ScenarioDef } from "../data/scenarios";
import type { Channel } from "../data/fields";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { GameState, ResearchState } from "./state";
import { post } from "./finance";
import { news } from "./news";
import { TICKS_PER_BEAT, TICKS_PER_DAY, dateOfDay, daysInMonth } from "./clock";

declare module "./commands" {
  interface CommandTypes {
    setFunding: { amount: number };
    setProject: { id: string };
  }
}

/** Every building project (games, amenities, themes, staff tools): what the open scenarios start with. */
export const BUILD_PROJECTS = Object.values(RESEARCH).filter((d) => d.cat !== "info").map((d) => d.id);

export function newResearch(sc: ScenarioDef): ResearchState {
  const start = sc.research === "build" ? BUILD_PROJECTS : sc.research ?? [];
  return { funding: 0, project: "", points: {}, done: [...start] };
}

export const researched = (s: GameState, id: string) => s.research.done.includes(id);

/** The project that unlocks an object kind (by the object, or its decor theme), if any. */
const lockCache = new Map<string, string>();
export function projectFor(kind: string): string {
  let v = lockCache.get(kind);
  if (v === undefined) {
    const theme = OBJECTS[kind]?.tags?.theme;
    v = Object.values(RESEARCH).find((d) => d.objects?.includes(kind) || (theme && d.themes?.includes(theme)))?.id ?? "";
    lockCache.set(kind, v);
  }
  return v;
}
/** Whether an object kind still needs research here. */
export const locked = (s: GameState, kind: string) => { const p = projectFor(kind); return !!p && !researched(s, p); };

/** Whether a project can be started: not done, and everything it needs is done. */
export const available = (s: GameState, id: string) => !researched(s, id) && (RESEARCH[id]?.needs ?? []).every((n) => researched(s, n));

/** Suspicion tool tiers available: the scenario's own, raised by research. */
export function toolTier(s: GameState): number {
  let t = SCENARIOS[s.scenario]?.tools ?? 0;
  for (const id of s.research.done) t = Math.max(t, RESEARCH[id]?.tier ?? 0);
  return t;
}
/** Field overlays the player has earned. */
export function overlays(s: GameState): Channel[] {
  const out: Channel[] = [];
  for (const id of s.research.done) for (const c of RESEARCH[id]?.overlays ?? []) out.push(c);
  return out;
}
export const hasClub = (s: GameState) => s.research.done.some((id) => RESEARCH[id]?.club);
export const hasHeatmaps = (s: GameState) => s.research.done.some((id) => RESEARCH[id]?.heatmaps);
export const hasBreakdowns = (s: GameState) => s.research.done.some((id) => RESEARCH[id]?.breakdowns);

const commands: CommandTable<"setFunding" | "setProject"> = {
  setFunding: {
    validate: (_g, c) => (FUNDING.includes(c.amount) ? null : "Unknown level"),
    apply(g, c) { g.state.research.funding = c.amount; },
  },
  setProject: {
    validate: (g, c) => (c.id === "" ? null : !RESEARCH[c.id] ? "Unknown project" : !available(g.state, c.id) ? "Not available yet" : null),
    apply(g, c) { g.state.research.project = c.id; },
  },
};

export const researchSystem: System = {
  id: "research",
  deps: ["news"],
  commands,
  beat(g) {
    const s = g.state, r = s.research;
    if (!r.funding) return;
    // Funding accrues like wages; each dollar is a point into the project.
    const d = dateOfDay(Math.floor((s.tick - 1) / TICKS_PER_DAY));
    const spend = r.funding * (TICKS_PER_BEAT / (daysInMonth(d.month) * TICKS_PER_DAY));
    post(g, "research", -spend);
    const p = r.project, def = RESEARCH[p];
    if (!def) return;
    r.points[p] = (r.points[p] ?? 0) + spend;
    if (r.points[p] + 1e-6 < def.cost) return;
    r.done.push(p);
    delete r.points[p];
    r.project = "";
    news(g, "good", `Research done: ${def.name}. ${def.desc} Pick the next project in the Research tab.`);
  },
};
