// The slot design library (docs/spec/designer.md §11): designs kept on this device across every save, with what
// the lab said when each was saved. Plain localStorage; a design placed in a casino is copied into that save.
import type { SlotDesign } from "../data/designer";

export interface LibEntry {
  key: string;
  d: SlotDesign;
  saved: number;
  /** Lab ratings when saved (Excitement for the casino it was saved from), and that casino's scenario. */
  ex?: number; int?: number; drain?: number; where?: string;
  /** (M8.6) Its life in a casino: sold to a maker (and the most machines it reached out there), an Evergreen. */
  sold?: string; peak?: number; ever?: 1;
}

const KEY = "ct-slot-library";

export function loadLibrary(): LibEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((e) => e && e.d && e.key) : [];
  } catch { return []; }
}

export function saveToLibrary(e: Omit<LibEntry, "key" | "saved"> & { key?: string }): LibEntry[] {
  const lib = loadLibrary();
  const key = e.key ?? `L${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const entry: LibEntry = { ...e, key, saved: Date.now() };
  const i = lib.findIndex((q) => q.key === key);
  if (i >= 0) lib[i] = entry; else lib.unshift(entry);
  try { localStorage.setItem(KEY, JSON.stringify(lib.slice(0, 200))); } catch { /* storage full or blocked */ }
  return lib;
}

/** (M8.6) Note a design's achievements on every library entry with the same math. Returns the library. */
export function noteInLibrary(match: (d: SlotDesign) => boolean, note: Pick<LibEntry, "sold" | "peak" | "ever">): LibEntry[] {
  const lib = loadLibrary();
  let changed = false;
  for (const e of lib) {
    if (!match(e.d)) continue;
    for (const [k, v] of Object.entries(note) as [keyof typeof note, never][]) if (v !== undefined && e[k] !== v) { e[k] = v; changed = true; }
  }
  if (changed) try { localStorage.setItem(KEY, JSON.stringify(lib)); } catch { /* ignore */ }
  return lib;
}

export function removeFromLibrary(key: string): LibEntry[] {
  const lib = loadLibrary().filter((q) => q.key !== key);
  try { localStorage.setItem(KEY, JSON.stringify(lib)); } catch { /* ignore */ }
  return lib;
}

/** A design as a short text code to share, and back (null if it isn't one). */
export function designCode(d: SlotDesign): string {
  const json = JSON.stringify({ ...d, id: "" });
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `CTSLOT1:${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
export function parseCode(code: string): SlotDesign | null {
  const m = code.trim().match(/^CTSLOT1:([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const d = JSON.parse(new TextDecoder().decode(bytes));
    return d && typeof d === "object" && d.layout ? (d as SlotDesign) : null;
  } catch { return null; }
}
