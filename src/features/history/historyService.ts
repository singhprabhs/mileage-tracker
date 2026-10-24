import type { MileageDatabase } from "../../data/db";
import { listDays, listLegsByDay } from "../../data/repositories/days";
import { getProfile } from "../../data/repositories/profiles";
import type { DayRecord, LegRecord } from "../../data/types";
import { periodTotals, type Leg, type PeriodTotals } from "../../domain";
import { toLocalDateString } from "../day/dayService";

/**
 * History data: days in a date range with per-day and period totals.
 * All arithmetic goes through the domain module (periodTotals); this
 * module only loads local rows and shapes them for the screen.
 */

export interface DayWithLegs {
  day: DayRecord;
  legs: LegRecord[];
}

export interface HistoryDay {
  day: DayRecord;
  totals: PeriodTotals;
  /** The day's legs in driving order — the History day cards expand
   * in place to show them (UI Polish Phase 4); totals are unchanged. */
  legs: LegRecord[];
}

export interface HistoryResult {
  /** Days in range, newest first (display order). */
  days: HistoryDay[];
  /** Totals across the whole range. */
  totals: PeriodTotals;
  /** True when any day in the range has parking. */
  hasParking: boolean;
}

export interface DateRange {
  /** yyyy-mm-dd */
  start: string;
  /** yyyy-mm-dd */
  end: string;
}

/** The brief's History default: first to last day of the current month. */
export function currentMonthRange(now: Date = new Date()): DateRange {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toLocalDateString(first), end: toLocalDateString(last) };
}

/** The full calendar month before the current one (period chip). */
export function lastMonthRange(now: Date = new Date()): DateRange {
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start: toLocalDateString(first), end: toLocalDateString(last) };
}

/**
 * The Monday–Sunday week containing `now` (UI Polish Phase 6: the
 * running week totals on Today use the same loadHistory aggregation
 * as the History screen, so the two can never disagree).
 */
export function weekRange(now: Date = new Date()): DateRange {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return { start: toLocalDateString(monday), end: toLocalDateString(sunday) };
}

/**
 * Non-deleted days in [start, end] (inclusive) with their legs, in date
 * order (oldest first) and position order within each day — the order
 * reports and period totals expect.
 */
export async function loadDaysWithLegs(
  database: MileageDatabase,
  userId: string,
  start: string,
  end: string,
): Promise<DayWithLegs[]> {
  const all = await listDays(database, userId);
  const inRange = all
    .filter((day) => day.date >= start && day.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
  const result: DayWithLegs[] = [];
  for (const day of inRange) {
    result.push({ day, legs: await listLegsByDay(database, day.id) });
  }
  return result;
}

/** Per-day totals plus period totals for the History screen. */
export async function loadHistory(
  database: MileageDatabase,
  start: string,
  end: string,
): Promise<HistoryResult> {
  const profile = await getProfile(database);
  if (!profile) throw new Error("Profile setup has not been completed yet.");
  const homeOfficeKm = profile.home_office_km;
  const daysWithLegs = await loadDaysWithLegs(database, profile.user_id, start, end);

  const days: HistoryDay[] = daysWithLegs.map(({ day, legs }) => ({
    day,
    totals: periodTotals(legs, homeOfficeKm),
    legs,
  }));
  const allLegs: Leg[] = daysWithLegs.flatMap(({ legs }) => legs);
  const totals = periodTotals(allLegs, homeOfficeKm);
  return {
    // Newest first for display; totals above were computed oldest first.
    days: [...days].reverse(),
    totals,
    hasParking: totals.totalParkingCents > 0,
  };
}
