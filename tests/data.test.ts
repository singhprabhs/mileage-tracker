import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { MileageDatabase } from "../src/data/db";
import { isSupabaseConfigured, supabase } from "../src/data/supabaseClient";
import {
  archiveLocation,
  createLocation,
  listLocations,
  updateLocation,
} from "../src/data/repositories/locations";
import { getProfile, saveProfileWithLocations } from "../src/data/repositories/profiles";
import {
  addLegs,
  closeDay,
  createDay,
  getDayTotals,
  listDays,
  listLegsByDay,
} from "../src/data/repositories/days";
import { periodTotals } from "../src/domain";
import { fixtureA } from "./fixtures";

let counter = 0;
function freshDb(): MileageDatabase {
  counter += 1;
  return new MileageDatabase(`mileage-test-${counter}-${Date.now()}`);
}

const USER_ID = "11111111-1111-4111-8111-111111111111";

const PROFILE_INPUT = {
  name: "Test Person",
  tech_id: "T-TEST-1",
  home_address: "1 Example Home Street, Vancouver, BC",
  home_office_km: 23,
  office_name: "Canon",
  office_address: "10851 Shellbridge Way, Richmond, BC",
};

describe("profile repository", () => {
  it("saves a profile and reads it back after the database is reopened", async () => {
    const name = `mileage-reload-${Date.now()}`;
    const first = new MileageDatabase(name);
    const saved = await saveProfileWithLocations(first, PROFILE_INPUT, USER_ID);
    expect(saved.profile.user_id).toBe(USER_ID);
    expect(saved.profile.home_office_km).toBe(23);
    await first.close();

    // A fresh instance over the same database simulates an app reload.
    const reopened = new MileageDatabase(name);
    const profile = await getProfile(reopened);
    expect(profile).toBeDefined();
    expect(profile?.name).toBe("Test Person");
    expect(profile?.tech_id).toBe("T-TEST-1");
    expect(profile?.home_address).toBe("1 Example Home Street, Vancouver, BC");
    await reopened.delete();
  });

  it("maintains Home and Office locations and reuses them on update", async () => {
    const database = freshDb();
    const first = await saveProfileWithLocations(database, PROFILE_INPUT, USER_ID);
    expect(first.homeLocation.type).toBe("home");
    expect(first.homeLocation.name).toBe("Home");
    expect(first.homeLocation.address).toBe(PROFILE_INPUT.home_address);
    expect(first.officeLocation.type).toBe("office");
    expect(first.officeLocation.name).toBe("Canon");
    expect(first.profile.office_location_id).toBe(first.officeLocation.id);

    const second = await saveProfileWithLocations(
      database,
      { ...PROFILE_INPUT, tech_id: "T-TEST-2", home_address: "9 Other Street, Vancouver, BC" },
      USER_ID,
    );
    expect(second.officeLocation.id).toBe(first.officeLocation.id);
    expect(second.homeLocation.id).toBe(first.homeLocation.id);
    expect(second.homeLocation.address).toBe("9 Other Street, Vancouver, BC");
    expect(second.profile.tech_id).toBe("T-TEST-2");

    const all = await listLocations(database, USER_ID, { includeArchived: true });
    expect(all).toHaveLength(2);
    await database.delete();
  });

  it("returns no profile before setup", async () => {
    const database = freshDb();
    expect(await getProfile(database)).toBeUndefined();
    await database.delete();
  });
});

describe("locations repository", () => {
  it("creates, lists, updates and archives customer locations", async () => {
    const database = freshDb();
    const created = await createLocation(database, USER_ID, {
      name: "Customer A",
      address: "200 Example Road, Burnaby, BC",
      type: "customer",
    });
    expect(created.archived).toBe(false);

    const updated = await updateLocation(database, created.id, { name: "Customer A Ltd" });
    expect(updated.name).toBe("Customer A Ltd");

    let listed = await listLocations(database, USER_ID);
    expect(listed.map((row) => row.id)).toEqual([created.id]);

    await archiveLocation(database, created.id);
    listed = await listLocations(database, USER_ID);
    expect(listed).toHaveLength(0);
    const withArchived = await listLocations(database, USER_ID, { includeArchived: true });
    expect(withArchived).toHaveLength(1);
    expect(withArchived[0]?.archived).toBe(true);
    await database.delete();
  });
});

describe("days and legs repositories", () => {
  it("stores Fixture A for a day and reads it back with correct domain totals", async () => {
    const database = freshDb();
    const day = await createDay(database, USER_ID, {
      date: "2026-07-02",
      start_odometer: 155301,
    });
    const inserted = await addLegs(database, day.id, USER_ID, fixtureA, 23);
    expect(inserted.map((leg) => leg.distance)).toEqual([24, 14, 8, 14, 25]);
    expect(inserted.map((leg) => leg.claimable)).toEqual([null, 14, 8, 14, null]);
    expect(inserted.map((leg) => leg.position)).toEqual([0, 1, 2, 3, 4]);

    const readBack = await listLegsByDay(database, day.id);
    expect(readBack).toHaveLength(5);
    expect(periodTotals(readBack, 23)).toEqual({
      totalDistance: 85,
      totalClaimable: 36,
      totalParkingCents: 0,
      odometerStart: 155301,
      odometerEnd: 155386,
    });

    const totals = await getDayTotals(database, day.id, 23);
    expect(totals.totalDistance).toBe(85);
    expect(totals.totalClaimable).toBe(36);

    const closed = await closeDay(database, day.id, 155386);
    expect(closed.status).toBe("closed");
    expect(closed.end_odometer).toBe(155386);

    const days = await listDays(database, USER_ID);
    expect(days.map((row) => row.id)).toEqual([day.id]);
    await database.delete();
  });
});

describe("supabase client configuration", () => {
  it("is disabled (null client) when the environment variables are unset", () => {
    expect(isSupabaseConfigured).toBe(false);
    expect(supabase).toBeNull();
  });
});
