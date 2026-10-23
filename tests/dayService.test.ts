import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { MileageDatabase } from "../src/data/db";
import { listLocations } from "../src/data/repositories/locations";
import { saveProfileWithLocations } from "../src/data/repositories/profiles";
import { completeOdometer } from "../src/domain";
import {
  closeDayAfterSummary,
  deleteLeg,
  editLeg,
  endDay,
  formatFullDateLabel,
  getLastClosedDayFinalOdometer,
  getOpenDayState,
  insertLeg,
  loadDayContext,
  logStop,
  restoreDaySnapshot,
  startDay,
  type DayContext,
  type LogStopResult,
  type StopDestination,
} from "../src/features/day/dayService";

let counter = 0;
function freshDb(): MileageDatabase {
  counter += 1;
  return new MileageDatabase(`mileage-day-${counter}-${Date.now()}`);
}

const USER_ID = "22222222-2222-4222-8222-222222222222";
const HOME_ADDRESS = "1 Example Home Street, Vancouver, BC";
const CANON_ADDRESS = "10851 Shellbridge Way, Richmond, BC";
const DSK_ADDRESS = "970-789 W Pender St, Vancouver BC";
const AGAT_ADDRESS = "3681 E 1st Ave, Vancouver, BC";

const CANON: StopDestination = { name: "Canon", address: CANON_ADDRESS, type: "office" };
const DSK: StopDestination = { name: "Dsk Law", address: DSK_ADDRESS, type: "customer" };
const AGAT: StopDestination = {
  name: "Agat Laboratories",
  address: AGAT_ADDRESS,
  type: "customer",
};

async function setup(): Promise<{ database: MileageDatabase; context: DayContext }> {
  const database = freshDb();
  await saveProfileWithLocations(
    database,
    {
      name: "Test Person",
      tech_id: "T-TEST-1",
      home_address: HOME_ADDRESS,
      home_office_km: 23,
      office_name: "Canon",
      office_address: CANON_ADDRESS,
    },
    USER_ID,
  );
  const context = await loadDayContext(database);
  return { database, context };
}

function mustSave(result: LogStopResult) {
  if (result.status !== "saved") throw new Error(`Expected saved, got ${result.status}`);
  return result;
}

/** Enter Fixture A (with Fixture C parking) through the day service. */
async function enterFixtureA(database: MileageDatabase, context: DayContext) {
  const started = await startDay(database, context, { date: "2026-07-02", startOdometer: 155301 });
  if (started.status !== "created") throw new Error("Day was blocked");
  const dayId = started.day.id;
  mustSave(await logStop(database, context, dayId, CANON, 155325));
  mustSave(
    await logStop(database, context, dayId, DSK, 155339, {
      parking_cents: 1250,
      parking_note: "Street meter",
    }),
  );
  mustSave(await logStop(database, context, dayId, AGAT, 155347, { parking_cents: 800 }));
  mustSave(await logStop(database, context, dayId, CANON, 155361));
  const ended = mustSave(await endDay(database, context, dayId, 155386));
  return { dayId, endedState: ended.state };
}

describe("day service: Fixture A end to end", () => {
  it("yields 85 km distance, 36 km claimable and the exact claimable sequence", async () => {
    const { database, context } = await setup();
    const { dayId, endedState } = await enterFixtureA(database, context);

    expect(endedState.legs.map((leg) => leg.distance)).toEqual([24, 14, 8, 14, 25]);
    expect(endedState.legs.map((leg) => leg.claimable)).toEqual([null, 14, 8, 14, null]);
    expect(endedState.totals.totalDistance).toBe(85);
    expect(endedState.totals.totalClaimable).toBe(36);
    // Fixture C parking rides along without changing distance or claimable.
    expect(endedState.totals.totalParkingCents).toBe(2050);
    expect(endedState.legs[0]?.from_address).toBe(HOME_ADDRESS);
    expect(endedState.legs[4]?.to_address).toBe(HOME_ADDRESS);

    // Ending the day shows the summary but does not close it yet.
    expect(endedState.day.status).toBe("open");
    const closed = await closeDayAfterSummary(database, context, dayId);
    expect(closed.day.status).toBe("closed");
    expect(closed.day.end_odometer).toBe(155386);
    expect(await getLastClosedDayFinalOdometer(database, USER_ID)).toBe(155386);
    expect(await getOpenDayState(database, context)).toBeNull();
    await database.delete();
  });

  it("saves visited stops in locations once, with last_used_at set", async () => {
    const { database, context } = await setup();
    await enterFixtureA(database, context);
    const all = await listLocations(database, USER_ID, { includeArchived: true });
    expect(all).toHaveLength(4); // Home + Office from the profile, Dsk Law, Agat.
    expect(all.filter((row) => row.type === "office")).toHaveLength(1);
    const dsk = all.find((row) => row.name === "Dsk Law");
    expect(dsk?.last_used_at).not.toBeNull();
    await database.delete();
  });
});

describe("day service: start day blocking", () => {
  it("blocks a new day while an earlier day is still open and names it", async () => {
    const { database, context } = await setup();
    const first = await startDay(database, context, { date: "2026-07-02", startOdometer: 155301 });
    expect(first.status).toBe("created");

    const second = await startDay(database, context, { date: "2026-07-03", startOdometer: 155386 });
    expect(second.status).toBe("blocked");
    if (second.status === "blocked") {
      expect(second.openDay.date).toBe("2026-07-02");
    }
    await database.delete();
  });
});

describe("day service: odometer shortcut", () => {
  it("saves the completed reading the user confirmed ('339' after 155325)", async () => {
    const { database, context } = await setup();
    const started = await startDay(database, context, {
      date: "2026-07-02",
      startOdometer: 155301,
    });
    if (started.status !== "created") throw new Error("blocked");
    const dayId = started.day.id;
    mustSave(await logStop(database, context, dayId, CANON, 155325));

    const completed = completeOdometer("339", 155325);
    expect(completed).toBe(155339);
    const saved = mustSave(await logStop(database, context, dayId, DSK, completed));
    expect(saved.leg.odo_start).toBe(155325);
    expect(saved.leg.odo_end).toBe(155339);
    expect(saved.leg.distance).toBe(14);
    await database.delete();
  });
});

describe("day service: edit, delete, insert, undo", () => {
  it("recalculates neighbours when a middle leg's odometer end changes", async () => {
    const { database, context } = await setup();
    const { dayId, endedState } = await enterFixtureA(database, context);
    const agatLeg = endedState.legs[2];
    if (!agatLeg) throw new Error("missing leg");

    const result = await editLeg(database, context, dayId, agatLeg.id, { odo_end: 155350 });
    if (result.status !== "saved") throw new Error("edit did not save");
    const legs = result.state.legs;
    expect(legs.map((leg) => leg.distance)).toEqual([24, 14, 11, 11, 25]);
    expect(legs.map((leg) => leg.claimable)).toEqual([null, 14, 11, 11, null]);
    for (const [index, leg] of legs.entries()) {
      if (index > 0) expect(leg.odo_start).toBe(legs[index - 1]?.odo_end);
    }
    await database.delete();
  });

  it("restores the exact pre-change day when a snapshot is restored (Undo)", async () => {
    const { database, context } = await setup();
    const { dayId, endedState } = await enterFixtureA(database, context);
    const agatLeg = endedState.legs[2];
    if (!agatLeg) throw new Error("missing leg");

    const result = await editLeg(database, context, dayId, agatLeg.id, { odo_end: 155350 });
    if (result.status !== "saved") throw new Error("edit did not save");
    await restoreDaySnapshot(database, result.previousSnapshot);

    const { getDayState } = await import("../src/features/day/dayService");
    const restored = await getDayState(database, context, dayId);
    expect(restored.legs.map((leg) => leg.id)).toEqual(endedState.legs.map((leg) => leg.id));
    expect(restored.legs.map((leg) => leg.distance)).toEqual([24, 14, 8, 14, 25]);
    expect(restored.totals.totalClaimable).toBe(36);
    expect(restored.totals.totalParkingCents).toBe(2050);
    await database.delete();
  });

  it("deletes a leg and re-chains its neighbours, then inserts the missed stop back", async () => {
    const { database, context } = await setup();
    const { dayId, endedState } = await enterFixtureA(database, context);
    const dskLeg = endedState.legs[1];
    const canonLeg = endedState.legs[0];
    if (!dskLeg || !canonLeg) throw new Error("missing legs");

    const deleted = await deleteLeg(database, context, dayId, dskLeg.id);
    expect(deleted.state.legs.map((leg) => leg.to_name)).toEqual([
      "Canon",
      "Agat Laboratories",
      "Canon",
      "Home",
    ]);
    expect(deleted.state.legs.map((leg) => leg.distance)).toEqual([24, 22, 14, 25]);
    expect(deleted.state.legs.map((leg) => leg.claimable)).toEqual([null, 22, 14, null]);
    expect(deleted.state.totals.totalDistance).toBe(85);
    for (const [index, leg] of deleted.state.legs.entries()) {
      if (index > 0) expect(leg.odo_start).toBe(deleted.state.legs[index - 1]?.odo_end);
    }

    const inserted = await insertLeg(database, context, dayId, canonLeg.id, DSK, 155339);
    if (inserted.status !== "saved") throw new Error("insert did not save");
    expect(inserted.state.legs.map((leg) => leg.distance)).toEqual([24, 14, 8, 14, 25]);
    expect(inserted.state.legs.map((leg) => leg.claimable)).toEqual([null, 14, 8, 14, null]);
    expect(inserted.state.totals.totalClaimable).toBe(36);
    await database.delete();
  });
});

describe("day service: parking rules", () => {
  it("rejects parking on a leg that ends at Home", async () => {
    const { database, context } = await setup();
    const started = await startDay(database, context, {
      date: "2026-07-02",
      startOdometer: 155301,
    });
    if (started.status !== "created") throw new Error("blocked");
    await expect(
      logStop(
        database,
        context,
        started.day.id,
        { name: "Home", address: HOME_ADDRESS, type: "home" },
        155350,
        { parking_cents: 500 },
      ),
    ).rejects.toThrow(/Home/);
    await database.delete();
  });

  it("holds an over-$100 amount for confirmation and writes nothing until confirmed", async () => {
    const { database, context } = await setup();
    const started = await startDay(database, context, {
      date: "2026-07-02",
      startOdometer: 155301,
    });
    if (started.status !== "created") throw new Error("blocked");
    const dayId = started.day.id;

    const held = await logStop(database, context, dayId, DSK, 155340, { parking_cents: 15000 });
    expect(held.status).toBe("needs-parking-confirmation");
    const open = await getOpenDayState(database, context);
    expect(open?.legs).toHaveLength(0);

    const saved = mustSave(
      await logStop(database, context, dayId, DSK, 155340, {
        parking_cents: 15000,
        parking_confirmed: true,
      }),
    );
    expect(saved.leg.parking_cents).toBe(15000);
    expect(saved.state.totals.totalParkingCents).toBe(15000);
    await database.delete();
  });
});

describe("formatFullDateLabel", () => {
  it("renders one date with the correct weekday", () => {
    expect(formatFullDateLabel("2026-07-02")).toBe("Thu, Jul 02, 2026");
    expect(formatFullDateLabel("2026-07-03")).toBe("Fri, Jul 03, 2026");
    expect(formatFullDateLabel("2026-10-22")).toBe("Thu, Oct 22, 2026");
    expect(formatFullDateLabel("2026-10-23")).toBe("Fri, Oct 23, 2026");
    expect(formatFullDateLabel("2026-01-01")).toBe("Thu, Jan 01, 2026");
  });
});
