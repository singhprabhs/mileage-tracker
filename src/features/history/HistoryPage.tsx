import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { db } from "../../data";
import { formatParking } from "../../domain";
import {
  Badge,
  Banner,
  Button,
  CalendarIcon,
  Card,
  CheckIcon,
  ChevronRightIcon,
  Chip,
  DownloadIcon,
  EmptyState,
  ErrorState,
  SegmentedControl,
  ShareIcon,
  SkeletonCard,
  TextField,
  Toast,
} from "../../components";
import { BackLink } from "../day/chrome";
import { formatFullDateLabel, loadDayContext } from "../day/dayService";
import {
  currentMonthRange,
  lastMonthRange,
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
import { downloadBlob, shareOrDownload } from "../reports/share";

type ReportFormat = "pdf" | "xlsx" | "csv";
type Period = "this-month" | "last-month" | "custom";

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

/** One summary figure: large tabular value, small muted label beneath. */
function SummaryFigure({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="summary-figure">
      <dd className="summary-value ds-num">{value}</dd>
      <dt className="summary-label">{label}</dt>
    </div>
  );
}

/**
 * History & Reports (UI Polish Phase 4 restyle; brief screen 5):
 * period chips (This month / Last month / Custom — Custom reveals
 * the date fields), a sticky summary bar with the period totals,
 * days as DS Cards that expand in place to their legs (chevron,
 * 250 ms ease-out, still linking through to the day review for
 * editing), and the reports section with a format SegmentedControl,
 * the on-screen preview presented like the report page itself
 * (blue / peach / pale-yellow header blocks, table at a readable
 * design width in a horizontal scroller), Share primary +
 * Download secondary, and a "Report ready" toast. Report
 * generation code and the files it produces are untouched — only
 * the presentation changed. Generation failures land in a
 * plain-language ErrorState with Retry (audit F-03); loading is
 * skeleton cards (F-16).
 */
export default function HistoryPage() {
  // A caller (Today's month-end card, Phase 6) may pre-set the range
  // through router state; the period chip follows the range — this
  // month / last month when it matches one, Custom otherwise.
  const location = useLocation();
  const preset = (location.state as { historyRange?: DateRange } | null)?.historyRange;
  const [period, setPeriod] = useState<Period>(() => {
    if (!preset) return "this-month";
    if (preset.start === lastMonthRange().start && preset.end === lastMonthRange().end) {
      return "last-month";
    }
    if (preset.start === currentMonthRange().start && preset.end === currentMonthRange().end) {
      return "this-month";
    }
    return "custom";
  });
  const [range, setRange] = useState<DateRange>(() => preset ?? currentMonthRange());
  const [history, setHistory] = useState<HistoryResult | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [busy, setBusy] = useState(false);
  const [reportFailed, setReportFailed] = useState(false);
  const [readyVisible, setReadyVisible] = useState(false);
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);

  const reload = useCallback(async (next: DateRange) => {
    const result = await loadHistory(db, next.start, next.end);
    setHistory(result);
    setLoaded(true);
    setLoadFailed(false);
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
      try {
        await reload(range);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Reload when the range changes; `reload` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    if (!readyVisible) return;
    const timer = window.setTimeout(() => setReadyVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, [readyVisible]);

  function choosePeriod(next: Period) {
    setPeriod(next);
    setMessage(null);
    setPreview(null);
    setReportFailed(false);
    setExpandedDayId(null);
    if (next === "this-month") setRange(currentMonthRange());
    if (next === "last-month") setRange(lastMonthRange());
  }

  function changeRange(field: keyof DateRange, value: string) {
    setMessage(null);
    setPreview(null);
    setReportFailed(false);
    setExpandedDayId(null);
    setRange((current) => ({ ...current, [field]: value }));
  }

  async function generateReport(nextFormat: ReportFormat) {
    if (busy) return;
    setFormat(nextFormat);
    setBusy(true);
    setMessage(null);
    setReportFailed(false);
    setReadyVisible(false);
    try {
      const model = await loadReportModel(db, range.start, range.end);
      if (!model) {
        setPreview(null);
        setMessage(
          "No trips in this range, so there is nothing to report. Pick a range that includes a logged day.",
        );
        return;
      }
      setPreview({ format: nextFormat, model, fileName: reportFileName(model, nextFormat) });
      setReadyVisible(true);
    } catch {
      setPreview(null);
      setReportFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function buildBlob(state: PreviewState): Promise<Blob> {
    // The PDF/Excel writers (jsPDF, ExcelJS) are heavy and run about
    // monthly: load them on demand so they stay out of the first-load
    // chunks (UI Polish Phase 5). Their chunks are precached by the
    // service worker, so generation still works fully offline.
    if (state.format === "pdf") {
      const { reportPdfBlob } = await import("../reports/reportPdf");
      return reportPdfBlob(state.model);
    }
    if (state.format === "xlsx") {
      const { reportExcelBlob } = await import("../reports/reportExcel");
      return reportExcelBlob(state.model);
    }
    return new Blob([buildReportCsv(state.model)], { type: "text/csv;charset=utf-8" });
  }

  async function handleShare() {
    if (!preview) return;
    setBusy(true);
    try {
      const blob = await buildBlob(preview);
      await shareOrDownload(blob, preview.fileName, "Mileage report");
    } catch {
      setMessage("Sharing didn't work just now. Try Download instead.");
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
    } catch {
      setMessage("The download didn't start. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (noProfile) return <Navigate to="/settings" replace />;

  return (
    <main className="app-shell">
      <BackLink />
      <h1 className="screen-title">History &amp; Reports</h1>

      <div className="chip-row history-periods" role="group" aria-label="Choose a period">
        <Chip selected={period === "this-month"} onClick={() => choosePeriod("this-month")}>
          This month
        </Chip>
        <Chip selected={period === "last-month"} onClick={() => choosePeriod("last-month")}>
          Last month
        </Chip>
        <Chip selected={period === "custom"} onClick={() => choosePeriod("custom")}>
          Custom
        </Chip>
      </div>

      {period === "custom" ? (
        <div className="history-range">
          <TextField
            id="history-start"
            label="From"
            type="date"
            value={range.start}
            max={range.end}
            onChange={(event) => changeRange("start", event.target.value)}
          />
          <TextField
            id="history-end"
            label="To"
            type="date"
            value={range.end}
            min={range.start}
            onChange={(event) => changeRange("end", event.target.value)}
          />
        </div>
      ) : null}

      {!loaded && !loadFailed ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </>
      ) : loadFailed ? (
        <ErrorState
          message="Your history couldn't be loaded. Your logs are safe on this phone."
          onRetry={() => void reload(range)}
        />
      ) : history ? (
        <>
          <div className="history-summary-bar">
            <dl className="summary-figures">
              <SummaryFigure value={`${history.totals.totalDistance} km`} label="Distance" />
              <SummaryFigure value={`${history.totals.totalClaimable} km`} label="Claimable" />
              {history.hasParking ? (
                <SummaryFigure
                  value={formatParking(history.totals.totalParkingCents)}
                  label="Parking"
                />
              ) : null}
            </dl>
          </div>

          {history.days.length === 0 ? (
            <EmptyState
              icon={<CalendarIcon width={28} height={28} />}
              message="No days in this range. Pick a range that includes a logged day."
            />
          ) : (
            <ol className="history-days">
              {history.days.map(({ day, totals, legs }) => {
                const expanded = expandedDayId === day.id;
                return (
                  <li key={day.id}>
                    <Card>
                      <button
                        type="button"
                        className="history-day-head"
                        aria-expanded={expanded}
                        aria-label={`${formatFullDateLabel(day.date)}: ${legs.length} stops, ${totals.totalDistance} kilometres. ${expanded ? "Hide" : "Show"} the stops.`}
                        onClick={() => setExpandedDayId(expanded ? null : day.id)}
                      >
                        <span className="history-day-main">
                          <span className="history-day-date">
                            {formatFullDateLabel(day.date)}
                            {day.status === "open" ? " (still open)" : ""}
                          </span>
                          <span className="history-day-meta ds-num">
                            {legs.length} stops · {totals.totalDistance} km ·{" "}
                            {totals.totalClaimable} km claimable
                          </span>
                        </span>
                        {totals.totalParkingCents > 0 ? (
                          <Badge>Parking {formatParking(totals.totalParkingCents)}</Badge>
                        ) : null}
                        <span
                          className="history-chev"
                          data-open={expanded || undefined}
                          aria-hidden="true"
                        >
                          <ChevronRightIcon width={20} height={20} />
                        </span>
                      </button>
                      <div className="history-day-legs" data-open={expanded || undefined}>
                        <div className="history-day-legs-inner">
                          <ol className="timeline">
                            {legs.map((leg) => (
                              <li key={leg.id} className="timeline-item">
                                <span className="timeline-dot" aria-hidden="true" />
                                <div className="timeline-row timeline-row--static">
                                  <span className="timeline-main">
                                    <span className="timeline-name">
                                      {leg.from_name} → {leg.to_name}
                                    </span>
                                    <span className="timeline-address">{leg.to_address}</span>
                                  </span>
                                  <span className="timeline-side">
                                    <span className="timeline-distance ds-num">
                                      {leg.distance} km
                                    </span>
                                    {leg.parking_cents !== null && leg.parking_cents > 0 ? (
                                      <Badge>
                                        Parking {formatParking(leg.parking_cents)}
                                      </Badge>
                                    ) : null}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ol>
                          <p className="history-day-review">
                            <Link to={`/day/${day.id}`}>Review or edit this day</Link>
                          </p>
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
          )}

          <section aria-labelledby="report-heading" className="history-report">
            <h2 id="report-heading" className="history-report-title">
              Generate report
            </h2>
            <p className="screen-date">
              For {formatFullDateLabel(range.start)} to {formatFullDateLabel(range.end)},
              in the same layout as your spreadsheet.
            </p>
            <SegmentedControl
              label="Report format"
              value={format}
              onChange={(value) => void generateReport(value)}
              options={[
                { value: "pdf", label: "PDF" },
                { value: "xlsx", label: "Excel" },
                { value: "csv", label: "CSV" },
              ]}
            />

            {busy && !preview ? (
              <p className="history-status" role="status">
                Building your report…
              </p>
            ) : null}

            {message ? <Banner kind="warning">{message}</Banner> : null}

            {reportFailed ? (
              <ErrorState
                message="That report couldn't be built. Your logs are safe — please try again."
                onRetry={() => void generateReport(format)}
              />
            ) : null}

            {preview ? (
              <div className="report-preview-block">
                <div className="report-paper">
                  <div className="report-paper-head">
                    <div className="report-paper-id">
                      <p className="report-paper-name">{preview.model.name}</p>
                      <p className="report-paper-tech">Tech ID: {preview.model.techId}</p>
                    </div>
                    <div className="report-paper-facts">
                      <p>
                        {preview.model.periodStart} to {preview.model.periodEnd}
                      </p>
                      <p className="ds-num">
                        Odometer {preview.model.odometerStart} →{" "}
                        {preview.model.odometerEnd}
                      </p>
                    </div>
                  </div>
                  <p className="report-paper-row report-paper-row--peach">
                    <span>Distance Home - Office (KM)</span>
                    <span className="ds-num">{preview.model.homeOfficeKm}</span>
                  </p>
                  <p className="report-paper-row report-paper-row--yellow">
                    <span>Total Claimable Mileage (KM)</span>
                    <span className="ds-num">{preview.model.totals.totalClaimable}</span>
                  </p>
                  {preview.model.hasParking ? (
                    <p className="report-paper-row report-paper-row--yellow">
                      <span>Total Parking ($)</span>
                      <span className="ds-num">
                        {parkingDollars(preview.model.totals.totalParkingCents)}
                      </span>
                    </p>
                  ) : null}
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
                                {row.parkingCents === null
                                  ? ""
                                  : parkingDollars(row.parkingCents)}
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="report-filename ds-num">{preview.fileName}</p>
                <div className="report-actions">
                  <Button loading={busy} onClick={() => void handleShare()}>
                    <ShareIcon width={20} height={20} />
                    Share
                  </Button>
                  <Button
                    variant="secondary"
                    loading={busy}
                    onClick={() => void handleDownload()}
                  >
                    <DownloadIcon width={20} height={20} />
                    Download
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {readyVisible && preview ? (
        <div className="ds-toast-dock">
          <div role="status">
            <Toast
              message={`${FORMAT_LABELS[preview.format]} report ready.`}
              icon={<CheckIcon width={20} height={20} />}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
