import type { LocationType } from "./types";

/** Parking above this amount (in cents) asks for confirmation: $100.00. */
export const PARKING_CONFIRMATION_THRESHOLD_CENTS = 10_000;

/** Format integer cents for display, e.g. 2050 -> "$20.50", 5 -> "$0.05". */
export function formatParking(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`Parking amount must be whole cents, got ${cents}`);
  }
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  return `${sign}$${dollars}.${String(remainder).padStart(2, "0")}`;
}

/**
 * Sum parking amounts in integer cents. Null means "no parking" and counts
 * as 0. All arithmetic is on integers, so 1250 + 800 is exactly 2050.
 */
export function sumParkingCents(amounts: readonly (number | null)[]): number {
  let total = 0;
  for (const amount of amounts) {
    if (amount === null) continue;
    if (!Number.isInteger(amount)) {
      throw new RangeError(`Parking amount must be whole cents, got ${amount}`);
    }
    total += amount;
  }
  return total;
}

/**
 * Parking keypad entry is cents-first: the digit string is the amount in
 * cents, so "1250" -> 1250 cents ($12.50) and "5" -> 5 cents ($0.05).
 * An empty string means no entry yet and returns 0.
 */
export function parkingCentsFromKeypad(typedDigits: string): number {
  if (typedDigits === "") return 0;
  if (!/^\d+$/.test(typedDigits)) {
    throw new RangeError(`Parking keypad input must be digits only, got "${typedDigits}"`);
  }
  return Number.parseInt(typedDigits, 10);
}

/** Parking is offered only on legs ending at a customer or the Office. */
export function canHaveParking(toType: LocationType): boolean {
  return toType !== "home";
}

export interface ParkingValidation {
  valid: boolean;
  /** True when the amount is over $100.00 and needs confirmation before saving. */
  needsConfirmation: boolean;
  error: string | null;
}

/**
 * Validate a parking amount for a leg ending at `toType`.
 * Blank (null) or zero means no parking and is always valid.
 * Negative and non-integer amounts are rejected, as is any parking on a
 * leg that ends at Home. Amounts over $100.00 are valid but flagged
 * with `needsConfirmation`.
 */
export function validateParking(
  parkingCents: number | null,
  toType: LocationType,
): ParkingValidation {
  if (parkingCents === null || parkingCents === 0) {
    return { valid: true, needsConfirmation: false, error: null };
  }
  if (!Number.isInteger(parkingCents)) {
    return {
      valid: false,
      needsConfirmation: false,
      error: "Parking amount must be a whole number of cents.",
    };
  }
  if (parkingCents < 0) {
    return { valid: false, needsConfirmation: false, error: "Parking amount cannot be negative." };
  }
  if (!canHaveParking(toType)) {
    return {
      valid: false,
      needsConfirmation: false,
      error: "Parking cannot be recorded on a leg that ends at Home.",
    };
  }
  return {
    valid: true,
    needsConfirmation: parkingCents > PARKING_CONFIRMATION_THRESHOLD_CENTS,
    error: null,
  };
}
