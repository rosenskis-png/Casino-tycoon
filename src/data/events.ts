// Scheduled events and marketing campaigns as data (FOUNDATIONS §16, §19; docs/spec/calendar.md). Starting values.

export interface EventDef {
  id: string;
  name: string;
  /** Fixed date (month 0-11, day 1-based), or `perYear` randomly dated ones. */
  at?: { month: number; day: number };
  perYear?: number;
  /** Length in days: fixed, or a range. */
  days: [number, number];
  /** Arrival multipliers by guest type while it runs ("*" = every type, applied first). */
  crowd: Record<string, number>;
  /** Sportsbook and poker appeal multipliers while it runs. */
  sports?: number;
  poker?: number;
  /** Only where the scenario's population has this type (conventions need Conventioneers). */
  needs?: string;
  /** Days ahead it's announced. */
  notice: number;
  blurb: string;
}

export const EVENTS: Record<string, EventDef> = {
  newyear: { id: "newyear", name: "New Year's Eve", at: { month: 11, day: 30 }, days: [3, 3], crowd: { "*": 1.5, party: 2.5 }, notice: 7, blurb: "the biggest party night of the year" },
  holidays: { id: "holidays", name: "Holiday season", at: { month: 11, day: 20 }, days: [10, 10], crowd: { retiree: 1.3, family: 1.5, highroller: 1.5 }, notice: 7, blurb: "families and big spenders in town" },
  springbreak: { id: "springbreak", name: "Spring break", at: { month: 2, day: 10 }, days: [14, 14], crowd: { party: 2, tourist: 1.3 }, notice: 7, blurb: "college crowds" },
  summer: { id: "summer", name: "Summer holiday weekend", at: { month: 6, day: 3 }, days: [3, 3], crowd: { tourist: 1.8, family: 2 }, notice: 7, blurb: "tourists and families" },
  biggame: { id: "biggame", name: "The big game", at: { month: 1, day: 5 }, days: [1, 1], crowd: { local: 1.5, party: 1.5 }, sports: 4, notice: 7, blurb: "the whole town wants a bet on it" },
  playoffs: { id: "playoffs", name: "Playoffs", at: { month: 2, day: 15 }, days: [21, 21], crowd: { local: 1.2 }, sports: 2, notice: 7, blurb: "weeks of games to bet on" },
  fight: { id: "fight", name: "Fight night", perYear: 3, days: [1, 1], crowd: { party: 2, highroller: 2, local: 1.3 }, sports: 3, notice: 7, blurb: "a title fight in town" },
  convention: { id: "convention", name: "Convention", perYear: 4, days: [4, 7], crowd: { conventioneer: 40 }, needs: "conventioneer", notice: 7, blurb: "thousands of badges in town" },
  tourney: { id: "tourney", name: "Poker tournament", perYear: 2, days: [2, 2], crowd: { local: 1.3, highroller: 1.5 }, poker: 3, notice: 7, blurb: "card players from out of town" },
};

export interface CampaignDef { id: string; name: string; crowd: Record<string, number>; fee: number; desc: string }
export const CAMPAIGNS: Record<string, CampaignDef> = {
  radio: { id: "radio", name: "Radio spots", crowd: { local: 1.4 }, fee: 300, desc: "Locals hear about you." },
  bus: { id: "bus", name: "Bus tours", crowd: { retiree: 1.6, tourist: 1.2 }, fee: 400, desc: "Coaches of retirees, and some sightseers." },
  travel: { id: "travel", name: "Travel ads", crowd: { tourist: 1.5, family: 1.3 }, fee: 500, desc: "Visitors put you on their list." },
  college: { id: "college", name: "College promotion", crowd: { party: 1.8 }, fee: 300, desc: "Cheap drinks, loud crowds." },
  mailers: { id: "mailers", name: "High-roller mailers", crowd: { highroller: 1.5 }, fee: 600, desc: "Invitations to big players." },
  convention: { id: "convention", name: "Convention partnership", crowd: { conventioneer: 2 }, fee: 500, desc: "Conference-goers get a shuttle to you." },
  family: { id: "family", name: "Family fun deals", crowd: { family: 1.8 }, fee: 350, desc: "Meals and the pool, sold to parents." },
};
/** Campaign lengths the player can pick (months). */
export const CAMPAIGN_MONTHS = [1, 3, 6];
