import type { MileageDatabase } from "./db";
import { getMetaValue, META_KEYS, setMetaValue } from "./meta";
import {
  countOutbox,
  listOutbox,
  pendingEntityKeys,
  removeOutboxItem,
  resetOutboxAttempts,
  updateOutboxItem,
} from "./outbox";
import {
  nowIso,
  type DayRecord,
  type LegRecord,
  type LocationRecord,
  type OutboxRecord,
  type ProfileRecord,
  type SyncEntity,
} from "./types";

/**
 * The sync engine (Phase 4). Local (Dexie) is always the source of truth:
 * this module only copies queued changes to the server and merges newer
 * server rows back in. It is written against an injectable RemoteStore so
 * tests drive it with an in-memory fake — no network, no real client.
 *
 * Push: outbox items are replayed in queue order as upserts by client
 * UUID, so replaying an item can never create a duplicate. An item is
 * removed only after the remote confirms it. A failure bumps the item's
 * attempts, records the error and stops the run, preserving order; an
 * item that has failed maxAttempts times stays queued, locks the queue
 * and surfaces an error state until retry() resets it.
 *
 * Pull: after pushing, rows changed since the watermark are merged with
 * last-write-wins by updated_at — except records that still have a
 * pending outbox item, which are never overwritten (the local pending
 * change wins until it has been pushed). After a day's legs merge, the
 * leg chain is re-checked; a broken chain flags the day needs_review
 * instead of merging silently into a broken state.
 */

export const SYNC_ENTITIES: readonly SyncEntity[] = ["profile", "location", "day", "leg"];

/** A remote row as plain data; updated_at drives last-write-wins. */
export type RemoteRow = Record<string, unknown> & { updated_at: string };

export interface RemoteStore {
  /** Insert or update one row by its client UUID. Throws on failure. */
  upsert(entity: SyncEntity, payload: Record<string, unknown>): Promise<void>;
  /** Rows for the user with updated_at >= since (all rows when null). */
  fetchSince(entity: SyncEntity, userId: string, since: string | null): Promise<RemoteRow[]>;
}

export type SyncState = "synced" | "pending" | "offline" | "error";

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  lastError: string | null;
  /** No remote or no session: everything lives on this device only. */
  localOnly: boolean;
}

export interface SyncEngineOptions {
  database: MileageDatabase;
  /** Null when Supabase is not configured on this device. */
  remote: RemoteStore | null;
  /** The signed-in user's id, or null when signed out. Read per run. */
  getUserId: () => Promise<string | null>;
  /** Defaults to always-online; the app passes navigator.onLine. */
  isOnline?: () => boolean;
  /** Failed attempts before an item locks the queue. Defaults to 3. */
  maxAttempts?: number;
}

type StatusListener = (status: SyncStatus) => void;

const DEFAULT_STATUS: SyncStatus = {
  state: "pending",
  pendingCount: 0,
  lastError: null,
  localOnly: false,
};

/** The payload as the server should see it: local-only fields stripped. */
export function toRemotePayload(item: OutboxRecord): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...(item.payload as unknown as Record<string, unknown>),
  };
  if (item.entity === "day") {
    delete payload.needs_review;
  }
  return payload;
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : "Unknown sync error";
}

export class SyncEngine {
  private readonly database: MileageDatabase;
  private readonly remote: RemoteStore | null;
  private readonly getUserId: () => Promise<string | null>;
  private readonly isOnline: () => boolean;
  private readonly maxAttempts: number;
  private readonly listeners = new Set<StatusListener>();
  private status: SyncStatus = DEFAULT_STATUS;
  private running: Promise<SyncStatus> | null = null;

  constructor(options: SyncEngineOptions) {
    this.database = options.database;
    this.remote = options.remote;
    this.getUserId = options.getUserId;
    this.isOnline = options.isOnline ?? (() => true);
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  private setStatus(next: SyncStatus): void {
    const current = this.status;
    if (
      current.state === next.state &&
      current.pendingCount === next.pendingCount &&
      current.lastError === next.lastError &&
      current.localOnly === next.localOnly
    ) {
      return;
    }
    this.status = next;
    for (const listener of this.listeners) listener(next);
  }

  /**
   * Recompute the status from the outbox alone (no network). State
   * precedence: a locked (3-times-failed) item is an error; offline beats
   * pending; an empty queue with nowhere to sync is still just local.
   */
  async refreshStatus(): Promise<SyncStatus> {
    const items = await listOutbox(this.database);
    const pendingCount = items.length;
    const locked = items.find((item) => item.attempts >= this.maxAttempts);
    const firstError = items.find((item) => item.last_error !== null);
    const userId = this.remote ? await this.getUserId() : null;
    const localOnly = !this.remote || userId === null;

    let state: SyncState;
    if (locked) state = "error";
    else if (localOnly) state = pendingCount > 0 ? "pending" : "offline";
    else if (!this.isOnline()) state = "offline";
    else if (pendingCount > 0) state = "pending";
    else state = "synced";

    const next: SyncStatus = {
      state,
      pendingCount,
      lastError: locked ? locked.last_error : (firstError?.last_error ?? null),
      localOnly,
    };
    this.setStatus(next);
    return next;
  }

  /** Run one push + pull cycle. Concurrent calls collapse into one run. */
  runSync(): Promise<SyncStatus> {
    if (this.running) return this.running;
    this.running = this.doRun().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** The user's Retry: clear failure bookkeeping, then run again. */
  async retry(): Promise<SyncStatus> {
    await resetOutboxAttempts(this.database);
    return this.runSync();
  }

  private async doRun(): Promise<SyncStatus> {
    if (!this.remote) return this.refreshStatus();
    const userId = await this.getUserId();
    if (userId === null) return this.refreshStatus();
    if (!this.isOnline()) return this.refreshStatus();

    await this.pushOutbox();
    if (this.isOnline()) {
      await this.pullRemote(userId);
      await setMetaValue(this.database, META_KEYS.lastSyncAt, nowIso());
    }
    return this.refreshStatus();
  }

  private async pushOutbox(): Promise<void> {
    const remote = this.remote;
    if (!remote) return;
    const items = await listOutbox(this.database);
    for (const item of items) {
      if (item.id === undefined) continue;
      if (item.attempts >= this.maxAttempts) {
        // Locked: stays queued and surfaces via the status until retry().
        return;
      }
      try {
        await remote.upsert(item.entity, toRemotePayload(item));
      } catch (caught) {
        await updateOutboxItem(this.database, item.id, {
          attempts: item.attempts + 1,
          last_error: errorMessage(caught),
        });
        return; // Stop at the failed item; queue order is preserved.
      }
      await removeOutboxItem(this.database, item.id);
    }
  }

  private async pullRemote(userId: string): Promise<void> {
    const remote = this.remote;
    if (!remote) return;
    const since = await getMetaValue(this.database, META_KEYS.lastPulledAt);
    const pending = await pendingEntityKeys(this.database);
    const affectedDayIds = new Set<string>();
    let maxUpdated: string | null = since;

    for (const entity of SYNC_ENTITIES) {
      let rows: RemoteRow[];
      try {
        rows = await remote.fetchSince(entity, userId, since);
      } catch {
        // A failed pull leaves the watermark untouched; the next run
        // retries. Push results from this run still stand.
        return;
      }
      for (const row of rows) {
        if (
          typeof row.updated_at === "string" &&
          (maxUpdated === null || row.updated_at > maxUpdated)
        ) {
          maxUpdated = row.updated_at;
        }
        const entityId = entity === "profile" ? String(row.user_id ?? "") : String(row.id ?? "");
        if (!entityId || pending.has(`${entity}:${entityId}`)) continue;
        const merged = await this.mergeRow(entity, row);
        if (merged && entity === "leg") {
          affectedDayIds.add(String(row.day_id ?? ""));
        }
        if (merged && entity === "day") {
          affectedDayIds.add(entityId);
        }
      }
    }

    for (const dayId of affectedDayIds) {
      if (dayId) await this.checkDayChain(dayId);
    }
    if (maxUpdated !== null && maxUpdated !== since) {
      await setMetaValue(this.database, META_KEYS.lastPulledAt, maxUpdated);
    }
  }

  /** Merge one remote row into Dexie, last-write-wins. True if applied. */
  private async mergeRow(entity: SyncEntity, row: RemoteRow): Promise<boolean> {
    const database = this.database;
    switch (entity) {
      case "profile": {
        const local = await database.profiles.get(String(row.user_id ?? ""));
        if (local && local.updated_at >= row.updated_at) return false;
        await database.profiles.put(row as unknown as ProfileRecord);
        return true;
      }
      case "location": {
        const local = await database.locations.get(String(row.id ?? ""));
        if (local && local.updated_at >= row.updated_at) return false;
        await database.locations.put(row as unknown as LocationRecord);
        return true;
      }
      case "day": {
        const local = await database.days.get(String(row.id ?? ""));
        if (local && local.updated_at >= row.updated_at) return false;
        const merged: DayRecord = { ...(row as unknown as DayRecord) };
        // The review flag is local-only state; keep it across merges —
        // checkDayChain recomputes it right after.
        if (local?.needs_review) merged.needs_review = true;
        await database.days.put(merged);
        return true;
      }
      case "leg": {
        const local = await database.legs.get(String(row.id ?? ""));
        if (local && local.updated_at >= row.updated_at) return false;
        await database.legs.put(row as unknown as LegRecord);
        return true;
      }
    }
  }

  /**
   * Re-check one day's leg chain after a merge: every leg's odo_start
   * must equal the previous leg's odo_end. A broken chain flags the day
   * for review (local-only, no updated_at bump, nothing re-queued).
   */
  private async checkDayChain(dayId: string): Promise<void> {
    const day = await this.database.days.get(dayId);
    if (!day) return;
    const legs = (await this.database.legs.where("day_id").equals(dayId).toArray())
      .filter((leg) => leg.deleted_at === null)
      .sort((a, b) => a.position - b.position);
    let broken = false;
    for (let index = 1; index < legs.length; index += 1) {
      const previous = legs[index - 1];
      const current = legs[index];
      if (previous && current && current.odo_start !== previous.odo_end) {
        broken = true;
        break;
      }
    }
    if (broken === Boolean(day.needs_review)) return;
    const updated: DayRecord = { ...day };
    if (broken) updated.needs_review = true;
    else delete updated.needs_review;
    await this.database.days.put(updated);
  }
}

/** Number of queued changes, for callers that only need the count. */
export async function pendingChangeCount(database: MileageDatabase): Promise<number> {
  return countOutbox(database);
}
