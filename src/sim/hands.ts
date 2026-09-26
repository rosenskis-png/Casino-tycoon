// Hands on the floor (Batch C, owner; docs/spec/staff.md): pick up a guest or a worker and set them down anywhere
// a person can stand, RollerCoaster Tycoon style. They drop whatever they were doing and carry on from there; a
// guest set down behind doors they can't use finds their own way out (sim/guests.ts, strayed).
import type { Game } from "./game";
import type { CommandTable } from "./commands";
import type { System } from "./registry";
import type { Agent } from "./state";
import { release, think } from "./guests";
import { incidentOf } from "./incidents";

declare module "./commands" {
  interface CommandTypes {
    /** Pick someone up and set them down on a tile. */
    placeAgent: { id: number; tile: number };
  }
}

/** Visitors from outside answer to their own bosses. */
const VISITORS = new Set(["officer", "medic", "inspector", "escort"]);

/** Why this person can't be picked up right now, or null if they can. */
export function cantLift(g: Game, a: Agent): string | null {
  if (VISITORS.has(a.role)) return "Not yours to move";
  if (a.act === "out" || a.act === "fight" || incidentOf(g, a.id)) return "Caught up in an incident";
  if (a.g?.held || a.act === "held") return "Held by security";
  if (g.state.enf.jobs.some((j) => j.staff === a.id || j.guest === a.id)) return "Busy with security work";
  return null;
}

const commands: CommandTable<"placeAgent"> = {
  placeAgent: {
    validate(g, c) {
      const a = g.state.agents.find((b) => b.id === c.id);
      if (!a) return "Nobody there";
      const why = cantLift(g, a);
      if (why) return why;
      if (!(Number.isInteger(c.tile) && c.tile >= 0 && c.tile < g.state.map.terrain.length) || !g.walkable(c.tile)) return "Nobody can stand there";
      return null;
    },
    apply(g, c) {
      const a = g.state.agents.find((b) => b.id === c.id)!, w = g.state.map.w;
      const x = c.tile % w, y = (c.tile - x) / w;
      if (a.g) {
        release(g, a);
        a.g.seek = "";
        a.g.lost = 0;
        a.g.annoy = Math.min(30, a.g.annoy + 2);
        think(g, a, "lifted");
      } else {
        // A worker drops the job in hand: the tray's orders, a hand pay on the way (someone else is sent).
        a.target = -1;
        a.seat = -1;
        a.tray = undefined;
        a.due = undefined;
        a.hp = undefined;
      }
      Object.assign(a, { x, y, nx: x, ny: y, t: 0, dest: c.tile, act: "idle", next: "idle", timer: 0, hidden: 0 });
      g.bus.emit({ type: "sound", id: "place" });
    },
  },
};

export const handsSystem: System = { id: "hands", deps: ["guests", "staff"], commands };
