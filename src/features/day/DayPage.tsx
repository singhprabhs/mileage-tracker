import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db, type LegRecord } from "../../data";
import { formatParking } from "../../domain";
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  ErrorState,
  MapPinIcon,
  SectionHeader,
  SkeletonCard,
} from "../../components";
import { BackLink, DockBar } from "./chrome";
import { formatFullDateLabel, getDayState, loadDayContext, type DayState } from "./dayService";
import UndoSnackbar from "./UndoSnackbar";

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
 * Day review (UI Polish Phase 4): one day with its totals in a
 * summary card and its legs as the same timeline Today uses. Tapping
 * a leg opens its detail sheet — route, readings, addresses, parking —
 * with Edit and "Insert a missed stop" actions. A still-open day
 * keeps its Log Stop / Review and close actions in the dock. Loading
 * is a skeleton and a missing day is a plain-language error with
 * Retry, never a bare "Loading…" (audit F-03/F-16).
 */
export default function DayPage() {
  const { dayId } = useParams<{ dayId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<DayState | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sheetLeg, setSheetLeg] = useState<LegRecord | null>(null);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!dayId) return;
      try {
        const context = await loadDayContext(db);
        const loaded = await getDayState(db, context, dayId);
        if (!cancelled) {
          setState(loaded);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayId, reloadKey]);

  if (!dayId || failed) {
    return (
      <main className="app-shell">
        <BackLink />
        <h1 className="screen-title">Day review</h1>
        <ErrorState
          message="This day couldn't be loaded. Your logs are safe on this phone."
          onRetry={reload}
        />
      </main>
    );
  }

  if (!state) {
    return (
      <main className="app-shell">
        <BackLink />
        <h1 className="screen-title">Day review</h1>
        <SkeletonCard lines={4} />
      </main>
    );
  }

  const open = state.day.status === "open";

  return (
    <main className={`app-shell${open ? " app-shell--dock" : ""}`}>
      <BackLink />
      <h1 className="screen-title">{formatFullDateLabel(state.day.date)}</h1>
      <p className="screen-date">{open ? "This day is still open." : "This day is closed."}</p>

      <Card>
        <dl className="summary-figures">
          <SummaryFigure value={`${state.totals.totalDistance} km`} label="Distance" />
          <SummaryFigure value={`${state.totals.totalClaimable} km`} label="Claimable" />
          {state.totals.totalParkingCents > 0 ? (
            <SummaryFigure
              value={formatParking(state.totals.totalParkingCents)}
              label="Parking"
            />
          ) : null}
        </dl>
      </Card>

      <section aria-label="Legs">
        <SectionHeader>Stops</SectionHeader>
        {state.legs.length > 0 ? (
          <ol className="timeline">
            {state.legs.map((leg) => (
              <li key={leg.id} className="timeline-item">
                <span className="timeline-dot" aria-hidden="true" />
                <button
                  type="button"
                  className="timeline-row"
                  aria-label={`Stop details: ${leg.from_name} to ${leg.to_name}, ${leg.distance} km`}
                  onClick={() => setSheetLeg(leg)}
                >
                  <span className="timeline-main">
                    <span className="timeline-name">
                      {leg.from_name} → {leg.to_name}
                    </span>
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
          <p className="today-nostops">No stops logged on this day yet.</p>
        )}
      </section>

      {open ? (
        <DockBar>
          <div className="dock-stack">
            <Button onClick={() => navigate("/log-stop")}>
              <MapPinIcon width={20} height={20} />
              Log Stop
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate(`/day/${dayId}/summary`)}
            >
              Review and close
            </Button>
          </div>
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
            <p className="leg-sheet-address">
              From: {sheetLeg.from_address}
              <br />
              To: {sheetLeg.to_address}
            </p>
            {sheetLeg.parking_cents !== null && sheetLeg.parking_cents > 0 ? (
              <p>
                <Badge>
                  Parking {formatParking(sheetLeg.parking_cents)}
                  {sheetLeg.parking_note ? ` · ${sheetLeg.parking_note}` : ""}
                </Badge>
              </p>
            ) : null}
            <div className="leg-sheet-actions">
              <Button
                variant="secondary"
                onClick={() => navigate(`/day/${dayId}/legs/${sheetLeg.id}/edit`)}
              >
                Edit
              </Button>
              <Button
                variant="secondary"
                onClick={() => navigate(`/day/${dayId}/insert-after/${sheetLeg.id}`)}
              >
                Insert a missed stop
              </Button>
            </div>
          </div>
        ) : null}
      </BottomSheet>

      <UndoSnackbar onUndone={reload} aboveDock={open} />
    </main>
  );
}
