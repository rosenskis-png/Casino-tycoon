// Compiles data/art text sprites into one atlas canvas at load. Frames then blit cached pixels.
import { EXTRA_SPRITES, OBJECT_SPRITES, PALETTE, PEOPLE, PERSON, SLOT_COLORS, SLOT_ROWS, TILES, type SpriteDef } from "../data/art";

export interface Frame { x: number; y: number; w: number; h: number }

export interface Atlas {
  canvas: HTMLCanvasElement;
  frames: Map<string, Frame>;
  /** Shirt color per look variant of each people set, for simplified sprites at far zoom. */
  lookColor: Record<string, string[]>;
}

interface Pending { key: string; rows: string[]; pal: Record<string, string>; flip: boolean }

export function lookPalette(set: string, v: number): Record<string, string> {
  const L = PEOPLE[set];
  return {
    s: L.skin[v % L.skin.length],
    h: L.hair[(v * 3 + 1) % L.hair.length],
    t: L.shirt[(v * 7 + 2) % L.shirt.length],
    n: L.pants[(v * 2 + 1) % L.pants.length],
  };
}

export function buildAtlas(): Atlas {
  const items: Pending[] = [];
  const add = (key: string, def: SpriteDef, extra: Record<string, string> = {}, flip = false) =>
    items.push({ key, rows: def.rows, pal: { ...PALETTE, ...def.pal, ...extra }, flip });
  for (const [k, d] of Object.entries(TILES)) add(`tile:${k}`, d);
  for (const [k, d] of Object.entries(OBJECT_SPRITES)) add(`obj:${k}`, d);
  for (const [k, d] of Object.entries(EXTRA_SPRITES)) add(`obj:${k}`, d);
  for (const [model, pal] of Object.entries(SLOT_COLORS)) {
    add(`slot:${model}:front`, { rows: SLOT_ROWS.front }, pal);
    add(`slot:${model}:back`, { rows: SLOT_ROWS.back }, pal);
    add(`slot:${model}:left`, { rows: SLOT_ROWS.side }, pal);
    add(`slot:${model}:right`, { rows: SLOT_ROWS.side }, pal, true);
  }
  const lookColor: Record<string, string[]> = {};
  for (const [set, L] of Object.entries(PEOPLE)) {
    lookColor[set] = [];
    for (let v = 0; v < L.variants; v++) {
      const pal = lookPalette(set, v);
      lookColor[set].push(pal.t);
      for (const [f, rows] of Object.entries(PERSON)) {
        add(`p:${set}:${v}:${f}`, { rows }, pal);
        if (f.startsWith("side")) add(`p:${set}:${v}:left${f.slice(4)}`, { rows }, pal, true);
      }
    }
  }
  // Shelf packing into a fixed-width sheet.
  const W = 512;
  let x = 0, y = 0, shelf = 0;
  const frames = new Map<string, Frame>();
  const placed: [Pending, Frame][] = [];
  for (const it of items) {
    const w = Math.max(...it.rows.map((r) => r.length)), h = it.rows.length;
    if (x + w > W) { x = 0; y += shelf + 1; shelf = 0; }
    const f = { x, y, w, h };
    frames.set(it.key, f);
    placed.push([it, f]);
    x += w + 1;
    shelf = Math.max(shelf, h);
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = y + shelf + 1;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(canvas.width, canvas.height);
  const rgb = new Map<string, [number, number, number]>();
  const parse = (hex: string) => {
    let c = rgb.get(hex);
    if (!c) { const n = parseInt(hex.slice(1), 16); c = [n >> 16, (n >> 8) & 255, n & 255]; rgb.set(hex, c); }
    return c;
  };
  for (const [it, f] of placed) {
    it.rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx];
        if (ch === ".") continue;
        const hex = it.pal[ch];
        if (!hex) throw new Error(`sprite ${it.key}: no color for '${ch}'`);
        const [r, g, b] = parse(hex);
        const px = f.x + (it.flip ? f.w - 1 - rx : rx), p = ((f.y + ry) * canvas.width + px) * 4;
        img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = 255;
      }
    });
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, frames, lookColor };
}
