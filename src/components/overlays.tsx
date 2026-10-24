import { useEffect, useRef, type ReactNode } from "react";
import Button from "./Button";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog; also rendered as the heading when given. */
  title?: string;
  children: ReactNode;
}

/**
 * Bottom sheet: dimmed backdrop, drag handle, slides up (fades under
 * prefers-reduced-motion). Backdrop tap and Escape dismiss.
 */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);

  useEffect(() => {
    if (open) sheetRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="ds-overlay">
      <button type="button" className="ds-backdrop" aria-label="Close" onClick={onClose} />
      <div
        ref={sheetRef}
        className="ds-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="ds-sheet-handle" aria-hidden="true" />
        {title ? <h2 className="ds-sheet-title">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive confirmations fill the danger button. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Centred confirmation dialog for irreversible actions only. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEscape(open, onCancel);

  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="ds-overlay ds-overlay--center">
      <button type="button" className="ds-backdrop" aria-label="Cancel" onClick={onCancel} />
      <div
        ref={dialogRef}
        className="ds-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <h2 className="ds-dialog-title">{title}</h2>
        {message ? <div className="ds-dialog-message">{message}</div> : null}
        <div className="ds-dialog-actions">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? "destructive" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
