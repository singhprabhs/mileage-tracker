import { Link } from "react-router-dom";
import { formatParking } from "../../domain";
import type { LegRecord } from "../../data";

interface LegListProps {
  legs: LegRecord[];
  /** When set, each row links to that leg's edit screen. */
  dayId?: string;
}

/** Compact leg list for Today and the day review: From → To, km, parking badge. */
export default function LegList({ legs, dayId }: LegListProps) {
  if (legs.length === 0) {
    return <p className="field-hint">No stops logged yet today.</p>;
  }
  return (
    <ol className="leg-list">
      {legs.map((leg) => {
        const content = (
          <>
            <span className="leg-route">
              {leg.from_name} → {leg.to_name}
            </span>
            <span className="leg-numbers">
              {leg.distance} km
              {leg.parking_cents !== null && leg.parking_cents > 0 ? (
                <span className="parking-badge">P {formatParking(leg.parking_cents)}</span>
              ) : null}
            </span>
          </>
        );
        return (
          <li key={leg.id} className="leg-row">
            {dayId ? (
              <Link
                className="leg-link"
                to={`/day/${dayId}/legs/${leg.id}/edit`}
                aria-label={`Edit leg ${leg.from_name} to ${leg.to_name}`}
              >
                {content}
              </Link>
            ) : (
              <div className="leg-link">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
