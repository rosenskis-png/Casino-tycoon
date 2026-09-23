// Public sim API for render/, ui/, and headless tools.
export { Game } from "./game";
export type { CommandRecord } from "./game";
export type { Command } from "./commands";
export type { GameState, Agent, PlacedObject, NewsItem } from "./state";
export type { SimEvent, NewsLevel } from "./events";
export { serialize, loadState } from "./save";
export { smoke, checkInvariants } from "./debug";
export { TICKS_PER_SECOND, TICKS_PER_DAY, SPEEDS, formatDate, dateOfDay, type Speed } from "./clock";
export { UNREACHED } from "./paths";
export { MAX_RADIUS } from "./fields";
export { idx } from "./map";
