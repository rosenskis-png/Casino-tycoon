// Save slots on top of platform/storage: autosave, one manual slot, and file export/import.
import { Game, loadState, formatDate, TICKS_PER_DAY } from "../sim";
import { DEFAULT_SCENARIO } from "../data/scenarios";
import { Store, exportFile, importFile } from "../platform/storage";

export const AUTO_KEY = "ct.save.auto";
export const MANUAL_KEY = "ct.save.manual";
const BROKEN_KEY = "ct.save.broken";

/** Saves; true when it's safely on the device (false: kept for this session only). */
export function save(g: Game, key = AUTO_KEY): boolean { return Store.set(key, g.state); }

/** (Batch A) The save confirmation line. */
export function savedNote(ok: boolean, g: Game): string {
  return ok ? `✓ Saved (${formatDate(Math.floor(g.state.tick / TICKS_PER_DAY))}).` : "⚠ Saved for this session only: this browser blocked storage. Export a backup file.";
}

/** Loads a slot; a damaged save is set aside (not deleted) and null returned. */
export function load(key = AUTO_KEY): { game: Game | null; error?: string } {
  const raw = Store.get<unknown>(key);
  if (raw == null) return { game: null };
  try { return { game: loadState(raw) }; } catch (e) {
    Store.set(BROKEN_KEY, raw);
    return { game: null, error: (e as Error).message };
  }
}

export function newGame(seed: number, scenario = DEFAULT_SCENARIO): Game {
  return Game.create(scenario, seed);
}

export const hasSave = (key: string) => Store.get(key) != null;

export function exportSave(g: Game) {
  exportFile(`casino-tycoon-day${Math.floor(g.state.tick / 200) + 1}.json`, g.state);
}

export async function importSave(): Promise<{ game: Game | null; error?: string }> {
  const raw = await importFile<unknown>();
  if (raw == null) return { game: null };
  try { return { game: loadState(raw) }; } catch (e) { return { game: null, error: (e as Error).message }; }
}
