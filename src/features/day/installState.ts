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
 * True for iPhone/iPad/iPod user agents. iPadOS 13+ Safari sends a
 * Macintosh UA, so a multi-touch Macintosh is treated as an iPad.
 */
export function isAppleMobileUserAgent(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/** The install card is shown at most this many times (brief: never
    show it again once installed or dismissed twice). */
export const MAX_INSTALL_CARD_DISMISSALS = 2;

export interface InstallCardVisibility {
  /** Running installed (standalone display) right now. */
  standalone: boolean;
  /** Known to be installed (appinstalled event / a standalone launch). */
  installed: boolean;
  /** Times the card has been dismissed so far. */
  dismissals: number;
}

/** Whether the iOS install card should be offered. */
export function shouldShowInstallCard(visibility: InstallCardVisibility): boolean {
  return (
    !visibility.standalone &&
    !visibility.installed &&
    visibility.dismissals < MAX_INSTALL_CARD_DISMISSALS
  );
}

/**
 * Effective dismissal count from stored meta: the Phase 2 count key
 * wins; the pre-Phase-2 boolean ("1" = dismissed once) counts as one
 * dismissal, so users who dismissed the old hint see the new card at
 * most once more.
 */
export function installDismissalCount(
  rawCount: string | null,
  legacyDismissed: string | null,
): number {
  if (rawCount !== null) {
    const parsed = Number.parseInt(rawCount, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return legacyDismissed === "1" ? 1 : 0;
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
