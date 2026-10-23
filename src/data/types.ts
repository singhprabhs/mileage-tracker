import type { LocationType } from "../domain/types";

/**
 * Local (Dexie) record shapes. They mirror the Supabase tables in
 * supabase/migrations/0001_init.sql field for field, so the sync phase
 * needs no translation. All ids are client-generated UUIDs and every
 * record carries created_at / updated_at / deleted_at (soft delete).
 */

export interface ProfileRecord {
  user_id: string;
  name: string;
  tech_id: string;
  home_address: string;
  home_place_id: string | null;
  home_lat: number | null;
  home_lng: number | null;
  /** Id of the Office row in the locations table, once one is saved. */
  office_location_id: string | null;
  home_office_km: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface LocationRecord {
  id: string;
  user_id: string;
  name: string;
  address: string;
  place_id: string | null;
  lat: number | null;
  lng: number | null;
  type: LocationType;
  last_used_at: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type DayStatus = "open" | "closed";

export interface DayRecord {
  id: string;
  user_id: string;
  /** Calendar date, yyyy-mm-dd. */
  date: string;
  start_odometer: number;
  /** Null while the day is still open. */
  end_odometer: number | null;
  status: DayStatus;
  locked: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** A leg as stored locally: the domain Leg plus identity and audit fields. */
export interface LegRecord {
  id: string;
  day_id: string;
  user_id: string;
  position: number;
  from_name: string;
  from_address: string;
  from_type: LocationType;
  to_name: string;
  to_address: string;
  to_type: LocationType;
  odo_start: number;
  odo_end: number;
  /** Computed by the domain module at write time. */
  distance: number;
  /** Computed by the domain module at write time; null when not claimable. */
  claimable: number | null;
  parking_cents: number | null;
  parking_note: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Generate a client-side UUID for a new record. */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** Current time as an ISO timestamp string, for created_at / updated_at. */
export function nowIso(): string {
  return new Date().toISOString();
}
