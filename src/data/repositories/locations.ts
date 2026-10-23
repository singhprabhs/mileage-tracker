import type { MileageDatabase } from "../db";
import { enqueueChange } from "../outbox";
import { newId, nowIso, type LocationRecord } from "../types";
import type { LocationType } from "../../domain/types";

export interface LocationInput {
  name: string;
  address: string;
  type: LocationType;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  last_used_at?: string | null;
}

/** All non-deleted locations for a user, most recently used first. */
export async function listLocations(
  database: MileageDatabase,
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<LocationRecord[]> {
  const rows = await database.locations.where("user_id").equals(userId).toArray();
  return rows
    .filter((row) => row.deleted_at === null)
    .filter((row) => options.includeArchived === true || !row.archived)
    .sort((a, b) => (b.last_used_at ?? b.created_at).localeCompare(a.last_used_at ?? a.created_at));
}

export async function getLocation(
  database: MileageDatabase,
  id: string,
): Promise<LocationRecord | undefined> {
  const row = await database.locations.get(id);
  return row && row.deleted_at === null ? row : undefined;
}

/** Find the user's current location of a given type (Home / Office), if any. */
export async function findLocationByType(
  database: MileageDatabase,
  userId: string,
  type: LocationType,
): Promise<LocationRecord | undefined> {
  const rows = await listLocations(database, userId, { includeArchived: true });
  return (
    rows.find((row) => row.type === type && !row.archived) ?? rows.find((row) => row.type === type)
  );
}

export async function createLocation(
  database: MileageDatabase,
  userId: string,
  input: LocationInput,
): Promise<LocationRecord> {
  const now = nowIso();
  const record: LocationRecord = {
    id: newId(),
    user_id: userId,
    name: input.name,
    address: input.address,
    place_id: input.place_id ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    type: input.type,
    last_used_at: input.last_used_at ?? null,
    archived: false,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  await database.transaction("rw", database.locations, database.outbox, async () => {
    await database.locations.add(record);
    await enqueueChange(database, "location", record);
  });
  return record;
}

export async function updateLocation(
  database: MileageDatabase,
  id: string,
  changes: Partial<LocationInput>,
): Promise<LocationRecord> {
  const existing = await getLocation(database, id);
  if (!existing) throw new Error(`Location ${id} not found`);
  const updated: LocationRecord = { ...existing, ...changes, updated_at: nowIso() };
  await database.transaction("rw", database.locations, database.outbox, async () => {
    await database.locations.put(updated);
    await enqueueChange(database, "location", updated);
  });
  return updated;
}

/** Archive a location: hidden from normal lists, kept for past data. */
export async function archiveLocation(
  database: MileageDatabase,
  id: string,
): Promise<LocationRecord> {
  const existing = await getLocation(database, id);
  if (!existing) throw new Error(`Location ${id} not found`);
  const updated: LocationRecord = { ...existing, archived: true, updated_at: nowIso() };
  await database.transaction("rw", database.locations, database.outbox, async () => {
    await database.locations.put(updated);
    await enqueueChange(database, "location", updated);
  });
  return updated;
}

/** Soft-delete a location: the row stays stored with deleted_at set. */
export async function deleteLocation(database: MileageDatabase, id: string): Promise<void> {
  const existing = await database.locations.get(id);
  if (!existing) return;
  const now = nowIso();
  const deleted: LocationRecord = { ...existing, deleted_at: now, updated_at: now };
  await database.transaction("rw", database.locations, database.outbox, async () => {
    await database.locations.put(deleted);
    await enqueueChange(database, "location", deleted, "delete");
  });
}
