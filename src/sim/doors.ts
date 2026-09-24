// Door rules (docs/spec/construction.md): open, staff only, locked, card holders, a dress code (one guest type),
// one staff role, and a fee for guests walking through. Every rule is real routing: each set of restricted doors
// a person may pass has its own path cache (Game.pathsFor), so people who can't pass a door route around it.
import { DOOR_RULES, DOOR_STATE, MAX_DOOR_FEE, T } from "../data/terrain";
import { GUEST_TYPES } from "../data/guests";
import { STAFF_ROLES } from "../data/staff";
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Agent, GameState, Gate } from "./state";
import { post } from "./finance";
import { think } from "./guests";
import { rng } from "./rng";

declare module "./commands" {
  interface CommandTypes {
    /** A door's rule, what it admits (a guest type or a staff role) and a fee for guests. */
    setDoor: { tile: number; rule: number; arg?: string; fee?: number };
  }
}

/** A restricted door as the router sees it. */
interface GateInfo { i: number; rule: number; arg: string; fee: number }
const infos = new WeakMap<Game, GateInfo[]>();

/** Restricted doors: anything but a plain open door (locked doors aren't walkable at all, so they aren't gates). */
export function gateList(s: GameState): number[] {
  const m = s.map, out: number[] = [];
  const fee = new Map(m.gates.map((q) => [q.i, q.fee]));
  for (let i = 0; i < m.terrain.length; i++) {
    if (m.terrain[i] !== T.DOOR || m.door[i] === DOOR_STATE.LOCKED) continue;
    if (m.door[i] !== DOOR_STATE.OPEN || (fee.get(i) ?? 0) > 0) out.push(i);
  }
  return out;
}

function gateInfos(g: Game): GateInfo[] {
  let L = infos.get(g);
  if (!L || L.length !== g.gates.length || L.some((q, k) => q.i !== g.gates[k])) {
    const m = g.state.map, cfg = new Map(m.gates.map((q) => [q.i, q]));
    L = g.gates.map((i) => ({ i, rule: m.door[i], arg: cfg.get(i)?.arg ?? "", fee: cfg.get(i)?.fee ?? 0 }));
    infos.set(g, L);
  }
  return L;
}

export const gateOf = (s: GameState, i: number): Gate | undefined => s.map.gates.find((q) => q.i === i);

/** Staff, police and paramedics, guests held by security, and guests staff let out: past staff-only doors, free. */
const escorted = (a: Agent) => !a.g || a.g.held > 0 || a.g.esc > 0;

function passes(a: Agent, q: GateInfo, w: number): boolean {
  const gd = a.g;
  if (q.rule === DOOR_STATE.ROLE) return a.role === q.arg || (!!gd && gd.held > 0);
  if (escorted(a)) return q.rule !== DOOR_STATE.LOCKED;
  // Whoever is in the doorway (they paid on the way in) may step off it, whatever their wallet says now.
  if (a.y * w + a.x === q.i || a.ny * w + a.nx === q.i) return true;
  if (gd!.wallet + 1e-9 < q.fee) return false;
  if (q.rule === DOOR_STATE.OPEN) return true;
  if (q.rule === DOOR_STATE.CARD) return gd!.card > 0;
  if (q.rule === DOOR_STATE.DRESS) return gd!.type === q.arg;
  return false;
}

/** 0/1 per restricted door: which ones this person may pass right now (their path cache key). */
export function accessKey(g: Game, a: Agent): string {
  let k = "";
  const w = g.state.map.w;
  for (const q of gateInfos(g)) k += passes(a, q, w) ? "1" : "0";
  return k;
}

export function canPassGate(g: Game, a: Agent, i: number): boolean {
  if (!g.gates.length) return true;
  const q = gateInfos(g).find((x) => x.i === i);
  return !q || passes(a, q, g.state.map.w);
}

/** Someone just stepped onto tile i: a guest walking through a door with a fee pays it. */
export function stepped(g: Game, a: Agent, i: number) {
  const gd = a.g;
  if (!gd || escorted(a) || g.state.map.terrain[i] !== T.DOOR) return;
  const q = gateInfos(g).find((x) => x.i === i);
  if (!q || q.fee <= 0) return;
  const fee = Math.min(q.fee, gd.wallet);
  gd.wallet -= fee;
  gd.mem.spent += fee;
  post(g, "doors", fee);
  // Paying to walk through a door stings, more so against a small budget.
  gd.annoy = Math.min(30, gd.annoy + Math.min(12, (60 * fee) / Math.max(20, gd.bankroll)));
  if (rng(g.state, "guests").chance(0.5)) think(g, a, "doorFee");
}

const commands: CommandTable<"setDoor"> = {
  setDoor: {
    validate(g, c) {
      const m = g.state.map, i = c.tile;
      if (!(i >= 0 && i < m.terrain.length) || m.terrain[i] !== T.DOOR) return "Not a door";
      if (m.fixed[i] || m.entrances.includes(i)) return "The scenario's doors stay as they are";
      const rule = DOOR_RULES.find((r) => r.id === c.rule);
      if (!rule) return "Unknown rule";
      if (rule.arg === "type" && !GUEST_TYPES[c.arg ?? ""]) return "Pick a guest type";
      if (rule.arg === "role" && !STAFF_ROLES[c.arg ?? ""]) return "Pick a staff role";
      const fee = c.fee ?? 0;
      if (!(fee >= 0 && fee <= MAX_DOOR_FEE)) return "Fee out of range";
      if (fee > 0 && !rule.fee) return "That door can't charge a fee";
      return null;
    },
    apply(g, c) {
      const m = g.state.map, rule = DOOR_RULES.find((r) => r.id === c.rule)!;
      m.door[c.tile] = c.rule;
      m.gates = m.gates.filter((q) => q.i !== c.tile);
      const arg = rule.arg ? c.arg ?? "" : "", fee = Math.round((c.fee ?? 0) * 4) / 4;
      if (arg || fee > 0) m.gates.push({ i: c.tile, arg, fee });
      g.gatesChanged();
      g.tilesChanged([c.tile]);
      g.bus.emit({ type: "sound", id: "build" });
    },
  },
};

/** A door demolished or turned back into wall loses its rule. Call before tilesChanged. */
export function clearDoor(s: GameState, i: number) {
  s.map.door[i] = DOOR_STATE.OPEN;
  if (s.map.gates.length) s.map.gates = s.map.gates.filter((q) => q.i !== i);
}

export const doorSystem: System = { id: "doors", commands };
