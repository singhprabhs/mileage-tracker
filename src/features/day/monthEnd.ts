import type { DateRange } from "../history/historyService";

/**
 * Month-end card model (UI Polish Phase 6, from the brief's
 * Suggested Improvements: "Month-end card on Today"). Pure decision
 * logic — Today feeds it the month's closed-day aggregates and the
 * stored dismissal, and renders whatever comes back.
 *
 * Windows:
 * - The last three days of a month (the final day, the day before,
 *   and the day before that): a card for the CURRENT month, shown
 *   once the month has at least one closed day.
 * - The first three days of a month: a card for the PREVIOUS month,
 *   shown when it has at least one closed day and some claimable
 *   kilometres — there is a report worth sending.
 * Dismissal is remembered per month: the stored key names the month
 * the dismissed card was about, so next month's card still appears.
 */

/** Closed-day figures for one calendar month. */
export interface MonthAggregate {
  closedDays: number;
  claimableKm: number;
}

export interface MonthEndCardModel {
  /** "2026-10" — the month the card is about (and the dismissal value). */
  monthKey: string;
  /** The full month, for pre-setting History & Reports. */
  range: DateRange;
  /** "October ends tomorrow" / "October has ended". */
  headline: string;
  /** The claimable figure, in words. */
  detail: string;
  /** "See October's report". */
  actionLabel: string;
}

/** localStorage key whose VALUE is the dismissed card's monthKey. */
export const MONTH_END_DISMISSED_KEY = "monthEndDismissed";

const MONTH_NAMES_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Full weekday name for a calendar date, computed in UTC so it can
    never shift with the local timezone (same rule as dayService). */
function weekdayNameLong(year: number, monthIndex: number, day: number): string {
  return WEEKDAY_NAMES_LONG[new Date(Date.UTC(year, monthIndex, day)).getUTCDay()] ?? "";
}

function monthModel(
  year: number,
  monthIndex: number,
  headline: string,
  detail: string,
): MonthEndCardModel {
  const name = MONTH_NAMES_LONG[monthIndex] ?? "";
  return {
    monthKey: `${year}-${pad(monthIndex + 1)}`,
    range: {
      start: isoDate(year, monthIndex, 1),
      end: isoDate(year, monthIndex, daysInMonth(year, monthIndex)),
    },
    headline,
    detail,
    actionLabel: `See ${name}'s report`,
  };
}

/**
 * The card to show on Today, or null. `dismissedMonthKey` is the
 * stored value of MONTH_END_DISMISSED_KEY (null when never dismissed).
 */
export function monthEndCard(
  todayIso: string,
  current: MonthAggregate,
  previous: MonthAggregate,
  dismissedMonthKey: string | null,
): MonthEndCardModel | null {
  const parts = todayIso.split("-").map(Number);
  const year = parts[0] ?? 0;
  const monthIndex = (parts[1] ?? 1) - 1;
  const day = parts[2] ?? 1;
  const monthName = MONTH_NAMES_LONG[monthIndex] ?? "";

  // Window 1: the month's last three days.
  const lastDay = daysInMonth(year, monthIndex);
  const daysLeft = lastDay - day;
  if (daysLeft <= 2 && current.closedDays >= 1) {
    const model = monthModel(
      year,
      monthIndex,
      daysLeft === 0
        ? `${monthName} ends today`
        : daysLeft === 1
          ? `${monthName} ends tomorrow`
          : `${monthName} ends ${weekdayNameLong(year, monthIndex, lastDay)}`,
      `${current.claimableKm} km claimable this month.`,
    );
    return dismissedMonthKey === model.monthKey ? null : model;
  }

  // Window 2: the first three days of the month, for the month just ended.
  if (day <= 3 && previous.closedDays >= 1 && previous.claimableKm > 0) {
    const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
    const prevYear = monthIndex === 0 ? year - 1 : year;
    const prevName = MONTH_NAMES_LONG[prevMonthIndex] ?? "";
    const model = monthModel(
      prevYear,
      prevMonthIndex,
      `${prevName} has ended`,
      `${previous.claimableKm} km claimable. Send the report when you're ready.`,
    );
    return dismissedMonthKey === model.monthKey ? null : model;
  }

  return null;
}
