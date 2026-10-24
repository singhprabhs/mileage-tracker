/**
 * "Update available" logic (UI Polish Phase 2). The service worker
 * used to update itself silently (registerType "autoUpdate"), which
 * meant a user could run a stale version for a whole session with no
 * signal (audit F-27) — and an auto-reload can yank the app away
 * mid-form. The registration is now prompt-style: when a new worker
 * is waiting, this controller flips `needRefresh` and the shell shows
 * a toast; only the user's Refresh tap activates the waiting worker
 * and reloads.
 *
 * The controller is deliberately framework- and registration-free: the
 * register function is injected (src/ui/pwaRegister.ts passes the
 * virtual:pwa-register one), so the state machine is unit-testable.
 */

export interface PwaRegisterOptions {
  onNeedRefresh?: () => void;
  onRegisteredSW?: (
    swScriptUrl: string,
    registration: ServiceWorkerRegistration | undefined,
  ) => void;
  onRegisterError?: (error: unknown) => void;
}

export type UpdateSWFn = (reloadPage?: boolean) => Promise<void>;
export type RegisterSWFn = (options?: PwaRegisterOptions) => UpdateSWFn;

export interface PwaUpdateController {
  /** True once a new service worker is waiting to activate. */
  getNeedRefresh(): boolean;
  subscribe(listener: () => void): () => void;
  /** Activate the waiting worker and reload (user's Refresh tap). */
  applyUpdate(): Promise<void>;
}

export function createPwaUpdateController(
  registerSW: RegisterSWFn,
  hooks?: Pick<PwaRegisterOptions, "onRegisteredSW" | "onRegisterError">,
): PwaUpdateController {
  let needRefresh = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  const updateSW = registerSW({
    onNeedRefresh() {
      if (!needRefresh) {
        needRefresh = true;
        emit();
      }
    },
    onRegisteredSW: hooks?.onRegisteredSW,
    onRegisterError: hooks?.onRegisterError,
  });

  return {
    getNeedRefresh: () => needRefresh,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async applyUpdate() {
      // reloadPage: true — the new worker takes control and the page
      // reloads onto the fresh build. Local data is in IndexedDB, so
      // nothing the user saved can be lost by the reload.
      await updateSW(true);
    },
  };
}
