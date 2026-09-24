// Staff roles (FOUNDATIONS §9). M2 carries janitors and slot techs; M3 adds drink servers; M4 security guards; wages are monthly game money.
export interface StaffRole { id: string; name: string; wage: number; desc: string }

export const STAFF_ROLES: Record<string, StaffRole> = {
  janitor: { id: "janitor", name: "Janitor", wage: 70, desc: "Sweeps up litter and spills." },
  tech: { id: "tech", name: "Slot tech", wage: 110, desc: "Repairs broken machines." },
  server: { id: "server", name: "Drink server", wage: 90, desc: "Brings drinks from the bar to players at their machines." },
  guard: { id: "guard", name: "Security guard", wage: 100, desc: "Patrols, answers reports, and enforces the house rules." },
};
export type StaffRoleId = keyof typeof STAFF_ROLES;
