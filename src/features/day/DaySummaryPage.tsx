import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db } from "../../data";
import { formatParking } from "../../domain";
import {
  closeDayAfterSummary,
  formatDateLabel,
  getDayState,
  loadDayContext,
  type DayState,
} from "./dayService";
import LegList from "./LegList";

/**
 * The day summary shown when the last leg ends at Home: legs, total
 * distance, total claimable (and parking when any). Edit reviews the
 * legs first; Done closes the day.
 */
export default function DaySummaryPage() {
  const { dayId } = useParams<{ dayId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<DayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!dayId) return;
      const context = await loadDayContext(db);
      const loaded = await getDayState(db, context, dayId);
      if (!cancelled) setState(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [dayId]);

  if (!state || !dayId) {
    return (
      <main className="app-shell">
        <p role="status">Loading…</p>
      </main>
    );
  }

  async function handleDone() {
    setClosing(true);
    try {
      const context = await loadDayContext(db);
      await closeDayAfterSummary(db, context, dayId as string);
      navigate("/", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not close the day.");
      setClosing(false);
    }
  }

  const alreadyClosed = state.day.status === "closed";

  return (
    <main className="app-shell">
      <h1>Day summary</h1>
      <p className="today-date">
        {formatDateLabel(state.day.date)} · {state.day.date}
      </p>
      <dl className="stats-grid">
        <div>
          <dt>Total distance</dt>
          <dd className="stat-number">{state.totals.totalDistance} km</dd>
        </div>
        <div>
          <dt>Total claimable</dt>
          <dd className="stat-number">{state.totals.totalClaimable} km</dd>
        </div>
        {state.totals.totalParkingCents > 0 ? (
          <div>
            <dt>Total parking</dt>
            <dd className="stat-number">{formatParking(state.totals.totalParkingCents)}</dd>
          </div>
        ) : null}
      </dl>

      <section aria-label="Legs">
        <h2>Legs</h2>
        <LegList legs={state.legs} dayId={state.day.id} />
      </section>

      {error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="action-stack">
        <button type="button" className="button" onClick={() => navigate(`/day/${state.day.id}`)}>
          Edit
        </button>
        {alreadyClosed ? (
          <button
            type="button"
            className="button button-primary button-large"
            onClick={() => navigate("/")}
          >
            Back to Today
          </button>
        ) : (
          <button
            type="button"
            className="button button-primary button-large"
            disabled={closing}
            onClick={() => void handleDone()}
          >
            {closing ? "Closing…" : "Done — close the day"}
          </button>
        )}
      </div>
      <p>
        <Link to="/">← Today</Link>
      </p>
    </main>
  );
}
