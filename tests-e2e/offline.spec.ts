import { expect, test } from "@playwright/test";

/**
 * Brief, Phase 4 / test plan: "Install the PWA and open it in airplane
 * mode: the shell loads and past days are visible." This smoke test loads
 * the built app, seeds a profile straight into the app's IndexedDB (the
 * same store the app writes locally first), then reloads with the network
 * off and checks the shell renders from the device with the saved data.
 */

const PROFILE = {
  user_id: "e2e-user",
  name: "E2E Person",
  tech_id: "E2E-1",
  home_address: "1 Example Home Street, Vancouver, BC",
  home_place_id: null,
  home_lat: null,
  home_lng: null,
  office_location_id: null,
  home_office_km: 23,
  created_at: "2026-07-02T00:00:00.000Z",
  updated_at: "2026-07-02T00:00:00.000Z",
  deleted_at: null,
};

test("app shell loads offline and keeps locally saved data", async ({ page, context }) => {
  await page.goto("/mileage-tracker/");
  await expect(page.locator(".app-shell")).toBeVisible();

  // Wait until the service worker is active, then seed the profile into
  // the app's own database and reload so Today picks it up.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.evaluate(async (profile) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("mileage-tracker");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("profiles", "readwrite");
      transaction.objectStore("profiles").put(profile);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, PROFILE);

  // The first visit redirected to Settings (no profile yet); go to Today
  // explicitly now that a profile exists on the device.
  await page.goto("/mileage-tracker/#/");
  await expect(page.getByRole("heading", { name: "Mileage Tracker" })).toBeVisible();
  await expect(page.getByText("No day started yet")).toBeVisible();

  // Airplane mode: the shell and the locally saved state must still load.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Mileage Tracker" })).toBeVisible();
  await expect(page.getByText("No day started yet")).toBeVisible();
  await context.setOffline(false);
});
