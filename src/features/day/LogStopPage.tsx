import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db, type LegRecord, type LocationRecord } from "../../data";
import {
  endDay,
  getOpenDayState,
  getRecentParking,
  listAllLegs,
  listRecentStops,
  loadDayContext,
  logStop,
  snapshotDay,
  type DayState,
  type RecentParking,
} from "./dayService";
import { storeUndoSnapshot } from "./undoStore";
import StopForm, { type StopSubmit } from "./StopForm";

interface LogStopPageProps {
  /** End Day variant: destination fixed to Home, then on to the summary. */
  endDayMode?: boolean;
}

/**
 * Log Stop (and, with endDayMode, End Day). Works on whichever day is
 * currently open. Saving returns to Today, or to the day summary when
 * ending the day.
 */
export default function LogStopPage({ endDayMode = false }: LogStopPageProps) {
  const navigate = useNavigate();
  const [openDay, setOpenDay] = useState<DayState | null>(null);
  const [recentStops, setRecentStops] = useState<LocationRecord[]>([]);
  const [recentParking, setRecentParking] = useState<RecentParking>({
    amountsCents: [],
    notes: [],
  });
  const [historyLegs, setHistoryLegs] = useState<LegRecord[]>([]);
  const [homeAddress, setHomeAddress] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const context = await loadDayContext(db);
      const [open, recents, parking, legs] = await Promise.all([
        getOpenDayState(db, context),
        listRecentStops(db, context.userId),
        getRecentParking(db, context.userId),
        listAllLegs(db, context.userId),
      ]);
      if (cancelled) return;
      setOpenDay(open);
      setRecentStops(recents);
      setRecentParking(parking);
      setHistoryLegs(legs);
      setHomeAddress(context.home.address);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return (
      <main className="app-shell">
        <p role="status">Loading…</p>
      </main>
    );
  }

  if (!openDay) {
    return (
      <main className="app-shell">
        <p>
          <Link to="/">← Today</Link>
        </p>
        <h1>{endDayMode ? "End Day" : "Log Stop"}</h1>
        <p className="notice">No day is open right now. Start a day first.</p>
        <button type="button" className="button button-primary" onClick={() => navigate("/start")}>
          Start Day
        </button>
      </main>
    );
  }

  const dayId = openDay.day.id;

  async function handleSubmit(
    submit: StopSubmit & { parking_confirmed: boolean },
  ): Promise<string | null> {
    try {
      const context = await loadDayContext(db);
      const before = endDayMode ? null : await snapshotDay(db, dayId);
      const result = endDayMode
        ? await endDay(db, context, dayId, submit.odoEnd)
        : await logStop(db, context, dayId, submit.destination, submit.odoEnd, {
            parking_cents: submit.parking.parking_cents,
            parking_note: submit.parking.parking_note,
            parking_confirmed: submit.parking_confirmed,
          });
      if (result.status === "needs-parking-confirmation") {
        return "That parking amount needs confirmation before saving.";
      }
      if (endDayMode) {
        navigate(`/day/${dayId}/summary`, { replace: true });
      } else {
        navigate("/", {
          replace: true,
          state: {
            undoToken: before ? storeUndoSnapshot(before) : undefined,
            undoMessage: `Stop saved at ${submit.destination.name}.`,
          },
        });
      }
      return null;
    } catch (caught) {
      return caught instanceof Error ? caught.message : "Could not save the stop.";
    }
  }

  return (
    <main className="app-shell">
      <p>
        <Link to="/">← Today</Link>
      </p>
      <h1>{endDayMode ? "End Day" : "Log Stop"}</h1>
      <p className="field-hint">
        Leaving {openDay.currentDestination.name} at {openDay.currentOdometer}.
      </p>
      <StopForm
        previousReading={openDay.currentOdometer}
        previousName={openDay.currentDestination.name}
        fixedDestination={
          endDayMode ? { name: "Home", address: homeAddress, type: "home" as const } : undefined
        }
        recentStops={recentStops}
        recentAmountsCents={recentParking.amountsCents}
        recentNotes={recentParking.notes}
        historyLegs={historyLegs}
        submitLabel={endDayMode ? "Save — back Home" : "Save stop"}
        onSubmit={handleSubmit}
        onHomeShortcut={endDayMode ? undefined : () => navigate("/end-day")}
      />
    </main>
  );
}
