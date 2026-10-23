import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests (brief's test plan): a mobile viewport against the
 * production build, served by `vite preview`. Run with `npm run test:e2e`
 * (the script builds first). Kept out of the default Vitest run and out of
 * CI's unit-test job — browsers are a separate, heavier download.
 */
export default defineConfig({
  testDir: "./tests-e2e",
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  },
  webServer: {
    // --host pins IPv4 loopback: vite preview otherwise binds IPv6
    // localhost only on some machines and the readiness check times out.
    command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/mileage-tracker/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
