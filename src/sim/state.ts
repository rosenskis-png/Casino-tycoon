// Saved game state: plain serializable data only. Derived caches live in the runtime (game.ts) and are rebuilt on load.
import type { RoomPurpose } from "../data/rooms";
import type { NewsLevel } from "./events";

export const SCHEMA_VERSION = 4;

export interface MapState {
  w: number;
  h: number;
  /** Terrain code per tile (data/terrain T). */
  terrain: number[];
  /** 1 = outdoor, 0 = indoor. */
  outdoor: number[];
  /** 1 = scenario-fixed, cannot be demolished. */
  fixed: number[];
  /** Door state per tile (data/terrain DOOR_STATE); ignored for non-doors. */
  door: number[];
  entrances: number[];
}

/** Lifetime stats for a game object (the machine stats page, FOUNDATIONS §7.1). */
export interface ObjectStats { rounds: number; coinIn: number; paidOut: number; sessions: number; playTicks: number; uses: number }

export interface PlacedObject {
  id: number; kind: string; x: number; y: number; rot: number;
  /** 1 while broken down (slots), waiting for a tech. */
  broken: number;
  /** Last round shown on the cabinet: tick it resolved and result (0 loss, 1 win, 2 jackpot). */
  last: { tick: number; win: number };
  st: ObjectStats;
  /** Tick it was placed. Regulars only know what was built before their last visit. */
  built: number;
}

export type Needs = { bladder: number; hunger: number; thirst: number; fatigue: number };

/** Everything about one guest beyond movement (FOUNDATIONS §6, docs/spec/guests.md). */
export interface GuestData {
  type: string;
  /** Person id in the scenario pool, or -1 for a one-off guest. */
  pid: number;
  /** Group id (the leader's agent id); 1 for the leader. Everyone in a group is one type. */
  group: number;
  lead: number;
  /** 0 or 1, drawn from the group's makeup (party groups are all men, all women, or mixed). */
  sex: number;
  intent: "gamble" | "drink";
  name: number;
  /** Visit budget on arrival and money in hand now (dollars). */
  bankroll: number;
  wallet: number;
  /** ATM: drawn this visit, the most they could draw (savings, or a trip cap), their usual draw per trip (0 = never uses one), trips made. */
  withdrawn: number;
  withdrawCap: number;
  atm: number;
  trips: number;
  /** Usual stake per wager in dollars (a fraction of the visit budget). */
  stake: number;
  pace: number;
  quit: string;
  winGoal: number;
  lossLimit: number;
  compSeek: number;
  /** Floor time this visit may last (ticks since arrival). */
  floorTime: number;
  /** Intended intoxication (0 = sober, soft drinks only), how hard being drunk pushes it up, and intoxication now. */
  intend: number;
  drift: number;
  intox: number;
  /** Hidden chasing level 0-1 (carried by the person across visits). */
  chase: number;
  needs: Needs;
  mood: number;
  /** Hidden tags (M5): luck shift and cheat flag. */
  luck: number;
  cheat: number;
  /**
   * Memory of this visit, for the visit score and chasing. `feel` sums how good each round felt over `rounds`;
   * `served` and `comped` drinks were pushed on them; `early` a big win early on; `peak` their highest
   * intoxication; `atmYes` the ATM trip they decided on; `exitHops` hops spent looking for the way out;
   * `barAt` when they'll try a full bar again.
   */
  mem: {
    arrived: number; playTicks: number; moodSum: number; moodN: number; unmet: number; drinks: number; bigWin: number;
    wagered: number; won: number; fails: number; cashed: number; feel: number; rounds: number; served: number; comped: number;
    early: number; startIntend: number; peak: number; atmYes: number; exitHops: number; barAt: number;
  };
  /** Current thought and when it was had; recent thought ids, newest last. */
  thought: string;
  thoughtTick: number;
  recent: string[];
  nextThink: number;
  /** Short-lived annoyance from events (broken machine, line, no seat), decays each beat. */
  annoy: number;
  /** Why they are leaving, once they are. */
  why: string;
  /** Tick they started waiting for their group to go (broke or done), or -1. */
  wait: number;
  /** Wayfinding (docs/spec/navigation.md). Familiarity with the floor, 0-1; grows while here. */
  know: number;
  /** Per-guest seed for which remembered routes they know. */
  kseed: number;
  /** Tick of their last visit (regulars) or -1: only objects built by then can be remembered. */
  memDate: number;
  /** Entrance tile they came in by. */
  door: number;
  /** Amenity and sign ids seen this visit (newest last, capped). */
  seen: number[];
  /** Recent decision tiles, so wandering explores instead of doubling back. */
  trail: number[];
  /** What they are searching for ("" none), how many hops they've spent searching, and needs given up on (bits). */
  seek: string;
  lost: number;
  gaveUp: number;
  /** 1 while no walkable route to any exit exists. */
  trapped: number;
}

/**
 * A real person in the scenario's pool (docs/spec/guests.md): recurring types, plus the few one-off guests who
 * come back. Returning people are the same person, with their own money, floor memory and disposition.
 */
export interface Person {
  id: number;
  type: string;
  name: number;
  look: number;
  /** Savings (the most they could ever draw), monthly disposable income, and spending money now. */
  savings: number;
  income: number;
  cash: number;
  /** Floor memory: knowledge 0-1 and the tick of their last visit (-1 never been). */
  know: number;
  last: number;
  visits: number;
  /** Disposition toward this casino, 0-100: what their visits felt like. The type's reputation is the pool's average. */
  score: number;
  chase: number;
  /** Tick of their next planned visit, or -1 when they have no plans to come. */
  next: number;
  /** 1 while on the way in or on the floor. */
  here: number;
  /** (M5) Banned and marked flags. */
  ban: number;
  mark: number;
}

/**
 * Someone on the sidewalk: a passer-by (who may glance in and enter), someone heading in on purpose, or a group
 * that just left. Walks a sidewalk line at `s` tiles from its start; a whole group walks as one.
 */
export interface Ped {
  id: number;
  type: string;
  /** Sidewalk index, position along it (tiles, float), direction (+1 / -1) and speed (tiles per tick). */
  walk: number;
  s: number;
  dir: number;
  spd: number;
  /** Group size walking together. */
  n: number;
  /** Pool person (the leader) or -1. */
  pid: number;
  /** Entrance index they are heading in by; -1 passing by; -2 leaving. */
  goal: number;
  /** Entrances already glanced at (bits). */
  glanced: number;
  look: number;
}

/** Player-set drink policy (docs/spec/guests.md). */
export interface DrinkPolicy {
  /** Multiplier on base drink prices, 0-3. */
  price: number;
  /** Share of drinks served free to players, 0-1. */
  comp: number;
  /** Drink strength multiplier (0.6 light, 1 standard, 1.4 strong). */
  strength: number;
}

export type Activity =
  | "arrive" | "walk" | "wander" | "play" | "drink" | "restroom" | "cage" | "leave"
  | "idle" | "wait" | "clean" | "repair" | "fetch" | "serve";

/** A person on the map: guests and staff share one movement model on distance fields. */
export interface Agent {
  id: number;
  role: "guest" | "janitor" | "tech" | "server";
  /** Tile the agent is leaving and tile it is entering; progress t of steps ticks. */
  x: number; y: number;
  nx: number; ny: number;
  t: number;
  steps: number;
  /** Destination tile index. */
  dest: number;
  look: number;
  /** What they are doing, and what with: an object id (+ seat index) or a tile. */
  act: Activity;
  /** Activity to begin on arriving at dest. */
  next: Activity;
  target: number;
  seat: number;
  /** Ticks left in the current timed action; -1 = a slot round just resolved, awaiting the guest's call. */
  timer: number;
  /** 1 while out of sight (restroom stall). */
  hidden: number;
  /** Drink servers: guests still waiting for a drink on this tray (target is the one being served next). */
  tray?: number[];
  g?: GuestData;
}

export interface RoomMeta { anchor: number; name: string; purpose: RoomPurpose }

export interface NewsItem { tick: number; level: NewsLevel; text: string }

/** Money by category (positive = in). */
export type Ledger = Record<string, number>;

export interface GameState {
  schema: number;
  scenario: string;
  seed: number;
  tick: number;
  rng: Record<string, number>;
  nextId: number;
  cash: number;
  map: MapState;
  objects: PlacedObject[];
  agents: Agent[];
  wanderPoints: number[];
  /** Foot traffic per tile: +1 per agent per beat, halved each day. Integers, so saves stay exact. */
  traffic: number[];
  /** Litter per tile (integers). */
  dirt: number[];
  roomMeta: RoomMeta[];
  log: NewsItem[];
  /**
   * Reputation per guest type, 0-100. Recurring types: the average disposition of their people in the pool.
   * One-off types: word of mouth, moved by departing guests.
   */
  rep: Record<string, number>;
  /** The scenario's real returning people. */
  pool: Person[];
  /** People on the sidewalk. */
  peds: Ped[];
  drinks: DrinkPolicy;
  finance: {
    /** This month so far, per category. */
    month: Ledger;
    /** Closed months, newest last (kept 24). */
    history: { year: number; month: number; l: Ledger }[];
    /** Since the start; Σ total === cash (checked by the smoke test). */
    total: Ledger;
  };
  /** Thought counts by id per day: today first, then the previous days (kept THOUGHT_DAYS). */
  thoughts: Record<string, number>[];
  /** Visit counters: today and yesterday. */
  visits: { today: VisitStats; yday: VisitStats };
  outcome: "" | "won" | "lost";
}

export interface VisitStats { arrived: number; left: number; satSum: number; broke: number; walkedPast: number }
