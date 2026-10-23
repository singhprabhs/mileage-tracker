export { MileageDatabase, db } from "./db";
export { SUPABASE_NOT_CONFIGURED_MESSAGE, isSupabaseConfigured, supabase } from "./supabaseClient";
export type { DayRecord, DayStatus, LegRecord, LocationRecord, ProfileRecord } from "./types";
export { newId, nowIso } from "./types";
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
