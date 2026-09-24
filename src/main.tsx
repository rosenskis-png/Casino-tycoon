import { createRoot } from "react-dom/client";
import { Game, smoke } from "./sim";
import { requestPersistence } from "./platform/storage";
import { App } from "./ui/App";
import { load, newGame } from "./ui/saves";
import type { TickerItem } from "./ui/ticker";
import { perfTest } from "./ui/perf";
import "./ui/styles.css";

void requestPersistence();
const { game, error } = load();
const bootNote: TickerItem | undefined = error ? { level: "urgent", text: `Your save couldn't load (${error}). It was set aside; starting fresh.` } : undefined;
const initial = game ?? newGame(Date.now());

// Debug hook for the smoke test and chat-driven checks (CLAUDE.md).
Object.assign(window, {
  __ct: {
    smoke,
    perf: () => perfTest(390, 700),
    /** Starts a scenario (screenshots of hidden floors). */
    scenario: (id: string) => (window as unknown as { __ctHost?: { setGame(g: Game): void } }).__ctHost?.setGame(newGame(Date.now(), id)),
    get game() { return (window as unknown as { __ctHost?: { game: Game } }).__ctHost?.game; },
  },
});

createRoot(document.getElementById("root")!).render(<App initial={initial} bootNote={bootNote} />);
