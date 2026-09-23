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
