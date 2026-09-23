// Browser storage adapter. Knows nothing about the save format: it stores and moves JSON blobs.
// Falls back to memory where localStorage is blocked (sandboxed previews, private mode).

const mem = new Map<string, string>();

export const Store = {
  get<T>(key: string): T | null {
    let raw: string | null | undefined;
    try { raw = window.localStorage.getItem(key); } catch { raw = mem.get(key); }
    if (raw == null) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },
  set(key: string, value: unknown): void {
    const raw = JSON.stringify(value);
    try { window.localStorage.setItem(key, raw); } catch { mem.set(key, raw); }
  },
  del(key: string): void {
    try { window.localStorage.removeItem(key); } catch { /* blocked */ }
    mem.delete(key);
  },
};

// Asks the browser not to evict our data. iOS grants this to home-screen web apps.
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

// Save backup: hands the player a .json file (share sheet on iPhone lets them put it in Files).
export function exportFile(name: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Opens the file picker and resolves with the parsed JSON, or null if cancelled or unreadable.
export function importFile<T>(): Promise<T | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try { resolve(JSON.parse(await f.text()) as T); } catch { resolve(null); }
    };
    input.click();
  });
}
