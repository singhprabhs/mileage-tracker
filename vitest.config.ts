import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Unit tests must never see a developer's real .env values: blanking
    // the public keys here keeps the suite deterministic (the Supabase
    // client is exercised in its unconfigured state) on any machine.
    env: {
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
      VITE_GEOAPIFY_API_KEY: "",
    },
  },
});
