// Staff roles (FOUNDATIONS §9). M2 carries janitors and slot techs; M3 adds drink servers; M4 security guards; M5 surveillance operators and enforcers; M7 dealers and pit bosses; wages are monthly game money.
export interface StaffRole { id: string; name: string; wage: number; desc: string }

export const STAFF_ROLES: Record<string, StaffRole> = {
  janitor: { id: "janitor", name: "Janitor", wage: 70, desc: "Sweeps up litter and spills." },
  tech: { id: "tech", name: "Slot tech", wage: 110, desc: "Repairs broken machines." },
  server: { id: "server", name: "Drink server", wage: 90, desc: "Brings drinks from the bar to players at their machines." },
  guard: { id: "guard", name: "Security guard", wage: 100, desc: "Patrols, answers reports, and enforces the house rules." },
  operator: { id: "operator", name: "Surveillance operator", wage: 120, desc: "Watches up to 8 cameras from a desk in a Back office room." },
  dealer: { id: "dealer", name: "Dealer", wage: 100, desc: "Runs a table, the keno board or the bingo calls. A table opens only with its dealers (craps needs two)." },
  pitboss: { id: "pitboss", name: "Pit boss", wage: 140, desc: "Watches the tables: cheats at a table in view are caught far more often, and card counters get noticed." },
  enforcer: { id: "enforcer", name: "Enforcer", wage: 150, desc: "Warns, bans, beats or disappears guests: on your orders, or as the house treatment for caught cheats." },
};
export type StaffRoleId = keyof typeof STAFF_ROLES;

// Staff depth (M9, docs/spec/staff.md): pay, skill, morale, honesty and theft. Starting values.
export const PAY_MIN = 0.6, PAY_MAX = 1.6, PAY_STEP = 0.1;
export const STAFF = {
  knack: [0.8, 1.2] as [number, number], payPow: 0.6, skill: [0.4, 1.8] as [number, number],
  morale: { base: 50, perPay: 50, drift: 0.25, overworkAt: 0.85, overworkMax: 20, fight: 2, fightMax: 15, firedHonest: 8, quitBelow: 20, quitChance: 0.05 },
  crook: 0.05, crookPow: 1.5, amenityCrook: 0.05,
  catchBase: 0.02, catchGuard: 0.12, catchPit: 0.15, catchCamera: 0.1, sight: 8,
};
/** What a crook takes, per chance: the chance per opportunity and the amount (dollars, or a share of the bets). */
export const THEFT = {
  tech: { p: 0.4, amount: [20, 60] as [number, number] },
  server: { p: 0.3 },
  dealer: { p: 0.5, share: 0.02 },
  bartender: { p: 0.3 },
  teller: { p: 0.3, amount: [5, 25] as [number, number] },
};
export const SHRINK_AREAS = ["bar", "cage", "tables", "machines"] as const;
export type ShrinkArea = (typeof SHRINK_AREAS)[number];
/** Roles that can be kept to one room. */
export const ZONED_ROLES = ["janitor", "tech", "guard", "pitboss"];
export const SKILL_WORDS: [number, string][] = [[0.8, "Poor"], [0.95, "Fair"], [1.1, "Good"], [1.3, "Great"], [Infinity, "Excellent"]];
