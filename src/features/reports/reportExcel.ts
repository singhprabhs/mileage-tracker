import ExcelJS from "exceljs";
import type { ReportModel } from "./reportModel";

/**
 * Excel export (brief): one sheet reproducing the sample — the same
 * header block and columns as the PDF, with real date cells (formatted
 * mmm dd in the table, yyyy-mm-dd in the header block), Distance as the
 * formula =odo_end - odo_start, the Total Claimable (and Total Parking)
 * header values as =SUM(...) over their columns so the numbers compute
 * when the file is opened, parking stored as a number with a currency
 * format, and panes frozen under the table header.
 */

const HEADER_BLUE = "FFCFE2F3";
const BODY_BLUE = "FFE9F1FA";
const PEACH = "FFFCE5CD";
const PALE_YELLOW = "FFFFF2CC";
const BORDER_GREY = "FFAAB2BD";

const COLUMN_WIDTHS = [11, 20, 44, 20, 44, 13, 13, 10, 11];
const PARKING_WIDTH = 11;

/** yyyy-mm-dd -> a local Date (no UTC shift) for a real Excel date cell. */
export function dateFromYmd(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorders(): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: "thin", color: { argb: BORDER_GREY } };
  return { top: side, left: side, bottom: side, right: side };
}

function columnLetter(index1Based: number): string {
  return String.fromCharCode(64 + index1Based);
}

export interface ReportSheetLayout {
  /** 1-based row of the table header ("Date", "From Destination", ...). */
  headerRow: number;
  firstDataRow: number;
  lastDataRow: number;
}

/** Where the table lands on the sheet for a model (pure; used by tests). */
export function reportSheetLayout(model: ReportModel): ReportSheetLayout {
  // Header block: rows 1-3, a blank row 4, Total Claimable on row 5,
  // Total Parking on row 6 when present; the table header follows.
  const headerRow = model.hasParking ? 7 : 6;
  return {
    headerRow,
    firstDataRow: headerRow + 1,
    lastDataRow: headerRow + model.rows.length,
  };
}

export function buildReportWorkbook(model: ReportModel): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Mileage");
  const columnCount = model.columns.length;
  const valueCol = columnCount; // odometer values / totals land in the last column
  const labelCol = columnCount - 1;
  const dateCol = columnCount - 2;

  const widths = [...COLUMN_WIDTHS];
  if (model.hasParking) widths.push(PARKING_WIDTH);
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  const layout = reportSheetLayout(model);
  const odoStartCol = columnLetter(6);
  const odoEndCol = columnLetter(7);
  const claimCol = columnLetter(9);
  const parkingCol = columnLetter(10);

  const headerCell = (row: number, col: number): ExcelJS.Cell => sheet.getCell(row, col);

  // --- Header block -------------------------------------------------
  // Row 1: Name: ... period start | ODOMETER START | value
  let cell = headerCell(1, 1);
  cell.value = "Name:";
  cell.font = { bold: true };
  cell.fill = fill(HEADER_BLUE);
  cell.border = thinBorders();
  sheet.mergeCells(1, 2, 1, dateCol - 1);
  cell = headerCell(1, 2);
  cell.value = model.name;
  cell = headerCell(1, dateCol);
  cell.value = dateFromYmd(model.periodStart);
  cell.numFmt = "yyyy-mm-dd";
  cell.font = { bold: true };
  cell.fill = fill(HEADER_BLUE);
  cell.alignment = { horizontal: "center" };
  cell.border = thinBorders();
  cell = headerCell(1, labelCol);
  cell.value = "ODOMETER START";
  cell.font = { bold: true };
  cell.fill = fill(HEADER_BLUE);
  cell.alignment = { horizontal: "center" };
  cell.border = thinBorders();
  cell = headerCell(1, valueCol);
  cell.value = model.odometerStart;
  cell.font = { bold: true };
  cell.fill = fill(HEADER_BLUE);
  cell.border = thinBorders();

  // Row 2: Tech ID: ... period end | ODOMETER END | value
  cell = headerCell(2, 1);
  cell.value = "Tech ID:";
  cell.font = { bold: true };
  cell.fill = fill(HEADER_BLUE);
  cell.border = thinBorders();
  sheet.mergeCells(2, 2, 2, dateCol - 1);
  cell = headerCell(2, 2);
  cell.value = model.techId;
  cell = headerCell(2, dateCol);
  cell.value = dateFromYmd(model.periodEnd);
  cell.numFmt = "yyyy-mm-dd";
  cell.font = { bold: true };
  cell.fill = fill(HEADER_BLUE);
  cell.alignment = { horizontal: "center" };
  cell.border = thinBorders();
  cell = headerCell(2, labelCol);
  cell.value = "ODOMETER END";
  cell.font = { bold: true };
  cell.fill = fill(HEADER_BLUE);
  cell.alignment = { horizontal: "center" };
  cell.border = thinBorders();
  cell = headerCell(2, valueCol);
  cell.value = model.odometerEnd;
  cell.font = { bold: true };
  cell.fill = fill(HEADER_BLUE);
  cell.border = thinBorders();

  // Row 3: DISTANCE HOME - OFFICE (KM) | value, peach, right block.
  sheet.mergeCells(3, dateCol, 3, labelCol);
  cell = headerCell(3, dateCol);
  cell.value = "DISTANCE HOME - OFFICE (KM)";
  cell.font = { bold: true };
  cell.fill = fill(PEACH);
  cell.alignment = { horizontal: "center" };
  cell.border = thinBorders();
  cell = headerCell(3, labelCol);
  cell.fill = fill(PEACH);
  cell.border = thinBorders();
  cell = headerCell(3, valueCol);
  cell.value = model.homeOfficeKm;
  cell.font = { bold: true };
  cell.fill = fill(PEACH);
  cell.border = thinBorders();

  // Row 4 is blank in the sample. Row 5: Total Claimable, pale yellow.
  sheet.mergeCells(5, valueCol - 3, 5, labelCol);
  cell = headerCell(5, valueCol - 3);
  cell.value = "Total Claimable Mileage (KM):";
  cell.fill = fill(PALE_YELLOW);
  cell.alignment = { horizontal: "center" };
  cell.border = thinBorders();
  for (let col = valueCol - 2; col <= labelCol; col += 1) {
    const inner = headerCell(5, col);
    inner.fill = fill(PALE_YELLOW);
    inner.border = thinBorders();
  }
  cell = headerCell(5, valueCol);
  cell.value = {
    formula: `SUM(${claimCol}${layout.firstDataRow}:${claimCol}${layout.lastDataRow})`,
  };
  cell.font = { bold: true };
  cell.fill = fill(PALE_YELLOW);
  cell.border = thinBorders();

  // Row 6 (only with parking): Total Parking, directly under, same style.
  if (model.hasParking) {
    sheet.mergeCells(6, valueCol - 3, 6, labelCol);
    cell = headerCell(6, valueCol - 3);
    cell.value = "Total Parking ($):";
    cell.fill = fill(PALE_YELLOW);
    cell.alignment = { horizontal: "center" };
    cell.border = thinBorders();
    for (let col = valueCol - 2; col <= labelCol; col += 1) {
      const inner = headerCell(6, col);
      inner.fill = fill(PALE_YELLOW);
      inner.border = thinBorders();
    }
    cell = headerCell(6, valueCol);
    cell.value = {
      formula: `SUM(${parkingCol}${layout.firstDataRow}:${parkingCol}${layout.lastDataRow})`,
    };
    cell.numFmt = "0.00";
    cell.font = { bold: true };
    cell.fill = fill(PALE_YELLOW);
    cell.border = thinBorders();
  }

  // --- Trip table ---------------------------------------------------
  const headerRow = sheet.getRow(layout.headerRow);
  model.columns.forEach((title, index) => {
    const headerTitleCell = headerRow.getCell(index + 1);
    headerTitleCell.value = title;
    headerTitleCell.font = { bold: true };
    headerTitleCell.fill = fill(HEADER_BLUE);
    headerTitleCell.alignment = { horizontal: "center", vertical: "middle" };
    headerTitleCell.border = thinBorders();
  });

  model.rows.forEach((row, rowIndex) => {
    const sheetRowNumber = layout.firstDataRow + rowIndex;
    const sheetRow = sheet.getRow(sheetRowNumber);
    const values: (string | number | Date | null)[] = [
      dateFromYmd(row.date),
      row.fromName,
      row.fromAddress,
      row.toName,
      row.toAddress,
      row.odoStart,
      row.odoEnd,
      null, // Distance: formula below.
      row.claimable,
    ];
    if (model.hasParking) {
      values.push(row.parkingCents === null ? null : row.parkingCents / 100);
    }
    values.forEach((value, index) => {
      if (value === null) return;
      sheetRow.getCell(index + 1).value = value;
    });
    const distanceCell = sheetRow.getCell(8);
    distanceCell.value = {
      formula: `${odoEndCol}${sheetRowNumber}-${odoStartCol}${sheetRowNumber}`,
    };
    sheetRow.getCell(1).numFmt = "mmm dd";
    if (model.hasParking && row.parkingCents !== null) {
      sheetRow.getCell(10).numFmt = '"$"#,##0.00';
    }
    for (let col = 1; col <= columnCount; col += 1) {
      const bodyCell = sheetRow.getCell(col);
      bodyCell.fill = fill(BODY_BLUE);
      bodyCell.border = thinBorders();
      bodyCell.alignment = {
        horizontal: col >= 6 ? "right" : col === 1 ? "center" : "left",
        vertical: "top",
        wrapText: col === 3 || col === 5,
      };
    }
  });

  // Freeze panes under the table header.
  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: layout.headerRow }];
  return workbook;
}

export async function reportExcelBlob(model: ReportModel): Promise<Blob> {
  const workbook = buildReportWorkbook(model);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
