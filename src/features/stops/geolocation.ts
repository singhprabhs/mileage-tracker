/**
 * One-shot device location via the browser Geolocation API.
 *
 * The caller (Log Stop) uses it for the "Use my location" button: the
 * position re-ranks address search by proximity and is reverse-geocoded
 * so the user can see where they are right now. Nothing is stored —
 * the position lives in component state for the current stop only.
 *
 * The geolocation object is injectable so tests can drive the success
 * and denial paths without a browser.
 */

export interface DevicePosition {
  lat: number;
  lng: number;
}

export type DeviceLocationResult =
  { status: "ok"; position: DevicePosition } | { status: "denied" } | { status: "unavailable" };

export interface GeolocationLike {
  getCurrentPosition(
    onSuccess: (position: { coords: { latitude: number; longitude: number } }) => void,
    onError?: (error: { code: number }) => void,
    options?: { timeout?: number },
  ): void;
}

const POSITION_TIMEOUT_MS = 10000;

/** Geolocation error code 1 (PERMISSION_DENIED) per the W3C spec. */
const PERMISSION_DENIED_CODE = 1;

export async function getDeviceLocation(
  geolocation: GeolocationLike | null | undefined = globalThis.navigator?.geolocation ?? null,
  timeoutMs: number = POSITION_TIMEOUT_MS,
): Promise<DeviceLocationResult> {
  if (!geolocation) return { status: "unavailable" };
  return new Promise<DeviceLocationResult>((resolve) => {
    let settled = false;
    const done = (result: DeviceLocationResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      geolocation.getCurrentPosition(
        (position) => {
          done({
            status: "ok",
            position: { lat: position.coords.latitude, lng: position.coords.longitude },
          });
        },
        (error) => {
          done(
            error.code === PERMISSION_DENIED_CODE
              ? { status: "denied" }
              : { status: "unavailable" },
          );
        },
        { timeout: timeoutMs },
      );
    } catch {
      done({ status: "unavailable" });
    }
    // No extra backstop timer: the API's own timeout option fires the
    // error callback, and a dangling timer would stall the test runner.
  });
}
