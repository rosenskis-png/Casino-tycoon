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
  | { type: "commandRejected"; command: string; reason: string }
  | { type: "jackpot"; obj: number; amount: number; x: number; y: number }
  | { type: "broken"; obj: number }
  | { type: "arrived"; guestType: string; n: number; regular: number; intent: string }
  | {
      type: "departed"; guestType: string; pid: number; lead: number; minutes: number; play: number; budget: number; lost: number;
      intend: number; peak: number; atm: number; drinks: number; served: number; withdrawn: number; trips: number; score: number; why: string; chase: number;
      warned: number; ejected: number; cheat: number; luck: number; caught: number; won: number; wagered: number;
      /** M6: minutes at a meal, a show or dancing; money spent on them and at doors; a smoker. */
      fun: number; spent: number; smoker: number;
      /** M7: skill (0-2), a card counter, marked by the player or a pit boss. */
      skill: number; counter: number; marked: number;
    }
  | { type: "incident"; kind: string; x: number; y: number; guestType: string };

/** warn: yellow (reports); bad: red, but queued like any other item (jackpots, police); urgent: red and jumps the queue. */
export type NewsLevel = "info" | "good" | "warn" | "bad" | "urgent";

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
