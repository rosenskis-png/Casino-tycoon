// The simulation: saved state + rebuilt runtime caches + registered systems on a fixed-timestep clock.
import { SCENARIOS } from "../data/scenarios";
import { DOOR_STATE, T } from "../data/terrain";
import { OBJECTS } from "../data/objects";
import { TICKS_PER_BEAT, TICKS_PER_DAY, dateOfDay } from "./clock";
import { EventBus } from "./events";
import { SCHEMA_VERSION, type GameState } from "./state";
import { buildScenarioMap } from "./map";
import { orderSystems, type System } from "./registry";
import { RoomIndex } from "./rooms";
import { PathCache } from "./paths";
import { FieldEngine } from "./fields";
import { applyCommand, validateCommand, type Command } from "./commands";
import { agentSystem, ensureWanderPoints, repairAgents } from "./agents";
import { newsSystem, news } from "./news";

/** Every system, in any order; the registry sorts by dependencies. */
const SYSTEMS: System[] = [agentSystem, newsSystem];

export interface CommandRecord { tick: number; cmd: Command; error: string | null }

export class Game {
  readonly bus = new EventBus();
  readonly systems = orderSystems(SYSTEMS);
  // Runtime caches, rebuilt from state on construction; never saved.
  occ = new Int32Array(0);
  readonly rooms = new RoomIndex();
  readonly paths = new PathCache(this);
  readonly fields = new FieldEngine(this);
  readonly commandLog: CommandRecord[] = [];
  private queue: Command[] = [];

  constructor(public state: GameState) {
    this.rebuildOccupancy();
    this.rooms.detect(state);
    this.fields.init();
    for (const s of this.systems) s.init?.(this);
  }

  static create(scenarioId: string, seed: number): Game {
    const def = SCENARIOS[scenarioId];
    const map = buildScenarioMap(def);
    const g = new Game({
      schema: SCHEMA_VERSION, scenario: def.id, seed: seed >>> 0, tick: 0, rng: {}, nextId: 1,
      cash: def.startCash, map, objects: [], agents: [], wanderPoints: [],
      traffic: new Array(map.w * map.h).fill(0), roomMeta: [], log: [],
    });
    news(g, "info", `Welcome to ${def.name}.`);
    return g;
  }

  walkable = (i: number): boolean => {
    const t = this.state.map.terrain[i];
    return (t === T.FLOOR && !this.occ[i]) || (t === T.DOOR && this.state.map.door[i] === DOOR_STATE.OPEN);
  };

  rebuildOccupancy() {
    const { w, h } = this.state.map;
    const occ = new Int32Array(w * h);
    for (const o of this.state.objects) {
      const def = OBJECTS[o.kind];
      if (!def.blocks) continue;
      for (let dy = 0; dy < def.h; dy++) for (let dx = 0; dx < def.w; dx++) occ[(o.y + dy) * w + o.x + dx] = o.id;
    }
    this.occ = occ;
  }

  /** Called by commands after changing terrain or occupancy; refreshes only what the change affects. */
  tilesChanged(tiles: number[]) {
    this.rooms.detect(this.state);
    this.rooms.reconcile(this.state);
    this.paths.invalidate(tiles);
    this.fields.tilesChanged(tiles);
    ensureWanderPoints(this);
    repairAgents(this);
    this.bus.emit({ type: "tilesChanged", tiles });
    this.bus.emit({ type: "roomsChanged" });
  }

  /** Validation only, for previews (build ghosts). Never changes state. */
  check(cmd: Command): string | null { return validateCommand(this, cmd); }

  /** Validates now (so the UI can explain a refusal) and queues for the next tick. */
  dispatch(cmd: Command): string | null {
    const error = validateCommand(this, cmd);
    if (error) {
      this.record(cmd, error);
      this.bus.emit({ type: "commandRejected", command: cmd.type, reason: error });
      this.bus.emit({ type: "sound", id: "deny" });
    } else this.queue.push(cmd);
    return error;
  }

  private record(cmd: Command, error: string | null) {
    this.commandLog.push({ tick: this.state.tick, cmd, error });
    if (this.commandLog.length > 200) this.commandLog.shift();
  }

  /** One fixed simulation step. */
  step() {
    const q = this.queue;
    this.queue = [];
    for (const cmd of q) {
      const error = validateCommand(this, cmd); // state may have moved since dispatch
      if (!error) applyCommand(this, cmd);
      this.record(cmd, error);
    }
    const s = this.state;
    for (const sys of this.systems) sys.tick?.(this);
    s.tick++;
    if (s.tick % TICKS_PER_BEAT === 0) for (const sys of this.systems) sys.beat?.(this);
    if (s.tick % TICKS_PER_DAY === 0) {
      const day = s.tick / TICKS_PER_DAY;
      for (const sys of this.systems) sys.day?.(this);
      this.bus.emit({ type: "day", day });
      const date = dateOfDay(day);
      if (date.day === 1) {
        for (const sys of this.systems) sys.month?.(this);
        this.bus.emit({ type: "month", month: date.month, year: date.year });
        if (date.month === 0) for (const sys of this.systems) sys.year?.(this);
      }
    }
  }

  get day() { return Math.floor(this.state.tick / TICKS_PER_DAY); }
}
