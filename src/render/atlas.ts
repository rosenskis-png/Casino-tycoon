// Compiles data/art text sprites into one atlas canvas at load (docs/spec/art.md). The compiler adds the 1px ink
// outline, mirrors side views, composes people from pose + outfit + hair + accessories, and derives clothing
// shades. Frames then blit cached pixels; nothing is painted pixel by pixel per frame.
import {
  ACCESSORIES, EXTRA_SPRITES, HAIR, OBJECT_SPRITES, OUTFITS, PALETTE, PEOPLE, PERSON_FIXED, POSES, REEL_STRIP,
  SLOT_COLORS, SLOT_ROWS, TILES, type SpriteDef,
} from "../data/art";

/** Sprite rect without padding. Every sprite has 1px of padding around it (outline room). */
export interface Frame { x: number; y: number; w: number; h: number }
export const PAD = 1;

export interface Atlas {
  canvas: HTMLCanvasElement;
  frames: Map<string, Frame>;
  /** Clothing color per look (set → sex → variant), for dots at the farthest zoom. */
  lookColor: Record<string, string[][]>;
}

interface Pending { key: string; rows: string[]; pal: Record<string, string>; flip: boolean; outline: string }

const INK = PALETTE.k;
const sides = (o: SpriteDef["outline"]) => (o === false ? "" : o === true || o === undefined ? "tblr" : o);
const flipSides = (s: string) => s.replace(/[lr]/g, (c) => (c === "l" ? "r" : "l"));

// ---- Color math for derived shades (hue-shifted: cloth cools toward violet, skin warms toward red).
const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const rgbOf = (hex: string) => { const n = parseInt(hex.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
export const coolShade = (hex: string) => { const [r, g, b] = rgbOf(hex); return `#${hex2(r * 0.66)}${hex2(g * 0.62)}${hex2(b * 0.74 + 12)}`; };
export const warmShade = (hex: string) => { const [r, g, b] = rgbOf(hex); return `#${hex2(r * 0.8)}${hex2(g * 0.64)}${hex2(b * 0.64)}`; };

/** Deterministic scramble so look variants don't march through color lists in lockstep. */
const pick = <T>(arr: T[], v: number, salt: number): T => arr[(((v + 1) * 2654435761 + salt * 40503) >>> 7) % arr.length];

export function lookPalette(set: string, sex: number, v: number): Record<string, string> {
  const L = PEOPLE[set];
  const skin = pick(L.skin, v, 1), hair = pick(L.hair, v + sex * 5, 2), top = pick(L.top, v, 3), bottom = pick(L.bottom, v, 4);
  const accent = pick(L.accent, v, 5), hat = pick(L.hat, v, 6), shoes = pick(L.shoes, v, 7);
  return {
    ...PERSON_FIXED,
    s: skin, S: warmShade(skin), h: hair, H: coolShade(hair), t: top, T: coolShade(top), n: bottom, N: coolShade(bottom),
    j: accent, J: coolShade(accent), q: hat, Q: coolShade(hat), f: shoes,
  };
}

export const lookStyle = (set: string, sex: number, v: number) => {
  const st = PEOPLE[set].styles[sex & 1];
  return st[v % st.length];
};

/** One person frame as final palette letters: pose regions → outfit colors, then overlays, then height. */
function composePerson(set: string, sex: number, v: number, pose: string): string[] {
  const L = PEOPLE[set], style = lookStyle(set, sex, v), outfit = OUTFITS[style.o];
  const dir = pose.startsWith("down") ? "down" : pose.startsWith("up") ? "up" : "side";
  const base = POSES[pose];
  const grid = base.map((row, y) => [...row].map((ch, x) => {
    if (ch === ".") return ".";
    if (outfit.pattern && (ch === "u" || ch === "U" || ch === "c") && (x * 2 + y) % 3 === 0) return outfit.pattern;
    return outfit.map[ch] ?? ch;
  }));
  const layers = [...(outfit.over ?? []).map((n) => ACCESSORIES[n]), ...(style.x ?? []).map((n) => ACCESSORIES[n]), HAIR[style.h]];
  for (const layer of layers) {
    const o = layer?.[dir];
    if (!o) continue;
    o.rows.forEach((r, i) => { for (let x = 0; x < r.length; x++) if (r[x] !== "." && grid[o.y + i]) grid[o.y + i][x] = r[x]; });
  }
  let rows = grid.map((r) => r.join(""));
  if (L.short) rows = [".".repeat(8), ...rows.slice(0, 9), ...rows.slice(10)];
  return rows;
}

export function buildAtlas(): Atlas {
  const items: Pending[] = [];
  const add = (key: string, def: SpriteDef, pal: Record<string, string>, flip = false) =>
    items.push({ key, rows: def.rows, pal, flip, outline: flip ? flipSides(sides(def.outline)) : sides(def.outline) });
  const base = (def: SpriteDef, extra: Record<string, string> = {}) => ({ ...PALETTE, ...def.pal, ...extra });

  for (const [k, d] of Object.entries(TILES)) add(`tile:${k}`, d, base(d));
  // Object side views face left (-x); the right-facing view is the mirror.
  for (const [k, d] of Object.entries(OBJECT_SPRITES)) {
    add(`obj:${k}`, d, base(d));
    if (k.includes(":side")) {
      add(`obj:${k.replace(":side", ":left")}`, d, base(d));
      add(`obj:${k.replace(":side", ":right")}`, d, base(d), true);
    }
  }
  // Props for people: side views face right, like people; left is the mirror.
  for (const [k, d] of Object.entries(EXTRA_SPRITES)) {
    add(`obj:${k}`, d, base(d));
    if (k.endsWith(":side")) add(`obj:${k.replace(":side", ":left")}`, d, base(d), true);
  }
  for (const [model, pal] of Object.entries(SLOT_COLORS)) {
    for (const [k, rows] of Object.entries(SLOT_ROWS)) {
      const [face, fr] = k.split("~"), suf = fr ? `~${fr}` : "";
      const def: SpriteDef = { rows };
      if (face === "side") {
        add(`slot:${model}:left${suf}`, def, base(def, pal));
        add(`slot:${model}:right${suf}`, def, base(def, pal), true);
      } else add(`slot:${model}:${face}${suf}`, def, base(def, pal));
    }
    add(`reel:${model}`, { rows: [...REEL_STRIP, ...REEL_STRIP], outline: false }, base({ rows: [] }, pal));
  }
  const lookColor: Record<string, string[][]> = {};
  for (const [set, L] of Object.entries(PEOPLE)) {
    lookColor[set] = [[], []];
    for (let sex = 0; sex < 2; sex++) for (let v = 0; v < L.variants; v++) {
      const pal = lookPalette(set, sex, v);
      const top = OUTFITS[lookStyle(set, sex, v).o].map.u;
      lookColor[set][sex].push(pal[top] ?? pal.t);
      for (const pose of Object.keys(POSES)) {
        const def: SpriteDef = { rows: composePerson(set, sex, v, pose) };
        add(`p:${set}:${sex}:${v}:${pose}`, def, pal);
        if (pose.startsWith("side")) add(`p:${set}:${sex}:${v}:left${pose.slice(4)}`, def, pal, true);
      }
    }
  }

  // Shelf packing into a fixed-width sheet; each sprite gets PAD on every side.
  const W = 1024;
  let x = 0, y = 0, shelf = 0;
  const frames = new Map<string, Frame>();
  const placed: [Pending, Frame][] = [];
  for (const it of items) {
    const w = it.rows[0]?.length ?? 0, h = it.rows.length;
    const bad = it.rows.findIndex((r) => r.length !== w);
    if (bad >= 0) throw new Error(`sprite ${it.key}: row ${bad} is ${it.rows[bad].length} wide, expected ${w}`);
    const bw = w + 2 * PAD, bh = h + 2 * PAD;
    if (x + bw > W) { x = 0; y += shelf; shelf = 0; }
    const f = { x: x + PAD, y: y + PAD, w, h };
    frames.set(it.key, f);
    placed.push([it, f]);
    x += bw;
    shelf = Math.max(shelf, bh);
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = y + shelf;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  const D = img.data;
  const rgba = new Map<string, number[]>();
  const parse = (hex: string) => {
    let c = rgba.get(hex);
    if (!c) { c = [...rgbOf(hex), hex.length > 7 ? parseInt(hex.slice(7, 9), 16) : 255]; rgba.set(hex, c); }
    return c;
  };
  const ink = parse(INK);
  for (const [it, f] of placed) {
    const solid = new Uint8Array((f.w + 2) * (f.h + 2)); // opaque mask incl. padding, for the outline pass
    it.rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx];
        if (ch === ".") continue;
        const hex = it.pal[ch];
        if (!hex) throw new Error(`sprite ${it.key}: no color for '${ch}'`);
        const c = parse(hex);
        const px = it.flip ? f.w - 1 - rx : rx;
        const p = ((f.y + ry) * W + f.x + px) * 4;
        D[p] = c[0]; D[p + 1] = c[1]; D[p + 2] = c[2]; D[p + 3] = c[3];
        if (c[3] === 255) solid[(ry + 1) * (f.w + 2) + px + 1] = 1;
      }
    });
    if (!it.outline) continue;
    const mw = f.w + 2, mh = f.h + 2, o = it.outline;
    for (let my = 0; my < mh; my++) for (let mx = 0; mx < mw; mx++) {
      if (solid[my * mw + mx]) continue;
      if ((mx === 0 && !o.includes("l")) || (mx === mw - 1 && !o.includes("r")) || (my === 0 && !o.includes("t")) || (my === mh - 1 && !o.includes("b"))) continue;
      const n = (mx > 0 && solid[my * mw + mx - 1]) || (mx < mw - 1 && solid[my * mw + mx + 1]) || (my > 0 && solid[(my - 1) * mw + mx]) || (my < mh - 1 && solid[(my + 1) * mw + mx]);
      if (!n) continue;
      const p = ((f.y - 1 + my) * W + f.x - 1 + mx) * 4;
      if (D[p + 3] === 255) continue;
      D[p] = ink[0]; D[p + 1] = ink[1]; D[p + 2] = ink[2]; D[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, frames, lookColor };
}
