import {
  computeLeg,
  periodTotals,
  recalculateChain,
  validateParking,
  type Leg,
  type PeriodTotals,
} from "../../domain";
import type { LocationType } from "../../domain/types";
import type { MileageDatabase } from "../../data/db";
import { enqueueChange } from "../../data/outbox";
import { getDay, listDays, listLegsByDay, updateDay } from "../../data/repositories/days";
import { createLocation, listLocations, updateLocation } from "../../data/repositories/locations";
import { getProfile } from "../../data/repositories/profiles";
import {
  newId,
  nowIso,
  type DayRecord,
  type LegRecord,
  type LocationRecord,
  type ProfileRecord,
} from "../../data/types";

/**
 * Day-flow service layer for Phase 3: Start Day, Log Stop, End Day, and
 * leg editing. Every distance / claimable number comes from the Phase 1
 * domain module; this layer only moves records in and out of Dexie and
 * keeps the leg chain continuous.
 */

export interface StopDestination {
  name: string;
  address: string;
  type: LocationType;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface DayContext {
  userId: string;
  profile: ProfileRecord;
  homeOfficeKm: number;
  home: StopDestination;
  office: StopDestination;
}

export interface DayState {
  day: DayRecord;
  legs: LegRecord[];
  totals: PeriodTotals;
  /** Where the next leg starts: the last leg's odo_end, or the day's start. */
  currentOdometer: number;
  /** Where the next leg starts from: the last stop, or Home for a new day. */
  currentDestination: StopDestination;
}

/** A restorable copy of a day and its legs, taken before a change. */
export interface DaySnapshot {
  day: DayRecord;
  legs: LegRecord[];
}

/** Local calendar date as yyyy-mm-dd (the user's day, not UTC's). */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "Jul 02" style label used in the report and day headings. */
export function formatDateLabel(isoDate: string): string {
  const parts = isoDate.split("-");
  const month = MONTH_NAMES[Number(parts[1] ?? "1") - 1] ?? "";
  return `${month} ${parts[2] ?? ""}`;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * "Thu, Jul 02, 2026" style label: the single date rendering used on
 * History day rows. The weekday is computed from the calendar date in
 * UTC so it can never shift with the local timezone.
 */
export function formatFullDateLabel(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const weekday = WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
  return `${weekday}, ${formatDateLabel(isoDate)}, ${year}`;
}

/**
 * Load everything the day flow needs: the saved profile, and the Home and
 * Office destinations, which come from the profile as the brief requires.
 */
export async function loadDayContext(database: MileageDatabase): Promise<DayContext> {
  const profile = await getProfile(database);
  if (!profile) throw new Error("Profile setup has not been completed yet.");
  const locations = await listLocations(database, profile.user_id, { includeArchived: true });
  const officeRow = profile.office_location_id
    ? locations.find((row) => row.id === profile.office_location_id)
    : locations.find((row) => row.type === "office");
  const home: StopDestination = {
    name: "Home",
    address: profile.home_address,
    type: "home",
    place_id: profile.home_place_id,
    lat: profile.home_lat,
    lng: profile.home_lng,
  };
  const office: StopDestination = {
    name: officeRow?.name ?? "Office",
    address: officeRow?.address ?? "",
    type: "office",
    place_id: officeRow?.place_id ?? null,
    lat: officeRow?.lat ?? null,
    lng: officeRow?.lng ?? null,
  };
  return { userId: profile.user_id, profile, homeOfficeKm: profile.home_office_km, home, office };
}

export async function getDayState(
  database: MileageDatabase,
  context: DayContext,
  dayId: string,
): Promise<DayState> {
  const day = await getDay(database, dayId);
  if (!day) throw new Error(`Day ${dayId} not found`);
  return buildDayState(database, context, day);
}

async function buildDayState(
  database: MileageDatabase,
  context: DayContext,
  day: DayRecord,
): Promise<DayState> {
  const legs = await listLegsByDay(database, day.id);
  const last = legs[legs.length - 1];
  return {
    day,
    legs,
    totals: periodTotals(legs, context.homeOfficeKm),
    currentOdometer: last ? last.odo_end : day.start_odometer,
    currentDestination: last
      ? { name: last.to_name, address: last.to_address, type: last.to_type }
      : { ...context.home },
  };
}

/** The currently open day's state, if one is open. */
export async function getOpenDayState(
  database: MileageDatabase,
  context: DayContext,
): Promise<DayState | null> {
  const days = await listDays(database, context.userId);
  const open = days
    .filter((row) => row.status === "open")
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return open ? buildDayState(database, context, open) : null;
}

/** The closed day for a given date, if one was finished that day. */
export async function getClosedDayStateForDate(
  database: MileageDatabase,
  context: DayContext,
  date: string,
): Promise<DayState | null> {
  const days = await listDays(database, context.userId);
  const closed = days.find((row) => row.date === date && row.status === "closed");
  return closed ? buildDayState(database, context, closed) : null;
}

/** Prefill for Start Day: the last closed day's final odometer reading. */
export async function getLastClosedDayFinalOdometer(
  database: MileageDatabase,
  userId: string,
): Promise<number | null> {
  const days = await listDays(database, userId);
  const closed = days.find((row) => row.status === "closed" && row.end_odometer !== null);
  return closed ? closed.end_odometer : null;
}

export type StartDayResult =
  { status: "created"; day: DayRecord } | { status: "blocked"; openDay: DayRecord };

/**
 * Create an open day starting at Home. Blocked while any day is still
 * open: the caller offers to close that day first, and the result names
 * it so the UI can say which day is in the way.
 */
export async function startDay(
  database: MileageDatabase,
  context: DayContext,
  input: { date: string; startOdometer: number },
): Promise<StartDayResult> {
  const days = await listDays(database, context.userId);
  const openDay = days
    .filter((row) => row.status === "open")
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (openDay) return { status: "blocked", openDay };

  const now = nowIso();
  const record: DayRecord = {
    id: newId(),
    user_id: context.userId,
    date: input.date,
    start_odometer: input.startOdometer,
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
  return { status: "created", day: record };
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Save a visited destination in the locations list, reusing the existing
 * row when the place_id or the address matches, and stamping
 * last_used_at. Home is the profile row and is never duplicated.
 */
export async function saveOrTouchLocation(
  database: MileageDatabase,
  context: DayContext,
  destination: StopDestination,
): Promise<LocationRecord | null> {
  if (destination.type === "home") return null;
  const rows = await listLocations(database, context.userId, { includeArchived: true });
  const byPlaceId = destination.place_id
    ? rows.find((row) => row.place_id !== null && row.place_id === destination.place_id)
    : undefined;
  const existing =
    byPlaceId ??
    rows.find(
      (row) =>
        row.type === destination.type &&
        normalizeAddress(row.address) === normalizeAddress(destination.address),
    );
  if (existing) {
    return updateLocation(database, existing.id, {
      name: destination.name,
      address: destination.address,
      place_id: destination.place_id ?? existing.place_id,
      lat: destination.lat ?? existing.lat,
      lng: destination.lng ?? existing.lng,
      last_used_at: nowIso(),
    });
  }
  return createLocation(database, context.userId, {
    name: destination.name,
    address: destination.address,
    type: destination.type,
    place_id: destination.place_id ?? null,
    lat: destination.lat ?? null,
    lng: destination.lng ?? null,
    last_used_at: nowIso(),
  });
}

/** Recent customers and office stops for the Log Stop quick-pick list. */
export async function listRecentStops(
  database: MileageDatabase,
  userId: string,
): Promise<LocationRecord[]> {
  const rows = await listLocations(database, userId);
  return rows.filter((row) => row.type !== "home");
}

/** Every stored leg for a user, for warning history (same-route median). */
export async function listAllLegs(database: MileageDatabase, userId: string): Promise<LegRecord[]> {
  const rows = await database.legs.where("user_id").equals(userId).toArray();
  return rows
    .filter((row) => row.deleted_at === null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export interface RecentParking {
  /** Up to 3 distinct recent amounts, most recent first, in cents. */
  amountsCents: number[];
  /** Up to 5 distinct recent parking notes, most recent first. */
  notes: string[];
}

/** Recent parking amounts and notes for the one-tap chips on the parking row. */
export async function getRecentParking(
  database: MileageDatabase,
  userId: string,
): Promise<RecentParking> {
  const legs = await listAllLegs(database, userId);
  const withParking = legs
    .filter((leg) => leg.parking_cents !== null && leg.parking_cents > 0)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const amountsCents: number[] = [];
  for (const leg of withParking) {
    if (leg.parking_cents !== null && !amountsCents.includes(leg.parking_cents)) {
      amountsCents.push(leg.parking_cents);
    }
    if (amountsCents.length >= 3) break;
  }
  const notes: string[] = [];
  for (const leg of withParking) {
    const note = leg.parking_note?.trim();
    if (note && !notes.includes(note)) notes.push(note);
    if (notes.length >= 5) break;
  }
  return { amountsCents, notes };
}

export interface ParkingInput {
  parking_cents?: number | null;
  parking_note?: string | null;
  /** Set once the user has confirmed an amount over $100.00. */
  parking_confirmed?: boolean;
}

export type LogStopResult =
  | { status: "saved"; state: DayState; leg: LegRecord }
  | { status: "needs-parking-confirmation"; parking_cents: number };

/** Parking validated through the domain module; throws on invalid amounts. */
function checkParking(parking: ParkingInput, toType: LocationType): LogStopResult | null {
  const cents = parking.parking_cents ?? null;
  const validation = validateParking(cents, toType);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Parking amount is not valid.");
  }
  if (validation.needsConfirmation && !parking.parking_confirmed) {
    return { status: "needs-parking-confirmation", parking_cents: cents ?? 0 };
  }
  return null;
}

/**
 * Log an arrival: completes the leg from the previous stop (Home for the
 * first leg of the day) to this destination. Nothing is written when the
 * parking amount still needs its over-$100 confirmation.
 */
export async function logStop(
  database: MileageDatabase,
  context: DayContext,
  dayId: string,
  destination: StopDestination,
  odoEnd: number,
  parking: ParkingInput = {},
): Promise<LogStopResult> {
  const pending = checkParking(parking, destination.type);
  if (pending) return pending;

  const state = await getDayState(database, context, dayId);
  if (state.day.status !== "open") throw new Error("This day is closed and cannot take new stops.");
  const from = state.currentDestination;
  const leg: Leg = {
    from_name: from.name,
    from_address: from.address,
    from_type: from.type,
    to_name: destination.name,
    to_address: destination.address,
    to_type: destination.type,
    odo_start: state.currentOdometer,
    odo_end: odoEnd,
    parking_cents: parking.parking_cents ?? null,
    parking_note: parking.parking_note ?? null,
    note: null,
  };
  const computed = computeLeg(leg, context.homeOfficeKm);
  const now = nowIso();
  const record: LegRecord = {
    ...computed,
    id: newId(),
    day_id: dayId,
    user_id: context.userId,
    position: state.legs.length,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  await database.transaction("rw", database.legs, database.outbox, async () => {
    await database.legs.add(record);
    await enqueueChange(database, "leg", record);
  });
  await saveOrTouchLocation(database, context, destination);
  const next = await getDayState(database, context, dayId);
  return { status: "saved", state: next, leg: record };
}

/**
 * End the day: the destination is fixed to Home (from the profile). The
 * caller shows the summary this returns; the day only closes when the
 * user confirms Done via closeDayAfterSummary.
 */
export async function endDay(
  database: MileageDatabase,
  context: DayContext,
  dayId: string,
  odoEnd: number,
): Promise<LogStopResult> {
  return logStop(database, context, dayId, { ...context.home }, odoEnd);
}

/** Close a day after its summary is confirmed: stamps the final reading. */
export async function closeDayAfterSummary(
  database: MileageDatabase,
  context: DayContext,
  dayId: string,
): Promise<DayState> {
  const state = await getDayState(database, context, dayId);
  const updated = await updateDay(database, dayId, {
    end_odometer: state.currentOdometer,
    status: "closed",
  });
  return { ...state, day: updated };
}

/** Take an exact copy of a day and its legs, for Undo. */
export async function snapshotDay(database: MileageDatabase, dayId: string): Promise<DaySnapshot> {
  const day = await database.days.get(dayId);
  if (!day) throw new Error(`Day ${dayId} not found`);
  const legs = await listLegsByDay(database, dayId);
  return {
    day: { ...day },
    legs: legs.map((leg) => ({ ...leg })),
  };
}

/** Restore a snapshot exactly: the day row and its leg rows as they were. */
export async function restoreDaySnapshot(
  database: MileageDatabase,
  snapshot: DaySnapshot,
): Promise<void> {
  await database.transaction("rw", database.days, database.legs, database.outbox, async () => {
    const current = await database.legs.where("day_id").equals(snapshot.day.id).toArray();
    const snapshotIds = new Set(snapshot.legs.map((leg) => leg.id));
    const now = nowIso();
    await database.legs.where("day_id").equals(snapshot.day.id).delete();
    if (snapshot.legs.length > 0) {
      await database.legs.bulkAdd(snapshot.legs.map((leg) => ({ ...leg })));
    }
    await database.days.put({ ...snapshot.day });
    // Queue the restore like any other change: upserts for everything
    // the snapshot brings back, soft deletes for live legs it removes.
    for (const leg of snapshot.legs) {
      await enqueueChange(database, "leg", leg);
    }
    for (const row of current) {
      if (!snapshotIds.has(row.id) && row.deleted_at === null) {
        await enqueueChange(
          database,
          "leg",
          { ...row, deleted_at: now, updated_at: now },
          "delete",
        );
      }
    }
    await enqueueChange(database, "day", snapshot.day);
  });
}

/**
 * Replace a day's whole leg chain. The domain module rebuilds it so every
 * odo_start follows the previous odo_end and every distance / claimable
 * is recomputed; ids parallel to `legs` are kept where given, null means
 * a brand-new leg.
 */
async function replaceDayChain(
  database: MileageDatabase,
  context: DayContext,
  dayId: string,
  legs: readonly Leg[],
  legIds: readonly (string | null)[],
): Promise<DayState> {
  const day = await getDay(database, dayId);
  if (!day) throw new Error(`Day ${dayId} not found`);
  const computed = recalculateChain(legs, context.homeOfficeKm);
  const existing = await listLegsByDay(database, dayId);
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const now = nowIso();

  await database.transaction("rw", database.legs, database.days, database.outbox, async () => {
    const keptIds = new Set<string>();
    for (const [index, computedLeg] of computed.entries()) {
      const wantedId = legIds[index] ?? null;
      const prior = wantedId ? existingById.get(wantedId) : undefined;
      const record: LegRecord = {
        ...computedLeg,
        id: prior ? prior.id : newId(),
        day_id: dayId,
        user_id: context.userId,
        position: index,
        created_at: prior ? prior.created_at : now,
        updated_at: now,
        deleted_at: null,
      };
      keptIds.add(record.id);
      await database.legs.put(record);
      await enqueueChange(database, "leg", record);
    }
    for (const row of existing) {
      if (!keptIds.has(row.id)) {
        const deleted: LegRecord = { ...row, deleted_at: now, updated_at: now };
        await database.legs.put(deleted);
        await enqueueChange(database, "leg", deleted, "delete");
      }
    }
    if (day.status === "closed") {
      const last = computed[computed.length - 1];
      const updatedDay: DayRecord = {
        ...day,
        end_odometer: last ? last.odo_end : day.start_odometer,
        updated_at: now,
      };
      await database.days.put(updatedDay);
      await enqueueChange(database, "day", updatedDay);
    }
  });

  return getDayState(database, context, dayId);
}

function toDomainLeg(record: LegRecord): Leg {
  return {
    from_name: record.from_name,
    from_address: record.from_address,
    from_type: record.from_type,
    to_name: record.to_name,
    to_address: record.to_address,
    to_type: record.to_type,
    odo_start: record.odo_start,
    odo_end: record.odo_end,
    parking_cents: record.parking_cents,
    parking_note: record.parking_note,
    note: record.note,
  };
}

export interface EditLegChanges {
  to_name?: string;
  to_address?: string;
  to_type?: LocationType;
  odo_end?: number;
  /** Only honoured for the first leg of the day; also updates the day's start. */
  odo_start?: number;
  parking_cents?: number | null;
  parking_note?: string | null;
  note?: string | null;
  parking_confirmed?: boolean;
}

export type ChainChangeResult =
  | { status: "saved"; state: DayState; previousSnapshot: DaySnapshot }
  | { status: "needs-parking-confirmation"; parking_cents: number };

function parkingPendingOrThrow(
  cents: number | null,
  toType: LocationType,
  confirmed: boolean,
): ChainChangeResult | null {
  const validation = validateParking(cents, toType);
  if (!validation.valid) throw new Error(validation.error ?? "Parking amount is not valid.");
  if (validation.needsConfirmation && !confirmed) {
    return { status: "needs-parking-confirmation", parking_cents: cents ?? 0 };
  }
  return null;
}

/**
 * Edit one leg. The next leg departs from this leg's stop, so its from_*
 * fields follow the edit, and the whole chain is recalculated.
 */
export async function editLeg(
  database: MileageDatabase,
  context: DayContext,
  dayId: string,
  legId: string,
  changes: EditLegChanges,
): Promise<ChainChangeResult> {
  const state = await getDayState(database, context, dayId);
  const index = state.legs.findIndex((row) => row.id === legId);
  const target = index >= 0 ? state.legs[index] : undefined;
  if (index < 0 || !target) throw new Error(`Leg ${legId} not found on day ${dayId}`);

  const nextToType = changes.to_type ?? target.to_type;
  const nextParking =
    changes.parking_cents !== undefined ? changes.parking_cents : target.parking_cents;
  const pending = parkingPendingOrThrow(
    nextParking,
    nextToType,
    changes.parking_confirmed ?? false,
  );
  if (pending) return pending;

  const previousSnapshot = await snapshotDay(database, dayId);
  const domainLegs = state.legs.map(toDomainLeg);
  const edited: Leg = {
    ...toDomainLeg(target),
    to_name: changes.to_name ?? target.to_name,
    to_address: changes.to_address ?? target.to_address,
    to_type: nextToType,
    odo_end: changes.odo_end ?? target.odo_end,
    odo_start:
      index === 0 && changes.odo_start !== undefined ? changes.odo_start : target.odo_start,
    parking_cents: nextParking,
    parking_note: changes.parking_note !== undefined ? changes.parking_note : target.parking_note,
    note: changes.note !== undefined ? changes.note : target.note,
  };
  domainLegs[index] = edited;
  const next = domainLegs[index + 1];
  if (next) {
    domainLegs[index + 1] = {
      ...next,
      from_name: edited.to_name,
      from_address: edited.to_address,
      from_type: edited.to_type,
    };
  }

  if (index === 0 && changes.odo_start !== undefined) {
    await updateDay(database, dayId, { start_odometer: changes.odo_start });
  }
  const nextState = await replaceDayChain(
    database,
    context,
    dayId,
    domainLegs,
    state.legs.map((row) => row.id),
  );
  return { status: "saved", state: nextState, previousSnapshot };
}

/**
 * Delete one leg. The following leg now departs from the deleted leg's
 * starting point, and the chain is recalculated around the gap.
 */
export async function deleteLeg(
  database: MileageDatabase,
  context: DayContext,
  dayId: string,
  legId: string,
): Promise<{ state: DayState; previousSnapshot: DaySnapshot }> {
  const state = await getDayState(database, context, dayId);
  const index = state.legs.findIndex((row) => row.id === legId);
  const target = index >= 0 ? state.legs[index] : undefined;
  if (index < 0 || !target) throw new Error(`Leg ${legId} not found on day ${dayId}`);

  const previousSnapshot = await snapshotDay(database, dayId);
  const domainLegs: Leg[] = [];
  const ids: (string | null)[] = [];
  for (const [position, row] of state.legs.entries()) {
    if (position === index) continue;
    const domain = toDomainLeg(row);
    if (position === index + 1) {
      domain.from_name = target.from_name;
      domain.from_address = target.from_address;
      domain.from_type = target.from_type;
    }
    domainLegs.push(domain);
    ids.push(row.id);
  }
  const nextState = await replaceDayChain(database, context, dayId, domainLegs, ids);
  return { state: nextState, previousSnapshot };
}

/**
 * Insert a missed stop after the given leg (or at the end of the day when
 * afterLegId is null). The following leg departs from the inserted stop.
 */
export async function insertLeg(
  database: MileageDatabase,
  context: DayContext,
  dayId: string,
  afterLegId: string | null,
  destination: StopDestination,
  odoEnd: number,
  parking: ParkingInput = {},
): Promise<LogStopResult & { previousSnapshot?: DaySnapshot }> {
  const pending = checkParking(parking, destination.type);
  if (pending) return pending;

  const state = await getDayState(database, context, dayId);
  const afterIndex =
    afterLegId === null
      ? state.legs.length - 1
      : state.legs.findIndex((row) => row.id === afterLegId);
  if (afterLegId !== null && afterIndex < 0) {
    throw new Error(`Leg ${afterLegId} not found on day ${dayId}`);
  }
  const previousSnapshot = await snapshotDay(database, dayId);

  const domainLegs = state.legs.map(toDomainLeg);
  const ids: (string | null)[] = state.legs.map((row) => row.id);
  const previousLeg = afterIndex >= 0 ? state.legs[afterIndex] : undefined;
  const from: StopDestination = previousLeg
    ? { name: previousLeg.to_name, address: previousLeg.to_address, type: previousLeg.to_type }
    : { ...context.home };
  const fromOdometer = previousLeg ? previousLeg.odo_end : state.day.start_odometer;

  const inserted: Leg = {
    from_name: from.name,
    from_address: from.address,
    from_type: from.type,
    to_name: destination.name,
    to_address: destination.address,
    to_type: destination.type,
    odo_start: fromOdometer,
    odo_end: odoEnd,
    parking_cents: parking.parking_cents ?? null,
    parking_note: parking.parking_note ?? null,
    note: null,
  };
  const insertAt = afterIndex + 1;
  domainLegs.splice(insertAt, 0, inserted);
  ids.splice(insertAt, 0, null);
  const following = domainLegs[insertAt + 1];
  if (following) {
    domainLegs[insertAt + 1] = {
      ...following,
      from_name: destination.name,
      from_address: destination.address,
      from_type: destination.type,
    };
  }

  const nextState = await replaceDayChain(database, context, dayId, domainLegs, ids);
  await saveOrTouchLocation(database, context, destination);
  const insertedRecord = nextState.legs[insertAt];
  if (!insertedRecord) throw new Error("Inserted leg was not stored.");
  return { status: "saved", state: nextState, leg: insertedRecord, previousSnapshot };
}
