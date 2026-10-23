/**
 * True when the app is already running installed (Home Screen / standalone
 * display mode; navigator.standalone is the iOS Safari spelling).
 */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneNavigator = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    standaloneNavigator.standalone === true
  );
}

/**
 * Ask the browser to keep this origin's storage (the local logs) around
 * where the platform supports persistent storage. Best-effort.
 */
export function requestPersistentStorage(): void {
  if (typeof navigator !== "undefined" && typeof navigator.storage?.persist === "function") {
    void navigator.storage.persist().catch(() => undefined);
  }
}
