import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../data";
import { Banner, Button, NumericField, SkeletonCard } from "../../components";
import { BackLink, DockBar } from "./chrome";
import {
  formatFullDateLabel,
  getLastClosedDayFinalOdometer,
  getOpenDayState,
  loadDayContext,
  startDay,
  toLocalDateString,
  type DayState,
} from "./dayService";

/**
 * Start Day (UI Polish Phase 3): the shared core-flow form scaffold —
 * Back control, title, the date in words, one large odometer field
 * (the DS NumericField large variant fixes the audit's 16 px
 * big-number bug, F-02), prefilled with the last closed day's final
 * reading, and the primary action docked at the bottom. Blocked while
 * an earlier day is still open — that day's End Day is offered
 * instead, with its date in the one house format (audit F-26).
 */
export default function StartDayPage() {
  const navigate = useNavigate();
  const today = toLocalDateString(new Date());
  const [odometer, setOdometer] = useState("");
  const [prefilled, setPrefilled] = useState(false);
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
      if (lastFinal !== null) {
        setOdometer(String(lastFinal));
        setPrefilled(true);
      }
      setOpenDay(open);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
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
          `The day from ${formatFullDateLabel(result.openDay.date)} is still open. Close it first, then start today's day.`,
        );
        const open = await getOpenDayState(db, context);
        setOpenDay(open);
        return;
      }
      navigate("/", { replace: true });
    } catch {
      setError("Could not start the day. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <main className="app-shell">
        <BackLink />
        <h1 className="screen-title">Start Day</h1>
        <SkeletonCard lines={2} />
      </main>
    );
  }

  return (
    <main className="app-shell app-shell--dock">
      <BackLink />
      <h1 className="screen-title">Start Day</h1>
      <p className="screen-date">{formatFullDateLabel(today)}</p>

      {openDay ? (
        <Banner kind="warning">
          <span className="sync-error-text">
            The day from {formatFullDateLabel(openDay.day.date)} is still open. Close it
            first — ending a day takes one stop at Home.
          </span>
          <Button onClick={() => navigate("/end-day")}>Close that day first</Button>
        </Banner>
      ) : (
        <form id="start-day-form" onSubmit={(e) => void handleConfirm(e)}>
          <NumericField
            id="start-odometer"
            label="Odometer at Home"
            large
            autoFocus
            value={odometer}
            onChange={(event) => setOdometer(event.target.value.replace(/[^0-9]/g, ""))}
            hint={
              prefilled
                ? "Pre-filled with the last closed day's final reading — change it if the car moved since."
                : "Enter the full odometer reading."
            }
          />
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
      {!openDay ? (
        <DockBar>
          <Button type="submit" form="start-day-form" loading={saving}>
            Confirm — start at Home
          </Button>
        </DockBar>
      ) : null}
    </main>
  );
}
