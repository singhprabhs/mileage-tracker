import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { MileageDatabase } from "../src/data/db";
import { addLegs, closeDay, createDay } from "../src/data/repositories/days";
import { saveProfileWithLocations } from "../src/data/repositories/profiles";
import {
  currentMonthRange,
  loadHistory,
} from "../src/features/history/historyService";
import { fixtureA, fixtureB, fixtureC } from "./fixtures";

let counter = 0;
function freshDb(): MileageDatabase {
  counter += 1;
  return new MileageDatabase(`mileage-history-test-${counter}-${Date.now()}`);
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

async function seedDay(
  database: MileageDatabase,
  date: string,
  legs: typeof fixtureA,
  startOdometer: number,
  endOdometer: number,
): Promise<void> {
  const day = await createDay(database, USER_ID, { date, start_odometer: startOdometer });
  await addLegs(database, day.id, USER_ID, legs, 23);
  await closeDay(database, day.id, endOdometer);
}

describe("currentMonthRange", () => {
  it("defaults to the first and last day of the current month", () => {
    expect(currentMonthRange(new Date(2026, 6, 15))).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
    expect(currentMonthRange(new Date(2026, 11, 10))).toEqual({
      start: "2026-12-01",
      end: "2026-12-31",
    });
    expect(currentMonthRange(new Date(2026, 1, 3))).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });
});

describe("loadHistory", () => {
  it("lists per-day totals newest first, plus period totals (Fixtures A + B)", async () => {
    const database = freshDb();
    await saveProfileWithLocations(database, PROFILE_INPUT, USER_ID);
    await seedDay(database, "2026-07-02", fixtureA, 155301, 155386);
    await seedDay(database, "2026-07-03", fixtureB, 155386, 155470);

    const history = await loadHistory(database, "2026-07-01", "2026-07-31");
    expect(history.days).toHaveLength(2);
    expect(history.days[0]?.day.date).toBe("2026-07-03");
    expect(history.days[0]?.totals.totalDistance).toBe(84);
    expect(history.days[0]?.totals.totalClaimable).toBe(38);
    expect(history.days[1]?.day.date).toBe("2026-07-02");
    expect(history.days[1]?.totals.totalDistance).toBe(85);
    expect(history.days[1]?.totals.totalClaimable).toBe(36);
    expect(history.totals.totalDistance).toBe(169);
    expect(history.totals.totalClaimable).toBe(74);
    expect(history.totals.odometerStart).toBe(155301);
    expect(history.totals.odometerEnd).toBe(155470);
    expect(history.hasParking).toBe(false);
  });

  it("respects the range boundaries", async () => {
    const database = freshDb();
    await saveProfileWithLocations(database, PROFILE_INPUT, USER_ID);
    await seedDay(database, "2026-07-02", fixtureA, 155301, 155386);
    await seedDay(database, "2026-07-03", fixtureB, 155386, 155470);

    const onlySecond = await loadHistory(database, "2026-07-03", "2026-07-03");
    expect(onlySecond.days).toHaveLength(1);
    expect(onlySecond.totals.totalClaimable).toBe(38);

    const empty = await loadHistory(database, "2026-08-01", "2026-08-31");
    expect(empty.days).toHaveLength(0);
    expect(empty.totals.totalDistance).toBe(0);
  });

  it("shows parking totals per day and for the period (Fixture C)", async () => {
    const database = freshDb();
    await saveProfileWithLocations(database, PROFILE_INPUT, USER_ID);
    await seedDay(database, "2026-07-02", fixtureC, 155301, 155386);

    const history = await loadHistory(database, "2026-07-01", "2026-07-31");
    expect(history.hasParking).toBe(true);
    expect(history.days[0]?.totals.totalParkingCents).toBe(2050);
    expect(history.totals.totalParkingCents).toBe(2050);
    expect(history.totals.totalClaimable).toBe(36);
  });
});
