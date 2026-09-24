// How each guest type judges a slot design (docs/spec/designer.md §5). Hidden: the player sees only the lab's
// panel verdict and the floor. Preferences are over what a guest can feel, never payback itself. Starting values,
// calibrated so the three original machines keep their old appeal per type (checked headless).
import type { Pref } from "./guests";
import type { CabType, FeatureId, FsEnh, JackpotHow, JackpotKind, LayoutId, SlotTheme, TopperId } from "./designer";

export interface SlotTaste {
  /** Hit rate (any win), 0-1. */
  hit: Pref;
  /** Intensity, 0-10 (how hard it swings). */
  intensity: Pref;
  /** Features seen per visit (log2 scale: 0 = one a visit, 2 = four). */
  feats: Pref;
  /** How much features matter at all (0-1); a featureless game disappoints the eager ones. */
  featAppetite: number;
  /** Weight of the top prize against their budget. */
  dream: number;
  /** Lights, sound, cabinet, celebration, 0-10. */
  spectacle: Pref;
  /** Layout and rules, 0-10. */
  complexity: Pref;
  /** Small wins celebrated as wins: -1 put off, 1 pleased. */
  ldw: number;
  /** Near misses: how much they keep them playing. */
  near: number;
  /** Classic reels: -1 bored by them, 1 loves them. */
  classic: number;
  /** How much drain (money lost per minute) bothers them. */
  drain: number;
  /** Calibration: appeal = base + gain × Excitement / 10 + fits (fitted so the original machines keep their appeal). */
  base: number;
  gain: number;
}

const P = (ideal: number, tol: number, w: number): Pref => ({ ideal, tol, w });

export const SLOT_TASTES: Record<string, SlotTaste> = {
  local: { hit: P(0.22, 0.14, 1), intensity: P(3.5, 2.5, 1), feats: P(0.5, 2, 0.6), featAppetite: 0.4, dream: 0.25, spectacle: P(3.5, 3, 1), complexity: P(1, 3, 1), ldw: -0.8, near: 0.6, classic: 0.6, drain: 0.8, base: 0.404, gain: 0.223 },
  retiree: { hit: P(0.4, 0.15, 1), intensity: P(2, 2, 1), feats: P(2, 1.5, 1), featAppetite: 0.9, dream: 0.8, spectacle: P(6, 3, 1), complexity: P(3, 2.5, 1), ldw: 0.6, near: 0.3, classic: 0.5, drain: 0.6, base: 0.298, gain: 0.702 },
  tourist: { hit: P(0.3, 0.3, 0.6), intensity: P(5.5, 3, 1), feats: P(1.5, 2, 1), featAppetite: 1, dream: 1.6, spectacle: P(8, 3, 1), complexity: P(4, 3, 0.6), ldw: 0.5, near: 0.3, classic: -0.8, drain: 0.3, base: 0.202, gain: 1.283 },
  party: { hit: P(0.25, 0.3, 0.5), intensity: P(6, 4, 0.5), feats: P(1.5, 2, 1), featAppetite: 0.9, dream: 2.2, spectacle: P(9, 3, 1.2), complexity: P(2, 3, 0.8), ldw: 0.6, near: 0.2, classic: -0.5, drain: 0.2, base: -0.122, gain: 1.311 },
  highroller: { hit: P(0.15, 0.15, 0.6), intensity: P(7, 3, 1), feats: P(0.5, 2, 0.5), featAppetite: 0.4, dream: 0.8, spectacle: P(2.5, 3.5, 1), complexity: P(3, 3, 0.5), ldw: -0.9, near: -0.3, classic: 0.2, drain: 0.1, base: -0.04, gain: 1.004 },
  conventioneer: { hit: P(0.3, 0.2, 0.6), intensity: P(4.5, 3, 1), feats: P(1, 2, 0.8), featAppetite: 0.7, dream: 0.7, spectacle: P(6, 3, 0.8), complexity: P(3, 3, 0.6), ldw: 0, near: 0.2, classic: -0.4, drain: 0.4, base: 0.487, gain: 0.1 },
  family: { hit: P(0.38, 0.15, 1), intensity: P(3, 2.5, 1), feats: P(1.5, 1.5, 0.8), featAppetite: 0.8, dream: 0.6, spectacle: P(7.5, 3, 1), complexity: P(2, 2.5, 0.8), ldw: 0.5, near: 0.1, classic: -0.3, drain: 0.5, base: 0.239, gain: 0.598 },
};

/**
 * Hidden pairings (docs/spec/designer.md §7): a design matching a rule gets its value added to its coherence
 * (Excitement, scaled by each type's taste for theming). Each is modeled on a real hit, or a real mismatch.
 */
export interface Pairing {
  theme?: SlotTheme[];
  set?: 0 | 1;
  layout?: LayoutId[];
  enh?: FsEnh[];
  wild?: ("none" | "plain" | "x2" | "x3")[];
  cab?: CabType[];
  minDenom?: number;
  lights?: number;
  sound?: number;
  retrigger?: boolean;
  /** (M8.5) Has every one of these features; a jackpot level of one of these kinds, or won this way; a topper. */
  feat?: FeatureId[];
  jk?: JackpotKind[];
  how?: JackpotHow[];
  topper?: TopperId[];
  /** Cascades with the climbing multiplier; a pick to match. */
  climb?: boolean;
  match?: boolean;
  /** More than this many features (a clash for classics). */
  over?: number;
  v: number;
}
export const PAIRINGS: Pairing[] = [
  { theme: ["goldrush"], set: 0, layout: ["w243", "w1024", "w4096"], enh: ["wildx"], v: 0.5 },
  { theme: ["egypt"], enh: ["expand"], v: 0.5 },
  { theme: ["egypt", "rome"], enh: ["x3"], v: 0.3 },
  { theme: ["classic", "ratpack"], layout: ["c3"], wild: ["x2", "x3"], v: 0.45 },
  { theme: ["classic"], layout: ["c3", "r33"], cab: ["stepper"], v: 0.25 },
  { theme: ["dragon"], enh: ["rand"], v: 0.35 },
  { theme: ["dragon"], layout: ["w243"], v: 0.2 },
  { theme: ["tiki", "pirate"], enh: ["extra"], v: 0.25 },
  { theme: ["atomic"], enh: ["rand"], v: 0.2 },
  { theme: ["rock"], sound: 3, v: 0.25 },
  { theme: ["atomic"], lights: 3, v: 0.2 },
  { theme: ["luxe"], cab: ["slant"], minDenom: 5, v: 0.4 },
  { theme: ["deco"], cab: ["slant", "stepper"], v: 0.2 },
  { theme: ["medieval"], enh: ["expand", "wildx"], v: 0.15 },
  { theme: ["riviera"], enh: ["x2"], retrigger: true, v: 0.15 },
  { cab: ["giant"], minDenom: 25, v: -0.35 },
  { theme: ["classic"], layout: ["w4096", "w1024"], v: -0.3 },
  { theme: ["luxe", "deco"], lights: 3, sound: 3, v: -0.2 },
  { theme: ["medieval", "egypt"], enh: ["rand"], v: -0.15 },
  // (M8.5) The bonus genres' own hits.
  { theme: ["dragon"], feat: ["hns"], v: 0.45 },
  { theme: ["dragon"], feat: ["pick"], match: true, v: 0.4 },
  { theme: ["tiki"], feat: ["hns"], v: 0.35 },
  { theme: ["pirate"], feat: ["pick"], v: 0.35 },
  { theme: ["goldrush"], set: 1, feat: ["collect"], v: 0.4 },
  { theme: ["rome", "deco"], topper: ["wheel"], v: 0.4 },
  { theme: ["classic"], layout: ["c3", "r33"], topper: ["wheel"], v: 0.3 },
  { theme: ["atomic"], feat: ["cascade"], v: 0.35 },
  { theme: ["rock"], feat: ["wheel"], v: 0.15 },
  { theme: ["luxe", "riviera"], feat: ["offer"], v: 0.2 },
  { feat: ["hns"], jk: ["linked"], how: ["hns"], v: 0.35 },
  { feat: ["cascade"], climb: true, v: 0.25 },
  { feat: ["wheel"], jk: ["sa", "linked"], how: ["wheel"], v: 0.3 },
  { feat: ["mystery"], jk: ["mhb"], v: 0.25 },
  { feat: ["collect", "fs"], v: 0.2 },
  { feat: ["fs", "mystery"], enh: ["wildx", "extra"], v: 0.1 },
  { theme: ["medieval"], feat: ["cascade"], v: -0.3 },
  { cab: ["stepper"], over: 1, v: -0.35 },
  { theme: ["luxe", "deco"], feat: ["cascade"], v: -0.15 },
];
