import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { db, type LegRecord, type LocationRecord } from "../../data";
import { Banner, Button, ConfirmDialog, SkeletonCard } from "../../components";
import { BackLink } from "./chrome";
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
import StopForm, { type StopFormDraft, type StopSubmit } from "./StopForm";

interface LogStopPageProps {
  /** End Day variant: destination fixed to Home, then on to the summary. */
  endDayMode?: boolean;
}

/** F-04 draft protection: one localStorage draft per open day. */
function draftKey(dayId: string): string {
  return `logStopDraft:${dayId}`;
}

function readDraft(dayId: string): StopFormDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(dayId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StopFormDraft;
    if (typeof parsed.odoDigits !== "string" || typeof parsed.name !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** A draft worth protecting: anything typed, chosen or stepped into. */
function draftHasContent(draft: StopFormDraft): boolean {
  return (
    draft.name.trim() !== "" ||
    draft.address.trim() !== "" ||
    draft.odoDigits.trim() !== "" ||
    draft.parking.digits.trim() !== "" ||
    draft.parking.note.trim() !== ""
  );
}

/**
 * Log Stop (and, with endDayMode, End Day) on the design system
 * (UI Polish Phase 3). Works on whichever day is currently open.
 * Saving returns to Today, or to the day summary when ending the
 * day. The in-progress form autosaves to a per-day local draft
 * (audit F-04): it survives leaving or the app being killed, going
 * Back with content asks before discarding, and a successful save
 * clears it. End Day mode keeps no draft — its one field is the
 * Home odometer, and the day itself is the record.
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
  const [initialDraft, setInitialDraft] = useState<StopFormDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);

  // Stable identity is load-bearing: StopForm reports changes from an
  // effect keyed on this callback, and a fresh identity per render
  // would rewrite the draft right after Discard/Save cleared it.
  const handleDraftChange = useCallback(
    (draft: StopFormDraft) => {
      if (endDayMode || !openDay) return;
      setDirty(draftHasContent(draft));
      try {
        window.localStorage.setItem(draftKey(openDay.day.id), JSON.stringify(draft));
      } catch {
        // Storage full/blocked: the form still works, just unprotected.
      }
    },
    [endDayMode, openDay],
  );

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
      if (open && !endDayMode) {
        const draft = readDraft(open.day.id);
        setInitialDraft(draft);
        setDirty(draft !== null && draftHasContent(draft));
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [endDayMode]);

  if (!loaded) {
    return (
      <main className="app-shell">
        <BackLink />
        <h1 className="screen-title">{endDayMode ? "End Day" : "Log Stop"}</h1>
        <SkeletonCard lines={3} />
      </main>
    );
  }

  if (!openDay) {
    return (
      <main className="app-shell">
        <BackLink />
        <h1 className="screen-title">{endDayMode ? "End Day" : "Log Stop"}</h1>
        <Banner kind="info">
          <span className="sync-error-text">No day is open right now. Start a day first.</span>
          <Button variant="text" onClick={() => navigate("/start")}>
            Start Day
          </Button>
        </Banner>
      </main>
    );
  }

  const dayId = openDay.day.id;

  function clearDraft() {
    try {
      window.localStorage.removeItem(draftKey(dayId));
    } catch {
      // Nothing to clear.
    }
    setDirty(false);
  }

  function handleBackClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!endDayMode && dirty) {
      event.preventDefault();
      setShowDiscard(true);
    }
  }

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
        clearDraft();
        navigate("/", {
          replace: true,
          state: {
            undoToken: before ? storeUndoSnapshot(before) : undefined,
            undoMessage: `Stop saved at ${submit.destination.name}.`,
          },
        });
      }
      return null;
    } catch {
      return "Couldn't save the stop. Please try again.";
    }
  }

  return (
    <main className={`app-shell app-shell--dock${endDayMode ? "" : " app-shell--dock-lg"}`}>
      <BackLink onClick={handleBackClick} />
      <h1 className="screen-title">{endDayMode ? "End Day" : "Log Stop"}</h1>
      <p className="screen-date">
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
        initialDraft={endDayMode ? null : initialDraft}
        onDraftChange={endDayMode ? undefined : handleDraftChange}
      />
      <ConfirmDialog
        open={showDiscard}
        title="Discard this stop?"
        message="What you've typed for this stop hasn't been saved yet."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onCancel={() => setShowDiscard(false)}
        onConfirm={() => {
          clearDraft();
          setShowDiscard(false);
          navigate("/");
        }}
      />
    </main>
  );
}
