import { useState } from "react";
import { retrySync, useSyncStatus } from "../../data";
import { Banner, Button, StatusPill, type SyncStatus } from "../../components";

/**
 * The sync indicator for Today's top bar (UI Polish Phase 3): a DS
 * StatusPill — icon plus words, never colour alone — carrying the
 * pending count. A change that keeps failing surfaces as a
 * plain-language banner with Retry; the raw backend message is never
 * shown (audit F-03). When there is no account to sync to, the pill
 * says the data lives on this device, and offline still wins over that
 * label so a signed-out user sees Offline too (audit F-11).
 */
export default function SyncPill() {
  const status = useSyncStatus();

  let pill: { status: SyncStatus; label: string };
  if (status.state === "error") {
    pill = {
      status: "pending",
      label: status.pendingCount > 0 ? `Pending · ${status.pendingCount}` : "Pending",
    };
  } else if (status.state === "offline") {
    pill = {
      status: "offline",
      label:
        status.pendingCount > 0 ? `Offline · ${status.pendingCount} saved` : "Offline",
    };
  } else if (status.localOnly) {
    pill = {
      status: "pending",
      label:
        status.pendingCount > 0
          ? `On this device · ${status.pendingCount}`
          : "On this device",
    };
  } else if (status.state === "pending") {
    pill = {
      status: "pending",
      label: `Pending · ${status.pendingCount}`,
    };
  } else {
    pill = { status: "synced", label: "Synced" };
  }

  return <StatusPill status={pill.status} label={pill.label} />;
}

/**
 * The plain-language companion to the pill when a change keeps
 * failing: what happened in ordinary words, plus Retry. Rendered by
 * Today under the top bar (full width), never with the raw error.
 */
export function SyncErrorBanner() {
  const status = useSyncStatus();
  const [retrying, setRetrying] = useState(false);

  if (status.state !== "error") return null;

  async function handleRetry() {
    setRetrying(true);
    try {
      await retrySync();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="sync-error-banner">
      <Banner kind="warning">
        <span className="sync-error-text">
          Some changes couldn&rsquo;t be sent. They&rsquo;re safe on this phone and will
          keep trying.
        </span>
        <Button variant="text" onClick={() => void handleRetry()} loading={retrying}>
          Retry
        </Button>
      </Banner>
    </div>
  );
}
