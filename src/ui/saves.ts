// Save slots on top of platform/storage: autosave, one manual slot, and file export/import.
import { Game, loadState } from "../sim";
import { Store, exportFile, importFile } from "../platform/storage";

export const AUTO_KEY = "ct.save.auto";
export const MANUAL_KEY = "ct.save.manual";
const BROKEN_KEY = "ct.save.broken";

export function save(g: Game, key = AUTO_KEY) { Store.set(key, g.state); }

/** Loads a slot; a damaged save is set aside (not deleted) and null returned. */
export function load(key = AUTO_KEY): { game: Game | null; error?: string } {
  const raw = Store.get<unknown>(key);
  if (raw == null) return { game: null };
  try { return { game: loadState(raw) }; } catch (e) {
    Store.set(BROKEN_KEY, raw);
    return { game: null, error: (e as Error).message };
  }
}

/** Fresh sandbox with a crowd of test walkers so the engine has something to show (M1). */
export function newGame(seed: number): Game {
  const g = Game.create("sandbox", seed);
  g.dispatch({ type: "spawnWalkers", n: 150 });
  return g;
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
