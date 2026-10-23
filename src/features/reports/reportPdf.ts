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

/** Column widths (pt) on a 792 pt landscape Letter page, margins included. */
export function pdfColumnWidths(hasParking: boolean): number[] {
  return hasParking
    ? [42, 74, 140, 74, 140, 58, 58, 44, 44, 58]
    : [44, 80, 156, 80, 156, 62, 62, 46, 46];
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

function columnEdges(widths: number[]): number[] {
  const edges = [MARGIN_X];
  for (const width of widths) edges.push(edges[edges.length - 1]! + width);
  return edges;
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
 * Draw the sample's header block at the top of page 1. Returns the y
 * position just below it, where the trip table starts.
 */
function drawHeaderBlock(doc: jsPDF, model: ReportModel, widths: number[]): number {
  const edges = columnEdges(widths);
  const n = widths.length;
  const left = edges[0]!;
  const right = edges[n]!;
  // The right-hand block sits over the last three columns, like the sample.
  const dateX = edges[n - 3]!;
  const labelX = edges[n - 2]!;
  const valueX = edges[n - 1]!;
  let y = 30;
  const textY = () => y + HEADER_ROW_HEIGHT - 5.5;

  doc.setFontSize(10.5);

  // Row 1: Name: / period start + ODOMETER START.
  fillRect(doc, left, y, widths[0]!, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, "Name:", left, textY(), { bold: true });
  cellText(doc, model.name, edges[1]!, textY());
  fillRect(doc, dateX, y, widths[n - 3]!, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, model.periodStart, dateX + widths[n - 3]! / 2, textY(), {
    align: "center",
    bold: true,
  });
  fillRect(doc, labelX, y, widths[n - 2]!, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, "ODOMETER START", labelX + widths[n - 2]! / 2, textY(), {
    align: "center",
    bold: true,
  });
  fillRect(doc, valueX, y, widths[n - 1]!, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, String(model.odometerStart), valueX + 6, textY(), { bold: true });
  y += HEADER_ROW_HEIGHT;

  // Row 2: Tech ID: / period end + ODOMETER END.
  fillRect(doc, left, y, widths[0]!, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, "Tech ID:", left, textY(), { bold: true });
  cellText(doc, model.techId, edges[1]!, textY());
  fillRect(doc, dateX, y, widths[n - 3]!, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, model.periodEnd, dateX + widths[n - 3]! / 2, textY(), {
    align: "center",
    bold: true,
  });
  fillRect(doc, labelX, y, widths[n - 2]!, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, "ODOMETER END", labelX + widths[n - 2]! / 2, textY(), {
    align: "center",
    bold: true,
  });
  fillRect(doc, valueX, y, widths[n - 1]!, HEADER_ROW_HEIGHT, HEADER_BLUE);
  cellText(doc, String(model.odometerEnd), valueX + 6, textY(), { bold: true });
  y += HEADER_ROW_HEIGHT;

  // Row 3: DISTANCE HOME - OFFICE (KM), peach, right block only.
  fillRect(doc, dateX, y, right - dateX, HEADER_ROW_HEIGHT, PEACH);
  cellText(doc, "DISTANCE HOME - OFFICE (KM)", dateX + (valueX - dateX) / 2, textY(), {
    align: "center",
    bold: true,
  });
  cellText(doc, String(model.homeOfficeKm), valueX + 6, textY(), { bold: true });
  y += HEADER_ROW_HEIGHT + 8;

  // Row 4: Total Claimable Mileage (KM), pale yellow.
  const totalLabelX = edges[n - 4]!;
  fillRect(doc, totalLabelX, y, right - totalLabelX, HEADER_ROW_HEIGHT, PALE_YELLOW);
  cellText(doc, "Total Claimable Mileage (KM):", totalLabelX + (valueX - totalLabelX) / 2, textY(), {
    align: "center",
  });
  cellText(doc, String(model.totals.totalClaimable), valueX + 6, textY(), { bold: true });
  y += HEADER_ROW_HEIGHT;

  // Row 5 (only with parking): Total Parking ($), same pale yellow style,
  // directly under the Total Claimable line.
  if (model.hasParking) {
    fillRect(doc, totalLabelX, y, right - totalLabelX, HEADER_ROW_HEIGHT, PALE_YELLOW);
    cellText(doc, "Total Parking ($):", totalLabelX + (valueX - totalLabelX) / 2, textY(), {
      align: "center",
    });
    cellText(doc, parkingDollars(model.totals.totalParkingCents), valueX + 6, textY(), {
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
  const startY = drawHeaderBlock(doc, model, widths);

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
