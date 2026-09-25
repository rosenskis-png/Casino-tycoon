// (M11.1) The floor's pull on guests, in money (docs/spec/guests.md "Engagement and draw"): how well a spot suits
// someone changes how they play there, how well the whole casino suits a crowd changes how many of them come, the
// noise a crowd makes carries into the rooms around it, and threats scale with the casino. Starting values; tuned
// in the numbers pass.

/**
 * Engagement at a game: 1 + FIT × how well the spot suits them (the same score that moves mood, centered on FIT_MID)
 * + GAME × how much they like this game (its appeal to their type, centered on GAME_MID), clamped to [MIN, MAX].
 * The centers are what a typical spot and a typical chosen game scored on the Test Floor (M11.1), so an ordinary
 * floor plays at about 1. It raises pace and stake (by its square root each), how long they're willing to stay and
 * how much they'll lose before stopping. The upside comes mostly from theming they love (fit is capped for the rest).
 */
export const ENGAGE = { fit: 0.35, fitMid: 0.5, game: 0.5, gameMid: 0.9, min: 0.6, max: 1.6 };
/** Share of each round's length (above or below 1× engagement) added to or taken from the visit's floor time. */
export const TIME_FLIES = 0.5;
/** Mood from surroundings is clamped to this range (M11.1: a real upside, not just avoiding the bad). */
export const ENV_MOOD: [number, number] = [-30, 25];
/** How much a guest's taste for a theme (-1..1) adds to or takes from the pleasure of a coherent themed spot. */
export const THEME_TASTE = 0.6;

/**
 * Draw: arrivals of each crowd are scaled by how well the casino's game seats suit them, on average, each seat
 * weighted by the crowd's taste for its game (so a floor split between crowds suits neither as well as one made
 * for a crowd): 1 + FIT × (the average fit − FIT_MID), clamped.
 * Seats themselves draw only sublinearly: (seats + 6) / 50, to the power SIZE_POW, capped at SIZE_CAP.
 */
export const DRAW = { fit: 0.5, fitMid: 0, min: 0.4, max: 2, sizePow: 0.5, sizeCap: 2.5 };

/**
 * Crowd noise (NRG), per room: each guest adds BASE, more when drunk (per unit of intoxication above 0.2), high or
 * dancing; the room's level is SCALE × the sum / its size. It carries into rooms within REACH tiles, × WALL for
 * the wall between and fading with distance.
 */
export const NOISE = { base: 0.3, drunk: 1.5, high: 0.5, dance: 1, scale: 30, reach: 10, wall: 0.5 };

/**
 * Threats and penalties sized to the casino (fines, bribes, cheats' takes): × the average monthly gaming win of
 * the last 3 closed months over REF_MONTH (the win they were first tuned for), clamped to [MIN, MAX]. Before
 * any month has closed, the estimate is PER_SEAT × game seats.
 */
export const SCALE = { refMonth: 10_000, min: 0.1, max: 10, perSeat: 30 };

/** Staff theft is a big organization's problem: crooks steal × (staff − SMALL) / (BIG − SMALL), clamped to 0..1. */
export const ORG = { small: 8, big: 40 };
