import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db } from "../../data";
import { formatParking } from "../../domain";
import { formatFullDateLabel, getDayState, loadDayContext, type DayState } from "./dayService";
import UndoSnackbar from "./UndoSnackbar";

/**
 * Day review: every leg of one day with its numbers, an Edit link per
 * leg, and an "insert a missed stop" entry point after each leg. This
 * is also where a still-open day can be continued or ended.
 */
export default function DayPage() {
  const { dayId } = useParams<{ dayId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<DayState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

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
  }, [dayId, reloadKey]);

  if (!state || !dayId) {
    return (
      <main className="app-shell">
        <p role="status">Loading…</p>
      </main>
    );
  }

  const open = state.day.status === "open";

  return (
    <main className="app-shell">
      <p>
        <Link to="/">← Today</Link>
      </p>
      <h1>
        {formatFullDateLabel(state.day.date)}
      </h1>
      <dl className="stats-grid">
        <div>
          <dt>Distance</dt>
          <dd className="stat-number">{state.totals.totalDistance} km</dd>
        </div>
        <div>
          <dt>Claimable</dt>
          <dd className="stat-number">{state.totals.totalClaimable} km</dd>
        </div>
        {state.totals.totalParkingCents > 0 ? (
          <div>
            <dt>Parking</dt>
            <dd className="stat-number">{formatParking(state.totals.totalParkingCents)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="field-hint">{open ? "This day is still open." : "This day is closed."}</p>

      <ol className="leg-list">
        {state.legs.map((leg) => (
          <li key={leg.id} className="leg-detail">
            <div className="leg-route">
              {leg.from_name} → {leg.to_name}
            </div>
            <div className="leg-meta">
              {leg.odo_start} → {leg.odo_end} · {leg.distance} km
              {leg.claimable !== null ? ` · ${leg.claimable} km claimable` : " · not claimable"}
              {leg.parking_cents !== null && leg.parking_cents > 0
                ? ` · P ${formatParking(leg.parking_cents)}`
                : ""}
            </div>
            <div className="leg-address">
              {leg.from_address} → {leg.to_address}
            </div>
            <div className="button-row">
              <button
                type="button"
                className="button"
                onClick={() => navigate(`/day/${dayId}/legs/${leg.id}/edit`)}
              >
                Edit
              </button>
              <button
                type="button"
                className="button"
                onClick={() => navigate(`/day/${dayId}/insert-after/${leg.id}`)}
              >
                Insert a missed stop after this leg
              </button>
            </div>
          </li>
        ))}
      </ol>

      {open ? (
        <div className="action-stack">
          <button
            type="button"
            className="button button-primary button-large"
            onClick={() => navigate("/log-stop")}
          >
            Log Stop
          </button>
          <button
            type="button"
            className="button"
            onClick={() => navigate(`/day/${dayId}/summary`)}
          >
            Review and close
          </button>
        </div>
      ) : null}

      <UndoSnackbar onUndone={reload} />
    </main>
  );
}
