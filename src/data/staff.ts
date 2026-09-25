// Staff roles (FOUNDATIONS §9). M2 carries janitors and slot techs; M3 adds drink servers; M4 security guards; M5 surveillance operators and enforcers; M7 dealers and pit bosses; wages are monthly game money.
export interface StaffRole {
  id: string; name: string; wage: number; desc: string;
  /** (M11) Comes with an object instead of being hired: no wage, no pay setting, not in the hire list. */
  builtIn?: boolean;
}

export const STAFF_ROLES: Record<string, StaffRole> = {
  janitor: { id: "janitor", name: "Janitor", wage: 35, desc: "Sweeps up litter and spills." },
  tech: { id: "tech", name: "Slot tech", wage: 55, desc: "Repairs broken machines." },
  server: { id: "server", name: "Drink server", wage: 45, desc: "Brings drinks from the bar to players at their machines." },
  guard: { id: "guard", name: "Security", wage: 60, desc: "Patrols, answers reports and enforces the house rules; carries out warnings, bans, beatings and disappearances, on your orders or as the house treatment for caught cheats." },
  operator: { id: "operator", name: "Surveillance operator", wage: 60, desc: "Watches up to 8 cameras from a desk in a Back office room." },
  dealer: { id: "dealer", name: "Dealer", wage: 0, builtIn: true, desc: "Comes with every table (its price includes them, no wages): runs the table, the keno board or the bingo calls." },
  pitboss: { id: "pitboss", name: "Pit boss", wage: 70, desc: "Watches the tables: cheats at a table in view are caught far more often, and card counters get noticed." },
  // (M11.2, owner) Enforcers merged into Security; an old save's enforcers become security.
  entertainer: { id: "entertainer", name: "Entertainer", wage: 45, desc: "Juggles, does magic and makes balloon animals where the crowd is. Families and tourists love it; people nearby have fun and lose track of time." },
};
export type StaffRoleId = keyof typeof STAFF_ROLES;

// Staff depth (M9, docs/spec/staff.md): pay, skill, morale, honesty and theft. Starting values.
export const PAY_MIN = 0.6, PAY_MAX = 1.6, PAY_STEP = 0.1;
export const STAFF = {
  knack: [0.8, 1.2] as [number, number], payPow: 0.6, skill: [0.4, 1.8] as [number, number],
  morale: { base: 75, perPay: 100, drift: 0.25, overworkAt: 0.9, overworkMax: 15, fight: 2, fightMax: 15, firedHonest: 8, quitBelow: 20, quitChance: 0.05 },
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
/**
 * (M11.2) Entertainers: how much each crowd enjoys a street act (fun time and a lift while it lasts), where they
 * perform (tiles), and how long an act lasts (seconds).
 */
export const ENTERTAIN: Record<string, number> = { family: 1.5, tourist: 1.2, party: 1, conventioneer: 0.8, retiree: 0.7, local: 0.6, highroller: 0.2 };
export const ACT_REACH = 5;
export const ACT_SECS: [number, number] = [30, 45];
export const ZONED_ROLES = ["janitor", "tech", "guard", "pitboss", "entertainer"];
export const SKILL_WORDS: [number, string][] = [[0.8, "Poor"], [0.95, "Fair"], [1.1, "Good"], [1.3, "Great"], [Infinity, "Excellent"]];

// (M11) Uniforms: a color per job the player can change (Staff tab). `parts` are the look's color slots the uniform
// dyes (t top, n bottoms, j jacket or vest, q hat); every job also has its own silhouette and prop (docs/spec/art.md).
export const UNIFORM_COLORS: { name: string; hex: string }[] = [
  { name: "Slate", hex: "#5f7a8c" }, { name: "Orange", hex: "#f08c1e" }, { name: "Black", hex: "#1c1820" }, { name: "Cream", hex: "#efe6d0" },
  { name: "Wine", hex: "#7a1a2c" }, { name: "Charcoal", hex: "#2e3440" }, { name: "Grey", hex: "#7a808c" }, { name: "Brown", hex: "#3e2a22" },
  { name: "Royal blue", hex: "#2f4fb0" }, { name: "Teal", hex: "#1f8a80" }, { name: "Green", hex: "#2f7a3a" }, { name: "Gold", hex: "#c99a3e" },
  { name: "Purple", hex: "#6a3a9a" }, { name: "Red", hex: "#c0283c" }, { name: "Pink", hex: "#e05a9a" }, { name: "Sky", hex: "#5aa8e0" },
];
export const UNIFORMS: Record<string, { parts: string[]; color: number }> = {
  janitor: { parts: ["t", "n", "q"], color: 9 },
  tech: { parts: ["j", "q"], color: 1 },
  server: { parts: ["j"], color: 2 },
  guard: { parts: ["j"], color: 13 },
  operator: { parts: ["t"], color: 6 },
  dealer: { parts: ["j"], color: 4 },
  pitboss: { parts: ["j"], color: 5 },
  entertainer: { parts: ["j", "q"], color: 12 },
};
