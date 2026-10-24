import { describe, expect, it } from "vitest";
import { tourSeen } from "../src/features/tour/tourState";

describe("tourSeen", () => {
  it("only the written flag counts as seen", () => {
    expect(tourSeen("1")).toBe(true);
    expect(tourSeen(null)).toBe(false);
    expect(tourSeen("")).toBe(false);
    expect(tourSeen("true")).toBe(false);
    expect(tourSeen("0")).toBe(false);
  });
});
