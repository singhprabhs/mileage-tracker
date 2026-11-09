import { useEffect, useMemo, useState } from "react";
import {
  completeOdometer,
  formatParking,
  legWarnings,
  validateParking,
  type Leg,
  type LegWarning,
  type LegWarningCode,
} from "../../domain";
import type { LocationRecord } from "../../data";
import type { LocationType } from "../../domain/types";
import {
  ADDRESS_SEARCH_ATTRIBUTION,
  getAddressSearcher,
  MIN_QUERY_LENGTH,
  type GeoBias,
  type PlaceSuggestion,
} from "../stops/addressSearch";
import { getDeviceLocation } from "../stops/geolocation";
import { filterRecentStops } from "./recentStops";
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  ListRow,
  MapPinIcon,
  NumericField,
  PencilIcon,
  SearchField,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  TextField,
} from "../../components";
import { DockBar } from "./chrome";
import type { StopDestination } from "./dayService";
import ParkingRow from "./ParkingRow";
import { EMPTY_PARKING, parkingCentsOf, type ParkingValue } from "./parkingValue";

export interface StopSubmit {
  destination: StopDestination;
  odoEnd: number;
  parking: { parking_cents: number | null; parking_note: string | null };
}

/**
 * A restorable snapshot of the in-progress form (audit F-04). The
 * parent (Log Stop) persists it per open day and hands it back on
 * mount; a successful save clears it there.
 */
export interface StopFormDraft {
  name: string;
  address: string;
  destType: LocationType;
  place_id: string | null;
  lat: number | null;
  lng: number | null;
  odoDigits: string;
  parking: ParkingValue;
  step: 1 | 2;
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
  /** F-04 draft protection: restore from, and report changes to, this. */
  initialDraft?: StopFormDraft | null;
  onDraftChange?: (draft: StopFormDraft) => void;
}

/** The domain's warnings in plain words (computations unchanged). */
function plainWarning(warning: LegWarning, reading: number, previousReading: number): string {
  const distance = reading - previousReading;
  switch (warning.code) {
    case "negative-distance":
      return `This reading is lower than the previous reading (${previousReading}), so the leg would be ${distance} km. Check the reading — or keep it if it's right.`;
    case "over-150km":
      return `That's ${distance} km in one leg — more than 150 km. Check the reading if that seems too far.`;
    case "over-3x-median":
      return `That's ${distance} km — much longer than this trip usually is. Check the reading if that seems off.`;
    default:
      return "That reading looks unusual. Check it — or keep it if it's right.";
  }
}

function focusField(id: string) {
  const el = document.getElementById(id);
  if (el instanceof HTMLInputElement) {
    el.focus();
    el.select();
  }
}

/**
 * The shared stop-entry form (UI Polish Phase 3), in two steps.
 * Step 1: one large search field — Recent places from local data and
 * Geoapify Suggestions as list rows, skeleton rows while searching,
 * and a plain-language banner with a manual path when search is
 * unavailable. Step 2: the chosen place as a card (editable via the
 * pencil), the big odometer field with the previous reading above it
 * and the live-completed reading below, domain warnings inline in
 * plain words with Fix / Keep, the collapsed parking row, and Save
 * docked in the bottom bar. Insert Stop and End Day reuse the form;
 * their props are unchanged.
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
  initialDraft,
  onDraftChange,
}: StopFormProps) {
  const searcher = useMemo(() => getAddressSearcher(), []);
  const [step, setStep] = useState<1 | 2>(
    fixedDestination ? 2 : (initialDraft?.step ?? (initialDestination ? 2 : 1)),
  );
  // Log Stop and End Day are the same mounted form with different
  // props (the router reuses the tree), so a fixed destination must
  // force step 2 regardless of the step state Log Stop left behind.
  const effectiveStep: 1 | 2 = fixedDestination ? 2 : step;
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searchState, setSearchState] = useState<"loading" | "unavailable" | null>(
    !fixedDestination && !searcher.configured ? "unavailable" : null,
  );
  /** Device location from "Use my location": re-ranks search by proximity. */
  const [bias, setBias] = useState<GeoBias | null>(null);
  const [geoState, setGeoState] = useState<
    "idle" | "locating" | "ready" | "denied" | "unavailable"
  >("idle");
  /** Nearest named place to the device, offered as a pickable row. */
  const [currentPlace, setCurrentPlace] = useState<PlaceSuggestion | null>(null);
  /** The picked suggestion's name was only the street address. */
  const [nameNeedsCheck, setNameNeedsCheck] = useState(false);
  const [name, setName] = useState(
    fixedDestination?.name ?? initialDraft?.name ?? initialDestination?.name ?? "",
  );
  const [address, setAddress] = useState(
    fixedDestination?.address ?? initialDraft?.address ?? initialDestination?.address ?? "",
  );
  const [destType, setDestType] = useState<LocationType>(
    fixedDestination?.type ?? initialDraft?.destType ?? initialDestination?.type ?? "customer",
  );
  const [place, setPlace] = useState<Pick<StopDestination, "place_id" | "lat" | "lng">>({
    place_id: initialDraft?.place_id ?? initialDestination?.place_id ?? null,
    lat: initialDraft?.lat ?? initialDestination?.lat ?? null,
    lng: initialDraft?.lng ?? initialDestination?.lng ?? null,
  });
  const [editingPlace, setEditingPlace] = useState(false);
  const [odoDigits, setOdoDigits] = useState(initialDraft?.odoDigits ?? "");
  const [parking, setParking] = useState<ParkingValue>(initialDraft?.parking ?? EMPTY_PARKING);
  const [dismissedWarnings, setDismissedWarnings] = useState<ReadonlySet<LegWarningCode>>(
    new Set(),
  );
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (fixedDestination) {
      focusField("stop-odometer");
    }
  }, [fixedDestination]);

  useEffect(() => {
    if (fixedDestination || !searcher.configured) return;
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setSearchState(null);
      return;
    }
    setSearchState("loading");
    let cancelled = false;
    void searcher.searchDebounced(query, bias).then((result) => {
      if (cancelled) return;
      if (result.status === "ok") {
        setSuggestions(result.results);
        setSearchState(null);
      } else {
        // The reason is a technical string — never shown (audit F-03).
        setSuggestions([]);
        setSearchState("unavailable");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query, searcher, fixedDestination, bias]);

  async function handleUseMyLocation() {
    if (geoState === "locating") return;
    setGeoState("locating");
    setCurrentPlace(null);
    const located = await getDeviceLocation();
    if (located.status === "denied") {
      setGeoState("denied");
      return;
    }
    if (located.status !== "ok") {
      setGeoState("unavailable");
      return;
    }
    setBias(located.position);
    setGeoState("ready");
    const nearby = await searcher.reverseGeocode(located.position.lat, located.position.lng);
    if (nearby.status === "ok" && nearby.results[0]) {
      setCurrentPlace(nearby.results[0]);
    }
  }

  // F-04: report every in-progress change to the draft owner.
  useEffect(() => {
    onDraftChange?.({
      name,
      address,
      destType,
      place_id: place.place_id ?? null,
      lat: place.lat ?? null,
      lng: place.lng ?? null,
      odoDigits,
      parking,
      step: effectiveStep,
    });
  }, [name, address, destType, place, odoDigits, parking, effectiveStep, onDraftChange]);

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

  const visibleWarnings = warnings.filter((warning) => !dismissedWarnings.has(warning.code));

  const filteredRecents = useMemo(
    () => filterRecentStops(recentStops, query),
    [recentStops, query],
  );

  function chooseSuggestion(suggestion: PlaceSuggestion) {
    setName(suggestion.name);
    setAddress(suggestion.address);
    setPlace({ place_id: suggestion.place_id, lat: suggestion.lat, lng: suggestion.lng });
    setSuggestions([]);
    setQuery("");
    setCurrentPlace(null);
    setStep(2);
    if (suggestion.nameIsAddress) {
      // The search only found the street address, not the company —
      // open the editor on the name so the customer name is typed
      // and verified before anything is saved.
      setNameNeedsCheck(true);
      setEditingPlace(true);
      requestAnimationFrame(() => focusField("stop-name"));
    } else {
      setNameNeedsCheck(false);
      setEditingPlace(false);
      requestAnimationFrame(() => focusField("stop-odometer"));
    }
  }

  function chooseRecent(stop: LocationRecord) {
    setName(stop.name);
    setAddress(stop.address);
    setDestType(stop.type);
    setPlace({ place_id: stop.place_id, lat: stop.lat, lng: stop.lng });
    setSuggestions([]);
    setQuery("");
    setCurrentPlace(null);
    setNameNeedsCheck(false);
    setEditingPlace(false);
    setStep(2);
    requestAnimationFrame(() => focusField("stop-odometer"));
  }

  function typeManually() {
    setNameNeedsCheck(false);
    setEditingPlace(true);
    setStep(2);
    requestAnimationFrame(() => focusField("stop-name"));
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
      {!fixedDestination && effectiveStep === 1 ? (
        <div className="stop-step">
          <SearchField
            id="stop-search"
            label="Where are you now?"
            autoFocus
            autoComplete="off"
            placeholder="Start typing an address…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => {
              setQuery("");
              setSuggestions([]);
            }}
          />
          <p className="search-attribution">{ADDRESS_SEARCH_ATTRIBUTION}</p>

          {searcher.configured ? (
            <div className="geo-row">
              <Button
                variant="secondary"
                onClick={() => void handleUseMyLocation()}
                disabled={geoState === "locating"}
              >
                {geoState === "locating" ? "Finding your location…" : "Use my location"}
              </Button>
              {geoState === "ready" ? (
                <p className="search-attribution">
                  Searching near where you are now. Suggestions are still limited to BC.
                </p>
              ) : null}
              {geoState === "denied" ? (
                <p className="search-attribution">
                  Location is off — turn it on in your iPhone settings to use this.
                </p>
              ) : null}
              {geoState === "unavailable" ? (
                <p className="search-attribution">
                  Couldn&apos;t get your location right now — search still works.
                </p>
              ) : null}
            </div>
          ) : null}

          {currentPlace ? (
            <section aria-label="Current location">
              <SectionHeader>Current location</SectionHeader>
              <div className="result-list">
                <ListRow
                  icon={<MapPinIcon width={20} height={20} />}
                  title={currentPlace.name}
                  subtitle={currentPlace.address}
                  onClick={() => chooseSuggestion(currentPlace)}
                />
              </div>
            </section>
          ) : null}

          {searchState === "unavailable" ? (
            <Banner kind="warning">
              <span className="sync-error-text">
                {searcher.configured
                  ? "Address search isn't available right now. Check your connection, or type the address yourself."
                  : "Address search isn't set up on this device, so type the address yourself."}
              </span>
              <Button variant="text" onClick={typeManually}>
                Type it manually
              </Button>
            </Banner>
          ) : null}

          {filteredRecents.length > 0 ? (
            <section aria-label="Recent stops">
              <SectionHeader>Recent</SectionHeader>
              <div className="result-list">
                {filteredRecents.map((stop) => (
                  <ListRow
                    key={stop.id}
                    icon={<MapPinIcon width={20} height={20} />}
                    title={stop.name}
                    subtitle={stop.address}
                    onClick={() => chooseRecent(stop)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {searchState === "loading" ? (
            <div aria-hidden="true">
              <SectionHeader>Suggestions</SectionHeader>
              <div className="result-list">
                <Skeleton height={56} radius={12} />
                <Skeleton height={56} radius={12} />
                <Skeleton height={56} radius={12} />
              </div>
            </div>
          ) : suggestions.length > 0 ? (
            <section aria-label="Address suggestions">
              <SectionHeader>Suggestions</SectionHeader>
              <div className="result-list">
                {suggestions.map((suggestion) => (
                  <ListRow
                    key={suggestion.place_id ?? suggestion.address}
                    icon={<MapPinIcon width={20} height={20} />}
                    title={suggestion.name}
                    subtitle={suggestion.address}
                    onClick={() => chooseSuggestion(suggestion)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <Button variant="text" onClick={typeManually}>
            Type it manually
          </Button>
        </div>
      ) : null}

      {effectiveStep === 2 ? (
        <div className="stop-step">
          {fixedDestination ? (
            <Card className="place-card">
              <div className="place-card-main">
                <p className="place-card-name">{fixedDestination.name}</p>
                <p className="place-card-address">{fixedDestination.address}</p>
              </div>
            </Card>
          ) : (
            <>
              <Card className="place-card">
                <div className="place-card-main">
                  <p className="place-card-name">{name || "New place"}</p>
                  <p className="place-card-address">{address}</p>
                </div>
                <button
                  type="button"
                  className="place-edit-btn"
                  aria-label="Edit place details"
                  aria-expanded={editingPlace}
                  onClick={() => setEditingPlace((open) => !open)}
                >
                  <PencilIcon width={20} height={20} />
                </button>
              </Card>
              {editingPlace ? (
                <div className="place-editor">
                  <TextField
                    id="stop-name"
                    label={destType === "customer" ? "Customer name" : "Place name"}
                    hint={
                      nameNeedsCheck
                        ? "The search only found the street address — type the customer name."
                        : undefined
                    }
                    autoComplete="off"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <TextField
                    id="stop-address"
                    label="Full address"
                    autoComplete="off"
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                  />
                  <SegmentedControl
                    label="This stop is"
                    value={destType === "office" ? "office" : "customer"}
                    onChange={(value) => setDestType(value as LocationType)}
                    options={[
                      { value: "customer", label: "A customer" },
                      { value: "office", label: "The Office" },
                    ]}
                  />
                  <Button
                    variant="text"
                    onClick={() => {
                      setEditingPlace(false);
                      setNameNeedsCheck(false);
                    }}
                  >
                    Done
                  </Button>
                </div>
              ) : null}
              <Button
                variant="text"
                onClick={() => {
                  setStep(1);
                  requestAnimationFrame(() => focusField("stop-search"));
                }}
              >
                Change place
              </Button>
            </>
          )}

          <div>
            <p className="odo-previous">
              Previous reading: <strong className="ds-num">{previousReading}</strong> at{" "}
              {previousName}
            </p>
            <NumericField
              id="stop-odometer"
              label={fixedDestination ? "Odometer at Home" : "Odometer at this stop"}
              large
              value={odoDigits}
              onChange={(event) => setOdoDigits(event.target.value.replace(/[^0-9]/g, ""))}
            />
            {completedOdometer !== null ? (
              <p className="completed-reading" aria-live="polite">
                Will save as <strong className="ds-num">{completedOdometer}</strong>
                {completedOdometer !== previousReading
                  ? ` (${completedOdometer - previousReading} km)`
                  : ""}
              </p>
            ) : (
              <p className="odo-hint">Type the full reading or just the last digits.</p>
            )}
          </div>

          {visibleWarnings.map((warning) => (
            <div key={warning.code} className="inline-warning" role="alert">
              <p>{plainWarning(warning, completedOdometer ?? previousReading, previousReading)}</p>
              <div className="inline-warning-actions">
                <Button variant="text" onClick={() => focusField("stop-odometer")}>
                  Fix
                </Button>
                <Button
                  variant="text"
                  onClick={() => setDismissedWarnings((prev) => new Set(prev).add(warning.code))}
                >
                  Keep
                </Button>
              </div>
            </div>
          ))}

          {destType !== "home" && !fixedDestination ? (
            <ParkingRow
              value={parking}
              onChange={setParking}
              recentAmountsCents={recentAmountsCents}
              recentNotes={recentNotes}
            />
          ) : null}

          {error ? (
            <Banner kind="warning">
              <span role="alert">{error}</span>
            </Banner>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingConfirm}
        title="Parking over $100"
        message={`Parking of ${formatParking(parkingCentsOf(parking) ?? 0)} is over $100.00. Save it anyway?`}
        confirmLabel="Yes, save it"
        cancelLabel="Go back"
        onCancel={() => setPendingConfirm(false)}
        onConfirm={() => {
          setPendingConfirm(false);
          void handleSave(true);
        }}
      />

      {effectiveStep === 2 ? (
        <DockBar>
          <div className="dock-stack">
            <Button loading={saving} onClick={() => void handleSave(false)}>
              {submitLabel}
            </Button>
            {onHomeShortcut ? (
              <Button variant="secondary" onClick={onHomeShortcut}>
                Home — end the day
              </Button>
            ) : null}
          </div>
        </DockBar>
      ) : onHomeShortcut ? (
        <DockBar>
          <Button variant="secondary" onClick={onHomeShortcut}>
            Home — end the day
          </Button>
        </DockBar>
      ) : null}
    </div>
  );
}
