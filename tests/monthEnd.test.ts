import { describe, expect, it } from "vitest";
import {
  monthEndCard,
  type MonthAggregate,
} from "../src/features/day/monthEnd";

const NONE: MonthAggregate = { closedDays: 0, claimableKm: 0 };
const OCTOBER: MonthAggregate = { closedDays: 9, claimableKm: 74 };

describe("monthEndCard: the month's last three days", () => {
  it("names today / tomorrow / the weekday the month ends", () => {
    expect(monthEndCard("2026-10-31", OCTOBER, NONE, null)?.headline).toBe(
      "October ends today",
    );
    expect(monthEndCard("2026-10-30", OCTOBER, NONE, null)?.headline).toBe(
      "October ends tomorrow",
    );
    // Oct 29: two days left, and Oct 31, 2026 is a Saturday.
    expect(monthEndCard("2026-10-29", OCTOBER, NONE, null)?.headline).toBe(
      "October ends Saturday",
    );
  });

  it("carries the month key, the full-month range and the claimable detail", () => {
    const card = monthEndCard("2026-10-30", OCTOBER, NONE, null);
    expect(card?.monthKey).toBe("2026-10");
    expect(card?.range).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(card?.detail).toBe("74 km claimable this month.");
    expect(card?.actionLabel).toBe("See October's report");
  });

  it("stays quiet outside the window and with no closed days", () => {
    expect(monthEndCard("2026-10-28", OCTOBER, NONE, null)).toBeNull();
    expect(monthEndCard("2026-10-15", OCTOBER, NONE, null)).toBeNull();
    expect(monthEndCard("2026-10-30", NONE, NONE, null)).toBeNull();
    // A month with closed days but nothing claimable still prompts in
    // window 1 — the report exists even at 0 claimable.
    expect(
      monthEndCard("2026-10-30", { closedDays: 2, claimableKm: 0 }, NONE, null)?.detail,
    ).toBe("0 km claimable this month.");
  });

  it("handles a 28-day February and a December year end", () => {
    // Feb 26, 2026: two days left; Feb 28, 2026 is a Saturday.
    expect(
      monthEndCard("2026-02-26", { closedDays: 4, claimableKm: 40 }, NONE, null)?.headline,
    ).toBe("February ends Saturday");
    expect(
      monthEndCard("2026-02-26", { closedDays: 4, claimableKm: 40 }, NONE, null)?.range,
    ).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    // Dec 30, 2026 → ends tomorrow (Thu Dec 31).
    expect(monthEndCard("2026-12-30", OCTOBER, NONE, null)?.headline).toBe(
      "December ends tomorrow",
    );
  });
});

describe("monthEndCard: the first three days, for the month just ended", () => {
  it("offers the previous month's report", () => {
    const card = monthEndCard("2026-11-02", NONE, OCTOBER, null);
    expect(card?.headline).toBe("October has ended");
    expect(card?.monthKey).toBe("2026-10");
    expect(card?.range).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(card?.detail).toBe("74 km claimable. Send the report when you're ready.");
    expect(card?.actionLabel).toBe("See October's report");
  });

  it("crosses the year boundary (January looks back at December)", () => {
    const card = monthEndCard("2027-01-01", NONE, { closedDays: 5, claimableKm: 55 }, null);
    expect(card?.headline).toBe("December has ended");
    expect(card?.monthKey).toBe("2026-12");
    expect(card?.range).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });

  it("stays quiet after the 3rd, with no closed days, or with nothing claimable", () => {
    expect(monthEndCard("2026-11-04", NONE, OCTOBER, null)).toBeNull();
    expect(monthEndCard("2026-11-02", NONE, NONE, null)).toBeNull();
    expect(
      monthEndCard("2026-11-02", NONE, { closedDays: 6, claimableKm: 0 }, null),
    ).toBeNull();
  });
});

describe("monthEndCard: dismissal is per month", () => {
  it("a dismissal suppresses only that month's card", () => {
    expect(monthEndCard("2026-10-30", OCTOBER, NONE, "2026-10")).toBeNull();
    expect(monthEndCard("2026-10-30", OCTOBER, NONE, "2026-09")).not.toBeNull();
    expect(monthEndCard("2026-11-02", NONE, OCTOBER, "2026-10")).toBeNull();
    // November's own ending card is a different month — unaffected.
    expect(
      monthEndCard("2026-11-29", { closedDays: 3, claimableKm: 30 }, NONE, "2026-10"),
    ).not.toBeNull();
  });
});
