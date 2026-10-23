import type { DaySnapshot } from "./dayService";

/**
 * In-memory hand-off for Undo: after a save or delete, the day snapshot
 * taken just before the change is parked here under a token and named in
 * the navigation state, so the screen the user lands on can offer Undo
 * for 10 seconds. Snapshots never leave the device or the session.
 */
const snapshots = new Map<string, DaySnapshot>();

export function storeUndoSnapshot(snapshot: DaySnapshot): string {
  const token = globalThis.crypto.randomUUID();
  snapshots.set(token, snapshot);
  return token;
}

export function peekUndoSnapshot(token: string | null | undefined): DaySnapshot | null {
  if (!token) return null;
  return snapshots.get(token) ?? null;
}

export function dropUndoSnapshot(token: string | null | undefined): void {
  if (token) snapshots.delete(token);
}
