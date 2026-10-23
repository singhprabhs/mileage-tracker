import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { db } from "../../data";
import { formatParking } from "../../domain";
import { useAuth } from "../auth/authContext";
import {
  formatDateLabel,
  getClosedDayStateForDate,
  getOpenDayState,
  loadDayContext,
  toLocalDateString,
  type DayState,
} from "./dayService";
import InstallHint from "./InstallHint";
import LegList from "./LegList";
import SyncStatusBar from "./SyncStatusBar";
import UndoSnackbar from "./UndoSnackbar";

/**
 * Today: the home screen. Shows the open day (or a finished one for
 * today) with its stats, one large primary button whose label follows
 * the day's state, and today's legs as a compact tappable list.
 */
export default function TodayPage() {
  const { session, configured } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<DayState | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const today = toLocalDateString(new Date());

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const context = await loadDayContext(db);
        if (cancelled) return;
        const open = await getOpenDayState(db, context);
        const shown = open ?? (await getClosedDayStateForDate(db, context, today));
        if (!cancelled) {
          setState(shown);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setNoProfile(true);
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [today, reloadKey]);

  if (noProfile) return <Navigate to="/settings" replace />;
  if (!loaded) {
    return (
      <main className="app-shell">
        <p role="status">Loading…</p>
      </main>
    );
  }

  const dayOpen = state !== null && state.day.status === "open";
  const arrivedHome =
    state !== null && state.currentDestination.type === "home" && state.legs.length > 0;

  return (
    <main className="app-shell">
      <header className="home-header">
        <h1>Mileage Tracker</h1>
        <Link className="icon-link" to="/settings" aria-label="Settings">
          ⚙
        </Link>
      </header>

      <SyncStatusBar />

      <InstallHint />

      <p className="today-date">
        {state ? (
          <>
            {formatDateLabel(state.day.date)} · {state.day.date}
            {state.day.date !== today ? " — this day is still open" : ""}
          </>
        ) : (
          <>
            {formatDateLabel(today)} · {today}
          </>
        )}
      </p>

      {state ? (
        <dl className="stats-grid">
          <div>
            <dt>Odometer</dt>
            <dd className="stat-number">{state.currentOdometer}</dd>
          </div>
          <div>
            <dt>Distance so far</dt>
            <dd className="stat-number">{state.totals.totalDistance} km</dd>
          </div>
          <div>
            <dt>Claimable so far</dt>
            <dd className="stat-number">{state.totals.totalClaimable} km</dd>
          </div>
          {state.totals.totalParkingCents > 0 ? (
            <div>
              <dt>Parking so far</dt>
              <dd className="stat-number">{formatParking(state.totals.totalParkingCents)}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="notice">No day started yet. Start the day when you leave Home.</p>
      )}

      <div className="action-stack">
        {!state ? (
          <button
            type="button"
            className="button button-primary button-large"
            onClick={() => navigate("/start")}
          >
            Start Day
          </button>
        ) : dayOpen && !arrivedHome ? (
          <>
            <button
              type="button"
              className="button button-primary button-large"
              onClick={() => navigate("/log-stop")}
            >
              Log Stop
            </button>
            <button type="button" className="button" onClick={() => navigate("/end-day")}>
              End Day
            </button>
          </>
        ) : dayOpen && arrivedHome ? (
          <button
            type="button"
            className="button button-primary button-large"
            onClick={() => navigate(`/day/${state.day.id}/summary`)}
          >
            End Day
          </button>
        ) : (
          <p className="notice" role="status">
            Day complete: {state.totals.totalDistance} km, {state.totals.totalClaimable} km
            claimable.
          </p>
        )}
      </div>

      {state ? (
        <section aria-label="Legs">
          <h2>{state.day.date === today ? "Today's legs" : "Legs"}</h2>
          <LegList legs={state.legs} dayId={state.day.id} />
          {state.legs.length > 0 ? (
            <p>
              <Link to={`/day/${state.day.id}`}>Review or edit this day</Link>
            </p>
          ) : null}
        </section>
      ) : null}

      <footer className="today-footer">
        {session ? (
          <p>
            Signed in as <strong>{session.user.email ?? "your account"}</strong>.
          </p>
        ) : configured ? (
          <p>
            <Link to="/signin">Sign in</Link> to back up your profile and logs.
          </p>
        ) : (
          <p>Cloud sign-in is not set up on this device yet; your data is stored locally.</p>
        )}
      </footer>

      <UndoSnackbar onUndone={reload} />
    </main>
  );
}
