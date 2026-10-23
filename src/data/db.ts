import Dexie, { type EntityTable } from "dexie";
import type {
  DayRecord,
  LegRecord,
  LocationRecord,
  MetaRecord,
  OutboxRecord,
  ProfileRecord,
} from "./types";

/**
 * Local database (IndexedDB via Dexie). The phone is the source of truth:
 * every write lands here first and screens read from here, so nothing is
 * lost when the network, a closed tab or a restart gets in the way.
 *
 * Schema version 1 covers the Phase 2 tables. Version 2 (Phase 4) adds
 * the sync outbox and the meta key/value table; it only adds tables, so
 * upgrading preserves every existing row.
 */
export class MileageDatabase extends Dexie {
  profiles!: EntityTable<ProfileRecord, "user_id">;
  locations!: EntityTable<LocationRecord, "id">;
  days!: EntityTable<DayRecord, "id">;
  legs!: EntityTable<LegRecord, "id">;
  outbox!: EntityTable<OutboxRecord, "id">;
  meta!: EntityTable<MetaRecord, "key">;

  constructor(name = "mileage-tracker") {
    super(name);
    this.version(1).stores({
      profiles: "user_id",
      locations: "id, user_id, type, last_used_at",
      days: "id, user_id, date, status",
      legs: "id, day_id, [day_id+position], user_id",
    });
    this.version(2).stores({
      profiles: "user_id",
      locations: "id, user_id, type, last_used_at",
      days: "id, user_id, date, status",
      legs: "id, day_id, [day_id+position], user_id",
      outbox: "++id, entity_id, queued_at",
      meta: "key",
    });
  }
}

/** The app-wide database instance. Tests create their own named instances. */
export const db = new MileageDatabase();
