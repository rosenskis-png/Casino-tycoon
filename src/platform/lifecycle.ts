// App lifecycle: tells the game when the page is hidden (home button, app switch) so it can pause and autosave.
export function onHidden(fn: () => void): () => void {
  const vis = () => { if (document.visibilityState === "hidden") fn(); };
  document.addEventListener("visibilitychange", vis);
  window.addEventListener("pagehide", fn);
  return () => { document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", fn); };
}

export function haptic(ms = 10) {
  try { navigator.vibrate?.(ms); } catch { /* unsupported (iOS) */ }
}
