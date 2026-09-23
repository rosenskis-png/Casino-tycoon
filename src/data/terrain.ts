// Tile terrain codes (FOUNDATIONS §3). Stored as numbers in saved map arrays, so never renumber.
export const T = { VOID: 0, FLOOR: 1, WALL: 2, DOOR: 3, WATER: 4 } as const;
export type Terrain = (typeof T)[keyof typeof T];

export const DOOR_STATE = { OPEN: 0, STAFF: 1, LOCKED: 2 } as const;

/** Build prices in game money (docs/spec/clock.md: tuned for play, not real-world). */
export const BUILD_COST = { wall: 40, door: 120, demolish: 10 } as const;
