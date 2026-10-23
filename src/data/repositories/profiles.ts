import type { SupabaseClient } from "@supabase/supabase-js";
import type { MileageDatabase } from "../db";
import { newId, nowIso, type LocationRecord, type ProfileRecord } from "../types";
import { createLocation, findLocationByType, updateLocation } from "./locations";

export interface ProfileInput {
  name: string;
  tech_id: string;
  home_address: string;
  home_place_id?: string | null;
  home_lat?: number | null;
  home_lng?: number | null;
  home_office_km: number;
  office_name: string;
  office_address: string;
  office_place_id?: string | null;
  office_lat?: number | null;
  office_lng?: number | null;
}

export interface SavedProfile {
  profile: ProfileRecord;
  homeLocation: LocationRecord;
  officeLocation: LocationRecord;
}

/**
 * The local profile, or undefined when setup has not been completed.
 * This is a one-user app, so the first non-deleted profile row is it.
 */
export async function getProfile(database: MileageDatabase): Promise<ProfileRecord | undefined> {
  const rows = await database.profiles.toArray();
  return rows.find((row) => row.deleted_at === null);
}

/**
 * Insert or update the local profile by user_id. If the profile was saved
 * before sign-in under a different local id, passing the signed-in user's
 * id re-keys the row so there is still exactly one profile.
 */
export async function upsertProfile(
  database: MileageDatabase,
  input: Omit<ProfileRecord, "created_at" | "updated_at" | "deleted_at">,
): Promise<ProfileRecord> {
  const existing = await getProfile(database);
  const now = nowIso();
  const record: ProfileRecord = {
    ...input,
    created_at: existing && existing.user_id === input.user_id ? existing.created_at : now,
    updated_at: now,
    deleted_at: null,
  };
  await database.transaction("rw", database.profiles, async () => {
    if (existing && existing.user_id !== input.user_id) {
      await database.profiles.delete(existing.user_id);
    }
    await database.profiles.put(record);
  });
  return record;
}

async function upsertTypedLocation(
  database: MileageDatabase,
  userId: string,
  type: "home" | "office",
  name: string,
  address: string,
  placeId: string | null,
  lat: number | null,
  lng: number | null,
  knownId: string | null,
): Promise<LocationRecord> {
  const byId = knownId ? await database.locations.get(knownId) : undefined;
  const existing =
    byId && byId.deleted_at === null && byId.type === type
      ? byId
      : await findLocationByType(database, userId, type);
  if (existing) {
    return updateLocation(database, existing.id, {
      name,
      address,
      place_id: placeId,
      lat,
      lng,
    });
  }
  return createLocation(database, userId, {
    name,
    address,
    type,
    place_id: placeId,
    lat,
    lng,
  });
}

/**
 * Save the Settings / first-launch form: the profile plus its Home and
 * Office rows in the locations table, in one local transaction. Local
 * save is the source of truth; the caller may back the profile up to
 * Supabase afterwards, best-effort.
 */
export async function saveProfileWithLocations(
  database: MileageDatabase,
  input: ProfileInput,
  userId?: string,
): Promise<SavedProfile> {
  const existing = await getProfile(database);
  const effectiveUserId = userId ?? existing?.user_id ?? newId();

  const homeLocation = await upsertTypedLocation(
    database,
    effectiveUserId,
    "home",
    "Home",
    input.home_address,
    input.home_place_id ?? null,
    input.home_lat ?? null,
    input.home_lng ?? null,
    null,
  );
  const officeLocation = await upsertTypedLocation(
    database,
    effectiveUserId,
    "office",
    input.office_name,
    input.office_address,
    input.office_place_id ?? null,
    input.office_lat ?? null,
    input.office_lng ?? null,
    existing?.office_location_id ?? null,
  );

  const profile = await upsertProfile(database, {
    user_id: effectiveUserId,
    name: input.name,
    tech_id: input.tech_id,
    home_address: input.home_address,
    home_place_id: input.home_place_id ?? null,
    home_lat: input.home_lat ?? null,
    home_lng: input.home_lng ?? null,
    office_location_id: officeLocation.id,
    home_office_km: input.home_office_km,
  });

  return { profile, homeLocation, officeLocation };
}

export interface SupabaseProfileBackupResult {
  ok: boolean;
  error: string | null;
}

/**
 * Best-effort backup of the profile to the Supabase `profiles` table.
 * The row's user_id must be the signed-in user's id for row level
 * security, so the caller passes the session user id. Failures are
 * reported in the result, never thrown: a network or server problem must
 * not block or undo the local save.
 */
export async function upsertProfileToSupabase(
  client: SupabaseClient,
  profile: ProfileRecord,
  sessionUserId: string,
): Promise<SupabaseProfileBackupResult> {
  try {
    const { error } = await client.from("profiles").upsert({
      user_id: sessionUserId,
      name: profile.name,
      tech_id: profile.tech_id,
      home_address: profile.home_address,
      home_place_id: profile.home_place_id,
      home_lat: profile.home_lat,
      home_lng: profile.home_lng,
      // Locations sync in Phase 4. Until that row exists on the server the
      // profiles.office_location_id foreign key would reject a local id,
      // so the backup sends null for it in Phase 2.
      office_location_id: null,
      home_office_km: profile.home_office_km,
      updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  } catch (caught) {
    return {
      ok: false,
      error: caught instanceof Error ? caught.message : "Unknown error contacting Supabase",
    };
  }
}
