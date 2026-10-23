import type { MileageDatabase } from "./db";
import {
  nowIso,
  type OutboxAction,
  type OutboxRecord,
  type ProfileRecord,
  type SyncEntity,
  type SyncableRecord,
} from "./types";

/**
 * The sync outbox. Every local create / update / soft-delete enqueues one
 * item here in the SAME Dexie transaction as the write itself (the
 * repositories and the day service open their write transactions over the
 * data table AND this table, then call enqueueChange inside), so a change
 * can never be saved locally and lost before it is queued.
 *
 * No coalescing: one item per change, carrying that write's full snapshot.
 * For one user the volume is tiny. The sync engine replays the items in
 * foreign-key dependency order (locations, profiles, days, legs), stable
 * by queue order within an entity — see sync.ts.
 */

type OutboxListener = () => void;
const listeners = new Set<OutboxListener>();

/** Notified after any outbox mutation (used to refresh the sync status). */
export function subscribeOutboxChanges(listener: OutboxListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyOutboxChanged(): void {
  for (const listener of listeners) listener();
}

/** The id the sync engine and the remote use for a record of this entity. */
export function entityIdOf(entity: SyncEntity, record: SyncableRecord): string {
  return entity === "profile"
    ? (record as ProfileRecord).user_id
    : (record as Exclude<SyncableRecord, ProfileRecord>).id;
}

/**
 * Queue one change. Must be called inside the caller's Dexie transaction
 * (with the outbox table in scope) so the queue row and the data row
 * commit — or roll back — together.
 */
export async function enqueueChange(
  database: MileageDatabase,
  entity: SyncEntity,
  record: SyncableRecord,
  action: OutboxAction = "upsert",
): Promise<void> {
  const item: OutboxRecord = {
    entity,
    entity_id: entityIdOf(entity, record),
    action,
    payload: { ...record },
    queued_at: nowIso(),
    attempts: 0,
    last_error: null,
  };
  await database.outbox.add(item);
  notifyOutboxChanged();
}

/** All queued items in replay order (oldest first). */
export async function listOutbox(database: MileageDatabase): Promise<OutboxRecord[]> {
  const rows = await database.outbox.toArray();
  return rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

export async function countOutbox(database: MileageDatabase): Promise<number> {
  return database.outbox.count();
}

/** "entity:entity_id" keys for every record that still has a queued change. */
export async function pendingEntityKeys(database: MileageDatabase): Promise<Set<string>> {
  const rows = await database.outbox.toArray();
  return new Set(rows.map((row) => `${row.entity}:${row.entity_id}`));
}

/** Remove one item after the server has confirmed it. */
export async function removeOutboxItem(database: MileageDatabase, id: number): Promise<void> {
  await database.outbox.delete(id);
  notifyOutboxChanged();
}

/** Patch one queued item (attempt bookkeeping by the sync engine). */
export async function updateOutboxItem(
  database: MileageDatabase,
  id: number,
  changes: Partial<Pick<OutboxRecord, "attempts" | "last_error">>,
): Promise<void> {
  await database.outbox.update(id, changes);
  notifyOutboxChanged();
}

/** Reset every item's failure bookkeeping (the user's Retry action). */
export async function resetOutboxAttempts(database: MileageDatabase): Promise<void> {
  await database.outbox.toCollection().modify({ attempts: 0, last_error: null });
  notifyOutboxChanged();
}
