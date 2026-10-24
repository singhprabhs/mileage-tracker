/**
 * First-run tour bookkeeping (UI Polish Phase 6). The tour is
 * offered once: Today shows it when the first-launch setup hands
 * over with a "show the tour" request AND this flag is unset.
 * Gating on the setup hand-off (not just the flag) means existing
 * users updating the app never get an uninvited tour — Settings →
 * About → "Replay the tour" is their door. Finishing or skipping
 * sets the flag; replaying from Settings ignores it.
 */

export const TOUR_SEEN_KEY = "mt-tour-seen";

/** Parse the stored flag; only the exact written value counts. */
export function tourSeen(raw: string | null): boolean {
  return raw === "1";
}

export function readTourSeen(): boolean {
  try {
    return tourSeen(window.localStorage.getItem(TOUR_SEEN_KEY));
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    // Storage unavailable: the tour may offer itself again after a
    // future setup — harmless.
  }
}
