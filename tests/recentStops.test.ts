import { describe, expect, it } from "vitest";
import type { LocationRecord } from "../src/data";
import { filterRecentStops } from "../src/features/day/recentStops";

function place(name: string, address: string): LocationRecord {
  return {
    id: `loc-${name}`,
    user_id: "user-1",
    name,
    address,
    place_id: null,
    lat: null,
    lng: null,
    type: "customer",
    last_used_at: null,
    archived: false,
    created_at: "2026-10-22T00:00:00.000Z",
    updated_at: "2026-10-22T00:00:00.000Z",
    deleted_at: null,
  };
}

/** Ten saved places, most recently used first. */
const SAVED: LocationRecord[] = [
  "Canon",
  "Dsk Law",
  "Agat Laboratories",
  "Customer A",
  "Customer B",
  "Customer C",
  "Customer D",
  "Customer E",
  "Customer F",
  "Zebra Printers",
].map((name, index) => place(name, `${index + 1} Example Street, Vancouver, BC`));

describe("filterRecentStops", () => {
  it("shows the first 8 saved places with no query", () => {
    const shown = filterRecentStops(SAVED, "");
    expect(shown).toHaveLength(8);
    expect(shown[0]?.name).toBe("Canon");
    expect(shown[7]?.name).toBe("Customer E");
  });

  it("finds a place beyond the first 8 once its name is typed (filter before cap)", () => {
    // Zebra Printers is 10th by recency: the old slice-then-filter
    // never showed it, so typing its name returned only web results.
    const shown = filterRecentStops(SAVED, "zebra");
    expect(shown.map((stop) => stop.name)).toEqual(["Zebra Printers"]);
  });

  it("matches by name or address, case-insensitively", () => {
    expect(filterRecentStops(SAVED, "AGAT").map((stop) => stop.name)).toEqual([
      "Agat Laboratories",
    ]);
    expect(filterRecentStops(SAVED, "10 example").map((stop) => stop.name)).toEqual([
      "Zebra Printers",
    ]);
  });

  it("caps matches at 8", () => {
    expect(filterRecentStops(SAVED, "customer")).toHaveLength(6);
    expect(filterRecentStops(SAVED, "example")).toHaveLength(8);
  });
});
