import { sumParkingCents } from "./parking";
import type { ComputedLeg, Leg, PeriodTotals, StoredLeg } from "./types";

/** Default Home <-> Office commute distance from the brief. */
export const DEFAULT_HOME_OFFICE_KM = 23;

/** Distance of a leg in kilometres: odo_end - odo_start. */
export function distance(leg: Pick<Leg, "odo_start" | "odo_end">): number {
  return leg.odo_end - leg.odo_start;
}

/**
 * Claimable kilometres for one leg (brief's pure function):
 * - Home <-> Office: null (commute, not claimable).
 * - Home <-> customer (either direction, reached only after the case
 *   above): max(0, distance - homeOfficeKm), or null when that is 0.
 * - Every other leg: the full distance.
 */
export function claimable(
  leg: Pick<Leg, "from_type" | "to_type" | "odo_start" | "odo_end">,
  homeOfficeKm: number = DEFAULT_HOME_OFFICE_KM,
): number | null {
  const legDistance = distance(leg);
  const { from_type: from, to_type: to } = leg;
  if ((from === "home" && to === "office") || (from === "office" && to === "home")) {
    return null;
  }
  if (from === "home" || to === "home") {
    const excess = Math.max(0, legDistance - homeOfficeKm);
    return excess === 0 ? null : excess;
  }
  return legDistance;
}

/** Attach the computed distance and claimable values to a leg. */
export function computeLeg(leg: Leg, homeOfficeKm: number = DEFAULT_HOME_OFFICE_KM): ComputedLeg {
  return { ...leg, distance: distance(leg), claimable: claimable(leg, homeOfficeKm) };
}

/** Totals for a period (a set of legs in date/position order). */
export function periodTotals(
  legs: readonly Leg[],
  homeOfficeKm: number = DEFAULT_HOME_OFFICE_KM,
): PeriodTotals {
  let totalDistance = 0;
  let totalClaimable = 0;
  for (const leg of legs) {
    totalDistance += distance(leg);
    totalClaimable += claimable(leg, homeOfficeKm) ?? 0;
  }
  const first = legs[0];
  const last = legs[legs.length - 1];
  return {
    totalDistance,
    totalClaimable,
    totalParkingCents: sumParkingCents(legs.map((leg) => leg.parking_cents)),
    odometerStart: first ? first.odo_start : null,
    odometerEnd: last ? last.odo_end : null,
  };
}

/**
 * Complete a shortened odometer entry against the previous reading.
 * `typedDigits` is the raw digit string (leading zeros count), so "012"
 * with a previous reading of 155990 completes to 156012.
 */
export function completeOdometer(typedDigits: string, prev: number): number {
  if (typedDigits === "" || !/^\d+$/.test(typedDigits)) {
    throw new RangeError(`Odometer entry must be one or more digits, got "${typedDigits}"`);
  }
  if (!Number.isInteger(prev) || prev < 0) {
    throw new RangeError(`Previous odometer reading must be a non-negative integer, got ${prev}`);
  }
  const typed = Number.parseInt(typedDigits, 10);
  const k = typedDigits.length;
  const prevDigits = String(prev).length;
  if (k >= prevDigits) return typed;
  const factor = 10 ** k;
  let candidate = prev - (prev % factor) + typed;
  if (candidate < prev) candidate += factor;
  return candidate;
}

export type LegWarningCode = "negative-distance" | "over-150km" | "over-3x-median";

export interface LegWarning {
  code: LegWarningCode;
  message: string;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const mid = sorted[middle];
  if (mid === undefined) return 0;
  if (sorted.length % 2 === 1) return mid;
  const before = sorted[middle - 1];
  return before === undefined ? mid : (before + mid) / 2;
}

function isSamePair(
  a: Pick<Leg, "from_name" | "to_name">,
  b: Pick<Leg, "from_name" | "to_name">,
): boolean {
  return a.from_name === b.from_name && a.to_name === b.to_name;
}

/**
 * Warning checks for a leg (warn, do not block):
 * - distance under 0 km (which also means the reading is below the
 *   previous reading, since odo_start is the previous leg's odo_end),
 * - distance over 150 km,
 * - distance over 3 times the median for the same From -> To pair,
 *   when that history exists.
 */
export function legWarnings(
  leg: Pick<Leg, "from_name" | "to_name" | "odo_start" | "odo_end">,
  history: readonly Leg[] = [],
): LegWarning[] {
  const warnings: LegWarning[] = [];
  const legDistance = distance(leg);
  if (legDistance < 0) {
    warnings.push({
      code: "negative-distance",
      message: `Distance is ${legDistance} km: the odometer reading is below the previous reading.`,
    });
  }
  if (legDistance > 150) {
    warnings.push({
      code: "over-150km",
      message: `Distance is ${legDistance} km, over the 150 km warning threshold.`,
    });
  }
  const samePairDistances = history
    .filter((entry) => isSamePair(entry, leg))
    .map((entry) => distance(entry))
    .filter((value) => value >= 0);
  if (samePairDistances.length > 0) {
    const medianDistance = median(samePairDistances);
    if (medianDistance > 0 && legDistance > 3 * medianDistance) {
      warnings.push({
        code: "over-3x-median",
        message: `Distance is ${legDistance} km, over 3 times the median ${medianDistance} km for this route.`,
      });
    }
  }
  return warnings;
}

/**
 * Rebuild a chain of legs in order: every leg's odo_start becomes the
 * previous leg's odo_end (the first leg keeps its own odo_start), and
 * distance/claimable are recomputed for every leg. Used after any edit.
 */
export function recalculateChain(
  legs: readonly Leg[],
  homeOfficeKm: number = DEFAULT_HOME_OFFICE_KM,
): ComputedLeg[] {
  const result: ComputedLeg[] = [];
  let previousEnd: number | null = null;
  for (const leg of legs) {
    const chained: Leg = previousEnd === null ? { ...leg } : { ...leg, odo_start: previousEnd };
    const computed = computeLeg(chained, homeOfficeKm);
    result.push(computed);
    previousEnd = computed.odo_end;
  }
  return result;
}

/**
 * Set one leg's odo_end (by index), then rebuild the chain so the next
 * leg's odo_start follows it and both legs are recalculated.
 */
export function updateLegOdometerEnd(
  legs: readonly Leg[],
  index: number,
  newOdoEnd: number,
  homeOfficeKm: number = DEFAULT_HOME_OFFICE_KM,
): ComputedLeg[] {
  if (index < 0 || index >= legs.length) {
    throw new RangeError(`Leg index ${index} is out of range for ${legs.length} legs.`);
  }
  const edited = legs.map((leg, i) => (i === index ? { ...leg, odo_end: newOdoEnd } : { ...leg }));
  return recalculateChain(edited, homeOfficeKm);
}

/**
 * Recompute stored legs after the Home <-> Office distance changes.
 * Unlocked legs are recalculated; locked legs keep their stored
 * distance and claimable values untouched.
 */
export function applyHomeOfficeKmChange(
  legs: readonly StoredLeg[],
  newHomeOfficeKm: number,
): StoredLeg[] {
  return legs.map((leg) => {
    if (leg.locked) return { ...leg };
    const recomputed = computeLeg(leg, newHomeOfficeKm);
    return { ...leg, distance: recomputed.distance, claimable: recomputed.claimable };
  });
}
