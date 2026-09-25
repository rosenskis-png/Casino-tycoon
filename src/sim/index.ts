// Public sim API for render/, ui/, and headless tools.
export { Game } from "./game";
export type { CommandRecord } from "./game";
export type { Command } from "./commands";
export type { GameState, Agent, PlacedObject, NewsItem, NewsRef, GuestData, Ledger, Person, Ped, Incident, HouseRules, EnfJob } from "./state";
export { SCHEMA_VERSION } from "./state";
export type { SimEvent, NewsLevel } from "./events";
export { serialize, loadState } from "./save";
export { smoke, checkInvariants, checkSave, mathChecks, generatorChecks } from "./debug";
export { TICKS_PER_SECOND, TICKS_PER_DAY, SPEEDS, MONTH_NAMES, formatDate, dateOfDay, type Speed } from "./clock";
export { UNREACHED } from "./paths";
export { MAX_RADIUS } from "./fields";
export { idx } from "./map";
export { objSeats, objSize, objCells, objStaff, objFootprint, covers, dims, priceOf, sizeTier, seatCount, type Placed } from "./geometry";
export { placement, landForSale } from "./build";
export { showPhase, tierOf, tierName, priceFor, purposeAt, stakeMult } from "./amenities";
export type { Gate } from "./state";
export { LEDGER_LABELS, ledgerLabel, monthlyCosts, worth, meterDebt } from "./finance";
export { goalStatus, describeGoals } from "./goals";
export { thoughtRates, guestCount, engagement, engageParts, floorDraw, capacity } from "./guests";
export { newcomerRates, poolSummary, person } from "./pool";
export { pedSpot, curbAppeal } from "./street";
export { DRINK_PRICE, STRENGTHS } from "./drinks";
export { betOf, machineModel, limitsOf, isTable, tableDefOf } from "./gaming";
export {
  compiledOf, compiledById, designById, designIdOf, perfIndex, panelMix, statsOf, machinesOf, cantUse, certified, certPending, illegal, sanitize,
  designLocks, sameMath, minRtpOf, certFee, designPrice, cabKind, isStock, CERT, CONVERT_FEE, cabOfKind, PERF_INDEX_HELP,
} from "./design";
export { opinionsOf, gameKey, OPINION_MONTHS, type OpinionSummary } from "./opinions";
export { huntEdge, topMeter, signDesign, collectHuntAt } from "./design";
export { meterPull } from "./guests";
export {
  awareness, ageDays, marketVersion, fansOf, fanCount, wishes, saleBlocks, saleOf, installs, saleLine, marketFactor, MARKET, SALE_RULES, MAKERS,
} from "./design/market";
export { meterValue, meterFor, prepSpin, afterSpin, liability, maxBetOf, hasMeters, type MeterHost } from "./design/meters";
export { compile, type Compiled } from "./design/compile";
export { judge, feelOf } from "./design/appeal";
export { panel, parSheet, sessions, ratingWord, INTENSITY_WORDS, type Panel, type SessionStats } from "./design/lab";
export { spinFull, forces, TIERS, type Force, type Outcome, type Orb } from "./design/spin";
export { seeded } from "./rng";
export { tableOpen, dealerSeats, limitsNow } from "./tables";
export { incidentRates, incidentOf, LADDER, LADDER_NAMES, CALL_AFTER } from "./incidents";
export { cutoff } from "./drinks";
export { isStaff } from "./staff";
export { payOf, wageFor, skillOf, skillWord, roleMorale, uniformOf, uniformHexes } from "./crew";
export { debtOf, loanRoom, emergencyRoom, theo, COMP_BIT } from "./bank";
export { NOT_INCOME } from "./finance";
export { locked, projectFor, researched, available as projectAvailable, toolTier, overlays, hasClub, hasHeatmaps, hasBreakdowns } from "./research";
export { runningEvents, adFees } from "./calendar";
export { suspicion, coverage, purposeTiles, type Suspicion } from "./cheats";
export { OBJECTS } from "../data/objects";
export { STOCK_DESIGNS } from "../data/designs";
export { newDesign } from "../data/designer";
export { cantPlay, yourFam, yourMoves, bjTotal, rankOf, vpHand, vpX, VP_HANDS, bacTotal, rouletteX } from "./yours";
export type { YourPlay, YourFam } from "./state";
export { SCENARIOS } from "../data/scenarios";
export { bribeChance, bribePrice } from "./regulator";
