import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { parkingDollars, type ReportModel } from "./reportModel";

/**
 * PDF export (brief): landscape Letter, the sample's header block on
 * the first page only, the table header repeated on every page, and a
 * "Page x of y" footer. Header colours approximate the sample: light
 * blue labels, a peach DISTANCE HOME - OFFICE row, a pale yellow
 * Total Claimable (and Total Parking) row, light blue table header.
 */

type Rgb = [number, number, number];

const HEADER_BLUE: Rgb = [207, 226, 243];
const BODY_BLUE: Rgb = [233, 241, 250];
const PEACH: Rgb = [252, 229, 205];
const PALE_YELLOW: Rgb = [255, 242, 204];
const BORDER_GREY: Rgb = [170, 178, 189];
const TEXT_DARK: Rgb = [0, 0, 0];

/**
 * Column widths (pt) on a 792 pt landscape Letter page, margins
 * included; both variants sum to the 732 pt content width. The
 * Claimable column is wide enough for its header at the table's 9 pt
 * bold (measured, not estimated) so it never wraps mid-word; the
 * address columns absorb the difference.
 */
export function pdfColumnWidths(hasParking: boolean): number[] {
  return hasParking
    ? [40, 72, 139, 72, 139, 56, 56, 48, 54, 56]
    : [42, 78, 155, 78, 155, 60, 60, 50, 54];
}

export interface PdfTableData {
  head: string[];
  body: string[][];
}

/** The autotable input for a model — pure, so tests can assert it exactly. */
export function buildPdfTableData(model: ReportModel): PdfTableData {
  const body = model.rows.map((row) => {
    const cells = [
      row.dateLabel,
      row.fromName,
      row.fromAddress,
      row.toName,
      row.toAddress,
      String(row.odoStart),
      String(row.odoEnd),
      String(row.distance),
      row.claimable === null ? "" : String(row.claimable),
    ];
    if (model.hasParking) {
      cells.push(row.parkingCents === null ? "" : parkingDollars(row.parkingCents));
    }
    return cells;
  });
  return { head: [...model.columns], body };
}

const MARGIN_X = 30;
const PAGE_WIDTH = 792; // Letter landscape, pt
const PAGE_HEIGHT = 612;
const HEADER_ROW_HEIGHT = 17;

/** Header-block geometry: measured from the actual font, never fixed. */
const HEADER_FONT_MAX = 10.5;
const HEADER_FONT_MIN = 8;
const HEADER_FONT_STEP = 0.5;
const HEADER_PAD = 6; // horizontal padding inside a header cell, each side
const HEADER_MAX_BLOCK_WIDTH = 430; // leaves the Name/Tech ID block clear
const HEADER_MIN_VALUE_WIDTH = 54;

const ODOMETER_LABELS = ["ODOMETER START", "ODOMETER END"] as const;
const DISTANCE_LABEL = "DISTANCE HOME - OFFICE (KM)";
const TOTAL_CLAIMABLE_LABEL = "Total Claimable Mileage (KM):";
const TOTAL_PARKING_LABEL = "Total Parking ($):";

export interface PdfHeaderLayout {
  fontSize: number;
  /** Right edge of the header block: the page's right margin. */
  right: number;
  dateX: number;
  labelX: number;
  valueX: number;
  dateWidth: number;
  labelWidth: number;
  valueWidth: number;
}

function measuredWidth(doc: jsPDF, text: string, fontSize: number, bold: boolean): number {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  return doc.getTextWidth(text);
}

/**
 * Lay out the header block's right-hand columns — [period date | label |
 * value] — anchored to the page's right margin and sized by measuring
 * every string with the real font, so a label can never overflow its
 * cell and collide with its neighbour (the layout this replaces reused
 * the table's last three columns, which are far too narrow, and the
 * labels overprinted the dates and values). The DISTANCE and totals
 * labels are centred over the date+label span, so that span is widened
 * to fit the widest of them; if the whole block would grow past
 * HEADER_MAX_BLOCK_WIDTH, the header font shrinks a step and the
 * measurement repeats, down to a floor size.
 */
export function computePdfHeaderLayout(doc: jsPDF, model: ReportModel): PdfHeaderLayout {
  const right = PAGE_WIDTH - MARGIN_X;
  const valueStrings = [
    String(model.odometerStart),
    String(model.odometerEnd),
    String(model.homeOfficeKm),
    String(model.totals.totalClaimable),
  ];
  if (model.hasParking) valueStrings.push(parkingDollars(model.totals.totalParkingCents));

  let fontSize = HEADER_FONT_MAX;
  for (;;) {
    const dateWidth =
      Math.max(
        measuredWidth(doc, model.periodStart, fontSize, true),
        measuredWidth(doc, model.periodEnd, fontSize, true),
      ) +
      2 * HEADER_PAD;
    let labelWidth =
      Math.max(...ODOMETER_LABELS.map((label) => measuredWidth(doc, label, fontSize, true))) +
      2 * HEADER_PAD;
    const valueWidth = Math.max(
      HEADER_MIN_VALUE_WIDTH,
      Math.max(...valueStrings.map((value) => measuredWidth(doc, value, fontSize, true))) +
        2 * HEADER_PAD,
    );
    // Labels centred over the date+label span: the span must fit the
    // widest of them, so grow the label column by any deficit.
    const spanNeeded =
      Math.max(
        measuredWidth(doc, DISTANCE_LABEL, fontSize, true),
        measuredWidth(doc, TOTAL_CLAIMABLE_LABEL, fontSize, false),
        model.hasParking ? measuredWidth(doc, TOTAL_PARKING_LABEL, fontSize, false) : 0,
      ) +
      2 * HEADER_PAD;
    if (dateWidth + labelWidth < spanNeeded) labelWidth = spanNeeded - dateWidth;

    const blockWidth = dateWidth + labelWidth + valueWidth;
    if (blockWidth <= HEADER_MAX_BLOCK_WIDTH || fontSize <= HEADER_FONT_MIN) {
      const valueX = right - valueWidth;
      const labelX = valueX - labelWidth;
      const dateX = labelX - dateWidth;
      return { fontSize, right, dateX, labelX, valueX, dateWidth, labelWidth, valueWidth };
    }
    fontSize -= HEADER_FONT_STEP;
  }
}

function fillRect(doc: jsPDF, x: number, y: number, w: number, h: number, color: Rgb): void {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.setDrawColor(BORDER_GREY[0], BORDER_GREY[1], BORDER_GREY[2]);
  doc.setLineWidth(0.5);
  doc.rect(x, y, w, h, "FD");
}

function cellText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options: { align?: "left" | "center" | "right"; bold?: boolean; pad?: number } = {},
): void {
  doc.setFont("helvetica", options.bold ? "bold" : "normal");
  doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
  const align = options.align ?? "left";
  const pad = options.pad ?? 4;
  const textX = align === "left" ? x + pad : align === "right" ? x - pad : x;
  doc.text(text, textX, y, { align });
}

/**
 * Draw the sample's header block at the top of page 1. The left side
 * keeps the Name / Tech ID label cells; the right side uses the
 * measured layout from computePdfHeaderLayout — three real columns
 * (period date | label | value) like the sample, with the DISTANCE
 * and totals rows spanning date+label and their values in the value
 * column. Returns the y position just below the block, where the
 * trip table starts.
 */
function drawHeaderBlock(doc: jsPDF, model: ReportModel): number {
  const layout = computePdfHeaderLayout(doc, model);
  const { dateX, labelX, valueX, dateWidth, labelWidth, valueWidth, right } = layout;
  const left = MARGIN_X;
  // The Name / Tech ID label cell is also sized from the measured text:
  // at the header font "Tech ID:" is wider than the table's Date
  // column it used to borrow, and its last character kissed the value.
  const nameLabelWidth =
    Math.max(
      measuredWidth(doc, "Name:", layout.fontSize, true),
      measuredWidth(doc, "Tech ID:", layout.fontSize, true),
    ) +
    2 * HEADER_PAD;
  const nameValueX = left + nameLabelWidth;
  let y = 30;
  const textY = () => y + HEADER_ROW_HEIGHT - 5.5;

  doc.setFontSize(layout.fontSize);

  // Row 1: Name: / period start + ODOMETER START.
  fillRect(doc, left, y, nameLabelWidth, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, "Name:", left, textY(), { bold: true, pad: HEADER_PAD });
  cellText(doc, model.name, nameValueX, textY());
  fillRect(doc, dateX, y, dateWidth, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, model.periodStart, dateX + dateWidth / 2, textY(), { align: "center", bold: true });
  fillRect(doc, labelX, y, labelWidth, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, ODOMETER_LABELS[0], labelX + labelWidth / 2, textY(), {
    align: "center",
    bold: true,
  });
  fillRect(doc, valueX, y, valueWidth, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, String(model.odometerStart), valueX + HEADER_PAD, textY(), { bold: true });
  y += HEADER_ROW_HEIGHT;

  // Row 2: Tech ID: / period end + ODOMETER END.
  fillRect(doc, left, y, nameLabelWidth, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, "Tech ID:", left, textY(), { bold: true, pad: HEADER_PAD });
  cellText(doc, model.techId, nameValueX, textY());
  fillRect(doc, dateX, y, dateWidth, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, model.periodEnd, dateX + dateWidth / 2, textY(), { align: "center", bold: true });
  fillRect(doc, labelX, y, labelWidth, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, ODOMETER_LABELS[1], labelX + labelWidth / 2, textY(), {
    align: "center",
    bold: true,
  });
  fillRect(doc, valueX, y, valueWidth, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, String(model.odometerEnd), valueX + HEADER_PAD, textY(), { bold: true });
  y += HEADER_ROW_HEIGHT;

  // Row 3: DISTANCE HOME - OFFICE (KM), peach, spanning date+label,
  // value in the value column — as in the sample.
  fillRect(doc, dateX, y, right - dateX, HEADER_ROW_HEIGHT, PEACH);
  cellText(doc, DISTANCE_LABEL, dateX + (valueX - dateX) / 2, textY(), {
    align: "center",
    bold: true,
  });
  cellText(doc, String(model.homeOfficeKm), valueX + HEADER_PAD, textY(), { bold: true });
  y += HEADER_ROW_HEIGHT + 8;

  // Row 4: Total Claimable Mileage (KM), pale yellow, same span.
  fillRect(doc, dateX, y, right - dateX, HEADER_ROW_HEIGHT, PALE_YELLOW);
  cellText(doc, TOTAL_CLAIMABLE_LABEL, dateX + (valueX - dateX) / 2, textY(), {
    align: "center",
  });
  cellText(doc, String(model.totals.totalClaimable), valueX + HEADER_PAD, textY(), { bold: true });
  y += HEADER_ROW_HEIGHT;

  // Row 5 (only with parking): Total Parking ($), same pale yellow
  // style, directly under the Total Claimable line.
  if (model.hasParking) {
    fillRect(doc, dateX, y, right - dateX, HEADER_ROW_HEIGHT, PALE_YELLOW);
    cellText(doc, TOTAL_PARKING_LABEL, dateX + (valueX - dateX) / 2, textY(), {
      align: "center",
    });
    cellText(doc, parkingDollars(model.totals.totalParkingCents), valueX + HEADER_PAD, textY(), {
      bold: true,
    });
    y += HEADER_ROW_HEIGHT;
  }

  return y + 8;
}

/** Build the PDF document for a report model. */
export function buildReportPdf(model: ReportModel): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const widths = pdfColumnWidths(model.hasParking);
  const table = buildPdfTableData(model);
  const startY = drawHeaderBlock(doc, model);

  const columnStyles: Record<number, { cellWidth: number; halign: "left" | "right" | "center" }> =
    {};
  widths.forEach((width, index) => {
    // Text columns left, the Date centred, all numbers right-aligned.
    const halign = index === 0 ? "center" : index >= 5 ? "right" : "left";
    columnStyles[index] = { cellWidth: width, halign };
  });

  autoTable(doc, {
    head: [table.head],
    body: table.body,
    startY,
    margin: { left: MARGIN_X, right: PAGE_WIDTH - MARGIN_X - widths.reduce((a, b) => a + b, 0) },
    columnStyles,
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 3.5,
      textColor: TEXT_DARK,
      lineColor: BORDER_GREY,
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: HEADER_BLUE,
      textColor: TEXT_DARK,
      fontStyle: "bold",
      halign: "center",
    },
    bodyStyles: { fillColor: BODY_BLUE },
  });

  // Footer on every page: Page x of y (total known only after layout).
  const pageCount = doc.getNumberOfPages();
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 110, 110);
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.text(`Page ${page} of ${pageCount}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 16, { align: "center" });
  }
  return doc;
}

export function reportPdfBlob(model: ReportModel): Blob {
  return buildReportPdf(model).output("blob");
}
