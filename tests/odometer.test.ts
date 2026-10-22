import { describe, expect, it } from "vitest";
import {
  completeOdometer,
  legWarnings,
  recalculateChain,
  updateLegOdometerEnd,
} from "../src/domain/mileage";
import type { Leg } from "../src/domain/types";
import { fixtureA } from "./fixtures";

describe("completeOdometer", () => {
  it("typed 339 with previous 155325 gives 155339", () => {
    expect(completeOdometer("339", 155325)).toBe(155339);
  });

  it("typed 012 with previous 155990 gives 156012 (rollover)", () => {
    expect(completeOdometer("012", 155990)).toBe(156012);
  });

  it("a full six-digit entry is used as typed", () => {
    expect(completeOdometer("155339", 155325)).toBe(155339);
    expect(completeOdometer("140000", 155325)).toBe(140000);
  });

  it("an entry with at least as many digits as the previous reading is used as typed", () => {
    expect(completeOdometer("999", 999)).toBe(999);
    expect(completeOdometer("1000", 999)).toBe(1000);
  });

  it("rolls over when the completed candidate would be below the previous reading", () => {
    expect(completeOdometer("5", 155329)).toBe(155335);
    expect(completeOdometer("29", 155329)).toBe(155329);
  });

  it("keeps the same leading digits when there is no rollover", () => {
    expect(completeOdometer("400", 155386)).toBe(155400);
  });

  it("rejects empty and non-digit input", () => {
    expect(() => completeOdometer("", 155325)).toThrow(RangeError);
    expect(() => completeOdometer("33a", 155325)).toThrow(RangeError);
    expect(() => completeOdometer("-5", 155325)).toThrow(RangeError);
  });
});

describe("legWarnings", () => {
  function leg(odo_start: number, odo_end: number, from_name = "Alpha", to_name = "Beta"): Leg {
    return {
      from_name,
      from_address: "",
      from_type: "customer",
      to_name,
      to_address: "",
      to_type: "customer",
      odo_start,
      odo_end,
      parking_cents: null,
      parking_note: null,
      note: null,
    };
  }

  it("a reading below the previous one raises a warning", () => {
    const warnings = legWarnings(leg(155325, 155300));
    expect(warnings.map((w) => w.code)).toContain("negative-distance");
  });

  it("a normal leg raises no warnings", () => {
    expect(legWarnings(leg(155325, 155339))).toEqual([]);
  });

  it("a leg over 150 km warns", () => {
    const warnings = legWarnings(leg(1000, 1200));
    expect(warnings.map((w) => w.code)).toContain("over-150km");
  });

  it("a leg of exactly 150 km does not warn for length", () => {
    expect(legWarnings(leg(1000, 1150)).map((w) => w.code)).not.toContain("over-150km");
  });

  it("warns when over 3 times the median for the same From -> To pair", () => {
    const history = [leg(0, 10), leg(10, 20), leg(20, 30)];
    const warnings = legWarnings(leg(1000, 1040), history);
    expect(warnings.map((w) => w.code)).toContain("over-3x-median");
  });

  it("does not use history from a different pair for the median warning", () => {
    const history = [leg(0, 10, "Other", "Pair"), leg(10, 20, "Other", "Pair")];
    expect(legWarnings(leg(1000, 1040), history)).toEqual([]);
  });

  it("does not warn at exactly 3 times the median", () => {
    const history = [leg(0, 10), leg(10, 20), leg(20, 30)];
    expect(legWarnings(leg(1000, 1030), history).map((w) => w.code)).not.toContain(
      "over-3x-median",
    );
  });
});

describe("recalculateChain / editing a leg", () => {
  it("every leg's odo_start equals the previous leg's odo_end after recalculation", () => {
    const chain = recalculateChain(fixtureA);
    for (let i = 1; i < chain.length; i += 1) {
      expect(chain[i]?.odo_start).toBe(chain[i - 1]?.odo_end);
    }
    expect(chain.map((entry) => entry.distance)).toEqual([24, 14, 8, 14, 25]);
    expect(chain.map((entry) => entry.claimable)).toEqual([null, 14, 8, 14, null]);
  });

  it("repairs a broken chain by chaining starts from previous ends", () => {
    const broken = fixtureA.map((entry, i) =>
      i === 2 ? { ...entry, odo_start: 999999 } : { ...entry },
    );
    const chain = recalculateChain(broken);
    expect(chain[2]?.odo_start).toBe(155339);
    expect(chain[2]?.distance).toBe(8);
  });

  it("editing a middle leg's odometer end changes the next leg's start and recalculates both legs and the day total", () => {
    // Leg index 2 (Dsk Law -> Agat Laboratories) ends 8 km later than before.
    const updated = updateLegOdometerEnd(fixtureA, 2, 155355);
    expect(updated[2]?.odo_end).toBe(155355);
    expect(updated[2]?.distance).toBe(16);
    expect(updated[2]?.claimable).toBe(16);
    expect(updated[3]?.odo_start).toBe(155355);
    expect(updated[3]?.distance).toBe(6);
    expect(updated[3]?.claimable).toBe(6);
    // Following legs chain on from there.
    expect(updated[4]?.odo_start).toBe(155361);
    expect(updated.reduce((sum, entry) => sum + entry.distance, 0)).toBe(85);
    expect(updated.reduce((sum, entry) => sum + (entry.claimable ?? 0), 0)).toBe(36);
  });

  it("rejects an out-of-range leg index", () => {
    expect(() => updateLegOdometerEnd(fixtureA, 99, 155400)).toThrow(RangeError);
  });
});
