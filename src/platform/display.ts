// Display settings kept on the device (owner, M8.5): the interface size. Applied as a class on the page root; the
// panels, bars and play screens scale with it (the floor itself zooms with its own buttons).
import { Store } from "./storage";

const KEY = "ct-ui";
export const UI_SIZES = ["Small", "Normal", "Large"];
let size = (() => { const v = Store.get<number>(KEY); return typeof v === "number" && v >= 0 && v <= 2 ? v : 1; })();

function apply() {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.toggle("ui-s", size === 0);
  el.classList.toggle("ui-l", size === 2);
}
apply();
export const uiSize = () => size;
export function setUiSize(v: number) {
  size = Math.max(0, Math.min(2, Math.round(v)));
  Store.set(KEY, size);
  apply();
}
