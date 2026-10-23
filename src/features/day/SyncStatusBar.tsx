import { useState } from "react";
import { retrySync, useSyncStatus } from "../../data";

/**
 * The sync indicator on Today (brief: Synced / Pending (n changes) /
 * Offline). A change that keeps failing surfaces its error here with a
 * Retry button — sync never fails silently. When there is no account to
 * sync to, the bar says the data lives on this device only rather than
 * claiming "Synced".
 */
export default function SyncStatusBar() {
  const status = useSyncStatus();
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      await retrySync();
    } finally {
      setRetrying(false);
    }
  }

  if (status.state === "error") {
    return (
      <div className="sync-status sync-status-error" role="alert">
        <span>
          Sync problem{status.pendingCount > 0 ? ` (${status.pendingCount} changes waiting)` : ""}
          {status.lastError ? `: ${status.lastError}` : ""}
        </span>
        <button
          type="button"
          className="button sync-retry"
          onClick={() => void handleRetry()}
          disabled={retrying}
        >
          {retrying ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  let label: string;
  if (status.localOnly) {
    label =
      status.pendingCount > 0
        ? `On this device only · ${status.pendingCount} change${status.pendingCount === 1 ? "" : "s"} waiting`
        : "On this device only";
  } else if (status.state === "synced") {
    label = "Synced";
  } else if (status.state === "offline") {
    label =
      status.pendingCount > 0
        ? `Offline · ${status.pendingCount} change${status.pendingCount === 1 ? "" : "s"} saved on this phone`
        : "Offline";
  } else {
    label = `Pending (${status.pendingCount} change${status.pendingCount === 1 ? "" : "s"})`;
  }

  return (
    <p className="sync-status" role="status">
      {label}
    </p>
  );
}
