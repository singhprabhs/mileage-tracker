import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { db, type LegRecord } from "../../data";
import { formatParking } from "../../domain";
import {
  Badge,
  BottomSheet,
  Button,
  CalendarIcon,
  Card,
  CheckIcon,
  ChevronRightIcon,
  EmptyState,
  GaugeIcon,
  GearIcon,
  MapPinIcon,
  SectionHeader,
  SkeletonCard,
} from "../../components";
import { useAuth } from "../auth/authContext";
import { DockBar } from "./chrome";
import {
  deleteLeg,
  formatFullDateLabel,
  formatShortDateLabel,
  getClosedDayStateForDate,
  getDayState,
  getOpenDayState,
  loadDayContext,
  toLocalDateString,
  type DayState,
} from "./dayService";
import InstallCard from "./InstallCard";
import SyncPill, { SyncErrorBanner } from "./SyncPill";
import UndoSnackbar from "./UndoSnackbar";
import { storeUndoSnapshot } from "./undoStore";

/** One summary figure: large tabular value, small muted label beneath. */
function SummaryFigure({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="summary-figure">
      <dd className="summary-value ds-num">{value}</dd>
      <dt className="summary-label">{label}</dt>
    </div>
  );
}

/**
 * Today (UI Polish Phase 3): top bar with the short date, the sync
 * pill and a settings icon; a summary card with the day's three
 * figures; the legs as a timeline whose rows open a detail sheet
 * (Edit / Delete with Undo); and one docked primary action that
 * follows the day's state. Before a day starts, a friendly empty
 * state names the last day instead of a bare notice.
 */
export default function TodayPage() {
  const { session, configured } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<DayState | null>(null);
  const [lastDay, setLastDay] = useState<{ date: string; totalDistance: number } | null>(
    null,
  );
  const [noProfile, setNoProfile] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sheetLeg, setSheetLeg] = useState<LegRecord | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
        if (!shown) {
          const closed = await db.days
            .where("user_id")
            .equals(context.userId)
            .filter((row) => row.status === "closed" && !row.deleted_at)
            .sortBy("date");
          const last = closed[closed.length - 1];
          if (last) {
            const lastState = await getDayState(db, context, last.id);
            if (!cancelled && lastState) {
              setLastDay({ date: last.date, totalDistance: lastState.totals.totalDistance });
            }
          }
        }
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

  const dayOpen = state !== null && state.day.status === "open";
  const arrivedHome =
    state !== null && state.currentDestination.type === "home" && state.legs.length > 0;
  const shownDate = state ? state.day.date : today;

  async function handleDeleteLeg() {
    if (!state || !sheetLeg) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const context = await loadDayContext(db);
      const result = await deleteLeg(db, context, state.day.id, sheetLeg.id);
      const token = storeUndoSnapshot(result.previousSnapshot);
      const name = sheetLeg.to_name;
      setSheetLeg(null);
      navigate("/", {
        replace: true,
        state: { undoToken: token, undoMessage: `Stop at ${name} deleted.` },
      });
      reload();
    } catch {
      setDeleteError("That stop couldn't be deleted. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className={`app-shell${loaded && state?.day.status !== "closed" ? " app-shell--dock" : ""}`}>
      <h1 className="sr-only">Mileage Tracker</h1>
      <header className="today-topbar">
        <p className="today-topbar-date">{formatShortDateLabel(shownDate)}</p>
        <div className="today-topbar-actions">
          <SyncPill />
          <Link className="today-settings" to="/settings" aria-label="Settings">
            <GearIcon width={24} height={24} />
          </Link>
        </div>
      </header>

      <SyncErrorBanner />

      <InstallCard />

      {state && state.day.date !== today && dayOpen ? (
        <p className="today-still-open">
          This day is still open from {formatFullDateLabel(state.day.date)}.
        </p>
      ) : null}

      {!loaded ? (
        <SkeletonCard lines={3} />
      ) : state ? (
        <>
          {state.day.status === "closed" ? (
            <Card className="today-complete">
              <span className="today-complete-icon">
                <CheckIcon width={22} height={22} />
              </span>
              <div>
                <p className="today-complete-title">Day complete</p>
                <p className="today-complete-text">
                  {state.totals.totalDistance} km · {state.totals.totalClaimable} km
                  claimable
                  {state.totals.totalParkingCents > 0
                    ? ` · ${formatParking(state.totals.totalParkingCents)} parking`
                    : ""}
                </p>
              </div>
            </Card>
          ) : (
            <Card>
              <dl className="summary-figures">
                <SummaryFigure value={`${state.totals.totalDistance} km`} label="Distance" />
                <SummaryFigure
                  value={`${state.totals.totalClaimable} km`}
                  label="Claimable"
                />
                {state.totals.totalParkingCents > 0 ? (
                  <SummaryFigure
                    value={formatParking(state.totals.totalParkingCents)}
                    label="Parking"
                  />
                ) : null}
              </dl>
            </Card>
          )}

          <section aria-label="Legs">
            <SectionHeader>
              {state.day.date === today ? "Today's stops" : "Stops"}
            </SectionHeader>
            {deleteError ? (
              <p className="today-delete-error" role="alert">
                {deleteError}
              </p>
            ) : null}
            {state.legs.length > 0 ? (
              <ol className="timeline">
                {state.legs.map((leg) => (
                  <li key={leg.id} className="timeline-item">
                    <span className="timeline-dot" aria-hidden="true" />
                    <button
                      type="button"
                      className="timeline-row"
                      aria-label={`Stop details: ${leg.to_name}, ${leg.distance} km`}
                      onClick={() => {
                        setDeleteError(null);
                        setSheetLeg(leg);
                      }}
                    >
                      <span className="timeline-main">
                        <span className="timeline-name">{leg.to_name}</span>
                        <span className="timeline-address">{leg.to_address}</span>
                      </span>
                      <span className="timeline-side">
                        <span className="timeline-distance ds-num">{leg.distance} km</span>
                        {leg.parking_cents !== null && leg.parking_cents > 0 ? (
                          <Badge>Parking {formatParking(leg.parking_cents)}</Badge>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="today-nostops">
                No stops yet. Tap Log Stop when you reach your first stop.
              </p>
            )}
            {state.legs.length > 0 ? (
              <Link className="today-navlink" to={`/day/${state.day.id}`}>
                Review or edit this day
                <ChevronRightIcon width={18} height={18} />
              </Link>
            ) : null}
          </section>
        </>
      ) : (
        <EmptyState
          icon={<GaugeIcon />}
          message={
            lastDay
              ? `No day started yet. Your last day was ${formatShortDateLabel(lastDay.date)} — ${lastDay.totalDistance} km.`
              : "No day started yet. Start the day when you leave Home."
          }
        />
      )}

      <footer className="today-footer">
        <Link className="today-navlink" to="/history">
          <CalendarIcon width={20} height={20} />
          History and reports
          <ChevronRightIcon width={18} height={18} />
        </Link>
        {session ? (
          <p className="today-account">
            Signed in as <strong>{session.user.email ?? "your account"}</strong>.
          </p>
        ) : configured ? (
          <p className="today-account">
            <Link to="/signin">Sign in</Link> to back up your profile and logs.
          </p>
        ) : (
          <p className="today-account">
            Cloud sign-in is not set up on this device yet; your data is stored locally.
          </p>
        )}
      </footer>

      {loaded && (!state || dayOpen) ? (
        <DockBar>
          {!state ? (
            <Button onClick={() => navigate("/start")}>Start Day</Button>
          ) : arrivedHome ? (
            <Button onClick={() => navigate(`/day/${state.day.id}/summary`)}>End Day</Button>
          ) : (
            <Button onClick={() => navigate("/log-stop")}>
              <MapPinIcon width={20} height={20} />
              Log Stop
            </Button>
          )}
        </DockBar>
      ) : null}

      <BottomSheet
        open={sheetLeg !== null}
        onClose={() => setSheetLeg(null)}
        title={sheetLeg?.to_name}
      >
        {sheetLeg ? (
          <div className="leg-sheet">
            <p className="leg-sheet-route">
              {sheetLeg.from_name} → {sheetLeg.to_name}
            </p>
            <p className="leg-sheet-meta ds-num">
              Odometer {sheetLeg.odo_start} → {sheetLeg.odo_end} · {sheetLeg.distance} km
              {sheetLeg.claimable !== null
                ? ` · ${sheetLeg.claimable} km claimable`
                : " · not claimable"}
            </p>
            <p className="leg-sheet-address">{sheetLeg.to_address}</p>
            {sheetLeg.parking_cents !== null && sheetLeg.parking_cents > 0 ? (
              <p>
                <Badge>Parking {formatParking(sheetLeg.parking_cents)}</Badge>
              </p>
            ) : null}
            <div className="leg-sheet-actions">
              <Button
                variant="secondary"
                onClick={() => navigate(`/day/${state?.day.id}/legs/${sheetLeg.id}/edit`)}
              >
                Edit
              </Button>
              <Button variant="destructive" loading={deleting} onClick={() => void handleDeleteLeg()}>
                Delete
              </Button>
            </div>
          </div>
        ) : null}
      </BottomSheet>

      <UndoSnackbar onUndone={reload} aboveDock />
    </main>
  );
}
