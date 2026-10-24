import type { HTMLAttributes, ReactNode } from "react";
import { ChevronRightIcon } from "./icons";

/** Surface card: token background, 12 px radius, soft shadow in light
    mode and a hairline border in dark (see --shadow-card). */
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={["ds-card", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

/** Small muted heading that labels a group of cards or rows. */
export function SectionHeader({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={["ds-section-header", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </h2>
  );
}

export interface ListRowProps {
  /** Leading icon (an SVG from the icon set). */
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Trailing value, set in tabular figures. */
  value?: ReactNode;
  /** Shows a chevron after the value (for rows that navigate). */
  chevron?: boolean;
  /** When set, the row renders as a button; otherwise as an article row. */
  onClick?: () => void;
}

/** One row of a grouped list: icon, title, subtitle, trailing value. */
export function ListRow({ icon, title, subtitle, value, chevron = false, onClick }: ListRowProps) {
  const content = (
    <>
      {icon ? <span className="ds-row-icon">{icon}</span> : null}
      <span className="ds-row-main">
        <span className="ds-row-title">{title}</span>
        {subtitle ? <span className="ds-row-subtitle">{subtitle}</span> : null}
      </span>
      {value ? <span className="ds-row-value ds-num">{value}</span> : null}
      {chevron ? (
        <span className="ds-row-chevron">
          <ChevronRightIcon width={18} height={18} />
        </span>
      ) : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="ds-row" onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className="ds-row">{content}</div>;
}
