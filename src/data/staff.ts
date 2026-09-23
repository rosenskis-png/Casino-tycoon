// Staff roles (FOUNDATIONS §9). M2 carries janitors and slot techs; wages are monthly game money.
export interface StaffRole { id: string; name: string; wage: number; desc: string }

export const STAFF_ROLES: Record<string, StaffRole> = {
  janitor: { id: "janitor", name: "Janitor", wage: 120, desc: "Sweeps up litter and spills." },
  tech: { id: "tech", name: "Slot tech", wage: 180, desc: "Repairs broken machines." },
};
export type StaffRoleId = keyof typeof STAFF_ROLES;
