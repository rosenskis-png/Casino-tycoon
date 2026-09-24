// Layouts of sized amenities (docs/spec/construction.md): the cells, seats and staff an amenity gets from its
// size, in its own rotation-0 frame (w front width × h depth; row 0 is the back, the front faces down). Pure and
// memoized: the same kind and size always gives the same layout.
import type { SeatDef, SizedDef } from "../data/objects";

/** What stands on one footprint tile. Walkable cells (seats, aisles, dance floor) have block false. */
export interface Cell { k: string; block: boolean; opaque: boolean }
/** Someone who works there (drawn, and folded into upkeep): a bartender, cook, teller, performer or DJ. */
export interface StaffSpot { dx: number; dy: number; k: string }
export interface Layout { w: number; h: number; cells: Cell[]; seats: SeatDef[]; staff: StaffSpot[] }

const solid = (k: string, opaque = false): Cell => ({ k, block: true, opaque });
const open = (k: string): Cell => ({ k, block: false, opaque: false });

const cache = new Map<string, Layout>();

export function sizedLayout(sd: SizedDef, w: number, h: number): Layout {
  const key = `${sd.layout}:${w}x${h}`;
  let L = cache.get(key);
  if (!L) cache.set(key, (L = build(sd, w, h)));
  return L;
}

/** Tables with chairs either side along a row (x % 3 == 1 is a table); chairs only next to a table. */
function tableRow(L: Layout, y: number, tableKind: string) {
  const { w } = L;
  for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (x % 3 === 1) L.cells[i] = solid(tableKind);
    else if (x % 3 === 0 && x + 1 < w) { L.cells[i] = open("chair"); L.seats.push({ dx: x, dy: y, kind: "chair", f: 3 }); }
    else if (x % 3 === 2) { L.cells[i] = open("chair"); L.seats.push({ dx: x, dy: y, kind: "chair", f: 1 }); }
  }
}

function build(sd: SizedDef, w: number, h: number): Layout {
  const L: Layout = { w, h, cells: new Array(w * h).fill(null).map(() => open("floor")), seats: [], staff: [] };
  const staffAlong = (y: number, k: string) => {
    const n = Math.max(1, Math.ceil(w / sd.staffEvery));
    for (let j = 0; j < n; j++) L.staff.push({ dx: Math.min(w - 1, Math.floor(((j + 0.5) * w) / n)), dy: y, k });
  };
  switch (sd.layout) {
    case "bar": {
      // Counter at the back with bartenders behind it, a stool row in front of it, lounge tables beyond.
      for (let x = 0; x < w; x++) L.cells[x] = solid("counter");
      staffAlong(0, "bartender");
      // Stools first, in order along the counter (old saves' seat numbers carry over).
      for (let x = 0; x < w; x++) { L.cells[w + x] = open("stool"); L.seats.push({ dx: x, dy: 1, kind: "stool", f: 2 }); }
      for (let y = 2; y < h; y++) if ((y - 2) % 2 === 0) tableRow(L, y, "table");
      break;
    }
    case "restroom": {
      // A closed block; stalls open off the front edge, two per tile at most (a line forms outside).
      L.cells = L.cells.map(() => solid("stall", true));
      const n = Math.floor((w * h) / 2);
      for (let j = 0; j < n; j++) L.seats.push({ dx: j % w, dy: h, kind: "hidden" });
      break;
    }
    case "cage": {
      L.cells = L.cells.map(() => solid("window", true));
      for (let x = 0; x < w; x++) { L.seats.push({ dx: x, dy: h, kind: "stand", f: 2 }); L.staff.push({ dx: x, dy: 0, k: "teller" }); }
      break;
    }
    case "restaurant": {
      // Kitchen along the back with cooks; table rows with an aisle between each.
      for (let x = 0; x < w; x++) L.cells[x] = solid("kitchen");
      staffAlong(0, "cook");
      for (let y = 1; y < h; y++) if ((y - 1) % 2 === 0) tableRow(L, y, "dtable");
      break;
    }
    case "show": {
      // A two-row stage with performers; rows of seats facing it, an aisle every fifth column.
      for (let y = 0; y < 2; y++) for (let x = 0; x < w; x++) L.cells[y * w + x] = solid("stage");
      const n = Math.max(1, Math.floor(w / 3));
      for (let j = 0; j < n; j++) L.staff.push({ dx: Math.floor(((j + 0.5) * w) / n), dy: 1, k: "performer" });
      for (let y = 2; y < h; y++) for (let x = 0; x < w; x++) {
        if (x % 5 === 4) { L.cells[y * w + x] = open("aisle"); continue; }
        L.cells[y * w + x] = open("seat");
        L.seats.push({ dx: x, dy: y, kind: "chair", f: 2 });
      }
      break;
    }
    case "club": {
      // The DJ booth in the middle of the back wall, speakers either side; everything else is dance floor.
      const c = Math.floor((w - 2) / 2);
      for (let x = 0; x < w; x++) L.cells[x] = solid(x === 0 || x === w - 1 ? "speaker" : x === c || x === c + 1 ? "booth" : "backdrop");
      L.staff.push({ dx: c, dy: 0, k: "dj" });
      for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) { L.cells[y * w + x] = open("dance"); L.seats.push({ dx: x, dy: y, kind: "dance", f: 2 }); }
      break;
    }
  }
  return L;
}

/** Tier from seats: the first tier, then one more per threshold reached. */
export function tierFor(sd: SizedDef, seats: number): number {
  let t = 0;
  for (const at of sd.tierAt) if (seats >= at) t++;
  return t;
}
