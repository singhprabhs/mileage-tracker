import type { MileageDatabase } from "../../data/db";
import { getProfile } from "../../data/repositories/profiles";
import { computeLeg, periodTotals, type Leg, type PeriodTotals } from "../../domain";
import { formatDateLabel } from "../day/dayService";
import { loadDaysWithLegs } from "../history/historyService";

/**
 * The report model: everything a PDF, Excel or CSV report needs,
 * computed once from local data by the domain module. The file writers
 * (reportPdf / reportExcel / reportCsv) only format this model — the
 * numbers are sacred and come from src/domain, never recomputed here.
 *
 * Layout follows the brief's Reports section and the user's sample
 * spreadsheet: nine table columns, a header block with Name / Tech ID on
 * the left and the period odometer readings on the right, and — only
 * when the range contains parking — a tenth Parking ($) column and a
 * Total Parking line under the Total Claimable line.
 */

export const BASE_COLUMNS = [
  "Date",
  "From Destination",
  "From Address (full)",
  "To Destination",
  "To Address (full)",
  "Odometer Start",
  "Odometer End",
  "Distance",
  "Claimable",
] as const;

export const PARKING_COLUMN = "Parking ($)";

export interface ReportRow {
  /** Calendar date, yyyy-mm-dd (the CSV form; Excel stores a real date). */
  date: string;
  /** Display date, e.g. "Jul 02" (PDF and Excel display). */
  dateLabel: string;
  fromName: string;
  /** Full address, including the full home address (confirmed decision). */
  fromAddress: string;
  toName: string;
  toAddress: string;
  odoStart: number;
  odoEnd: number;
  distance: number;
  /** Null when the leg is not claimable — rendered blank, never 0. */
  claimable: number | null;
  /** Whole cents, or null when no parking was paid on this leg. */
  parkingCents: number | null;
}

export interface ReportModel {
  name: string;
  techId: string;
  /** Range start, yyyy-mm-dd. */
  periodStart: string;
  /** Range end, yyyy-mm-dd. */
  periodEnd: string;
  homeOfficeKm: number;
  /** First leg's odometer start in the range. */
  odometerStart: number;
  /** Last leg's odometer end in the range. */
  odometerEnd: number;
  totals: PeriodTotals;
  /** True when any leg in the range has parking: PDF/Excel add a column. */
  hasParking: boolean;
  /** Column titles in order (nine, or ten with parking). */
  columns: string[];
  rows: ReportRow[];
}

export interface ReportDayInput {
  /** Calendar date, yyyy-mm-dd. */
  date: string;
  legs: readonly Leg[];
}

export interface BuildReportModelInput {
  name: string;
  techId: string;
  homeOfficeKm: number;
  periodStart: string;
  periodEnd: string;
  /** Days in the range, in date order; each day's legs in position order. */
  days: readonly ReportDayInput[];
}

/** Pure builder: rows and totals for a set of days, via the domain module. */
export function buildReportModel(input: BuildReportModelInput): ReportModel | null {
  const rows: ReportRow[] = [];
  const allLegs: Leg[] = [];
  for (const day of input.days) {
    for (const leg of day.legs) {
      const computed = computeLeg(leg, input.homeOfficeKm);
      allLegs.push(leg);
      rows.push({
        date: day.date,
        dateLabel: formatDateLabel(day.date),
        fromName: leg.from_name,
        fromAddress: leg.from_address,
        toName: leg.to_name,
        toAddress: leg.to_address,
        odoStart: leg.odo_start,
        odoEnd: leg.odo_end,
        distance: computed.distance,
        claimable: computed.claimable,
        parkingCents: leg.parking_cents,
      });
    }
  }
  if (rows.length === 0) return null;

  const totals = periodTotals(allLegs, input.homeOfficeKm);
  const hasParking = totals.totalParkingCents > 0;
  return {
    name: input.name,
    techId: input.techId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    homeOfficeKm: input.homeOfficeKm,
    odometerStart: totals.odometerStart ?? rows[0]!.odoStart,
    odometerEnd: totals.odometerEnd ?? rows[rows.length - 1]!.odoEnd,
    totals,
    hasParking,
    columns: hasParking ? [...BASE_COLUMNS, PARKING_COLUMN] : [...BASE_COLUMNS],
    rows,
  };
}

/**
 * Load a report for a date range from the local database (the phone is
 * the source of truth — reports read local data only). Returns null when
 * the range contains no legs, so the UI can show the brief's "no data in
 * this range" message instead of generating an empty file.
 */
export async function loadReportModel(
  database: MileageDatabase,
  periodStart: string,
  periodEnd: string,
): Promise<ReportModel | null> {
  const profile = await getProfile(database);
  if (!profile) return null;
  const days = await loadDaysWithLegs(database, profile.user_id, periodStart, periodEnd);
  return buildReportModel({
    name: profile.name,
    techId: profile.tech_id,
    homeOfficeKm: profile.home_office_km,
    periodStart,
    periodEnd,
    days: days.map(({ day, legs }) => ({ date: day.date, legs })),
  });
}

/**
 * File name from the brief: mileage_<TechID>_<start>_<end>.<ext>, with
 * the dates as yyyy-mm-dd. Characters that cannot appear in a file name
 * are replaced so an unusual Tech ID can never break the download.
 */
export function reportFileName(model: ReportModel, extension: "pdf" | "xlsx" | "csv"): string {
  const techId = model.techId.replace(/[^A-Za-z0-9_-]+/g, "_") || "report";
  return `mileage_${techId}_${model.periodStart}_${model.periodEnd}.${extension}`;
}

/** Format integer cents as a plain two-decimal dollar amount, e.g. "12.50". */
export function parkingDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}
