import { useState } from "react";
import { formatParking, parkingCentsFromKeypad } from "../../domain";
import { Button, Chip, ListRow, NumericField, TextField } from "../../components";
import type { ParkingValue } from "./parkingValue";

interface ParkingRowProps {
  value: ParkingValue;
  onChange: (value: ParkingValue) => void;
  recentAmountsCents: number[];
  recentNotes: string[];
}

/**
 * The collapsed parking row from the brief, on the design system
 * (UI Polish Phase 3): "Parking paid: None" until tapped, so saving a
 * stop without touching it records no parking and costs zero extra
 * taps. Expanding shows the cents-first amount field (typing 1250
 * shows $12.50) with recent amounts and notes as DS Chips.
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
      <div className="parking-collapsed">
        <ListRow
          title={`Parking paid: ${cents !== null && cents > 0 ? formatParking(cents) : "None"}`}
          subtitle={cents !== null && cents > 0 && value.note ? value.note : undefined}
          onClick={() => setExpanded(true)}
        />
      </div>
    );
  }

  return (
    <div className="parking-editor">
      <NumericField
        id="parking-amount"
        label="Parking paid"
        value={value.digits}
        onChange={(event) =>
          onChange({ ...value, digits: event.target.value.replace(/[^0-9]/g, "") })
        }
        hint={
          cents !== null && cents > 0
            ? formatParking(cents)
            : "Type the amount in cents: 1250 = $12.50"
        }
      />
      {recentAmountsCents.length > 0 ? (
        <div className="chip-row" role="group" aria-label="Recent parking amounts">
          {recentAmountsCents.map((amount) => (
            <Chip key={amount} onClick={() => onChange({ ...value, digits: String(amount) })}>
              {formatParking(amount)}
            </Chip>
          ))}
        </div>
      ) : null}
      <TextField
        id="parking-note"
        label="Note (optional)"
        placeholder="Meter, Lot…"
        autoComplete="off"
        value={value.note}
        onChange={(event) => onChange({ ...value, note: event.target.value })}
      />
      {recentNotes.length > 0 ? (
        <div className="chip-row" role="group" aria-label="Recent parking notes">
          {recentNotes.map((note) => (
            <Chip key={note} onClick={() => onChange({ ...value, note })}>
              {note}
            </Chip>
          ))}
        </div>
      ) : null}
      <Button variant="text" onClick={() => setExpanded(false)}>
        Done
      </Button>
    </div>
  );
}
