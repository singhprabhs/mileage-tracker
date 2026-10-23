import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db, type LegRecord, type LocationRecord } from "../../data";
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
 * Insert a missed stop after a chosen leg. The following leg departs
 * from the inserted stop afterwards, and the chain is recalculated by
 * the day service; Undo on the day review restores the old chain.
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!dayId) return;
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
    })();
    return () => {
      cancelled = true;
    };
  }, [dayId]);

  if (!loaded || !state || !dayId || !legId) {
    return (
      <main className="app-shell">
        <p role="status">Loading…</p>
      </main>
    );
  }

  const afterLeg = state.legs.find((leg) => leg.id === legId);
  if (!afterLeg) {
    return (
      <main className="app-shell">
        <p>
          <Link to={`/day/${dayId}`}>← Day</Link>
        </p>
        <p className="notice notice-error" role="alert">
          That leg no longer exists on this day.
        </p>
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
    } catch (caught) {
      return caught instanceof Error ? caught.message : "Could not insert the stop.";
    }
  }

  return (
    <main className="app-shell">
      <p>
        <Link to={`/day/${dayId}`}>← Day</Link>
      </p>
      <h1>Insert a missed stop</h1>
      <p className="field-hint">
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
