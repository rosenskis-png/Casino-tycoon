// Staff depth (FOUNDATIONS §9, docs/spec/staff.md): pay per role, hidden knack and honesty, skill, morale and
// quitting, theft by crooked staff (and crooked bartenders and tellers), catching them in the act, the monthly
// count that shows what went missing, and patrol zones.
import { PAY_MAX, PAY_MIN, SHRINK_AREAS, SKILL_WORDS, STAFF, STAFF_ROLES, UNIFORMS, UNIFORM_COLORS, ZONED_ROLES, type ShrinkArea } from "../data/staff";
import { OBJECTS } from "../data/objects";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Agent, Crew, GameState, PlacedObject, StaffData } from "./state";
import { rng } from "./rng";
import { range } from "./dist";
import { canSee } from "./wayfinding";
import { post } from "./finance";
import { ORG } from "../data/psych";
import { fmtMoney, news } from "./news";
import { coverage } from "./cheats";
import { hireStaff } from "./staff";

declare module "./commands" {
  interface CommandTypes {
    /** Pay for a role, as a multiple of the market wage. */
    setPay: { role: string; pay: number };
    /** Keep a worker to the room holding `tile` (-1: anywhere). */
    setZone: { id: number; tile: number };
    /** (M11) A job's uniform color (index into UNIFORM_COLORS). */
    setUniform: { role: string; color: number };
  }
}

export const newCrew = (): Crew => ({ pay: {}, shrink: {}, hist: [], uniform: {} });

export const payOf = (g: Game, role: string) => (STAFF_ROLES[role]?.builtIn ? 1 : g.state.crew.pay[role] ?? 1);

/** (M11) The uniform color a job wears (an index into UNIFORM_COLORS). */
export const uniformOf = (s: GameState, role: string) => s.crew.uniform?.[role] ?? UNIFORMS[role]?.color ?? 0;
/** Every job's uniform as hex colors (the renderer's atlas input). */
export const uniformHexes = (s: GameState): Record<string, string> =>
  Object.fromEntries(Object.keys(UNIFORMS).map((r) => [r, UNIFORM_COLORS[uniformOf(s, r)]?.hex ?? UNIFORM_COLORS[0].hex]));
/** Monthly wage for one worker in this role at the current pay. */
export const wageFor = (g: Game, role: string) => (STAFF_ROLES[role]?.wage ?? 0) * payOf(g, role);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** How good this worker is at the job now (1 = a typical hire on market pay; visitors and guests are 1). */
export function skillOf(g: Game, a: Agent): number {
  const st = a.st;
  if (!st) return 1;
  return clamp(st.q * Math.pow(payOf(g, a.role), STAFF.payPow) * (1 + (0.4 * (st.morale - 75)) / 100), STAFF.skill[0], STAFF.skill[1]);
}
export const skillWord = (v: number) => SKILL_WORDS.find(([at]) => v < at)![1];

/** Honest guards, pit bosses and operators do their job; crooks look away. */
export const honest = (a: Agent) => !a.st?.crook;

const crookShare = (pay: number) => STAFF.crook / Math.pow(pay, STAFF.crookPow);

/** Walking pace by role (ticks per tile), before skill. */
const BASE_STEPS: Record<string, number> = { server: 6.5, guard: 6.5 };
export function setPace(g: Game, a: Agent) {
  a.steps = Math.max(4, Math.round((BASE_STEPS[a.role] ?? 10) / Math.sqrt(skillOf(g, a))));
}

/** A new hire's hidden knack and honesty, drawn on the `crew` stream. Morale starts at what the job pays for. */
export function newStaffData(g: Game, role: string): StaffData {
  const r = rng(g.state, "crew");
  const st: StaffData = { q: range(r, STAFF.knack), crook: r.chance(crookShare(payOf(g, role))) ? 1 : 0, morale: 50, busy: 0, beats: 0, zone: -1 };
  st.morale = clamp(STAFF.morale.base + STAFF.morale.perPay * (payOf(g, role) - 1), 0, 100);
  return st;
}

/** A bar or cage gets its crew when built: crooked 5% of the time. */
export function crewAmenity(g: Game, o: PlacedObject) {
  const serves = OBJECTS[o.kind]?.serves;
  if (serves !== "thirst" && serves !== "cage") return;
  o.crook = rng(g.state, "crew").chance(STAFF.amenityCrook) ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------------------
// Patrol zones.

/** Whether a tile is inside this worker's zone (anywhere when they have none). */
export function inZone(g: Game, a: Agent, tile: number): boolean {
  const z = a.st?.zone ?? -1;
  if (z < 0) return true;
  const rz = g.rooms.roomOf[z];
  return rz < 0 || g.rooms.roomOf[tile] === rz;
}

// ---------------------------------------------------------------------------------------------------------
// Theft and catching it.

/** Crooks steal more when they're unhappy: the chance of taking an opportunity, scaled. */
export function greed(g: Game, a: Agent | null, p: number): number {
  const m = a?.st?.morale ?? 75;
  return p * (1.75 - m / 100) * orgFactor(g);
}

/**
 * (M11.1) Staff theft is a big organization's problem (owner): at a small family-run place everyone knows
 * everyone. Scales from 0 at ORG.small staff (bar and cage crews count one each) to 1 at ORG.big.
 */
export function orgFactor(g: Game): number {
  let n = 0;
  for (const a of g.state.agents) if (a.st) n++;
  for (const o of g.state.objects) if (o.crook !== undefined) n++;
  return Math.max(0, Math.min(1, (n - ORG.small) / (ORG.big - ORG.small)));
}

/** Who sees a theft at `tile`: honest guards in view, honest pit bosses (at a table), and watched cameras. */
function catchChance(g: Game, tile: number, atTable: boolean, thief: Agent | null): { p: number; by: string } {
  const s = g.state, w = s.map.w, x = tile % w, y = Math.floor(tile / w);
  let p = STAFF.catchBase, best = 0, by = "The count";
  for (const q of s.agents) {
    if (q === thief || !q.st || q.st.crook) continue;
    const k = q.role === "guard" ? STAFF.catchGuard : q.role === "pitboss" && atTable ? STAFF.catchPit : 0;
    if (!k || Math.abs(q.x - x) + Math.abs(q.y - y) > STAFF.sight || !canSee(g, tile, q.y * w + q.x)) continue;
    const v = k * skillOf(g, q);
    p += v;
    if (v > best) { best = v; by = `Your ${STAFF_ROLES[q.role].name.toLowerCase()}`; }
  }
  const cam = STAFF.catchCamera * g.fields.get("SRVH", tile) * coverage(g, true).share;
  if (cam > best) by = "Your cameras";
  return { p: p + cam, by };
}

/**
 * A crook takes `amount` from `area` at `tile`: `thief` is a worker (fired if caught), or `crew` a bar or cage
 * (its bartender or teller, replaced if caught). Uncaught, it turns up at the monthly count.
 */
export function steal(g: Game, area: ShrinkArea, amount: number, tile: number, what: string, thief: Agent | null, crew?: PlacedObject, atTable = false) {
  if (amount <= 0) return;
  const s = g.state;
  const { p, by } = catchChance(g, tile, atTable, thief);
  if (rng(s, "crew").chance(Math.min(1, p))) {
    const who = thief ? `${STAFF_ROLES[thief.role].name} #${thief.id}` : crew && OBJECTS[crew.kind].serves === "cage" ? "a cage teller" : "a bartender";
    news(g, "warn", `${by} caught ${who} ${what} (${fmtMoney(amount)}). ${thief ? "Fired; a replacement is on the way." : "Replaced."}`, thief ? { a: thief.id } : { t: tile });
    if (thief) replace(g, thief);
    else if (crew) crew.crook = rng(s, "crew").chance(STAFF.amenityCrook) ? 1 : 0;
    return;
  }
  s.crew.shrink[area] = (s.crew.shrink[area] ?? 0) + amount;
}

/** A thief is fired and someone new is hired in their place (same job, room and bar), so nothing sits unstaffed. */
function replace(g: Game, a: Agent) {
  removeStaff(g, a);
  const b = hireStaff(g, a.role);
  if (!b) return;
  if (b.st && a.st) b.st.zone = a.st.zone;
  if (a.bar !== undefined) b.bar = a.bar;
}

/** Take a worker off the payroll at once. */
export function removeStaff(g: Game, a: Agent) {
  g.state.agents = g.state.agents.filter((b) => b !== a);
}

// ---------------------------------------------------------------------------------------------------------
// Workload and morale.

/** Whether a worker is doing their job this beat (not idle, waiting or patrolling). */
function working(a: Agent, camShare: number): boolean {
  switch (a.role) {
    case "janitor": return a.act === "clean" || a.target >= 0;
    case "tech": return a.act === "repair" || a.target >= 0;
    case "server": return !!a.tray?.length || a.act === "offer" || a.act === "fetch" || a.act === "serve";
    case "guard": return a.act === "respond" || a.act === "enforce" || a.act === "carry" || a.target >= 0;
    case "entertainer": return a.act === "perform";
    case "operator": return a.act === "watch" && camShare < 1;
    // Dealing is the whole job: a busy table doesn't wear a dealer down.
    default: return false;
  }
}

function moraleTarget(g: Game, a: Agent, fights: number, guards: number): number {
  const m = STAFF.morale, st = a.st!;
  const share = st.beats ? st.busy / st.beats : 0;
  const over = Math.min(m.overworkMax, Math.max(0, share - m.overworkAt) * 100);
  const trouble = a.role === "guard" && guards ? Math.min(m.fightMax, (fights * m.fight) / guards) : 0;
  return clamp(m.base + m.perPay * (payOf(g, a.role) - 1) - over - trouble, 0, 100);
}

function moraleDay(g: Game) {
  const s = g.state, r = rng(s, "crew"), m = STAFF.morale;
  // The day that just ended (the incident system has already started a new one).
  const fights = s.incidentDays[1]?.fight ?? 0;
  const guards = s.agents.filter((a) => a.role === "guard").length;
  const quit: Agent[] = [];
  for (const a of s.agents) {
    const st = a.st;
    if (!st) continue;
    st.morale = clamp(st.morale + (moraleTarget(g, a, fights, guards) - st.morale) * m.drift, 0, 100);
    st.busy = 0;
    st.beats = 0;
    if (st.morale < m.quitBelow && r.chance(m.quitChance)) quit.push(a);
    setPace(g, a);
  }
  for (const a of quit) {
    news(g, "warn", `${STAFF_ROLES[a.role].name} #${a.id} quit: ${payOf(g, a.role) < 1 ? "the pay is too low" : "too much work"}.`, { tab: "staff" });
    removeStaff(g, a);
  }
}

/** Firing someone honest frightens everyone else. */
export function firedWorker(g: Game, a: Agent) {
  if (!a.st || a.st.crook) return;
  for (const b of g.state.agents) if (b.st && b !== a) b.st.morale = Math.max(0, b.st.morale - STAFF.morale.firedHonest);
}

/** Average morale of a role (the Staff tab), or -1 with nobody in it. */
export function roleMorale(g: Game, role: string): number {
  let n = 0, sum = 0;
  for (const a of g.state.agents) if (a.role === role && a.st) { n++; sum += a.st.morale; }
  return n ? sum / n : -1;
}

// ---------------------------------------------------------------------------------------------------------

export const SHRINK_LABEL: Record<ShrinkArea, string> = { bar: "bar", cage: "cage", tables: "tables", machines: "machines" };
export const shrinkKey = (a: ShrinkArea) => `shrink_${a}`;

const commands: CommandTable<"setPay" | "setZone" | "setUniform"> = {
  setUniform: {
    validate: (_g, c) => (!UNIFORMS[c.role] ? "No uniform" : !(Number.isInteger(c.color) && c.color >= 0 && c.color < UNIFORM_COLORS.length) ? "Unknown color" : null),
    apply(g, c) { g.state.crew.uniform[c.role] = c.color; },
  },
  setPay: {
    validate: (_g, c) => (!STAFF_ROLES[c.role] ? "Unknown job" : STAFF_ROLES[c.role].builtIn ? "No wages to set" : !(c.pay >= PAY_MIN - 1e-9 && c.pay <= PAY_MAX + 1e-9) ? "Out of range" : null),
    apply(g, c) {
      g.state.crew.pay[c.role] = Math.round(c.pay * 10) / 10;
      for (const a of g.state.agents) if (a.role === c.role) setPace(g, a);
    },
  },
  setZone: {
    validate(g, c) {
      const a = g.state.agents.find((b) => b.id === c.id);
      if (!a?.st || !ZONED_ROLES.includes(a.role)) return "Can't be zoned";
      if (c.tile >= 0 && (c.tile >= g.state.map.terrain.length || g.rooms.roomOf[c.tile] < 0)) return "Not a room";
      return null;
    },
    apply(g, c) {
      const a = g.state.agents.find((b) => b.id === c.id)!;
      a.st!.zone = c.tile;
      a.target = -1;
      if (a.act === "idle" || a.act === "wait") a.timer = 0;
    },
  },
};

export const crewSystem: System = {
  id: "crew",
  deps: ["staff", "incidents", "tables", "cheats"],
  commands,
  beat(g) {
    let share = -1;
    for (const a of g.state.agents) {
      const st = a.st;
      if (!st) continue;
      if (a.role === "operator" && share < 0) share = coverage(g).share;
      st.beats++;
      if (working(a, share)) st.busy++;
    }
  },
  day(g) { moraleDay(g); },
  closeMonth(g) {
    // The monthly count: what went missing shows up in the books, by area.
    const c = g.state.crew;
    let total = 0;
    const parts: string[] = [];
    for (const area of SHRINK_AREAS) {
      const v = Math.round((c.shrink[area] ?? 0) * 100) / 100;
      if (v <= 0) continue;
      post(g, shrinkKey(area), -v);
      total += v;
      parts.push(`${SHRINK_LABEL[area]} ${fmtMoney(v)}`);
    }
    c.shrink = {};
    c.hist.push(total);
    if (c.hist.length > 3) c.hist.shift();
    if (total > 0) news(g, "warn", `Monthly count: ${fmtMoney(total)} missing (${parts.join(", ")}).`, { tab: "finance" });
  },
};

