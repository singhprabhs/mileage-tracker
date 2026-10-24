import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../../data";
import { formatParking } from "../../domain";
import { Badge, Button, Card, CheckIcon, SectionHeader, SkeletonCard } from "../../components";
import { BackLink, DockBar } from "./chrome";
import {
  closeDayAfterSummary,
  formatFullDateLabel,
  getDayState,
  loadDayContext,
  type DayState,
} from "./dayService";

/** One row of the summary card: muted label left, value right. */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-row">
      <dt>{label}</dt>
      <dd className="ds-num">{value}</dd>
    </div>
  );
}

/**
 * End Day's finish (UI Polish Phase 3): the day's legs and totals as
 * one clean summary Card. Edit reviews the legs first; Done closes
 * the day. A day that is already closed — the state this screen lands
 * on after End Day — leads with the brief checkmark success state and
 * a Done button in the dock (the old bottom-of-page back link, audit
 * F-08, is gone; the Back control is at the top like everywhere).
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
        <BackLink />
        <h1 className="screen-title">Day summary</h1>
        <SkeletonCard lines={3} />
      </main>
    );
  }

  async function handleDone() {
    setClosing(true);
    try {
      const context = await loadDayContext(db);
      await closeDayAfterSummary(db, context, dayId as string);
      navigate("/", { replace: true });
    } catch {
      setError("Couldn't close the day. Please try again.");
      setClosing(false);
    }
  }

  const alreadyClosed = state.day.status === "closed";

  return (
    <main className="app-shell app-shell--dock">
      <BackLink />
      <h1 className="screen-title">Day summary</h1>
      <p className="screen-date">{formatFullDateLabel(state.day.date)}</p>

      {alreadyClosed ? (
        <div className="success-head">
          <span className="success-check">
            <CheckIcon width={26} height={26} />
          </span>
          <p className="success-title">Day complete</p>
        </div>
      ) : null}

      <Card>
        <dl className="summary-rows">
          <SummaryRow label="Stops" value={String(state.legs.length)} />
          <SummaryRow label="Distance" value={`${state.totals.totalDistance} km`} />
          <SummaryRow label="Claimable" value={`${state.totals.totalClaimable} km`} />
          <SummaryRow label="Parking" value={formatParking(state.totals.totalParkingCents)} />
        </dl>
      </Card>

      <section aria-label="Legs">
        <SectionHeader>Legs</SectionHeader>
        <ol className="timeline">
          {state.legs.map((leg) => (
            <li key={leg.id} className="timeline-item">
              <span className="timeline-dot" aria-hidden="true" />
              <div className="timeline-row timeline-row--static">
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
              </div>
            </li>
          ))}
        </ol>
      </section>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <DockBar>
        <div className="dock-split">
          <Button variant="secondary" onClick={() => navigate(`/day/${state.day.id}`)}>
            Edit
          </Button>
          {alreadyClosed ? (
            <Button onClick={() => navigate("/")}>Done</Button>
          ) : (
            <Button loading={closing} onClick={() => void handleDone()}>
              Done — close the day
            </Button>
          )}
        </div>
      </DockBar>
    </main>
  );
}
