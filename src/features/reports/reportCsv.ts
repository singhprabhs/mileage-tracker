import { BASE_COLUMNS, PARKING_COLUMN, parkingDollars, type ReportModel } from "./reportModel";

/**
 * CSV export (brief): the nine table columns plus a final Parking
 * column — always present in CSV, even when the range has no parking —
 * one header row, UTF-8 with a byte order mark, dates as yyyy-mm-dd,
 * for reuse in other tools. Claimable is empty (not 0) when a leg is
 * not claimable; parking is a plain decimal like 12.50, empty when none.
 */

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildReportCsv(model: ReportModel): string {
  const header = [...BASE_COLUMNS, PARKING_COLUMN];
  const lines: string[] = [header.map(csvField).join(",")];
  for (const row of model.rows) {
    const fields = [
      row.date,
      row.fromName,
      row.fromAddress,
      row.toName,
      row.toAddress,
      String(row.odoStart),
      String(row.odoEnd),
      String(row.distance),
      row.claimable === null ? "" : String(row.claimable),
      row.parkingCents === null ? "" : parkingDollars(row.parkingCents),
    ];
    lines.push(fields.map(csvField).join(","));
  }
  // \uFEFF is the UTF-8 byte order mark, so spreadsheet tools open
  // the file with the right encoding.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function reportCsvBlob(model: ReportModel): Blob {
  return new Blob([buildReportCsv(model)], { type: "text/csv;charset=utf-8" });
}
