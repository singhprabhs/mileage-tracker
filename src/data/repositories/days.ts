import { computeLeg, periodTotals, type PeriodTotals } from "../../domain";
import type { Leg } from "../../domain/types";
import type { MileageDatabase } from "../db";
import { enqueueChange } from "../outbox";
import { newId, nowIso, type DayRecord, type LegRecord } from "../types";

export interface CreateDayInput {
  /** Calendar date, yyyy-mm-dd. */
  date: string;
  start_odometer: number;
}

export async function createDay(
  database: MileageDatabase,
  userId: string,
  input: CreateDayInput,
): Promise<DayRecord> {
  const now = nowIso();
  const record: DayRecord = {
    id: newId(),
    user_id: userId,
    date: input.date,
    start_odometer: input.start_odometer,
    end_odometer: null,
    status: "open",
    locked: false,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  await database.transaction("rw", database.days, database.outbox, async () => {
    await database.days.add(record);
    await enqueueChange(database, "day", record);
  });
  return record;
}

export async function getDay(
  database: MileageDatabase,
  id: string,
): Promise<DayRecord | undefined> {
  const row = await database.days.get(id);
  return row && row.deleted_at === null ? row : undefined;
}

/** All non-deleted days for a user, newest date first. */
export async function listDays(database: MileageDatabase, userId: string): Promise<DayRecord[]> {
  const rows = await database.days.where("user_id").equals(userId).toArray();
  return rows.filter((row) => row.deleted_at === null).sort((a, b) => b.date.localeCompare(a.date));
}

export async function updateDay(
  database: MileageDatabase,
  id: string,
  changes: Partial<Pick<DayRecord, "end_odometer" | "status" | "locked" | "start_odometer">>,
): Promise<DayRecord> {
  const existing = await getDay(database, id);
  if (!existing) throw new Error(`Day ${id} not found`);
  const updated: DayRecord = { ...existing, ...changes, updated_at: nowIso() };
  await database.transaction("rw", database.days, database.outbox, async () => {
    await database.days.put(updated);
    await enqueueChange(database, "day", updated);
  });
  return updated;
}

export async function closeDay(
  database: MileageDatabase,
  id: string,
  endOdometer: number,
): Promise<DayRecord> {
  return updateDay(database, id, { end_odometer: endOdometer, status: "closed" });
}

/** Legs of a day in position order, excluding soft-deleted rows. */
export async function listLegsByDay(
  database: MileageDatabase,
  dayId: string,
): Promise<LegRecord[]> {
  const rows = await database.legs.where("day_id").equals(dayId).toArray();
  return rows.filter((row) => row.deleted_at === null).sort((a, b) => a.position - b.position);
}

/**
 * Append a leg to a day at the given position. Distance and claimable are
 * computed by the domain module at write time and stored on the row, so
 * screens and reports never recompute them differently.
 */
export async function addLeg(
  database: MileageDatabase,
  dayId: string,
  userId: string,
  position: number,
  leg: Leg,
  homeOfficeKm: number,
): Promise<LegRecord> {
  const day = await getDay(database, dayId);
  if (!day) throw new Error(`Day ${dayId} not found`);
  const computed = computeLeg(leg, homeOfficeKm);
  const now = nowIso();
  const record: LegRecord = {
    ...computed,
    id: newId(),
    day_id: dayId,
    user_id: userId,
    position,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  await database.transaction("rw", database.legs, database.outbox, async () => {
    await database.legs.add(record);
    await enqueueChange(database, "leg", record);
  });
  return record;
}

/** Insert a full ordered set of legs for a day (used by tests/fixtures). */
export async function addLegs(
  database: MileageDatabase,
  dayId: string,
  userId: string,
  legs: readonly Leg[],
  homeOfficeKm: number,
): Promise<LegRecord[]> {
  const inserted: LegRecord[] = [];
  for (const [index, leg] of legs.entries()) {
    inserted.push(await addLeg(database, dayId, userId, index, leg, homeOfficeKm));
  }
  return inserted;
}

/** Day totals from the domain module for the legs stored on a day. */
export async function getDayTotals(
  database: MileageDatabase,
  dayId: string,
  homeOfficeKm: number,
): Promise<PeriodTotals> {
  const legs = await listLegsByDay(database, dayId);
  return periodTotals(legs, homeOfficeKm);
}
