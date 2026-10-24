import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/mileage-tracker/",
  plugins: [
    react(),
    VitePWA({
      // Prompt-style updates (UI Polish Phase 2): a waiting worker
      // raises an "update available" toast in the shell and only the
      // user's Refresh activates it — never an automatic reload.
      // Registration happens in code (src/ui/pwaRegister.ts via
      // virtual:pwa-register), so the plugin must not also inject
      // its own registration script.
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "Mileage Tracker",
        short_name: "Mileage",
        description: "Log a day of driving and export a mileage claim.",
        display: "standalone",
        start_url: ".",
        scope: ".",
        // The design-token background (light scheme — the manifest
        // has no dark variant), so the Android splash matches the app.
        theme_color: "#f6f7f9",
        background_color: "#f6f7f9",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
