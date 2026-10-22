/** Location kinds used on every leg. */
export type LocationType = "home" | "office" | "customer";

/**
 * A single leg of a day, mirroring the `legs` table in the brief.
 * Names, addresses and types are copied onto the leg itself so editing a
 * saved customer later never changes past reports.
 * Money is stored only as integer cents (`parking_cents`); never as a float.
 */
export interface Leg {
  from_name: string;
  from_address: string;
  from_type: LocationType;
  to_name: string;
  to_address: string;
  to_type: LocationType;
  odo_start: number;
  odo_end: number;
  /** Whole cents, or null when no parking was paid on this leg. */
  parking_cents: number | null;
  parking_note: string | null;
  note: string | null;
}

/** A leg with its computed distance (km) and claimable distance (km, or null). */
export interface ComputedLeg extends Leg {
  distance: number;
  claimable: number | null;
}

/** A leg as stored, carrying previously computed values and a lock flag. */
export interface StoredLeg extends ComputedLeg {
  /** Locked days (for example already-claimed periods) keep stored values. */
  locked?: boolean;
}

export interface PeriodTotals {
  totalDistance: number;
  /** Sum of claimable across legs; null claimable counts as 0. */
  totalClaimable: number;
  /** Sum of parking in whole cents; 0 when no leg has parking. */
  totalParkingCents: number;
  /** First leg's odo_start, or null when there are no legs. */
  odometerStart: number | null;
  /** Last leg's odo_end, or null when there are no legs. */
  odometerEnd: number | null;
}
