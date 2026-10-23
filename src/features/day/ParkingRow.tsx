import { useState } from "react";
import { formatParking, parkingCentsFromKeypad } from "../../domain";
import type { ParkingValue } from "./parkingValue";

interface ParkingRowProps {
  value: ParkingValue;
  onChange: (value: ParkingValue) => void;
  recentAmountsCents: number[];
  recentNotes: string[];
}

/**
 * The collapsed parking row from the brief: "Parking paid: None" until
 * tapped, so saving a stop without touching it records no parking and
 * costs zero extra taps. Expanding shows a cents-first amount field
 * (typing 1250 shows $12.50) with recent-amount chips and a note field
 * with recent-note chips.
 */
export default function ParkingRow({
  value,
  onChange,
  recentAmountsCents,
  recentNotes,
}: ParkingRowProps) {
  const [expanded, setExpanded] = useState(false);
  const cents = value.digits.trim() === "" ? null : parkingCentsFromKeypad(value.digits.trim());

  if (!expanded) {
    return (
      <button
        type="button"
        className="parking-row"
        aria-expanded={false}
        onClick={() => setExpanded(true)}
      >
        Parking paid: {cents !== null && cents > 0 ? formatParking(cents) : "None"}
      </button>
    );
  }

  return (
    <fieldset className="parking-editor">
      <legend>Parking paid</legend>
      <div className="field">
        <label htmlFor="parking-amount">Amount (type cents: 1250 = $12.50)</label>
        <input
          id="parking-amount"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={value.digits}
          onChange={(event) =>
            onChange({ ...value, digits: event.target.value.replace(/[^0-9]/g, "") })
          }
        />
        <p className="field-hint" aria-live="polite">
          {cents !== null && cents > 0 ? formatParking(cents) : "No parking"}
        </p>
      </div>
      {recentAmountsCents.length > 0 ? (
        <div className="chip-row" aria-label="Recent parking amounts">
          {recentAmountsCents.map((amount) => (
            <button
              key={amount}
              type="button"
              className="chip"
              onClick={() => onChange({ ...value, digits: String(amount) })}
            >
              {formatParking(amount)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="parking-note">Note (optional)</label>
        <input
          id="parking-note"
          type="text"
          autoComplete="off"
          placeholder="Meter, Lot…"
          value={value.note}
          onChange={(event) => onChange({ ...value, note: event.target.value })}
        />
      </div>
      {recentNotes.length > 0 ? (
        <div className="chip-row" aria-label="Recent parking notes">
          {recentNotes.map((note) => (
            <button
              key={note}
              type="button"
              className="chip"
              onClick={() => onChange({ ...value, note })}
            >
              {note}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="chip"
        aria-expanded={true}
        onClick={() => setExpanded(false)}
      >
        Done
      </button>
    </fieldset>
  );
}
