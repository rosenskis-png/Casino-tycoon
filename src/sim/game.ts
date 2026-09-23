// The simulation: saved state + rebuilt runtime caches + registered systems on a fixed-timestep clock.
import { SCENARIOS } from "../data/scenarios";
import { GUEST_TYPES } from "../data/guests";
import { DOOR_STATE, T } from "../data/terrain";
import { OBJECTS } from "../data/objects";
import { SLOT_MODELS, WAGERS_PER_ROUND } from "../data/games";
import { TICKS_PER_BEAT, TICKS_PER_DAY, dateOfDay } from "./clock";
import { EventBus } from "./events";
import { SCHEMA_VERSION, type GameState, type PlacedObject } from "./state";
import { buildScenarioMap } from "./map";
import { orderSystems, type System } from "./registry";
import { RoomIndex } from "./rooms";
import { PathCache } from "./paths";
import { FieldEngine } from "./fields";
import { collectCommands, type Command } from "./commands";
import { footprint, seats } from "./geometry";
import { movementSystem } from "./agents";
import { newsSystem, news } from "./news";
import { buildSystem, newObject } from "./build";
import { financeSystem } from "./finance";
import { gamingSystem } from "./gaming";
import { guestSystem } from "./guests";
import { staffSystem, hireStaff } from "./staff";
import { goalSystem } from "./goals";
import { drinkSystem } from "./drinks";
import { poolSystem, seedPool } from "./pool";
import { streetSystem } from "./street";

/** Every system, in any order; the registry sorts by dependencies. */
const SYSTEMS: System[] = [
  movementSystem, newsSystem, buildSystem, financeSystem, gamingSystem, guestSystem, drinkSystem, poolSystem, streetSystem, staffSystem, goalSystem,
];

export interface CommandRecord { tick: number; cmd: Command; error: string | null }

export class Game {
  readonly bus = new EventBus();
  readonly systems = orderSystems(SYSTEMS);
  private readonly handlers = collectCommands(this.systems);
  // Runtime caches, rebuilt from state on construction; never saved.
  /** Blocking object id per tile. */
  occ = new Int32Array(0);
  /** Any object id per tile (footprint). */
  objAt = new Int32Array(0);
  /** Object id whose seat is on this tile. */
  seatAt = new Int32Array(0);
  objById = new Map<number, PlacedObject>();
  /** Slot machines by 16×16 sector (key sy * 4096 + sx), for nearby searches. */
  slotSectors = new Map<number, PlacedObject[]>();
  /** Amenities by what they serve. Cages also serve withdrawals ("atm"). */
  amenities: Record<"thirst" | "bladder" | "cage" | "atm", PlacedObject[]> = { thirst: [], bladder: [], cage: [], atm: [] };
  /** Objects that block sight, per tile (walls and closed doors are checked from terrain). */
  opaque = new Uint8Array(0);
  /** Wayfinding signs. */
  signs: PlacedObject[] = [];
  /** Seat tile indices per object. */
  seatTiles = new Map<number, number[]>();
  /** Cheapest one-credit round on any placed slot model (Infinity when there are none). */
  minRound = Infinity;
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
    const n = map.w * map.h;
    const rep: Record<string, number> = {};
    for (const t of Object.keys(def.population)) if (GUEST_TYPES[t]) rep[t] = def.rep[t] ?? 50;
    const state: GameState = {
      schema: SCHEMA_VERSION, scenario: def.id, seed: seed >>> 0, tick: 0, rng: {}, nextId: 1,
      cash: def.startCash, map, objects: [], agents: [], wanderPoints: [],
      traffic: new Array(n).fill(0), dirt: new Array(n).fill(0), roomMeta: [], log: [], rep,
      pool: [], peds: [],
      finance: { month: { start: def.startCash }, history: [], total: { start: def.startCash } },
      thoughts: [{}],
      visits: { today: { arrived: 0, left: 0, satSum: 0, broke: 0, walkedPast: 0 }, yday: { arrived: 0, left: 0, satSum: 0, broke: 0, walkedPast: 0 } },
      outcome: "",
    };
    for (const o of def.objects) state.objects.push(newObject(state.nextId++, o.kind, o.x, o.y, o.rot));
    seedPool(state, def);
    const g = new Game(state);
    for (const [role, k] of Object.entries(def.staff)) for (let i = 0; i < k; i++) hireStaff(g, role);
    news(g, "info", `Welcome to ${def.name}.`);
    return g;
  }

  walkable = (i: number): boolean => {
    const t = this.state.map.terrain[i];
    return (t === T.FLOOR && !this.occ[i]) || (t === T.DOOR && this.state.map.door[i] === DOOR_STATE.OPEN);
  };

  /** Whether any placed object serves this need. */
  has(serves: "thirst" | "bladder" | "cage" | "atm"): boolean {
    return this.amenities[serves].length > 0;
  }

  rebuildOccupancy() {
    const { w, h } = this.state.map;
    const occ = new Int32Array(w * h), objAt = new Int32Array(w * h), seatAt = new Int32Array(w * h), opaque = new Uint8Array(w * h);
    this.signs = [];
    this.objById.clear();
    this.slotSectors.clear();
    this.seatTiles.clear();
    this.amenities = { thirst: [], bladder: [], cage: [], atm: [] };
    this.minRound = Infinity;
    for (const o of this.state.objects) {
      const def = OBJECTS[o.kind];
      this.objById.set(o.id, o);
      if (def.serves) this.amenities[def.serves].push(o);
      if (def.serves === "cage") this.amenities.atm.push(o);
      if (def.guide) this.signs.push(o);
      if (def.slot) {
        const key = (o.y >> 4) * 4096 + (o.x >> 4);
        let list = this.slotSectors.get(key);
        if (!list) this.slotSectors.set(key, (list = []));
        list.push(o);
        const m = SLOT_MODELS[def.slot];
        this.minRound = Math.min(this.minRound, m.denom * WAGERS_PER_ROUND);
      }
      for (const p of footprint(def, o.x, o.y, o.rot)) {
        objAt[p.y * w + p.x] = o.id;
        if (def.blocks) occ[p.y * w + p.x] = o.id;
        if (def.opaque) opaque[p.y * w + p.x] = 1;
      }
      const st: number[] = [];
      for (const s of seats(def, o.x, o.y, o.rot)) {
        st.push(s.y * w + s.x);
        if (s.x >= 0 && s.y >= 0 && s.x < w && s.y < h) seatAt[s.y * w + s.x] = o.id;
      }
      if (st.length) this.seatTiles.set(o.id, st);
    }
    this.occ = occ;
    this.objAt = objAt;
    this.seatAt = seatAt;
    this.opaque = opaque;
  }

  /** Called by commands after changing terrain or occupancy: refreshes engine caches, then tells systems. */
  tilesChanged(tiles: number[]) {
    this.rooms.detect(this.state);
    this.rooms.reconcile(this.state);
    this.paths.invalidate(tiles);
    this.fields.tilesChanged(tiles);
    for (const s of this.systems) s.layout?.(this, tiles);
    this.bus.emit({ type: "tilesChanged", tiles });
    this.bus.emit({ type: "roomsChanged" });
  }

  private validate(cmd: Command): string | null {
    const h = this.handlers.get(cmd.type);
    return h ? h.validate(this, cmd) : "Unknown command";
  }

  /** Validation only, for previews (build ghosts). Never changes state. */
  check(cmd: Command): string | null { return this.validate(cmd); }

  /** Validates now (so the UI can explain a refusal) and queues for the next tick. */
  dispatch(cmd: Command): string | null {
    const error = this.validate(cmd);
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
      const error = this.validate(cmd); // state may have moved since dispatch
      if (!error) this.handlers.get(cmd.type)!.apply(this, cmd);
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
