import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "text";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
  children: ReactNode;
}

/**
 * The design system's button. Primary actions are 56 px tall, every
 * variant keeps a ≥48 px target, and all states (pressed, disabled,
 * loading) are styled from tokens in components.css (.ds-btn).
 */
export default function Button({
  variant = "primary",
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = ["ds-btn", `ds-btn--${variant}`, className].filter(Boolean).join(" ");
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="ds-btn-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
