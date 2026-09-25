// The simulation: saved state + rebuilt runtime caches + registered systems on a fixed-timestep clock.
import { SCENARIOS } from "../data/scenarios";
import { GUEST_TYPES } from "../data/guests";
import { DOOR_STATE, T } from "../data/terrain";
import { VOMIT } from "../data/incidents";
import { rng } from "./rng";
import { OBJECTS } from "../data/objects";
import { TICKS_PER_BEAT, TICKS_PER_DAY, dateOfDay } from "./clock";
import { EventBus } from "./events";
import { SCHEMA_VERSION, type GameState, type PlacedObject } from "./state";
import { buildScenarioMap } from "./map";
import { orderSystems, type System } from "./registry";
import { RoomIndex } from "./rooms";
import { PathCache } from "./paths";
import { FieldEngine } from "./fields";
import { collectCommands, type Command } from "./commands";
import { objCells, objSeats } from "./geometry";
import { accessKey, canPassGate, doorSystem, gateList } from "./doors";
import type { Agent } from "./state";
import { movementSystem } from "./agents";
import { newsSystem, news } from "./news";
import { buildSystem, newObject } from "./build";
import { financeSystem } from "./finance";
import { gamingSystem, minRoundOf } from "./gaming";
import { tableSystem } from "./tables";
import { guestSystem } from "./guests";
import { staffSystem, hireStaff } from "./staff";
import { goalSystem } from "./goals";
import { drinkSystem } from "./drinks";
import { poolSystem, seedPool } from "./pool";
import { streetSystem } from "./street";
import { incidentSystem, newAuthorities, DEFAULT_RULES } from "./incidents";
import { cheatSystem, newEnforcement } from "./cheats";
import { crewAmenity, crewSystem, newCrew } from "./crew";
import { bankSystem, newBank } from "./bank";
import { newRegulator, regulatorSystem } from "./regulator";
import { newWhale, whaleSystem } from "./whales";
import { calendarSystem, newCalendar } from "./calendar";
import { newResearch, researchSystem } from "./research";
import { viceSystem } from "./vice";
import { yoursSystem } from "./yours";
import { designSystem } from "./design";
import { marketSystem } from "./design/market";

/** Every system, in any order; the registry sorts by dependencies. */
const SYSTEMS: System[] = [
  doorSystem, movementSystem, newsSystem, buildSystem, financeSystem, gamingSystem, tableSystem, guestSystem, drinkSystem, poolSystem, streetSystem, staffSystem, goalSystem, incidentSystem, cheatSystem, crewSystem, bankSystem, regulatorSystem, whaleSystem, calendarSystem, researchSystem, viceSystem, yoursSystem, designSystem, marketSystem,
];

export type Serves = "thirst" | "bladder" | "cage" | "atm" | "hunger" | "show" | "club" | "pool" | "garden" | "golf";
const emptyAmenities = (): Record<Serves, PlacedObject[]> => ({ thirst: [], bladder: [], cage: [], atm: [], hunger: [], show: [], club: [], pool: [], garden: [], golf: [] });

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
  /** Game objects (slots, video poker, tables) by 16×16 sector (key sy * 4096 + sx), for nearby searches. */
  slotSectors = new Map<number, PlacedObject[]>();
  /** Tables and draw games (M7): everything dealt by a dealer. */
  tables: PlacedObject[] = [];
  /** Guest seats at games (machines and tables), for the floor-size factor on arrivals. */
  gameSeats = 0;
  /** Amenities by what they serve. Cages also serve withdrawals ("atm"). */
  amenities: Record<Serves, PlacedObject[]> = emptyAmenities();
  /** Objects that block sight, per tile (walls and closed doors are checked from terrain). */
  opaque = new Uint8Array(0);
  /** Wayfinding signs. */
  signs: PlacedObject[] = [];
  /** Seat tile indices per object. */
  seatTiles = new Map<number, number[]>();
  /** Cheapest round on any placed game (Infinity when there are none). */
  minRound = Infinity;
  /** (M8) The id the last `designSave` stored the design under (the designer reads it back). */
  lastDesign = "";
  /** (M8.5) Slots in a big bonus now, and the tick it ends (onlookers gather): an index of `PlacedObject.bonus`. */
  bonusNow = new Map<number, number>();
  /** (M8.5) Bank signs on the floor. */
  bankSigns: PlacedObject[] = [];
  readonly rooms = new RoomIndex();
  /**
   * Door rules (M6): restricted doors (tiles), and one path cache per set of them a person can pass. With no
   * restricted doors everyone shares the first ("" key).
   */
  gates: number[] = [];
  private caches = new Map<string, PathCache>();
  readonly fields = new FieldEngine(this);
  readonly commandLog: CommandRecord[] = [];
  private queue: Command[] = [];

  constructor(public state: GameState) {
    this.rebuildOccupancy();
    this.rooms.detect(state);
    this.gates = gateList(state);
    this.fields.init();
    for (const s of this.systems) s.init?.(this);
  }

  static create(scenarioId: string, seed: number): Game {
    const def = SCENARIOS[scenarioId];
    const map = buildScenarioMap(def);
    const n = map.w * map.h;
    const rep: Record<string, number> = {};
    for (const t of Object.keys(def.population)) if (GUEST_TYPES[t] && !GUEST_TYPES[t].noRep) rep[t] = def.rep[t] ?? 50;
    const state: GameState = {
      schema: SCHEMA_VERSION, scenario: def.id, seed: seed >>> 0, tick: 0, rng: {}, nextId: 1,
      cash: def.startCash, map, objects: [], agents: [], wanderPoints: [],
      traffic: new Array(n).fill(0), dirt: new Array(n).fill(0), roomMeta: [], log: [], rep,
      pool: [], peds: [],
      finance: { month: { start: def.startCash }, history: [], total: { start: def.startCash } },
      thoughts: [{}],
      incidents: [], incidentDays: [{}], rules: { ...DEFAULT_RULES, ...def.rules }, auth: newAuthorities(), enf: newEnforcement(),
      visits: { today: { arrived: 0, left: 0, satSum: 0, broke: 0, walkedPast: 0 }, yday: { arrived: 0, left: 0, satSum: 0, broke: 0, walkedPast: 0 } },
      outcome: "", parcels: [],
      crew: newCrew(), bank: newBank(), reg: newRegulator(), whale: newWhale(),
      cal: newCalendar(), ads: [], research: newResearch(def), yours: null, designs: {}, nextDesign: 1, dstats: {}, meters: {}, ohist: {}, offer: null, records: {}, survey: {},
    };
    for (const o of def.objects) {
      const obj = newObject(state.nextId++, o.kind, o.x, o.y, o.rot, 0, o.w, o.h);
      if (o.design) obj.design = o.design;
      if (o.bar && obj.bar) Object.assign(obj.bar, o.bar);
      state.objects.push(obj);
    }
    // Named rooms (the Test Floor's office and enforcement room).
    for (const r of def.rooms ?? []) state.roomMeta.push({ anchor: r.y * map.w + r.x, name: r.name, purpose: r.purpose });
    seedPool(state, def);
    const g = new Game(state);
    for (const o of state.objects) crewAmenity(g, o);
    for (const [role, k] of Object.entries(def.staff)) for (let i = 0; i < k; i++) hireStaff(g, role);
    if (def.mess) scatterMess(g, def.mess);
    news(g, "info", `Welcome to ${def.name}.`);
    return g;
  }

  /** Physically walkable: open floor, or any door that isn't locked. Who may pass a door is `pathsFor`'s business. */
  walkable = (i: number): boolean => {
    const t = this.state.map.terrain[i];
    return (t === T.FLOOR && !this.occ[i]) || (t === T.DOOR && this.state.map.door[i] !== DOOR_STATE.LOCKED);
  };

  /** The path cache for a key (a string of 0/1 per restricted door: may this person pass it). */
  pathsKey(key: string): PathCache {
    let c = this.caches.get(key);
    if (!c) {
      const gates = this.gates, pos = new Map(gates.map((t, k) => [t, k]));
      c = new PathCache(this, (i) => {
        if (!this.walkable(i)) return false;
        const k = pos.get(i);
        return k === undefined || key.charCodeAt(k) === 49;
      });
      this.caches.set(key, c);
      for (const pc of this.caches.values()) pc.share = this.caches.size;
    }
    return c;
  }

  /** The path cache for this person: doors they can't pass (a rule, a fee they can't pay) are walls to them. */
  pathsFor(a: Agent): PathCache {
    return this.pathsKey(this.gates.length ? accessKey(this, a) : "");
  }

  /** Routes that pass no restricted door (street-side checks with nobody in particular walking). */
  get publicPaths(): PathCache {
    return this.pathsKey("0".repeat(this.gates.length));
  }

  /** Whether this person may step onto tile i (restricted doors checked). */
  canWalk(a: Agent, i: number): boolean {
    return this.walkable(i) && canPassGate(this, a, i);
  }

  /** Door rules changed: rebuild the gate list and drop every path cache. */
  gatesChanged() {
    this.gates = gateList(this.state);
    this.caches.clear();
  }

  /** Whether any placed object serves this need. */
  has(serves: Serves): boolean {
    return this.amenities[serves].length > 0;
  }

  rebuildOccupancy() {
    const { w, h } = this.state.map;
    const occ = new Int32Array(w * h), objAt = new Int32Array(w * h), seatAt = new Int32Array(w * h), opaque = new Uint8Array(w * h);
    this.signs = [];
    this.bankSigns = [];
    this.objById.clear();
    this.bonusNow.clear();
    this.slotSectors.clear();
    this.seatTiles.clear();
    this.amenities = emptyAmenities();
    this.minRound = Infinity;
    this.tables = [];
    this.gameSeats = 0;
    for (const o of this.state.objects) {
      const def = OBJECTS[o.kind];
      this.objById.set(o.id, o);
      if (def.serves) this.amenities[def.serves].push(o);
      if (def.serves === "cage") this.amenities.atm.push(o);
      if (def.guide) this.signs.push(o);
      if (o.kind === "bank_sign") this.bankSigns.push(o);
      if (o.bonus !== undefined) this.bonusNow.set(o.id, o.bonus);
      if (def.slot || def.game) {
        const key = (o.y >> 4) * 4096 + (o.x >> 4);
        let list = this.slotSectors.get(key);
        if (!list) this.slotSectors.set(key, (list = []));
        list.push(o);
        this.minRound = Math.min(this.minRound, minRoundOf(this.state, o));
        if (def.cat === "table") this.tables.push(o);
        for (const st of objSeats(o)) if (st.kind !== "dealer") this.gameSeats++;
      }
      for (const p of objCells(o)) {
        if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) continue;
        objAt[p.y * w + p.x] = o.id;
        if (p.c.block) occ[p.y * w + p.x] = o.id;
        if (p.c.opaque) opaque[p.y * w + p.x] = 1;
      }
      const st: number[] = [];
      for (const s of objSeats(o)) {
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
    // A door demolished (or built) can change the gate list itself: then every cache goes; else only what's touched.
    const gates = gateList(this.state);
    if (gates.join() !== this.gates.join()) this.gatesChanged();
    for (const c of this.caches.values()) c.invalidate(tiles);
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

  /** Applies queued commands now, without advancing time (menus that act while the game is paused, M8). */
  flushCommands() {
    const q = this.queue;
    this.queue = [];
    for (const cmd of q) {
      const error = this.validate(cmd); // state may have moved since dispatch
      if (!error) this.handlers.get(cmd.type)!.apply(this, cmd);
      this.record(cmd, error);
    }
  }

  /** One fixed simulation step. */
  step() {
    this.flushCommands();
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
        for (const sys of this.systems) sys.closeMonth?.(this);
        for (const sys of this.systems) sys.month?.(this);
        this.bus.emit({ type: "month", month: date.month, year: date.year });
        if (date.month === 0) for (const sys of this.systems) sys.year?.(this);
      }
    }
  }

  get day() { return Math.floor(this.state.tick / TICKS_PER_DAY); }
}

/** (M11.2) The last owner's mess: litter and vomit on open indoor floor, on the `setup` stream. */
function scatterMess(g: Game, mess: { litter: number; vomit: number }) {
  const s = g.state, m = s.map, r = rng(s, "setup"), open: number[] = [];
  for (let i = 0; i < m.terrain.length; i++) if (m.terrain[i] === T.FLOOR && !m.outdoor[i] && g.walkable(i) && !g.seatAt[i]) open.push(i);
  const pick = () => { const k = r.int(0, open.length - 1); const i = open[k]; open[k] = open[open.length - 1]; open.pop(); return i; };
  for (let k = 0; k < mess.vomit && open.length; k++) s.dirt[pick()] = VOMIT;
  for (let k = 0; k < mess.litter && open.length; k++) s.dirt[pick()] = r.int(2, 5);
}
