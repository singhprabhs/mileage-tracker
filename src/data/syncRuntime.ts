import { useEffect, useSyncExternalStore } from "react";
import { getCurrentSession, subscribeToAuthChanges } from "../features/auth/authService";
import { db } from "./db";
import { subscribeOutboxChanges } from "./outbox";
import { createSupabaseRemote } from "./supabaseRemote";
import { supabase } from "./supabaseClient";
import { SyncEngine, type SyncStatus } from "./sync";

/**
 * App-wide sync wiring. The engine itself (sync.ts) is framework-free and
 * fully testable; this module builds the one real instance from the
 * Supabase client, starts its triggers, and offers React a status hook.
 *
 * Triggers (per the brief): on app open, on network return ('online'
 * event), on any queued local change (debounced), on sign-in, and every
 * 60 seconds while the app is open. The engine collapses concurrent runs.
 */

let engine: SyncEngine | null = null;

/** The app's sync engine. With no Supabase configured it runs remote-less. */
export function getSyncEngine(): SyncEngine {
  engine ??= new SyncEngine({
    database: db,
    remote: supabase ? createSupabaseRemote(supabase) : null,
    getUserId: async () => {
      if (!supabase) return null;
      const session = await getCurrentSession(supabase);
      return session?.user.id ?? null;
    },
    isOnline: () => navigator.onLine,
  });
  return engine;
}

/**
 * Start the sync triggers. Call once when the app mounts; returns a stop
 * function that removes the listeners and the timer.
 */
export function startSyncEngine(): () => void {
  const instance = getSyncEngine();
  void instance.runSync();

  const onOnline = () => {
    void instance.runSync();
  };
  const onOffline = () => {
    void instance.refreshStatus();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  const timer = window.setInterval(() => {
    void instance.runSync();
  }, 60_000);

  // A freshly queued local change should reach the server promptly, not
  // only on the next 60-second tick: debounce a run after each enqueue.
  let debounce: number | undefined;
  const unsubscribeOutbox = subscribeOutboxChanges(() => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      void instance.runSync();
    }, 750);
  });

  const unsubscribeAuth = supabase
    ? subscribeToAuthChanges(supabase, (session) => {
        if (session) void instance.runSync();
        else void instance.refreshStatus();
      })
    : () => undefined;

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.clearInterval(timer);
    window.clearTimeout(debounce);
    unsubscribeOutbox();
    unsubscribeAuth();
  };
}

/** Manual Retry from the UI: reset failure bookkeeping and sync now. */
export async function retrySync(): Promise<SyncStatus> {
  return getSyncEngine().retry();
}

/** React hook: subscribe a component to the live sync status. */
export function useSyncStatus(): SyncStatus {
  const instance = getSyncEngine();
  const status = useSyncExternalStore(
    (onStoreChange) => instance.subscribe(onStoreChange),
    () => instance.getStatus(),
  );
  useEffect(() => {
    void instance.refreshStatus();
  }, [instance]);
  return status;
}
