import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { MileageDatabase } from "../src/data/db";
import { addLegs, closeDay, createDay } from "../src/data/repositories/days";
import { saveProfileWithLocations } from "../src/data/repositories/profiles";
import {
  currentMonthRange,
  lastMonthRange,
  loadHistory,
  weekRange,
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

describe("lastMonthRange", () => {
  it("returns the full previous calendar month, across the year boundary", () => {
    expect(lastMonthRange(new Date(2026, 9, 23))).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
    expect(lastMonthRange(new Date(2026, 0, 15))).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    });
    expect(lastMonthRange(new Date(2026, 2, 1))).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });
});

describe("weekRange", () => {
  it("returns the Monday–Sunday week containing the date", () => {
    // Thu Jul 02, 2026 → Mon Jun 29 – Sun Jul 05.
    expect(weekRange(new Date(2026, 6, 2))).toEqual({
      start: "2026-06-29",
      end: "2026-07-05",
    });
    // A Monday starts its own week; a Sunday ends it.
    expect(weekRange(new Date(2026, 6, 6))).toEqual({
      start: "2026-07-06",
      end: "2026-07-12",
    });
    expect(weekRange(new Date(2026, 6, 5))).toEqual({
      start: "2026-06-29",
      end: "2026-07-05",
    });
    // Across the year boundary: Fri Jan 01, 2027 → Mon Dec 28, 2026.
    expect(weekRange(new Date(2027, 0, 1))).toEqual({
      start: "2026-12-28",
      end: "2027-01-03",
    });
  });

  it("week and month totals via loadHistory match the explicit ranges (Fixtures A + B)", async () => {
    const database = freshDb();
    await saveProfileWithLocations(database, PROFILE_INPUT, USER_ID);
    await seedDay(database, "2026-07-02", fixtureA, 155301, 155386);
    await seedDay(database, "2026-07-03", fixtureB, 155386, 155470);

    // Thu Jul 02 sits in the Jun 29 – Jul 05 week and in July: both
    // period helpers must return exactly the History totals for the
    // ranges they name — Today's card and History can never disagree.
    const week = weekRange(new Date(2026, 6, 2));
    const weekHistory = await loadHistory(database, week.start, week.end);
    expect(weekHistory.totals.totalDistance).toBe(169);
    expect(weekHistory.totals.totalClaimable).toBe(74);

    const month = currentMonthRange(new Date(2026, 6, 2));
    const monthHistory = await loadHistory(database, month.start, month.end);
    expect(monthHistory.totals).toEqual(weekHistory.totals);

    // A week with no days totals zero, like an empty History range.
    const emptyWeek = weekRange(new Date(2026, 7, 10));
    const empty = await loadHistory(database, emptyWeek.start, emptyWeek.end);
    expect(empty.days).toHaveLength(0);
    expect(empty.totals.totalDistance).toBe(0);
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
    // Each day carries its legs in driving order for the expandable
    // History cards (UI Polish Phase 4).
    expect(history.days[0]?.legs).toHaveLength(fixtureB.length);
    expect(history.days[1]?.legs).toHaveLength(fixtureA.length);
    expect(history.days[1]?.legs[0]?.from_name).toBe("Home");
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
