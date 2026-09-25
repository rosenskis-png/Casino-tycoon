// (Batch A) Which kinds of notice reach the ticker, kept on this device. Hidden kinds still go to the log;
// urgent notices always show.
import { Store } from "../platform/storage";

const KEY = "ct.notices";
let off: Record<string, boolean> = Store.get<Record<string, boolean>>(KEY) ?? {};

export const noticeOn = (cat: string) => !off[cat];
export function setNotice(cat: string, on: boolean) {
  off = { ...off, [cat]: !on };
  Store.set(KEY, off);
}
