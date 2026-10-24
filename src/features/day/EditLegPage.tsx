import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db, type LegRecord } from "../../data";
import { completeOdometer, formatParking, validateParking, type LocationType } from "../../domain";
import {
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  NumericField,
  SegmentedControl,
  SkeletonCard,
  TextField,
} from "../../components";
import { BackLink, DockBar } from "./chrome";
import {
  deleteLeg,
  editLeg,
  getDayState,
  getRecentParking,
  loadDayContext,
  type RecentParking,
} from "./dayService";
import ParkingRow from "./ParkingRow";
import { parkingCentsOf, type ParkingValue } from "./parkingValue";
import { storeUndoSnapshot } from "./undoStore";

/**
 * Edit Leg (UI Polish Phase 4 restyle): destination name / address /
 * type, odometer end with the same shortcut completion as Log Stop,
 * the shared parking row, and Delete — now on the design system.
 * The parking-over-$100 check is a DS ConfirmDialog (audit F-25),
 * Save sits in the dock, the back link is the consistent ≥48px
 * "← Back" and asks before discarding edits, loading is a skeleton,
 * and caught errors are plain language — raw backend messages never
 * reach the screen (audit F-03/F-16). The write path is unchanged:
 * editLeg/deleteLeg with the same inputs, the day service
 * recalculates the chain, and the day review offers 10-second Undo.
 */
export default function EditLegPage() {
  const { dayId, legId } = useParams<{ dayId: string; legId: string }>();
  const navigate = useNavigate();
  const [leg, setLeg] = useState<LegRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [toName, setToName] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [toType, setToType] = useState<LocationType>("customer");
  const [odoDigits, setOdoDigits] = useState("");
  const [parking, setParking] = useState<ParkingValue>({ digits: "", note: "" });
  const [recentParking, setRecentParking] = useState<RecentParking>({
    amountsCents: [],
    notes: [],
  });
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!dayId || !legId) return;
      try {
        const context = await loadDayContext(db);
        const [state, parkingRecents] = await Promise.all([
          getDayState(db, context, dayId),
          getRecentParking(db, context.userId),
        ]);
        if (cancelled) return;
        const found = state.legs.find((row) => row.id === legId) ?? null;
        setLeg(found);
        setRecentParking(parkingRecents);
        if (found) {
          setToName(found.to_name);
          setToAddress(found.to_address);
          setToType(found.to_type);
          setOdoDigits(String(found.odo_end));
          setParking({
            digits: found.parking_cents !== null ? String(found.parking_cents) : "",
            note: found.parking_note ?? "",
          });
        }
        setLoaded(true);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayId, legId, reloadKey]);

  const completedOdometer = useMemo(() => {
    if (!leg || !/^\d+$/.test(odoDigits)) return null;
    try {
      return completeOdometer(odoDigits, leg.odo_start);
    } catch {
      return null;
    }
  }, [odoDigits, leg]);

  if (loadFailed) {
    return (
      <main className="app-shell">
        <BackLink to={dayId ? `/day/${dayId}` : "/"} />
        <h1 className="screen-title">Edit leg</h1>
        <ErrorState
          message="This leg couldn't be loaded. Your logs are safe on this phone."
          onRetry={() => {
            setLoadFailed(false);
            setReloadKey((key) => key + 1);
          }}
        />
      </main>
    );
  }

  if (!loaded) {
    return (
      <main className="app-shell">
        <BackLink to={dayId ? `/day/${dayId}` : "/"} />
        <h1 className="screen-title">Edit leg</h1>
        <SkeletonCard lines={4} />
      </main>
    );
  }

  if (!leg || !dayId || !legId) {
    return (
      <main className="app-shell">
        <BackLink to={dayId ? `/day/${dayId}` : "/"} />
        <h1 className="screen-title">Edit leg</h1>
        <Card>
          <p role="alert">That leg no longer exists on this day.</p>
        </Card>
      </main>
    );
  }

  const dirty =
    toName !== leg.to_name ||
    toAddress !== leg.to_address ||
    toType !== leg.to_type ||
    odoDigits !== String(leg.odo_end) ||
    parking.digits !== (leg.parking_cents !== null ? String(leg.parking_cents) : "") ||
    parking.note !== (leg.parking_note ?? "");

  async function handleSave(confirmed: boolean) {
    setError(null);
    if (toName.trim() === "" || toAddress.trim() === "") {
      setError("Place name and full address are required.");
      return;
    }
    if (completedOdometer === null) {
      setError("Enter the odometer reading at this stop.");
      return;
    }
    const parkingCents = parkingCentsOf(parking);
    const validation = validateParking(parkingCents, toType);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }
    if (validation.needsConfirmation && !confirmed) {
      setPendingConfirm(true);
      return;
    }
    setSaving(true);
    try {
      const context = await loadDayContext(db);
      const result = await editLeg(db, context, dayId as string, legId as string, {
        to_name: toName.trim(),
        to_address: toAddress.trim(),
        to_type: toType,
        odo_end: completedOdometer,
        parking_cents: parkingCents,
        parking_note: parking.note.trim() === "" ? null : parking.note.trim(),
        parking_confirmed: confirmed,
      });
      if (result.status === "needs-parking-confirmation") {
        setError("That parking amount needs confirmation before saving.");
        setSaving(false);
        return;
      }
      navigate(`/day/${dayId}`, {
        replace: true,
        state: {
          undoToken: storeUndoSnapshot(result.previousSnapshot),
          undoMessage: "Leg updated — the day's numbers were recalculated.",
        },
      });
    } catch {
      setError("Couldn't save this leg. Please try again.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      const context = await loadDayContext(db);
      const result = await deleteLeg(db, context, dayId as string, legId as string);
      navigate(`/day/${dayId}`, {
        replace: true,
        state: {
          undoToken: storeUndoSnapshot(result.previousSnapshot),
          undoMessage: `Leg to ${leg?.to_name ?? "the stop"} deleted.`,
        },
      });
    } catch {
      setError("Couldn't delete this leg. Please try again.");
      setSaving(false);
    }
  }

  return (
    <main className="app-shell app-shell--dock">
      <BackLink
        onClick={() => (dirty ? setDiscardOpen(true) : navigate(`/day/${dayId}`))}
      />
      <h1 className="screen-title">Edit leg</h1>
      <p className="screen-date">
        From {leg.from_name} ({leg.from_address})
      </p>

      <div>
        <TextField
          label="Place name"
          autoComplete="off"
          value={toName}
          onChange={(event) => setToName(event.target.value)}
        />
        <TextField
          label="Full address"
          autoComplete="off"
          value={toAddress}
          onChange={(event) => setToAddress(event.target.value)}
        />
        <div>
          <SegmentedControl
            label="This stop is"
            value={toType}
            onChange={setToType}
            options={[
              { value: "customer", label: "A customer" },
              { value: "office", label: "The Office" },
              { value: "home", label: "Home" },
            ]}
          />
        </div>
        <div>
          <p className="odo-previous ds-num">Previous reading: {leg.odo_start}</p>
          <NumericField
            label="Odometer at this stop"
            large
            value={odoDigits}
            onChange={(event) => setOdoDigits(event.target.value.replace(/[^0-9]/g, ""))}
          />
          {completedOdometer !== null && completedOdometer !== leg.odo_end ? (
            <p className="completed-reading ds-num" aria-live="polite">
              Will save as <strong>{completedOdometer}</strong>
            </p>
          ) : null}
          <p className="field-hint">
            Changing this also moves the next leg's starting reading, and the day's totals
            are recalculated.
          </p>
        </div>

        {toType !== "home" ? (
          <ParkingRow
            value={parking}
            onChange={setParking}
            recentAmountsCents={recentParking.amountsCents}
            recentNotes={recentParking.notes}
          />
        ) : null}
      </div>

      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="edit-leg-delete">
        <Button variant="destructive" disabled={saving} onClick={() => void handleDelete()}>
          Delete this leg
        </Button>
      </div>

      <DockBar>
        <Button loading={saving} onClick={() => void handleSave(false)}>
          Save changes
        </Button>
      </DockBar>

      <ConfirmDialog
        open={pendingConfirm}
        title="Parking over $100.00"
        message={`Parking of ${formatParking(parkingCentsOf(parking) ?? 0)} is over $100.00. Save it anyway?`}
        confirmLabel="Yes, save it"
        destructive
        onConfirm={() => {
          setPendingConfirm(false);
          void handleSave(true);
        }}
        onCancel={() => setPendingConfirm(false)}
      />
      <ConfirmDialog
        open={discardOpen}
        title="Discard your changes?"
        message="Your edits to this leg haven't been saved."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => navigate(`/day/${dayId}`)}
        onCancel={() => setDiscardOpen(false)}
      />
    </main>
  );
}
