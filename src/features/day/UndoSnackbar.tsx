import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { db } from "../../data";
import { restoreDaySnapshot } from "./dayService";
import { dropUndoSnapshot, peekUndoSnapshot } from "./undoStore";

interface UndoSnackbarProps {
  /** Called after an undo restores the day, so the page can reload its data. */
  onUndone: () => void;
}

interface UndoLocationState {
  undoToken?: string;
  undoMessage?: string;
}

/**
 * The 10-second Undo offer shown after a save or delete. The token in the
 * navigation state names the pre-change snapshot parked in the undo
 * store; Undo restores it exactly, and the offer removes itself when the
 * 10 seconds run out.
 */
export default function UndoSnackbar({ onUndone }: UndoSnackbarProps) {
  const location = useLocation();
  const state = (location.state ?? {}) as UndoLocationState;
  const token = state.undoToken ?? null;
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !peekUndoSnapshot(token)) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => {
      dropUndoSnapshot(token);
      setVisible(false);
    }, 10_000);
    return () => clearTimeout(timer);
  }, [token]);

  if (!visible || !token) return null;

  async function handleUndo() {
    const snapshot = peekUndoSnapshot(token);
    if (!snapshot) {
      setVisible(false);
      return;
    }
    try {
      await restoreDaySnapshot(db, snapshot);
      dropUndoSnapshot(token);
      setVisible(false);
      onUndone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Undo did not work.");
    }
  }

  return (
    <div className="undo-snackbar" role="status">
      <span>{state.undoMessage ?? "Change saved."}</span>
      <button type="button" className="undo-button" onClick={() => void handleUndo()}>
        Undo
      </button>
      {error ? <span className="notice-error">{error}</span> : null}
    </div>
  );
}
