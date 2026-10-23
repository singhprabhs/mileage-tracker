import Dexie, { type EntityTable } from "dexie";
import type { DayRecord, LegRecord, LocationRecord, ProfileRecord } from "./types";

/**
 * Local database (IndexedDB via Dexie). The phone is the source of truth:
 * every write lands here first and screens read from here, so nothing is
 * lost when the network, a closed tab or a restart gets in the way.
 *
 * Schema version 1 covers the Phase 2 tables. The sync outbox table is a
 * Phase 4 concern and is deliberately not defined yet.
 */
export class MileageDatabase extends Dexie {
  profiles!: EntityTable<ProfileRecord, "user_id">;
  locations!: EntityTable<LocationRecord, "id">;
  days!: EntityTable<DayRecord, "id">;
  legs!: EntityTable<LegRecord, "id">;

  constructor(name = "mileage-tracker") {
    super(name);
    this.version(1).stores({
      profiles: "user_id",
      locations: "id, user_id, type, last_used_at",
      days: "id, user_id, date, status",
      legs: "id, day_id, [day_id+position], user_id",
    });
  }
}

/** The app-wide database instance. Tests create their own named instances. */
export const db = new MileageDatabase();
