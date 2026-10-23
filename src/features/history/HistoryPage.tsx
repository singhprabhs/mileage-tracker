import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { db } from "../../data";
import { formatParking } from "../../domain";
import { formatFullDateLabel, loadDayContext } from "../day/dayService";
import {
  currentMonthRange,
  loadHistory,
  type DateRange,
  type HistoryResult,
} from "./historyService";
import {
  loadReportModel,
  parkingDollars,
  reportFileName,
  type ReportModel,
} from "../reports/reportModel";
import { buildReportCsv } from "../reports/reportCsv";
import { reportExcelBlob } from "../reports/reportExcel";
import { reportPdfBlob } from "../reports/reportPdf";
import { downloadBlob, shareOrDownload } from "../reports/share";

type ReportFormat = "pdf" | "xlsx" | "csv";

const FORMAT_LABELS: Record<ReportFormat, string> = {
  pdf: "PDF",
  xlsx: "Excel",
  csv: "CSV",
};

interface PreviewState {
  format: ReportFormat;
  model: ReportModel;
  fileName: string;
}

/**
 * History and Reports (brief screen 5): a date-range picker defaulting
 * to the current month, the days in range with their totals, period
 * totals, and report generation (PDF / Excel / CSV) with an on-screen
 * preview and the phone's share sheet. Tapping a day opens the same
 * review/edit screen used for today, so edits flow through the usual
 * services and sync.
 */
export default function HistoryPage() {
  const [range, setRange] = useState<DateRange>(() => currentMonthRange());
  const [history, setHistory] = useState<HistoryResult | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async (next: DateRange) => {
    const result = await loadHistory(db, next.start, next.end);
    setHistory(result);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadDayContext(db);
      } catch {
        if (!cancelled) setNoProfile(true);
        return;
      }
      await reload(range);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // Reload when the range changes; `reload` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  function changeRange(field: keyof DateRange, value: string) {
    setMessage(null);
    setPreview(null);
    setRange((current) => ({ ...current, [field]: value }));
  }

  async function generateReport(format: ReportFormat) {
    setBusy(true);
    setMessage(null);
    try {
      const model = await loadReportModel(db, range.start, range.end);
      if (!model) {
        setPreview(null);
        setMessage(
          "No trips in this range, so there is nothing to report. Pick a range that includes a logged day.",
        );
        return;
      }
      setPreview({ format, model, fileName: reportFileName(model, format) });
    } finally {
      setBusy(false);
    }
  }

  async function buildBlob(state: PreviewState): Promise<Blob> {
    if (state.format === "pdf") return reportPdfBlob(state.model);
    if (state.format === "xlsx") return reportExcelBlob(state.model);
    return new Blob([buildReportCsv(state.model)], { type: "text/csv;charset=utf-8" });
  }

  async function handleShare() {
    if (!preview) return;
    setBusy(true);
    try {
      const blob = await buildBlob(preview);
      await shareOrDownload(blob, preview.fileName, "Mileage report");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!preview) return;
    setBusy(true);
    try {
      const blob = await buildBlob(preview);
      downloadBlob(blob, preview.fileName);
    } finally {
      setBusy(false);
    }
  }

  if (noProfile) return <Navigate to="/settings" replace />;
  if (!loaded || !history) {
    return (
      <main className="app-shell">
        <p role="status">Loading…</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <p>
        <Link to="/">← Today</Link>
      </p>
      <h1>History &amp; Reports</h1>

      <div className="date-range">
        <div className="field">
          <label htmlFor="history-start">From</label>
          <input
            id="history-start"
            type="date"
            value={range.start}
            max={range.end}
            onChange={(event) => changeRange("start", event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="history-end">To</label>
          <input
            id="history-end"
            type="date"
            value={range.end}
            min={range.start}
            onChange={(event) => changeRange("end", event.target.value)}
          />
        </div>
      </div>

      <dl className="stats-grid" aria-label="Period totals">
        <div>
          <dt>Total distance</dt>
          <dd className="stat-number">{history.totals.totalDistance} km</dd>
        </div>
        <div>
          <dt>Total claimable</dt>
          <dd className="stat-number">{history.totals.totalClaimable} km</dd>
        </div>
        {history.hasParking ? (
          <div>
            <dt>Total parking</dt>
            <dd className="stat-number">{formatParking(history.totals.totalParkingCents)}</dd>
          </div>
        ) : null}
      </dl>

      {history.days.length === 0 ? (
        <p className="notice">No days in this range.</p>
      ) : (
        <ol className="leg-list">
          {history.days.map(({ day, totals }) => (
            <li key={day.id} className="leg-detail">
              <Link className="history-day-link" to={`/day/${day.id}`}>
                <span className="leg-route">
                  {formatFullDateLabel(day.date)}
                  {day.status === "open" ? " (still open)" : ""}
                </span>
                <span className="leg-meta">
                  {totals.totalDistance} km · {totals.totalClaimable} km claimable
                  {totals.totalParkingCents > 0
                    ? ` · P ${formatParking(totals.totalParkingCents)}`
                    : ""}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <section aria-labelledby="report-heading">
        <h2 id="report-heading">Generate report</h2>
        <p className="field-hint">
          For {range.start} to {range.end}, in the same layout as your spreadsheet.
        </p>
        <div className="button-row">
          {(Object.keys(FORMAT_LABELS) as ReportFormat[]).map((format) => (
            <button
              key={format}
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void generateReport(format)}
            >
              {FORMAT_LABELS[format]}
            </button>
          ))}
        </div>

        {message ? (
          <p className="notice notice-warning" role="status">
            {message}
          </p>
        ) : null}

        {preview ? (
          <div className="report-preview">
            <h3>
              {FORMAT_LABELS[preview.format]} preview — {preview.fileName}
            </h3>
            <dl className="summary-list">
              <div>
                <dt>Name / Tech ID</dt>
                <dd>
                  {preview.model.name} / {preview.model.techId}
                </dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>
                  {preview.model.periodStart} to {preview.model.periodEnd} · Odometer{" "}
                  {preview.model.odometerStart} → {preview.model.odometerEnd} · Home – Office{" "}
                  {preview.model.homeOfficeKm} km
                </dd>
              </div>
              <div>
                <dt>Total Claimable Mileage (KM)</dt>
                <dd>{preview.model.totals.totalClaimable}</dd>
              </div>
              {preview.model.hasParking ? (
                <div>
                  <dt>Total Parking ($)</dt>
                  <dd>{parkingDollars(preview.model.totals.totalParkingCents)}</dd>
                </div>
              ) : null}
            </dl>
            <div className="report-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    {preview.model.columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.model.rows.map((row, index) => (
                    <tr key={`${row.date}-${index}`}>
                      <td>{row.dateLabel}</td>
                      <td>{row.fromName}</td>
                      <td>{row.fromAddress}</td>
                      <td>{row.toName}</td>
                      <td>{row.toAddress}</td>
                      <td className="report-num">{row.odoStart}</td>
                      <td className="report-num">{row.odoEnd}</td>
                      <td className="report-num">{row.distance}</td>
                      <td className="report-num">{row.claimable ?? ""}</td>
                      {preview.model.hasParking ? (
                        <td className="report-num">
                          {row.parkingCents === null ? "" : parkingDollars(row.parkingCents)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="button button-primary"
                disabled={busy}
                onClick={() => void handleShare()}
              >
                Share
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => void handleDownload()}
              >
                Download
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
