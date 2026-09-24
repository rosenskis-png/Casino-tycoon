// Tile terrain codes (FOUNDATIONS §3). Stored as numbers in saved map arrays, so never renumber.
/** SIDEWALK (M3): the street pedestrians walk; not part of the lot, nothing is built on it. */
export const T = { VOID: 0, FLOOR: 1, WALL: 2, DOOR: 3, WATER: 4, SIDEWALK: 5 } as const;
export type Terrain = (typeof T)[keyof typeof T];

/**
 * Door rules (docs/spec/construction.md). CARD: returning guests; DRESS: one guest type (the gate's arg); ROLE:
 * one staff role (arg). Staff, police, paramedics and escorted guests pass STAFF, CARD and DRESS doors.
 */
export const DOOR_STATE = { OPEN: 0, STAFF: 1, LOCKED: 2, CARD: 3, DRESS: 4, ROLE: 5 } as const;
export const DOOR_RULES: { id: number; name: string; arg?: "type" | "role"; fee: boolean }[] = [
  { id: DOOR_STATE.OPEN, name: "Open", fee: true },
  { id: DOOR_STATE.STAFF, name: "Staff only", fee: false },
  { id: DOOR_STATE.LOCKED, name: "Locked", fee: false },
  { id: DOOR_STATE.CARD, name: "Card holders", fee: true },
  { id: DOOR_STATE.DRESS, name: "Dress code", arg: "type", fee: true },
  { id: DOOR_STATE.ROLE, name: "One staff role", arg: "role", fee: false },
];
/** Most a door may charge a guest to walk through (dollars). */
export const MAX_DOOR_FEE = 20;

/** Build prices in game money (docs/spec/clock.md: tuned for play, not real-world). */
export const BUILD_COST = { wall: 40, door: 120, demolish: 10, entrance: 500 } as const;
