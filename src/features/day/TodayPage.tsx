import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { db, type LegRecord } from "../../data";
import { formatParking } from "../../domain";
import {
  AlertTriangleIcon,
  Badge,
  BottomSheet,
  Button,
  CalendarIcon,
  Card,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  EmptyState,
  GaugeIcon,
  GearIcon,
  MapPinIcon,
  SectionHeader,
  SkeletonCard,
} from "../../components";
import { useAuth } from "../auth/authContext";
import Tour from "../tour/Tour";
import { markTourSeen, readTourSeen } from "../tour/tourState";
import {
  currentMonthRange,
  lastMonthRange,
  loadHistory,
  weekRange,
  type HistoryResult,
} from "../history/historyService";
import {
  MONTH_END_DISMISSED_KEY,
  monthEndCard,
  type MonthAggregate,
  type MonthEndCardModel,
} from "./monthEnd";
import { DockBar } from "./chrome";
import {
  deleteLeg,
  formatShortDateLabel,
  getClosedDayStateForDate,
  getDayState,
  getOpenDayState,
  loadDayContext,
  staleOpenDayCount,
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
 * The month-end card's figures: closed days only (a day still open
 * is not yet part of a report), summed from the per-day totals the
 * History aggregation already computed — no new arithmetic.
 */
function closedAggregate(result: HistoryResult): MonthAggregate {
  const closed = result.days.filter((entry) => entry.day.status === "closed");
  return {
    closedDays: closed.length,
    claimableKm: closed.reduce((sum, entry) => sum + entry.totals.totalClaimable, 0),
  };
}

/**
 * One row of the week / month totals card (UI Polish Phase 6): the
 * period label over its running figures. The figures come from
 * loadHistory — the History screen's own aggregation — so the card
 * can never disagree with History for the same period.
 */
function PeriodTotalsRow({ label, result }: { label: string; result: HistoryResult }) {
  const { totals } = result;
  return (
    <div className="period-totals-row">
      <span className="period-totals-label">{label}</span>
      <span className="period-totals-values ds-num">
        {totals.totalDistance} km · {totals.totalClaimable} km claimable
        {totals.totalParkingCents > 0
          ? ` · ${formatParking(totals.totalParkingCents)} parking`
          : ""}
      </span>
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
  const location = useLocation();
  // First-run tour (Phase 6): offered only on the hand-off from
  // first-launch setup, and only until it has been seen once.
  const tourRequested =
    (location.state as { showTour?: boolean } | null)?.showTour === true;
  const [tourOpen, setTourOpen] = useState(false);
  const [state, setState] = useState<DayState | null>(null);
  const [periods, setPeriods] = useState<{ week: HistoryResult; month: HistoryResult } | null>(
    null,
  );
  const [monthEnd, setMonthEnd] = useState<MonthEndCardModel | null>(null);
  const [staleCount, setStaleCount] = useState(0);
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
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
    if (tourRequested && !readTourSeen()) setTourOpen(true);
  }, [tourRequested]);

  function closeTour() {
    markTourSeen();
    setTourOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const context = await loadDayContext(db);
        if (cancelled) return;
        // Running week / month totals for the card under the day
        // summary (Phase 6) — the History aggregation itself, over
        // this Monday–Sunday week and this calendar month.
        const weekR = weekRange();
        const monthR = currentMonthRange();
        const [week, month] = await Promise.all([
          loadHistory(db, weekR.start, weekR.end),
          loadHistory(db, monthR.start, monthR.end),
        ]);
        if (cancelled) return;
        setPeriods({ week, month });
        // Month-end card (Phase 6): this month's closed-day figures,
        // plus last month's while the "month just ended" window
        // (the 1st–3rd) is open. The decision itself is the pure
        // monthEndCard helper; dismissal is stored per month.
        let previous: MonthAggregate = { closedDays: 0, claimableKm: 0 };
        if (Number(today.slice(8, 10)) <= 3) {
          const prevRange = lastMonthRange();
          previous = closedAggregate(await loadHistory(db, prevRange.start, prevRange.end));
        }
        if (cancelled) return;
        let dismissed: string | null = null;
        try {
          dismissed = window.localStorage.getItem(MONTH_END_DISMISSED_KEY);
        } catch {
          dismissed = null;
        }
        setMonthEnd(monthEndCard(today, closedAggregate(month), previous, dismissed));
        // Forgotten open days (Phase 6 recovery card): count the
        // open days dated before today — the shown state below is
        // the oldest of them.
        const openRows = await db.days
          .where("user_id")
          .equals(context.userId)
          .filter((row) => row.status === "open" && !row.deleted_at)
          .toArray();
        if (!cancelled) setStaleCount(staleOpenDayCount(openRows, today));
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

  // The totals card renders only once something exists to total —
  // a brand-new user with no days sees just the empty state.
  const totalsSection =
    periods && (periods.week.days.length > 0 || periods.month.days.length > 0) ? (
      <section aria-label="Week and month totals">
        <SectionHeader>Your totals</SectionHeader>
        <Card>
          <PeriodTotalsRow label="This week" result={periods.week} />
          <PeriodTotalsRow label="This month" result={periods.month} />
        </Card>
      </section>
    ) : null;

  function dismissMonthEnd() {
    if (!monthEnd) return;
    try {
      window.localStorage.setItem(MONTH_END_DISMISSED_KEY, monthEnd.monthKey);
    } catch {
      // Storage unavailable: the card simply returns next launch.
    }
    setMonthEnd(null);
  }

  const monthEndCardEl = monthEnd ? (
    <Card className="month-end-card">
      <div className="month-end-main">
        <span className="month-end-icon">
          <CalendarIcon width={22} height={22} />
        </span>
        <div className="month-end-text">
          <p className="month-end-headline">{monthEnd.headline}</p>
          <p className="month-end-detail ds-num">{monthEnd.detail}</p>
        </div>
        <button
          type="button"
          className="month-end-dismiss"
          aria-label="Dismiss"
          onClick={dismissMonthEnd}
        >
          <CloseIcon width={20} height={20} />
        </button>
      </div>
      <Button
        variant="secondary"
        onClick={() => navigate("/history", { state: { historyRange: monthEnd.range } })}
      >
        {monthEnd.actionLabel}
      </Button>
    </Card>
  ) : null;

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

      {state && dayOpen && state.day.date < today && !recoveryDismissed ? (
        <Card className="recovery-card">
          <div className="recovery-main">
            <span className="recovery-icon">
              <AlertTriangleIcon width={22} height={22} />
            </span>
            <div className="recovery-text">
              <p className="recovery-title">
                You started a day on {formatShortDateLabel(state.day.date)} that isn&rsquo;t
                closed.
              </p>
              <p className="recovery-detail ds-num">
                Last reading: {state.currentOdometer}
                {staleCount > 1
                  ? ` · ${staleCount - 1} more ${staleCount - 1 === 1 ? "day" : "days"} still open`
                  : ""}
              </p>
            </div>
          </div>
          <div className="recovery-actions">
            <Button onClick={() => navigate(`/day/${state.day.id}`)}>Close that day</Button>
            <Button variant="text" onClick={() => setRecoveryDismissed(true)}>
              Not now
            </Button>
          </div>
        </Card>
      ) : null}

      {!loaded ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </>
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

          {totalsSection}

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

          {monthEndCardEl}
        </>
      ) : (
        <>
          <EmptyState
            icon={<GaugeIcon />}
            message={
              lastDay
                ? `No day started yet. Your last day was ${formatShortDateLabel(lastDay.date)} — ${lastDay.totalDistance} km.`
                : "No day started yet. Start the day when you leave Home."
            }
          />
          {totalsSection}
          {monthEndCardEl}
        </>
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

      {tourOpen ? <Tour onClose={closeTour} /> : null}
    </main>
  );
}
