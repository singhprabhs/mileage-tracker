import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { db, type LegRecord } from "../../data";
import { completeOdometer, formatParking, validateParking, type LocationType } from "../../domain";
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
 * Edit Leg: destination name / address / type, odometer end (with the
 * same shortcut completion as Log Stop), the parking row, and Delete.
 * Saving recalculates the whole chain through the day service, and the
 * day review afterwards offers 10-second Undo.
 */
export default function EditLegPage() {
  const { dayId, legId } = useParams<{ dayId: string; legId: string }>();
  const navigate = useNavigate();
  const [leg, setLeg] = useState<LegRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!dayId || !legId) return;
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
    })();
    return () => {
      cancelled = true;
    };
  }, [dayId, legId]);

  const completedOdometer = useMemo(() => {
    if (!leg || !/^\d+$/.test(odoDigits)) return null;
    try {
      return completeOdometer(odoDigits, leg.odo_start);
    } catch {
      return null;
    }
  }, [odoDigits, leg]);

  if (!loaded) {
    return (
      <main className="app-shell">
        <p role="status">Loading…</p>
      </main>
    );
  }

  if (!leg || !dayId || !legId) {
    return (
      <main className="app-shell">
        <p>
          <Link to={dayId ? `/day/${dayId}` : "/"}>← Day</Link>
        </p>
        <p className="notice notice-error" role="alert">
          That leg no longer exists on this day.
        </p>
      </main>
    );
  }

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
        return;
      }
      navigate(`/day/${dayId}`, {
        replace: true,
        state: {
          undoToken: storeUndoSnapshot(result.previousSnapshot),
          undoMessage: "Leg updated — the day's numbers were recalculated.",
        },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the leg.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the leg.");
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <p>
        <Link to={`/day/${dayId}`}>← Day</Link>
      </p>
      <h1>Edit leg</h1>
      <p className="field-hint">
        From {leg.from_name} ({leg.from_address})
      </p>

      <div className="field">
        <label htmlFor="edit-name">Place name</label>
        <input
          id="edit-name"
          type="text"
          autoComplete="off"
          value={toName}
          onChange={(event) => setToName(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="edit-address">Full address</label>
        <input
          id="edit-address"
          type="text"
          autoComplete="off"
          value={toAddress}
          onChange={(event) => setToAddress(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="edit-type">This stop is</label>
        <select
          id="edit-type"
          value={toType}
          onChange={(event) => setToType(event.target.value as LocationType)}
        >
          <option value="customer">A customer</option>
          <option value="office">The Office</option>
          <option value="home">Home</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="edit-odometer">Odometer at this stop</label>
        <p className="field-hint">Previous reading: {leg.odo_start}</p>
        <input
          id="edit-odometer"
          className="big-number-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={odoDigits}
          onChange={(event) => setOdoDigits(event.target.value.replace(/[^0-9]/g, ""))}
        />
        {completedOdometer !== null && completedOdometer !== leg.odo_end ? (
          <p className="completed-reading" aria-live="polite">
            Will save as <strong>{completedOdometer}</strong>
          </p>
        ) : null}
        <p className="field-hint">
          Changing this also moves the next leg's starting reading, and the day's totals are
          recalculated.
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

      {error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : null}

      {pendingConfirm ? (
        <div className="notice" role="alertdialog" aria-label="Confirm parking amount">
          <p>
            Parking of {formatParking(parkingCentsOf(parking) ?? 0)} is over $100.00. Save it
            anyway?
          </p>
          <div className="button-row">
            <button type="button" className="button" onClick={() => setPendingConfirm(false)}>
              Go back
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                setPendingConfirm(false);
                void handleSave(true);
              }}
            >
              Yes, save it
            </button>
          </div>
        </div>
      ) : (
        <div className="action-stack">
          <button
            type="button"
            className="button button-primary button-large"
            disabled={saving}
            onClick={() => void handleSave(false)}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={saving}
            onClick={() => void handleDelete()}
          >
            Delete this leg
          </button>
        </div>
      )}
    </main>
  );
}
