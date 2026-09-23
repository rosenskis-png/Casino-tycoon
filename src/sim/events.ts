// Event bus: systems emit plain events during a step; consumers (ticker, audio, fx, stats, renderer caches)
// drain them afterwards. Events are transient and never saved.
export type SimEvent =
  | { type: "tilesChanged"; tiles: number[] }
  | { type: "objectPlaced"; id: number; kind: string; x: number; y: number }
  | { type: "objectRemoved"; id: number; x: number; y: number }
  | { type: "roomsChanged" }
  | { type: "news"; level: NewsLevel; text: string }
  | { type: "sound"; id: string; x?: number; y?: number }
  | { type: "day"; day: number }
  | { type: "month"; month: number; year: number }
  | { type: "commandRejected"; command: string; reason: string };

export type NewsLevel = "info" | "good" | "urgent";

export class EventBus {
  private queue: SimEvent[] = [];
  private listeners: ((e: SimEvent) => void)[] = [];
  emit(e: SimEvent) { this.queue.push(e); }
  /** Subscribe to events delivered on flush. Returns an unsubscribe function. */
  on(fn: (e: SimEvent) => void) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }
  flush() {
    const q = this.queue;
    this.queue = [];
    for (const e of q) for (const l of this.listeners) l(e);
  }
}
