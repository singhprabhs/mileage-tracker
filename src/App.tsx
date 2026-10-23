import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { startSyncEngine } from "./data";
import AuthProvider from "./features/auth/AuthProvider";
import { requestPersistentStorage } from "./features/day/installState";
import SignInPage from "./features/auth/SignInPage";
import DayPage from "./features/day/DayPage";
import DaySummaryPage from "./features/day/DaySummaryPage";
import EditLegPage from "./features/day/EditLegPage";
import InsertStopPage from "./features/day/InsertStopPage";
import LogStopPage from "./features/day/LogStopPage";
import StartDayPage from "./features/day/StartDayPage";
import TodayPage from "./features/day/TodayPage";
import HistoryPage from "./features/history/HistoryPage";
import SettingsPage from "./features/settings/SettingsPage";

export default function App() {
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
        <Route path="/start" element={<StartDayPage />} />
        <Route path="/log-stop" element={<LogStopPage />} />
        <Route path="/end-day" element={<LogStopPage endDayMode />} />
        <Route path="/day/:dayId" element={<DayPage />} />
        <Route path="/day/:dayId/summary" element={<DaySummaryPage />} />
        <Route path="/day/:dayId/legs/:legId/edit" element={<EditLegPage />} />
        <Route path="/day/:dayId/insert-after/:legId" element={<InsertStopPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/signin" element={<SignInPage />} />
      </Routes>
    </AuthProvider>
  );
}
