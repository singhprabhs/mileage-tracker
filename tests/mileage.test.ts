import { describe, expect, it } from "vitest";
import {
  applyHomeOfficeKmChange,
  claimable,
  computeLeg,
  distance,
  periodTotals,
} from "../src/domain/mileage";
import type { Leg, StoredLeg } from "../src/domain/types";
import { fixtureA, fixtureB, fixtureC } from "./fixtures";

function simpleLeg(from_type: Leg["from_type"], to_type: Leg["to_type"], km: number): Leg {
  return {
    from_name: from_type,
    from_address: "",
    from_type,
    to_name: to_type,
    to_address: "",
    to_type,
    odo_start: 1000,
    odo_end: 1000 + km,
    parking_cents: null,
    parking_note: null,
    note: null,
  };
}

describe("distance", () => {
  it("is odo_end minus odo_start", () => {
    expect(distance({ odo_start: 155301, odo_end: 155325 })).toBe(24);
    expect(distance({ odo_start: 100, odo_end: 100 })).toBe(0);
  });
});

describe("claimable", () => {
  it("Home <-> Office is never claimable, in either direction", () => {
    expect(claimable(simpleLeg("home", "office", 24))).toBeNull();
    expect(claimable(simpleLeg("office", "home", 25))).toBeNull();
  });

  it("Home -> customer is claimable only above the 23 km commute distance", () => {
    expect(claimable(simpleLeg("home", "customer", 40))).toBe(17);
    expect(claimable(simpleLeg("home", "customer", 24))).toBe(1);
  });

  it("Home -> customer of 20 km gives no claimable value (below zero is floored)", () => {
    expect(claimable(simpleLeg("home", "customer", 20))).toBeNull();
  });

  it("Home -> customer of exactly 23 km gives no claimable value", () => {
    expect(claimable(simpleLeg("home", "customer", 23))).toBeNull();
  });

  it("customer -> Home uses the same excess-over-23 rule", () => {
    expect(claimable(simpleLeg("customer", "home", 44))).toBe(21);
    expect(claimable(simpleLeg("customer", "home", 20))).toBeNull();
  });

  it("all other legs are claimable in full", () => {
    expect(claimable(simpleLeg("office", "customer", 14))).toBe(14);
    expect(claimable(simpleLeg("customer", "customer", 8))).toBe(8);
    expect(claimable(simpleLeg("customer", "office", 14))).toBe(14);
    expect(claimable(simpleLeg("office", "office", 3))).toBe(3);
  });

  it("respects a custom home-office distance", () => {
    expect(claimable(simpleLeg("home", "customer", 40), 10)).toBe(30);
    expect(claimable(simpleLeg("home", "customer", 40), 40)).toBeNull();
  });
});

describe("Fixture A (Jul 02)", () => {
  it("has the expected per-leg distances", () => {
    expect(fixtureA.map((leg) => distance(leg))).toEqual([24, 14, 8, 14, 25]);
  });

  it("has the expected per-leg claimable values, null for commute legs", () => {
    expect(fixtureA.map((leg) => claimable(leg))).toEqual([null, 14, 8, 14, null]);
  });

  it("totals 85 km distance and 36 km claimable", () => {
    const totals = periodTotals(fixtureA);
    expect(totals.totalDistance).toBe(85);
    expect(totals.totalClaimable).toBe(36);
    expect(totals.totalParkingCents).toBe(0);
    expect(totals.odometerStart).toBe(155301);
    expect(totals.odometerEnd).toBe(155386);
  });
});

describe("Fixture B (Jul 03)", () => {
  it("has claimable 17 and 21", () => {
    expect(fixtureB.map((leg) => claimable(leg))).toEqual([17, 21]);
  });

  it("period Jul 02 to Jul 03: odo 155301 to 155470, total claimable 74", () => {
    const totals = periodTotals([...fixtureA, ...fixtureB]);
    expect(totals.odometerStart).toBe(155301);
    expect(totals.odometerEnd).toBe(155470);
    expect(totals.totalClaimable).toBe(74);
    expect(totals.totalDistance).toBe(169);
  });
});

describe("periodTotals on an empty range", () => {
  it("returns zeroes and null odometer bounds", () => {
    expect(periodTotals([])).toEqual({
      totalDistance: 0,
      totalClaimable: 0,
      totalParkingCents: 0,
      odometerStart: null,
      odometerEnd: null,
    });
  });
});

describe("changing the Home <-> Office distance", () => {
  it("recalculates unlocked legs and keeps locked legs' stored values", () => {
    const stored: StoredLeg[] = [
      { ...computeLeg(simpleLeg("home", "customer", 40)), locked: false },
      { ...computeLeg(simpleLeg("home", "customer", 40)), locked: true },
    ];
    expect(stored[0]?.claimable).toBe(17);
    const updated = applyHomeOfficeKmChange(stored, 10);
    expect(updated[0]?.claimable).toBe(30);
    expect(updated[1]?.claimable).toBe(17);
    expect(updated[1]?.distance).toBe(40);
  });
});

describe("Fixture C parking totals through periodTotals", () => {
  it("parking does not change distance or claimable", () => {
    const totals = periodTotals(fixtureC);
    expect(totals.totalDistance).toBe(85);
    expect(totals.totalClaimable).toBe(36);
    expect(totals.totalParkingCents).toBe(2050);
  });

  it("period Jul 02 to Jul 03 with Fixture C still totals $20.50 parking", () => {
    const totals = periodTotals([...fixtureC, ...fixtureB]);
    expect(totals.totalParkingCents).toBe(2050);
    expect(totals.totalClaimable).toBe(74);
  });
});
