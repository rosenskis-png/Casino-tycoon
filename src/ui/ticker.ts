// Ticker display rules (FOUNDATIONS §21): each item shows 1–10 s; a new item replaces the current one after its
// 1 s minimum; backlog shows 1 s each; red (urgent) jumps the queue and holds its full 10 s.
import type { NewsLevel } from "../sim";

export interface TickerItem { level: NewsLevel; text: string }
const MIN_MS = 1000, MAX_MS = 10_000;

export class Ticker {
  current: TickerItem | null = null;
  private shownAt = 0;
  private queue: TickerItem[] = [];

  push(item: TickerItem, now: number) {
    if (item.level === "urgent") this.queue.unshift(item);
    else this.queue.push(item);
    this.update(now);
  }

  clearQueue() { this.queue = []; }

  /** Returns true when what's shown changed. */
  update(now: number): boolean {
    const age = now - this.shownAt;
    const cur = this.current;
    const hold = cur?.level === "urgent" ? MAX_MS : MIN_MS;
    if (this.queue.length && (!cur || age >= hold || (this.queue[0].level === "urgent" && cur.level !== "urgent"))) {
      this.current = this.queue.shift()!;
      this.shownAt = now;
      return true;
    }
    if (cur && age >= MAX_MS) { this.current = null; return true; }
    return false;
  }
}
