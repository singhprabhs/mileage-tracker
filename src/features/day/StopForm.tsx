import { useEffect, useMemo, useRef, useState } from "react";
import {
  completeOdometer,
  formatParking,
  legWarnings,
  validateParking,
  type Leg,
} from "../../domain";
import type { LocationRecord } from "../../data";
import type { LocationType } from "../../domain/types";
import {
  ADDRESS_SEARCH_ATTRIBUTION,
  getAddressSearcher,
  type PlaceSuggestion,
} from "../stops/addressSearch";
import type { StopDestination } from "./dayService";
import ParkingRow from "./ParkingRow";
import { EMPTY_PARKING, parkingCentsOf, type ParkingValue } from "./parkingValue";

export interface StopSubmit {
  destination: StopDestination;
  odoEnd: number;
  parking: { parking_cents: number | null; parking_note: string | null };
}

interface StopFormProps {
  previousReading: number;
  previousName: string;
  /** Set for End Day: the destination is fixed and no search is shown. */
  fixedDestination?: StopDestination;
  /** Starting values for the destination (insert flow / re-entry). */
  initialDestination?: StopDestination;
  recentStops: LocationRecord[];
  recentAmountsCents: number[];
  recentNotes: string[];
  /** All past legs, for the same-route median warning. */
  historyLegs: Leg[];
  submitLabel: string;
  /** Records a parking-needs-confirmation outcome instead of throwing. */
  onSubmit: (submit: StopSubmit & { parking_confirmed: boolean }) => Promise<string | null>;
  /** Optional Home shortcut button (Log Stop's "end the day" path). */
  onHomeShortcut?: () => void;
}

/**
 * The shared stop-entry form: address search with suggestions above
 * recent stops (manual entry always available), name and address fields,
 * the odometer field with live shortcut completion and non-blocking
 * warnings, and the collapsed parking row.
 */
export default function StopForm({
  previousReading,
  previousName,
  fixedDestination,
  initialDestination,
  recentStops,
  recentAmountsCents,
  recentNotes,
  historyLegs,
  submitLabel,
  onSubmit,
  onHomeShortcut,
}: StopFormProps) {
  const searcher = useMemo(() => getAddressSearcher(), []);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchNote, setSearchNote] = useState<string | null>(
    searcher.configured ? null : "Address search is not set up — type the name and address below.",
  );
  const [name, setName] = useState(fixedDestination?.name ?? initialDestination?.name ?? "");
  const [address, setAddress] = useState(
    fixedDestination?.address ?? initialDestination?.address ?? "",
  );
  const [destType, setDestType] = useState<LocationType>(
    fixedDestination?.type ?? initialDestination?.type ?? "customer",
  );
  const [place, setPlace] = useState<Pick<StopDestination, "place_id" | "lat" | "lng">>({
    place_id: initialDestination?.place_id ?? null,
    lat: initialDestination?.lat ?? null,
    lng: initialDestination?.lng ?? null,
  });
  const [odoDigits, setOdoDigits] = useState("");
  const [parking, setParking] = useState<ParkingValue>(EMPTY_PARKING);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const odoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fixedDestination) {
      odoInputRef.current?.focus();
    } else {
      searchInputRef.current?.focus();
    }
  }, [fixedDestination]);

  useEffect(() => {
    if (fixedDestination || !searcher.configured) return;
    let cancelled = false;
    void searcher.searchDebounced(query).then((result) => {
      if (cancelled) return;
      if (result.status === "ok") {
        setSuggestions(result.results);
        setSearchNote(null);
      } else {
        setSuggestions([]);
        setSearchNote(result.reason);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query, searcher, fixedDestination]);

  const completedOdometer = useMemo(() => {
    if (!/^\d+$/.test(odoDigits)) return null;
    try {
      return completeOdometer(odoDigits, previousReading);
    } catch {
      return null;
    }
  }, [odoDigits, previousReading]);

  const warnings = useMemo(() => {
    if (completedOdometer === null || name.trim() === "") return [];
    const prospective: Leg = {
      from_name: previousName,
      from_address: "",
      from_type: "customer",
      to_name: name.trim(),
      to_address: address.trim(),
      to_type: destType,
      odo_start: previousReading,
      odo_end: completedOdometer,
      parking_cents: null,
      parking_note: null,
      note: null,
    };
    return legWarnings(prospective, historyLegs);
  }, [completedOdometer, name, address, destType, previousName, previousReading, historyLegs]);

  function chooseSuggestion(suggestion: PlaceSuggestion) {
    setName(suggestion.name);
    setAddress(suggestion.address);
    setPlace({ place_id: suggestion.place_id, lat: suggestion.lat, lng: suggestion.lng });
    setSuggestions([]);
    setQuery("");
    odoInputRef.current?.focus();
  }

  function chooseRecent(stop: LocationRecord) {
    setName(stop.name);
    setAddress(stop.address);
    setDestType(stop.type);
    setPlace({ place_id: stop.place_id, lat: stop.lat, lng: stop.lng });
    setSuggestions([]);
    odoInputRef.current?.focus();
  }

  async function handleSave(confirmed: boolean) {
    setError(null);
    const destination: StopDestination = fixedDestination ?? {
      name: name.trim(),
      address: address.trim(),
      type: destType,
      place_id: place.place_id,
      lat: place.lat,
      lng: place.lng,
    };
    if (!fixedDestination && (destination.name === "" || destination.address === "")) {
      setError("Enter the place name and its full address (search or type them).");
      return;
    }
    if (completedOdometer === null) {
      setError("Enter the odometer reading — the last digits are enough.");
      return;
    }
    const parkingCents = parkingCentsOf(parking);
    const validation = validateParking(parkingCents, destination.type);
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
      const problem = await onSubmit({
        destination,
        odoEnd: completedOdometer,
        parking: {
          parking_cents: parkingCents,
          parking_note: parking.note.trim() === "" ? null : parking.note.trim(),
        },
        parking_confirmed: confirmed,
      });
      if (problem) setError(problem);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {!fixedDestination ? (
        <>
          <div className="field">
            <label htmlFor="stop-search">Search for the address</label>
            <input
              id="stop-search"
              ref={searchInputRef}
              type="search"
              autoComplete="off"
              placeholder="Start typing an address…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <p className="field-hint">{ADDRESS_SEARCH_ATTRIBUTION}</p>
            {searchNote ? <p className="field-hint">{searchNote}</p> : null}
          </div>
          {suggestions.length > 0 ? (
            <ul className="suggestion-list" aria-label="Address suggestions">
              {suggestions.map((suggestion) => (
                <li key={suggestion.place_id ?? suggestion.address}>
                  <button
                    type="button"
                    className="suggestion"
                    onClick={() => chooseSuggestion(suggestion)}
                  >
                    <strong>{suggestion.name}</strong>
                    <span>{suggestion.address}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {recentStops.length > 0 ? (
            <div className="field">
              <span className="field-label">Recent stops</span>
              <div className="chip-row">
                {recentStops.slice(0, 8).map((stop) => (
                  <button
                    key={stop.id}
                    type="button"
                    className="chip"
                    onClick={() => chooseRecent(stop)}
                  >
                    {stop.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="stop-name">Place name</label>
            <input
              id="stop-name"
              type="text"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="stop-address">Full address</label>
            <input
              id="stop-address"
              type="text"
              autoComplete="off"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="stop-type">This stop is</label>
            <select
              id="stop-type"
              value={destType}
              onChange={(event) => setDestType(event.target.value as LocationType)}
            >
              <option value="customer">A customer</option>
              <option value="office">The Office</option>
            </select>
          </div>
        </>
      ) : (
        <p className="notice">
          Destination: <strong>{fixedDestination.name}</strong> — {fixedDestination.address}
        </p>
      )}

      <div className="field">
        <label htmlFor="stop-odometer">Odometer at {fixedDestination ? "Home" : "this stop"}</label>
        <p className="field-hint">Previous reading: {previousReading}</p>
        <input
          id="stop-odometer"
          ref={odoInputRef}
          className="big-number-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={odoDigits}
          onChange={(event) => setOdoDigits(event.target.value.replace(/[^0-9]/g, ""))}
        />
        {completedOdometer !== null ? (
          <p className="completed-reading" aria-live="polite">
            Will save as <strong>{completedOdometer}</strong>
            {completedOdometer !== previousReading
              ? ` (${completedOdometer - previousReading} km)`
              : ""}
          </p>
        ) : (
          <p className="field-hint">Type the full reading or just the last digits.</p>
        )}
      </div>

      {warnings.length > 0 ? (
        <div className="notice notice-warning" role="alert">
          {warnings.map((warning) => (
            <p key={warning.code}>{warning.message}</p>
          ))}
          <p>Warnings only — you can still save.</p>
        </div>
      ) : null}

      {destType !== "home" && !fixedDestination ? (
        <ParkingRow
          value={parking}
          onChange={setParking}
          recentAmountsCents={recentAmountsCents}
          recentNotes={recentNotes}
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
            {saving ? "Saving…" : submitLabel}
          </button>
          {onHomeShortcut ? (
            <button type="button" className="button" onClick={onHomeShortcut}>
              Home — end the day
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
