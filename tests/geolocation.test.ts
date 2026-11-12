import { describe, expect, it } from "vitest";
import {
  deniedLocationMessage,
  getDeviceLocation,
  type GeolocationLike,
} from "../src/features/stops/geolocation";

function fakeGeolocation(
  outcome: { kind: "ok"; lat: number; lng: number } | { kind: "error"; code: number },
): GeolocationLike {
  return {
    getCurrentPosition(onSuccess, onError) {
      if (outcome.kind === "ok") {
        onSuccess({ coords: { latitude: outcome.lat, longitude: outcome.lng } });
      } else {
        onError?.({ code: outcome.code });
      }
    },
  };
}

describe("device location", () => {
  it("returns the position on success", async () => {
    const result = await getDeviceLocation(
      fakeGeolocation({ kind: "ok", lat: 49.286, lng: -123.112 }),
    );
    expect(result).toEqual({
      status: "ok",
      position: { lat: 49.286, lng: -123.112 },
    });
  });

  it("reports denied when the user refuses permission (code 1)", async () => {
    const result = await getDeviceLocation(fakeGeolocation({ kind: "error", code: 1 }));
    expect(result).toEqual({ status: "denied" });
  });

  it("reports unavailable for other failures (e.g. no fix, code 2)", async () => {
    const result = await getDeviceLocation(fakeGeolocation({ kind: "error", code: 2 }));
    expect(result).toEqual({ status: "unavailable" });
  });

  it("reports unavailable when the device has no geolocation at all", async () => {
    const result = await getDeviceLocation(null);
    expect(result).toEqual({ status: "unavailable" });
  });
});

describe("denied location message", () => {
  it("names the Mileage Tracker entry in the Home Screen app", () => {
    expect(deniedLocationMessage({ standalone: true })).toContain(
      "Location Services → Mileage Tracker → While Using the App",
    );
  });

  it("names the Chrome entry in Chrome on iOS", () => {
    expect(
      deniedLocationMessage({
        standalone: false,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.46 Mobile/15E148 Safari/604.1",
      }),
    ).toContain("Location Services → Chrome → While Using the App");
  });

  it("names the Safari Websites entry in Safari", () => {
    expect(
      deniedLocationMessage({
        standalone: false,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      }),
    ).toContain("Location Services → Safari Websites → While Using the App");
  });
});
