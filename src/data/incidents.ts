// Incidents and house rules as data (FOUNDATIONS §10, docs/spec/incidents.md). Every incident has a cause the
// player can see and change (sim/incidents.ts checks the triggers); a guest type's `incidents` only scales how
// often a cause turns into one. Vice (M6), underage guests and drugs (M9) join the catalog later.

export type IncidentCat = "intox" | "disorder" | "misconduct" | "celebration" | "social" | "vice" | "drugs";

export interface IncidentCatDef { id: IncidentCat; name: string; desc: string; policed: boolean }
export const INCIDENT_CATS: Record<IncidentCat, IncidentCatDef> = {
  intox: { id: "intox", name: "Drunkenness", desc: "Loud drunks, stumbling, spills, vomiting, passing out.", policed: true },
  disorder: { id: "disorder", name: "Disorder", desc: "Arguments, fights, yelling at staff, losers breaking down.", policed: true },
  misconduct: { id: "misconduct", name: "Misconduct", desc: "Relieving themselves in the planters; children at the machines.", policed: true },
  celebration: { id: "celebration", name: "Celebration", desc: "Big winners cheering and buying rounds.", policed: false },
  social: { id: "social", name: "Social", desc: "Flirting, talking others into another drink.", policed: false },
  // M9.6 (docs/spec/vice.md).
  vice: { id: "vice", name: "Vice", desc: "Escorts working the floor, couples hooking up.", policed: true },
  drugs: { id: "drugs", name: "Drugs", desc: "Guests using something in a quiet corner.", policed: true },
};

/** House rules, per policed category: how strictly security steps in (FOUNDATIONS §10). */
export const RULE_LEVELS = ["Ignore", "Lenient", "Moderate", "Strict"] as const;
export const RULE_HELP = [
  "Security never steps in.",
  "Security steps in on fights, guests passed out, and reports. Warnings only, except fights.",
  "Security steps in on anything that bothers others. A warning first, out on the second offense.",
  "Security steps in early and throws people out on the first offense. Wasted guests are shown the door.",
];
/** Bars and servers stop serving above this intoxication, by the drunkenness rule (Ignore … Strict). */
export const CUTOFF = [Infinity, Infinity, 0.8, 0.5];

export interface IncidentDef {
  id: string;
  cat: IncidentCat;
  name: string;
  /** Mood points for a witness before their type's tolerance (negative: bothers them; positive: fun to see). */
  mood: number;
  /** Seconds it lasts. Passing out lasts until someone comes. */
  secs: number;
  /** Tiles away it's noticed: in view within this, or heard through a wall within half of it. */
  reach: number;
  /** Mess left on the floor (litter units; VOMIT for vomit). */
  mess?: number;
  /** A low-drama witness may report it to staff. */
  reportable: boolean;
  /** Lowest house rule at which security steps in unasked: 1 lenient, 2 moderate, 3 strict; 0 never (positive). */
  respond: number;
  /** Police standing it costs when it happens (fights) or when an officer on the floor sees it. */
  police: number;
  /** The actor's thought, and what a bothered (or amused) witness thinks. */
  thought?: string;
  seen?: string;
  /** Log text; {name} is the actor. */
  text: string;
  /** Internal (not counted or shown): security escorting a wasted guest out under a strict rule. */
  hidden?: boolean;
}

/** Litter value that marks vomit (above the litter cap, so it never grows out of ordinary litter). */
export const VOMIT = 12;

export const INCIDENTS: Record<string, IncidentDef> = {
  loud: { id: "loud", cat: "intox", name: "Loud drunk", mood: -4, secs: 8, reach: 8, reportable: true, respond: 2, police: 0.5, thought: "partyTime", seen: "loudDrunk", text: "{name} is loud and drunk." },
  stumble: { id: "stumble", cat: "intox", name: "Stumbling", mood: -1, secs: 3, reach: 5, reportable: false, respond: 3, police: 0, text: "{name} stumbled." },
  spill: { id: "spill", cat: "intox", name: "Spilled drink", mood: -2, secs: 4, reach: 4, mess: 4, reportable: false, respond: 3, police: 0, thought: "spilled", text: "{name} spilled a drink." },
  vomit: { id: "vomit", cat: "intox", name: "Vomiting", mood: -10, secs: 6, reach: 6, mess: VOMIT, reportable: true, respond: 2, police: 1, thought: "sick", seen: "gross", text: "{name} threw up on the floor." },
  passout: { id: "passout", cat: "intox", name: "Passed out", mood: -6, secs: 0, reach: 6, reportable: true, respond: 1, police: 2, seen: "passedOut", text: "{name} passed out." },
  argument: { id: "argument", cat: "disorder", name: "Argument", mood: -5, secs: 12, reach: 8, reportable: true, respond: 2, police: 0.5, thought: "argued", seen: "shouting", text: "{name} got into an argument." },
  fight: { id: "fight", cat: "disorder", name: "Fight", mood: -14, secs: 15, reach: 10, reportable: true, respond: 1, police: 3, thought: "fought", seen: "fightSeen", text: "{name} started a fight." },
  yell: { id: "yell", cat: "disorder", name: "Yelling at staff", mood: -4, secs: 6, reach: 7, reportable: true, respond: 2, police: 0.5, thought: "yelled", seen: "shouting", text: "{name} is yelling at staff." },
  breakdown: { id: "breakdown", cat: "disorder", name: "Breakdown", mood: -3, secs: 10, reach: 5, reportable: false, respond: 3, police: 0, thought: "ruined", seen: "sadSight", text: "{name} broke down after a big loss." },
  urinate: { id: "urinate", cat: "misconduct", name: "Peeing in a planter", mood: -9, secs: 5, reach: 6, mess: 6, reportable: true, respond: 2, police: 1, thought: "couldntWait", seen: "gross", text: "{name} relieved themselves in a planter." },
  cheer: { id: "cheer", cat: "celebration", name: "Cheering", mood: 4, secs: 5, reach: 7, reportable: false, respond: 0, police: 0, seen: "cheerSeen", text: "{name} is celebrating a win." },
  round: { id: "round", cat: "celebration", name: "Buying a round", mood: 8, secs: 6, reach: 5, reportable: false, respond: 0, police: 0, thought: "boughtRound", seen: "freeRound", text: "{name} bought a round for everyone nearby." },
  flirt: { id: "flirt", cat: "social", name: "Flirting", mood: 1, secs: 8, reach: 3, reportable: false, respond: 0, police: 0, thought: "flirting", text: "{name} is flirting." },
  recruit: { id: "recruit", cat: "social", name: "Another round?", mood: 2, secs: 6, reach: 3, reportable: false, respond: 0, police: 0, text: "{name} talked someone into another drink." },
  // M9.5: a child playing a machine (docs/spec/incidents.md). Officers take it seriously.
  underage: { id: "underage", cat: "misconduct", name: "Underage gambling", mood: -4, secs: 12, reach: 6, reportable: true, respond: 1, police: 2, seen: "underageSeen", text: "A child is playing a slot machine." },
  // M9.6: vice and drugs (docs/spec/vice.md). An escort's pitch has the escort as the actor.
  solicit: { id: "solicit", cat: "vice", name: "Escort working the floor", mood: -2, secs: 8, reach: 5, reportable: true, respond: 2, police: 1.5, seen: "escortSeen", text: "An escort is working the floor." },
  hookup: { id: "hookup", cat: "vice", name: "Hooking up", mood: -3, secs: 10, reach: 5, reportable: true, respond: 2, police: 1, seen: "getARoom", text: "{name} is hooking up in a corner." },
  drugs: { id: "drugs", cat: "drugs", name: "Drug use", mood: -4, secs: 5, reach: 4, reportable: true, respond: 1, police: 3, seen: "drugsSeen", thought: "high", text: "{name} took something." },
  escort: { id: "escort", cat: "intox", name: "Shown out", mood: 0, secs: 30, reach: 0, reportable: false, respond: 3, police: 0, text: "{name} was shown out.", hidden: true },
};
