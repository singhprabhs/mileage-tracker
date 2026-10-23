import { parkingCentsFromKeypad } from "../../domain";

/** State of the parking row: raw keypad digits plus the optional note. */
export interface ParkingValue {
  /** Raw keypad digits (cents-first); "" means nothing typed yet. */
  digits: string;
  note: string;
}

export const EMPTY_PARKING: ParkingValue = { digits: "", note: "" };

/** The parking amount in cents for a ParkingValue, or null for "no parking". */
export function parkingCentsOf(value: ParkingValue): number | null {
  if (value.digits.trim() === "") return null;
  const cents = parkingCentsFromKeypad(value.digits.trim());
  return cents === 0 ? null : cents;
}
