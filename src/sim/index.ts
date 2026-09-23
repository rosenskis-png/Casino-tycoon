// Public sim API for render/, ui/, and headless tools.
export { Game } from "./game";
export type { CommandRecord } from "./game";
export type { Command } from "./commands";
export type { GameState, Agent, PlacedObject, NewsItem, GuestData, Ledger } from "./state";
export { SCHEMA_VERSION } from "./state";
export type { SimEvent, NewsLevel } from "./events";
export { serialize, loadState } from "./save";
export { smoke, checkInvariants, checkSave, mathChecks } from "./debug";
export { TICKS_PER_SECOND, TICKS_PER_DAY, SPEEDS, MONTH_NAMES, formatDate, dateOfDay, type Speed } from "./clock";
export { UNREACHED } from "./paths";
export { MAX_RADIUS } from "./fields";
export { idx } from "./map";
export { objSeats, objSize, covers, footprint, seats } from "./geometry";
export { placement } from "./build";
export { LEDGER_LABELS, monthlyCosts, worth } from "./finance";
export { goalStatus, describeGoals } from "./goals";
export { arrivalRates } from "./guests";
export { modelOf, betOf } from "./gaming";
