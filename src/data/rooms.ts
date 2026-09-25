// Room purposes (FOUNDATIONS §3). Effects arrive with the systems that use them.
export const ROOM_PURPOSES = {
  floor: "General floor",
  bar: "Bar",
  restaurant: "Restaurant",
  highlimit: "High-limit room",
  club: "Club",
  show: "Show room",
  smoking: "Smoking room",
  enforcement: "Enforcement room",
  office: "Back office",
} as const;
export type RoomPurpose = keyof typeof ROOM_PURPOSES;

/** What each purpose does, for the room card (docs/spec/construction.md). */
export const ROOM_HELP: Record<RoomPurpose, string> = {
  floor: "No special effect.",
  bar: "A bar inside is one tier finer (a lounge, a grand bar).",
  restaurant: "A restaurant inside is one tier finer.",
  highlimit: "Machines inside take five times the stakes. Adds prestige and privacy. Only guests who bet big will sit here.",
  club: "A nightclub inside is one tier finer.",
  show: "A show lounge inside is one tier finer.",
  smoking: "Smokers light up in here, happily. The smoke drifts through walls and doors, and non-smokers hate it.",
  enforcement: "Security take people here for beatings and disappearances, out of sight.",
  office: "Surveillance operators watch the cameras from desks in here.",
};
