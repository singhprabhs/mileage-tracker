import type { ButtonHTMLAttributes, ReactNode } from "react";
import Button from "./Button";
import { AlertTriangleIcon, CheckIcon, ClockIcon, RefreshIcon, WifiOffIcon } from "./icons";

/* ---------- Status pill ---------- */

export type SyncStatus = "synced" | "pending" | "offline";

const PILL_META: Record<SyncStatus, { label: string; icon: ReactNode; className: string }> = {
  synced: {
    label: "Synced",
    icon: <CheckIcon width={14} height={14} />,
    className: "ds-pill--synced",
  },
  pending: {
    label: "Pending",
    icon: <ClockIcon width={14} height={14} />,
    className: "ds-pill--pending",
  },
  offline: {
    label: "Offline",
    icon: <WifiOffIcon width={14} height={14} />,
    className: "ds-pill--offline",
  },
};

/**
 * Sync status as icon + words (never colour alone). Pass `label` to
 * qualify, e.g. "Pending · 3".
 */
export function StatusPill({ status, label }: { status: SyncStatus; label?: string }) {
  const meta = PILL_META[status];
  return (
    <span className={`ds-pill ${meta.className}`} role="status">
      {meta.icon}
      {label ?? meta.label}
    </span>
  );
}

/* ---------- Badge & chip ---------- */

/** Small inline badge, e.g. the parking badge on a leg row. */
export function Badge({ children }: { children: ReactNode }) {
  return <span className="ds-badge">{children}</span>;
}

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  selected?: boolean;
  children: ReactNode;
}

/** Pill-shaped toggle/quick-pick chip (recent amounts, notes). */
export function Chip({ selected = false, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      className={["ds-chip", className].filter(Boolean).join(" ")}
      aria-pressed={selected}
      data-selected={selected || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Toast ---------- */

export interface ToastProps {
  message: ReactNode;
  /** Optional action, e.g. Undo. */
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

/**
 * Presentational toast (positioned by its parent). Pair with an
 * aria-live region in the host screen; the action is a real button.
 */
export function Toast({ message, actionLabel, onAction, icon }: ToastProps) {
  return (
    <div className="ds-toast" role="status">
      {icon ? <span className="ds-toast-icon">{icon}</span> : null}
      <span className="ds-toast-message">{message}</span>
      {actionLabel && onAction ? (
        <button type="button" className="ds-toast-action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/* ---------- Banner ---------- */

export type BannerKind = "offline" | "warning" | "info";

/** Inline banner for offline and warning messages (icon + text). */
export function Banner({ kind = "info", children }: { kind?: BannerKind; children: ReactNode }) {
  const icon =
    kind === "offline" ? (
      <WifiOffIcon width={18} height={18} />
    ) : kind === "warning" ? (
      <AlertTriangleIcon width={18} height={18} />
    ) : (
      <CheckIcon width={18} height={18} />
    );
  return (
    <div className={`ds-banner ds-banner--${kind}`} role="status">
      <span className="ds-banner-icon">{icon}</span>
      <div className="ds-banner-text">{children}</div>
    </div>
  );
}

/* ---------- Skeleton ---------- */

/** Shimmer placeholder block (static under reduced motion). */
export function Skeleton({
  width = "100%",
  height = 16,
  radius,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
}) {
  return (
    <div
      className="ds-skeleton"
      aria-hidden="true"
      style={{ width, height, borderRadius: radius }}
    />
  );
}

/** A card-shaped skeleton with `lines` text rows — the loading state. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="ds-card ds-skeleton-card" aria-hidden="true">
      <Skeleton width="45%" height={20} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "70%" : "100%"} />
      ))}
    </div>
  );
}

/* ---------- Empty & error states ---------- */

export interface EmptyStateProps {
  icon: ReactNode;
  /** One plain-language line. */
  message: string;
  /** The single next action (usually a Button). */
  action?: ReactNode;
}

/** Empty state: icon, one line, one action. */
export function EmptyState({ icon, message, action }: EmptyStateProps) {
  return (
    <div className="ds-empty">
      <span className="ds-empty-icon">{icon}</span>
      <p className="ds-empty-message">{message}</p>
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  /** Plain-language description of what happened. */
  message: string;
  onRetry: () => void;
  retryLabel?: string;
}

/** Error state: what happened, in plain words, plus Retry. */
export function ErrorState({ message, onRetry, retryLabel = "Retry" }: ErrorStateProps) {
  return (
    <div className="ds-empty" role="alert">
      <span className="ds-empty-icon ds-empty-icon--error">
        <AlertTriangleIcon />
      </span>
      <p className="ds-empty-message">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        <RefreshIcon width={18} height={18} />
        {retryLabel}
      </Button>
    </div>
  );
}
