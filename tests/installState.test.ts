import { describe, expect, it } from "vitest";
import {
  installDismissalCount,
  isAppleMobileUserAgent,
  MAX_INSTALL_CARD_DISMISSALS,
  shouldShowInstallCard,
} from "../src/features/day/installState";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1";
const IPADOS_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const MAC_SAFARI = IPADOS_DESKTOP_UA;

describe("isAppleMobileUserAgent", () => {
  it("detects iPhone Safari and iPhone Chrome (both install via Share)", () => {
    expect(isAppleMobileUserAgent(IPHONE_SAFARI)).toBe(true);
    expect(isAppleMobileUserAgent(IPHONE_CHROME)).toBe(true);
  });

  it("detects iPadOS by its Macintosh UA plus multi-touch", () => {
    expect(isAppleMobileUserAgent(IPADOS_DESKTOP_UA, 5)).toBe(true);
    expect(isAppleMobileUserAgent(IPADOS_DESKTOP_UA, 0)).toBe(false);
  });

  it("rejects Android and desktop Mac Safari", () => {
    expect(isAppleMobileUserAgent(ANDROID_CHROME, 5)).toBe(false);
    expect(isAppleMobileUserAgent(MAC_SAFARI, 0)).toBe(false);
  });
});

describe("shouldShowInstallCard", () => {
  const fresh = { standalone: false, installed: false, dismissals: 0 };

  it("shows for a fresh browser user", () => {
    expect(shouldShowInstallCard(fresh)).toBe(true);
    expect(shouldShowInstallCard({ ...fresh, dismissals: 1 })).toBe(true);
  });

  it("hides once dismissed twice", () => {
    expect(MAX_INSTALL_CARD_DISMISSALS).toBe(2);
    expect(shouldShowInstallCard({ ...fresh, dismissals: 2 })).toBe(false);
    expect(shouldShowInstallCard({ ...fresh, dismissals: 5 })).toBe(false);
  });

  it("hides when running standalone or known installed", () => {
    expect(shouldShowInstallCard({ ...fresh, standalone: true })).toBe(false);
    expect(shouldShowInstallCard({ ...fresh, installed: true })).toBe(false);
  });
});

describe("installDismissalCount", () => {
  it("prefers the stored count", () => {
    expect(installDismissalCount("2", null)).toBe(2);
    expect(installDismissalCount("1", "1")).toBe(1);
    expect(installDismissalCount("0", "1")).toBe(0);
  });

  it("counts a legacy boolean dismissal as one", () => {
    expect(installDismissalCount(null, "1")).toBe(1);
    expect(installDismissalCount(null, null)).toBe(0);
    expect(installDismissalCount(null, "0")).toBe(0);
  });

  it("treats a corrupt count as zero", () => {
    expect(installDismissalCount("banana", null)).toBe(0);
  });
});
