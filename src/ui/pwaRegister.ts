import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";
import { createPwaUpdateController, type PwaUpdateController } from "./pwaUpdate";

/**
 * Glue between the app and vite-plugin-pwa's registration module
 * (UI Polish Phase 2). Kept separate from pwaUpdate.ts so unit tests
 * can exercise the controller without the virtual module.
 *
 * initPwaUpdates() runs once from main.tsx before first render, so
 * the singleton exists before UpdateToast subscribes.
 */

let controller: PwaUpdateController | null = null;

export function initPwaUpdates(): PwaUpdateController {
  if (controller) return controller;
  controller = createPwaUpdateController(registerSW, {
    onRegisteredSW(_swScriptUrl, registration) {
      if (!registration) return;
      // An installed app can stay open for days: check for a new
      // version hourly. A found update only raises the Refresh
      // toast — it never reloads on its own.
      window.setInterval(() => {
        void registration.update();
      }, 60 * 60 * 1000);
    },
  });
  return controller;
}

function subscribe(onStoreChange: () => void): () => void {
  return controller ? controller.subscribe(onStoreChange) : () => undefined;
}

function getSnapshot(): boolean {
  return controller ? controller.getNeedRefresh() : false;
}

function getServerSnapshot(): boolean {
  return false;
}

/** True when a new version is waiting and the toast should show. */
export function usePwaUpdate(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Activate the waiting worker and reload (the toast's Refresh). */
export function applyPwaUpdate(): void {
  void controller?.applyUpdate();
}
