import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../../data";
import {
  formatDateLabel,
  formatFullDateLabel,
  getLastClosedDayFinalOdometer,
  getOpenDayState,
  loadDayContext,
  startDay,
  toLocalDateString,
  type DayState,
} from "./dayService";

/**
 * Start Day: today's date and one numeric odometer field, prefilled
 * with the last closed day's final reading. Blocked while an earlier
 * day is still open — the user is offered that day's End Day instead.
 */
export default function StartDayPage() {
  const navigate = useNavigate();
  const today = toLocalDateString(new Date());
  const [odometer, setOdometer] = useState("");
  const [openDay, setOpenDay] = useState<DayState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const context = await loadDayContext(db);
      const [lastFinal, open] = await Promise.all([
        getLastClosedDayFinalOdometer(db, context.userId),
        getOpenDayState(db, context),
      ]);
      if (cancelled) return;
      if (lastFinal !== null) setOdometer(String(lastFinal));
      setOpenDay(open);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConfirm() {
    setError(null);
    const value = Number(odometer);
    if (!/^\d+$/.test(odometer.trim()) || !Number.isInteger(value) || value < 0) {
      setError("Enter the full odometer reading as a whole number.");
      return;
    }
    setSaving(true);
    try {
      const context = await loadDayContext(db);
      const result = await startDay(db, context, { date: today, startOdometer: value });
      if (result.status === "blocked") {
        setError(
          `The day from ${formatDateLabel(result.openDay.date)} (${result.openDay.date}) is still open. Close it first, then start today's day.`,
        );
        const open = await getOpenDayState(db, context);
        setOpenDay(open);
        return;
      }
      navigate("/", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start the day.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <main className="app-shell">
        <p role="status">Loading…</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <p>
        <Link to="/">← Today</Link>
      </p>
      <h1>Start Day</h1>
      <p className="today-date">
        {formatFullDateLabel(today)}
      </p>

      {openDay ? (
        <div className="notice" role="alert">
          <p>
            The day from {formatDateLabel(openDay.day.date)} ({openDay.day.date}) is still open.
            Close it first — ending a day takes one stop at Home.
          </p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => navigate("/end-day")}
          >
            Close that day first
          </button>
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="start-odometer">Odometer at Home</label>
            <input
              id="start-odometer"
              className="big-number-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              autoFocus
              value={odometer}
              onChange={(event) => setOdometer(event.target.value.replace(/[^0-9]/g, ""))}
            />
            <p className="field-hint">
              Pre-filled with the last closed day's final reading — change it if the car moved
              since.
            </p>
          </div>
          {error ? (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="button button-primary button-large"
            disabled={saving}
            onClick={() => void handleConfirm()}
          >
            {saving ? "Starting…" : "Confirm — start at Home"}
          </button>
        </>
      )}
    </main>
  );
}
