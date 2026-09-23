// Saved game state: plain serializable data only. Derived caches live in the runtime (game.ts) and are rebuilt on load.
import type { RoomPurpose } from "../data/rooms";
import type { NewsLevel } from "./events";

export const SCHEMA_VERSION = 2;

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
}

export type Needs = { bladder: number; hunger: number; thirst: number; fatigue: number };

/** Everything about one guest beyond movement (FOUNDATIONS §6). */
export interface GuestData {
  type: string;
  /** (M3) Group id; everyone is their own group until groups exist. */
  group: number;
  intent: "gamble" | "drink" | "pass";
  name: number;
  /** Bankroll on arrival and money in hand now (dollars). */
  bankroll: number;
  wallet: number;
  /** Withdrawals made this visit, and the most this guest will take out. */
  withdrawn: number;
  withdrawCap: number;
  atm: number;
  credits: number;
  pace: number;
  quit: string;
  winGoal: number;
  lossLimit: number;
  compSeek: number;
  /** Orders soft drinks only. */
  sober: number;
  intox: number;
  needs: Needs;
  mood: number;
  /** Hidden tags (M5): luck shift and cheat flag. */
  luck: number;
  cheat: number;
  /** Memory of this visit, for reputation on leaving. */
  mem: { arrived: number; playTicks: number; moodSum: number; moodN: number; unmet: number; drinks: number; bigWin: number; wagered: number; won: number; fails: number; cashed: number };
  /** Current bubble/inspector thought and when it was had; recent thought ids, newest last. */
  thought: string;
  thoughtTick: number;
  recent: string[];
  nextThink: number;
  /** Short-lived annoyance from events (broken machine, line, no seat), decays each beat. */
  annoy: number;
  /** Why they are leaving, once they are. */
  why: string;
}

export type Activity =
  | "arrive" | "walk" | "wander" | "play" | "drink" | "restroom" | "cage" | "leave"
  | "idle" | "clean" | "repair";

/** A person on the map: guests and staff share one movement model on distance fields. */
export interface Agent {
  id: number;
  role: "guest" | "janitor" | "tech";
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
  /** Reputation per guest type, 0-100. */
  rep: Record<string, number>;
  finance: {
    /** This month so far, per category. */
    month: Ledger;
    /** Closed months, newest last (kept 24). */
    history: { year: number; month: number; l: Ledger }[];
    /** Since the start; Σ total === cash (checked by the smoke test). */
    total: Ledger;
  };
  thoughts: { today: Record<string, number>; yday: Record<string, number> };
  /** Visit counters: today and yesterday. */
  visits: { today: VisitStats; yday: VisitStats };
  outcome: "" | "won" | "lost";
}

export interface VisitStats { arrived: number; left: number; satSum: number; broke: number }
