import { describe, expect, it } from "vitest";
import {
  parseThemePreference,
  resolveTheme,
  THEME_BACKGROUNDS,
} from "../src/ui/theme";

describe("parseThemePreference", () => {
  it("accepts the two stored values and defaults everything else to auto", () => {
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("auto")).toBe("auto");
    expect(parseThemePreference(null)).toBe("auto");
    expect(parseThemePreference("")).toBe("auto");
    expect(parseThemePreference("sepia")).toBe("auto");
  });
});

describe("resolveTheme", () => {
  it("auto follows the system; a forced scheme wins over it", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("backgrounds match the design tokens (--bg light / dark)", () => {
    expect(THEME_BACKGROUNDS).toEqual({ light: "#f6f7f9", dark: "#0e1116" });
  });
});
