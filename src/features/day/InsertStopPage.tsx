import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db, type LegRecord, type LocationRecord } from "../../data";
import { BackLink } from "./chrome";
import { Card, ErrorState, SkeletonCard } from "../../components";
import {
  getDayState,
  getRecentParking,
  insertLeg,
  listAllLegs,
  listRecentStops,
  loadDayContext,
  type DayState,
  type RecentParking,
} from "./dayService";
import StopForm, { type StopSubmit } from "./StopForm";
import { storeUndoSnapshot } from "./undoStore";

/**
 * Insert a missed stop after a chosen leg (UI Polish Phase 4:
 * chrome brought in line with the rest of the day family — the
 * consistent ≥48px BackLink, DS skeleton while loading, a
 * plain-language state when the leg is gone, and insert errors
 * mapped to plain language instead of raw backend text, audit
 * F-03/F-09/F-16). The form itself is the Phase 3 StopForm,
 * unchanged; the following leg departs from the inserted stop
 * afterwards, the chain is recalculated by the day service, and
 * Undo on the day review restores the old chain.
 */
export default function InsertStopPage() {
  const { dayId, legId } = useParams<{ dayId: string; legId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<DayState | null>(null);
  const [recentStops, setRecentStops] = useState<LocationRecord[]>([]);
  const [recentParking, setRecentParking] = useState<RecentParking>({
    amountsCents: [],
    notes: [],
  });
  const [historyLegs, setHistoryLegs] = useState<LegRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!dayId) return;
      try {
        const context = await loadDayContext(db);
        const [loadedState, recents, parking, legs] = await Promise.all([
          getDayState(db, context, dayId),
          listRecentStops(db, context.userId),
          getRecentParking(db, context.userId),
          listAllLegs(db, context.userId),
        ]);
        if (cancelled) return;
        setState(loadedState);
        setRecentStops(recents);
        setRecentParking(parking);
        setHistoryLegs(legs);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayId, reloadKey]);

  if (loadFailed) {
    return (
      <main className="app-shell">
        <BackLink to={dayId ? `/day/${dayId}` : "/"} />
        <h1 className="screen-title">Insert a missed stop</h1>
        <ErrorState
          message="This day couldn't be loaded. Your logs are safe on this phone."
          onRetry={() => {
            setLoadFailed(false);
            setReloadKey((key) => key + 1);
          }}
        />
      </main>
    );
  }

  if (!loaded || !state || !dayId || !legId) {
    return (
      <main className="app-shell">
        <BackLink to={dayId ? `/day/${dayId}` : "/"} />
        <h1 className="screen-title">Insert a missed stop</h1>
        <SkeletonCard lines={3} />
      </main>
    );
  }

  const afterLeg = state.legs.find((leg) => leg.id === legId);
  if (!afterLeg) {
    return (
      <main className="app-shell">
        <BackLink to={`/day/${dayId}`} />
        <h1 className="screen-title">Insert a missed stop</h1>
        <Card>
          <p role="alert">That leg no longer exists on this day.</p>
        </Card>
      </main>
    );
  }

  async function handleSubmit(
    submit: StopSubmit & { parking_confirmed: boolean },
  ): Promise<string | null> {
    try {
      const context = await loadDayContext(db);
      const result = await insertLeg(
        db,
        context,
        dayId as string,
        legId as string,
        submit.destination,
        submit.odoEnd,
        {
          parking_cents: submit.parking.parking_cents,
          parking_note: submit.parking.parking_note,
          parking_confirmed: submit.parking_confirmed,
        },
      );
      if (result.status === "needs-parking-confirmation") {
        return "That parking amount needs confirmation before saving.";
      }
      navigate(`/day/${dayId}`, {
        replace: true,
        state: {
          undoToken: result.previousSnapshot
            ? storeUndoSnapshot(result.previousSnapshot)
            : undefined,
          undoMessage: `Missed stop at ${submit.destination.name} inserted.`,
        },
      });
      return null;
    } catch {
      return "Couldn't insert that stop. Please try again.";
    }
  }

  return (
    <main className="app-shell app-shell--dock">
      <BackLink to={`/day/${dayId}`} />
      <h1 className="screen-title">Insert a missed stop</h1>
      <p className="screen-date">
        After {afterLeg.from_name} → {afterLeg.to_name}. The stop you add sits between{" "}
        {afterLeg.to_name} (odometer {afterLeg.odo_end}) and whatever came next.
      </p>
      <StopForm
        previousReading={afterLeg.odo_end}
        previousName={afterLeg.to_name}
        recentStops={recentStops}
        recentAmountsCents={recentParking.amountsCents}
        recentNotes={recentParking.notes}
        historyLegs={historyLegs}
        submitLabel="Insert stop"
        onSubmit={handleSubmit}
      />
    </main>
  );
}
