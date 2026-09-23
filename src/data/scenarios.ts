// Scenario maps as data. M1 ships one sandbox lot (tutorial size, ~3× the v0.2 lot) to exercise the engine.
export interface Rect { x: number; y: number; w: number; h: number }

export interface ScenarioDef {
  id: string;
  name: string;
  w: number;
  h: number;
  startCash: number;
  /** Owned outdoor land. Everything else is unowned. */
  grounds: Rect[];
  /** Building shells: walls on the edge (permanent), floor inside, indoors. */
  buildings: Rect[];
  /** Interior walls the player may demolish, as rects filled with wall. */
  walls: Rect[];
  /** Door tiles in walls: [x, y]. */
  doors: [number, number][];
  water: Rect[];
  /** Tiles where guests arrive from the street. */
  entrances: [number, number][];
}

export const SCENARIOS: Record<string, ScenarioDef> = {
  sandbox: {
    id: "sandbox",
    name: "Sandbox Lot",
    w: 56,
    h: 44,
    startCash: 50_000,
    grounds: [{ x: 2, y: 2, w: 52, h: 40 }],
    buildings: [{ x: 6, y: 4, w: 44, h: 28 }],
    walls: [{ x: 36, y: 5, w: 1, h: 12 }, { x: 37, y: 16, w: 12, h: 1 }],
    doors: [[27, 31], [28, 31], [36, 10], [42, 16]],
    water: [{ x: 8, y: 35, w: 6, h: 4 }],
    entrances: [[27, 41], [28, 41]],
  },
};
