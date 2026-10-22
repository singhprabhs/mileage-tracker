import { describe, expect, it } from "vitest";
import {
  canHaveParking,
  formatParking,
  parkingCentsFromKeypad,
  sumParkingCents,
  validateParking,
} from "../src/domain/parking";
import { periodTotals } from "../src/domain/mileage";
import { fixtureA, fixtureC } from "./fixtures";

describe("parking sums in integer cents", () => {
  it("1250 cents plus 800 cents equals 2050 cents, displayed as $20.50", () => {
    const total = sumParkingCents([1250, 800]);
    expect(total).toBe(2050);
    expect(formatParking(total)).toBe("$20.50");
  });

  it("repeated cent additions have no floating-point error", () => {
    expect(sumParkingCents([10, 10, 10, 10, 10, 10, 10])).toBe(70);
    expect(formatParking(sumParkingCents([1, 2]))).toBe("$0.03");
  });

  it("null counts as no parking", () => {
    expect(sumParkingCents([null, 500, null])).toBe(500);
    expect(sumParkingCents([null, null])).toBe(0);
    expect(sumParkingCents([])).toBe(0);
  });

  it("rejects non-integer cents", () => {
    expect(() => sumParkingCents([12.5])).toThrow(RangeError);
    expect(() => formatParking(20.5)).toThrow(RangeError);
  });
});

describe("formatParking", () => {
  it("formats whole dollars, cents, and zero", () => {
    expect(formatParking(2050)).toBe("$20.50");
    expect(formatParking(800)).toBe("$8.00");
    expect(formatParking(5)).toBe("$0.05");
    expect(formatParking(0)).toBe("$0.00");
    expect(formatParking(10000)).toBe("$100.00");
  });
});

describe("parking keypad entry (cents first)", () => {
  it("typed 1250 becomes 1250 cents / $12.50", () => {
    expect(parkingCentsFromKeypad("1250")).toBe(1250);
    expect(formatParking(parkingCentsFromKeypad("1250"))).toBe("$12.50");
  });

  it("typed 5 becomes $0.05", () => {
    expect(parkingCentsFromKeypad("5")).toBe(5);
    expect(formatParking(parkingCentsFromKeypad("5"))).toBe("$0.05");
  });

  it("empty input is 0 and non-digits are rejected", () => {
    expect(parkingCentsFromKeypad("")).toBe(0);
    expect(() => parkingCentsFromKeypad("12.50")).toThrow(RangeError);
    expect(() => parkingCentsFromKeypad("-5")).toThrow(RangeError);
  });
});

describe("validateParking", () => {
  it("allows parking on legs ending at a customer or the Office", () => {
    expect(validateParking(1250, "customer")).toEqual({
      valid: true,
      needsConfirmation: false,
      error: null,
    });
    expect(validateParking(1250, "office").valid).toBe(true);
    expect(canHaveParking("customer")).toBe(true);
    expect(canHaveParking("office")).toBe(true);
    expect(canHaveParking("home")).toBe(false);
  });

  it("rejects parking on a leg ending at Home", () => {
    const result = validateParking(1250, "home");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Home/);
  });

  it("blank or zero means no parking and is valid even ending at Home", () => {
    expect(validateParking(null, "home").valid).toBe(true);
    expect(validateParking(0, "home").valid).toBe(true);
    expect(validateParking(null, "customer").valid).toBe(true);
  });

  it("rejects negative amounts", () => {
    expect(validateParking(-100, "customer").valid).toBe(false);
  });

  it("rejects non-integer amounts", () => {
    expect(validateParking(12.5, "customer").valid).toBe(false);
  });

  it("amounts over $100.00 ask for confirmation; exactly $100.00 does not", () => {
    expect(validateParking(10001, "customer")).toEqual({
      valid: true,
      needsConfirmation: true,
      error: null,
    });
    expect(validateParking(15000, "customer").needsConfirmation).toBe(true);
    expect(validateParking(10000, "customer").needsConfirmation).toBe(false);
  });
});

describe("Fixture C (Fixture A with parking)", () => {
  it("day parking total is $20.50", () => {
    const totals = periodTotals(fixtureC);
    expect(totals.totalParkingCents).toBe(2050);
    expect(formatParking(totals.totalParkingCents)).toBe("$20.50");
  });

  it("distance (85 km) and claimable (36 km) are unchanged by parking", () => {
    const withParking = periodTotals(fixtureC);
    const withoutParking = periodTotals(fixtureA);
    expect(withParking.totalDistance).toBe(withoutParking.totalDistance);
    expect(withParking.totalClaimable).toBe(withoutParking.totalClaimable);
    expect(withoutParking.totalParkingCents).toBe(0);
  });

  it("parking is on the legs ending at Dsk Law ($12.50) and Agat Laboratories ($8.00)", () => {
    const dsk = fixtureC.find((leg) => leg.to_name === "Dsk Law");
    const agat = fixtureC.find((leg) => leg.to_name === "Agat Laboratories");
    expect(dsk?.parking_cents).toBe(1250);
    expect(dsk?.parking_note).toBe("Street meter");
    expect(agat?.parking_cents).toBe(800);
    for (const leg of fixtureC) {
      if (leg.parking_cents !== null) {
        expect(validateParking(leg.parking_cents, leg.to_type).valid).toBe(true);
      }
    }
  });
});
