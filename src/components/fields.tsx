import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertTriangleIcon, CloseIcon, SearchIcon } from "./icons";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  /** Stable id; one is generated when omitted. */
  id?: string;
  hint?: string;
  /** When set, the field is marked invalid and the message is announced. */
  error?: string;
  /** Large numeric treatment (odometer): 32 px semibold tabular. */
  large?: boolean;
}

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="ds-field">
      <label className="ds-field-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="ds-field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="ds-field-error" id={`${id}-error`} role="alert">
          <AlertTriangleIcon width={16} height={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

/** Labelled text input, styled only from tokens (.ds-input). */
export function TextField({ label, id: idProp, hint, error, className, ...rest }: TextFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={["ds-input", className].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </FieldShell>
  );
}

/**
 * Numeric field. inputMode defaults to "numeric" so the phone shows
 * the number keypad; the large variant is the odometer treatment.
 */
export function NumericField({
  inputMode = "numeric",
  large = false,
  className,
  ...rest
}: TextFieldProps) {
  return (
    <TextField
      inputMode={inputMode}
      className={["ds-num", large ? "ds-input--large" : undefined, className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
}

export interface SearchFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "type"
> {
  label: string;
  id?: string;
  /** Called by the clear (×) button; the button shows when value ≠ "". */
  onClear?: () => void;
}

/** Search input with a leading icon and a clear button. */
export function SearchField({
  label,
  id: idProp,
  value,
  onClear,
  className,
  ...rest
}: SearchFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hasValue = typeof value === "string" ? value.length > 0 : value != null;
  return (
    <div className="ds-field">
      <label className="ds-field-label" htmlFor={id}>
        {label}
      </label>
      <div className="ds-search">
        <SearchIcon className="ds-search-icon" width={20} height={20} />
        <input
          id={id}
          type="search"
          className={["ds-input", "ds-search-input", className].filter(Boolean).join(" ")}
          value={value}
          {...rest}
        />
        {hasValue && onClear ? (
          <button
            type="button"
            className="ds-search-clear"
            aria-label="Clear search"
            onClick={onClear}
          >
            <CloseIcon width={18} height={18} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
