import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeftIcon } from "../../components/icons";

/**
 * Shared screen chrome for the core flow (UI Polish Phase 3): the one
 * consistent Back control and the docked bottom action bar, so Today,
 * Start Day, Log Stop and End Day are built from the same pieces.
 * Styled in dayScreens.css from design tokens only.
 */

/** "← Back" with a ≥48px target; every core-flow screen leads with it. */
export function BackLink({
  to = "/",
  label = "Back",
  onClick,
}: {
  to?: string;
  label?: string;
  /** Optional guard (e.g. Log Stop's discard-draft confirmation). */
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link className="ds-backlink" to={to} onClick={onClick}>
      <ChevronLeftIcon width={20} height={20} />
      {label}
    </Link>
  );
}

/**
 * Fixed bottom bar holding the screen's one primary action. It clears
 * the Home bar via the safe-area inset and rides above the on-screen
 * keyboard via --keyboard-inset (Phase 2 groundwork); the page behind
 * it reserves matching space with .app-shell--dock so nothing hides
 * underneath.
 */
export function DockBar({ children }: { children: ReactNode }) {
  return <div className="dock-bar">{children}</div>;
}
