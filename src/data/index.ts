export { MileageDatabase, db } from "./db";
export { SUPABASE_NOT_CONFIGURED_MESSAGE, isSupabaseConfigured, supabase } from "./supabaseClient";
export type {
  DayRecord,
  DayStatus,
  LegRecord,
  LocationRecord,
  MetaRecord,
  OutboxAction,
  OutboxRecord,
  ProfileRecord,
  SyncEntity,
  SyncableRecord,
} from "./types";
export { newId, nowIso } from "./types";
export {
  countOutbox,
  enqueueChange,
  entityIdOf,
  listOutbox,
  pendingEntityKeys,
  removeOutboxItem,
  resetOutboxAttempts,
  subscribeOutboxChanges,
  updateOutboxItem,
} from "./outbox";
export { META_KEYS, getMetaValue, setMetaValue } from "./meta";
export {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  collectBackup,
  getLastBackupExportAt,
  importBackup,
  isBackupReminderDue,
  parseBackup,
  recordBackupExported,
  serializeBackup,
} from "./backup";
export type { BackupData, BackupFile } from "./backup";
export { SYNC_ENTITIES, SyncEngine, pendingChangeCount, toRemotePayload } from "./sync";
export type { RemoteRow, RemoteStore, SyncEngineOptions, SyncState, SyncStatus } from "./sync";
export { createSupabaseRemote } from "./supabaseRemote";
export { getSyncEngine, retrySync, startSyncEngine, useSyncStatus } from "./syncRuntime";
export {
  archiveLocation,
  createLocation,
  deleteLocation,
  findLocationByType,
  getLocation,
  listLocations,
  updateLocation,
} from "./repositories/locations";
export type { LocationInput } from "./repositories/locations";
export {
  getProfile,
  saveProfileWithLocations,
  upsertProfile,
  upsertProfileToSupabase,
} from "./repositories/profiles";
export type {
  ProfileInput,
  SavedProfile,
  SupabaseProfileBackupResult,
} from "./repositories/profiles";
export {
  addLeg,
  addLegs,
  closeDay,
  createDay,
  getDay,
  getDayTotals,
  listDays,
  listLegsByDay,
  updateDay,
} from "./repositories/days";
export type { CreateDayInput } from "./repositories/days";
