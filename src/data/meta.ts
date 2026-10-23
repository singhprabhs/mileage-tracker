import type { MileageDatabase } from "./db";

/** Keys for the small pieces of app state kept in the meta table. */
export const META_KEYS = {
  /** ISO timestamp watermark for sync pulls (max updated_at seen). */
  lastPulledAt: "lastPulledAt",
  /** ISO timestamp of the last completed sync run. */
  lastSyncAt: "lastSyncAt",
  /** ISO timestamp of the last weekly backup reminder (Phase 5 feature). */
  backupReminderAt: "backupReminderAt",
  /** "1" once the user has dismissed the Add to Home Screen hint. */
  installHintDismissed: "installHintDismissed",
} as const;

export async function getMetaValue(database: MileageDatabase, key: string): Promise<string | null> {
  const row = await database.meta.get(key);
  return row ? row.value : null;
}

export async function setMetaValue(
  database: MileageDatabase,
  key: string,
  value: string,
): Promise<void> {
  await database.meta.put({ key, value });
}
