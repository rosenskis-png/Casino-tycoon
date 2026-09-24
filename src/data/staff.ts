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
