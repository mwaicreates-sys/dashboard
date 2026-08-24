// v2: seed data model changed (Account.balance → openingBalance/currentBalance,
// Goal.title → name). Bumped the prefix so stale v1 entries in localStorage
// are ignored and the dashboard rehydrates from the new seed.
const STORAGE_PREFIX = "budgeting-dashboard-v2-";

export function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export function clearStorage(): void {
  if (typeof window === "undefined") return;
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(k);
      }
    });
  } catch {
    // ignore
  }
}
