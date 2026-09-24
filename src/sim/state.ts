// Saved game state: plain serializable data only. Derived caches live in the runtime (game.ts) and are rebuilt on load.
import type { RoomPurpose } from "../data/rooms";
import type { NewsLevel } from "./events";
import type { EnfAction } from "../data/cheats";

export const SCHEMA_VERSION = 14;

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
  /** Door rule details (M6): the type or role a DRESS or ROLE door admits, and a fee for guests walking through. */
  gates: Gate[];
  /** (M9.6) The hotel elevator's tile (also an entrance), or -1. */
  lift: number;
}

/** One door's rule details (docs/spec/construction.md). Only doors with an arg or a fee have one. */
export interface Gate { i: number; arg: string; fee: number }

/** Lifetime stats for a game object (the machine stats page, FOUNDATIONS §7.1). */
export interface ObjectStats {
  rounds: number; coinIn: number; paidOut: number; sessions: number; playTicks: number; uses: number;
  /** (M9.5) Coin in and paid out by guest type, for the guest breakdowns research. */
  byType?: Record<string, [number, number]>;
}

export interface PlacedObject {
  id: number; kind: string; x: number; y: number; rot: number;
  /** Sized amenities (M6): front width × depth in their own frame. */
  w?: number; h?: number;
  /** Player-set price: a restaurant's multiplier, a show ticket or a club's cover (dollars). */
  price?: number;
  /** 1 while broken down (slots), waiting for a tech. */
  broken: number;
  /** Last round shown on the cabinet: tick it resolved and result (0 loss, 1 win, 2 jackpot). */
  last: { tick: number; win: number };
  st: ObjectStats;
  /** Tick it was placed. Regulars only know what was built before their last visit. */
  built: number;
  /** Bars only: the drink policy for this bar and the servers who work it. */
  bar?: BarPolicy;
  /** (M7) Tables, video poker and draw games: rule option per rule and limit preset (data/tables.ts); the last round. */
  rules?: number[];
  lim?: number;
  tbl?: TableRound;
  /** (M9) Bars and cages: 1 while crewed by a crooked bartender or teller (docs/spec/staff.md). */
  crook?: number;
  /** (M10) Nightclubs: the track playing (data/music.ts CLUB_TRACKS; missing = the first). */
  track?: number;
}

/**
 * A table's round (docs/spec/tables.md): the tick the next is dealt, and what the last one showed: its tick, the
 * shared outcome of its last hand (roulette pocket, craps outcome index, baccarat coup, the 20 keno balls, poker
 * or bingo winner's seat), and per seat 0 no play, 1 lost, 2 won.
 */
export interface TableRound { next: number; at: number; out: number[]; seats: number[] }

/** Player-set drink policy per bar (docs/spec/guests.md §Drinks). */
export interface BarPolicy {
  /** Multiplier on the base drink price, 0-3. */
  price: number;
  /** Share of drinks served free to players, 0-1. */
  comp: number;
  /** Drink strength multiplier (0.6 light, 1 standard, 1.4 strong). */
  strength: number;
  /** A tile of the room its servers work, or -1 for anywhere. */
  area: number;
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
  /** Why they came (M6 adds a meal, a show, the club): they head there first. */
  intent: "gamble" | "drink" | "dine" | "show" | "club" | "pool";
  /** 1 for a returning guest (a "card holder" at card doors until the M9 player's club). */
  card: number;
  /** Smokers (M6): 1, with the urge building 0-100 (satisfied in a smoking room or outdoors). */
  smoker: number;
  urge: number;
  /** Trapped behind doors they can't pass: the tick it started (-1 not), and 1 once staff let them out. */
  trapAt: number;
  esc: number;
  /** Paid this visit (bits): 1 a club's cover, 2 the pool; (M9.6) 4 an escort already asked them. */
  paid: number;
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
  /** The drink in hand: how much is left (0 = none, 1 = full) and its strength (0 = a soft drink). One at a time. */
  drink: number;
  dStr: number;
  /** Intended intoxication (0 = sober, soft drinks only), how hard being drunk pushes it up, and intoxication now. */
  intend: number;
  drift: number;
  intox: number;
  /** Hidden chasing level 0-1 (carried by the person across visits). */
  chase: number;
  needs: Needs;
  mood: number;
  /** Hidden tags (docs/spec/cheats.md): payback shift (±LUCK_SHIFT or 0) and 1 for a cheat. */
  luck: number;
  cheat: number;
  /**
   * Cheating: seconds left in the current spell (0 honest), the tick the next spell may start, the take they
   * mean to walk out with (0 once done cheating this visit), and 1 once caught this visit.
   */
  spell: number;
  spellAt: number;
  take: number;
  caught: number;
  /** Marked by the player: bits 1 marked, 2 alert on leaving, 4 alert on returning. */
  mark: number;
  /** Enforcement job holding them (id), or 0; 1 once beaten (they limp out slowly). */
  held: number;
  hurt: number;
  /**
   * Memory of this visit, for the visit score and chasing. `feel` sums how good each round felt over `rounds`;
   * `served` and `comped` drinks were pushed on them; `early` a big win early on; `peak` their highest
   * intoxication; `atmYes` the ATM trip they decided on; `exitHops` hops spent looking for the way out;
   * `barAt` when they'll try the bar again; `offerAt` when a server may offer again; `sitAt` when this session
   * began; `favSeat` / `favScore` the seat of their best session this visit.
   */
  mem: {
    arrived: number; playTicks: number; moodSum: number; moodN: number; unmet: number; drinks: number; bigWin: number;
    wagered: number; won: number; cashed: number; feel: number; rounds: number; served: number; comped: number;
    early: number; startIntend: number; peak: number; atmYes: number; exitHops: number; barAt: number;
    offerAt: number; sitAt: number; favSeat: number; favScore: number;
    /** 1 once security threw them out. */
    ejected: number;
    /** What the machines' math expected them to win back (Σ bet × payback) and its variance, for the suspicion tools. */
    ev: number;
    v: number;
    /** Wins so far, and how many (and what variance) the math expected: luck and rigged wins show here. */
    hits: number;
    hexp: number;
    hvar: number;
    /** 1 once banned this visit (a one-off guest who later joins the pool stays banned). */
    banned: number;
    /** Ticks spent at a meal, a show or dancing (time well spent, like play), and money spent on them and at doors. */
    fun: number;
    spent: number;
    /** When they'll try for a meal or a show again after finding it full (or unaffordable). */
    eatAt: number;
  };
  /** Current thought and when it was had; recent thought ids, newest last. */
  thought: string;
  thoughtTick: number;
  recent: string[];
  nextThink: number;
  /**
   * Finding a machine: seconds of browsing (sightseeing, learning the floor) still to do, frustration from wanting
   * to sit and finding nothing (they give up at FRUSTRATED), machines they liked the look of this visit, and which
   * of their favorite spots (regulars) they've checked.
   */
  browse: number;
  frus: number;
  liked: number[];
  favAt: number;
  /** Short-lived annoyance from events (broken machine, line, no seat, incidents seen), decays each beat. */
  annoy: number;
  /** Short-lived lift from something fun they saw (a winner cheering, a free round), decays each beat. */
  buzz: number;
  /**
   * Incidents (docs/spec/incidents.md): warnings from security this visit, their reports that went unanswered,
   * 1 once they've called the police, and the tick before which they won't start another incident.
   */
  warned: number;
  unans: number;
  called: number;
  incAt: number;
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
  /** (M7) Hidden: skill at games with choices (0 poor, 1 typical, 2 sharp) and 1 for a card counter. */
  skill: number;
  counter: number;
  /** (M9) 1 for a whale (docs/spec/money.md). Comps this visit (bits, COMP_BIT): earned, and used. */
  vip: number;
  comp: number;
  /** (M9) Winnings the house couldn't pay them this visit (dollars). */
  unpaid: number;
  /** (M9.5) 1 for a child in a family: no money, never gambles or drinks, stays near the adults. */
  minor: number;
  /** (M9.6) 0 never uses drugs, else uses this visit + 1; how high they are now (1 just used, fading to 0). */
  drugs: number;
  high: number;
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
  /** Favorite spots: seat tiles of their best sessions, best first (at most 3). They check these first. */
  fav: number[];
  /** Tick of their next planned visit, or -1 when they have no plans to come. */
  next: number;
  /** 1 while on the way in or on the floor. */
  here: number;
  /** Times security has thrown them out. */
  ejects: number;
  /** 1 once banned for life (with their whole group); the player's mark bits (GuestData.mark). */
  ban: number;
  mark: number;
  /** Hidden tags, for life (docs/spec/cheats.md), and times caught cheating. */
  luck: number;
  cheat: number;
  caught: number;
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


export type Activity =
  | "arrive" | "walk" | "wander" | "play" | "drink" | "restroom" | "cage" | "leave"
  | "idle" | "wait" | "clean" | "repair" | "offer" | "fetch" | "serve"
  // M4: a guard on the way to (or dealing with) an incident; a guest passed out or fighting; a paramedic treating.
  | "respond" | "out" | "fight" | "treat"
  // M5: a guest held for (or walked to) enforcement; an enforcer (or guard) carrying it out; carrying a bag
  // away; a surveillance operator at a desk.
  | "held" | "enforce" | "carry" | "watch"
  // M6: eating, at a show (seated, waiting or watching), dancing, having a smoke.
  | "dine" | "show" | "dance" | "smoke"
  // M6.5: at the pool (swimming or on a lounger), sitting in a garden.
  | "swim" | "rest"
  // M7: a dealer at their table; a guest watching a craps table.
  | "deal" | "look";

/** (M9) A worker's hidden knack and honesty, morale, today's workload, and patrol zone (docs/spec/staff.md). */
export interface StaffData {
  q: number;
  crook: number;
  morale: number;
  /** Beats spent working today, and beats counted. */
  busy: number;
  beats: number;
  /** A tile of the room they're kept to, or -1 for anywhere. */
  zone: number;
}

/** A person on the map: guests and staff share one movement model on distance fields. */
export interface Agent {
  id: number;
  /** Guests, staff (data/staff.ts), and visitors from outside: police officers and paramedics (M4). */
  role: "guest" | "janitor" | "tech" | "server" | "guard" | "officer" | "medic" | "operator" | "enforcer" | "dealer" | "pitboss" | "inspector" | "escort";
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
  /** Drink servers: their bar (object id), orders on the tray (guest ids), and when order-taking ends (officers: when their visit ends). */
  bar?: number;
  tray?: number[];
  due?: number;
  /** Enforcers: 1 while carrying a bag. */
  bag?: number;
  g?: GuestData;
  /** (M9) Staff only. */
  st?: StaffData;
}

/** An incident in progress (docs/spec/incidents.md). Ended ones are only counted. */
export interface Incident {
  id: number;
  kind: string;
  /** Where it happens, who started it, and who else is in it (-1 none). */
  tile: number;
  actor: number;
  other: number;
  start: number;
  /** Tick it ends on its own (-1: passed out, lasts until someone comes). */
  end: number;
  /** Guard on the way (agent id) or -1; 1 once security dealt with it. */
  guard: number;
  handled: number;
  /** Guests who reported it to staff. */
  reporters: number[];
  /** Paramedic called (passing out, nobody came); 1 once a police officer on the floor saw it. */
  medic: number;
  seen: number;
}

/** House rules per policed incident category: 0 ignore, 1 lenient, 2 moderate, 3 strict. */
export type HouseRules = Record<"intox" | "disorder" | "misconduct" | "vice" | "drugs", number>;

/** Standing with each outside authority, 0-100 (docs/spec/incidents.md §Authorities). */
export interface Authorities {
  police: {
    standing: number;
    /** Step on the ladder reached: 0 none, 1 warned, 2 fines, 3 inspections, 4 raided. */
    stage: number;
    /** Police calls ever, the last raid, and when the next routine inspection is due. */
    calls: number;
    raidAt: number;
    inspectAt: number;
  };
  regulator: { standing: number; stage: number };
  /** Closed by the authorities until this tick (-1 open); `revoked` once the license was lost. */
  closedUntil: number;
  revoked: number;
}

/**
 * An enforcement job (docs/spec/cheats.md): who, what, ordered by the player or the house treatment for a caught
 * cheat, and who is carrying it out. Stages: 0 waiting for staff, 1 on the way to the guest, 2 walking them
 * somewhere (the exit, the enforcement room), 3 doing it (since `at`).
 */
export interface EnfJob {
  id: number;
  guest: number;
  action: EnfAction;
  house: number;
  staff: number;
  stage: number;
  /** Where it happens (stage 2-3), or -1 where they stand; tick stage 3 began. */
  tile: number;
  at: number;
}

/** Enforcement state: the house treatment, rolling heat, jobs in progress, rumors and missing-person reports due. */
export interface Enforcement {
  policy: { first: EnfAction; repeat: EnfAction };
  heat: number;
  jobs: EnfJob[];
  rumors: { at: number; type: string; rep: number; police: number; text: string }[];
  missing: { at: number; name: number }[];
}

/** Closed by the police (a raid, or the license revoked): nobody comes in. */
export const isClosed = (s: GameState) => s.auth.closedUntil > s.tick;

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
  /** Incidents in progress; counts by kind per day (today first, kept THOUGHT_DAYS), plus reports and police calls under "_reports", "_calls". */
  incidents: Incident[];
  incidentDays: Record<string, number>[];
  rules: HouseRules;
  auth: Authorities;
  enf: Enforcement;
  /** Visit counters: today and yesterday. */
  visits: { today: VisitStats; yday: VisitStats };
  outcome: "" | "won" | "lost";
  /** Land parcels bought (scenario parcel ids, M6.5). */
  parcels: string[];
  /** (M9) Staff pay and theft, money and risk, the regulator, whales. */
  crew: Crew;
  bank: Bank;
  reg: RegulatorState;
  whale: WhaleState;  /** (M9.5) This year's events, marketing campaigns running, research. */
  cal: { year: number; events: CalEvent[] };
  ads: { id: string; until: number }[];
  research: ResearchState;
  /** (M10) The game you're playing yourself, or null (docs/spec/play.md). */
  yours: YourPlay | null;
}

export type YourFam = "slot" | "vpoker" | "blackjack" | "roulette" | "craps" | "baccarat" | "keno";
/**
 * You at one of your own games: the phase (betting, or acting on a hand), money out on the hand, the last result
 * (`seq` counts hands; `big` names a jackpot) and the session's totals, then what each game shows.
 */
export interface YourPlay {
  obj: number; fam: YourFam; phase: "bet" | "act";
  out: number;
  last: { wagered: number; won: number; seq: number; big: string };
  total: { wagered: number; won: number };
  /** Slots: reel symbols. Video poker: the hand, held positions, cards out. Blackjack: hands, dealer, hand in play. */
  reels?: number[]; cards?: number[]; held?: number[]; used?: number[];
  hands?: { cards: number[]; bet: number; done: number }[]; dealer?: number[]; cur?: number;
  /** Roulette: the pocket (37 = 00) and bets. Craps: point, line bets [pass, don't pass], odds, dice. */
  pocket?: number; bets?: Record<string, number>;
  point?: number; line?: [number, number]; odds?: number; dice?: [number, number];
  /** Baccarat: the hands. Keno: your picks and the balls drawn. */
  bac?: { p: number[]; b: number[] };
  picks?: number[]; drawn?: number[];
}

/** A scheduled event: when it runs (ticks), its length in days, and 1 once announced, 2 once started. */
export interface CalEvent { id: string; start: number; end: number; len: number; told: number }

/** Research (docs/spec/research.md): monthly funding, the project, points put into each, and what's done. */
export interface ResearchState { funding: number; project: string; points: Record<string, number>; done: string[] }

/** Pay per role (multiple of the market wage) and what went missing this month, per area, found at the count. */
export interface Crew { pay: Record<string, number>; shrink: Record<string, number>; hist: number[] }

/** Credit, tax, insurance and comps (docs/spec/money.md). */
export interface Bank {
  loan: number;
  emergency: number;
  /** Share of the gaming win skimmed; back taxes owed (hidden). */
  skim: number;
  evaded: number;
  /** Insurance: cover above this payout (0 = off); expected excess of this month's wagers. */
  insure: number;
  insExp: number;
  /** Emergency loans this month; months in a row closed below zero; unpaid winnings since the last audit. */
  emergencies: number;
  broke: number;
  unpaid: number;
  /** 1 while cash is below zero with no credit left (told once). */
  low: number;
  /** Comp thresholds on theoretical loss (0 = off), and comps given this month. */
  /** `only`: with the player's club (M9.5), comps go to one guest type ("" = everyone). */
  comps: { meal: number; show: number; back: number; room?: number; only?: string };
  given: number;
}

/** The regulator's inspector: next routine visit, the one on the floor (agent id or -1), and the last suspension. */
export interface RegulatorState { next: number; here: number; suspendAt: number }

/** A whale announced (arriving at `at`) or on the floor (`id`), and when the next is announced. */
export interface WhaleState {
  next: number;
  due: { at: number; name: number; game: string; reqs: string[]; bankroll: number } | null;
  id: number;
  /** The whale on the floor: their game, what they started with, their name and bet per hand. */
  game: string;
  bankroll: number;
  name: number;
  bet: number;

}

export interface VisitStats { arrived: number; left: number; satSum: number; broke: number; walkedPast: number }
