// Cheats, suspicion and enforcement numbers (FOUNDATIONS §11, docs/spec/cheats.md). Starting values, tuned headless.

/** Share of people who are lucky, and of people who are unlucky; the payback shift either way (M11.2: 0.1, was 0.2: lucky players at +20 points played on for free and leaked money). */
/** (Batch A, owner) No lucky or unlucky guests any more: plain variance makes honest winners. The luck mechanism
 * stays (exact, checked) but nobody gets it. */
export const LUCK_SHARE = 0;
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

/** (M12, owner) The ladder, mildest first: warn > kick out = beat up > lifetime ban > disappear. */
export type EnfAction = "warn" | "kick" | "beat" | "ban" | "vanish";
export const ENF_ACTIONS: EnfAction[] = ["warn", "kick", "beat", "ban", "vanish"];

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
  /** The rough end of the job (a beating, a disappearance): with no security at all it becomes a ban. */
  enforcer: boolean;
  /**
   * (M12, owner) What it teaches. Personal (warn, kick, ban): only this guest does the thing less (PERSONAL_DETER),
   * for the rest of the visit and, for pool people, on later visits. Global (beat, vanish): everyone does it less for
   * a while (`chill`, fading), and the target's crowd hears about it (`rep`, reputation, guilty or not).
   */
  chill: number;
  rep: number;
  desc: string;
}

export const ENF: Record<EnfAction, EnfActionDef> = {
  warn: { name: "Warning", secs: 2, heat: 0.3, police: 0, rumorRep: 0.5, witness: 0, tell: 0, enforcer: false, chill: 0, rep: 0, desc: "A quiet word. They stop doing it for the rest of the visit, and do it less from then on." },
  kick: { name: "Kicked out", secs: 1, heat: 0.4, police: 0, rumorRep: 1, witness: 2, tell: 0, enforcer: false, chill: 0, rep: 0, desc: "Walked to the door for tonight. They can come back, and do it less when they do." },
  beat: { name: "Beating", secs: 2, heat: 1.5, police: 0.5, rumorRep: 4, witness: 12, tell: 0.25, enforcer: true, chill: 0.2, rep: 1.5, desc: "A few punches in the enforcement room. They limp home, and word gets around: everyone does it less for a while." },
  ban: { name: "Lifetime ban", secs: 1, heat: 0.5, police: 0, rumorRep: 1.5, witness: 3, tell: 0, enforcer: false, chill: 0, rep: 0, desc: "Walked out, with their group, and turned away at the door from now on." },
  vanish: { name: "Disappearance", secs: 3, heat: 3, police: 1, rumorRep: 8, witness: 20, tell: 0.25, enforcer: true, chill: 0.4, rep: 3, desc: "Taken to the enforcement room and never seen again. Nobody does it for a long while, and their crowd is scared." },
};

/**
 * (M12, owner) Why: the behavior an action is for. It deters that behavior whether or not the guest was doing it
 * (the sim knows; acting on an innocent still brings a rumor). "Just because" deters nothing.
 */
export type EnfReason = "cheat" | "count" | "intox" | "disorder" | "misconduct" | "vice" | "drugs" | "none";
export const ENF_REASONS: Record<EnfReason, { name: string; bit: number; desc: string }> = {
  cheat: { name: "Cheating", bit: 1, desc: "Cheats think twice about starting." },
  count: { name: "Card counting", bit: 2, desc: "Counters stop counting." },
  intox: { name: "Drunkenness", bit: 4, desc: "Guests drink less." },
  disorder: { name: "Fighting and trouble", bit: 8, desc: "Fewer arguments, fights and scenes." },
  misconduct: { name: "Misconduct", bit: 16, desc: "Fewer planters used as restrooms." },
  vice: { name: "Vice", bit: 32, desc: "Guests turn escorts down and hook up less." },
  drugs: { name: "Drugs", bit: 64, desc: "Guests use less." },
  none: { name: "Just because", bit: 0, desc: "No reason given. It teaches nothing in particular." },
};
export const ENF_REASON_IDS = Object.keys(ENF_REASONS) as EnfReason[];
/** A guest warned, kicked out or banned for a behavior does it this much as often (the rest of the visit, and later visits). */
export const PERSONAL_DETER = 0.25;
/** The global chill per behavior never passes this, and fades by CHILL_DECAY a day. */
export const CHILL_MAX = 0.8;
export const CHILL_DECAY = 0.98;

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
