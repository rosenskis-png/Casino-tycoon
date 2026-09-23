// Hidden quality channels (FOUNDATIONS §4). Theme channels (THM) join in M6.
export const CHANNELS = ["TRF", "NRG", "PRS", "PRV", "EXV", "SRVV", "SRVH", "CRW", "CLN", "SMK"] as const;
export type Channel = (typeof CHANNELS)[number];

export interface ChannelDef {
  name: string;
  /** Fraction removed per wall tile crossed (doors count half). Never 1: walls weaken, never block. */
  wallCut: number;
  /** Overlay color for debug/research views. */
  color: string;
}

export const CHANNEL_DEFS: Record<Channel, ChannelDef> = {
  TRF: { name: "Foot traffic", wallCut: 0.5, color: "#ffd36b" },
  NRG: { name: "Noise & energy", wallCut: 0.5, color: "#ff5a6e" },
  PRS: { name: "Prestige", wallCut: 0.6, color: "#c79bff" },
  PRV: { name: "Privacy", wallCut: 0.6, color: "#6bb0ff" },
  EXV: { name: "Exit visibility", wallCut: 0.9, color: "#7dffb0" },
  SRVV: { name: "Visible surveillance", wallCut: 0.8, color: "#4a6cf0" },
  SRVH: { name: "Hidden surveillance", wallCut: 0.8, color: "#9aa4b8" },
  CRW: { name: "Crowding", wallCut: 0.5, color: "#ff9f43" },
  CLN: { name: "Cleanliness", wallCut: 0.7, color: "#48dbfb" },
  SMK: { name: "Smoke", wallCut: 0.7, color: "#b0a898" },
};

export interface Emission { channel: Channel; strength: number; radius: number }
