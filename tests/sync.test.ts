import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { MileageDatabase } from "../src/data/db";
import { META_KEYS, getMetaValue, setMetaValue } from "../src/data/meta";
import { listOutbox } from "../src/data/outbox";
import { listLegsByDay } from "../src/data/repositories/days";
import { getProfile, saveProfileWithLocations } from "../src/data/repositories/profiles";
import { SyncEngine, type RemoteRow, type RemoteStore } from "../src/data/sync";
import type { SyncEntity } from "../src/data/types";
import { periodTotals } from "../src/domain";
import {
  closeDayAfterSummary,
  editLeg,
  endDay,
  loadDayContext,
  logStop,
  startDay,
  type DayContext,
  type LogStopResult,
  type StopDestination,
} from "../src/features/day/dayService";

let counter = 0;
function freshName(): string {
  counter += 1;
  return `mileage-sync-${counter}-${Date.now()}`;
}

const USER_ID = "33333333-3333-4333-8333-333333333333";
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

/** In-memory RemoteStore: the "server" for sync tests. No network. */
class FakeRemote implements RemoteStore {
  readonly rows: Record<SyncEntity, Map<string, RemoteRow>> = {
    profile: new Map(),
    location: new Map(),
    day: new Map(),
    leg: new Map(),
  };
  down = false;
  readonly failEntities = new Set<SyncEntity>();
  /** 1-based upsert call number that should throw (0 = never). */
  failAtCall = 0;
  readonly upsertCalls: { entity: SyncEntity; id: string }[] = [];

  async upsert(entity: SyncEntity, payload: Record<string, unknown>): Promise<void> {
    const id = entity === "profile" ? String(payload.user_id) : String(payload.id);
    this.upsertCalls.push({ entity, id });
    if (this.down || this.failEntities.has(entity) || this.upsertCalls.length === this.failAtCall) {
      throw new Error(`remote unavailable (${entity})`);
    }
    this.rows[entity].set(id, { ...payload } as RemoteRow);
  }

  async fetchSince(entity: SyncEntity, userId: string, since: string | null): Promise<RemoteRow[]> {
    if (this.down) throw new Error("remote unavailable (fetch)");
    const all = [...this.rows[entity].values()];
    return all.filter(
      (row) => row.user_id === userId && (since === null || String(row.updated_at) >= since),
    );
  }

  count(entity: SyncEntity): number {
    return this.rows[entity].size;
  }

  get(entity: SyncEntity, id: string): RemoteRow | undefined {
    return this.rows[entity].get(id);
  }
}

function makeEngine(database: MileageDatabase, remote: FakeRemote, online = true): SyncEngine {
  return new SyncEngine({
    database,
    remote,
    getUserId: async () => USER_ID,
    isOnline: () => online,
  });
}

async function setupProfile(database: MileageDatabase): Promise<{ context: DayContext }> {
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
  return { context };
}

function mustSave(result: LogStopResult) {
  if (result.status !== "saved") throw new Error(`Expected saved, got ${result.status}`);
  return result;
}

/** Enter the full Fixture A day (with Fixture C parking) and close it. */
async function enterFixtureADay(database: MileageDatabase, context: DayContext) {
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
  mustSave(await endDay(database, context, dayId, 155386));
  await closeDayAfterSummary(database, context, dayId);
  return dayId;
}

describe("outbox queueing", () => {
  it("queues profile saves with locations first, in write order, with snapshots", async () => {
    const database = new MileageDatabase(freshName());
    const saved = await saveProfileWithLocations(
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
    const items = await listOutbox(database);
    expect(items.map((item) => item.entity)).toEqual(["location", "location", "profile"]);
    expect(items.map((item) => item.entity_id)).toEqual([
      saved.homeLocation.id,
      saved.officeLocation.id,
      USER_ID,
    ]);
    expect(items.every((item) => item.action === "upsert" && item.attempts === 0)).toBe(true);
    expect(items[2]?.payload).toMatchObject({ user_id: USER_ID, name: "Test Person" });
    await database.delete();
  });
});

describe("sync engine: the Phase 4 Done-when scenario", () => {
  it("a full day logged offline syncs once, with no duplicates or lost legs", async () => {
    const name = freshName();
    const remote = new FakeRemote();
    remote.down = true; // "airplane mode": the server rejects everything.

    const first = new MileageDatabase(name);
    const { context } = await setupProfile(first);
    const dayId = await enterFixtureADay(first, context);

    const offlineEngine = makeEngine(first, remote);
    const offlineStatus = await offlineEngine.runSync();
    expect(offlineStatus.state).toBe("pending");
    expect(offlineStatus.pendingCount).toBeGreaterThan(0);
    expect(remote.count("leg")).toBe(0);
    const queuedBeforeReload = offlineStatus.pendingCount;
    await first.close();

    // Reload: a fresh instance over the same database, like an app restart.
    const reopened = new MileageDatabase(name);
    const legsAfterReload = await listLegsByDay(reopened, dayId);
    expect(legsAfterReload).toHaveLength(5);
    expect(periodTotals(legsAfterReload, 23).totalDistance).toBe(85);
    expect(periodTotals(legsAfterReload, 23).totalClaimable).toBe(36);
    expect(await listOutbox(reopened)).toHaveLength(queuedBeforeReload);

    // Back online: everything syncs, exactly once per record.
    remote.down = false;
    const onlineEngine = makeEngine(reopened, remote);
    const synced = await onlineEngine.runSync();
    expect(synced.state).toBe("synced");
    expect(synced.pendingCount).toBe(0);
    expect(await listOutbox(reopened)).toHaveLength(0);
    expect(remote.count("profile")).toBe(1);
    expect(remote.count("location")).toBe(4); // Home, Office, Dsk Law, Agat
    expect(remote.count("day")).toBe(1);
    expect(remote.count("leg")).toBe(5);
    const localLegIds = new Set(legsAfterReload.map((leg) => leg.id));
    expect(new Set(remote.rows.leg.keys())).toEqual(localLegIds);
    expect(remote.get("day", dayId)).toMatchObject({ status: "closed", end_odometer: 155386 });
    const callsAfterFirstSync = remote.upsertCalls.length;

    // Idempotent: a second sync sends nothing and duplicates nothing.
    const again = await onlineEngine.runSync();
    expect(again.state).toBe("synced");
    expect(remote.upsertCalls).toHaveLength(callsAfterFirstSync);
    expect(remote.count("leg")).toBe(5);
    expect(remote.count("location")).toBe(4);
    await reopened.delete();
  });
});

describe("sync engine: push failures", () => {
  it("stops at the failed item, preserves order, and increments attempts", async () => {
    const database = new MileageDatabase(freshName());
    await setupProfile(database);
    const remote = new FakeRemote();
    remote.failAtCall = 2; // The second queued change (Office location) fails.
    const engine = makeEngine(database, remote);

    const status = await engine.runSync();
    expect(status.state).toBe("pending");
    expect(status.lastError).toContain("remote unavailable");
    expect(remote.count("location")).toBe(1); // Only the Home location landed.

    const items = await listOutbox(database);
    expect(items).toHaveLength(2);
    expect(items[0]?.attempts).toBe(1);
    expect(items[0]?.last_error).toContain("remote unavailable");
    expect(items[1]?.attempts).toBe(0); // Never attempted: order preserved.
    await database.delete();
  });

  it("surfaces an error after 3 failed attempts, locks, and Retry recovers", async () => {
    const database = new MileageDatabase(freshName());
    await setupProfile(database);
    const remote = new FakeRemote();
    remote.down = true;
    const engine = makeEngine(database, remote);

    await engine.runSync();
    await engine.runSync();
    const third = await engine.runSync();
    expect(third.state).toBe("error");
    expect(third.lastError).toContain("remote unavailable");
    const lockedItems = await listOutbox(database);
    expect(lockedItems[0]?.attempts).toBe(3);

    // A locked item is not hammered by further automatic runs.
    await engine.runSync();
    expect((await listOutbox(database))[0]?.attempts).toBe(3);

    remote.down = false;
    const recovered = await engine.retry();
    expect(recovered.state).toBe("synced");
    expect(await listOutbox(database)).toHaveLength(0);
    expect(remote.count("profile")).toBe(1);
    await database.delete();
  });

  it("reports offline instead of syncing when there is no connection", async () => {
    const database = new MileageDatabase(freshName());
    await setupProfile(database);
    const remote = new FakeRemote();
    const engine = makeEngine(database, remote, false);
    const status = await engine.runSync();
    expect(status.state).toBe("offline");
    expect(status.pendingCount).toBe(3);
    expect(remote.upsertCalls).toHaveLength(0);
    await database.delete();
  });

  it("never claims synced when signed out or unconfigured", async () => {
    const database = new MileageDatabase(freshName());
    await setupProfile(database);
    const remote = new FakeRemote();
    const signedOut = new SyncEngine({
      database,
      remote,
      getUserId: async () => null,
      isOnline: () => true,
    });
    const status = await signedOut.runSync();
    expect(status.localOnly).toBe(true);
    expect(status.state).toBe("pending");
    expect(remote.upsertCalls).toHaveLength(0);

    const unconfigured = new SyncEngine({
      database,
      remote: null,
      getUserId: async () => USER_ID,
      isOnline: () => true,
    });
    const localStatus = await unconfigured.refreshStatus();
    expect(localStatus.localOnly).toBe(true);
    expect(localStatus.state).not.toBe("synced");
    await database.delete();
  });
});

describe("sync engine: pull merges", () => {
  it("applies last-write-wins: a newer remote row wins, an older one does not clobber", async () => {
    const database = new MileageDatabase(freshName());
    await setupProfile(database);
    const remote = new FakeRemote();
    const engine = makeEngine(database, remote);
    await engine.runSync();
    expect(remote.count("profile")).toBe(1);

    const remoteProfile = remote.get("profile", USER_ID);
    if (!remoteProfile) throw new Error("Profile was not pushed");
    remote.rows.profile.set(USER_ID, {
      ...remoteProfile,
      name: "Remote Newer Name",
      updated_at: "2999-01-01T00:00:00.000Z",
    });
    await engine.runSync();
    expect((await getProfile(database))?.name).toBe("Remote Newer Name");

    // An older remote copy arriving later must not clobber the newer local row.
    remote.rows.profile.set(USER_ID, {
      ...remoteProfile,
      name: "Remote Older Name",
      updated_at: "2000-01-01T00:00:00.000Z",
    });
    await setMetaValue(database, META_KEYS.lastPulledAt, "1999-01-01T00:00:00.000Z");
    await engine.runSync();
    expect((await getProfile(database))?.name).toBe("Remote Newer Name");
    await database.delete();
  });

  it("does not overwrite a record that still has a pending local change", async () => {
    const database = new MileageDatabase(freshName());
    const { context } = await setupProfile(database);
    const started = await startDay(database, context, {
      date: "2026-07-02",
      startOdometer: 155301,
    });
    if (started.status !== "created") throw new Error("Day was blocked");
    const dayId = started.day.id;
    mustSave(await logStop(database, context, dayId, CANON, 155325));

    const remote = new FakeRemote();
    const engine = makeEngine(database, remote);
    await engine.runSync();
    expect(remote.count("leg")).toBe(1);
    const legId = (await listLegsByDay(database, dayId))[0]?.id;
    if (!legId) throw new Error("Leg missing");

    // Local edit queues a change; the server meanwhile holds a "newer"
    // copy of the same leg (as if edited on a second device).
    const edited = await editLeg(database, context, dayId, legId, { odo_end: 155330 });
    if (edited.status !== "saved") throw new Error("Edit was not saved");
    const remoteLeg = remote.get("leg", legId);
    if (!remoteLeg) throw new Error("Leg was not pushed");
    remote.rows.leg.set(legId, {
      ...remoteLeg,
      odo_end: 155399,
      updated_at: "2999-01-01T00:00:00.000Z",
    });

    // Leg pushes fail this run, so the leg stays pending; the pull that
    // follows must skip it instead of overwriting the local edit.
    remote.failEntities.add("leg");
    await engine.runSync();
    const legs = await listLegsByDay(database, dayId);
    expect(legs[0]?.odo_end).toBe(155330);
    await database.delete();
  });

  it("flags the day for review when a pulled merge breaks the leg chain", async () => {
    const database = new MileageDatabase(freshName());
    const { context } = await setupProfile(database);
    const dayId = await enterFixtureADay(database, context);
    const remote = new FakeRemote();
    const engine = makeEngine(database, remote);
    await engine.runSync();
    expect(remote.count("leg")).toBe(5);

    // Another device changed the Agat leg's end reading: the next leg now
    // starts at a reading that no longer follows it.
    const localLegs = await listLegsByDay(database, dayId);
    const agatLeg = localLegs[2];
    if (!agatLeg) throw new Error("Agat leg missing");
    const remoteLeg = remote.get("leg", agatLeg.id);
    if (!remoteLeg) throw new Error("Agat leg was not pushed");
    remote.rows.leg.set(agatLeg.id, {
      ...remoteLeg,
      odo_end: 155399,
      updated_at: "2999-01-01T00:00:00.000Z",
    });

    await engine.runSync();
    const mergedLegs = await listLegsByDay(database, dayId);
    expect(mergedLegs[2]?.odo_end).toBe(155399);
    const flaggedDay = await database.days.get(dayId);
    expect(flaggedDay?.needs_review).toBe(true);

    // When the chain is whole again, the flag clears.
    remote.rows.leg.set(agatLeg.id, {
      ...remoteLeg,
      updated_at: "2999-06-01T00:00:00.000Z",
    });
    await engine.runSync();
    const healedDay = await database.days.get(dayId);
    expect(healedDay?.needs_review).toBeFalsy();
    await database.delete();
  });
});

describe("schema migration v1 -> v2", () => {
  it("keeps existing data and adds the outbox and meta tables", async () => {
    const name = freshName();
    const v1 = new Dexie(name);
    v1.version(1).stores({
      profiles: "user_id",
      locations: "id, user_id, type, last_used_at",
      days: "id, user_id, date, status",
      legs: "id, day_id, [day_id+position], user_id",
    });
    await v1.open();
    await v1.table("profiles").put({
      user_id: USER_ID,
      name: "Existing Person",
      tech_id: "T-OLD-1",
      home_address: HOME_ADDRESS,
      home_place_id: null,
      home_lat: null,
      home_lng: null,
      office_location_id: null,
      home_office_km: 23,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
      deleted_at: null,
    });
    v1.close();

    const upgraded = new MileageDatabase(name);
    const profile = await getProfile(upgraded);
    expect(profile?.name).toBe("Existing Person");
    expect(await upgraded.outbox.count()).toBe(0);
    await setMetaValue(upgraded, META_KEYS.lastSyncAt, "2026-07-02T00:00:00.000Z");
    expect(await getMetaValue(upgraded, META_KEYS.lastSyncAt)).toBe("2026-07-02T00:00:00.000Z");
    await upgraded.delete();
  });
});
