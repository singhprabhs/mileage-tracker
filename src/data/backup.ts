import type { MileageDatabase } from "./db";
import { META_KEYS, getMetaValue, setMetaValue } from "./meta";
import { enqueueChange } from "./outbox";
import {
  nowIso,
  type DayRecord,
  type LegRecord,
  type LocationRecord,
  type ProfileRecord,
} from "./types";

/**
 * JSON backup and restore (brief: Settings has Export backup and
 * Import backup). The export is a versioned JSON file holding every
 * local row — profile, locations, days and legs, including soft-deleted
 * rows, so a restore is exact. Import validates the file, replaces the
 * local data, and queues every record in the outbox (in dependency
 * order via the sync engine's push), so the restored data uploads
 * cleanly on the next sync.
 */

export const BACKUP_FORMAT = "mileage-tracker-backup";
export const BACKUP_VERSION = 1;

export interface BackupData {
  profiles: ProfileRecord[];
  locations: LocationRecord[];
  days: DayRecord[];
  legs: LegRecord[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  data: BackupData;
}

/** Collect every local row into a backup object. */
export async function collectBackup(database: MileageDatabase): Promise<BackupFile> {
  const [profiles, locations, days, legs] = await Promise.all([
    database.profiles.toArray(),
    database.locations.toArray(),
    database.days.toArray(),
    database.legs.toArray(),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: nowIso(),
    data: { profiles, locations, days, legs },
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(message);
}

/**
 * Parse and validate a backup file's text. Throws an Error with a
 * user-readable message when the file is not a usable backup; nothing
 * is imported from a file that fails validation.
 */
export function parseBackup(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("That file is not valid JSON, so it cannot be a mileage backup.");
  }
  if (!isRecord(parsed)) fail("That file does not look like a mileage backup.");
  if (parsed.format !== BACKUP_FORMAT) {
    fail("That file is not a mileage tracker backup.");
  }
  if (typeof parsed.version !== "number" || parsed.version < 1) {
    fail("That backup has no readable version.");
  }
  if (parsed.version > BACKUP_VERSION) {
    fail("That backup was made by a newer version of the app. Update the app, then import it.");
  }
  if (!isRecord(parsed.data)) fail("That backup is missing its data section.");
  const { profiles, locations, days, legs } = parsed.data as Record<string, unknown>;
  if (
    !Array.isArray(profiles) ||
    !Array.isArray(locations) ||
    !Array.isArray(days) ||
    !Array.isArray(legs)
  ) {
    fail("That backup is missing one of its data tables (profile, locations, days, legs).");
  }
  for (const profile of profiles) {
    if (!isRecord(profile) || typeof profile.user_id !== "string" || profile.user_id === "") {
      fail("That backup has a profile row without a user id.");
    }
  }
  for (const location of locations) {
    if (!isRecord(location) || typeof location.id !== "string" || location.id === "") {
      fail("That backup has a location row without an id.");
    }
  }
  const dayIds = new Set<string>();
  for (const day of days) {
    if (!isRecord(day) || typeof day.id !== "string" || day.id === "") {
      fail("That backup has a day row without an id.");
    }
    if (typeof day.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
      fail("That backup has a day row without a valid date.");
    }
    dayIds.add(day.id);
  }
  for (const leg of legs) {
    if (!isRecord(leg) || typeof leg.id !== "string" || leg.id === "") {
      fail("That backup has a leg row without an id.");
    }
    if (typeof leg.day_id !== "string" || !dayIds.has(leg.day_id)) {
      fail("That backup has a leg whose day is missing — the file looks incomplete.");
    }
  }
  return parsed as unknown as BackupFile;
}

/**
 * Replace all local data with a backup's contents and queue every
 * record for sync. Runs in one transaction: the old tables and the
 * pending outbox go away together, so a half-finished import can never
 * be observed. Records are stored verbatim (ids and timestamps kept),
 * which is what makes an export → wipe → import round trip exact.
 */
export async function importBackup(database: MileageDatabase, backup: BackupFile): Promise<void> {
  const { profiles, locations, days, legs } = backup.data;
  await database.transaction(
    "rw",
    database.profiles,
    database.locations,
    database.days,
    database.legs,
    database.outbox,
    async () => {
      await database.outbox.clear();
      await database.legs.clear();
      await database.days.clear();
      await database.locations.clear();
      await database.profiles.clear();
      await database.profiles.bulkPut(profiles);
      await database.locations.bulkPut(locations);
      await database.days.bulkPut(days);
      await database.legs.bulkPut(legs);
      // Queue everything for sync, parents before children.
      for (const location of locations) await enqueueChange(database, "location", location);
      for (const profile of profiles) await enqueueChange(database, "profile", profile);
      for (const day of days) await enqueueChange(database, "day", day);
      for (const leg of legs) await enqueueChange(database, "leg", leg);
    },
  );
}

/** ISO timestamp of the last backup export, or null when never exported. */
export async function getLastBackupExportAt(database: MileageDatabase): Promise<string | null> {
  return getMetaValue(database, META_KEYS.lastExportAt);
}

/** Record that a backup was just exported (Settings shows the reminder). */
export async function recordBackupExported(
  database: MileageDatabase,
  at: string = nowIso(),
): Promise<void> {
  await setMetaValue(database, META_KEYS.lastExportAt, at);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The brief's gentle weekly reminder: due when no backup has ever been
 * exported, or the last export is more than seven days old.
 */
export function isBackupReminderDue(lastExportAt: string | null, now: Date = new Date()): boolean {
  if (lastExportAt === null) return true;
  const exported = Date.parse(lastExportAt);
  if (Number.isNaN(exported)) return true;
  return now.getTime() - exported > WEEK_MS;
}
