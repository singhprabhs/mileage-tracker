import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { startSyncEngine } from "./data";
import { SkeletonCard } from "./components";
import UpdateToast from "./ui/UpdateToast";
import { useVisualViewportInset } from "./ui/useVisualViewportInset";
import AuthProvider from "./features/auth/AuthProvider";
import { requestPersistentStorage } from "./features/day/installState";
import TodayPage from "./features/day/TodayPage";

// Route-level code splitting (UI Polish Phase 5): the first load only
// needs Today itself. Every other route loads on demand — Start Day /
// Log Stop included: their chunks are small and precached by the
// service worker, so after the first visit opening them is a cache
// read, and the Log Stop open time was re-measured against the
// brief's 200 ms target after the split. The report writers split
// further inside HistoryPage.
const SignInPage = lazy(() => import("./features/auth/SignInPage"));
const StartDayPage = lazy(() => import("./features/day/StartDayPage"));
const LogStopPage = lazy(() => import("./features/day/LogStopPage"));
const DayPage = lazy(() => import("./features/day/DayPage"));
const DaySummaryPage = lazy(() => import("./features/day/DaySummaryPage"));
const EditLegPage = lazy(() => import("./features/day/EditLegPage"));
const InsertStopPage = lazy(() => import("./features/day/InsertStopPage"));
const HistoryPage = lazy(() => import("./features/history/HistoryPage"));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage"));

// The hidden styleguide is review tooling, not app flow: load it
// lazily so its code stays out of the entry chunk too.
const StyleguidePage = lazy(() => import("./features/styleguide/StyleguidePage"));

/** Placeholder while a route chunk loads (a beat, from cache). */
function RouteFallback() {
  return (
    <main className="app-shell" role="status" aria-label="Loading">
      <SkeletonCard lines={4} />
    </main>
  );
}

function lazyRoute(page: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{page}</Suspense>;
}

export default function App() {
  // Publishes --keyboard-inset for docked bars (Phase 2 groundwork).
  useVisualViewportInset();

  useEffect(() => {
    // Sync triggers (app open, network return, every 60 s) and a request
    // for persistent storage, so the browser keeps the local logs around.
    const stopSync = startSyncEngine();
    requestPersistentStorage();
    return stopSync;
  }, []);

  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/start" element={lazyRoute(<StartDayPage />)} />
        <Route path="/log-stop" element={lazyRoute(<LogStopPage />)} />
        <Route path="/end-day" element={lazyRoute(<LogStopPage endDayMode />)} />
        <Route path="/day/:dayId" element={lazyRoute(<DayPage />)} />
        <Route path="/day/:dayId/summary" element={lazyRoute(<DaySummaryPage />)} />
        <Route path="/day/:dayId/legs/:legId/edit" element={lazyRoute(<EditLegPage />)} />
        <Route path="/day/:dayId/insert-after/:legId" element={lazyRoute(<InsertStopPage />)} />
        <Route path="/history" element={lazyRoute(<HistoryPage />)} />
        <Route path="/settings" element={lazyRoute(<SettingsPage />)} />
        <Route path="/signin" element={lazyRoute(<SignInPage />)} />
        {/* Hidden design-system review page (UI Polish Phase 1).
            Not linked from any navigation. */}
        <Route path="/styleguide" element={lazyRoute(<StyleguidePage />)} />
      </Routes>
      {/* Shell-level "update available" toast (UI Polish Phase 2). */}
      <UpdateToast />
    </AuthProvider>
  );
}
