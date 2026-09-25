// Cheats, suspicion and enforcement numbers (FOUNDATIONS §11, docs/spec/cheats.md). Starting values, tuned headless.

/** Share of people who are lucky, and of people who are unlucky; the payback shift either way (M11.2: 0.1, was 0.2: lucky players at +20 points played on for free and leaked money). */
export const LUCK_SHARE = 0.03;
export const LUCK_SHIFT = 0.1;
/** A cheat who leads a group brings a crew: each companion cheats too with this chance. */
export const CREW = 0.5;
/** What a cheat means to walk out with (dollars, at a casino winning $10K a month; M11.1 sizes it to the casino, never under TAKE_MIN). */
export const TAKE = { median: 400, sigma: 0.5, min: 150, cap: 2500 };
export const TAKE_MIN = 20;
/** Seconds of honest play before a spell, and how long a spell lasts. */
export const HONEST_SECS: [number, number] = [20, 60];
export const SPELL_SECS: [number, number] = [30, 90];
/** While cheating (at the machine's maximum bet), this share of wagers is a rigged win paying CHEAT_X × the bet; the rest play normally (≈245% back). */
export const CHEAT_HIT = 0.5;
export const CHEAT_X = 4;

/** Chance per second of cheating to be caught: by chance, per guard in view, per unit of watched camera field. */
export const CATCH_BASE = 0.001;
export const CATCH_GUARD = 0.006;
export const CATCH_CAMERA = 0.004;
/** Tiles within which a guard in view can catch a cheat. */
export const GUARD_SIGHT = 8;
/**
 * (M7) At tables: per second of cheating, per pit boss in view (within PIT_SIGHT) and for a dealer at the table
 * itself; per second of a card counter at blackjack in a pit boss's view, the chance they get noticed.
 */
export const CATCH_PIT = 0.012;
export const CATCH_DEALER = 0.002;
export const PIT_SIGHT = 8;
export const COUNT_SPOT = 0.01;
/** Marked guests are this much likelier to be caught. */
export const MARKED = 2.5;
/** Cameras one surveillance operator at a desk can watch. */
export const CAMS_PER_OPERATOR = 8;

/** The cheat estimate (suspicion tier 4) never shows more than this short of a catch; how odd (in SDs) a typical cheat looks. */
export const ESTIMATE_CAP = 0.92;
export const SUSPECT_Z = 7;

export type EnfAction = "warn" | "ban" | "beat" | "vanish";
export const ENF_ACTIONS: EnfAction[] = ["warn", "ban", "beat", "vanish"];

export interface EnfActionDef {
  name: string;
  /** Seconds the action itself takes (after walking the guest wherever it happens). */
  secs: number;
  /** Rolling heat it adds, the base police cost, and the reputation hit if the target turns out innocent. */
  heat: number;
  police: number;
  rumorRep: number;
  /** Mood hit for each guest who sees it; how likely (× (1 − drama)) a witness tells the police. */
  witness: number;
  tell: number;
  /** Needs an enforcer (guards can do the rest). */
  enforcer: boolean;
  desc: string;
}

export const ENF: Record<EnfAction, EnfActionDef> = {
  warn: { name: "Warning", secs: 2, heat: 0.3, police: 0, rumorRep: 0.5, witness: 0, tell: 0, enforcer: false, desc: "A quiet word. They stop cheating for the rest of the visit." },
  ban: { name: "Lifetime ban", secs: 1, heat: 0.5, police: 0, rumorRep: 1.5, witness: 3, tell: 0, enforcer: false, desc: "Walked out, with their group, and turned away at the door from now on." },
  beat: { name: "Beating", secs: 2, heat: 1.5, police: 0.5, rumorRep: 4, witness: 12, tell: 0.25, enforcer: true, desc: "A few punches in the enforcement room. They limp home." },
  vanish: { name: "Disappearance", secs: 3, heat: 3, police: 1, rumorRep: 8, witness: 20, tell: 0.25, enforcer: true, desc: "Taken to the enforcement room and never seen again." },
};

/** Heat fades by this each day; every enforcement cost is × (1 + heat / HEAT_SCALE). */
export const HEAT_DECAY = 0.97;
export const HEAT_SCALE = 4;
/** Tiles within which guests see an enforcement action. */
export const WITNESS_REACH = 8;
/** Police standing a witness report costs (at most WITNESS_REPORTS count per action). */
export const WITNESS_POLICE = 2;
export const WITNESS_REPORTS = 3;
/** A beaten guest's group: annoyance, chance they call the police, and its cost. */
export const BEAT_GROUP_ANNOY = 15;
export const BEAT_GROUP_CALL = 0.5;
export const BEAT_GROUP_POLICE = 4;
/** A disappeared guest's group looks for them this long, then reports them missing. */
export const MISSING_SECS = 60;
export const MISSING_POLICE = 8;
/** An innocent who disappeared costs this much police standing when the rumor lands. */
export const INNOCENT_VANISH_POLICE = 6;
/** Days before a rumor about an innocent target reaches the ticker. */
export const RUMOR_DAYS: [number, number] = [2, 8];
/** A beaten guest's disposition drop. */
export const BEATEN_SCORE = 40;
