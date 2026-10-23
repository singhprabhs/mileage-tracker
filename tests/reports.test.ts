import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { MileageDatabase } from "../src/data/db";
import { addLegs, closeDay, createDay } from "../src/data/repositories/days";
import { saveProfileWithLocations } from "../src/data/repositories/profiles";
import {
  BASE_COLUMNS,
  PARKING_COLUMN,
  loadReportModel,
  reportFileName,
} from "../src/features/reports/reportModel";
import { buildReportCsv } from "../src/features/reports/reportCsv";
import { buildPdfTableData, buildReportPdf } from "../src/features/reports/reportPdf";
import {
  buildReportWorkbook,
  dateFromYmd,
  reportSheetLayout,
} from "../src/features/reports/reportExcel";
import { fixtureA, fixtureB, fixtureC } from "./fixtures";

let counter = 0;
function freshDb(): MileageDatabase {
  counter += 1;
  return new MileageDatabase(`mileage-reports-test-${counter}-${Date.now()}`);
}

const USER_ID = "11111111-1111-4111-8111-111111111111";

const PROFILE_INPUT = {
  name: "Test Person",
  tech_id: "EMP42",
  home_address: "1 Example Home Street, Vancouver, BC",
  home_office_km: 23,
  office_name: "Canon",
  office_address: "10851 Shellbridge Way, Richmond, BC",
};

async function seedDay(
  database: MileageDatabase,
  date: string,
  legs: typeof fixtureA,
  startOdometer: number,
  endOdometer: number,
): Promise<void> {
  const day = await createDay(database, USER_ID, { date, start_odometer: startOdometer });
  await addLegs(database, day.id, USER_ID, legs, 23);
  await closeDay(database, day.id, endOdometer);
}

/** Fixture A (Jul 02) + Fixture B (Jul 03), the brief's sample period. */
async function seedPeriodAB(database: MileageDatabase): Promise<void> {
  await saveProfileWithLocations(database, PROFILE_INPUT, USER_ID);
  await seedDay(database, "2026-07-02", fixtureA, 155301, 155386);
  await seedDay(database, "2026-07-03", fixtureB, 155386, 155470);
}

/** Fixture C: Fixture A with parking, on Jul 02 only. */
async function seedFixtureC(database: MileageDatabase): Promise<void> {
  await saveProfileWithLocations(database, PROFILE_INPUT, USER_ID);
  await seedDay(database, "2026-07-02", fixtureC, 155301, 155386);
}

describe("report model (Fixtures A + B)", () => {
  it("matches the sample's header values, columns, rows and totals", async () => {
    const database = freshDb();
    await seedPeriodAB(database);
    const model = await loadReportModel(database, "2026-07-02", "2026-07-03");
    expect(model).not.toBeNull();
    if (!model) return;

    expect(model.name).toBe("Test Person");
    expect(model.techId).toBe("EMP42");
    expect(model.homeOfficeKm).toBe(23);
    expect(model.odometerStart).toBe(155301);
    expect(model.odometerEnd).toBe(155470);
    expect(model.totals.totalDistance).toBe(169);
    expect(model.totals.totalClaimable).toBe(74);
    expect(model.totals.totalParkingCents).toBe(0);
    expect(model.hasParking).toBe(false);
    expect(model.columns).toEqual([...BASE_COLUMNS]);
    expect(model.rows).toHaveLength(7);

    expect(model.rows[0]).toEqual({
      date: "2026-07-02",
      dateLabel: "Jul 02",
      fromName: "Home",
      // The full home address is shown, per the confirmed decision.
      fromAddress: "1 Example Home Street, Vancouver, BC",
      toName: "Canon",
      toAddress: "10851 Shellbridge Way, Richmond, BC",
      odoStart: 155301,
      odoEnd: 155325,
      distance: 24,
      claimable: null, // commute: blank, not 0
      parkingCents: null,
    });
    expect(model.rows[1]?.claimable).toBe(14);
    expect(model.rows[1]?.fromAddress).toBe("10851 Shellbridge Way, Richmond, BC");
    expect(model.rows[4]?.claimable).toBeNull(); // Canon -> Home commute
    expect(model.rows[5]?.dateLabel).toBe("Jul 03");
    expect(model.rows[5]?.claimable).toBe(17);
    expect(model.rows[6]?.claimable).toBe(21);
  });

  it("uses the brief's file name pattern", async () => {
    const database = freshDb();
    await seedPeriodAB(database);
    const model = await loadReportModel(database, "2026-07-02", "2026-07-03");
    expect(model).not.toBeNull();
    if (!model) return;
    expect(reportFileName(model, "pdf")).toBe("mileage_EMP42_2026-07-02_2026-07-03.pdf");
    expect(reportFileName(model, "xlsx")).toBe("mileage_EMP42_2026-07-02_2026-07-03.xlsx");
    expect(reportFileName(model, "csv")).toBe("mileage_EMP42_2026-07-02_2026-07-03.csv");
  });

  it("returns null for an empty range instead of an empty report", async () => {
    const database = freshDb();
    await seedPeriodAB(database);
    expect(await loadReportModel(database, "2026-08-01", "2026-08-31")).toBeNull();
  });
});

describe("CSV report", () => {
  it("matches the sample columns and values, with BOM and yyyy-mm-dd dates", async () => {
    const database = freshDb();
    await seedPeriodAB(database);
    const model = await loadReportModel(database, "2026-07-02", "2026-07-03");
    expect(model).not.toBeNull();
    if (!model) return;

    const csv = buildReportCsv(model);
    const expectedLines = [
      "Date,From Destination,From Address (full),To Destination,To Address (full),Odometer Start,Odometer End,Distance,Claimable,Parking ($)",
      '2026-07-02,Home,"1 Example Home Street, Vancouver, BC",Canon,"10851 Shellbridge Way, Richmond, BC",155301,155325,24,,',
      '2026-07-02,Canon,"10851 Shellbridge Way, Richmond, BC",Dsk Law,"970-789 W Pender St, Vancouver BC",155325,155339,14,14,',
      '2026-07-02,Dsk Law,"970-789 W Pender St, Vancouver BC",Agat Laboratories,"3681 E 1st Ave, Vancouver, BC",155339,155347,8,8,',
      '2026-07-02,Agat Laboratories,"3681 E 1st Ave, Vancouver, BC",Canon,"10851 Shellbridge Way, Richmond, BC",155347,155361,14,14,',
      '2026-07-02,Canon,"10851 Shellbridge Way, Richmond, BC",Home,"1 Example Home Street, Vancouver, BC",155361,155386,25,,',
      '2026-07-03,Home,"1 Example Home Street, Vancouver, BC",Customer A,"200 Example Road, Burnaby, BC",155386,155426,40,17,',
      '2026-07-03,Customer A,"200 Example Road, Burnaby, BC",Home,"1 Example Home Street, Vancouver, BC",155426,155470,44,21,',
    ];
    expect(csv).toBe(`\uFEFF${expectedLines.join("\r\n")}\r\n`);
  });
});

describe("parking in reports (Fixture C)", () => {
  it("adds the Parking ($) column and total only when the range has parking", async () => {
    const database = freshDb();
    await seedFixtureC(database);
    const model = await loadReportModel(database, "2026-07-02", "2026-07-02");
    expect(model).not.toBeNull();
    if (!model) return;

    expect(model.hasParking).toBe(true);
    expect(model.columns).toEqual([...BASE_COLUMNS, PARKING_COLUMN]);
    expect(model.totals.totalParkingCents).toBe(2050);
    // Distance and claimable are unchanged by parking.
    expect(model.totals.totalDistance).toBe(85);
    expect(model.totals.totalClaimable).toBe(36);
    expect(model.rows[1]?.parkingCents).toBe(1250);
    expect(model.rows[2]?.parkingCents).toBe(800);
    expect(model.rows[0]?.parkingCents).toBeNull();

    const csvLines = buildReportCsv(model).split("\r\n");
    expect(csvLines[2]).toContain(",14,12.50");
    expect(csvLines[3]).toContain(",8,8.00");
    expect(csvLines[1]).toMatch(/,24,,$/);
  });

  it("PDF table data carries the parking column for Fixture C only", async () => {
    const databaseC = freshDb();
    await seedFixtureC(databaseC);
    const modelC = await loadReportModel(databaseC, "2026-07-02", "2026-07-02");
    expect(modelC).not.toBeNull();
    if (!modelC) return;
    const tableC = buildPdfTableData(modelC);
    expect(tableC.head).toHaveLength(10);
    expect(tableC.head[9]).toBe("Parking ($)");
    expect(tableC.body[1]?.[9]).toBe("12.50");
    expect(tableC.body[2]?.[9]).toBe("8.00");
    expect(tableC.body[0]?.[9]).toBe("");

    const databaseAB = freshDb();
    await seedPeriodAB(databaseAB);
    const modelAB = await loadReportModel(databaseAB, "2026-07-02", "2026-07-03");
    expect(modelAB).not.toBeNull();
    if (!modelAB) return;
    const tableAB = buildPdfTableData(modelAB);
    expect(tableAB.head).toEqual([...BASE_COLUMNS]);
    expect(tableAB.body[0]).toEqual([
      "Jul 02",
      "Home",
      "1 Example Home Street, Vancouver, BC",
      "Canon",
      "10851 Shellbridge Way, Richmond, BC",
      "155301",
      "155325",
      "24",
      "",
    ]);
    expect(tableAB.body[5]?.[0]).toBe("Jul 03");
  });

  it("builds a real PDF document", async () => {
    const database = freshDb();
    await seedFixtureC(database);
    const model = await loadReportModel(database, "2026-07-02", "2026-07-02");
    expect(model).not.toBeNull();
    if (!model) return;
    const doc = buildReportPdf(model);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    expect(bytes.length).toBeGreaterThan(1500);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
  });
});

describe("Excel report", () => {
  it("writes real dates, distance formulas and a SUM claimable total (A + B)", async () => {
    const database = freshDb();
    await seedPeriodAB(database);
    const model = await loadReportModel(database, "2026-07-02", "2026-07-03");
    expect(model).not.toBeNull();
    if (!model) return;

    const layout = reportSheetLayout(model);
    expect(layout).toEqual({ headerRow: 6, firstDataRow: 7, lastDataRow: 13 });

    const workbook = buildReportWorkbook(model);
    const sheet = workbook.getWorksheet("Mileage");
    expect(sheet).toBeDefined();
    if (!sheet) return;

    // Header block.
    expect(sheet.getCell(1, 1).value).toBe("Name:");
    expect(sheet.getCell(1, 2).value).toBe("Test Person");
    const startDateCell = sheet.getCell(1, 7);
    expect(startDateCell.value).toBeInstanceOf(Date);
    expect((startDateCell.value as Date).getFullYear()).toBe(2026);
    expect((startDateCell.value as Date).getMonth()).toBe(6);
    expect((startDateCell.value as Date).getDate()).toBe(2);
    expect(sheet.getCell(1, 8).value).toBe("ODOMETER START");
    expect(sheet.getCell(1, 9).value).toBe(155301);
    expect(sheet.getCell(2, 9).value).toBe(155470);
    expect(sheet.getCell(3, 7).value).toBe("DISTANCE HOME - OFFICE (KM)");
    expect(sheet.getCell(3, 9).value).toBe(23);

    // Total Claimable is the SUM of the Claimable column.
    const totalCell = sheet.getCell(5, 9);
    expect(totalCell.value).toEqual({ formula: "SUM(I7:I13)" });

    // Table header and data rows.
    expect(sheet.getCell(6, 1).value).toBe("Date");
    expect(sheet.getCell(6, 9).value).toBe("Claimable");
    const dateCell = sheet.getCell(7, 1);
    expect(dateCell.value).toBeInstanceOf(Date);
    expect(dateCell.numFmt).toBe("mmm dd");
    expect(sheet.getCell(7, 6).value).toBe(155301);
    expect(sheet.getCell(7, 7).value).toBe(155325);
    expect(sheet.getCell(7, 8).value).toEqual({ formula: "G7-F7" });
    // Commute leg: Claimable left blank, not 0.
    expect(sheet.getCell(7, 9).value ?? null).toBeNull();
    expect(sheet.getCell(8, 9).value).toBe(14);

    // Panes frozen under the table header.
    expect(sheet.views[0]?.state).toBe("frozen");
    expect((sheet.views[0] as { ySplit?: number } | undefined)?.ySplit).toBe(6);
  });

  it("stores parking as currency numbers with a SUM total (Fixture C)", async () => {
    const database = freshDb();
    await seedFixtureC(database);
    const model = await loadReportModel(database, "2026-07-02", "2026-07-02");
    expect(model).not.toBeNull();
    if (!model) return;

    const layout = reportSheetLayout(model);
    expect(layout).toEqual({ headerRow: 7, firstDataRow: 8, lastDataRow: 12 });

    const workbook = buildReportWorkbook(model);
    const sheet = workbook.getWorksheet("Mileage");
    expect(sheet).toBeDefined();
    if (!sheet) return;

    expect(sheet.getCell(6, 7).value).toBe("Total Parking ($):");
    expect(sheet.getCell(6, 10).value).toEqual({ formula: "SUM(J8:J12)" });
    expect(sheet.getCell(5, 10).value).toEqual({ formula: "SUM(I8:I12)" });
    expect(sheet.getCell(7, 10).value).toBe("Parking ($)");

    const dskParking = sheet.getCell(9, 10);
    expect(dskParking.value).toBe(12.5);
    expect(dskParking.numFmt).toBe('"$"#,##0.00');
    expect(sheet.getCell(10, 10).value).toBe(8);
    // Legs without parking leave the cell blank.
    expect(sheet.getCell(8, 10).value ?? null).toBeNull();
  });

  it("dateFromYmd builds a local date with no UTC shift", () => {
    const date = dateFromYmd("2026-07-02");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(2);
  });
});
