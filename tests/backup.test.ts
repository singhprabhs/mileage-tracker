import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { MileageDatabase } from "../src/data/db";
import {
  collectBackup,
  getLastBackupExportAt,
  importBackup,
  isBackupReminderDue,
  parseBackup,
  recordBackupExported,
  serializeBackup,
} from "../src/data/backup";
import { countOutbox, listOutbox } from "../src/data/outbox";
import { addLegs, closeDay, createDay } from "../src/data/repositories/days";
import { saveProfileWithLocations } from "../src/data/repositories/profiles";
import { fixtureB, fixtureC } from "./fixtures";

let counter = 0;
function freshDb(): MileageDatabase {
  counter += 1;
  return new MileageDatabase(`mileage-backup-test-${counter}-${Date.now()}`);
}

const USER_ID = "11111111-1111-4111-8111-111111111111";

const PROFILE_INPUT = {
  name: "Test Person",
  tech_id: "EMP42",
  home_address: "1 Example Home Street, Vancouver, BC",
  home_office_km: 23,
  office_name: "Canon",
  office_address: "10851 Shellbridge Way, Richmond, BC",
};

async function seedDatabase(database: MileageDatabase): Promise<void> {
  await saveProfileWithLocations(database, PROFILE_INPUT, USER_ID);
  const dayA = await createDay(database, USER_ID, {
    date: "2026-07-02",
    start_odometer: 155301,
  });
  await addLegs(database, dayA.id, USER_ID, fixtureC, 23);
  await closeDay(database, dayA.id, 155386);
  const dayB = await createDay(database, USER_ID, {
    date: "2026-07-03",
    start_odometer: 155386,
  });
  await addLegs(database, dayB.id, USER_ID, fixtureB, 23);
  await closeDay(database, dayB.id, 155470);
}

describe("JSON backup", () => {
  it("export -> wipe -> import round-trips every table exactly", async () => {
    const source = freshDb();
    await seedDatabase(source);
    const backup = await collectBackup(source);
    expect(backup.format).toBe("mileage-tracker-backup");
    expect(backup.version).toBe(1);
    expect(backup.data.profiles).toHaveLength(1);
    expect(backup.data.days).toHaveLength(2);
    expect(backup.data.legs).toHaveLength(7);
    expect(backup.data.locations.length).toBeGreaterThanOrEqual(2);

    // Serialize + parse, exactly as a file download and file pick would.
    const restored = freshDb();
    const parsed = parseBackup(serializeBackup(backup));
    await importBackup(restored, parsed);

    const sortBy = <T extends { id?: string; user_id?: string }>(rows: T[]): T[] =>
      [...rows].sort((a, b) =>
        String(a.id ?? a.user_id).localeCompare(String(b.id ?? b.user_id)),
      );
    expect(sortBy(await restored.profiles.toArray())).toEqual(
      sortBy(await source.profiles.toArray()),
    );
    expect(sortBy(await restored.locations.toArray())).toEqual(
      sortBy(await source.locations.toArray()),
    );
    expect(sortBy(await restored.days.toArray())).toEqual(sortBy(await source.days.toArray()));
    expect(sortBy(await restored.legs.toArray())).toEqual(sortBy(await source.legs.toArray()));

    // A second export of the restored data equals the first backup's data.
    const secondExport = await collectBackup(restored);
    expect(secondExport.data).toEqual(backup.data);
  });

  it("import queues every restored record for sync, parents before children", async () => {
    const source = freshDb();
    await seedDatabase(source);
    const backup = await collectBackup(source);

    const restored = freshDb();
    await importBackup(restored, parseBackup(serializeBackup(backup)));
    const queued = await countOutbox(restored);
    const total =
      backup.data.profiles.length +
      backup.data.locations.length +
      backup.data.days.length +
      backup.data.legs.length;
    expect(queued).toBe(total);

    const items = await listOutbox(restored);
    const firstLegIndex = items.findIndex((item) => item.entity === "leg");
    const lastDayIndex = items.map((item) => item.entity).lastIndexOf("day");
    expect(lastDayIndex).toBeLessThan(firstLegIndex);
  });

  it("import replaces pre-existing data instead of merging", async () => {
    const source = freshDb();
    await seedDatabase(source);
    const backup = await collectBackup(source);

    const other = freshDb();
    await saveProfileWithLocations(
      other,
      { ...PROFILE_INPUT, name: "Someone Else", tech_id: "OTHER" },
      "22222222-2222-4222-8222-222222222222",
    );
    await importBackup(other, backup);
    const profiles = await other.profiles.toArray();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.name).toBe("Test Person");
    expect(await other.days.count()).toBe(2);
  });

  it("rejects files that are not valid backups", () => {
    expect(() => parseBackup("not json")).toThrow(/not valid JSON/);
    expect(() => parseBackup("{}")).toThrow(/not a mileage tracker backup/);
    expect(() =>
      parseBackup(
        JSON.stringify({ format: "mileage-tracker-backup", version: 99, data: {} }),
      ),
    ).toThrow(/newer version/);
    expect(() =>
      parseBackup(
        JSON.stringify({ format: "mileage-tracker-backup", version: 1, data: {} }),
      ),
    ).toThrow(/missing one of its data tables/);
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: "mileage-tracker-backup",
          version: 1,
          exported_at: "2026-07-02T00:00:00.000Z",
          data: {
            profiles: [],
            locations: [],
            days: [],
            legs: [{ id: "leg-1", day_id: "missing-day" }],
          },
        }),
      ),
    ).toThrow(/day is missing/);
  });

  it("tracks the last export and the weekly reminder", async () => {
    const database = freshDb();
    expect(await getLastBackupExportAt(database)).toBeNull();
    expect(isBackupReminderDue(null)).toBe(true);

    await recordBackupExported(database, "2026-07-02T12:00:00.000Z");
    expect(await getLastBackupExportAt(database)).toBe("2026-07-02T12:00:00.000Z");

    expect(isBackupReminderDue("2026-07-02T12:00:00.000Z", new Date("2026-07-09T11:00:00Z"))).toBe(
      false,
    );
    expect(isBackupReminderDue("2026-07-02T12:00:00.000Z", new Date("2026-07-10T12:00:01Z"))).toBe(
      true,
    );
    expect(isBackupReminderDue("not a date")).toBe(true);
  });
});
